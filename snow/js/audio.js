// 소리. 발소리는 실제 눈 밟는 녹음을 한 걸음씩 잘라 둔 것 중에서 골라 튼다(같은 소리가 연달아 나지 않게).
// 배경으로는 눈 내리는 소리가 계속 흐르고, 눈발이 굵어지면 눈보라 바람이 섞인다.
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 낼 수 없으므로, start() 는 누름 처리 안에서 불러야 한다.

// 한 파일에 여러 소리를 늘어놓았다: [시작(초), 길이(초)]
const MAP = {
  fresh: [[0.2, 1.31], [1.71, 1.01], [2.92, 1.43], [4.55, 1.43], [6.18, 0.85], [7.23, 1.13], [8.56, 1.07], [9.83, 1.39], [11.42, 1.09], [12.71, 0.89]],
  packed: [[0.68, 0.86], [1.74, 0.76], [2.7, 0.6], [3.5, 0.72], [4.42, 0.66], [5.28, 0.42], [5.9, 0.6]],
  bodyfall: [0.2, 1.298],
  rustle: [[1.698, 1.01]],
  snowfall: { start: 0.5, length: 20.0 },
  blizzard: { start: 0.5, length: 18.0 },
};
const FILES = { fresh: 'steps-fresh.mp3', packed: 'steps-packed.mp3', fx: 'fx.mp3', snowfall: 'snowfall.mp3', blizzard: 'blizzard.mp3' };
const STEP_MAX = 0.62;        // 한 걸음 소리는 이만큼만 (걸음이 이어지면 겹쳐 뭉개지므로)

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
  const stats = { started: false, loaded: [], failed: [], steps: 0, fresh: 0, packed: 0, fx: 0 };

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
    src.connect(gain).connect(master);
    src.start(0, MAP[name].start + Math.random() * MAP[name].length * 0.8);
    loops[name] = { src, gain };
    applyWeather(2.5);
  }

  function applyWeather(tau = 1.5) {
    if (!ctx) return;
    const storm = Math.min(1, Math.max(0, (weather - 0.38) / 0.62));
    if (loops.snowfall) loops.snowfall.gain.gain.setTargetAtTime(0.9 - storm * 0.45, ctx.currentTime, tau);
    if (loops.blizzard) loops.blizzard.gain.gain.setTargetAtTime(storm * 0.8, ctx.currentTime, tau);
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
    gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.setValueAtTime(volume, t + Math.max(0.02, dur / rate - 0.16));
    gain.gain.linearRampToValueAtTime(0, t + dur / rate);
    src.connect(gain).connect(master);
    src.start(t, Math.max(0, at - 0.01), dur + 0.02);
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
      // 발소리부터 받고, 배경은 받는 대로 흐르기 시작한다
      load('fresh'); load('packed'); load('fx');
      load('snowfall').then(() => startLoop('snowfall'));
      load('blizzard').then(() => startLoop('blizzard'));
    },
    /** 한 걸음. packed: 이미 밟힌 눈인가 */
    step(packed) {
      stats.steps++;
      stats[packed ? 'packed' : 'fresh']++;
      const kind = packed && buffers.packed ? 'packed' : 'fresh';      // 다져진 눈 소리를 아직 못 받았으면 새 눈 소리로 대신한다
      shot(buffers[kind], pick(kind), kind === 'fresh' ? 0.62 : 0.5, 0.94 + Math.random() * 0.14, STEP_MAX);
    },
    /** 'bodyfall'(눈에 눕는 소리) | 'rustle'(눈을 쓰는 소리) */
    fx(name, volume = 0.6) {
      stats.fx++;
      const at = name === 'bodyfall' ? MAP.bodyfall : MAP.rustle[0];
      shot(buffers.fx, at, volume, 0.92 + Math.random() * 0.2);
    },
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
