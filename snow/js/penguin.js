// 펭귄. 눈사람처럼 둥근 흰 몸, 둥근 머리, 어깨의 작은 까만 날개, 주황 부리, 점 눈, 납작한 발.
// 흰 눈밭에서 잘 보이도록 목도리를 두르거나 담요를 뒤집어쓴다 (들어올 때 무작위로 정해진다).
// 공·원뿔·고리 같은 기본 도형만 쓴다.
import * as THREE from 'three';

export const STEP = 0.46;      // 한 걸음의 길이 (발자국 간격)
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

  const body = ball(0.5, WHITE, 1, 1.12, 0.98); body.position.y = 0.6; top.add(body);
  const head = ball(0.33, WHITE, 1, 0.95, 1); head.position.y = 1.2; top.add(head);

  // 얼굴: 점 눈 두 개와 주황 부리
  [-1, 1].forEach((s) => { const e = ball(0.03, BLACK); e.position.set(s * 0.12, 1.26, 0.295); top.add(e); });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 14), mat(BEAK));
  beak.rotation.x = Math.PI / 2 + 0.12; beak.scale.set(1.25, 1, 0.8); beak.position.set(0, 1.16, 0.4); top.add(beak);

  // 어깨의 작은 까만 날개 (어깨를 축으로 흔든다)
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.4, 0.93, 0);
    const w = ball(0.2, BLACK, 0.5, 1.15, 0.72); w.position.set(s * 0.085, -0.15, 0); w.rotation.z = s * 0.5;
    pivot.add(w); top.add(pivot); return pivot;
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
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.0; top.add(ring);
    const knot = ball(0.115, color); knot.position.set(0.16, 0.99, -0.31); top.add(knot);
    scarfEnd = new THREE.Group(); scarfEnd.position.set(0.16, 0.97, -0.36); top.add(scarfEnd);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.075), mat(color, 1)); a.position.y = -0.17; scarfEnd.add(a);
    const tip = new THREE.Group(); tip.position.y = -0.34; scarfEnd.add(tip);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.075), mat(color, 1)); b.position.y = -0.12; tip.add(b);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.076), mat('#f3e3c3', 1)); fringe.position.y = -0.235; tip.add(fringe);
    scarfEnd.userData.tip = tip;
  }

  // 담요: 머리부터 뒤집어쓰고 등과 옆으로 흘러내린다. 얼굴 쪽만 트여 있고, 턱 밑에서 여며진다.
  let cape = null;
  if (blanket) {
    cape = new THREE.Group(); top.add(cape);
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
    wings.forEach((pivot, i) => { const sgn = i ? 1 : -1; pivot.position.set(sgn * 0.2, 0.8, 0.42); pivot.children[0].scale.set(0.42, 0.7, 0.5); pivot.children[0].rotation.set(0.5, 0, sgn * -0.9); pivot.children[0].position.set(0, 0, 0); pivot.userData.held = true; });
  }

  // 쌓이는 눈: 머리 위와 양 어깨
  const snowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(blanket ? 0.36 : 0.29, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
  cap.position.y = blanket ? 1.5 : 1.42; cap.visible = false; top.add(cap);
  const shoulders = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
    m.position.set(s * (blanket ? 0.47 : 0.4), blanket ? 0.93 : 0.98, -0.02); m.visible = false; top.add(m); return m;
  });

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // 눕기(눈 천사)를 위해 한 겹 더 감싼다: root 가 위치·방향을, g 가 눕는 기울기를 맡는다
  const root = new THREE.Group(); root.add(g);
  root.userData = { body: g, top, wings, feet, scarfEnd, cape, cap, shoulders, held: !!blanket };
  return root;
}

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

/** 가만히 서 있을 때 머리·어깨에 쌓이는 눈. a: 0..1 */
export function setSnow(root, a) {
  const u = root.userData, on = a > 0.02;
  u.cap.visible = on; u.cap.scale.set(1, 0.25 + a * 0.75, 1);
  u.shoulders.forEach((m) => { m.visible = on && a > 0.3; m.scale.set(1, 0.3 + a * 0.6, 1); });
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
  if (k > 0.5) {
    const w = Math.sin(flap), amt = (k - 0.5) * 2;
    if (!u.held) { u.wings[0].rotation.z = (-0.9 + w * 0.75) * amt; u.wings[1].rotation.z = (0.9 - w * 0.75) * amt; u.wings[0].rotation.x = 0; u.wings[1].rotation.x = 0; }
    u.feet[0].rotation.y = (-0.25 + w * 0.45) * amt; u.feet[1].rotation.y = (0.25 - w * 0.45) * amt;
    u.feet[0].rotation.x = 0; u.feet[1].rotation.x = 0;
  } else {
    u.feet[0].rotation.y = 0; u.feet[1].rotation.y = 0;
  }
}
