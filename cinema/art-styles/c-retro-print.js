// art.js — INKED RETRO PRINT art kit for a tiny online neighbourhood cinema.
// Every export is a pure function returning an SVG markup string (or plain data).
// No raster images, no external assets, no web fonts, no SVG filters.
// Look: bold wobbly ink-navy outlines, flat fills from five "risograph inks",
// colour plates printed slightly off-register (cream paper peeks out on the
// top-left edges), neon glow built from stacked translucent strokes.

// ───────────────────────── palette ─────────────────────────
export const PALETTE = {
  ink: '#1B2040',     // ink navy (all outlines)
  tomato: '#E5503B',  // tomato red
  mustard: '#F1B531', // mustard
  cream: '#F6ECD8',   // off-white paper
  teal: '#2A9C92',    // teal
};
const INK = PALETTE.ink, TOM = PALETTE.tomato, MUS = PALETTE.mustard, CRM = PALETTE.cream, TEA = PALETTE.teal;

// Overprints and screens of the same five inks (ink over ink, or a lighter tint).
export const TONES = {
  night: '#12162E',    // ink + ink
  navy: '#262D5A',     // ink, screened
  navyLite: '#39437C', // ink, lighter screen
  maroon: '#84303A',   // tomato x ink
  brick: '#C4432F',    // tomato + light ink screen
  carpet: '#CB452F',   // tomato, slightly dulled (floor)
  deepTeal: '#1C5E66', // teal x ink
  mint: '#A3D6CB',     // teal, screened
  salmon: '#F29C87',   // tomato, screened
  butter: '#F9DE96',   // mustard, screened
  amber: '#E09A28',    // mustard x tomato screen
};
const NIGHT = TONES.night, NAVY = TONES.navy, NAVY2 = TONES.navyLite, MAROON = TONES.maroon, BRICK = TONES.brick,
  DTEAL = TONES.deepTeal, MINT = TONES.mint, SALMON = TONES.salmon, BUTTER = TONES.butter, AMBER = TONES.amber;

export const HAIR_COLORS = ['#2A3162', '#6E3530', '#E5503B', '#F1B531', '#2A9C92', '#EFE3CC'];
export const OUTFIT_COLORS = ['#E5503B', '#F1B531', '#2A9C92', '#F6ECD8', '#39437C', '#F29C87', '#A3D6CB', '#84303A'];
export const SKIN_TONES = ['#FBE2C4', '#F3C79C', '#D99B6C', '#A3683F'];

export const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";

