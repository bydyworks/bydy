// 눈사람 만들기: 눈을 굴려 커다란 눈덩이를 만들고, 그 위에 그린 그림(얼굴, 단추, 무늬)을 입혀 눈밭에 세운다.
// 그림은 틀(머리 동그라미와 몸 동그라미) 위에 그린 획들이다: [색 번호, 굵기 번호, 점들(0..255 의 x, y 짝을 base64 로)]
import * as THREE from 'three';

/** 그리는 판의 크기와 눈사람 틀 (그리는 판의 화소 기준) */
export const PAD = { w: 240, h: 300, head: { x: 120, y: 92, r: 56 }, body: { x: 120, y: 210, r: 80 } };
export const INKS = ['#2b2b33', '#ff8a2a', '#e0503f', '#3f7fe0', '#3f9a5e'];      // 숯, 당근, 빨강, 파랑, 초록
export const WIDTHS = [0, 5, 9, 15];                                              // 굵기 1..3 (그리는 판의 화소)
export const MAX_POINTS = 900;
const SNOW = '#f7f9fd';
const BODY = { r: 0.62, y: 0.56 }, HEAD = { r: 0.43 };
HEAD.y = BODY.y + BODY.r + HEAD.r - 0.14;

/** 점들 [[x, y], …] (판의 화소) ↔ base64 */
export function packPoints(pts) {
  const bytes = new Uint8Array(pts.length * 2);
  pts.forEach(([x, y], i) => { bytes[i * 2] = Math.max(0, Math.min(255, Math.round(x / PAD.w * 255))); bytes[i * 2 + 1] = Math.max(0, Math.min(255, Math.round(y / PAD.h * 255))); });
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function unpackPoints(b64) {
  let s = ''; try { s = atob(b64); } catch { return []; }
  const out = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push([s.charCodeAt(i) / 255 * PAD.w, s.charCodeAt(i + 1) / 255 * PAD.h]);
  return out;
}

/** 그림을 판 크기의 캔버스에 그린다 (k: 배율) */
export function paint(ctx, strokes, k = 1) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [c, w, b64] of strokes) {
    const pts = typeof b64 === 'string' ? unpackPoints(b64) : b64;
    if (!pts.length) continue;
    ctx.strokeStyle = ctx.fillStyle = INKS[c] || INKS[0]; ctx.lineWidth = WIDTHS[w] * k;
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0] * k, pts[0][1] * k, WIDTHS[w] * k / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    ctx.stroke();
  }
}

/** 공 하나의 겉면을, 앞에서 본 그림판의 동그라미에 맞춰 입힌다 (뒤쪽은 그림 없는 눈) */
function projectUV(geo, circle) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, r = geo.parameters.radius;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (z < -0.02 * r) { uv.setXY(i, 2 / PAD.w, 1 - 2 / PAD.h); continue; }      // (판 왼쪽 위 구석: 아무것도 그리지 않은 자리)
    uv.setXY(i, (circle.x + x / r * circle.r) / PAD.w, 1 - (circle.y - y / r * circle.r) / PAD.h);
  }
  uv.needsUpdate = true;
}

/** 그림을 입힌 눈사람 하나 (발밑 가운데가 원점) */
export function buildSnowman(strokes) {
  const g = new THREE.Group();
  const K = 3, c = document.createElement('canvas'); c.width = PAD.w * K; c.height = PAD.h * K;
  const x = c.getContext('2d'); x.fillStyle = SNOW; x.fillRect(0, 0, c.width, c.height);
  paint(x, strokes, K);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const bodyGeo = new THREE.SphereGeometry(BODY.r, 40, 28); projectUV(bodyGeo, PAD.body);
  const headGeo = new THREE.SphereGeometry(HEAD.r, 36, 24); projectUV(headGeo, PAD.head);
  const body = new THREE.Mesh(bodyGeo, mat); body.position.y = BODY.y; body.scale.y = 0.94; g.add(body);
  const head = new THREE.Mesh(headGeo, mat); head.position.y = HEAD.y; g.add(head);
  // 나뭇가지 팔 둘과 발치의 눈 더미
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.9 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.62, 6), wood);
    arm.position.set(s * (BODY.r + 0.18), BODY.y + 0.22, 0); arm.rotation.z = s * -1.0; g.add(arm);
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.016, 0.18, 5), wood);
    twig.position.set(s * (BODY.r + 0.36), BODY.y + 0.42, 0); twig.rotation.z = s * -0.3; g.add(twig);
  }
  const mound = new THREE.Mesh(new THREE.SphereGeometry(BODY.r * 1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }));
  mound.scale.y = 0.22; g.add(mound);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.dispose = () => { tex.dispose(); g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); };
  return g;
}

/** 굴리는 눈덩이 (반지름 1 의 공: scale 로 크기를 정한다) */
export function makeRollBall() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: false }));
  const pos = m.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.06; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); }      // 울퉁불퉁
  m.geometry.computeVertexNormals();
  m.castShadow = true;
  return m;
}
