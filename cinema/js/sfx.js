// 아주 작은 효과음. 파일 없이 WebAudio 로 합성한다. 기본은 켜짐, 설정은 기기에 저장.
import { store } from './util.js';

let ctx = null;
let enabled = store.get('sfx', true) !== false;
let master = null;

function ac() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

/** 음 하나: 주파수 f, 길이 d(초), 파형, 세기 */
function tone(f, d, { type = 'sine', gain = 0.2, at = 0, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + d + 0.02);
}

let noiseBuf = null;
/** 잡음 조각: 팝콘 씹는 소리, 표 찢는 소리 */
function noise(d, { gain = 0.2, at = 0, freq = 2000, q = 1, type = 'bandpass', slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + d + 0.02);
}

export const sfx = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; store.set('sfx', enabled); if (!enabled && ctx) ctx.suspend().catch(() => {}); },
  /** 첫 탭에서 한 번 불러 오디오를 깨운다 */
  unlock() { ac(); },

  tap() { tone(660, 0.06, { type: 'triangle', gain: 0.08 }); },
  pop() { tone(520, 0.09, { type: 'sine', gain: 0.12, slide: 380 }); },
  step() { noise(0.05, { gain: 0.03, freq: 300, q: 0.8, type: 'lowpass' }); },
  /** 팝콘 한 입 */
  crunch() {
    noise(0.045, { gain: 0.16, freq: 3200, q: 0.9 });
    noise(0.05, { gain: 0.12, freq: 2400, q: 0.9, at: 0.07 });
    noise(0.04, { gain: 0.08, freq: 3800, q: 0.9, at: 0.15 });
  },
  /** 음료 한 모금 */
  sip() { noise(0.22, { gain: 0.07, freq: 900, q: 6, slide: 900 }); },
  /** 팝콘 담는 소리 */
  scoop() {
    for (let i = 0; i < 7; i++) noise(0.03, { gain: 0.07, freq: 2600 + Math.random() * 1500, q: 2, at: i * 0.045 + Math.random() * 0.02 });
  },
  /** 계산 완료 */
  coin() { tone(988, 0.09, { type: 'square', gain: 0.06 }); tone(1319, 0.22, { type: 'square', gain: 0.06, at: 0.08 }); },
  /** 표 뽑히는 소리 */
  print() {
    for (let i = 0; i < 9; i++) noise(0.025, { gain: 0.06, freq: 1800, q: 3, at: i * 0.05 });
    tone(880, 0.12, { type: 'triangle', gain: 0.08, at: 0.5 });
  },
  /** 표 찢기 (검표) */
  tear() { noise(0.28, { gain: 0.14, freq: 1200, q: 0.7, slide: 2600 }); },
  /** 문 */
  door() { tone(110, 0.25, { type: 'sine', gain: 0.2, slide: -50 }); noise(0.12, { gain: 0.05, freq: 500, q: 0.7, type: 'lowpass', at: 0.02 }); },
  /** 의자에 앉기 */
  sit() { tone(160, 0.16, { type: 'sine', gain: 0.16, slide: -70 }); noise(0.1, { gain: 0.04, freq: 700, q: 0.7, type: 'lowpass' }); },
  /** 곧 상영 시작 (딩-동-댕) */
  chime() {
    tone(659, 0.5, { type: 'sine', gain: 0.12 });
    tone(523, 0.5, { type: 'sine', gain: 0.12, at: 0.32 });
    tone(784, 0.9, { type: 'sine', gain: 0.12, at: 0.64 });
  },
  /** 조명 꺼짐 */
  dim() { tone(220, 1.1, { type: 'sine', gain: 0.07, slide: -140 }); },
  /** 박수 */
  clap() {
    for (let i = 0; i < 5; i++) noise(0.035, { gain: 0.12, freq: 1500 + Math.random() * 600, q: 0.8, at: i * 0.11 + Math.random() * 0.02 });
  },
  /** 안 돼요 */
  nope() { tone(220, 0.12, { type: 'triangle', gain: 0.1 }); tone(180, 0.18, { type: 'triangle', gain: 0.1, at: 0.1 }); },
  /** 기념 도장 */
  stamp() { tone(90, 0.18, { type: 'sine', gain: 0.3, slide: -30 }); noise(0.06, { gain: 0.1, freq: 400, q: 0.7, type: 'lowpass' }); },
};
