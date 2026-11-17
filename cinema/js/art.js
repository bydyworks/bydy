// art.js — "flat cozy vector" art kit for a tiny online neighbourhood movie theatre.
// Pure functions returning SVG markup strings. No raster, no external assets,
// no filters, no gradients: every shade is a second flat tone.

export const FONT_STACK =
  "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";

/* ------------------------------------------------------------------ palette */

export const PALETTE = {
  navy900: '#12172f',
  navy800: '#1a2142',
  navy700: '#252f58',
  navy600: '#303c6c',
  navy500: '#43508a',
  navy300: '#8f9ac6',
  red800: '#641c2a',
  red700: '#7d2536',
  red600: '#a03040',
  red500: '#bd4650',
  red300: '#e88f86',
  butter600: '#dfae48',
  butter500: '#f2c95c',
  butter400: '#f7d97f',
  butter200: '#fdecb4',
  cream100: '#fbf3e0',
  cream300: '#efdfbe',
  cream500: '#d9c39a',
  sage500: '#6a9479',
  sage700: '#456b58',
  ink: '#2b2440',
};
const P = PALETTE;

export const HAIR_COLORS = ['#4a3438', '#75483a', '#b06f43', '#e6b862', '#c9584e', '#9a9cc4'];
export const OUTFIT_COLORS = [
  '#f2c95c', // butter
  '#fbf3e0', // cream
  '#dc655e', // soft velvet red
  '#6288c2', // cornflower
  '#84b394', // sage
  '#f2a892', // peach
  '#a48fd0', // lavender
  '#56aaa6', // teal
];
export const SKIN_TONES = ['#fde3cb', '#f4c9a0', '#d9a077', '#a06e4e'];

/* ------------------------------------------------------------------ helpers */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
// warm second tone: push toward a plum-navy instead of black
const shade = (c, t = 0.2) => mix(c, '#3b2247', t);
const tint = (c, t = 0.3) => mix(c, '#fff6e0', t);
const r1 = (n) => Math.round(n * 10) / 10;

function pick(arr, v, fallback = 0) {
  if (typeof v === 'string' && v[0] === '#') return v;
  const n = Number(v);
  const i = Number.isFinite(n) ? ((Math.round(n) % arr.length) + arr.length) % arr.length : fallback;
  return arr[i];
}
function idx(arr, v) {
  if (typeof v === 'string' && v[0] === '#') {
    const i = arr.indexOf(v.toLowerCase());
    return i < 0 ? 0 : i;
  }
  const n = Number(v);
  return Number.isFinite(n) ? ((Math.round(n) % arr.length) + arr.length) % arr.length : 0;
}

const svgOpen = (w, h, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${extra} style="display:block;font-family:${FONT_STACK}">`;

/* ------------------------------------------------------------------ popcorn */

const POP_KINDS = {
  butter: { a: '#fff4cf', b: '#f5d985', stripe: '#b23a48' },
  caramel: { a: '#e8ad66', b: '#c47f42', stripe: '#43508a' },
  cheese: { a: '#ffc95f', b: '#f39f3c', stripe: '#e2ab3f' },
};
const POP_BUMPS = [
  // x, h (0..1 height factor), r, tone(0 light /1 shade)
  [9.6, 0.1, 4.1, 1], [14.6, 0.14, 4.3, 0], [20, 0.1, 4.4, 1], [25.4, 0.14, 4.3, 0], [30.4, 0.1, 4.1, 1],
  [12.2, 0.42, 4.4, 0], [17.6, 0.46, 4.5, 1], [23, 0.44, 4.5, 0], [28, 0.42, 4.3, 1],
  [15, 0.72, 4.4, 1], [20.4, 0.78, 4.6, 0], [25.4, 0.72, 4.3, 0],
  [18.2, 0.96, 4.1, 0], [22.6, 1, 4.2, 1],
];
function popcornInner({ kind = 'butter', level = 1 } = {}) {
  const k = POP_KINDS[kind] || POP_KINDS.butter;
  const L = Math.max(0, Math.min(1, Number(level) || 0));
  let heap = '';
  if (L > 0.02) {
    const hh = 3 + L * 11;
    for (const [x, h, r, t] of POP_BUMPS) {
      if (h > 0.5 && L < 0.3) continue;
      const y = 18.4 - h * hh;
      heap += `<circle cx="${x}" cy="${r1(y)}" r="${r}" fill="${t ? k.b : k.a}"/>`;
    }
    // tiny lights on a few kernels
    const hl = [[13.4, 0.42], [21.6, 0.8], [26.4, 0.16]];
    for (const [x, h] of hl) {
      if (h > 0.5 && L < 0.3) continue;
      heap += `<circle cx="${x}" cy="${r1(17 - h * hh)}" r="1.2" fill="#fffaf0" opacity=".8"/>`;
    }
  } else {
    heap = `<circle cx="16" cy="21.4" r="1.5" fill="${k.b}"/><circle cx="23.6" cy="21.8" r="1.2" fill="${k.a}"/>`;
  }
  let stripes = '';
  for (const i of [1, 3, 5]) {
    const t0 = 5.5 + (29 / 7) * i;
    const t1 = 5.5 + (29 / 7) * (i + 1);
    const b0 = 9.5 + 3 * i;
    const b1 = 9.5 + 3 * (i + 1);
    stripes += `<path d="M${r1(t0)} 20H${r1(t1)}L${r1(b1)} 46.5H${r1(b0)}Z" fill="${k.stripe}"/>`;
  }
  const motif =
    kind === 'caramel'
      ? `<path d="M20 30.2C22 32.6 22.9 33.8 22.9 35A2.9 2.9 0 0 1 17.1 35C17.1 33.8 18 32.6 20 30.2Z" fill="${k.b}"/>`
      : kind === 'cheese'
        ? `<path d="M16.6 36.2L23.6 31.2V36.2Z" fill="${k.b}"/><circle cx="21.4" cy="34.6" r=".8" fill="${P.cream100}"/>`
        : `<rect x="16.8" y="31.2" width="6.4" height="4.8" rx="1.2" fill="${P.butter500}"/><rect x="16.8" y="34.2" width="6.4" height="1.8" rx=".9" fill="${P.butter600}"/>`;
  return (
    `<ellipse cx="20" cy="20" rx="14.4" ry="3.6" fill="#c9b084"/>` +
    heap +
    `<path d="M5.5 20L9.2 43.6C9.5 45.4 10.8 46.5 12.6 46.5H27.4C29.2 46.5 30.5 45.4 30.8 43.6L34.5 20Z" fill="${P.cream100}"/>` +
    stripes +
    `<path d="M26.4 20H34.5L30.8 43.6C30.5 45.4 29.2 46.5 27.4 46.5H23.6Z" fill="#3b2247" opacity=".14"/>` +
    `<circle cx="20" cy="33.6" r="5.8" fill="${P.cream100}"/>` +
    motif +
    `<rect x="4.4" y="17.2" width="31.2" height="4.4" rx="2.2" fill="${P.cream300}"/>` +
    `<rect x="4.4" y="17.2" width="31.2" height="2" rx="1" fill="${P.cream100}"/>`
  );
}

export function popcornSVG({ kind = 'butter', level = 1 } = {}) {
  return (
    svgOpen(40, 48) +
    `<ellipse cx="20" cy="46.6" rx="12" ry="1.4" fill="#0b0e22" opacity=".22"/>` +
    popcornInner({ kind, level }) +
    `</svg>`
  );
}

function drinkInner() {
  // tiny paper cup, 10 x 16, origin top-left, straw sticks up
  return (
    `<rect x="5.6" y="0" width="1.6" height="6" rx=".8" fill="${P.cream100}" transform="rotate(12 6.4 6)"/>` +
    `<path d="M1 6.4H9L8.2 15C8.1 15.6 7.6 16 7 16H3C2.4 16 1.9 15.6 1.8 15Z" fill="${P.red500}"/>` +
    `<path d="M1.5 9.6H8.6L8.3 12.4H1.8Z" fill="${P.cream100}"/>` +
    `<rect x=".3" y="4.8" width="9.4" height="2.2" rx="1.1" fill="${P.cream100}"/>`
  );
}

/* ------------------------------------------------------------------ avatars */

const INK = P.ink;
const HEAD_D =
  'M24 8.5C33.2 8.5 38.8 14 38.8 23C38.8 31.6 33.6 36 24 36C14.4 36 9.2 31.6 9.2 23C9.2 14 14.8 8.5 24 8.5Z';
const BODY_D =
  'M17.2 36.5C17.2 34.4 30.8 34.4 30.8 36.5L33.4 47.6C33.9 50.4 32 52 29.4 52H18.6C16 52 14.1 50.4 14.6 47.6Z';
const BODY_SHADE_D =
  'M26.6 34.9C29 35 30.8 35.5 30.8 36.5L33.4 47.6C33.9 50.4 32 52 29.4 52H25.4C27.8 47 28.3 40.5 26.6 34.9Z';

function hairBack(style, c, cs, view) {
  // layer drawn BEHIND the head (front view only)
  if (view !== 'front') return '';
  switch (style) {
    case 1:
      return (
        `<circle cx="9.4" cy="20.6" r="5.4" fill="${c}"/><circle cx="38.6" cy="20.6" r="5.4" fill="${cs}"/>` +
        `<circle cx="8.8" cy="27.2" r="4.4" fill="${c}"/><circle cx="39.2" cy="27.2" r="4.4" fill="${cs}"/>`
      );
    case 2:
      return (
        `<circle cx="11.2" cy="9" r="6" fill="${c}"/><circle cx="36.8" cy="9" r="6" fill="${c}"/>` +
        `<path d="M36.8 3A6 6 0 0 1 36.8 15A8 8 0 0 0 36.8 3Z" fill="${cs}"/>` +
        `<path d="M11.2 3A6 6 0 0 1 11.2 15A8 8 0 0 0 11.2 3Z" fill="${cs}"/>` +
        `<path d="M7.8 22C7.8 13 14 7 24 7C34 7 40.2 13 40.2 22V25.6H7.8Z" fill="${c}"/>`
      );
    case 3:
      return (
        `<path d="M24 7C34.4 7 40.6 13 40.6 22.4V27.6C40.6 30.8 38.2 32.2 36 31.8H12C9.8 32.2 7.4 30.8 7.4 27.6V22.4C7.4 13 13.6 7 24 7Z" fill="${c}"/>` +
        `<path d="M40.6 22.4V27.6C40.6 30.8 38.2 32.2 36 31.8H33V20H40.4Z" fill="${cs}"/>`
      );
    default:
      return (
        `<path d="M24 6C35 6 41.2 12.6 41.2 22.4V29.6C41.2 32.6 38.8 34.2 36.2 33.8H11.8C9.2 34.2 6.8 32.6 6.8 29.6V22.4C6.8 12.6 13 6 24 6Z" fill="${c}"/>` +
        `<path d="M41.2 22.4V29.6C41.2 32.6 38.8 34.2 36.2 33.8H33V20H41Z" fill="${cs}"/>`
      );
  }
}

function hairFront(style, c, cs, ct, hat, hatS) {
  const shine = `<path d="M14 12.8C16.2 9.8 19.6 8.5 23.2 8.3" stroke="${ct}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".55"/>`;
  switch (style) {
    case 1:
      return (
        `<path d="M9 20.6C9 11.6 15 7 24 7C33 7 39 11.6 39 20.6C35 18 30 17.2 24 17.2C18 17.2 13 18 9 20.6Z" fill="${c}"/>` +
        `<circle cx="36.2" cy="14" r="5.6" fill="${cs}"/><circle cx="31" cy="9.2" r="6" fill="${cs}"/>` +
        `<circle cx="12" cy="13.8" r="5.8" fill="${c}"/><circle cx="17.6" cy="9" r="6" fill="${c}"/><circle cx="24.4" cy="7.6" r="6.2" fill="${c}"/>` +
        `<circle cx="14.4" cy="18.4" r="3.7" fill="${c}"/><circle cx="20.6" cy="17.4" r="3.9" fill="${c}"/><circle cx="27" cy="17.4" r="3.9" fill="${c}"/><circle cx="33.4" cy="18.4" r="3.7" fill="${cs}"/>` +
        `<circle cx="16.6" cy="8.4" r="1.9" fill="${ct}" opacity=".5"/><circle cx="23" cy="6.2" r="1.5" fill="${ct}" opacity=".5"/>`
      );
    case 2:
      return (
        `<path d="M24 7.4C14.6 7.4 8.6 13.4 8.9 22.8C13.6 21.4 19.8 17.6 24 10.6C28.2 17.6 34.4 21.4 39.1 22.8C39.4 13.4 33.4 7.4 24 7.4Z" fill="${c}"/>` +
        `<path d="M24 10.6C28.2 17.6 34.4 21.4 39.1 22.8C39.3 17.6 37.6 13.4 34.4 10.6C31.6 9 28 8.6 24 10.6Z" fill="${cs}" opacity=".7"/>` +
        `<circle cx="14.6" cy="11.4" r="1.7" fill="${P.butter500}"/><circle cx="33.4" cy="11.4" r="1.7" fill="${P.butter500}"/>` +
        `<path d="M12.6 15.4C14 12.4 16.4 10.6 19.4 9.8" stroke="${ct}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".5"/>`
      );
    case 3:
      return (
        `<path d="M8.8 22.4C8.6 13 14.6 7.4 24 7.4C33.4 7.4 39.4 13 39.2 22.4C37.4 19.4 34 17.6 29.6 17.2C23.6 16.8 15 18 8.8 22.4Z" fill="${c}"/>` +
        `<g transform="rotate(-9 23 9)">` +
        `<ellipse cx="23" cy="10.4" rx="15.4" ry="5.8" fill="${hatS}"/>` +
        `<ellipse cx="23" cy="8.2" rx="16.4" ry="6.2" fill="${hat}"/>` +
        `<ellipse cx="17" cy="6" rx="5" ry="1.5" fill="${tint(hat, 0.45)}" opacity=".6"/>` +
        `<rect x="22" y="-.4" width="2.2" height="3.6" rx="1.1" fill="${hatS}"/>` +
        `</g>`
      );
    default:
      return (
        `<path d="M8.6 22.2C8.2 12.4 14.4 6 24 6C33.6 6 39.8 12.4 39.4 22.2C38.4 19.8 36.8 18.5 34.6 18.3C27.6 17.5 20.4 17.5 13.4 18.3C11.2 18.5 9.6 19.8 8.6 22.2Z" fill="${c}"/>` +
        `<path d="M39.4 22.2C38.4 19.8 36.8 18.5 34.6 18.3C33 18.1 31.4 18 29.8 17.9C33 14.6 34 11 33 8.4C37.4 10.8 39.7 15.6 39.4 22.2Z" fill="${cs}"/>` +
        shine
      );
  }
}

