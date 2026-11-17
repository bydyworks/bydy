// art.js — "CHUNKY PIXEL" art kit for a tiny online neighbourhood movie theatre.
//
// Everything is painted on a coarse pixel canvas (1 art pixel = 2 viewBox units)
// and emitted as ONE <path> PER COLOUR made of axis-aligned rect sub-paths
// (shape-rendering: crispEdges). No raster images, no fonts, no filters, no ids.
// All Korean signage is hand-drawn 9x11 pixel Hangul, so it never depends on a font.
//
// Every exported *SVG() function is pure: same input -> same markup string.

const U = 2; // viewBox units per art pixel
const INK = '#1b1230';

/* ------------------------------------------------------------------ palette */

export const PALETTE = {
  ink: '#1b1230',
  // dusk purple
  p0: '#221638', p1: '#2a1b47', p2: '#3b2763', p3: '#54398a', p4: '#7654b0', p5: '#a184d6',
  // ticket red
  r0: '#4a1230', r1: '#7a1f3a', r2: '#b3273f', r3: '#e2434b', r4: '#ff7a6b',
  // popcorn yellow
  y1: '#b8791f', y2: '#f0a92e', y3: '#ffd34d', y4: '#fff1a8',
  // mint
  m1: '#1f6b62', m2: '#36a58c', m3: '#6fe0b7', m4: '#c9ffe6',
  // paper + wood
  cream: '#fff4dc', paper: '#e8d3b0', w1: '#4a2a2a', w2: '#7a4632', w3: '#a8683f',
};
const C = PALETTE;

export const HAIR_COLORS = ['#3d2c58', '#6b3a2a', '#b5552d', '#f2c14e', '#f08a9b', '#5fc9b0'];
export const OUTFIT_COLORS = ['#e2434b', '#ffc93c', '#4fc7a4', '#5b9bea', '#9a7fe0', '#fff1d6', '#ff8fa3', '#ff9d5c'];
export const SKIN_TONES = ['#ffe3c8', '#f6c9a0', '#d39a6a', '#99633f'];

function rgb(h) { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------- pixel canvas */

class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  has(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.has(x, y) ? this.d[y * this.w + x] : null; }
  set(x, y, c) { if (this.has(x, y)) this.d[y * this.w + x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  row(y, x0, x1, c) { return this.rect(x0, y, x1 - x0 + 1, 1, c); } // inclusive
  col(x, y0, y1, c) { return this.rect(x, y0, 1, y1 - y0 + 1, c); } // inclusive
  box(x, y, w, h, fill, line = INK) { this.rect(x, y, w, h, line); return this.rect(x + 1, y + 1, w - 2, h - 2, fill); }
  dither(x, y, w, h, c, par = 0) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (((i + j) & 1) === par) this.set(i, j, c);
    return this;
  }
  // every pixel in the box gets fn(x, y) (null/undefined = leave)
  fn(x, y, w, h, f) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const c = f(i, j); if (c) this.set(i, j, c); }
    return this;
  }
  // filled ellipse; band > 0 adds a checkerboard fringe (cell = dither cell size)
  ellipse(cx, cy, rx, ry, c, band = 0, cell = 1) {
    const B = (1 + band) * (1 + band);
    return this.fn(Math.floor(cx - rx * (1 + band)) - 1, Math.floor(cy - ry * (1 + band)) - 1,
      Math.ceil(rx * (1 + band) * 2) + 3, Math.ceil(ry * (1 + band) * 2) + 3, (i, j) => {
        const d = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2;
        if (d <= 1) return c;
        if (d <= B && (((i / cell) | 0) + ((j / cell) | 0)) % 2 === 0) return c;
        return null;
      });
  }
  // string art: rows of chars, pal maps char -> colour ('.' / ' ' = skip)
  art(x, y, rows, pal) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) this.set(x + i, y + j, c); } });
    return this;
  }
  // 1px outline around everything already painted (4-neighbourhood)
  outline(c = INK) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[y * this.w + x]) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
    }
    for (const i of add) this.d[i] = c;
    return this;
  }
  // copy every painted pixel of src onto this canvas
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.d[y * src.w + x]; if (c) this.set(x + dx, y + dy, c); }
    return this;
  }
  // one <path> per colour; runs are merged horizontally then vertically
  paths(ox = 0, oy = 0, attrs = '') {
    const by = new Map();
    const flush = (r) => {
      let a = by.get(r.c); if (!a) { a = []; by.set(r.c, a); }
      a.push(`M${ox + r.x * U} ${oy + r.y * U}h${r.w * U}v${r.h * U}h${-r.w * U}z`);
    };
    let prev = new Map();
    for (let y = 0; y < this.h; y++) {
      const cur = new Map();
      let x = 0;
      while (x < this.w) {
        const c = this.d[y * this.w + x];
        if (!c) { x++; continue; }
        let x1 = x + 1;
        while (x1 < this.w && this.d[y * this.w + x1] === c) x1++;
        const key = x + ',' + (x1 - x) + ',' + c;
        const p = prev.get(key);
        if (p) { p.h++; cur.set(key, p); prev.delete(key); } else cur.set(key, { x, y, w: x1 - x, h: 1, c });
        x = x1;
      }
      for (const r of prev.values()) flush(r);
      prev = cur;
    }
    for (const r of prev.values()) flush(r);
    let out = '';
    for (const [c, a] of by) out += `<path fill="${c}"${attrs} d="${a.join('')}"/>`;
    return out;
  }
}

// Soft light without blur or dither noise: nested solid ellipses, each its own translucent layer.
// items: [cx, cy, rx, ry, colour]; scales: radius multipliers, one layer each.
function glowLayers(W, H, items, alpha, scales = [1, 0.62], ox = -1, oy = 0, clip = null) {
  let out = '';
  for (const k of scales) {
    const g = new Pix(W, H);
    for (const [cx, cy, rx, ry, c] of items) g.ellipse(cx, cy, rx * k, ry * k, c);
    if (clip) clip(g);
    out += g.paths(ox, oy, ` fill-opacity="${alpha}"`);
  }
  return out;
}

