// 소리. 발소리는 실제 눈 밟는 녹음을 한 걸음씩 잘라 둔 것 중에서 골라 튼다(같은 소리가 연달아 나지 않게).
// 배경으로는 눈 내리는 소리가 계속 흐르고, 눈발이 굵어지면 눈보라 바람이 섞인다.
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 낼 수 없으므로, start() 는 누름 처리 안에서 불러야 한다.

import { createMusicBox } from './carols.js';

// 한 파일에 여러 소리를 늘어놓았다: [시작(초), 길이(초)]
const MAP = {
  fresh: [[0.2, 0.83], [1.23, 0.53], [1.96, 1.17], [3.33, 1.05], [4.58, 0.93], [5.71, 0.85], [6.76, 0.67], [7.63, 0.69], [8.52, 0.57], [9.29, 0.73], [10.22, 0.71], [11.13, 0.89], [12.22, 0.97], [13.39, 0.63]],
  packed: [[0.2, 0.44], [0.84, 0.5], [1.54, 0.5], [2.24, 0.5], [2.94, 0.5], [3.64, 0.5], [4.34, 0.5], [5.04, 0.5]],
  bodyfall: [0.2, 1.298],
  rustle: [[1.698, 1.01]],
  snowfall: { start: 0.5, length: 20.0 },
  blizzard: { start: 0.5, length: 18.0 },
};
const FILES = { fresh: 'steps-fresh.mp3', packed: 'steps-packed.mp3', fx: 'fx.mp3', snowfall: 'snowfall.mp3', blizzard: 'blizzard.mp3' };
const STEP_MAX = 0.95;        // 한 걸음 소리는 길어야 이만큼 (걸음이 이어지면 겹쳐 뭉개지므로). 빨리 걸을 때는 main.js 가 더 짧게 정해 준다
const VOLUME = { fresh: 0.5, packed: 0.42, snowfall: 0.55, snowfallInStorm: 0.4, wind: 0.2 };   // 발소리가 주인공, 배경은 뒤에 깔린다