function hairRear(style, c, cs, ct, hat, hatS) {
  // full back-of-head hair (back view). Rim light on top keeps heads readable in the dark hall.
  const rim = `<path d="M11.8 14C14.4 9.8 18.8 7.8 24 7.8C29.2 7.8 33.6 9.8 36.2 14C32.8 11.6 28.6 10.7 24 10.7C19.4 10.7 15.2 11.6 11.8 14Z" fill="${ct}" opacity=".55"/>`;
  switch (style) {
    case 1:
      return (
        `<path d="M24 7C34 7 40 13 40 22.4V28C40 32 37 34 33.6 34H14.4C11 34 8 32 8 28V22.4C8 13 14 7 24 7Z" fill="${c}"/>` +
        `<circle cx="13.6" cy="32" r="4.8" fill="${cs}"/><circle cx="20.6" cy="33.6" r="4.6" fill="${cs}"/><circle cx="27.4" cy="33.6" r="4.6" fill="${cs}"/><circle cx="34.4" cy="32" r="4.8" fill="${cs}"/>` +
        `<circle cx="9.2" cy="27.6" r="4.8" fill="${cs}"/><circle cx="38.8" cy="27.6" r="4.8" fill="${cs}"/>` +
        `<circle cx="9.2" cy="20.6" r="5.4" fill="${c}"/><circle cx="38.8" cy="20.6" r="5.4" fill="${c}"/>` +
        `<circle cx="12" cy="13.6" r="5.8" fill="${c}"/><circle cx="36" cy="13.6" r="5.8" fill="${c}"/>` +
        `<circle cx="17.6" cy="9" r="6" fill="${c}"/><circle cx="30.6" cy="9" r="6" fill="${c}"/><circle cx="24.2" cy="7.6" r="6.2" fill="${c}"/>` +
        `<circle cx="17" cy="8" r="2.4" fill="${ct}" opacity=".5"/><circle cx="24" cy="6" r="2.4" fill="${ct}" opacity=".5"/><circle cx="31" cy="8" r="2.4" fill="${ct}" opacity=".5"/>` +
        `<circle cx="18" cy="21" r="3.2" fill="${cs}" opacity=".55"/><circle cx="29" cy="24.4" r="3.4" fill="${cs}" opacity=".55"/><circle cx="23" cy="15.4" r="2.6" fill="${cs}" opacity=".45"/>`
      );
    case 2:
      return (
        `<circle cx="11.2" cy="9" r="6" fill="${c}"/><circle cx="36.8" cy="9" r="6" fill="${c}"/>` +
        `<circle cx="10.4" cy="7.6" r="2.4" fill="${ct}" opacity=".5"/><circle cx="36" cy="7.6" r="2.4" fill="${ct}" opacity=".5"/>` +
        `<path d="M24 7.4C33.8 7.4 39.8 13.2 39.8 22.8C39.8 30.2 34.8 33.6 24 33.6C13.2 33.6 8.2 30.2 8.2 22.8C8.2 13.2 14.2 7.4 24 7.4Z" fill="${c}"/>` +
        `<path d="M8.6 25.6C12.6 28.8 18 30 24 30C30 30 35.4 28.8 39.4 25.6C38.4 31.2 33.4 33.6 24 33.6C14.6 33.6 9.6 31.2 8.6 25.6Z" fill="${cs}"/>` +
        `<rect x="23.3" y="8" width="1.4" height="13" rx=".7" fill="${cs}"/>` +
        `<circle cx="14.6" cy="11.6" r="1.7" fill="${P.butter500}"/><circle cx="33.4" cy="11.6" r="1.7" fill="${P.butter500}"/>` +
        rim
      );
    case 3:
      return (
        `<path d="M24 7C34.4 7 40.6 13 40.6 22.4V28C40.6 31.6 38 33.6 35 33.6H13C10 33.6 7.4 31.6 7.4 28V22.4C7.4 13 13.6 7 24 7Z" fill="${c}"/>` +
        `<path d="M7.4 25.4C12.4 28.4 18 29.4 24 29.4C30 29.4 35.6 28.4 40.6 25.4V28C40.6 31.6 38 33.6 35 33.6H13C10 33.6 7.4 31.6 7.4 28Z" fill="${cs}"/>` +
        `<g transform="rotate(9 25 9)">` +
        `<ellipse cx="25" cy="10.4" rx="15.4" ry="5.8" fill="${hatS}"/>` +
        `<ellipse cx="25" cy="8.2" rx="16.4" ry="6.2" fill="${hat}"/>` +
        `<ellipse cx="25" cy="5.6" rx="8" ry="1.7" fill="${tint(hat, 0.45)}" opacity=".6"/>` +
        `<rect x="23.8" y="-.4" width="2.2" height="3.6" rx="1.1" fill="${hatS}"/>` +
        `</g>`
      );
    default:
      return (
        `<path d="M24 6C35 6 41.2 12.6 41.2 22.4V29.8C41.2 33.2 38.6 35.2 35.6 35.2H12.4C9.4 35.2 6.8 33.2 6.8 29.8V22.4C6.8 12.6 13 6 24 6Z" fill="${c}"/>` +
        `<path d="M6.8 26.4C12 29.6 18 30.8 24 30.8C30 30.8 36 29.6 41.2 26.4V29.8C41.2 33.2 38.6 35.2 35.6 35.2H12.4C9.4 35.2 6.8 33.2 6.8 29.8Z" fill="${cs}"/>` +
        rim
      );
  }
}

