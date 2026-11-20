// 이글루와 얼음 낚시터. 트리를 가운데 두고 그 둘레에, 서로 멀리 떨어져 이글루 셋과 낚시터 셋이 흩어져 있다 — 돌아다녀야 찾을 수 있다.
// 이글루는 눈 벽돌로 쌓은 둥근 집이다. 낮에는 흰 눈밭에 묻혀 잘 보이지 않지만, 밤에는 문 안에서 따뜻한 불빛이 새어 나온다.
// 낚시터는 꽁꽁 언 작은 연못이고, 낚시 구멍이 다섯 개씩 둥글게 뚫려 있다 (여럿이 와도 저마다 한 구멍씩 낚시할 수 있게).
import * as THREE from 'three';

/** 트리에서 본 방향(도, 들어오는 쪽이 0도이고 시계 방향)과 거리 → 들판 위의 자리 */
const at = (deg, far) => ({ x: Math.sin(deg * Math.PI / 180) * far, z: Math.cos(deg * Math.PI / 180) * far });
/** 그 자리에서 트리 쪽으로 d 만큼 다가간 자리 */
const toward = (p, d) => { const r = Math.hypot(p.x, p.z); return { x: p.x - p.x / r * d, z: p.z - p.z / r * d }; };

const IGLOO_RADIUS = 2.5, POND_RADIUS = 5.2, HOLE_RADIUS = 0.42;
// 여섯 곳을 트리 둘레에 번갈아 놓는다 (이글루 – 낚시터 – 이글루 – …). 거리는 저마다 달라서 한 바퀴 빙 둘러선 것처럼 보이지 않는다
/** 이글루 셋: 문은 트리 쪽을 본다 */
export const IGLOOS = [at(130, 34), at(250, 31), at(10, 42)].map((p) => ({ ...p, radius: IGLOO_RADIUS, yaw: Math.atan2(-p.x, -p.z) }));
const HOLES_PER_POND = 5, HOLE_RING = 2.6;      // 연못마다 구멍 다섯 개를 가운데에서 이만큼 떨어진 둘레에 고루 놓는다 (이웃한 구멍 사이는 약 3)
/** 낚시터 셋: 언 연못과, 그 위에 둥글게 뚫린 낚시 구멍 다섯. hole 은 그 가운데 트리 쪽에 있는 첫 구멍 */
export const PONDS = [at(60, 26), at(190, 39), at(310, 32)].map((p) => {
  const base = Math.atan2(-p.x, -p.z);                // 트리 쪽
  const holes = Array.from({ length: HOLES_PER_POND }, (_, i) => {
    const a = base + i * Math.PI * 2 / HOLES_PER_POND;
    return { x: p.x + Math.sin(a) * HOLE_RING, z: p.z + Math.cos(a) * HOLE_RING, radius: HOLE_RADIUS };
  });
  return { ...p, radius: POND_RADIUS, holes, hole: holes[0] };
});
export const HOLES = PONDS.flatMap((p) => p.holes);
/** 걸어서 들어갈 수 없는 곳들: 둥근 눈집과 그 문간, 낚시 구멍 */
export const BLOCKS = [
  ...IGLOOS.flatMap((g) => [{ x: g.x, z: g.z, r: g.radius + 0.3 }, { ...toward(g, 3.05), r: 1.5 }]),
  ...HOLES.map((h) => ({ x: h.x, z: h.z, r: h.radius + 0.38 })),
];
/** 풀이 나지 않는 곳 (이글루와 연못) */
export const CLEARINGS = [...IGLOOS.map((g) => ({ x: g.x, z: g.z, r: g.radius + 2.6 })), ...PONDS.map((p) => ({ x: p.x, z: p.z, r: p.radius + 0.4 }))];

