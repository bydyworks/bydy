// 트리에서 흘러나오는 오르골 캐롤.
// 저작권이 끝난 옛 캐롤 열 곡의 가락을 음표로 적어 두고, 소리는 코드로 직접 만든다 (음원 파일이 없다).
// 트리에 가까울수록 크게 들리고, 멀어지면 들리지 않는다. 곡 순서는 매번 섞는다.

// 악보는 세 벌을 따로 적어 음표 하나하나 맞춰 본 것이다 (여섯 곡은 세 벌이 똑같았고, 나머지는 길이만 달라 많이 쓰이는 쪽을 골랐다).
// 음표 적는 법: "음이름:길이" 를 띄어 적는다. 길이는 4분음표가 1 (8분음표 0.5, 점4분음표 1.5 …). R 은 쉼표, | 는 마디 구분(읽기 편하라고).
// tempo: 1분에 4분음표 몇 개
export const CAROLS = [
  {
    id: 'jingle', title: '징글벨', tempo: 168,
    notes: `E4:1 E4:1 E4:2 | E4:1 E4:1 E4:2 | E4:1 G4:1 C4:1.5 D4:0.5 | E4:4 |
            F4:1 F4:1 F4:1.5 F4:0.5 | F4:1 E4:1 E4:1 E4:0.5 E4:0.5 | E4:1 D4:1 D4:1 E4:1 | D4:2 G4:2 |
            E4:1 E4:1 E4:2 | E4:1 E4:1 E4:2 | E4:1 G4:1 C4:1.5 D4:0.5 | E4:4 |
            F4:1 F4:1 F4:1.5 F4:0.5 | F4:1 E4:1 E4:1 E4:0.5 E4:0.5 | G4:1 G4:1 F4:1 D4:1 | C4:4`,
  },
  {
    id: 'silent', title: '고요한 밤', tempo: 96,
    notes: `G4:1.5 A4:0.5 G4:1 | E4:3 | G4:1.5 A4:0.5 G4:1 | E4:3 | D5:2 D5:1 | B4:3 | C5:2 C5:1 | G4:3 |
            A4:2 A4:1 | C5:1.5 B4:0.5 A4:1 | G4:1.5 A4:0.5 G4:1 | E4:3 | A4:2 A4:1 | C5:1.5 B4:0.5 A4:1 | G4:1.5 A4:0.5 G4:1 | E4:3 |
            D5:2 D5:1 | F5:1.5 D5:0.5 B4:1 | C5:3 | E5:3 | C5:1 G4:1 E4:1 | G4:1.5 F4:0.5 D4:1 | C4:6`,
  },
  {
    id: 'deck', title: '덱 더 홀스', tempo: 150,
    notes: `G4:1.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 E4:1 C4:1 | D4:0.5 E4:0.5 F4:0.5 D4:0.5 E4:1.5 D4:0.5 | C4:1 B3:1 C4:2 |
            G4:1.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 E4:1 C4:1 | D4:0.5 E4:0.5 F4:0.5 D4:0.5 E4:1.5 D4:0.5 | C4:1 B3:1 C4:2 |
            D4:1.5 E4:0.5 F4:1 D4:1 | E4:1.5 F4:0.5 G4:1 D4:1 | E4:0.5 F#4:0.5 G4:1 A4:0.5 B4:0.5 C5:1 | B4:1 A4:1 G4:2 |
            G4:1.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 E4:1 C4:1 | A4:0.5 A4:0.5 A4:0.5 A4:0.5 G4:1.5 F4:0.5 | E4:1 D4:1 C4:2`,
  },
  {
    id: 'joy', title: '기쁘다 구주 오셨네', tempo: 96,
    notes: `C5:1 B4:0.75 A4:0.25 | G4:1.5 F4:0.5 | E4:1 D4:1 | C4:1.5 G4:0.5 | A4:1.5 A4:0.5 | B4:1.5 B4:0.5 | C5:1.5 C5:0.5 |
            C5:0.5 B4:0.5 A4:0.5 G4:0.5 | G4:0.75 F4:0.25 E4:0.5 C5:0.5 | C5:0.5 B4:0.5 A4:0.5 G4:0.5 | G4:0.75 F4:0.25 E4:0.5 E4:0.5 |
            E4:0.5 E4:0.5 E4:0.5 E4:0.25 F4:0.25 | G4:1.5 F4:0.25 E4:0.25 | D4:0.5 D4:0.5 D4:0.5 D4:0.25 E4:0.25 | F4:1.5 E4:0.25 D4:0.25 |
            C4:0.5 C5:1 A4:0.5 | G4:0.75 F4:0.25 E4:0.5 F4:0.5 | E4:1 D4:1 | C4:2`,
  },
  {
    id: 'tree', title: '소나무야', tempo: 104,
    notes: `G4:0.5 | C5:0.75 C5:0.25 C5:1.5 D5:0.5 | E5:0.75 E5:0.25 E5:1.5 E5:0.5 | D5:0.5 E5:0.5 F5:1 B4:1 | D5:1 C5:1 R:0.5 G4:0.5 |
            C5:0.75 C5:0.25 C5:1.5 D5:0.5 | E5:0.75 E5:0.25 E5:1.5 E5:0.5 | D5:0.5 E5:0.5 F5:1 B4:1 | D5:1 C5:1 R:0.5 G5:0.5 |
            G5:0.5 E5:0.5 A5:1.5 G5:0.5 | G5:0.5 F5:0.5 F5:1.5 F5:0.5 | F5:0.5 D5:0.5 G5:1.5 F5:0.5 | F5:0.5 E5:0.5 E5:1 R:0.5 G4:0.5 |
            C5:0.75 C5:0.25 C5:1.5 D5:0.5 | E5:0.75 E5:0.25 E5:1.5 E5:0.5 | D5:0.5 E5:0.5 F5:1 B4:1 | D5:1 C5:1.5`,
  },
  {
    id: 'wish', title: '위 위시 유 어 메리 크리스마스', tempo: 150,
    notes: `D4:1 | G4:1 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 | E4:1 E4:1 E4:1 | A4:1 A4:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4:1 D4:1 D4:1 |
            B4:1 B4:0.5 C5:0.5 B4:0.5 A4:0.5 | G4:1 E4:1 D4:0.5 D4:0.5 | E4:1 A4:1 F#4:1 | G4:2 D4:1 |
            G4:1 G4:1 G4:1 | F#4:2 F#4:1 | G4:1 F#4:1 E4:1 | D4:2 A4:1 | B4:1 A4:1 G4:1 | D5:1 D4:1 D4:0.5 D4:0.5 | E4:1 A4:1 F#4:1 | G4:2`,
  },
  {
    id: 'noel', title: '저 들 밖에 한밤중에', tempo: 108,
    notes: `E4:0.5 D4:0.5 | C4:1.5 D4:0.5 E4:0.5 F4:0.5 | G4:2 A4:0.5 B4:0.5 | C5:1 B4:1 A4:1 | G4:2 A4:0.5 B4:0.5 | C5:1 B4:1 A4:1 | G4:1 A4:1 B4:1 | C5:1 G4:1 F4:1 | E4:2
            E4:0.5 D4:0.5 | C4:1.5 D4:0.5 E4:0.5 F4:0.5 | G4:2 A4:0.5 B4:0.5 | C5:1 B4:1 A4:1 | G4:2 A4:0.5 B4:0.5 | C5:1 B4:1 A4:1 | G4:1 A4:1 B4:1 | C5:1 G4:1 F4:1 | E4:2
            E4:0.5 D4:0.5 | C4:1.5 D4:0.5 E4:0.5 F4:0.5 | G4:2 C5:0.5 B4:0.5 | A4:2 A4:1 | G4:3 | C5:1 B4:1 A4:1 | G4:1 A4:1 B4:1 | C5:1 G4:1 F4:1 | E4:2`,
  },
  {
    id: 'manger', title: '그 어린 주 예수', tempo: 100,
    notes: `C5:1 | C5:1.5 Bb4:0.5 A4:1 | A4:1.5 G4:0.5 F4:1 | F4:1 E4:1 D4:1 | C4:2 C4:1 | C4:1.5 D4:0.5 C4:1 | C4:1 G4:1 E4:1 | D4:1 C4:1 F4:1 | A4:2 C5:1 |
            C5:1.5 Bb4:0.5 A4:1 | A4:1.5 G4:0.5 F4:1 | F4:1 E4:1 D4:1 | C4:2 C4:1 | Bb4:1.5 A4:0.5 G4:1 | A4:1.5 G4:0.5 F4:1 | G4:1 D4:1 E4:1 | F4:2`,
  },
  {
    id: 'hark', title: '천사 찬송하기를', tempo: 116,
    notes: `D4:1 G4:1 G4:1.5 F#4:0.5 | G4:1 B4:1 B4:1 A4:1 | D5:1 D5:1 D5:1.5 C5:0.5 | B4:1 A4:1 B4:2 |
            D4:1 G4:1 G4:1.5 F#4:0.5 | G4:1 B4:1 B4:1 A4:1 | D5:1 A4:1 A4:1.5 F#4:0.5 | F#4:1 E4:1 D4:2 |
            D5:1 D5:1 D5:1 G4:1 | C5:1 B4:1 B4:1 A4:1 | D5:1 D5:1 D5:1 G4:1 | C5:1 B4:1 B4:1 A4:1 |
            E5:1 E5:1 E5:1 D5:1 | C5:1 B4:1 C5:2 | A4:1 B4:0.5 C5:0.5 D5:1.5 G4:0.5 | G4:1 A4:1 B4:2 |
            E5:1.5 E5:0.5 E5:1 D5:1 | C5:1 B4:1 C5:2 | A4:1 B4:0.5 C5:0.5 D5:1.5 G4:0.5 | G4:1 A4:1 G4:2`,
  },
  {
    id: 'angels', title: '천사들의 노래가', tempo: 120,
    notes: `A4:1 A4:1 A4:1 C5:1 | C5:1.5 Bb4:0.5 A4:2 | A4:1 G4:1 A4:1 C5:1 | A4:1.5 G4:0.5 F4:2 |
            A4:1 A4:1 A4:1 C5:1 | C5:1.5 Bb4:0.5 A4:2 | A4:1 G4:1 A4:1 C5:1 | A4:1.5 G4:0.5 F4:2 |
            C5:2 D5:0.5 C5:0.5 Bb4:0.5 A4:0.5 | Bb4:2 C5:0.5 Bb4:0.5 A4:0.5 G4:0.5 | A4:2 Bb4:0.5 A4:0.5 G4:0.5 F4:0.5 | G4:1.5 C4:0.5 C4:2 | F4:1 G4:1 A4:1 Bb4:1 | A4:2 G4:2 |
            C5:2 D5:0.5 C5:0.5 Bb4:0.5 A4:0.5 | Bb4:2 C5:0.5 Bb4:0.5 A4:0.5 G4:0.5 | A4:2 Bb4:0.5 A4:0.5 G4:0.5 F4:0.5 | G4:1.5 C4:0.5 C4:2 | F4:1 G4:1 A4:1 Bb4:1 | A4:2 G4:2 | F4:4`,
  },
];

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "F#4:0.5" → [66, 0.5], "R:1" → [null, 1] */
export function parseNotes(text) {
  return text.split(/\s+/).filter((t) => t && t !== '|').map((t) => {
    const [name, len] = t.split(':');
    const dur = Number(len);
    if (name === 'R') return [null, dur];
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m || !(dur > 0)) throw new Error('잘못 적힌 음표: ' + t);
    return [12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), dur];
  });
}

