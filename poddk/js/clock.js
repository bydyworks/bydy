// 세계 시계와 하루의 흐름. 모두 한국 시간(KST) 기준.
//   · 해의 위치 → 하늘 색과 그림자
//   · 눈발의 세기 → 세 시간마다 30분 동안 폭설 (0시, 3시, 6시 … 21시에 시작. 처음 5분에 굵어지고, 마지막 5분에 잦아든다)
//   · 발자국이 남아 있는 정도 → 천천히 흐려지다가, 폭설이 시작되고 5분 사이에 모두 덮이며, 폭설이 그칠 때까지는 남지 않는다
// 시험용: 주소에 ?t=23:50 (시작 시각), ?speed=600 (시간 배속)
const KST = 9 * 3600e3;
export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export const PRINT_LIFE_MS = 6 * HOUR;        // 평소: 발자국이 6시간에 걸쳐 흐려진다 (그 전에 다음 폭설이 덮으므로, 오래된 자국일수록 옅게 보이는 정도)
export const STORM_PRINT_LIFE_MS = 6000;      // 폭설 한가운데: 밟은 자국이 몇 초 만에 덮인다
export const STORM_EVERY_MS = 3 * HOUR;       // 폭설은 세 시간마다 (한국 시간 0시부터)
export const STORM_LENGTH_MS = 30 * 60e3;     // 한 번에 30분
export const STORM_RISE_MS = 5 * 60e3;        // 처음 5분: 눈발이 굵어지며 모든 발자국이 덮인다
export const STORM_FADE_MS = 5 * 60e3;        // 마지막 5분: 잦아든다
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

/** 이번 폭설이 시작된 뒤로 흐른 시간(ms). 0..STORM_EVERY_MS — STORM_LENGTH_MS 보다 작으면 폭설 중이다 */
export function sinceStorm(ms) {
  return (((ms + KST) % STORM_EVERY_MS) + STORM_EVERY_MS) % STORM_EVERY_MS;
}

/** 눈발의 세기 0..1 (0.3 안팎이 평소, 1이 폭설 절정) */
export function snowfallAt(ms) {
  const calm = 0.3 + 0.07 * Math.sin(ms / (23 * 60e3)) + 0.04 * Math.sin(ms / (7 * 60e3));
  const t = sinceStorm(ms);
  if (t >= STORM_LENGTH_MS) return calm;
  if (t < STORM_RISE_MS) return calm + (1 - calm) * (t / STORM_RISE_MS);
  if (t < STORM_LENGTH_MS - STORM_FADE_MS) return 1;
  return calm + (1 - calm) * ((STORM_LENGTH_MS - t) / STORM_FADE_MS);
}

/** 지금이 폭설의 어느 때인지: 'rising'(처음 5분) | 'peak' | 'fading'(마지막 5분) | 'calm'(평소) */
export function stormPhase(ms) {
  const t = sinceStorm(ms);
  return t >= STORM_LENGTH_MS ? 'calm' : t < STORM_RISE_MS ? 'rising' : t < STORM_LENGTH_MS - STORM_FADE_MS ? 'peak' : 'fading';
}

/** 다음 폭설이 시작될 때까지 남은 ms */
export function msUntilStorm(ms) {
  return STORM_EVERY_MS - sinceStorm(ms);
}

/** 폭설 중이라면 그칠 때까지 남은 ms (아니면 0) */
export function msUntilCalm(ms) {
  return Math.max(0, STORM_LENGTH_MS - sinceStorm(ms));
}

/** 가장 최근의 "들판이 완전히 비는 순간" (폭설이 시작되고 5분 뒤) */
export function lastWipe(ms) {
  const t = sinceStorm(ms), start = ms - t;
  return t >= STORM_RISE_MS ? start + STORM_RISE_MS : start - STORM_EVERY_MS + STORM_RISE_MS;
}

/**
 * birth 에 찍힌 자국이 now 에 얼마나 남아 보이는지 0..1
 * @param {number} life 평소에 다 흐려지기까지 걸리는 시간 (여우 발자국처럼 금방 사라지는 자국은 짧게 준다)
 */
export function printAlpha(birth, now, life = PRINT_LIFE_MS) {
  if (birth < lastWipe(now)) return 0;
  const bt = sinceStorm(birth);
  if (bt >= STORM_RISE_MS && bt < STORM_LENGTH_MS) life = Math.min(life, STORM_PRINT_LIFE_MS);      // 폭설 한가운데 찍힌 자국은 몇 초 만에 덮인다
  const age = Math.max(0, now - birth);
  if (age >= life) return 0;
  let a = 1 - Math.pow(age / life, 1.5);
  const t = sinceStorm(now);
  if (t < STORM_RISE_MS) a *= 1 - t / STORM_RISE_MS;     // 폭설이 시작되고 5분 동안, 내리는 눈에 모든 자국이 서서히 덮인다
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
  if (phase === 'peak') return `폭설이에요. ${Math.max(1, Math.ceil(msUntilCalm(ms) / 60e3))}분 뒤에 그쳐요`;
  if (phase === 'fading') return '눈이 잦아들고 있어요';
  const left = msUntilStorm(ms);
  const hh = Math.floor(left / HOUR), mm = Math.floor((left % HOUR) / 60e3);
  return hh > 0 ? `폭설까지 ${hh}시간 ${mm}분` : `폭설까지 ${Math.max(1, mm)}분`;
}
