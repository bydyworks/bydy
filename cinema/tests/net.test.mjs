// End-to-end test of net.js and sign.js in headless Chromium.
//
//   node test-net.mjs            exit code 0 = all PASS, 1 = at least one FAIL
//   NET_TEST_SOAK=1 node ...     additionally run the slow keepalive / hung-broker / flapping tests (~3 min)
//   NET_TEST_PUBLIC=1 node ...   additionally try the real DEFAULT_BROKERS (needs internet)
//
// Topology: this process runs a static http server for the lab directory and two
// aedes MQTT brokers with WebSocket listeners on 127.0.0.1; Playwright opens the
// test page in several browser contexts (= independent browser profiles).

import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Aedes } from 'aedes';
import { WebSocketServer, createWebSocketStream } from 'ws';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SETTLE_MS = 500; // extra wait after the expected messages arrived, to catch late duplicates
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const subtle = globalThis.crypto.subtle;

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  return !!ok;
}
function section(title) {
  console.log(`\n== ${title} ==`);
}
function info(text) {
  console.log(`      ${text}`);
}

async function waitFor(fn, timeoutMs = 10_000, everyMs = 50) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await sleep(everyMs);
  }
}

// ---------------------------------------------------------------------------
// static file server (http://127.0.0.1 is a secure context, so crypto.subtle works)
// ---------------------------------------------------------------------------

const FILES = {
  '/test-page.html': ['net-test-page.html', 'text/html; charset=utf-8'],
  '/net.js': ['../js/net.js', 'text/javascript; charset=utf-8'],
  '/js/net.js': ['../js/net.js', 'text/javascript; charset=utf-8'], // same module one level down: default mqttUrl -> /vendor/
  '/sign.js': ['../js/sign.js', 'text/javascript; charset=utf-8'],
  '/vendor/mqtt.min.js': ['../vendor/mqtt.min.js', 'text/javascript; charset=utf-8'],
};
const hits = new Map();
const web = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  hits.set(pathname, (hits.get(pathname) || 0) + 1);
  // /csp/test-page.html = the same page under a strict Content-Security-Policy without `worker-src blob:`
  const strictCsp = pathname === '/csp/test-page.html';
  const entry = FILES[strictCsp ? '/test-page.html' : pathname];
  if (!entry) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const headers = { 'content-type': entry[1], 'cache-control': 'no-store' };
  if (strictCsp) headers['content-security-policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*";
  res.writeHead(200, headers);
  res.end(await readFile(path.join(ROOT, entry[0])));
});
await new Promise((r) => web.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${web.address().port}`;

// ---------------------------------------------------------------------------
// MQTT brokers
// ---------------------------------------------------------------------------

const captured = {};

/** Start an aedes broker with a WebSocket listener. `port` 0 = pick a free one. */
async function startBroker(name, port = 0) {
  const aedes = await Aedes.createBroker();
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  wss.on('connection', (ws, req) => aedes.handle(createWebSocketStream(ws), req));
  /** Everything clients ever published to this broker name (survives restarts): { topic, payload: Buffer, clientId }. */
  const published = (captured[name] ||= []);
  aedes.on('publish', (packet, client) => {
    if (client) published.push({ topic: packet.topic, payload: Buffer.from(packet.payload), clientId: client.id, qos: packet.qos, retain: packet.retain });
  });
  let pings = 0;
  aedes.on('ping', () => pings++);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actualPort = server.address().port;
  return {
    name,
    port: actualPort,
    url: `ws://127.0.0.1:${actualPort}`,
    published,
    clientCount: () => aedes.connectedClients,
    /** PINGREQ packets received so far. */
    pingCount: () => pings,
    /** Hang: keep the existing TCP connections open but stop reading from them (new connections still work). */
    freeze() {
      for (const s of sockets) s.pause();
    },
    /** Publish from the broker itself (reaches every subscriber). */
    inject: (topic, payload) =>
      new Promise((resolve, reject) =>
        aedes.publish({ cmd: 'publish', topic, payload: Buffer.from(payload), qos: 0, retain: false }, (e) => (e ? reject(e) : resolve())),
      ),
    /** Crash: drop every TCP connection without a goodbye and stop listening. */
    async kill() {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
      wss.close();
      await new Promise((r) => aedes.close(r));
    },
  };
}

// ---------------------------------------------------------------------------
// an independent implementation of the wire format (node WebCrypto), used to
// inspect what the page really sent and to inject hand-made messages
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();
async function sha256(text) {
  return Buffer.from(await subtle.digest('SHA-256', enc.encode(text)));
}
async function deriveRoom(secret) {
  const key = await subtle.importKey('raw', await sha256(`dsy1|key|${secret}`), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const topic = 'dsy1/' + (await sha256(`dsy1|topic|${secret}`)).toString('hex').slice(0, 32);
  return { key, topic };
}
async function seal(key, plain) {
  const bytes = typeof plain === 'string' ? enc.encode(plain) : plain instanceof Uint8Array ? plain : enc.encode(JSON.stringify(plain));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return Buffer.concat([Buffer.from(iv), ct]);
}
async function unseal(key, wire) {
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: wire.subarray(0, 12) }, key, wire.subarray(12));
  return JSON.parse(dec.decode(plain));
}

// ---------------------------------------------------------------------------
// page driver
// ---------------------------------------------------------------------------

const pageErrors = []; // uncaught exceptions in any page: must stay empty
const consoleNoise = []; // console warnings/errors (failed WebSocket connections are expected here)

class Peer {
  constructor(page, name, id) {
    this.page = page;
    this.name = name; // key of the net inside the page
    this.id = id; // peerId on the wire
  }
  static async openPage(context, label, query = '') {
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${label}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleNoise.push(`${label}: ${m.text()}`);
    });
    await page.goto(`${BASE}${query.startsWith('/') ? query : `/test-page.html${query}`}`);
    await page.waitForFunction(() => window.__ready === true);
    return page;
  }
  /** @returns initial status */
  start(cfg) {
    return this.page.evaluate(([n, c]) => window.T.start(n, c), [this.name, { peerId: this.id, ...cfg }]);
  }
  send(type, data) {
    return this.page.evaluate(([n, t, d]) => window.T.send(n, t, d), [this.name, type, data]);
  }
  burst(type, n) {
    return this.page.evaluate(([name, t, count]) => window.T.burst(name, t, count), [this.name, type, n]);
  }
  stream(type, n, everyMs) {
    return this.page.evaluate(([name, t, count, ms]) => window.T.stream(name, t, count, ms), [this.name, type, n, everyMs]);
  }
  messages(type) {
    return this.page.evaluate(([n, t]) => window.T.messages(n, t ?? undefined), [this.name, type ?? null]);
  }
  count(type) {
    return this.page.evaluate(([n, t]) => window.T.count(n, t ?? undefined), [this.name, type ?? null]);
  }
  status() {
    return this.page.evaluate((n) => window.T.status(n), this.name);
  }
  statusLog() {
    return this.page.evaluate((n) => window.T.statusLog(n), this.name);
  }
  close() {
    return this.page.evaluate((n) => window.T.close(n), this.name);
  }
}

const flags = (status) => status.brokers.map((b) => (b.connected ? '1' : '0')).join('');
const allHave = async (peers, pattern) => (await Promise.all(peers.map((p) => p.status()))).every((s) => flags(s) === pattern);

/** Every sender sends `n` messages {k: 0..n-1} of `type` in one synchronous loop. */
const sendAll = (senders, type, n) => Promise.all(senders.map((s) => s.burst(type, n)));

/**
 * Assert that every receiver got, for `type`: exactly k = 0..n-1 in order from
 * every sender other than itself, nothing from itself and nothing from anyone else.
 */
