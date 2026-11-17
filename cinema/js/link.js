// 유튜브 주소 해석과 초대 링크(=약속) 부호화.
// 서버가 없으므로 약속의 모든 정보는 초대 링크의 # 뒤에 들어 있다.
import { b64u, unb64u, utf8, fromUtf8, cleanText, isInt } from './util.js';

const VID_RE = /^[A-Za-z0-9_-]{11}$/;
export const isVideoId = (s) => typeof s === 'string' && VID_RE.test(s);

/** "1h2m3s", "90", "1:02:03" → 초 */
function parseTime(v) {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return 0;
}

/**
 * 유튜브 주소(또는 영상 ID)에서 영상 ID를 꺼낸다.
 * watch?v= / youtu.be/ / shorts/ / live/ / embed/ / v/ / m. / music. 모두 받는다.
 * @returns {{ id: string, start: number } | null}
 */
export function parseYouTube(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (isVideoId(s)) return { id: s, start: 0 };
  // 문장 속에 섞여 붙여넣어도 주소만 골라낸다
  const found = /(https?:\/\/[^\s]+|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s]+)/i.exec(s);
  if (found) s = found[1];
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.|gaming\.)/i, '').toLowerCase();
  let id = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] || null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v') || parts[1] || null;
    else if (['shorts', 'live', 'embed', 'v', 'e'].includes(parts[0])) id = parts[1] || null;
  } else {
    return null;
  }
  if (!isVideoId(id)) return null;
  const t = u.searchParams.get('t') || u.searchParams.get('start') || (u.hash.match(/t=([\dhms]+)/) || [])[1];
  return { id, start: parseTime(t || '') };
}

/** 유튜브 썸네일. hqdefault(480x360)는 모든 영상에 있다. */
export const thumbUrl = (id, q = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

/**
 * @typedef {Object} Screening  약속(=상영) 한 건. 초대 링크에 그대로 들어간다.
 * @property {string} room   방 비밀값(16바이트 base64url). 암호화 키와 채널 이름이 여기서 나온다.
 * @property {string} vid    유튜브 영상 ID
 * @property {number} at     상영 시각 (epoch ms)
 * @property {string} title  약속/영화 제목
 * @property {number} dur    영상 길이(초). 모르면 0 (라이브 포함)
 * @property {string} host   약속을 만든 사람 닉네임
 * @property {string} hk     영사기사(호스트) 공개키. 상영 시각 변경 같은 조작의 서명을 확인한다. 없으면 ''
 */

const MAX_TITLE = 60, MAX_NAME = 16;
const MIN_AT = Date.UTC(2020, 0, 1), MAX_AT = Date.UTC(2100, 0, 1);

/** 값 검증. 어긋나면 null. (링크는 누구나 만들 수 있으므로 절대 그대로 믿지 않는다) */
export function normalizeScreening(o) {
  if (!o || typeof o !== 'object') return null;
  const room = typeof o.room === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(o.room) ? o.room : null;
  const at = Number(o.at);
  const dur = Number(o.dur);
  if (!room || !isVideoId(o.vid) || !Number.isFinite(at) || at < MIN_AT || at > MAX_AT) return null;
  return {
    room,
    vid: o.vid,
    at: Math.round(at),
    title: cleanText(o.title, MAX_TITLE) || '제목 없는 상영',
    dur: Number.isFinite(dur) && dur > 0 && dur < 86400 * 2 ? Math.round(dur) : 0,
    host: cleanText(o.host, MAX_NAME),
    hk: typeof o.hk === 'string' && /^[A-Za-z0-9_-]{80,100}$/.test(o.hk) ? o.hk : '',
  };
}

const VERSION = 1;

/** 약속 → 초대 코드 (base64url) */
export function encodeInvite(scr) {
  const arr = [VERSION, scr.room, scr.vid, Math.round(scr.at / 1000), scr.title, scr.dur || 0, scr.host || '', scr.hk || ''];
  return b64u(utf8(JSON.stringify(arr)));
}

/** 초대 코드 → 약속. 잘못된 코드면 null. */
export function decodeInvite(code) {
  try {
    if (typeof code !== 'string' || code.length > 4000) return null;
    const arr = JSON.parse(fromUtf8(unb64u(code)));
    if (!Array.isArray(arr) || arr[0] !== VERSION) return null;
    if (!isInt(arr[3], 0, 4102444800)) return null;
    return normalizeScreening({
      room: arr[1], vid: arr[2], at: arr[3] * 1000, title: arr[4], dur: arr[5], host: arr[6], hk: arr[7],
    });
  } catch { return null; }
}

/** 초대 링크 전체 주소 */
export function inviteUrl(scr) {
  const base = location.origin + location.pathname;
  return `${base}#/s/${encodeInvite(scr)}`;
}

/** 캘린더(.ics) 본문 */
export function icsFor(scr, url) {
  const fmt = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
  const end = scr.at + (scr.dur > 0 ? scr.dur : 5400) * 1000;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//dongsi//cinema//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${scr.room}@dongsi`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(scr.at)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc('🎬 ' + scr.title + ' · 동시상영')}`,
    `DESCRIPTION:${esc('온라인 영화관에서 만나요.\n' + url)}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${esc('곧 상영이 시작돼요')}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