const svgOpen = (w, h, cls, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="px ${cls}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"${extra}>`;

// The functions are pure, so identical calls are answered from a small cache.
const CACHE = new Map();
function memo(key, make) {
  let v = CACHE.get(key);
  if (v === undefined) { if (CACHE.size > 400) CACHE.clear(); v = make(); CACHE.set(key, v); }
  return v;
}

/* -------------------------------------------------------------- pixel fonts */
// Hand-drawn Hangul, 9 wide x 11 tall.
const GLYPH = {
  '동': ['.#######.', '.#.......', '.#.......', '.#######.', '....#....', '#########', '.........', '..#####..', '.#.....#.', '.#.....#.', '..#####..'],
  '시': ['..#....#.', '..#....#.', '..#....#.', '..#....#.', '.#.#...#.', '.#.#...#.', '.#.#...#.', '#...#..#.', '#...#..#.', '.......#.', '.......#.'],
  '상': ['..#...#..', '..#...#..', '..#...###', '.#.#..#..', '.#.#..#..', '#...#.#..', '.........', '..#####..', '.#.....#.', '.#.....#.', '..#####..'],
  '영': ['.###....#', '#...#.###', '#...#...#', '#...#.###', '.###....#', '........#', '.........', '..#####..', '.#.....#.', '.#.....#.', '..#####..'],
  '매': ['.....#..#', '####.#..#', '#..#.#..#', '#..#.#..#', '#..#.####', '#..#.#..#', '#..#.#..#', '####.#..#', '.....#..#', '.....#..#', '.....#..#'],
  '점': ['#####...#', '..#.....#', '..#...###', '.#.#....#', '#...#...#', '#...#...#', '.........', '.#######.', '.#.....#.', '.#.....#.', '.#######.'],
  '오': ['..#####..', '.#.....#.', '.#.....#.', '.#.....#.', '.#.....#.', '..#####..', '.........', '....#....', '....#....', '#########', '.........'],
  '늘': ['.#.......', '.#.......', '.#######.', '.........', '#########', '.........', '.#######.', '.......#.', '.#######.', '.#.......', '.#######.'],
  '의': ['.####...#', '#....#..#', '#....#..#', '#....#..#', '.####...#', '........#', '........#', '#######.#', '........#', '........#', '........#'],
  '관': ['#####..#.', '....#..#.', '....#..#.', '.#..#..##', '.#.....#.', '######.#.', '.......#.', '.#.......', '.#.......', '.#.......', '.#######.'],
  '표': ['#########', '..#...#..', '..#...#..', '..#...#..', '#########', '.........', '..#...#..', '..#...#..', '..#...#..', '#########', '.........'],
  '소': ['....#....', '....#....', '...#.#...', '..#...#..', '.#.....#.', '#.......#', '.........', '....#....', '....#....', '#########', '.........'],
  '1': ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  // 5x7 latin row letters
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
};
// 3x5 digits
const DIGIT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
};
function textWidth(str, { scale = 1, gap = 1, space = 4, font = GLYPH } = {}) {
  let w = 0;
  for (const ch of str) w += ch === ' ' ? space * scale : (font[ch][0].length + gap) * scale;
  return w - gap * scale;
}
function drawText(p, x, y, str, c, { scale = 1, gap = 1, space = 4, font = GLYPH } = {}) {
  let cx = x;
  for (const ch of str) {
    if (ch === ' ') { cx += space * scale; continue; }
    const g = font[ch];
    g.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') p.rect(cx + i * scale, y + j * scale, scale, scale, c); });
    cx += (g[0].length + gap) * scale;
  }
}
// neon lettering: 1px halo ring + bright core
function drawNeon(p, x, y, str, core, halo, opts) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) drawText(p, x + dx, y + dy, str, halo, opts);
  drawText(p, x, y, str, core, opts);
}

/* ================================================================== people */

// Paints one person (24 x 30 art pixels; feet end at row 28 => y = 58).
function person(o) {
  const p = new Pix(24, 30);
  const back = o.view === 'back';
  const H = o.hairColor, O = o.outfit, S = o.skin;
  const HL = mix(H, C.cream, 0.36), HD = mix(H, INK, 0.42);
  const OS = mix(O, '#3a1c5c', 0.36);
  const SS = mix(S, '#b0344f', 0.24), BL = mix(S, '#ff4f72', 0.42);
  const PT = o.pants || '#51448c', PTS = mix(PT, INK, 0.4);
  const SH = o.shoes || C.cream, SHS = mix(SH, '#7a5a6a', 0.4);
  const hold = o.holding || null;
  const cheer = o.mood === 'happy' && !hold;
  const M = (x) => 23 - x;
  const sym = (y, x0, x1, c) => { p.row(y, x0, x1, c); p.row(y, M(x1), M(x0), c); };
  const style = o.hat ? 'staff' : o.hair;

  // -- long hair hangs behind the body (front view only)
  if (style === 2 && !back) {
    p.rect(3, 8, 3, 13, H); p.rect(18, 8, 3, 13, H);
    p.col(5, 15, 20, HD); p.col(18, 15, 20, HD);
    p.row(21, 4, 5, HD); p.row(21, 18, 19, HD);
  }

  // -- legs + shoes
  p.rect(8, 24, 8, 1, PT);
  p.rect(9, 25, 2, 2, PT); p.rect(13, 25, 2, 2, PT);
  p.set(10, 25, PTS); p.set(10, 26, PTS); p.set(14, 25, PTS); p.set(14, 26, PTS);
  p.rect(8, 27, 3, 2, SH); p.rect(13, 27, 3, 2, SH);
  p.row(28, 8, 10, SHS); p.row(28, 13, 15, SHS);
  if (o.step === 1 || o.step === 2) { // walk frame: one foot lifted a pixel
    const fx0 = o.step === 1 ? 8 : 13;
    p.rect(fx0, 26, 3, 3, null); p.rect(fx0, 26, 3, 1, SH); p.rect(fx0, 27, 3, 1, SHS);
    p.rect(fx0 + (o.step === 1 ? 1 : 0), 25, 2, 1, PT);
  }

  // -- torso
  p.rect(8, 16, 8, 8, O);
  p.row(16, 8, 15, OS); p.row(23, 8, 15, OS);

  // -- arms
  const armDown = (x) => { p.rect(x, 17, 2, 5, O); p.rect(x, 22, 2, 1, S); };
  const armUp = (left) => { // cheering arm
    const f = left ? (x) => x : M;
    for (const x of [3, 4, 5, 6, 7]) { p.set(f(x), 16, O); p.set(f(x), 17, O); }
    for (const x of [1, 2]) { for (let y = 10; y <= 17; y++) p.set(f(x), y, O); p.set(f(x), 8, o.gloves || S); p.set(f(x), 9, o.gloves || S); }
    p.set(f(1), 17, null);
    for (const x of [2, 3, 4, 5]) p.set(f(x), 17, OS);
  };
  if (cheer) { armUp(true); armUp(false); } else {
    armDown(6); armDown(16);
    p.col(7, 18, 21, OS); p.col(16, 18, 21, OS);
    p.set(6, 22, o.gloves || S); p.set(7, 22, o.gloves || S); p.set(16, 22, o.gloves || S); p.set(17, 22, o.gloves || S);
  }

  // -- clothes detail
  if (o.hat === 'clerk') {
    // cream shirt, mint apron, red bow tie
    if (!back) {
      p.rect(8, 19, 8, 5, C.m2); p.row(19, 8, 15, C.m3); p.row(23, 8, 15, C.m1); p.row(21, 10, 13, C.m1);
      p.col(9, 17, 18, C.m2); p.col(14, 17, 18, C.m2);
      p.row(17, 10, 13, C.r3); p.row(17, 11, 12, C.r2); p.set(10, 16, C.r3); p.set(13, 16, C.r3);
    } else {
      p.col(9, 17, 19, C.m2); p.col(14, 17, 19, C.m2); p.row(20, 8, 15, C.m2); p.rect(11, 20, 2, 2, C.m3); // apron strings + bow
    }
  } else if (o.hat === 'usher') {
    // red jacket, gold buttons + epaulettes, mint bow tie
    if (!back) {
      p.col(11, 18, 22, OS); p.col(12, 18, 22, OS);
      for (const y of [19, 21]) { p.set(10, y, C.y3); p.set(13, y, C.y3); }
      p.row(17, 10, 13, C.m3); p.row(17, 11, 12, C.m1); p.set(10, 16, C.m3); p.set(13, 16, C.m3);
    }
    p.row(17, 6, 7, C.y3); p.row(17, 16, 17, C.y3);
    p.row(21, 6, 7, C.y3); p.row(21, 16, 17, C.y3); // gold cuffs
    p.col(9, 25, 26, C.r3); p.col(13, 25, 26, C.r3); // trouser stripe
  } else if (!back) {
    p.row(16, 10, 13, mix(O, C.cream, 0.7)); // collar
    if (!hold) p.row(21, 10, 13, OS);        // little pocket line
  } else {
    p.set(9, 17, OS); p.set(14, 17, OS); p.row(18, 10, 13, OS); // hood seen from behind
  }

  // -- head
  p.row(4, 7, 16, S); p.row(5, 6, 17, S); p.rect(5, 6, 14, 8, S); p.row(14, 6, 17, S); p.row(15, 7, 16, S);
  if (!back) {
    p.row(15, 7, 16, SS);
    if (o.mood === 'happy') {
      for (const [x, y] of [[7, 11], [8, 10], [9, 10], [10, 11]]) { p.set(x, y, INK); p.set(M(x), y, INK); }
      p.row(12, 10, 13, C.r1); p.row(13, 11, 12, C.r4);
    } else {
      p.rect(8, 10, 2, 2, INK); p.rect(14, 10, 2, 2, INK);
      p.row(13, 11, 12, mix(S, C.r1, 0.62));
    }
    p.row(12, 6, 7, BL); p.row(12, 16, 17, BL);
  } else {
    p.row(15, 7, 16, SS);
  }

  // -- hair / hats
  const beanie = o.beanie || C.r3, BE2 = mix(beanie, C.cream, 0.55), BED = mix(beanie, INK, 0.3);
  if (style === 0) { // bowl bob
    p.row(3, 7, 16, H); p.row(4, 5, 18, H); p.rect(4, 5, 16, 3, H);
    p.row(5, 8, 12, HL); p.set(14, 5, HL);
    if (!back) {
      p.row(8, 4, 9, H); p.row(8, 11, 19, H);
      p.row(8, 6, 9, HD); p.row(8, 11, 17, HD);
      p.rect(4, 9, 2, 5, H); p.rect(18, 9, 2, 5, H);
      p.set(5, 14, HD); p.set(18, 14, HD); p.set(4, 13, HD); p.set(19, 13, HD);
    } else {
      p.rect(4, 8, 16, 6, H); p.row(14, 5, 18, HD);
      for (const x of [7, 11, 12, 16]) p.col(x, 12, 13, HD);
    }
  } else if (style === 1) { // twin buns
    sym(1, 4, 5, H); p.rect(3, 2, 4, 2, H); p.rect(17, 2, 4, 2, H); sym(4, 4, 5, HD);
    p.set(4, 2, HL); p.set(18, 2, HL);
    p.row(3, 8, 15, H); p.row(4, 6, 17, H); p.rect(5, 5, 14, 3, H);
    p.row(5, 8, 11, HL);
    if (!back) {
      sym(8, 5, 8, H); sym(9, 5, 6, H); p.col(5, 10, 11, H); p.col(18, 10, 11, H);
      sym(8, 7, 8, HD); p.set(6, 9, HD); p.set(17, 9, HD);
    } else {
      p.rect(5, 8, 14, 4, H); p.row(12, 6, 17, HD);
      p.col(11, 3, 9, HD);
      p.col(4, 10, 11, S); p.col(19, 10, 11, S);
    }
  } else if (style === 2) { // long
    p.row(3, 7, 16, H); p.row(4, 5, 18, H); p.rect(4, 5, 16, 3, H);
    p.row(5, 7, 11, HL);
    if (!back) {
      p.row(8, 4, 11, H); p.row(8, 17, 19, H); p.row(9, 4, 7, H); p.row(9, 18, 19, H);
      p.rect(4, 10, 2, 5, H); p.rect(18, 10, 2, 5, H);
      p.row(8, 8, 11, HD); p.set(7, 9, HD);
    } else {
      p.rect(4, 8, 16, 6, H); p.rect(5, 14, 14, 7, H);
      for (const x of [6, 9, 11, 14, 16]) p.set(x, 21, H);
      for (const x of [7, 8, 10, 12, 13, 15, 17]) p.set(x, 21, HD);
      p.col(8, 13, 20, HD); p.col(15, 13, 20, HD); p.col(5, 15, 20, HD); p.col(18, 15, 20, HD);
    }
  } else if (style === 3) { // beanie with pom-pom
    p.row(0, 11, 12, C.cream); p.row(1, 10, 13, C.cream); p.set(13, 1, C.paper); p.set(12, 1, C.paper);
    p.row(2, 8, 15, beanie); p.row(3, 6, 17, beanie); p.rect(5, 4, 14, 3, beanie);
    p.row(3, 8, 10, mix(beanie, C.cream, 0.3)); p.col(18, 4, 6, BED); p.set(17, 3, BED);
    p.rect(4, 7, 16, 2, BE2);
    for (let x = 5; x <= 19; x += 2) p.set(x, 8, mix(BE2, beanie, 0.55));
    if (!back) {
      p.row(9, 5, 8, H); p.col(5, 10, 12, H); p.row(9, 17, 18, H); p.col(18, 10, 12, H);
    } else {
      p.rect(5, 9, 14, 3, H); p.row(12, 6, 17, HD);
      p.col(4, 10, 11, S); p.col(19, 10, 11, S);
    }
  } else if (o.hat === 'clerk') { // folded paper cap over short hair
    p.rect(5, 5, 14, 3, H);
    if (!back) { sym(8, 5, 6, H); p.col(5, 9, 10, H); p.col(18, 9, 10, H); p.row(7, 7, 16, HD); }
    else { p.rect(5, 8, 14, 4, H); p.row(12, 6, 17, HD); p.col(4, 10, 11, S); p.col(19, 10, 11, S); }
    p.row(1, 8, 15, C.cream); p.row(2, 6, 17, C.cream); p.rect(5, 3, 14, 2, C.cream);
    p.row(4, 5, 18, C.r3); p.row(5, 5, 18, C.cream); p.row(1, 9, 12, '#ffffff'); p.col(18, 2, 3, C.paper); p.set(17, 2, C.paper);
  } else if (o.hat === 'usher') { // pillbox hat over neat hair
    p.row(4, 6, 17, H); p.rect(5, 5, 14, 3, H); p.row(5, 8, 11, HL);
    if (!back) { sym(8, 5, 7, H); p.col(5, 9, 11, H); p.col(18, 9, 11, H); }
    else { p.rect(5, 8, 14, 4, H); p.row(12, 6, 17, HD); p.col(4, 10, 11, S); p.col(19, 10, 11, S); }
    p.rect(8, 0, 9, 4, C.r3); p.row(0, 9, 15, C.r4); p.col(16, 1, 3, C.r2);
    p.row(3, 8, 16, C.y3); p.set(12, 1, C.y3); // gold band + badge
  }

  // -- held things
  if (hold === 'popcorn' && !back) {
    // bucket hugged in front of the chest
    p.rect(6, 17, 2, 4, O); p.rect(16, 17, 2, 4, O); p.rect(6, 21, 2, 2, null);
    p.rect(16, 21, 2, 2, null); p.set(6, 22, null);
    p.row(19, 9, 14, C.cream);
    for (let y = 20; y <= 23; y++) for (let x = 9; x <= 14; x++) p.set(x, y, (x === 10 || x === 13) ? C.cream : C.r3);
    p.set(9, 23, C.r2); p.set(14, 23, C.r2); p.row(23, 10, 13, C.r2); p.set(10, 23, C.paper); p.set(13, 23, C.paper);
    p.row(18, 9, 14, C.y3); p.row(17, 10, 13, C.y4); p.set(9, 18, C.y4); p.set(12, 18, C.y4); p.set(14, 18, C.y2); p.set(11, 17, C.y3);
    p.rect(8, 20, 1, 2, S); p.rect(15, 20, 1, 2, S); p.rect(6, 20, 2, 1, O); p.rect(16, 20, 2, 1, O);
    p.rect(6, 21, 3, 1, O); p.rect(15, 21, 3, 1, O); p.set(8, 21, S); p.set(15, 21, S);
  } else if (hold === 'drink' && !back) {
    p.rect(16, 18, 4, 1, C.cream);
    p.rect(16, 19, 4, 4, C.m3); p.col(19, 19, 22, C.m2); p.row(21, 16, 19, C.cream); p.set(19, 21, C.paper);
    p.row(23, 17, 18, C.m2);
    p.col(18, 14, 17, C.r3); p.set(19, 14, C.r3);
    p.set(16, 20, S); p.set(16, 21, S); p.set(17, 22, null); p.set(16, 22, null);
    p.set(16, 22, C.m3); p.set(17, 22, C.m3);
  } else if (hold === 'popcorn' && back) {
    // bucket peeks out beside the right shoulder
    p.row(13, 18, 21, C.y4); p.row(14, 17, 22, C.y3); p.set(18, 14, C.y4); p.set(21, 14, C.y4); p.set(20, 13, C.y3);
    p.row(15, 17, 22, C.cream);
    for (let y = 16; y <= 20; y++) for (let x = 17; x <= 22; x++) p.set(x, y, (x === 18 || x === 21) ? C.cream : C.r3);
    p.set(17, 20, null); p.set(22, 20, null);
  } else if (hold === 'drink' && back) {
    p.col(20, 10, 13, C.r3); p.set(21, 10, C.r3);
    p.row(14, 18, 21, C.cream);
    p.rect(18, 15, 4, 5, C.m3); p.col(21, 15, 19, C.m2); p.row(17, 18, 21, C.cream);
  }

  if (back) { // the screen in front of them rim-lights the top of the head
    for (let x = 0; x < 24; x++) for (let y = 0; y < 12; y++) {
      const c = p.get(x, y);
      if (!c) continue;
      if (c === H) p.set(x, y, HL);
      break;
    }
  }
  p.outline(INK);
  return p;
}

const SHADOW = `<path fill="${INK}" fill-opacity=".3" d="M10 56h28v2h-28zM14 58h20v2h-20z"/>`;

/**
 * A small audience member. viewBox 0 0 48 60, feet at (24,58).
 * @param {{view?:'front'|'back', hair?:0|1|2|3, hairColor?:string, outfit?:string, skin?:string,
 *          holding?:null|'popcorn'|'drink', mood?:'idle'|'happy', shadow?:boolean}} o
 * hair: 0 bowl bob, 1 twin buns, 2 long hair, 3 beanie with pom-pom
 * extras: step 0|1|2 (two-frame walk: 1 = left foot up, 2 = right foot up), shadow false to drop the ground shadow,
 *         beanie '#hex' to override the hat colour of hair 3.
 */
export function avatarSVG(o = {}) {
  const opt = {
    view: 'front', hair: 0, hairColor: HAIR_COLORS[0], outfit: OUTFIT_COLORS[0], skin: SKIN_TONES[0],
    holding: null, mood: 'idle', shadow: true, step: 0, ...o,
  };
  opt.hair = ((opt.hair | 0) % 4 + 4) % 4;
  if (opt.hair === 3 && !opt.beanie) {
    // the beanie takes a colour that contrasts with the outfit
    const i = OUTFIT_COLORS.indexOf(opt.outfit);
    opt.beanie = OUTFIT_COLORS[((i < 0 ? 0 : i) + 3) % OUTFIT_COLORS.length];
  }
  return memo('a' + JSON.stringify(opt), () => svgOpen(48, 60, `px-avatar px-${opt.view}`) + (opt.shadow ? SHADOW : '') + person(opt).paths() + '</svg>');
}

/**
 * Staff. kind 'clerk' (concession, paper cap + bow tie + apron) | 'usher' (pillbox hat, red jacket, gold buttons).
 * Same 48x60 box and proportions as avatarSVG. Optional second arg { view:'front'|'back', mood }.
 */
export function npcSVG(kind = 'clerk', o = {}) {
  const base = kind === 'usher'
    ? { hat: 'usher', hairColor: '#3d2c58', outfit: C.r2, skin: SKIN_TONES[1], pants: '#2e2350', shoes: '#3b2763', gloves: C.cream }
    : { hat: 'clerk', hairColor: '#6b3a2a', outfit: C.cream, skin: SKIN_TONES[0], pants: '#51448c', shoes: C.cream };
  const opt = { view: 'front', holding: null, mood: 'idle', shadow: true, ...base, ...o };
  return memo('n' + JSON.stringify(opt), () => svgOpen(48, 60, `px-npc px-${kind}`) + (opt.shadow ? SHADOW : '') + person(opt).paths() + '</svg>');
}

/* ================================================================== popcorn */

const POPCORN_KINDS = {
  butter: { k1: '#fff1a8', k2: '#ffd34d', k3: '#f0a92e', stripe: C.r3, stripeD: C.r2 },
  caramel: { k1: '#f6c069', k2: '#d98a2e', k3: '#9a5320', stripe: C.m2, stripeD: C.m1 },
  cheese: { k1: '#ffd596', k2: '#ffa63d', k3: '#e2701f', stripe: C.p4, stripeD: C.p3 },
};

/** Popcorn bucket. viewBox 0 0 40 48. kind 'butter'|'caramel'|'cheese', level 0..1 (how full). */
export function popcornSVG({ kind = 'butter', level = 1 } = {}) {
  const k = POPCORN_KINDS[kind] || POPCORN_KINDS.butter;
  const L = Math.max(0, Math.min(1, +level || 0));
  const p = new Pix(20, 24);
  // bucket body (tapered), 2px stripes
  const body = (y) => (y <= 14 ? [3, 16] : y <= 18 ? [4, 15] : [5, 14]);
  for (let y = 12; y <= 22; y++) {
    const [a, b] = body(y);
    for (let x = a; x <= b; x++) {
      const s = ((x - 3) >> 1) % 2 === 0;
      let c = s ? k.stripe : C.cream;
      if (x >= b - 1) c = s ? k.stripeD : C.paper;
      if (y === 22) c = s ? k.stripeD : C.paper;
      p.set(x, y, c);
    }
  }
  // badge
  p.rect(7, 15, 6, 4, C.cream); p.row(14, 8, 11, C.cream); p.row(19, 8, 11, C.cream);
  p.rect(9, 15, 2, 4, k.k2); p.row(16, 8, 11, k.k2); p.row(17, 8, 11, k.k2); p.set(9, 16, k.k1);
  // rim: back lip, opening, front lip
  p.row(8, 3, 16, C.paper);
  p.rect(2, 9, 16, 2, C.r0); p.row(9, 3, 16, mix(k.stripeD, INK, 0.45));
  p.row(11, 2, 17, C.cream); p.set(17, 11, C.paper); p.set(16, 11, C.paper);
  // heap
  const h = Math.round(L * 9);
  const kern = (x, y) => { const n = (x * 7 + y * 13 + x * y) % 7; return n < 2 ? k.k1 : n < 5 ? k.k2 : k.k3; };
  if (L > 0.02) {
    for (let x = 3; x <= 16; x++) {
      const t = 1 - ((x - 9.5) / 7.5) ** 2;
      const top = h === 0 ? 10 : 10 - Math.max(0, Math.round(h * (0.25 + 0.75 * t)) - (((x * 5) % 3) === 0 ? 1 : 0));
      for (let y = Math.max(1, top); y <= 10; y++) p.set(x, y, y === top ? k.k1 : kern(x, y));
    }
    if (h >= 6) { p.set(2, 8, k.k2); p.set(17, 9, k.k2); p.set(1, 9, k.k1); p.set(18, 8, k.k1); } // overflowing
  } else {
    p.set(6, 10, k.k2); p.set(12, 10, k.k3); // two lonely crumbs
  }
  p.outline(INK);
  return svgOpen(40, 48, 'px-popcorn') + `<path fill="${INK}" fill-opacity=".3" d="M8 44h24v2h-24zM10 46h20v2h-20z"/>` + p.paths() + '</svg>';
}

/** Torn ticket stub. viewBox 0 0 72 36. */
export function ticketStubSVG() {
  return memo('ticket', () => {
    const p = new Pix(36, 18);
    p.rect(2, 3, 32, 12, C.cream);
    p.rect(2, 3, 32, 1, '#ffffff'); p.rect(2, 14, 32, 1, C.paper);
    p.rect(2, 3, 9, 12, C.y3); p.rect(2, 14, 9, 1, C.y2);
    for (let y = 4; y <= 13; y += 2) p.set(11, y, C.r2); // perforation
    for (const y of [5, 8, 11]) { p.set(2, y, null); p.set(33, y, null); } // punched edge
    p.art(4, 6, ['..#..', '.###.', '#####', '.###.', '#.#.#'], { '#': C.r2 });
    drawText(p, 15, 4, '1관', C.r2, { gap: 2 });
    p.outline(INK);
    return svgOpen(72, 36, 'px-ticket') + p.paths() + '</svg>';
  });
}

/** Placeholder still for the lobby poster slot when nothing is scheduled. viewBox 0 0 96 54 (16:9). */
export function posterPlaceholderSVG() {
  return memo('poster', () => {
    const p = new Pix(48, 27);
    p.rect(0, 0, 48, 8, C.p1); p.rect(0, 8, 48, 6, C.p2); p.rect(0, 14, 48, 5, C.p3); p.rect(0, 19, 48, 8, C.p4);
    p.dither(0, 7, 48, 1, C.p2); p.dither(0, 13, 48, 1, C.p3); p.dither(0, 18, 48, 1, C.p4);
    for (const [x, y] of [[4, 3], [11, 6], [18, 2], [25, 5], [43, 4], [39, 10], [7, 11]]) p.set(x, y, C.cream);
    p.fn(27, 2, 13, 13, (i, j) => { const d = Math.hypot(i - 33, j - 8); return d <= 4.6 ? (i + j > 44 ? C.y3 : C.y4) : null; });
    p.set(31, 7, C.y3); p.set(34, 10, C.y2); p.set(35, 6, C.y3);
    p.fn(0, 15, 48, 12, (i, j) => (j >= 21 - Math.round(3 * Math.sin(i / 7 + 1)) ? '#3a2764' : null));
    p.fn(0, 17, 48, 10, (i, j) => (j >= 24 - Math.round(2.5 * Math.sin(i / 9 + 4)) ? INK : null));
    // a little house with one window still lit
    p.rect(10, 18, 7, 5, INK); p.row(17, 11, 15, INK); p.row(16, 12, 14, INK); p.rect(12, 19, 2, 2, C.y3); p.set(15, 15, INK); p.set(15, 14, INK);
    return svgOpen(96, 54, 'px-poster') + p.paths() + '</svg>';
  });
}

/* ===================================================================== seat */

const SEAT_TONES = {
  empty: { b: '#74203c', hl: '#8c2a47', rim: '#b9648a', sd: '#551530', line: INK, plate: '#8a6a2a', arm: '#33224f', armHi: '#5a4390' },
  taken: { b: '#9c2640', hl: '#bd3b4d', rim: '#e08a9c', sd: '#6b1b36', line: INK, plate: '#c9922e', arm: '#3b2763', armHi: '#6a4fa6' },
  mine: { b: '#e2434b', hl: '#ff7a6b', rim: '#ffd9b0', sd: '#a3273f', line: C.y3, plate: C.y4, arm: '#54398a', armHi: '#8a6cc8' },
};

// seat back at pixel (x,y); w pixels wide, always 20 tall
function drawSeat(p, x, y, w, state) {
  const t = SEAT_TONES[state] || SEAT_TONES.empty;
  const R = x + w - 1;
  // outline silhouette
  p.row(y, x + 4, R - 4, t.line); p.row(y + 1, x + 2, R - 2, t.line); p.rect(x + 1, y + 2, w - 2, 18, t.line);
  // cushion
  p.row(y + 1, x + 4, R - 4, t.rim); p.row(y + 2, x + 2, R - 2, t.hl); p.set(x + 2, y + 2, t.rim); p.set(x + 3, y + 2, t.rim); p.set(R - 2, y + 2, t.rim); p.set(R - 3, y + 2, t.rim);
  p.rect(x + 2, y + 3, w - 4, 11, t.b);
  p.row(y + 3, x + 3, x + 6, t.hl);
  p.col(R - 2, y + 3, y + 13, t.sd); p.row(y + 13, x + 2, R - 2, t.sd);
  for (let j = y + 10; j <= y + 12; j++) for (let i = x + 3; i <= R - 3; i++) if ((i + j) % 2 === 0 && j - y - 9 > (R - 3 - i) / 3) p.set(i, j, t.sd);
  // tuft buttons
  p.set(x + Math.round(w / 3), y + 7, t.sd); p.set(R - Math.round(w / 3), y + 7, t.sd);
  // lower shell + number plate
  p.rect(x + 2, y + 14, w - 4, 6, t.sd); p.row(y + 14, x + 2, R - 2, mix(t.sd, INK, 0.45));
  const cx = x + (w >> 1);
  p.rect(cx - 2, y + 16, 4, 2, t.plate);
  // armrests
  for (const ax of [x, R - 3]) {
    p.rect(ax, y + 10, 4, 10, t.line); p.rect(ax + 1, y + 11, 2, 9, t.arm); p.row(y + 11, ax + 1, ax + 2, t.armHi);
  }
}

/**
 * One seat back. viewBox 0 0 44 40. state 'empty'|'mine'|'taken'.
 * Draw it at a hallSeatRects() rect, IN FRONT of the seated back-view avatar.
 */
export function seatSVG({ state = 'empty' } = {}) {
  const p = new Pix(22, 20);
  drawSeat(p, 0, 0, 22, state);
  return svgOpen(44, 40, `px-seat px-seat-${state}`) + p.paths() + '</svg>';
}

/* ===================================================================== hall */

/**
 * Seat rectangles in hallSVG's coordinate space (viewBox 390 x 300).
 * Returns [{ row, col, x, y, w, h, label, ax, ay }] — (ax, ay) is the top-left
 * corner for a 48x60 back-view avatar sitting in that seat.
 */
export function hallSeatRects({ rows = 4, cols = 6 } = {}) {
  rows = Math.max(1, Math.min(8, rows | 0)); cols = Math.max(2, Math.min(10, cols | 0));
  const left = Math.ceil(cols / 2), right = cols - left, gap = 4, side = 148;
  const per = Math.max(left, right);
  const w = Math.min(44, Math.floor((side - (per - 1) * gap) / per / 2) * 2), h = 40;
  const top = 46;
  const pitch = rows > 1 ? Math.min(62, Math.floor((300 - 28 - h - top) / (rows - 1) / 2) * 2) : 0;
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c < left ? 175 - (left - c) * w - (left - c - 1) * gap : 215 + (c - left) * (w + gap);
    const y = top + r * pitch;
    out.push({ row: r, col: c, x, y, w, h, label: String.fromCharCode(65 + r) + (c + 1), ax: x + w / 2 - 24, ay: y - 38 });
  }
  return out;
}

/** Seating area seen from behind (the screen sits directly above it). viewBox 0 0 390 300. */
export function hallSVG({ rows = 4, cols = 6 } = {}) {
  return memo('hall' + rows + 'x' + cols, () => {
    const W = 196, H = 150, p = new Pix(W, H);
    const seats = hallSeatRects({ rows, cols });
    const rowY = [...new Set(seats.map((s) => s.y / 2))];
    const FLOOR = '#221638', FLOOR2 = '#281b42';
    // stepped floor: each row stands on its own tread
    rowY.forEach((gy, i) => {
      const y0 = gy - 5, y1 = i + 1 < rowY.length ? rowY[i + 1] - 5 : H;
      if (i % 2 === 0) p.rect(0, y0, W, y1 - y0, FLOOR2);
      p.rect(0, y0, W, 1, '#3a2862');
      p.rect(0, y0 + 1, W, 1, '#1a112e');
    });
    // light spilling from the screen onto the front floor
    p.rect(0, 4, W, 3, '#4a3684'); p.rect(0, 7, W, 3, '#3d2c6e'); p.rect(0, 10, W, 3, '#30225a');
    p.rect(30, 4, 136, 2, '#5d46a0'); p.rect(60, 4, 76, 1, '#7a62bd');
    // stage lip
    p.rect(0, 0, W, 2, C.w1); p.rect(0, 2, W, 1, C.y1); p.rect(0, 3, W, 1, INK);
    for (let x = 6; x < W; x += 12) p.rect(x, 0, 1, 2, C.w2);
    // centre aisle runner
    p.rect(88, 4, 20, H - 4, '#3d1230'); p.col(89, 4, H - 1, '#6a1b3a'); p.col(106, 4, H - 1, '#6a1b3a');
    for (let y = 12; y < H; y += 12) { p.rect(97, y, 2, 2, '#5a1836'); p.set(96, y + 1, '#5a1836'); p.set(99, y, '#5a1836'); }
    // side walls
    p.rect(0, 3, 4, H, '#150e26'); p.rect(192, 3, 4, H, '#150e26'); p.col(3, 3, H - 1, C.p1); p.col(192, 3, H - 1, C.p1);
    // back rail
    p.rect(0, H - 6, 88, 6, '#150e26'); p.rect(108, H - 6, 88, 6, '#150e26');
    p.rect(0, H - 6, 88, 1, '#3a2862'); p.rect(108, H - 6, 88, 1, '#3a2862');
    // row letters + seats
    rowY.forEach((gy, i) => {
      p.box(5, gy + 4, 9, 11, C.p1, '#150e26');
      drawText(p, 7, gy + 6, String.fromCharCode(65 + i), C.p5);
    });
    for (const s of seats) drawSeat(p, (s.x + 1) / 2, s.y / 2, s.w / 2, 'empty');
    // aisle floor lights
    const light = (x, y) => {
      p.rect(x - 1, y, 4, 2, C.m1); p.rect(x, y - 1, 2, 4, C.m1); p.rect(x, y, 2, 2, C.m3); p.set(x, y, C.m4);
    };
    rowY.forEach((gy) => { for (const dy of [-9, 17]) { light(90, gy + dy); light(104, gy + dy); } });
    return svgOpen(390, 300, 'px-hall') + `<rect width="390" height="300" fill="${FLOOR}"/>` + p.paths(-1, 0) + '</svg>';
  });
}

/* ================================================================== curtain */

/** Widths/heights (viewBox units) of the separately drawable curtain parts. */
export const CURTAIN_PARTS = { left: { x: 0, w: 196 }, right: { x: 196, w: 194 }, valance: { h: 52 } };

/**
 * Closed theatre curtain with a swagged valance. viewBox 0 0 390 220, preserveAspectRatio none.
 * part 'all' (default) is the whole closed curtain. For an opening animation draw three layers instead:
 * 'left' (viewBox 0 0 196 220) and 'right' (viewBox 0 0 194 220) panels that slide apart, under a fixed
 * 'valance' (viewBox 0 0 390 52).
 */
export function curtainSVG({ part = 'all' } = {}) {
  return memo('curtain' + part, () => {
    const W = 195, H = 110, p = new Pix(W, H);
    const T = [C.r0, C.r1, C.r2, C.r3, C.r4];
    // tone index (x2 so odd numbers mean "dither between neighbours") across one 13px fold
    const FOLD = [0, 2, 2, 4, 4, 5, 6, 6, 8, 6, 5, 4, 2];
    const tone = (x, y, dark = 0) => {
      const f = FOLD[Math.abs(x - 97) % 13];
      const t = f % 2 === 0 ? f / 2 : ((x + y) % 2 === 0 ? (f - 1) / 2 : (f + 1) / 2);
      return T[Math.max(0, Math.min(4, t - dark))];
    };
    const edge = (x) => { const k = ((x % 39) - 19) / 19.5; return Math.round(11 + 12 * (1 - k * k)); };
    const panels = part !== 'valance', valance = part === 'all' || part === 'valance';
    const xa = part === 'right' ? 98 : 0, xb = part === 'left' ? 97 : W - 1;
    for (let x = xa; x <= xb; x++) {
      const e = edge(x);
      if (panels) {
        const valley = Math.abs(x - 97) % 13 <= 1;
        const bottom = valley ? H - 3 : H - 1;
        for (let y = 0; y < H; y++) {
          let c;
          if (y > bottom) c = INK;
          else if (y >= H - 12 && y <= H - 11) c = y === H - 12 ? C.y2 : C.y1; // gold hem band
          else c = tone(x, y, y <= e + 3 ? 2 : y <= e + 5 ? 1 : y >= H - 10 ? 1 : 0);
          p.set(x, y, c);
        }
      }
      if (valance) { // draped swag, bands follow the lower edge
        for (let y = 4; y <= e; y++) {
          const d = e - y;
          let c = d <= 0 ? ((x & 1) ? C.y3 : C.y2) : d === 1 ? ((x & 1) ? C.y1 : C.y3) : d <= 3 ? C.r1 : d <= 5 ? C.r2 : d <= 8 ? C.r3 : d <= 10 ? C.r2 : C.r1;
          if (d === 6 && (x + y) % 2) c = C.r4;
          if (d > 10 && d <= 12 && (x + y) % 2) c = C.r2;
          p.set(x, y, c);
        }
      }
    }
    if (panels && part !== 'right') p.col(97, part === 'all' ? edge(97) + 1 : 0, H - 1, C.r0); // centre seam belongs to the left panel
    if (valance) {
      for (let x = 0; x <= W; x += 39) { p.rect(x - 1, 9, 3, 6, C.y2); p.rect(x - 1, 15, 3, 3, C.y3); p.rect(x - 1, 9, 3, 1, C.y4); p.col(x + 1, 10, 17, C.y1); }
      p.rect(0, 0, W, 3, C.p1); p.rect(0, 3, W, 1, C.y2); p.rect(0, 0, W, 1, C.p2);
      for (let x = 4; x < W; x += 13) p.set(x, 1, C.y3);
    }
    const vb = part === 'left' ? [196, 220] : part === 'right' ? [194, 220] : part === 'valance' ? [390, 52] : [390, 220];
    return svgOpen(vb[0], vb[1], `px-curtain px-curtain-${part}`, ' preserveAspectRatio="none"') + p.paths(part === 'right' ? -196 : 0, 0) + '</svg>';
  });
}

/* ==================================================================== lobby */

/** Fixed spots in lobbySVG coordinates (viewBox 390 x 560) — handy for placing things. */
export const LOBBY_SPOTS = {
  poster: { x: 147, y: 70, w: 96, h: 54 },          // 16:9 thumbnail slot
  clerk: { x: 71, y: 142, clip: 38 },                // counter-top line; show only the top `clip` units of the sprite above it
  usher: { x: 365, y: 232 },                         // feet point
  counter: { x: 0, y: 140, w: 130, h: 84 },          // tap target for the concession
  doors: { x: 279, y: 84, w: 96, h: 126 },           // tap target for hall 1
  walk: { x: 24, y: 240, w: 342, h: 285 },           // feet may roam here
  solid: [                                           // furniture footprints (keep feet out; pad ~20 units sideways)
    { kind: 'bench', x: 6, y: 470, w: 84, h: 64 },
    { kind: 'lamp', x: 92, y: 448, w: 30, h: 86 },
    { kind: 'plant', x: 312, y: 438, w: 74, h: 96 },
    { kind: 'rope', x: 276, y: 210, w: 62, h: 28 },
  ],
  floorY: 210,
};

function carpet(p, y0, W, H) {
  // two-tone harlequin diamonds in 2px cells with dull gold studs on the crossings
  const ALT = '#742140', STUD = '#c58d3c', STUD_D = '#8d3a45', BUD = '#8a2c4e';
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
    const I = x >> 1, J = (y - y0) >> 1;
    const u = I + J, v = I - J + 1024;
    const a = u % 8, b = v % 8;
    let c = ((u >> 3) + (v >> 3)) % 2 === 0 ? ALT : null;
    if (a === 0 && b === 0) c = (x & 1) === 0 && ((y - y0) & 1) === 0 ? STUD : STUD_D;
    else if (a === 4 && b === 4) c = BUD;
    if (c) p.set(x, y, c);
  }
}

/** Lobby background without avatars. viewBox 0 0 390 560 (wall above y=210, carpet below). */
export function lobbySVG() {
  return memo('lobby', () => {
    const W = 196, H = 280, FL = 105;
    const bg = new Pix(W, H), shade = new Pix(W, H), p = new Pix(W, H);
    const WALL = C.p2, CARPET = '#661a39', LAMP_X = 54;
  
    /* ---- wall ---- */
    for (let x = 4; x < W; x += 8) bg.rect(x, 6, 4, 70, '#432c70');
    for (let x = 2; x < W; x += 8) for (let y = 16 + ((x >> 3) % 2) * 7; y < 72; y += 14) { bg.set(x, y, '#4f3786'); bg.set(x - 1, y + 1, '#4f3786'); bg.set(x + 1, y + 1, '#4f3786'); bg.set(x, y + 2, '#4f3786'); }
    bg.rect(0, 0, W, 5, C.p1); bg.rect(0, 5, W, 1, C.p3); bg.rect(0, 6, W, 1, INK); bg.dither(0, 7, W, 2, C.p1);
    // film-strip dado rail
    bg.rect(0, 76, W, 8, INK);
    for (let x = 0; x < W; x += 4) { bg.rect(x + 1, 77, 2, 1, C.paper); bg.rect(x + 1, 82, 2, 1, C.paper); }
    for (let x = 1, k = 0; x < W; x += 8, k++) bg.rect(x, 78, 6, 4, k % 3 === 1 ? C.p3 : C.p1);
    // wainscot
    bg.rect(0, 84, W, 18, '#2f1f52');
    for (let x = 2; x < W; x += 16) { bg.rect(x, 87, 12, 1, C.p1); bg.col(x, 87, 98, C.p1); bg.rect(x, 98, 13, 1, '#463078'); bg.col(x + 12, 87, 98, '#463078'); }
    bg.rect(0, 102, W, 3, INK); bg.rect(0, 102, W, 1, C.p2);
  
    /* ---- carpet ---- */
    carpet(bg, FL, W, H);
    bg.rect(0, FL, W, 2, '#3a0f26');
  
    /* ---- light + shadow overlays (translucent solid steps; drawn between background and fixtures) ---- */
    const PINK = '#ff9d8a', WARM = '#ffc45e', MINTG = '#6fe0b7';
    const wallOnly = (g) => g.rect(0, 102, W, H - 102, null);
    const floorOnly = (g) => g.rect(0, 0, W, FL + 2, null);
    const overlays =
      glowLayers(W, H, [[97.5, 48, 46, 32, PINK], [32.5, 14, 23, 13, PINK], [163.5, 32, 21, 13, PINK], [163.5, 14, 34, 11, MINTG]], 0.065, [1, 0.8, 0.6], -1, 0, wallOnly)
      + glowLayers(W, H, [[97.5, 172, 84, 58, WARM]], 0.05, [1, 0.7, 0.4], -1, 0, floorOnly)
      + glowLayers(W, H, [[97.5, 106, 42, 12, WARM], [163.5, 106, 30, 11, WARM]], 0.06, [1, 0.6], -1, 0, floorOnly)
      + glowLayers(W, H, [[LAMP_X, 258, 36, 17, WARM], [LAMP_X, 232, 16, 14, WARM]], 0.07, [1, 0.62], -1, 0, floorOnly);
    // vignette: the far corners of the carpet sink into the dark (two solid steps, chunky 2px edge)
    const vig = (th) => {
      const g = new Pix(W, H);
      g.fn(0, FL, W, H - FL, (i, j) => (((((i >> 1) << 1) - 97.5) / 104) ** 2 + ((((j >> 1) << 1) - 172) / 96) ** 2 > th ? INK : null));
      return g.paths(-1, 0, ' fill-opacity=".2"');
    };
  
    /* ---- CENTRE: lit poster frame + sign ---- */
    const fx = 68, fy = 29, fw = 60, fh = 39;
    p.rect(fx, fy, fw, fh, INK); p.rect(fx + 1, fy + 1, fw - 2, fh - 2, C.r1);
    p.row(fy + 1, fx + 1, fx + fw - 2, C.r2); p.col(fx + 1, fy + 1, fy + fh - 2, C.r2);
    p.rect(fx + 5, fy + 5, fw - 10, fh - 10, INK);
    p.rect(fx + 6, fy + 6, 48, 27, '#120c22'); // the 16:9 slot = units (147,70,96,54)
    p.fn(fx + 6, fy + 6, 48, 27, (i, j) => (((i - j + 400) % 24 < 5) && (i + j) % 2 === 0 ? C.p1 : null));
    const bulb = (x, y, k) => { p.rect(x, y, 2, 2, k % 2 ? C.y3 : C.y4); p.set(x + 1, y + 1, k % 2 ? C.y2 : C.y3); };
    for (let k = 0; k < 14; k++) { bulb(fx + 3 + 4 * k, fy + 2, k); bulb(fx + 3 + 4 * k, fy + fh - 4, k + 1); }
    for (let k = 1; k < 8; k++) { const y = fy + 2 + Math.round((k * 33) / 8); bulb(fx + 2, y, k); bulb(fx + fw - 4, y, k + 1); }
    // sign 오늘의 상영 hanging on two chains
    for (const x of [75, 120]) for (let y = 6; y < 12; y++) p.set(x, y, y % 2 ? C.y1 : C.y3);
    p.box(69, 12, 58, 15, C.cream); p.row(25, 70, 125, C.paper); p.row(13, 70, 125, '#ffffff');
    drawText(p, 72, 14, '오늘의 상영', C.p1);
  
    /* ---- LEFT: concession ---- */
    // recess behind the counter
    p.rect(2, 36, 62, 35, '#231640'); p.col(2, 36, 70, INK); p.col(63, 36, 70, INK);
    p.fn(3, 36, 60, 3, (i, j) => ((i + j) % 2 === 0 || j === 36 ? INK : null)); // awning shadow
    // glow of the popcorn machine on the recess wall
    p.ellipse(16, 56, 17, 20, '#35225e'); p.ellipse(16, 56, 13, 16, '#48307a');
    // shelf + goods
    p.rect(29, 51, 15, 1, C.w3); p.rect(29, 52, 15, 1, C.w1);
    p.rect(30, 46, 3, 5, C.r3); p.row(47, 30, 32, C.cream); p.rect(34, 47, 3, 4, C.y3); p.set(35, 48, C.y1);
    p.rect(38, 45, 4, 6, C.m2); p.row(45, 38, 41, C.m3); p.row(47, 38, 41, C.cream);
    // menu board
    p.box(45, 37, 18, 22, C.w3); p.rect(47, 39, 14, 18, '#1d5a56');
    const menu = [
      [['.y.', 'yyy', 'rcr', 'rcr', 'rcr'], '45'],
      [['..r', 'ccc', 'mmm', 'mmm', '.m.'], '30'],
      [['.k.', 'kkk', 'kkk', '.k.', '.c.'], '20'],
    ];
    menu.forEach(([icon, price], r) => {
      const y = 40 + r * 6;
      p.art(48, y, icon, { y: C.y3, r: C.r3, c: C.cream, m: C.m3, k: '#ff8fa3' });
      drawText(p, 53, y, price, C.cream, { font: DIGIT });
    });
    // popcorn machine
    const mx = 5, my = 39;
    p.rect(mx - 1, my + 1, 24, 31, INK); p.row(my, mx + 2, mx + 19, INK);
    p.row(my + 1, mx + 3, mx + 18, C.r4); p.rect(mx + 1, my + 2, 20, 3, C.r3); p.row(my + 4, mx + 1, mx + 20, C.r2);
    for (const x of [mx + 5, mx + 10, mx + 15]) p.rect(x, my + 2, 2, 2, C.y4);
    p.rect(mx, my + 5, 22, 1, C.y3);
    p.rect(mx, my + 6, 22, 19, C.r2); p.rect(mx + 2, my + 6, 18, 19, C.y4);
    p.rect(mx + 2, my + 6, 18, 3, C.cream);
    p.rect(mx + 10, my + 6, 2, 2, C.p3); p.rect(mx + 7, my + 8, 8, 3, C.p4); p.row(my + 8, mx + 7, mx + 14, C.p5); p.row(my + 11, mx + 8, mx + 13, C.p2);
    const pile = [3, 4, 5, 6, 7, 8, 8, 9, 10, 10, 9, 9, 8, 7, 6, 5, 4, 3];
    pile.forEach((hh, k) => {
      const x = mx + 2 + k;
      for (let y = my + 25 - hh; y < my + 25; y++) {
        const n = (x * 7 + y * 11 + ((x * y) % 3)) % 9;
        p.set(x, y, y === my + 25 - hh ? C.cream : n === 0 || n === 5 ? C.cream : n === 3 ? C.y2 : C.y3);
      }
    });
    p.set(mx + 4, my + 8, '#ffffff'); p.set(mx + 3, my + 9, '#ffffff'); p.set(mx + 5, my + 7, '#ffffff'); p.set(mx + 17, my + 12, '#ffffff'); p.set(mx + 18, my + 11, '#ffffff');
    p.rect(mx, my + 25, 22, 6, C.r3); p.rect(mx, my + 25, 22, 1, C.y3); p.rect(mx, my + 29, 22, 2, C.r2); p.rect(mx + 10, my + 27, 2, 1, C.y3);
    // things on the counter (right of the clerk)
    p.rect(47, 61, 7, 10, INK);
    p.row(62, 48, 52, C.cream); p.row(63, 49, 51, C.r3); p.row(64, 48, 52, C.cream); p.row(65, 49, 51, C.r3); p.row(66, 48, 52, C.cream);
    p.rect(49, 67, 3, 4, C.cream); p.row(68, 49, 51, C.r3);
    p.rect(55, 62, 7, 9, INK); p.row(63, 56, 60, C.r3); p.rect(56, 64, 5, 7, C.p5);
    p.set(56, 66, '#ff8fa3'); p.set(58, 65, C.y3); p.set(60, 67, C.m3); p.set(57, 68, C.m3); p.set(59, 69, '#ff8fa3'); p.set(58, 67, C.cream); p.set(60, 69, C.y3); p.set(56, 70, C.y3);
    // awning
    p.rect(0, 22, 66, 12, INK);
    for (let x = 1; x <= 64; x++) {
      const s = ((x - 1) >> 2) % 2 === 0;
      p.col(x, 23, 24, s ? C.r4 : '#ffffff'); p.col(x, 25, 30, s ? C.r3 : C.cream); p.col(x, 31, 32, s ? C.r2 : C.paper);
      const k = (x - 1) % 4;
      p.col(x, 33, 34, s ? C.r2 : C.paper); if (k === 1 || k === 2) p.set(x, 35, s ? C.r1 : C.paper);
      p.set(x, 33, s ? C.r3 : C.cream);
    }
    // 매점 lightbox on top of the awning
    p.rect(24, 21, 2, 2, INK); p.rect(40, 21, 2, 2, INK);
    p.box(19, 6, 28, 16, C.y3); p.row(7, 20, 45, C.y4); p.row(20, 20, 45, C.y2);
    drawText(p, 23, 9, '매점', '#8f1d36', { gap: 2 });
    // counter
    p.rect(0, 71, 66, 2, C.cream); p.row(71, 0, 65, '#ffffff'); p.rect(0, 73, 66, 1, C.paper); p.rect(0, 74, 66, 1, INK);
    p.rect(0, 75, 65, 35, '#2b8a78'); p.col(65, 71, 110, INK); p.row(75, 0, 64, C.m3);
    for (const x of [3, 23, 43]) {
      p.rect(x, 79, 19, 23, C.m2); p.row(79, x, x + 18, C.m3); p.col(x, 79, 101, C.m3); p.row(101, x, x + 18, C.m1); p.col(x + 18, 79, 101, C.m1);
    }
    for (const x of [11, 51]) p.art(x, 88, ['.#.', '###', '###', '.#.'], { '#': C.y3 });
    p.art(27, 84, [
      '...kk.kk...',
      '..kYykYyk..',
      '.kyyYyyYyk.',
      'kYyyyyyyyYk',
      'kkkkkkkkkkk',
      'kccccccccck',
      'kwrrwwwrrwk',
      '.kwrwwwrwk.',
      '.kwrrwrrwk.',
      '.kwrrwrrwk.',
      '..kwrwrwk..',
      '..kkkkkkk..',
    ], { k: INK, y: C.y3, Y: C.y4, w: C.cream, r: C.r3, c: C.cream });
    p.rect(0, 104, 65, 6, C.m1); p.row(104, 0, 64, '#17534d'); p.rect(0, 110, 66, 1, INK);
    shade.fn(0, 111, 68, 3, (i, j) => (j === 111 || (i + j) % 2 === 0 ? INK : null));
  
    /* ---- RIGHT: neon, 1관 sign, double doors, rope ---- */
    p.box(139, 6, 50, 17, '#150e26', C.p1);
    drawNeon(p, 143, 9, '동시상영', C.m4, C.m2, { gap: 2 });
    p.box(152, 25, 24, 15, C.y3); p.row(26, 153, 174, C.y4); p.row(38, 153, 174, C.y2);
    drawText(p, 156, 27, '1관', C.p1, { gap: 2 });
    p.rect(163, 40, 2, 2, INK);
    const dx = 140, dy = 42;
    p.rect(dx - 1, dy - 1, 50, 64, INK); p.rect(dx, dy, 48, 63, C.w2); p.row(dy, dx, dx + 47, C.w3); p.col(dx, dy, 104, C.w3);
    p.rect(dx + 2, dy + 2, 44, 61, INK);
    const leaf = (x0, handleX) => {
      p.rect(x0, dy + 3, 21, 60, C.m2); p.row(dy + 3, x0, x0 + 20, C.m3); p.col(x0, dy + 3, 104, C.m3); p.col(x0 + 20, dy + 4, 104, C.m1);
      // porthole: brass ring, dark glass, one glint
      const cx = x0 + 10, cy = dy + 15;
      p.fn(cx - 6, cy - 6, 13, 13, (i, j) => {
        const d = Math.hypot(i - cx, j - cy);
        if (d <= 3.6) return j > cy + 1 ? C.p1 : C.p2;
        if (d <= 4.7) return INK;
        if (d <= 5.8) return (i + j < cx + cy) ? C.y3 : C.y2;
        return null;
      });
      p.set(cx - 2, cy - 2, C.p5); p.set(cx - 1, cy - 3, C.p5); p.set(cx - 2, cy - 1, C.p4);
      // inset panel
      p.rect(x0 + 3, dy + 27, 15, 24, '#2f957f'); p.row(dy + 27, x0 + 3, x0 + 17, C.m1); p.col(x0 + 3, dy + 27, dy + 50, C.m1);
      p.row(dy + 50, x0 + 3, x0 + 17, C.m3); p.col(x0 + 17, dy + 28, dy + 50, C.m3);
      // kick plate + push bar
      p.rect(x0 + 1, dy + 55, 19, 8, C.y2); p.row(dy + 55, x0 + 1, x0 + 19, C.y3); p.rect(x0 + 1, dy + 61, 19, 2, C.y1);
      p.rect(handleX - 1, dy + 28, 3, 13, INK); p.col(handleX, dy + 29, dy + 39, C.y4);
    };
    leaf(dx + 2, dx + 20); leaf(dx + 25, dx + 27);
    // rope stanchion barring the left leaf
    const post = (x) => {
      p.rect(x - 3, 113, 8, 5, INK); p.rect(x - 2, 114, 6, 2, C.y2); p.row(114, x - 2, x + 3, C.y3); p.rect(x - 2, 116, 6, 1, C.y1);
      p.rect(x - 1, 96, 4, 18, INK); p.rect(x, 99, 2, 15, C.y2); p.col(x, 99, 113, C.y3);
      p.rect(x - 2, 94, 6, 5, INK); p.rect(x - 1, 95, 4, 3, C.y3); p.set(x - 1, 95, C.y4); p.set(x, 95, C.y4); p.row(97, x - 1, x + 2, C.y2);
    };
    for (let x = 146; x <= 165; x++) {
      const k = (x - 155.5) / 10.5, y = 100 + Math.round(6 * (1 - k * k));
      p.set(x, y - 1, INK); p.set(x, y, C.r3); p.set(x, y + 1, C.r1); p.set(x, y + 2, INK);
    }
    post(143); post(166);
    shade.fn(136, 118, 40, 2, (i, j) => ((i + j) % 2 === 0 && (Math.abs(i - 144) < 6 || Math.abs(i - 167) < 6) ? INK : null));
  
    /* ---- bench, bottom-left ---- */
    const bx = 4, by = 236;
    shade.fn(bx - 1, by + 30, 44, 3, (i, j) => (j === by + 30 || (i + j) % 2 === 0 ? INK : null));
    p.rect(bx + 2, by + 21, 4, 10, INK); p.rect(bx + 3, by + 22, 2, 8, C.w2); p.col(bx + 3, by + 22, by + 29, C.w3);
    p.rect(bx + 36, by + 21, 4, 10, INK); p.rect(bx + 37, by + 22, 2, 8, C.w2); p.col(bx + 37, by + 22, by + 29, C.w3);
    p.row(by, bx + 4, bx + 37, INK); p.rect(bx + 2, by + 1, 38, 13, INK);
    p.rect(bx + 3, by + 2, 36, 11, C.p4); p.row(by + 1, bx + 4, bx + 37, C.p5); p.row(by + 2, bx + 3, bx + 38, C.p5);
    p.row(by + 12, bx + 3, bx + 38, C.p3); p.col(bx + 38, by + 3, by + 12, C.p3);
    for (const x of [bx + 9, bx + 17, bx + 24, bx + 32]) { p.set(x, by + 6, C.p2); p.set(x + 1, by + 7, C.p5); }
    p.rect(bx + 1, by + 13, 40, 9, INK);
    p.rect(bx + 2, by + 14, 38, 3, C.p5); p.row(by + 14, bx + 3, bx + 38, '#c3aef0'); p.rect(bx + 2, by + 17, 38, 4, C.p4); p.row(by + 20, bx + 2, bx + 39, C.p3);
    p.col(bx + 21, by + 14, by + 20, C.p3);
    for (const ax of [bx, bx + 38]) { p.rect(ax, by + 8, 4, 15, INK); p.rect(ax + 1, by + 9, 2, 13, C.w3); p.row(by + 9, ax + 1, ax + 2, '#c98a5a'); p.col(ax + 2, by + 11, by + 21, C.w2); }
  
    // somebody forgot their popcorn on the bench
    p.art(bx + 7, by + 8, [
      '..kk.kk..',
      '.kyYkYyk.',
      'kyYyyyYyk',
      'kkkkkkkkk',
      'kccccccck',
      'kwrwwwrwk',
      '.kwrwrwk.',
      '.kwrwrwk.',
      '.kkkkkkk.',
    ], { k: INK, y: C.y3, Y: C.y4, w: C.cream, r: C.r3, c: C.cream });

    /* ---- floor lamp beside the bench ---- */
    const lx = LAMP_X;
    shade.fn(lx - 7, 267, 15, 2, (i, j) => (j === 267 || (i + j) % 2 === 0 ? INK : null));
    p.rect(lx - 1, 237, 3, 27, INK); p.col(lx, 237, 263, C.y2);
    p.rect(lx - 5, 263, 11, 4, INK); p.rect(lx - 4, 264, 9, 2, C.y2); p.row(264, lx - 4, lx + 4, C.y3); p.row(265, lx - 4, lx + 4, C.y1);
    p.row(224, lx - 4, lx + 4, INK); p.row(237, lx - 8, lx + 8, INK);
    for (let j = 0; j <= 11; j++) {
      const hw = 4 + Math.round((j * 3) / 11);
      p.row(225 + j, lx - hw - 1, lx + hw + 1, INK);
      p.row(225 + j, lx - hw, lx + hw, j < 4 ? C.y4 : j < 9 ? C.y3 : C.y2);
    }
    p.row(235, lx - 7, lx + 7, C.r3); p.row(236, lx - 7, lx + 7, C.r2);
    p.col(lx + 3, 238, 241, C.y4); p.set(lx + 3, 242, C.r3);
  
    /* ---- potted plant, bottom-right ---- */
    const frond = (bx0, by0, tx, ty, wMax, cL, cD, cRib) => {
      const t = new Pix(W, H);
      const ddx = tx - bx0, ddy = ty - by0, len = Math.hypot(ddx, ddy), ux = ddx / len, uy = ddy / len;
      t.fn(Math.min(bx0, tx) - 8, Math.min(by0, ty) - 8, Math.abs(ddx) + 17, Math.abs(ddy) + 17, (i, j) => {
        const px = i - bx0, py = j - by0;
        const a = (px * ux + py * uy) / len;                 // 0..1 from stalk to tip
        if (a < 0 || a > 1) return null;
        const side = px * -uy + py * ux;                     // signed distance from the midrib
        const w = wMax * Math.pow(Math.sin(Math.PI * Math.pow(a, 0.8)), 0.7) + 0.45;
        if (Math.abs(side) > w) return null;
        if (Math.abs(side) < 0.55 && a > 0.1 && a < 0.88) return cRib;
        return side < 0 ? cL : cD;
      });
      t.outline(INK);
      p.blit(t);
    };
    shade.fn(160, 266, 32, 3, (i, j) => (j === 266 || (i + j) % 2 === 0 ? INK : null));
    frond(174, 254, 160, 243, 3.2, C.m2, C.m1, C.m3);
    frond(178, 254, 192, 242, 3.2, C.m2, C.m1, C.m3);
    frond(174, 254, 165, 228, 4.4, C.m2, C.m1, C.m3);
    frond(178, 254, 187, 227, 4.4, C.m2, C.m1, C.m3);
    frond(176, 254, 176, 220, 5, C.m3, C.m2, C.m4);
    p.rect(166, 252, 20, 4, INK); p.rect(167, 253, 18, 2, C.y3); p.row(253, 167, 184, C.y4); p.col(184, 253, 254, C.y2);
    p.rect(167, 255, 18, 12, INK); p.rect(168, 255, 16, 8, C.y2); p.rect(169, 263, 14, 3, C.y2);
    p.col(168, 255, 262, C.y3); p.col(169, 255, 265, C.y3); p.col(183, 255, 262, C.y1); p.col(182, 255, 265, C.y1); p.row(265, 169, 182, C.y1);
    for (const y of [264, 265, 266]) { p.set(167, y, null); p.set(184, y, null); }
    p.row(259, 170, 181, C.r3); p.row(260, 170, 181, C.r2);
  
    return svgOpen(390, 560, 'px-lobby')
      + `<rect width="390" height="210" fill="${WALL}"/><rect y="210" width="390" height="350" fill="${CARPET}"/>`
      + bg.paths(-1, 0)
      + overlays + vig(1.0) + vig(1.34)
      + shade.paths(-1, 0, ' fill-opacity=".36"')
      + p.paths(-1, 0)
      + '</svg>';
  });
}

/* ================================================================== marquee */

/** Theatre front at night. viewBox 0 0 390 300. Bulbs are <rect class="bulb" style="--i:n">, stars are class="star". */
export function marqueeSVG() {
  return memo('marquee', () => {
    const W = 196, H = 150;
    const bg = new Pix(W, H), p = new Pix(W, H);
    let extra = '';
    const X = (gx) => gx * U - 1, Y = (gy) => gy * U;
  
    /* sky */
    bg.dither(0, 20, W, 2, C.p1); bg.rect(0, 22, W, 26, C.p1); bg.dither(0, 48, W, 2, C.p2); bg.rect(0, 50, W, 80, C.p2);
    bg.fn(166, 5, 14, 14, (i, j) => (Math.hypot(i - 172.5, j - 11.5) <= 5.6 && Math.hypot(i - 175.5, j - 9.5) > 5 ? C.y4 : null));
    const stars = [[8, 6, 1], [24, 12, 0], [41, 5, 0], [58, 9, 1], [20, 26, 0], [128, 5, 0], [140, 11, 1], [153, 4, 0], [188, 24, 0], [5, 36, 0], [189, 40, 1], [150, 24, 0], [36, 18, 0], [70, 4, 0]];
    stars.forEach(([x, y, big], n) => {
      const d = big
        ? `M${X(x)} ${Y(y)}h2v2h-2zM${X(x - 1)} ${Y(y)}h2v2h-2zM${X(x + 1)} ${Y(y)}h2v2h-2zM${X(x)} ${Y(y - 1)}h2v2h-2zM${X(x)} ${Y(y + 1)}h2v2h-2z`
        : `M${X(x)} ${Y(y)}h2v2h-2z`;
      extra += `<path class="star" style="--i:${n}" fill="${big ? C.y4 : C.p5}" d="${d}"/>`;
    });
  
    /* neighbours */
    const NB = '#231739';
    bg.rect(0, 62, 16, 68, NB); bg.rect(0, 62, 16, 1, C.p2); bg.rect(10, 56, 5, 6, NB);
    bg.rect(180, 50, 16, 80, NB); bg.rect(180, 50, 16, 1, C.p2); bg.col(186, 40, 49, NB); bg.row(42, 184, 188, NB);
    for (const [x, y, on] of [[11, 68, 1], [11, 80, 0], [11, 92, 0], [184, 58, 0], [190, 58, 1], [184, 68, 1], [190, 68, 0], [184, 78, 0], [190, 78, 0], [190, 90, 1], [184, 100, 0]]) {
      bg.rect(x, y, 3, 4, on ? C.y2 : C.p1); if (on) bg.row(y, x, x + 2, C.y3);
    }
  
    /* facade with a stepped crown */
    const FA = '#463075', FA2 = '#3a2764';
    const block = (x, y, w, h) => { bg.rect(x - 1, y - 1, w + 2, h + 1, INK); bg.rect(x, y, w, h, FA); bg.rect(x, y, w, 1, C.p4); };
    block(14, 30, 168, 98); block(58, 23, 80, 7); block(72, 16, 52, 7); block(85, 6, 26, 10);
    bg.rect(58, 28, 80, 1, C.y1); bg.rect(72, 21, 52, 1, C.y1);
    for (let y = 33; y < 76; y += 4) { bg.rect(14, y, 168, 1, FA2); for (let x = 18 + ((y >> 2) % 2) * 5; x < 181; x += 10) bg.col(x, y + 1, y + 3, FA2); }
    bg.art(93, 7, ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.#.....#.'].map((r) => r.replace(/#/g, 'y')), { y: C.y3 });
    bg.set(97, 7, C.y4); bg.set(97, 8, C.y4); bg.row(10, 94, 96, C.y4);
  
    /* pavement + road */
    bg.rect(0, 128, W, 10, '#4a387f'); bg.rect(0, 128, W, 1, INK);
    for (let x = 6; x < W; x += 12) bg.col(x, 129, 137, '#3d2d6c');
    bg.rect(0, 133, W, 1, '#3d2d6c');
    bg.rect(0, 138, W, 1, C.p5); bg.rect(0, 139, W, 1, C.p1);
    bg.rect(0, 140, W, 10, '#1e1433');
    for (let x = 4; x < W; x += 20) bg.rect(x, 146, 9, 1, C.p2);
    // bulbs reflected on the wet road
    for (let x = 28, k = 0; x <= 166; x += 6, k++) bg.rect(x, 141, 2, 2 + ((k * 7) % 4), k % 3 === 0 ? '#8a5a4a' : '#5a3a52');
  
    /* light (solid translucent steps) */
    const WARM = '#ffc45e';
    const light =
      glowLayers(W, H, [[97.5, 54, 100, 36, WARM]], 0.06, [1, 0.8, 0.6], -1, 0, (g) => g.rect(0, 128, W, 22, null))
      + glowLayers(W, H, [[97.5, 131, 84, 9, WARM]], 0.1, [1, 0.7], -1, 0, (g) => { g.rect(0, 0, W, 129, null); g.rect(0, 138, W, 12, null); })
      + glowLayers(W, H, [[8.5, 69, 13, 13, WARM]], 0.1, [1, 0.6]);
  
    /* marquee light box */
    const bx = 24, by = 34, bw = 148, bh = 38;
    p.rect(bx, by, bw, bh, INK); p.rect(bx + 1, by + 1, bw - 2, bh - 2, C.r1); p.row(by + 1, bx + 1, bx + bw - 2, C.r2);
    p.rect(bx + 5, by + 5, bw - 10, bh - 10, INK); p.rect(bx + 6, by + 6, bw - 12, bh - 12, C.y4);
    p.row(by + 6, bx + 6, bx + bw - 7, '#ffffff'); p.rect(bx + 6, by + bh - 8, bw - 12, 2, C.y3);
    const tw = textWidth('동시상영', { scale: 2, gap: 2 }), tx = Math.round(97.5 - tw / 2), ty = by + 8;
    drawText(p, tx + 1, ty + 1, '동시상영', C.y2, { scale: 2, gap: 2 });
    drawText(p, tx, ty, '동시상영', C.r2, { scale: 2, gap: 2 });
    const star5 = ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'];
    p.art(bx + 12, by + 16, star5, { '#': C.r3 }); p.art(bx + bw - 17, by + 16, star5, { '#': C.r3 });
    // chasing bulbs around the box
    let bi = 0;
    const addBulb = (gx, gy) => {
      p.rect(gx, gy, 2, 2, C.y1);
      extra += `<rect class="bulb" style="--i:${bi++}" x="${X(gx)}" y="${Y(gy)}" width="4" height="4" fill="${C.y4}"/>`;
    };
    const nTop = Math.floor((bw - 6) / 5);
    const x0 = bx + 2 + Math.round(((bw - 4) - (nTop * 5 - 3)) / 2);
    for (let k = 0; k < nTop; k++) addBulb(x0 + k * 5, by + 2);
    for (let k = 1; k <= 5; k++) addBulb(bx + bw - 4, by + 2 + Math.round((k * (bh - 6)) / 6));
    for (let k = nTop - 1; k >= 0; k--) addBulb(x0 + k * 5, by + bh - 4);
    for (let k = 5; k >= 1; k--) addBulb(bx + 2, by + 2 + Math.round((k * (bh - 6)) / 6));
  
    /* canopy soffit with a row of bulbs */
    p.rect(22, 72, 152, 5, INK); p.rect(23, 73, 150, 3, C.p1); p.row(73, 23, 172, C.p3);
    for (let x = 28; x <= 166; x += 6) addBulb(x, 76);
  
    /* lit entrance */
    const EN = '#5d429a';
    p.rect(22, 78, 152, 50, EN); p.rect(22, 78, 152, 3, C.p4); p.dither(22, 81, 152, 2, C.p4);
    for (const x of [18, 170]) { p.rect(x, 77, 8, 51, INK); p.rect(x + 1, 78, 6, 50, FA2); p.col(x + 1, 78, 127, C.p3); p.rect(x + 1, 124, 6, 4, C.p1); }
    // poster cases
    const caseAt = (x, kind) => {
      p.box(x, 88, 16, 28, C.y2); p.rect(x + 2, 90, 12, 24, INK);
      if (kind === 0) {
        p.rect(x + 3, 91, 10, 22, C.m1); p.rect(x + 3, 91, 10, 6, C.m2);
        p.fn(x + 3, 93, 10, 9, (i, j) => (Math.hypot(i - x - 8, j - 97) <= 3.2 && Math.hypot(i - x - 9.5, j - 96) > 2.6 ? C.y4 : null));
        p.rect(x + 3, 106, 10, 7, C.p1); p.row(105, x + 5, x + 8, C.p1); p.row(104, x + 6, x + 7, C.p1); p.row(109, x + 5, x + 10, C.cream);
      } else {
        p.rect(x + 3, 91, 10, 22, C.r2); p.rect(x + 3, 105, 10, 8, C.r1);
        p.fn(x + 3, 93, 10, 9, (i, j) => (Math.hypot(i - x - 7.5, j - 97.5) <= 3.2 ? C.y3 : null));
        p.row(108, x + 5, x + 10, C.cream); p.row(110, x + 6, x + 9, C.y3);
      }
    };
    caseAt(27, 0); caseAt(153, 1);
    // doors
    const door = (x) => {
      p.rect(x, 86, 28, 42, INK); p.rect(x + 1, 87, 26, 41, C.r2); p.row(87, x + 1, x + 26, C.r3);
      for (const lx of [x + 3, x + 15]) {
        p.rect(lx, 90, 10, 24, INK); p.rect(lx + 1, 91, 8, 22, C.y2); p.rect(lx + 1, 91, 8, 9, C.y3);
        p.set(lx + 2, 92, C.y4); p.set(lx + 3, 93, C.y4); p.set(lx + 2, 93, C.y4);
        p.rect(lx, 116, 10, 10, C.r1); p.row(116, lx, lx + 9, C.r0);
      }
      p.col(x + 13, 88, 127, INK); p.col(x + 14, 88, 127, INK);
      p.rect(x + 11, 102, 2, 8, C.y4); p.rect(x + 15, 102, 2, 8, C.y4);
    };
    door(46); door(122);
    // ticket booth
    p.rect(79, 80, 38, 48, INK);
    p.rect(80, 81, 36, 16, C.r2); p.row(81, 80, 115, C.r3);
    p.box(81, 82, 34, 14, C.cream); drawText(p, 84, 84, '매표소', C.p1);
    p.rect(80, 97, 36, 17, C.m2); p.row(97, 80, 115, C.m3);
    p.rect(83, 99, 30, 13, INK); p.rect(84, 100, 28, 11, C.y3); p.rect(84, 100, 28, 3, C.y4);
    // the night clerk in the window
    p.rect(94, 103, 8, 6, INK); p.rect(95, 104, 6, 4, SKIN_TONES[1]); p.row(104, 95, 100, HAIR_COLORS[1]);
    p.set(96, 106, INK); p.set(99, 106, INK);
    p.rect(94, 101, 8, 3, INK); p.rect(95, 102, 6, 2, C.r3); p.row(102, 95, 100, C.r4);
    p.rect(93, 109, 10, 2, INK); p.rect(94, 109, 8, 2, C.cream); p.row(109, 97, 98, C.y3);
    p.rect(87, 102, 1, 6, '#ffffff'); p.rect(88, 101, 1, 3, '#ffffff');
    p.rect(79, 113, 38, 3, INK); p.rect(80, 114, 36, 1, C.cream);
    p.rect(80, 116, 36, 12, C.m2); for (let x = 83; x < 116; x += 4) p.col(x, 117, 127, C.m1); p.rect(80, 125, 36, 3, C.m1); p.row(116, 80, 115, C.m3);
  
    /* street lamp */
    p.rect(7, 74, 4, 56, INK); p.col(8, 75, 128, C.p4); p.col(9, 75, 128, C.p2); p.rect(5, 128, 8, 2, INK); p.row(128, 6, 11, C.p3);
    p.rect(4, 63, 10, 12, INK); p.rect(5, 65, 8, 8, C.y4); p.row(65, 5, 12, '#ffffff'); p.rect(5, 71, 8, 2, C.y3); p.row(64, 5, 12, C.p3); p.row(73, 5, 12, C.p3);
    p.row(62, 6, 11, INK); p.row(61, 8, 9, INK);
  
    /* a cat waiting for the late show */
    p.art(171, 118, [
      '.kk...kk...',
      'kwwk.kwwk..',
      'kwwwkwwwk..',
      'kwwwwwwwk..',
      'kwkwwwkwk..',
      'kwwwpwwwk..',
      '.kwwwwwk.kk',
      '.kwwwwwkkok',
      'kwwwwwwwkwk',
      'kwwkwkwwwk.',
      '.kkkkkkkk..',
    ], { k: INK, w: C.cream, p: '#ff8fa3', o: C.y2 });
  
    return svgOpen(390, 300, 'px-marquee')
      + `<rect width="390" height="300" fill="${INK}"/>`
      + bg.paths(-1, 0)
      + light
      + p.paths(-1, 0)
      + extra
      + '</svg>';
  });
}
