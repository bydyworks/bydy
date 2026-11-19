// 이글루 안: 넓고 둥근 방 한가운데에 모닥불이 타고, 그 둘레에 방석 여섯 개가 빙 둘러 놓여 있다.
// 이글루마다 방이 조금씩 다르다: 책 읽는 방(책 더미와 등불), 반짝이 방(벽을 두른 꼬마전구), 낚시꾼 방(말린 물고기 줄과 낚싯대).
// 방은 들판에서 멀리 떨어진 곳에 따로 지어 두고, 이글루 문으로 들어가면 펭귄을 그리로 옮긴다.
import * as THREE from 'three';

export const DEN_RADIUS = 6.2;            // 걸어 다닐 수 있는 방의 반지름
const DOME = 6.8;                         // 둥근 벽의 반지름
const WALL_Y = 0.86;                      // 둥근 벽을 위아래로 눌러 놓은 정도 (가운데 높이 약 5.8)
const FIRE_BLOCK = 1.35;                  // 모닥불 둘레 (들어갈 수 없다)
const SEAT_RING = 3.1;                    // 방석이 놓인 둘레
export const SEATS = 6;
/** 앉아서 고를 수 있는 상태: 혼자 하는 일들 */
export const STATUSES = [
  ['📖', '책 읽는 중'], ['🎬', '영화 보는 중'], ['☕', '커피 마시는 중'], ['🍫', '핫초코 마시는 중'], ['🧁', '카페 온 기분'],
  ['🎧', '음악 듣는 중'], ['✏️', '그림 그리는 중'], ['📝', '일기 쓰는 중'], ['🧶', '뜨개질하는 중'], ['🧩', '퍼즐 맞추는 중'],
  ['🎮', '게임하는 중'], ['🍠', '군고구마 먹는 중'], ['🔥', '불멍 중'], ['💤', '꾸벅꾸벅 조는 중'], ['💭', '멍하니 생각하는 중'],
];
const VARIANTS = [
  { name: '책 읽는 방', rug: '#c9604d', cushions: ['#e7b23c', '#7fb0d8', '#e8927c', '#9cc59a', '#d9a5d0', '#f0d27a'] },
  { name: '반짝이 방', rug: '#4f7fb8', cushions: ['#f08aa0', '#ffd75e', '#8fd0c4', '#b9a3e8', '#f5a797', '#9fc8ef'] },
  { name: '낚시꾼 방', rug: '#5f9a6e', cushions: ['#d6844f', '#e9d4a8', '#7fa7c9', '#c97b6c', '#a9c98a', '#e3b86a'] },
];

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });

/** 방 안의 작은 크리스마스트리: 겹겹이 쌓인 초록 원뿔, 방울과 꼭대기 별 (colors: 방울 색들, leaf: 잎 색) */
function miniTree({ leaf = '#2f7a4f', colors = ['#e0503f', '#ffcf3a', '#3f7fe0'], star = '#ffd75e', h = 2.2 } = {}) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8), mat('#6b4428')); trunk.position.y = 0.15; g.add(trunk);
  const layers = 4;
  for (let k = 0; k < layers; k++) {
    const r = 0.75 - k * 0.15, y = 0.3 + k * (h - 0.5) / layers;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 0.7, 12), mat(leaf, { roughness: 0.9 })); cone.position.y = y + 0.35; g.add(cone);
    for (let j = 0; j < 6 - k; j++) {
      const a = j / (6 - k) * Math.PI * 2 + k, b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(colors[(j + k) % colors.length], { roughness: 0.3, metalness: 0.3 }));
      b.position.set(Math.sin(a) * r * 0.78, y + 0.12, Math.cos(a) * r * 0.78); g.add(b);
    }
  }
  const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: star })); s.position.y = h + 0.1; g.add(s);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** 선물 더미: 크기가 다른 상자 몇 개 */
function presents(n, paper, ribbon = '#fff3c4') {
  const g = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const w = 0.3 + (k % 3) * 0.08, hh = 0.22 + ((k * 5) % 3) * 0.06;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w), mat(paper[k % paper.length], { roughness: 0.6 })); box.position.set(Math.sin(k * 2.4) * 0.45, hh / 2, Math.cos(k * 2.4) * 0.45); box.rotation.y = k * 0.7; g.add(box);
    for (const rot of [0, Math.PI / 2]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, hh + 0.01, w + 0.01), mat(ribbon, { roughness: 0.5 })); band.position.copy(box.position); band.rotation.y = box.rotation.y + rot; g.add(band); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** 벽을 따라 두른 솔가지 줄과 방울 (높이 y, 방울 색들) */