export function createAudio(baseUrl = 'audio/') {
  /** @type {AudioContext | null} */
  let ctx = null;
  let master = null;
  const buffers = {};
  const loops = {};
  let muted = false;
  let started = false;
  let weather = 0.3;
  const last = { fresh: -1, packed: -1 };
  const stats = { started: false, loaded: [], failed: [], steps: 0, fresh: 0, packed: 0, fx: 0, water: 0, snowFx: [], slide: 0, slideLevel: 0, stepLen: 0, carol: null };
  let box = null;               // 트리의 오르골 (carols.js)
  let treeDistance = 999;

  async function load(name) {
    try {
      const res = await fetch(baseUrl + FILES[name]);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
      stats.loaded.push(name);
    } catch (e) {
      stats.failed.push(name);
      console.warn('[audio] 소리를 불러오지 못했어요:', name, e && e.message);
    }
  }

  function startLoop(name) {
    if (!buffers[name] || loops[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = true;
    src.loopStart = MAP[name].start;
    src.loopEnd = MAP[name].start + MAP[name].length;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    if (name === 'blizzard') {
      // 눈보라 바람은 높은 소리를 걷어 내 멀리서 웅웅거리는 정도로만 들리게 한다 (쉬익거리는 소리가 귀에 거슬리지 않게)
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass'; soft.frequency.value = 900; soft.Q.value = 0.4;
      src.connect(soft).connect(gain).connect(master);
    } else src.connect(gain).connect(master);
    src.start(0, MAP[name].start + Math.random() * MAP[name].length * 0.8);
    loops[name] = { src, gain };
    applyWeather(2.5);
  }

  function applyWeather(tau = 1.5) {
    if (!ctx) return;
    const storm = Math.min(1, Math.max(0, (weather - 0.38) / 0.62));
    if (loops.snowfall) loops.snowfall.gain.gain.setTargetAtTime(VOLUME.snowfall + (VOLUME.snowfallInStorm - VOLUME.snowfall) * storm, ctx.currentTime, tau);
    if (loops.blizzard) loops.blizzard.gain.gain.setTargetAtTime(storm * VOLUME.wind, ctx.currentTime, tau);
  }

  /** 소리 한 조각을 튼다. [시작, 길이], 세기, 빠르기, 최대 길이 */
  function shot(buffer, [at, len], volume, rate = 1, maxLen = len) {
    if (!ctx || !buffer || muted || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    const t = ctx.currentTime, dur = Math.min(len, maxLen);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.03);
    gain.gain.setValueAtTime(volume, t + Math.max(0.04, dur / rate - 0.22));
    gain.gain.linearRampToValueAtTime(0, t + dur / rate);
    src.connect(gain).connect(master);
    src.start(t, Math.max(0, at - 0.01), dur + 0.02);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
  }

  function pick(kind) {
    const list = MAP[kind];
    let i = Math.floor(Math.random() * list.length);
    if (i === last[kind]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    last[kind] = i;
    return list[i];
  }

  return {
    stats,
    /** 사용자가 누른 순간에 부른다 */
    async start() {
      if (started) return;
      started = true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { stats.failed.push('AudioContext'); return; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      try { await ctx.resume(); } catch { /* 나중에 다시 시도한다 */ }
      stats.started = true;
      box = createMusicBox(ctx, master);
      box.setDistance(treeDistance);
      stats.carol = box.stats;
      // 발소리부터 받고, 배경은 받는 대로 흐르기 시작한다
      load('fresh'); load('packed'); load('fx');
      load('snowfall').then(() => startLoop('snowfall'));
      load('blizzard').then(() => startLoop('blizzard'));
    },
    /** 한 걸음. packed: 이미 밟힌 눈인가, maxLen: 소리를 이만큼에서 끊는다(초) */
    step(packed, maxLen = STEP_MAX) {
      stats.steps++;
      stats.stepLen = maxLen;
      stats[packed ? 'packed' : 'fresh']++;
      const kind = packed && buffers.packed ? 'packed' : 'fresh';      // 다져진 눈 소리를 아직 못 받았으면 새 눈 소리로 대신한다
      shot(buffers[kind], pick(kind), VOLUME[kind], 0.95 + Math.random() * 0.1, maxLen);
    },
    /** 'bodyfall'(눈에 눕는 소리) | 'rustle'(눈을 쓰는 소리) */
    fx(name, volume = 0.6) {
      stats.fx++;
      const at = name === 'bodyfall' ? MAP.bodyfall : MAP.rustle[0];
      shot(buffers.fx, at, volume, 0.92 + Math.random() * 0.2);
    },
    /**
     * 배로 미끄러지는 소리 (코드로 만든 소리): 눈 위에서는 "스으윽" 쓸리는 소리, 얼음 위에서는 더 높고 매끄러운 소리.
     * level(빠르기 0..1, 얼음 위인가)을 박자마다 알려 주고, 다 멈추면 stop.
     */
    slide: (() => {
      let src = null, band = null, gain = null;
      return {
        start() {
          stats.slide++;
          if (!ctx || muted || ctx.state !== 'running' || src) return;
          const len = 2, buffer = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buffer.getChannelData(0);
          let b = 0;
          for (let i = 0; i < d.length; i++) { b = 0.86 * b + 0.14 * (Math.random() * 2 - 1); d[i] = b * (0.75 + 0.25 * Math.sin(i / ctx.sampleRate * Math.PI * 2 * 7)); }      // 낮게 거른 잡음에 잔결
          src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
          band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.7;
          gain = ctx.createGain(); gain.gain.value = 0;
          src.connect(band).connect(gain).connect(master);
          src.start();
        },
        level(speed, ice) {
          stats.slideLevel = speed;
          if (!src) return;
          const t = ctx.currentTime;
          gain.gain.setTargetAtTime((ice ? 0.22 : 0.42) * speed, t, 0.05);
          band.frequency.setTargetAtTime((ice ? 2600 : 800) + speed * (ice ? 900 : 500), t, 0.08);
        },
        stop() {
          stats.slideLevel = 0;
          if (!src) return;
          const s = src, g = gain, f = band, t = ctx.currentTime;
          g.gain.setTargetAtTime(0, t, 0.06);
          s.stop(t + 0.4);
          s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
          src = band = gain = null;
        },
      };
    })(),
    /**
     * 눈사람 소리 (코드로 만든 소리).
     * 'pop': 눈사람으로 바뀌는 순간의 "뿅" — 통통 튀어 오르는 짧은 음 둘과 반짝이는 소리
     * 'shake': 쌓인 눈이 털릴 때의 "후두둑", 'burst': 눈사람이 부서져 흩어질 때의 더 큰 "와르르"
     */
    snowFx(kind) {
      stats.snowFx.push(kind);
      if (!ctx || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const tone = (type, from, to, at, len, peak) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t + at);
        osc.frequency.exponentialRampToValueAtTime(to, t + at + len);
        gain.gain.setValueAtTime(0, t + at);
        gain.gain.linearRampToValueAtTime(peak, t + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + at + len + 0.05);
        osc.connect(gain).connect(master);
        osc.start(t + at); osc.stop(t + at + len + 0.08);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      };
      const puff = (at, len, freq, peak) => {                 // 눈덩이가 떨어지는 사각거림: 걸러 낸 잡음 한 덩이
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = buffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const u = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.min(1, u * 12) * Math.pow(1 - u, 1.6); }
        const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
        src.buffer = buffer; band.type = 'bandpass'; band.frequency.value = freq; band.Q.value = 0.9; gain.gain.value = peak;
        src.connect(band).connect(gain).connect(master);
        src.start(t + at);
        src.onended = () => { src.disconnect(); band.disconnect(); gain.disconnect(); };
      };
      if (kind === 'pop') {
        tone('sine', 360, 980, 0, 0.09, 0.16);                // 뿅
        tone('sine', 620, 1500, 0.08, 0.07, 0.09);            //  통
        tone('triangle', 2100, 2600, 0.15, 0.12, 0.025);      // 반짝
        tone('triangle', 2800, 3300, 0.2, 0.12, 0.018);
        puff(0.02, 0.18, 2400, 0.08);                         // 눈가루가 폭
        return;
      }
      const big = kind === 'burst';
      const n = big ? 7 : 4;
      for (let i = 0; i < n; i++) puff(i * (big ? 0.045 : 0.06) + Math.random() * 0.02, big ? 0.16 : 0.12, (big ? 900 : 1500) + Math.random() * 900, (big ? 0.16 : 0.09) * (1 - i / (n + 2)));
      if (big) tone('sine', 220, 110, 0, 0.12, 0.08);         // 눈덩이가 툭 떨어지는 낮은 소리
    },
    /**
     * 낚시터의 물소리 (녹음이 아니라 코드로 만든 소리).
     * 'tick': 물고기가 찌를 건드려 볼 때의 가벼운 톡, 'bite': 진짜 입질 — 찌가 쑥 들어가는 깊은 퐁,
     * 'plop': 물고기를 놓아줄 때의 퐁, 'splash': 낚아 올릴 때의 첨벙
     */
    water(kind) {
      stats.water++;
      if (!ctx || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const tone = (from, to, at, len, peak) => {              // 높이가 뚝 떨어지는 짧은 소리 한 방울
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(from, t + at);
        osc.frequency.exponentialRampToValueAtTime(to, t + at + len);
        gain.gain.setValueAtTime(0, t + at);
        gain.gain.linearRampToValueAtTime(peak, t + at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + at + len + 0.06);
        osc.connect(gain).connect(master);
        osc.start(t + at); osc.stop(t + at + len + 0.1);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      };
      if (kind === 'tick') { tone(980, 620, 0, 0.035, 0.06); return; }
      if (kind === 'bite') { tone(400, 105, 0, 0.16, 0.26); tone(660, 300, 0.09, 0.08, 0.08); return; }
      if (kind === 'plop') { tone(540, 170, 0, 0.11, 0.2); tone(820, 430, 0.075, 0.07, 0.07); return; }
      // 첨벙: 낮은 퐁 위에 물 튀는 소리(걸러 낸 잡음)를 얹는다
      tone(260, 95, 0, 0.14, 0.2); tone(700, 300, 0.11, 0.09, 0.06);
      const len = 0.5, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
      const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
      src.buffer = buffer; band.type = 'bandpass'; band.frequency.value = 1900; band.Q.value = 0.6;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.13, t + 0.03); gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(band).connect(gain).connect(master);
      src.start(t);
      src.onended = () => { src.disconnect(); band.disconnect(); gain.disconnect(); };
    },
    /** 트리까지의 거리: 가까울수록 오르골 캐롤이 크게 들린다 */
    setTreeDistance(d) { treeDistance = d; if (box) box.setDistance(d); },
    /** 지금 들리는 캐롤의 제목 (들리지 않으면 빈 글자) */
    get carolTitle() { return box && box.stats.gain > 0.012 ? box.stats.title : ''; },
    /** 눈발의 세기 0..1 */
    setWeather(snowfall) { if (Math.abs(snowfall - weather) > 0.01) { weather = snowfall; applyWeather(); } },
    setMuted(on) {
      muted = on;
      if (master) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.08);
    },
    get muted() { return muted; },
    /** 화면이 가려지면 멈추고, 돌아오면 다시 흐른다 */
    setActive(on) {
      if (!ctx) return;
      if (on) ctx.resume().catch(() => {}); else ctx.suspend().catch(() => {});
    },
  };
}
