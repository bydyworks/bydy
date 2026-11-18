/**
 * net.js - end-to-end encrypted room messaging over dumb public relays.
 *
 * Peers that share a room `secret` exchange small JSON messages. Every message
 * is published to ALL connected transports (several MQTT-over-WebSocket brokers
 * and/or a same-origin BroadcastChannel) and de-duplicated by the receivers, so
 * the room keeps working as long as one relay is reachable.
 *
 * Wire format (one MQTT PUBLISH / one BroadcastChannel message, QoS 0, not retained):
 *
 *     12-byte random IV || AES-256-GCM( utf8( JSON {i, q, y, d} ) )
 *
 *     i  sender peerId (string)
 *     q  sequence number: `epoch * 2^21 + counter`, where `epoch` is a random
 *        31-bit number picked once per createNet() call (see "De-duplication")
 *     y  message type (string)
 *     d  message data (any JSON value, may be absent)
 *
 * Key and topic are both derived from the secret, with domain separation, so the
 * relay learns the topic but can derive neither the key nor the secret:
 *
 *     key   = SHA-256("dsy1|key|"   + secret)             -> AES-GCM-256, non-extractable
 *     topic = "dsy1/" + hex(SHA-256("dsy1|topic|" + secret))[0..32)
 *
 * The secret must be high-entropy (>= 128 random bits): the topic is a fast
 * hash of it and is visible to the relay, which could brute-force a weak one.
 *
 * Delivery contract: at-most-once and lossy. Nothing is queued while offline -
 * messages sent while no transport is connected are dropped; higher layers
 * re-broadcast state with heartbeats. Messages of one sender are delivered in
 * send order as long as that sender reaches the same relays for consecutive
 * messages (the normal case: every relay keeps per-connection order and the
 * first copy wins). Only when relays overtake each other around a (re)connect
 * or a relay loses a message can an older message arrive after a newer one; it
 * is then still delivered, flagged `late`, so that state-like messages can be
 * skipped and events (chat) shown anyway. There is no order across senders.
 *
 * De-duplication: receivers keep, per (peerId, epoch), an anti-replay sliding
 * window over the last 1024 counters (highest counter seen + bitmap). A copy
 * that was already delivered, or that is older than the window, is dropped; an
 * unseen counter below the highest one is delivered as `late`. A peer that
 * restarts (page reload, new createNet()) picks a new random epoch, so its
 * counter legitimately restarts at 0 without colliding with the window of its
 * previous session, while stray copies from the previous session are still
 * recognised. At most 256 windows are kept (least recently used evicted).
 *
 * What this layer does NOT give you:
 *  - Sender authentication. Everybody in the room holds the same key, so `i`
 *    is self-asserted; any room member can claim any peerId. Sign what must be
 *    attributable (see sign.js).
 *  - Replay protection beyond the window memory. A relay can re-send an old
 *    ciphertext to a peer that joined (or reloaded) after it was first sent.
 *    Make state messages idempotent / versioned.
 *  - Metadata privacy. The relay sees IP addresses, timing and message sizes.
 *
 * No dependencies except the global `mqtt` (MQTT.js browser bundle), which is
 * injected with a <script> tag the first time a ws:// or wss:// broker is used.
 *
 * @module net
 */

/**
 * Public MQTT brokers that accept MQTT over secure WebSocket without credentials.
 *
 * NOTE: NONE of these could be reached from the build sandbox (outbound network
 * was blocked), so this list is UNTESTED: hosts, ports and paths are the
 * endpoints these services document/are commonly used with, not something that
 * was seen working. Run `NET_TEST_PUBLIC=1 node test-net.mjs` on a machine with
 * internet access before shipping. They are shared, best-effort community
 * services with no uptime guarantee and unknown rate limits - which is exactly
 * why createNet() talks to all of them at once.
 *
 * @type {readonly string[]}
 */
