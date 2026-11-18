// 눈사람이 걸음을 떼면, 몸을 덮고 있던 눈이 덩이째 부서져 둘레로 흩어졌다가 눈밭에 스며든다.
import * as THREE from 'three';

const COUNT = 22;          // 눈덩이 수
const GRAVITY = 7.5;

export function createCrumble(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), COUNT);
  mesh.castShadow = true;
  mesh.frustumCulled = false;          // 덩이들이 흩어지는 자리는 그때그때 달라진다
  mesh.visible = false;
  scene.add(mesh);

  const bits = Array.from({ length: COUNT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0, landed: false, rest: 0, spin: 0 }));
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
    /** (x, z) 에 서 있던 눈사람이 부서진다 */
    burst(x, z) {
      bits.forEach((b, i) => {
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
        if (!b.landed) {
          b.v.y -= GRAVITY * dt;
          b.p.addScaledVector(b.v, dt);
          b.spin += dt * 5;
          if (b.p.y <= b.size * 0.4) b.landed = true;
        } else {
          b.rest += dt;
          if (b.rest > 0.3) b.size -= dt * 0.2;                // 떨어진 눈덩이는 눈밭에 스며든다
        }
        if (b.landed) b.p.y = Math.max(0, b.size) * 0.4;
        if (b.size > 0) active++;
      }
      write();
      if (!active) mesh.visible = false;
    },
  };
}
