// 뽀드득 2단계 서버: 여럿이 함께 걷는 눈밭.
//
// 모두가 같은 눈밭 하나(Durable Object "Field" 하나)에 웹소켓으로 이어진다.
//   · 펭귄의 자리와 하는 일을 1초에 몇 번씩 보내면, 다른 펭귄들에게 그대로 전해 준다.
//   · 발자국, 눈 천사, 배 썰매 자국을 보내면 저장해 두었다가, 새로 들어오는 펭귄에게 지난 자국을 함께 보내 준다
//     (눈밭의 규칙대로 6시간이 지난 자국은 지운다. 폭설에 덮이는 것은 화면에서 저마다 계산한다).
// 이름은 정해진 낱말 목록에서 만든 것만, 상태는 번호만 받는다 (아무 글이나 다른 사람 화면에 뜨지 않게).
import { ADJ, NOUN } from '../../poddk/js/names.js';

const MAX_PEERS = 60;                 // 한 눈밭에 함께 있을 수 있는 펭귄 수
const MARK_LIFE = 6 * 3600e3;         // 자국을 들고 있는 시간
const SEND_ON_JOIN = 4000;            // 들어올 때 보내 주는 지난 자국의 최대 수
const FIELD_R = 112, DEN = { x: 2000, z: 2000, step: 80, r: 7 };      // 펭귄이 있을 수 있는 곳: 들판, 그리고 이글루 셋의 방
const LOOKS = ['scarf', 'blanket'], COLORS = 8, ACTIONS = 7, STATUSES = 15, SEATS = 6, IGLOOS = 3;
const MAX_MSG = 4096, MAX_RATE = 12;  // 한 번에 받는 글의 크기, 1초에 받는 글의 수

const isName = (s) => typeof s === 'string' && s.length <= 24 && ADJ.some((a) => s.startsWith(a + ' ') && NOUN.includes(s.slice(a.length + 1)));
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const r2 = (v) => Math.round(v * 100) / 100;
/** 그 자리가 펭귄이 있을 수 있는 곳인가 (들판 안이거나 이글루 방 안) */
function where(x, z) {
  if (Math.hypot(x, z) <= FIELD_R) return true;
  for (let i = 0; i < IGLOOS; i++) if (Math.hypot(x - (DEN.x + i * DEN.step), z - DEN.z) <= DEN.r) return true;
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/') return new Response('poddk: 여럿이 함께 걷는 눈밭', { headers: { 'content-type': 'text/plain; charset=utf-8', ...cors } });
    if (url.pathname === '/count') {                                 // 지금 몇 마리가 걷고 있는지 (처음 화면용)
      const r = await env.FIELD.get(env.FIELD.idFromName('field')).fetch('https://field/count');
      return new Response(await r.text(), { headers: { 'content-type': 'application/json', ...cors } });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('웹소켓으로 이어 주세요', { status: 426 });
      return env.FIELD.get(env.FIELD.idFromName('field')).fetch(request);
    }
    return new Response('없는 곳이에요', { status: 404 });
  },
};

