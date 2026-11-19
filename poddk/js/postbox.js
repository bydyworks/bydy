// 트리 옆 우체통: 다가가서 누르면 친구에게 "뽀드득 같이 걷자" 엽서를 보낼 수 있다 (휴대폰의 공유 창으로 카톡, DM, 문자…).
import * as THREE from 'three';

export const POSTBOX = { x: -2.9, z: 4.4, r: 0.55, yaw: 0.35 };      // 트리 왼쪽 앞 (산타는 오른쪽 앞). r: 지나갈 수 없는 둘레
export const POST_REACH = 1.7;                                      // 이만큼 다가가면 "엽서 보내기" 단추가 된다

export function createPostbox(scene) {
  const g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  // 기둥
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 12), mat('#6b4428', { roughness: 0.9 })); post.position.y = 0.45; g.add(post);
  // 몸통: 둥근 지붕의 빨간 통
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.46), mat('#d8362f')); body.position.y = 1.12; g.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.46, 24), mat('#d8362f')); roof.rotation.x = Math.PI / 2; roof.position.y = 1.37; g.add(roof);      // (아래 반은 몸통 속에 묻힌다)
  // 지붕 위에 쌓인 눈
  const snow = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff', { roughness: 1 })); snow.scale.set(1.05, 0.38, 0.8); snow.position.y = 1.62; g.add(snow);
  // 앞면: 편지 넣는 구멍과 하트
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.02), mat('#3a1512')); slot.position.set(0, 1.28, 0.235); g.add(slot);
  const heart = new THREE.Shape(); const s = 0.07;
  heart.moveTo(0, -0.9 * s); heart.bezierCurveTo(-1.2 * s, -0.1 * s, -1 * s, 0.9 * s, -0.45 * s, 0.9 * s); heart.bezierCurveTo(-0.15 * s, 0.9 * s, 0, 0.62 * s, 0, 0.45 * s);
  heart.bezierCurveTo(0, 0.62 * s, 0.15 * s, 0.9 * s, 0.45 * s, 0.9 * s); heart.bezierCurveTo(1 * s, 0.9 * s, 1.2 * s, -0.1 * s, 0, -0.9 * s);
  const h = new THREE.Mesh(new THREE.ShapeGeometry(heart), mat('#ffe9ec')); h.position.set(0, 1.06, 0.232); g.add(h);
  // 옆의 노란 깃발 (엽서가 있다는 표시)
  const flagPole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), mat('#3a3f4a')); flagPole.position.set(0.33, 1.3, 0.05); g.add(flagPole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.18), mat('#ffcf3a')); flag.position.set(0.335, 1.41, 0.13); g.add(flag);
  // 엽서 한 장이 구멍에 살짝 꽂혀 있다
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.01), mat('#fff7e6', { roughness: 0.9 })); card.position.set(0.02, 1.31, 0.245); card.rotation.set(-0.35, 0, 0.12); g.add(card);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(POSTBOX.x, 0, POSTBOX.z); g.rotation.y = POSTBOX.yaw;
  scene.add(g);
  let time = 0;
  return {
    group: g,
    /** 깃발이 살랑 */
    update(dt) { time += dt; flag.rotation.y = Math.sin(time * 2.2) * 0.25; },
    near: (x, z) => Math.hypot(x - POSTBOX.x, z - POSTBOX.z) < POST_REACH,
  };
}

/** 이름 뒤에 붙는 조사: 받침이 있으면 '이', 없으면 '가' (예: 따끈한 눈토끼가, 포근한 펭귄이) */
export function subject(name) {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return name + '가';
  return name + ((c - 0xac00) % 28 ? '이' : '가');
}