function faceMarkup(mood) {
  const blush =
    `<ellipse cx="14.8" cy="28.6" rx="2.8" ry="1.7" fill="#ea776c" opacity=".42"/>` +
    `<ellipse cx="33.2" cy="28.6" rx="2.8" ry="1.7" fill="#ea776c" opacity=".42"/>`;
  if (mood === 'happy') {
    return (
      blush +
      `<path d="M16.2 25.6Q18.2 22.6 20.2 25.6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" fill="none"/>` +
      `<path d="M27.8 25.6Q29.8 22.6 31.8 25.6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" fill="none"/>` +
      `<path d="M21.2 28.2H26.8C26.8 30.6 25.6 32 24 32C22.4 32 21.2 30.6 21.2 28.2Z" fill="#8a2a3a"/>` +
      `<path d="M22.4 30.6C23.4 30 24.6 30 25.6 30.6C25.2 31.5 24.7 32 24 32C23.3 32 22.8 31.5 22.4 30.6Z" fill="#ea776c"/>`
    );
  }
  return (
    blush +
    `<g class="cz-eyes"><circle cx="18.2" cy="24.8" r="1.65" fill="${INK}"/><circle cx="29.8" cy="24.8" r="1.65" fill="${INK}"/>` +
    `<circle cx="18.8" cy="24.2" r=".5" fill="#fff" opacity=".8"/><circle cx="30.4" cy="24.2" r=".5" fill="#fff" opacity=".8"/></g>` +
    `<path d="M22.4 28.8Q24 30.2 25.6 28.8" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" fill="none"/>`
  );
}

function outfitDetail(detail, col, colT, colS, view) {
  if (view !== 'front') {
    return `<path d="M15.4 48.6H32.6L33.4 47.6C33.9 50.4 32 52 29.4 52H18.6C16 52 14.1 50.4 14.6 47.6Z" fill="${colT}" opacity=".55"/>`;
  }
  switch (detail) {
    case 1: // two buttons
      return `<circle cx="24" cy="41" r="1" fill="${colT}"/><circle cx="24" cy="45" r="1" fill="${colT}"/>`;
    case 2: // chest stripe
      return `<path d="M16.3 40.4H31.7L32.3 43H15.7Z" fill="${colT}" opacity=".8"/>`;
    case 3: // little pocket heart
      return `<path d="M20.6 42.2a1.3 1.3 0 0 1 2.3-.6a1.3 1.3 0 0 1 2.3.6c0 1.4-2.3 2.6-2.3 2.6s-2.3-1.2-2.3-2.6Z" fill="${colT}" transform="translate(1.1 0)"/>`;
    default: // hem band
      return `<path d="M15.2 48.6H32.8L33.4 47.6C33.9 50.4 32 52 29.4 52H18.6C16 52 14.1 50.4 14.6 47.6Z" fill="${colT}" opacity=".7"/>`;
  }
}

/**
 * Internal figure builder shared by avatars and NPCs.
 */
function figure(o) {
  const view = o.view === 'back' ? 'back' : 'front';
  const style = ((Math.round(Number(o.hair) || 0) % 4) + 4) % 4;
  const hairC = o.hairCol;
  const hairS = shade(hairC, 0.26);
  const hairT = tint(hairC, 0.38);
  const skin = o.skinCol;
  const skinS = shade(skin, 0.16);
  const fit = o.outfitCol;
  const fitS = shade(fit, 0.2);
  const fitT = tint(fit, 0.5);
  const pants = o.pantsCol || mix(fit, '#232a52', 0.74);
  const pantsS = shade(pants, 0.25);
  const shoe = o.shoeCol || '#f1e3c6';
  const hat = o.hatCol || P.red500;
  const hatS = shade(hat, 0.24);
  const holding = o.holding === 'popcorn' || o.holding === 'drink' ? o.holding : null;
  const happy = o.mood === 'happy';
  const armDeg = o.armDeg != null ? o.armDeg : happy ? 34 : 11;

  let s = '';
  if (o.shadow !== false) s += `<ellipse cx="24" cy="57.6" rx="10.5" ry="2.4" fill="#0b0e22" opacity=".26"/>`;

  // back-view props peek out beside the body
  if (view === 'back' && holding === 'popcorn') {
    s += `<g transform="translate(30.6 31.4) scale(.31)">${popcornInner({ kind: 'butter', level: 1 })}</g>`;
  }
  if (view === 'back' && holding === 'drink') {
    s += `<g transform="translate(33 30.4) scale(.92)">${drinkInner()}</g>`;
  }

  // legs + shoes
  s +=
    `<rect x="18" y="46.6" width="5.2" height="10.6" rx="2.4" fill="${pants}"/>` +
    `<rect x="24.8" y="46.6" width="5.2" height="10.6" rx="2.4" fill="${pantsS}"/>` +
    `<rect x="16.6" y="54.2" width="6.8" height="3.9" rx="1.95" fill="${shoe}"/>` +
    `<rect x="24.6" y="54.2" width="6.8" height="3.9" rx="1.95" fill="${shade(shoe, 0.14)}"/>`;

  const armL = (deg, extra = '') =>
    `<g transform="rotate(${deg} 16.4 38)"><rect x="11.6" y="36.6" width="5.2" height="11.4" rx="2.6" fill="${fit}"/><circle cx="14.2" cy="47.6" r="2.4" fill="${skin}"/>${extra}</g>`;
  const armR = (deg, extra = '') =>
    `<g transform="rotate(${-deg} 31.6 38)"><rect x="31.2" y="36.6" width="5.2" height="11.4" rx="2.6" fill="${fitS}"/><circle cx="33.8" cy="47.6" r="2.4" fill="${skinS}"/>${extra}</g>`;

  const body =
    `<path d="${BODY_D}" fill="${fit}"/>` +
    `<path d="${BODY_SHADE_D}" fill="${fitS}"/>` +
    (o.bodyExtra != null ? o.bodyExtra : outfitDetail(o.detail || 0, fit, fitT, fitS, view));

  if (view === 'front' && holding === 'popcorn') {
    s += body;
    s += armL(-26) + armR(-26);
    s += `<g transform="translate(17.8 36.6) scale(.31)">${popcornInner({ kind: o.popKind || 'butter', level: 1 })}</g>`;
    s += `<circle cx="18.2" cy="46.4" r="2.4" fill="${skin}"/><circle cx="29.8" cy="46.4" r="2.4" fill="${skinS}"/>`;
  } else if (view === 'front' && holding === 'drink') {
    s += armL(armDeg);
    s += body;
    s += `<g transform="rotate(-34 31.6 38)"><rect x="31.2" y="36.6" width="5.2" height="10.4" rx="2.6" fill="${fitS}"/></g>`;
    s += `<g transform="translate(30.6 31.2) scale(1.12)">${drinkInner()}</g>`;
    s += `<circle cx="36.4" cy="46.2" r="2.5" fill="${skin}"/>`;
  } else {
    s += armL(o.armLDeg != null ? o.armLDeg : armDeg, o.armLExtra || '') + armR(armDeg);
    s += body;
  }

  // head
  s += `<g class="cz-head">`;
  s += hairBack(style, hairC, hairS, view);
  s += `<circle cx="9.9" cy="24.8" r="2.4" fill="${skinS}"/><circle cx="38.1" cy="24.8" r="2.4" fill="${skinS}"/>`;
  s += `<path d="${HEAD_D}" fill="${skin}"/>`;
  if (view === 'front') {
    s += `<path d="M38.8 23C38.8 31.6 33.6 36 24 36C19 36 15.2 34.8 12.8 32.6C16 34 20 34.5 24 34.5C32 34.5 37.6 30.6 38.8 23Z" fill="${skinS}" opacity=".55"/>`;
    s += faceMarkup(happy ? 'happy' : 'idle');
    s += hairFront(style, hairC, hairS, hairT, hat, hatS);
  } else {
    s += hairRear(style, hairC, hairS, hairT, hat, hatS);
  }
  if (o.headExtra) s += o.headExtra;
  s += `</g>`;
  return s;
}

const HAT_PARTNER = [2, 3, 1, 0, 5, 7, 0, 1]; // beret colour index for each outfit index

/**
 * avatarSVG({ view, hair, hairColor, outfit, skin, holding, mood })
 *  view      'front' | 'back'
 *  hair      0 bob | 1 fluffy curls | 2 twin buns | 3 beret
 *  hairColor index into HAIR_COLORS, or a '#hex'
 *  outfit    index into OUTFIT_COLORS, or a '#hex'
 *  skin      index into SKIN_TONES, or a '#hex'
 *  holding   null | 'popcorn' | 'drink'
 *  mood      'idle' | 'happy'
 * Root: <svg viewBox="0 0 48 60">, feet at (24,58).
 */
export function avatarSVG({
  view = 'front',
  hair = 0,
  hairColor = 0,
  outfit = 0,
  skin = 0,
  holding = null,
  mood = 'idle',
} = {}) {
  const oi = idx(OUTFIT_COLORS, outfit);
  return (
    svgOpen(48, 60, 'class="cz-avatar"') +
    figure({
      view,
      hair,
      hairCol: pick(HAIR_COLORS, hairColor),
      outfitCol: pick(OUTFIT_COLORS, outfit),
      skinCol: pick(SKIN_TONES, skin),
      holding,
      mood,
      detail: oi % 4,
      hatCol: OUTFIT_COLORS[HAT_PARTNER[oi]],
    }) +
    `</svg>`
  );
}

/**
 * npcSVG(kind) — 'clerk' (concession) | 'usher' (ticket checker). viewBox 0 0 48 60.
 */
