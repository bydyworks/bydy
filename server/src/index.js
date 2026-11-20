// 뽀드득 2단계 서버: 여럿이 함께 걷는 눈밭.
//
// 모두가 같은 눈밭 하나(Durable Object "Field" 하나)에 웹소켓으로 이어진다.
//   · 펭귄의 자리와 하는 일을 1초에 몇 번씩 보내면, 다른 펭귄들에게 그대로 전해 준다.
//   · 발자국, 눈 천사, 배 썰매 자국을 보내면 저장해 두었다가, 새로 들어오는 펭귄에게 지난 자국을 함께 보내 준다
//     (눈밭의 규칙대로 6시간이 지난 자국은 지운다. 폭설에 덮이는 것은 화면에서 저마다 계산한다).
// 이름은 정해진 낱말 목록에서 만든 것만, 상태는 번호만 받는다 (아무 글이나 다른 사람 화면에 뜨지 않게).
import { ADJ, NOUN } from '../../poddk/js/names.js';
import { checkWish } from './filter.js';

const MAX_PEERS = 60;                 // 한 눈밭에 함께 있을 수 있는 펭귄 수
const MARK_LIFE = 6 * 3600e3;         // 자국을 들고 있는 시간
const SEND_ON_JOIN = 4000;            // 들어올 때 보내 주는 지난 자국의 최대 수
const FIELD_R = 112, DEN = { x: 2000, z: 2000, step: 80, r: 7 };      // 펭귄이 있을 수 있는 곳: 들판, 그리고 이글루 셋의 방
const OUTFIT = [5, 8, 5];            // 패션 아이템의 수: 안경, 모자, 귀마개
const LOOKS = ['scarf', 'blanket'], COLORS = 8, ACTIONS = 9, STATUSES = 15, SEATS = 6, IGLOOS = 3;
const MAX_MSG = 8192, MAX_RATE = 12;  // 한 번에 받는 글의 크기, 1초에 받는 글의 수
const GAME_LIFE = 90e3, INVITE_GAP = 12e3;
const WISH_LEN = 30, WISHES_SHOWN = 40;          // 소원: 길이, 소원판에 붙여 보여 주는 수 (한 기기에 한 철 한 번)
const MY_SNOWMEN = 3, SNOWMEN = 40, SNOWMAN_LIFE = 6 * 3600e3, SNOWMAN_POINTS = 900, REPORTS_TO_HIDE = 2;      // 눈사람: 눈밭에 서 있는 최대 수, 녹기까지, 그림의 점 수 상한, 이만큼 신고되면 치운다
/** 한국 날짜의 번호 (하루마다 하나씩 는다) */
const kday = (ms) => Math.floor((ms + 9 * 3600e3) / 86400e3);
/** 소원의 철: 한국 시각으로 그해 (1~2월은 지난해 겨울로 친다) */
const season = (ms) => { const d = new Date(ms + 9 * 3600e3); return d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };      // 주사위 놀이: 이만큼 아무 일이 없으면 닫는다, 한 펭귄이 다시 부르려면 이만큼 기다린다

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
      // 게임은 poddk.pages.dev (와 그 미리보기 주소, 이 컴퓨터에서의 점검)에서만 이어진다
      const origin = request.headers.get('Origin');
      if (origin && !/^https:\/\/([a-z0-9-]+\.)?poddk\.pages\.dev$|^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return new Response('poddk.pages.dev 에서 놀러 와 주세요', { status: 403 });
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
    this.sql.exec('CREATE TABLE IF NOT EXISTS wishes (text TEXT, device TEXT, season INTEGER, birth INTEGER)');
    this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS wishes_once ON wishes (device, season)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS snowmen (id TEXT PRIMARY KEY, x REAL, z REAL, yaw REAL, d TEXT, device TEXT, birth INTEGER, reports TEXT DEFAULT \'\')');
    try { this.sql.exec('ALTER TABLE snowmen ADD COLUMN f TEXT'); } catch { /* 이미 있다 */ }      // 눈사람에게 씌운 아이템
    this.sql.exec('CREATE TABLE IF NOT EXISTS races (name TEXT, device TEXT, dist REAL, day INTEGER, birth INTEGER)');      // 썰매 경주 기록
    this.inserts = 0;
    this.games = new Map();         // 이글루 번호 → 주사위 놀이 { gid, host, hostName, players: Map(id → name), at }
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
    const sea = season(now);
    const wishes = this.sql.exec('SELECT text, birth FROM wishes WHERE season = ? ORDER BY birth DESC LIMIT ?', sea, WISHES_SHOWN).toArray();
    const wrote = this.sql.exec('SELECT COUNT(*) AS n FROM wishes WHERE device = ? AND season = ?', device, sea).one().n > 0;
    const snowmen = this.sql.exec('SELECT id, x, z, yaw, d, f, birth, device FROM snowmen WHERE birth > ? ORDER BY birth DESC LIMIT ?', now - SNOWMAN_LIFE, SNOWMEN).toArray().map((r) => ({ id: r.id, x: r.x, z: r.z, yaw: r.yaw, d: JSON.parse(r.d), f: r.f ? JSON.parse(r.f) : null, birth: r.birth, mine: r.device === device }));
    server.send(JSON.stringify({ t: 'hello', id, now, peers, marks, wishes, wrote, snowmen, top: this.raceTop(now) }));
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
      const s = { x: m.x, z: m.z, yaw: m.yaw, w: m.w, a: m.a, i: m.i, k: m.k, st: m.st, f: m.f === undefined ? [-1, -1, -1] : m.f, g: m.g === 1 ? 1 : 0 };      // g: 머리 위에 별 눈송이가 떠 있는가      // f: 쓰고 있는 [안경, 모자, 귀마개] (예전 게임은 보내지 않는다)
      if (!num(s.x, -3000, 3000) || !num(s.z, -3000, 3000) || !where(s.x, s.z) || !num(s.yaw, -100, 100) || !num(s.w, 0, 1) || !int(s.a, 0, ACTIONS - 1) || !int(s.i, -1, IGLOOS - 1) || !int(s.k, -1, SEATS - 1) || !int(s.st, -1, STATUSES - 1) || !(s.i < 0 ? Math.hypot(s.x, s.z) <= FIELD_R : Math.hypot(s.x - (DEN.x + s.i * DEN.step), s.z - DEN.z) <= DEN.r) || !Array.isArray(s.f) || s.f.length !== 3 || !s.f.every((v, j) => int(v, -1, OUTFIT[j] - 1))) return;
      s.x = r2(s.x); s.z = r2(s.z); s.yaw = r2(s.yaw); s.w = r2(s.w); s.f = s.f.slice();
      me.s = s;
      ws.serializeAttachment(me);
      for (const [i, g] of this.games) if (g.host === me.id && (s.i !== i || s.a !== 5)) this.endGame(i, 'host');      // 부른 펭귄이 일어나거나 방을 나가면 놀이를 닫는다
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
    if (m.t === 'g') { this.game(ws, me, m, now); ws.serializeAttachment(me); return; }
    if (m.t === 'race') {
      // 썰매 경주 기록: 0~40 걸음, 들판에 있을 때, 3초에 한 번까지. 역대 기록 셋을 모두에게 알린다
      if (me.s && me.s.i === -1 && num(m.d, 0.5, 40) && now - (me.raceAt || 0) > 3000) {
        me.raceAt = now; ws.serializeAttachment(me);
        this.sql.exec('INSERT INTO races (name, device, dist, day, birth) VALUES (?, ?, ?, ?, ?)', me.name, me.device, Math.round(m.d * 10) / 10, kday(now), now);
        this.sql.exec('DELETE FROM races WHERE rowid NOT IN (SELECT rowid FROM races ORDER BY dist DESC LIMIT 300)');      // (좋은 기록 삼백만 남긴다)
        this.broadcast({ t: 'top', top: this.raceTop(now) });
      }
      return;
    }
    if (m.t === 'wish') { ws.serializeAttachment(me); this.wish(ws, me, m, now); return; }
    if (m.t === 'sm' || m.t === 'smr' || m.t === 'smd') { ws.serializeAttachment(me); this.snowman(ws, me, m, now); return; }
    if (m.t === 'w') {
      // 인사: 누구에게 손을 흔들었는지 같은 곳의 펭귄들에게 전한다 (받은 펭귄 화면에 "○○가 나에게 인사했어요"). 2초에 한 번까지, 나 자신에게는 안 된다
      const now = Date.now();
      if (me.s && typeof m.to === 'string' && m.to.length <= 8 && m.to !== me.id && !(now - (me.waveAt || 0) < 2000)) { me.waveAt = now; this.broadcast({ t: 'w', id: me.id, to: m.to }, ws); }
      ws.serializeAttachment(me); return;
    }
    if (m.t === 'b') {
      // 눈덩이: 던진 자리와 떨어질 자리 (들판 안, 14 걸음 안), 맞힐 펭귄의 번호. 같은 곳(들판)에 있는 펭귄들에게 전한다
      const ok = me.s && me.s.i === -1 && [m.x, m.z, m.tx, m.tz].every((v) => num(v, -FIELD_R, FIELD_R)) && Math.hypot(m.x - me.s.x, m.z - me.s.z) < 3 && Math.hypot(m.tx - m.x, m.tz - m.z) <= 16 && typeof m.to === 'string' && m.to.length <= 8;
      if (ok) this.broadcast({ t: 'b', id: me.id, x: r2(m.x), z: r2(m.z), tx: r2(m.tx), tz: r2(m.tz), to: m.to }, ws);
      ws.serializeAttachment(me); return;
    }
    ws.serializeAttachment(me);
  }

  /** 역대 썰매 기록 셋 (한 기기에 가장 좋은 것 하나씩) */
  raceTop() { return this.sql.exec('SELECT name, MAX(dist) AS dist FROM races GROUP BY device ORDER BY dist DESC LIMIT 3').toArray().map((r) => ({ name: r.name, dist: r.dist })); }

  // ---------- 크리스마스 소원판 ----------
  // 짧은 소원을 익명으로 붙인다 (한 기기에 한 철 한 번). 욕·성적인 말·연락처는 받지 않는다 (filter.js)
  wish(ws, me, m, now) {
    const reply = (ok, why) => ws.send(JSON.stringify({ t: 'wished', ok, why }));
    const c = checkWish(m.text, WISH_LEN);
    if (!c.ok) { reply(false, c.why); return; }
    const sea = season(now);
    try { this.sql.exec('INSERT INTO wishes (text, device, season, birth) VALUES (?, ?, ?, ?)', c.text, me.device, sea, now); }
    catch { reply(false, 'once'); return; }      // (이번 철에 이미 썼다)
    reply(true, '');
    this.broadcast({ t: 'wish', text: c.text, birth: now });
  }

  // ---------- 눈사람 ----------
  // 눈을 굴려 만든 눈사람: 자리와 그림(획마다 [색, 굵기, 점들(0..255 짝을 base64 로)])을 받아 6시간 세워 둔다. 한 기기에 하나 (새로 세우면 앞의 것은 치운다).
  // 이상한 그림은 두 기기가 신고하면 치운다. 세운 펭귄은 스스로 허물 수 있다
  snowman(ws, me, m, now) {
    if (m.t === 'sm') {
      const ok = me.s && me.s.i === -1 && [m.x, m.z].every((v) => num(v, -FIELD_R, FIELD_R)) && Math.hypot(m.x, m.z) <= FIELD_R && Math.hypot(m.x - me.s.x, m.z - me.s.z) < 10 && num(m.yaw, -100, 100) && Array.isArray(m.d) && m.d.length <= 120;
      if (!ok) return;
      let points = 0;
      for (const st of m.d) {
        if (!Array.isArray(st) || st.length !== 3 || !int(st[0], 0, 4) || !int(st[1], 1, 3) || typeof st[2] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(st[2])) return;
        points += Math.floor(st[2].length * 3 / 4 / 2);
      }
      if (points > SNOWMAN_POINTS) return;
      const f = Array.isArray(m.f) && m.f.length === 3 && m.f.every((v, j) => int(v, -1, OUTFIT[j] - 1)) ? m.f.slice() : null;      // 씌운 아이템 [안경, 모자, 귀마개]
      const id = crypto.randomUUID().slice(0, 8), row = { id, x: r2(m.x), z: r2(m.z), yaw: r2(m.yaw), d: m.d, f, birth: now };
      const old = this.sql.exec('SELECT id FROM snowmen WHERE device = ? ORDER BY birth DESC LIMIT -1 OFFSET ?', me.device, MY_SNOWMEN - 1).toArray();      // (한 기기에 셋까지: 넷째를 세우면 가장 오래된 것부터 녹는다)
      for (const o of old) this.sql.exec('DELETE FROM snowmen WHERE id = ?', o.id);
      this.sql.exec('DELETE FROM snowmen WHERE birth < ?', now - SNOWMAN_LIFE);
      for (const o of old) this.broadcast({ t: 'smx', id: o.id });
      this.sql.exec('INSERT INTO snowmen (id, x, z, yaw, d, f, device, birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, row.x, row.z, row.yaw, JSON.stringify(m.d), f ? JSON.stringify(f) : null, me.device, now);
      const extra = this.sql.exec('SELECT id FROM snowmen ORDER BY birth DESC LIMIT -1 OFFSET ?', SNOWMEN).toArray();      // 너무 많으면 오래된 것부터
      for (const o of extra) { this.sql.exec('DELETE FROM snowmen WHERE id = ?', o.id); this.broadcast({ t: 'smx', id: o.id }); }
      ws.send(JSON.stringify({ t: 'sm', ...row, mine: true }));
      this.broadcast({ t: 'sm', ...row, mine: false }, ws);
      return;
    }
    if (typeof m.id !== 'string' || !/^[a-f0-9-]{1,8}$/.test(m.id)) return;
    const r = this.sql.exec('SELECT device, reports FROM snowmen WHERE id = ?', m.id).toArray()[0];
    if (!r) { ws.send(JSON.stringify({ t: 'smx', id: m.id })); return; }
    if (m.t === 'smd') { if (r.device !== me.device) return; }
    else {
      const who = new Set(r.reports ? r.reports.split(',') : []); who.add(me.device);
      if (who.size < REPORTS_TO_HIDE) { this.sql.exec('UPDATE snowmen SET reports = ? WHERE id = ?', [...who].join(','), m.id); return; }
    }
    this.sql.exec('DELETE FROM snowmen WHERE id = ?', m.id);
    this.broadcast({ t: 'smx', id: m.id });
  }

  // ---------- 이글루 안의 주사위 놀이 ----------
  // 방석에 앉은 펭귄이 "같이 하자"고 부르면, 같은 방에 앉아 있는 펭귄들에게만 물어본다 (원하는 펭귄만 "같이 하기").
  // 부른 펭귄이 굴리면 서버가 저마다의 주사위 눈을 정해 함께하는 펭귄들에게 알린다. 아무도 오지 않으면 조용히 끝난다.
  sockets(ids) { return this.ctx.getWebSockets().filter((w) => { const a = w.deserializeAttachment(); return a && ids.includes(a.id); }); }
  tell(ids, msg) { const text = JSON.stringify(msg); for (const w of this.sockets(ids)) { try { w.send(text); } catch { /* 이미 닫혔다 */ } } }
  seatedIn(igloo, except) { return this.ctx.getWebSockets().map((w) => w.deserializeAttachment()).filter((a) => a && a.id !== except && a.s && a.s.i === igloo && a.s.a === 5); }
  endGame(igloo, why) {
    const g = this.games.get(igloo); if (!g) return;
    this.games.delete(igloo);
    if (why) this.tell([g.host, ...g.players.keys(), ...g.asked], { t: 'g', op: 'cancel', gid: g.gid, why });
  }
  game(ws, me, m, now) {
    const igloo = me.s ? me.s.i : -1, seated = !!me.s && me.s.a === 5 && igloo >= 0;
    for (const [i, g] of this.games) if (now - g.at > GAME_LIFE) this.endGame(i, 'late');      // 오래 내버려 둔 놀이는 닫는다
    const g = igloo >= 0 ? this.games.get(igloo) : null;
    const list = (x) => [[x.host, x.hostName], ...x.players];
    if (m.op === 'invite') {
      if (!seated) return;
      if (now - (me.inv || 0) < INVITE_GAP) { ws.send(JSON.stringify({ t: 'g', op: 'wait' })); return; }
      if (g) { ws.send(JSON.stringify({ t: 'g', op: 'busy' })); return; }
      const others = this.seatedIn(igloo, me.id);
      if (!others.length) { ws.send(JSON.stringify({ t: 'g', op: 'alone' })); return; }
      me.inv = now;
      const ng = { gid: crypto.randomUUID().slice(0, 8), host: me.id, hostName: me.name, players: new Map(), asked: others.map((a) => a.id), at: now };
      this.games.set(igloo, ng);
      ws.send(JSON.stringify({ t: 'g', op: 'open', gid: ng.gid, host: me.id, players: list(ng), asked: others.length }));
      this.tell(ng.asked, { t: 'g', op: 'invite', gid: ng.gid, host: me.id, name: me.name });
      return;
    }
    const gone = () => { if (typeof m.gid === 'string' && /^[a-f0-9-]{1,8}$/.test(m.gid)) ws.send(JSON.stringify({ t: 'g', op: 'cancel', gid: m.gid, why: 'late' })); };      // 없는 놀이에 대한 말에는 "닫혔다"고 답한다 (기다리던 창이 남지 않게)
    if (!g || m.gid !== g.gid) { if (m.op !== 'leave') gone(); return; }
    if (m.op === 'join') {
      if (!seated || me.id === g.host || g.players.has(me.id) || !g.asked.includes(me.id) || g.players.size >= SEATS - 1) { gone(); return; }
      g.players.set(me.id, me.name); g.at = now;
      this.tell([g.host, ...g.players.keys()], { t: 'g', op: 'players', gid: g.gid, host: g.host, players: list(g) });
      return;
    }
    if (m.op === 'roll') {
      if (me.id !== g.host || !g.players.size) return;
      const rolls = list(g).map(([id, name]) => [id, name, 1 + (crypto.getRandomValues(new Uint8Array(1))[0] % 6)]);
      this.games.delete(igloo);
      this.tell(rolls.map((r) => r[0]), { t: 'g', op: 'result', gid: g.gid, rolls });
      const late = g.asked.filter((id) => !g.players.has(id));      // 묻기만 하고 아직 답하지 않은 펭귄의 쪽지는 거둔다
      if (late.length) this.tell(late, { t: 'g', op: 'cancel', gid: g.gid, why: 'started' });
      return;
    }
    if (m.op === 'leave') {
      if (me.id === g.host) this.endGame(igloo, 'host');
      else if (g.players.delete(me.id)) this.tell([g.host, ...g.players.keys()], { t: 'g', op: 'players', gid: g.gid, host: g.host, players: list(g) });
    }
  }

  async webSocketClose(ws) { this.leave(ws); }
  async webSocketError(ws) { this.leave(ws); }
  leave(ws) {
    const me = ws.deserializeAttachment();
    try { ws.close(1000, 'bye'); } catch { /* 이미 닫혔다 */ }
    if (me) {
      for (const [i, g] of this.games) { if (g.host === me.id) this.endGame(i, 'host'); else if (g.players.delete(me.id)) this.tell([g.host, ...g.players.keys()], { t: 'g', op: 'players', gid: g.gid, host: g.host, players: [[g.host, g.hostName], ...g.players] }); }
    }
    if (me) this.broadcast({ t: 'bye', id: me.id }, ws);
  }
}
