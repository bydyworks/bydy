// 눈송이 도감: 눈밭 곳곳에 가끔 특별한 눈송이가 반짝이며 내려앉는다. 다가가면 주워서 도감에 모은다 (기기에 오래 남는다).
//   · 낮 눈송이 14가지: 흔한 것부터 아주 드문 무지개 눈송이까지
//   · 밤 눈송이 6가지: 해가 지면 별처럼 빛나는 눈송이가 내려와 멀리서도 보인다 (밤에만)
// 한 번에 눈밭에 있는 수: 낮 4개, 밤에는 빛나는 별 눈송이 3개가 더. 하나는 4분쯤 있다가 녹고, 얼마 뒤 다른 곳에 새로 내려온다.
import * as THREE from 'three';

/** 눈송이 스무 가지: 이름, 한마디, 드문 정도(weight 가 작을수록 드물다), 밤에만 나오는가, 모양 */
export const FLAKES = [
  { id: 'hex', name: '육각 눈송이', say: '가장 흔하지만 가장 반듯해요', weight: 22, shape: { arms: 6, len: 1, branches: 2, plate: 0.28 }, color: '#eef6ff' },
  { id: 'twig', name: '나뭇가지 눈송이', say: '가지가 오밀조밀 뻗었어요', weight: 18, shape: { arms: 6, len: 1, branches: 4, plate: 0.12 }, color: '#e6f2ff' },
  { id: 'needle', name: '바늘 눈송이', say: '가늘고 뾰족해요', weight: 16, shape: { arms: 6, len: 1.15, branches: 0, plate: 0.08, thin: true }, color: '#f2f7ff' },
  { id: 'fan', name: '부채 눈송이', say: '팔 끝이 부채처럼 펴졌어요', weight: 14, shape: { arms: 6, len: 0.9, branches: 1, plate: 0.15, tip: 'fan' }, color: '#eaf4ff' },
  { id: 'fern', name: '고사리 눈송이', say: '고사리 잎을 닮았어요', weight: 12, shape: { arms: 6, len: 1.05, branches: 6, plate: 0.1, short: true }, color: '#e4f1ff' },
  { id: 'plate', name: '동글 판 눈송이', say: '납작한 얼음 판 같아요', weight: 12, shape: { arms: 6, len: 0.55, branches: 0, plate: 0.55 }, color: '#f0f7ff' },
  { id: 'crown', name: '왕관 눈송이', say: '끝마다 작은 왕관이 있어요', weight: 7, shape: { arms: 6, len: 0.95, branches: 1, plate: 0.2, tip: 'ball' }, color: '#fff6dc' },
  { id: 'sky', name: '하늘빛 눈송이', say: '맑은 하늘색이 비쳐요', weight: 6, shape: { arms: 6, len: 1, branches: 3, plate: 0.2 }, color: '#a9d6ff' },
  { id: 'pink', name: '분홍 눈송이', say: '노을빛에 물들었어요', weight: 6, shape: { arms: 6, len: 1, branches: 2, plate: 0.25, tip: 'ball' }, color: '#ffc9dc' },
  { id: 'mint', name: '민트 눈송이', say: '시원한 박하 향이 날 것 같아요', weight: 6, shape: { arms: 6, len: 1, branches: 3, plate: 0.15, tip: 'fan' }, color: '#bff0dd' },
  { id: 'lace', name: '레이스 눈송이', say: '레이스처럼 섬세해요', weight: 5, shape: { arms: 12, len: 0.9, branches: 2, plate: 0.18, thin: true }, color: '#f7f9ff' },
  { id: 'twin', name: '쌍둥이 눈송이', say: '둘이 꼭 붙어 내려왔어요', weight: 3, twin: true, shape: { arms: 6, len: 0.8, branches: 2, plate: 0.2 }, color: '#e8f3ff' },
  { id: 'heart', name: '하트 눈송이', say: '누가 마음을 담아 보냈나 봐요', weight: 2.5, special: 'heart', color: '#ff9fbe' },
  { id: 'rainbow', name: '무지개 눈송이', say: '정말 드물어요! 소원을 빌어 봐요', weight: 1, rainbow: true, shape: { arms: 6, len: 1, branches: 2, plate: 0.22, tip: 'ball' }, color: '#ffffff' },
  { id: 'gold', name: '금빛 별 눈송이', say: '밤하늘에서 떨어진 별 조각이에요', weight: 9, night: true, special: 'star', color: '#ffd75e' },
  { id: 'silver', name: '은빛 별 눈송이', say: '달빛처럼 은은하게 빛나요', weight: 9, night: true, special: 'star', color: '#dfe8f7' },
  { id: 'rose', name: '분홍 별 눈송이', say: '분홍빛으로 반짝반짝', weight: 6, night: true, special: 'star', color: '#ff9fc8' },
  { id: 'aqua', name: '하늘 별 눈송이', say: '파르스름한 빛이 일렁여요', weight: 6, night: true, special: 'star', color: '#8fd8ff' },
  { id: 'violet', name: '보랏빛 별 눈송이', say: '꿈속처럼 신비로워요', weight: 3, night: true, special: 'star', color: '#c4a3ff' },
  { id: 'comet', name: '별똥별 눈송이', say: '꼬리를 달고 떨어졌어요! 아주 드물어요', weight: 1, night: true, special: 'comet', color: '#fff3b0' },
];
const SAVE = 'poddk.flakes.v1';
const LIFE = [200, 280], BACK = [25, 70];           // 눈밭에 있는 시간, 녹은 뒤 새로 내려오기까지 (초)
const DAY_COUNT = 4, NIGHT_COUNT = 3, REACH = 1.0;