function garland(y, colors, every = 0.5) {
  const g = new THREE.Group(), r = Math.sqrt(DOME * DOME - (y / WALL_Y) ** 2) - 0.12;
  // 솔가지 줄: 작은 초록 솔방울 뭉치를 벽을 따라 촘촘히 잇는다 (하나하나 따로 있어 카메라 쪽 것은 감출 수 있다). 문 위는 비운다
  const leaf = mat('#2f7a4f', { roughness: 1 }), tufts = Math.floor((Math.PI * 2 - 0.7) * r / 0.16);
  for (let k = 0; k < tufts; k++) {
    const a = 0.35 + k / tufts * (Math.PI * 2 - 0.7), t = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), leaf);
    t.position.set(Math.sin(a + Math.PI) * r, y + Math.sin(k * 0.21) * 0.03, Math.cos(a + Math.PI) * r); t.scale.set(1, 0.8, 1); g.add(t);
  }
  const n = Math.floor((Math.PI * 2 - 0.7) * r / every);
  for (let k = 0; k < n; k++) {
    const a = Math.PI + 0.35 + k / n * (Math.PI * 2 - 0.7) - Math.PI, sag = Math.sin(k * 0.9) * 0.05;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(colors[k % colors.length], { roughness: 0.3, metalness: 0.3 })); b.position.set(Math.sin(a + Math.PI) * r, y - 0.1 + sag, Math.cos(a + Math.PI) * r); g.add(b);
  }
  g.userData.wall = true;
  return g;
}
/** 벽에 거는 화환 (각도 a 쪽 벽, 높이 y) */
function wreath(a, y, berry = '#e0503f') {
  const g = new THREE.Group(), r = Math.sqrt(DOME * DOME - (y / WALL_Y) ** 2) - 0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 8, 20), mat('#2f7a4f', { roughness: 1 })); g.add(ring);
  for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(berry, { roughness: 0.4 })); b.position.set(Math.cos(t) * 0.34, Math.sin(t) * 0.34, 0.08); g.add(b); }
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 12), mat('#e0503f')); bow.position.set(0, -0.36, 0.08); bow.scale.x = 1.6; g.add(bow);
  g.position.set(Math.sin(a) * r, y, Math.cos(a) * r); g.rotation.y = a + Math.PI;
  return g;
}
/** 벽에 거는 양말 (각도 a, 색) */
function stocking(a, y, color) {
  const g = new THREE.Group(), r = Math.sqrt(DOME * DOME - (y / WALL_Y) ** 2) - 0.18;
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.08), mat(color, { roughness: 1 })); g.add(leg);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), mat(color, { roughness: 1 })); foot.position.set(0.05, -0.22, 0); g.add(foot);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.1), mat('#ffffff', { roughness: 1 })); cuff.position.y = 0.2; g.add(cuff);
  g.position.set(Math.sin(a) * r, y, Math.cos(a) * r); g.rotation.y = a + Math.PI;
  return g;
}
/** 지팡이 사탕 (빨강·하양 줄무늬는 고리 몇 개로) */
function candyCane(x, z, rot = 0) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 10), mat('#ffffff', { roughness: 0.4 })); stick.position.y = 0.4; g.add(stick);
  for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.012, 6, 12), mat('#e0503f', { roughness: 0.4 })); s.rotation.x = Math.PI / 2; s.position.y = 0.08 + k * 0.12; g.add(s); }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16, Math.PI), mat('#e0503f', { roughness: 0.4 })); hook.position.set(0.1, 0.8, 0); g.add(hook);
  g.position.set(x, 0, z); g.rotation.y = rot;
  return g;
}

/** 눈 벽돌 무늬: 가로줄과, 줄마다 엇갈린 세로 이음매 (둥근 벽에 입힌다) */
let brickTex = null;
function bricks() {
  if (brickTex) return brickTex;
  const W = 1024, H = 256, ROWS = 6, PER = 26;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#eef2fa'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#d3dbea'; x.lineWidth = 3;
  for (let r = 0; r < ROWS; r++) {
    const y0 = H - (r / ROWS) * H;                            // 아래(바닥)부터 위(꼭대기)로
    x.beginPath(); x.moveTo(0, y0); x.lineTo(W, y0); x.stroke();
    const n = Math.max(6, Math.round(PER * Math.cos((r + 0.5) / ROWS * Math.PI / 2)));      // 위로 갈수록 둘레가 짧아 벽돌 수가 준다
    for (let k = 0; k < n; k++) { const xx = ((k + (r % 2) * 0.5) / n) * W; x.beginPath(); x.moveTo(xx, y0); x.lineTo(xx, y0 - H / ROWS); x.stroke(); }
  }
  brickTex = new THREE.CanvasTexture(c); brickTex.colorSpace = THREE.SRGBColorSpace; brickTex.anisotropy = 4;
  return brickTex;
}