// ───────────────────────── tiny geometry kit ─────────────────────────
const n1 = (v) => Math.round(v * 10) / 10;
function rng(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// wobbly polyline / polygon: jittered corners, slightly bowed edges
function wob(pts, seed = 1, amp = 0.8, close = true) {
  const R = rng(seed);
  const P = pts.map(([x, y]) => [x + (R() - 0.5) * amp, y + (R() - 0.5) * amp]);
  const n = P.length;
  let d = `M${n1(P[0][0])} ${n1(P[0][1])}`;
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const a = P[i], b = P[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const k = (R() - 0.5) * 2 * amp * Math.min(1.8, len / 40 + 0.35);
    d += `Q${n1((a[0] + b[0]) / 2 - (dy / len) * k)} ${n1((a[1] + b[1]) / 2 + (dx / len) * k)} ${n1(b[0])} ${n1(b[1])}`;
  }
  return d + (close ? 'Z' : '');
}
// wobbly rectangle, optional rounded corners
function wrect(x, y, w, h, seed = 1, amp = 0.8, r = 0) {
  const R = rng(seed), j = () => (R() - 0.5) * amp;
  const ax = x + j(), ay = y + j(), bx = x + w + j(), by = y + j(), cx = x + w + j(), cy = y + h + j(), dx = x + j(), dy = y + h + j();
  const m = (p, q, o) => n1((p + q) / 2 + o);
  if (!r) {
    return `M${n1(ax)} ${n1(ay)}Q${m(ax, bx, 0)} ${m(ay, by, j() * 1.4)} ${n1(bx)} ${n1(by)}Q${m(bx, cx, j() * 1.4)} ${m(by, cy, 0)} ${n1(cx)} ${n1(cy)}Q${m(cx, dx, 0)} ${m(cy, dy, j() * 1.4)} ${n1(dx)} ${n1(dy)}Q${m(dx, ax, j() * 1.4)} ${m(dy, ay, 0)} ${n1(ax)} ${n1(ay)}Z`;
  }
  return `M${n1(ax + r)} ${n1(ay)}Q${m(ax, bx, 0)} ${m(ay, by, j() * 1.4)} ${n1(bx - r)} ${n1(by)}Q${n1(bx)} ${n1(by)} ${n1(bx)} ${n1(by + r)}` +
    `Q${m(bx, cx, j() * 1.4)} ${m(by, cy, 0)} ${n1(cx)} ${n1(cy - r)}Q${n1(cx)} ${n1(cy)} ${n1(cx - r)} ${n1(cy)}` +
    `Q${m(cx, dx, 0)} ${m(cy, dy, j() * 1.4)} ${n1(dx + r)} ${n1(dy)}Q${n1(dx)} ${n1(dy)} ${n1(dx)} ${n1(dy - r)}` +
    `Q${m(dx, ax, j() * 1.4)} ${m(dy, ay, 0)} ${n1(ax)} ${n1(ay + r)}Q${n1(ax)} ${n1(ay)} ${n1(ax + r)} ${n1(ay)}Z`;
}
// Catmull-Rom spline through points -> cubic beziers
function smooth(P, close = true) {
  const n = P.length, g = (i) => P[(i + n) % n];
  let d = `M${n1(P[0][0])} ${n1(P[0][1])}`;
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const p0 = close ? g(i - 1) : P[Math.max(0, i - 1)], p1 = g(i), p2 = g(i + 1), p3 = close ? g(i + 2) : P[Math.min(n - 1, i + 2)];
    d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return d + (close ? 'Z' : '');
}
// hand-drawn ellipse
function blob(cx, cy, rx, ry, seed = 1, amp = 0.5, n = 9) {
  const R = rng(seed), P = [], ph = R() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2, k = 1 + ((R() - 0.5) * 2 * amp) / Math.max(rx, ry);
    P.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smooth(P, true);
}
function circ(cx, cy, r) {
  return `M${n1(cx - r)} ${n1(cy)}a${r} ${r} 0 1 0 ${n1(2 * r)} 0a${r} ${r} 0 1 0 ${n1(-2 * r)} 0Z`;
}
function capsule(x1, y1, x2, y2, r) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * r, ny = (dx / L) * r;
  return `M${n1(x1 + nx)} ${n1(y1 + ny)}L${n1(x2 + nx)} ${n1(y2 + ny)}A${r} ${r} 0 0 0 ${n1(x2 - nx)} ${n1(y2 - ny)}L${n1(x1 - nx)} ${n1(y1 - ny)}A${r} ${r} 0 0 0 ${n1(x1 + nx)} ${n1(y1 + ny)}Z`;
}
function diamond(cx, cy, r, ry = r) {
  return `M${n1(cx)} ${n1(cy - ry)}L${n1(cx + r)} ${n1(cy)}L${n1(cx)} ${n1(cy + ry)}L${n1(cx - r)} ${n1(cy)}Z`;
}
function star4(cx, cy, r, k = 0.32) {
  const q = r * k;
  return `M${n1(cx)} ${n1(cy - r)}Q${n1(cx + q * 0.5)} ${n1(cy - q * 0.5)} ${n1(cx + r)} ${n1(cy)}Q${n1(cx + q * 0.5)} ${n1(cy + q * 0.5)} ${n1(cx)} ${n1(cy + r)}Q${n1(cx - q * 0.5)} ${n1(cy + q * 0.5)} ${n1(cx - r)} ${n1(cy)}Q${n1(cx - q * 0.5)} ${n1(cy - q * 0.5)} ${n1(cx)} ${n1(cy - r)}Z`;
}
function star5(cx, cy, R, r = R * 0.45, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, q = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${n1(cx + Math.cos(a) * q)} ${n1(cy + Math.sin(a) * q)}`;
  }
  return d + 'Z';
}
function leaf(x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * w, ny = (dx / L) * w, mx = x0 + dx * 0.45, my = y0 + dy * 0.45;
  return `M${n1(x0)} ${n1(y0)}Q${n1(mx + nx)} ${n1(my + ny)} ${n1(x1)} ${n1(y1)}Q${n1(mx - nx)} ${n1(my - ny)} ${n1(x0)} ${n1(y0)}Z`;
}

// hand tremor: nudge every coordinate pair of an absolute M/L/Q/C path (no arcs)
function wj(d, seed = 1, amp = 0.4) {
  const R = rng(seed);
  return d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, x, y) => `${n1(+x + (R() - 0.5) * 2 * amp)} ${n1(+y + (R() - 0.5) * 2 * amp)}`);
}

const STROKE = `fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"`;

// A "sheet" = one print pass group: cream paper under the shapes, colour plate
// shifted off-register, ink line plate on top, then registered extras.
function sheet({ mis = [1.3, 1], lw = 2, thinW = 1.1, paper = CRM, collect = null } = {}) {
  const P = [], F = [], L = [], T = [], X = [], U = [];
  const api = {
    s(d, fill, o = {}) {
      if (collect && o.paper !== false) collect.push(d);
      if (paper && o.paper !== false) P.push(d);
      if (fill) F.push(`<path d="${d}" fill="${fill}"${o.attr || ''}/>`);
      if (o.line !== false) (o.thin ? T : L).push(d);
      return api;
    },
    f(d, fill, attr = '') { F.push(`<path d="${d}" fill="${fill}"${attr}/>`); return api; },
    l(d) { L.push(d); return api; },
    t(d) { T.push(d); return api; },
    // opaque shape stacked in draw order (occludes the lines of what is below it)
    top(d, fill, o = {}) {
      if (collect) collect.push(d);
      X.push(`<path d="${d}" fill="${paper || fill}"/><path d="${d}" fill="${fill}" transform="translate(${mis[0]} ${mis[1]})"/><path d="${d}" ${STROKE} stroke-width="${o.thin ? thinW : lw}"/>`);
      return api;
    },
    u(s) { U.push(s); return api; }, // under everything (glows)
    x(s) { X.push(s); return api; }, // over everything, registered
    out() {
      return U.join('') +
        (P.length ? `<path d="${P.join('')}" fill="${paper}"/>` : '') +
        (F.length ? `<g transform="translate(${mis[0]} ${mis[1]})">${F.join('')}</g>` : '') +
        (L.length ? `<path d="${L.join('')}" ${STROKE} stroke-width="${lw}"/>` : '') +
        (T.length ? `<path d="${T.join('')}" ${STROKE} stroke-width="${thinW}"/>` : '') +
        X.join('');
    },
  };
  return api;
}
// neon / lamp glow as stacked translucent strokes (no blur)
function glow(d, color, w = [9, 5], op = [0.16, 0.34]) {
  return w.map((ww, i) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${ww}" stroke-linejoin="round" stroke-linecap="round" opacity="${op[i]}"/>`).join('');
}
function label(s, x, y, size, fill, extra = '', weight = 800) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="middle" fill="${fill}" font-family="${FONT}"${extra}>${s}</text>`;
}
function neonText(s, x, y, size, color, ls = 0, core = CRM) {
  const base = `x="${x}" y="${y}" font-size="${size}" font-weight="900" text-anchor="middle" font-family="${FONT}" letter-spacing="${ls}" stroke-linejoin="round"`;
  return `<text ${base} fill="none" stroke="${color}" stroke-width="${n1(size * 0.42)}" opacity=".15">${s}</text>` +
    `<text ${base} fill="none" stroke="${color}" stroke-width="${n1(size * 0.22)}" opacity=".38">${s}</text>` +
    `<text ${base} fill="${core}" stroke="${color}" stroke-width="${n1(size * 0.05)}">${s}</text>`;
}
// stripes on a tapering shape; top/bottom are functions t(0..1) -> [x, y]
function stripes(top, bot, n, odd = 0, curve = true) {
  let d = '';
  for (let i = odd; i < n; i += 2) {
    const a = i / n, b = (i + 1) / n, m = (a + b) / 2;
    const [ax, ay] = top(a), [bx, by] = top(b), [cx, cy] = bot(b), [dx, dy] = bot(a);
    if (curve) {
      const [tx, ty] = top(m), [ux, uy] = bot(m);
      d += `M${n1(ax)} ${n1(ay)}L${n1(tx)} ${n1(ty)}L${n1(bx)} ${n1(by)}L${n1(cx)} ${n1(cy)}L${n1(ux)} ${n1(uy)}L${n1(dx)} ${n1(dy)}Z`;
    } else d += `M${n1(ax)} ${n1(ay)}L${n1(bx)} ${n1(by)}L${n1(cx)} ${n1(cy)}L${n1(dx)} ${n1(dy)}Z`;
  }
  return d;
}
const pick = (v, arr) => (typeof v === 'number' ? arr[((Math.round(v) % arr.length) + arr.length) % arr.length] : v || arr[0]);

// ───────────────────────── characters ─────────────────────────
const AV_MIS = [1.1, 0.9];
const HEAD = wj('M9 21.6C8.6 12.6 15 6.8 24 6.8C33.2 6.8 39.5 12.4 39 21.6C38.6 29.8 32.6 34.3 24 34.3C15.2 34.3 9.4 30 9 21.6Z', 301, 0.45);
const BODY = wj('M16.6 37.4Q16.8 34.6 20 34.4L28 34.4Q31.2 34.6 31.4 37.4L32.8 47.6Q33 50.6 29.6 50.8L18.4 50.8Q15 50.6 15.2 47.6Z', 302, 0.4);
const SHINE = 'M12.4 13.8Q14.4 8.8 20 7.3Q15.6 10 14.4 14.2Z';
const HEAD_SHADE = 'M34.4 8.8Q40.6 14.6 39.4 24.4Q38.4 30.4 33.4 33.4Q37 27.4 36.8 20.4Q36.6 13.4 34.4 8.8Z';
const BODY_SHADE = 'M27.8 34.4L29 34.4Q31.2 34.6 31.4 37.4L32.8 47.6Q33 50.6 29.6 50.8L27.4 50.8Q28.8 42.4 27.8 34.4Z';
const HAIR = {
  bobF: wj('M7.6 23C6.6 11.5 13.5 4.6 24 4.6C34.6 4.6 41.4 11.4 40.4 23L40.3 28.8Q38.6 31 36.9 28.4L36.6 18.6Q33.4 15.6 30.4 18.4Q27.4 15.4 24.2 18Q20.6 15.4 17.6 18.4Q14.6 15.8 11.4 18.6L11.1 28.4Q9.4 31 7.7 28.8Z', 311, 0.3),
  bobB: wj('M7.6 23C6.6 11.5 13.5 4.6 24 4.6C34.6 4.6 41.4 11.4 40.4 23L40.7 31.2Q32.4 35.8 24 35.4Q15.6 35.8 7.3 31.2Z', 312, 0.35),
  tufF: wj('M9.1 19.4C7.9 10 14.5 4.8 24 4.8C33.5 4.8 40.1 10 38.9 19.4L36 14.4L33.2 18.2L29.6 13.6L26 17.8L22 13.2L18.4 17.4L14.6 13.8L11.6 17.6Z', 313, 0.35),
  tufB: wj('M9.2 22C7.6 11 14.5 4.8 24 4.8C33.5 4.8 40.4 11 38.8 22Q38.6 26.6 36.4 29L33.4 27.2L30.4 30.4L27.2 27.8L24 30.8L20.8 27.8L17.6 30.4L14.6 27.2L11.6 29Q9.4 26.6 9.2 22Z', 314, 0.35),
  sprout: 'M22.4 5.6Q20.4 0.9 26.8 1.5Q24.6 3.1 25.8 5.6Z',
  bunF: wj('M8.6 21.6C7.8 11 14.8 5 24 5C33.2 5 40.2 11 39.4 21.6Q32 19 24.6 10.6Q16 19 8.6 21.6Z', 315, 0.35),
  bunB: wj('M8.6 22C7.8 11 14.8 5 24 5C33.2 5 40.2 11 39.4 22Q39.2 28.4 35.4 31.4Q30 33.6 24 33.4Q18 33.6 12.6 31.4Q8.8 28.4 8.6 22Z', 316, 0.35),
  capDome: wj('M8.4 15C8.4 6.8 15 3.4 24 3.4C33 3.4 39.6 6.8 39.6 15Z', 317, 0.3),
  capNape: wj('M9 17Q8.4 26 12 30Q18 33.2 24 33Q30 33.2 36 30Q39.6 26 39 17Z', 318, 0.3),
};
const blush = (cx, cy) => circ(cx, cy, 2.35);

function heldItem(S, kind, x, y) {
  // (x, y) = top-left of a 10 x 10 cup body
  if (kind === 'popcorn') {
    S.s(blob(x + 1.9, y - 0.5, 2.3, 2.1, 31, 0.5, 6), BUTTER);
    S.s(blob(x + 8.1, y - 0.5, 2.3, 2.1, 33, 0.5, 6), BUTTER);
    S.top(blob(x + 5, y - 1.9, 2.6, 2.3, 32, 0.5, 6), BUTTER);
    const cup = `M${n1(x - 0.4)} ${y}L${n1(x + 10.4)} ${y}L${n1(x + 8.8)} ${y + 10}L${n1(x + 1.2)} ${y + 10}Z`;
    S.x(`<path d="${cup}" fill="${CRM}"/><path d="${stripes((t) => [x - 0.4 + 10.8 * t, y], (t) => [x + 1.2 + 7.6 * t, y + 10], 5, 0, false)}" fill="${TOM}"/><path d="${cup}" ${STROKE} stroke-width="1.7"/>`);
  } else {
    S.t(`M${n1(x + 5.6)} ${y}L${n1(x + 7.4)} ${n1(y - 5.2)}L${n1(x + 9.4)} ${n1(y - 5.6)}`);
    S.s(`M${n1(x + 0.8)} ${n1(y + 1.6)}L${n1(x + 9.2)} ${n1(y + 1.6)}L${n1(x + 8.2)} ${y + 10}L${n1(x + 1.8)} ${y + 10}Z`, CRM);
    S.f(`M${n1(x + 1.1)} ${n1(y + 4.2)}L${n1(x + 8.9)} ${n1(y + 4.2)}L${n1(x + 8.5)} ${n1(y + 7.6)}L${n1(x + 1.5)} ${n1(y + 7.6)}Z`, TEA);
    S.top(`M${n1(x)} ${y}h10v1.9h-10z`, TOM);
  }
}

function figure(o) {
  const { view, hair, hairC, outfitC, skinC, holding, mood, staff, shadow, outfitStyle = 0 } = o;
  const back = view === 'back', happy = mood === 'happy';
  const SIL = [];
  const opts = { mis: AV_MIS, lw: 1.9, thinW: 1, collect: SIL };
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const trouser = same(outfitC, NAVY2) ? MAROON : NAVY2;
  const sleeve = staff === 'clerk' ? CRM : outfitC;
  const accent = [TOM, TEA, MUS].find((c) => !same(c, outfitC) && !same(c, hairC)) || TOM;
  const style = ((hair % 4) + 4) % 4;
  let out = '';

  // limbs, ears, buns (everything that tucks behind torso / head)
  const A = sheet(opts);
  A.s('M17.3 48.4L17.2 55.4L21.7 55.4L21.7 48.4Z', trouser).s('M26.3 48.4L26.3 55.4L30.8 55.4L30.7 48.4Z', trouser);
  A.s(blob(18.9, 56.1, 3.9, 2.2, 5, 0.3, 7), INK).s(blob(29.1, 56.1, 3.9, 2.2, 6, 0.3, 7), INK);
  const arm = (side, pose) => {
    const X = (dx) => 24 + side * dx;
    if (pose === 'up') { A.s(capsule(X(8.3), 38.2, X(13.4), 33.2, 2.3), sleeve).s(circ(X(14.5), 31.9, 2.3), skinC); }
    else if (pose === 'idle') { A.s(capsule(X(8.3), 38.6, X(10.8), 45.4, 2.3), sleeve).s(circ(X(11.1), 47, 2.3), skinC); }
    else if (pose === 'holdFront') { A.s(capsule(X(8), 38.8, X(10.6), 43.4, 2.3), sleeve); }
    else if (pose === 'holdBack') { A.s(capsule(X(8.3), 38.4, X(13.6), 36, 2.3), sleeve); }
  };
  arm(-1, happy ? 'up' : 'idle');
  arm(1, holding ? (back ? 'holdBack' : 'holdFront') : happy ? 'up' : 'idle');
  A.s(circ(9.4, 23.8, 2.5), skinC).s(circ(38.6, 23.8, 2.5), skinC);
  if (style === 2) A.s(blob(11.2, 7.4, 5.1, 4.8, 41, 0.6, 8), hairC).s(blob(36.8, 7.4, 5.1, 4.8, 42, 0.6, 8), hairC);
  out += A.out();

  // torso
  const B = sheet(opts);
  B.s(BODY, staff === 'clerk' ? CRM : outfitC);
  const bow = (c) => B.s('M24 36.5L20.6 34.5L20.6 38.5ZM24 36.5L27.4 34.5L27.4 38.5Z', c, { thin: true });
  if (staff === 'clerk') {
    if (!back) {
      B.s('M18.8 39.6L29.2 39.6L30.2 50.8L17.8 50.8Z', TOM).t('M19.6 39.6L18.6 35M28.4 39.6L29.4 35');
      B.f('M21.4 43.4L26.6 43.4L26.8 46.6L21.2 46.6Z', CRM);
      bow(MUS);
    } else B.t('M17 44.4Q24 46.4 31 44.4').f('M22.4 44.6l1.6 3.4l1.6-3.4z', TOM);
  } else if (staff === 'usher') {
    if (!back) {
      B.f('M21.4 34.6L26.6 34.6L25.4 50.6L22.6 50.6Z', CRM).t('M21.4 34.6L22.6 50.6M26.6 34.6L25.4 50.6');
      B.f(circ(19.4, 41, 0.9) + circ(19.2, 45.4, 0.9) + circ(28.6, 41, 0.9) + circ(28.8, 45.4, 0.9), MUS);
      bow(TOM);
    } else B.t('M19 35.6Q24 38.2 29 35.6');
    B.f('M15.6 36.2L18.6 35L19.2 36.6L16.2 38Z M32.4 36.2L29.4 35L28.8 36.6L31.8 38Z', MUS);
  } else {
    const trim = same(outfitC, CRM) ? TOM : CRM;
    if (outfitStyle === 1) { // striped tee
      B.f('M15.9 39.6L32.1 39.6L32.4 42.2L15.6 42.2Z M15.3 44.8L32.7 44.8L32.9 47.4L15.1 47.4Z', trim);
      B.t(back ? 'M19.4 35.4Q24 37.6 28.6 35.4' : 'M20.4 34.8Q24 37.8 27.6 34.8');
    } else if (outfitStyle === 2) { // hoodie
      B.t(back ? 'M18.4 35.4Q24 41.4 29.6 35.4' : 'M19.6 44.8L28.4 44.8L29.4 50.2M19.6 44.8L18.6 50.2M22.4 35L22.2 39.8M25.6 35L25.8 39.8');
      if (!back) B.f('M20.6 34.5L24 37L27.4 34.5Z', INK, ' opacity=".3"');
    } else if (outfitStyle === 3) { // scarf
      B.s('M17 34.2Q24 38.6 31 34.2L31.4 37.6Q24 42 16.6 37.6Z', accent, { thin: true });
      if (!back) B.s('M26.4 39L30 37.8L31 44.6L27.8 45.2Z', accent, { thin: true });
    } else { // cardigan
      if (!back) { B.f('M21 34.5L24 38L27 34.5Z', trim).t('M21 34.5L24 38L27 34.5M24 38L24 50.6'); B.f(circ(25.8, 42, 0.85) + circ(25.8, 46, 0.85), INK, ' opacity=".6"'); }
      else B.t('M19 35.6Q24 38.4 29 35.6');
    }
  }
  B.f(BODY_SHADE, INK, ' opacity=".16"');
  out += B.out();

  // head
  const H = sheet(opts);
  H.s(HEAD, skinC);
  if (!back) {
    H.f(blush(13.2, 27.7) + blush(34.2, 27.7), TOM, ' opacity=".5"');
    if (happy) {
      H.x(`<path d="M15.5 24.8Q17.6 21.4 19.7 24.8M28.3 24.8Q30.4 21.4 32.5 24.8" ${STROKE} stroke-width="1.6"/>`);
      H.x(`<path d="M20.8 27.2Q24 32 27.2 27.2Z" fill="${MAROON}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`);
    } else {
      H.x(`<ellipse cx="17.6" cy="23.8" rx="1.7" ry="2.05" fill="${INK}"/><ellipse cx="30.4" cy="23.8" rx="1.7" ry="2.05" fill="${INK}"/>`);
      H.x(`<path d="M22.2 27.9Q24 29.5 25.8 27.9" ${STROKE} stroke-width="1.2"/>`);
    }
  }
  out += '<g class="av-head">' + H.out();

  // hair / hat
  const K = sheet(opts);
  if (style === 0) { // bob with a fringe
    if (back) K.s(HAIR.bobB, hairC).t('M24 5.4Q23.2 12 24.2 19');
    else K.s(HAIR.bobF, hairC).t('M24.4 5.2Q22.8 9 24.2 12.6');
  } else if (style === 1) { // short tousled, with a sprout
    if (!staff) K.s(HAIR.sprout, hairC);
    K.s(back ? HAIR.tufB : HAIR.tufF, hairC);
  } else if (style === 2) { // twin buns
    if (back) K.s(HAIR.bunB, hairC).t('M24 5.6Q23.2 12 24.2 20');
    else K.s(HAIR.bunF, hairC);
  } else { // beanie
    if (back) K.s(HAIR.capNape, hairC);
    else K.s('M9 18L8.3 26.6Q10.6 28 12.2 24.6L12.6 18Z', hairC).s('M39 18L39.7 26.6Q37.4 28 35.8 24.6L35.4 18Z', hairC);
    K.s(HAIR.capDome, accent);
  }
  K.f(SHINE, CRM, ' opacity=".55"').f(HEAD_SHADE, INK, ' opacity=".16"');
  if (style === 3) {
    K.top(wrect(7, 13.2, 34, 6.2, 44, 0.4, 2.6), CRM);
    K.x(`<path d="M13 14.8L13 17.8M18.6 14.6L18.6 18M24 14.6L24 18M29.4 14.6L29.4 18M35 14.8L35 17.8" ${STROKE} stroke-width="1"/>`);
    K.top(blob(24, 3.4, 3.4, 3, 43, 0.5, 7), CRM);
  }
  if (staff === 'clerk') { // paper soda-jerk cap
    const cap = 'M11.4 10L13.2 2.6Q24 0.8 34.8 2.6L36.6 10Q30 7.8 24 7.9Q18 7.8 11.4 10Z';
    K.x(`<path d="${cap}" fill="${CRM}"/><path d="M12 7.4Q24 4.6 36 7.4L36.6 10Q30 7.8 24 7.9Q18 7.8 11.4 10Z" fill="${TOM}"/><path d="${cap}M12.2 7.2Q24 4.4 35.8 7.2" ${STROKE} stroke-width="1.5"/>`);
  } else if (staff === 'usher') { // pillbox cap
    const cap = wrect(13.4, 1.6, 21.2, 8.4, 45, 0.4, 2.4);
    K.x(`<path d="${cap}" fill="${TOM}"/><path d="M13.6 6.4L34.4 6.4L34.4 9.6L13.6 9.6Z" fill="${MUS}"/><path d="${cap}M13.8 6.4L34.2 6.4" ${STROKE} stroke-width="1.6"/><circle cx="24" cy="3.9" r="1.1" fill="${MUS}"/>`);
  }
  out += K.out() + '</g>';

  // held snack (in front)
  if (holding) {
    const D = sheet(opts);
    if (back) { heldItem(D, holding, 36.6, 27.6); D.top(circ(38.2, 36.2, 2.2), skinC); }
    else { heldItem(D, holding, 33.2, 36.8); D.top(circ(34.6, 44.6, 2.2), skinC); }
    out += D.out();
  }
  // off-register highlight plate: a sliver of light along the top-left of the whole silhouette
  const rim = `<path d="${SIL.join('')}" fill="${back ? BUTTER : CRM}" stroke="${back ? BUTTER : CRM}" stroke-width="1.6" stroke-linejoin="round" transform="translate(-0.9 -1.1)"/>`;
  return (shadow ? `<ellipse cx="24" cy="57.3" rx="11.5" ry="2.5" fill="${INK}" opacity=".3"/>` : '') + rim + out;
}

