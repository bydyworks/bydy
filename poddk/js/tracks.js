// 눈 위의 자국: 발자국, 눈 천사, 그리고 여우의 작은 발자국.
// 자국마다 "찍힌 시각"을 기억해 두고, 지금 시각에 얼마나 남아 보일지는 clock.js 의 규칙(printAlpha)으로 정한다.
// 수천 개를 한 번에 그리기 위해 같은 모양을 복제해 그린다(InstancedMesh).
import * as THREE from 'three';
import { printAlpha } from './clock.js';

const MAX_PRINTS = 4000;
const MAX_ANGELS = 120;
const MAX_PAWS = 2400;            // 여우 발자국 (작고, 금방 사라진다)
const CELL = 0.25;                // "다져진 길" 판정용 격자 한 칸 (새 눈과 밟힌 눈의 소리가 다르다)
const Y = 0.012;                  // 땅에서 살짝 띄운다 (겹쳐 깜빡이지 않게)

const LIFT = 0.0035;              // 한 자국 안의 조각들을 이만큼씩 다른 높이에 둔다

/**
 * 평평한 도형 여러 개를 한 덩어리로 합친다. parts: [geometry(XY 평면), x, z, 회전(라디안), sx, sz]
 * 앞에 적은 조각일수록 높이 두고 먼저 그린다 → 겹친 곳에서는 위 조각만 칠해져, 겹침이 두 번 칠해져 진해지지 않는다.
 */
function flat(parts) {
  const pos = [];
  const v = new THREE.Vector3();
  let h = (parts.length - 1) * LIFT;
  for (const [geo, x = 0, z = 0, rot = 0, sx = 1, sz = 1] of parts) {
    const g = geo.toNonIndexed();
    const a = g.attributes.position;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < a.count; i++) {
      // XY 평면의 도형을 눕힌다: (x, y) → (x, 0, -y), 그다음 크기·회전·이동
      const px = a.getX(i) * sx, pz = -a.getY(i) * sz;
      v.set(px * c + pz * s + x, 0, -px * s + pz * c + z);
      pos.push(v.x, h, v.z);
    }
    h -= LIFT;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const normal = new Float32Array(pos.length);
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return out;
}

/** 물갈퀴 발자국 한 개: 뒤꿈치 동그라미 + 앞(+Z)으로 벌어진 세 발가락. 길이 약 0.22 */
function footprintGeometry() {
  const parts = [[new THREE.CircleGeometry(0.05, 10), 0, -0.02]];
  for (const ang of [-0.5, 0, 0.5]) parts.push([new THREE.CircleGeometry(0.034, 8), Math.sin(ang) * 0.095, Math.cos(ang) * 0.095 - 0.02, ang, 0.75, 2.4]);
  return flat(parts);
}

/** 여우 발자국 한 개: 동그란 발바닥 + 앞(+Z)의 작은 발가락 셋. 길이 약 0.11 — 펭귄 발자국의 절반 */
function pawGeometry() {
  const parts = [[new THREE.CircleGeometry(0.03, 9), 0, -0.012, 0, 1.1, 1]];
  for (const x of [-0.026, 0, 0.026]) parts.push([new THREE.CircleGeometry(0.0135, 7), x, 0.036 - Math.abs(x) * 0.35, 0, 1, 1.25]);
  return flat(parts);
}

/** 눈 천사 자국: 누운 펭귄의 머리·몸통, 휘저은 날개와 발이 쓸고 간 부채꼴. (펭귄이 +Z 를 보고 서 있던 자리 기준) */
function angelGeometry() {
  return flat([
    [new THREE.CircleGeometry(0.36, 20), 0, -0.66],                                  // 머리
    [new THREE.CircleGeometry(0.5, 24), 0, -0.05, 0, 1.08, 1.2],                     // 몸통
    [new THREE.CircleGeometry(0.82, 16, Math.PI - 1.0, 2.0), -0.25, -0.38],          // 왼 날개가 쓴 자리
    [new THREE.CircleGeometry(0.82, 16, -1.0, 2.0), 0.25, -0.38],                    // 오른 날개
    [new THREE.CircleGeometry(0.46, 10, -Math.PI / 2 - 0.8, 1.6), -0.14, 0.36],      // 왼발
    [new THREE.CircleGeometry(0.46, 10, -Math.PI / 2 - 0.8, 1.6), 0.14, 0.36],       // 오른발
  ]);
}