export class Field {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS marks (kind INTEGER, x REAL, z REAL, yaw REAL, side INTEGER, birth INTEGER, owner TEXT)');      // owner: 남긴 기기 (그 기기에는 다시 보내지 않는다. 다른 펭귄에게는 보이지 않는다)
    this.sql.exec('CREATE INDEX IF NOT EXISTS marks_birth ON marks (birth)');
    this.inserts = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/count') return new Response(JSON.stringify({ peers: this.ctx.getWebSockets().length }));
    const name = url.searchParams.get('name'), look = url.searchParams.get('look'), color = Number(url.searchParams.get('color')), device = url.searchParams.get('d') || '';
    if (!isName(name) || !LOOKS.includes(look) || !int(color, 0, COLORS - 1) || !/^[a-f0-9]{12}$/.test(device)) return new Response('이름이나 모습이 맞지 않아요', { status: 400 });
    if (this.ctx.getWebSockets().length >= MAX_PEERS) return new Response('눈밭이 꽉 찼어요', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name, look, color, device, s: null, at: 0, n: 0 });
    // 들어오자마자: 내 번호, 지금 있는 펭귄들, 지난 자국
    const now = Date.now();
    const peers = this.ctx.getWebSockets().filter((w) => w !== server).map((w) => w.deserializeAttachment()).filter(Boolean).map(({ id, name, look, color, s }) => ({ id, name, look, color, s }));
    const marks = this.sql.exec('SELECT kind, x, z, yaw, side, birth FROM marks WHERE birth > ? AND owner <> ? ORDER BY birth DESC LIMIT ?', now - MARK_LIFE, device, SEND_ON_JOIN).toArray().map((m) => [m.kind, m.x, m.z, m.yaw, m.side, m.birth]);
    server.send(JSON.stringify({ t: 'hello', id, now, peers, marks }));
    this.broadcast({ t: 'join', id, name, look, color }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const w of this.ctx.getWebSockets()) if (w !== except) { try { w.send(text); } catch { /* 이미 닫혔다 */ } }
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    const me = ws.deserializeAttachment();
    if (!me) return;
    // 너무 자주 보내면 그냥 흘려보낸다
    const now = Date.now();
    if (now - me.at > 1000) { me.at = now; me.n = 0; }
    if (++me.n > MAX_RATE) { ws.serializeAttachment(me); return; }
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 's') {
      // 지금의 모습: 자리, 방향, 걷는 정도, 하는 일, 이글루 안(-1 이면 밖), 앉은 방석, 고른 상태
      const s = { x: m.x, z: m.z, yaw: m.yaw, w: m.w, a: m.a, i: m.i, k: m.k, st: m.st };
      if (!num(s.x, -3000, 3000) || !num(s.z, -3000, 3000) || !where(s.x, s.z) || !num(s.yaw, -100, 100) || !num(s.w, 0, 1) || !int(s.a, 0, ACTIONS - 1) || !int(s.i, -1, IGLOOS - 1) || !int(s.k, -1, SEATS - 1) || !int(s.st, -1, STATUSES - 1)) return;
      s.x = r2(s.x); s.z = r2(s.z); s.yaw = r2(s.yaw); s.w = r2(s.w);
      me.s = s;
      ws.serializeAttachment(me);
      this.broadcast({ t: 's', id: me.id, s }, ws);
      return;
    }
    if (m.t === 'm' && Array.isArray(m.l) && m.l.length <= 24) {
      // 남긴 자국들: [종류(0 발자국, 1 눈 천사, 2 배 썰매), x, z, 방향, 발(±1)]. 찍힌 시각은 서버의 시각으로 적는다
      const out = [];
      for (const q of m.l) {
        if (!Array.isArray(q) || q.length !== 5) continue;
        const [kind, x, z, yaw, side] = q;
        if (!int(kind, 0, 2) || !num(x, -FIELD_R, FIELD_R) || !num(z, -FIELD_R, FIELD_R) || Math.hypot(x, z) > FIELD_R || !num(yaw, -100, 100) || !(side === 1 || side === -1)) continue;
        const row = [kind, r2(x), r2(z), r2(yaw), side, now];
        this.sql.exec('INSERT INTO marks (kind, x, z, yaw, side, birth, owner) VALUES (?, ?, ?, ?, ?, ?, ?)', ...row, me.device);
        out.push(row);
      }
      ws.serializeAttachment(me);
      if (!out.length) return;
      this.broadcast({ t: 'm', id: me.id, l: out }, ws);
      if ((this.inserts += out.length) > 500) { this.inserts = 0; this.sql.exec('DELETE FROM marks WHERE birth < ?', now - MARK_LIFE); }
      return;
    }
    ws.serializeAttachment(me);
  }

  async webSocketClose(ws) { this.leave(ws); }
  async webSocketError(ws) { this.leave(ws); }
  leave(ws) {
    const me = ws.deserializeAttachment();
    try { ws.close(1000, 'bye'); } catch { /* 이미 닫혔다 */ }
    if (me) this.broadcast({ t: 'bye', id: me.id }, ws);
  }
}
