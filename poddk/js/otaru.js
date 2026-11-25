// 오타루 거리: 들판 남쪽 끝에 오타루의 겨울 명소들을 작게 모아 놓았다.
//   · 오타루 운하: 곧게 흐르는 운하, 가스등 둑길, 건너편의 돌 창고들. 해가 지면 가스등과 창이 켜지고 물에 불빛이 비친다.
//     가운데에는 운하를 건너는 돌다리(아사쿠사바시를 닮은)가 있고, 건너편 광장에 유리 공방이 있다.
//   · 유리 공방: 기름 램프가 잔뜩 켜진 돌 건물. 문 앞에서 🔮 단추로 작은 유리 구슬을 만든다 (색과 무늬는 그때그때).
//   · 메르헨 교차로 (운하 동쪽 끝): 증기시계가 15분마다 증기를 뿜으며 노래하고, 붉은 벽돌 오르골당 앞에서는 오르골 캐롤이 크게 들린다.
//   · 옛 데미야선 (운하 서쪽 끝): 눈에 묻힌 옛 철길. 운하 둑길처럼 🕯️ 눈 등불을 놓을 수 있다 (오타루 눈빛거리 축제의 두 무대).
//   · 인력거: 펭귄 인력거꾼이 둑길을 천천히 오간다. 곁에서 👋 인사하면 반겨 준다.
//   · 눈 등불은 다른 펭귄에게도 보이고, 여섯 시간 동안 남는다 (발자국처럼 서버가 들고 있다).
import * as THREE from 'three';
import { build as buildPenguin, pose } from './penguin.js';

