// 2단계: 여럿이 함께 걷는 눈밭.
// 서버(server/)와 웹소켓으로 이어져, 내 자리와 하는 일을 보내고 다른 펭귄들을 받아 그린다.
//   · 다른 펭귄: 같은 곳(들판 또는 같은 이글루 방)에 있으면 보인다. 걷고, 눈 천사를 하고, 미끄러지고, 파닥이고, 앉는 모습 그대로.
//     이글루에서 앉아 상태를 골랐으면 머리 위에 이름과 함께 말풍선이 뜬다.
//   · 다른 펭귄이 남긴 발자국·눈 천사·배 썰매 자국도 내 눈밭에 남는다 (서버가 6시간 들고 있다가 들어올 때 보내 준다).
// 서버 주소가 없거나 이어지지 않으면 혼자 걷는 눈밭 그대로다 (게임은 아무 일 없이 돌아간다).
import * as THREE from 'three';
import { build as buildPenguin, pose, setSnow, lie, belly, flap, sit, wave, COLORS, ROD_GRIP } from './penguin.js';
import { STATUSES } from './den.js';
import { ROD_LEN, ROD_TILT, SEAT as FISH_SEAT, FLOAT_Y } from './fishing.js';
import { makeStick, STUMP_SEAT_Y } from './campfire.js';
import { makeHeadStar, bobHeadStar } from './flakes.js';
import { SLOTS, wear } from './outfit.js';
import { heightAt } from './hill.js';

/** 하는 일의 번호 (서버와 같은 약속) */
export const ACT = { stand: 0, angel: 1, slide: 2, flap: 3, fish: 4, sit: 5, snowman: 6, wave: 7, roast: 8 };
const SEND_EVERY = 0.2, BEAT = 2;          // 바뀌었으면 0.2초마다, 안 바뀌어도 2초마다 한 번 보낸다
const DEVICE_KEY = 'poddk.device.v1';
const EASE = { in: 0.32, out: 0.45 };      // 자세가 바뀔 때: 새 자세로 들어가는 시간, 하던 자세에서 빠져나오는 시간(초)
/** 하는 일마다 그리는 자세. k: 0(서 있음)..1(그 자세), t: 시각 */
const POSES = {
  [ACT.angel]: (r, k, t) => lie(r, k, t * 2.6),
  [ACT.slide]: (r, k, t) => belly(r, k, t * 6),
  [ACT.flap]: (r, k, t) => flap(r, k, t * 27),
  [ACT.fish]: (r, k, t) => sit(r, k, Math.sin(t * 1.3) * 0.012),
  [ACT.sit]: (r, k) => sit(r, k),
  [ACT.roast]: (r, k, t) => sit(r, k, Math.sin(t * 1.4) * 0.012),      // 모닥불 곁에 앉아 마시멜로를 굽는다
  [ACT.wave]: (r, k, t) => wave(r, k, t * 11),
};
const NAME_SEE = 22, NAME_DIM = 10;      // 다른 펭귄의 머리 위 이름: 이만큼 안이면 늘 보이고, 이만큼보다 멀면 작고 흐리게      // 다른 펭귄에게 이만큼 다가가면 머리 위에 이름이 이만큼(초) 떴다가 사라진다. 이만큼 멀어졌다 다시 오면 또 뜬다

function deviceId() {
  try { const d = localStorage.getItem(DEVICE_KEY); if (d && /^[a-f0-9]{12}$/.test(d)) return d; } catch { /* 막혀 있다 */ }
  const d = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(DEVICE_KEY, d); } catch { /* 이번 방문 동안만 */ }
  return d;
}

/**
 * @param {{ url: string, scene: THREE.Scene, camera: THREE.Camera, tracks: object, name: () => string, look: { blanket: boolean, color: string }, onCount: (n: number) => void }} o
 */
