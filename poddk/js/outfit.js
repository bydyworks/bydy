// 패션 아이템: 산타가 흘린 선물 상자에서 나오는 안경 다섯, 모자 여덟(갓, 마법사 모자, 털모자 포함), 귀마개 다섯.
// 선물을 열면 바로 펭귄이 쓴다. 같은 자리(안경·모자·귀마개)에 이미 쓰고 있던 것이 있으면 새것으로 바뀐다.
// 쓰고 있는 것은 이번 산책 동안만이다 (다시 들어오면 맨몸으로 시작한다). 함께 걷는 다른 펭귄에게도 보인다.
import * as THREE from 'three';

export const SLOTS = ['glasses', 'hat', 'ear'];
/** [자리, 번호] 마다 이름과 한마디 */
export const ITEMS = [
  { slot: 'glasses', n: 0, name: '까만 선글라스', say: '눈이 부셔도 끄떡없어요' },
  { slot: 'glasses', n: 1, name: '동그란 금테 안경', say: '책 읽는 펭귄 같아요' },
  { slot: 'glasses', n: 2, name: '하트 선글라스', say: '눈밭이 온통 분홍빛!' },
  { slot: 'glasses', n: 3, name: '별 선글라스', say: '반짝반짝 오늘의 주인공' },
  { slot: 'glasses', n: 4, name: '주황 스키 고글', say: '언덕을 쌩 내려갈 기세' },
  { slot: 'hat', n: 0, name: '빨간 방울 니트 모자', say: '머리가 따끈따끈' },
  { slot: 'hat', n: 1, name: '산타 모자', say: '오늘은 내가 산타!' },
  { slot: 'hat', n: 2, name: '줄무늬 방울 모자', say: '방울이 달랑달랑' },
  { slot: 'hat', n: 3, name: '보라 베레모', say: '눈밭의 화가 같아요' },
  { slot: 'hat', n: 4, name: '반짝 왕관', say: '눈밭의 임금님 납시오' },
  { slot: 'hat', n: 5, name: '선비의 갓', say: '에헴, 산책 나왔소이다' },
  { slot: 'hat', n: 6, name: '마법사 모자', say: '눈송이야, 펑펑 내려라~ 얍!' },
  { slot: 'hat', n: 7, name: '복슬복슬 털모자', say: '귀까지 포근포근' },
  { slot: 'ear', n: 0, name: '분홍 털 귀마개', say: '귀가 몽글몽글 따뜻해요' },
  { slot: 'ear', n: 1, name: '눈송이 털 귀마개', say: '하얗고 보송보송' },
  { slot: 'ear', n: 2, name: '파란 헤드폰 귀마개', say: '캐롤이 더 잘 들려요' },
  { slot: 'ear', n: 3, name: '곰돌이 귀마개', say: '곰 귀가 쫑긋' },
  { slot: 'ear', n: 4, name: '딸기 귀마개', say: '새콤달콤 딸기 두 알' },
];
export const itemOf = (slot, n) => ITEMS.find((i) => i.slot === slot && i.n === n) || null;

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const shiny = (c) => mat(c, { roughness: 0.25, metalness: 0.35 });
const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m); o.scale.set(sx, sy, sz); return o; };

function heart(s) {
  const p = new THREE.Shape();
  p.moveTo(0, -0.9 * s);
  p.bezierCurveTo(-1.2 * s, -0.1 * s, -1.0 * s, 0.9 * s, -0.45 * s, 0.9 * s);
  p.bezierCurveTo(-0.15 * s, 0.9 * s, 0, 0.62 * s, 0, 0.45 * s);
  p.bezierCurveTo(0, 0.62 * s, 0.15 * s, 0.9 * s, 0.45 * s, 0.9 * s);
  p.bezierCurveTo(1.0 * s, 0.9 * s, 1.2 * s, -0.1 * s, 0, -0.9 * s);
  return p;
}
function star(s) {
  const p = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  p.closePath();
  return p;
}
const flat = (shape, m, depth = 0.025) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }); g.center(); return new THREE.Mesh(g, m); };