function room(v, i) {
  const g = new THREE.Group();
  // 바닥과 둥근 눈벽 (안쪽에서 보는 벽)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(DOME, 48), mat('#e9e4dc', { roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  // 둥근 벽은 안쪽 면만 그린다 (BackSide): 카메라가 벽 밖으로 물러나도 앞쪽 벽은 그려지지 않고 건너편 벽만 보여서,
  // 지붕을 걷어 낸 인형의 집처럼 방 전체를 넓게 내려다볼 수 있다
  const wall = new THREE.Mesh(new THREE.SphereGeometry(DOME, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff', { roughness: 1, side: THREE.BackSide, map: bricks() }));
  wall.scale.y = WALL_Y; wall.receiveShadow = true; g.add(wall);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(DOME, 0.22, 8, 64, Math.PI * 2), mat('#e6ecf6', { roughness: 1 })); rim.rotation.x = Math.PI / 2; rim.scale.z = 0.5; g.add(rim);      // 벽이 땅에 닿는 둘레의 두툼한 눈
  // 문: 바깥 빛이 비치는 둥근 구멍 (+Z 쪽)
  const door = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#cfe3fb' }));
  door.position.set(0, 0.01, DOME - 0.35); door.rotation.y = Math.PI; g.add(door);
  // 깔개
  const rug = new THREE.Mesh(new THREE.RingGeometry(1.5, 4.2, 48), mat(v.rug, { roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; rug.receiveShadow = true; g.add(rug);
  const rugEdge = new THREE.Mesh(new THREE.RingGeometry(4.05, 4.2, 48), mat('#f3ead8')); rugEdge.rotation.x = -Math.PI / 2; rugEdge.position.y = 0.015; g.add(rugEdge);
  // 벽 밖의 눈밭 (벽 너머로 물러난 카메라 아래에 보인다)
  const yard = new THREE.Mesh(new THREE.RingGeometry(DOME - 0.05, 40, 64), mat('#f4f7fc', { roughness: 1 })); yard.rotation.x = -Math.PI / 2; yard.position.y = -0.02; yard.receiveShadow = true; g.add(yard);
  // 모닥불: 둘러놓은 돌, 엇갈린 장작, 일렁이는 불꽃, 따뜻한 빛
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#8a8f9c')); s.scale.set(1, 0.65, 1); s.position.set(Math.sin(a) * 0.82, 0.1, Math.cos(a) * 0.82); s.castShadow = true; g.add(s); }
  for (const r of [0.5, -0.6, 1.7]) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.2, 8), mat('#6b4428')); log.rotation.set(Math.PI / 2 - 0.2, r, 0); log.position.y = 0.16; log.castShadow = true; g.add(log); }
  const flames = [['#ff7a1e', 0.3, 0.85], ['#ffa63c', 0.21, 0.66], ['#ffe07a', 0.12, 0.44], ['#ff8a2a', 0.16, 0.6]].map(([c, r, h], k) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    if (k === 3) f.position.x = 0.14;
    f.position.y = 0.2 + h / 2; f.userData = { h, k }; g.add(f); return f;
  });
  const light = new THREE.PointLight('#ffb067', 6, 15, 1.6); light.position.y = 1.1; g.add(light);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
  // 방석 여섯: 불을 둘러, 문 쪽은 비켜서
  const seats = [];
  for (let k = 0; k < SEATS; k++) {
    const a = Math.PI / 6 + k * Math.PI / 3;                // 30도, 90도, … (문은 0도 쪽)
    const x = Math.sin(a) * SEAT_RING, z = Math.cos(a) * SEAT_RING;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.18, 20), mat(v.cushions[k], { roughness: 0.95 })); c.position.set(x, 0.09, z); c.castShadow = true; c.receiveShadow = true; g.add(c);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#ffffff')); tuft.position.set(x, 0.19, z); g.add(tuft);
    seats.push({ x, z, yaw: Math.atan2(-x, -z) });           // 앉으면 불을 본다
  }
  // 방마다 다른 꾸밈
  const deco = new THREE.Group(); g.add(deco);
  if (i === 0) {                                             // 책 더미 둘과 등불
    for (const [a, n] of [[2.1, 5], [4.2, 4]]) {
      for (let k = 0; k < n; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.62 - k * 0.04, 0.12, 0.44), mat(['#c9604d', '#4f7fb8', '#e7b23c', '#5f9a6e', '#b585c9'][k % 5])); b.position.set(Math.sin(a) * 5.1, 0.06 + k * 0.12, Math.cos(a) * 5.1); b.rotation.y = a + k * 0.3; b.castShadow = true; deco.add(b); }
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshBasicMaterial({ color: '#ffe0a0' })); lamp.position.set(Math.sin(3.2) * 5.3, 0.3, Math.cos(3.2) * 5.3); deco.add(lamp);
    const ll = new THREE.PointLight('#ffd590', 1.2, 4); ll.position.copy(lamp.position); deco.add(ll);
  } else if (i === 1) {                                      // 벽을 두른 꼬마전구
    const colors = ['#ff6b6b', '#ffd75e', '#6be0b0', '#7fb5ff', '#d98bff'];
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.32) continue;      // 문 위는 비운다
      const y = 2.6 + Math.sin(k * 0.9) * 0.08, r = Math.sqrt(DOME * DOME - (y / WALL_Y) ** 2) - 0.12;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: colors[k % colors.length] })); b.position.set(Math.sin(a) * r, y, Math.cos(a) * r); deco.add(b);
    }
  } else {                                                   // 말린 물고기 줄과 기대 세운 낚싯대
    for (let k = 0; k < 7; k++) {
      const a = 2.3 + k * 0.22, r = 5.6, y = 2.2 - Math.sin(k / 6 * Math.PI) * 0.3;
      const fish = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(['#8ea4c2', '#7c8f58', '#7f8fa8'][k % 3], { roughness: 0.5 })); fish.scale.set(0.35, 1, 0.24); fish.position.set(Math.sin(a) * r, y, Math.cos(a) * r); deco.add(fish);
    }
    for (const s of [-0.15, 0.15]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.4, 6), mat('#8a5a36')); rod.position.set(Math.sin(4.3) * 5.5 + s, 1.1, Math.cos(4.3) * 5.5); rod.rotation.z = 0.25 + s; rod.castShadow = true; deco.add(rod); }
  }
  // 크리스마스 꾸밈 (방마다 다르게): 1 따뜻한 오두막(초록 트리, 화환, 선물), 2 눈꽃 파티(하얀 트리, 파란 방울, 지팡이 사탕), 3 산타 작업실(양말 셋, 선물 더미, 금빛 줄)
  const xm = new THREE.Group(); g.add(xm); deco.userData.xmas = xm;
  const at = (a, r) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });
  if (i === 0) {
    const t = miniTree({ colors: ['#e0503f', '#ffcf3a', '#f5f0e6'] }), p = at(2.65, 4.9); t.position.set(p.x, 0, p.z); xm.add(t);
    const gifts = presents(4, ['#e0503f', '#3f9a5e', '#ffcf3a']), q = at(2.65, 4.2); gifts.position.set(q.x, 0, q.z); gifts.scale.setScalar(0.8); xm.add(gifts);
    xm.add(wreath(Math.PI, 2.6)); xm.add(garland(3.3, ['#e0503f', '#ffcf3a']));
  } else if (i === 1) {
    const t = miniTree({ leaf: '#e8f0fa', colors: ['#7fb5ff', '#c9dcff', '#b9a3e8'], star: '#bfe0ff' }), p = at(Math.PI, 5.0); t.position.set(p.x, 0, p.z); xm.add(t);
    for (const a of [2.2, 4.1]) { const c = at(a, 5.4); xm.add(candyCane(c.x, c.z, a)); }
    xm.add(garland(3.4, ['#7fb5ff', '#ffffff', '#b9a3e8']));
    for (let k = 0; k < 7; k++) {                                // 천장에 매달린 눈송이 장식
      const a = k / 7 * Math.PI * 2 + 0.4, r = 2.4 + (k % 2) * 1.2, y = 3.6 - (k % 3) * 0.3, c = at(a, r);
      const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 5.4 - y, 4), mat('#ffffff')); thread.position.set(c.x, y + (5.4 - y) / 2, c.z); xm.add(thread);
      const flake = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshStandardMaterial({ color: '#dff0ff', roughness: 0.2, metalness: 0.5 })); flake.scale.y = 0.35; flake.position.set(c.x, y, c.z); flake.rotation.x = Math.PI / 2; xm.add(flake);
    }
  } else {
    ['#e0503f', '#3f9a5e', '#3f7fe0'].forEach((c, k) => xm.add(stocking(1.0 + k * 0.4, 1.9, c)));
    const gifts = presents(6, ['#e0503f', '#ffcf3a', '#3f7fe0', '#c066b8']), q = at(5.2, 4.6); gifts.position.set(q.x, 0, q.z); xm.add(gifts);
    const t = miniTree({ colors: ['#ffcf3a', '#e0503f'], h: 1.8 }), p = at(5.2, 5.3); t.position.set(p.x, 0, p.z); xm.add(t);
    xm.add(garland(3.2, ['#ffcf3a', '#e0503f', '#ffcf3a']));
    xm.add(wreath(Math.PI + 0.5, 2.5, '#ffcf3a'));
  }
  return { group: g, seats, flames, light, glow, deco };
}

