// 펭귄. 눈사람처럼 둥근 흰 몸, 둥근 머리, 어깨의 작은 까만 날개, 주황 부리, 점 눈, 납작한 발.
// 흰 눈밭에서 잘 보이도록 목도리를 두르거나 담요를 뒤집어쓴다 (들어올 때 무작위로 정해진다).
// 공·원뿔·고리 같은 기본 도형만 쓴다.
import * as THREE from 'three';

export const STEP = 0.52;      // 한 걸음의 길이 (발자국 간격)
export const STANCE = 0.13;    // 왼발·오른발이 가운데에서 벌어진 거리

const WHITE = '#f7f5f0', BLACK = '#17181d', BEAK = '#e0913c', FOOT = '#e9e6df', RED = '#d0312d';

// 흰 눈 위에서 잘 보이는 색들. 들어올 때 목도리/담요와 색이 무작위로 정해진다 (고르는 화면 없음).
export const COLORS = ['#d0312d', '#e2711d', '#e3a51f', '#2f7d5b', '#1c8c8c', '#2f66c0', '#7b4bb0', '#e0528f'];
/** rand: 0..1 을 돌려주는 함수 → { scarf, blanket, color } */
export function randomLook(rand = Math.random) {
  const blanket = rand() < 0.5;
  return { scarf: !blanket, blanket, color: COLORS[Math.floor(rand() * COLORS.length) % COLORS.length] };
}

