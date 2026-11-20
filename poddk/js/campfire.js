// 들판의 모닥불: 트리에서 조금 떨어진 곳에 돌을 둘러 피운 불과, 둘레의 나무 그루터기 의자들.
// 불 곁에서 상황 단추를 누르면 앉아서 막대 끝의 마시멜로를 불에 굽는다. 하얗던 마시멜로가 노릇노릇해지다가,
// 너무 오래 두면 갈색을 지나 까맣게 탄다. 다시 누르면 냠 먹는다 (얼마나 구웠는지에 따라 한마디).
import * as THREE from 'three';

const DEG = 215, FAR = 17;                       // 트리에서 본 방향(도)과 거리
export const CAMPFIRE = { x: Math.sin(DEG * Math.PI / 180) * FAR, z: Math.cos(DEG * Math.PI / 180) * FAR, r: 0.95 };      // r: 지나갈 수 없는 불 둘레
export const ROAST_REACH = 3.1;                  // 불에서 이만큼 안이면 "마시멜로 굽기" 단추가 된다
export const ROAST_SEAT = 1.75;                  // 구울 때 불에서 이만큼 떨어져 앉는다
const STUMP_RING = 2.6, STUMPS = 4;
/** 그루터기 의자들 (걸어서 지나갈 수 없다) */
export const STUMP_BLOCKS = Array.from({ length: STUMPS }, (_, k) => {
  const a = Math.PI / 4 + k * Math.PI / 2;
  return { x: CAMPFIRE.x + Math.sin(a) * STUMP_RING, z: CAMPFIRE.z + Math.cos(a) * STUMP_RING, r: 0.38 };
});

/** 굽는 정도 (초) → 이름과 색. 노릇노릇한 때가 가장 맛있다 */
export const DONENESS = [
  { until: 2.6, id: 'raw', color: '#fffdf7', say: '아직 말랑하고 하얘요. 그래도 달콤해요 🤍' },
  { until: 4.6, id: 'light', color: '#f7e2b8', say: '살짝 노릇해요. 겉은 바삭 속은 말랑! 😋' },
  { until: 7.0, id: 'gold', color: '#e0a35a', say: '노릇노릇 완벽해요! 🤎✨' },
  { until: 9.0, id: 'brown', color: '#9a5a2c', say: '조금 탔지만 고소해요 😌' },
  { until: Infinity, id: 'burnt', color: '#2a211d', say: '앗, 까맣게 타 버렸어요 😅' },
];
export const donenessAt = (t) => DONENESS.find((d) => t < d.until);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
/** 굽는 시간에 따라 부드럽게 바뀌는 마시멜로 색 */
export function marshmallowColor(t, out = new THREE.Color()) {
  let prev = 0;
  for (let i = 0; i < DONENESS.length; i++) {
    const d = DONENESS[i], next = DONENESS[Math.min(DONENESS.length - 1, i + 1)];
    if (t < d.until) {
      const span = Number.isFinite(d.until) ? d.until - prev : 1, u = Number.isFinite(d.until) ? Math.min(1, Math.max(0, (t - prev) / span)) : 1;
      return out.copy(tmpA.set(d.color)).lerp(tmpB.set(next.color), Number.isFinite(d.until) ? u * u * 0.6 : 0);
    }
    prev = d.until;
  }
  return out.set(DONENESS[DONENESS.length - 1].color);
}

/** 마시멜로를 꽂은 막대 (펭귄 날개 끝에 쥔다). 막대는 +y 쪽으로 뻗고, 끝에 마시멜로가 있다 */
export const STICK_LEN = 1.15;
export function makeStick() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, STICK_LEN, 6), new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.9 }));
  stick.position.y = STICK_LEN / 2; g.add(stick);
  const mallow = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 14), new THREE.MeshStandardMaterial({ color: '#fffdf7', roughness: 0.7, emissive: '#000000' }));
  mallow.position.y = STICK_LEN - 0.04; g.add(mallow);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.mallow = mallow;
  return g;
}

