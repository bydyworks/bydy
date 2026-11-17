// 작은 공용 도구 모음. 의존성 없음.

/** @returns {HTMLElement|null} */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 아주 작은 hyperscript. 문자열 자식은 항상 텍스트 노드가 된다(HTML로 해석하지 않음).
 * 닉네임·제목처럼 남이 보낸 문자열은 반드시 이 함수(=textContent)로만 화면에 올린다.
 * attrs: class, dataset:{}, style:{}, on<event>: fn, 그 외는 setAttribute. false/null/undefined 값은 건너뜀.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, val] of Object.entries(v)) {
          if (p.startsWith('--')) el.style.setProperty(p, val);
          else el.style[p] = val;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

/** el 의 자식을 통째로 바꾼다. null/false 는 건너뛴다 (replaceChildren 은 null 을 "null" 글자로 넣어 버린다). */
export function setChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === false || c == null) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/**
 * 신뢰할 수 있는 SVG 마크업(art.js가 만든 것)만 노드로 바꾼다.
 * 사용자 입력이 섞인 문자열을 절대 넘기지 말 것.
 * @returns {SVGElement}
 */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return /** @type {any} */ (t.content.firstElementChild);
}

// ---------- 인코딩 ----------
const te = new TextEncoder();
const td = new TextDecoder();
export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);

export function b64u(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(nBytes = 9) {
  return b64u(crypto.getRandomValues(new Uint8Array(nBytes)));
}

/** 남이 보낸 문자열 정리: 제어문자·줄바꿈 제거, 공백 정리, 길이 제한(글자 단위). */
export function cleanText(v, maxLen) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, maxLen).join('');
}

export const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// ---------- 저장소 ----------
const PREFIX = 'dsy.';
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* 무시 */ } },
};

export const session = {
  get(key, fallback = null) {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) { try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 무시 */ } },
};

// ---------- 이벤트 ----------
export function emitter() {
  /** @type {Map<string, Set<Function>>} */
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt)?.delete(fn);
    },
    off(evt, fn) { map.get(evt)?.delete(fn); },
    emit(evt, ...args) {
      const set = map.get(evt);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try { fn(...args); } catch (e) { console.error('[emit]', evt, e); }
      }
    },
    clear() { map.clear(); },
  };
}

// ---------- 시간 표시 (모두 보는 사람의 현지 시간대 기준) ----------
const pad2 = (n) => String(n).padStart(2, '0');

/** 초 → "3:07" / "1:02:03" */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh > 0 ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`;
}

/** 남은 시간(ms) → "12:34" 카운트다운. 1시간 이상이면 "1:02:03". */
export function fmtCountdown(ms) {
  return fmtDuration(Math.ceil(Math.max(0, ms) / 1000));
}

/** 남은 시간(ms) → "2시간 13분 뒤", "3일 뒤", "곧" */
export function fmtUntil(ms) {
  if (ms <= 0) return '지금';
  const m = Math.round(ms / 60000);
  if (m < 1) return '곧';
  if (m < 60) return `${m}분 뒤`;
  const hrs = Math.floor(m / 60), rem = m % 60;
  if (hrs < 24) return rem ? `${hrs}시간 ${rem}분 뒤` : `${hrs}시간 뒤`;
  const d = Math.floor(hrs / 24);
  return `${d}일 뒤`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** epoch ms → "11월 21일 (금) 오후 9:00" */
export function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) ${fmtTime(ts)}`;
}

/** epoch ms → "오후 9:00" */
export function fmtTime(ts) {
  const d = new Date(ts);
  const hh = d.getHours();
  const ap = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ap} ${h12}:${pad2(d.getMinutes())}`;
}

/** epoch ms → "2026.11.21" */
export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

/** <input type="datetime-local"> 값으로 (현지 시간) */
export function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