export const DEFAULT_BROKERS = Object.freeze([
  'wss://broker.emqx.io:8084/mqtt',                // EMQX 공용 브로커
  'wss://public:public@public.cloud.shiftr.io',     // shiftr.io 공용 네임스페이스 (443 포트 — 다른 포트가 막힌 와이파이에서도 통한다)
  'wss://broker.hivemq.com:8884/mqtt',             // HiveMQ 공용 브로커
  'wss://test.mosquitto.org:8081/mqtt',            // Mosquitto 시험 브로커
  'wss://mqtt.eclipseprojects.io/mqtt',            // Eclipse 시험 브로커 (443 포트)
]);

/** Largest wire payload (IV + ciphertext + tag) that is sent or accepted, in bytes. */
export const MAX_WIRE_BYTES = 16 * 1024;

const PROTO = 'dsy1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Smallest possible wire payload: IV + tag + `{}`. */
const MIN_WIRE_BYTES = IV_BYTES + TAG_BYTES + 2;
const MAX_ID_LENGTH = 128;

/** Counters per epoch. q = epoch * SEQ_SPAN + counter stays below 2^53. */
const SEQ_SPAN = 2 ** 21;
/** Anti-replay window size in messages; must be a multiple of 32. */
const REPLAY_WINDOW = 1024;
/** Max (peerId, epoch) windows remembered. */
const MAX_SESSIONS = 256;

/** Flood guards for the two internal queues. */
const MAX_PENDING_IN = 8192;
const MAX_PENDING_IN_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_OUT = 2048;

const KEEPALIVE_SECONDS = 30;
const CONNECT_TIMEOUT_MS = 10_000;
/** Reconnect delay: min(MAX, MIN * 2^(failures-1)) scaled by a random factor in [0.5, 1). */
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;
/** A connection must live this long before the back-off is reset. */
const STABLE_MS = 5_000;
/** Minimum spacing of reconnects forced by online/visibility events. */
const KICK_MIN_GAP_MS = 2_000;
/** close(): how long to wait for queued sends / a clean MQTT DISCONNECT. */
const CLOSE_FLUSH_MS = 1_000;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * @typedef {Object} BrokerStatus
 * @property {string} url        The broker entry exactly as passed in `brokers`.
 * @property {boolean} connected True while messages can be sent and received through it.
 */

/**
 * @typedef {Object} NetStatus
 * @property {boolean} connected       True if at least one transport is connected.
 * @property {BrokerStatus[]} brokers  One entry per (de-duplicated) broker, in input order.
 */

/**
 * @typedef {Object} Net
 * @property {(type: string, data?: any) => void} send
 *   Queue a message for every currently connected transport. Never blocks and
 *   never throws for runtime conditions: the message is silently dropped if no
 *   transport is connected or the net is closed, and dropped with a console
 *   warning if `data` is not JSON-serialisable, the encrypted message would
 *   exceed MAX_WIRE_BYTES, or the send queue is full. Throws TypeError only if
 *   `type` is not a string (a programming error).
 * @property {() => Promise<void>} close
 *   Stop everything. From the moment it is called, send() is a no-op and no
 *   callback fires any more. Messages already accepted by send() are flushed
 *   first (bounded to ~1 s). The returned promise settles when all sockets are
 *   released; it never rejects. Idempotent.
 * @property {() => NetStatus} status Current status (a fresh object on every call).
 */

/**
 * @typedef {Object} MessageInfo
 * @property {boolean} late  True if a message that the same sender (same session) sent
 *   AFTER this one has already been delivered. Rare; see "Delivery contract".
 */

