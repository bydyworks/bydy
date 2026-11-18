// 세계 시계와 하루의 흐름. 모두 한국 시간(KST) 기준.
//   · 해의 위치 → 하늘 색과 그림자
//   · 눈발의 세기 → 자정부터 폭설 (0시 시작, 1~3시 절정, 3~5시 잦아듦)
//   · 발자국이 남아 있는 정도 → 6시간에 걸쳐 흐려지고, 자정~1시에 모두 지워지며, 1~5시에는 남지 않는다
// 시험용: 주소에 ?t=23:50 (시작 시각), ?speed=600 (시간 배속)
const KST = 9 * 3600e3;
export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export const PRINT_LIFE_MS = 6 * HOUR;        // 평소: 발자국이 6시간에 걸쳐 흐려진다
export const STORM_PRINT_LIFE_MS = 6000;      // 폭설 한가운데(1~5시): 밟은 자국이 몇 초 만에 덮인다
const SUNRISE = 7 + 20 / 60, SUNSET = 17 + 20 / 60, NOON = (SUNRISE + SUNSET) / 2, MAX_ELEV = 31;

/** ms(실제 epoch) → { hour: 0..24 (소수), dayStart: 그날 0시(KST)의 epoch ms } */
export function kst(ms) {
  const local = ms + KST;
  const dayStartLocal = Math.floor(local / DAY) * DAY;
  return { hour: (local - dayStartLocal) / HOUR, dayStart: dayStartLocal - KST };
}

export function createClock(search = location.search) {
  const q = new URLSearchParams(search);
  let speed = q.has('speed') ? Math.max(0, Number(q.get('speed')) || 0) : 1;
  let anchorReal = Date.now();
  let anchorWorld = anchorReal;
  const clock = {
    /** 지금의 세계 시각 (epoch ms) */
    now: () => anchorWorld + (Date.now() - anchorReal) * speed,
    get speed() { return speed; },
    setSpeed(n) { anchorWorld = clock.now(); anchorReal = Date.now(); speed = Math.max(0, Number(n) || 0); },
    /** 오늘(KST)의 HH:MM 으로 옮긴다 */
    setTime(hhmm) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
      if (!m) return false;
      const { dayStart } = kst(clock.now());
      anchorWorld = dayStart + (Number(m[1]) % 24) * HOUR + Number(m[2]) * 60e3;
      anchorReal = Date.now();
      return true;
    },
    /** 세계 시각을 ms 만큼 건너뛴다 */
    skip(ms) { anchorWorld = clock.now() + ms; anchorReal = Date.now(); },
  };
  if (q.get('t')) clock.setTime(q.get('t'));
  return clock;
}

/** 해의 높이(도, 지평선 아래는 음수)와 방위(도: 90 동, 180 남, 270 서) */
export function sunAt(ms) {
  const h = kst(ms).hour;
  const half = (SUNSET - SUNRISE) / 2;
  let elev, azim;
  if (h >= SUNRISE && h <= SUNSET) {
    const x = (h - NOON) / half;                       // -1(해돋이) .. 1(해넘이)
    elev = MAX_ELEV * Math.cos(x * Math.PI / 2);
    azim = 180 + x * 62;
  } else {
    const night = 24 - (SUNSET - SUNRISE);
    const t = ((h - SUNSET + 24) % 24) / night;         // 0(해넘이) .. 1(해돋이)
    elev = -42 * Math.sin(t * Math.PI);
    azim = 242 + t * 236;                                // 서쪽에서 북쪽을 돌아 동쪽으로
  }
  return { elev, azim: ((azim % 360) + 360) % 360 };
}

/** 눈발의 세기 0..1 (0.3 안팎이 평소, 1이 폭설 절정) */
export function snowfallAt(ms) {
  const h = kst(ms).hour;
  if (h < 1) return 0.3 + 0.7 * h;
  if (h < 3) return 1;
  if (h < 5) return 1 - 0.7 * (h - 3) / 2;
  return 0.3 + 0.07 * Math.sin(ms / (23 * 60e3)) + 0.04 * Math.sin(ms / (7 * 60e3));
}

/** 지금이 하루 중 어느 때인지: 'rising'(0~1시) | 'peak'(1~3시) | 'fading'(3~5시) | 'calm' */
export function stormPhase(ms) {
  const h = kst(ms).hour;
  return h < 1 ? 'rising' : h < 3 ? 'peak' : h < 5 ? 'fading' : 'calm';
}

/** 다음 폭설(자정)까지 남은 ms */
export function msUntilStorm(ms) {
  const { dayStart } = kst(ms);
  return dayStart + DAY - ms;
}

/** 가장 최근의 "들판이 완전히 비는 순간"(새벽 1시) */
export function lastWipe(ms) {
  const { hour, dayStart } = kst(ms);
  return hour >= 1 ? dayStart + HOUR : dayStart - DAY + HOUR;
}

/** birth 에 찍힌 자국이 now 에 얼마나 남아 보이는지 0..1 */
export function printAlpha(birth, now) {
  if (birth < lastWipe(now)) return 0;
  const bh = kst(birth).hour;
  const life = bh >= 1 && bh < 5 ? STORM_PRINT_LIFE_MS : PRINT_LIFE_MS;
  const age = Math.max(0, now - birth);
  if (age >= life) return 0;
  let a = 1 - Math.pow(age / life, 1.5);
  const h = kst(now).hour;
  if (h < 1) a *= 1 - h;                                 // 자정부터 1시까지, 내리는 눈에 모든 자국이 서서히 덮인다
  return a;
}

/** 화면에 적을 시각: "오후 5:12" */
export function clockText(ms) {
  const h = kst(ms).hour;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const ap = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ap} ${h12}:${String(mm).padStart(2, '0')}`;
}

/** 눈 소식 한 줄 */
export function stormText(ms) {
  const phase = stormPhase(ms);
  if (phase === 'rising') return '눈발이 굵어져요. 발자국이 덮이고 있어요';
  if (phase === 'peak') return '폭설이에요. 발자국이 남지 않아요';
  if (phase === 'fading') return '눈이 잦아들고 있어요';
  const left = msUntilStorm(ms);
  const hh = Math.floor(left / HOUR), mm = Math.floor((left % HOUR) / 60e3);
  return hh > 0 ? `폭설까지 ${hh}시간 ${mm}분` : `폭설까지 ${Math.max(1, mm)}분`;
}
