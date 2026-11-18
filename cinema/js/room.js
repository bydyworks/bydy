// 방(= 약속 한 건의 영화관): 누가 와 있는지, 어디 앉았는지, 상영 시각이 어떻게 바뀌었는지.
//
// 서버가 없다. 모든 참가자가 자기 상태를 주기적으로 방송하고(3초마다 + 바뀔 때마다),
// 받은 쪽은 "마지막으로 들은 상태"를 그대로 믿는다. 메시지는 사라지거나 늦게 올 수 있으므로
// 어떤 메시지도 "꼭 한 번 도착한다"고 가정하지 않는다 — 상태는 통째로 다시 보내면 복구된다.
import { createNet, DEFAULT_BROKERS } from './net.js';
import { signText, verifyText } from './sign.js';
import { createClock } from './clock.js';
import { emitter, store, cleanText, isInt, clamp, sleep } from './util.js';
import { normalizeAvatar, normalizeName } from './me.js';
import { isVideoId } from './link.js';

export const SEAT_ROWS = 4;
export const SEAT_COLS = 6;
export const SEAT_COUNT = SEAT_ROWS * SEAT_COLS;
// 이 영화관은 조용하다. 자유 채팅 대신 이모지와 정해진 한마디만 주고받는다.
// (서버가 없어 신고·차단을 할 수 없으니, 링크가 새도 안전한 방식만 쓴다)
export const EMOTES = ['🙇', '😂', '😢', '😱', '👏', '❤️', '🤫'];      // 0번은 "꾸벅 인사"
export const PHRASES = ['왔어?', '여기야', '팝콘 살게', '곧 시작해', '들어가자', '잠깐만', 'ㅋㅋㅋ', '소름', '대박', '재밌다', '무서워', '화장실'];
export const LOBBY_PHRASES = [0, 1, 2, 3, 4, 5];
export const HALL_PHRASES = [6, 7, 8, 9, 10, 11];
export const POPCORN_FULL = 20;               // 한 통에 들어 있는 팝콘 알 수
export const POPCORN_KINDS = 3;
export const DRINK_KINDS = 3;
export const LOBBY = { w: 390, h: 560, minX: 22, maxX: 368, minY: 234, maxY: 524 };  // 걸어다닐 수 있는 바닥 (art.js 의 LOBBY_ANCHORS.walk)

const HEARTBEAT_MS = 3000;
const PEER_TIMEOUT_MS = 12000;                // 소식이 끊긴 사람을 지우기까지
const AWAY_TIMEOUT_MS = 5 * 60000;            // "잠깐 자리 비움"을 알리고 나간 사람은 자리를 5분 맡아 둔다
const PING_MS = 20000;
const MAX_PEERS = 60;
export const PAUSE_MAX_MS = 10 * 60000;       // 쉬는 시간은 길어도 10분 — 영사기사가 사라져도 영화는 이어진다
const MAX_UNKNOWN_SEC = 6 * 3600;             // 길이를 모르는 영상은 6시간이 지나면 끝난 것으로 본다
const MAX_MSGS_PER_SEC = 40;                  // 한 사람이 1초에 보낼 수 있는 메시지
// 보내는 사람 ID는 얼마든지 지어낼 수 있으니, 사람별 한도만으로는 도배를 막지 못한다. 방 전체 한도도 둔다.
const MAX_TOTAL_PER_SEC = 300;                // 1초에 처리할 전체 메시지
const MAX_ADMIT_PER_SEC = 60;                 // 1초에 새로 맞아들일 사람 (꽉 찬 방에 들어와도 한 번에 다 보이도록 정원만큼)
const MAX_ACTS_PER_SEC = 30;                  // 1초에 그릴 이모지·한마디·팝콘
const MAX_SEEN = 100;                         // 엔딩 크레딧에 올릴 이름 수
const SETTLE_MS = 1500;                       // 막 연결된 뒤 남들 소식을 기다리는 시간
const SETTLE_CAP_MS = 4000;                   // 연결이 안 되면 이만큼만 기다리고 혼자라도 시작한다
const SEAT_BACKDATE_MS = 10000;               // 뒤늦게 들은 자리 주장은 최대 이만큼만 과거로 쳐 준다
const GONE_MS = PEER_TIMEOUT_MS - HEARTBEAT_MS * 1.2;   // 내 소식이 이만큼 끊겼으면 남들이 나를 지웠을 수 있다
const DROPPED_KEEP_MS = 120000;               // 내가 지운 사람을 기억해 두는 시간

