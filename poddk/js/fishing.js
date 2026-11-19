// 얼음낚시. 낚시 구멍 곁에서 버튼을 누르면 펭귄이 앉아 낚싯대를 드리운다.
//   기다리다가 → 찌가 쑥 들어가면(입질) 버튼을 눌러 → 낚아 올리고 → 잠깐 들어 보인 뒤 → 다시 놓아준다.
//   입질을 놓치면 물고기는 달아나고 다시 기다린다. 걸으려 하면 일어나 그만둔다.
// 점수도 도감도 없다. 무엇이 올라올지는 그때그때 다르다.
import * as THREE from 'three';
import { ROD_GRIP, sit } from './penguin.js';

/** 낚이는 것들 (weight: 낚일 가능성의 비) */
export const CATCHES = [
  { id: 'smelt', name: '빙어', weight: 57 },
  { id: 'cherry', name: '산천어', weight: 25 },
  { id: 'trout', name: '송어', weight: 12 },
  { id: 'boot', name: '낡은 장화', weight: 6 },
];
const SEAT = 1.55;                 // 구멍에서 이만큼 떨어져 앉는다
const T = { sit: 0.6, bite: 2.6, pull: 0.55, show: 1.9, release: 0.65, stand: 0.45 };      // 단계마다 걸리는 시간(초)
const WAIT = [4, 12];              // 입질을 기다리는 시간의 범위(초)
const ROD_LEN = 1.5, ROD_TILT = 0.96;     // 낚싯대의 길이와, 앞으로 기운 각도(라디안)
const FLOAT_Y = 0.05;              // 찌가 떠 있는 높이

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------- 모습 ----------
const mat = (c, rough = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m); o.scale.set(sx, sy, sz); return o; };

/** 물고기 한 마리: 줄에 매달리도록 머리가 위(+Y)를 본다. len: 길이 */
function fish(len, back, belly, stripe) {
  const g = new THREE.Group(), half = len / 2;
  const body = ball(half, mat(back, 0.45), 0.34, 1, 0.24); g.add(body);
  const under = ball(half * 0.9, mat(belly, 0.5), 0.3, 0.92, 0.2); under.position.x = -half * 0.07; g.add(under);
  if (stripe) { const band = ball(half * 0.86, mat(stripe, 0.5), 0.12, 0.9, 0.255); band.position.x = half * 0.03; g.add(band); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(half * 0.34, half * 0.5, 4), mat(back, 0.5));
  tail.position.y = -half * 1.12; tail.scale.z = 0.25; g.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(half * 0.16, half * 0.3, 4), mat(back, 0.5));
  fin.position.set(half * 0.36, half * 0.1, 0); fin.rotation.z = -1.1; fin.scale.z = 0.3; g.add(fin);
  [-1, 1].forEach((s) => { const eye = ball(half * 0.06, mat('#17181d', 0.4)); eye.position.set(half * 0.06, half * 0.66, s * half * 0.2); g.add(eye); });
  return g;
}
/** 낡은 장화: 발목을 위로 하고 매달린다 */
function boot() {
  const g = new THREE.Group(), brown = mat('#7b5438', 0.9), dark = mat('#4a3324', 0.95);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.092, 0.34, 12), brown); leg.position.y = -0.02; g.add(leg);
  const foot = ball(0.12, brown, 1, 0.72, 1.55); foot.position.set(0, -0.2, 0.09); g.add(foot);
  const sole = ball(0.123, dark, 1, 0.3, 1.58); sole.position.set(0, -0.265, 0.09); g.add(sole);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), dark); cuff.rotation.x = Math.PI / 2; cuff.position.y = 0.15; g.add(cuff);
  return g;
}
const MAKERS = {
  smelt: () => fish(0.36, '#8ea4c2', '#e8eef6', null),
  cherry: () => fish(0.52, '#7c8f58', '#f1ead6', '#e79aa6'),
  trout: () => fish(0.7, '#7f8fa8', '#eef0f2', '#ea8c9f'),
  boot,
};