const DEG = 160, FAR = 58;                        // 트리에서 본 방향(도)과 운하 가운데까지의 거리
const LEN = 22, WATER = 2.3;                       // 운하 길이의 반, 물 너비의 반
const n = { x: Math.sin(DEG * Math.PI / 180), z: Math.cos(DEG * Math.PI / 180) };      // 트리에서 멀어지는 쪽 (운하를 가로지르는 쪽)
const u = { x: n.z, z: -n.x };                                                         // 운하를 따라가는 쪽
const C = { x: n.x * FAR, z: n.z * FAR };
/** 운하 기준의 자리 (s: 운하를 따라, t: 트리 쪽이 - , 창고 쪽이 +) → 들판 자리 */
export const at = (s, t) => ({ x: C.x + u.x * s + n.x * t, z: C.z + u.z * s + n.z * t });
/** 들판 자리 → 운하 기준의 자리 */
export function canalCoord(x, z) { const dx = x - C.x, dz = z - C.z; return { s: dx * u.x + dz * u.z, t: dx * n.x + dz * n.z }; }
export const CANAL = { x: C.x, z: C.z, len: LEN, water: WATER, yaw: Math.atan2(u.x, u.z), start: at(0, -5) };
export const BRIDGE = { s: -1.5, half: 1.5 };                                            // 돌다리: 운하를 따라 이 자리에, 너비의 반
const WAREHOUSES = [-19, -11.5, 9, 16.5].map((s, i) => ({ s, t: 6.6, w: 7, d: 6, h: 4.2 + (i % 2) * 0.8 }));
const GLASS = { s: BRIDGE.s, t: 12.8, w: 8, d: 5.6, h: 4.6 };                            // 유리 공방 (다리 건너 광장 끝)
const CROSS = { s: 31, t: -2.5 };                                                        // 메르헨 교차로의 증기시계
const ORGEL = { s: 31, t: 6.8, w: 9, d: 6, h: 6 };                                       // 오르골당
const RAIL = { s: -31, from: -18, to: 9 };                                               // 옛 데미야선 (운하 서쪽 끝을 가로지른다)
export const SHOP = at(ORGEL.s, ORGEL.t - ORGEL.d / 2 - 0.9);                            // 오르골당 문 앞
export const GLASS_DOOR = at(GLASS.s, GLASS.t - GLASS.d / 2 - 0.9);                     // 유리 공방 문 앞
export const CLOCK = at(CROSS.s, CROSS.t);                                               // 증기시계
export const RAIL_MID = at(RAIL.s, (RAIL.from + RAIL.to) / 2);
/** 걸어서 들어갈 수 없는 곳들: 물(작은 동그라미를 줄지어, 다리 자리는 비운다), 건물들, 증기시계 */
const box = (b, pad = 0.3) => [-1, 0, 1].map((k) => ({ ...at(b.s + k * (b.w / 3), b.t), r: b.d / 2 + pad }));
export const CANAL_BLOCKS = [
  ...Array.from({ length: Math.round((2 * LEN) / 1.1) + 1 }, (_, k) => -LEN + k * 1.1)      // (촘촘히 놓아 물가가 곧다)
    .filter((s) => Math.abs(s - BRIDGE.s) >= BRIDGE.half + WATER - 0.1).map((s) => ({ ...at(s, 0), r: WATER })),
  ...WAREHOUSES.flatMap((h) => box(h)), ...box(GLASS), ...box(ORGEL),
  { ...CLOCK, r: 0.95 },
];
/** 풀이 나지 않고 선물·눈송이·여우가 들어오지 않는 곳들 */
export const CANAL_CLEARS = [
  { x: C.x, z: C.z, r: LEN + 6 }, { ...at(CROSS.s, 2), r: 10 }, { ...at(GLASS.s, 10), r: 8 },
  ...[-14, -6, 2, 8].map((t) => ({ ...at(RAIL.s, t), r: 4.5 })),
];
const inRail = (c) => Math.abs(c.s - RAIL.s) < 2.4 && c.t > RAIL.from && c.t < RAIL.to;
/** 눈 등불을 놓을 수 있는 곳: 운하 둑길과 옛 데미야선 */
export function onWalk(x, z) { const c = canalCoord(x, z); return (Math.abs(c.s) < LEN + 1 && c.t < -WATER - 0.2 && c.t > -9) || inRail(c); }
/** 옛 데미야선 위인가 */
export function onRail(x, z) { return inRail(canalCoord(x, z)); }
/** 오타루 거리 언저리인가 */
export function nearCanal(x, z) { const c = canalCoord(x, z); return c.s > RAIL.s - 6 && c.s < CROSS.s + 8 && c.t > -14 && c.t < 16; }
/** 여우 같은 들짐승이 오타루 거리에 들어오지 않게: 거리 안이면 트리 쪽 가장자리로 옮긴다 (트리 쪽 반평면이라 두 점 사이 길도 거리 밖) */
export function keepOut(p) { const c = canalCoord(p.x, p.z); if (c.s > RAIL.s - 6 && c.s < CROSS.s + 9 && c.t > -15) { const q = at(c.s, -15); p.x = q.x; p.z = q.z; } return p; }
/** 유리 구슬: 색과 무늬 (만들 때마다 하나를 고른다) */
export const BEADS = [
  { id: 'sky', name: '하늘빛 유리 구슬', color: '#8fd3ff', swirl: '#ffffff', say: '맑은 겨울 하늘을 담았어요' },
  { id: 'snow', name: '눈꽃 유리 구슬', color: '#e9f4ff', swirl: '#9cc7ef', say: '안에 작은 눈꽃이 피어 있어요' },
  { id: 'canal', name: '운하빛 유리 구슬', color: '#3f8f9a', swirl: '#ffd27a', say: '밤 운하에 비친 가스등 불빛 같아요' },
  { id: 'sakura', name: '벚꽃 유리 구슬', color: '#ffc2d6', swirl: '#ffffff', say: '봄을 기다리는 분홍빛이에요' },
  { id: 'amber', name: '호박빛 유리 구슬', color: '#f0a64a', swirl: '#fff1c9', say: '기름 램프처럼 따뜻한 빛이에요' },
  { id: 'aurora', name: '오로라 유리 구슬', color: '#7fe3b8', swirl: '#b98cff', say: '초록에서 보랏빛으로 일렁여요. 아주 드물어요!', rare: true },
];

