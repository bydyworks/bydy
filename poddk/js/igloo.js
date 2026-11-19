// 이글루와 얼음 낚시터. 트리에서 멀리 떨어진 들판 가장자리 쪽에 하나 — 조금 돌아다녀야 찾을 수 있다.
// 이글루 문 앞에 꽁꽁 언 작은 연못이 있고, 연못에는 낚시 구멍이 하나 뚫려 있다.
// 낮에는 흰 눈밭에 묻혀 잘 보이지 않지만, 밤에는 문 안에서 따뜻한 불빛이 새어 나온다.
import * as THREE from 'three';

const AT = { x: 58, z: -52 };                                          // 이글루의 가운데 (들판 가운데에서 78 떨어진 곳)
const TO_FIELD = (() => { const d = Math.hypot(AT.x, AT.z); return { x: -AT.x / d, z: -AT.z / d }; })();     // 문이 바라보는 쪽 (들판 가운데)
const along = (d) => ({ x: AT.x + TO_FIELD.x * d, z: AT.z + TO_FIELD.z * d });

export const IGLOO = { ...AT, radius: 2.5, yaw: Math.atan2(TO_FIELD.x, TO_FIELD.z) };
export const POND = { ...along(8.4), radius: 5.2 };                   // 문 앞의 언 연못
export const HOLE = { ...along(5.3), radius: 0.42 };                  // 낚시 구멍 (문에서 한 걸음 반 앞)
/** 걸어서 들어갈 수 없는 곳들: 둥근 눈집, 문간, 낚시 구멍 */
export const BLOCKS = [{ ...AT, r: IGLOO.radius + 0.3 }, { ...along(3.05), r: 1.5 }, { x: HOLE.x, z: HOLE.z, r: HOLE.radius + 0.38 }];
/** 풀이 나지 않는 곳 (이글루와 연못) */
export const CLEARINGS = [{ ...AT, r: IGLOO.radius + 1.6 }, { x: POND.x, z: POND.z, r: POND.radius + 0.4 }];

/** 그 자리가 얼음 위인가 (얼음 위에는 발자국이 남지 않는다) */
export const onIce = (x, z) => Math.hypot(x - POND.x, z - POND.z) < POND.radius - 0.35;
/** 낚시 구멍 곁인가 (여기서 낚시를 할 수 있다) */
export const nearHole = (x, z) => Math.hypot(x - HOLE.x, z - HOLE.z) < 2.3;

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

  // ---------- 이글루 ----------
  const igloo = new THREE.Group();
  igloo.position.set(IGLOO.x, 0, IGLOO.z);
  igloo.rotation.y = IGLOO.yaw;                                       // 문(+Z)이 들판 가운데를 본다
  group.add(igloo);
  const snow = new THREE.MeshStandardMaterial({ color: '#f6f9ff', roughness: 1, map: brickTexture() });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(IGLOO.radius, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2), snow);
  dome.scale.y = 0.9;
  igloo.add(dome);
  // 문간: 반쯤 묻힌 둥근 통로와 그 앞의 테두리
  const plain = new THREE.MeshStandardMaterial({ color: '#f3f7ff', roughness: 1 });
  const porch = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.9, 24, 1, true), plain);
  porch.rotation.x = Math.PI / 2; porch.position.set(0, 0, IGLOO.radius + 0.35);
  igloo.add(porch);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.19, 10, 28), plain);
  frame.position.set(0, 0, IGLOO.radius + 1.3);
  igloo.add(frame);
  // 문 안: 낮에는 어둑하고, 밤에는 따뜻한 불빛
  const inside = new THREE.MeshStandardMaterial({ color: '#39405f', roughness: 1, emissive: '#ffb968', emissiveIntensity: 0 });
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.86, 28), inside);
  door.position.set(0, 0, IGLOO.radius + 1.24);
  igloo.add(door);
  // 발치에 쌓인 눈
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(IGLOO.radius + 0.05, 0.3, 8, 40), plain);
  skirt.rotation.x = Math.PI / 2; skirt.scale.z = 0.55; skirt.position.y = 0.02;
  igloo.add(skirt);
  // 밤에 문 앞 눈 위로 번지는 불빛 (빛을 하나 더 켜지 않고 그림으로 얹는다)
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffc27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.03, IGLOO.radius + 2.5); spill.renderOrder = 3;
  igloo.add(spill);
  igloo.traverse((o) => { if (o.isMesh && o !== spill && o !== door) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------- 언 연못과 낚시 구멍 ----------
  const ice = new THREE.Mesh(
    new THREE.CircleGeometry(POND.radius, 56),
    new THREE.MeshStandardMaterial({ color: '#ffffff', map: iceTexture(), roughness: 0.22, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  ice.rotation.x = -Math.PI / 2; ice.position.set(POND.x, 0.008, POND.z); ice.receiveShadow = true; ice.renderOrder = 0.5;
  group.add(ice);
  const water = new THREE.Mesh(new THREE.CircleGeometry(HOLE.radius, 28), new THREE.MeshStandardMaterial({ color: '#1d3b5e', roughness: 0.18, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  water.rotation.x = -Math.PI / 2; water.position.set(HOLE.x, 0.014, HOLE.z); water.renderOrder = 0.6;
  group.add(water);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(HOLE.radius + 0.07, 0.085, 8, 28), plain);    // 구멍 둘레에 쌓인 얼음 부스러기
  rim.rotation.x = Math.PI / 2; rim.scale.z = 0.6; rim.position.set(HOLE.x, 0.025, HOLE.z); rim.castShadow = true; rim.receiveShadow = true;
  group.add(rim);

  return {
    group, igloo, door, spill,
    /** night: 0(낮)..1(밤). 밤이 되면 문 안에 불이 켜진다 */
    update(night, time) {
      const flicker = 0.93 + 0.07 * Math.sin(time * 2.3) * Math.sin(time * 0.7);
      inside.emissiveIntensity = night * 1.15 * flicker;
      spill.material.opacity = night * 0.5 * flicker;
      spill.visible = night > 0.01;
    },
  };
}
