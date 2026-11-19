// 들어올 때 붙는 이름: 꾸미는 말 + 겨울 낱말 ("졸린 붕어빵", "통통한 고드름" …).
// 한 번 정해지면 이 기기에서는 계속 같은 이름이다 (나중에 다른 펭귄들과 만날 때 알아보기 쉽게). 처음 화면에서 바꿀 수 있다.
const ADJ = ['졸린', '통통한', '뒤뚱이는', '포근한', '반짝이는', '수줍은', '느긋한', '동글동글한', '콧노래 부르는', '눈 좋아하는', '따끈한', '말랑한', '조용한', '씩씩한', '폭신한', '꼬마', '보송보송한', '배고픈', '호기심 많은', '깡총거리는'];
const NOUN = ['눈송이', '고드름', '찐빵', '호빵', '눈사람', '털모자', '군고구마', '귤', '핫초코', '솜사탕', '눈토끼', '썰매', '목도리', '벙어리장갑', '붕어빵', '별사탕', '얼음꽃', '눈뭉치', '마시멜로', '호떡'];
const KEY = 'poddk.name.v1';
const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** 새 이름 하나 (지금 이름과는 다르게) */
export function newName(not = '') {
  for (let i = 0; i < 20; i++) { const n = pick(ADJ) + ' ' + pick(NOUN); if (n !== not) return n; }
  return pick(ADJ) + ' ' + pick(NOUN);
}
/** 이 기기의 이름 (없으면 새로 지어 둔다). keep: false 면 저장하지 않는다 (시험 중) */
export function myName(keep = true) {
  try { const s = localStorage.getItem(KEY); if (s) return s; } catch { /* 저장소가 막혀 있다 */ }
  const n = newName();
  if (keep) { try { localStorage.setItem(KEY, n); } catch { /* 이번 방문 동안만 */ } }
  return n;
}
/** 이름을 바꾼다 */
export function rename(keep = true) {
  const n = newName(myName(false));
  if (keep) { try { localStorage.setItem(KEY, n); } catch { /* 이번 방문 동안만 */ } }
  return n;
}