/**
 * @typedef {Object} CreateNetOptions
 * @property {string} secret  Room secret (from the invite link fragment). Never sent anywhere.
 * @property {string} peerId  This peer's id, 1..128 chars. Messages carrying the same id are ignored.
 * @property {string[]} [brokers]  'ws://...' / 'wss://...' MQTT-over-WebSocket URLs and/or
 *   'local:' (BroadcastChannel between same-origin pages of one browser profile;
 *   'local:<name>' selects a separate channel namespace). Defaults to DEFAULT_BROKERS.
 * @property {(fromPeerId: string, type: string, data: any, info: MessageInfo) => void} [onMessage]
 * @property {() => void} [onEcho]  Called whenever one of our own messages comes back from an MQTT relay
 *   (never for 'local:' transports). A long pause between echoes while sending means nobody heard us.
 * @property {(status: NetStatus) => void} [onStatus]  Called on every status change.
 *   It is NOT called for the initial state - read status() once after createNet().
 * @property {string | URL} [mqttUrl]  Where to load the MQTT.js browser bundle (UMD, global
 *   `mqtt`) from. Default: '../vendor/mqtt.min.js' relative to this module.
 */

/**
 * Join a room.
 *
 * Resolves as soon as the key is derived and (if needed) MQTT.js is loaded; it
 * does not wait for brokers to connect - watch `onStatus` / `status()` for that.
 * No callback is invoked before the returned promise has resolved.
 *
 * Rejects if the options are invalid, if WebCrypto is unavailable (the page must
 * be a secure context: https:// or http://localhost), or if the MQTT.js bundle
 * cannot be loaded.
 *
 * @param {CreateNetOptions} options
 * @returns {Promise<Net>}
 */
