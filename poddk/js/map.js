// 만드는 사람끼리 보는 지도 (map.html). 게임이 쓰는 자리 값과 규칙을 그대로 읽어, 위에서 내려다본 눈밭을 그린다.
//   · 트리, 들어오는 자리, 이글루 셋, 낚시터 셋, 슬라이딩 언덕(계단), 썰매 길, 모닥불, 우체통, 소원판
//   · 여우: 지금 있는 자리와 지나온 길(발자국이 남아 있는 12분), 앞으로 갈 길
//   · 눈 소식(다음 폭설), 오늘 밤 썰매가 지나가는 시각과 하늘 쪽
//   · 이 기기에 저장된 내 펭귄의 마지막 자리와 발자국
// 주소에 ?t=21:30 이나 ?speed=60 을 붙이면 게임처럼 시각을 바꿔 볼 수 있다.
import { createClock, clockText, stormText, stormPhase, printAlpha, kst } from './clock.js';
import { FIELD_RADIUS } from './field.js';
import { IGLOOS, PONDS } from './igloo.js';
import { foxAt, PAW_LIFE_MS } from './fox.js';
import { nextPass, passesOf, passAt, PASS_MS } from './santa.js';
import { HILL, STAIR_DIR, STAIR_HALF } from './hill.js';
import { LANE } from './sled.js';
import { CAMPFIRE, STUMP_BLOCKS } from './campfire.js';
import { POSTBOX } from './postbox.js';
import { WISHBOARD } from './wishboard.js';

const WALK = 1.25;                 // 펭귄이 걷는 빠르기 (단위/초) — main.js 의 WALK_SPEED 와 같다
const START = { x: 0, z: 15 };     // 들어오는 자리 (main.js 의 me)
const SAVE_KEY = 'snow.v1';        // 게임이 자리와 발자국을 저장해 두는 이름
const SWEEP = 150 * Math.PI / 180; // 썰매가 가로지르는 하늘의 너비 (santa.js 와 같다)