export function npcSVG(kind = 'clerk') {
  if (kind === 'usher') {
    const coat = '#4a5896';
    const bodyExtra =
      `<path d="M24 35.2L20.4 35.6L24 41.6L27.6 35.6Z" fill="${P.cream100}"/>` +
      `<circle cx="21.6" cy="43.6" r="1" fill="${P.butter500}"/><circle cx="26.4" cy="43.6" r="1" fill="${P.butter500}"/>` +
      `<circle cx="21.4" cy="47.6" r="1" fill="${P.butter500}"/><circle cx="26.6" cy="47.6" r="1" fill="${P.butter500}"/>` +
      `<path d="M15.2 49.4H32.8L33.4 47.6C33.9 50.4 32 52 29.4 52H18.6C16 52 14.1 50.4 14.6 47.6Z" fill="${P.butter500}" opacity=".9"/>` +
      `<path d="M24 37.6L20.6 35.8V39.4Z" fill="${P.red500}"/><path d="M24 37.6L27.4 35.8V39.4Z" fill="${P.red600}"/><circle cx="24" cy="37.6" r="1.1" fill="${P.red300}"/>`;
    const cap =
      `<g transform="rotate(7 24 6)">` +
      `<rect x="14.4" y="1.2" width="19.2" height="9.6" rx="3" fill="${P.red500}"/>` +
      `<path d="M27 1.2H30.6C32.3 1.2 33.6 2.5 33.6 4.2V7.8C33.6 9.5 32.3 10.8 30.6 10.8H27Z" fill="${P.red600}"/>` +
      `<rect x="14.4" y="6.6" width="19.2" height="2.4" fill="${P.butter500}"/>` +
      `<circle cx="24" cy="1.4" r="1.3" fill="${P.butter500}"/>` +
      `</g>`;
    const ticket = `<g transform="rotate(-24 14.2 47.6)"><rect x="10.8" y="47.4" width="7" height="4.2" rx=".9" fill="${P.cream100}"/><rect x="15" y="47.4" width="1" height="4.2" fill="${P.red500}" opacity=".7"/></g>`;
    return (
      svgOpen(48, 60, 'class="cz-npc cz-usher"') +
      figure({
        view: 'front',
        hair: 0,
        hairCol: '#4a3438',
        outfitCol: coat,
        skinCol: SKIN_TONES[1],
        mood: 'idle',
        bodyExtra,
        pantsCol: '#2a3260',
        headExtra: cap,
        armLDeg: 58,
        armLExtra: ticket,
        armDeg: 9,
      }) +
      `</svg>`
    );
  }
  // clerk
  const bodyExtra =
    `<path d="M17.2 36.5C17.2 35.5 19.6 35 21.4 34.9L20.4 52H18.6C16 52 14.1 50.4 14.6 47.6Z" fill="${P.red500}"/>` +
    `<path d="M30.8 36.5C30.8 35.5 28.4 35 26.6 34.9L27.6 52H29.4C32 52 33.9 50.4 33.4 47.6Z" fill="${P.red600}"/>` +
    `<circle cx="24" cy="43" r=".95" fill="${P.red500}"/><circle cx="24" cy="47" r=".95" fill="${P.red500}"/>` +
    `<path d="M24 37.8L20.4 35.8V39.8Z" fill="${P.butter500}"/><path d="M24 37.8L27.6 35.8V39.8Z" fill="${P.butter600}"/><circle cx="24" cy="37.8" r="1.2" fill="${P.butter400}"/>`;
  const cap =
    `<g transform="rotate(-7 24 8)">` +
    `<path d="M13.6 9.6L15.2 2.4C15.4 1.5 16.1 1 17 1H31C31.9 1 32.6 1.5 32.8 2.4L34.4 9.6Z" fill="${P.cream100}"/>` +
    `<path d="M27.4 1H31C31.9 1 32.6 1.5 32.8 2.4L34.4 9.6H28.6Z" fill="${P.cream300}"/>` +
    `<path d="M19.6 1H22.4L22 9.6H18.6Z" fill="${P.red500}" opacity=".85"/>` +
    `<rect x="12.6" y="8.4" width="22.8" height="3.6" rx="1.8" fill="${P.red500}"/>` +
    `</g>`;
  return (
    svgOpen(48, 60, 'class="cz-npc cz-clerk"') +
    figure({
      view: 'front',
      hair: 2,
      hairCol: '#b06f43',
      outfitCol: '#fbf3e0',
      skinCol: SKIN_TONES[0],
      mood: 'happy',
      bodyExtra,
      pantsCol: '#3a4478',
      headExtra: cap,
      armDeg: 11,
    }) +
    `</svg>`
  );
}

/* ------------------------------------------------------------------- shared */

function bulbRow(points, r = 2, fill = P.butter200) {
  return points
    .map(([x, y], i) => `<circle class="bulb b${i % 2}" cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${fill}"/>`)
    .join('');
}
function lineOf(x0, y0, x1, y1, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return out;
}
function star4(cx, cy, r, fill, extra = '') {
  const k = r * 0.28;
  return `<path ${extra} d="M${cx} ${r1(cy - r)}Q${r1(cx + k)} ${r1(cy - k)} ${r1(cx + r)} ${cy}Q${r1(cx + k)} ${r1(cy + k)} ${cx} ${r1(cy + r)}Q${r1(cx - k)} ${r1(cy + k)} ${r1(cx - r)} ${cy}Q${r1(cx - k)} ${r1(cy - k)} ${cx} ${r1(cy - r)}Z" fill="${fill}"/>`;
}

/* -------------------------------------------------------------------- lobby */

/** Useful coordinates in lobbySVG space (390 x 560). */
export const LOBBY_ANCHORS = {
  wallBottomY: 210,
  posterSlot: { x: 147, y: 70, w: 96, h: 54 },
  counter: { x: 4, y: 158, w: 126, h: 58 }, // solid; clerk stands behind it
  counterTopY: 158,
  clerkFeet: { x: 92, y: 174 }, // draw clerk BEFORE lobbySVG({layer:'front'}) or clip at counterTopY
  usherFeet: { x: 346, y: 240 },
  stanchion: { x: 232, y: 196, w: 48, h: 40 },
  doors: { x: 276, y: 68, w: 90, h: 142 },
  doorTap: { x: 321, y: 226 },
  concessionTap: { x: 68, y: 232 },
  bench: { x: 8, y: 462, w: 102, h: 76 },
  plant: { x: 322, y: 430, w: 64, h: 118 },
  walk: { x0: 22, x1: 368, y0: 232, y1: 520 },
};

function carpetDefs() {
  const a = '#6d1f2f'; // base
  const b = '#7b2738'; // lighter tone
  const c = '#5d1a29'; // darker tone
  return (
    `<pattern id="cz-carpet" width="56" height="56" patternUnits="userSpaceOnUse">` +
    `<rect width="56" height="56" fill="${a}"/>` +
    `<path d="M28 10L46 28L28 46L10 28Z" fill="${b}"/>` +
    `<path d="M28 19L37 28L28 37L19 28Z" fill="${a}"/>` +
    star4(28, 28, 4.2, '#c9984a', 'opacity=".5"') +
    `<path d="M0 -8L8 0L0 8L-8 0Z" fill="${c}"/><path d="M56 -8L64 0L56 8L48 0Z" fill="${c}"/>` +
    `<path d="M0 48L8 56L0 64L-8 56Z" fill="${c}"/><path d="M56 48L64 56L56 64L48 56Z" fill="${c}"/>` +
    `<circle cx="0" cy="0" r="1.8" fill="#e9d3a4" opacity=".4"/><circle cx="56" cy="0" r="1.8" fill="#e9d3a4" opacity=".4"/>` +
    `<circle cx="0" cy="56" r="1.8" fill="#e9d3a4" opacity=".4"/><circle cx="56" cy="56" r="1.8" fill="#e9d3a4" opacity=".4"/>` +
    `<circle cx="28" cy="0" r="2.4" fill="${b}"/><circle cx="28" cy="56" r="2.4" fill="${b}"/>` +
    `<circle cx="0" cy="28" r="2.4" fill="${b}"/><circle cx="56" cy="28" r="2.4" fill="${b}"/>` +
    `</pattern>` +
    `<pattern id="cz-wall" width="26" height="40" patternUnits="userSpaceOnUse">` +
    `<rect width="26" height="40" fill="${P.navy700}"/><rect width="13" height="40" fill="#293460"/>` +
    `</pattern>`
  );
}

function lobbyCounter() {
  // the solid counter + things standing on its front edge (front layer)
  let s = '';
  // front face
  s += `<path d="M4 163H130V212C130 214.2 128.2 216 126 216H8C5.8 216 4 214.2 4 212Z" fill="${P.red600}"/>`;
  s += `<path d="M4 203H130V212C130 214.2 128.2 216 126 216H8C5.8 216 4 214.2 4 212Z" fill="${P.red700}"/>`;
  s += `<path d="M104 163H130V212C130 214.2 128.2 216 126 216H104Z" fill="${P.red700}" opacity=".55"/>`;
  // inset panel with retro diamonds
  s += `<rect x="12" y="172" width="110" height="26" rx="6" fill="${P.red700}"/>`;
  for (let i = 0; i < 5; i++) {
    const cx = 25 + i * 21;
    s += `<path d="M${cx} 178L${cx + 5.4} 185L${cx} 192L${cx - 5.4} 185Z" fill="${i % 2 ? P.cream300 : P.butter500}"/>`;
  }
  // slab
  s += `<rect x="1" y="157" width="132" height="10" rx="4" fill="${P.cream300}"/>`;
  s += `<rect x="1" y="157" width="132" height="5.5" rx="2.75" fill="${P.cream100}"/>`;
  // mini bucket at the right end of the counter
  s += `<g transform="translate(112 136.4) scale(.5)">${popcornInner({ kind: 'butter', level: 1 })}</g>`;
  // straw cup
  s += `<g transform="translate(58 141.6) scale(1.05)">${drinkInner()}</g>`;
  return s;
}

