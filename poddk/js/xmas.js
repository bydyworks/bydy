// 크리스마스 이벤트 (11월 19일부터 12월 31일까지, 한국 시간).
//   · 눈밭 곳곳에 포장된 선물 상자가 열 개 놓여 있다. 펭귄이 닿으면 선물이 화면에 나오고, 톡톡톡 세 번 두드리면 포장이 뜯어지며 선물이 나온다.
//     연 선물은 모으지 않는다. 연 상자는 사라지고, 얼마 뒤 다른 곳에 새 상자가 놓인다 (늘 열 개).
//   · 매시 정각부터 5분 동안 산타가 트리 옆에 나타나 "허허허" 웃고, 머리 위에 "메리 크리스마스~" 말풍선이 뜬다.
// 주소에 ?xmas=0 을 붙이면 이벤트를 끄고, ?xmas=1 이면 철이 아니어도 켠다. ?santahere 를 붙이면 산타가 바로 트리 옆에 나온다.
import * as THREE from 'three';
import { kst, stormPhase } from './clock.js';

/** 아이들이 크리스마스에 받고 싶어 하는 선물 (상표 없이 흔한 것들) */
export const PRESENTS = [
  ['🛷', '빨간 썰매'], ['🧸', '곰 인형'], ['⛸️', '스케이트'], ['🧤', '털장갑'], ['🧣', '포근한 목도리'], ['📚', '그림책 꾸러미'],
  ['🎨', '물감 세트'], ['🖍️', '크레파스 한 상자'], ['🚂', '칙칙폭폭 기차'], ['🤖', '로봇 장난감'], ['🪀', '반짝이 요요'], ['🪁', '알록달록 연'],
  ['🎹', '꼬마 피아노'], ['⚽', '축구공'], ['🚲', '두발자전거'], ['🛼', '롤러스케이트'], ['🔭', '별 보는 망원경'], ['🧩', '큰 퍼즐'],
  ['🎲', '보드게임'], ['🦖', '공룡 인형'], ['🐶', '강아지 인형'], ['🍫', '초콜릿 상자'], ['🍪', '쿠키 상자'], ['☃️', '눈사람 만들기 세트'],
  ['🎧', '헤드폰'], ['📷', '장난감 카메라'], ['🏰', '블록 성'], ['🎒', '새 책가방'], ['🧦', '선물 양말'], ['🦄', '유니콘 인형'],
];

const COUNT = 10, MAX = 24;          // 혼자일 때 이만큼 놓여 있고, 함께 걷는 펭귄이 늘면 한 마리에 둘씩 늘어난다 (많아야 이만큼)
const TOUCH = 1.25;                 // 펭귄이 이만큼 다가가면 선물을 발견한다
const RESPAWN = [60, 120];          // 연 상자가 다른 곳에 다시 놓이기까지 (초)
const SANTA_AT = { x: 2.7, z: 4.3 };  // 트리 옆, 들어오는 쪽에서 잘 보이는 자리
const SANTA_MIN = 5;                // 매시 정각부터 이만큼(분) 머문다
const PAPER = ['#e8503f', '#3f8f6a', '#4f7fd0', '#e7b23c', '#c066b8', '#f08aa0'];
const RIBBON = ['#fff3c4', '#ffffff', '#ffd75e', '#f9e1e6'];

const q = new URLSearchParams(location.search);
/** 지금이 이벤트 기간인가 */
export function season(ms) {
  if (q.get('xmas') === '0') return false;
  if (q.get('xmas') === '1') return true;
  const d = new Date(kst(ms).dayStart + 9 * 3600e3);       // 한국 날짜
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return (m === 11 && day >= 19) || m === 12;
}
/** 지금 산타가 트리 옆에 있는가 (매시 정각부터 5분) */
export function santaHere(ms) {
  const h = kst(ms).hour;
  return (h % 1) * 60 < SANTA_MIN;
}

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });

/**
 * 선물 창에서 두드려 여는 3D 선물 상자: 뚜껑(리본 고리 포함)이 따로 들썩이고 날아간다.
 * 돌려주는 Group 의 userData: { body(흔들리는 몸 전체), lid(뚜껑), h(상자 높이) }
 */