async function expectDelivery(label, { receivers, senders, type, n, timeoutMs = 15_000 }) {
  const want = (r) => senders.filter((s) => s.id !== r.id).length * n;
  await waitFor(async () => (await Promise.all(receivers.map(async (r) => (await r.count(type)) >= want(r)))).every(Boolean), timeoutMs);
  await sleep(SETTLE_MS);
  const problems = [];
  const expected = JSON.stringify(Array.from({ length: n }, (_, k) => k));
  for (const r of receivers) {
    const bySender = new Map();
    let late = 0;
    for (const m of await r.messages(type)) {
      if (!bySender.has(m.from)) bySender.set(m.from, []);
      bySender.get(m.from).push(m.data && m.data.k);
      if (m.late !== false) late++;
    }
    if (late) problems.push(`${r.id}: ${late} messages flagged late`);
    for (const s of senders) {
      const got = bySender.get(s.id) || [];
      bySender.delete(s.id);
      if (s.id === r.id) {
        if (got.length) problems.push(`${r.id} received ${got.length} of its own messages`);
      } else if (JSON.stringify(got) !== expected) {
        const dupes = got.length - new Set(got).size;
        const sorted = got.every((v, i) => i === 0 || got[i - 1] < v);
        problems.push(`${r.id}<-${s.id}: ${got.length}/${n} received, ${dupes} duplicates, ${sorted ? 'in order' : 'OUT OF ORDER'}`);
      }
    }
    for (const [from, got] of bySender) problems.push(`${r.id} received ${got.length} from unexpected sender ${from}`);
  }
  return check(label, problems.length === 0, problems.slice(0, 4).join('; '));
}

