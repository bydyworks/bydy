// 눈덩이: 펭귄이 날개로 휙 던지면 포물선을 그리며 날아가 떨어진 자리에서 퍽 하고 부서진다.
import * as THREE from 'three';

const FLIGHT = 0.75;             // 날아가는 시간(초)
const ARC = 1.6;                 // 가장 높이 뜨는 정도 (거리에 따라 조금 더)

export function createSnowballs(scene, { puff = () => {} } = {}) {
  const geo = new THREE.SphereGeometry(0.22, 16, 12), mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const live = [];
  return {
    /** from → to 로 하나 던진다. land(x, z): 떨어졌을 때 */
    throw(from, to, land = () => {}) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; scene.add(m);
      const d = Math.hypot(to.x - from.x, to.z - from.z);
      live.push({ m, from: { x: from.x, y: from.y ?? 1.2, z: from.z }, to: { x: to.x, y: to.y ?? 0.9, z: to.z }, t: 0, h: ARC + d * 0.05, land });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i]; b.t += dt;
        const u = Math.min(1, b.t / FLIGHT);
        b.m.position.set(b.from.x + (b.to.x - b.from.x) * u, b.from.y + (b.to.y - b.from.y) * u + Math.sin(Math.PI * u) * b.h, b.from.z + (b.to.z - b.from.z) * u);
        b.m.rotation.x += dt * 9;
        if (u >= 1) { scene.remove(b.m); live.splice(i, 1); puff(b.to.x, b.to.z, 0.5); b.land(b.to.x, b.to.z); }
      }
    },
    get flying() { return live.length; },
  };
}
