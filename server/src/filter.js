// 소원판에 붙는 글 거르기: 욕, 성적인 말, 남을 해치는 말, 연락처나 주소(링크)는 받지 않는다.
// 낱말 목록으로 거르는 것이라 완벽하지는 않다. 띄어쓰기·숫자·기호를 끼워 넣거나 같은 글자를 늘여 쓴 것도 잡도록, 그것들을 걷어 낸 글로도 본다.

const BAD = [
  // 욕
  '씨발', '씨빨', '시발', '씨바', '씨팔', '시팔', '쓰발', '쓰바', 'ㅆㅂ', 'ㅅㅂ', 'ㅆㅃ', '썅', '쌍놈', '쌍년', '병신', '븅신', '빙신', 'ㅂㅅ', '좆', 'ㅈ같', '존나', '졸라', 'ㅈㄴ',
  '개새', '개색', '개세', '개쌔', '새끼', '쌔끼', '새키', 'ㅅㄲ', '지랄', 'ㅈㄹ', '염병', '엠창', '니미', '느금', '니애미', '애미', '애비', '앰뒤', '꺼져', '닥쳐', '미친놈', '미친년',
  '또라이', '돌아이', '찐따', '한남', '한녀', '김치녀', '틀딱', '급식충', '맘충', '등신', 
  // 성적인 말
  '섹스', '섹1스', '쎅스', '보지', '자지', '보짓', '자짓', '젖꼭', '꼴려', '꼴리', '야동', '야사', '딸딸', '딸치', '자위', '강간', '성폭', '성추행', '창녀', '창놈', '매춘', '원조교제', '알몸', '야한',
  '따먹', '빨아줘', '박아줘', '오르가', '음란', '변태', '19금', '성인방',
  // 남을 해치는 말
  '죽어', '죽여', '자살', '뒤져', '디져', '살인',
  // 영어
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'porn', 'sex', 'nude', 'nigg', 'whore', 'slut', 'rape',
];

/** 거르기 위해 고친 글: 영어는 소문자, 띄어쓰기·숫자·기호·늘인 글자는 걷어 낸다 */
function squash(s) {
  return s.toLowerCase().normalize('NFC')
    .replace(/[0-9\s.,!?~^*_\-+=/\\|'"`:;()[\]{}<>@#$%&♡♥☆★…·ㆍ]+/g, '')
    .replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * 소원으로 붙일 수 있는 글인가.
 * @returns {{ ok: true, text: string } | { ok: false, why: 'empty' | 'long' | 'link' | 'bad' }}
 */
export function checkWish(raw, max = 30) {
  if (typeof raw !== 'string') return { ok: false, why: 'empty' };
  const text = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁯]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, why: 'empty' };
  if ([...text].length > max) return { ok: false, why: 'long' };
  if (/https?:|www\.|\.(com|net|kr|io|me|ly|gg|co)\b|@\w|open\.kakao|카톡\s*아이디|오픈채팅/i.test(text) || /\d[\d\s-]{6,}\d/.test(text)) return { ok: false, why: 'link' };      // 링크, 연락처, 전화번호
  const flat = squash(text), once = flat.replace(/([a-z])\1+/g, '$1').replace(/(.)\1+/g, '$1');      // (fuuuck, 씨이이발 처럼 늘인 글자도 하나로)
  if (BAD.some((w) => flat.includes(w) || once.includes(w) || text.toLowerCase().includes(w))) return { ok: false, why: 'bad' };
  return { ok: true, text };
}