export async function createNet(options) {
  const {
    secret,
    peerId,
    brokers = DEFAULT_BROKERS,
    onMessage = noop,
    onStatus = noop,
    onEcho = noop,
    mqttUrl,
  } = options || {};

  if (typeof secret !== 'string' || secret === '') throw new TypeError('createNet: `secret` must be a non-empty string');
  if (typeof peerId !== 'string' || peerId === '' || peerId.length > MAX_ID_LENGTH) {
    throw new TypeError(`createNet: \`peerId\` must be a string of 1..${MAX_ID_LENGTH} characters`);
  }
  if (!Array.isArray(brokers) || brokers.length === 0) throw new TypeError('createNet: `brokers` must be a non-empty array');
  for (const url of brokers) {
    if (typeof url !== 'string' || !(isMqttUrl(url) || isLocalUrl(url))) {
      throw new TypeError(`createNet: unsupported broker entry ${JSON.stringify(url)} (expected ws://, wss:// or local:)`);
    }
  }
  if (typeof onMessage !== 'function' || typeof onStatus !== 'function') {
    throw new TypeError('createNet: `onMessage` and `onStatus` must be functions');
  }
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('createNet: WebCrypto is unavailable (serve the page from https:// or http://localhost)');

  const urls = [...new Set(brokers)];
  if (urls.some(isLocalUrl) && typeof BroadcastChannel !== 'function') {
    throw new Error('createNet: BroadcastChannel is unavailable, cannot use a local: transport');
  }

  const { key, topic } = await deriveRoom(subtle, secret);
  const [mqtt, workerTimers] = urls.some(isMqttUrl)
    ? await Promise.all([loadMqtt(mqttUrl ?? new URL('../vendor/mqtt.min.js', import.meta.url)), canUseBlobWorkers()])
    : [null, false];

  // ---- No `await` below this line: everything is wired up synchronously, so ----
  // ---- the first callback can only fire after the caller holds the Net.     ----

  /** close() was called: no more sends accepted, no more callbacks. */
  let closing = false;
  /** Flush finished: transports are being / have been torn down. */
  let closed = false;
  /** @type {Promise<void> | null} */
  let closePromise = null;

  /** @type {Transport[]} Filled in below, once every callback it may trigger is defined. */
  let transports = [];
  /** Connected flags at the time of the last onStatus call. */
  let lastSignature = '';

  let nextSeq = (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 1) * SEQ_SPAN;
  const classify = createDeduper();
  let pendingInBytes = 0;
  let lastWarnAt = 0;

  // -- inbound: transport -> queue -> decrypt -> validate -> dedupe -> onMessage --

  const inQueue = createSerialQueue(async (/** @type {Uint8Array} */ wire) => {
    pendingInBytes -= wire.byteLength;
    if (closing) return;
    let envelope;
    try {
      const plain = await subtle.decrypt({ name: 'AES-GCM', iv: wire.subarray(0, IV_BYTES) }, key, wire.subarray(IV_BYTES));
      envelope = JSON.parse(utf8Decoder.decode(plain));
    } catch {
      return; // not for us, corrupted, or forged
    }
    if (closing || envelope === null || typeof envelope !== 'object') return;
    const { i: from, q: seq, y: type, d: data } = envelope;
    if (typeof from !== 'string' || from === '' || from.length > MAX_ID_LENGTH) return;
    if (typeof type !== 'string' || !Number.isSafeInteger(seq) || seq < 0) return;
    if (from === peerId) {
      // Our own message echoed back by the relay: proof that what we send still reaches it.
      try {
        onEcho();
      } catch (err) {
        console.error('[net] onEcho handler threw:', err);
      }
      return;
    }
    const verdict = classify(from, seq);
    if (verdict === DUPLICATE) return; // second copy via another relay, or stale
    try {
      onMessage(from, type, data, { late: verdict === LATE });
    } catch (err) {
      console.error('[net] onMessage handler threw:', err);
    }
  });

  /** @param {unknown} payload Bytes as delivered by a transport. */
  function onWire(payload) {
    if (closing || !(payload instanceof Uint8Array)) return;
    const size = payload.byteLength;
    if (size > MAX_WIRE_BYTES || size < MIN_WIRE_BYTES) return;
    if (inQueue.size >= MAX_PENDING_IN || pendingInBytes + size > MAX_PENDING_IN_BYTES) return; // flooded: shed load
    // Copy: MQTT.js hands out views into its receive buffer (its Buffer#slice does not copy).
    inQueue.push(new Uint8Array(payload));
    pendingInBytes += size;
  }

  // -- outbound: send() -> queue -> encrypt -> publish on every connected transport --

  const outQueue = createSerialQueue(async (/** @type {Uint8Array} */ plain) => {
    if (closed) return;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    if (closed) return;
    const wire = new Uint8Array(IV_BYTES + sealed.byteLength);
    wire.set(iv, 0);
    wire.set(sealed, IV_BYTES);
    for (const transport of transports) {
      if (transport.connected) transport.publish(wire);
    }
  });

  /**
   * @param {string} type
   * @param {any} [data]
   */
  function send(type, data) {
    if (typeof type !== 'string') throw new TypeError('net.send: `type` must be a string');
    if (closing) return;
    if (!transports.some((t) => t.connected)) return; // offline: dropped by design
    let plain;
    try {
      plain = utf8Encoder.encode(JSON.stringify({ i: peerId, q: nextSeq, y: type, d: data }));
    } catch (err) {
      warn(`dropping "${type}": data is not JSON-serialisable`, err);
      return;
    }
    if (IV_BYTES + plain.byteLength + TAG_BYTES > MAX_WIRE_BYTES) {
      warn(`dropping "${type}": ${plain.byteLength} bytes exceeds the ${MAX_WIRE_BYTES}-byte message limit`);
      return;
    }
    if (outQueue.size >= MAX_PENDING_OUT) {
      warn(`dropping "${type}": send queue is full`);
      return;
    }
    outQueue.push(plain);
    nextSeq += 1;
  }

  /**
   * Rate-limited console warning (send() may be called from a game loop).
   * @param {string} text
   * @param {unknown} [detail]
   */
  function warn(text, detail) {
    const now = Date.now();
    if (now - lastWarnAt < 1000) return;
    lastWarnAt = now;
    if (detail === undefined) console.warn('[net] ' + text);
    else console.warn('[net] ' + text, detail);
  }

  // -- status --

  /** @returns {NetStatus} */
  function status() {
    const list = transports.map((t) => ({ url: t.url, connected: !closing && t.connected }));
    return { connected: list.some((b) => b.connected), brokers: list };
  }

  const signature = () => transports.map((t) => (t.connected ? '1' : '0')).join('');

  function onTransportChange() {
    if (closing) return;
    const now = signature();
    if (now === lastSignature) return;
    lastSignature = now;
    try {
      onStatus(status());
    } catch (err) {
      console.error('[net] onStatus handler threw:', err);
    }
  }

  // -- transports --

  const hooks = { onWire, onChange: onTransportChange };
  transports = urls.map((url) =>
    isLocalUrl(url) ? createLocalTransport(url, topic, hooks) : createMqttTransport(url, topic, mqtt, workerTimers, hooks),
  );
  lastSignature = signature(); // the initial state is not announced through onStatus

  // Timers are throttled in background tabs and sockets die silently when a
  // device sleeps or changes network: retry right away when we come back.
  const kickAll = () => {
    if (!closing) for (const t of transports) t.kick();
  };
  const onVisibility = () => {
    if (globalThis.document && globalThis.document.visibilityState === 'visible') kickAll();
  };
  const canListen = typeof globalThis.addEventListener === 'function';
  if (canListen) {
    globalThis.addEventListener('online', kickAll);
    globalThis.addEventListener('pageshow', kickAll);
    if (globalThis.document) globalThis.document.addEventListener('visibilitychange', onVisibility);
  }

  /** @returns {Promise<void>} */
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    if (canListen) {
      globalThis.removeEventListener('online', kickAll);
      globalThis.removeEventListener('pageshow', kickAll);
      if (globalThis.document) globalThis.document.removeEventListener('visibilitychange', onVisibility);
    }
    closePromise = (async () => {
      try {
        // Let messages that send() already accepted (e.g. a final "bye") go out.
        await Promise.race([outQueue.idle(), sleep(CLOSE_FLUSH_MS)]);
      } finally {
        closed = true;
        await Promise.all(transports.map((t) => t.stop().catch(noop)));
      }
    })();
    return closePromise;
  }

  return { send, close, status };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Transport
 * @property {string} url
 * @property {boolean} connected
 * @property {(wire: Uint8Array) => void} publish  Best effort, never throws.
 * @property {() => void} kick                     Retry now if waiting for a reconnect timer.
 * @property {() => Promise<void>} stop            Disconnect for good, never rejects.
 */

