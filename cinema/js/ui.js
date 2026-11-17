// 공용 UI 조각: 토스트, 바텀시트, 버튼, 아바타 그리기.
import { h, svg, $ } from './util.js';
import { avatarSVG } from './art.js';
import { sfx } from './sfx.js';

// ---------- 토스트 ----------
let toastTimer = 0;
/** 화면 아래 잠깐 뜨는 한 줄 알림 */
export function toast(text, ms = 2400) {
  const root = $('#toast-root');
  if (!root) return;
  root.replaceChildren(h('div', { class: 'toast' }, text));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.replaceChildren(), ms);
}

// ---------- 버튼 ----------
/**
 * @param {string|Node|Array} label
 * @param {{ kind?: 'primary'|'soft'|'ghost'|'danger', onClick?: (e: Event) => void, small?: boolean, disabled?: boolean, cls?: string, aria?: string }} [o]
 */
export function button(label, o = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-${o.kind || 'soft'}${o.small ? ' btn-sm' : ''}${o.cls ? ' ' + o.cls : ''}`,
    disabled: o.disabled || false,
    'aria-label': o.aria,
    onclick: (e) => { sfx.unlock(); sfx.tap(); o.onClick && o.onClick(e); },
  }, label);
}

// ---------- 바텀시트 ----------
let closeCurrent = null;
/**
 * 아래에서 올라오는 시트. content 는 노드(들).
 * @returns {() => void} 닫는 함수
 */
export function sheet({ title, content, onClose, dismissable = true }) {
  if (closeCurrent) closeCurrent();
  const root = $('#sheet-root');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    closeCurrent = null;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '안내' },
    h('div', { class: 'sheet-grip' }),
    title ? h('h2', { class: 'sheet-title' }, title) : null,
    h('div', { class: 'sheet-body' }, content),
  );
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap && dismissable) close(); } }, panel);
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  document.addEventListener('keydown', onKey);
  closeCurrent = close;
  return close;
}

export function closeSheet() { if (closeCurrent) closeCurrent(); }

/** 예/아니오 시트. @returns {Promise<boolean>} */
export function confirmSheet({ title, body, ok = '확인', cancel = '취소', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (answered) return; answered = true; resolve(v); close(); };
    const close = sheet({
      title,
      content: [
        body ? h('p', { class: 'sheet-text' }, body) : null,
        h('div', { class: 'row gap' },
          button(cancel, { kind: 'ghost', onClick: () => done(false), cls: 'grow' }),
          button(ok, { kind: danger ? 'danger' : 'primary', onClick: () => done(true), cls: 'grow' }),
        ),
      ],
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

// ---------- 아바타 ----------
/**
 * 아바타 SVG 노드. av = [hair, hairColor, outfit, skin] (팔레트 번호 — 색 문자열을 직접 받지 않는다)
 * @param {number[]} av
 * @param {{ view?: 'front'|'back', holding?: null|'popcorn'|'drink', mood?: 'idle'|'happy' }} [o]
 */
export function avatarNode(av, o = {}) {
  return svg(avatarSVG({
    view: o.view || 'front',
    hair: av[0] | 0,
    hairColor: av[1] | 0,
    outfit: av[2] | 0,
    skin: av[3] | 0,
    holding: o.holding || null,
    mood: o.mood || 'idle',
  }));
}

/** 머리 위로 떠오르는 이모지/말풍선. host = position:relative 인 아바타 요소 */
export function bubble(host, content, { kind = 'emote', ms = 2200 } = {}) {
  host.querySelectorAll('.bubble.' + kind).forEach((n) => n.remove());
  const b = h('div', { class: `bubble ${kind}` }, content);
  host.appendChild(b);
  // 말풍선이 떠 있는 동안에는 그 사람을 맨 앞으로 (다른 아바타의 이름표에 가리지 않게)
  host.classList.add('has-bubble');
  // 무대 가장자리에서 잘리지 않게 안쪽으로 민다
  const stage = host.closest('.stage');
  if (stage) {
    const s = stage.getBoundingClientRect(), r = b.getBoundingClientRect();
    const over = Math.max(0, r.right - (s.right - 4)) || -Math.max(0, (s.left + 4) - r.left);
    if (over) b.style.marginLeft = `${-over}px`;
  }
  setTimeout(() => b.classList.add('out'), ms - 300);
  setTimeout(() => {
    b.remove();
    if (!host.querySelector('.bubble')) host.classList.remove('has-bubble');
  }, ms);
  return b;
}

/** 클립보드 복사 (구형 브라우저 대비) */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}
