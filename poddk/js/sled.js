// 썰매 경주 길: 들판 한쪽에 곧게 뻗은 매끈한 얼음 길. 출발 자리에서 배 썰매를 타면 얼마나 멀리 미끄러졌는지 잰다.
// 걸어오던 기세를 살려 미끄러지면 더 멀리 가고, 길에서 비껴 나가면 눈 위에서 금세 멈춘다.
// 역대 기록 셋은 서버가 모아 두고, 출발 자리 옆 기록판에 보여 준다.
import * as THREE from 'three';

const DEG = 280, FROM = 32, LEN = 30, HALF = 1.6;        // 트리에서 본 방향(도), 출발선까지의 거리, 길이, 길 너비의 반
const dir = { x: Math.sin(DEG * Math.PI / 180), z: Math.cos(DEG * Math.PI / 180) };      // 길이 뻗은 쪽 (트리에서 멀어지는 쪽)
export const LANE = {
  start: { x: dir.x * FROM, z: dir.z * FROM }, dir, len: LEN, half: HALF,
  pad: 2.4,                 // 출발 자리: 출발선 뒤 이만큼 안에서 미끄러지기 시작하면 경주로 친다
  decel: 0.9,               // 길 위에서 줄어드는 빠르기 (초당)
};
/** 그 자리를 길에 맞춰 잰다: along(출발선에서 길을 따라 간 거리), side(옆으로 벗어난 거리) */
export function laneCoord(x, z) {
  const dx = x - LANE.start.x, dz = z - LANE.start.z;
  return { along: dx * dir.x + dz * dir.z, side: dx * dir.z - dz * dir.x };
}
/** 매끈한 얼음 길 위인가 (출발 자리 포함) */
export function onLane(x, z) { const c = laneCoord(x, z); return c.along > -LANE.pad && c.along < LEN && Math.abs(c.side) < HALF; }
/** 출발 자리에 있는가 */
export function onPad(x, z) { const c = laneCoord(x, z); return c.along > -LANE.pad && c.along < 0.4 && Math.abs(c.side) < HALF; }

