// 여우 한 마리. 들판을 여기저기 돌아다닌다: 조금 걷다가 멈춰 서서 둘러보고, 가끔 앉았다가, 다시 걷는다.
// 여우가 지금 어디에 있는지는 오직 세계 시각으로 정해진다 (foxAt). 그래서 누가 언제 들어와도 같은 순간에 같은 자리에서 같은 여우를 본다.
// 펭귄을 피해 달아나지 않고 제 갈 길을 가되, 가까이 오면 고개를 돌려 쳐다본다. 지나간 자리에는 작은 발자국이 남는다.
// 펭귄처럼 공·원뿔 같은 기본 도형만 쓴다.
import * as THREE from 'three';
import { printAlpha } from './clock.js';
import { IGLOOS, HOLES } from './igloo.js';

const ORANGE = '#e8853b', CREAM = '#fbf1e0', SOCK = '#4b342c', INK = '#17181d';

const BLOCK_MS = 210e3;          // 3분 30초마다 새 목적지를 정한다
const LEGS = 6;                  // 목적지까지 가는 길을 여섯 토막으로 나눈다. 토막마다 걷고 나서 쉰다
const LEG_MS = BLOCK_MS / LEGS;  // 한 토막 35초
const ROAM = 68;                 // 가운데에서 이만큼까지 돌아다닌다 (들판의 반지름은 78)
const KEEP = 6;                  // 목적지는 나무에서 이만큼은 떨어진 곳에 잡는다
const CLEAR = 4;                 // 걷는 길은 나무 둥치에서 이만큼은 떨어져 지나간다
/** 돌아가야 하는 곳들: 나무, 이글루(문간까지), 낚시 구멍 */
const AVOID = [{ x: 0, z: 0, r: CLEAR }, ...IGLOOS.map((g) => ({ x: g.x, z: g.z, r: g.radius + 2.4 })), ...HOLES.map((h) => ({ x: h.x, z: h.z, r: 2.6 }))];
const WALK = 1.15;               // 평소 걷는 빠르기 (단위/초) — 펭귄보다 조금 느려서 따라잡을 수 있다
const STRIDE = 0.5;              // 걸음 한 주기에 나아가는 거리
const PAW_STEP = 0.3;            // 발자국 사이의 거리
export const PAW_LIFE_MS = 12 * 60e3;   // 여우 발자국은 12분에 걸쳐 흐려진다 (그 끝에 여우가 있다)
const NOTICE = 9;                // 펭귄이 이만큼 가까이 오면 쳐다본다

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** 두 정수 → 0..1 의 정해진 값 (언제 불러도 같다) */
function rand(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 들판 안, 나무와 이글루 밖으로 */
function keepIn(p) {
  const r = Math.hypot(p.x, p.z);
  if (r > ROAM) { p.x *= ROAM / r; p.z *= ROAM / r; } else if (r < KEEP) { if (r < 1e-6) { p.x = KEEP; p.z = 0; } else { p.x *= KEEP / r; p.z *= KEEP / r; } }
  for (const o of AVOID.slice(1)) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), keep = o.r + 2;
    if (d < keep) { const k = d < 1e-6 ? 0 : keep / d; p.x = d < 1e-6 ? o.x - keep : o.x + dx * k; p.z = o.z + dz * k; }
  }
  return p;
}
/** b 번째 목적지 */
function spot(b, k = 0) {
  const ang = rand(b, 1 + k * 1000) * Math.PI * 2, r = KEEP + (ROAM - KEEP) * Math.sqrt(rand(b, 2 + k * 1000));
  return keepIn({ x: Math.sin(ang) * r, z: Math.cos(ang) * r });
}

const cache = new Map();
/** b 번째 구간의 길: 목적지에서 다음 목적지까지, 살짝 구불구불한 일곱 점 */
function route(b, k = 0) {
  const key = k * 1e9 + b;
  let pts = cache.get(key);
  if (pts) return pts;
  const A = spot(b, k), B = spot(b + 1, k), dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len, amp = Math.min(14, len * 0.22);
  pts = [A];
  for (let i = 1; i < LEGS; i++) {
    const t = i / LEGS, side = (rand(b, 10 + i + k * 1000) - 0.5) * 2 * amp, along = (rand(b, 30 + i + k * 1000) - 0.5) * amp * 0.6;
    pts.push(keepIn({ x: A.x + dx * t + nx * side + (dx / len) * along, z: A.z + dz * t + nz * side + (dz / len) * along }));
  }
  pts.push(B);
  detour(pts);
  if (cache.size > 48) cache.clear();
  cache.set(key, pts);
  return pts;
}