export function createCampfire(scene) {
  const g = new THREE.Group();
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
  // 불 아래 녹은 자리 (눈이 녹아 땅이 살짝 드러난 둥근 자리)
  const ash = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), mat('#cfc6bd', { roughness: 1 })); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.006; ash.receiveShadow = true; g.add(ash);
  // 둘러놓은 돌
  for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, s = new THREE.Mesh(new THREE.SphereGeometry(0.2 + (k % 3) * 0.02, 10, 8), mat(['#8a8f9c', '#9aa0ad', '#7d828f'][k % 3])); s.scale.set(1, 0.65, 1); s.position.set(Math.sin(a) * 0.86, 0.1, Math.cos(a) * 0.86); s.castShadow = true; g.add(s); }
  // 엇갈린 장작
  for (const r of [0.4, -0.7, 1.6, 2.6]) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.15, 8), mat('#6b4428')); log.rotation.set(Math.PI / 2 - 0.25, r, 0); log.position.y = 0.17; log.castShadow = true; g.add(log); }
  // 일렁이는 불꽃 (이글루 안 모닥불과 같은 방식)
  const flames = [['#ff7a1e', 0.32, 0.95], ['#ffa63c', 0.22, 0.74], ['#ffe07a', 0.13, 0.5], ['#ff8a2a', 0.17, 0.66]].map(([c, r, h], k) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    if (k === 3) f.position.x = 0.14;
    f.position.y = 0.2 + h / 2; f.userData = { h, k }; g.add(f); return f;
  });
  // 튀어 오르는 불티
  const SPARKS = 14, sparkPos = new Float32Array(SPARKS * 3), sparkSeed = Array.from({ length: SPARKS }, (_, i) => ({ a: i * 2.4, r: 0.1 + (i % 5) * 0.05, sp: 0.55 + (i % 4) * 0.18, off: i / SPARKS }));
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,220,150,0.8)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();      // 둥글게 번지는 불티
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#ffc46b', map: dot, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; g.add(sparks);
  const light = new THREE.PointLight('#ffb067', 0, 14, 1.6); light.position.y = 1.1; g.add(light);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
  // 둘레의 그루터기 의자 넷 (나이테가 보이는 윗면, 위에 소복한 눈)
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#d9b27c'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(122,74,38,0.55)'; x.lineWidth = 2.5;
    for (let r = 10; r < 64; r += 9) { x.beginPath(); x.arc(64, 64, r, 0, Math.PI * 2); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  for (const b of STUMP_BLOCKS) {
    const st = new THREE.Group();
    const bark = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.46, 14), mat('#7a4f2e')); bark.position.y = 0.23; bark.castShadow = true; bark.receiveShadow = true; st.add(bark);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.9 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.461; st.add(top);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff', { roughness: 1 })); cap.scale.set(1, 0.35, 1); cap.position.set(0.1, 0.46, -0.06); st.add(cap);
    st.position.set(b.x - CAMPFIRE.x, 0, b.z - CAMPFIRE.z); g.add(st);
  }
  g.position.set(CAMPFIRE.x, 0, CAMPFIRE.z);
  scene.add(g);

  return {
    group: g, light,
    /** 불에서 떨어진 거리 */
    dist: (x, z) => Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z),
    /** 불꽃이 일렁이고 불티가 튄다. night: 0(낮)..1(밤) — 밤일수록 불빛이 둘레를 밝힌다 */
    update(time, night = 0) {
      for (const f of flames) { const k = f.userData.k; const s = 1 + 0.16 * Math.sin(time * (9 + k * 3)) + 0.08 * Math.sin(time * 23 + k); f.scale.set(1 - 0.06 * Math.sin(time * 13 + k), s, 1); f.position.y = 0.2 + f.userData.h * s / 2; f.rotation.y = time * (0.6 + k * 0.3); }
      for (let i = 0; i < SPARKS; i++) {
        const sd = sparkSeed[i], u = (time * sd.sp + sd.off) % 1, a = sd.a + time * 0.7;
        sparkPos[i * 3] = Math.sin(a) * sd.r * (1 + u); sparkPos[i * 3 + 1] = 0.4 + u * 1.9; sparkPos[i * 3 + 2] = Math.cos(a) * sd.r * (1 + u);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparks.material.opacity = 0.9 * (0.4 + 0.6 * night);
      light.intensity = (1.2 + 5.5 * night) * (1 + 0.12 * Math.sin(time * 11) + 0.06 * Math.sin(time * 27));
      glow.material.opacity = 0.08 + 0.2 * night;
    },
  };
}
