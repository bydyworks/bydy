// 작은 눈덩이들.
//   puff:  눈사람이 "뿅" 하고 될 때, 둘레로 눈가루가 폭 하고 퍼졌다가 금세 사라진다.
//   burst: 눈사람이 걸음을 떼면, 몸을 덮고 있던 눈이 덩이째 부서져 흩어졌다가 눈밭에 스며든다.
import * as THREE from 'three';

const COUNT = 22;          // 눈덩이 수
const GRAVITY = 7.5;
const PUFFS = 14;          // 뿅 할 때 퍼지는 눈가루 수

export function createCrumble(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), COUNT);
  mesh.castShadow = true;
  mesh.frustumCulled = false;          // 덩이들이 흩어지는 자리는 그때그때 달라진다
  mesh.visible = false;
  scene.add(mesh);

  const bits = Array.from({ length: COUNT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0, landed: false, rest: 0, spin: 0, puff: false, full: 0, age: 0, life: 0 }));
  const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), scale = new THREE.Vector3();
  const AXIS = new THREE.Vector3(0.4, 1, 0.25).normalize();
  let active = 0;

  function write() {
    bits.forEach((b, i) => {
      const s = Math.max(0, b.size);
      matrix.compose(b.p, turn.setFromAxisAngle(AXIS, b.spin), scale.set(s, s * 0.8, s));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    /** 아직 흩어지고 있는 눈덩이 수 */
    get active() { return active; },
    /** 점검용: 지금 화면에 그려지고 있는 눈덩이들의 자리 [x, y, z] (가려져 있으면 빈 목록) */
    get shown() { return mesh.visible ? bits.filter((b) => b.size > 0).map((b) => [b.p.x, b.p.y, b.p.z]) : []; },
    /** (x, z) 에서 눈사람이 뿅 하고 생긴다: 눈가루가 둘레로 폭 퍼졌다가 0.4초쯤 만에 사라진다 */
    puff(x, z) {
      bits.forEach((b, i) => {
        b.size = 0; b.puff = true; b.landed = false; b.rest = 0;
        if (i >= PUFFS) return;
        const a = (i + Math.random()) / PUFFS * Math.PI * 2, h = 0.15 + Math.random() * 1.45;
        const r = h > 1.05 ? 0.5 : 0.76;                       // 눈사람의 겉에서 시작한다
        const out = 1.7 + Math.random() * 1.3;
        b.p.set(x + Math.sin(a) * r, h, z + Math.cos(a) * r);
        b.v.set(Math.sin(a) * out, 0.2 + Math.random() * 0.9, Math.cos(a) * out);
        b.full = 0.06 + Math.random() * 0.07; b.size = b.full; b.age = 0; b.life = 0.3 + Math.random() * 0.2; b.spin = Math.random() * 6.28;
      });
      active = PUFFS;
      mesh.visible = true;
      write();
    },
    /** (x, z) 에 서 있던 눈사람이 부서진다 */
    burst(x, z) {
      bits.forEach((b, i) => {
        b.puff = false;
        const a = (i + Math.random()) / COUNT * Math.PI * 2, h = 0.25 + Math.random() * 1.45;
        const r = h > 1.05 ? 0.42 : 0.66;                      // 머리 둘레는 좁고 몸 둘레는 넓다
        const out = 0.5 + Math.random() * 1.1;
        b.p.set(x + Math.sin(a) * r, h, z + Math.cos(a) * r);
        b.v.set(Math.sin(a) * out, 0.5 + Math.random() * 1.5, Math.cos(a) * out);
        b.size = 0.07 + Math.random() * 0.1; b.landed = false; b.rest = 0; b.spin = Math.random() * 6.28;
      });
      active = COUNT;
      mesh.visible = true;
      write();
    },
    update(dt) {
      if (!active) return;
      active = 0;
      for (const b of bits) {
        if (b.size <= 0) continue;
        if (b.puff) {
          // 눈가루: 빠르게 퍼지다 멈칫하며 작아져 사라진다
          b.age += dt;
          b.v.multiplyScalar(Math.exp(-6 * dt));
          b.p.addScaledVector(b.v, dt);
          b.spin += dt * 4;
          const k = b.age / b.life;
          b.size = k >= 1 ? 0 : b.full * (1 - k * k);
        } else if (!b.landed) {
          b.v.y -= GRAVITY * dt;
          b.p.addScaledVector(b.v, dt);
          b.spin += dt * 5;
          if (b.p.y <= b.size * 0.4) b.landed = true;
        } else {
          b.rest += dt;
          if (b.rest > 0.3) b.size -= dt * 0.2;                // 떨어진 눈덩이는 눈밭에 스며든다
        }
        if (b.landed && !b.puff) b.p.y = Math.max(0, b.size) * 0.4;
        if (b.size > 0) active++;
      }
      write();
      if (!active) mesh.visible = false;
    },
  };
}