/**
 * @typedef {Object} TransportHooks
 * @property {(payload: unknown) => void} onWire  A wire payload arrived.
 * @property {() => void} onChange                `connected` flipped.
 */

/**
 * One MQTT-over-WebSocket broker. Owns the reconnect loop: every connection
 * attempt uses a brand-new MQTT.js client with a fresh random clientId, so no
 * session state, queued packets or half-dead sockets survive a reconnect.
 *
 * @param {string} url
 * @param {string} topic
 * @param {any} mqtt  The MQTT.js namespace (`globalThis.mqtt`).
 * @param {boolean} workerTimers  Result of canUseBlobWorkers().
 * @param {TransportHooks} hooks
 * @returns {Transport}
 */
function createMqttTransport(url, topic, mqtt, workerTimers, hooks) {
  /** @type {any} Current MQTT.js client, null while waiting to retry. */
  let client = null;
  /** CONNACK and SUBACK both received on `client`. */
  let connected = false;
  let stopped = false;
  let failures = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let retryTimer = null;
  let connectedAt = 0;
  let openedAt = 0;

  function open() {
    retryTimer = null;
    if (stopped) return;
    openedAt = Date.now();
    /** @type {any} */
    let c;
    try {
      c = mqtt.connect(url, {
        clientId: 'dsy' + randomHex(10), // 23 chars [0-9a-z] (MQTT 3.1.1 portable limit); unrelated to peerId
        clean: true, // no broker-side session: nothing is queued for us while away
        keepalive: KEEPALIVE_SECONDS,
        protocolVersion: 4, // MQTT 3.1.1, the common denominator of public brokers
        connectTimeout: CONNECT_TIMEOUT_MS,
        reconnectPeriod: 0, // MQTT.js only offers a fixed interval; back-off is done here
        resubscribe: false, // we subscribe explicitly on every (re)connect
        queueQoSZero: false, // never buffer publishes while offline
        timerVariant: workerTimers ? 'auto' : 'native', // see canUseBlobWorkers()
      });
    } catch (err) {
      // new WebSocket() threw synchronously: malformed URL, or ws:// from an
      // https:// page (mixed content). Retrying cannot help.
      stopped = true;
      console.warn(`[net] broker ${url} is unusable:`, err);
      return;
    }
    client = c;
    // An 'error' event without a listener would throw; 'close' always follows a fatal error.
    c.on('error', noop);
    c.on('connect', () => {
      if (c !== client) return;
      // A broker that accepts the connection but never answers SUBSCRIBE must
      // not leave this transport half-connected for ever.
      const subackTimer = setTimeout(() => {
        if (c === client && !connected) lost(c);
      }, CONNECT_TIMEOUT_MS);
      c.subscribe(topic, { qos: 0 }, (/** @type {any} */ err, /** @type {any} */ granted) => {
        clearTimeout(subackTimer);
        if (c !== client) return;
        if (err || (Array.isArray(granted) && granted.some((g) => g.qos === 128))) {
          lost(c); // subscription refused (ACL / quota): useless connection
          return;
        }
        connectedAt = Date.now();
        setConnected(true);
      });
    });
    c.on('message', (/** @type {string} */ msgTopic, /** @type {Uint8Array} */ payload) => {
      if (c === client && msgTopic === topic) hooks.onWire(payload);
    });
    c.on('close', () => {
      if (c === client) lost(c);
    });
  }

  /** The current client is gone: release it and schedule the next attempt. */
  function lost(/** @type {any} */ c) {
    client = null;
    destroyClient(c);
    const wasStable = connected && Date.now() - connectedAt >= STABLE_MS;
    setConnected(false);
    if (stopped) return;
    failures = wasStable ? 1 : failures + 1;
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1));
    retryTimer = setTimeout(open, ceiling * (0.5 + Math.random() / 2));
  }

  function setConnected(/** @type {boolean} */ value) {
    if (connected === value) return;
    connected = value;
    hooks.onChange();
  }

  open();

  return {
    url,
    get connected() {
      return connected;
    },
    publish(wire) {
      if (!connected || !client) return;
      try {
        client.publish(topic, wire, { qos: 0, retain: false });
      } catch {
        /* socket is going away; the 'close' handler deals with it */
      }
    },
    kick() {
      if (stopped || client || retryTimer === null) return;
      if (Date.now() - openedAt < KICK_MIN_GAP_MS) return;
      clearTimeout(retryTimer);
      open();
    },
    async stop() {
      stopped = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      const c = client;
      const wasConnected = connected;
      client = null;
      connected = false;
      if (!c) return;
      if (wasConnected) {
        // Graceful: flush buffered publishes, send DISCONNECT, close the socket.
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, CLOSE_FLUSH_MS);
          const done = () => {
            clearTimeout(timer);
            resolve(undefined);
          };
          try {
            c.end(false, {}, done);
          } catch {
            done();
          }
        });
      }
      destroyClient(c);
    },
  };
}