function star(points, r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) { const a = Math.PI / 2 + i * Math.PI / points, r = i % 2 ? r2 : r1; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  s.closePath(); return s;
}
function heartShape(k) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9 * k); s.bezierCurveTo(-1.2 * k, -0.1 * k, -1 * k, 0.9 * k, -0.45 * k, 0.9 * k); s.bezierCurveTo(-0.15 * k, 0.9 * k, 0, 0.62 * k, 0, 0.45 * k);
  s.bezierCurveTo(0, 0.62 * k, 0.15 * k, 0.9 * k, 0.45 * k, 0.9 * k); s.bezierCurveTo(1 * k, 0.9 * k, 1.2 * k, -0.1 * k, 0, -0.9 * k);
  return s;
}
const RAINBOW = ['#ff8a8a', '#ffc46b', '#fff07a', '#8fe39a', '#8cc8ff', '#c4a3ff'];

/** 눈송이 하나의 모양 (반지름 약 0.22, 납작하게 누워 있다: 위(+Y)를 본다) */
export function makeFlake(f) {
  const g = new THREE.Group(), R = 0.22;
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.15, emissive: f.night ? c : '#000000', emissiveIntensity: f.night ? 0.6 : 0 });
  if (f.special === 'heart') { const geo = new THREE.ExtrudeGeometry(heartShape(R * 0.9), { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012 }); geo.center(); const o = new THREE.Mesh(geo, m(f.color)); o.rotation.x = -Math.PI / 2; g.add(o); }
  else if (f.special === 'star' || f.special === 'comet') {
    const geo = new THREE.ExtrudeGeometry(star(5, R, R * 0.45), { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012 }); geo.center();
    const o = new THREE.Mesh(geo, m(f.color)); o.rotation.x = -Math.PI / 2; g.add(o);
    if (f.special === 'comet') for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.04 - k * 0.008, 8, 6), m(f.color)); t.position.set(-R - 0.06 - k * 0.07, 0, R * 0.4 + k * 0.05); g.add(t); }      // 별똥별 꼬리
  } else {
    const s = f.shape, thick = s.thin ? 0.014 : 0.024;
    const one = (color, i) => m(f.rainbow ? RAINBOW[i % RAINBOW.length] : color);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(R * s.plate, R * s.plate, thick * 1.2, 6), m(f.color)); g.add(plate);
    for (let i = 0; i < s.arms; i++) {
      const a = i / s.arms * Math.PI * 2, arm = new THREE.Group(); arm.rotation.y = a; g.add(arm);
      const len = R * s.len * (s.arms > 6 && i % 2 ? 0.6 : 1), mat = one(f.color, i);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), mat); bar.position.z = len / 2; arm.add(bar);
      for (let b = 1; b <= s.branches; b++) {
        const at = len * (0.3 + 0.6 * b / (s.branches + 1)), bl = len * (s.short ? 0.18 : 0.3) * (1 - b / (s.branches + 2));
        for (const side of [-1, 1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.9, thick * 0.9, bl), mat); br.position.set(side * Math.sin(0.9) * bl / 2, 0, at + Math.cos(0.9) * bl / 2); br.rotation.y = side * 0.9; arm.add(br); }
      }
      if (s.tip === 'ball') { const b = new THREE.Mesh(new THREE.SphereGeometry(thick * 1.6, 8, 6), mat); b.position.z = len; arm.add(b); }
      if (s.tip === 'fan') { const fan = new THREE.Mesh(new THREE.CylinderGeometry(thick * 3, thick * 3, thick, 3), mat); fan.position.z = len; arm.add(fan); }
    }
    if (f.twin) { const twin = makeFlake({ ...f, twin: false }); twin.scale.setScalar(0.75); twin.position.set(R * 0.7, 0.03, R * 0.3); twin.rotation.y = 0.5; g.add(twin); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 반짝임 (멀리서도 보이게, 밤 눈송이는 크게 빛난다) */
function glintSprite(color, big) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, color); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  if (big) { x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(31, 8, 2, 48); x.fillRect(8, 31, 48, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: big ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: big ? 0.6 : 0.9 }));
  s.scale.setScalar(big ? 0.85 : 0.6);
  return s;
}

