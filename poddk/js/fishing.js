// 얼음낚시. 낚시 구멍 곁에서 버튼을 누르면 펭귄이 앉아 낚싯대를 드리운다.
//   기다리다가 → 찌가 쑥 들어가면(입질) 버튼을 눌러 → 낚아 올리고 → 잠깐 들어 보인 뒤 → 다시 놓아준다.
//   기다리는 동안 물고기가 찌를 톡톡 건드려 보기도 한다(가짜 입질: 찌가 살짝만 까딱인다).
//   그 잠깐 동안은 버튼이 흐려져 쉬고, 서둘러 눌러도 아무 일도 일어나지 않는다 (일어나 버리지도, 물고기를 놓치지도 않는다).
//   입질을 놓쳐도 물고기는 달아나고 다시 기다린다.
//   그만둘 때는 같은 버튼을 누른다: 기다리는 동안에는 그 버튼이 "그만두기"이고, 입질이 온 동안에만 "낚아 올리기"다.
//   (걸으려 해도 일어나지 않는다 — 조이스틱을 건드려 낚시가 풀려 버리지 않게)
// 점수도 도감도 없다. 무엇이 올라올지는 그때그때 다르다.
import * as THREE from 'three';
import { ROD_GRIP, sit } from './penguin.js';

/** 낚이는 것들 (weight: 낚일 가능성의 비) */
export const CATCHES = [
  { id: 'smelt', name: '빙어', weight: 40 },
  { id: 'cherry', name: '산천어', weight: 20 },
  { id: 'trout', name: '송어', weight: 10 },
  { id: 'carp', name: '붕어', weight: 10 },
  { id: 'catfish', name: '메기', weight: 6 },
  { id: 'goldcarp', name: '황금 잉어', weight: 2, rare: true },
  { id: 'boot', name: '낡은 장화', weight: 3, junk: true },
  { id: 'mitten', name: '털장갑 한 짝', weight: 3, junk: true },
  { id: 'duck', name: '고무 오리', weight: 2, junk: true },
  { id: 'can', name: '찌그러진 깡통', weight: 2, junk: true },
  { id: 'bottle', name: '병 속 편지', weight: 1.5, junk: true },
  { id: 'treasure', name: '작은 보물 상자', weight: 0.5, junk: true, rare: true },
];
/** 이름 뒤에 붙는 '을/를' (받침이 있으면 '을') */
export const objectOf = (name) => { const c = name.charCodeAt(name.length - 1); return name + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '을' : '를'); };
export const SEAT = 1.55;                 // 구멍에서 이만큼 떨어져 앉는다
const T = { sit: 0.6, bite: 2.6, pull: 0.55, show: 1.9, release: 0.65, stand: 0.45 };      // 단계마다 걸리는 시간(초)
const WAIT = [4, 12];              // 입질을 기다리는 시간의 범위(초)
const NIB = { len: 0.32, early: 0.9, lead: 1.1, gap: 1.0, tail: 1.0, dip: 0.036 };      // 가짜 입질: 까딱이는 시간, 그때부터 이만큼은 버튼이 쉰다(누르면 "일렀다"로 친다), 앉고 나서·서로·진짜 입질 앞에 두는 틈(초), 찌가 내려가는 깊이
const GRACE = { sat: 0.5, missed: 0.9, released: 0.6 };      // 막 앉았거나, 입질을 놓쳤거나, 놓아준 직후 이만큼은 버튼을 눌러도 그만두지 않는다 (한 박자 늦게 누른 것일 수 있다)
export const ROD_LEN = 1.5, ROD_TILT = 0.96;     // 낚싯대의 길이와, 앞으로 기운 각도(라디안)
export const FLOAT_Y = 0.05;              // 찌가 떠 있는 높이

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
  g.userData.hook = half;                          // 줄이 매달리는 높이 (머리 끝)
  return g;
}
/** 낡은 장화: 발목을 위로 하고 매달린다 */
function boot() {
  const g = new THREE.Group(), brown = mat('#7b5438', 0.9), dark = mat('#4a3324', 0.95);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.092, 0.34, 12), brown); leg.position.y = -0.02; g.add(leg);
  const foot = ball(0.12, brown, 1, 0.72, 1.55); foot.position.set(0, -0.2, 0.09); g.add(foot);
  const sole = ball(0.123, dark, 1, 0.3, 1.58); sole.position.set(0, -0.265, 0.09); g.add(sole);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), dark); cuff.rotation.x = Math.PI / 2; cuff.position.y = 0.15; g.add(cuff);
  g.userData.hook = 0.17;
  return g;
}
/** 메기: 거무스름하고 넓적한 머리에 긴 수염 넷 */
function catfish() {
  const g = fish(0.62, '#4b4a44', '#c9c3ad', null), half = 0.31;
  for (const [s, k] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.22 - k * 0.08, 5), mat('#2f2e2a', 0.6));
    w.position.set(half * 0.2 + 0.05, half * 0.72 - k * 0.04, s * 0.06); w.rotation.set(s * 0.6, 0, -0.9 - k * 0.4); g.add(w);
  }
  return g;
}
/** 황금 잉어: 반짝이는 금빛 */
function goldcarp() {
  const g = fish(0.6, '#f2b32a', '#ffe7a3', '#ff8a3a');
  g.traverse((o) => { if (o.isMesh && o.material.color.getHex() !== 0x17181d) { o.material.metalness = 0.55; o.material.roughness = 0.25; } });
  return g;
}
/** 털장갑 한 짝: 손목을 위로 하고 매달린다 */
function mitten() {
  const g = new THREE.Group(), red = mat('#d8443a', 1), white = mat('#f6efe4', 1);
  const palm = ball(0.11, red, 0.95, 1.3, 0.55); palm.position.y = -0.08; g.add(palm);
  const thumb = ball(0.045, red, 1, 1.5, 0.9); thumb.position.set(0.1, -0.03, 0); thumb.rotation.z = -0.6; g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.08, 16), white); cuff.position.y = 0.08; cuff.scale.z = 0.62; g.add(cuff);
  for (let k = 0; k < 3; k++) { const dot = ball(0.014, white); dot.position.set(-0.04 + k * 0.04, -0.06, 0.062); g.add(dot); }
  g.userData.hook = 0.12;
  return g;
}
/** 고무 오리: 노란 몸, 주황 부리 (줄이 목에 걸려 있다) */
function duck() {
  const g = new THREE.Group(), yel = mat('#ffd23a', 0.35);
  const body = ball(0.12, yel, 1.25, 0.85, 1); body.position.y = -0.1; g.add(body);
  const head = ball(0.075, yel); head.position.set(0.08, 0.02, 0); g.add(head);
  const beak = ball(0.035, mat('#ff8a2a', 0.4), 1.5, 0.6, 1); beak.position.set(0.16, 0.0, 0); g.add(beak);
  for (const s of [-1, 1]) { const e = ball(0.012, mat('#17181d', 0.4)); e.position.set(0.12, 0.04, s * 0.045); g.add(e); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), yel); tail.position.set(-0.15, -0.06, 0); tail.rotation.z = 1.1; g.add(tail);
  g.userData.hook = 0.1;
  return g;
}
/** 찌그러진 깡통: 빨간 띠, 한쪽이 우그러졌다 */
function can() {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.07, 0.07, 0.22, 18, 4), pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) { const x = pos.getX(k), y = pos.getY(k); if (x > 0.02) pos.setX(k, x - 0.03 * (1 - Math.abs(y) / 0.11)); }      // 한쪽이 쑥 들어갔다
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.3, metalness: 0.7 })); g.add(body);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0715, 0.0715, 0.09, 18, 1, true), mat('#d8443a', 0.6)); label.scale.x = 0.86; g.add(label);
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), new THREE.MeshStandardMaterial({ color: '#d0d4da', metalness: 0.7, roughness: 0.3 })); tab.position.y = 0.115; tab.rotation.x = Math.PI / 2; g.add(tab);
  g.rotation.z = 0.35;
  g.userData.hook = 0.12;
  return g;
}
/** 병 속 편지: 초록빛 유리병, 코르크 마개, 안에 돌돌 만 편지 */
function bottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#8fd4a8', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 18), glass); body.position.y = -0.06; g.add(body);
  const shoulder = ball(0.07, glass, 1, 0.5, 1); shoulder.position.y = 0.04; g.add(shoulder);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 12), glass); neck.position.y = 0.1; g.add(neck);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.04, 10), mat('#b9894f', 0.9)); cork.position.y = 0.155; g.add(cork);
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 12), mat('#f6ead0', 0.9)); paper.position.y = -0.06; paper.rotation.z = 0.15; g.add(paper);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 6, 14), mat('#d8443a', 0.6)); ribbon.position.y = -0.06; ribbon.rotation.x = Math.PI / 2; g.add(ribbon);
  g.userData.hook = 0.18;
  return g;
}
/** 작은 보물 상자: 나무 상자에 금 테, 반쯤 열린 뚜껑 사이로 금화가 반짝 */
function treasure() {
  const g = new THREE.Group(), wood = mat('#8a5a36', 0.8), gold = new THREE.MeshStandardMaterial({ color: '#f3c12f', roughness: 0.25, metalness: 0.6 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.17), wood); box.position.y = -0.1; g.add(box);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 16, 1, false, 0, Math.PI), wood); lid.rotation.set(0, 0, Math.PI / 2); lid.position.set(0, -0.03, -0.02); lid.rotation.x = -0.5; g.add(lid);
  for (const x of [-0.1, 0.1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.145, 0.175), gold); band.position.set(x, -0.1, 0); g.add(band); }
  for (let k = 0; k < 5; k++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 14), gold); coin.position.set(-0.07 + k * 0.035, -0.025 + (k % 2) * 0.01, 0.03); coin.rotation.x = 1.2; g.add(coin); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), gold); lock.position.set(0, -0.06, 0.09); g.add(lock);
  g.userData.hook = 0.07;
  return g;
}
const MAKERS = {
  smelt: () => fish(0.36, '#8ea4c2', '#e8eef6', null),
  cherry: () => fish(0.52, '#7c8f58', '#f1ead6', '#e79aa6'),
  trout: () => fish(0.7, '#7f8fa8', '#eef0f2', '#ea8c9f'),
  carp: () => fish(0.42, '#8a7a3e', '#e9dfb6', null),
  catfish, goldcarp, boot, mitten, duck, can, bottle, treasure,
};