/**
 * 하나를 만든다. 펭귄 몸(skin) 기준 자리에 놓인 Group 을 돌려준다.
 * R: 머리(목도리 펭귄) 또는 두건(담요 펭귄)의 반지름. 모자와 귀마개는 그 겉에 얹힌다
 */
export function makeItem(slot, n, R = 0.33) {
  const g = new THREE.Group();
  const HY = 1.2;                                  // 머리 가운데 높이
  if (slot === 'glasses') {
    const EY = 1.265, EX = 0.12, Z = 0.335;        // 눈 높이, 눈 사이 반, 얼굴 앞
    const arms = (m) => { for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.26), m); a.position.set(s * 0.26, EY + 0.01, Z - 0.15); a.rotation.y = s * 0.35; g.add(a); } };
    if (n === 0) {                                 // 까만 선글라스
      const lens = mat('#1d2330', { roughness: 0.12, metalness: 0.5 });
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.025, 24), lens); l.rotation.x = Math.PI / 2; l.scale.set(1.25, 1, 0.92); l.position.set(s * EX, EY, Z); g.add(l); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.02), lens); br.position.set(0, EY + 0.03, Z + 0.005); g.add(br);
      arms(lens);
    } else if (n === 1) {                          // 동그란 금테 안경
      const gold = shiny('#d9a63a'), glass = new THREE.MeshStandardMaterial({ color: '#dff0ff', transparent: true, opacity: 0.35, roughness: 0.05 });
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.013, 10, 28), gold); ring.position.set(s * EX, EY, Z); g.add(ring);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.068, 24), glass); l.position.set(s * EX, EY, Z - 0.002); g.add(l);
      }
      const br = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI), gold); br.position.set(0, EY + 0.015, Z); g.add(br);
      arms(gold);
    } else if (n === 2) {                          // 하트 선글라스
      const pink = mat('#f0567f', { roughness: 0.3 });
      for (const s of [-1, 1]) { const h = flat(heart(0.085), pink); h.position.set(s * (EX + 0.01), EY, Z); g.add(h); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), pink); br.position.set(0, EY + 0.02, Z); g.add(br);
      arms(pink);
    } else if (n === 3) {                          // 별 선글라스
      const gold = mat('#ffcf3a', { roughness: 0.3, metalness: 0.2 });
      for (const s of [-1, 1]) { const h = flat(star(0.1), gold); h.position.set(s * (EX + 0.015), EY, Z); h.rotation.z = s * 0.12; g.add(h); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), gold); br.position.set(0, EY + 0.01, Z); g.add(br);
      arms(gold);
    } else {                                       // 주황 스키 고글: 앞을 감싸는 렌즈와 머리 뒤로 두른 끈
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.035, R + 0.03, 0.15, 32, 1, true, -0.95, 1.9), mat('#ff8a2a', { roughness: 0.12, metalness: 0.5, side: THREE.DoubleSide }));
      lens.position.y = EY; g.add(lens);
      for (const dy of [-0.08, 0.08]) {           // 렌즈 위아래의 까만 테
        const edge = new THREE.Mesh(new THREE.TorusGeometry(R + 0.034, 0.014, 6, 24, 1.9), mat('#26324a', { roughness: 0.5 }));
        edge.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.95 - 1.9); edge.position.y = EY + dy; g.add(edge);
      }
      const strap = new THREE.Mesh(new THREE.TorusGeometry(R + 0.012, 0.022, 6, 36), mat('#26324a', { roughness: 0.7 })); strap.rotation.x = Math.PI / 2; strap.position.y = EY; g.add(strap);
    }
  } else if (slot === 'hat') {
    const knit = (c, stripes = null) => {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(R + 0.035, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.38), mat(c, { roughness: 1 }));
      cap.position.y = HY; g.add(cap);
      const edge = HY + (R + 0.035) * Math.cos(Math.PI * 0.38);
      const rim = new THREE.Mesh(new THREE.TorusGeometry((R + 0.035) * Math.sin(Math.PI * 0.38) + 0.01, 0.05, 10, 32), mat(stripes ? stripes : c, { roughness: 1 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = edge + 0.02; g.add(rim);
      return edge;
    };
    const top = HY + R * 0.95;                     // 머리(두건) 꼭대기
    if (n === 0) {                                 // 빨간 방울 니트 모자
      knit('#d8443a', '#f2e6d2');
      const pom = ball(0.085, mat('#f6efe4', { roughness: 1 })); pom.position.y = top + 0.1; g.add(pom);
    } else if (n === 1) {                          // 산타 모자: 하얀 테, 뒤로 꺾인 빨간 고깔, 끝에 하얀 방울
      const rimY = HY + R * 0.42;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.93, 0.065, 12, 32), mat('#ffffff', { roughness: 1 })); rim.rotation.x = Math.PI / 2; rim.position.y = rimY; g.add(rim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.92, 0.5, 28, 1, true), mat('#d63a34', { roughness: 0.95, side: THREE.DoubleSide }));
      const pivot = new THREE.Group(); pivot.position.y = rimY; pivot.rotation.x = -0.55; g.add(pivot);
      cone.position.y = 0.25; pivot.add(cone);
      const pom = ball(0.075, mat('#ffffff', { roughness: 1 })); pom.position.y = 0.5; pivot.add(pom);
    } else if (n === 2) {                          // 줄무늬 방울 모자 (초록과 흰 줄)
      knit('#3f9a6e', '#ffffff');
      for (let k = 1; k <= 2; k++) {
        const a = Math.PI * (0.38 - k * 0.12), r = (R + 0.04) * Math.sin(a);
        const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 28), mat('#ffffff', { roughness: 1 })); band.rotation.x = Math.PI / 2; band.position.y = HY + (R + 0.035) * Math.cos(a); g.add(band);
      }
      const pom = ball(0.11, mat('#ffffff', { roughness: 1 })); pom.position.y = top + 0.12; g.add(pom);
    } else if (n === 3) {                          // 보라 베레모: 납작하게 한쪽으로 기울어진 둥근 모자와 꼭지
      const beret = ball(R * 1.12, mat('#7b5bb6', { roughness: 1 }), 1, 0.32, 1); beret.position.set(0.05, top - 0.04, -0.02); beret.rotation.z = -0.22; g.add(beret);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.06, 8), mat('#5c4290')); stem.position.set(0.02, top + 0.08, -0.02); g.add(stem);
    } else if (n === 5) {                          // 선비의 갓: 말총으로 엮어 살짝 비치는 넓은 챙과 높은 원통, 턱 밑으로 늘어진 구슬 갓끈
      const hair = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.55, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
      const brimY = top - 0.07;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.75, R * 1.75, 0.012, 40), hair); brim.position.y = brimY; g.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.56, 0.24, 28, 1, false), hair); crown.position.y = brimY + 0.12; g.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.565, R * 0.565, 0.035, 28, 1, true), mat('#2a2c33', { side: THREE.DoubleSide })); band.position.y = brimY + 0.02; g.add(band);
      for (const sx of [-1, 1]) {                  // 갓끈: 챙 밑에서 턱 아래로 구슬을 꿴 줄
        for (let k = 0; k < 7; k++) {
          const u = k / 6, x = sx * R * (0.95 - u * 0.55), y = brimY - 0.05 - u * 0.42, z = 0.08 + u * 0.14;
          const bead = ball(0.018, mat(k % 2 ? '#c9a24a' : '#7a2a2a', { roughness: 0.3 })); bead.position.set(x, y, z); g.add(bead);
        }
      }
    } else if (n === 6) {                          // 마법사 모자: 넓은 챙, 굵은 노란 띠, 높이 솟다가 끝이 옆으로 휙 꺾인 고깔 (연보라)
      const lav = mat('#7d80ea', { roughness: 0.85, side: THREE.DoubleSide }), band = mat('#f6c35c', { roughness: 0.6, side: THREE.DoubleSide });
      const brimY = top - 0.08;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.5, R * 1.5, 0.022, 40), lav); brim.position.y = brimY; g.add(brim);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 1.5, 0.025, 8, 40), lav); lip.rotation.x = Math.PI / 2; lip.position.y = brimY + 0.018; g.add(lip);      // 챙 끝이 살짝 말려 올라간다
      // 고깔: 원뿔 하나를 위로 갈수록 옆(+x)으로 휘게 구부려, 끝이 옆으로 휙 꺾이게 한다 (이음매 없이 매끈하게)
      const H = 0.6, cone = new THREE.ConeGeometry(R * 0.7, H, 32, 24, true), pos = cone.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k), t = Math.min(1, Math.max(0, (y + H / 2) / H));      // (밑동이 아주 조금 음수가 되면 거듭제곱이 NaN 이 된다)
        pos.setX(k, pos.getX(k) + 0.3 * Math.pow(t, 2.6));
        pos.setY(k, y - 0.16 * Math.pow(t, 3));
      }
      cone.computeVertexNormals();
      const hat = new THREE.Mesh(cone, lav); hat.position.y = brimY + H / 2; g.add(hat);
      const strip = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.655, R * 0.7, 0.08, 32, 1, true), band); strip.position.y = brimY + 0.045; g.add(strip);
    } else if (n === 7) {                          // 복슬복슬 털모자: 갈색 모자에 두툼한 크림색 털 테, 양옆으로 늘어진 털 귀덮개
      const fur = mat('#f3e7d3', { roughness: 1 }), brown = mat('#8a5a3c', { roughness: 1 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(R + 0.04, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.4), brown); cap.position.y = HY; g.add(cap);
      const edge = HY + (R + 0.04) * Math.cos(Math.PI * 0.4), rr = (R + 0.04) * Math.sin(Math.PI * 0.4);
      const roll = new THREE.Mesh(new THREE.TorusGeometry(rr + 0.02, 0.06, 10, 36), fur); roll.rotation.x = Math.PI / 2; roll.position.y = edge + 0.01; g.add(roll);
      for (let k = 0; k < 26; k++) {             // 털 테: 두툼한 테 위에 털 뭉치를 촘촘히 둘러 복슬복슬하게
        const a = k / 26 * Math.PI * 2;
        const tuft = ball(0.062, fur, 1, 0.9, 1); tuft.position.set(Math.sin(a) * (rr + 0.02), edge + 0.01, Math.cos(a) * (rr + 0.02)); g.add(tuft);
      }
      for (const sx of [-1, 1]) {
        const flap = ball(0.11, fur, 0.55, 1.25, 0.95); flap.position.set(sx * (R + 0.04), HY - 0.04, 0); flap.rotation.z = sx * 0.12; g.add(flap);
        const tie = ball(0.03, fur); tie.position.set(sx * (R + 0.02), HY - 0.19, 0.03); g.add(tie);
      }
      const knot = ball(0.05, fur); knot.position.y = HY + R + 0.05; g.add(knot);
    } else {                                       // 반짝 왕관
      const gold = shiny('#f3c12f');
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.58, 0.11, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#f3c12f', roughness: 0.25, metalness: 0.35, side: THREE.DoubleSide }));
      band.position.y = top - 0.01; g.add(band);
      const gems = ['#e8434f', '#4f86e8', '#46c08a', '#e8434f', '#b066e0'];
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2, x = Math.sin(a) * R * 0.6, z = Math.cos(a) * R * 0.6;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), gold); spike.position.set(x, top + 0.1, z); g.add(spike);
        const tip = ball(0.022, gold); tip.position.set(x, top + 0.17, z); g.add(tip);
        const gem = ball(0.026, mat(gems[k], { roughness: 0.15, metalness: 0.2 })); gem.position.set(Math.sin(a) * R * 0.63, top - 0.01, Math.cos(a) * R * 0.63); g.add(gem);
      }
    }
  } else {                                         // 귀마개: 머리 위로 넘어가는 띠와 양옆의 동그란 귀덮개
    const band = (c, w = 0.024) => { const b = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, w, 8, 32, Math.PI), mat(c, { roughness: 0.5 })); b.position.y = HY; g.add(b); };
    const muffs = (r, m, sx = 0.7) => [-1, 1].map((s) => { const o = ball(r, m, sx, 1, 1); o.position.set(s * (R + 0.04), HY, 0); g.add(o); return o; });
    if (n === 0) { band('#f39ab8'); muffs(0.11, mat('#f7b4cb', { roughness: 1 })); }
    else if (n === 1) {
      band('#c9d6e8'); muffs(0.115, mat('#ffffff', { roughness: 1 }));
      for (const s of [-1, 1]) { const f = flat(star(0.05), mat('#8fc2ff')); f.position.set(s * (R + 0.125), HY, 0); f.rotation.y = s * Math.PI / 2; g.add(f); }      // 귀덮개 겉의 눈송이(별)
    } else if (n === 2) {
      band('#2f4f8a', 0.03);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 24), mat('#3f7fe0', { roughness: 0.4 })); cup.rotation.z = Math.PI / 2; cup.position.set(s * (R + 0.05), HY, 0); g.add(cup);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 24), mat('#dfe8f7', { roughness: 1 })); pad.rotation.z = Math.PI / 2; pad.position.set(s * (R + 0.012), HY, 0); g.add(pad);
      }
    } else if (n === 3) {
      band('#8a5a36'); const m = muffs(0.11, mat('#a8744a', { roughness: 1 }));
      for (const o of m) for (const dz of [-0.07, 0.07]) { const e = ball(0.035, mat('#8a5a36', { roughness: 1 })); e.position.set(o.position.x, HY + 0.1, dz); g.add(e); }      // 곰 귀 둘
      for (const o of m) { const snout = ball(0.035, mat('#e8cfae', { roughness: 1 })); snout.position.set(o.position.x * 1.22, HY - 0.02, 0); g.add(snout); }
    } else {
      band('#3f9a4e');
      const m = muffs(0.11, mat('#e8434f', { roughness: 0.6 }), 0.75);
      for (const o of m) {
        for (let k = 0; k < 6; k++) { const a = k * 1.05, s = ball(0.012, mat('#ffe28a')); s.position.set(o.position.x * 1.2, HY + Math.sin(a) * 0.06, Math.cos(a) * 0.06); g.add(s); }      // 딸기씨
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.05, 6), mat('#4fb35a')); leaf.position.set(o.position.x, HY + 0.11, 0); leaf.rotation.x = Math.PI; g.add(leaf);
      }
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.item = { slot, n };
  return g;
}

/**
 * 펭귄에게 씌운다 (n < 0 이면 벗긴다). 같은 자리에 쓰고 있던 것은 벗겨 낸다.
 * 모자를 쓰면 머리 위에 쌓이던 눈 더미는 그리지 않는다 (모자 밑으로 들어간다).
 */
export function wear(root, slot, n) {
  const u = root.userData;
  u.outfit = u.outfit || {};
  const old = u.outfit[slot];
  if (old && old.userData.item.n === n) return;
  if (old) { old.parent.remove(old); old.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); delete u.outfit[slot]; }
  if (n >= 0) {
    const item = makeItem(slot, n, u.cape ? 0.41 : 0.33);
    u.skin.add(item);
    u.outfit[slot] = item;
  }
  u.hatOn = !!u.outfit.hat;
  if (u.hatOn) u.cap.visible = false;
}
/** 지금 쓰고 있는 것: [안경, 모자, 귀마개] 번호 (없으면 -1) */
export function worn(root) { const o = root.userData.outfit || {}; return SLOTS.map((s) => (o[s] ? o[s].userData.item.n : -1)); }
