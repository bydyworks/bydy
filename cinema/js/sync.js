// 상영 동기화 엔진: "지금 영화가 몇 분 몇 초여야 하는가"(방 시계 기준)에 플레이어를 맞춘다.
// 진짜 극장처럼 아무도 영상을 넘기거나 멈출 수 없고, 늦게 오면 중간부터 본다.
//
// 재생 시작 전략 (모바일 자동재생 정책 때문에 단계적으로):
//   1) 항상 음소거로 자동재생을 시작한다 — 이건 어디서나 된다.
//   2) 재생이 시작되면 소리를 켜 본다(자동). 브라우저가 막아서 영상이 멈추면 다시 음소거로 돌리고 "소리 켜기" 버튼을 보여 준다.
//   3) 사용자가 "소리 켜기"를 눌러도 막히면(일부 iOS/인앱 브라우저) 영상 안의 음소거 해제 버튼을 직접 누르라고 안내한다.
import { YT_STATE } from './yt.js';

const TICK_MS = 500;
const NUDGE_FROM = 0.6;       // 이만큼(초) 어긋나면 재생 속도를 살짝 바꿔 따라잡는다
const NUDGE_DONE = 0.2;
const NUDGE_MAX_MS = 10000;
const SEEK_FROM = 1.5;        // 이보다 크게 어긋나면 그 위치로 바로 건너뛴다
const SEEK_LEAD = 0.3;        // 건너뛴 뒤 버퍼링으로 뒤처지는 만큼 살짝 앞을 겨냥 (처음 값 — 실제로 걸린 시간을 재서 고쳐 쓴다)
const SEEK_LEAD_MAX = 3;
const SEEK_COOLDOWN = 3000;
const CHASE_MAX = 5;          // 이만큼(초)까지 뒤처진 것은 건너뛰지 않고 빠르게 감아 따라잡을 수 있다 (chasing 참고)
const CHASE_CHECK_MS = 4000;  // 따라잡는 동안 이 간격으로 정말 줄어들고 있는지 본다
const OPENING_SEC = 10;       // 영화 첫머리 — 이 안에서는 뒤처져도 건너뛰지 않는다 (첫 장면을 놓치지 않게)
const JUMP_MEMORY_MS = 4000;  // 관객이 넘긴 흔적을 기억하는 시간 (넘긴 직후엔 버퍼링이라 바로 되돌리지 못한다)
const NEED_TAP_AFTER = 5000;  // 이만큼 기다려도 재생이 안 되면 "영상을 눌러 주세요"
const STALL_LIMIT = 12000;
const UNMUTE_CHECK_MS = 1200;

/**
 * @typedef {Object} SyncStatus
 * @property {boolean} playing        실제로 재생 중
 * @property {boolean} muted          음소거 상태 (→ "소리 켜기" 버튼)
 * @property {boolean} needTap        자동재생이 막혔다 (→ "영상을 한 번 눌러 주세요")
 * @property {boolean} unmuteBlocked  "소리 켜기"가 브라우저에 막혔다 (→ 영상 안의 음소거 해제를 직접)
 * @property {boolean} live           라이브 방송 (위치를 맞추지 않는다)
 * @property {boolean} catching       재생은 되는데 위치가 크게 어긋나 있다 (따라잡는 중이거나 광고가 나오는 중)
 * @property {number} drift           플레이어 위치 − 목표 위치 (초)
 */

/**
 * @param {Object} o
 * @param {import('./yt.js').Player} o.player   autoplay + 음소거로 만든 플레이어
 * @param {(knownDur: number) => { phase: string, pos: number }} o.target  지금 목표 위치 (room.showPosition)
 * @param {(s: SyncStatus) => void} [o.onStatus]
 * @param {() => void} [o.onEnded]
 * @param {(kind: 'seek'|'pause') => void} [o.onUserMeddle]  관객이 직접 넘기거나 멈추려 했을 때 (안내용)
 * @param {boolean} [o.autoUnmute]  재생이 시작되면 자동으로 소리를 켜 볼지 (iOS 는 false 를 권장)
 */