/**
 * @param {THREE.Scene} scene
 * @param {{ penguin: THREE.Group, audio: { water: Function }, crumble: { puff: Function }, toast: Function, free: (x: number, z: number) => boolean, early?: Function, caught?: (kind: string) => void }} o
 *   caught: 무엇인가 낚아 올렸을 때 (없으면 알림 글로 알린다)
 *   free: 그 자리에 설 수 있는가 (이글루 같은 것에 막혀 있지 않은가)
 *   early: 가짜 입질에 서둘러 눌렀을 때 부른다
 */
/** 낚인 것의 모형을 새로 하나 만든다 (낚은 것을 보여 주는 창에 쓴다) */
export function makeCatch(id) { const o = MAKERS[id](); o.visible = true; return o; }

export function createFishing(scene, { penguin, audio, crumble, toast, free, early = () => {}, caught = null }) {
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
    const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));      // 물(-3)보다 앞으로 당겨 그린다
    m.rotation.x = -Math.PI / 2; m.renderOrder = 4; m.visible = false; m.userData.t = 9;
    scene.add(m); return m;
  });
  const items = {};
  for (const c of CATCHES) { const o = MAKERS[c.id](); o.traverse((x) => { if (x.isMesh) x.castShadow = true; }); o.visible = false; scene.add(o); items[c.id] = o; }

  let state = null;                // { phase, t, wait, k(앉은 정도), from, to, kind, pressed, grace(그만두기를 받지 않는 남은 시간) }
  let HOLE = { x: 0, z: 0, radius: 0.42 };       // 지금(또는 마지막으로) 낚시하는 구멍
  let forcedWait = null, forcedKind = null, forcedNibs = null, time = 0;
  const stats = { started: 0, bites: 0, caught: 0, missed: 0, nibbles: 0, early: 0, last: null };
  const tip = new THREE.Vector3(), end = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), hand = new THREE.Vector3();
  const euler = new THREE.Euler();

  const nextWait = () => { const w = forcedWait !== null ? forcedWait : lerp(WAIT[0], WAIT[1], Math.random()); forcedWait = null; return w; };
  /** 다시 기다리기 시작한다: 진짜 입질까지의 시간과, 그 사이에 올 가짜 입질(0~3번)의 때를 정한다 */
  function waitAgain(grace) {
    const fixed = forcedWait !== null;                    // 점검에서 시간을 정해 준 경우: 가짜 입질도 정해 준 것만 온다
    go('wait');
    state.wait = nextWait(); state.grace = grace; state.nib = 9; state.nibs = [];
    if (forcedNibs) { state.nibs = forcedNibs.filter((t) => t < state.wait).sort((a, b) => a - b); forcedNibs = null; return; }
    if (fixed) return;
    const from = NIB.lead, to = state.wait - NIB.tail;
    const count = to > from ? [0, 1, 1, 2, 2, 3][Math.floor(Math.random() * 6)] : 0;
    const times = Array.from({ length: count }, () => lerp(from, to, Math.random())).sort((a, b) => a - b);
    for (const t of times) if (!state.nibs.length || t - state.nibs[state.nibs.length - 1] >= NIB.gap) state.nibs.push(t);
  }
  function pick() {
    if (forcedKind) { const k = forcedKind; forcedKind = null; return k; }
    let r = Math.random() * CATCHES.reduce((s, c) => s + c.weight, 0);
    for (const c of CATCHES) { r -= c.weight; if (r <= 0) return c.id; }
    return CATCHES[0].id;
  }
  /** 물결 고리 하나. size: 1(입질, 낚아 올림, 놓아줌) 또는 그보다 작게(가짜 입질의 잔물결) */
  function ripple(size = 1) {
    const m = rings.find((r) => r.userData.t >= 1) || rings[0];
    m.position.set(HOLE.x, 0.02, HOLE.z);
    m.userData.t = 0; m.userData.size = size; m.visible = true;
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
    /** 점검용: 물결 고리들의 모습 */
    get ripples() { return rings.map((m) => ({ visible: m.visible, opacity: m.material.opacity, offset: m.material.polygonOffset ? m.material.polygonOffsetFactor : 0 })); },
    /** 점검용: 지금 기다리는 중이면 입질까지 정해진 시간(초) */
    get waitFor() { return state && state.phase === 'wait' ? state.wait : null; },
    /** 점검·시안용: 다음 입질까지의 시간(초)과 다음에 낚일 것을 정해 둔다 */
    debug: {
      biteIn(sec) { forcedWait = sec; if (state && state.phase === 'wait') { state.wait = state.t + sec; state.nibs = []; forcedWait = null; } },
      /** 가짜 입질이 올 때(지금부터 또는 다음에 기다리기 시작하고부터, 초)를 정해 둔다 */
      nibbles(times) { if (state && state.phase === 'wait') state.nibs = times.map((t) => state.t + t).sort((a, b) => a - b); else forcedNibs = times; },
      next(id) { forcedKind = id; }, draw: () => pick(),
    },

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
      state = { phase: 'sit', t: 0, k: 0, wait: 0, nibs: [], nib: 9, from: { x: me.x, z: me.z, yaw: me.yaw }, to, kind: null, pressed: false, grace: 0, lean: 0 };
      stats.started++;
      rod.visible = true; line.visible = true; float.visible = true;
      float.position.set(HOLE.x, FLOAT_Y, HOLE.z);
      return true;
    },
    /** 버튼이 지금 하는 일: 'pull'(입질 — 낚아 올린다) | 'quit'(기다리는 중 — 그만둔다) | null(누를 수 없는 때, 가짜 입질 직후도 그렇다) */
    get button() { return !state ? null : state.phase === 'bite' ? 'pull' : state.phase === 'wait' && state.grace <= 0 && state.nib >= NIB.early ? 'quit' : null; },
    /** 가짜 입질이 막 지나가는 중인가 (그동안의 누름은 서두른 것으로 보고, 그만두기로 치지 않는다) */
    get nibbling() { return !!state && state.phase === 'wait' && state.nib < NIB.early; },
    /** 버튼을 눌렀다: 입질 중이면 낚아 올리고, 기다리는 중이면 일어나 그만둔다. 가짜 입질에 서둘러 누른 것이면 아무 일도 없다 (기다림은 그대로 이어진다) */
    press() {
      if (!state) return;
      if (state.phase === 'bite') state.pressed = true;
      else if (state.phase === 'wait' && state.nib < NIB.early) { stats.early++; state.grace = Math.max(state.grace, GRACE.missed); early(); }      // (잇달아 한 번 더 눌러도 그만두기로 치지 않는다)
      else if (state.phase === 'wait' && state.grace <= 0) go('stand');
    },
    /** 바로 그만둔다 (자세를 되돌리고 모두 감춘다) */
    cancel() { if (!state) return; state = null; hideAll(); sit(penguin, 0); },

    /**
     * 한 박자. (pose() 로 선 자세를 잡은 다음에 부른다)
     * @param {number} dt  @param {{ x: number, z: number, yaw: number }} me 펭귄의 자리 — 앉는 동안 여기에 적어 넣는다
     */
    step(dt, me) {
      time += dt;
      for (const m of rings) {                                   // 물결은 낚시가 끝난 뒤에도 마저 퍼진다
        if (m.userData.t >= 1) { m.visible = false; continue; }
        m.userData.t = Math.min(1, m.userData.t + dt / 0.9);
        const u = m.userData.t, size = m.userData.size || 1; m.scale.setScalar(0.12 + (HOLE.radius - 0.14) * u * size); m.material.opacity = 0.75 * (1 - u) * Math.min(1, 0.35 + size * 0.65);
      }
      if (!state) return;
      const s = state;
      s.t += dt;
      s.grace = Math.max(0, s.grace - dt);
      s.nib += dt;
      let lean = 0, lift = 0, bend = 0, item = null, itemPos = null, wiggle = 0;
      const held = hand.set(s.to.x + Math.sin(s.to.yaw) * 0.92, 1.0, s.to.z + Math.cos(s.to.yaw) * 0.92);      // 낚인 것을 들어 보이는 자리

      if (s.phase === 'sit') {
        s.k = smooth(s.t / T.sit);
        if (s.t >= T.sit) waitAgain(GRACE.sat);
      } else if (s.phase === 'wait') {
        s.k = 1;
        if (s.nibs.length && s.t >= s.nibs[0]) { s.nibs.shift(); s.nib = 0; stats.nibbles++; audio.water('tick'); ripple(0.45); }      // 가짜 입질: 찌가 살짝 까딱, 잔물결, 가벼운 톡
        if (s.nib < NIB.len) bend = 0.035 * Math.sin(Math.PI * s.nib / NIB.len);
        if (s.t >= s.wait) { go('bite'); s.pressed = false; stats.bites++; audio.water('bite'); ripple(); }
      } else if (s.phase === 'bite') {
        s.k = 1; lean = 0.12; bend = 0.1 + 0.05 * Math.sin(s.t * 21);
        if (s.pressed) { s.kind = pick(); go('pull'); audio.water('splash'); crumble.puff(HOLE.x, HOLE.z, 0.28); ripple(); }
        else if (s.t >= T.bite) { stats.missed++; waitAgain(GRACE.missed); ripple(); }
      } else if (s.phase === 'pull') {
        s.k = 1;
        const u = Math.min(1, s.t / T.pull), e = 1 - (1 - u) * (1 - u);
        lean = -0.3 * smooth(u * 1.6); lift = -0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15));
        item = s.kind;
        itemPos = end.set(lerp(HOLE.x, held.x, e), lerp(-0.25, held.y, e) + Math.sin(Math.PI * u) * 0.75, lerp(HOLE.z, held.z, e));
        wiggle = 1;
        if (s.t >= T.pull) {
          go('show'); stats.caught++; stats.last = s.kind;
          if (caught) caught(s.kind); else toast(objectOf(CATCHES.find((c) => c.id === s.kind).name) + ' 낚았어요', 2200);
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
        if (s.t >= T.release) { audio.water('plop'); ripple(); waitAgain(GRACE.released); }
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
      rod.rotation.set(ROD_TILT + bend + lift + (1 - s.k) * 0.4, 0, 0.1);
      rod.scale.setScalar(Math.max(0.001, s.k));
      euler.copy(rod.rotation);
      tip.set(0, ROD_LEN * rod.scale.x, 0).applyEuler(euler).add(rod.position).applyAxisAngle(up, me.yaw);
      tip.x += me.x; tip.z += me.z;

      // 찌: 물 위에 동동. 입질이면 물속으로 쑥 들어갔다 나왔다 한다. 낚아 올리는 동안은 감춘다
      const fishing = s.phase === 'wait' || s.phase === 'bite' || s.phase === 'sit' || s.phase === 'stand';
      float.visible = fishing && s.k > 0.5;
      const dip = s.phase === 'wait' && s.nib < NIB.len ? NIB.dip * Math.sin(Math.PI * s.nib / NIB.len) : 0;      // 가짜 입질: 살짝만 내려갔다 올라온다 (물 밖으로 머리는 남는다)
      float.position.y = s.phase === 'bite' ? -0.06 + 0.07 * Math.sin(s.t * 16) : FLOAT_Y + Math.sin(time * 2.2) * 0.012 - dip;
      float.rotation.z = Math.sin(time * 1.7) * 0.12;

      // 낚인 것
      for (const id in items) items[id].visible = id === item;
      if (item) {
        const o = items[item];
        o.position.copy(itemPos);
        o.rotation.set(0, me.yaw + Math.PI / 2, Math.sin(time * 17) * 0.38 * wiggle);
      }
      // 낚싯줄: 낚싯대 끝에서 찌(또는 낚인 것의 머리)까지
      const to = item ? end.set(itemPos.x, itemPos.y + items[item].userData.hook, itemPos.z) : float.position;
      const p = lineGeo.attributes.position;
      p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, to.x, Math.max(0.015, to.y), to.z); p.needsUpdate = true;
      line.visible = s.k > 0.5;
    },
  };
}