/** 그 자리가 얼음 위인가 (얼음 위에는 발자국이 남지 않는다) */
export const onIce = (x, z) => PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius - 0.35);
/** 곁에 있는 낚시 구멍 (없으면 null). 여기서 낚시를 할 수 있다 */
export const holeNear = (x, z) => { let best = null, d = 2.3; for (const h of HOLES) { const e = Math.hypot(x - h.x, z - h.z); if (e < d) { d = e; best = h; } } return best; };      // 가장 가까운 구멍

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 눈 벽돌을 둥글게 쌓아 올린 무늬 (위로 갈수록 벽돌 수가 줄어든다) */
function brickTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const rows = [5, 9, 13, 16, 18, 20];                              // 꼭대기 줄부터 맨 아랫줄까지, 한 줄의 벽돌 수
    const rh = h / rows.length;
    rows.forEach((n, r) => {
      const bw = w / n, shift = (r % 2) * bw / 2;
      for (let i = -1; i <= n; i++) {                                  // 벽돌마다 아주 조금씩 다른 밝기
        const v = 244 + Math.round(11 * Math.abs(Math.sin((r * 7 + i) * 12.9898)));
        g.fillStyle = `rgb(${v - 6},${v - 2},${Math.min(255, v + 4)})`;
        g.fillRect(i * bw + shift, r * rh, bw, rh);
      }
      g.strokeStyle = 'rgba(134, 156, 198, 0.62)'; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(0, r * rh); g.lineTo(w, r * rh); g.stroke();
      g.lineWidth = 2.6;
      for (let i = -1; i <= n; i++) { const x = i * bw + shift; g.beginPath(); g.moveTo(x, r * rh); g.lineTo(x, (r + 1) * rh); g.stroke(); }
    });
  });
}

/** 언 연못: 가운데는 맑은 얼음, 가장자리는 눈에 덮여 흐려지고, 군데군데 금과 서리가 있다 */
function iceTexture() {
  return canvasTexture(512, 512, (g, n) => {
    const h = n / 2;
    g.clearRect(0, 0, n, n);
    // 들쭉날쭉한 가장자리: 각도마다 조금씩 다른 반지름으로 채운다
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = i / 120 * Math.PI * 2, r = h * (0.9 + 0.045 * Math.sin(a * 3 + 1.1) + 0.03 * Math.sin(a * 7 + 0.4) + 0.018 * Math.sin(a * 13));
      g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
    }
    g.closePath();
    const base = g.createRadialGradient(h, h, 0, h, h, h);
    base.addColorStop(0, '#c2dcf2'); base.addColorStop(0.62, '#cfe5f6'); base.addColorStop(0.86, '#e6f1fb'); base.addColorStop(1, '#ffffff');
    g.fillStyle = base; g.fill();
    g.save(); g.clip();
    // 서리 낀 자리
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399, r = h * 0.78 * Math.sqrt((i + 0.5) / 26), x = h + Math.cos(a) * r, y = h + Math.sin(a) * r, s = 26 + (i * 37 % 40);
      const f = g.createRadialGradient(x, y, 0, x, y, s); f.addColorStop(0, 'rgba(255,255,255,0.34)'); f.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = f; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    // 얼음의 금
    g.strokeStyle = 'rgba(255,255,255,0.72)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      let x = h + Math.cos(i * 0.9 + 0.3) * h * 0.45, y = h + Math.sin(i * 1.7) * h * 0.45, a = i * 2.1;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += Math.sin(i * 5 + k * 3) * 0.7; x += Math.cos(a) * 26; y += Math.sin(a) * 26; g.lineTo(x, y); }
      g.stroke();
    }
    g.restore();
    // 가장자리를 부드럽게 지운다 (눈밭으로 스며들게)
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(h, h, h * 0.8, h, h, h * 0.97);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, n, n);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (g, n) => {
    const f = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    f.addColorStop(0, 'rgba(255,255,255,1)'); f.addColorStop(0.4, 'rgba(255,255,255,0.5)'); f.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = f; g.fillRect(0, 0, n, n);
  });
}

