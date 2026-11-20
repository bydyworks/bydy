// 슬라이딩 언덕: 들판 한쪽에 솟은 둥근 눈 언덕. 한쪽의 계단으로 걸어 오르고, 꼭대기 가장자리에서 비탈 쪽으로 걸어 나가면 저절로 배를 깔고 슬라이딩으로 쌩 내려간다.
// 비탈은 걸어서 오를 수 없다 (미끄러져 내려온 뒤 비탈에 멈췄으면 아래쪽으로는 걸어 나올 수 있다).
// 언덕의 높이는 heightAt(x, z) 로 어디서나 잴 수 있다 (펭귄과 다른 펭귄이 그 높이에 선다).
import * as THREE from 'three';

const DEG = 100, FAR = 46;                      // 트리에서 본 방향(도)과 거리
export const HILL = { x: Math.sin(DEG * Math.PI / 180) * FAR, z: Math.cos(DEG * Math.PI / 180) * FAR, r: 10, h: 3.2, top: 2.2 };      // top: 꼭대기의 평평한 자리
const STAIR_DIR = (DEG + 90) * Math.PI / 180, STAIR_HALF = 0.85;      // 계단은 트리에서 보아 옆쪽(오른쪽)에서 꼭대기로 곧게 오른다
const sd = { x: Math.sin(STAIR_DIR), z: Math.cos(STAIR_DIR) };
const smooth = (t) => t * t * (3 - 2 * t);
/** 그 자리의 땅 높이 (언덕 밖은 0) */
export function heightAt(x, z) {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  if (d >= HILL.r) return 0;
  if (d <= HILL.top) return HILL.h;
  return HILL.h * smooth(1 - (d - HILL.top) / (HILL.r - HILL.top));
}
export const onHill = (x, z) => Math.hypot(x - HILL.x, z - HILL.z) < HILL.r;
/** 계단 위인가 (언덕 밖 한 걸음부터 꼭대기까지) */
export function onStairs(x, z) {
  const dx = x - HILL.x, dz = z - HILL.z, along = dx * sd.x + dz * sd.z, side = dx * sd.z - dz * sd.x;
  return Math.abs(side) < STAIR_HALF && along > HILL.top - 0.5 && along < HILL.r + 1;
}
/** 꼭대기의 평평한 자리에서 비탈(계단 아닌 쪽)로 걸어 나가는 걸음인가: 그러면 걷는 대신 슬라이딩으로 내려간다 */
export function slidesOff(fx, fz, tx, tz) {
  return Math.hypot(fx - HILL.x, fz - HILL.z) <= HILL.top && Math.hypot(tx - HILL.x, tz - HILL.z) > HILL.top && !onStairs(tx, tz);
}
/** 걸어서 (fx, fz) 에서 (tx, tz) 로 갈 수 있는가: 비탈은 계단과 꼭대기로만 다닌다 (비탈 위에 있으면 내려가는 쪽으로는 걸을 수 있다) */
export function canWalk(fx, fz, tx, tz) {
  if (!onHill(tx, tz) || onStairs(tx, tz) || Math.hypot(tx - HILL.x, tz - HILL.z) <= HILL.top) return true;
  const onSlope = onHill(fx, fz) && !onStairs(fx, fz) && Math.hypot(fx - HILL.x, fz - HILL.z) > HILL.top;
  return onSlope && heightAt(tx, tz) <= heightAt(fx, fz) + 1e-6;
}

export function createHill(scene) {
  const g = new THREE.Group();
  const geo = new THREE.CircleGeometry(HILL.r, 64, 0, Math.PI * 2); geo.rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(0.01, HILL.r, 64, 24); ring.rotateX(-Math.PI / 2);
  const pos = ring.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, heightAt(HILL.x + x, HILL.z + z) + 0.005); }
  ring.computeVertexNormals();
  const mound = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })); mound.receiveShadow = true; mound.castShadow = true; g.add(mound);
  geo.dispose();
  // 계단: 눈을 다져 깎은 계단 칸들과 양옆의 나무 난간
  const stepMat = new THREE.MeshStandardMaterial({ color: '#eef3fa', roughness: 0.9 }), edge = new THREE.MeshStandardMaterial({ color: '#c9d6e8', roughness: 0.9 }), wood = new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.9 });
  const STEPS = 14;
  for (let k = 0; k < STEPS; k++) {
    const a0 = HILL.r + 0.6 - (k / STEPS) * (HILL.r + 0.6 - HILL.top), a1 = HILL.r + 0.6 - ((k + 1) / STEPS) * (HILL.r + 0.6 - HILL.top);
    const mid = (a0 + a1) / 2, top = heightAt(HILL.x + sd.x * a1, HILL.z + sd.z * a1);
    const box = new THREE.Mesh(new THREE.BoxGeometry(STAIR_HALF * 2, Math.max(0.08, top) + 0.04, a0 - a1 + 0.02), k % 2 ? stepMat : edge);
    box.position.set(sd.x * mid, (Math.max(0.08, top) + 0.04) / 2, sd.z * mid); box.rotation.y = STAIR_DIR; box.receiveShadow = true; g.add(box);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k <= 4; k++) {
      const a = HILL.r + 0.6 - (k / 4) * (HILL.r + 0.6 - HILL.top), px = sd.x * a + sd.z * s * (STAIR_HALF + 0.05), pz = sd.z * a - sd.x * s * (STAIR_HALF + 0.05), y = heightAt(HILL.x + sd.x * a, HILL.z + sd.z * a);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), wood); post.position.set(px, y + 0.4, pz); g.add(post);
      if (k < 4) {
        const a2 = HILL.r + 0.6 - ((k + 1) / 4) * (HILL.r + 0.6 - HILL.top), px2 = sd.x * a2 + sd.z * s * (STAIR_HALF + 0.05), pz2 = sd.z * a2 - sd.x * s * (STAIR_HALF + 0.05), y2 = heightAt(HILL.x + sd.x * a2, HILL.z + sd.z * a2);
        const len = Math.hypot(px2 - px, pz2 - pz, y2 - y), rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), wood);
        rail.position.set((px + px2) / 2, (y + y2) / 2 + 0.78, (pz + pz2) / 2); rail.lookAt(new THREE.Vector3(px2 + HILL.x, y2 + 0.78, pz2 + HILL.z)); rail.rotateX(Math.PI / 2); g.add(rail);
      }
    }
  }
  // 꼭대기의 작은 깃발과 "슬라이딩" 팻말
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#8a5a36' })); pole.position.set(0.6, HILL.h + 0.7, 0); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshStandardMaterial({ color: '#e0503f', side: THREE.DoubleSide })); flag.position.set(0.9, HILL.h + 1.25, 0); g.add(flag);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = '#fff3c4'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#7a3b22'; x.font = '900 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🐧 슬라이딩', 128, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshStandardMaterial({ map: tex })); face.position.y = 0.9; sign.add(face);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#6b4428' })); post.position.y = 0.45; sign.add(post);
  const foot = HILL.r + 1.4;      // 계단 아래 옆에
  sign.position.set(sd.x * foot + sd.z * (STAIR_HALF + 0.9), 0, sd.z * foot - sd.x * (STAIR_HALF + 0.9)); sign.rotation.y = STAIR_DIR; g.add(sign);
  g.traverse((o) => { if (o.isMesh && o !== mound) o.castShadow = true; });
  g.position.set(HILL.x, 0, HILL.z);
  scene.add(g);
  return { group: g };
}