/**
 * 나무나 이글루를 가로지르는 토막이 없게 한다: 너무 가까이 스치는 토막은, 가운데 점들을 옆으로 밀어 돌아가게 한다.
 * (처음과 끝 점은 앞뒤 구간과 이어져 있으므로 움직이지 않는다)
 */
function detour(pts) {
  const last = pts.length - 1;
  for (let round = 0; round < 8; round++) {
    let moved = false;
    for (const o of AVOID) for (let i = 0; i < last; i++) {
      const P = pts[i], Q = pts[i + 1], dx = Q.x - P.x, dz = Q.z - P.z, len2 = dx * dx + dz * dz;
      if (len2 < 1e-9) continue;
      const t = clamp(-((P.x - o.x) * dx + (P.z - o.z) * dz) / len2, 0, 1), cx = P.x + dx * t - o.x, cz = P.z + dz * t - o.z, d = Math.hypot(cx, cz);
      if (d >= o.r) continue;
      // 그곳에서 멀어지는 쪽 (정확히 한가운데를 지나면 길의 옆쪽 아무 데나)
      const len = Math.sqrt(len2), nx = d > 1e-6 ? cx / d : -dz / len, nz = d > 1e-6 ? cz / d : dx / len, push = o.r - d + 0.6;
      const canP = i > 0, canQ = i + 1 < last;
      if (canP && canQ) { P.x += nx * push; P.z += nz * push; Q.x += nx * push; Q.z += nz * push; }
      else if (canQ) { const k = push / Math.max(0.2, t); Q.x += nx * k; Q.z += nz * k; }
      else if (canP) { const k = push / Math.max(0.2, 1 - t); P.x += nx * k; P.z += nz * k; }
      moved = true;
    }
    if (!moved) break;
  }
  for (let i = 1; i < last; i++) { const r = Math.hypot(pts[i].x, pts[i].z); if (r > ROAM) { pts[i].x *= ROAM / r; pts[i].z *= ROAM / r; } }
}

/** n 번째 토막 (n = 구간 번호 × 6 + 토막 번호): 어디서 어디로, 언제부터, 걷는 데 얼마나 */
function leg(n, k = 0) {
  const b = Math.floor(n / LEGS), i = n - b * LEGS, pts = route(b, k);
  const P = pts[i], Q = pts[i + 1], dx = Q.x - P.x, dz = Q.z - P.z, len = Math.hypot(dx, dz);
  const walk = clamp(len / WALK * 1000, 2500, LEG_MS - 7000);       // 먼 길은 종종걸음으로, 그래도 적어도 7초는 쉰다
  return { n, P, Q, len, yaw: len > 1e-6 ? Math.atan2(dx, dz) : 0, start: n * LEG_MS, walk, rest: LEG_MS - walk, seed: rand(n, 77 + k * 1000) };
}
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** 마지막 안전장치: 그래도 나무 둥치나 이글루 안으로 들어가는 자리는 밖으로 밀어낸다 (길을 미리 돌려 두므로 쓰일 일은 거의 없다) */
function clear(x, z) {
  for (const o of AVOID) {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), keep = o.r - 1.6;
    if (d < keep && d > 1e-6) return { x: o.x + dx * keep / d, z: o.z + dz * keep / d };
  }
  return { x, z };
}

/**
 * 세계 시각 ms 에 여우가 어디서 무엇을 하고 있는가.
 * @returns {{ x: number, z: number, yaw: number, move: number, sit: number, phase: number, look: number, speed: number, resting: boolean }}
 *   move 0..1 걷는 정도, sit 0..1 앉은 정도, phase 걸음 주기, look 혼자 둘러보는 고개 각도(라디안)
 *   k: 몇 번째 여우인가 (여우마다 다니는 길이 다르다. 0 은 붉은여우, 1 은 북극여우)
 */
