// 눈썰매 언덕: 들판 한쪽에 솟은 둥근 눈 언덕. 걸어서 꼭대기에 오른 뒤 배 썰매를 타면 비탈을 따라 쌩 내려간다.
// 언덕의 높이는 heightAt(x, z) 로 어디서나 잴 수 있다 (펭귄과 다른 펭귄이 그 높이에 선다).
import * as THREE from 'three';

const DEG = 100, FAR = 46;                      // 트리에서 본 방향(도)과 거리
export const HILL = { x: Math.sin(DEG * Math.PI / 180) * FAR, z: Math.cos(DEG * Math.PI / 180) * FAR, r: 10, h: 3.2 };
const smooth = (t) => t * t * (3 - 2 * t);
/** 그 자리의 땅 높이 (언덕 밖은 0) */
export function heightAt(x, z) {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  if (d >= HILL.r) return 0;
  return HILL.h * smooth(1 - d / HILL.r);
}
export const onHill = (x, z) => Math.hypot(x - HILL.x, z - HILL.z) < HILL.r;

export function createHill(scene) {
  const g = new THREE.Group();
  const geo = new THREE.CircleGeometry(HILL.r, 64, 0, Math.PI * 2); geo.rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(0.01, HILL.r, 64, 24); ring.rotateX(-Math.PI / 2);
  const pos = ring.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, heightAt(HILL.x + x, HILL.z + z) + 0.005); }
  ring.computeVertexNormals();
  const mound = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })); mound.receiveShadow = true; mound.castShadow = true; g.add(mound);
  geo.dispose();
  // 꼭대기의 작은 깃발과 "눈썰매" 팻말
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#8a5a36' })); pole.position.set(0.6, HILL.h + 0.7, 0); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshStandardMaterial({ color: '#e0503f', side: THREE.DoubleSide })); flag.position.set(0.9, HILL.h + 1.25, 0); g.add(flag);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = '#fff3c4'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#7a3b22'; x.font = '900 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🛷 눈썰매', 128, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshStandardMaterial({ map: tex })); face.position.y = 0.9; sign.add(face);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#6b4428' })); post.position.y = 0.45; sign.add(post);
  const toTree = Math.atan2(-HILL.x, -HILL.z), sx = HILL.x + Math.sin(toTree) * (HILL.r + 0.8), sz = HILL.z + Math.cos(toTree) * (HILL.r + 0.8);
  sign.position.set(sx - HILL.x, 0, sz - HILL.z); sign.rotation.y = toTree; g.add(sign);
  g.traverse((o) => { if (o.isMesh && o !== mound) o.castShadow = true; });
  g.position.set(HILL.x, 0, HILL.z);
  scene.add(g);
  return { group: g };
}