export function createNet({ url, scene, camera, tracks, name, look, onCount = () => {}, onGame = () => {}, onBall = () => {}, onSocial = () => {}, onWave = () => {} }) {
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
    ws.onclose = () => { stats.connected = false; myId = null; for (const id of [...peers.keys()]) drop(id); onCount(0); onGame({ t: 'g', op: 'lost' }); retry(); };
    ws.onerror = () => { /* onclose 에서 다시 잇는다 */ };
  }
  function retry() { if (closed) return; setTimeout(connect, wait * 1000); wait = Math.min(30, wait * 2); }

  function add(id, nm, lk, color) {
    if (peers.has(id)) return peers.get(id);
    const root = buildPenguin({ scarf: lk !== 'blanket', blanket: lk === 'blanket', color: COLORS[color] || COLORS[0] });
    root.visible = false;
    scene.add(root);
    // 낚싯대 (낚시하는 동안에만 보인다): 쥔 날개 끝에서 앞쪽 위로, 줄은 구멍 위의 찌까지
    const rod = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.036, ROD_LEN, 8), new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.8 }));
    stick.position.y = ROD_LEN / 2; rod.add(stick);
    rod.position.copy(ROD_GRIP); rod.position.y -= 0.09; rod.rotation.set(ROD_TILT, 0, 0.1); rod.visible = false;
    root.add(rod);
    const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#4d5570', transparent: true, opacity: 0.85 })); line.frustumCulled = false; line.visible = false;
    const float = new THREE.Group();
    float.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.5 })));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.057, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d8362f', roughness: 0.5 })); float.add(cap);
    float.scale.setScalar(1.5); float.visible = false;      // (낚싯대와 찌는 멀리서도 보이게 내 것보다 조금 크게)
    scene.add(line, float);
    // 마시멜로 막대 (모닥불 곁에서 굽는 동안에만 보인다)
    const mallow = makeStick(); mallow.position.copy(ROD_GRIP); mallow.position.y -= 0.09; mallow.rotation.set(1.45, 0, 0.1); mallow.visible = false;
    mallow.userData.mallow.material.color.set('#f2c98a'); root.add(mallow);
    const star = makeHeadStar(); root.add(star);      // 머리 위의 별 눈송이 (밤에 주웠으면)
    const p = { root, name: nm, s: null, x: 0, z: 0, yaw: 0, phase: 0, walk: 0, bubble: null, act: ACT.stand, k: 0, rod, line, float, mallow, tag: null, threw: 9, wavedTo: '', wavedT: 9, star };
    peers.set(id, p);
    return p;
  }
  function drop(id) {
    const p = peers.get(id); if (!p) return;
    scene.remove(p.root, p.line, p.float);
    for (const o of [p.root, p.line, p.float]) o.traverse((x) => { if (x.isMesh || x.isLine) x.geometry.dispose(); });
    if (p.bubble) p.bubble.remove();
    if (p.tag) p.tag.remove();
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
      onSocial({ t: 'hello', wishes: m.wishes || [], wrote: !!m.wrote, snowmen: m.snowmen || [], top: m.top || [] });      // 소원판의 소원들, 눈밭의 눈사람들
    } else if (m.t === 'join') { add(m.id, m.name, m.look, m.color); onCount(peers.size); }
    else if (m.t === 'bye') { drop(m.id); onCount(peers.size); }
    else if (m.t === 's') { const p = peers.get(m.id); if (p) { const first = !p.s; p.s = m.s; if (first) { p.x = m.s.x; p.z = m.s.z; p.yaw = m.s.yaw; } } }
    else if (m.t === 'm') for (const q of m.l) mark(q);
    else if (m.t === 'g') onGame(m);
    else if (m.t === 'wish' || m.t === 'wished' || m.t === 'sm' || m.t === 'smx' || m.t === 'top') onSocial(m);
    else if (m.t === 'b') { const p = peers.get(m.id); if (p) { p.threw = 0; onBall({ ...m, name: p.name }); } }
    else if (m.t === 'w') { const p = peers.get(m.id); if (p) { p.wavedTo = m.to; p.wavedT = 0; onWave({ ...m, name: p.name, me: m.to === myId }); } }
  }

  function send(obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); stats.sent++; } }

  const head = new THREE.Vector3(), tip = new THREE.Vector3();
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return {
    stats, peers, device,
    get connected() { return stats.connected && !!myId; },
    get count() { return peers.size; },
    get id() { return myId; },
    /** 이글루 안 주사위 놀이: op 'invite'(같은 방에 앉은 펭귄들 부르기) | 'join' | 'roll' | 'leave' */
    game(op, gid) { send({ t: 'g', op, gid }); },
    /** 소원 하나를 붙인다 (서버가 'wished' 로 답한다) */
    wish(text) { send({ t: 'wish', text }); },
    /** 눈사람을 세웠다 / 이상한 그림이라 신고한다 / 내 눈사람을 허문다 */
    snowman(x, z, yaw, d, f = null) { send({ t: 'sm', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 100) / 100, d, f }); },
    snowmanReport(id) { send({ t: 'smr', id }); },
    /** 썰매 경주 기록 하나 */
    race(d) { send({ t: 'race', d: Math.round(d * 10) / 10 }); },
    snowmanRemove(id) { send({ t: 'smd', id }); },
    /** 눈덩이를 던졌다: 내 자리(x, z)에서 (tx, tz)로, to: 맞힐 펭귄의 번호 */
    /** 누구에게 손을 흔들었는지 알린다 */
    wave(to) { send({ t: 'w', to: to || '' }); },
    ball(x, z, tx, tz, to) { send({ t: 'b', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, tx: Math.round(tx * 100) / 100, tz: Math.round(tz * 100) / 100, to: to || '' }); },
    /** 이름으로 다른 펭귄 찾기 (번호 → 이름) */
    nameOf(id) { const p = peers.get(id); return p ? p.name : null; },
    start() { if (url) connect(); },
    /** 내 모습: { x, z, yaw, w(걷는 정도 0..1), a(ACT), i(이글루 번호, 밖이면 -1), k(방석, 없으면 -1), st(상태 번호, 없으면 -1), f([안경, 모자, 귀마개] 번호, 없으면 -1) } */
    me(s) { mine = s; },
    /** 내가 남긴 자국 하나: kind 0 발자국, 1 눈 천사, 2 배 썰매 */
    mark(kind, x, z, yaw, side = 1) { outbox.push([kind, Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(yaw * 100) / 100, side >= 0 ? 1 : -1]); stats.marksOut++; },
    /** 한 박자: 보낼 것을 보내고, 다른 펭귄들을 움직인다. inside: 내가 있는 이글루 번호 (밖이면 -1) */
    update(dt, inside, at = null) {
      time += dt;
      sendIn -= dt; beatIn -= dt;
      if (this.connected && mine && sendIn <= 0) {
        sendIn = SEND_EVERY;
        const msg = { t: 's', x: mine.x, z: mine.z, yaw: mine.yaw, w: mine.w, a: mine.a, i: mine.i, k: mine.k, st: mine.st, f: mine.f || [-1, -1, -1] };
        const key = [Math.round(msg.x * 20), Math.round(msg.z * 20), Math.round(msg.yaw * 20), Math.round(msg.w * 4), msg.a, msg.i, msg.k, msg.st, msg.f.join('.')].join();
        if (key !== lastSent || beatIn <= 0) { lastSent = key; beatIn = BEAT; send(msg); }
      }
      if (this.connected && outbox.length) { while (outbox.length) send({ t: 'm', l: outbox.splice(0, 24) }); }
      // 다른 펭귄들
      for (const p of peers.values()) {
        const s = p.s;
        p.root.visible = !!s && s.i === inside;
        if (!p.root.visible) { if (p.bubble) p.bubble.hidden = true; if (p.tag) p.tag.hidden = true; p.near = false; p.line.visible = p.float.visible = false; continue; }
        const k = 1 - Math.exp(-dt * 8);
        const ox = p.x, oz = p.z;
        p.x += (s.x - p.x) * k; p.z += (s.z - p.z) * k;
        p.yaw += angleDiff(s.yaw, p.yaw) * k;
        if (Math.hypot(s.x - p.x, s.z - p.z) > 8) { p.x = s.x; p.z = s.z; }      // 멀리 건너뛰었으면 (이글루를 드나들었다) 바로 옮긴다
        const moved = Math.hypot(p.x - ox, p.z - oz);
        p.phase = (p.phase + moved / 1.04) % 1;
        p.walk += ((s.a === ACT.stand ? s.w : 0) - p.walk) * k;
        const r = p.root;
        r.position.set(p.x, s.i === -1 ? heightAt(p.x, p.z) : 0, p.z); r.rotation.y = p.yaw;
        pose(r, p.phase, p.walk);
        // 자세는 한 번에 하나만 그린다 (자세마다 몸의 높이와 기울기를 저마다 정하므로, 여럿을 잇달아 부르면 나중 것이 앞의 것을 덮는다).
        // 하는 일이 바뀌면 하던 자세에서 천천히 빠져나온 다음 새 자세로 들어간다
        const want = POSES[s.a] ? s.a : ACT.stand;
        const seatFamily = (a) => a === ACT.sit || a === ACT.roast;
        if (s.i === -1 && p.act !== want && seatFamily(p.act) && seatFamily(want)) p.act = want;      // 그루터기에 앉은 채 굽기 ⇄ 먹기: 일어났다 다시 앉지 않고 바로 바꾼다
        if (p.act !== want) {
          p.k = Math.max(0, p.k - dt / EASE.out);
          if (p.k <= 0) { if (POSES[p.act]) POSES[p.act](r, 0, time); p.act = want; }
        } else if (POSES[want]) p.k = Math.min(1, p.k + dt / EASE.in);
        const ease = p.k * p.k * (3 - 2 * p.k);
        if (s.i === -1 && (p.act === ACT.sit || p.act === ACT.roast)) r.position.y += STUMP_SEAT_Y * ease;      // 들판에서 앉은 펭귄은 모닥불 그루터기 위에 앉아 있다
        if (POSES[p.act]) POSES[p.act](r, ease, time);
        // 쓰고 있는 패션 아이템 (선물에서 나온 안경·모자·귀마개)
        const f = Array.isArray(s.f) ? s.f.join('.') : '';
        if (p.wornKey !== f) { p.wornKey = f; SLOTS.forEach((slot, j) => wear(r, slot, Array.isArray(s.f) && Number.isInteger(s.f[j]) ? s.f[j] : -1)); }
        p.threw += dt;
        if (p.threw < 0.45 && p.act !== ACT.wave) wave(r, Math.sin(Math.PI * p.threw / 0.45), 1.5 - p.threw * 9);      // 눈덩이를 던지는 날갯짓
        setSnow(r, s.a === ACT.snowman ? 1 : 0, s.a === ACT.snowman ? 1 : 0);
        // 가까이 다가가면 머리 위에 이름이 잠깐 (멀어졌다 다시 오면 또). 인사하는 동안에는 👋
        const dist = at ? Math.hypot(p.x - at.x, p.z - at.z) : 0;
        p.wavedT = (p.wavedT ?? 9) + dt;
        const waving = s.a === ACT.wave, toMe = waving && p.wavedTo === myId && p.wavedT < 3;
        const tagText = dist > NAME_SEE ? '' : (waving ? '👋 ' : '') + p.name + (toMe ? ' → 나' : '');
        if (tagText && !p.tag) { p.tag = document.createElement('div'); p.tag.className = 'peer-name'; document.body.append(p.tag); }
        if (p.tag) {
          const sayOn = !!(p.bubble && !p.bubble.hidden);
          let on = !!tagText && !sayOn;
          if (on) {
            head.set(p.x, 1.95 + (s.i === -1 ? heightAt(p.x, p.z) : 0), p.z).project(camera);
            on = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
            if (on) { if (p.tag.textContent !== tagText) p.tag.textContent = tagText; p.tag.style.left = ((head.x + 1) / 2 * innerWidth) + 'px'; p.tag.style.top = ((1 - head.y) / 2 * innerHeight) + 'px'; p.tag.classList.toggle('far', !waving && dist > NAME_DIM); p.tag.classList.toggle('wave', waving); p.tag.classList.toggle('me', toMe); }
          }
          p.tag.hidden = !on;
        }
        // 낚시: 낚싯대와 줄과 찌 (펭귄은 구멍을 보고 한 걸음 반 떨어져 앉는다)
        const fishing = p.act === ACT.fish && ease > 0.5;
        p.rod.visible = p.line.visible = p.float.visible = fishing;
        if (fishing) {
          p.rod.scale.setScalar(ease);
          const fx = p.x + Math.sin(p.yaw) * FISH_SEAT, fz = p.z + Math.cos(p.yaw) * FISH_SEAT;
          p.float.position.set(fx, FLOAT_Y + Math.sin(time * 2.2) * 0.012, fz);
          r.updateMatrixWorld(true);
          tip.set(0, ROD_LEN, 0); p.rod.localToWorld(tip);
          const q = p.line.geometry.attributes.position;
          q.setXYZ(0, tip.x, tip.y, tip.z); q.setXYZ(1, fx, FLOAT_Y + 0.02, fz); q.needsUpdate = true;
        }
        p.mallow.visible = p.act === ACT.roast && ease > 0.5;
        p.star.visible = s.g === 1 && s.i === -1; if (p.star.visible) bobHeadStar(p.star, time + p.x, camera);
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