export function createSled(scene) {
  const g = new THREE.Group();
  const yaw = Math.atan2(dir.x, dir.z);
  // 얼음 길 (그림판에 출발선과 5 걸음마다의 눈금을 그려 입힌다)
  const W = 128, H = Math.round(128 * (LEN + LANE.pad) / (HALF * 2)), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), px = H / (LEN + LANE.pad);
  const grad = x.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#b8dcf5'); grad.addColorStop(0.5, '#e4f3ff'); grad.addColorStop(1, '#b8dcf5');
  x.fillStyle = grad; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 2;
  for (let k = 0; k < 14; k++) { x.beginPath(); x.moveTo(10 + (k * 37) % (W - 20), (k * 151) % H); x.lineTo(14 + (k * 37) % (W - 20), (k * 151) % H + 60); x.stroke(); }      // 미끄러진 자국 같은 잔금
  const yAt = (along) => H - (along + LANE.pad) * px;      // 그림판의 아래가 출발 쪽
  x.fillStyle = '#e0503f'; x.fillRect(0, yAt(0) - 3, W, 6);                                    // 출발선
  x.font = '900 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#2f5f96'; x.fillText('출발', W / 2, yAt(-1.2));
  for (let m = 5; m < LEN; m += 5) { x.fillStyle = 'rgba(47,95,150,0.55)'; x.fillRect(8, yAt(m) - 1.5, W - 16, 3); x.fillStyle = '#2f5f96'; x.fillText(m + 'm', W / 2, yAt(m) - 14); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, LEN + LANE.pad), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
  lane.rotation.x = -Math.PI / 2; lane.rotation.z = Math.PI + yaw;
  const mid = (LEN - LANE.pad) / 2;
  lane.position.set(LANE.start.x + dir.x * mid, 0.012, LANE.start.z + dir.z * mid); lane.receiveShadow = true; g.add(lane);
  // 길 양옆의 눈 둑
  const snow = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  for (const s of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, LEN + LANE.pad - 0.6, 4, 10), snow);
    bank.rotation.x = Math.PI / 2; bank.rotation.z = -yaw; bank.scale.set(1, 1, 0.55);
    bank.position.set(lane.position.x + dir.z * s * (HALF + 0.22), 0.1, lane.position.z - dir.x * s * (HALF + 0.22)); bank.castShadow = true; g.add(bank);
  }
  // 출발 깃발 둘 (빨강·흰 줄무늬 기둥에 깃발)
  for (const s of [-1, 1]) {
    const px0 = LANE.start.x + dir.z * s * (HALF + 0.55), pz0 = LANE.start.z - dir.x * s * (HALF + 0.55);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); pole.position.set(px0, 0.8, pz0); g.add(pole);
    for (let k = 0; k < 4; k++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#e0503f' })); band.position.set(px0, 0.2 + k * 0.38, pz0); g.add(band); }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshStandardMaterial({ color: s < 0 ? '#ffcf3a' : '#3f9a5e', side: THREE.DoubleSide })); flag.position.set(px0 + dir.x * 0.22, 1.42, pz0 + dir.z * 0.22); flag.rotation.y = yaw + Math.PI / 2; g.add(flag);
  }
  // 기록판: 오늘의 다섯 (출발 자리 옆)
  const bc = document.createElement('canvas'); bc.width = 256; bc.height = 200;
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.02), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.8 })); face.position.y = 1.35; board.add(face);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.14, 0.06), new THREE.MeshStandardMaterial({ color: '#8a5a36' })); back.position.set(0, 1.35, -0.04); board.add(back);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#6b4428' })); leg.position.set(s * 0.55, 0.45, -0.04); board.add(leg); }
  const bx = LANE.start.x - dir.x * 1.6 + dir.z * (HALF + 1.7), bz = LANE.start.z - dir.z * 1.6 - dir.x * (HALF + 1.7);
  board.position.set(bx, 0, bz); board.rotation.y = yaw + Math.PI - 0.5;      // 출발 쪽으로 오는 펭귄을 본다
  g.add(board);
  g.traverse((o) => { if (o.isMesh && o !== lane) o.castShadow = true; });
  scene.add(g);

  let top = [], best = 0;
  try { best = Number(localStorage.getItem('poddk.sled.best')) || 0; } catch { /* 이번만 */ }
  function drawBoard() {
    const b = bc.getContext('2d');
    b.fillStyle = '#fffaf0'; b.fillRect(0, 0, 256, 200);
    b.fillStyle = '#7a3b22'; b.font = '900 24px sans-serif'; b.textAlign = 'center'; b.fillText('🏆 역대 기록', 128, 34);
    b.textAlign = 'left'; b.font = '800 20px sans-serif';
    const rows = top.length ? top : [];
    if (!rows.length) { b.fillStyle = '#9a7b62'; b.textAlign = 'center'; b.fillText('첫 기록을 세워 봐요!', 128, 100); }
    rows.slice(0, 3).forEach((r, i) => { b.fillStyle = ['#c9922a', '#7d8a9e', '#b07040'][i]; b.fillText(`${['🥇', '🥈', '🥉'][i]} ${r.name}`, 14, 80 + i * 40); b.textAlign = 'right'; b.fillText(r.dist.toFixed(1) + 'm', 244, 80 + i * 40); b.textAlign = 'left'; });
    btex.needsUpdate = true;
  }
  drawBoard();
  return {
    group: g,
    get best() { return best; },
    get top() { return top; },
    /** 역대 기록 셋 (서버에서) */
    setTop(list) { top = Array.isArray(list) ? list.filter((r) => r && typeof r.name === 'string' && Number.isFinite(r.dist)).slice(0, 3) : []; drawBoard(); },
    /** 내 기록 하나: 내 최고 기록이면 true */
    record(dist) { if (dist > best) { best = dist; try { localStorage.setItem('poddk.sled.best', String(best)); } catch { /* 이번만 */ } return true; } return false; },
  };
}
