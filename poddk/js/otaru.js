// 운하 거리 (오타루의 겨울 운하를 닮은 곳): 들판 한쪽에 곧게 흐르는 운하와, 건너편에 늘어선 돌 창고들.
//   · 운하 이쪽은 걸을 수 있는 둑길이고, 가스등이 줄지어 서 있다. 해가 지면 가스등이 켜지고 물에 불빛이 길게 비친다.
//   · 둑길에서 상황 단추(🕯️)를 누르면 발치에 작은 눈 등불을 놓는다. 밤이면 촛불처럼 따뜻하게 빛난다.
//     놓은 등불은 다른 펭귄에게도 보이고, 여섯 시간 동안 남는다 (발자국처럼 서버가 들고 있다).
//   · 창고 하나는 오르골 가게: 그 앞에 가면 트리의 오르골 캐롤이 크게 들린다.
import * as THREE from 'three';

const DEG = 160, FAR = 58;                        // 트리에서 본 방향(도)과 운하 가운데까지의 거리
const LEN = 22, WATER = 2.3;                       // 운하 길이의 반, 물 너비의 반
const n = { x: Math.sin(DEG * Math.PI / 180), z: Math.cos(DEG * Math.PI / 180) };      // 트리에서 멀어지는 쪽 (운하를 가로지르는 쪽)
const u = { x: n.z, z: -n.x };                                                         // 운하를 따라가는 쪽
const C = { x: n.x * FAR, z: n.z * FAR };
/** 운하 기준의 자리 (s: 운하를 따라, t: 트리 쪽이 - , 창고 쪽이 +) → 들판 자리 */
const at = (s, t) => ({ x: C.x + u.x * s + n.x * t, z: C.z + u.z * s + n.z * t });
/** 들판 자리 → 운하 기준의 자리 */
export function canalCoord(x, z) { const dx = x - C.x, dz = z - C.z; return { s: dx * u.x + dz * u.z, t: dx * n.x + dz * n.z }; }
export const CANAL = { x: C.x, z: C.z, len: LEN, water: WATER, yaw: Math.atan2(u.x, u.z), start: at(0, -5) };
const WAREHOUSES = [-17, -9, -1, 7, 15].map((s, i) => ({ s, t: 6.6, w: 7, d: 6, h: 4.2 + (i % 2) * 0.8, shop: i === 2 }));
export const SHOP = (() => { const w = WAREHOUSES.find((h) => h.shop); return { ...at(w.s, w.t - w.d / 2 - 0.4) }; })();      // 오르골 가게 문 앞
/** 걸어서 들어갈 수 없는 곳들: 물(작은 동그라미를 줄지어), 창고 */
export const CANAL_BLOCKS = [
  ...Array.from({ length: Math.round((2 * LEN) / 2.2) + 1 }, (_, k) => ({ ...at(-LEN + k * 2.2, 0), r: WATER })),
  ...WAREHOUSES.map((h) => ({ ...at(h.s, h.t), r: h.d / 2 + 0.3 })),
  ...WAREHOUSES.map((h) => ({ ...at(h.s + h.w / 4, h.t), r: h.d / 2 + 0.1 })), ...WAREHOUSES.map((h) => ({ ...at(h.s - h.w / 4, h.t), r: h.d / 2 + 0.1 })),
];
/** 풀이 나지 않고 선물·눈송이가 놓이지 않는 곳 */
export const CANAL_CLEAR = { x: C.x, z: C.z, r: LEN + 6 };
/** 운하 둑길 위인가 (눈 등불을 놓을 수 있는 곳) */
export function onWalk(x, z) { const c = canalCoord(x, z); return Math.abs(c.s) < LEN + 1 && c.t < -WATER - 0.2 && c.t > -9; }
/** 운하 거리 언저리인가 (처음 보일 때·곁에 왔을 때 알림) */
export function nearCanal(x, z) { const c = canalCoord(x, z); return Math.abs(c.s) < LEN + 4 && c.t > -12 && c.t < 12; }

const LANTERN_LIFE = 6 * 3600e3, LANTERN_MAX = 160;

function stoneTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#8d8478'; x.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 16; r++) for (let k = 0; k < 6; k++) {
    const off = (r % 2) * 21, bx = k * 43 - off, by = r * 16, shade = 120 + ((r * 7 + k * 13) % 5) * 9;
    x.fillStyle = `rgb(${shade + 14},${shade + 6},${shade - 6})`; x.fillRect(bx + 1, by + 1, 41, 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function glowTexture(inner = 'rgba(255,214,140,1)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(0.35, 'rgba(255,180,90,0.45)'); g.addColorStop(1, 'rgba(255,160,70,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTexture(text, w = 512, h = 160, bg = '#6b4428', fg = '#fff3c4') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.beginPath(); if (x.roundRect) x.roundRect(4, 4, w - 8, h - 8, 26); else x.rect(4, 4, w - 8, h - 8); x.fill();
  x.fillStyle = fg; x.font = `900 ${Math.round(h * 0.42)}px NanumSquareRound, system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createOtaru(scene) {
  const g = new THREE.Group(); scene.add(g);
  const yaw = Math.atan2(u.x, u.z);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
  const place = (m, s, y, t, rotY = 0) => { const p = at(s, t); m.position.set(p.x, y, p.z); m.rotation.y = yaw + rotY; g.add(m); return m; };
  // 물: 짙은 청록, 살짝 반짝 (해 질 녘과 밤에는 더 어둡다)
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f5a66', roughness: 0.12, metalness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER * 2, LEN * 2), waterMat); water.rotation.x = -Math.PI / 2;
  place(water, 0, 0.03, 0).rotation.set(-Math.PI / 2, 0, yaw);      // (눈밭 바로 위에: 땅보다 낮으면 눈에 가린다)
  // 돌 둑 (물 양옆), 둑 위의 눈
  const stone = mat('#9b948a'), snow = mat('#ffffff', { roughness: 1 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, LEN * 2 + 0.6), stone); place(wall, 0, 0.0, side * (WATER + 0.2)); wall.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, LEN * 2 + 0.7), snow); place(cap, 0, 0.3, side * (WATER + 0.2));
  }
  // 창고들: 돌벽, 짙은 지붕과 그 위의 눈, 아치 창 (밤에는 따뜻하게 켜진다)
  const wallTex = stoneTexture();
  const windowMat = new THREE.MeshStandardMaterial({ color: '#2a2f3a', emissive: '#ffb45c', emissiveIntensity: 0, roughness: 0.4 });
  const roof = mat('#3e4654'), shopSign = new THREE.MeshStandardMaterial({ map: signTexture('♪ 오르골당'), roughness: 0.8 });
  const R = Math.atan2(-u.z, u.x);      // 이 각만큼 돌리면 물건의 x 축이 운하를 따라, z 축이 창고 쪽을 본다
  const put = (m, s0, y, t, rx = 0) => { const p = at(s0, t); m.position.set(p.x, y, p.z); m.rotation.order = 'YXZ'; m.rotation.y = R; m.rotation.x = rx; g.add(m); return m; };
  for (const h of WAREHOUSES) {
    const tex = wallTex.clone(); tex.needsUpdate = true; tex.repeat.set(h.w / 3, h.h / 3);
    const body = put(new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })), h.s, h.h / 2, h.t);
    body.castShadow = body.receiveShadow = true;
    // 맞배지붕: 용마루는 운하를 따라, 두 쪽 경사판 위에 소복한 눈
    const half = h.d / 2 + 0.45, tilt = 0.5, rise = Math.sin(tilt) * half / 2;
    for (const side of [-1, 1]) {
      put(new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.6, 0.22, half), roof), h.s, h.h + rise + 0.05, h.t + side * Math.cos(tilt) * half / 2, side * tilt);
      put(new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.5, 0.12, half - 0.1), snow), h.s, h.h + rise + 0.2, h.t + side * Math.cos(tilt) * half / 2, side * tilt);
    }
    for (const side of [-1, 1]) {      // 박공(옆면의 세모)
      const tri = new THREE.Shape(); tri.moveTo(-h.d / 2, 0); tri.lineTo(h.d / 2, 0); tri.lineTo(0, rise * 2 + 0.1); tri.closePath();
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
      const p = at(h.s + side * h.w / 2, h.t); gable.position.set(p.x, h.h, p.z); gable.rotation.y = R + Math.PI / 2; g.add(gable);
    }
    // 운하 쪽 벽의 아치 창 셋 (밤에는 따뜻하게 켜진다)
    for (const k of [-1, 0, 1]) {
      const sx = h.s + k * (h.w / 3.2);
      if (h.shop && k === 0) continue;
      put(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), windowMat), sx, h.h * 0.5, h.t - h.d / 2 - 0.02).rotation.y = R + Math.PI;
      put(new THREE.Mesh(new THREE.CircleGeometry(0.45, 16, 0, Math.PI), windowMat), sx, h.h * 0.5 + 0.65, h.t - h.d / 2 - 0.02).rotation.y = R + Math.PI;
    }
    if (h.shop) {
      put(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), shopSign), h.s, h.h * 0.84, h.t - h.d / 2 - 0.05).rotation.y = R + Math.PI;
      put(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.0), mat('#5a3a24')), h.s, 1.0, h.t - h.d / 2 - 0.03).rotation.y = R + Math.PI;
      put(new THREE.Mesh(new THREE.CircleGeometry(0.65, 16, 0, Math.PI), mat('#5a3a24')), h.s, 2.0, h.t - h.d / 2 - 0.03).rotation.y = R + Math.PI;
    }
  }
  // 운하 이름 팻말 (둑길 가운데)
  {
    const post = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('오타루 운하'), roughness: 0.8, side: THREE.DoubleSide }));
    face.position.y = 1.25; post.add(face);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.25, 8), mat('#5a3a24')); leg.position.y = 0.62; post.add(leg);
    const p = at(-2.5, -6.2); post.position.set(p.x, 0, p.z); post.rotation.y = yaw + Math.PI; g.add(post);
  }
  // 가스등: 둑길 따라 일곱, 밤에 켜지고 물에 불빛이 길게 비친다
  const glowTex = glowTexture();
  const lampHead = new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffcc77', emissiveIntensity: 0, roughness: 0.3 });
  const iron = mat('#2b2e35', { roughness: 0.6 });
  const glows = [], reflections = [];
  for (let k = 0; k < 7; k++) {
    const s = -18 + k * 6, t = -WATER - 1.0;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8), iron); place(pole, s, 1.3, t); pole.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 4), iron); place(cap, s, 2.98, t, Math.PI / 4);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), lampHead); place(head, s, 2.7, t);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(2.2); const gp = at(s, t); glow.position.set(gp.x, 2.7, gp.z); g.add(glow); glows.push(glow);
    const ref = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    ref.rotation.x = -Math.PI / 2; const rp = at(s, 0.3); ref.position.set(rp.x, 0.05, rp.z); ref.rotation.z = -yaw + Math.PI / 2; g.add(ref); reflections.push(ref);
  }
  // 눈 등불들
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
  let night = 0;
  return {
    group: g,
    addLantern,
    get lanterns() { return lanterns.length; },
    get lit() { return night; },
    /** 한 박자. dark: 0(낮)..1(밤) */
    update(time, dark) {
      night = dark;
      const now = Date.now();
      for (let i = lanterns.length - 1; i >= 0; i--) if (now - lanterns[i].birth > LANTERN_LIFE) { g.remove(lanterns[i].o); lanterns.splice(i, 1); }
      lampHead.emissiveIntensity = 0.2 + 2.2 * dark;
      windowMat.emissiveIntensity = 1.4 * dark;
      waterMat.color.setRGB(0.18 - 0.08 * dark, 0.35 - 0.15 * dark, 0.4 - 0.12 * dark);
      for (let k = 0; k < glows.length; k++) {
        const f = 1 + 0.05 * Math.sin(time * 3 + k * 1.7);
        glows[k].material.opacity = 0.9 * dark * f; reflections[k].material.opacity = 0.55 * dark * (1 + 0.15 * Math.sin(time * 1.3 + k));
      }
      domeMat.emissiveIntensity = 0.15 + 0.9 * dark;
      lanternGlow.opacity = 0.15 + 0.75 * dark;
      for (const l of lanterns) { const s = 1 + 0.18 * Math.sin(time * 9 + l.k) + 0.1 * Math.sin(time * 23 + l.k); l.flame.scale.set(1, s, 1); }
    },
  };
}