/**
 * @typedef {Object} PeerState  남들에게 보이는 내 상태 (전선 위에서도 이 짧은 키 그대로)
 * @property {string} n   닉네임
 * @property {number[]} a 아바타 [hair, hairColor, outfit, skin]
 * @property {string} u   기기 ID (같은 사람이 탭 두 개로 들어왔는지 판별)
 * @property {number} j   입장 시각 (방 시계)
 * @property {'lobby'|'hall'} sc  지금 있는 곳
 * @property {number} x   로비에서 걸어가는 목적지 x (0..390)
 * @property {number} y   로비에서 걸어가는 목적지 y (0..560)
 * @property {number} s   앉은 좌석 번호 (0..23), 서 있으면 -1
 * @property {number} sa  그 좌석을 잡은 시각 (방 시계) — 동시에 잡으면 먼저 잡은 사람이 이긴다
 * @property {number} p   팝콘 종류 (0..2), 없으면 -1
 * @property {number} pl  팝콘 남은 양 (0..POPCORN_FULL)
 * @property {number} pe  오늘 먹은 팝콘 알 수 (기념 티켓과 엔딩 크레딧에 적힌다)
 * @property {number} dk  음료 종류 (0..2), 없으면 -1
 * @property {number} tk  검표(표 받기)를 마쳤으면 1
 * @property {number} aw  잠깐 자리 비움이면 1
 * @property {number} v   상태 번호. 보낼 때마다 커진다 — 늦게 도착한 옛 상태가 새 상태를 덮어쓰지 못하게 한다
 */

/** @typedef {{ id: string, st: PeerState, seenAt: number, isSelf?: boolean }} Peer */

/**
 * @typedef {Object} Ctl  영사실 상태. 초대 링크의 값에서 시작해, 영사기사(호스트)만 바꿀 수 있다.
 * @property {number} rev        몇 번째 변경인지 (0 = 링크 그대로)
 * @property {number} at         상영 시작 시각 (방 시계, epoch ms)
 * @property {number|null} pause 쉬는 시간이면 멈춘 위치(ms), 아니면 null
 * @property {string} vid
 * @property {number} dur        초 (모르면 0)
 * @property {string} title
 */

function normalizeState(s) {
  if (!s || typeof s !== 'object') return null;
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  return {
    n: normalizeName(s.n),
    a: normalizeAvatar(s.a),
    u: typeof s.u === 'string' ? s.u.slice(0, 24) : '',
    j: num(s.j),
    sc: s.sc === 'hall' ? 'hall' : 'lobby',
    x: clamp(num(s.x, 195), 0, LOBBY.w),
    y: clamp(num(s.y, 400), 0, LOBBY.h),
    s: isInt(s.s, 0, SEAT_COUNT - 1) ? s.s : -1,
    sa: num(s.sa),
    p: isInt(s.p, 0, POPCORN_KINDS - 1) ? s.p : -1,
    pl: isInt(s.pl, 0, POPCORN_FULL) ? s.pl : 0,
    pe: isInt(s.pe, 0, 99999) ? s.pe : 0,
    dk: isInt(s.dk, 0, DRINK_KINDS - 1) ? s.dk : -1,
    tk: s.tk ? 1 : 0,
    aw: s.aw ? 1 : 0,
    v: num(s.v),
  };
}

// 서명 대상 문자열. 방 ID를 넣어 다른 방의 서명을 가져다 쓰지 못하게 한다.
const ctlText = (room, c) => `dsy1|ctl|${room}|${c.r}|${c.t}|${c.p == null ? '' : c.p}|${c.v}|${c.d}|${c.n}`;

function validCtlPacket(c) {
  return c && typeof c === 'object'
    && isInt(c.r, 1, 1e9)
    && Number.isFinite(c.t) && c.t > 1.5e12 && c.t < 4.2e12
    && (c.p === null || (Number.isFinite(c.p) && c.p >= 0 && c.p < 1.8e8))
    && isVideoId(c.v)
    && isInt(c.d, 0, 172800)
    && typeof c.n === 'string' && c.n.length <= 200
    && typeof c.g === 'string' && c.g.length <= 200;
}

const packetToCtl = (c) => ({ rev: c.r, at: c.t, pause: c.p, vid: c.v, dur: c.d, title: cleanText(c.n, 60) || '제목 없는 상영' });

/**
 * 방에 들어간다.
 * @param {{ scr: import('./link.js').Screening, me: import('./me.js').Me, brokers?: string[], start?: Partial<PeerState>, wanted?: () => boolean }} opts
 *   wanted: 문이 열리기를 기다리는 사이 사용자가 마음을 바꿨으면(뒤로 가기 등) false 를 돌려준다 — 그러면 들어가지 않고 code:'cancelled' 로 던진다.
 */
