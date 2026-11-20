// 슬라이딩 언덕: 들판 한쪽에 솟은 둥근 눈 언덕. 한쪽의 계단으로 걸어 오르고, 꼭대기 가장자리에서 비탈 쪽으로 걸어 나가면 저절로 배를 깔고 슬라이딩으로 쌩 내려간다.
// 비탈은 걸어서 오를 수 없다 (미끄러져 내려온 뒤 비탈에 멈췄으면 아래쪽으로는 걸어 나올 수 있다).
// 언덕의 높이는 heightAt(x, z) 로 어디서나 잴 수 있다 (펭귄과 다른 펭귄이 그 높이에 선다).
import * as THREE from 'three';

const DEG = 100, FAR = 37;                      // 트리에서 본 방향(도)과 거리
export const HILL = { x: Math.sin(DEG * Math.PI / 180) * FAR, z: Math.cos(DEG * Math.PI / 180) * FAR, r: 10, h: 3.2, top: 2.2 };      // top: 꼭대기의 평평한 자리
export const STAIR_DIR = (DEG + 90) * Math.PI / 180, STAIR_HALF = 0.85;      // 계단은 트리에서 보아 옆쪽(오른쪽)에서 꼭대기로 곧게 오른다
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
/** 계단 아래 언저리인가 (언덕을 처음 찾아왔을 때 알림을 띄우는 자리) */
export function nearStairFoot(x, z) {
  const fx = HILL.x + sd.x * (HILL.r + 1.2), fz = HILL.z + sd.z * (HILL.r + 1.2);
  return Math.hypot(x - fx, z - fz) < 3.2;
}
/** 꼭대기의 평평한 자리 위인가 */
export const onTop = (x, z) => Math.hypot(x - HILL.x, z - HILL.z) <= HILL.top;
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
  // 계단: 눈을 다져 깎은 계단 칸들 (난간 없이)
  const stepMat = new THREE.MeshStandardMaterial({ color: '#eef3fa', roughness: 0.9 }), edge = new THREE.MeshStandardMaterial({ color: '#c9d6e8', roughness: 0.9 });
  const STEPS = 14;
  for (let k = 0; k < STEPS; k++) {
    const a0 = HILL.r + 0.6 - (k / STEPS) * (HILL.r + 0.6 - HILL.top), a1 = HILL.r + 0.6 - ((k + 1) / STEPS) * (HILL.r + 0.6 - HILL.top);
    const mid = (a0 + a1) / 2, top = heightAt(HILL.x + sd.x * a1, HILL.z + sd.z * a1);
    const box = new THREE.Mesh(new THREE.BoxGeometry(STAIR_HALF * 2, Math.max(0.08, top) + 0.04, a0 - a1 + 0.02), k % 2 ? stepMat : edge);
    box.position.set(sd.x * mid, (Math.max(0.08, top) + 0.04) / 2, sd.z * mid); box.rotation.y = STAIR_DIR; box.receiveShadow = true; g.add(box);
  }
  // 꼭대기의 작은 깃발
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#8a5a36' })); pole.position.set(0.6, HILL.h + 0.7, 0); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshStandardMaterial({ color: '#e0503f', side: THREE.DoubleSide })); flag.position.set(0.9, HILL.h + 1.25, 0); g.add(flag);
  // 계단 아래 옆의 나무 팻말: 배를 깔고 미끄러지는 펭귄 그림과 "슬라이딩 언덕", 그 아래 "계단으로 올라가요"
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const drawSign = () => {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 256);
    const plank = (y, h, col) => { x.fillStyle = col; x.beginPath(); if (x.roundRect) x.roundRect(10, y, 492, h, 26); else x.rect(10, y, 492, h); x.fill(); };
    plank(8, 240, '#6b4428'); plank(18, 220, '#a8744a');
    x.strokeStyle = 'rgba(90,55,30,0.35)'; x.lineWidth = 3;      // 나뭇결
    for (const y of [70, 128, 186]) { x.beginPath(); x.moveTo(34, y); x.bezierCurveTo(170, y - 8, 330, y + 8, 478, y - 2); x.stroke(); }
    x.fillStyle = '#fff6e0';      // 지붕처럼 얹힌 눈
    x.beginPath(); x.moveTo(18, 40); x.quadraticCurveTo(18, 14, 46, 14); x.lineTo(466, 14); x.quadraticCurveTo(494, 14, 494, 40);
    for (let k = 0; k <= 12; k++) x.lineTo(494 - k * 39, 34 + (k % 2 ? 12 : 4));
    x.closePath(); x.fill();
    // 배를 깔고 미끄러지는 펭귄
    const px = 136, py = 128;
    x.save(); x.translate(px, py); x.rotate(-0.12);
    x.fillStyle = '#2b2f3a'; x.beginPath(); x.ellipse(0, 0, 66, 34, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(4, 10, 54, 22, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2b2f3a'; x.beginPath(); x.arc(58, -14, 26, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(64, -10, 15, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2b2f3a'; x.beginPath(); x.arc(68, -14, 4.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2a33a'; x.beginPath(); x.moveTo(80, -10); x.lineTo(98, -5); x.lineTo(80, -1); x.closePath(); x.fill();
    x.fillStyle = '#f2a33a'; x.beginPath(); x.ellipse(-70, 6, 12, 7, 0.3, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffffff'; x.lineWidth = 5; x.lineCap = 'round';      // 미끄러지는 줄
    for (const [y, l] of [[-12, 18], [6, 26], [24, 16]]) { x.beginPath(); x.moveTo(-82 - l, y); x.lineTo(-84, y); x.stroke(); }
    x.restore();
    x.fillStyle = '#fff6e0'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 64px NanumSquareRound, system-ui, sans-serif'; x.fillText('슬라이딩', 352, 108);
    x.font = '800 32px NanumSquareRound, system-ui, sans-serif'; x.fillStyle = '#ffe7b0'; x.fillText('계단으로 올라가요 ↑', 342, 182);
    tex.needsUpdate = true;
  };
  drawSign();
  if (document.fonts) document.fonts.load('900 64px NanumSquareRound').then(drawSign, () => {});
  const sign = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.9 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.85 })); face.position.y = 1.05; sign.add(face);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.7, 0.05), wood); back.position.set(0, 1.05, -0.035); sign.add(back);
  for (const sx of [-0.55, 0.55]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 8), wood); leg.position.set(sx, 0.37, -0.06); sign.add(leg); }
  const foot = HILL.r + 1.6;      // 계단 아래 옆에, 계단으로 오는 펭귄 쪽을 본다
  sign.position.set(sd.x * foot + sd.z * (STAIR_HALF + 1.2), 0, sd.z * foot - sd.x * (STAIR_HALF + 1.2)); sign.rotation.y = STAIR_DIR - 0.35; g.add(sign);
  g.traverse((o) => { if (o.isMesh && o !== mound) o.castShadow = true; });
  g.position.set(HILL.x, 0, HILL.z);
  scene.add(g);
  return { group: g };
}
