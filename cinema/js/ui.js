// 공용 UI 조각: 토스트, 바텀시트, 버튼, 아바타 그리기.
import { h, svg, $ } from './util.js';
import { avatarSVG } from './art.js';
import { sfx } from './sfx.js';

// ---------- 유튜브 플레이어 비켜 가기 ----------
// 상영관에 플레이어가 걸려 있는 동안에는 토스트·시트(어두운 배경까지)를 그 위에 그리지 않는다 (유튜브 정책).
// 스크린이 어디 있는지 재서 CSS 변수로 알려 주면 #toast-root 와 .sheet-wrap 이 그 밖에만 놓인다 (css/app.css 의 --clear-*).
function keepClearOfPlayer() {
  const frame = document.querySelector('.room.hall .yt-mount > *');
  const box = frame && frame.getBoundingClientRect();
  const clear = { top: '', left: '', right: '' };
  if (box && box.width > 0 && box.height > 0) {
    const room = frame.closest('.room').getBoundingClientRect();
    const scr = (frame.closest('.screen-wrap') || frame).getBoundingClientRect();
    if (room.right - scr.right >= 200) {
      // 가로 배치: 스크린 옆의 객석 칸만 쓴다
      clear.left = `${Math.ceil(scr.right)}px`;
      clear.right = `${Math.max(0, Math.floor(document.documentElement.clientWidth - room.right))}px`;
    } else {
      // 세로 배치: 스크린 아래만 쓴다
      clear.top = `${Math.max(0, Math.ceil(scr.bottom))}px`;
    }
  }
  const st = document.documentElement.style;
  for (const side of Object.keys(clear)) {
    const name = `--clear-${side}`;
    if (st.getPropertyValue(name) === clear[side]) continue;      // 그대로면 건드리지 않는다 (화면이 바뀔 때마다 불린다)
    if (clear[side]) st.setProperty(name, clear[side]);
    else st.removeProperty(name);
  }
  return clear.top ? window.innerHeight - parseFloat(clear.top) : Infinity;    // 스크린 아래에 남는 높이
}
const SHEET_ROOM = 240;     // 시트를 펴려면 스크린 아래에 적어도 이만큼은 있어야 한다
/**
 * 아주 작은 창에서는 스크린 아래에 시트를 펼 자리가 없다: 그런 창에서만 스크롤되는 상영관(css)을 위로 밀어 자리를 낸다.
 * @returns {() => void} 시트를 닫을 때 부르면 밀어 둔 상영관을 제자리로 돌린다
 */
function makeRoomForSheet() {
  const lack = SHEET_ROOM - keepClearOfPlayer();
  const hall = lack > 0 ? document.querySelector('.room.hall') : null;
  if (!hall || getComputedStyle(hall).overflowY !== 'auto') return () => {};
  const was = hall.scrollTop;
  hall.scrollTop += lack;
  keepClearOfPlayer();
  return () => { hall.scrollTop = was; };
}
// 시트·토스트가 떠 있는 사이에 플레이어가 걸리거나(상영 시작) 화면이 돌아가도 따라가게, 화면이 바뀔 때마다 다시 잰다
const screenRoot = $('#screen');
if (screenRoot && typeof MutationObserver === 'function') {
  new MutationObserver(keepClearOfPlayer).observe(screenRoot, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
}
window.addEventListener('resize', keepClearOfPlayer);
// 아주 작은 창에서는 상영관 자체가 스크롤된다 (scroll 은 위로 전파되지 않아 capture 로 듣는다)
window.addEventListener('scroll', (e) => { if (e.target instanceof Element && e.target.matches('.room.hall')) keepClearOfPlayer(); }, { capture: true, passive: true });

// ---------- 토스트 ----------
let toastTimer = 0;
/** 화면 아래 잠깐 뜨는 한 줄 알림 */
export function toast(text, ms = 2400) {
  const root = $('#toast-root');
  if (!root) return;
  keepClearOfPlayer();
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
  const root = $('#sheet-root'), app = $('#app');
  // 닫을 때 초점을 돌려줄 곳. 앞 시트를 닫은 뒤에 읽어야 (사라질 그 시트의 버튼이 아니라) 처음 시트를 연 곳이 된다.
  const opener = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    closeCurrent = null;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOutside);
    window.removeEventListener('resize', refit);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    if (app) app.inert = false;
    restoreRoom();
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  // 플레이어를 피해 좁아진 시트는 어두운 배경이 화면을 다 덮지 않는다: 그 밖(스크린 쪽)을 눌러도 닫힌다.
  // composedPath — 눌린 버튼이 그 누름으로 지워졌더라도(캐릭터 고르기) 시트 안에서 일어난 일인지 알 수 있다.
  // isTrusted — 사람이 누른 것만 센다. 코드가 일으킨 누름(이미지 저장이 만드는 내려받기 링크의 click())에 시트가 닫히면 안 된다.
  const onOutside = (e) => { if (dismissable && e.isTrusted && !e.composedPath().includes(root)) close(); };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '안내', tabindex: '-1' },
    h('div', { class: 'sheet-grip' }),
    title ? h('h2', { class: 'sheet-title' }, title) : null,
    h('div', { class: 'sheet-body' }, content),
  );
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap && dismissable) close(); } }, panel);
  let restoreRoom = makeRoomForSheet();
  // 시트가 떠 있는 동안 창 크기가 바뀌면(화면 키보드, 회전) 자리를 다시 낸다
  const refit = () => { if (closed) return; restoreRoom(); restoreRoom = makeRoomForSheet(); };
  window.addEventListener('resize', refit);
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  document.addEventListener('keydown', onKey);
  setTimeout(() => { if (!closed) document.addEventListener('click', onOutside); }, 0);   // 시트를 연 바로 그 누름은 세지 않는다
  // 시트가 떠 있는 동안 뒤 화면은 누를 수도, Tab 으로 갈 수도 없다. 초점은 시트로 옮긴다 (키보드·화면 낭독기).
  if (app) app.inert = true;
  panel.focus({ preventScroll: true });
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
  // 무대 가장자리에서 잘리지 않게 안쪽으로 민다.
  // 방금 붙인 말풍선은 등장 애니메이션 때문에 절반 크기로 재어진다: 가운데는 그대로이니 가운데 + 원래 너비(offsetWidth)로 계산한다.
  const stage = host.closest('.stage');
  if (stage) {
    const s = stage.getBoundingClientRect(), r = b.getBoundingClientRect();
    const cx = (r.left + r.right) / 2, half = b.offsetWidth / 2;
    const over = Math.max(0, cx + half - (s.right - 4)) || -Math.max(0, (s.left + 4) - (cx - half));
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