/**
 * @param {THREE.Scene} scene
 * @param {{ penguin: THREE.Group, audio: { water: Function }, crumble: { puff: Function }, toast: Function, free: (x: number, z: number) => boolean }} o
 *   free: 그 자리에 설 수 있는가 (이글루 같은 것에 막혀 있지 않은가)
 */
export function createFishing(scene, { penguin, audio, crumble, toast, free }) {
  // 낚싯대는 펭귄에 붙어 다닌다
  const rod = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, ROD_LEN, 8), mat('#8a5a36', 0.8));
  stick.position.y = ROD_LEN / 2; rod.add(stick);
  const grip = ball(0.04, mat('#3f2a1e', 0.9), 1, 1.6, 1); rod.add(grip);
  rod.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  rod.visible = false;
  penguin.add(rod);
  // 낚싯줄, 찌, 물결, 낚인 것은 눈밭에 놓인다
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#4d5570', transparent: true, opacity: 0.85 }));
  line.frustumCulled = false; line.visible = false; scene.add(line);
  const float = new THREE.Group();
  float.add(ball(0.055, mat('#f7f5f0', 0.5)));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.057, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d8362f', 0.5)); float.add(cap);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), mat('#d8362f', 0.5)); pin.position.y = 0.09; float.add(pin);
  float.visible = false; scene.add(float);
  const rings = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 4; m.visible = false; m.userData.t = 9;
    scene.add(m); return m;
  });
  const items = {};
  for (const c of CATCHES) { const o = MAKERS[c.id](); o.traverse((x) => { if (x.isMesh) x.castShadow = true; }); o.visible = false; scene.add(o); items[c.id] = o; }

  let state = null;                // { phase, t, wait, k(앉은 정도), from, to, kind, pressed, twitch }
  let HOLE = { x: 0, z: 0, radius: 0.42 };       // 지금(또는 마지막으로) 낚시하는 구멍
  let forcedWait = null, forcedKind = null, time = 0;
  const stats = { started: 0, bites: 0, caught: 0, missed: 0, last: null };
  const tip = new THREE.Vector3(), end = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), hand = new THREE.Vector3();
  const euler = new THREE.Euler();

  const nextWait = () => { const w = forcedWait !== null ? forcedWait : lerp(WAIT[0], WAIT[1], Math.random()); forcedWait = null; return w; };
  function pick() {
    if (forcedKind) { const k = forcedKind; forcedKind = null; return k; }
    let r = Math.random() * CATCHES.reduce((s, c) => s + c.weight, 0);
    for (const c of CATCHES) { r -= c.weight; if (r <= 0) return c.id; }
    return CATCHES[0].id;
  }
  function ripple() {
    const m = rings.find((r) => r.userData.t >= 1) || rings[0];
    m.position.set(HOLE.x, 0.02, HOLE.z);
    m.userData.t = 0; m.visible = true;
  }
  function go(phase) { state.phase = phase; state.t = 0; }
  function hideAll() {
    rod.visible = false; line.visible = false; float.visible = false;
    for (const id in items) items[id].visible = false;
  }

  return {
    stats,
    get active() { return !!state; },
    /** 점검용: 찌의 높이(안 보이면 null), 지금 줄에 매달려 보이는 것(없으면 null), 낚싯대가 보이는가 */
    get floatY() { return float.visible ? float.position.y : null; },
    get shown() { for (const id in items) if (items[id].visible) return id; return null; },
    get rodShown() { return rod.visible && line.visible; },
    /** 지금 단계: 'sit' | 'wait' | 'bite' | 'pull' | 'show' | 'release' | 'stand' | null */
    get phase() { return state ? state.phase : null; },
    /** 점검·시안용: 다음 입질까지의 시간(초)과 다음에 낚일 것을 정해 둔다 */
    debug: { biteIn(sec) { forcedWait = sec; if (state && state.phase === 'wait') { state.wait = state.t + sec; forcedWait = null; } }, next(id) { forcedKind = id; }, draw: () => pick() },

    /** 낚시를 시작한다. me: { x, z, yaw }, hole: 낚시할 구멍 { x, z, radius } */
    start(me, hole) {
      if (state || !hole) return false;
      HOLE = hole;
      // 구멍에서 지금 서 있는 쪽으로 한 걸음 반 떨어진 자리에 앉는다. 그 자리가 막혀 있으면 옆으로 돌아가며 빈자리를 찾는다
      const bearing = Math.atan2(me.x - HOLE.x, me.z - HOLE.z);
      let to = null;
      for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6, Math.PI]) {
        const a = bearing + turn, x = HOLE.x + Math.sin(a) * SEAT, z = HOLE.z + Math.cos(a) * SEAT;
        if (free(x, z)) { to = { x, z, yaw: Math.atan2(HOLE.x - x, HOLE.z - z) }; break; }
      }
      if (!to) return false;
      state = { phase: 'sit', t: 0, k: 0, wait: 0, from: { x: me.x, z: me.z, yaw: me.yaw }, to, kind: null, pressed: false, twitch: 0, lean: 0 };
      stats.started++;
      rod.visible = true; line.visible = true; float.visible = true;
      float.position.set(HOLE.x, FLOAT_Y, HOLE.z);
      return true;
    },
    /** 버튼을 눌렀다: 입질 중이면 낚아 올린다 */
    press() {
      if (!state) return;
      if (state.phase === 'bite') state.pressed = true;
      else if (state.phase === 'wait') state.twitch = 0.35;       // 아직 입질이 없으면 낚싯대만 한 번 까딱
    },
    /** 바로 그만둔다 (자세를 되돌리고 모두 감춘다) */
    cancel() { if (!state) return; state = null; hideAll(); sit(penguin, 0); },

    /**
     * 한 박자. (pose() 로 선 자세를 잡은 다음에 부른다)
     * @param {number} dt  @param {{ x: number, z: number, yaw: number }} me 펭귄의 자리 — 앉는 동안 여기에 적어 넣는다  @param {boolean} leave 걸으려 하는가
     */
    step(dt, me, leave) {
      time += dt;
      for (const m of rings) {                                   // 물결은 낚시가 끝난 뒤에도 마저 퍼진다
        if (m.userData.t >= 1) { m.visible = false; continue; }
        m.userData.t = Math.min(1, m.userData.t + dt / 0.9);
        const u = m.userData.t; m.scale.setScalar(0.12 + (HOLE.radius - 0.14) * u); m.material.opacity = 0.75 * (1 - u);
      }
      if (!state) return;
      const s = state;
      s.t += dt;
      s.twitch = Math.max(0, s.twitch - dt);
      let lean = 0, lift = 0, bend = 0, item = null, itemPos = null, wiggle = 0;
      const held = hand.set(s.to.x + Math.sin(s.to.yaw) * 0.92, 1.0, s.to.z + Math.cos(s.to.yaw) * 0.92);      // 낚인 것을 들어 보이는 자리

      if (s.phase === 'sit') {
        s.k = smooth(s.t / T.sit);
        if (s.t >= T.sit) { go('wait'); s.wait = nextWait(); }
      } else if (s.phase === 'wait') {
        s.k = 1;
        if (leave && s.t > 0.4) go('stand');
        else if (s.t >= s.wait) { go('bite'); s.pressed = false; stats.bites++; audio.water('plop'); ripple(); }
      } else if (s.phase === 'bite') {
        s.k = 1; lean = 0.12; bend = 0.1 + 0.05 * Math.sin(s.t * 21);
        if (s.pressed) { s.kind = pick(); go('pull'); audio.water('splash'); crumble.puff(HOLE.x, HOLE.z, 0.28); ripple(); }
        else if (leave) go('stand');
        else if (s.t >= T.bite) { stats.missed++; go('wait'); s.wait = nextWait(); ripple(); }
      } else if (s.phase === 'pull') {
        s.k = 1;
        const u = Math.min(1, s.t / T.pull), e = 1 - (1 - u) * (1 - u);
        lean = -0.3 * smooth(u * 1.6); lift = -0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15));
        item = s.kind;
        itemPos = end.set(lerp(HOLE.x, held.x, e), lerp(-0.25, held.y, e) + Math.sin(Math.PI * u) * 0.75, lerp(HOLE.z, held.z, e));
        wiggle = 1;
        if (s.t >= T.pull) {
          go('show'); stats.caught++; stats.last = s.kind;
          toast(CATCHES.find((c) => c.id === s.kind).name + '를 낚았어요', 2200);
        }
      } else if (s.phase === 'show') {
        s.k = 1; lean = -0.14; lift = -0.3;
        item = s.kind; itemPos = end.copy(held); itemPos.y += Math.sin(s.t * 5) * 0.025; wiggle = Math.max(0.25, 1 - s.t / T.show);
        if (s.t >= T.show) go('release');
      } else if (s.phase === 'release') {
        s.k = 1;
        const u = Math.min(1, s.t / T.release);
        lean = 0.1 * Math.sin(Math.PI * u); lift = -0.3 * (1 - u);
        item = s.kind;
        itemPos = end.set(lerp(held.x, HOLE.x, u), lerp(held.y, -0.3, u * u) + Math.sin(Math.PI * u) * 0.35, lerp(held.z, HOLE.z, u));
        if (s.t >= T.release) { audio.water('plop'); ripple(); go('wait'); s.wait = nextWait(); }
      } else if (s.phase === 'stand') {
        s.k = 1 - smooth(s.t / T.stand);
        if (s.t >= T.stand) { state = null; hideAll(); sit(penguin, 0); return; }
      }

      // 펭귄: 구멍 쪽으로 다가앉아 구멍을 본다 (일어날 때는 그 자리에서 일어난다)
      const move = s.phase === 'sit' ? s.k : 1;
      me.x = lerp(s.from.x, s.to.x, move); me.z = lerp(s.from.z, s.to.z, move);
      me.yaw = s.from.yaw + angleDiff(s.to.yaw, s.from.yaw) * move;
      s.lean += (lean - s.lean) * (1 - Math.exp(-dt * 12));
      sit(penguin, s.k, s.lean + Math.sin(time * 1.3) * 0.012);

      // 낚싯대: 쥔 날개 끝에서 앞쪽 위로. 입질이면 끝이 떨리며 숙고, 낚아 올릴 때는 휙 들린다
      rod.position.set(ROD_GRIP.x, ROD_GRIP.y - 0.09 * s.k, ROD_GRIP.z);
      rod.rotation.set(ROD_TILT + bend + lift - s.twitch * 0.5 + (1 - s.k) * 0.4, 0, 0.1);
      rod.scale.setScalar(Math.max(0.001, s.k));
      euler.copy(rod.rotation);
      tip.set(0, ROD_LEN * rod.scale.x, 0).applyEuler(euler).add(rod.position).applyAxisAngle(up, me.yaw);
      tip.x += me.x; tip.z += me.z;

      // 찌: 물 위에 동동. 입질이면 물속으로 쑥 들어갔다 나왔다 한다. 낚아 올리는 동안은 감춘다
      const fishing = s.phase === 'wait' || s.phase === 'bite' || s.phase === 'sit' || s.phase === 'stand';
      float.visible = fishing && s.k > 0.5;
      float.position.y = s.phase === 'bite' ? -0.06 + 0.07 * Math.sin(s.t * 16) : FLOAT_Y + Math.sin(time * 2.2) * 0.012 - s.twitch * 0.05;
      float.rotation.z = Math.sin(time * 1.7) * 0.12;

      // 낚인 것
      for (const id in items) items[id].visible = id === item;
      if (item) {
        const o = items[item];
        o.position.copy(itemPos);
        o.rotation.set(0, me.yaw + Math.PI / 2, Math.sin(time * 17) * 0.38 * wiggle);
      }
      // 낚싯줄: 낚싯대 끝에서 찌(또는 낚인 것의 머리)까지
      const to = item ? end.set(itemPos.x, itemPos.y + (item === 'boot' ? 0.17 : items[item].children[0].geometry.parameters.radius), itemPos.z) : float.position;
      const p = lineGeo.attributes.position;
      p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, to.x, Math.max(0.015, to.y), to.z); p.needsUpdate = true;
      line.visible = s.k > 0.5;
    },
  };
}
