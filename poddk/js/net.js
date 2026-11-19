// 2단계: 여럿이 함께 걷는 눈밭.
// 서버(server/)와 웹소켓으로 이어져, 내 자리와 하는 일을 보내고 다른 펭귄들을 받아 그린다.
//   · 다른 펭귄: 같은 곳(들판 또는 같은 이글루 방)에 있으면 보인다. 걷고, 눈 천사를 하고, 미끄러지고, 파닥이고, 앉는 모습 그대로.
//     이글루에서 앉아 상태를 골랐으면 머리 위에 이름과 함께 말풍선이 뜬다.
//   · 다른 펭귄이 남긴 발자국·눈 천사·배 썰매 자국도 내 눈밭에 남는다 (서버가 6시간 들고 있다가 들어올 때 보내 준다).
// 서버 주소가 없거나 이어지지 않으면 혼자 걷는 눈밭 그대로다 (게임은 아무 일 없이 돌아간다).
import * as THREE from 'three';
import { build as buildPenguin, pose, setSnow, lie, belly, flap, sit, COLORS } from './penguin.js';
import { STATUSES } from './den.js';

/** 하는 일의 번호 (서버와 같은 약속) */
export const ACT = { stand: 0, angel: 1, slide: 2, flap: 3, fish: 4, sit: 5, snowman: 6 };
const SEND_EVERY = 0.2, BEAT = 2;          // 바뀌었으면 0.2초마다, 안 바뀌어도 2초마다 한 번 보낸다
const DEVICE_KEY = 'poddk.device.v1';

function deviceId() {
  try { const d = localStorage.getItem(DEVICE_KEY); if (d && /^[a-f0-9]{12}$/.test(d)) return d; } catch { /* 막혀 있다 */ }
  const d = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(DEVICE_KEY, d); } catch { /* 이번 방문 동안만 */ }
  return d;
}

/**
 * @param {{ url: string, scene: THREE.Scene, camera: THREE.Camera, tracks: object, name: () => string, look: { blanket: boolean, color: string }, onCount: (n: number) => void }} o
 */