/** 이글루 셋의 방. 저마다 들판 밖 먼 곳에 지어 둔다 */
export function createDens(scene) {
  const dens = VARIANTS.map((v, i) => {
    const r = room(v, i), center = { x: 2000 + i * 80, z: 2000 };
    r.group.position.set(center.x, 0, center.z);
    scene.add(r.group);
    return {
      ...r, center, name: v.name,
      seats: r.seats.map((s) => ({ x: center.x + s.x, z: center.z + s.z, yaw: s.yaw })),
      door: { x: center.x, z: center.z + DEN_RADIUS - 0.2 },          // 이 앞에 서면 "나가기"
      spawn: { x: center.x, z: center.z + 4.4, yaw: Math.PI },      // 들어오면 여기서 불을 보고 선다
    };
  });
  let time = 0;
  return {
    dens,
    /** 방 안에서 갈 수 있는 자리로 (벽 안쪽, 모닥불 밖) */
    confine(i, x, z) {
      const c = dens[i].center; let dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), edge = false;
      if (d > DEN_RADIUS) { dx *= DEN_RADIUS / d; dz *= DEN_RADIUS / d; edge = true; d = DEN_RADIUS; }
      if (d < FIRE_BLOCK) { const k = d < 1e-4 ? 1 : FIRE_BLOCK / d; dx = d < 1e-4 ? FIRE_BLOCK : dx * k; dz *= k; }
      return { x: c.x + dx, z: c.z + dz, edge };
    },
    /** 그 자리에서 가까운 방석 (없으면 -1) */
    seatNear(i, x, z) { let best = -1, bd = 1.1; dens[i].seats.forEach((s, k) => { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = k; } }); return best; },
    nearDoor(i, x, z) { const d = dens[i].door; return Math.hypot(d.x - x, d.z - z) < 1.5; },
    /** 불꽃이 일렁인다. camera 를 주면, 카메라가 벽 밖으로 물러났을 때 카메라 쪽 벽에 붙은 꾸밈은 감춘다 (앞을 가리지 않게) */
    update(dt, camera = null) {
      time += dt;
      for (const d of dens) {
        if (!d.group.visible || !camera) continue;
        const cx = camera.position.x - d.center.x, cz = camera.position.z - d.center.z, cr = Math.hypot(cx, cz);
        const xm = d.deco.userData.xmas, parts = xm ? xm.children.flatMap((c) => (c.userData.wall ? c.children : [c])) : [];
        for (const o of [...d.deco.children, ...parts]) {
          if (o === xm) continue;
          const p = o.userData.p || o.position, r = Math.hypot(p.x, p.z) || 1;
          // 카메라가 벽 밖으로 물러났을 때 카메라 쪽 벽의 것, 그리고 카메라 바로 곁(2.4 안)의 것은 감춘다 (눈앞을 가리지 않게)
          o.visible = !((cr > DOME - 0.6 && (p.x * cx + p.z * cz) / (r * cr) > 0.35) || Math.hypot(p.x - cx, p.z - cz) < 2.4);
        }
      }
      for (const d of dens) {
        if (!d.group.visible) continue;
        for (const f of d.flames) { const k = f.userData.k; const s = 1 + 0.16 * Math.sin(time * (9 + k * 3)) + 0.08 * Math.sin(time * 23 + k); f.scale.set(1 - 0.06 * Math.sin(time * 13 + k), s, 1); f.position.y = 0.2 + f.userData.h * s / 2; f.rotation.y = time * (0.6 + k * 0.3); }
        d.light.intensity = 5.4 + Math.sin(time * 11) * 0.5 + Math.sin(time * 27) * 0.35;
        d.glow.material.opacity = 0.2 + 0.04 * Math.sin(time * 9);
      }
    },
  };
}