/** Assert that none of `peers` has any message of `type`. */
async function expectNothing(label, peers, type) {
  const counts = await Promise.all(peers.map((p) => p.count(type)));
  return check(label, counts.every((c) => c === 0), counts.some((c) => c) ? `counts=${counts}` : '');
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
let b1 = await startBroker('b1');
let b2 = await startBroker('b2');

async function mqttTests() {
  section('MQTT: two aedes brokers, 3 peers + 1 outsider, each in its own browser context');
  const SECRET = 'room-secret-' + Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  const OTHER_SECRET = SECRET + 'x';
  const BROKERS = [b1.url, b2.url];
  const room = await deriveRoom(SECRET);
  const otherRoom = await deriveRoom(OTHER_SECRET);

  const ctx = { A: await browser.newContext(), B: await browser.newContext(), C: await browser.newContext(), X: await browser.newContext() };
  // A imports /js/net.js and relies on the DEFAULT mqttUrl (../vendor/mqtt.min.js relative to the module).
  const pageA = await Peer.openPage(ctx.A, 'A', '?mod=/js/net.js');
  // B imports /net.js and passes mqttUrl explicitly.
  const pageB = await Peer.openPage(ctx.B, 'B');
  // C has MQTT.js loaded up front (createNet must reuse the global) and counts raw arrivals.
  const pageC = await Peer.openPage(ctx.C, 'C');
  await pageC.addScriptTag({ url: `${BASE}/vendor/mqtt.min.js` });
  await pageC.evaluate(() => {
    // NB: `mqtt.connect = wrapper` does not work - the bundle's exports are getter-only
    // properties. Replace the whole global with a wrapping object instead.
    const original = window.mqtt;
    window.__raw = { messages: 0, clients: 0, assignWorks: false, options: null };
    try {
      original.connect = original.connect;
      window.__raw.assignWorks = Object.getOwnPropertyDescriptor(original, 'connect').writable === true;
    } catch {
      /* strict mode: TypeError */
    }
    window.mqtt = {
      ...original,
      connect: (...args) => {
        const client = original.connect(...args);
        window.__raw.clients++;
        window.__raw.options = { ...args[1] };
        client.on('message', () => window.__raw.messages++);
        return client;
      },
    };
  });
  const pageX = await Peer.openPage(ctx.X, 'X');

  const A = new Peer(pageA, 'main', 'peer-A');
  const B = new Peer(pageB, 'main', 'peer-B');
  const C = new Peer(pageC, 'main', 'peer-C');
  const X = new Peer(pageX, 'main', 'peer-X');
  const room3 = [A, B, C];

  const vendorHitsBefore = hits.get('/vendor/mqtt.min.js') || 0;
  const initial = await Promise.all([
    A.start({ secret: SECRET, brokers: BROKERS }),
    B.start({ secret: SECRET, brokers: BROKERS, mqttUrl: '/vendor/mqtt.min.js' }),
    C.start({ secret: SECRET, brokers: BROKERS, mqttUrl: '/does-not-exist.js' }),
    X.start({ secret: OTHER_SECRET, brokers: BROKERS, mqttUrl: '/vendor/mqtt.min.js' }),
  ]);
  check(
    'createNet resolves before any broker is connected, status() lists brokers in input order',
    initial.every((s) => s.connected === false && s.brokers.length === 2 && s.brokers[0].url === b1.url && s.brokers[1].url === b2.url && flags(s) === '00'),
    JSON.stringify(initial[0]),
  );
  check(
    'mqtt.min.js is injected lazily (default mqttUrl for /js/net.js, explicit mqttUrl) and reused when the global already exists',
    (await pageA.evaluate(() => typeof window.mqtt === 'object' && document.querySelectorAll('script[src$="/vendor/mqtt.min.js"]').length)) === 1 &&
      (await pageB.evaluate(() => typeof window.mqtt === 'object' && document.querySelectorAll('script[src$="/vendor/mqtt.min.js"]').length)) === 1 &&
      (hits.get('/vendor/mqtt.min.js') || 0) - vendorHitsBefore === 3 && // A, B, X - not C
      !hits.has('/does-not-exist.js'),
    `vendor fetches=${(hits.get('/vendor/mqtt.min.js') || 0) - vendorHitsBefore}`,
  );

  const t0 = Date.now();
  check('all 4 pages connect to both brokers', await waitFor(() => allHave([A, B, C, X], '11')), `${Date.now() - t0} ms`);
  {
    const log = await A.statusLog();
    const last = log[log.length - 1];
    check(
      'onStatus fired on each change and its last value equals status()',
      log.length === 2 && log[0].connected === true && flags(last) === '11' && JSON.stringify(last) === JSON.stringify(await A.status()),
      `events=${log.map(flags).join(',')}`,
    );
    const early = await Promise.all([A, B, C, X].map((p) => p.page.evaluate((n) => window.T.callbacksBeforeResolve(n), p.name)));
    check('no callback fired before createNet() resolved', early.every((n) => n === 0), `counts=${early}`);
  }

  // ---- basic exchange ----
  await sendAll([A, B, C, X], 'm1', 5);
  await expectDelivery('each peer receives every other peer\'s messages exactly once, in order; no own echo', { receivers: room3, senders: room3, type: 'm1', n: 5 });
  check(
    'a page with a different secret receives nothing, and the room receives nothing from it',
    (await X.count()) === 0 && (await Promise.all(room3.map((p) => p.messages()))).every((log) => log.every((m) => m.from !== 'peer-X')),
  );
  {
    const raw = await pageC.evaluate(() => window.__raw);
    check(
      'both brokers really delivered every message to the page (C saw 2 x 15 raw arrivals, delivered 10)',
      raw.clients === 2 && raw.messages === 30 && (await C.count()) === 10,
      `raw=${raw.messages} clients=${raw.clients} delivered=${await C.count()}; mqtt.connect assignable=${raw.assignWorks}`,
    );
  }

  {
    const { options } = await pageC.evaluate(() => window.__raw);
    const { clientId, ...rest } = options || {};
    check(
      'MQTT.js is driven with clean session, keepalive 30 s, MQTT 3.1.1, own reconnect (reconnectPeriod 0), no offline queue, worker timers',
      JSON.stringify(rest) ===
        JSON.stringify({ clean: true, keepalive: 30, protocolVersion: 4, connectTimeout: 10000, reconnectPeriod: 0, resubscribe: false, queueQoSZero: false, timerVariant: 'auto' }) &&
        /^dsy[0-9a-f]{20}$/.test(clientId),
      JSON.stringify(options),
    );
    const all = [...b1.published, ...b2.published];
    check('every publish is QoS 0 and not retained', all.length === 40 && all.every((p) => p.qos === 0 && p.retain === false), `${all.length} publishes`);
  }

  // ---- what the brokers saw ----
  {
    const seen1 = b1.published.filter((p) => p.topic === room.topic);
    const seen2 = b2.published.filter((p) => p.topic === room.topic);
    const set1 = new Set(seen1.map((p) => p.payload.toString('base64')));
    const set2 = new Set(seen2.map((p) => p.payload.toString('base64')));
    check(
      'every message was published to both brokers with the identical ciphertext',
      seen1.length === 15 && seen2.length === 15 && set1.size === 15 && [...set1].every((p) => set2.has(p)),
      `b1=${seen1.length} b2=${seen2.length}`,
    );
    const topics = new Set([...b1.published, ...b2.published].map((p) => p.topic));
    check(
      'topics are dsy1/<32 hex>, derived as SHA-256("dsy1|topic|"+secret); different secret -> different topic',
      topics.size === 2 && topics.has(room.topic) && topics.has(otherRoom.topic) && [...topics].every((t) => /^dsy1\/[0-9a-f]{32}$/.test(t)),
      [...topics].join(' '),
    );
    const envelopes = await Promise.all(seen1.map((p) => unseal(room.key, p.payload)));
    const ivs = new Set(seen1.map((p) => p.payload.subarray(0, 12).toString('hex')));
    const sample = envelopes.find((e) => e.i === 'peer-A');
    check(
      'wire payload = 12-byte IV || AES-256-GCM(JSON {i,q,y,d}), decryptable with SHA-256("dsy1|key|"+secret), fresh IV per message',
      envelopes.every((e) => JSON.stringify(Object.keys(e).sort()) === '["d","i","q","y"]' && e.y === 'm1' && Number.isSafeInteger(e.q)) &&
        ivs.size === 15 &&
        seen1.every((p, i) => p.payload.length === 12 + Buffer.byteLength(JSON.stringify(envelopes[i])) + 16),
      `sample=${JSON.stringify(sample)}`,
    );
    const bySender = new Map();
    for (const e of envelopes) bySender.set(e.i, [...(bySender.get(e.i) || []), e.q]);
    const epochs = [...bySender.values()].map((qs) => Math.floor(qs[0] / 2 ** 21));
    check(
      'seq = random 31-bit epoch * 2^21 + counter: consecutive per sender, counter starts at 0, epochs differ between peers',
      [...bySender.values()].every((qs) => qs.every((q, i) => q === qs[0] + i) && qs[0] % 2 ** 21 === 0) && new Set(epochs).size === 3,
      `epochs=${epochs.join(',')}`,
    );
    const everything = Buffer.concat([...b1.published, ...b2.published].map((p) => Buffer.concat([Buffer.from(p.topic), p.payload, Buffer.from(p.clientId)])));
    const clientIds = new Set([...b1.published, ...b2.published].map((p) => p.clientId));
    check(
      'nothing readable leaks to the broker: no secret, peerId or plaintext in topic/payload/clientId; clientIds are random and unique per connection',
      ![SECRET, 'peer-A', 'peer-B', 'peer-C', '"y":"m1"'].some((needle) => everything.includes(needle)) &&
        clientIds.size === 8 &&
        [...clientIds].every((id) => /^dsy[0-9a-f]{20}$/.test(id)),
      `${clientIds.size} clientIds, e.g. ${[...clientIds][0]}`,
    );
  }

  // ---- hand-made messages injected through the brokers ----
  {
    const injectBoth = async (wire) => {
      await b1.inject(room.topic, wire);
      await b2.inject(room.topic, wire);
    };
    const E = 123456; // epoch of the fake peer "ghost"
    const q = (counter, epoch = E) => epoch * 2 ** 21 + counter;
    const ghost = (counter, tag, epoch = E) => ({ i: 'ghost', q: q(counter, epoch), y: 'inj', d: { tag } });
    const wrongKey = (await deriveRoom('some other secret')).key;
    const filler = (wireBytes, tag) => {
      // envelope whose encrypted size is exactly `wireBytes`
      const base = { i: 'ghost', q: q(tag === 'max' ? 100 : 101), y: 'inj', d: { tag, pad: '' } };
      base.d.pad = 'x'.repeat(wireBytes - 28 - Buffer.byteLength(JSON.stringify(base)));
      return base;
    };
    const maxWire = await seal(room.key, filler(16384, 'max'));
    const tooBig = await seal(room.key, filler(16385, 'too-big'));

    const steps = [
      ['random bytes', globalThis.crypto.getRandomValues(new Uint8Array(64))],
      ['too short', new Uint8Array(20)],
      ['encrypted with another key', await seal(wrongKey, ghost(1, 'wrong-key'))],
      ['not JSON', await seal(room.key, 'hello, not json')],
      ['JSON null', await seal(room.key, 'null')],
      ['JSON array', await seal(room.key, '["ghost",1,"inj",{}]')],
      ['no sender', await seal(room.key, { q: q(2), y: 'inj', d: { tag: 'no-i' } })],
      ['empty sender', await seal(room.key, { i: '', q: q(2), y: 'inj', d: { tag: 'empty-i' } })],
      ['fractional seq', await seal(room.key, { i: 'ghost', q: 1.5, y: 'inj', d: { tag: 'frac-q' } })],
      ['negative seq', await seal(room.key, { i: 'ghost', q: -1, y: 'inj', d: { tag: 'neg-q' } })],
      ['string seq', await seal(room.key, { i: 'ghost', q: '7', y: 'inj', d: { tag: 'str-q' } })],
      ['non-string type', await seal(room.key, { i: 'ghost', q: q(2), y: 7, d: { tag: 'num-y' } })],
      ['16385-byte payload', tooBig],
      ['16384-byte payload', maxWire], // -> delivered: "max"
      ['first', await seal(room.key, ghost(5, 'c5'))], // -> delivered
      ['same seq again, different ciphertext', await seal(room.key, ghost(5, 'c5-replay'))],
      ['older but unseen', await seal(room.key, ghost(3, 'c3'))], // -> delivered (overtaken on another relay)
      ['older, seen', await seal(room.key, ghost(3, 'c3-replay'))],
      ['jump ahead', await seal(room.key, ghost(5000, 'c5000'))], // -> delivered
      ['oldest slot of the window', await seal(room.key, ghost(5000 - 1023, 'c3977'))], // -> delivered
      ['just outside the window', await seal(room.key, ghost(5000 - 1024, 'c3976'))],
      ['far outside the window', await seal(room.key, ghost(4, 'c4'))],
      ['new session of the same peer, counter 0', await seal(room.key, ghost(0, 'e2c0', E + 77))], // -> delivered
      ['late copy from the previous session', await seal(room.key, ghost(5, 'c5-late'))],
      ['previous session continues', await seal(room.key, ghost(5001, 'c5001'))], // -> delivered
      ['no data field', await seal(room.key, { i: 'ghost', q: q(5002), y: 'inj' })], // -> delivered, data undefined
      ['spoofed sender id', await seal(room.key, { i: 'peer-A', q: q(9, 999), y: 'inj', d: { tag: 'spoof-A' } })], // -> B, C only
    ];
    for (const [, wire] of steps) await injectBoth(wire);
    const expectTags = ['max', 'c5', 'c3', 'c5000', 'c3977', 'e2c0', 'c5001', null];
    await waitFor(async () => (await B.count('inj')) >= expectTags.length + 1, 5000);
    await sleep(SETTLE_MS);
    const tags = async (p) => (await p.messages('inj')).map((m) => (m.from === 'ghost' ? (m.data ? m.data.tag : null) : `${m.from}:${m.data.tag}`));
    const [ta, tb, tc] = await Promise.all(room3.map(tags));
    check(
      'injected garbage / wrong key / malformed envelopes / >16 KB are ignored; a 16384-byte payload is accepted',
      JSON.stringify(ta) === JSON.stringify(expectTags),
      `A delivered: ${JSON.stringify(ta)}`,
    );
    check(
      'dedupe window: replays and too-old seqs dropped, late-but-new accepted once, new epoch accepted, old session still remembered',
      JSON.stringify(tb) === JSON.stringify([...expectTags, 'peer-A:spoof-A']) && JSON.stringify(tc) === JSON.stringify(tb),
      `B delivered: ${JSON.stringify(tb)}`,
    );
    const lateTags = (await A.messages('inj')).filter((m) => m.late).map((m) => m.data.tag);
    check('exactly the messages that arrived after a higher seq of the same session are flagged info.late', JSON.stringify(lateTags) === '["c5","c3","c3977"]', `late: ${JSON.stringify(lateTags)}`);
    check('a message carrying our own peerId is ignored by us (and, being unauthenticated, accepted by the others)', !ta.includes('peer-A:spoof-A') && tb.includes('peer-A:spoof-A'));
    check('the outsider room saw none of the injected messages', (await X.count()) === 0);
  }

  // ---- send() edge cases ----
  {
    const before = b1.published.length;
    const big = await pageA.evaluate(() => window.T.sendThrows('main', 'big', { pad: 'x'.repeat(20000) }));
    const circular = await pageA.evaluate(() => {
      const o = {};
      o.self = o;
      return window.T.sendThrows('main', 'circular', o);
    });
    const badType = await pageA.evaluate(() => window.T.sendThrows('main', 42, {}));
    await A.send('after-bad', { k: 0 });
    await waitFor(async () => (await B.count('after-bad')) === 1, 5000);
    await sleep(200);
    check(
      'send(): oversized and non-serialisable data are dropped without throwing, non-string type throws TypeError, net keeps working',
      big === null && circular === null && /^TypeError/.test(String(badType)) && b1.published.length === before + 1 && (await B.count('big')) === 0 && (await B.count('after-bad')) === 1,
      `big=${big} circular=${circular} badType=${badType}`,
    );
  }

  // ---- kill one broker in the middle of a stream ----
  {
    const streams = Promise.all(room3.map((p) => p.stream('s1', 150, 10)));
    await sleep(500);
    await b1.kill();
    const tKill = Date.now();
    await streams;
    await expectDelivery('killing one broker mid-stream loses nothing (3 x 150 messages, exactly once, in order)', { receivers: room3, senders: room3, type: 's1', n: 150 });
    check('status after the kill: still connected, broker 1 reported down', await waitFor(() => allHave(room3, '01'), 5000), `${Date.now() - tKill} ms after kill`);
    info(`broker 2 carried ${b2.published.filter((p) => p.topic === room.topic).length} publishes in total so far`);

    // ---- restart it ----
    const tRestart = Date.now();
    b1 = await startBroker('b1', b1.port);
    check('restarted broker is rejoined automatically', await waitFor(() => allHave([...room3, X], '11'), 30_000), `${Date.now() - tRestart} ms after restart`);
    const rawBefore = (await pageC.evaluate(() => window.__raw)).messages;
    await sendAll(room3, 'm2', 5);
    await expectDelivery('after the rejoin: exactly once again with two brokers', { receivers: room3, senders: room3, type: 'm2', n: 5 });
    const rawAfter = (await pageC.evaluate(() => window.__raw)).messages;
    check('after the rejoin: both brokers deliver again (C saw 2 x 15 raw arrivals)', rawAfter - rawBefore === 30, `raw delta=${rawAfter - rawBefore}`);
  }

  // ---- kill both brokers, then restart both ----
  {
    await Promise.all([b1.kill(), b2.kill()]);
    const tDown = Date.now();
    check('both brokers killed: every page reports connected=false', await waitFor(() => allHave([...room3, X], '00'), 5000), `${Date.now() - tDown} ms`);
    await sendAll(room3, 'while-down', 3); // must be dropped, not queued
    await sleep(2500); // stay down long enough for a few failed reconnect attempts
    const tUp = Date.now();
    [b1, b2] = await Promise.all([startBroker('b1', b1.port), startBroker('b2', b2.port)]);
    check('both brokers restarted: every page reconnects to both automatically', await waitFor(() => allHave([...room3, X], '11'), 45_000), `${Date.now() - tUp} ms after restart`);
    await sendAll(room3, 'm3', 5);
    await expectDelivery('delivery resumes after a full outage (exactly once, in order)', { receivers: room3, senders: room3, type: 'm3', n: 5 });
    await expectNothing('messages sent while nothing was connected were dropped, not queued', room3, 'while-down');
    const log = await A.statusLog();
    check(
      'onStatus history shows the outage and the recovery',
      log.some((s) => !s.connected) && log[log.length - 1].connected && flags(log[log.length - 1]) === '11' && log.every((s, i) => i === 0 || flags(s) !== flags(log[i - 1])),
      log.map(flags).join(' '),
    );
  }

  // ---- burst ----
  {
    const t = Date.now();
    await sendAll(room3, 'burst', 300);
    await expectDelivery('burst: 3 peers x 300 messages in one tick arrive exactly once and in order per sender', { receivers: room3, senders: room3, type: 'burst', n: 300 });
    info(`burst settled in ${Date.now() - t - SETTLE_MS} ms`);
  }

  // ---- rolling restart: both brokers are restarted one after the other under traffic ----
  {
    await sleep(5500); // connections older than 5 s count as stable: the next loss is retried after 0.5-1 s
    const N = 250;
    const streams = Promise.all(room3.map((p) => p.stream('rolling', N, 50))); // 12.5 s of traffic
    await sleep(500);
    await b1.kill();
    await sleep(1500);
    b1 = await startBroker('b1', b1.port);
    await sleep(7000); // retries after ~0.75 s (fails), ~2.25 s, worst case ~7 s
    const rejoined = await allHave(room3, '11');
    await b2.kill();
    await sleep(1500);
    b2 = await startBroker('b2', b2.port);
    await streams;
    check('rolling restart: every peer had rejoined broker 1 before broker 2 went down', rejoined);
    await expectDelivery('rolling restart of both brokers under traffic loses nothing (3 x 250 messages, exactly once, in order)', { receivers: room3, senders: room3, type: 'rolling', n: N });
    await waitFor(() => allHave([...room3, X], '11'), 30_000);
  }

  // ---- a peer restarts (page reload): its seq starts again ----
  {
    const oldB = [...b1.published].filter((p) => p.topic === room.topic);
    const oldBwires = [];
    for (const p of oldB) {
      const e = await unseal(room.key, p.payload);
      if (e.i === 'peer-B' && e.y === 'm1') oldBwires.push(p.payload);
    }
    await pageB.reload();
    await pageB.waitForFunction(() => window.__ready === true);
    await B.start({ secret: SECRET, brokers: BROKERS, mqttUrl: '/vendor/mqtt.min.js' });
    await waitFor(() => allHave([B], '11'));
    await sendAll(room3, 'm4', 5);
    await expectDelivery('a peer that reloaded (same peerId, counter back at 0) is heard again and hears the others', { receivers: room3, senders: room3, type: 'm4', n: 5 });
    // a relay replays ciphertexts of B's previous session
    for (const wire of oldBwires) {
      await b1.inject(room.topic, wire);
      await b2.inject(room.topic, wire);
    }
    await sleep(SETTLE_MS);
    const [a, c, b] = await Promise.all([A.count('m1'), C.count('m1'), B.count('m1')]);
    check(
      'replayed ciphertexts of the previous session are not delivered again to peers that remember it',
      oldBwires.length === 5 && a === 10 && c === 10,
      `replayed=${oldBwires.length} A.m1=${a} C.m1=${c}`,
    );
    check('...and a peer never accepts replays of its own old messages (ignored by peerId)', b === 0, `B.m1=${b}`);
  }

  // ---- a broken broker entry must not hurt the others ----
  {
    const ctxD = await browser.newContext();
    const pageD = await Peer.openPage(ctxD, 'D');
    const D = new Peer(pageD, 'main', 'peer-D');
    const refused = 'ws://127.0.0.1:9'; // nothing listens there
    const invalid = 'ws://127.0.0.1:99999/mqtt'; // not a valid URL: mqtt.connect() throws synchronously
    const st = await D.start({ secret: SECRET, brokers: [refused, b1.url, invalid, b1.url] });
    check('duplicate broker entries are collapsed', st.brokers.length === 3, st.brokers.map((b) => b.url).join(' '));
    check('a refused and an invalid broker URL do not prevent the working one', await waitFor(() => allHave([D], '010'), 10_000), JSON.stringify(await D.status()));
    await sendAll([A, D], 'm5', 5);
    await expectDelivery('a peer on one broker only still exchanges with peers on both', { receivers: [A, B, C, D], senders: [A, D], type: 'm5', n: 5 });
    await D.close();
    await ctxD.close();
  }

  // ---- createNet() failures ----
  {
    const ctxE = await browser.newContext();
    const pageE = await Peer.openPage(ctxE, 'E');
    const tryStart = (cfg) => pageE.evaluate((c) => window.T.startExpectingError(c), cfg);
    const errors = {
      emptySecret: await tryStart({ secret: '', peerId: 'e', brokers: ['local:'] }),
      noPeerId: await tryStart({ secret: 's', peerId: '', brokers: ['local:'] }),
      badScheme: await tryStart({ secret: 's', peerId: 'e', brokers: ['https://example.com'] }),
      emptyBrokers: await tryStart({ secret: 's', peerId: 'e', brokers: [] }),
      missingBundle: await tryStart({ secret: 's', peerId: 'e', brokers: [b1.url], mqttUrl: '/nope/mqtt.min.js' }),
    };
    check('createNet() rejects invalid options and an unloadable MQTT.js bundle with a clear error', Object.values(errors).every((e) => typeof e === 'string'), JSON.stringify(errors));
    const E = new Peer(pageE, 'main', 'peer-E');
    await E.start({ secret: SECRET, brokers: BROKERS, mqttUrl: '/vendor/mqtt.min.js' });
    check('...and a later createNet() with a correct mqttUrl works on the same page', await waitFor(() => allHave([E], '11'), 10_000));
    await E.close();
    await ctxE.close();
  }

  // ---- close() ----
  {
    const clientsBefore = [b1.clientCount(), b2.clientCount()];
    const publishedBefore = b1.published.length;
    await pageA.evaluate(() => window.T.byeAndClose('main'));
    await waitFor(async () => (await B.count('bye')) === 1 && (await C.count('bye')) === 1, 5000);
    await sleep(SETTLE_MS);
    const [bBye, cBye, bAfter, cAfter] = await Promise.all([B.count('bye'), C.count('bye'), B.count('after-close'), C.count('after-close')]);
    check('a message sent right before close() is still flushed (exactly once)', bBye === 1 && cBye === 1, `B=${bBye} C=${cBye}`);
    const stA = await A.status();
    await A.send('after-close', {});
    await A.burst('after-close', 10);
    await sleep(SETTLE_MS);
    check(
      'after close(): send() is a silent no-op, status() is disconnected, nothing reaches the brokers',
      bAfter === 0 && cAfter === 0 && (await B.count('after-close')) === 0 && stA.connected === false && flags(stA) === '00' && b1.published.length === publishedBefore + 1,
      `published delta=${b1.published.length - publishedBefore}`,
    );
    check(
      'after close(): both broker connections of that peer are gone',
      await waitFor(() => b1.clientCount() === clientsBefore[0] - 1 && b2.clientCount() === clientsBefore[1] - 1, 5000),
      `b1 ${clientsBefore[0]}->${b1.clientCount()}, b2 ${clientsBefore[1]}->${b2.clientCount()}`,
    );
    const statusEventsBefore = (await A.statusLog()).length;
    await b1.inject(room.topic, await seal(room.key, { i: 'ghost', q: 42 * 2 ** 21, y: 'late', d: {} }));
    await sleep(300);
    check('after close(): no further onMessage / onStatus callbacks', (await A.count('late')) === 0 && (await A.statusLog()).length === statusEventsBefore);
    check('close() is idempotent', (await pageA.evaluate(async () => { await window.T.close('main'); await window.T.close('main'); return true; })) === true);
  }

  for (const c of Object.values(ctx)) await c.close();
}

async function localTests() {
  section("local: BroadcastChannel transport, pages of ONE browser context");
  const SECRET = 'local-secret-' + Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  const context = await browser.newContext();
  const pages = [];
  for (const label of ['L1', 'L2', 'L3', 'L4']) pages.push(await Peer.openPage(context, label));
  const [L1, L2, L3] = [0, 1, 2].map((i) => new Peer(pages[i], 'main', `peer-L${i + 1}`));
  const LX = new Peer(pages[3], 'main', 'peer-LX');
  const room3 = [L1, L2, L3];

  const initial = await Promise.all([...room3.map((p) => p.start({ secret: SECRET, brokers: ['local:'] })), LX.start({ secret: SECRET + 'x', brokers: ['local:'] })]);
  check(
    'local: connected as soon as createNet() resolves, without loading MQTT.js',
    initial.every((s) => s.connected && s.brokers.length === 1 && s.brokers[0].url === 'local:' && s.brokers[0].connected) &&
      (await pages[0].evaluate(() => typeof window.mqtt)) === 'undefined',
    JSON.stringify(initial[0]),
  );

  await sendAll([...room3, LX], 'm1', 5);
  await expectDelivery('local: each page receives every other page\'s messages exactly once, in order; no own echo', { receivers: room3, senders: room3, type: 'm1', n: 5 });
  check(
    'local: a page with a different secret receives nothing, and the room receives nothing from it',
    (await LX.count()) === 0 && (await Promise.all(room3.map((p) => p.messages()))).every((log) => log.every((m) => m.from !== 'peer-LX')),
  );

  // wire format on the channel: listen with a raw BroadcastChannel from a 5th page
  {
    const spy = await Peer.openPage(context, 'spy');
    const room = await deriveRoom(SECRET);
    await spy.evaluate((topic) => {
      window.__spy = [];
      const ch = new BroadcastChannel(topic);
      ch.onmessage = (e) => window.__spy.push({ ctor: e.data && e.data.constructor.name, bytes: Array.from(e.data) });
      window.__spyChannel = ch;
    }, room.topic);
    await L1.send('spy-probe', { hello: 'world' });
    await waitFor(() => spy.evaluate(() => window.__spy.length >= 1), 5000);
    const seen = await spy.evaluate(() => window.__spy);
    const env = seen.length ? await unseal(room.key, Buffer.from(seen[0].bytes)).catch(() => null) : null;
    check(
      'local: the channel is named after the derived topic and carries the same encrypted wire format',
      seen.length === 1 && seen[0].ctor === 'Uint8Array' && env && env.i === 'peer-L1' && env.y === 'spy-probe' && env.d.hello === 'world' && JSON.stringify(Object.keys(env).sort()) === '["d","i","q","y"]',
      JSON.stringify(env),
    );
    // garbage and a replay injected straight into the channel
    await spy.evaluate((bytes) => {
      const ch = window.__spyChannel;
      ch.postMessage(new Uint8Array(bytes)); // replay of L1's message
      ch.postMessage(new Uint8Array(40)); // garbage
      ch.postMessage('a string');
      ch.postMessage({ not: 'bytes' });
      ch.postMessage(new Uint8Array(20000)); // too big
    }, seen[0] ? seen[0].bytes : []);
    await L1.send('spy-probe', { hello: 'again' });
    await waitFor(async () => (await L2.count('spy-probe')) >= 2, 5000);
    await sleep(SETTLE_MS);
    check('local: replayed and garbage channel messages are ignored', (await L2.count('spy-probe')) === 2 && (await L3.count('spy-probe')) === 2 && (await L1.count('spy-probe')) === 0, `L2=${await L2.count('spy-probe')}`);
    await spy.close();
  }

  {
    const t = Date.now();
    await sendAll(room3, 'burst', 300);
    await expectDelivery('local: burst of 3 x 300 messages arrives exactly once and in order per sender', { receivers: room3, senders: room3, type: 'burst', n: 300 });
    info(`burst settled in ${Date.now() - t - SETTLE_MS} ms`);
  }

  // two nets inside one page talk to each other, too
  {
    const L1b = new Peer(pages[0], 'second', 'peer-L1b');
    await L1b.start({ secret: SECRET, brokers: ['local:'] });
    await sendAll([L1, L1b], 'same-page', 3);
    await expectDelivery('local: two nets in the same page reach each other and the other pages', { receivers: [L1, L1b, L2], senders: [L1, L1b], type: 'same-page', n: 3 });
    await L1b.close();
  }

  // reload = peer restart
  {
    await pages[1].reload();
    await pages[1].waitForFunction(() => window.__ready === true);
    await L2.start({ secret: SECRET, brokers: ['local:'] });
    await sendAll(room3, 'm2', 5);
    await expectDelivery('local: a page that reloaded (same peerId, counter back at 0) is heard again', { receivers: room3, senders: room3, type: 'm2', n: 5 });
  }

  // BroadcastChannel does not cross browser contexts (profiles)
  {
    const other = await browser.newContext();
    const page = await Peer.openPage(other, 'other-context');
    const O = new Peer(page, 'main', 'peer-O');
    await O.start({ secret: SECRET, brokers: ['local:'] });
    await sendAll([L1, O], 'cross', 3);
    await sleep(SETTLE_MS);
    check('local: does not reach a different browser context (profile) - by design, same-profile only', (await O.count()) === 0 && (await L2.count('cross')) === 3 && (await L2.messages('cross')).every((m) => m.from === 'peer-L1'));
    await other.close();
  }

  // local + both MQTT brokers at once: three paths, still exactly once
  {
    const mixed = ['local:', b1.url, b2.url];
    const M = [];
    for (let i = 0; i < 3; i++) {
      const page = await Peer.openPage(context, `M${i + 1}`);
      const p = new Peer(page, 'main', `peer-M${i + 1}`);
      await p.start({ secret: SECRET + '-mixed', brokers: mixed, mqttUrl: '/vendor/mqtt.min.js' });
      M.push(p);
    }
    check('mixed local + 2 brokers: all three transports connected', await waitFor(() => allHave(M, '111'), 10_000));
    await sendAll(M, 'mixed', 100);
    await expectDelivery('mixed local + 2 brokers: 3 x 100 messages over three paths arrive exactly once, in order', { receivers: M, senders: M, type: 'mixed', n: 100 });
    for (const p of M) await p.close();
  }

  // close
  {
    await pages[0].evaluate(() => window.T.byeAndClose('main'));
    await waitFor(async () => (await L2.count('bye')) === 1 && (await L3.count('bye')) === 1, 5000);
    await sleep(SETTLE_MS);
    const st = await L1.status();
    await L1.burst('after-close', 5);
    await L2.send('to-closed', { k: 0 });
    await sleep(SETTLE_MS);
    check(
      'local: message sent right before close() is flushed; afterwards send() is a no-op, status is disconnected, nothing is received',
      (await L2.count('bye')) === 1 && (await L3.count('bye')) === 1 && (await L2.count('after-close')) === 0 && st.connected === false && (await L1.count('to-closed')) === 0 && (await L3.count('to-closed')) === 1,
      `bye@L2=${await L2.count('bye')} status=${JSON.stringify(st)}`,
    );
  }
  await context.close();
}

async function signTests() {
  section('sign.js: ECDSA P-256 in Chromium on http://127.0.0.1');
  const context = await browser.newContext();
  const page = await Peer.openPage(context, 'sign');
  const r = await page.evaluate(async () => {
    const out = { secureContext: window.isSecureContext };
    const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const alg = { name: 'ECDSA', namedCurve: 'P-256' };
    const sigAlg = { name: 'ECDSA', hash: 'SHA-256' };
    const data = new TextEncoder().encode('hello, 영화관');

    // --- raw WebCrypto round trips, no helper module involved ---
    const pair = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
    const sig = await crypto.subtle.sign(sigAlg, pair.privateKey, data);
    out.sigBytes = sig.byteLength;
    out.verifyDirect = await crypto.subtle.verify(sigAlg, pair.publicKey, sig, data);
    const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
    out.rawBytes = raw.byteLength;
    out.rawFirstByte = new Uint8Array(raw)[0];
    const rawB64 = b64u(raw);
    out.rawB64Length = rawB64.length;
    const pub2 = await crypto.subtle.importKey('raw', unb64u(rawB64), alg, true, ['verify']);
    out.verifyWithReimportedPublic = await crypto.subtle.verify(sigAlg, pub2, sig, data);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    out.jwkKeys = Object.keys(jwk).sort();
    out.jwkMeta = { kty: jwk.kty, crv: jwk.crv, ext: jwk.ext, key_ops: jwk.key_ops };
    const jwkJson = JSON.stringify(jwk);
    out.jwkJsonLength = jwkJson.length;
    const priv2 = await crypto.subtle.importKey('jwk', JSON.parse(jwkJson), alg, false, ['sign']);
    const sig2 = await crypto.subtle.sign(sigAlg, priv2, data);
    out.verifySigFromReimportedPrivate = await crypto.subtle.verify(sigAlg, pair.publicKey, sig2, data);
    out.signaturesAreRandomised = b64u(sig) !== b64u(sig2);
    out.jwkXYMatchRaw = b64u(new Uint8Array(raw).slice(1, 33)) === jwk.x && b64u(new Uint8Array(raw).slice(33, 65)) === jwk.y;
    const tampered = new Uint8Array(data);
    tampered[0] ^= 1;
    out.tamperedDataRejected = !(await crypto.subtle.verify(sigAlg, pair.publicKey, sig, tampered));
    // pitfall probe: a JWK with key_ops:["sign"] cannot be imported for another usage
    out.importJwkWrongUsage = await crypto.subtle.importKey('jwk', JSON.parse(jwkJson), alg, false, ['verify']).then(() => 'ok', (e) => `${e.name}`);

    // --- helper module ---
    const S = await import('/sign.js');
    const host = await S.generateHostKey();
    out.helperPublicKey = host.publicKey;
    out.helperJwkKeys = Object.keys(host.privateJwk).sort();
    const stored = JSON.parse(JSON.stringify(host.privateJwk)); // as it would come back from localStorage
    const text = 'room=abc;host=peer-1;t=1700000000;제목=영화';
    const s1 = await S.signText(stored, text);
    out.helperSig = s1;
    out.helperVerify = await S.verifyText(host.publicKey, text, s1);
    out.helperTamperedText = await S.verifyText(host.publicKey, text + '!', s1);
    out.helperTamperedOneChar = await S.verifyText(host.publicKey, text.replace('peer-1', 'peer-2'), s1);
    const flipped = s1.slice(0, 10) + (s1[10] === 'A' ? 'B' : 'A') + s1.slice(11);
    out.helperTamperedSig = await S.verifyText(host.publicKey, text, flipped);
    const other = await S.generateHostKey();
    out.helperWrongKey = await S.verifyText(other.publicKey, text, s1);
    out.helperGarbage = [
      await S.verifyText('', text, s1),
      await S.verifyText('not base64 !!', text, s1),
      await S.verifyText(host.publicKey, text, ''),
      await S.verifyText(host.publicKey, text, 'AAAA'),
      await S.verifyText(host.publicKey.slice(0, -4), text, s1),
      await S.verifyText(S.toBase64Url(new Uint8Array(65).fill(4)), text, s1), // not a curve point
      await S.verifyText(undefined, text, s1),
      await S.verifyText(host.publicKey, 42, s1),
      await S.verifyText(host.publicKey, text, null),
    ];
    out.helperPublicFromJwk = S.publicKeyFromJwk(stored) === host.publicKey;
    out.helperEmptyText = await S.verifyText(host.publicKey, '', await S.signText(stored, ''));
    // interop: helper signature verifies with raw WebCrypto and vice versa
    const pubRaw = await crypto.subtle.importKey('raw', unb64u(host.publicKey), alg, false, ['verify']);
    out.helperSigVerifiesRaw = await crypto.subtle.verify(sigAlg, pubRaw, unb64u(s1), new TextEncoder().encode(text));
    out.rawSigVerifiesHelper = await S.verifyText(rawB64, 'hello, 영화관', b64u(sig));
    // signText must also accept a "bare" JWK and a JWK carrying foreign metadata
    const { kty, crv, x, y, d } = stored;
    out.helperBareJwk = await S.verifyText(host.publicKey, 't', await S.signText({ kty, crv, x, y, d }, 't'));
    out.helperJwkWithOddMeta = await S.verifyText(host.publicKey, 't', await S.signText({ ...stored, key_ops: ['verify'], ext: false, alg: 'whatever' }, 't'));
    out.signTextRejectsPublicOnly = await S.signText({ kty, crv, x, y }, 't').then(() => 'resolved', (e) => e.name);
    out.b64RoundTrip = Array.from(S.fromBase64Url(S.toBase64Url(new Uint8Array([0, 255, 254, 62, 63, 1])))).join(',');
    return out;
  });

  check('page is a secure context (crypto.subtle available on http://127.0.0.1)', r.secureContext === true);
  check('ECDSA P-256 generateKey / sign / verify', r.verifyDirect === true && r.sigBytes === 64 && r.tamperedDataRejected === true, `signature=${r.sigBytes} bytes (r||s)`);
  check(
    "public key: exportKey('raw') = 65 bytes (0x04||X||Y) -> base64url (87 chars) -> importKey('raw') verifies",
    r.rawBytes === 65 && r.rawFirstByte === 4 && r.rawB64Length === 87 && r.verifyWithReimportedPublic === true,
    `raw=${r.rawBytes} bytes, b64url=${r.rawB64Length} chars`,
  );
  check(
    "private key: exportKey('jwk') -> JSON -> importKey('jwk') signs, original public key verifies",
    r.verifySigFromReimportedPrivate === true && r.jwkXYMatchRaw === true,
    `jwk keys=${r.jwkKeys.join(',')} meta=${JSON.stringify(r.jwkMeta)} json=${r.jwkJsonLength} chars; wrong-usage import -> ${r.importJwkWrongUsage}; randomised=${r.signaturesAreRandomised}`,
  );
  check(
    'sign.js: generateHostKey() -> signText() -> verifyText() round trip (private JWK through JSON)',
    r.helperVerify === true && /^[A-Za-z0-9_-]{87}$/.test(r.helperPublicKey) && /^[A-Za-z0-9_-]{86}$/.test(r.helperSig) && r.helperEmptyText === true,
    `publicKey=${r.helperPublicKey.slice(0, 12)}... sig=${r.helperSig.slice(0, 12)}...`,
  );
  check(
    'sign.js: tampered message, tampered signature and wrong key all fail',
    r.helperTamperedText === false && r.helperTamperedOneChar === false && r.helperTamperedSig === false && r.helperWrongKey === false,
  );
  check('sign.js: verifyText() returns false (never throws) for malformed input', r.helperGarbage.every((v) => v === false), JSON.stringify(r.helperGarbage));
  check(
    'sign.js: interoperates with raw WebCrypto both ways; publicKeyFromJwk() matches; base64url round trip',
    r.helperSigVerifiesRaw === true && r.rawSigVerifiesHelper === true && r.helperPublicFromJwk === true && r.b64RoundTrip === '0,255,254,62,63,1',
  );
  check(
    'sign.js: signText() accepts a bare {kty,crv,x,y,d} JWK and one with stray metadata; rejects a JWK without d',
    r.helperBareJwk === true && r.helperJwkWithOddMeta === true && r.signTextRejectsPublicOnly !== 'resolved',
    `no-d -> ${r.signTextRejectsPublicOnly}`,
  );
  await context.close();
}

/** A TCP listener that slams every connection shut and records when it happened. */
async function startRefuser(port) {
  const attempts = [];
  const server = net.createServer((socket) => {
    attempts.push(Date.now());
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { attempts, stop: () => new Promise((r) => server.close(r)) };
}

async function reconnectTests() {
  section("reconnect back-off and the 'online' nudge (deterministic: a fake listener records every attempt)");
  const context = await browser.newContext();
  const page = await Peer.openPage(context, 'K');
  const K = new Peer(page, 'main', 'peer-K');
  let bk = await startBroker('bk');
  await K.start({ secret: 'kick', brokers: [bk.url], mqttUrl: '/vendor/mqtt.min.js' });
  await waitFor(() => allHave([K], '1'));
  await bk.kill();
  const tKill = Date.now();
  const refuser = await startRefuser(bk.port);
  // attempts happen after ~[0.5,1) s, then [1,2) s, then [2,4) s; the 4th would follow [4,8) s after the 3rd
  const got3 = await waitFor(() => refuser.attempts.length >= 3, 12_000, 20);
  const gaps = refuser.attempts.map((t, i) => t - (i ? refuser.attempts[i - 1] : tKill));
  check(
    'reconnect delays grow exponentially with jitter: [0.5,1) s, [1,2) s, [2,4) s',
    got3 && gaps[0] >= 450 && gaps[0] < 1200 && gaps[1] >= 950 && gaps[1] < 2300 && gaps[2] >= 1900 && gaps[2] < 4400,
    `gaps=${gaps.join(', ')} ms`,
  );
  const t3 = refuser.attempts[2];
  await refuser.stop();
  bk = await startBroker('bk', bk.port);
  // 1) a nudge right after a failed attempt is ignored (anti-hammering gap of 2 s)
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(Math.max(0, t3 + 1500 - Date.now()));
  const early = flags(await K.status());
  // 2) a nudge after the gap reconnects at once; the back-off timer could not fire before t3 + 4000
  await sleep(Math.max(0, t3 + 2100 - Date.now()));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const ok = await waitFor(() => allHave([K], '1'), Math.max(0, t3 + 3600 - Date.now()), 20);
  check(
    "'online' event reconnects immediately instead of waiting for the back-off timer (but not within 2 s of the last attempt)",
    ok && early === '0',
    `connected ${Date.now() - t3} ms after the last failed attempt; timer was due at >= 4000 ms; state 1.5 s after it: ${early}`,
  );
  await K.close();
  await context.close();
  await bk.kill();
}

async function soakTests() {
  section('soak (NET_TEST_SOAK=1): connect timeout, keepalive, hung broker');
  const context = await browser.newContext();

  // S1: a "broker" that accepts TCP but never answers the WebSocket handshake
  {
    const accepted = [];
    const held = new Set();
    const blackhole = net.createServer((socket) => {
      accepted.push(Date.now());
      held.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => held.delete(socket));
    });
    await new Promise((r) => blackhole.listen(0, '127.0.0.1', r));
    const page = await Peer.openPage(context, 'S1');
    const S1 = new Peer(page, 'main', 'peer-S1');
    const t0 = Date.now();
    await S1.start({ secret: 'soak', brokers: [`ws://127.0.0.1:${blackhole.address().port}`], mqttUrl: '/vendor/mqtt.min.js' });
    const retried = await waitFor(() => accepted.length >= 2, 20_000, 100);
    check(
      'a broker that accepts TCP but never answers is abandoned after the 10 s connect timeout and retried',
      retried && accepted[1] - accepted[0] >= 10_000 && accepted[1] - accepted[0] < 12_500 && (await S1.status()).connected === false,
      `second attempt ${accepted[1] - accepted[0]} ms after the first (${Date.now() - t0} ms total)`,
    );
    await S1.close();
    for (const socket of held) socket.destroy();
    await new Promise((r) => blackhole.close(r));
  }

  // S2: idle connections stay up thanks to keepalive pings
  const pages = [await Peer.openPage(context, 'S2a'), await Peer.openPage(context, 'S2b')];
  const P = pages.map((page, i) => new Peer(page, 'main', `peer-S2${'ab'[i]}`));
  for (const p of P) await p.start({ secret: 'soak-idle', brokers: [b1.url, b2.url], mqttUrl: '/vendor/mqtt.min.js' });
  await waitFor(() => allHave(P, '11'));
  // S2b: the same idle period for a page whose CSP forbids blob: workers (MQTT.js' default keepalive timer)
  const bq = await startBroker('bq');
  const cspContext = await browser.newContext();
  const pageQ = await Peer.openPage(cspContext, 'CSP', '/csp/test-page.html');
  const Q = new Peer(pageQ, 'main', 'peer-Q');
  await Q.start({ secret: 'soak-csp', brokers: [bq.url] });
  await waitFor(() => allHave([Q], '1'));
  {
    const pingsBefore = [b1.pingCount(), b2.pingCount()];
    const eventsBefore = (await P[0].statusLog()).length;
    await sleep(75_000);
    const qLog = await Q.statusLog();
    check(
      'strict CSP without worker-src blob: -> falls back to native timers: keepalive pings still sent, connection does not flap',
      bq.pingCount() >= 2 && qLog.length === 1 && flags(await Q.status()) === '1' && consoleNoise.some((l) => /^CSP: .*Content Security Policy/.test(l)),
      `PINGREQs=${bq.pingCount()} status events=${qLog.map(flags).join(',')}`,
    );
    await Q.close();
    await cspContext.close();
    await bq.kill();
    const pings = [b1.pingCount() - pingsBefore[0], b2.pingCount() - pingsBefore[1]];
    check(
      'idle for 75 s: no disconnects, each connection sent keepalive PINGREQs (30 s keepalive)',
      (await P[0].statusLog()).length === eventsBefore && (await allHave(P, '11')) && pings[0] >= 4 && pings[1] >= 4,
      `PINGREQs seen: b1=${pings[0]} b2=${pings[1]} from 2 clients each`,
    );
    await sendAll(P, 'after-idle', 3);
    await expectDelivery('after the idle period messages still flow exactly once', { receivers: P, senders: P, type: 'after-idle', n: 3 });
  }

  // S3: a broker that hangs (connection stays open, nothing is answered any more)
  {
    const eventsBefore = (await P[0].statusLog()).length;
    b1.freeze();
    const t0 = Date.now();
    const detected = await waitFor(async () => (await P[0].statusLog()).slice(eventsBefore).some((s) => flags(s) === '01'), 60_000, 250);
    const tDetected = Date.now() - t0;
    const recovered = await waitFor(() => allHave(P, '11'), 20_000);
    check(
      'a hung broker is detected by the keepalive timeout (<= 45 s) and replaced by a fresh connection',
      detected && recovered && tDetected <= 50_000,
      `detected after ${tDetected} ms, reconnected after ${Date.now() - t0} ms`,
    );
    await sendAll(P, 'after-hang', 3);
    await expectDelivery('after the hang messages flow exactly once again', { receivers: P, senders: P, type: 'after-hang', n: 3 });
  }
  for (const p of P) await p.close();

  // S4: rapid flapping - brokers die and come back every second while three peers keep talking
  {
    const pages = [];
    for (let i = 0; i < 3; i++) pages.push(await Peer.openPage(context, `S4${'abc'[i]}`));
    const room3 = pages.map((page, i) => new Peer(page, 'main', `peer-S4${'abc'[i]}`));
    for (const p of room3) await p.start({ secret: 'soak-chaos', brokers: [b1.url, b2.url], mqttUrl: '/vendor/mqtt.min.js' });
    await waitFor(() => allHave(room3, '11'));
    const N = 300;
    const streams = Promise.all(room3.map((p) => p.stream('chaos', N, 40))); // 12 s of traffic
    for (let round = 0; round < 3; round++) {
      await sleep(1000);
      await b1.kill();
      await sleep(1000);
      b1 = await startBroker('b1', b1.port);
      await sleep(1000);
      await b2.kill();
      await sleep(1000);
      b2 = await startBroker('b2', b2.port);
    }
    await streams;
    // back-off has grown by now; nudge the pages like a browser coming back online would
    const back = await waitFor(async () => {
      if (await allHave(room3, '11')) return true;
      await Promise.all(room3.map((p) => p.page.evaluate(() => window.dispatchEvent(new Event('online')))));
      return false;
    }, 30_000, 500);
    await sleep(SETTLE_MS);
    const problems = [];
    let received = 0;
    let lateCount = 0;
    for (const r of room3) {
      const bySender = new Map();
      for (const m of await r.messages('chaos')) bySender.set(m.from, [...(bySender.get(m.from) || []), m]);
      for (const [from, list] of bySender) {
        const ks = list.map((m) => m.data.k);
        received += ks.length;
        if (new Set(ks).size !== ks.length) problems.push(`${r.id}<-${from}: ${ks.length - new Set(ks).size} duplicates`);
        let top = -1;
        for (const m of list) {
          const overtaken = m.data.k < top;
          if (overtaken !== m.late) problems.push(`${r.id}<-${from}: k=${m.data.k} after ${top} but late=${m.late}`);
          if (m.late) lateCount++;
          top = Math.max(top, m.data.k);
        }
        if (from === r.id) problems.push(`${r.id} received its own messages`);
      }
    }
    check(
      'rapid flapping (6 broker kills/restarts in 12 s, 3 x 300 messages): never a duplicate, never out of order without info.late',
      back && problems.length === 0 && received > 0,
      problems.slice(0, 3).join('; ') || `${received}/${6 * N} delivered (the rest was sent while a peer had no broker - back-off), ${lateCount} late`,
    );
    await sendAll(room3, 'm-after-chaos', 5);
    await expectDelivery('after the flapping: exactly once, in order again', { receivers: room3, senders: room3, type: 'm-after-chaos', n: 5 });
    for (const p of room3) await p.close();
  }
  await context.close();
}

async function publicBrokerSmokeTest() {
  section('public brokers (NET_TEST_PUBLIC=1): informational, never fails the run');
  const context = await browser.newContext();
  const pages = [await Peer.openPage(context, 'P1'), await Peer.openPage(await browser.newContext(), 'P2')];
  const P = pages.map((page, i) => new Peer(page, 'main', `peer-P${i + 1}`));
  const secret = 'public-smoke-' + Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  for (const p of P) await p.start({ secret, mqttUrl: '/vendor/mqtt.min.js' }); // brokers: DEFAULT_BROKERS
  await sleep(12_000);
  for (const p of P) info(`${p.id}: ${(await p.status()).brokers.map((b) => `${b.url} ${b.connected ? 'CONNECTED' : 'unreachable'}`).join(' | ')}`);
  await sendAll(P, 'pub', 5);
  await sleep(3000);
  info(`delivered: P1 got ${await P[0].count('pub')}/5, P2 got ${await P[1].count('pub')}/5`);
  for (const p of P) await p.close();
}

let crashed = null;
try {
  await mqttTests();
  await localTests();
  await signTests();
  await reconnectTests();
  if (process.env.NET_TEST_SOAK) await soakTests();
  if (process.env.NET_TEST_PUBLIC) await publicBrokerSmokeTest();
  section('global');
  check('no uncaught exception in any page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  const unexpectedNoise = consoleNoise.filter((line) => !/WebSocket connection to|ERR_CONNECTION_REFUSED|\[net\] |^E: Failed to load resource|^CSP: .*Content Security Policy/.test(line));
  check('no unexpected console warnings/errors (failed WebSocket connections and [net] warnings are expected)', unexpectedNoise.length === 0, unexpectedNoise.slice(0, 3).join(' | '));
  info(`expected console noise: ${consoleNoise.length - unexpectedNoise.length} lines, e.g. ${JSON.stringify((consoleNoise.find((l) => /\[net\]/.test(l)) || consoleNoise[0] || '').slice(0, 160))}`);
} catch (err) {
  crashed = err;
  console.error('\nTEST RUN CRASHED:', err);
} finally {
  await browser.close().catch(() => {});
  await Promise.all([b1.kill().catch(() => {}), b2.kill().catch(() => {})]);
  web.closeAllConnections();
  web.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED:` : ''}`);
for (const f of failed) console.log(`  FAIL  ${f.name}`);
console.log(crashed || failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(crashed || failed.length ? 1 : 0);