export function createCamp(scene) {
  const group = new THREE.Group();
  scene.add(group);
  // 같은 것은 한 번만 만들어 여러 곳에서 함께 쓴다
  const snow = new THREE.MeshStandardMaterial({ color: '#f6f9ff', roughness: 1, map: brickTexture() });
  const plain = new THREE.MeshStandardMaterial({ color: '#f3f7ff', roughness: 1 });
  const inside = new THREE.MeshStandardMaterial({ color: '#39405f', roughness: 1, emissive: '#ffb968', emissiveIntensity: 0 });      // 문 안: 낮에는 어둑하고, 밤에는 따뜻한 불빛
  const spillMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffc27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const iceMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: iceTexture(), roughness: 0.22, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const waterMat = new THREE.MeshStandardMaterial({ color: '#1d3b5e', roughness: 0.18, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const G = {
    dome: new THREE.SphereGeometry(IGLOO_RADIUS, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    porch: new THREE.CylinderGeometry(1.05, 1.05, 1.9, 24, 1, true),
    frame: new THREE.TorusGeometry(0.93, 0.19, 10, 28),
    door: new THREE.CircleGeometry(0.86, 28),
    skirt: new THREE.TorusGeometry(IGLOO_RADIUS + 0.05, 0.3, 8, 40),
    spill: new THREE.PlaneGeometry(6.2, 6.2),
    ice: new THREE.CircleGeometry(POND_RADIUS, 56),
    water: new THREE.CircleGeometry(HOLE_RADIUS, 28),
    rim: new THREE.TorusGeometry(HOLE_RADIUS + 0.07, 0.085, 8, 28),
  };

  // ---------- 이글루 ----------
  const igloos = IGLOOS.map((at) => {
    const igloo = new THREE.Group();
    igloo.position.set(at.x, 0, at.z);
    igloo.rotation.y = at.yaw;                                        // 문(+Z)이 트리를 본다
    const dome = new THREE.Mesh(G.dome, snow); dome.scale.y = 0.9; igloo.add(dome);
    // 문간: 반쯤 묻힌 둥근 통로와 그 앞의 테두리
    const porch = new THREE.Mesh(G.porch, plain); porch.rotation.x = Math.PI / 2; porch.position.set(0, 0, IGLOO_RADIUS + 0.35); igloo.add(porch);
    const frame = new THREE.Mesh(G.frame, plain); frame.position.set(0, 0, IGLOO_RADIUS + 1.3); igloo.add(frame);
    const door = new THREE.Mesh(G.door, inside); door.position.set(0, 0, IGLOO_RADIUS + 1.24); igloo.add(door);
    // 발치에 쌓인 눈
    const skirt = new THREE.Mesh(G.skirt, plain); skirt.rotation.x = Math.PI / 2; skirt.scale.z = 0.55; skirt.position.y = 0.02; igloo.add(skirt);
    // 밤에 문 앞 눈 위로 번지는 불빛 (빛을 하나 더 켜지 않고 그림으로 얹는다)
    const spill = new THREE.Mesh(G.spill, spillMat.clone()); spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.03, IGLOO_RADIUS + 2.5); spill.renderOrder = 3; igloo.add(spill);
    igloo.traverse((o) => { if (o.isMesh && o !== spill && o !== door) { o.castShadow = true; o.receiveShadow = true; } });
    igloo.userData.spill = spill;
    group.add(igloo);
    return igloo;
  });

  // ---------- 언 연못과 낚시 구멍 ----------
  const ponds = PONDS.map((at, i) => {
    const pond = new THREE.Group();
    const ice = new THREE.Mesh(G.ice, iceMat);
    ice.rotation.x = -Math.PI / 2; ice.rotation.z = i * 2.1; ice.position.set(at.x, 0.008, at.z); ice.receiveShadow = true; ice.renderOrder = 0.5;       // 연못마다 얼음 무늬를 돌려 놓는다
    pond.add(ice);
    for (const h of at.holes) {                                        // 구멍마다 물과, 둘레에 쌓인 얼음 부스러기
      const water = new THREE.Mesh(G.water, waterMat);
      water.rotation.x = -Math.PI / 2; water.position.set(h.x, 0.014, h.z); water.renderOrder = 0.6;
      pond.add(water);
      const rim = new THREE.Mesh(G.rim, plain);
      rim.rotation.x = Math.PI / 2; rim.scale.z = 0.6; rim.position.set(h.x, 0.025, h.z); rim.castShadow = true; rim.receiveShadow = true;
      pond.add(rim);
    }
    group.add(pond);
    return pond;
  });

  return {
    group, igloos, ponds,
    /**
     * night: 0(낮)..1(밤). 밤이 되면 이글루 문 안에 불이 켜진다.
     * camera, fog: 눈 위로 번지는 불빛은 안개를 타지 않는 그림이라서, 이글루가 안개(눈발)에 묻히는 만큼 손수 흐리게 한다
     *   (그러지 않으면 폭설의 밤에 이글루는 안 보이는데 불빛만 지평선에 떠 보인다)
     */
    update(night, time, camera, fog) {
      const flicker = 0.93 + 0.07 * Math.sin(time * 2.3) * Math.sin(time * 0.7);
      inside.emissiveIntensity = night * 1.15 * flicker;
      for (const g of igloos) {
        const spill = g.userData.spill;
        let clear = 1;
        if (camera && fog) {
          const d = Math.hypot(camera.position.x - g.position.x, camera.position.y, camera.position.z - g.position.z);
          clear = Math.min(1, Math.max(0, (fog.far - d) / (fog.far - fog.near)));
        }
        spill.material.opacity = night * 0.5 * flicker * clear * clear;
        spill.visible = spill.material.opacity > 0.004;
      }
    },
  };
}