export function build({ scarf = false, blanket = false, color = RED } = {}) {
  const blanketColor = color;
  const g = new THREE.Group();
  const mat = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const ball = (r, c, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), mat(c)); m.scale.set(sx, sy, sz); return m; };

  // 걸을 때 통째로 기우뚱하는 윗몸
  const top = new THREE.Group(); g.add(top);
  // 눈사람이 되면 눈 속에 묻혀 안 보이는 것들 (몸, 머리, 날개, 목도리, 담요, 쌓이던 눈). 눈과 부리만 밖에 남는다
  const skin = new THREE.Group(); top.add(skin);

  const body = ball(0.5, WHITE, 1, 1.12, 0.98); body.position.y = 0.6; skin.add(body);
  const head = ball(0.33, WHITE, 1, 0.95, 1); head.position.y = 1.2; skin.add(head);

  // 얼굴: 점 눈 두 개와 주황 부리
  const eyes = [-1, 1].map((s) => { const e = ball(0.03, BLACK); e.position.set(s * 0.12, 1.26, 0.295); top.add(e); return e; });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 14), mat(BEAK));
  beak.rotation.x = Math.PI / 2 + 0.12; beak.scale.set(1.25, 1, 0.8); beak.position.set(0, 1.16, 0.4); top.add(beak);

  // 어깨의 작은 까만 날개 (어깨를 축으로 흔든다)
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.4, 0.93, 0);
    const w = ball(0.2, BLACK, 0.5, 1.15, 0.72); w.position.set(s * 0.085, -0.15, 0); w.rotation.z = s * 0.5;
    pivot.add(w); skin.add(pivot); return pivot;
  });

  // 납작한 발 (엉덩이 높이를 축으로 앞뒤로)
  const feet = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.19, 0.2, 0.02);
    const f = ball(0.15, FOOT, 0.82, 0.3, 1.3); f.position.set(0, -0.155, 0.11); f.rotation.y = s * -0.22;
    pivot.add(f); g.add(pivot); return pivot;
  });

  // 빨간 목도리: 목에 감은 고리 + 등 뒤로 늘어진 끝자락 (두 마디로 흔들린다)
  let scarfEnd = null;
  if (scarf && !blanket) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.105, 14, 30), mat(color, 1));
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.0; skin.add(ring);
    const knot = ball(0.115, color); knot.position.set(0.16, 0.99, -0.31); skin.add(knot);
    scarfEnd = new THREE.Group(); scarfEnd.position.set(0.16, 0.97, -0.36); skin.add(scarfEnd);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.075), mat(color, 1)); a.position.y = -0.17; scarfEnd.add(a);
    const tip = new THREE.Group(); tip.position.y = -0.34; scarfEnd.add(tip);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.075), mat(color, 1)); b.position.y = -0.12; tip.add(b);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.076), mat('#f3e3c3', 1)); fringe.position.y = -0.235; tip.add(fringe);
    scarfEnd.userData.tip = tip;
  }

  // 담요: 머리부터 뒤집어쓰고 등과 옆으로 흘러내린다. 얼굴 쪽만 트여 있고, 턱 밑에서 여며진다.
  let cape = null;
  if (blanket) {
    cape = new THREE.Group(); skin.add(cape);
    const cloth = mat(blanketColor, 1); cloth.side = THREE.DoubleSide;
    // 머리를 덮는 두건 (앞쪽 한 조각을 비워 얼굴이 보인다)
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.4, 28, 18, Math.PI * 0.5 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.6), cloth);
    hood.position.y = 1.2; hood.scale.set(1, 1, 1.02); cape.add(hood);
    // 어깨에서 아래로 퍼지는 자락: 앞은 살짝 벌어지고, 밑단은 들쭉날쭉. 색 띠를 이어 붙여 줄무늬를 낸다.
    const GAP = 0.85;                                   // 앞트임 너비(라디안). 회전체는 +Z 가 0도
    const HANG_FROM = 0.7, BACK_LIFT = 0.2;             // 이 높이 아래부터, 등 쪽 밑단을 이만큼 끌어올린다
    const prof = (y) => {                                // 높이 → 반지름 (몸보다 조금 크게)
      const k = [[1.08, 0.33], [0.9, 0.5], [0.62, 0.61], [0.38, 0.645], [0.27, 0.63]];
      for (let i = 0; i < k.length - 1; i++) if (y <= k[i][0] && y >= k[i + 1][0]) { const f = (k[i][0] - y) / (k[i][0] - k[i + 1][0]); return k[i][1] + (k[i + 1][1] - k[i][1]) * f; }
      return k[k.length - 1][1];
    };
    const band = (y1, y0, color, wavy) => {
      const pts = []; for (let i = 0; i <= 6; i++) { const y = y1 + (y0 - y1) * (i / 6); pts.push(new THREE.Vector2(prof(y), y)); }
      const m = mat(color, 1); m.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 36, GAP / 2, Math.PI * 2 - GAP), m);
      // 담요는 등 쪽이 짧다: 뒤에서 보면 밑단 아래로 흰 엉덩이와 발이 보인다 (앞 0 → 뒤 1 로 갈수록 밑단이 올라간다)
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), ang = Math.atan2(pos.getX(i), pos.getZ(i)), back = (1 - Math.cos(ang)) / 2;
        let ny = y < HANG_FROM ? y + BACK_LIFT * back * (HANG_FROM - y) / (HANG_FROM - 0.27) : y;
        if (wavy && y < y0 + 0.01) ny += Math.sin(ang * 6) * 0.03;
        pos.setY(i, ny);
      }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
      cape.add(mesh);
    };
    const CREAM = '#f3e3c3';
    band(1.08, 0.5, blanketColor); band(0.5, 0.455, CREAM); band(0.455, 0.385, blanketColor); band(0.385, 0.34, CREAM); band(0.34, 0.27, blanketColor, true);
    // 날개는 담요 속에 넣고, 끝만 앞트임 밖으로 내밀어 담요를 여며 쥔다
    wings.forEach((pivot, i) => {
      const sgn = i ? 1 : -1, w = pivot.children[0];
      // 눈 천사를 할 때 돌아갈 자리(어깨 밖으로 내민 날개)를 먼저 적어 둔다
      pivot.userData.free = { pos: new THREE.Vector3(sgn * 0.5, 0.9, 0), cpos: w.position.clone(), cscale: w.scale.clone(), crot: w.rotation.clone() };
      pivot.position.set(sgn * 0.2, 0.8, 0.42); w.scale.set(0.42, 0.7, 0.5); w.rotation.set(0.5, 0, sgn * -0.9); w.position.set(0, 0, 0);
      pivot.userData.tucked = { pos: pivot.position.clone(), cpos: w.position.clone(), cscale: w.scale.clone(), crot: w.rotation.clone() };
      pivot.userData.held = true;
    });
  }

  // 쌓이는 눈: 머리 위와 양 어깨
  const snowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(blanket ? 0.36 : 0.29, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
  cap.position.y = blanket ? 1.5 : 1.42; cap.visible = false; skin.add(cap);
  const shoulders = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
    m.position.set(s * (blanket ? 0.47 : 0.4), blanket ? 0.93 : 0.98, -0.02); m.visible = false; skin.add(m); return m;
  });

  // 눈사람: 머리와 어깨에 눈이 다 쌓이고 조금 더 서 있으면, "뿅" 하고 펭귄 모양 눈사람이 된다.
  // 목도리를 했든 담요를 썼든 눈사람의 모양은 똑같다 (둥근 머리, 둥근 몸, 발치의 눈 더미). 눈과 주황 부리만 밖으로 보인다.
  const shellMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const shell = new THREE.Group(); shell.visible = false; top.add(shell);
  const lump = (r, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), shellMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); shell.add(m); };
  lump(0.33, 0, SNOW_HEAD.y, 0, SNOW_HEAD.r / 0.33, SNOW_HEAD.r / 0.33, SNOW_HEAD.r / 0.33);   // 눈 덮인 머리: 눈 모자까지 품는 둥근 공
  lump(0.5, 0, 0.6, 0, 1.52, 1.34, 1.52);                       // 몸 (날개도 목도리도 담요도 이 안에 묻힌다)
  lump(0.5, 0, 0.05, 0.06, 1.6, 0.3, 1.65);                     // 발치에 쌓인 눈
  // 눈과 부리가 눈 덮인 머리 겉으로 나올 자리
  const HEAD = new THREE.Vector3(0, SNOW_HEAD.y, 0);
  const eyeHome = eyes.map((e) => e.position.clone());
  const eyeOut = eyeHome.map((p) => HEAD.clone().addScaledVector(p.clone().sub(HEAD).normalize(), SNOW_HEAD.r + 0.014));

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // 눕기(눈 천사)를 위해 한 겹 더 감싼다: root 가 위치·방향을, g 가 눕는 기울기를 맡는다
  const root = new THREE.Group(); root.add(g);
  root.userData = { body: g, top, skin, wings, feet, scarfEnd, cape, cap, shoulders, held: !!blanket, shell, eyes, eyeHome, eyeOut, beak };
  return root;
}