export function createSync({ player, target, onStatus, onEnded, onUserMeddle, autoUnmute = true }) {
  let lastSeek = -Infinity;
  let lead = SEEK_LEAD;       // 다음에 건너뛸 때 앞서 겨냥할 시간(초)
  let sought = null;          // 방금 건너뛴 곳 { pos, lead(앞서 겨냥한 초, 없으면 null) } — 다시 재생되면 제대로 갔는지, 얼마나 걸렸는지 본다
  let settling = false;       // 건너뛴 뒤로 아직 제자리에 맞은 적이 없다
  let chase = null;           // 빠르게 감아 따라잡는 중이면 { at, drift }
  let everPlayed = false;
  let notPlayingSince = performance.now();
  let stallSince = 0;
  let endedFired = false;
  let soundTried = false;
  let unmuteTimer = 0;
  let pendingUnmute = null;   // 소리를 켜 보고 결과를 기다리는 중이면 { fromUser }
  let nudge = 0;              // -1 느리게, +1 빠르게, 0 정상
  let nudgeAt = 0;
  let inSyncAt = 0;           // 마지막으로 잘 맞았던 때
  let lastT = 0;              // 직전 박자에 본 플레이어 시계 (초)
  let lastTAt = 0;
  let jumpAt = -Infinity;     // 잘 맞던 플레이어 시계가 스스로 튄 때 = 관객이 직접 넘긴 때
  let lastPhase = '';
  let stopped = false;
  /** @type {SyncStatus} */
  const status = { playing: false, muted: true, needTap: false, unmuteBlocked: false, live: false, catching: false, drift: 0 };
  // 다른 앱에 다녀오면 브라우저가 영상을 멈춰 둔다. 그걸 "관객이 멈췄다"고 오해하지 않게 잠시 눈감아 준다.
  let quietUntil = 0;
  const onVisibility = () => {
    const now = performance.now();
    quietUntil = now + 5000;
    // 가려져 있던 시간을 "재생이 안 된다"로 세지 않는다 (돌아오자마자 "눌러 주세요"가 뜨지 않게)
    if (!document.hidden && notPlayingSince) notPlayingSince = now;
  };
  document.addEventListener('visibilitychange', onVisibility);

  function setStatus(patch) {
    let changed = false;
    for (const k of Object.keys(patch)) {
      if (k === 'drift') { status.drift = patch.drift; continue; }
      if (status[k] !== patch[k]) { status[k] = patch[k]; changed = true; }
    }
    if (changed && onStatus) onStatus({ ...status });
  }

  function seek(pos, now, aim = null) {
    setRate(0);
    player.seek(pos);
    lastSeek = now;
    sought = { pos, lead: aim };
    settling = true;
    chase = null;
  }

  /** 목표보다 조금 앞으로 건너뛴다 — 다시 재생되기까지 걸리는 시간만큼 */
  const seekAhead = (tgt, now) => seek(tgt.pos + lead, now, lead);

  /** 라이브의 getDuration() 은 길이가 아니라 "방송이 시작된 뒤 흐른 시간"이라 길이로 쓰지 않는다 */
  const lengthOf = (live) => (live ? 0 : player.duration());

  /** 플레이어 시계가 벽시계보다 훨씬 많이(또는 거꾸로) 움직였다면 누군가 넘긴 것. 버퍼링으로 멈춘 것은 여기 걸리지 않는다. */
  function noteJump(now) {
    const t = player.time();
    const moved = t - lastT;
    const ours = now - lastSeek < 1500;                       // 우리가 방금 건너뛴 것
    const wasInSync = inSyncAt && lastTAt - inSyncAt < 1600;  // 광고처럼 원래 안 맞던 중의 튐은 관객 탓이 아니다
    if (lastTAt && !ours && wasInSync && (moved < -1 || moved > ((now - lastTAt) / 1000) * 1.3 + 1)) jumpAt = now;
    lastT = t;
    lastTAt = now;
  }

  /**
   * 조금 뒤처졌을 때 건너뛰는 대신 빠르게 감아 따라잡아도 되는지. 두 경우에만 그렇게 한다:
   *  · 방금 건너뛰었는데도 뒤처져 있다 — 건너뛸 때마다 버퍼링이 긴 회선에서는 건너뛰기만 끝없이 되풀이하게 된다
   *  · 영화 첫머리다 — 플레이어가 늦게 떴다고 건너뛰면 제시간에 온 관객이 첫 장면을 못 본다
   * 따라잡는 중인데 줄어들지 않으면 false — 그때는 건너뛴다.
   */
  function chasing(drift, tgt, now) {
    if (!(settling || chase || tgt.pos < OPENING_SEC) || drift > 0 || drift < -CHASE_MAX) return false;
    if (!chase || now - chase.at >= CHASE_CHECK_MS) {
      if (chase && drift < chase.drift + 0.4) return false;   // 1.25배속이면 그동안 1초는 줄었어야 한다
      chase = { at: now, drift };
    }
    return true;
  }

  function setRate(dir) {
    if (nudge === dir) return;
    nudge = dir;
    nudgeAt = performance.now();
    player.rate(dir > 0 ? 1.25 : dir < 0 ? 0.75 : 1);
  }

  /** 소리를 켜 본다. 막혀서 영상이 멈추면 음소거로 되돌린다. */
  function tryUnmute(fromUser) {
    soundTried = true;
    // 소리를 켜려다 브라우저가 영상을 멈춘 것을 "관객이 멈췄다"고 나무라지 않게 잠시 눈감아 준다
    quietUntil = Math.max(quietUntil, performance.now() + UNMUTE_CHECK_MS + 1500);
    player.unmute();
    if (fromUser) player.play();
    setStatus({ muted: false, unmuteBlocked: false });
    pendingUnmute = { fromUser: !!fromUser };
    clearTimeout(unmuteTimer);
    unmuteTimer = setTimeout(settleUnmute, UNMUTE_CHECK_MS);
  }

  /** 소리 켜기가 통했는지 확인한다. 막혔으면 음소거로 되돌려 영화는 계속 흐르게 한다. */
  function settleUnmute() {
    if (stopped || !pendingUnmute) return;
    const { fromUser } = pendingUnmute;
    pendingUnmute = null;
    clearTimeout(unmuteTimer);
    const st = player.state();
    const tgt = target(lengthOf(player.isLive()));
    const stalled = st === YT_STATE.PAUSED || st === YT_STATE.UNSTARTED || st === YT_STATE.CUED;
    // 브라우저가 막는 방식은 두 가지다: 영상을 멈춰 버리거나, 소리 켜기 자체를 무시하거나.
    if (tgt.phase === 'playing' && (stalled || player.isMuted())) {
      player.mute();
      player.play();
      setStatus({ muted: true, unmuteBlocked: fromUser });
    }
  }

  /** 재생 중의 어긋남을 고친다: 조금이면 속도로, 크면 건너뛰어서 */
  function correct(drift, tgt, now) {
    const abs = Math.abs(drift);
    if (sought && now > lastSeek) {
      // 광고 중처럼 건너뛰기가 먹지 않을 때가 있다. 그때는 따라잡을 일이 아니라 다시 건너뛸 일이다.
      const landed = tgt.pos + drift > sought.pos - 1;
      if (!landed) settling = false;
      // 건너뛴 뒤 다시 재생되기까지 걸린 시간 = 겨냥한 만큼 − 지금 앞선 만큼. 다음에는 그만큼 앞을 겨냥한다.
      else if (sought.lead != null) lead = Math.min(SEEK_LEAD_MAX, Math.max(SEEK_LEAD, sought.lead - drift + 0.2));
      sought = null;
    }
    if (abs < NUDGE_FROM) { inSyncAt = now; settling = false; chase = null; }
    if (abs > SEEK_FROM) {
      if (now - lastSeek <= SEEK_COOLDOWN) return;
      const jumped = now - jumpAt < JUMP_MEMORY_MS;
      jumpAt = -Infinity;
      if (jumped && now > quietUntil && onUserMeddle) onUserMeddle('seek');
      if (!jumped && chasing(drift, tgt, now)) setRate(1);
      else seekAhead(tgt, now);
    } else if (nudge !== 0) {
      const caughtUp = abs < NUDGE_DONE || (nudge > 0 && drift > 0) || (nudge < 0 && drift < 0);
      if (caughtUp || now - nudgeAt > NUDGE_MAX_MS) setRate(0);
    } else if (abs > NUDGE_FROM && now - lastSeek > SEEK_COOLDOWN) {
      setRate(drift > 0 ? -1 : 1);
    }
  }

  function tick() {
    if (stopped || !player.isReady) return;
    const now = performance.now();
    const live = player.isLive();
    const dur = lengthOf(live);
    const tgt = target(dur);
    const st = player.state();
    const playing = st === YT_STATE.PLAYING;
    if (playing) { everPlayed = true; notPlayingSince = 0; } else if (!notPlayingSince) notPlayingSince = now;
    noteJump(now);

    // 라이브는 길이를 모르니, 플레이어가 "끝났다"고 하면 그대로 믿는다
    if (tgt.phase === 'ended' || (st === YT_STATE.ENDED && (live || (dur > 0 && tgt.pos > dur - 3)))) {
      if (!endedFired) { endedFired = true; setRate(0); onEnded && onEnded(); }
      return;
    }

    if (tgt.phase === 'paused') {          // 쉬는 시간(인터미션)
      setRate(0);
      if (playing || st === YT_STATE.BUFFERING) player.pause();
      if (!live && Math.abs(player.time() - tgt.pos) > 0.5 && now - lastSeek > SEEK_COOLDOWN) seek(tgt.pos, now);
      setStatus({ playing: false, needTap: false, live, muted: player.isMuted() });
      lastPhase = 'paused';
      return;
    }
    if (tgt.phase !== 'playing') { lastPhase = tgt.phase; return; }
    if (lastPhase !== 'playing') {
      // 쉬는 시간이 끝난 순간에는 모두가 정확히 같은 곳에서 다시 출발한다
      if (lastPhase === 'paused' && !live) seekAhead(tgt, now);
      // 우리가 세워 둔 동안은 "재생이 막혔다"거나 "관객이 멈췄다"로 세지 않는다
      if (!playing) notPlayingSince = now;
      quietUntil = Math.max(quietUntil, now + 2000);
      lastPhase = 'playing';
    }

    if (playing) {
      stallSince = 0;
      if (!soundTried) {
        if (autoUnmute) { tryUnmute(false); return; }   // 결과는 다음 박자에 본다 (막혔다면 그 사이 음소거로 되돌아간다)
        soundTried = true;
      }
      // 관객이 영상 안에서 직접 소리를 켰다면 그대로 따른다
      const mutedNow = player.isMuted();
      const drift = live ? 0 : player.time() - tgt.pos;
      if (!live) correct(drift, tgt, now);
      setStatus({ playing: true, needTap: false, live, muted: mutedNow, catching: !live && Math.abs(drift) > SEEK_FROM, drift });
      return;
    }

    setRate(0);
    if (st === YT_STATE.BUFFERING) {
      if (!stallSince) stallSince = now;
      if (!live && now - stallSince > STALL_LIMIT && now - lastSeek > SEEK_COOLDOWN) { seekAhead(tgt, now); stallSince = now; }
      setStatus({ playing: false, live, needTap: false });   // 불러오는 중이면 눌러 달라고 할 일이 아니다
      return;
    }

    // 소리를 켜자마자 멈췄다면 브라우저가 막은 것이다. 기다리지 않고 바로 음소거로 되돌려 다시 튼다.
    if (pendingUnmute) { settleUnmute(); return; }
    // 화면이 가려진 동안 멈춘 영상은 브라우저가 멈춘 것이다. 억지로 다시 틀지 않고, 돌아오면 그때 맞춘다.
    if (document.hidden) { setStatus({ playing: false, live }); return; }

    // 멈춰 있음: 아직 시작 전(-1/5, 광고일 수도 있음)이거나 누군가 멈춤(2).
    if (st === YT_STATE.PAUSED && everPlayed) {
      if (onUserMeddle && now > quietUntil && notPlayingSince && now - notPlayingSince < TICK_MS * 2.5) onUserMeddle('pause');
      if (!live && Math.abs(player.time() - tgt.pos) > SEEK_FROM && now - lastSeek > SEEK_COOLDOWN) seekAhead(tgt, now);
    }
    player.play();
    setStatus({
      playing: false, live, muted: player.isMuted(),
      needTap: !!notPlayingSince && now - notPlayingSince > NEED_TAP_AFTER,
    });
  }

  const timer = setInterval(tick, TICK_MS);
  tick();

  return {
    status: () => ({ ...status }),
    /** 사용자가 "소리 켜기"를 눌렀을 때 — 반드시 탭 이벤트 처리 안에서 바로(await 없이) 호출할 것 */
    unmute() { tryUnmute(true); },
    stop() {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
      clearTimeout(unmuteTimer);
    },
  };
}