function lobbyBack() {
  let s = '';
  s += `<defs>${carpetDefs()}</defs>`;

  /* ---- wall */
  s += `<rect width="390" height="212" fill="url(#cz-wall)"/>`;
  // warm pools of light on the wall (flat, stacked)
  s += `<circle cx="195" cy="96" r="92" fill="${P.butter400}" opacity=".06"/><circle cx="195" cy="96" r="66" fill="${P.butter400}" opacity=".07"/>`;
  s += `<circle cx="321" cy="48" r="46" fill="${P.butter400}" opacity=".07"/><circle cx="321" cy="48" r="30" fill="${P.butter400}" opacity=".08"/>`;
  // festoon of warm bulbs along the ceiling
  {
    let d = 'M0 9';
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const x0 = i * 65;
      d += `Q${x0 + 32.5} 25 ${x0 + 65} 9`;
      for (let k = 1; k <= 4; k++) {
        const t = k / 5;
        pts.push([x0 + 65 * t, 9 + 16 * 2 * t * (1 - t) + 1.4]);
      }
    }
    s += `<path d="${d}" fill="none" stroke="#141a36" stroke-width="1.2"/>`;
    s += bulbRow(pts, 2);
  }
  // ceiling moulding
  s += `<rect width="390" height="7" fill="${P.navy800}"/><rect y="7" width="390" height="1.6" fill="${P.cream500}" opacity=".45"/>`;
  // wainscot
  s += `<rect y="158" width="390" height="54" fill="#1f2750"/>`;
  s += `<rect y="158" width="390" height="2.4" fill="${P.cream500}" opacity=".55"/>`;
  for (const x of [136, 232]) s += `<rect x="${x}" y="168" width="24" height="28" rx="3" fill="#242d5a"/>`;
  // leaflet rack under the poster
  s += `<rect x="165" y="164" width="60" height="28" rx="4" fill="#161c3c"/>`;
  [[P.cream100, P.red500], [P.butter400, P.navy500], ['#7fc0bb', P.cream100], ['#f2a892', P.red600]].forEach(([a, b], i) => {
    const x = 169.5 + i * 13.5;
    s += `<rect x="${x}" y="167.6" width="10.6" height="16" rx="1.4" fill="${a}"/><rect x="${x + 2}" y="170" width="6.6" height="5" rx="1" fill="${b}"/>`;
  });
  s += `<rect x="165" y="181" width="60" height="11" rx="4" fill="${P.navy500}"/><rect x="165" y="181" width="60" height="2" fill="#5564a6"/>`;
  s += `<rect x="374" y="168" width="14" height="28" rx="3" fill="#242d5a"/>`;
  s += `<rect y="203" width="390" height="9" fill="${P.navy800}"/>`;

  /* ---- floor */
  s += `<rect y="210" width="390" height="350" fill="url(#cz-carpet)"/>`;
  s += `<rect y="210" width="390" height="7" fill="#1a0b16" opacity=".32"/>`;
  s += `<ellipse cx="195" cy="352" rx="176" ry="104" fill="${P.butter400}" opacity=".045"/>`;
  s += `<ellipse cx="195" cy="340" rx="118" ry="66" fill="${P.butter400}" opacity=".045"/>`;
  // light spilling out of the popcorn machine + door sign
  s += `<ellipse cx="62" cy="232" rx="66" ry="16" fill="${P.butter400}" opacity=".07"/>`;
  s += `<ellipse cx="321" cy="226" rx="58" ry="13" fill="${P.butter400}" opacity=".07"/>`;

  /* ---- concession (left) */
  // recess
  s += `<rect x="6" y="54" width="122" height="110" rx="5" fill="#161c3c"/>`;
  s += `<rect x="6" y="54" width="122" height="14" fill="#0e1228" opacity=".5"/>`;
  s += `<circle cx="92" cy="132" r="34" fill="${P.butter400}" opacity=".05"/>`;
  // menu board
  s += `<g transform="translate(0 -1.5)">`;
  s += `<rect x="63" y="68" width="60" height="38" rx="4" fill="${P.navy500}"/>`;
  s += `<rect x="65" y="70" width="56" height="34" rx="3" fill="#1c2346"/>`;
  s += `<text x="93" y="80.6" text-anchor="middle" font-size="8.6" font-weight="800" fill="${P.butter400}">메뉴</text>`;
  s += `<rect x="71" y="83.4" width="44" height="1" fill="${P.navy500}"/>`;
  s += `<text x="70" y="92.6" font-size="7.6" font-weight="700" fill="${P.cream100}">팝콘</text><text x="116" y="92.6" text-anchor="end" font-size="7.6" font-weight="700" fill="${P.butter400}">3.0</text>`;
  s += `<text x="70" y="101.4" font-size="7.6" font-weight="700" fill="${P.cream100}">콜라</text><text x="116" y="101.4" text-anchor="end" font-size="7.6" font-weight="700" fill="${P.butter400}">2.0</text></g>`;

  // popcorn machine
  s += `<g transform="translate(0 8)">`;
  s += `<circle cx="35" cy="112" r="46" fill="${P.butter400}" opacity=".08"/><circle cx="35" cy="112" r="33" fill="${P.butter400}" opacity=".09"/>`;
  s += `<rect x="12" y="140" width="46" height="12" rx="3" fill="${P.red700}"/>`; // base
  s += `<rect x="14" y="86" width="42" height="56" rx="3" fill="${P.butter400}"/>`; // glass
  s += `<rect x="18" y="90" width="34" height="48" rx="3" fill="${P.butter200}"/>`;
  // kettle
  s += `<rect x="34" y="86" width="2" height="8" fill="${P.red700}"/>`;
  s += `<path d="M27 94H43L41 101C40.7 102.2 39.8 103 38.6 103H31.4C30.2 103 29.3 102.2 29 101Z" fill="${P.red600}"/>`;
  s += `<path d="M37 94H43L41 101C40.7 102.2 39.8 103 38.6 103H36Z" fill="${P.red700}"/>`;
  // falling kernels
  s += `<circle cx="30" cy="108" r="1.8" fill="#fffaf0"/><circle cx="39" cy="112" r="1.6" fill="#fffaf0"/><circle cx="25" cy="116" r="1.5" fill="#fffaf0"/>`;
  // heap
  for (const [x, y, r, t] of [
    [20, 136, 5, 1], [27, 134, 5.4, 0], [35, 132.6, 6, 0], [43, 134, 5.4, 1], [50, 136.4, 4.6, 0],
    [24, 129.4, 4.4, 0], [31, 126.6, 4.8, 1], [39, 126.8, 4.6, 0], [45.4, 129.6, 4, 1], [35, 122.4, 4.2, 0],
  ]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${t ? '#f6dc8c' : '#fff6d8'}"/>`;
  s += `<rect x="14" y="137" width="42" height="5" fill="${P.butter400}"/>`;
  // glass glint + posts
  s += `<path d="M20 92H26L19 110V93C19 92.4 19.4 92 20 92Z" fill="#fff" opacity=".5"/>`;
  s += `<rect x="12" y="84" width="3.4" height="58" rx="1.2" fill="${P.red600}"/><rect x="54.6" y="84" width="3.4" height="58" rx="1.2" fill="${P.red700}"/>`;
  // roof
  s += `<path d="M9 86L12.4 73.6C12.8 72 14 71 15.6 71H54.4C56 71 57.2 72 57.6 73.6L61 86Z" fill="${P.red600}"/>`;
  s += `<path d="M46 71H54.4C56 71 57.2 72 57.6 73.6L61 86H49Z" fill="${P.red700}"/>`;
  s += `<text x="34.6" y="82.4" text-anchor="middle" font-size="8.2" font-weight="800" fill="${P.cream100}">팝콘</text>`;
  s += `<rect x="8" y="85" width="54" height="3" rx="1.5" fill="${P.butter500}"/>`;
  s += `</g>`;

  // awning
  s += `<rect x="6" y="60" width="122" height="7" fill="#0b0e22" opacity=".3"/>`;
  for (let i = 0; i < 9; i++) {
    const x = 2 + i * 14.4;
    const col = i % 2 ? P.cream100 : P.red500;
    s += `<path d="M${r1(x)} 40H${r1(x + 14.4)}V58A7.2 7.2 0 0 1 ${r1(x)} 58Z" fill="${col}"/>`;
  }
  s += `<rect x="2" y="40" width="129.6" height="5" fill="#3b2247" opacity=".2"/>`;
  s += `<rect x="0" y="36" width="134" height="6" rx="3" fill="${P.red700}"/>`;
  // 매점 sign
  s += `<rect x="38" y="12" width="2" height="8" fill="${P.cream500}" opacity=".6"/><rect x="94" y="12" width="2" height="8" fill="${P.cream500}" opacity=".6"/>`;
  s += `<rect x="30" y="14" width="74" height="22" rx="7" fill="${P.butter600}"/>`;
  s += `<rect x="30" y="13" width="74" height="20" rx="7" fill="${P.butter400}"/>`;
  s += `<text x="67" y="28.4" text-anchor="middle" font-size="14" font-weight="800" letter-spacing="3" fill="${P.ink}">매점</text>`;

  /* ---- centre: neon + poster */
  // neon '동시상영'
  s += `<rect x="143" y="10" width="104" height="27" rx="13.5" fill="#161c3c"/>`;
  s += `<rect x="146" y="13" width="98" height="21" rx="10.5" fill="none" stroke="${P.red300}" stroke-width="5" opacity=".16"/>`;
  s += `<rect x="146" y="13" width="98" height="21" rx="10.5" fill="none" stroke="#ffb9ae" stroke-width="1.6"/>`;
  s += `<text x="196.2" y="28.6" text-anchor="middle" font-size="13.5" font-weight="800" letter-spacing="2.4" fill="none" stroke="#ff8a7c" stroke-width="4.4" stroke-linejoin="round" opacity=".3">동시상영</text>`;
  s += `<text x="196.2" y="28.6" text-anchor="middle" font-size="13.5" font-weight="800" letter-spacing="2.4" fill="${P.butter200}">동시상영</text>`;

  // header tab '오늘의 상영'
  s += `<path d="M161 62V52C161 48.7 163.7 46 167 46H223C226.3 46 229 48.7 229 52V62Z" fill="${P.red600}"/>`;
  s += `<text x="195" y="57.4" text-anchor="middle" font-size="9.4" font-weight="800" letter-spacing=".6" fill="${P.cream100}">오늘의 상영</text>`;
  // frame
  s += `<rect x="135" y="134" width="120" height="5" rx="2.5" fill="#0b0e22" opacity=".3"/>`;
  s += `<rect x="137" y="60" width="116" height="76" rx="6" fill="${P.red600}"/>`;
  s += `<path d="M137 124H253V130C253 133.3 250.3 136 247 136H143C139.7 136 137 133.3 137 130Z" fill="${P.red700}"/>`;
  s += bulbRow([
    ...lineOf(142.4, 65, 247.6, 65, 10),
    ...lineOf(247.6, 77.8, 247.6, 116.2, 4),
    ...lineOf(247.6, 129, 142.4, 129, 10),
    ...lineOf(142.4, 116.2, 142.4, 77.8, 4),
  ], 1.9);
  // slot (exactly 147,70 96x54)
  s += `<rect x="146" y="69" width="98" height="56" rx="2" fill="${P.butter500}"/>`;
  s += `<rect x="147" y="70" width="96" height="54" fill="${P.navy900}"/>`;
  s += `<path d="M147 70H181L159 124H147Z" fill="#fff" opacity=".035"/>`;
  s += `<path d="M190 89.5V104.5L203 97Z" fill="${P.navy600}"/>`;

  /* ---- doors (right) */
  s += `<path d="M270 212V74C270 67.4 275.4 62 282 62H360C366.6 62 372 67.4 372 74V212Z" fill="${P.cream500}"/>`;
  s += `<path d="M276 212V76C276 71.6 279.6 68 284 68H358C362.4 68 366 71.6 366 76V212Z" fill="${P.red600}"/>`;
  s += `<path d="M322 68H358C362.4 68 366 71.6 366 76V212H322Z" fill="#96293a"/>`;
  s += `<rect x="276" y="197" width="90" height="15" fill="${P.butter600}"/><rect x="276" y="197" width="45" height="3" fill="${P.butter400}"/><rect x="322" y="197" width="44" height="15" fill="#3b2247" opacity=".16"/>`;
  s += `<rect x="320" y="68" width="2" height="144" fill="${P.red800}"/>`;
  for (const cx of [298, 344]) {
    s += `<circle cx="${cx}" cy="104" r="13" fill="${P.butter600}"/><circle cx="${cx}" cy="104" r="10" fill="${P.navy800}"/>`;
    s += `<path d="M${cx - 7.6} 100.6A8 8 0 0 1 ${cx - 1} 96.2" stroke="${P.navy300}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".7"/>`;
  }
  s += `<rect x="312.6" y="134" width="3.4" height="30" rx="1.7" fill="${P.butter500}"/><rect x="326" y="134" width="3.4" height="30" rx="1.7" fill="${P.butter600}"/>`;
  // padded studs
  for (const [x, y] of [[288, 140], [302, 152], [288, 164], [302, 176], [354, 140], [340, 152], [354, 164], [340, 176]]) {
    s += `<circle cx="${x}" cy="${y}" r="1.7" fill="${P.butter600}" opacity=".75"/>`;
  }
  // 1관 light box
  s += `<rect x="293" y="35" width="56" height="23" rx="6" fill="${P.butter600}"/>`;
  s += `<rect x="295" y="37" width="52" height="19" rx="4.5" fill="${P.butter200}"/>`;
  s += `<text x="321" y="51.6" text-anchor="middle" font-size="13.5" font-weight="800" letter-spacing="1" fill="${P.ink}">1관</text>`;

  // rope stanchion (left of the doors)
  s += `<ellipse cx="256" cy="233" rx="20" ry="3.4" fill="#1a0b16" opacity=".3"/>`;
  s += `<path d="M240 203Q256 221 272 203" stroke="${P.red500}" stroke-width="3.4" stroke-linecap="round" fill="none"/>`;
  s += `<path d="M240 203Q256 221 272 203" stroke="${P.red300}" stroke-width="1" stroke-linecap="round" fill="none" opacity=".5" transform="translate(0 -1)"/>`;
  for (const x of [240, 272]) {
    s += `<rect x="${x - 1.7}" y="201" width="3.4" height="30" fill="${P.butter600}"/>`;
    s += `<rect x="${x - 1.7}" y="201" width="1.6" height="30" fill="${P.butter400}"/>`;
    s += `<ellipse cx="${x}" cy="232" rx="6.4" ry="2.6" fill="${P.butter600}"/>`;
    s += `<circle cx="${x}" cy="199.4" r="3.6" fill="${P.butter400}"/>`;
  }

  /* ---- bench (bottom-left) */
  s += `<ellipse cx="59" cy="536" rx="52" ry="5" fill="#1a0b16" opacity=".32"/>`;
  s += `<rect x="18" y="518" width="5" height="16" rx="2" fill="${P.butter600}"/><rect x="95" y="518" width="5" height="16" rx="2" fill="${P.butter600}"/>`;
  s += `<rect x="10" y="462" width="98" height="40" rx="12" fill="${P.navy500}"/>`;
  s += `<path d="M76 462H96C102.6 462 108 467.4 108 474V502H76Z" fill="#3a4680"/>`;
  for (const x of [34, 59, 84]) s += `<circle cx="${x}" cy="478" r="2" fill="${P.navy700}"/>`;
  s += `<rect x="8" y="492" width="102" height="30" rx="9" fill="#35407a"/>`;
  s += `<rect x="8" y="490" width="102" height="18" rx="9" fill="#5361a0"/>`;
  // forgotten ticket stub on the bench
  s += `<rect x="70" y="494" width="13" height="7" rx="1.4" fill="${P.cream100}" transform="rotate(-10 76 497)"/>`;

  /* ---- plant (bottom-right) */
  s += `<ellipse cx="352" cy="545" rx="24" ry="4.4" fill="#1a0b16" opacity=".32"/>`;
  const leaf = (x, y, rx, ry, rot, col) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${col}" transform="rotate(${rot} ${x} ${y})"/>`;
  s += `<rect x="350.6" y="470" width="3" height="42" fill="${P.sage700}"/>`;
  s += leaf(336, 478, 9, 19, -34, P.sage700);
  s += leaf(369, 476, 9, 19, 32, P.sage700);
  s += leaf(352, 458, 10, 22, 2, P.sage500);
  s += leaf(340, 494, 8, 15, -58, P.sage500);
  s += leaf(365, 493, 8, 15, 56, '#7da58a');
  s += leaf(345, 470, 7, 16, -18, '#7da58a');
  s += `<path d="M334 508H370L366.4 541C366.1 543.4 364.2 545 361.8 545H342.2C339.8 545 337.9 543.4 337.6 541Z" fill="${P.cream100}"/>`;
  s += `<path d="M358 508H370L366.4 541C366.1 543.4 364.2 545 361.8 545H355Z" fill="${P.cream300}"/>`;
  s += `<path d="M335.3 520H368.7L367.8 528H336.2Z" fill="${P.red500}"/>`;
  s += `<rect x="331.6" y="504" width="40.8" height="6.4" rx="3.2" fill="${P.cream300}"/>`;

  return s;
}