/** Tear an MQTT.js client down immediately; safe in any state. */
function destroyClient(/** @type {any} */ c) {
  try {
    c.end(true);
  } catch {
    /* ignore */
  }
  try {
    // end() is a no-op while an earlier graceful end() is still in flight.
    if (c.stream && typeof c.stream.destroy === 'function') c.stream.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * BroadcastChannel transport: reaches same-origin pages of the same browser
 * profile without any network. Used for tests and offline demos; carries exactly
 * the same encrypted wire payloads as the MQTT transport.
 *
 * @param {string} url  'local:' or 'local:<namespace>'
 * @param {string} topic
 * @param {TransportHooks} hooks
 * @returns {Transport}
 */
function createLocalTransport(url, topic, hooks) {
  const namespace = url.slice('local:'.length);
  /** @type {BroadcastChannel | null} */
  let channel = new BroadcastChannel(namespace ? `${topic}/${namespace}` : topic);
  channel.onmessage = (event) => {
    const data = event.data;
    hooks.onWire(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  };
  return {
    url,
    get connected() {
      return channel !== null;
    },
    publish(wire) {
      try {
        if (channel) channel.postMessage(wire);
      } catch {
        /* channel closed concurrently */
      }
    },
    kick: noop,
    async stop() {
      if (!channel) return;
      channel.onmessage = null;
      channel.close();
      channel = null;
    },
  };
}

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

const DUPLICATE = 0;
const FRESH = 1;
const LATE = 2;

/**
 * Anti-replay window over the counters of one sender session: remembers the
 * highest counter seen and which of the REPLAY_WINDOW counters at or below it
 * were seen. O(1) memory (128 bytes of bitmap) whatever the traffic.
 */
class ReplayWindow {
  constructor() {
    /** Highest counter accepted so far. */
    this.top = -1;
    /** Ring bitmap: bit (n mod REPLAY_WINDOW) is set if counter n was accepted. */
    this.bits = new Uint32Array(REPLAY_WINDOW >>> 5);
  }

  /**
   * Classify counter `n` and record it as seen.
   *
   * @param {number} n Counter, 0 <= n < SEQ_SPAN.
   * @returns {number} FRESH (new and the highest so far), LATE (new, but a higher
   *   counter was seen before) or DUPLICATE (seen before, or older than the window).
   */
  accept(n) {
    const bits = this.bits;
    const slot = (n % REPLAY_WINDOW) >>> 5;
    const mask = 1 << (n & 31);
    if (n > this.top) {
      // Slide forward: the ring slots of the skipped counters still hold bits
      // of counters that just fell out of the window.
      if (n - this.top >= REPLAY_WINDOW) {
        bits.fill(0);
      } else {
        for (let k = this.top + 1; k < n; k++) bits[(k % REPLAY_WINDOW) >>> 5] &= ~(1 << (k & 31));
      }
      this.top = n;
      bits[slot] |= mask;
      return FRESH;
    }
    if (this.top - n >= REPLAY_WINDOW) return DUPLICATE; // too old to tell
    if (bits[slot] & mask) return DUPLICATE;
    bits[slot] |= mask; // overtaken on another relay
    return LATE;
  }
}

/**
 * @returns {(peerId: string, seq: number) => number} Returns FRESH or LATE exactly
 *   once per (peerId, seq) and DUPLICATE otherwise, within the memory limits
 *   described in the module header.
 */
function createDeduper() {
  /** @type {Map<string, ReplayWindow>} Insertion order = least recently used first. */
  const sessions = new Map();
  return (peerId, seq) => {
    const epoch = Math.floor(seq / SEQ_SPAN);
    const key = `${epoch} ${peerId}`;
    let win = sessions.get(key);
    if (win) {
      sessions.delete(key); // re-inserted below as most recently used
    } else {
      win = new ReplayWindow();
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest !== undefined) sessions.delete(oldest);
      }
    }
    sessions.set(key, win);
    return win.accept(seq - epoch * SEQ_SPAN);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop() {}

/** @param {string} url */
function isMqttUrl(url) {
  return /^wss?:\/\//i.test(url);
}

/** @param {string} url */
function isLocalUrl(url) {
  return url.startsWith('local:');
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {number} byteCount */
function randomHex(byteCount) {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(byteCount)));
}

/** @param {Uint8Array} bytes */
function toHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/**
 * @param {SubtleCrypto} subtle
 * @param {string} secret
 * @returns {Promise<{ key: CryptoKey, topic: string }>}
 */
async function deriveRoom(subtle, secret) {
  const digest = async (/** @type {string} */ label) =>
    new Uint8Array(await subtle.digest('SHA-256', utf8Encoder.encode(`${PROTO}|${label}|${secret}`)));
  const [keyBytes, topicBytes] = await Promise.all([digest('key'), digest('topic')]);
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { key, topic: `${PROTO}/${toHex(topicBytes).slice(0, 32)}` };
}

/** @type {Promise<boolean> | null} */
let blobWorkerProbe = null;

/**
 * MQTT.js drives its keepalive pings from a Web Worker created from a blob: URL,
 * because worker timers are not throttled in background tabs. A
 * Content-Security-Policy that does not allow `worker-src blob:` blocks that
 * worker without any error MQTT.js could see: no ping is ever sent and the
 * broker drops every idle connection after 1.5 x keepalive. So test once whether
 * such a worker actually runs; if not, MQTT.js is told to use ordinary timers.
 *
 * @returns {Promise<boolean>} Never rejects.
 */
function canUseBlobWorkers() {
  if (!blobWorkerProbe) {
    blobWorkerProbe = new Promise((resolve) => {
      /** @type {Worker | null} */
      let worker = null;
      let blobUrl = '';
      const finish = (/** @type {boolean} */ ok) => {
        clearTimeout(timer);
        try {
          if (worker) worker.terminate();
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        } catch {
          /* ignore */
        }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 2000);
      try {
        blobUrl = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
        worker = new Worker(blobUrl);
        worker.onmessage = () => finish(true);
        worker.onerror = () => finish(false);
      } catch {
        finish(false);
      }
    });
  }
  return blobWorkerProbe;
}

/** @type {Promise<any> | null} Shared by all createNet() calls of this page. */
let mqttLoading = null;

/**
 * Resolve the MQTT.js namespace, injecting the bundle with a classic <script>
 * tag on first use. (The bundle declares `var mqtt` at top level, so it must
 * NOT be loaded as a module.)
 *
 * @param {string | URL} url
 * @returns {Promise<any>}
 */
function loadMqtt(url) {
  const ready = () => {
    const lib = /** @type {any} */ (globalThis).mqtt;
    return lib && typeof lib.connect === 'function' ? lib : null;
  };
  const existing = ready();
  if (existing) return Promise.resolve(existing);
  if (!mqttLoading) {
    mqttLoading = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('net: cannot load MQTT.js here (no document); load it yourself so that globalThis.mqtt exists'));
        return;
      }
      const script = document.createElement('script');
      script.src = String(url);
      script.async = true;
      script.onload = () => {
        const lib = ready();
        if (lib) resolve(lib);
        else reject(new Error(`net: ${url} loaded but did not define the global \`mqtt\``));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`net: failed to load MQTT.js from ${url}`));
      };
      document.head.appendChild(script);
    });
    // Allow a later createNet() to try again after a failed load.
    mqttLoading.catch(() => {
      mqttLoading = null;
    });
  }
  return mqttLoading;
}