export async function joinRoom({ scr, me, brokers, start, wanted }) {
  const ev = emitter();
  const clock = createClock();
  const selfId = me.tab;
  /** @type {Map<string, Peer>} */
  const peers = new Map();
  /** 상영관에 있었던 사람들 (엔딩 크레딧용): id → 닉네임 */
  const seenInHall = new Map();
  let closed = false;

  /** @type {PeerState} */
  const self = {
    n: me.name, a: me.av.slice(), u: me.device, j: 0,
    sc: 'lobby', x: 195, y: 470, s: -1, sa: 0, p: -1, pl: 0, pe: 0, dk: -1, tk: 0, aw: 0, v: 0,
    ...(normalizeState({ ...(start || {}), n: me.name, a: me.av, u: me.device }) || {}),
    // 입장 시각은 연결하기 전에 정해 둔다 (같은 기기의 옛 탭과 "누가 나중에 왔나"를 비교하므로)
    j: clock.now(), aw: 0,
  };
  // 예전에 앉았던 자리는 일단 내려놓고 들어간다. 남들 소식을 들은 뒤에도 비어 있을 때만 다시 앉는다
  // (그 사이 앉은 사람이 우선 — 기기 시계가 틀려도 뺏지 않도록 시각 비교에 기대지 않는다).
  const wantSeat = self.s;
  let heldSeat = wantSeat;            // 되찾으려고 기다리는 자리 (기다림이 끝나면 -1)
  self.s = -1; self.sa = 0;
  if (wantSeat >= 0) self.sc = 'hall';
  const joinedPerf = performance.now();
  let settleUntil = joinedPerf + SETTLE_CAP_MS;
  const settleMs = () => Math.max(0, settleUntil - performance.now());
  // 창을 닫는 중(pagehide)에는 아무것도 보내지 않는다. 뒤로-앞으로 캐시에서 되살아나면 다시 푼다.
  let gone = false;
  let beatTimer = 0;
  const timers = [];

  // ---------- 영사실 상태 ----------
  /** @type {Ctl} */
  let ctl = { rev: 0, at: scr.at, pause: null, vid: scr.vid, dur: scr.dur, title: scr.title };
  let ctlPacket = null;
  const hostRec = store.get('host.' + scr.room);
  const hostJwk = scr.hk && hostRec && hostRec.jwk ? hostRec.jwk : null;
  const verifying = new Set();

  async function offerCtl(pkt) {
    if (!scr.hk || !validCtlPacket(pkt) || pkt.r <= ctl.rev) return;
    const key = pkt.r + '|' + pkt.g;
    if (verifying.has(key)) return;
    verifying.add(key);
    try {
      const ok = await verifyText(scr.hk, ctlText(scr.room, pkt), pkt.g);
      if (!ok || closed || pkt.r <= ctl.rev) return;
      ctl = packetToCtl(pkt);
      ctlPacket = { r: pkt.r, t: pkt.t, p: pkt.p, v: pkt.v, d: pkt.d, n: pkt.n, g: pkt.g };
      store.set('ctl.' + scr.room, ctlPacket);
      ev.emit('ctl', ctl);
    } catch { /* 서명 확인 실패는 무시 */ } finally {
      verifying.delete(key);
    }
  }

  let ctlChain = Promise.resolve();
  /** 영사기사만: 상영 시각/쉬는 시간 등을 바꾼다. @param {Partial<Ctl>} patch */
  function setCtl(patch) {
    if (!hostJwk) return Promise.resolve(false);
    ctlChain = ctlChain.then(async () => {
      if (closed) return false;
      const next = { ...ctl, ...patch, rev: ctl.rev + 1 };
      const pkt = { r: next.rev, t: Math.round(next.at), p: next.pause == null ? null : Math.round(next.pause), v: next.vid, d: next.dur || 0, n: next.title };
      pkt.g = await signText(hostJwk, ctlText(scr.room, pkt));
      ctl = packetToCtl(pkt);
      ctlPacket = pkt;
      store.set('ctl.' + scr.room, pkt);
      ev.emit('ctl', ctl);
      send('ct', { c: pkt });
      return true;
    }).catch((e) => { console.error('[ctl]', e); return false; });
    return ctlChain;
  }

  // 지난번에 들었던 변경(예: 상영 시각을 미룸)을 기억해 둔다 — 혼자 다시 들어와도 유지되도록.
  await offerCtl(store.get('ctl.' + scr.room));

  // ---------- 좌석 ----------
  /** 소식이 끊기거나 작별하고 나가서 내가 지운 사람: id → 지운 시각(방 시계) */
  const dropped = new Map();
  const everyone = () => [{ id: selfId, st: self, seenAt: 0, isSelf: true }, ...peers.values()];

  // 자리를 잡은 시각. 남의 것은 "내가 처음 들은 때"를 감안한 값(peer.sa)을 쓴다 — noteSeat 참고.
  const claimAt = (p) => (p.isSelf || p.sa == null ? p.st.sa : p.sa);

  /** 그 좌석의 주인 (먼저 잡은 사람, 같으면 ID가 앞선 사람). 없으면 null */
  function seatOwner(idx) {
    let best = null;
    for (const p of everyone()) {
      if (p.st.s !== idx || p.st.sc !== 'hall') continue;
      if (!best || claimAt(p) < claimAt(best) || (claimAt(p) === claimAt(best) && p.id < best.id)) best = p;
    }
    return best;
  }

  /**
   * 남의 자리 주장이 새로 생기거나 바뀌었을 때 호출한다.
   * 한참 앉아 있던 사람이, 뒤늦게 나타난 "내가 훨씬 먼저 앉았다"는 주장에 밀려나지 않게
   * 주장 시각을 "처음 들은 때보다 조금 전"까지만 인정한다. (막 들어와 소식을 모으는 동안은 보낸 그대로 믿는다)
   */
  function noteSeat(peer, prev) {
    const st = peer.st;
    if (st.s < 0) { peer.sa = null; return; }
    if (prev && prev.s === st.s && prev.sa === st.sa) return;
    // 내가 지웠던 사람이 "지워지기 전의 주장"을 그대로 들고 돌아왔다 (연결이 조용히 멎었다 풀리면 밀린 옛 소식이 먼저 쏟아진다).
    // 그 사이 앉은 사람이 우선이므로 조금도 과거로 쳐 주지 않는다.
    const goneAt = prev ? undefined : dropped.get(peer.id);
    if (goneAt !== undefined && st.sa < goneAt) { peer.sa = clock.now(); return; }
    peer.sa = settleMs() > 0 ? st.sa : Math.max(st.sa, clock.now() - SEAT_BACKDATE_MS);
  }

  function resolveMySeat() {
    if (self.s < 0 || self.sc !== 'hall') return;
    const owner = seatOwner(self.s);
    if (owner && owner.id !== selfId) {
      const lost = self.s;
      update({ s: -1, sa: 0 });
      ev.emit('seat:lost', lost);
    }
  }

  // ---------- 보내기 ----------
  /** @type {Awaited<ReturnType<typeof createNet>> | null} */
  let net = null;
  // 연결 객체가 만들어지기 전에 도착한 메시지에 답하려다 터지지 않게 감싼다.
  const send = (type, data) => { if (net && !gone) net.send(type, data); };
  let stateTimer = 0;
  function sendStateNow() {
    clearTimeout(stateTimer); stateTimer = 0;
    if (closed || gone) return;
    self.v = Math.max(self.v + 1, Date.now());
    send('st', { s: self, c: ctlPacket });
  }
  function sendStateSoon(delay = 80) {
    if (stateTimer || closed) return;
    stateTimer = setTimeout(sendStateNow, delay);
  }

  /** 내 상태를 바꾸고 방송한다. @param {Partial<PeerState>} patch */
  function update(patch) {
    Object.assign(self, patch);
    if (self.sc === 'hall') seen(selfId, self.n);
    ev.emit('self', self);
    sendStateSoon();
  }

  /** 순간적인 행동(이모지, 말풍선, 팝콘 한 입)을 알린다. 내 화면에도 같은 경로로 그려진다. */
  function act(type, data = {}) {
    if (closed || gone) return;
    send(type, data);
    ev.emit('act', selfId, type, data);
  }

  // ---------- 받기 ----------
  const rate = new Map();
  function rateOk(from) {
    const sec = Math.floor(performance.now() / 1000);
    let r = rate.get(from);
    if (!r || r.sec !== sec) { r = { sec, n: 0 }; rate.set(from, r); }
    return ++r.n <= MAX_MSGS_PER_SEC;
  }
  /** 1초에 limit 번까지만 true 를 돌려주는 계수기 */
  function budget(limit) {
    let sec = -1, n = 0;
    return () => {
      const now = Math.floor(performance.now() / 1000);
      if (now !== sec) { sec = now; n = 0; }
      return ++n <= limit;
    };
  }
  const totalOk = budget(MAX_TOTAL_PER_SEC);
  const admitOk = budget(MAX_ADMIT_PER_SEC);
  const actOk = budget(MAX_ACTS_PER_SEC);

  /** 상영관에 있었던 사람으로 적어 둔다 (끝없이 늘지 않게 상한을 둔다) */
  function seen(id, name) {
    if (seenInHall.has(id) || seenInHall.size < MAX_SEEN) seenInHall.set(id, name);
  }

  // 이모지·한마디 도배 방지 (보내는 쪽 화면을 고쳐 써도 받는 쪽에서 걸러진다)
  const lastAct = new Map();
  function notTooOften(from, kind, gapMs) {
    const key = from + kind, now = performance.now();
    if (now - (lastAct.get(key) || -Infinity) < gapMs) return false;
    lastAct.set(key, now);
    return true;
  }

  function removePeer(id, why) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    if (why === 'timeout' || why === 'bye') dropped.set(id, clock.now());
    clock.dropPeer(id);
    rate.delete(id);
    for (const kind of ['em', 'sy', 'ea']) lastAct.delete(id + kind);
    ev.emit('peer:leave', peer, why);
  }

  function handleState(from, d) {
    const st = normalizeState(d && d.s);
    if (!st) return;
    if (d.c) offerCtl(d.c);
    // 내 기기 ID를 단 소식은 이 기기의 다른 탭(곧 스스로 물러난다)이거나 흉내 낸 것이다. 어느 쪽이든 사람으로 세지 않는다.
    // 전선으로 온 기기 ID는 누구나 지어낼 수 있으므로, 이 값만 보고 내가 방에서 나가는 일은 절대 없다 (watchTabs 참고).
    if (st.u && st.u === self.u) return;
    let peer = peers.get(from);
    if (!peer) {
      if (peers.size >= MAX_PEERS || !admitOk()) return;
      peer = { id: from, st, seenAt: performance.now(), sa: null };
      peers.set(from, peer);
      noteSeat(peer, null);
      dropped.delete(from);
      if (st.sc === 'hall') seen(from, st.n);
      ev.emit('peer:join', peer);
      pingSoon();
    } else {
      peer.seenAt = performance.now();
      if (st.v < peer.st.v) return;            // 늦게 도착한 옛 상태
      const prev = peer.st;
      peer.st = st;
      noteSeat(peer, prev);
      if (st.sc === 'hall') seen(from, st.n);
      ev.emit('peer:update', peer, prev);
    }
    if (st.u) {
      // 앱을 껐다 다시 들어온 사람: 꺼진 옛 창이 "자리 비움" 유령으로 5분 동안 남아 자기 자리를 막지 않게 치운다.
      // (자리 비움 표시가 없는, 지금 보고 있는 사람은 이 규칙으로 지워지지 않는다 — 기기 ID 를 흉내 내도 남을 쫓아낼 수 없다)
      for (const other of Array.from(peers.values())) {
        if (other.id !== from && other.st.aw && other.st.u === st.u && other.st.j <= st.j) removePeer(other.id, 'replaced');
      }
    }
    resolveMySeat();
  }

  function onMessage(from, type, d) {
    if (closed || typeof from !== 'string' || from === selfId) return;
    d = d && typeof d === 'object' ? d : {};
    // 남에게 가는 시계 답장은 어차피 버리는 것이라 한도에 세지 않는다. (꽉 찬 방에 한 명이 들어오면 이런 답장이 수백 통 오간다 —
    // 그걸 한도에 넣으면 그 1초 동안 다른 사람들의 이모지·인사가 버려진다)
    if (type === 'po' && d.to !== selfId) return;
    if (!totalOk() || !rateOk(from)) return;
    switch (type) {
      case 'st': handleState(from, d); break;
      case 'hi': sendStateSoon(100 + Math.random() * 500); break;
      case 'by': removePeer(from, 'bye'); break;
      case 'em': if (peers.has(from) && isInt(d.e, 0, EMOTES.length - 1) && notTooOften(from, 'em', 300) && actOk()) ev.emit('act', from, 'em', { e: d.e }); break;
      case 'sy': if (peers.has(from) && isInt(d.i, 0, PHRASES.length - 1) && notTooOften(from, 'sy', 1200) && actOk()) ev.emit('act', from, 'sy', { i: d.i }); break;
      case 'ea': if (peers.has(from) && notTooOften(from, 'ea', 300) && actOk()) ev.emit('act', from, 'ea', {}); break;
      case 'pi': if (Number.isFinite(d.t)) send('po', { to: from, t: d.t, r: clock.local(), y: clock.serverSynced ? 1 : 0 }); break;
      // 시계 맞추기는 방에 있는 사람의 답만 쓴다 (지어낸 ID 로 방 시계를 끌고 가지 못하게)
      case 'po': if (d.to === selfId && peers.has(from) && Number.isFinite(d.t) && Number.isFinite(d.r)) clock.addSample(from, d.t, d.r, clock.local(), d.y === 1); break;
      case 'ct': offerCtl(d.c); break;
      default: break;
    }
  }

  function ping() { if (!closed) send('pi', { t: clock.local() }); }
  // 새로 온 사람과 시계를 맞춰 본다. 여럿이 한꺼번에 보여도(꽉 찬 방에 막 들어왔을 때) 한 번만 묻는다 — 물음 하나에 모두가 답한다.
  let pingTimer = 0;
  function pingSoon() {
    if (!pingTimer) pingTimer = setTimeout(() => { pingTimer = 0; ping(); }, 200 + Math.random() * 400);
  }

  let netStatus = { connected: false, brokers: [] };
  let greeted = false;                // 이번 연결에서 인사(hi)와 내 상태를 보냈는지
  let everConnected = false;
  let lostAt = 0;                     // 연결이 끊긴 시각 (기기 시계)
  let hiddenAt = 0;                   // 화면이 가려진 시각 (기기 시계)

  /** 한동안 사라졌다 돌아왔으면(남들이 나를 지웠을 수 있다) 자리 주장을 지금 시각으로 새로 한다 — 그 사이 앉은 사람이 우선. */
  function restampSeat() {
    // 사라졌던 건 나다. 그동안 내가 "끊겼다"고 지운 사람들의 주장은 방금 들어온 사람처럼 보낸 그대로 믿는다.
    dropped.clear();
    for (const p of peers.values()) if (p.st.s >= 0) p.sa = p.st.sa;
    if (self.s >= 0) self.sa = clock.now();
  }

  // 연결(소켓)은 붙어 있는데 길이 조용히 막히는 일이 있다 (터널·엘리베이터, 와이파이↔LTE 전환). 끊겼다는 알림이 오지 않으니
  // "내가 보낸 소식이 중계 서버를 돌아 나오는지"로 안다: 한동안 돌아오지 않았다면 그동안 남들도 나를 듣지 못했다.
  let echoAt = 0;                     // 내 소식이 마지막으로 돌아온 시각 (기기 시계)
  function onEcho() {
    if (closed) return;
    const now = Date.now();
    const silent = echoAt && now - echoAt > GONE_MS;
    echoAt = now;
    if (!silent) return;
    restampSeat();
    resolveMySeat();                  // 그 사이 누가 앉았으면 바로 비켜 준다
    sendStateNow();
  }

  function greet() {
    greeted = true;
    send('hi', {});
    sendStateNow();
    setTimeout(ping, 300);
  }

  function onStatus(s) {
    netStatus = s;
    ev.emit('net', s);
    if (closed) return;
    if (!s.connected) {
      greeted = false;
      if (!lostAt) lostAt = Date.now();
      return;
    }
    if (!net || greeted) return;      // 연결 객체를 쥐기 전에는 보낼 수 없다 (쥔 직후 다시 불린다)
    if (!everConnected) {
      everConnected = true;
      // 이제부터 잠깐, 남들의 답(누가 어디 앉았는지·상영 시각 변경)을 기다린다
      if (performance.now() < settleUntil) settleUntil = performance.now() + SETTLE_MS;
    }
    if (lostAt && Date.now() - lostAt > PEER_TIMEOUT_MS - HEARTBEAT_MS * 1.2) restampSeat();
    lostAt = 0;
    greet();
  }

  // ---------- 같은 기기의 다른 탭 ----------
  // 같은 브라우저에서 영화관을 한 번 더 열면 나중에 연 탭만 남는다.
  // 이 판단은 같은 브라우저 안에서만 통하는 채널로 한다 — 전선으로 온 기기 ID 는 누구나 흉내 낼 수 있기 때문.
  // 다른 탭을 밀어내는 알림은 이 탭이 정말로 방에 들어온 뒤에만 보낸다 (tabsLive).
  // 문을 열다 만 탭(연결 실패, 기다리다 뒤로 가기, 닫기)이 잘 보고 있던 탭을 쫓아내면 안 된다.
  let tabs = null;
  let tabsLive = false;
  function watchTabs() {
    if (typeof BroadcastChannel !== 'function') return;   // 없으면 생략: 아바타가 둘 보일 뿐 해롭지 않다
    try {
      tabs = new BroadcastChannel('dsy.room.' + scr.room);
      tabs.onmessage = (e) => {
        const d = e.data || {};
        if (closed || typeof d.tab !== 'string' || d.tab === selfId || !Number.isFinite(d.j)) return;
        if (d.j > self.j || (d.j === self.j && d.tab > selfId)) { ev.emit('kicked', 'dup'); leave(); }
        else announceTab();           // 내가 더 나중에 왔다 → 옛 탭에게 다시 알린다
      };
    } catch { tabs = null; }
  }
  function announceTab() { try { if (tabs && tabsLive) tabs.postMessage({ tab: selfId, j: self.j }); } catch { /* 무시 */ } }
  watchTabs();                        // 채널은 일찍 연다 — 이미 들어와 있는 더 새 탭이 이 입장을 돌려보낼 수 있게

  // 기기 시계가 크게 틀리지 않았는지 확인하는 동안(최대 3초) 연결은 먼저 해 둔다.
  // 인사가 일찍 나가야, 화면이 뜨기 전에 남들의 답이 도착한다.
  const syncing = Promise.race([clock.syncWithServer(), sleep(3000)]);
  const dupError = () => Object.assign(new Error('opened in a newer tab'), { code: 'dup' });
  if (closed) throw dupError();
  let created;
  try {
    created = await createNet({
      secret: scr.room,
      peerId: selfId,
      brokers: brokers && brokers.length ? brokers : DEFAULT_BROKERS,
      onMessage,
      onStatus,
      onEcho,
    });
  } catch (e) {
    leave();                          // 탭 채널을 닫는다 — 들어오지도 못한 탭이 다른 탭을 밀어내면 안 된다
    throw e;
  }
  if (closed) { Promise.resolve(created.close()).catch(() => {}); throw dupError(); }   // 연결되는 사이에 새 탭에 밀려났다
  net = created;
  // 만들자마자 이미 연결돼 있는 경우(상태 변화 알림이 따로 오지 않는다)를 위해 현재 상태를 한 번 읽는다.
  onStatus(net.status());
  await syncing;
  if (closed) throw dupError();
  if (typeof wanted === 'function' && !wanted()) {
    leave();
    throw Object.assign(new Error('join cancelled'), { code: 'cancelled' });
  }
  tabsLive = true;
  announceTab();

  let lastEatSent = 0;

  // ---------- 주기 작업 ----------
  // 모두가 같은 박자로 보내 몰리지 않게 ±20% 흔든다
  (function beat() {
    beatTimer = setTimeout(() => { sendStateNow(); beat(); }, HEARTBEAT_MS * (0.8 + Math.random() * 0.4));
  })();
  timers.push(
    setInterval(ping, PING_MS),
    setInterval(() => {
      const now = performance.now();
      for (const p of Array.from(peers.values())) {
        const limit = p.st.aw ? AWAY_TIMEOUT_MS : PEER_TIMEOUT_MS;
        if (now - p.seenAt > limit) removePeer(p.id, 'timeout');
      }
      // 지나간 초의 도배 계수기는 버린다 (지어낸 ID 가 쌓이지 않게)
      const sec = Math.floor(now / 1000);
      for (const [id, r] of rate) if (r.sec !== sec) rate.delete(id);
      const old = clock.now() - DROPPED_KEEP_MS;
      for (const [id, at] of dropped) if (at < old) dropped.delete(id);
    }, 1000),
  );

  // 예전에 앉았던 자리: 남들 소식을 들을 만큼 기다린 뒤에도 비어 있으면 다시 앉는다.
  // (기다릴 시간은 연결되는 순간 바뀐다 — 일찍 연결되면 줄고, 늦게 연결되면 늘어난다. 그래서 한 번 재고 마는 대신 조금씩 다시 본다)
  if (wantSeat >= 0) {
    (function reclaim() {
      if (closed || self.s >= 0 || self.sc !== 'hall') { heldSeat = -1; return; }
      const wait = settleMs();
      if (wait > 0) { timers.push(setTimeout(reclaim, Math.min(wait + 30, 200))); return; }
      heldSeat = -1;
      if (!seatOwner(wantSeat)) update({ s: wantSeat, sa: clock.now() });
    })();
  }

  function onVisibility() {
    if (closed || gone) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      self.aw = 1;
      sendStateNow();
    } else {
      // 화면이 꺼져 있던 동안에는 타이머가 멈춘다. 돌아오자마자 남들을 "끊겼다"고 오해하지 않도록 시계를 다시 맞춘다.
      const now = performance.now();
      for (const p of peers.values()) p.seenAt = now;
      if (hiddenAt && Date.now() - hiddenAt > AWAY_TIMEOUT_MS - 30000) restampSeat();
      hiddenAt = 0;
      self.aw = 0;
      send('hi', {});
      sendStateNow();
      ping();
      announceTab();                  // 잠들어 있던 사이 새 탭이 열렸다면 답이 온다
      ev.emit('resume');
    }
  }
  // 창을 닫거나 다른 사이트로 가면 pagehide 다음에 visibilitychange(hidden) 가 온다.
  // 작별 인사 뒤에 "자리 비움" 상태가 따라 나가면 5분짜리 유령이 생기므로, 작별 뒤에는 입을 닫는다.
  function onPageHide() { if (!closed) { send('by', {}); gone = true; } }
  function onPageShow() {
    if (closed || !gone) return;
    gone = false;                     // 뒤로-앞으로 캐시에서 되살아났다
    self.aw = document.hidden ? 1 : 0;
    restampSeat();                    // 작별 인사를 하고 나갔으니 남들은 나를 바로 지웠다
    greeted = false;
    if (netStatus.connected) greet(); // 끊겨 있으면 다시 연결될 때 onStatus 가 인사한다
    announceTab();
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  function leave() {
    if (closed) return;
    try { send('by', {}); } catch { /* 무시 */ }
    closed = true;
    timers.forEach(clearTimeout);     // (clearTimeout 은 setInterval 로 만든 것도 지운다)
    clearTimeout(beatTimer);
    clearTimeout(stateTimer);
    clearTimeout(pingTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    try { if (tabs) tabs.close(); } catch { /* 무시 */ }
    // close() 는 방금 보낸 'by' 까지 내보낸 뒤에 연결을 닫는다
    try { if (net) Promise.resolve(net.close()).catch(() => {}); } catch { /* 무시 */ }
    ev.emit('closed');
    ev.clear();
  }

  return {
    scr,
    selfId,
    self,
    peers,
    seenInHall,
    isHost: !!hostJwk,
    clock,
    /** 방 시각 (epoch ms) */
    now: () => clock.now(),
    /** 막 들어왔을 때 남들의 상태(누가 어디 앉았는지)가 도착하기를 기다릴 시간(ms). 0이면 이미 충분히 기다렸다. */
    settleMs,
    /** 지난번에 앉았던 자리를 되찾으려고 기다리는 중이면 그 좌석 번호, 아니면 -1 */
    get heldSeat() { return heldSeat >= 0 && self.s < 0 && self.sc === 'hall' ? heldSeat : -1; },
    get ctl() { return ctl; },
    get net() { return netStatus; },
    get closed() { return closed; },
    on: ev.on,
    off: ev.off,
    everyone,
    seatOwner,
    update,
    act,
    setCtl,
    leave,

    /** 좌석에 앉기. 이미 주인이 있으면 false */
    sit(idx) {
      if (!isInt(idx, 0, SEAT_COUNT - 1)) return false;
      const owner = seatOwner(idx);
      if (owner && owner.id !== selfId) return false;
      update({ sc: 'hall', s: idx, sa: clock.now() });
      return true;
    },
    stand() { if (self.s >= 0) update({ s: -1, sa: 0 }); },

    /** 팝콘 한 알. 남은 게 없으면 false */
    eat() {
      if (self.p < 0 || self.pl <= 0) return false;
      update({ pl: self.pl - 1, pe: Math.min(99999, self.pe + 1) });
      // 내 화면엔 바로, 남들에겐 0.4초에 한 번만 알린다 (공용 중계 서버에 폐 끼치지 않게)
      const now = performance.now();
      if (now - lastEatSent > 400) { lastEatSent = now; send('ea', {}); }
      ev.emit('act', selfId, 'ea', {});
      return true;
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof joinRoom>>} Room */

/**
 * 지금 상영이 어디쯤인지. 통신과 무관한 순수 함수.
 * @param {Ctl} ctl @param {number} now 방 시각(ms) @param {number} [knownDur] 플레이어가 알려준 실제 길이(초)
 * @returns {{ phase: 'before'|'playing'|'paused'|'ended', pos: number, until: number, resumeIn?: number }}
 *   pos = 재생 위치(초), until = 시작까지 남은 ms (before 일 때만 양수), resumeIn = 쉬는 시간이 저절로 끝나기까지 ms
 */
export function showPosition(ctl, now, knownDur) {
  const dur = knownDur > 0 ? knownDur : ctl.dur;
  const elapsed = now - ctl.at;
  const ended = { phase: 'ended', pos: dur > 0 ? dur : 0, until: 0 };
  // 쉬는 시간: 영사기사가 멈출 때 at 을 "10분 뒤에 이 위치에서 이어지도록" 맞춰 둔다.
  // 그래서 영사기사가 자리를 비워도 시간이 되면(elapsed 가 멈춘 위치를 따라잡으면) 저절로 이어진다.
  if (ctl.pause != null && elapsed < ctl.pause) {
    const pos = ctl.pause / 1000;
    if (dur > 0 && pos >= dur) return ended;
    return { phase: 'paused', pos, until: 0, resumeIn: ctl.pause - elapsed };
  }
  if (elapsed < 0) return { phase: 'before', pos: 0, until: -elapsed };
  const pos = elapsed / 1000;
  if (dur > 0 ? pos >= dur : pos > MAX_UNKNOWN_SEC) return ended;
  return { phase: 'playing', pos, until: 0 };
}

/** 영사기사가 쉬는 시간을 줄 때 쓸 값: 지금 위치에서 멈추고, 최대 PAUSE_MAX_MS 뒤에 저절로 이어진다 */
export function pausePatch(ctl, now, knownDur) {
  const p = showPosition(ctl, now, knownDur);
  const posMs = Math.round(p.pos * 1000);
  return { pause: posMs, at: Math.round(now + PAUSE_MAX_MS - posMs) };
}

/** 쉬는 시간을 끝내고 (2초 앞에서부터) 이어 가기 */
export function resumePatch(ctl, now) {
  return { pause: null, at: Math.round(now - (ctl.pause || 0) + 2000) };
}

/**
 * 방에 들어가지 않고도, 지난번에 들은 영사실 변경(예: 미뤄진 상영 시각)을 서명 확인 후 돌려준다.
 * @param {import('./link.js').Screening} scr
 * @returns {Promise<Ctl>} 변경이 없거나 확인할 수 없으면 링크에 적힌 값 그대로
 */
export async function storedCtl(scr) {
  const base = { rev: 0, at: scr.at, pause: null, vid: scr.vid, dur: scr.dur, title: scr.title };
  const pkt = store.get('ctl.' + scr.room);
  if (!scr.hk || !validCtlPacket(pkt)) return base;
  try {
    return (await verifyText(scr.hk, ctlText(scr.room, pkt), pkt.g)) ? packetToCtl(pkt) : base;
  } catch { return base; }
}