/**
 * lobbySVG({ layer })  — 390 x 560 lobby background without avatars.
 *  layer 'all' (default) | 'back' (everything except the counter) | 'front' (only the counter, transparent)
 *  Draw order for depth: lobbySVG({layer:'back'}) → clerk NPC → lobbySVG({layer:'front'}) → avatars.
 */
export function lobbySVG({ layer = 'all' } = {}) {
  let s = svgOpen(390, 560, 'class="cz-lobby"');
  if (layer !== 'front') s += lobbyBack();
  if (layer !== 'back') s += lobbyCounter();
  return s + `</svg>`;
}

/* --------------------------------------------------------------------- hall */

function seatInner(state = 'empty') {
  const mine = state === 'mine';
  const taken = state === 'taken';
  const base = mine ? '#b83c4a' : taken ? '#8c2939' : '#7f2535';
  const dark = mine ? '#962d3d' : taken ? '#721f30' : '#671c2c';
  const top = mine ? P.butter400 : taken ? '#a83848' : '#963142';
  const arm = '#2a1a33';
  let s = '';
  if (mine) s += `<path d="M2.4 40V11.5C2.4 4 7.6 -.6 15.6 -.6H28.4C36.4 -.6 41.6 4 41.6 11.5V40Z" fill="${P.butter400}" opacity=".22"/>`;
  s += `<rect x="0" y="17" width="7" height="23" rx="2.6" fill="${arm}"/><rect x="37" y="17" width="7" height="23" rx="2.6" fill="${arm}"/>`;
  s += `<rect x="0" y="17" width="7" height="3.4" rx="1.7" fill="#3d2946"/><rect x="37" y="17" width="7" height="3.4" rx="1.7" fill="#3d2946"/>`;
  s += `<path d="M5 40V12C5 5.6 9.4 2 16 2H28C34.6 2 39 5.6 39 12V40Z" fill="${base}"/>`;
  s += `<path d="M5 26C10 29 16 30 22 30C28 30 34 29 39 26V40H5Z" fill="${dark}"/>`;
  s += `<path d="M5 12C5 5.6 9.4 2 16 2H28C34.6 2 39 5.6 39 12V13.4C39 8.2 34.6 5.4 28 5.4H16C9.4 5.4 5 8.2 5 13.4Z" fill="${top}"/>`;
  if (mine) {
    s += star4(22, 18, 5.2, P.butter400);
  } else if (!taken) {
    s += `<rect x="18" y="15.4" width="8" height="4.6" rx="1.6" fill="${P.butter600}" opacity=".5"/>`;
  }
  return s;
}

/** seatSVG({ state }) — single seat back, viewBox 0 0 44 40. state 'empty' | 'mine' | 'taken'. */
export function seatSVG({ state = 'empty' } = {}) {
  return svgOpen(44, 40, `class="cz-seat cz-seat-${state}" overflow="visible"`) + seatInner(state) + `</svg>`;
}

function hallLayout({ rows = 4, cols = 6 } = {}) {
  const R = Math.max(1, Math.min(6, Math.round(rows) || 4));
  const C = Math.max(2, Math.min(10, Math.round(cols) || 6));
  const W = 390;
  const H = 300;
  const side = 28;
  const aisle = 38;
  const gap = 6;
  const top0 = 52;
  const bottom = 16;
  // keep at least a head's height between rows: (H-top-bottom) >= 40sc + 62sc(R-1)
  const fitH = (44 * (H - top0 - bottom)) / (40 + 62 * (R - 1));
  const seatW = Math.min(44, fitH, (W - 2 * side - aisle - gap * (C - 2)) / C);
  const sc = seatW / 44;
  const seatH = 40 * sc;
  const leftN = Math.ceil(C / 2);
  const rightN = C - leftN;
  const aisleX = W / 2 - aisle / 2;
  const blockL = leftN * seatW + (leftN - 1) * gap;
  const pitch = R > 1 ? Math.min(72, (H - top0 - bottom - seatH) / (R - 1)) : 0;
  // few rows: drop the block a little so it does not cling to the stage
  const top = top0 + Math.min(26, Math.max(0, (H - top0 - bottom - seatH - pitch * (R - 1)) / 2));
  const seats = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const x = c < leftN ? aisleX - blockL + c * (seatW + gap) : aisleX + aisle + (c - leftN) * (seatW + gap);
      seats.push({ row: r, col: c, x: r1(x), y: r1(top + r * pitch), w: r1(seatW), h: r1(seatH) });
    }
  }
  return { R, C, W, H, aisle, aisleX, seatW, seatH, sc, pitch, top, seats, rightN };
}

/** hallSeatRects({ rows, cols }) → [{ row, col, x, y, w, h }] in hallSVG coordinates (390 x 300). */
export function hallSeatRects(opts = {}) {
  return hallLayout(opts).seats;
}

/**
 * hallAvatarBox(rect) → { x, y, w, h } : where to draw a 48x60 back-view avatar for a seat rect so that
 * only head + shoulders rise above the seat back once seatSVG is drawn on top of it at the same rect.
 */
export function hallAvatarBox(rect) {
  const sc = rect.w / 44;
  return { x: r1(rect.x + rect.w / 2 - 24 * sc), y: r1(rect.y - 43.5 * sc), w: r1(48 * sc), h: r1(60 * sc) };
}