export function foxAt(ms, k = 0) {
  const n = Math.floor(ms / LEG_MS), L = leg(n, k), t = ms - L.start;
  if (t < L.walk) {
    const p = t / L.walk, at = clear(L.P.x + (L.Q.x - L.P.x) * p, L.P.z + (L.Q.z - L.P.z) * p);
    return { x: at.x, z: at.z, yaw: L.yaw, move: Math.min(1, t / 450, (L.walk - t) / 450), sit: 0, phase: (p * L.len / STRIDE) % 1, look: 0, speed: L.len / L.walk * 1000, resting: false };
  }
  // 쉬는 동안: 멈춰 서서 둘러보고, 넉넉하면 앉았다가, 끝날 무렵 다음에 갈 쪽으로 몸을 돌린다
  const r = t - L.walk, next = leg(n + 1, k), turn = smooth((r - (L.rest - 1500)) / 1300);
  const at = clear(L.Q.x, L.Q.z);
  const sit = L.rest > 12000 ? smooth((r - 1400) / 900) * (1 - smooth((r - (L.rest - 3300)) / 900)) : 0;
  const settle = smooth(r / 900) * (1 - smooth((r - (L.rest - 2200)) / 700));
  return {
    x: at.x, z: at.z, yaw: L.yaw + angleDiff(next.yaw, L.yaw) * turn, move: turn > 0 && turn < 1 ? 0.35 : 0, sit, speed: 0, resting: true,
    phase: (r / 520) % 1, look: 0.75 * Math.sin(r / 1000 * 0.85 + L.seed * 6.28) * settle,
  };
}

/** (t0, t1] 사이에 찍힌 여우 발자국들: [x, z, 방향, 찍힌 시각] */
export function pawsBetween(t0, t1, k = 0) {
  const out = [];
  for (let n = Math.floor(t0 / LEG_MS), last = Math.floor(t1 / LEG_MS); n <= last; n++) {
    const L = leg(n, k), count = Math.floor(L.len / PAW_STEP);
    const sx = Math.cos(L.yaw), sz = -Math.sin(L.yaw);               // 걷는 방향의 옆쪽
    for (let k = 1; k <= count; k++) {
      const p = k * PAW_STEP / L.len, birth = L.start + p * L.walk;
      if (birth <= t0 || birth > t1) continue;
      const side = (k % 2 ? 1 : -1) * 0.045, at = clear(L.P.x + (L.Q.x - L.P.x) * p, L.P.z + (L.Q.z - L.P.z) * p);
      out.push([at.x + sx * side, at.z + sz * side, L.yaw, birth]);
    }
  }
  return out;
}

// ---------- 모습 ----------
/** 털빛: 붉은여우와 북극여우 */
export const COATS = {
  red: { orange: ORANGE, cream: CREAM, sock: SOCK },
  arctic: { orange: '#f3f6fb', cream: '#ffffff', sock: '#c7d3e6' },      // 북극여우: 온통 하얗고, 발과 귀 끝만 옅은 잿빛
};
function build(coat = COATS.red) {
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const M = { orange: mat(coat.orange), cream: mat(coat.cream), sock: mat(coat.sock), ink: mat(INK) };
  const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), m); o.scale.set(sx, sy, sz); return o; };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);                   // 걸을 때 들썩이고, 앉을 때 뒤가 내려가는 몸

  // 몸통: 누운 달걀. 가슴과 배는 크림색
  const torso = ball(0.2, M.orange, 1.0, 0.98, 1.75); torso.position.set(0, 0.4, -0.02); body.add(torso);
  const chest = ball(0.15, M.cream, 1.0, 1.0, 1.15); chest.position.set(0, 0.35, 0.17); body.add(chest);

  // 머리: 몸에 비해 크고 둥글게. 볼과 주둥이는 크림색, 까만 코와 점 눈, 끝이 까만 큰 귀
  const head = new THREE.Group(); head.position.set(0, 0.56, 0.3); body.add(head);
  const skull = ball(0.215, M.orange, 1.1, 0.96, 1.0); skull.position.set(0, 0.1, 0.07); head.add(skull);
  const cheeks = ball(0.15, M.cream, 1.32, 0.72, 0.95); cheeks.position.set(0, 0.035, 0.14); head.add(cheeks);
  const snout = ball(0.075, M.cream, 1.0, 0.82, 1.35); snout.position.set(0, 0.05, 0.27); head.add(snout);
  const nose = ball(0.03, M.ink, 1.15, 0.9, 1); nose.position.set(0, 0.07, 0.365); head.add(nose);
  [-1, 1].forEach((s) => { const e = ball(0.026, M.ink); e.position.set(s * 0.092, 0.135, 0.255); head.add(e); });
  const ears = [-1, 1].map((s) => {
    const ear = new THREE.Group(); ear.position.set(s * 0.125, 0.25, 0.03); ear.rotation.z = -s * 0.24;
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.19, 14), M.orange); outer.position.y = 0.075; outer.scale.z = 0.62; ear.add(outer);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.1, 12), M.sock); tip.position.y = 0.123; tip.scale.z = 0.66; ear.add(tip);
    head.add(ear); return ear;
  });

  // 다리 넷: 짧고, 아래쪽은 양말을 신은 듯 짙다 (엉덩이·어깨를 축으로 앞뒤로 흔든다)
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.105, 0.3, sz * 0.2 - 0.02);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.043, 0.16, 10), M.orange); up.position.y = -0.07; pivot.add(up);
    const low = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.04, 0.15, 10), M.sock); low.position.y = -0.2; pivot.add(low);
    const paw = ball(0.05, M.sock, 1, 0.6, 1.25); paw.position.set(0, -0.275, 0.012); pivot.add(paw);
    pivot.userData = { home: pivot.position.clone(), front: sz > 0 };
    body.add(pivot); return pivot;
  });

  // 꼬리: 크고 복슬복슬, 끝은 크림색 (살랑살랑 흔든다)
  const tail = new THREE.Group(); tail.position.set(0, 0.43, -0.32); body.add(tail);
  const brush = ball(0.14, M.orange, 0.95, 0.95, 2.1); brush.position.set(0, 0, -0.26); tail.add(brush);
  const tip = ball(0.105, M.cream, 0.95, 0.95, 1.25); tip.position.set(0, 0, -0.5); tail.add(tip);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(0.92);
  root.userData = { body, head, ears, legs, tail };
  return root;
}