// 눈사람의 머리: [가운데 높이, 반지름]. 목도리 펭귄이든 담요 펭귄이든 같다
const SNOW_HEAD = { y: 1.28, r: 0.5 };
const BEAK_HOME = 0.4, BEAK_OUT = 0.53;      // 부리의 앞뒤 자리: 평소, 눈사람일 때
/** 눈사람으로 바뀌는 순간 (setSnow 의 pop 이 이 값을 지날 때). 그 앞은 몸을 살짝 움츠리고, 그 뒤는 눈사람이 뿅 하고 튀어나와 통통 자리 잡는다 */
export const POP_SWAP = 0.2;

/** 걷는 자세. t: 0..1 한 주기(왼발+오른발), amount: 0(서 있음)..1(걷는 중) */
export function pose(root, t, amount = 1) {
  const u = root.userData, a = t * Math.PI * 2, s = Math.sin(a) * amount;
  u.top.rotation.z = s * 0.11;                       // 좌우로 기우뚱
  u.top.rotation.y = s * 0.08;
  u.top.position.y = Math.abs(Math.cos(a)) * 0.025 * amount;  // 발을 디딜 때마다 살짝 들썩
  u.feet[0].rotation.x = s * 0.55; u.feet[1].rotation.x = -s * 0.55;
  u.feet[0].position.y = 0.2 + Math.max(0, s) * 0.05; u.feet[1].position.y = 0.2 + Math.max(0, -s) * 0.05;
  if (!u.wings[0].userData.held) {
    u.wings[0].rotation.x = -s * 0.35; u.wings[1].rotation.x = s * 0.35;
    u.wings[0].rotation.z = -0.12 - Math.abs(s) * 0.1; u.wings[1].rotation.z = 0.12 + Math.abs(s) * 0.1;
  }
  if (u.scarfEnd) { u.scarfEnd.rotation.x = 0.3 + Math.abs(s) * 0.1; u.scarfEnd.rotation.z = s * 0.22; u.scarfEnd.userData.tip.rotation.z = s * 0.3; u.scarfEnd.userData.tip.rotation.x = 0.12; }
  if (u.cape) u.cape.rotation.z = -s * 0.035;        // 담요는 몸보다 조금 늦게 따라온다
}

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * 가만히 서 있을 때 쌓이는 눈.
 * @param {number} hat 0..1 머리 위와 어깨에 쌓인 눈 (흰 모자처럼)
 * @param {number} pop 0..1 눈사람이 되는 "뿅" 의 진행. 0 아직 아님, POP_SWAP 에서 눈사람으로 바뀌고, 1 이면 다 된 눈사람
 */
