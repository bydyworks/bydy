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
const SEEK_LEAD = 0.3;        // 건너뛴 뒤 버퍼링으로 뒤처지는 만큼 살짝 앞을 겨냥
const SEEK_COOLDOWN = 3000;
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
  let everPlayed = false;
  let notPlayingSince = performance.now();
  let stallSince = 0;
  let endedFired = false;
  let soundTried = false;
  let unmuteTimer = 0;
  let nudge = 0;              // -1 느리게, +1 빠르게, 0 정상
  let nudgeAt = 0;
  let inSyncAt = 0;           // 마지막으로 잘 맞았던 때
  let lastPhase = '';
  let stopped = false;
  /** @type {SyncStatus} */
  const status = { playing: false, muted: true, needTap: false, unmuteBlocked: false, live: false, catching: false, drift: 0 };
  // 다른 앱에 다녀오면 브라우저가 영상을 멈춰 둔다. 그걸 "관객이 멈췄다"고 오해하지 않게 잠시 눈감아 준다.
  let quietUntil = 0;
  const onVisibility = () => { quietUntil = performance.now() + 5000; };
  document.addEventListener('visibilitychange', onVisibility);

  function setStatus(patch) {
    let changed = false;
    for (const k of Object.keys(patch)) {
      if (k === 'drift') { status.drift = patch.drift; continue; }
      if (status[k] !== patch[k]) { status[k] = patch[k]; changed = true; }
    }
    if (changed && onStatus) onStatus({ ...status });
  }

  function seek(pos, now) {
    setRate(0);
    player.seek(pos);
    lastSeek = now;
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
    player.unmute();
    if (fromUser) player.play();
    setStatus({ muted: false, unmuteBlocked: false });
    clearTimeout(unmuteTimer);
    unmuteTimer = setTimeout(() => {
      if (stopped) return;
      const st = player.state();
      const tgt = target(player.duration());
      const stalled = st === YT_STATE.PAUSED || st === YT_STATE.UNSTARTED || st === YT_STATE.CUED;
      // 브라우저가 막는 방식은 두 가지다: 영상을 멈춰 버리거나, 소리 켜기 자체를 무시하거나.
      if (tgt.phase === 'playing' && (stalled || player.isMuted())) {
        player.mute();
        player.play();
        setStatus({ muted: true, unmuteBlocked: !!fromUser });
      }
    }, UNMUTE_CHECK_MS);
  }

  function tick() {
    if (stopped || !player.isReady) return;
    const now = performance.now();
    const dur = player.duration();
    const tgt = target(dur);
    const st = player.state();
    const live = player.isLive();
    const playing = st === YT_STATE.PLAYING;
    if (playing) { everPlayed = true; notPlayingSince = 0; } else if (!notPlayingSince) notPlayingSince = now;

    if (tgt.phase === 'ended' || (st === YT_STATE.ENDED && dur > 0 && tgt.pos > dur - 3)) {
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
    // 쉬는 시간이 끝난 순간에는 모두가 정확히 같은 곳에서 다시 출발한다
    if (lastPhase === 'paused' && !live) seek(tgt.pos + SEEK_LEAD, now);
    lastPhase = 'playing';

    if (playing) {
      stallSince = 0;
      if (!soundTried) {
        if (autoUnmute) { tryUnmute(false); return; }   // 결과는 다음 박자에 본다 (막혔다면 그 사이 음소거로 되돌아간다)
        soundTried = true;
      }
      // 관객이 영상 안에서 직접 소리를 켰다면 그대로 따른다
      const mutedNow = player.isMuted();
      const drift = live ? 0 : player.time() - tgt.pos;
      if (!live) {
        const abs = Math.abs(drift);
        if (abs < NUDGE_FROM) inSyncAt = now;
        if (abs > SEEK_FROM) {
          if (now - lastSeek > SEEK_COOLDOWN) {
            // 방금까지 잘 맞다가 갑자기 크게 벌어졌다면 관객이 직접 넘긴 것
            if (inSyncAt && now - inSyncAt < 1600 && now > quietUntil && onUserMeddle) onUserMeddle('seek');
            seek(tgt.pos + SEEK_LEAD, now);
          }
        } else if (nudge !== 0) {
          const caughtUp = abs < NUDGE_DONE || (nudge > 0 && drift > 0) || (nudge < 0 && drift < 0);
          if (caughtUp || now - nudgeAt > NUDGE_MAX_MS) setRate(0);
        } else if (abs > NUDGE_FROM && now - lastSeek > SEEK_COOLDOWN) {
          setRate(drift > 0 ? -1 : 1);
        }
      }
      setStatus({ playing: true, needTap: false, live, muted: mutedNow, catching: !live && Math.abs(drift) > SEEK_FROM, drift });
      return;
    }

    setRate(0);
    if (st === YT_STATE.BUFFERING) {
      if (!stallSince) stallSince = now;
      if (!live && now - stallSince > STALL_LIMIT && now - lastSeek > SEEK_COOLDOWN) { seek(tgt.pos + SEEK_LEAD, now); stallSince = now; }
      setStatus({ playing: false, live });
      return;
    }

    // 멈춰 있음: 아직 시작 전(-1/5, 광고일 수도 있음)이거나 누군가 멈춤(2).
    if (st === YT_STATE.PAUSED && everPlayed) {
      if (onUserMeddle && now > quietUntil && notPlayingSince && now - notPlayingSince < TICK_MS * 2.5) onUserMeddle('pause');
      if (!live && Math.abs(player.time() - tgt.pos) > SEEK_FROM && now - lastSeek > SEEK_COOLDOWN) seek(tgt.pos + SEEK_LEAD, now);
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
