// 크리스마스 소원판: 트리 뒤쪽(우체통의 건너편)에 선 나무 게시판. 알록달록한 쪽지가 붙어 있다.
// 다가가 누르면 사람들이 이름 없이 붙인 소원을 보고, 내 소원도 하나 붙일 수 있다 (한 기기에 크리스마스 동안 한 번).
import * as THREE from 'three';

export const WISHBOARD = { x: 2.9, z: -4.4, r: 0.75 };          // 트리를 사이에 두고 우체통(-2.9, 4.4)의 맞은편. r: 지나갈 수 없는 둘레
export const WISH_REACH = 2.1;

export function createWishboard(scene) {
  const g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const wood = mat('#8a5a36', { roughness: 0.9 }), dark = mat('#6b4428', { roughness: 0.9 });
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 10), dark); post.position.set(s * 0.68, 0.85, 0); g.add(post); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.07), wood); board.position.y = 1.15; g.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.1), dark);
  for (const y of [0.66, 1.64]) { const f = frame.clone(); f.position.y = y; g.add(f); }
  // 지붕과 쌓인 눈
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.42), dark); roof.position.set(0, 1.78, 0); g.add(roof);
  const snow = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.1, 0.44), mat('#ffffff', { roughness: 1 })); snow.position.set(0, 1.85, 0); g.add(snow);
  // 이름표: "소원판"
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#fff3c4'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#7a3b22'; x.font = '900 34px "NanumSquareRound", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🎄 소원판', 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); sign.position.set(0, 1.5, 0.04); g.add(sign);
  // 붙어 있는 쪽지들 (앞면)
  const notes = ['#ffd75e', '#f9b4c6', '#a8dcf5', '#b9e6b0', '#ffffff', '#f5c59a'];
  for (let k = 0; k < 9; k++) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.17), mat(notes[k % notes.length], { roughness: 0.9 }));
    n.position.set(-0.55 + (k % 5) * 0.27 + (k > 4 ? 0.13 : 0), 1.22 - Math.floor(k / 5) * 0.24, 0.041 + k * 0.0004); n.rotation.z = Math.sin(k * 2.3) * 0.18; g.add(n);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat(['#e0503f', '#3f7fe0', '#3f9a5e'][k % 3])); pin.position.set(n.position.x, n.position.y + 0.06, 0.05); g.add(pin);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(WISHBOARD.x, 0, WISHBOARD.z);
  g.rotation.y = Math.atan2(WISHBOARD.x, WISHBOARD.z);      // 트리 바깥쪽을 본다
  scene.add(g);
  return { group: g, near: (px, pz) => Math.hypot(px - WISHBOARD.x, pz - WISHBOARD.z) < WISH_REACH };
}