export function setSnow(root, hat, pop = 0) {
  const u = root.userData, on = hat > 0.02, snowman = pop >= POP_SWAP;
  u.cap.visible = on;
  u.cap.scale.set(1, 0.2 + hat * 0.55, 1);               // 눈 모자는 납작하고 둥글게 쌓인다 (뾰족해 보이지 않게)
  u.shoulders.forEach((m) => { m.visible = on && hat > 0.3; m.scale.set(1, 0.3 + hat * 0.6, 1); });

  // 눈사람이 되면 펭귄의 몸은 눈 속에 묻히고(숨긴다), 눈과 부리만 눈 겉으로 나온다
  u.skin.visible = !snowman;
  u.feet.forEach((f) => { f.visible = !snowman; });
  u.shell.visible = snowman;
  u.eyes.forEach((eye, i) => eye.position.copy(snowman ? u.eyeOut[i] : u.eyeHome[i]));
  u.beak.position.z = snowman ? BEAK_OUT : BEAK_HOME;

  if (!snowman) {
    // 뿅 하기 직전: 몸을 살짝 움츠린다
    const k = smooth(pop / POP_SWAP);
    u.top.scale.set(1 + k * 0.07, 1 - k * 0.12, 1 + k * 0.07);
  } else {
    // 뿅: 작게 나타나 훌쩍 커졌다가, 젤리처럼 두어 번 통통거리며 제 크기로 자리 잡는다 (눈과 부리도 함께)
    const v = (pop - POP_SWAP) / (1 - POP_SWAP);
    const base = 0.55 + 0.45 * smooth(v / 0.12), wobble = 0.2 * Math.exp(-3.5 * v) * Math.sin(11 * v) * (1 - v);
    u.top.scale.set(base - 0.6 * wobble, base + wobble, base - 0.6 * wobble);
  }
}

/** 담요를 여며 쥔 날개 하나를 어깨 밖으로 꺼낸다. out: 0(쥐고 있음)..1(다 꺼냄) */
function untuck(pivot, out) {
  const a = pivot.userData.tucked, b = pivot.userData.free, w = pivot.children[0];
  pivot.position.lerpVectors(a.pos, b.pos, out);
  w.position.lerpVectors(a.cpos, b.cpos, out);
  w.scale.lerpVectors(a.cscale, b.cscale, out);
  w.rotation.set(a.crot.x + (b.crot.x - a.crot.x) * out, a.crot.y + (b.crot.y - a.crot.y) * out, a.crot.z + (b.crot.z - a.crot.z) * out);
  if (out === 0) pivot.rotation.set(0, 0, 0);
}

/** 낚싯대를 쥔 날개 끝의 자리 (펭귄 기준). 낚싯대는 여기서 앞쪽 위로 뻗는다 */
export const ROD_GRIP = new THREE.Vector3(0.47, 0.8, 0.36);

/**
 * 낚시 자세: 엉덩이를 붙이고 앉아 발을 앞으로 내밀고, 오른쪽 날개를 앞으로 들어 낚싯대를 쥔다. (pose() 다음에 부른다)
 * @param {number} k 0(서 있음)..1(앉음)  @param {number} lean 윗몸을 앞(+)이나 뒤(-)로 기울이는 각도(라디안)
 */
export function sit(root, k, lean = 0) {
  const u = root.userData, hand = u.wings[1];
  u.body.position.y = -0.09 * k;
  u.top.rotation.x = lean * k;
  u.feet.forEach((f) => { f.rotation.x = -0.95 * k; f.position.z = 0.02 + 0.21 * k; f.position.y = 0.2 + 0.035 * k; });
  if (u.held) untuck(hand, k);                    // 담요 펭귄은 한쪽 날개만 담요 밖으로 꺼낸다
  hand.rotation.x = -1.2 * k;
  hand.rotation.z = (u.held ? 0 : 0.12) * (1 - k) + 0.05 * k;
}

