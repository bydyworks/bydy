// 작은 동물 친구들
//   · 눈토끼: 밤에만 나와 깡총깡총 뛰어다닌다. 펭귄이 가까이 오면 깜짝 놀라 반대쪽으로 달아난다. 인사하면 멈춰 서서 코를 씰룩인다.
//   · 아기 물개: 연못마다 한 마리씩 얼음 위에서 꾸벅꾸벅 존다. 곁에서 무엇을 낚으면 깨어나 다가와서 달라고 조른다.
//     물고기면 받아먹고 신나서 박수, 엉뚱한 것이면 고개를 갸웃한다. 인사하면 지느러미로 박수를 친다.
import * as THREE from 'three';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m); o.scale.set(sx, sy, sz); return o; };
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------- 눈토끼 ----------
function rabbitMesh() {
  const g = new THREE.Group(), fur = mat('#fbfcff', { roughness: 1 }), pink = mat('#f5b8c8'), ink = mat('#17181d', { roughness: 0.4 });
  const body = new THREE.Group(); g.add(body);
  const torso = ball(0.2, fur, 1, 0.9, 1.25); torso.position.set(0, 0.2, 0); body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.34, 0.2); body.add(head);
  head.add(ball(0.13, fur, 1, 0.95, 1));
  const ears = [-1, 1].map((s) => { const e = new THREE.Group(); e.position.set(s * 0.05, 0.09, -0.02); const o = ball(0.05, fur, 0.7, 2.6, 0.5); o.position.y = 0.11; e.add(o); const i = ball(0.03, pink, 0.6, 2.2, 0.3); i.position.set(0, 0.11, 0.02); e.add(i); e.rotation.z = s * -0.15; head.add(e); return e; });
  for (const s of [-1, 1]) { const eye = ball(0.018, ink); eye.position.set(s * 0.06, 0.02, 0.1); head.add(eye); }
  const nose = ball(0.016, pink); nose.position.set(0, -0.02, 0.13); head.add(nose);
  const tail = ball(0.06, fur); tail.position.set(0, 0.22, -0.24); body.add(tail);
  for (const s of [-1, 1]) { const foot = ball(0.05, fur, 0.8, 0.5, 1.7); foot.position.set(s * 0.1, 0.03, -0.05); body.add(foot); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { body, head, ears, nose };
  return g;
}
/**
 * @param {{ addPaw: Function }} tracks  @param {(x: number, z: number) => boolean} free 뛰어갈 수 있는 자리인가
 */
export function createRabbit(scene, tracks, { free = () => true, roam = 60 } = {}) {
  const root = rabbitMesh(); root.visible = false; scene.add(root);
  const u = root.userData;
  let x = 18, z = -10, yaw = 0, hop = null, rest = 1, shown = 0, time = 0, greeted = 0, scared = 0;
  const pick = (awayFrom = null) => {
    for (let k = 0; k < 30; k++) {
      let a = Math.random() * Math.PI * 2, d = 1.4 + Math.random() * 1.6;
      if (awayFrom) { a = Math.atan2(x - awayFrom.x, z - awayFrom.z) + (Math.random() - 0.5) * 1.2; d = 2.2 + Math.random(); }
      const tx = x + Math.sin(a) * d, tz = z + Math.cos(a) * d, r = Math.hypot(tx, tz);
      if (r > 8 && r < roam && free(tx, tz)) return { tx, tz };
    }
    return { tx: x * 0.95, tz: z * 0.95 };
  };
  return {
    root,
    get pos() { return { x, z }; },
    get visible() { return shown > 0.5; },
    get scared() { return scared > 0; },
    /** 인사하면 멈춰 서서 코를 씰룩이고 귀를 쫑긋 (가까이 있었으면 true) */
    greet(me) { if (shown < 0.5 || Math.hypot(me.x - x, me.z - z) > 4) return false; greeted = 2.4; hop = null; rest = 2.6; yaw = Math.atan2(me.x - x, me.z - z); return true; },
    /** 점검용: 그 자리로 옮긴다 */
    place(px, pz) { x = px; z = pz; hop = null; rest = 0.5; },
    update(dt, night, me, now) {
      time += dt; greeted = Math.max(0, greeted - dt); scared = Math.max(0, scared - dt);
      shown += ((night ? 1 : 0) - shown) * Math.min(1, dt * 1.5);
      root.visible = shown > 0.02;
      if (!root.visible) return;
      const near = me && Math.hypot(me.x - x, me.z - z) < 3.6 && greeted <= 0;
      if (near && scared <= 0) { scared = 2.5; const p = pick(me); hop = { fx: x, fz: z, ...p, t: 0, len: 0.32 }; yaw = Math.atan2(p.tx - x, p.tz - z); }      // 깜짝: 반대쪽으로 폴짝
      if (hop) {
        hop.t += dt;
        const k = Math.min(1, hop.t / hop.len);
        x = hop.fx + (hop.tx - hop.fx) * k; z = hop.fz + (hop.tz - hop.fz) * k;
        root.position.y = Math.sin(Math.PI * k) * (scared > 0 ? 0.32 : 0.22);
        u.body.scale.set(1, 1 + Math.sin(Math.PI * k) * 0.15, 1 - Math.sin(Math.PI * k) * 0.05);
        if (k >= 1) {
          if (tracks) for (const s of [-1, 1]) tracks.addPaw(x + Math.cos(yaw) * s * 0.06, z - Math.sin(yaw) * s * 0.06, yaw, now, 6 * 60e3);      // 깡총 뛴 자리에 작은 발자국
          if (scared > 0) { const p = pick(me); hop = { fx: x, fz: z, ...p, t: 0, len: 0.3 }; yaw = Math.atan2(p.tx - x, p.tz - z); }
          else { hop = null; rest = 0.3 + Math.random() * (Math.random() < 0.2 ? 3 : 0.8); }
        }
      } else {
        root.position.y = 0; u.body.scale.set(1, 1, 1);
        rest -= dt;
        if (rest <= 0 && greeted <= 0) { const p = pick(); hop = { fx: x, fz: z, ...p, t: 0, len: 0.42 }; const want = Math.atan2(p.tx - x, p.tz - z); yaw += angleDiff(want, yaw); }
      }
      root.position.x = x; root.position.z = z; root.rotation.y = yaw; root.scale.setScalar(Math.max(0.001, shown));
      u.nose.scale.setScalar(1 + (greeted > 0 || !hop ? Math.max(0, Math.sin(time * 18)) * 0.35 : 0));      // 코 씰룩
      u.ears.forEach((e, i) => { e.rotation.x = greeted > 0 ? -0.25 + Math.sin(time * 9 + i) * 0.15 : (hop ? 0.35 : Math.sin(time * 1.3 + i) * 0.08); });
    },
  };
}