/** 눈이 눌린 자리의 재질: 주변 빛과 그림자를 받고, 자국마다 투명도가 다르다 */
function dentMaterial() {
  // 깊이를 적는다: 한 자국 안에서 겹친 조각(머리와 몸통, 발가락과 뒤꿈치)은 위의 것만 칠해진다 (flat 참고)
  const m = new THREE.MeshStandardMaterial({ color: '#8f9ccf', roughness: 1, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;\nif (diffuseColor.a < 0.012) discard;');
  };
  return m;
}

function layer(scene, geometry, capacity, order) {
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aAlpha', alpha);
  const mesh = new THREE.InstancedMesh(geometry, dentMaterial(), capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;       // 복제된 조각들은 들판 곳곳에 흩어져 있다
  mesh.receiveShadow = true;
  mesh.renderOrder = order;
  scene.add(mesh);
  return { mesh, alpha, items: new Array(capacity), next: 0, size: 0, capacity };
}

export function createTracks(scene) {
  const angels = layer(scene, angelGeometry(), MAX_ANGELS, 1);        // 넓은 자국을 먼저, 그 위에 발자국
  const prints = layer(scene, footprintGeometry(), MAX_PRINTS, 2);
  const paws = layer(scene, pawGeometry(), MAX_PAWS, 2);
  const grid = new Map();           // "ix,iz" → [그 칸이 마지막으로 밟힌 시각, 몇 번째 걸음이었는지]
  let stepNo = 0;                   // 지금까지 찍은 걸음 수 (방금 찍은 내 발자국 옆을 "밟힌 길"로 착각하지 않으려고 센다)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);

  /** 그 자리 둘레(가로세로 2r+1 칸)를 밟힌 곳으로 적는다. 발자국 하나는 둘레 한 칸씩 — 걸어간 줄이 끊김 없는 길이 된다 */
  function stamp(x, z, r, birth, n = -Infinity) {
    const v = [birth, n];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) grid.set(key(x + dx * CELL, z + dz * CELL), v);
  }

  function put(L, item) {
    const i = L.next;
    L.items[i] = item;
    L.next = (L.next + 1) % L.capacity;
    L.size = Math.min(L.size + 1, L.capacity);
    p.set(item.x, Y + (L === prints ? 0.03 : L === paws ? 0.02 : 0), item.z);       // 발자국은 눈 천사 자국보다 위에
    q.setFromAxisAngle(up, item.yaw);
    m.compose(p, q, s);
    L.mesh.setMatrixAt(i, m);
    L.mesh.instanceMatrix.needsUpdate = true;
    L.mesh.count = L.size;
    L.alpha.setX(i, 0);
    L.alpha.needsUpdate = true;
  }

  /** 발자국 하나. yaw: 걷는 방향(라디안, 0 = +Z), side: 몸 기준 +X 쪽 발이 +1 / 반대쪽이 -1, birth: 찍힌 세계 시각 */
  function addPrint(x, z, yaw, side, birth) {
    put(prints, { x, z, yaw: yaw - side * 0.28, birth });      // 펭귄은 발끝이 살짝 안쪽을 향한다 (side: 몸 기준 +X 쪽 발이 +1)
    stamp(x, z, 1, birth, ++stepNo);
  }

  /** 여우 발자국 하나. life: 다 흐려지기까지의 시간(ms). 소리가 달라지는 "다져진 길"로는 치지 않는다 */
  function addPaw(x, z, yaw, birth, life) {
    put(paws, { x, z, yaw, birth, life });
  }
  /** 여우 발자국을 모두 지운다 (시계가 건너뛰어 처음부터 다시 그려야 할 때) */
  function clearPaws() {
    paws.items.fill(undefined); paws.next = 0; paws.size = 0; paws.mesh.count = 0;
  }

  /** 눈 천사 자국. grow: 0..1 (휘젓는 동안 서서히 드러난다) */
  function addAngel(x, z, yaw, birth) {
    const item = { x, z, yaw, birth, grow: 0 };
    put(angels, item);
    stamp(x, z, 4, birth);
    return item;
  }

  /** 그 자리가 이미 밟힌(아직 자국이 남은) 곳인가 */
  function isPacked(x, z, now) {
    const v = grid.get(key(x, z));
    return v !== undefined && stepNo - v[1] > 6 && printAlpha(v[0], now) > 0.3;      // 방금 걸은 몇 걸음은 빼고
  }

  function refreshLayer(L, now) {
    let alive = 0;
    for (let i = 0; i < L.size; i++) {
      const it = L.items[i];
      let a = it ? printAlpha(it.birth, now, it.life) : 0;
      if (it && it.grow !== undefined) a *= it.grow * 0.62;      // 눈 천사는 넓은 자국이라 발자국보다 옅게 그린다
      if (a > 0.01) alive++;
      L.alpha.array[i] = a * 0.9;
    }
    L.alpha.needsUpdate = true;
    return alive;
  }

  let alive = 0, pawsAlive = 0;
  /** 지금 시각에 맞춰 모든 자국의 흐림을 다시 정한다 */
  function update(now) {
    alive = refreshLayer(prints, now) + refreshLayer(angels, now);
    pawsAlive = refreshLayer(paws, now);
    if (grid.size > 60000) for (const [k, v] of grid) if (printAlpha(v[0], now) <= 0) grid.delete(k);
  }

  /** 저장용: 아직 남아 있는 자국들만 */
  function dump(now) {
    const pick = (L) => L.items.filter((it) => it && printAlpha(it.birth, now) > 0.02 && (it.grow === undefined || it.grow >= 1))
      .map((it) => [Math.round(it.x * 100) / 100, Math.round(it.z * 100) / 100, Math.round(it.yaw * 100) / 100, Math.round(it.birth)]);
    return { prints: pick(prints), angels: pick(angels) };
  }

  function restore(data, now) {
    if (!data || typeof data !== 'object') return;
    const ok = (r) => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && printAlpha(r[3], now) > 0.02;
    (Array.isArray(data.prints) ? data.prints : []).filter(ok).slice(-MAX_PRINTS).forEach(([x, z, yaw, birth]) => { put(prints, { x, z, yaw, birth }); stamp(x, z, 1, birth); });
    (Array.isArray(data.angels) ? data.angels : []).filter(ok).slice(-MAX_ANGELS).forEach(([x, z, yaw, birth]) => { put(angels, { x, z, yaw, birth, grow: 1 }); stamp(x, z, 4, birth); });
  }

  return {
    addPrint, addAngel, addPaw, clearPaws, isPacked, update, dump, restore, get alive() { return alive; },
    /** 점검용: 여우 발자국의 수(지금 보이는 것 / 찍어 둔 것)와 자리 */
    get pawsAlive() { return pawsAlive; }, get pawCount() { return paws.size; },
    paws: () => paws.items.slice(0, paws.size).filter(Boolean).map((it) => ({ x: it.x, z: it.z, birth: it.birth })),
    /** 점검용: 지금 그려지는 발자국들의 진하기 */
    alphas: () => Array.from(prints.alpha.array.subarray(0, prints.size)), get printCount() { return prints.size; }, get angelCount() { return angels.size; },
  };
}