const NEAR = 6, FAR = 46;          // 트리에서 이 거리 안이면 가장 크게, 이 거리 밖이면 들리지 않는다
const VOLUME = 0.34;
const OCTAVE_UP = 12;              // 오르골답게 한 옥타브 올려 연주한다
const GAP_SEC = [5, 9];            // 곡과 곡 사이에 쉬는 시간

/**
 * @param {AudioContext} ctx @param {AudioNode} out 소리가 나갈 곳
 * @returns {{ setDistance(d: number): void, stats: object, stop(): void }}
 */
export function createMusicBox(ctx, out) {
  const songs = CAROLS.map((c) => ({ ...c, seq: parseNotes(c.notes) }));
  const stats = { playing: '', title: '', notes: 0, gain: 0, songs: 0 };
  // 오르골 소리가 나가는 길: 음량(거리) → 살짝 울림(메아리) → 밖으로
  const level = ctx.createGain(); level.gain.value = 0;
  const echo = ctx.createDelay(1); echo.delayTime.value = 0.29;
  const feedback = ctx.createGain(); feedback.gain.value = 0.26;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  level.connect(out);
  level.connect(echo); echo.connect(feedback); feedback.connect(echo); echo.connect(wet); wet.connect(out);

  let order = [], song = null, index = 0, nextAt = 0, audible = 0, stopped = false;
  function nextSong(now, first) {
    if (!order.length) { order = songs.map((_, i) => i).sort(() => Math.random() - 0.5); if (song && songs[order[0]] === song && order.length > 1) order.push(order.shift()); }
    song = songs[order.shift()];
    index = 0;
    nextAt = now + (first ? 1.2 : GAP_SEC[0] + Math.random() * (GAP_SEC[1] - GAP_SEC[0]));
    stats.playing = song.id; stats.title = song.title; stats.songs++;
  }

  /** 오르골 한 음: 맑은 기음에 옅은 배음 둘, 톡 치고 길게 사라진다 */
  function pluck(midi, when, strength) {
    const f = 440 * 2 ** ((midi + OCTAVE_UP - 69) / 12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(strength, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0006, when + 1.9);
    env.connect(level);
    for (const [mult, amp, life] of [[1, 1, 1.9], [2, 0.22, 0.9], [4.1, 0.09, 0.35]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, when);
      g.gain.exponentialRampToValueAtTime(0.0005, when + life);
      osc.connect(g).connect(env);
      osc.start(when); osc.stop(when + life + 0.05);
      if (mult === 1) osc.onended = () => env.disconnect();
    }
  }

  // 조금 앞의 음표까지 미리 예약해 둔다 (화면이 버벅여도 박자가 흔들리지 않게)
  function schedule() {
    if (stopped) return;
    const now = ctx.currentTime;
    if (!song) nextSong(now, true);
    if (nextAt < now - 0.5) nextAt = now + 0.05;                 // 화면이 가려졌다 돌아온 뒤: 밀린 음표를 몰아 치지 않는다
    while (nextAt < now + 0.5) {
      if (index >= song.seq.length) { nextSong(Math.max(now, nextAt), false); continue; }
      const [midi, beats] = song.seq[index++];
      if (midi !== null && audible > 0.004) { pluck(midi, nextAt, 0.5 + Math.random() * 0.12); stats.notes++; }
      nextAt += beats * 60 / song.tempo;
    }
  }
  const timer = setInterval(schedule, 120);

  return {
    stats,
    /** 트리까지의 거리 (걷는 단위) */
    setDistance(d) {
      const t = Math.min(1, Math.max(0, (FAR - d) / (FAR - NEAR)));
      audible = t * t * VOLUME;
      stats.gain = audible;
      level.gain.setTargetAtTime(audible, ctx.currentTime, 0.4);
    },
    stop() { stopped = true; clearInterval(timer); },
  };
}