/**
 * 자세. s: foxAt 이 돌려준 것, headYaw: 고개를 돌린 각도(라디안), time: 흐른 시간(초, 꼬리와 귀의 잔움직임용)
 */
function pose(root, s, headYaw, time) {
  const u = root.userData, a = s.phase * Math.PI * 2, w = Math.sin(a) * s.move, sit = s.sit;
  // 몸: 걸을 때 살짝 들썩이고, 앉으면 엉덩이가 내려가며 앞이 들린다
  u.body.position.y = Math.abs(Math.cos(a)) * 0.018 * s.move - sit * 0.105;
  u.body.rotation.x = -sit * 0.5;
  u.body.position.z = sit * 0.03;
  // 다리: 대각선끼리 짝을 지어 흔든다. 앉으면 뒷다리는 앞으로 접고, 앞다리는 곧게 세운다
  u.legs.forEach((leg, i) => {
    const front = leg.userData.front, pair = i === 0 || i === 3 ? 1 : -1;
    leg.rotation.x = pair * w * 0.62 + sit * (front ? 0.5 : -1.05);
    leg.position.y = leg.userData.home.y + Math.max(0, pair * w) * 0.025 + sit * (front ? 0 : 0.045);
  });
  // 꼬리: 살랑살랑. 걸을 때는 뒤로 뻗고, 앉으면 옆으로 감아 몸 곁에 둔다
  u.tail.rotation.x = 0.28 - s.move * 0.18 + sit * 0.3;
  u.tail.rotation.y = Math.sin(time * 2.1) * (0.2 + 0.12 * s.move) * (1 - sit) + sit * (1.25 + Math.sin(time * 1.3) * 0.08);
  // 머리: 고개 돌리기 + 걸을 때의 끄덕임. 앉아서 몸이 들린 만큼은 도로 숙여 앞을 본다
  u.head.rotation.y = headYaw;
  u.head.rotation.x = sit * 0.5 + Math.sin(a * 2) * 0.03 * s.move + Math.abs(headYaw) * 0.05;
  u.head.rotation.z = -headYaw * 0.12;
  // 귀: 가끔 쫑긋
  const twitch = Math.max(0, Math.sin(time * 0.9) - 0.93) * 6;
  u.ears[0].rotation.x = -twitch * 0.25; u.ears[1].rotation.x = -Math.max(0, Math.sin(time * 0.9 + 2.3) - 0.93) * 1.5;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addPaw: Function, clearPaws: Function }} tracks
 * @param {{ skipPaw?: (x: number, z: number) => boolean }} [o] skipPaw: 발자국이 남지 않는 자리 (얼음 위)
 */