const LANTERN_LIFE = 6 * 3600e3, LANTERN_MAX = 200;

function stoneTexture(base = [141, 132, 120], seed = 0) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = `rgb(${base[0] - 14},${base[1] - 14},${base[2] - 14})`; x.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 16; r++) for (let k = 0; k < 6; k++) {
    const off = (r % 2) * 21, bx = k * 43 - off, by = r * 16, d = ((r * 7 + k * 13 + seed) % 5) * 7 - 14;
    x.fillStyle = `rgb(${base[0] + d},${base[1] + d},${base[2] + d})`; x.fillRect(bx + 1, by + 1, 41, 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function glowTexture(inner = 'rgba(255,214,140,1)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(0.35, 'rgba(255,180,90,0.45)'); g.addColorStop(1, 'rgba(255,160,70,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function steamTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(245,248,255,0.4)'); g.addColorStop(1, 'rgba(240,245,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTexture(text, w = 512, h = 160, bg = '#6b4428', fg = '#fff3c4') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.beginPath(); if (x.roundRect) x.roundRect(4, 4, w - 8, h - 8, 26); else x.rect(4, 4, w - 8, h - 8); x.fill();
  x.fillStyle = fg; x.font = `900 ${Math.round(h * 0.42)}px NanumSquareRound, system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 램프가 잔뜩 켜진 창 안쪽 (유리 공방): 어두운 바탕에 작은 불빛 점들 */
function lampsTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#3a2a1e'; x.fillRect(0, 0, 128, 160);
  for (let k = 0; k < 40; k++) {
    const px = 8 + (k * 37) % 112, py = 10 + ((k * 53) % 140), r = 3 + (k % 3);
    const g = x.createRadialGradient(px, py, 0, px, py, r * 3); g.addColorStop(0, 'rgba(255,230,160,1)'); g.addColorStop(1, 'rgba(255,170,80,0)');
    x.fillStyle = g; x.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 시계 판 */
function clockFace() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fbf6e6'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#3b3326'; x.lineWidth = 5; x.stroke();
  x.fillStyle = '#3b3326'; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; x.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 5, 4, 10); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 유리 구슬 모형 (만든 것을 보여 주는 창에 쓴다) */
export function makeBead(id) {
  const b = BEADS.find((x) => x.id === id) || BEADS[0];
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), new THREE.MeshPhysicalMaterial({ color: b.color, roughness: 0.05, metalness: 0, transmission: 0.6, thickness: 0.4, transparent: true, opacity: 0.82, clearcoat: 1 }));
  g.add(shell);
  for (let k = 0; k < 3; k++) {      // 안의 소용돌이 무늬
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16 - k * 0.03, 0.012, 8, 40, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: b.swirl, emissive: b.swirl, emissiveIntensity: 0.25 }));
    sw.rotation.set(k * 1.1, k * 0.7, k * 0.5); g.add(sw);
  }
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); shine.position.set(-0.12, 0.14, 0.22); g.add(shine);
  return g;
}

export function createOtaru(scene) {
  const g = new THREE.Group(); scene.add(g);
  const yaw = Math.atan2(u.x, u.z), R = Math.atan2(-u.z, u.x);      // yaw: +z 가 운하를 따라 / R: +x 가 운하를 따라, +z 가 트리 반대쪽
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
  const place = (m, s, y, t, rotY = 0) => { const p = at(s, t); m.position.set(p.x, y, p.z); m.rotation.y = yaw + rotY; g.add(m); return m; };
  const put = (m, s0, y, t, rx = 0) => { const p = at(s0, t); m.position.set(p.x, y, p.z); m.rotation.order = 'YXZ'; m.rotation.y = R; m.rotation.x = rx; g.add(m); return m; };
  const front = (m, s0, y, t) => { put(m, s0, y, t); m.rotation.y = R + Math.PI; return m; };      // 트리 쪽(앞)을 보게
  const snow = mat('#ffffff', { roughness: 1 }), iron = mat('#2b2e35', { roughness: 0.6 }), wood = mat('#5a3a24');
  const glowTex = glowTexture();
  const windowMat = new THREE.MeshStandardMaterial({ color: '#2a2f3a', emissive: '#ffb45c', emissiveIntensity: 0, roughness: 0.4 });
  const roof = mat('#3e4654');

  // ---------- 운하 ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f5a66', roughness: 0.12, metalness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER * 2, LEN * 2), waterMat); water.rotation.x = -Math.PI / 2;
  place(water, 0, 0.03, 0).rotation.set(-Math.PI / 2, 0, yaw);      // (눈밭 바로 위에: 땅보다 낮으면 눈에 가린다)
  const stone = mat('#9b948a');
  for (const side of [-1, 1]) for (const [a, b] of [[-LEN - 0.3, BRIDGE.s - BRIDGE.half], [BRIDGE.s + BRIDGE.half, LEN + 0.3]]) {
    const len = b - a, mid = (a + b) / 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, len), stone); place(wall, mid, 0.0, side * (WATER + 0.2)); wall.receiveShadow = true;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, len + 0.1), snow), mid, 0.3, side * (WATER + 0.2));
  }
  // ---------- 돌다리 ----------
  {
    const deckMat = mat('#a8a197'), rail = mat('#8d867c');
    put(new THREE.Mesh(new THREE.BoxGeometry(BRIDGE.half * 2, 0.12, WATER * 2 + 1.6), deckMat), BRIDGE.s, 0.06, 0).receiveShadow = true;
    put(new THREE.Mesh(new THREE.BoxGeometry(BRIDGE.half * 2 - 0.2, 0.04, WATER * 2 + 1.4), snow), BRIDGE.s, 0.13, 0);
    for (const side of [-1, 1]) {
      // 난간: 낮은 돌기둥 넷과 그 위의 가로대, 소복한 눈
      for (const t of [-WATER - 0.6, -1, 1, WATER + 0.6]) {
        put(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), rail), BRIDGE.s + side * (BRIDGE.half - 0.1), 0.42, t);
        put(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), snow), BRIDGE.s + side * (BRIDGE.half - 0.1), 0.79, t);
      }
      put(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, WATER * 2 + 1.3), rail), BRIDGE.s + side * (BRIDGE.half - 0.1), 0.62, 0);
      // 다리 옆면: 물 위로 둥근 아치 모양 돌판
      const sh = new THREE.Shape(); const W = WATER + 0.8;
      sh.moveTo(-W, 0.12); sh.lineTo(W, 0.12); sh.lineTo(W, -0.35); sh.lineTo(WATER, -0.35); sh.absarc(0, -0.35, WATER, 0, Math.PI, false); sh.lineTo(-W, -0.35); sh.closePath();
      const face = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), new THREE.MeshStandardMaterial({ color: '#a8a197', roughness: 0.9, side: THREE.DoubleSide }));
      const p = at(BRIDGE.s + side * BRIDGE.half, 0); face.position.set(p.x, 0, p.z); face.rotation.y = R + Math.PI / 2; face.scale.y = 0.45; g.add(face);
    }
  }
  // ---------- 돌 창고들 ----------
  const wallTex = stoneTexture();
  const gableRoof = (h, tex, pad = 0.45) => {
    const half = h.d / 2 + pad, tilt = 0.5, rise = Math.sin(tilt) * half / 2;
    for (const side of [-1, 1]) {
      put(new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.6, 0.22, half), roof), h.s, h.h + rise + 0.05, h.t + side * Math.cos(tilt) * half / 2, side * tilt);
      put(new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.5, 0.12, half - 0.1), snow), h.s, h.h + rise + 0.2, h.t + side * Math.cos(tilt) * half / 2, side * tilt);
    }
    for (const side of [-1, 1]) {
      const tri = new THREE.Shape(); tri.moveTo(-h.d / 2, 0); tri.lineTo(h.d / 2, 0); tri.lineTo(0, rise * 2 + 0.1); tri.closePath();
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
      const p = at(h.s + side * h.w / 2, h.t); gable.position.set(p.x, h.h, p.z); gable.rotation.y = R + Math.PI / 2; g.add(gable);
    }
  };
  const archWindow = (s0, y, t, m = windowMat, w = 0.9, hgt = 1.3) => {
    front(new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), m), s0, y, t);
    front(new THREE.Mesh(new THREE.CircleGeometry(w / 2, 16, 0, Math.PI), m), s0, y + hgt / 2, t);
  };
  for (const h of WAREHOUSES) {
    const tex = wallTex.clone(); tex.needsUpdate = true; tex.repeat.set(h.w / 3, h.h / 3);
    const body = put(new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })), h.s, h.h / 2, h.t);
    body.castShadow = body.receiveShadow = true;
    gableRoof(h, tex);
    for (const k of [-1, 0, 1]) archWindow(h.s + k * (h.w / 3.2), h.h * 0.5, h.t - h.d / 2 - 0.02);
  }
  // ---------- 유리 공방 (다리 건너 광장) ----------
  const lampsTex = lampsTexture();
  const lampsMat = new THREE.MeshStandardMaterial({ map: lampsTex, emissive: '#ffffff', emissiveMap: lampsTex, emissiveIntensity: 0.25, roughness: 0.3 });
  {
    const h = GLASS, tex = stoneTexture([170, 160, 146], 3); tex.repeat.set(h.w / 3, h.h / 3);
    put(new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })), h.s, h.h / 2, h.t).castShadow = true;
    gableRoof(h, tex);
    for (const k of [-1.5, 0.5, 1.5]) archWindow(h.s + k * 1.8, h.h * 0.42, h.t - h.d / 2 - 0.02, lampsMat, 1.2, 1.6);
    front(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.1), lampsMat), h.s - 0.9, 1.05, h.t - h.d / 2 - 0.03);
    front(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.75), new THREE.MeshStandardMaterial({ map: signTexture('🔮 유리 공방', 512, 150, '#2f4d5e'), roughness: 0.8 })), h.s, h.h * 0.86, h.t - h.d / 2 - 0.05);
  }
  // ---------- 오르골당 (메르헨 교차로) ----------
  {
    const h = ORGEL, tex = stoneTexture([158, 76, 54], 5); tex.repeat.set(h.w / 3, h.h / 3);
    put(new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })), h.s, h.h / 2, h.t).castShadow = true;
    put(new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.4, 0.25, h.d + 0.4), mat('#e8e0d0')), h.s, h.h * 0.5, h.t);      // 층 사이 흰 띠
    gableRoof({ ...h }, tex, 0.4);
    for (const k of [-1.5, -0.5, 0.5, 1.5]) { archWindow(h.s + k * 2.0, h.h * 0.72, h.t - h.d / 2 - 0.02); if (Math.abs(k) > 1) archWindow(h.s + k * 2.0, h.h * 0.22, h.t - h.d / 2 - 0.02); }
    front(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), wood), h.s, 1.1, h.t - h.d / 2 - 0.03);
    front(new THREE.Mesh(new THREE.CircleGeometry(0.7, 16, 0, Math.PI), wood), h.s, 2.2, h.t - h.d / 2 - 0.03);
    front(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.75), new THREE.MeshStandardMaterial({ map: signTexture('♪ 오르골당', 512, 150, '#6b2f22'), roughness: 0.8 })), h.s, h.h * 0.5 - 0.55, h.t - h.d / 2 - 0.05);
    // 모서리의 작은 탑
    const tp = at(h.s + h.w / 2 - 0.6, h.t - h.d / 2 + 0.6);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, h.h + 1.6, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })); tower.position.set(tp.x, (h.h + 1.6) / 2, tp.z); g.add(tower);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.8, 16), mat('#3e5a52')); cone.position.set(tp.x, h.h + 1.6 + 0.9, tp.z); g.add(cone);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.7, 16), snow); cap.position.set(tp.x, h.h + 1.6 + 1.25, tp.z); g.add(cap);
  }
  // ---------- 증기시계 (메르헨 교차로 한가운데) ----------
  const steamPuffs = [];
  {
    const brass = mat('#b8893a', { roughness: 0.35, metalness: 0.6 }), copper = mat('#3f6e5e', { roughness: 0.5, metalness: 0.3 });
    const p = CLOCK, add = (m, y) => { m.position.set(p.x, y, p.z); m.rotation.y = yaw; g.add(m); return m; };
    add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), mat('#77706a')), 0.25);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.4, 1.0), copper), 1.7).castShadow = true;
    add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 1.15), brass), 2.95);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), copper), 3.45);
    const faceMat = new THREE.MeshStandardMaterial({ map: clockFace(), roughness: 0.6 });
    for (let k = 0; k < 4; k++) {
      const a = yaw + k * Math.PI / 2;
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), faceMat); f.position.set(p.x + Math.sin(a) * 0.61, 3.45, p.z + Math.cos(a) * 0.61); f.rotation.y = a; g.add(f);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.01), iron); hand.position.set(p.x + Math.sin(a) * 0.62, 3.5, p.z + Math.cos(a) * 0.62); hand.rotation.set(0, a, 0.6); g.add(hand);
    }
    add(new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 4), copper), 4.25).rotation.y = yaw + Math.PI / 4;
    add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.45, 4), snow), 4.38).rotation.y = yaw + Math.PI / 4;
    for (let k = 0; k < 5; k++) {      // 꼭대기의 기적(증기 피리) 다섯
      const a = k / 5 * Math.PI * 2, hgt = 0.35 + (k % 3) * 0.12;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, hgt, 8), brass); pipe.position.set(p.x + Math.sin(a) * 0.22, 4.6 + hgt / 2, p.z + Math.cos(a) * 0.22); g.add(pipe);
    }
    const steamTex = steamTexture();
    for (let k = 0; k < 14; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; g.add(s); steamPuffs.push({ s, t: 9, dx: 0, dz: 0, life: 2 }); }
  }
  // ---------- 옛 데미야선 ----------
  {
    const railMat = mat('#5d5148', { roughness: 0.6, metalness: 0.4 }), sleeper = mat('#6b4a33'), len = RAIL.to - RAIL.from, mid = (RAIL.from + RAIL.to) / 2;
    for (const side of [-0.55, 0.55]) put(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, len), railMat), RAIL.s + side, 0.06, mid);
    let k = 0;
    for (let t = RAIL.from + 0.4; t < RAIL.to; t += 0.8, k++) {
      put(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.24), sleeper), RAIL.s, 0.025, t);
      if (k % 3 === 1) put(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.34), snow), RAIL.s + 0.1, 0.06, t);      // 군데군데 눈에 묻힌 침목
    }
    // 옛 신호기와 팻말
    const sp = at(RAIL.s + 1.8, -4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8), iron); pole.position.set(sp.x, 1.6, sp.z); g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.05), mat('#c9372c')); arm.position.set(sp.x, 2.9, sp.z); arm.rotation.order = 'YXZ'; arm.rotation.y = R + Math.PI / 2; arm.rotation.z = -0.4; g.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb040', emissiveIntensity: 0.6 })); lamp.position.set(sp.x, 2.55, sp.z); g.add(lamp);
    const post = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('옛 데미야선'), roughness: 0.8, side: THREE.DoubleSide })); face.position.y = 1.25; post.add(face);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.25, 8), wood); leg.position.y = 0.62; post.add(leg);
    const pp = at(RAIL.s - 2.2, -11); post.position.set(pp.x, 0, pp.z); post.rotation.y = yaw + Math.PI / 2; g.add(post);
  }
  // 팻말: 오타루 운하
  {
    const post = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('오타루 운하'), roughness: 0.8, side: THREE.DoubleSide })); face.position.y = 1.25; post.add(face);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.25, 8), wood); leg.position.y = 0.62; post.add(leg);
    const p = at(-6.5, -6.2); post.position.set(p.x, 0, p.z); post.rotation.y = yaw + Math.PI; g.add(post);
  }
  // ---------- 가스등 (둑길·다리 양끝·교차로·철길) ----------
  const lampHead = new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffcc77', emissiveIntensity: 0, roughness: 0.3 });
  const glows = [], reflections = [];
  const gasLamp = (s, t, reflect) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8), iron); place(pole, s, 1.3, t); pole.castShadow = true;
    place(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 4), iron), s, 2.98, t, Math.PI / 4);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), lampHead), s, 2.7, t);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(2.2); const gp = at(s, t); glow.position.set(gp.x, 2.7, gp.z); g.add(glow); glows.push(glow);
    if (reflect) {
      const ref = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      ref.rotation.x = -Math.PI / 2; const rp = at(s, 0.3); ref.position.set(rp.x, 0.05, rp.z); ref.rotation.z = -yaw + Math.PI / 2; g.add(ref); reflections.push(ref);
    }
  };
  for (const s of [-19, -13, -7, 4, 10, 16]) gasLamp(s, -WATER - 1.0, true);
  gasLamp(BRIDGE.s - BRIDGE.half - 0.6, WATER + 1.2, false); gasLamp(BRIDGE.s + BRIDGE.half + 0.6, WATER + 1.2, false);
  gasLamp(CROSS.s - 3.2, CROSS.t - 1.5, false); gasLamp(CROSS.s + 3.2, CROSS.t - 1.5, false);
  gasLamp(RAIL.s - 1.6, 2, false); gasLamp(RAIL.s + 1.6, -10, false);

  // ---------- 인력거 (펭귄 인력거꾼이 둑길을 천천히 오간다) ----------
  const rick = { s: -14, dir: 1, rest: 0, phase: 0, x: 0, z: 0 };
  const cart = new THREE.Group();
  {
    const red = mat('#b3362c', { roughness: 0.6 }), black = mat('#22242a', { roughness: 0.6 });
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 24), black); wheel.position.set(side * 0.55, 0.58, -0.9); wheel.rotation.y = Math.PI / 2; cart.add(wheel);
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.05, 0.02), black); sp.position.copy(wheel.position); sp.rotation.set(k / 3 * Math.PI, 0, 0); cart.add(sp); }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), black); shaft.rotation.x = Math.PI / 2 - 0.12; shaft.position.set(side * 0.42, 0.62, -0.05); cart.add(shaft);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.6), red); seat.position.set(0, 0.95, -1.0); cart.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.12), red); back.position.set(0, 1.35, -1.3); cart.add(back);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.98, 16, 1, true, -Math.PI / 2, Math.PI), black); hood.rotation.z = Math.PI / 2; hood.position.set(0, 1.6, -1.12); hood.scale.set(1, 1, 0.75); cart.add(hood);
    const hoodSnow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), snow); hoodSnow.position.set(0, 2.14, -1.12); cart.add(hoodSnow);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.5), mat('#d9c08a')); blanket.position.set(0, 1.22, -0.95); cart.add(blanket);
  }
  const puller = buildPenguin({ scarf: true, color: '#3f4a6b' });
  const rickshaw = new THREE.Group(); rickshaw.add(cart, puller); puller.position.set(0, 0, 0.35); g.add(rickshaw);
  cart.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---------- 눈 등불 ----------
  const lanterns = [];
  const domeGeo = new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), flameGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const domeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, emissive: '#ffcf8a', emissiveIntensity: 0 });
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  const lanternGlow = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 });
  function addLantern(x, z, birth = Date.now()) {
    if (lanterns.some((l) => Math.hypot(l.x - x, l.z - z) < 0.25)) return null;      // (같은 자리에 겹쳐 놓지 않는다)
    const o = new THREE.Group();
    const dome = new THREE.Mesh(domeGeo, domeMat); dome.scale.set(1, 1.25, 1); dome.castShadow = true; o.add(dome);
    const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.y = 0.09; o.add(flame);
    const glow = new THREE.Sprite(lanternGlow); glow.scale.setScalar(0.65); glow.position.y = 0.15; o.add(glow);
    o.position.set(x, 0, z); g.add(o);
    const l = { x, z, birth, o, flame, k: Math.random() * 6 };
    lanterns.push(l);
    while (lanterns.length > LANTERN_MAX) { const old = lanterns.shift(); g.remove(old.o); }
    return l;
  }
  let night = 0, steamLeft = 0, steamNext = 0;
  return {
    group: g,
    addLantern,
    /** 증기시계가 노래한다: 꼭대기에서 증기가 몽글몽글 솟는다 (sec 초 동안) */
    toot(sec = 4.5) { steamLeft = Math.max(steamLeft, sec); },
    get tooting() { return steamLeft > 0; },
    get lanterns() { return lanterns.length; },
    get lit() { return night; },
    get rickshaw() { return { x: rick.x, z: rick.z, resting: rick.rest > 0 }; },
    /** 한 박자. dark: 0(낮)..1(밤) */
    update(time, dark, dt = 1 / 60) {
      night = dark;
      const now = Date.now();
      for (let i = lanterns.length - 1; i >= 0; i--) if (now - lanterns[i].birth > LANTERN_LIFE) { g.remove(lanterns[i].o); lanterns.splice(i, 1); }
      lampHead.emissiveIntensity = 0.2 + 2.2 * dark;
      windowMat.emissiveIntensity = 1.4 * dark;
      lampsMat.emissiveIntensity = 0.25 + 0.75 * dark;
      waterMat.color.setRGB(0.18 - 0.08 * dark, 0.35 - 0.15 * dark, 0.4 - 0.12 * dark);
      for (let k = 0; k < glows.length; k++) glows[k].material.opacity = 0.9 * dark * (1 + 0.05 * Math.sin(time * 3 + k * 1.7));
      for (let k = 0; k < reflections.length; k++) reflections[k].material.opacity = 0.55 * dark * (1 + 0.15 * Math.sin(time * 1.3 + k));
      domeMat.emissiveIntensity = 0.15 + 0.9 * dark;
      lanternGlow.opacity = 0.15 + 0.75 * dark;
      for (const l of lanterns) { const s = 1 + 0.18 * Math.sin(time * 9 + l.k) + 0.1 * Math.sin(time * 23 + l.k); l.flame.scale.set(1, s, 1); }
      // 증기
      steamLeft = Math.max(0, steamLeft - dt); steamNext -= dt;
      if (steamLeft > 0 && steamNext <= 0) {
        steamNext = 0.12;
        const p = steamPuffs.find((q) => q.t >= q.life); if (p) { p.t = 0; p.life = 1.6 + Math.random() * 0.8; p.dx = (Math.random() - 0.5) * 0.5; p.dz = (Math.random() - 0.5) * 0.5; p.s.visible = true; }
      }
      for (const p of steamPuffs) {
        if (p.t >= p.life) { p.s.visible = false; continue; }
        p.t += dt; const k = p.t / p.life;
        p.s.position.set(CLOCK.x + p.dx * k * 2, 4.9 + k * 2.2, CLOCK.z + p.dz * k * 2);
        p.s.scale.setScalar(0.4 + k * 1.6); p.s.material.opacity = 0.85 * (1 - k);
      }
      // 인력거: 둑길을 따라 천천히 오가고, 끝에서 잠깐 쉰다
      if (rick.rest > 0) rick.rest -= dt;
      else {
        rick.s += rick.dir * 0.9 * dt; rick.phase = (rick.phase + dt * 1.6) % 1;
        if (rick.s > 19) { rick.s = 19; rick.dir = -1; rick.rest = 4; } else if (rick.s < -19) { rick.s = -19; rick.dir = 1; rick.rest = 4; }
      }
      const rp = at(rick.s, -6.6); rick.x = rp.x; rick.z = rp.z;
      rickshaw.position.set(rp.x, 0, rp.z); rickshaw.rotation.y = rick.dir > 0 ? yaw : yaw + Math.PI;
      pose(puller, rick.phase, rick.rest > 0 ? 0 : 1);
    },
  };
}
