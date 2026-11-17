// 이 기기에 저장해 두는 것들: 내가 아는 약속 목록, 티켓북(관람 기념 티켓).
import { store, cleanText, isInt, fmtUntil } from './util.js';
import { normalizeScreening, encodeInvite } from './link.js';

const KEEP_AFTER_END = 36 * 3600 * 1000;   // 끝난 약속은 하루 반 뒤 목록에서 정리
const MAX_KNOWN = 30;
const MAX_TICKETS = 200;

/** 약속의 "끝나는 시각" 추정 (길이를 모르면 3시간으로 본다) */
export const endOf = (scr) => scr.at + (scr.dur > 0 ? scr.dur : 3 * 3600) * 1000;

/** @returns {{ scr: import('./link.js').Screening, code: string, mine: boolean }[]} 가까운 순 */
export function listScreenings(now = Date.now()) {
  const raw = store.get('known', []);
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const scr = normalizeScreening(r && r.scr);
    if (!scr || endOf(scr) + KEEP_AFTER_END < now) continue;
    out.push({ scr, code: encodeInvite(scr), mine: !!r.mine });
  }
  out.sort((a, b) => a.scr.at - b.scr.at);
  return out;
}

/** 약속을 기억해 둔다 (만들었거나 초대 링크로 열었을 때) */
export function rememberScreening(scr, mine = false) {
  const list = listScreenings().filter((r) => r.scr.room !== scr.room);
  const prev = listScreenings().find((r) => r.scr.room === scr.room);
  list.push({ scr, code: encodeInvite(scr), mine: mine || !!(prev && prev.mine) });
  list.sort((a, b) => a.scr.at - b.scr.at);
  store.set('known', list.slice(-MAX_KNOWN).map((r) => ({ scr: r.scr, mine: r.mine })));
}

export function forgetScreening(room) {
  store.set('known', listScreenings().filter((r) => r.scr.room !== room).map((r) => ({ scr: r.scr, mine: r.mine })));
  store.del('host.' + room);
  store.del('ctl.' + room);
}

/**
 * @typedef {Object} Stub  관람 기념 티켓
 * @property {string} room
 * @property {string} title
 * @property {string} vid
 * @property {number} at      상영 시각
 * @property {string} seat    "B열 4번" / "입석"
 * @property {string[]} with  함께 본 사람들
 * @property {number} pop     먹은 팝콘 종류 (-1 = 안 먹음)
 * @property {number} pe      먹은 팝콘 알 수
 * @property {string} name    내 닉네임(그날의)
 */

function normalizeStub(s) {
  if (!s || typeof s !== 'object' || typeof s.room !== 'string' || typeof s.vid !== 'string') return null;
  return {
    room: s.room.slice(0, 64),
    title: cleanText(s.title, 60) || '제목 없는 상영',
    vid: /^[A-Za-z0-9_-]{11}$/.test(s.vid) ? s.vid : '',
    at: Number.isFinite(s.at) ? s.at : Date.now(),
    seat: cleanText(s.seat, 12) || '입석',
    with: (Array.isArray(s.with) ? s.with : []).map((n) => cleanText(n, 16)).filter(Boolean).slice(0, 30),
    pop: isInt(s.pop, 0, 2) ? s.pop : -1,
    pe: isInt(s.pe, 0, 99999) ? s.pe : 0,
    name: cleanText(s.name, 16),
  };
}

/** @returns {Stub[]} 최근 것이 앞 */
export function listStubs() {
  const raw = store.get('stubs', []);
  return (Array.isArray(raw) ? raw : []).map(normalizeStub).filter(Boolean);
}

/** 같은 약속의 티켓은 한 장만 (다시 받으면 갱신) */
export function saveStub(stub) {
  const s = normalizeStub(stub);
  if (!s) return;
  const list = listStubs().filter((x) => x.room !== s.room);
  list.unshift(s);
  store.set('stubs', list.slice(0, MAX_TICKETS));
}

export const hasStub = (room) => listStubs().some((s) => s.room === room);

/**
 * 약속이 지금 어떤 상태인지 (표·목록 표시용). 방 밖에서는 기기 시계로 어림한다.
 * @returns {{ key: 'far'|'soon'|'playing'|'ended', label: string, until: number }}
 */
export function statusOf(scr, now = Date.now()) {
  const until = scr.at - now;
  if (until > 0) {
    return { key: until <= 30 * 60000 ? 'soon' : 'far', label: until <= 60000 ? '곧 상영 시작' : `상영까지 ${fmtUntil(until).replace(' 뒤', '')}`, until };
  }
  if (now < endOf(scr)) {
    const min = Math.floor(-until / 60000);
    return { key: 'playing', label: min < 1 ? '방금 상영 시작' : `상영 중 · ${min}분 지남`, until: 0 };
  }
  return { key: 'ended', label: '상영 종료', until: 0 };
}