/**
 * Runs `worker` on pushed items strictly one at a time, in push order.
 * (Promises of independent WebCrypto calls are not guaranteed to settle in call
 * order, so both directions are serialised to keep per-sender ordering.)
 *
 * @template T
 * @param {(item: T) => Promise<void>} worker  Must handle its own errors; rejections are swallowed.
 */
function createSerialQueue(worker) {
  /** @type {(T | undefined)[]} */
  let items = [];
  let head = 0;
  let running = false;
  /** @type {(() => void)[]} */
  let idleWaiters = [];

  async function pump() {
    running = true;
    try {
      while (head < items.length) {
        const item = /** @type {T} */ (items[head]);
        items[head++] = undefined;
        if (head >= 1024) {
          items = items.slice(head); // compact instead of shifting on every item
          head = 0;
        }
        try {
          await worker(item);
        } catch {
          /* worker's problem */
        }
      }
    } finally {
      items = [];
      head = 0;
      running = false;
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const wake of waiters) wake();
    }
  }

  return {
    /** Number of items not yet handed to the worker. */
    get size() {
      return items.length - head;
    },
    /** @param {T} item */
    push(item) {
      items.push(item);
      if (!running) pump();
    },
    /** Resolves when the queue is empty and the worker is not running. */
    idle() {
      return running ? new Promise((resolve) => idleWaiters.push(() => resolve(undefined))) : Promise.resolve();
    },
  };
}