export function createFox(scene, tracks, { skipPaw = () => false, kind = 0, coat = COATS.red, clearsPaws = kind === 0 } = {}) {      // (발자국 지우기는 첫 여우만 한다: 같은 순간에 함께 지우면 서로의 발자국을 지운다)
  const root = build(coat);
  scene.add(root);
  let headYaw = 0, time = 0, pawsUntil = null, state = foxAt(0, kind), held = null, startled = 0, startles = 0, greeted = 0, greets = 0;

  return {
    root,
    /** 지금의 상태 (점검용) */
    get state() { return state; },
    get headYaw() { return headYaw; },
    get startles() { return startles; }, get startled() { return startled > 0; },
    /** 펭귄이 가까이에서 파닥이면 깜짝 놀라 폴짝 뛰고 고개를 홱 돌려 쳐다본다. me: 펭귄의 자리. 가까이 있었으면 true */
    startle(me) {
      if (Math.hypot(me.x - state.x, me.z - state.z) > NOTICE) return false;
      startled = 1.8; startles++;
      return true;
    },
    /** 펭귄이 가까이서 인사하면 쳐다보며 꼬리를 살랑살랑 흔든다. 가까이 있었으면 true */
    greet(me) {
      if (Math.hypot(me.x - state.x, me.z - state.z) > NOTICE * 0.6) return false;
      greeted = 2.6; greets++;
      return true;
    },
    get greets() { return greets; }, get greeted() { return greeted > 0; },
    at: (ms) => foxAt(ms, kind),
    /** 점검·시안용: 여우를 한 자리에 세워 둔다 ({ x, z, yaw, move, sit, phase, look } 또는 null 로 풀기) */
    hold(s) { held = s ? { x: 0, z: 0, yaw: 0, move: 0, sit: 0, phase: 0, look: 0, speed: 0, resting: true, ...s } : null; },
    /**
     * @param {number} now 세계 시각(ms)  @param {number} dt 흐른 시간(초)  @param {{ x: number, z: number }} me 펭귄의 자리
     */
    update(now, dt, me) {
      time += dt;
      state = held || foxAt(now, kind);
      root.position.set(state.x, 0, state.z);
      root.rotation.y = state.yaw;
      // 펭귄이 가까이 오면 그쪽으로 고개를 돌린다 (멀면 혼자 둘러본다)
      const dx = me.x - state.x, dz = me.z - state.z, dist = Math.hypot(dx, dz);
      const notice = dist > 0.4 ? 1 - smooth((dist - NOTICE * 0.55) / (NOTICE * 0.45)) : 0;
      const toward = clamp(angleDiff(Math.atan2(dx, dz), state.yaw), -1.35, 1.35);
      startled = Math.max(0, startled - dt); greeted = Math.max(0, greeted - dt);
      const want = startled > 0 || greeted > 0 ? toward : state.look * (1 - notice) + toward * notice * (state.resting ? 1 : 0.6);      // 놀란 동안에는 펭귄만 본다
      headYaw += (want - headYaw) * (dt > 0 ? 1 - Math.exp(-dt * (startled > 0 ? 14 : 5)) : 1);
      pose(root, state, headYaw, time);
      if (greeted > 0) { const g = Math.min(1, greeted / 0.4, (2.6 - greeted) / 0.3); root.userData.tail.rotation.y += Math.sin(time * 16) * 0.55 * g; root.userData.head.rotation.z = Math.sin(time * 3) * 0.18 * g; }      // 꼬리 살랑, 고개 갸웃
      if (startled > 1.35) { const u = (1.8 - startled) / 0.45; root.position.y = Math.sin(Math.PI * u) * 0.22; }      // 폴짝
      // 지나온 길의 발자국: 처음 들어왔거나 시계가 건너뛰었으면 지난 12분치를 한꺼번에 찍고, 그 뒤로는 새로 생긴 것만 보탠다
      if (held) return;
      let from = pawsUntil;
      if (from === null || now < from || now - from > PAW_LIFE_MS) { if (clearsPaws) tracks.clearPaws(); from = now - PAW_LIFE_MS; }
      if (now > from) for (const [x, z, yaw, birth] of pawsBetween(from, now, kind)) if (!skipPaw(x, z) && printAlpha(birth, now, PAW_LIFE_MS) > 0.01) tracks.addPaw(x, z, yaw, birth, PAW_LIFE_MS);
      pawsUntil = now;
    },
  };
}
