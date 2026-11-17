// 시험용 가짜 유튜브 IFrame API. 진짜 플레이어처럼 시간이 흐르고, 상태 코드를 바꾸고, 이벤트를 보낸다.
// window.__ytMock 으로 동작을 바꿀 수 있다:
//   duration(초), error(오류 코드), blockAutoplay, blockPlay, blockUnmute(소리 켜면 멈춤 = iOS 흉내), loadDelay(ms), volume(0~100)
//   live               라이브 방송. getDuration() 은 길이가 아니라 "방송이 시작된 뒤 흐른 시간"이다 (유튜브 문서 그대로)
//   streamStartedAgo   (live) 페이지를 열었을 때 방송이 이미 몇 초째였는지 (기본 0 = 방금 시작한 방송)
//   startDelay         자동재생이 시작되기 전의 버퍼링(ms)
//   seekDelay          재생 중 seekTo() 뒤에 다시 재생되기까지의 버퍼링(ms) — 느린 회선 흉내
//   playDelay          멈춘 영상을 playVideo() 로 다시 틀 때의 버퍼링(ms)
//   stallAt, stallMs   재생 위치가 stallAt(초)에 처음 닿으면 stallMs 동안 버퍼링 (시간이 멈춘다)
//   freezeAt, freezeMs 재생 위치가 freezeAt 에 처음 닿으면 freezeMs 동안 "재생 중"이라면서 시간이 멈추고 seekTo 도 무시 (중간 광고 흉내)
//   unmutePauses       플레이어 안을 직접 누르기 전에는 unMute() 가 영상을 멈추고, 소리가 켜진 채로는 playVideo() 도 거부 (iOS 흉내)
// 일어난 일은 window.__ytLog 에 [ms, 사건, ...] 으로 쌓인다.
(function () {
  const cfg = () => window.__ytMock || {};
  const players = (window.__ytPlayers = window.__ytPlayers || []);
  const LOG = (window.__ytLog = window.__ytLog || []);
  const log = (...a) => LOG.push([Math.round(performance.now()), ...a]);
  const pageT0 = performance.now();
  const streamElapsed = () => (cfg().streamStartedAgo || 0) + (performance.now() - pageT0) / 1000;

  class Player {
    constructor(el, opts) {
      this.opts = opts || {};
      this.vars = this.opts.playerVars || {};
      this.videoId = this.opts.videoId;
      this.state = -1;
      this.muted = !!this.vars.mute;
      this.rate = 1;
      this.pos = Number(this.vars.start) || 0;
      this.t0 = performance.now();
      this.duration = cfg().duration || 120;
      this.seeks = [];
      this.destroyed = false;
      this.volume = cfg().volume == null ? 100 : cfg().volume;
      this.volumeSets = 0;        // setVolume 이 불린 횟수
      this.playCalls = 0;         // playVideo 가 불린 횟수
      this.gesture = false;       // 플레이어 안을 직접 누른 적이 있는지
      this.frozenUntil = 0;
      const frame = document.createElement('div');
      frame.className = 'mock-yt';
      frame.style.cssText = 'width:100%;height:100%;background:linear-gradient(135deg,#1d3557,#457b9d);color:#fff;font:600 13px/1.5 monospace;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre';
      frame.addEventListener('click', () => { this.gesture = true; this.muted = false; if (this.state !== 1) this._set(1); });
      const node = typeof el === 'string' ? document.getElementById(el) : el;
      node.replaceWith(frame);
      this.frame = frame;
      players.push(this);
      const ev = this.opts.events || {};
      setTimeout(() => {
        if (this.destroyed) return;
        if (cfg().error) { ev.onError && ev.onError({ data: cfg().error, target: this }); return; }
        this.ready = true;
        ev.onReady && ev.onReady({ target: this });
        if (!this.vars.autoplay || cfg().blockAutoplay || (!this.muted && cfg().blockAudibleAutoplay)) return;
        if (cfg().startDelay) this._buffer(cfg().startDelay); else this._set(1);
      }, cfg().loadDelay || 60);
      this._timer = setInterval(() => this._tick(), 50);
    }
    _now() {
      if (this.state !== 1) return this.pos;
      const from = Math.max(this.t0, this.frozenUntil);      // 얼어 있는 동안에는 시간이 흐르지 않는다
      return this.pos + (Math.max(0, performance.now() - from) / 1000) * this.rate;
    }
    _set(st) {
      if (st === this.state || this.destroyed) return;
      this.pos = this._now();
      this.t0 = performance.now();
      this.state = st;
      log('state', st);
      const ev = this.opts.events || {};
      ev.onStateChange && ev.onStateChange({ data: st, target: this });
    }
    /** ms 동안 버퍼링(3)했다가 다시 재생(1) */
    _buffer(ms) {
      this._set(3);
      clearTimeout(this._buf);
      this._buf = setTimeout(() => { if (this.state === 3) this._set(1); }, ms);
    }
    _tick() {
      const t = this._now();
      const c = cfg();
      this.frame.textContent = `가짜 유튜브 [${this.videoId}]\n${t.toFixed(1)}s / ${c.live ? 'LIVE' : this.duration + 's'} · ${this.muted ? '음소거' : '소리 켜짐'} · 상태 ${this.state} · x${this.rate}`;
      if (this.state !== 1) return;
      if (c.stallMs && !this.stalled && t >= c.stallAt) { this.stalled = true; this._buffer(c.stallMs); return; }
      if (c.freezeMs && !this.froze && t >= c.freezeAt) { this.froze = true; this.pos = t; this.t0 = performance.now(); this.frozenUntil = this.t0 + c.freezeMs; log('freeze'); return; }
      if (!c.live && t >= this.duration) { this.pos = this.duration; this._set(0); }
    }
    getPlayerState() { return this.state; }
    getCurrentTime() { return cfg().live ? this._now() : Math.min(this._now(), this.duration); }
    getDuration() { return this.state === -1 || this.state === 5 ? 0 : (cfg().live ? streamElapsed() : this.duration); }   // 진짜처럼 재생 전에는 0
    getVideoData() { return { video_id: this.videoId, title: `가짜 영상 ${this.videoId}`, author: 'mock', isLive: !!cfg().live }; }
    playVideo() {
      this.playCalls++;
      if (cfg().blockPlay) return;
      if (cfg().unmutePauses && !this.muted && !this.gesture) { log('play refused'); return; }
      if (this.state === 3) return;                          // 이미 불러오는 중
      if (this.state === 0) this.pos = 0;
      if (cfg().playDelay && this.state === 2) this._buffer(cfg().playDelay); else this._set(1);
    }
    pauseVideo() { this._set(2); }
    seekTo(s) {
      this.seeks.push(s);
      log('seekTo', +Number(s).toFixed(2));
      if (performance.now() < this.frozenUntil) return;      // "광고" 중에는 먹지 않는다
      this.pos = Math.max(0, cfg().live ? s : Math.min(s, this.duration));
      this.t0 = performance.now();
      if (cfg().seekDelay && (this.state === 1 || this.state === 3)) this._buffer(cfg().seekDelay);
      if (this.state === 0 && this.pos < this.duration) this._set(1);
    }
    mute() { this.muted = true; log('mute'); }
    unMute() {
      log('unMute');
      if (cfg().unmutePauses && !this.gesture) { this.muted = false; this._set(2); return; }
      if (cfg().blockUnmute) { this._set(2); return; }
      this.muted = false;
    }
    isMuted() { return this.muted; }
    getVolume() { return this.volume; }
    setVolume(v) { this.volume = v; this.volumeSets++; }
    setPlaybackRate(r) { this.pos = this._now(); this.t0 = performance.now(); this.rate = r; log('rate', r); }
    getIframe() { return this.frame; }
    destroy() { this.destroyed = true; clearInterval(this._timer); clearTimeout(this._buf); this.frame.remove(); }
  }

  window.YT = { Player, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  setTimeout(() => { if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady(); }, 10);
})();