/**
 * avatarSVG({ view, hair, hairColor, outfit, skin, holding, mood, outfitStyle, shadow })
 * view 'front' | 'back'; hair 0..3 (0 bob, 1 tousled, 2 twin buns, 3 beanie);
 * hairColor / outfit / skin: palette index (number) or any hex string;
 * holding null | 'popcorn' | 'drink'; mood 'idle' | 'happy';
 * outfitStyle 0 cardigan | 1 striped tee | 2 hoodie | 3 scarf (default: derived from the outfit index);
 * shadow: ground shadow (default true for front, false for back).
 * viewBox 0 0 48 60, feet at (24, 58).
 */
export function avatarSVG({ view = 'front', hair = 0, hairColor = 0, outfit = 0, skin = 0, holding = null, mood = 'idle', outfitStyle, shadow } = {}) {
  const outfitC = pick(outfit, OUTFIT_COLORS);
  const idx = OUTFIT_COLORS.findIndex((c) => c.toLowerCase() === String(outfitC).toLowerCase());
  const inner = figure({
    view, hair, hairC: pick(hairColor, HAIR_COLORS), outfitC, skinC: pick(skin, SKIN_TONES),
    holding, mood, outfitStyle: outfitStyle === undefined ? [0, 1, 2, 3, 0, 3, 1, 2][Math.max(0, idx)] : ((outfitStyle % 4) + 4) % 4,
    shadow: shadow === undefined ? view !== 'back' : shadow,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 60" class="avatar avatar-${view}">${inner}</svg>`;
}

/** npcSVG(kind, { view, mood }) : kind 'clerk' | 'usher'. viewBox 0 0 48 60. */
export function npcSVG(kind = 'clerk', { view = 'front', mood = 'idle' } = {}) {
  const inner = kind === 'usher'
    ? figure({ view, hair: 1, hairC: HAIR_COLORS[0], outfitC: TEA, skinC: SKIN_TONES[1], holding: null, mood, staff: 'usher', shadow: true })
    : figure({ view, hair: 0, hairC: HAIR_COLORS[1], outfitC: TOM, skinC: SKIN_TONES[0], holding: null, mood, staff: 'clerk', shadow: false });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 60" class="avatar npc npc-${kind}">${inner}</svg>`;
}

// ───────────────────────── popcorn ─────────────────────────
const POP = {
  butter: { kernel: '#FBE9B0', spot: MUS, stripe: TOM },
  caramel: { kernel: '#C97B33', spot: '#8A4A22', stripe: TEA },
  cheese: { kernel: '#F5A62B', spot: TOM, stripe: NAVY2 },
};
// one popped kernel = three fused puffs
function puff(x, y, r, seed) {
  const R = rng(seed), a0 = R() * 6.28;
  let d = '';
  for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094 + (R() - 0.5) * 0.5; d += circ(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, n1(r * (0.6 + R() * 0.1))); }
  return d;
}
/** popcornSVG({ kind, level }) : kind 'butter' | 'caramel' | 'cheese'; level 0..1. viewBox 0 0 40 48. */
export function popcornSVG({ kind = 'butter', level = 1 } = {}) {
  const k = POP[kind] || POP.butter, L = Math.max(0, Math.min(1, level));
  const top = (t) => [5.6 + 28.8 * t, 20 + 10.8 * t * (1 - t)], bot = (t) => [9.4 + 21.2 * t, 43.2 + 6.4 * t * (1 - t)];
  const S0 = sheet({ mis: AV_MIS, lw: 1.9, thinW: 1 });
  S0.s('M5.6 20Q20 13.4 34.4 20Q20 26 5.6 20Z', MAROON);
  const shift = (1 - L) * 15;
  // back rows first so the front kernels overlap them
  const K = [[15.6, 8, 4.6], [21.4, 7, 4.8], [26.6, 8.4, 4.4],
    [11.8, 13, 4.8], [18, 12.4, 5], [24.4, 12.6, 4.9], [29.4, 13.4, 4.6],
    [9.4, 18.2, 4.5], [15, 18.8, 4.7], [20.8, 19, 4.8], [26.4, 18.8, 4.7], [31.2, 18.2, 4.4]];
  let heap = '';
  K.forEach(([x, y, r], i) => {
    const yy = y + shift;
    if (yy > 21.8) return;
    const d = puff(x, yy, r, 70 + i);
    heap += `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="${d}" fill="${k.kernel}"/>` +
      `<path d="${circ(x + 1, yy + 1.1, n1(r * 0.3))}" fill="${k.spot}" opacity=".6"/><path d="${circ(x - 1.4, yy - 1.5, n1(r * 0.22))}" fill="${CRM}" opacity=".85"/>`;
  });
  const S2 = sheet({ mis: AV_MIS, lw: 1.9, thinW: 1 });
  S2.s('M5.6 20Q20 25.4 34.4 20L30.6 43.2Q20 46.4 9.4 43.2Z', CRM);
  S2.f(stripes(top, bot, 7, 0), k.stripe);
  S2.f('M27.4 23.6L34 21L30.4 43.2L25.6 44.6Q27.6 34 27.4 23.6Z', INK, ' opacity=".14"');
  S2.top('M5.6 20Q20 25.4 34.4 20L34 22.9Q20 28.3 6 22.9Z', CRM, { thin: true }); // rim lip
  S2.top(blob(20, 35.4, 6.4, 5.6, 81, 0.4, 8), CRM, { thin: true });              // label
  if (kind === 'caramel') S2.x(`<path d="M20 31.6Q23.4 35.8 20 38.8Q16.6 35.8 20 31.6Z" fill="#C97B33"/>`);
  else if (kind === 'cheese') S2.x(`<path d="M16 37.8L24.4 37.8L22.6 32.8Z" fill="#F5A62B"/><path d="${circ(20, 36.4, 0.8)}${circ(22.4, 35.2, 0.6)}" fill="${CRM}"/>`);
  else S2.x(`<path d="M16.4 33.4L23.6 33.4L23.6 38L16.4 38Z" fill="${MUS}"/><path d="M16.4 33.4L23.6 33.4L23.6 34.8L16.4 34.8Z" fill="${BUTTER}"/>`);
  let crumbs = '';
  if (L === 0) crumbs = `<path d="${blob(20, 21, 1.8, 1.4, 90, 0.4, 6)}${blob(14.6, 20.4, 1.3, 1.1, 91, 0.3, 6)}" fill="${k.kernel}" stroke="${INK}" stroke-width=".9"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" class="popcorn popcorn-${kind}">${S0.out()}${crumbs}${heap}${S2.out()}</svg>`;
}

// ───────────────────────── seat ─────────────────────────
const SEAT = {
  empty: { main: TOM, panel: BRICK, plate: MUS, arm: DTEAL },
  taken: { main: MAROON, panel: '#6E2733', plate: '#C7922C', arm: '#17474F' },
  mine: { main: MUS, panel: AMBER, plate: CRM, arm: DTEAL },
};
const SEAT_BACK = 'M5 37.6L5 11.2Q5 2.5 13.6 2.3L30.4 2.3Q39 2.5 39 11.2L39 37.6Z';
function seatInner(state = 'empty') {
  const c = SEAT[state] || SEAT.empty;
  const S = sheet({ mis: [0.9, 0.7], lw: 1.9, thinW: 1 });
  if (state === 'mine') S.u(glow(SEAT_BACK, MUS, [8, 4.6], [0.2, 0.42]));
  S.s(wrect(0.8, 21, 5, 10.6, 51, 0.3, 1.6), c.arm).s(wrect(38.2, 21, 5, 10.6, 52, 0.3, 1.6), c.arm);
  S.s(SEAT_BACK, c.main);
  S.f('M9.6 37.6L9.6 13.6Q9.8 7.7 15.4 7.5L28.6 7.5Q34.2 7.7 34.4 13.6L34.4 37.6Z', c.panel);
  S.t('M9.6 37.2L9.6 13.6Q9.8 7.7 15.4 7.5L28.6 7.5Q34.2 7.7 34.4 13.6L34.4 37.2');
  S.f('M5 33.4L39 33.4L39 37.6L5 37.6Z', INK, ' opacity=".28"');
  S.s(wrect(18.2, 11, 7.6, 4.6, 53, 0.2, 1.2), c.plate, { thin: true, paper: false });
  S.f('M7.4 12Q7.8 5.6 14.2 4.6Q9.8 6.4 9.2 12.2Z', CRM, ' opacity=".5"');
  if (state === 'mine') S.x(`<path d="${star5(22, 24.6, 5.2)}" fill="${CRM}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`);
  return S.out();
}
/** seatSVG({ state }) : 'empty' | 'mine' | 'taken'. viewBox 0 0 44 40. Draw it IN FRONT of a seated back-view avatar. */
export function seatSVG({ state = 'empty' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 40" class="seat seat-${state}" overflow="visible">${seatInner(state)}</svg>`;
}

// ───────────────────────── hall ─────────────────────────
const HALL = { W: 390, H: 300, SW: 44, SH: 40, GAP: 2, AISLE: 46, PITCH: 70, HEAD: 28, TOP: 12, BOTTOM: 22 };
function hallLayout({ rows = 4, cols = 6 } = {}) {
  rows = Math.max(1, Math.min(8, rows | 0)); cols = Math.max(2, Math.min(12, cols | 0));
  const { W, H, SW, SH, GAP, AISLE, PITCH, HEAD, TOP, BOTTOM } = HALL;
  const left = Math.ceil(cols / 2), right = cols - left;
  const ps = (r) => (rows === 1 ? 1 : 0.84 + (0.16 * r) / (rows - 1)); // far rows are a little smaller
  const rowW = cols * SW + (cols - 2) * GAP + AISLE;
  let sumP = 0; for (let r = 0; r < rows - 1; r++) sumP += PITCH * ps(r);
  const avail = H - TOP - BOTTOM;
  const U = Math.min(1.3, (W - 68) / rowW, avail / (HEAD * ps(0) + sumP + SH));
  // spare height: open the row pitch up a little, then centre what is left
  const extra = avail - U * (HEAD * ps(0) + sumP + SH);
  const boost = rows > 1 ? Math.min(extra * 0.7, 0.4 * U * sumP) : 0;
  const pf = rows > 1 ? 1 + boost / (U * sumP) : 1;
  const aisleCx = W / 2 + ((left - right) * (SW + GAP) * U * 0.92) / 2; // straight aisle even with an odd column count
  const R = [];
  R.rowInfo = [];
  let y = TOP + HEAD * ps(0) * U + (extra - boost) * 0.4;
  for (let r = 0; r < rows; r++) {
    const s = ps(r) * U, sw = SW * s, gap = GAP * s, aisle = AISLE * s;
    const aisleX = aisleCx - aisle / 2, x0 = aisleX - left * sw - (left - 1) * gap;
    for (let c = 0; c < cols; c++) {
      const x = c < left ? x0 + c * (sw + gap) : aisleX + aisle + (c - left) * (sw + gap);
      R.push({ row: r, col: c, x: n1(x), y: n1(y), w: n1(sw), h: n1(SH * s), scale: +s.toFixed(3), label: String.fromCharCode(65 + r) + (c + 1) });
    }
    R.rowInfo.push({ y, s, x0, aisleX, aisle, right: aisleX + aisle + right * sw + (right - 1) * gap });
    y += PITCH * s * pf;
  }
  return R;
}
/** hallSeatRects({ rows, cols }) -> [{ row, col, x, y, w, h, scale, label }] in hallSVG coordinates (390 x 300). */
export function hallSeatRects(opts = {}) {
  return hallLayout(opts).map(({ row, col, x, y, w, h, scale, label }) => ({ row, col, x, y, w, h, scale, label }));
}
/** seatAvatarBox(rect) -> { x, y, w, h } : where to put a back-view avatarSVG so head + shoulders rise above that seat. */
export function seatAvatarBox(rect) {
  const k = rect.w / 44;
  return { x: n1(rect.x + rect.w / 2 - 24 * k), y: n1(rect.y - 36.5 * k), w: n1(48 * k), h: n1(60 * k) };
}
/** hallSVG({ rows, cols }) : seating area seen from behind, viewBox 0 0 390 300. */
export function hallSVG(opts = {}) {
  const R = hallLayout(opts), info = R.rowInfo, n = info.length;
  const a = info[0], z = info[n - 1];
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 300" class="hall"><defs>` +
    `<pattern id="hl-ht" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="2" cy="2" r="1.15" fill="${BUTTER}"/></pattern>` +
    `<pattern id="hl-ht2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="2" cy="2" r=".75" fill="${BUTTER}"/></pattern>` +
    `<g id="hl-seat">${seatInner('empty')}</g>` +
    `</defs><rect width="390" height="300" fill="${NIGHT}"/>`;
  // stepped floor: one tread per row
  const edge = (r) => info[r].y + (HALL.SH + 5) * info[r].s;
  let prev = 9;
  for (let r = 0; r < n; r++) {
    const e = edge(r), tone = ['#1D2249', '#202650', '#232A57', '#262D5E'][Math.min(3, Math.round((r / Math.max(1, n - 1)) * 3))];
    o += `<path d="${wob([[-3, prev + 5], [393, prev + 5], [393, e], [-3, e]], 200 + r, 1, true)}" fill="${tone}"/>`;
    o += `<path d="${wob([[-3, e], [130, e + 0.6], [260, e - 0.4], [393, e]], 210 + r, 1.2, false)}" fill="none" stroke="${NAVY2}" stroke-width="1.6" stroke-linecap="round"/>`;
    prev = e;
  }
  o += `<path d="${wob([[-3, prev + 5], [393, prev + 5], [393, 303], [-3, 303]], 220, 1, true)}" fill="#262D5E"/>`;
  // screen light spilling onto the front rows
  o += `<path d="M30 9L360 9L390 ${n1(a.y + 22)}L0 ${n1(a.y + 22)}Z" fill="url(#hl-ht2)" opacity=".3"/><path d="M70 9L320 9L340 ${n1(a.y - 2)}L50 ${n1(a.y - 2)}Z" fill="url(#hl-ht)" opacity=".3"/>`;
  // stage lip
  o += `<path d="${wob([[-3, -2], [393, -2], [393, 8.5], [-3, 8.5]], 230, 0.8)}" fill="${MAROON}"/><path d="${wob([[-3, 8.6], [195, 9.2], [393, 8.6]], 231, 0.8, false)}" fill="none" stroke="${MUS}" stroke-width="2" stroke-linecap="round"/>`;
  // centre aisle carpet
  const yT = 9, yB = 300, pad = 3;
  const sAt = (yy) => (n === 1 ? a.s : a.s + ((z.s - a.s) * Math.max(-0.6, Math.min(1.6, (yy - a.y) / (z.y - a.y)))));
  const aCx = a.aisleX + a.aisle / 2;
  const aL = (yy) => aCx - (HALL.AISLE * sAt(yy)) / 2 + pad, aR = (yy) => aCx + (HALL.AISLE * sAt(yy)) / 2 - pad;
  o += `<path d="M${n1(aL(yT))} ${yT}L${n1(aR(yT))} ${yT}L${n1(aR(yB))} ${yB}L${n1(aL(yB))} ${yB}Z" fill="${MAROON}"/>`;
  o += `<path d="M${n1(aL(yT))} ${yT}L${n1(aL(yB))} ${yB}M${n1(aR(yT))} ${yT}L${n1(aR(yB))} ${yB}" fill="none" stroke="${INK}" stroke-width="2"/>`;
  let steps = '', g1 = '', g2 = '', g3 = '';
  for (let r = 0; r < n; r++) {
    const e = edge(r), s = info[r].s;
    steps += `M${n1(aL(e))} ${n1(e)}L${n1(aR(e))} ${n1(e)}`;
    const ly = e - 9 * s;
    for (const lx of [aL(ly) + 4 * s, aR(ly) - 4 * s]) { g1 += circ(lx, ly, n1(6.5 * s)); g2 += circ(lx, ly, n1(3.8 * s)); g3 += circ(lx, ly, n1(1.9 * s)); }
  }
  o += `<path d="${steps}" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".7"/>`;
  o += `<path d="${g1}" fill="${MUS}" opacity=".16"/><path d="${g2}" fill="${MUS}" opacity=".36"/><path d="${g3}" fill="${CRM}" stroke="${MUS}" stroke-width="1"/>`;
  // side walls
  o += `<path d="M-2 0L${n1(a.x0 - 34)} 0L${n1(z.x0 - 30)} 300L-2 300Z" fill="#0C0F22"/><path d="M392 0L${n1(a.right + 34)} 0L${n1(z.right + 30)} 300L392 300Z" fill="#0C0F22"/>`;
  // emergency-exit lamp on the right wall
  const exX = n1(a.right + 40), exit = wrect(exX, 26, 19, 12, 240, 0.4, 2);
  o += glow(exit, TEA, [8, 4], [0.22, 0.45]) + `<path d="${exit}" fill="${TEA}" stroke="${INK}" stroke-width="1.4"/>` +
    `<path d="M${n1(exX + 4.6)} 29.4h4.6v6.6h-4.6zM${n1(exX + 11)} 32.6h4.4m-2-2l2 2l-2 2" fill="${CRM}" stroke="${CRM}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
  // row letters
  for (let r = 0; r < n; r++) {
    const i = info[r], cx = n1(i.x0 - 15 * i.s), cy = n1(i.y + 21 * i.s), rr = n1(8.2 * i.s);
    o += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${NAVY}" stroke="${MUS}" stroke-width="1.4"/>` +
      label(String.fromCharCode(65 + r), cx, n1(cy + 3.9 * i.s), n1(11 * i.s), CRM);
  }
  // seats
  for (const q of R) o += `<use href="#hl-seat" class="hall-seat" data-seat="${q.label}" transform="translate(${q.x} ${q.y}) scale(${q.scale})"/>`;
  return o + '</svg>';
}

// ───────────────────────── curtain ─────────────────────────
/**
 * curtainSVG() : closed curtain with valance. viewBox 0 0 390 220, preserveAspectRatio none.
 * Groups: g.curtain-left, g.curtain-right (slide / squash them apart with CSS to open), g.curtain-valance (stays).
 */
export function curtainSVG() {
  const NS = ' vector-effect="non-scaling-stroke"';
  const R = rng(77), N = 20, w = 390 / N;
  const half = [{ dark: '', lines: '', hi: '', ticks: '' }, { dark: '', lines: '', hi: '', ticks: '' }];
  for (let i = 0; i < N; i++) {
    const h = half[i < N / 2 ? 0 : 1];
    const x = i * w + 2 + R() * 3, b = 5.5 + R() * 3, k1 = (R() - 0.5) * 5, k2 = (R() - 0.5) * 5;
    h.dark += `M${n1(x)} 30Q${n1(x + k1)} 120 ${n1(x + k2)} 222L${n1(x + k2 + b)} 222Q${n1(x + k1 + b + 1.5)} 120 ${n1(x + b)} 30Z`;
    h.lines += `M${n1(x + b)} 34Q${n1(x + k1 + b + 1.5)} 120 ${n1(x + k2 + b)} 206`;
    if (i % 2 === 0) h.hi += `M${n1(x + b + 5)} 52Q${n1(x + b + 6 + k1)} 120 ${n1(x + b + 5 + k2)} 196`;
  }
  for (let x = 4; x < 390; x += 6.5) half[x < 195 ? 0 : 1].ticks += `M${n1(x)} 213L${n1(x + (R() - 0.5) * 1.2)} 219`;
  const side = (k) => {
    const h = half[k], x0 = k ? 195 : -3, x1 = k ? 393 : 196, m = (x0 + x1) / 2;
    let g = `<g class="curtain-${k ? 'right' : 'left'}"><rect x="${k ? 195 : 0}" width="${k ? 195 : 196}" height="220" fill="${TOM}"/>`;
    g += `<path d="${h.dark}" fill="${BRICK}"/>`;
    g += `<path d="${h.hi}" fill="none" stroke="${SALMON}" stroke-width="2.4" stroke-linecap="round" opacity=".55"${NS}/>`;
    g += `<path d="${h.lines}" ${STROKE} stroke-width="1.5" opacity=".75"${NS}/>`;
    if (k) g += `<path d="M195 0Q198 120 194 222L202 222Q205 120 201 0Z" fill="${MAROON}" opacity=".75"/><path d="M195 0Q198 120 194 221" ${STROKE} stroke-width="2.2"${NS}/>`;
    g += `<path d="${wob([[x0, 204], [m, 205], [x1, 204], [x1, 213], [m, 212.4], [x0, 213]], 78 + k, 1)}" fill="${MUS}"/>`;
    g += `<path d="${wob([[x0, 204], [m, 205], [x1, 204]], 80 + k, 1, false)}${wob([[x0, 213], [m, 212.4], [x1, 213]], 82 + k, 1, false)}" ${STROKE} stroke-width="1.8"${NS}/>`;
    g += `<path d="${h.ticks}" fill="none" stroke="${MUS}" stroke-width="2.2" stroke-linecap="round"${NS}/>`;
    return g + '</g>';
  };
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 220" preserveAspectRatio="none" class="curtain">` + side(0) + side(1);
  // valance: five swags
  const SW = 78;
  let swag = '', trim = '', folds = '', edge = '', tass = '';
  for (let i = 0; i < 5; i++) {
    const x0 = i * SW, x1 = x0 + SW, m = x0 + SW / 2;
    swag += `M${x0} 6L${x1} 6L${x1} 30Q${m} 66 ${x0} 30Z`;
    trim += `M${x1} 30Q${m} 66 ${x0} 30L${x0} 24Q${m} 58 ${x1} 24Z`;
    edge += `M${x1} 30Q${m} 66 ${x0} 30M${x0} 24Q${m} 58 ${x1} 24`;
    folds += `M${x0 + 9} 10Q${m} 34 ${x1 - 9} 10M${x0 + 20} 10Q${m} 21 ${x1 - 20} 10`;
  }
  for (let i = 0; i <= 5; i++) { const x = Math.min(386, Math.max(4, i * SW)); tass += capsule(x, 30, x, 45, 2.8) + circ(x, 29, 3.8); }
  o += `<g class="curtain-valance"><path d="${swag}" fill="${MAROON}"/><path d="${trim}" fill="${MUS}"/>`;
  o += `<path d="${folds}" ${STROKE} stroke-width="1.5" opacity=".7"${NS}/><path d="${edge}" ${STROKE} stroke-width="1.8"${NS}/>`;
  o += `<path d="${tass}" fill="${MUS}" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"${NS}/>`;
  o += `<path d="${wob([[-3, -3], [393, -3], [393, 8], [-3, 8]], 81, 0.8)}" fill="${MUS}" stroke="${INK}" stroke-width="2"${NS}/></g>`;
  return o + '</svg>';
}

// ───────────────────────── lobby ─────────────────────────
/** Anchor points for the game, in lobbySVG coordinates. */
export const LOBBY = {
  width: 390, height: 560, wallY: 210,
  posterSlot: { x: 147, y: 70, w: 96, h: 54 },
  counter: { x: 4, y: 153, w: 132, h: 71 },
  clerk: { x: 92, clipY: 153 },          // clerk stands behind the counter: clip the NPC at clipY
  door: { x: 294, y: 70, w: 84, h: 141 },
  usher: { x: 266, y: 238 },             // feet
  walk: { x: 18, y: 232, w: 354, h: 288 },
  bench: { x: 2, y: 468, w: 110, h: 72 },
  plant: { x: 322, y: 440, w: 64, h: 104 },
};

/** lobbySVG() : lobby background without avatars. viewBox 0 0 390 560. */
export function lobbySVG() {
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 560" class="lobby"><defs>` +
    `<pattern id="lb-carpet" width="56" height="56" patternUnits="userSpaceOnUse">` +
    `<rect width="56" height="56" fill="${TONES.carpet}"/>` +
    `<path d="M0 28Q13.6 15 28 0Q42.6 13 56 28Q43 41.8 28 56Q13.4 43.2 0 28Z" fill="none" stroke="#B53B2E" stroke-width="2"/>` +
    `<path d="${star4(28, 28, 9.5)}${star4(0, 0, 9.5)}${star4(56, 0, 9.5)}${star4(0, 56, 9.5)}${star4(56, 56, 9.5)}" fill="#BF3F2F"/>` +
    `<path d="${diamond(28, 0, 2.9)}${diamond(28, 56, 2.9)}${diamond(0, 28, 2.9)}${diamond(56, 28, 2.9)}" fill="${MUS}" opacity=".85"/>` +
    `<circle cx="28" cy="28" r="1.6" fill="${TEA}" opacity=".9"/></pattern>` +
    `<pattern id="lb-wall" width="26" height="26" patternUnits="userSpaceOnUse"><path d="${star4(6, 7, 3.2)}${star4(19, 20, 3.2)}" fill="${NAVY2}" opacity=".55"/></pattern>` +
    `<pattern id="lb-htm" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1.6" cy="1.6" r="1.15" fill="${MUS}"/></pattern>` +
    `<pattern id="lb-htm2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1.6" cy="1.6" r=".7" fill="${MUS}"/></pattern>` +
    `<pattern id="lb-hti" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1.4" cy="1.4" r="1" fill="${INK}"/></pattern>` +
    `</defs>`;
  const halo = (cx, cy, rx, ry, op = 0.6) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#lb-htm2)" opacity="${op}"/><ellipse cx="${cx}" cy="${cy}" rx="${n1(rx * 0.66)}" ry="${n1(ry * 0.66)}" fill="url(#lb-htm)" opacity="${op}"/>`;

  // wall + floor
  o += `<rect width="390" height="212" fill="${NAVY}"/><rect y="8" width="390" height="146" fill="url(#lb-wall)"/>`;
  o += `<rect y="208" width="390" height="352" fill="url(#lb-carpet)"/>`;
  o += `<rect y="210" width="390" height="20" fill="url(#lb-hti)" opacity=".5"/>`;
  o += `<path d="M0 560L0 520Q60 548 195 550Q330 548 390 520L390 560Z" fill="url(#lb-hti)" opacity=".4"/>`;
  o += `<rect width="390" height="6" fill="${MAROON}"/><path d="${wob([[-2, 6.5], [130, 6], [260, 7], [392, 6.4]], 3, 0.8, false)}" ${STROKE} stroke-width="2"/>`;
  // light halos (halftone dots) behind the lit fixtures
  o += halo(195, 96, 92, 62, 0.5) + halo(32, 124, 46, 46, 0.55) + halo(336, 46, 46, 22, 0.45) + halo(270.5, 96, 24, 30, 0.6);

  // wainscot
  const W = sheet({ paper: null });
  W.s('M-2 157L392 157L392 206L-2 206Z', MAROON, { line: false });
  W.s(wob([[-3, 152.5], [392, 152.5], [392, 158.5], [-3, 158.5]], 5, 0.7), MUS);
  W.s(wob([[-3, 203], [393, 203], [393, 212], [-3, 212]], 6, 0.6), NIGHT);
  W.t(wrect(142, 165.5, 50, 32, 7, 0.9) + wrect(198, 165.5, 50, 32, 8, 0.9) + wrect(254, 165.5, 28, 32, 9, 0.9));
  W.f(wrect(145, 168.5, 44, 26, 7, 0.6) + wrect(201, 168.5, 44, 26, 8, 0.6) + wrect(257, 168.5, 22, 26, 9, 0.6), '#732A35');
  o += W.out();

  // ── centre: neon sign, "today's screening" plaque, lit poster frame ──
  const neonBox = wrect(141, 13, 108, 28, 12, 0.6, 9);
  o += `<path d="M160 6L160 13M230 6L230 13" ${STROKE} stroke-width="1.4"/>`;
  o += glow(neonBox, TEA, [7, 3.6], [0.2, 0.5]) + `<path d="${neonBox}" fill="${NIGHT}" stroke="${MINT}" stroke-width="1.4"/>`;
  o += neonText('동시상영', 196, 34.4, 19, TOM, 2.4);
  const P = sheet();
  P.s(wrect(136, 60, 118, 75, 13, 1.4, 3), MUS);
  P.s(wrect(144.4, 67.4, 101.2, 59.2, 14, 0.4), NIGHT, { paper: false, thin: true });
  let bulbs = '';
  for (let i = 0; i < 9; i++) bulbs += circ(141.5 + i * 13.4, 63.8, 1.9) + circ(141.5 + i * 13.4, 131, 1.9);
  for (let i = 1; i < 5; i++) bulbs += circ(140.2, 63.8 + i * 13.4, 1.9) + circ(249.9, 63.8 + i * 13.4, 1.9);
  P.x(`<path d="${bulbs}" fill="${CRM}" stroke="${INK}" stroke-width=".9"/>`);
  P.x(`<rect x="147" y="70" width="96" height="54" fill="#0B0E20"/>`);
  P.x(`<path d="M147 70L171 70L147 94Z" fill="${NAVY}" opacity=".5"/>`);
  P.s(wrect(159, 43.5, 72, 16, 15, 0.6, 3.5), TOM);
  P.x(label('오늘의 상영', 195, 55.4, 10, CRM));
  o += P.out();

  // wall sconce
  const SC = sheet({ lw: 1.7 });
  const shade = 'M264 92L277 92L274.4 104L266.6 104Z';
  SC.u(glow(shade, MUS, [9, 5], [0.2, 0.42]));
  SC.t('M270.5 104L270.5 111').s(wrect(266.5, 110, 8, 4.4, 61, 0.3, 1.4), AMBER, { thin: true }).s(shade, BUTTER);
  o += SC.out();

  // ── right: doors to screen 1 ──
  const D = sheet();
  D.s(wrect(287, 63, 98, 149, 21, 1.6, 2), MUS);
  D.s(wrect(293.5, 69.5, 42, 141.5, 22, 1.1), TEA).s(wrect(336.5, 69.5, 42, 141.5, 23, 1.1), TEA);
  D.f('M293.5 196L335.5 196L335.5 211L293.5 211Z M336.5 196L378.5 196L378.5 211L336.5 211Z', DTEAL);
  D.t('M294 196L335 196M337 196L378 196');
  D.t(wrect(299, 126, 31, 62, 24, 0.7, 2) + wrect(342, 126, 31, 62, 25, 0.7, 2));
  D.s(circ(314.5, 100, 11), BUTTER).s(circ(357.5, 100, 11), BUTTER);
  D.f('M306 96Q309 90 315 89.6Q310 92.6 308.6 97.6Z M349 96Q352 90 358 89.6Q353 92.6 351.6 97.6Z', CRM);
  D.s(capsule(331, 138, 331, 160, 2), MUS, { thin: true }).s(capsule(341, 138, 341, 160, 2), MUS, { thin: true });
  o += glow(circ(314.5, 100, 11) + circ(357.5, 100, 11), MUS, [8, 4], [0.2, 0.4]) + D.out();
  const signBox = wrect(310, 35, 52, 23, 26, 0.6, 4);
  const G = sheet();
  G.s(signBox, CRM).x(label('1관', 336, 52.4, 15, TOM, '', 900));
  o += glow(signBox, MUS, [9, 5], [0.18, 0.4]) + G.out();
  // rope stanchion
  const ST = sheet({ lw: 1.7 });
  const post = (x) => { ST.s(blob(x, 233, 6.4, 2.7, 30 + x, 0.3, 8), AMBER); ST.s(capsule(x, 231.5, x, 207, 1.7), MUS); ST.s(circ(x, 203.6, 3.3), MUS); };
  o += `<ellipse cx="302" cy="235" rx="9" ry="3" fill="${INK}" opacity=".25"/><ellipse cx="372" cy="235" rx="9" ry="3" fill="${INK}" opacity=".25"/>`;
  post(302); post(372);
  o += ST.out();
  o += `<path d="M302 209Q337 232 372 209" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="M302 209Q337 232 372 209" fill="none" stroke="${TOM}" stroke-width="2.6" stroke-linecap="round"/>`;

  // ── left: concession stand ──
  const C = sheet();
  C.s(wrect(9, 57, 122, 98, 31, 1.2), '#161A3A');
  C.f('M9 57L131 57L131 72L9 72Z', NIGHT);
  o += C.out();
  // menu board hanging in the booth
  const M = sheet({ thinW: 1 });
  M.t('M72 60L72 74M118 60L118 74');
  M.s(wrect(62, 73, 66, 31, 32, 0.7, 2), MUS);
  M.s(wrect(65, 76, 60, 25, 33, 0.4), NIGHT, { paper: false, thin: true });
  M.x(label('메뉴', 95, 84.4, 7.2, MUS) +
    `<text font-size="7" font-weight="700" fill="${CRM}" font-family="${FONT}"><tspan x="68.5" y="92">팝콘</tspan><tspan x="68.5" y="99">콜라</tspan><tspan x="121.5" y="92" text-anchor="end">3.0</tspan><tspan x="121.5" y="99" text-anchor="end">2.0</tspan></text>` +
    `<path d="M86 90.2L107 90.2M86 97.2L107 97.2" fill="none" stroke="${CRM}" stroke-width=".9" stroke-dasharray="1 2.4" opacity=".7"/>`);
  o += M.out();
  // posts + awning + sign
  const A = sheet();
  A.s(wrect(4.5, 57, 6.5, 97, 34, 0.5), CRM).s(wrect(129, 57, 6.5, 97, 35, 0.5), CRM);
  const nS = 11, xt = (i) => 13 + (114 * i) / nS, xb = (i) => 3 + (134 * i) / nS;
  let whole = `M${n1(xt(0))} 33L${n1(xt(nS))} 33L${n1(xb(nS))} 58`, red = '';
  for (let i = nS; i > 0; i--) whole += `Q${n1((xb(i) + xb(i - 1)) / 2)} 71 ${n1(xb(i - 1))} 58`;
  whole += 'Z';
  for (let i = 0; i < nS; i += 2) red += `M${n1(xt(i))} 33L${n1(xt(i + 1))} 33L${n1(xb(i + 1))} 58Q${n1((xb(i) + xb(i + 1)) / 2)} 71 ${n1(xb(i))} 58Z`;
  A.s(whole, CRM).f(red, TOM).t('M3.6 58L136.4 58');
  const sign = wrect(40, 8, 60, 26, 36, 0.8, 5);
  A.u(glow(sign, MUS, [9, 5], [0.16, 0.36]));
  A.s(sign, MUS).t(wrect(43.4, 11.2, 53.2, 19.6, 37, 0.5, 3));
  A.x(label('매점', 70, 27, 15.5, INK, ' letter-spacing="1.5"', 900));
  o += A.out();
  // popcorn machine (glowing)
  const glass = wrect(14.5, 107, 37, 37, 38, 0.6);
  const PM = sheet();
  PM.u(glow(glass, MUS, [10, 5], [0.2, 0.42]));
  PM.s(glass, MUS);
  PM.f('M15 132Q20 124 26 128Q31 120 37 126Q43 121 51 130L51 143.6L15 143.6Z', '#FBEBB8');
  PM.t('M15.4 132Q20 124 26 128Q31 120 37 126Q43 121 50.6 130');
  PM.f(circ(22, 134.6, 1.2) + circ(31, 131, 1.3) + circ(40, 135.6, 1.2) + circ(46, 131.6, 1) + circ(27, 138.6, 1.1) + circ(36, 139.4, 1.1), MUS);
  PM.s('M28.4 107.4L37.6 107.4L36.4 115.4Q33 117.6 29.6 115.4Z', DTEAL, { paper: false, thin: true });
  PM.f('M18 110L22.6 110L18 121Z M43.6 110L46.6 110L41.4 122.4L39.6 119.6Z', CRM, ' opacity=".75"');
  PM.s(wrect(11.5, 97.5, 43, 10, 39, 0.6, 2.5), TOM).s(wrect(29, 93.4, 8, 4.6, 40, 0.3, 1.5), MUS, { thin: true });
  PM.s(wrect(11.5, 143.4, 43, 12, 41, 0.6, 2), TOM).f('M14 147.4L52 147.4L52 150.6L14 150.6Z', CRM);
  PM.x(label('POP', 33, 105.6, 6.6, CRM, ' letter-spacing=".8"', 900));
  o += PM.out();
  // counter
  const CT = sheet();
  CT.s(wob([[7, 152.5], [133, 152.5], [137.5, 162], [2.5, 162]], 42, 0.8), MUS);
  CT.s(wrect(3.5, 162, 133, 62.5, 43, 1.5), TEA);
  CT.f('M3.5 214L136.5 214L136.5 224.5L3.5 224.5Z', DTEAL).t('M4 214L136 214');
  CT.f('M3.5 162L136.5 162L136.5 167.6L3.5 167.6Z', DTEAL, ' opacity=".55"');
  CT.t(wrect(10, 172.6, 38, 35, 44, 0.8, 2) + wrect(92, 172.6, 38, 35, 45, 0.8, 2));
  CT.s(blob(70, 190, 15.5, 15, 46, 0.6, 10), CRM);
  // little popcorn emblem on the counter front
  CT.f(circ(65.4, 185.4, 2.9) + circ(70, 183.6, 3.2) + circ(74.6, 185.4, 2.9), MUS);
  CT.f(stripes((t) => [63 + 14 * t, 187], (t) => [65 + 10 * t, 199], 5, 0, false), TOM);
  CT.t('M63 187L77 187L75 199L65 199Z');
  // cup stack on the counter
  CT.s('M118.6 141L128.4 141L127.2 153.4L119.8 153.4Z', CRM, { thin: true }).f('M119 144.6L128 144.6L127.6 148L119.4 148Z', TOM);
  CT.s('M117.8 139.2h11.4v2.2h-11.4z', TEA, { thin: true });
  o += `<path d="M3.5 224.5L136.5 224.5L140 232L7 232Z" fill="url(#lb-hti)" opacity=".5"/>` + CT.out();

  // ── floor furniture ──
  // bench (bottom-left): padded, with a backrest, facing us
  o += `<path d="M2 536L110 536L114 547L6 547Z" fill="url(#lb-hti)" opacity=".55"/>`;
  const BN = sheet();
  BN.s(wrect(13, 526, 7, 12, 51, 0.5, 1), MUS).s(wrect(92, 526, 7, 12, 52, 0.5, 1), MUS);
  BN.s(wrect(9, 468, 94, 30, 56, 1.2, 8), DTEAL);
  BN.f('M15 472.6Q30 470 52 470.6L50 474Q30 473.4 16 476Z', MINT, ' opacity=".55"');
  BN.f(circ(33, 484, 1.6) + circ(56, 484, 1.6) + circ(79, 484, 1.6), INK);
  o += BN.out();
  const BS = sheet();
  BS.s(wrect(4, 510, 104, 17, 53, 1, 3), DTEAL);
  BS.s(wob([[9, 494], [103, 494], [109, 512], [3, 512]], 54, 1.1), TEA);
  BS.f('M14 497.4L60 497.4L58 500.6L12.6 500.6Z', MINT, ' opacity=".7"');
  BS.t('M56 512L56 526');
  BS.s(wrect(1.5, 486, 10, 34, 57, 0.8, 4), TEA).s(wrect(100.5, 486, 10, 34, 58, 0.8, 4), TEA);
  o += BS.out();
  // potted plant (bottom-right)
  o += `<path d="M334 538L380 538L384 548L338 548Z" fill="url(#lb-hti)" opacity=".55"/>`;
  const PL = sheet();
  PL.s(leaf(356, 506, 331, 462, 9.5), DTEAL).s(leaf(357, 506, 383, 468, 9), DTEAL);
  PL.s(leaf(356, 508, 345, 446, 9), TEA).s(leaf(357, 508, 371, 450, 8.5), TEA);
  PL.s(leaf(355, 510, 326, 492, 7.5), TEA).s(leaf(358, 510, 386, 496, 7), TEA);
  PL.s(leaf(356.5, 508, 357.5, 440, 8), '#3BAE9F');
  PL.t('M356.5 506L357.4 446M355.6 506L346.4 452M357.4 506L370 456M355.4 508L333 468M357.6 508L381 473');
  PL.s('M339.4 512L372.6 512L369.4 540.4L342.6 540.4Z', TOM);
  PL.f('M340.6 522L371.4 522L370.8 527L341.2 527Z', CRM);
  PL.s(wrect(336, 505.6, 40, 7.6, 55, 0.5, 2), MUS);
  o += PL.out();
  return o + '</svg>';
}

// ───────────────────────── marquee (home) ─────────────────────────
/** marqueeSVG() : the theatre front at night, viewBox 0 0 390 300. Bulbs carry class="bulb" and style="--i:n". */
export function marqueeSVG() {
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 300" class="marquee"><defs>` +
    `<pattern id="mq-htm" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1.6" cy="1.6" r="1.1" fill="${MUS}"/></pattern>` +
    `<pattern id="mq-htm2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1.6" cy="1.6" r=".7" fill="${MUS}"/></pattern>` +
    `<pattern id="mq-hti" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1.4" cy="1.4" r="1" fill="${NIGHT}"/></pattern>` +
    `</defs><rect width="390" height="300" fill="${NIGHT}"/>`;
  // moon + stars
  o += `<circle cx="50" cy="40" r="22" fill="none" stroke="${BUTTER}" stroke-width="8" opacity=".08"/><circle cx="50" cy="40" r="16" fill="none" stroke="${BUTTER}" stroke-width="5" opacity=".14"/>`;
  o += `<path d="M58 27.6A14.6 14.6 0 1 0 63.6 49.6A11.6 11.6 0 0 1 58 27.6Z" fill="${BUTTER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const stars = [[112, 22, 4.2], [300, 26, 5], [352, 62, 3.4], [22, 92, 3.2], [246, 12, 3], [168, 36, 2.6], [338, 18, 2.4]];
  o += stars.map(([x, y, r], i) => `<path class="star" style="--i:${i}" d="${star4(x, y, r)}" fill="${i % 3 === 1 ? MINT : CRM}"/>`).join('');
  o += `<path d="${[[84, 52], [140, 14], [208, 30], [276, 50], [370, 34], [14, 58], [326, 84]].map(([x, y]) => circ(x, y, 0.9)).join('')}" fill="${CRM}" opacity=".7"/>`;
  // neighbours
  const NB = sheet({ paper: null });
  NB.s(wrect(-8, 132, 50, 124, 91, 1), '#1D2249').s(wrect(350, 112, 48, 144, 92, 1), '#1D2249');
  NB.f(wrect(6, 146, 9, 11, 93, 0.4) + wrect(22, 166, 9, 11, 94, 0.4) + wrect(364, 128, 9, 11, 95, 0.4) + wrect(364, 168, 9, 11, 96, 0.4), MUS, ' opacity=".8"');
  NB.f(wrect(22, 146, 9, 11, 97, 0.4) + wrect(6, 166, 9, 11, 98, 0.4) + wrect(364, 148, 9, 11, 99, 0.4), NAVY2);
  o += NB.out();
  // facade
  const F = sheet();
  F.s(wj('M38 254L38 92L92 92L92 72L146 72L146 46L244 46L244 72L298 72L298 92L352 92L352 254Z', 140, 0.9), TEA);
  F.f('M38 170L352 170L352 254L38 254Z', NAVY);
  F.f('M146 46L244 46L244 51.4L146 51.4Z M92 72L146 72L146 77.4L92 77.4ZM244 72L298 72L298 77.4L244 77.4Z M38 92L92 92L92 97.4L38 97.4ZM298 92L352 92L352 97.4L298 97.4Z', MINT);
  F.f('M300 98L352 98L352 170L318 170Q322 130 300 98Z M244 52L244 72L230 72Q240 62 236 52Z', DTEAL, ' opacity=".55"');
  F.t('M152 56L152 92M160 56L160 92M230 56L230 92M238 56L238 92M100 82L100 92M108 82L108 92M116 82L116 92M274 82L274 92M282 82L282 92M290 82L290 92');
  o += F.out();
  // crown star
  const crown = star5(195, 70, 13);
  o += glow(crown, TOM, [8, 4], [0.18, 0.4]) + `<path d="${crown}" fill="${TOM}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="${star5(195, 70, 5.8)}" fill="${CRM}"/>`;
  // marquee board
  o += `<ellipse cx="195" cy="131" rx="176" ry="50" fill="url(#mq-htm2)" opacity=".3"/>`;
  const board = wrect(44, 98, 302, 66, 101, 0.9, 6);
  const MB = sheet({ mis: [1.6, 1.2] });
  MB.u(glow(board, BUTTER, [7], [0.3]));
  MB.s(board, TOM);
  MB.s(wrect(57, 111, 276, 40, 102, 0.7, 2), CRM, { thin: true });
  MB.x(`<text x="197.4" y="143.2" font-size="31" font-weight="900" text-anchor="middle" letter-spacing="7" fill="${TOM}" font-family="${FONT}">동시상영</text>`);
  MB.x(`<text x="195.5" y="141.6" font-size="31" font-weight="900" text-anchor="middle" letter-spacing="7" fill="${INK}" font-family="${FONT}">동시상영</text>`);
  MB.x(`<path d="${star5(74, 131, 5.5)}${star5(316, 131, 5.5)}" fill="${MUS}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`);
  o += MB.out();
  let bi = 0, bulbs = '';
  const bulb = (x, y, r = 2.7) => { bulbs += `<circle class="bulb" style="--i:${bi++}" cx="${n1(x)}" cy="${n1(y)}" r="${r}" fill="${BUTTER}" stroke="${MUS}" stroke-width="1.5"/>`; };
  for (let i = 0; i < 20; i++) bulb(55.5 + i * 14.68, 104.6);
  for (let i = 0; i < 3; i++) bulb(339.6, 118 + i * 13);
  for (let i = 19; i >= 0; i--) bulb(55.5 + i * 14.68, 157.4);
  for (let i = 2; i >= 0; i--) bulb(50.4, 118 + i * 13);
  // canopy slab under the board
  const CN = sheet();
  CN.s(wob([[34, 164], [356, 164], [350, 173], [40, 173]], 103, 0.8), CRM);
  o += CN.out();
  for (let i = 0; i < 13; i++) bulb(51 + i * 24, 168.6, 1.9);
  o += bulbs;
  // light pool under the canopy
  o += `<path d="M46 174L344 174L352 254L38 254Z" fill="url(#mq-htm2)" opacity=".28"/>`;
  // doors
  const DR = sheet();
  const door = (x) => {
    DR.s(wrect(x, 186, 76, 68, 110 + x, 0.8, 2), MUS);
    DR.s(wrect(x + 5, 191, 32, 63, 111 + x, 0.5), TEA).s(wrect(x + 39, 191, 32, 63, 112 + x, 0.5), TEA);
    DR.s(wrect(x + 10, 197, 22, 30, 113 + x, 0.5, 4), BUTTER, { thin: true }).s(wrect(x + 44, 197, 22, 30, 114 + x, 0.5, 4), BUTTER, { thin: true });
    DR.f(`M${x + 12} 199L${x + 19} 199L${x + 12} 213Z M${x + 46} 199L${x + 53} 199L${x + 46} 213Z`, CRM);
    DR.t(`M${x + 34} 232L${x + 34} 242M${x + 42} 232L${x + 42} 242`);
  };
  door(58); door(256);
  // ticket booth
  DR.s(wrect(153, 178, 84, 76, 120, 0.8, 3), TOM);
  DR.f('M153 228L237 228L237 254L153 254Z', BRICK);
  DR.f(stripes((t) => [153 + 84 * t, 232], (t) => [153 + 84 * t, 254], 9, 1, false), CRM, ' opacity=".9"');
  DR.t('M153.6 232L236.4 232');
  const win = 'M165 226L165 204Q165 190 179 190L211 190Q225 190 225 204L225 226Z';
  DR.u(glow(win, MUS, [9, 5], [0.2, 0.4]));
  DR.s(win, BUTTER);
  // clerk silhouette in the window
  DR.f('M183 226Q183 214 195 213.6Q207 214 207 226Z', NAVY2).f(circ(195, 205.6, 6.8), NAVY2).f('M188.4 201Q195 195.6 201.6 201L201.6 199.4Q195 194 188.4 199.4Z', TOM);
  DR.s('M189 226Q189 220.6 195 220.6Q201 220.6 201 226Z', NIGHT, { paper: false, thin: true });
  DR.s(wob([[161, 225], [229, 225], [231, 230.6], [159, 230.6]], 121, 0.5), MUS, { thin: true });
  DR.s(wrect(171, 179.6, 48, 12.4, 122, 0.5, 3), CRM, { thin: true });
  DR.x(label('매표소', 195, 189.4, 8.6, INK));
  o += DR.out();
  // pavement + street
  o += `<rect y="254" width="390" height="46" fill="#232955"/><path d="M0 254L390 254" stroke="${INK}" stroke-width="2.4"/>`;
  o += `<ellipse cx="195" cy="263" rx="170" ry="12" fill="url(#mq-htm)" opacity=".4"/>`;
  // a neighbourhood cat waiting at the door
  o += `<path d="M301 255Q299.6 245 304 242.6L303.4 237.6L306.6 240.2Q308.6 239.6 310.6 240.2L313.8 237.6L313.2 242.6Q317.6 245 316.2 255ZM316 253Q322 253.6 321.4 247.6" fill="${CRM}" stroke="${CRM}" stroke-width="1.4" stroke-linejoin="round" transform="translate(-1 -1.1)"/>` +
    `<path d="M301 255Q299.6 245 304 242.6L303.4 237.6L306.6 240.2Q308.6 239.6 310.6 240.2L313.8 237.6L313.2 242.6Q317.6 245 316.2 255ZM316 253Q322 253.6 321.4 247.6" fill="${NIGHT}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${circ(306.2, 244.6, 0.95)}${circ(311, 244.6, 0.95)}" fill="${MUS}"/>`;
  o += `<path d="${wob([[-3, 273], [393, 273], [393, 303], [-3, 303]], 130, 0.8)}" fill="${NIGHT}"/><path d="${wob([[-3, 273], [130, 273.6], [260, 272.6], [393, 273]], 131, 1, false)}" ${STROKE} stroke-width="2"/>`;
  o += `<path d="M14 288L46 288M92 288L124 288M170 288L202 288M248 288L280 288M326 288L358 288" stroke="${MUS}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>`;
  return o + '</svg>';
}

// ───────────────────────── ticket stub (optional) ─────────────────────────
/** ticketStubSVG({ title, sub }) : viewBox 0 0 120 56. */
export function ticketStubSVG({ title = '동시상영', sub = '1관 · 심야 상영' } = {}) {
  const S = sheet({ mis: [1, 0.8], lw: 1.8 });
  const body = 'M4 6Q4 4 6 4L114 4Q116 4 116 6L116 20Q111 22 111 28Q111 34 116 36L116 50Q116 52 114 52L6 52Q4 52 4 50L4 36Q9 34 9 28Q9 22 4 20Z';
  S.s(body, CRM);
  S.f('M84 4L114 4Q116 4 116 6L116 20Q111 22 111 28Q111 34 116 36L116 50Q116 52 114 52L84 52Z', TOM);
  S.x(`<path d="M84 7L84 49" fill="none" stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 2.6"/>`);
  S.x(`<text x="46" y="27" font-size="14" font-weight="900" text-anchor="middle" letter-spacing="1.4" fill="${INK}" font-family="${FONT}">${title}</text>`);
  S.x(`<text x="46" y="40" font-size="7.4" font-weight="700" text-anchor="middle" fill="${INK}" font-family="${FONT}">${sub}</text>`);
  S.x(`<path d="${star5(100, 28, 8)}" fill="${MUS}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`);
  S.x(`<path d="M16 14L30 14M62 14L76 14M16 46L76 46" fill="none" stroke="${TEA}" stroke-width="1.6" stroke-linecap="round"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 56" class="ticket-stub">${S.out()}</svg>`;
}
