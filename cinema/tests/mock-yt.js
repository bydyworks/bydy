// 시험용 가짜 유튜브 IFrame API. 진짜 플레이어처럼 시간이 흐르고, 상태 코드를 바꾸고, 이벤트를 보낸다.
// window.__ytMock 으로 동작을 바꿀 수 있다:
//   duration(초), error(오류 코드), blockAutoplay, blockUnmute(소리 켜면 멈춤 = iOS 흉내), live, loadDelay(ms)
(function () {
  const cfg = () => window.__ytMock || {};
  const players = (window.__ytPlayers = window.__ytPlayers || []);

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
      const frame = document.createElement('div');
      frame.className = 'mock-yt';
      frame.style.cssText = 'width:100%;height:100%;background:linear-gradient(135deg,#1d3557,#457b9d);color:#fff;font:600 13px/1.5 monospace;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre';
      frame.addEventListener('click', () => { this.muted = false; if (this.state !== 1) this._set(1); });
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
        if (this.vars.autoplay && !cfg().blockAutoplay && (this.muted || !cfg().blockAudibleAutoplay)) this._set(1);
      }, cfg().loadDelay || 60);
      this._timer = setInterval(() => this._tick(), 100);
    }
    _now() { return this.state === 1 ? this.pos + ((performance.now() - this.t0) / 1000) * this.rate : this.pos; }
    _set(st) {
      if (st === this.state || this.destroyed) return;
      this.pos = this._now();
      this.t0 = performance.now();
      this.state = st;
      const ev = this.opts.events || {};
      ev.onStateChange && ev.onStateChange({ data: st, target: this });
    }
    _tick() {
      const t = this._now();
      this.frame.textContent = `가짜 유튜브 [${this.videoId}]\n${t.toFixed(1)}s / ${this.duration}s · ${this.muted ? '음소거' : '소리 켜짐'} · 상태 ${this.state} · x${this.rate}`;
      if (this.state === 1 && !cfg().live && t >= this.duration) { this.pos = this.duration; this._set(0); }
    }
    getPlayerState() { return this.state; }
    getCurrentTime() { return cfg().live ? this._now() : Math.min(this._now(), this.duration); }
    getDuration() { return this.state === -1 || this.state === 5 ? 0 : (cfg().live ? this._now() : this.duration); }   // 진짜처럼 재생 전에는 0
    getVideoData() { return { video_id: this.videoId, title: `가짜 영상 ${this.videoId}`, author: 'mock', isLive: !!cfg().live }; }
    playVideo() { if (cfg().blockPlay) return; if (this.state === 0) this.pos = 0; this._set(1); }
    pauseVideo() { this._set(2); }
    seekTo(s) {
      this.seeks.push(s);
      this.pos = Math.max(0, cfg().live ? s : Math.min(s, this.duration));
      this.t0 = performance.now();
      if (this.state === 0 && this.pos < this.duration) this._set(1);
    }
    mute() { this.muted = true; }
    unMute() { if (cfg().blockUnmute) { this._set(2); return; } this.muted = false; }
    isMuted() { return this.muted; }
    setVolume() {}
    setPlaybackRate(r) { this.pos = this._now(); this.t0 = performance.now(); this.rate = r; }
    getIframe() { return this.frame; }
    destroy() { this.destroyed = true; clearInterval(this._timer); this.frame.remove(); }
  }

  window.YT = { Player, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  setTimeout(() => { if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady(); }, 10);
})();