export function makeGiftBox(i) {
  const root = new THREE.Group(), body = new THREE.Group(), lid = new THREE.Group();
  root.add(body);
  const paper = mat(PAPER[i % PAPER.length], { roughness: 0.55 }), ribbon = mat(RIBBON[i % RIBBON.length], { roughness: 0.4 });
  const w = 0.62, h = 0.5;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), paper); box.position.y = h / 2; body.add(box);
  for (const rot of [0, Math.PI / 2]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, h + 0.004, w + 0.012), ribbon); band.position.y = h / 2; band.rotation.y = rot; body.add(band); }
  lid.position.y = h; body.add(lid);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.12, w + 0.06), paper); top.position.y = 0.06; lid.add(top);
  for (const rot of [0, Math.PI / 2]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.124, w + 0.072), ribbon); band.position.y = 0.06; band.rotation.y = rot; lid.add(band); }
  for (const s of [-1, 1]) {                                  // 큼직한 리본 고리 둘
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 10, 20), ribbon);
    loop.position.set(s * 0.1, 0.2, 0); loop.rotation.set(0, Math.PI / 2, s * 0.65); loop.scale.set(1, 1, 0.75); lid.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), ribbon); knot.position.y = 0.14; lid.add(knot);
  for (const s of [-1, 1]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.16), ribbon); tail.position.set(s * 0.05, 0.125, 0.09); tail.rotation.y = s * 0.5; lid.add(tail); }
  root.userData = { body, lid, h };
  return root;
}

/** 포장된 선물 상자 하나 */
function giftMesh(i) {
  const g = new THREE.Group();
  const paper = mat(PAPER[i % PAPER.length]), ribbon = mat(RIBBON[i % RIBBON.length], { roughness: 0.5 });
  const w = 0.52 + (i % 3) * 0.07, h = 0.4 + ((i * 7) % 3) * 0.06;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), paper); box.position.y = h / 2; g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.08, w + 0.05), paper); lid.position.y = h + 0.02; g.add(lid);
  for (const rot of [0, Math.PI / 2]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, h + 0.1, w + 0.07), ribbon); band.position.y = (h + 0.1) / 2; band.rotation.y = rot; g.add(band);
  }
  for (const s of [-1, 1]) {                                  // 리본 고리 둘
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), ribbon);
    loop.position.set(s * 0.08, h + 0.15, 0); loop.rotation.set(0, Math.PI / 2, s * 0.6); g.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), ribbon); knot.position.y = h + 0.1; g.add(knot);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.height = h;
  return g;
}

/** 트리 옆의 산타: 빨간 옷, 흰 수염, 고깔 모자 */
function santaMesh() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const red = mat('#d23a32'), white = mat('#f7f5f0', { roughness: 0.9 }), skin = mat('#f2c6a6'), black = mat('#2b2420'), gold = mat('#e7b23c', { roughness: 0.4 });
  const ball = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); body.add(o); return o; };
  ball(0.62, red, 0, 0.78, 0, 1, 1.08, 0.95);                 // 배
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.13, 24), black); belt.position.y = 0.72; body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.05), gold); buckle.position.set(0, 0.72, 0.58); body.add(buckle);
  ball(0.6, white, 0, 0.2, 0, 1.02, 0.2, 0.98);               // 옷자락의 흰 털
  ball(0.33, skin, 0, 1.6, 0.04);                             // 얼굴
  ball(0.3, white, 0, 1.4, 0.16, 1.1, 1.05, 0.8);             // 수염
  ball(0.09, white, -0.08, 1.56, 0.33, 1.3, 0.6, 0.6); ball(0.09, white, 0.08, 1.56, 0.33, 1.3, 0.6, 0.6);      // 콧수염
  ball(0.055, mat('#e58b7b'), 0, 1.62, 0.36);                 // 코
  ball(0.035, black, -0.11, 1.72, 0.29); ball(0.035, black, 0.11, 1.72, 0.29);      // 눈
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 20), red); hat.position.set(0, 2.05, -0.04); hat.rotation.x = -0.25; body.add(hat);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 10, 24), white); brim.position.set(0, 1.83, 0); brim.rotation.x = Math.PI / 2; body.add(brim);
  ball(0.08, white, 0, 2.3, -0.16);                           // 방울
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.Group(); arm.position.set(s * 0.55, 1.12, 0); body.add(arm);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.38, 6, 12), red); sleeve.position.y = -0.24; arm.add(sleeve);
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), black); mitt.position.y = -0.52; arm.add(mitt);
    arm.rotation.z = s * 0.35;
    return arm;
  });
  for (const s of [-1, 1]) { const boot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), black); boot.scale.set(1, 0.6, 1.5); boot.position.set(s * 0.24, 0.08, 0.08); body.add(boot); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { body, arms };
  return g;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ free: (x: number, z: number) => boolean, nearTree?: (x: number, z: number) => boolean, crumble: { puff: Function } }} o  free: 그 자리에 선물을 둘 수 있는가 (얼음, 이글루, 나무가 아닌 눈 위인가). nearTree: 트리 둘레 그 자리에 둘 수 있는가
 */
