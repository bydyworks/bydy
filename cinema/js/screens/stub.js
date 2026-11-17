// 관람 기념 티켓(포토티켓): 화면용 카드와 저장용 이미지
import { h, fmtDate, fmtTime } from '../util.js';
import { thumbUrl } from '../link.js';

export const POPCORN_NAMES = ['고소 팝콘', '캐러멜 팝콘', '치즈 팝콘'];
export const POPCORN_KEYS = ['butter', 'caramel', 'cheese'];
export const DRINK_NAMES = ['콜라', '제로 콜라', '아이스티'];
const ROWS = 'ABCD';

/** 좌석 번호(0..23) → "B열 4번", 서 있었으면 "입석" */
export function seatLabel(idx) {
  if (!(idx >= 0)) return '입석';
  return `${ROWS[Math.floor(idx / 6)]}열 ${(idx % 6) + 1}번`;
}

const snackText = (stub) => (stub.pe > 0 ? `${POPCORN_NAMES[stub.pop]} ${stub.pe}알` : POPCORN_NAMES[stub.pop]);

/** 화면에 보여 주는 티켓 카드 @param {import('../data.js').Stub} stub */
export function stubCard(stub, { stamp = true } = {}) {
  const withText = stub.with.length ? stub.with.join(', ') : '혼자 조용히';
  return h('article', { class: 'stub' },
    stub.vid ? h('img', { class: 'stub-img', src: thumbUrl(stub.vid, 'mqdefault'), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'stub-img' }),
    h('div', { class: 'stub-body' },
      h('h3', { class: 'stub-title' }, stub.title),
      h('dl', { class: 'stub-info' },
        h('div', null, h('dt', null, '상영'), h('dd', null, `${fmtDate(stub.at)} ${fmtTime(stub.at)}`)),
        h('div', null, h('dt', null, '좌석'), h('dd', null, `1관 ${stub.seat}`)),
        h('div', null, h('dt', null, '함께'), h('dd', null, withText)),
        stub.pop >= 0 ? h('div', null, h('dt', null, '간식'), h('dd', null, snackText(stub))) : null,
      ),
    ),
    h('div', { class: 'stub-foot' }, h('span', null, '동시상영'), h('span', null, stub.name ? `관객 · ${stub.name}` : '온라인 영화관')),
    stamp ? h('div', { class: 'stub-stamp', 'aria-hidden': 'true' }, '관람', h('br'), '완료') : null,
  );
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img.naturalWidth > 120 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 6000);
  });
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch === ' ' ? '' : ch;
      if (lines.length === maxLines) break;
    } else line += ch;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length === maxLines && line) lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
  return lines;
}

/**
 * 저장·공유용 PNG. 썸네일을 캔버스에 못 그리는 환경이면 그림 없이 만든다.
 * @param {import('../data.js').Stub} stub
 * @returns {Promise<Blob|null>}
 */
export async function stubImageBlob(stub) {
  const W = 720, H = 1080;
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* 무시 */ }
  const img = stub.vid ? await loadImage(thumbUrl(stub.vid, 'hqdefault')) : null;

  const draw = (withImage) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sans = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";
    // 종이
    g.fillStyle = '#17142b'; g.fillRect(0, 0, W, H);
    const px = 40, py = 40, pw = W - 80, ph = H - 80;
    g.fillStyle = '#fff4dc';
    roundRect(g, px, py, pw, ph, 28); g.fill();
    // 그림
    const ix = px + 28, iy = py + 28, iw = pw - 56, ih = Math.round(iw * 9 / 16);
    g.save(); roundRect(g, ix, iy, iw, ih, 16); g.clip();
    g.fillStyle = '#2a1f3d'; g.fillRect(ix, iy, iw, ih);
    if (withImage && img) {
      // hqdefault(4:3)의 가운데 16:9 영역만
      const sh = img.naturalWidth * 9 / 16, sy = (img.naturalHeight - sh) / 2;
      g.drawImage(img, 0, sy, img.naturalWidth, sh, ix, iy, iw, ih);
    } else {
      g.fillStyle = '#ffd766'; g.font = `900 64px ${sans}`; g.textAlign = 'center';
      g.fillText('🎬', ix + iw / 2, iy + ih / 2 + 22);
    }
    g.restore();
    // 제목
    let y = iy + ih + 70;
    g.fillStyle = '#17142b'; g.textAlign = 'left';
    g.font = `800 44px ${sans}`;
    for (const line of wrapText(g, stub.title, iw, 2)) { g.fillText(line, ix, y); y += 56; }
    // 절취선
    y += 6;
    g.strokeStyle = '#c9b993'; g.lineWidth = 3; g.setLineDash([10, 10]);
    g.beginPath(); g.moveTo(px + 20, y); g.lineTo(px + pw - 20, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#17142b';
    g.beginPath(); g.arc(px, y, 18, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(px + pw, y, 18, 0, Math.PI * 2); g.fill();
    y += 62;
    // 항목
    const rows = [
      ['상영', `${fmtDate(stub.at)}  ${fmtTime(stub.at)}`],
      ['좌석', `1관 ${stub.seat}`],
      ['함께', stub.with.length ? stub.with.join(', ') : '혼자 조용히'],
    ];
    if (stub.pop >= 0) rows.push(['간식', snackText(stub)]);
    for (const [k, v] of rows) {
      g.fillStyle = '#8a7a5c'; g.font = `600 26px ${sans}`; g.fillText(k, ix, y);
      g.fillStyle = '#17142b'; g.font = `700 30px ${sans}`;
      const lines = wrapText(g, v, iw - 110, 2);
      lines.forEach((line, i) => g.fillText(line, ix + 110, y + i * 40));
      y += 40 * lines.length + 22;
    }
    // 도장
    g.save();
    g.translate(px + pw - 130, py + ph - 170); g.rotate(-0.2);
    g.strokeStyle = '#c2283a'; g.fillStyle = '#c2283a'; g.lineWidth = 6; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(0, 0, 74, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.lineWidth = 2; g.stroke();
    g.font = `900 34px ${sans}`; g.textAlign = 'center';
    g.fillText('관람', 0, -4); g.fillText('완료', 0, 34);
    g.restore();
    // 바닥글
    g.fillStyle = '#17142b'; g.textAlign = 'left'; g.font = `900 34px 'Black Han Sans', ${sans}`;
    g.fillText('동시상영', ix, py + ph - 44);
    g.fillStyle = '#8a7a5c'; g.font = `600 22px ${sans}`;
    g.fillText(stub.name ? `관객 · ${stub.name}` : '온라인 영화관', ix, py + ph - 88);
    return c;
  };

  const toBlob = (canvas) => new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); }
  });
  let blob = await toBlob(draw(true));
  if (!blob && img) blob = await toBlob(draw(false));   // 썸네일 때문에 캔버스가 잠긴 경우
  return blob;
}

function roundRect(g, x, y, w, h2, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h2, r);
  g.arcTo(x + w, y + h2, x, y + h2, r);
  g.arcTo(x, y + h2, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 이미지를 공유하거나 내려받는다 */
export async function shareStub(stub) {
  const blob = await stubImageBlob(stub);
  if (!blob) return false;
  const file = new File([blob], '동시상영-티켓.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: stub.title });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return true;   // 사용자가 공유 창을 닫음
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: '동시상영-티켓.png' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