/** hallSVG({ rows, cols }) — 390 x 300 seating area seen from behind (screen is above it). */
export function hallSVG(opts = {}) {
  const L = hallLayout(opts);
  const { R, W, H, aisle, aisleX, seatH, pitch, top, seats, sc } = L;
  let s = svgOpen(W, H, 'class="cz-hall"');
  s += `<rect width="${W}" height="${H}" fill="#12162f"/>`;
  // tiers: lighter near the screen (top), darker toward the viewer
  for (let r = 0; r < R; r++) {
    const y0 = r === 0 ? 0 : top + r * pitch - (pitch - seatH) + 9;
    const y1 = r === R - 1 ? H : top + (r + 1) * pitch - (pitch - seatH) + 9;
    const col = mix('#222b57', '#151a36', R > 1 ? r / (R - 1) : 0);
    s += `<rect y="${r1(y0)}" width="${W}" height="${r1(y1 - y0)}" fill="${col}"/>`;
    if (r > 0) s += `<rect y="${r1(y0)}" width="${W}" height="1.6" fill="#323d70" opacity=".8"/>`;
  }
  // glow spilling from the screen onto the front floor
  // stage lip
  s += `<rect width="${W}" height="9" fill="#3a1c2c"/><rect y="7.4" width="${W}" height="1.6" fill="${P.butter600}" opacity=".55"/>`;
  // aisle runner
  s += `<rect x="${aisleX}" y="9" width="${aisle}" height="${H - 9}" fill="#4a1828"/>`;
  s += `<rect x="${aisleX}" y="9" width="3" height="${H - 9}" fill="#5e2032"/><rect x="${aisleX + aisle - 3}" y="9" width="3" height="${H - 9}" fill="#5e2032"/>`;
  for (let r = 0; r < R; r++) {
    const y = top + r * pitch + seatH - 3;
    s += `<rect x="${aisleX + 3}" y="${r1(y + 12)}" width="${aisle - 6}" height="2" fill="#3a1220"/>`;
    // step lights: a small pill at each end of the step with a flat pool of light on the runner
    for (const x of [aisleX + 8, aisleX + aisle - 8]) {
      s += `<ellipse cx="${x}" cy="${r1(y + 15.6)}" rx="7.4" ry="3.8" fill="#742a3a"/>`;
      s += `<rect x="${x - 3.4}" y="${r1(y + 11.2)}" width="6.8" height="2.8" rx="1.4" fill="${P.butter200}"/>`;
    }
  }
  // row letters + dim wall lamps
  for (let r = 0; r < R; r++) {
    const cy = top + r * pitch + seatH / 2 + 2;
    s += `<circle cx="14" cy="${r1(cy)}" r="9" fill="#2a3466"/>`;
    s += `<text x="14" y="${r1(cy + 4.2)}" text-anchor="middle" font-size="12" font-weight="800" fill="${P.butter400}">${String.fromCharCode(65 + r)}</text>`;
  }
  // seats (empty state)
  for (const q of seats) {
    s += `<g transform="translate(${q.x} ${q.y})${sc !== 1 ? ` scale(${r1(sc * 100) / 100})` : ''}">${seatInner('empty')}</g>`;
  }
  // back rail
  s += `<rect y="${H - 12}" width="${W}" height="12" fill="#0d1024"/><rect y="${H - 12}" width="${W}" height="1.6" fill="#323d70" opacity=".7"/>`;
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ curtain */

/**
 * curtainSVG() — 390 x 220, preserveAspectRatio="none". Closed velvet curtain + valance.
 * Groups: .cz-curtain-left / .cz-curtain-right (slide them apart with CSS transforms), .cz-curtain-valance stays.
 */
export function curtainSVG() {
  const W = 390;
  const H = 220;
  const half = (x0, cls, flip) => {
    let g = `<g class="cz-curtain-half ${cls}">`;
    g += `<rect x="${x0}" width="195" height="${H}" fill="${P.red600}"/>`;
    const widths = [25, 31, 24, 34, 27, 29, 25]; // = 195
    let acc = 0;
    widths.forEach((w, i) => {
      const a = flip ? 195 - acc - w : acc; // mirror the right half
      const x = x0 + a;
      const sh = 6 + (i % 3) * 2;
      const shX = flip ? x + w - sh - 1 : x + 1;
      const hiX = flip ? x + w * 0.34 : x + w * 0.58;
      g += `<rect x="${r1(shX)}" width="${sh}" height="${H}" fill="${P.red700}"/>`;
      g += `<rect x="${r1(hiX)}" width="${i % 2 ? 3.4 : 4.6}" height="${H}" fill="${P.red500}"/>`;
      acc += w;
    });
    // overlap edge at the centre
    g += `<rect x="${flip ? x0 : x0 + 189}" width="6" height="${H}" fill="${P.red800}" opacity=".75"/>`;
    // hem
    g += `<rect x="${x0}" y="${H - 20}" width="195" height="20" fill="${P.red800}" opacity=".45"/>`;
    g += `<rect x="${x0}" y="${H - 9}" width="195" height="3.2" fill="${P.butter600}"/>`;
    g += `<rect x="${x0}" y="${H - 4}" width="195" height="4" fill="${P.red800}"/>`;
    return g + `</g>`;
  };
  let s = svgOpen(W, H, 'class="cz-curtain" preserveAspectRatio="none"');
  s += half(0, 'cz-curtain-left', false) + half(195, 'cz-curtain-right', true);
  // valance
  const n = 5;
  const sw = W / n;
  const scallop = (y, d) => {
    let p = `M0 0H${W}V${y}`;
    for (let i = n - 1; i >= 0; i--) p += `Q${r1(i * sw + sw / 2)} ${y + d} ${r1(i * sw)} ${y}`;
    return p + 'Z';
  };
  s += `<g class="cz-curtain-valance">`;
  s += `<path d="${scallop(34, 34)}" fill="#1a0b16" opacity=".28"/>`;
  s += `<path d="${scallop(30, 32)}" fill="${P.butter600}"/>`;
  s += `<path d="${scallop(27, 31)}" fill="${P.red700}"/>`;
  for (let i = 0; i < n; i++) {
    const x = i * sw;
    s += `<path d="M${r1(x + 8)} 12Q${r1(x + sw / 2)} 40 ${r1(x + sw - 8)} 12Q${r1(x + sw / 2)} 30 ${r1(x + 8)} 12Z" fill="${P.red600}"/>`;
    s += `<path d="M${r1(x + 20)} 8Q${r1(x + sw / 2)} 22 ${r1(x + sw - 20)} 8Q${r1(x + sw / 2)} 16 ${r1(x + 20)} 8Z" fill="${P.red500}" opacity=".8"/>`;
  }
  for (let i = 1; i < n; i++) {
    const x = i * sw;
    s += `<path d="M${r1(x - 3)} 26H${r1(x + 3)}L${r1(x + 2)} 38H${r1(x - 2)}Z" fill="${P.butter500}"/><circle cx="${r1(x)}" cy="26" r="3.6" fill="${P.butter400}"/>`;
  }
  s += `<rect width="${W}" height="8" fill="${P.red800}"/><rect y="8" width="${W}" height="2" fill="${P.butter600}"/>`;
  s += `</g>`;
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ marquee */

/** marqueeSVG() — 390 x 300 theatre front at night. Bulbs: class="bulb b0|b1"; stars: class="star". */
export function marqueeSVG() {
  let s = svgOpen(390, 300, 'class="cz-marquee"');
  // sky
  s += `<rect width="390" height="300" fill="${P.navy900}"/>`;
  s += `<path d="M0 132C60 112 120 120 195 108C270 96 330 108 390 92V300H0Z" fill="#161c3b"/>`;
  // moon
  s += `<circle cx="338" cy="36" r="22" fill="${P.butter200}" opacity=".06"/>`;
  s += `<circle cx="338" cy="36" r="12" fill="${P.butter200}"/><circle cx="343.6" cy="32.4" r="10.4" fill="${P.navy900}"/>`;
  // stars
  const stars = [[24, 34, 3.6], [66, 62, 2.2], [112, 22, 3], [168, 30, 2], [232, 18, 3.2], [286, 46, 2.2], [372, 74, 2.6], [40, 98, 2], [356, 118, 2]];
  stars.forEach(([x, y, r], i) => {
    s += star4(x, y, r, i % 3 ? P.cream100 : P.butter400, `class="star s${i % 3}" opacity=".9"`);
  });
  for (const [x, y] of [[90, 40], [140, 56], [200, 44], [262, 30], [312, 70], [16, 70], [378, 22]]) {
    s += `<circle class="star" cx="${x}" cy="${y}" r=".9" fill="${P.cream100}" opacity=".6"/>`;
  }
  // far rooftops
  s += `<path d="M0 262V150H18V138H44V162H62V262Z" fill="#1c2347"/>`;
  s += `<path d="M328 262V142H350V124H374V150H390V262Z" fill="#1c2347"/>`;
  for (const [x, y] of [[8, 162], [28, 150], [28, 176], [46, 190], [356, 138], [356, 162], [376, 176], [338, 186]]) {
    s += `<rect x="${x}" y="${y}" width="6" height="8" rx="1" fill="${P.butter400}" opacity=".45"/>`;
  }

  // facade
  s += `<rect x="140" y="46" width="110" height="34" fill="${P.navy600}"/>`;
  s += `<rect x="96" y="62" width="198" height="30" fill="${P.navy600}"/>`;
  s += `<rect x="58" y="78" width="274" height="184" fill="${P.navy600}"/>`;
  s += `<rect x="58" y="154" width="274" height="108" fill="#3b477c"/>`;
  s += `<path d="M262 78H332V262H262Z" fill="#12172f" opacity=".14"/>`;
  s += `<rect x="136" y="43" width="118" height="4.6" rx="2" fill="${P.cream500}"/>`;
  s += `<rect x="92" y="59" width="48" height="4.6" rx="2" fill="${P.cream500}"/><rect x="250" y="59" width="48" height="4.6" rx="2" fill="${P.cream500}"/>`;
  s += `<rect x="54" y="75" width="42" height="4.6" rx="2" fill="${P.cream500}"/><rect x="294" y="75" width="42" height="4.6" rx="2" fill="${P.cream500}"/>`;
  // film-reel emblem
  s += `<circle cx="195" cy="68" r="12.5" fill="${P.butter500}"/><circle cx="195" cy="68" r="12.5" fill="${P.butter600}" opacity="0"/>`;
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    s += `<circle cx="${r1(195 + Math.cos(a) * 7)}" cy="${r1(68 + Math.sin(a) * 7)}" r="2.7" fill="${P.navy600}"/>`;
  }
  s += `<circle cx="195" cy="68" r="1.8" fill="${P.navy600}"/>`;

  // warm pool under the marquee
  s += `<path d="M58 154H332V214C290 228 100 228 58 214Z" fill="${P.butter400}" opacity=".07"/>`;

  // marquee box
  s += `<path d="M62 150H328L318 160H72Z" fill="${P.red800}"/>`;
  s += `<rect x="62" y="90" width="266" height="62" rx="9" fill="${P.red600}"/>`;
  s += `<path d="M62 138H328V143C328 148 324 152 319 152H71C66 152 62 148 62 143Z" fill="${P.red700}"/>`;
  s += `<rect x="78" y="102" width="234" height="38" rx="5" fill="${P.butter400}"/>`;
  s += `<rect x="78" y="102" width="234" height="32" rx="5" fill="${P.butter200}"/>`;
  s += `<text x="198" y="130.4" text-anchor="middle" font-size="27" font-weight="900" letter-spacing="7" fill="${P.ink}">동시상영</text>`;
  s += star4(96, 121, 6, P.red500) + star4(294, 121, 6, P.red500);
  const pts = [
    ...lineOf(72, 96.4, 318, 96.4, 20),
    ...lineOf(319.6, 109, 319.6, 133, 3),
    ...lineOf(318, 145.8, 72, 145.8, 20),
    ...lineOf(70.4, 133, 70.4, 109, 3),
  ];
  s += pts.map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="4.4" fill="${P.butter400}" opacity=".18"/>`).join('');
  s += bulbRow(pts, 2.5);
  // downlights under the canopy
  for (const [x] of lineOf(92, 0, 298, 0, 6)) s += `<circle cx="${r1(x)}" cy="155" r="1.9" fill="${P.cream100}" opacity=".85"/>`;

  // doors
  const doorPair = (x) => {
    let d = `<rect x="${x - 4}" y="178" width="74" height="84" rx="4" fill="${P.cream500}"/>`;
    d += `<rect x="${x}" y="182" width="32" height="80" fill="${P.red600}"/><rect x="${x + 34}" y="182" width="32" height="80" fill="#96293a"/>`;
    d += `<rect x="${x + 5}" y="188" width="22" height="46" rx="4" fill="${P.butter400}"/><rect x="${x + 39}" y="188" width="22" height="46" rx="4" fill="${P.butter400}"/>`;
    d += `<path d="M${x + 5} 192C${x + 5} 189.8 ${x + 6.8} 188 ${x + 9} 188H${x + 20}L${x + 5} 216Z" fill="${P.butter200}"/>`;
    d += `<path d="M${x + 39} 192C${x + 39} 189.8 ${x + 40.8} 188 ${x + 43} 188H${x + 54}L${x + 39} 216Z" fill="${P.butter200}"/>`;
    d += `<rect x="${x + 27.6}" y="236" width="2.6" height="14" rx="1.3" fill="${P.butter500}"/><rect x="${x + 35.8}" y="236" width="2.6" height="14" rx="1.3" fill="${P.butter500}"/>`;
    d += `<rect x="${x}" y="254" width="66" height="8" fill="${P.red800}" opacity=".5"/>`;
    return d;
  };
  s += doorPair(80) + doorPair(244);

  // ticket booth
  s += `<rect x="163" y="170" width="64" height="92" rx="3" fill="${P.cream300}"/>`;
  s += `<path d="M208 170H224C225.7 170 227 171.3 227 173V262H208Z" fill="${P.cream500}"/>`;
  s += `<rect x="163" y="236" width="64" height="26" fill="${P.red600}"/><rect x="208" y="236" width="19" height="26" fill="${P.red700}"/>`;
  s += `<path d="M195 242L201 249L195 256L189 249Z" fill="${P.butter400}"/>`;
  s += `<path d="M171 226V192C171 185.4 176.4 180 183 180H207C213.6 180 219 185.4 219 192V226Z" fill="${P.butter400}"/>`;
  s += `<path d="M174 226V193C174 187.5 178.5 183 184 183H206C211.5 183 216 187.5 216 193V226Z" fill="${P.butter200}"/>`;
  // tiny clerk in the window
  s += `<path d="M183.6 226C183.6 218.4 188.4 215.4 195 215.4C201.6 215.4 206.4 218.4 206.4 226Z" fill="${P.red500}"/>`;
  s += `<circle cx="195" cy="206.4" r="8.4" fill="${SKIN_TONES[1]}"/>`;
  s += `<path d="M186.4 205.6C186.2 199.6 189.8 196.4 195 196.4C200.2 196.4 203.8 199.6 203.6 205.6C201.4 202.8 198.6 201.8 195 201.8C191.4 201.8 188.6 202.8 186.4 205.6Z" fill="#75483a"/>`;
  s += `<circle cx="191.8" cy="207.6" r="1" fill="${P.ink}"/><circle cx="198.2" cy="207.6" r="1" fill="${P.ink}"/>`;
  s += `<rect x="166" y="225" width="58" height="5.6" rx="2.8" fill="${P.cream100}"/>`;
  s += `<rect x="157" y="158" width="76" height="17" rx="5" fill="${P.red600}"/>`;
  s += `<text x="195" y="170.6" text-anchor="middle" font-size="10" font-weight="800" letter-spacing="2" fill="${P.cream100}">매표소</text>`;

  // wall lamps
  for (const x of [68, 322]) {
    s += `<circle cx="${x}" cy="196" r="11" fill="${P.butter400}" opacity=".12"/><rect x="${x - 2.6}" y="190" width="5.2" height="11" rx="2.6" fill="${P.butter200}"/>`;
  }

  // sidewalk + street
  s += `<rect y="262" width="390" height="17" fill="#39436f"/>`;
  s += `<rect y="262" width="390" height="2" fill="#4a5588"/>`;
  s += `<ellipse cx="195" cy="270.5" rx="146" ry="7.6" fill="#535587"/><ellipse cx="195" cy="270" rx="92" ry="4.4" fill="#77698a"/>`;
  s += `<rect y="279" width="390" height="3" fill="#252d55"/>`;
  s += `<rect y="282" width="390" height="18" fill="#151a36"/>`;
  for (let x = 8; x < 390; x += 52) s += `<rect x="${x}" y="290" width="26" height="2.4" rx="1.2" fill="${P.cream100}" opacity=".3"/>`;

  // street lamp (left)
  s += `<circle cx="30" cy="150" r="26" fill="${P.butter400}" opacity=".06"/><circle cx="30" cy="150" r="15" fill="${P.butter400}" opacity=".1"/>`;
  s += `<rect x="28.4" y="156" width="3.2" height="108" fill="${P.navy500}"/><rect x="25" y="260" width="10" height="5" rx="2" fill="${P.navy500}"/>`;
  s += `<path d="M22 156H38L35 160H25Z" fill="${P.navy500}"/><circle cx="30" cy="150" r="7" fill="${P.butter200}"/>`;
  // a neighbourhood cat waiting for the late show
  s += `<path d="M52 262C50 255 53 250.6 57.4 250.6C61.8 250.6 64.6 255 63 262Z" fill="${P.cream300}"/>`;
  s += `<circle cx="57" cy="247" r="4.4" fill="${P.cream300}"/><path d="M52.8 245.6L53.4 240.8L56.6 243.4Z" fill="${P.cream300}"/><path d="M61.2 245.6L60.6 240.8L57.4 243.4Z" fill="${P.cream300}"/>`;
  s += `<path d="M62.6 260.6C66.6 261 69 258.6 68.4 255.4" stroke="${P.cream300}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
  s += `<path d="M59 251C61.8 252.6 63.6 256.4 63 262H59.6Z" fill="${P.cream500}"/>`;
  // little round tree (right)
  s += `<rect x="361" y="232" width="4" height="32" fill="#2a3358"/>`;
  s += `<circle cx="363" cy="220" r="19" fill="#2c4a52"/><path d="M363 201A19 19 0 0 1 363 239A24 24 0 0 0 363 201Z" fill="#233c46"/>`;
  s += `<circle cx="356" cy="213" r="4" fill="#3a5f62" opacity=".8"/>`;
  return s + `</svg>`;
}

/* -------------------------------------------------------------- ticket stub */

/** ticketStubSVG({ title, hall, seat, time }) — viewBox 0 0 120 52. */
export function ticketStubSVG({ title = '동시상영', hall = '1관', seat = 'C4', time = '21:30' } = {}) {
  let s = svgOpen(120, 52, 'class="cz-ticket"');
  s += `<path d="M5 2H115C116.7 2 118 3.3 118 5V20A6 6 0 0 0 118 32V47C118 48.7 116.7 50 115 50H5C3.3 50 2 48.7 2 47V32A6 6 0 0 0 2 20V5C2 3.3 3.3 2 5 2Z" fill="${P.cream100}"/>`;
  s += `<path d="M84 2H115C116.7 2 118 3.3 118 5V20A6 6 0 0 0 118 32V47C118 48.7 116.7 50 115 50H84Z" fill="${P.butter400}"/>`;
  s += `<rect x="9" y="8" width="68" height="13" rx="3" fill="${P.red600}"/>`;
  s += `<text x="43" y="18" text-anchor="middle" font-size="9" font-weight="800" letter-spacing="2" fill="${P.cream100}">${title}</text>`;
  s += `<text x="10" y="33" font-size="7.2" font-weight="700" fill="${P.ink}">${hall} · 심야 상영</text>`;
  s += `<text x="10" y="44" font-size="9" font-weight="800" fill="${P.red600}">${time}</text>`;
  s += star4(68, 39, 5, P.butter500);
  for (let y = 6; y < 48; y += 5) s += `<rect x="83.4" y="${y}" width="1.2" height="2.6" fill="${P.cream500}"/>`;
  s += `<text x="101" y="20" text-anchor="middle" font-size="6.4" font-weight="700" fill="${P.ink}" opacity=".7">좌석</text>`;
  s += `<text x="101" y="38" text-anchor="middle" font-size="16" font-weight="900" fill="${P.ink}">${seat}</text>`;
  return s + `</svg>`;
}
