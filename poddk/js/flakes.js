// 특별한 눈송이: 눈밭 곳곳에 가끔 반짝이며 내려앉는다. 다가가면 줍고, 선물을 찾았을 때처럼 카드가 잠깐 떴다 사라진다.
//   · 육각 눈송이(흔하다), 하트 눈송이(드물다): 낮에도 밤에도
//   · 별 눈송이: 해가 지면 별처럼 빛나며 내려와 멀리서도 보인다 (밤에만)
// 한 번에 눈밭에 있는 수: 3개, 밤에는 별 눈송이 2개가 더. 하나는 4분쯤 있다가 녹고, 얼마 뒤 다른 곳에 새로 내려온다.
import * as THREE from 'three';

/** 눈송이 스무 가지: 이름, 한마디, 드문 정도(weight 가 작을수록 드물다), 밤에만 나오는가, 모양 */
export const FLAKES = [
  { id: 'hex', name: '육각 눈송이', say: '반듯반듯 예쁜 눈 결정이에요', weight: 4, shape: { arms: 6, len: 1, branches: 2, plate: 0.28, tip: 'ball' }, color: '#eef6ff' },
  { id: 'heart', name: '하트 눈송이', say: '누가 마음을 담아 보냈나 봐요', weight: 1, special: 'heart', color: '#ff9fbe' },
  { id: 'star', name: '별 눈송이', say: '밤하늘에서 떨어진 별 조각이에요', weight: 1, night: true, special: 'star', color: '#ffd75e' },
]
const SAVE = 'poddk.flakes.v1';
const LIFE = [200, 280], BACK = [25, 70];           // 눈밭에 있는 시간, 녹은 뒤 새로 내려오기까지 (초)
const DAY_COUNT = 3, NIGHT_COUNT = 2, REACH = 1.0;

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
/** 머리 위에 떠 있는 별 눈송이 (밤에 별 눈송이를 주우면 아침까지): 작은 별과 둘레의 노란 빛 */
export function makeHeadStar() {
  const g = new THREE.Group();
  const star = makeFlake(FLAKES.find((f) => f.id === 'star'));
  star.scale.setScalar(0.36); star.rotation.x = Math.PI / 2;      // (눈송이는 눕혀 만들어져 있다: 세워서 앞을 보게)
  const spin = new THREE.Group(); spin.add(star); g.add(spin);
  const glow = glintSprite('rgba(255,215,94,0.85)', true); glow.scale.setScalar(0.62); g.add(glow);
  g.userData.star = spin;
  g.visible = false;
  return g;
}
const _q = new THREE.Quaternion();
/** 머리 위 별을 한 박자 움직인다: 늘 화면 쪽을 보며(옆으로 납작해 보이지 않게) 천천히 돌고, 살랑 떠오르내린다 */
export function bobHeadStar(g, time, camera, head = 1.72) {
  g.position.y = head + Math.sin(time * 2.1) * 0.05;
  if (camera && g.parent) { g.parent.getWorldQuaternion(_q); g.quaternion.copy(_q.invert()).multiply(camera.quaternion); }
  g.userData.star.rotation.set(0, Math.sin(time * 1.3) * 0.35, time * 0.7);
}
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