/** free(x, z): 눈송이가 내려앉을 수 있는 자리인가 */
export function createFlakes(scene, { free = () => true, roam = 66 } = {}) {
  let found = {};
  try { found = JSON.parse(localStorage.getItem(SAVE) || '{}') || {}; } catch { found = {}; }
  const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(found)); } catch { /* 이번만 */ } };
  const live = [];                 // { f, mesh, x, z, life, glint }
  let dayBack = 1, nightBack = 1, time = 0;
  const pickKind = (night) => {
    const pool = FLAKES.filter((f) => !!f.night === night), sum = pool.reduce((a, f) => a + f.weight, 0);
    let r = Math.random() * sum; for (const f of pool) { r -= f.weight; if (r <= 0) return f; }
    return pool[0];
  };
  function spot() {
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.sqrt(Math.random()) * (roam - 8), x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (free(x, z) && !live.some((o) => Math.hypot(o.x - x, o.z - z) < 10)) return { x, z };
    }
    return null;
  }
  function drop(f, at = null) {
    const p = at || spot(); if (!p) return null;
    const mesh = makeFlake(f); mesh.position.set(p.x, 0.12, p.z); mesh.rotation.y = Math.random() * 6;
    const glint = glintSprite(f.night ? f.color : 'rgba(220,240,255,0.9)', !!f.night); glint.position.set(p.x, f.night ? 0.5 : 0.35, p.z);
    scene.add(mesh, glint);
    let light = null;
    if (f.night) { light = new THREE.PointLight(f.color, 0.8, 3.5, 1.6); light.position.set(p.x, 0.5, p.z); scene.add(light); }
    const o = { f, mesh, glint, light, x: p.x, z: p.z, life: LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]), phase: Math.random() * 6 };
    live.push(o); return o;
  }
  function remove(o) {
    scene.remove(o.mesh, o.glint); if (o.light) scene.remove(o.light);
    o.mesh.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); o.glint.material.map.dispose(); o.glint.material.dispose();
    live.splice(live.indexOf(o), 1);
  }
  return {
    get live() { return live.map((o) => ({ id: o.f.id, x: o.x, z: o.z })); },
    get found() { return { ...found }; },
    get count() { return FLAKES.filter((f) => found[f.id]).length; },
    /** 점검용: 그 자리에 그 눈송이를 내려놓는다 */
    drop(id, x, z) { const f = FLAKES.find((q) => q.id === id); return f ? !!drop(f, { x, z }) : false; },
    /** 점검용: 도감을 비운다 */
    reset() { found = {}; save(); },
    /**
     * 한 박자. night: 밤인가. me: 펭귄 자리 (null 이면 줍지 않는다). 주운 것이 있으면 { f, first, total } 을 돌려준다
     */
    update(dt, night, me) {
      time += dt;
      const dayLive = live.filter((o) => !o.f.night).length, nightLive = live.filter((o) => o.f.night).length;
      dayBack -= dt; if (dayLive < DAY_COUNT && dayBack <= 0) { drop(pickKind(false)); dayBack = BACK[0] + Math.random() * (BACK[1] - BACK[0]); }
      nightBack -= dt; if (night && nightLive < NIGHT_COUNT && nightBack <= 0) { drop(pickKind(true)); nightBack = BACK[0] + Math.random() * (BACK[1] - BACK[0]); }
      let got = null;
      for (const o of [...live]) {
        o.life -= dt;
        if (o.life <= 0 || (o.f.night && !night)) { remove(o); continue; }      // 녹았거나, 날이 밝아 별 눈송이가 사라졌다
        o.mesh.rotation.y += dt * 0.6; o.mesh.position.y = 0.12 + Math.sin(time * 2 + o.phase) * 0.04;
        o.glint.material.opacity = (o.f.night ? 0.35 : 0.5) + (o.f.night ? 0.3 : 0.45) * Math.max(0, Math.sin(time * 3 + o.phase));
        if (o.light) o.light.intensity = 0.7 + 0.25 * Math.sin(time * 4 + o.phase);
        if (me && !got && Math.hypot(me.x - o.x, me.z - o.z) < REACH) {
          const first = !found[o.f.id]; found[o.f.id] = (found[o.f.id] || 0) + 1; save();
          got = { f: o.f, first, total: FLAKES.filter((f) => found[f.id]).length, x: o.x, z: o.z };
          remove(o);
        }
      }
      return got;
    },
  };
}