export function createNet({ url, scene, camera, tracks, name, look, onCount = () => {} }) {
  const peers = new Map();                 // id → { root, name, s(받은 모습), x, z, yaw, phase, t(시각), bubble }
  const stats = { connected: false, sent: 0, got: 0, marksIn: 0, marksOut: 0, tries: 0 };
  let ws = null, myId = null, wait = 2, sendIn = 0, beatIn = 0, lastSent = '', outbox = [], closed = !url, time = 0;
  let mine = null;                          // 보낼 내 모습
  const device = deviceId();

  function connect() {
    if (closed) return;
    stats.tries++;
    const q = new URLSearchParams({ name: name(), look: look.blanket ? 'blanket' : 'scarf', color: String(Math.max(0, COLORS.indexOf(look.color))), d: device });
    try { ws = new WebSocket(url + (url.includes('?') ? '&' : '?') + q); } catch { retry(); return; }
    ws.onmessage = (e) => { stats.got++; let m; try { m = JSON.parse(e.data); } catch { return; } receive(m); };
    ws.onopen = () => { stats.connected = true; wait = 2; lastSent = ''; };
    ws.onclose = () => { stats.connected = false; myId = null; for (const id of [...peers.keys()]) drop(id); onCount(0); retry(); };
    ws.onerror = () => { /* onclose 에서 다시 잇는다 */ };
  }
  function retry() { if (closed) return; setTimeout(connect, wait * 1000); wait = Math.min(30, wait * 2); }

  function add(id, nm, lk, color) {
    if (peers.has(id)) return peers.get(id);
    const root = buildPenguin({ scarf: lk !== 'blanket', blanket: lk === 'blanket', color: COLORS[color] || COLORS[0] });
    root.visible = false;
    scene.add(root);
    const p = { root, name: nm, s: null, x: 0, z: 0, yaw: 0, phase: 0, walk: 0, bubble: null };
    peers.set(id, p);
    return p;
  }
  function drop(id) {
    const p = peers.get(id); if (!p) return;
    scene.remove(p.root);
    p.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    if (p.bubble) p.bubble.remove();
    peers.delete(id);
  }
  function mark([kind, x, z, yaw, side, birth]) {
    stats.marksIn++;
    if (kind === 0) tracks.addPrint(x, z, yaw, side, birth);
    else if (kind === 1) { const it = tracks.addAngel(x, z, yaw, birth); it.grow = 1; }
    else if (kind === 2) tracks.addSlide(x, z, yaw, birth);
  }
  function receive(m) {
    if (m.t === 'hello') {
      myId = m.id;
      for (const p of m.peers) { const q = add(p.id, p.name, p.look, p.color); if (p.s) { q.s = p.s; q.x = p.s.x; q.z = p.s.z; q.yaw = p.s.yaw; } }
      for (let i = m.marks.length - 1; i >= 0; i--) mark(m.marks[i]);      // (오래된 것부터)
      onCount(peers.size);
    } else if (m.t === 'join') { add(m.id, m.name, m.look, m.color); onCount(peers.size); }
    else if (m.t === 'bye') { drop(m.id); onCount(peers.size); }
    else if (m.t === 's') { const p = peers.get(m.id); if (p) { const first = !p.s; p.s = m.s; if (first) { p.x = m.s.x; p.z = m.s.z; p.yaw = m.s.yaw; } } }
    else if (m.t === 'm') for (const q of m.l) mark(q);
  }

  function send(obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); stats.sent++; } }

  const head = new THREE.Vector3();
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return {
    stats, peers, device,
    get connected() { return stats.connected && !!myId; },
    get count() { return peers.size; },
    start() { if (url) connect(); },
    /** 내 모습: { x, z, yaw, w(걷는 정도 0..1), a(ACT), i(이글루 번호, 밖이면 -1), k(방석, 없으면 -1), st(상태 번호, 없으면 -1) } */
    me(s) { mine = s; },
    /** 내가 남긴 자국 하나: kind 0 발자국, 1 눈 천사, 2 배 썰매 */
    mark(kind, x, z, yaw, side = 1) { outbox.push([kind, Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(yaw * 100) / 100, side >= 0 ? 1 : -1]); stats.marksOut++; },
    /** 한 박자: 보낼 것을 보내고, 다른 펭귄들을 움직인다. inside: 내가 있는 이글루 번호 (밖이면 -1) */
    update(dt, inside) {
      time += dt;
      sendIn -= dt; beatIn -= dt;
      if (this.connected && mine && sendIn <= 0) {
        sendIn = SEND_EVERY;
        const msg = { t: 's', x: mine.x, z: mine.z, yaw: mine.yaw, w: mine.w, a: mine.a, i: mine.i, k: mine.k, st: mine.st };
        const key = [Math.round(msg.x * 20), Math.round(msg.z * 20), Math.round(msg.yaw * 20), Math.round(msg.w * 4), msg.a, msg.i, msg.k, msg.st].join();
        if (key !== lastSent || beatIn <= 0) { lastSent = key; beatIn = BEAT; send(msg); }
      }
      if (this.connected && outbox.length) { while (outbox.length) send({ t: 'm', l: outbox.splice(0, 24) }); }
      // 다른 펭귄들
      for (const p of peers.values()) {
        const s = p.s;
        p.root.visible = !!s && s.i === inside;
        if (!p.root.visible) { if (p.bubble) p.bubble.hidden = true; continue; }
        const k = 1 - Math.exp(-dt * 8);
        const ox = p.x, oz = p.z;
        p.x += (s.x - p.x) * k; p.z += (s.z - p.z) * k;
        p.yaw += angleDiff(s.yaw, p.yaw) * k;
        if (Math.hypot(s.x - p.x, s.z - p.z) > 8) { p.x = s.x; p.z = s.z; }      // 멀리 건너뛰었으면 (이글루를 드나들었다) 바로 옮긴다
        const moved = Math.hypot(p.x - ox, p.z - oz);
        p.phase = (p.phase + moved / 1.04) % 1;
        p.walk += ((s.a === ACT.stand ? s.w : 0) - p.walk) * k;
        const r = p.root;
        r.position.set(p.x, 0, p.z); r.rotation.y = p.yaw;
        pose(r, p.phase, p.walk);
        lie(r, s.a === ACT.angel ? 1 : 0, time * 2.6);
        belly(r, s.a === ACT.slide ? 1 : 0, time * 6);
        flap(r, s.a === ACT.flap ? 1 : 0, time * 27);
        sit(r, s.a === ACT.fish || s.a === ACT.sit ? 1 : 0);
        setSnow(r, s.a === ACT.snowman ? 1 : 0, s.a === ACT.snowman ? 1 : 0);
        // 이글루에서 앉아 고른 상태: 머리 위 말풍선
        const say = s.a === ACT.sit && s.st >= 0 ? STATUSES[s.st] : null;
        if (say && !p.bubble) { p.bubble = document.createElement('div'); p.bubble.className = 'peer-say'; document.body.append(p.bubble); }
        if (p.bubble) {
          p.bubble.hidden = !say;
          if (say) {
            const text = say[0] + ' ' + say[1];
            if (p.bubble.dataset.text !== text) { p.bubble.dataset.text = text; p.bubble.textContent = text; const sm = document.createElement('small'); sm.textContent = p.name; p.bubble.append(sm); }
            head.set(p.x, 1.75, p.z).project(camera);
            const on = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
            p.bubble.hidden = !on;
            if (on) { p.bubble.style.left = ((head.x + 1) / 2 * innerWidth) + 'px'; p.bubble.style.top = ((1 - head.y) / 2 * innerHeight) + 'px'; }
          }
        }
      }
    },
    stop() { closed = true; if (ws) ws.close(); },
  };
}
