// 방 시계. 서버가 없으니 "모두가 같은 시각이라고 믿는 값"을 직접 만든다.
//
// 1순위: 이 사이트를 내려주는 서버의 HTTP Date 헤더. 초 단위로 잘려 있지만,
//        짧은 간격으로 여러 번 물어 "초가 넘어가는 순간"을 잡으면 0.1초 안팎으로 맞출 수 있다.
//        모든 기기가 같은 서버에 맞추므로 기기 시계가 몇 분 틀려도 서로 어긋나지 않는다.
// 2순위: 서버에 물어볼 수 없으면, 방 안에서 서로 ping/pong 으로 시계 차이를 재고
//        "모두의 시계의 중앙값"을 방 시각으로 쓴다 (각자 계산해도 같은 값이 나온다).
//
// 상영 위치 = 방 시각 − 상영 시작 시각 이라서, 이 시계만 맞으면 영상은 통신 없이도 같이 흘러간다.
import { sleep } from './util.js';

const PEER_OFFSET_LIMIT = 5000;      // 이보다 큰 차이는 고장난 시계로 보고 중앙값 계산에서 뺀다
const SAMPLES_PER_PEER = 6;
const PROBES = 10;
const PROBE_GAP = 140;

export function createClock() {
  let base = 0;                       // 서버 기준 보정값(ms)
  let serverSynced = false;
  /** @type {Map<string, {offset:number, rtt:number}[]>} */
  const samples = new Map();
  let roomOffset = 0;

  const local = () => Date.now() + base;

  function recompute() {
    const offs = [0];
    for (const list of samples.values()) {
      if (!list.length) continue;
      // 왕복 시간이 가장 짧았던 측정이 가장 믿을 만하다
      const best = list.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      if (Math.abs(best.offset) <= PEER_OFFSET_LIMIT) offs.push(best.offset);
    }
    offs.sort((a, b) => a - b);
    const mid = offs.length >> 1;
    roomOffset = offs.length % 2 ? offs[mid] : (offs[mid - 1] + offs[mid]) / 2;
  }

  return {
    /** 내 보정 시계(ms). ping/pong 에는 이 값을 실어 보낸다. */
    local,
    /** 방 시각(ms). 상영 위치 계산에는 항상 이 값을 쓴다. */
    now: () => local() + (serverSynced ? 0 : roomOffset),
    get base() { return base; },
    get serverSynced() { return serverSynced; },
    get roomOffset() { return roomOffset; },

    /**
     * pong 을 받았을 때 호출. t0 = 내가 ping 보낸 시각(local), t1 = 상대가 답한 시각(상대 local), t2 = 내가 받은 시각(local)
     */
    addSample(peerId, t0, t1, t2) {
      const rtt = t2 - t0;
      if (!(rtt >= 0) || rtt > 8000 || !Number.isFinite(t1)) return;
      const offset = t1 - (t0 + t2) / 2;
      let list = samples.get(peerId);
      if (!list) samples.set(peerId, (list = []));
      list.push({ offset, rtt });
      if (list.length > SAMPLES_PER_PEER) list.shift();
      recompute();
    },

    dropPeer(peerId) {
      if (samples.delete(peerId)) recompute();
    },

    /**
     * 서버 Date 헤더에 시계를 맞춘다. 실패하면 false (그때는 방 안의 중앙값을 쓴다).
     * @param {string} [url] 같은 출처의 아무 주소
     */
    async syncWithServer(url) {
      try {
        const target = new URL(url || location.href);
        target.hash = '';
        let prev = null;                 // 직전 측정 { mid: 요청 한가운데의 기기 시각, date: 서버가 답한 초 }
        let coarse = null;
        for (let i = 0; i < PROBES; i++) {
          target.searchParams.set('_t', `${Date.now()}${i}`);   // CDN 캐시를 피해 방금 만든 응답의 Date 를 받는다
          const p0 = performance.now();
          const w0 = Date.now();
          const res = await fetch(target, { method: 'HEAD', cache: 'no-store' });
          const rtt = performance.now() - p0;
          const date = Date.parse(res.headers.get('date') || '');
          if (!Number.isFinite(date)) return false;
          if (rtt > 1500) { prev = null; continue; }             // 너무 느린 응답은 기준으로 쓰지 않는다
          const mid = w0 + rtt / 2;
          coarse = date + 500 - mid;                              // 초 단위 어림값 (±0.5초)
          if (prev && date - prev.date === 1000) {
            // prev.mid 와 mid 사이에서 서버의 초가 넘어갔다 → 그 순간의 서버 시각은 정확히 date
            base = date - (prev.mid + mid) / 2;
            serverSynced = true;
            return true;
          }
          prev = { mid, date };
          await sleep(Math.max(0, PROBE_GAP - rtt));
        }
        // 초가 넘어가는 순간을 못 잡았다. 기기 시계가 크게 틀렸을 때만 어림값으로 바로잡는다.
        if (coarse != null && Math.abs(coarse) > 2000) base = coarse;
        return false;
      } catch { return false; }
    },
  };
}