export function createXmas(scene, { free, nearTree = () => false, crumble }) {
  const group = new THREE.Group(); scene.add(group);
  const pool = [];                   // { mesh, x, z, open: false, back: 남은 시간, off: 놓지 않은 상자 }
  let want = COUNT;
  const live = () => pool.filter((g) => !g.off);
  let rng = (Date.now() % 100000) + 1;
  const rand = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  function spot() {
    // 셋에 하나쯤은 트리 둘레에 (트리 밑에 놓인 선물처럼)
    if (rand() < 0.3 && pool.filter((g) => !g.off && !g.open && Math.hypot(g.x, g.z) < 7).length < 3) {
      for (let k = 0; k < 60; k++) {
        const a = rand() * Math.PI * 2, r = 3.4 + rand() * 2.6, x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (nearTree(x, z) && Math.hypot(x - SANTA_AT.x, z - SANTA_AT.z) > 2.4 && !pool.some((g) => !g.off && !g.open && Math.hypot(g.x - x, g.z - z) < 2.6)) return { x, z };
      }
    }
    for (let k = 0; k < 200; k++) {
      const a = rand() * Math.PI * 2, r = 9 + Math.sqrt(rand()) * 62;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!free(x, z)) continue;
      if (pool.some((g) => !g.off && !g.open && Math.hypot(g.x - x, g.z - z) < (want > 14 ? 8 : 12))) continue;      // 서로 떨어져 흩어져 있게 (많을 때는 조금 더 붙어도)
      return { x, z };
    }
    return { x: 20, z: 20 };
  }
  for (let i = 0; i < MAX; i++) {
    const mesh = giftMesh(i), off = i >= COUNT, p = off ? { x: 0, z: 0 } : spot();
    mesh.position.set(p.x, 0, p.z); mesh.rotation.y = rand() * Math.PI * 2; mesh.scale.setScalar(0.9); mesh.visible = !off;
    group.add(mesh);
    pool.push({ mesh, x: p.x, z: p.z, open: false, back: 0, i, off });
  }
  // 반짝임: 상자 위에 작은 별빛 하나가 깜빡여 멀리서도 눈에 띈다
  const glint = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.25, 'rgba(255,235,160,0.8)'); r.addColorStop(1, 'rgba(255,235,160,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,240,0.95)'; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), transparent: true, depthWrite: false, opacity: 0.9 });
  // 트리 밑에 쌓인 장식 선물 (열리지는 않는다): 둥치 둘레에 크고 작은 상자 여덟
  for (let k = 0; k < 8; k++) {
    const m = giftMesh(k + 3), a = k / 8 * Math.PI * 2 + 0.35 + (k % 2) * 0.18, r = 1.45 + (k % 3) * 0.17;
    m.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); m.rotation.y = a * 2.3; m.scale.setScalar(0.62 + (k % 3) * 0.12);
    group.add(m);
  }
  for (const g of pool) { const s = new THREE.Sprite(glint); s.scale.setScalar(0.5); s.position.y = g.mesh.userData.height + 0.42; g.mesh.add(s); g.glint = s; }

  const santa = santaMesh();
  santa.position.set(SANTA_AT.x, 0, SANTA_AT.z);
  santa.rotation.y = Math.atan2(0 - SANTA_AT.x, 15 - SANTA_AT.z);      // 들어오는 쪽(트리 앞)을 바라본다
  santa.visible = false; scene.add(santa);
  const forced = q.has('santahere');
  let wasHere = false, laughIn = 0, laughT = 9, on = false, wasBuried = false;

  return {
    group, santa,
    /** 놓여 있는 선물 상자들 (열려서 곧 다시 놓일 것 포함) */
    get gifts() { return live(); },
    /** 함께 걷는 펭귄 수에 맞춰 상자 수를 정한다: 혼자면 10, 한 마리 늘 때마다 2 (많아야 24). 줄 때는 열리지 않은 것부터 거둔다 */
    setPeers(n) {
      want = Math.min(MAX, COUNT + 2 * Math.max(0, n));
      for (const g of pool) {
        if (g.off && live().length < want) { const p = spot(); Object.assign(g, { x: p.x, z: p.z, off: false, open: false, back: 0 }); g.mesh.position.set(p.x, 0, p.z); g.mesh.visible = true; }
      }
      for (let k = pool.length - 1; k >= 0 && live().length > want; k--) { const g = pool[k]; if (!g.off) { g.off = true; g.mesh.visible = false; } }
    },
    get on() { return on; },
    get santaHere() { return santa.visible; },
    /** 펭귄이 인사하면 산타가 손을 흔들며 허허허 웃는다 (laugh 를 부른다) */
    greet(laugh) { if (!santa.visible) return false; laughT = 0; laughIn = Math.max(laughIn, 6); if (laugh) laugh(); return true; },
    /** 산타의 머리 위 (말풍선을 띄울 자리) */
    santaHead: new THREE.Vector3(SANTA_AT.x, 2.75, SANTA_AT.z),
    santaAt: SANTA_AT,
    /** 펭귄이 닿은, 아직 열지 않은 선물 (없으면 null) */
    /** 가장 가까운 (열지 않은) 선물까지의 거리 */
    nearest(x, z) { if (!on || wasBuried) return Infinity; let d = Infinity; for (const g of pool) if (!g.off && !g.open) d = Math.min(d, Math.hypot(g.x - x, g.z - z)); return d; },
    touch(x, z) { if (!on || wasBuried) return null; for (const g of pool) if (!g.off && !g.open && Math.hypot(g.x - x, g.z - z) < TOUCH) return g; return null; },
    /** 그 선물을 연 것으로 친다: 상자는 눈가루와 함께 사라지고, 얼마 뒤 다른 곳에 새로 놓인다. 무엇이 나왔는지 돌려준다 */
    open(g) {
      g.open = true; g.mesh.visible = false; g.back = RESPAWN[0] + rand() * (RESPAWN[1] - RESPAWN[0]);
      crumble.puff(g.x, g.z, 0.7);
      return PRESENTS[Math.floor(rand() * PRESENTS.length)];
    },
    /**
     * 한 박자. 산타가 막 나타났거나, 나와 있는 동안 펭귄이 가까이 있으면 웃는다 (laugh 를 부른다)
     * @param {number} now 세계 시각  @param {number} dt  @param {{ x, z }} me  @param {() => void} laugh
     */
    update(now, dt, time, me, laugh) {
      on = season(now);
      group.visible = on;
      // 큰 눈이 한창일 때는 선물도 눈에 묻혀 보이지 않고, 눈이 그치면 새 자리에 다시 놓인다
      const buried = stormPhase(now) === 'peak';
      if (buried !== wasBuried) {
        wasBuried = buried;
        for (const g of pool) {
          if (g.off) continue;
          if (buried) g.mesh.visible = false;
          else if (!g.open) { const p = spot(); g.x = p.x; g.z = p.z; g.mesh.position.set(p.x, 0, p.z); g.mesh.visible = true; }
        }
      }
      if (buried) { for (const g of pool) if (g.open && !g.off) g.back = Math.max(g.back, 1); }
      for (const g of pool) {
        if (g.off) continue;
        if (g.open) {
          g.back -= dt;
          if (g.back <= 0) { const p = spot(); g.x = p.x; g.z = p.z; g.mesh.position.set(p.x, 0, p.z); g.open = false; g.mesh.visible = true; }
          continue;
        }
        g.glint.material.opacity = 0.55 + 0.45 * Math.max(0, Math.sin(time * 2.2 + g.i * 1.7));
        g.glint.scale.setScalar(0.38 + 0.14 * Math.sin(time * 3.1 + g.i));
      }
      const here = on && (forced || santaHere(now));
      santa.visible = here;
      if (!here) { wasHere = false; return; }
      const near = Math.hypot(me.x - SANTA_AT.x, me.z - SANTA_AT.z) < 30;
      if (!wasHere) { wasHere = true; crumble.puff(SANTA_AT.x, SANTA_AT.z, 1.1); laughIn = 0.4; }
      laughIn -= dt;
      if (laughIn <= 0 && near) { laughIn = 22; laughT = 0; laugh(); }
      // 웃을 때 배를 잡고 들썩이며 손을 흔든다
      laughT += dt;
      const u = santa.userData, shake = laughT < 1.6 ? Math.sin(laughT * 22) * 0.04 * (1 - laughT / 1.6) : 0;
      u.body.position.y = Math.abs(shake) * 1.5 + Math.sin(time * 1.6) * 0.015;
      u.body.rotation.z = shake;
      u.arms[1].rotation.z = 0.35 + (laughT < 2.4 ? 1.9 + Math.sin(laughT * 9) * 0.35 : 0);       // 오른손을 들어 흔든다
    },
  };
}