/**
 * 서서 파닥파닥: 양 날개를 빠르게 위아래로 퍼덕이고 몸이 통통 들썩인다. (pose() 다음에 부른다)
 * @param {number} k 0..1 (시작과 끝에서 부드럽게)  @param {number} beat 날갯짓 위상(라디안)
 */
export function flap(root, k, beat = 0) {
  const u = root.userData;
  if (u.held) u.wings.forEach((pivot) => untuck(pivot, Math.min(1, k * 2)));
  const a = (1 - Math.cos(beat)) / 2;              // 0(내림)..1(올림)
  u.wings[0].rotation.z = -(0.15 + 1.15 * a) * k; u.wings[1].rotation.z = (0.15 + 1.15 * a) * k;
  u.wings[0].rotation.x = 0; u.wings[1].rotation.x = 0;
  u.top.position.y += Math.abs(Math.sin(beat)) * 0.05 * k;
  if (k === 0) u.wings.forEach((pivot) => { pivot.rotation.z = 0; });
}

/**
 * 배 썰매: 앞으로 엎드려 배를 깔고, 날개는 몸에 붙여 뒤로 뻗는다 (펭귄이 눈 위를 미끄러질 때의 자세).
 * @param {number} k 0(서 있음)..1(완전히 엎드림)  @param {number} wiggle 미끄러지는 동안 발을 살랑이는 위상(라디안)
 */
export function belly(root, k, wiggle = 0) {
  const u = root.userData, g = u.body;
  g.rotation.x = k * Math.PI / 2 * 0.94;           // 머리가 앞(+Z)으로 숙여지고 배가 땅에 닿는다 (고개는 살짝 든다)
  g.position.y = k * 0.4;
  g.position.z = -k * 0.5;                         // 엎드린 몸의 가운데가 서 있던 자리에 오도록
  const out = Math.min(1, Math.max(0, (k - 0.4) / 0.6));
  if (u.held) u.wings.forEach((pivot) => untuck(pivot, out));
  u.wings[0].rotation.z = -0.32 * out; u.wings[1].rotation.z = 0.32 * out;      // 날개를 옆구리에 붙여 뒤로
  u.wings[0].rotation.x = 0.5 * out; u.wings[1].rotation.x = 0.5 * out;
  const w = Math.sin(wiggle) * 0.35 * out;
  u.feet[0].rotation.x = -0.6 * out + w; u.feet[1].rotation.x = -0.6 * out - w;      // 발은 뒤로 들고 살랑인다
  u.feet[0].rotation.y = 0; u.feet[1].rotation.y = 0;
  if (k === 0) u.wings.forEach((pivot) => { pivot.rotation.x = 0; });
}

/**
 * 눈 천사: 뒤로 벌렁 누워 날개와 발을 휘젓는다.
 * @param {number} k 0(서 있음)..1(완전히 누움)  @param {number} flap 휘젓는 주기 위상(라디안). 누워 있지 않으면 무시
 */
export function lie(root, k, flap = 0) {
  const u = root.userData, g = u.body;
  g.rotation.x = -k * Math.PI / 2;                 // 머리가 뒤(-Z)로 넘어가고 배가 하늘을 본다
  g.position.y = k * 0.44;                         // 등이 땅에 닿는 높이
  g.position.z = k * 0.55;                         // 누운 몸의 가운데가 서 있던 자리에 오도록
  const out = Math.min(1, Math.max(0, (k - 0.5) * 2));
  if (u.held) u.wings.forEach((pivot) => untuck(pivot, out));      // 담요를 쥐고 있던 날개를 어깨 밖으로 꺼낸다 (다 일어나면 다시 여며 쥔다)
  if (k > 0.5) {
    const w = Math.sin(flap), amt = out;
    u.wings[0].rotation.z = (-0.9 + w * 0.75) * amt; u.wings[1].rotation.z = (0.9 - w * 0.75) * amt; u.wings[0].rotation.x = 0; u.wings[1].rotation.x = 0;
    u.feet[0].rotation.y = (-0.25 + w * 0.45) * amt; u.feet[1].rotation.y = (0.25 - w * 0.45) * amt;
    u.feet[0].rotation.x = 0; u.feet[1].rotation.x = 0;
  } else {
    u.feet[0].rotation.y = 0; u.feet[1].rotation.y = 0;
  }
}