// ---------- 아기 물개 ----------
function sealMesh() {
  const g = new THREE.Group(), skin = mat('#d9dee8', { roughness: 0.6 }), spot = mat('#b5bdcc', { roughness: 0.6 }), ink = mat('#17181d', { roughness: 0.3 });
  const body = new THREE.Group(); g.add(body);
  const torso = ball(0.32, skin, 1, 0.78, 1.5); torso.position.set(0, 0.25, -0.05); body.add(torso);
  for (const [sx, sz] of [[0.18, -0.2], [-0.15, 0.1], [0.08, 0.25]]) { const s = ball(0.05, spot, 1, 0.4, 1); s.position.set(sx, 0.48, sz); body.add(s); }
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.42); body.add(head);
  head.add(ball(0.22, skin));
  const eyes = [-1, 1].map((s) => { const e = ball(0.045, ink); e.position.set(s * 0.085, 0.05, 0.18); head.add(e); const shine = ball(0.012, mat('#ffffff')); shine.position.set(s * 0.085 + 0.015, 0.07, 0.22); head.add(shine); return e; });
  const lids = eyes.map((e) => { const l = ball(0.05, skin, 1, 0.5, 1); l.position.copy(e.position); l.position.z += 0.005; l.visible = false; head.add(l); return l; });
  const snout = ball(0.07, mat('#eef1f6'), 1.3, 0.8, 0.9); snout.position.set(0, -0.04, 0.19); head.add(snout);
  const nose = ball(0.025, ink, 1.3, 0.8, 1); nose.position.set(0, -0.01, 0.26); head.add(nose);
  for (const s of [-1, 1]) for (const k of [0, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), ink); w.position.set(s * 0.1, -0.04 + k * 0.025, 0.22); w.rotation.z = s * (Math.PI / 2 - 0.15 + k * 0.25); head.add(w); }
  const flippers = [-1, 1].map((s) => { const f = new THREE.Group(); f.position.set(s * 0.25, 0.16, 0.22); const o = ball(0.1, spot, 0.45, 0.25, 1.1); o.position.set(s * 0.06, 0, 0.04); f.add(o); body.add(f); return f; });
  const tail = new THREE.Group(); tail.position.set(0, 0.12, -0.5); body.add(tail);
  for (const s of [-1, 1]) { const t = ball(0.09, spot, 0.9, 0.25, 0.6); t.position.set(s * 0.07, 0, -0.06); t.rotation.y = s * 0.5; tail.add(t); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { body, head, flippers, lids, tail };
  return g;
}
/** 연못마다 아기 물개 한 마리. ponds: [{ x, z, radius }]. say(seal, text|null): 머리 위 말풍선 */
export function createSeals(scene, ponds, { puff = () => {} } = {}) {
  const seals = ponds.map((p, i) => {
    const a = Math.atan2(p.x, p.z) + 1.9 + i * 0.4, r = p.radius - 1.2;       // 연못 가장자리 쪽 얼음 위 (트리에서 먼 쪽)
    const home = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, yaw: a + Math.PI / 2 };
    const root = sealMesh(); root.position.set(home.x, 0, home.z); root.rotation.y = home.yaw; scene.add(root);
    return { root, pond: p, home, x: home.x, z: home.z, yaw: home.yaw, state: 'sleep', t: 0, want: null, kind: null, say: null, phase: Math.random() * 6 };
  });
  let time = 0;
  const onPondIce = (s, x, z) => { const d = Math.hypot(x - s.pond.x, z - s.pond.z), lim = s.pond.radius - 0.7; return d <= lim ? { x, z } : { x: s.pond.x + (x - s.pond.x) * lim / d, z: s.pond.z + (z - s.pond.z) * lim / d }; };
  function goTo(s, x, z, then) { const c = onPondIce(s, x, z); s.want = { ...c, then }; s.state = 'waddle'; }
  return {
    seals,
    /** 무엇인가 낚았다: 그 연못의 물개가 깨어나 펭귄 곁으로 와서 조른다. kind: 낚은 것, junk: 엉뚱한 것인가 */
    caught(me, kind, junk) {
      const s = seals.find((q) => Math.hypot(q.pond.x - me.x, q.pond.z - me.z) < q.pond.radius + 3);
      if (!s) return null;
      const side = Math.atan2(me.x - s.pond.x, me.z - s.pond.z) + 0.9;
      s.kind = kind; s.junk = junk;
      goTo(s, me.x - Math.sin(side) * 1.25, me.z - Math.cos(side) * 1.25, 'beg');
      s.face = { x: me.x, z: me.z };
      return s;
    },
    /** 인사: 가까운 물개가 박수 (가까이 있었으면 그 물개) */
    greet(me) { const s = seals.find((q) => Math.hypot(q.x - me.x, q.z - me.z) < 4); if (!s) return null; if (s.state === 'sleep') { s.state = 'wake'; s.t = 0; } s.clap = 1.6; return s; },
    near(me, d = 3.2) { return seals.find((q) => Math.hypot(q.x - me.x, q.z - me.z) < d) || null; },
    update(dt) {
      time += dt;
      for (const s of seals) {
        const u = s.root.userData;
        s.t += dt; s.clap = Math.max(0, (s.clap || 0) - dt);
        let lift = 0, flip = 0;
        if (s.state === 'waddle' && s.want) {
          const dx = s.want.x - s.x, dz = s.want.z - s.z, d = Math.hypot(dx, dz);
          if (d > 0.05) { s.yaw += angleDiff(Math.atan2(dx, dz), s.yaw) * Math.min(1, dt * 6); const step = Math.min(d, dt * 1.6); s.x += dx / d * step; s.z += dz / d * step; lift = Math.abs(Math.sin(time * 9)) * 0.06; flip = Math.sin(time * 9) * 0.5; }
          else { s.state = s.want.then; s.t = 0; s.want = null; if (s.state === 'beg') s.say = '🐟?'; }
        } else if (s.state === 'beg') {
          if (s.face) s.yaw += angleDiff(Math.atan2(s.face.x - s.x, s.face.z - s.z), s.yaw) * Math.min(1, dt * 5);
          lift = Math.abs(Math.sin(time * 4)) * 0.03; u.head.rotation.x = -0.25 + Math.sin(time * 4) * 0.08;
          if (s.t > 2.8) { s.state = s.junk ? 'puzzled' : 'yum'; s.t = 0; s.say = s.junk ? '?' : '냠냠! 💕'; if (!s.junk) puff(s.x, s.z, 0.25); }
        } else if (s.state === 'yum') { s.clap = Math.max(s.clap, 0.2); lift = Math.abs(Math.sin(time * 10)) * 0.1; if (s.t > 2.2) { s.say = null; goTo(s, s.home.x, s.home.z, 'sleep'); } }
        else if (s.state === 'puzzled') { u.head.rotation.z = Math.sin(Math.min(1, s.t * 2) * Math.PI / 2) * 0.45; if (s.t > 2.2) { s.say = null; u.head.rotation.z = 0; goTo(s, s.home.x, s.home.z, 'sleep'); } }
        else if (s.state === 'wake') { if (s.t > 3) { s.state = 'sleep'; s.t = 0; } }
        else if (s.state === 'sleep') { s.yaw += angleDiff(s.home.yaw, s.yaw) * Math.min(1, dt * 2); }
        const asleep = s.state === 'sleep' && s.clap <= 0;
        u.lids.forEach((l) => { l.visible = asleep; });
        if (asleep) { u.head.rotation.x = 0.35 + Math.sin(time * 1.2 + s.phase) * 0.06; u.head.position.y = 0.36; }       // 꾸벅꾸벅
        else if (s.state !== 'beg') { u.head.rotation.x += (0 - u.head.rotation.x) * Math.min(1, dt * 5); u.head.position.y = 0.42; }
        const c = s.clap > 0 ? Math.sin(time * 22) : 0;
        u.flippers.forEach((f, i) => { f.rotation.y = (i ? -1 : 1) * (0.2 + (c > 0 ? 0.9 : 0.1) + flip * 0.3); f.rotation.z = (i ? -1 : 1) * flip * 0.4; });
        u.tail.rotation.y = Math.sin(time * (asleep ? 1 : 6)) * (asleep ? 0.05 : 0.25);
        u.body.scale.y = 1 + (asleep ? Math.sin(time * 1.2 + s.phase) * 0.03 : 0);       // 숨 쉬기
        s.root.position.set(s.x, lift, s.z); s.root.rotation.y = s.yaw;
      }
    },
  };
}