const svg = document.querySelector('#map');
const clock = createClock();
const NS = 'http://www.w3.org/2000/svg';
/** SVG 조각 하나를 만든다 */
function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (text !== undefined) node.textContent = text;
  return node;
}
const r1 = (n) => Math.round(n * 10) / 10;
/** 걸어서 걸리는 시간을 읽기 쉽게: "40초", "1분 10초" */
function walkTime(dist) {
  const sec = Math.round(dist / WALK / 5) * 5;
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분${sec % 60 ? ' ' + (sec % 60) + '초' : ''}`;
}
/** 트리에서 본 방향을 말로: 지도에서의 위·아래·왼쪽·오른쪽 */
function side(x, z) {
  const a = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360;      // 0 = 지도 위쪽, 시계 방향
  return ['위', '오른쪽 위', '오른쪽', '오른쪽 아래', '아래', '왼쪽 아래', '왼쪽', '왼쪽 위'][Math.round(a / 45) % 8];
}
const hhmm = (ms) => { const h = kst(ms).hour; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };

// ---------- 움직이지 않는 것들: 한 번만 그린다 ----------
const base = el('g'), live = el('g');
svg.append(base, live);
base.append(
  el('circle', { r: FIELD_RADIUS, fill: '#ffffff', stroke: '#c5d0e8', 'stroke-width': 1 }),
  el('circle', { r: 30 * WALK, fill: 'none', stroke: '#dfe6f4', 'stroke-width': 0.6, 'stroke-dasharray': '2 2.5' }),
  el('circle', { r: 60 * WALK, fill: 'none', stroke: '#dfe6f4', 'stroke-width': 0.6, 'stroke-dasharray': '2 2.5' }),
);
const label = (x, y, text, size = 5.2, weight = 700) => el('text', { x, y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': weight }, text);
// (거리 글자는 아무것도 없는 오른쪽에 적는다)
// (점선 원이 걸어서 30초·1분 거리라는 것은 그림 설명에 적는다 — 언덕과 겹치지 않게)
// 낚시터: 언 연못(실제 크기)과 구멍
PONDS.forEach((p, i) => {
  const g = el('g', { 'data-kind': 'pond' });
  g.append(el('circle', { cx: p.x, cy: p.z, r: p.radius, fill: '#cfe5f6', stroke: '#8fb8dc', 'stroke-width': 0.8 }), ...p.holes.map((h) => el('circle', { cx: h.x, cy: h.z, r: 0.9, fill: '#1d3b5e' })), label(p.x, p.z + p.radius + 6.4, `낚시터 ${i + 1}`));
  base.append(g);
});
// 이글루: 둥근 집과, 트리 쪽을 보는 문 (알아보기 쉽게 실제보다 조금 크게 그린다)
IGLOOS.forEach((g0, i) => {
  const g = el('g', { 'data-kind': 'igloo' }), r = Math.hypot(g0.x, g0.z), dx = -g0.x / r, dz = -g0.z / r;
  g.append(el('circle', { cx: g0.x, cy: g0.z, r: 4.6, fill: '#eef3fb', stroke: '#8fa3c8', 'stroke-width': 0.9 }), el('circle', { cx: g0.x + dx * 4.6, cy: g0.z + dz * 4.6, r: 1.7, fill: '#39405f' }), label(g0.x, g0.z + 11.6, `이글루 ${i + 1}`));
  base.append(g);
});
// 슬라이딩 언덕: 둥근 언덕과 꼭대기, 한쪽의 계단
{
  const g = el('g', { 'data-kind': 'hill' }), sx = Math.sin(STAIR_DIR), sz = Math.cos(STAIR_DIR), w = STAIR_HALF * 2;
  g.append(el('circle', { cx: HILL.x, cy: HILL.z, r: HILL.r, fill: '#f1f5fc', stroke: '#9fb2d4', 'stroke-width': 0.9 }), el('circle', { cx: HILL.x, cy: HILL.z, r: HILL.top, fill: '#e3ebf7', stroke: '#9fb2d4', 'stroke-width': 0.5 }));
  for (let k = 0; k < 7; k++) { const a = HILL.top + (HILL.r + 0.6 - HILL.top) * (k + 0.5) / 7; g.append(el('line', { x1: HILL.x + sx * a + sz * w / 2, y1: HILL.z + sz * a - sx * w / 2, x2: HILL.x + sx * a - sz * w / 2, y2: HILL.z + sz * a + sx * w / 2, stroke: '#8a5a36', 'stroke-width': 0.6 })); }
  g.append(label(HILL.x, HILL.z + HILL.r + 6.4, '슬라이딩 언덕'), label(HILL.x + sx * (HILL.r + 1) + 6.5, HILL.z + sz * (HILL.r + 1) + 1.2, '계단', 3.6, 600));
  base.append(g);
}
// 썰매 길: 출발 자리부터 곧게 뻗은 얼음 길
{
  const d = LANE.dir, n = { x: d.z, z: -d.x }, a0 = -LANE.pad, a1 = LANE.len, h = LANE.half;
  const pt = (a, s) => `${r1(LANE.start.x + d.x * a + n.x * s)} ${r1(LANE.start.z + d.z * a + n.z * s)}`;
  const g = el('g', { 'data-kind': 'lane' });
  g.append(el('path', { d: `M${pt(a0, h)} L${pt(a1, h)} L${pt(a1, -h)} L${pt(a0, -h)} Z`, fill: '#cfe5f6', stroke: '#8fb8dc', 'stroke-width': 0.7 }), el('path', { d: `M${pt(0, h)} L${pt(0, -h)}`, stroke: '#e0503f', 'stroke-width': 0.9 }));
  const mid = LANE.len / 2; g.append(label(LANE.start.x + d.x * mid + n.x * 7, LANE.start.z + d.z * mid + n.z * 7, '썰매 길'));
  base.append(g);
}
// 모닥불과 그루터기 의자
{
  const g = el('g', { 'data-kind': 'campfire' });
  g.append(el('circle', { cx: CAMPFIRE.x, cy: CAMPFIRE.z, r: 2.2, fill: '#ffb35c', stroke: '#e0503f', 'stroke-width': 0.6 }), ...STUMP_BLOCKS.map((b) => el('circle', { cx: b.x, cy: b.z, r: 0.9, fill: '#8a5a36' })), label(CAMPFIRE.x - 2, CAMPFIRE.z - 4.6, '모닥불'));
  base.append(g);
}
// 우체통과 소원판 (트리 곁)
base.append(el('rect', { x: POSTBOX.x - 1, y: POSTBOX.z - 1, width: 2, height: 2, fill: '#d0312d' }), el('rect', { x: WISHBOARD.x - 1.5, y: WISHBOARD.z - 0.8, width: 3, height: 1.6, fill: '#8a5a36' }));
// 트리와 들어오는 자리
base.append(
  el('path', { d: 'M0 -8 L5.6 4 L-5.6 4 Z', fill: '#2f7d5b' }), el('rect', { x: -1.2, y: 4, width: 2.4, height: 3, fill: '#6b4a33' }),
  label(-9, -3, '트리', 4.6),
  el('circle', { cx: START.x, cy: START.z, r: 2, fill: '#d0312d' }), el('path', { d: `M${START.x} ${START.z - 3} l1.6 2.4 h-3.2 z`, fill: '#d0312d' }),
  label(START.x, START.z + 8.2, '들어오는 자리', 4.4, 600),
);

// 자리 표
const sites = [
  ...IGLOOS.map((g, i) => ({ name: `이글루 ${i + 1}`, x: g.x, z: g.z })),
  ...PONDS.map((p, i) => ({ name: `낚시터 ${i + 1}`, x: p.x, z: p.z })),
  { name: '슬라이딩 언덕(계단)', x: HILL.x + Math.sin(STAIR_DIR) * (HILL.r + 1), z: HILL.z + Math.cos(STAIR_DIR) * (HILL.r + 1) },
  { name: '썰매 길 출발', x: LANE.start.x, z: LANE.start.z },
  { name: '모닥불', x: CAMPFIRE.x, z: CAMPFIRE.z },
];
document.querySelector('#sites').innerHTML = '<tr><th>곳</th><th>트리에서</th><th>들어와서</th><th>가까운 곳</th></tr>' + sites.map((s) => {
  const near = sites.filter((o) => o !== s).map((o) => ({ o, d: Math.hypot(o.x - s.x, o.z - s.z) })).sort((a, b) => a.d - b.d)[0];
  return `<tr><td><b>${s.name}</b></td><td>${side(s.x, s.z)} · ${walkTime(Math.hypot(s.x, s.z))}</td><td>${walkTime(Math.hypot(s.x - START.x, s.z - START.z))}</td><td>${near.o.name} · ${walkTime(near.d)}</td></tr>`;
}).join('');

// ---------- 움직이는 것들: 1초마다 다시 그린다 ----------
/** 이 기기에 저장된 내 펭귄의 자리와 발자국 */
function saved() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && [s.x, s.z, s.yaw].every(Number.isFinite) ? s : null;
  } catch { return null; }
}

function draw() {
  const now = clock.now();
  live.replaceChildren();

  // 내 펭귄 (이 기기에서 걸은 적이 있을 때만)
  const me = saved();
  document.querySelector('#legend-me').hidden = !me;
  if (me) {
    const prints = me.tracks && Array.isArray(me.tracks.prints) ? me.tracks.prints : [];
    const dots = el('g', { 'data-kind': 'prints' });
    for (const p of prints) { const a = printAlpha(p[3], now); if (a > 0.03) dots.append(el('circle', { cx: p[0], cy: p[1], r: 0.45, fill: '#8f9ccf', opacity: r1(a) })); }
    live.append(dots, el('circle', { 'data-kind': 'me', cx: me.x, cy: me.z, r: 2.1, fill: '#2f66c0', stroke: '#fff', 'stroke-width': 0.6 }),
      el('path', { d: `M${me.x + Math.sin(me.yaw) * 4.4} ${me.z + Math.cos(me.yaw) * 4.4} L${me.x + Math.sin(me.yaw + 2.5) * 2} ${me.z + Math.cos(me.yaw + 2.5) * 2} L${me.x + Math.sin(me.yaw - 2.5) * 2} ${me.z + Math.cos(me.yaw - 2.5) * 2} Z`, fill: '#2f66c0' }));
  }

  // 여우: 지나온 길(발자국이 남아 있는 동안)과 앞으로 6분 동안 갈 길
  const path = (from, to) => { let d = ''; for (let t = from; t <= to; t += 4000) { const f = foxAt(t); d += (d ? ' L' : 'M') + r1(f.x) + ' ' + r1(f.z); } return d; };
  const fox = foxAt(now);
  live.append(
    el('path', { 'data-kind': 'fox-ahead', d: path(now, now + 6 * 60e3), fill: 'none', stroke: '#e8853b', 'stroke-width': 0.7, 'stroke-dasharray': '1.2 2.2', opacity: 0.55 }),
    el('path', { 'data-kind': 'fox-trail', d: path(now - PAW_LIFE_MS, now), fill: 'none', stroke: '#e8853b', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85 }),
    el('circle', { 'data-kind': 'fox', cx: fox.x, cy: fox.z, r: 2.6, fill: '#e8853b', stroke: '#fff', 'stroke-width': 0.7 }),
    el('circle', { cx: fox.x - Math.sin(fox.yaw) * 3.4, cy: fox.z - Math.cos(fox.yaw) * 3.4, r: 1.3, fill: '#fbf1e0', stroke: '#e8853b', 'stroke-width': 0.5 }),      // 꼬리 끝
    label(fox.x, fox.z - 5, '여우', 4.6),
  );

  // 썰매: 다음에(또는 지금) 지나가는 하늘 쪽을 들판 바깥에 호로 그린다
  const flying = passAt(now), pass = flying || nextPass(now);
  if (pass) {
    const R = FIELD_RADIUS + 9, a0 = pass.azimuth, a1 = pass.azimuth + pass.dir * SWEEP, pt = (a) => `${r1(Math.sin(a) * R)} ${r1(Math.cos(a) * R)}`;
    // 지도는 위에서 내려다본 것이라 방위가 늘어나는 쪽이 시계 반대 방향으로 보인다
    live.append(el('path', { 'data-kind': 'santa', d: `M${pt(a0)} A${R} ${R} 0 0 ${pass.dir > 0 ? 0 : 1} ${pt(a1)}`, fill: 'none', stroke: flying ? '#d0312d' : '#c9a25a', 'stroke-width': flying ? 1.6 : 1, 'stroke-linecap': 'round', 'stroke-dasharray': flying ? 'none' : '3 3' }),
      el('circle', { cx: Math.sin(a1) * R, cy: Math.cos(a1) * R, r: 1.8, fill: flying ? '#d0312d' : '#c9a25a' }));
    if (flying) { const a = a0 + pass.dir * SWEEP * flying.p; live.append(el('circle', { cx: Math.sin(a) * R, cy: Math.cos(a) * R, r: 2.6, fill: '#ff5a43', stroke: '#fff', 'stroke-width': 0.6 })); }
  }

  // 지금의 소식
  const doing = fox.resting ? (fox.sit > 0.5 ? '앉아서 쉬는 중' : '멈춰 서서 둘러보는 중') : fox.speed > 1.6 ? '종종걸음으로 가는 중' : '걷는 중';
  const tonight = pass ? passesOf(pass.night) : [];
  const rows = [
    ['시각', clockText(now) + ' (한국 시간)'],
    ['눈', (stormPhase(now) === 'calm' ? '평소처럼 내려요. ' : '') + stormText(now)],
    ['여우', `${doing} · 트리의 ${side(fox.x, fox.z)}, 걸어서 ${walkTime(Math.hypot(fox.x, fox.z))} 거리`],
    ['썰매', flying ? '지금 하늘을 지나가는 중이에요' : pass ? `다음은 ${hhmm(pass.start)} (${Math.max(1, Math.round((pass.start - now) / 60e3))}분 뒤), ${Math.round(PASS_MS / 1000)}초 동안. 이 밤의 세 번: ${tonight.map((p) => hhmm(p.start)).join(' · ')}` : '-'],
  ];
  if (me) rows.push(['내 펭귄', `트리의 ${side(me.x, me.z)}, 걸어서 ${walkTime(Math.hypot(me.x, me.z))} 거리 (이 기기에 저장된 마지막 자리)`]);
  document.querySelector('#now').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

draw();
setInterval(draw, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });

// 점검용
window.__map = { clock, draw, sites, get fox() { return foxAt(clock.now()); } };
