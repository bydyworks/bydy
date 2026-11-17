// 나(이 기기의 관객): 닉네임과 캐릭터 생김새. 로그인 없이 localStorage에만 둔다.
import { store, session, randomId, cleanText, isInt } from './util.js';

export const NAME_MAX = 14;

// 자동 닉네임: "수식어 + 명사". 산사의 "느린 발걸음"처럼 조용하고 살짝 웃긴 쪽으로.
const MODS = [
  '졸린', '지각한', '조용한', '눈물 많은', '맨 뒷줄', '쿠키 기다리는', '팝콘 흘린', '예고편 좋아하는', '자막 놓친', '심야의',
  '느긋한', '설레는', '배고픈', '살금살금', '혼자 온', '일찍 온',
];
// 영사기사·검표원은 역할 이름이라 닉네임에는 쓰지 않는다.
const NOUNS = [
  '팝콘 도둑', '통로석 손님', '조조 관객', '엔딩크레딧', '콜라 빨대', '비상구 유도등', '나초 한 조각', '필름 한 롤', '3D 안경', '단골 관객',
  '올빼미', '졸음꾼', '박수부대',
];

export const AVATAR_LIMITS = { hair: 4, hairColor: 6, outfit: 8, skin: 4 };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (n) => Math.floor(Math.random() * n);

export function randomName() {
  for (let i = 0; i < 20; i++) {
    const s = `${pick(MODS)} ${pick(NOUNS)}`;
    if (Array.from(s).length <= NAME_MAX) return s;
  }
  return '조용한 관객';
}

/** @returns {[number, number, number, number]} [hair, hairColor, outfit, skin] */
export function randomAvatar() {
  return [rint(AVATAR_LIMITS.hair), rint(AVATAR_LIMITS.hairColor), rint(AVATAR_LIMITS.outfit), rint(AVATAR_LIMITS.skin)];
}

/** 남이 보낸 아바타 값 검증. 어긋나면 기본값. */
export function normalizeAvatar(a) {
  if (!Array.isArray(a) || a.length !== 4) return [0, 0, 0, 0];
  const L = AVATAR_LIMITS;
  return [
    isInt(a[0], 0, L.hair - 1) ? a[0] : 0,
    isInt(a[1], 0, L.hairColor - 1) ? a[1] : 0,
    isInt(a[2], 0, L.outfit - 1) ? a[2] : 0,
    isInt(a[3], 0, L.skin - 1) ? a[3] : 0,
  ];
}

export const normalizeName = (n) => cleanText(n, NAME_MAX) || '조용한 관객';

/**
 * @typedef {Object} Me
 * @property {string} device  기기 ID (같은 사람이 탭을 두 개 열었는지 알아보는 용도)
 * @property {string} tab     탭 ID (새로고침해도 유지, 탭마다 다름) = 방 안에서의 peer ID
 * @property {string} name
 * @property {[number, number, number, number]} av
 */

/** @returns {Me} */
export function loadMe() {
  let saved = store.get('me');
  if (!saved || typeof saved !== 'object' || typeof saved.device !== 'string') {
    saved = { device: randomId(9), name: randomName(), av: randomAvatar() };
    store.set('me', saved);
  }
  let tab = session.get('tab');
  if (typeof tab !== 'string') { tab = randomId(9); session.set('tab', tab); }
  return { device: saved.device, tab, name: normalizeName(saved.name), av: normalizeAvatar(saved.av) };
}

/** @param {Me} me */
export function saveMe(me) {
  me.name = normalizeName(me.name);
  me.av = normalizeAvatar(me.av);
  store.set('me', { device: me.device, name: me.name, av: me.av });
}
