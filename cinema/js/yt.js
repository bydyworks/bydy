// 유튜브 공식 IFrame Player 를 감싼 얇은 층.
// 플레이어 위에는 아무것도 덮지 않는다(유튜브 정책). 조작은 전부 공식 API 로만 한다.
import { emitter } from './util.js';

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

let apiPromise = null;

/** IFrame API 스크립트를 한 번만 불러온다. */
export function loadYT(timeoutMs = 15000) {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const timer = setTimeout(() => reject(new Error('yt-timeout')), timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      try { if (typeof prev === 'function') prev(); } catch { /* 무시 */ }
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error('yt-load')); };
    document.head.appendChild(s);
  });
  apiPromise.catch(() => { apiPromise = null; });   // 실패하면 다음에 다시 시도할 수 있게
  return apiPromise;
}

/** 오류 코드 → 사람에게 보여 줄 말 */
export function ytErrorText(code) {
  switch (code) {
    case 2: return '영상 주소가 올바르지 않아요.';
    case 5: return '이 기기에서 재생할 수 없는 영상이에요.';
    case 100: return '삭제되었거나 비공개인 영상이에요.';
    case 101:
    case 150: return '다른 사이트에서 재생을 막아 둔 영상이에요. 다른 영상으로 약속을 잡아 주세요.';
    case 153: return '이 브라우저 설정에서는 유튜브 재생이 막혀 있어요. 다른 브라우저로 열어 보세요.';
    default: return '영상을 불러오지 못했어요.';
  }
}

/**
 * 플레이어를 만든다. mount 안에 iframe 이 들어간다.
 * @param {HTMLElement} mount
 * @param {{ videoId: string, start?: number, autoplay?: boolean, muted?: boolean }} opts
 */
export async function createPlayer(mount, opts) {
  const YT = await loadYT();
  const ev = emitter();
  const holder = document.createElement('div');
  mount.appendChild(holder);

  let ready = false;
  let destroyed = false;
  let lastState = YT_STATE.UNSTARTED;
  /** @type {any} */
  let player = null;

  const readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('yt-ready-timeout')), 20000);
    player = new YT.Player(holder, {
      width: '100%',
      height: '100%',
      host: 'https://www.youtube.com',
      videoId: opts.videoId,
      playerVars: {
        autoplay: opts.autoplay ? 1 : 0,
        mute: opts.muted ? 1 : 0,
        controls: 1,                 // 자막·화질·전체화면·음소거 해제는 유튜브 컨트롤 그대로 쓴다
        playsinline: 1,              // iOS 에서 전체화면으로 튀지 않게
        rel: 0,
        fs: 1,
        iv_load_policy: 3,
        start: Math.max(0, Math.floor(opts.start || 0)),
        enablejsapi: 1,
        origin: location.origin,
        // 초대 링크의 # 뒤(방 비밀값)는 절대 넘기지 않는다
        widget_referrer: location.origin + location.pathname,
        hl: 'ko',
      },
      events: {
        onReady: () => { clearTimeout(timer); ready = true; resolve(); ev.emit('ready'); },
        onStateChange: (e) => { lastState = e.data; ev.emit('state', e.data); },
        onError: (e) => { clearTimeout(timer); ev.emit('error', e.data); reject(Object.assign(new Error('yt-error'), { code: e.data })); },
      },
    });
  });
  // onError 가 준비 전에 오면 reject 되지만, 준비 후의 오류는 'error' 이벤트로만 알린다.
  readyPromise.catch(() => {});

  const call = (name, ...args) => {
    if (!ready || destroyed || !player || typeof player[name] !== 'function') return undefined;
    try { return player[name](...args); } catch { return undefined; }
  };

  try {
    const iframe = typeof player.getIframe === 'function' ? player.getIframe() : null;
    if (iframe) iframe.setAttribute('title', '상영 중인 영상');
  } catch { /* 무시 */ }

  return {
    ready: readyPromise,
    on: ev.on,
    get isReady() { return ready; },
    state: () => { const s = call('getPlayerState'); return typeof s === 'number' ? s : lastState; },
    time: () => Number(call('getCurrentTime')) || 0,
    duration: () => Number(call('getDuration')) || 0,
    title: () => { const d = call('getVideoData'); return d && typeof d.title === 'string' ? d.title : ''; },
    isLive: () => { const d = call('getVideoData'); return !!(d && d.isLive); },
    play: () => call('playVideo'),
    pause: () => call('pauseVideo'),
    seek: (sec) => call('seekTo', Math.max(0, sec), true),
    mute: () => call('mute'),
    // 관객이 유튜브 컨트롤에서 줄여 둔 음량은 건드리지 않는다. 0 이라 켜도 안 들릴 때만 올린다.
    unmute: () => { call('unMute'); if (call('getVolume') === 0) call('setVolume', 100); },
    isMuted: () => !!call('isMuted'),
    /** 재생 속도 (0.75 / 1 / 1.25 만 쓴다) */
    rate: (r) => call('setPlaybackRate', r),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ev.clear();
      // 내 iframe 만 치운다. mount 를 통째로 비우면 같은 자리에 이미 걸린 새 플레이어까지 뜯겨 나간다.
      let frame = null;
      try { frame = player && typeof player.getIframe === 'function' ? player.getIframe() : null; } catch { /* 무시 */ }
      try { player && player.destroy && player.destroy(); } catch { /* 무시 */ }
      if (frame) frame.remove();
      holder.remove();
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof createPlayer>>} Player */
