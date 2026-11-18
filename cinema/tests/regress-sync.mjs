// 동기화·유튜브 쪽 되돌이 점검 (리뷰에서 나온 결함이 다시 생기지 않는지).
// 실행: (cinema/tests 에서) node regress-sync.mjs [그룹 이름 일부]
//
// e2e.mjs 와 같은 도구(harness.mjs)를 쓴다: 가짜 유튜브 플레이어(mock-yt.js) + 로컬 MQTT 브로커.
// 여기서는 가짜 플레이어를 일부러 느리게·막히게·라이브로 만들어 "우리 엔진이 어떻게 반응하는가"를 본다.
import { chromium, startStatic, startBroker, spawn, wire, watchErrors, createInvite, enter, toHall, until, reporter, assert, sleep } from './harness.mjs';

const only = process.argv[2] || '';
const site = await startStatic();
const broker = await startBroker();
const browser = await chromium.launch();
const errors = [];
const rep = reporter();
const base = `${site.url}index.html?brokers=${encodeURIComponent(broker.url)}`;
const ctxs = [];
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SCOLD = /넘겨 볼 수 없어요|멈출 수 없어요/;      // 관객을 나무라는 두 가지 토스트

/** 페이지 안에서 돈다: 토스트를 모두 적어 두고, 플레이어마다 언제 만들어져 무엇을 보여 줬는지 기록한다 */
function recorder() {
  window.__toasts = [];
  const watch = () => {
    const root = document.getElementById('toast-root');
    if (!root) return setTimeout(watch, 20);
    new MutationObserver(() => { const t = root.textContent; if (t) window.__toasts.push({ at: Math.round(performance.now()), text: t }); }).observe(root, { childList: true, subtree: true });
  };
  watch();
  window.__trk = [];
  setInterval(() => {
    const r = window.__dsy && window.__dsy.room;
    if (!r) return;
    const roomPos = (r.now() - r.ctl.at) / 1000;                 // 상영 시각 기준 지금 위치(초). 음수면 시작 전
    if (window.__curtainAt == null && document.querySelector('.curtain.open')) window.__curtainAt = roomPos;
    (window.__ytPlayers || []).forEach((p, i) => {
      let t = window.__trk[i];
      if (!t) t = window.__trk[i] = { createdAt: roomPos, start: p.vars.start, firstPlayAt: null, firstFilm: null, shown: {} };
      if (p.state !== 1 || p.destroyed) return;
      const film = p.getCurrentTime();
      if (t.firstPlayAt == null) { t.firstPlayAt = roomPos; t.firstFilm = film; }
      t.shown[Math.floor(film * 2) / 2] = 1;                     // 화면에 나온 필름 구간 (0.5초 단위)
    });
  }, 20);
}

/** 관객 한 명. userAgent 를 주면 그 브라우저인 척한다 (iOS 는 자동으로 소리를 켜지 않는다). */
async function person(name, { ytMock = {}, userAgent, init, ...opts } = {}) {
  let ctx, page;
  if (userAgent) {
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', userAgent });
    await wire(ctx, { ytMock });
    await ctx.addInitScript((n) => { if (!localStorage.getItem('dsy.me')) localStorage.setItem('dsy.me', JSON.stringify({ device: 'dev-' + n, name: n, av: [0, 0, 0, 0] })); }, name);
    page = await ctx.newPage();
    watchErrors(page, errors, name);
  } else {
    ({ ctx, page } = await spawn(browser, { name, errors, ytMock, ...opts }));
  }
  await ctx.addInitScript(recorder);
  if (init) await ctx.addInitScript(init);
  ctxs.push(ctx);
  return page;
}
async function cleanup() { while (ctxs.length) await ctxs.pop().close().catch(() => {}); }
const group = async (name, fn) => {
  if (only && !name.includes(only)) return;
  console.log(`\n■ ${name}`);
  try { await fn(); } catch (e) { await rep.check(`${name} (예기치 못한 오류)`, () => { throw e; }); }
  await cleanup();
};

/** 약속을 만들고 상영관까지 들어간다 (이미 상영 중이면 로비를 건너뛴다) */
async function open(page, { inMs, dur = 120 }) {
  await page.goto(base);
  await page.waitForSelector('.home');
  const code = await createInvite(page, { inMs, dur });
  await enter(page, base, code);
  await toHall(page);
  return code;
}

/** 살아 있는 플레이어와 지금까지 만들어진 플레이어 수 */
const look = (page) => page.evaluate(() => {
  const all = window.__ytPlayers || [];
  const p = all.filter((x) => !x.destroyed).pop();
  const r = window.__dsy.room;
  const out = { created: all.length, state: null };
  if (p) Object.assign(out, { state: p.state, t: p.getCurrentTime(), muted: p.muted, rate: p.rate, volume: p.volume, volumeSets: p.volumeSets, playCalls: p.playCalls, drift: p.getCurrentTime() - (r.now() - r.ctl.at) / 1000 });
  return out;
});
/** 스크린 자리에 무엇이 있는지 */
const view = (page) => page.evaluate(() => {
  const c = document.querySelector('.screen-card');
  return {
    card: !c || c.hidden ? '' : (c.firstElementChild ? c.firstElementChild.className : '(empty)'),
    frames: document.querySelectorAll('.mock-yt').length,
    strip: (document.querySelector('.hall-strip') || {}).textContent || '',
    sub: (document.querySelector('.room-sub') || {}).textContent || '',
  };
});
const toasts = (page, from = 0) => page.evaluate((from) => window.__toasts.slice(from), from);
const scolds = async (page, from = 0) => (await toasts(page, from)).filter((t) => SCOLD.test(t.text));
const ytLog = (page) => page.evaluate(() => (window.__ytLog || []).slice());
const track = (page) => page.evaluate(() => ({ curtainAt: window.__curtainAt == null ? null : window.__curtainAt, players: window.__trk.map((t) => ({ ...t, shown: Object.keys(t.shown).map(Number).sort((a, b) => a - b) })) }));
/** 살아 있는 가짜 플레이어에 fn 을 돌린다 (관객이 유튜브 컨트롤을 직접 만지는 흉내) */
const livePlayer = (page, fn) => page.evaluate(`(${fn})((window.__ytPlayers || []).filter((x) => !x.destroyed).pop())`);
/** 영사실에서 버튼 하나를 누른다 */
async function booth(page, label) {
  await page.click('.booth-btn');
  await page.locator('.sheet-wrap.open .sheet .btn-block', { hasText: label }).click();
}
/** ms 동안 스트립 문구를 40ms 마다 본다 → 본 문구들(중복 없이) */
async function watchStrip(page, ms) {
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { seen.add(await page.textContent('.hall-strip')); await sleep(40); }
  return Array.from(seen);
}

// ------------------------------------------------------------------
await group('끝과 라이브', async () => {
  await rep.check('링크에 길이가 없어도(0) 끝나면 크레딧에 머문다 — 플레이어를 다시 만들지 않는다', async () => {
    const a = await person('길이 모름', { ytMock: { duration: 5 } });
    await open(a, { inMs: -1000, dur: 0 });
    await a.waitForSelector('.end', { timeout: 15000 });
    await sleep(3000);                                           // 예전에는 0.5초마다 크레딧 ↔ 새 플레이어를 오갔다
    const [v, p] = [await view(a), await look(a)];
    assert(p.created === 1, `${p.created} players were created`);
    assert(v.card === 'end' && v.frames === 0, 'not on the credits: ' + JSON.stringify(v));
    assert(v.sub === '상영 종료', 'top bar says: ' + v.sub);
    assert((await a.locator('.hall-strip .btn-primary').count()) === 1, 'no souvenir button for someone who watched');
  });

  await rep.check('라이브: 방송이 약속 시각보다 늦게 시작했어도 끝난 것으로 치지 않고 계속 본다', async () => {
    // 약속은 60초 전, 방송은 방금 시작 → getDuration()(방송 경과 시간) < 상영 위치. 길이로 믿으면 "끝"이 된다.
    const a = await person('라이브', { ytMock: { live: true } });
    await open(a, { inMs: -60000, dur: 0 });
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(5000);
    const [v, p] = [await view(a), await look(a)];
    assert(p.created === 1 && p.state === 1, 'live player not left alone: ' + JSON.stringify(p));
    assert(v.card === '' && v.strip.includes('LIVE'), 'not showing the live stream: ' + JSON.stringify(v));
    assert((await ytLog(a)).filter((e) => e[1] === 'seekTo').length === 0, 'the engine tried to seek a live stream');
  });

  await rep.check('라이브: 방송이 끝나면(플레이어가 ENDED) 크레딧으로 가서 머문다', async () => {
    const a = await person('라이브 끝', { ytMock: { live: true, streamStartedAgo: 1200 } });
    await open(a, { inMs: -30000, dur: 0 });
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(2500);
    await livePlayer(a, (p) => p._set(0));
    await a.waitForSelector('.end', { timeout: 4000 });
    await sleep(2500);
    const [v, p] = [await view(a), await look(a)];
    assert(p.created === 1 && v.card === 'end', `after the stream ended: ${p.created} players, card=${v.card}`);
    assert(v.sub === '상영 종료', 'top bar says: ' + v.sub);
  });
});

// ------------------------------------------------------------------
await group('정시 시작', async () => {
  await rep.check('정시에 앉아 있던 관객: 커튼은 상영 전에 열리고, 플레이어는 정시에 0초부터 걸린다', async () => {
    const a = await person('정시 관객');
    await open(a, { inMs: 9000 });
    await a.waitForSelector('.mock-yt', { timeout: 20000 });
    await sleep(2000);
    const t = await track(a);
    const p = t.players[0];
    assert(t.curtainAt != null && t.curtainAt < -0.3 && t.curtainAt > -3, `curtain opened at room position ${t.curtainAt}s`);
    assert(p.start === 0, `player created with start=${p.start}`);
    assert(p.createdAt > -0.3 && p.createdAt < 0.6, `player created at room position ${p.createdAt.toFixed(2)}s`);
    assert(p.firstFilm < 0.4 && p.firstPlayAt < 0.8, `first frame shown: film ${p.firstFilm.toFixed(2)}s at room position ${p.firstPlayAt.toFixed(2)}s`);
    assert(t.players.length === 1, `${t.players.length} players created`);
  });

  await rep.check('플레이어가 뜨는 데 1.8초 걸려도 첫 장면을 건너뛰지 않고 빠르게 감아 따라잡는다', async () => {
    const a = await person('느린 정시 관객', { ytMock: { loadDelay: 1200, startDelay: 600 } });
    await open(a, { inMs: 9000 });
    await a.waitForSelector('.mock-yt', { timeout: 20000 });
    await sleep(11500);
    const [t, p, log] = [await track(a), await look(a), await ytLog(a)];
    const shown = t.players[0].shown.filter((s) => s < 4);
    assert(log.filter((e) => e[1] === 'seekTo').length === 0, 'the engine skipped ahead: ' + JSON.stringify(log.filter((e) => e[1] === 'seekTo')));
    assert(shown.length === 8, 'film seconds 0-4 that were actually shown: ' + shown.join(','));
    assert(Math.abs(p.drift) < 0.6 && p.rate === 1, `not caught up: drift ${p.drift.toFixed(2)}s at x${p.rate}`);
    assert((await scolds(a)).length === 0, 'scolded: ' + JSON.stringify(await scolds(a)));
  });

  await rep.check('커튼이 열리는 사이 상영을 미루면 커튼이 다시 닫히고, 플레이어는 걸리지 않는다', async () => {
    const a = await person('미루는 영사기사');
    await open(a, { inMs: 9000 });
    await a.waitForSelector('.curtain.open', { timeout: 20000 });
    await a.evaluate(() => { const r = window.__dsy.room; return r.setCtl({ at: r.ctl.at + 5 * 60000 }); });   // [5분 미루기]와 같은 변경
    const t0 = Date.now();
    let most = 0;
    while (Date.now() - t0 < 3000) { most = Math.max(most, (await look(a)).created, (await view(a)).frames); await sleep(30); }
    const v = await view(a);
    assert(most === 0, 'a player was created during the countdown');
    assert(v.card === 'pre' && (await a.locator('.curtain.open').count()) === 0, 'curtain not closed again: ' + JSON.stringify(v));
    assert(v.sub.startsWith('상영까지 4:5'), 'top bar says: ' + v.sub);
  });

  await rep.check('늦게 들어오면 조금 앞에서 걸어, 불러온 뒤에 건너뛰지 않고 맞춘다', async () => {
    const a = await person('지각생', { ytMock: { loadDelay: 700 } });
    await open(a, { inMs: -30000 });
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(6000);
    const [t, p, log] = [await track(a), await look(a), await ytLog(a)];
    const ahead = t.players[0].start - t.players[0].createdAt;
    assert(ahead > -0.1 && ahead < 1.2, `start is ${ahead.toFixed(2)}s ahead of the room position`);
    assert(log.filter((e) => e[1] === 'seekTo').length === 0, 'needed a seek after loading');
    assert(p.state === 1 && Math.abs(p.drift) < 0.7, `drift ${p.drift.toFixed(2)}s`);
  });
});

// ------------------------------------------------------------------
await group('느린 회선', async () => {
  await rep.check('건너뛸 때마다 2.2초씩 버퍼링해도 건너뛰기를 되풀이하지 않고, 다음에는 그만큼 앞을 겨냥한다', async () => {
    const a = await person('느린 회선', { ytMock: { seekDelay: 2200, duration: 600 } });
    await open(a, { inMs: -60000, dur: 600 });
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(4500);
    const engineSeeks = async () => (await ytLog(a)).filter((e) => e[1] === 'seekTo').length;
    // 관객이 20초 되감는다 → 엔진이 한 번 건너뛰고(2.2초 버퍼링) 1.9초쯤 뒤처진 채 재생된다.
    // 예전에는 여기서 3.5초마다 다시 건너뛰기를 끝없이 되풀이했다.
    await livePlayer(a, (p) => p.seekTo(p.getCurrentTime() - 20));
    await sleep(17000);
    let p = await look(a);
    assert((await engineSeeks()) === 2, `seekTo calls (1 by the viewer + by the engine): ${await engineSeeks()}`);
    assert(p.state === 1 && Math.abs(p.drift) < 0.6 && p.rate === 1, `not converged: drift ${p.drift.toFixed(2)}s, x${p.rate}, state ${p.state}`);
    // 두 번째: 이제 다시 재생되기까지 2.2초가 걸린다는 걸 안다 → 그만큼 앞을 겨냥해 한 번에 맞는다
    const mark = (await ytLog(a)).length;
    await livePlayer(a, (p) => p.seekTo(p.getCurrentTime() - 20));
    await sleep(7500);
    p = await look(a);
    const after = (await ytLog(a)).slice(mark);
    assert(after.filter((e) => e[1] === 'seekTo').length === 2, 'second round seeks: ' + JSON.stringify(after.filter((e) => e[1] === 'seekTo')));
    assert(!after.some((e) => e[1] === 'rate' && e[2] !== 1), 'still needed a speed-up after the second seek');
    assert(p.state === 1 && Math.abs(p.drift) < 0.6, `second round drift ${p.drift.toFixed(2)}s`);
  });
});

// ------------------------------------------------------------------
await group('꾸중과 안내', async () => {
  const plain = await person('보통 관객');
  const blocked = await person('소리 막힌 관객', { ytMock: { blockUnmute: true } });
  const ios = await person('아이폰 관객', { userAgent: IOS_UA, ytMock: { unmutePauses: true } });

  await rep.check('로비 → 상영관: 아무것도 건드리지 않으면 나무라는 토스트가 없다 (소리 켜기가 막혀 영상이 멈추는 브라우저 포함)', async () => {
    await Promise.all([plain, blocked].map(async (pg) => {
      await open(pg, { inMs: 9000 });
      await pg.waitForSelector('.mock-yt', { timeout: 20000 });
    }));
    await sleep(5000);
    for (const pg of [plain, blocked]) assert((await scolds(pg)).length === 0, 'scolded: ' + JSON.stringify(await toasts(pg)));
    const [p, b] = [await look(plain), await look(blocked)];
    assert(p.state === 1 && !p.muted, 'plain viewer: ' + JSON.stringify(p));
    assert(b.state === 1 && b.muted && (await blocked.locator('.sound-btn').count()) === 1, 'blocked viewer should play muted with a sound button: ' + JSON.stringify(b));
    const log = await ytLog(blocked);
    const un = log.find((e) => e[1] === 'unMute'), re = log.find((e) => e[1] === 'mute' && e[0] >= un[0]);
    assert(re && re[0] - un[0] < 900, `muted again ${re ? re[0] - un[0] : '∞'}ms after the blocked unmute`);
  });

  await rep.check('iOS: [소리 켜기]가 막혀 영상이 멈춰도 나무라지 않고, 영상 안의 음소거 해제를 누르라고만 안내한다', async () => {
    await open(ios, { inMs: 8000 });
    await ios.waitForSelector('.sound-btn', { timeout: 25000 });
    await sleep(2500);
    await ios.click('.sound-btn');
    await until(async () => (await ios.textContent('.hall-strip')).includes('직접 눌러'), { timeout: 4000, what: 'tap-the-player hint' });
    await sleep(1500);
    const p = await look(ios);
    assert((await scolds(ios)).length === 0, 'scolded: ' + JSON.stringify(await scolds(ios)));
    assert(p.state === 1 && p.muted, 'should be back to muted playback: ' + JSON.stringify(p));
  });

  await rep.check('정말로 멈추거나 넘기면 여전히 알려 주고 제자리로 돌린다', async () => {
    let from = (await toasts(plain)).length;
    await livePlayer(plain, (p) => p.pauseVideo());
    await until(async () => (await toasts(plain, from)).some((t) => t.text.includes('멈출 수 없어요')), { timeout: 3000, what: 'pause toast' });
    await until(async () => (await look(plain)).state === 1, { timeout: 3000, what: 'playback resumed' });
    await sleep(6300);                                           // 같은 안내는 6초에 한 번만
    from = (await toasts(plain)).length;
    await livePlayer(plain, (p) => p.seekTo(p.getCurrentTime() - 20));
    await until(async () => (await toasts(plain, from)).some((t) => t.text.includes('넘겨 볼 수 없어요')), { timeout: 4000, what: 'seek toast' });
    await until(async () => Math.abs((await look(plain)).drift) < 0.9, { timeout: 6000, what: 'resync after the scrub' });
  });

  await rep.check('방금 연 페이지(6초 미만)에서도 멈추면 바로 알려 준다', async () => {
    // 새로고침하면 자동으로 다시 들어온다. iOS 는 소리를 자동으로 켜지 않으니 재생 2초 뒤면 안내가 살아 있다.
    await ios.reload();
    await ios.waitForSelector('.mock-yt', { timeout: 15000 });
    await ios.evaluate(() => new Promise((done) => {
      const iv = setInterval(() => {
        const p = (window.__ytPlayers || []).filter((x) => !x.destroyed).pop();
        if (!p || p.state !== 1) return;
        clearInterval(iv);
        setTimeout(() => { p.pauseVideo(); done(); }, 2300);
      }, 20);
    }));
    const t = await until(async () => (await scolds(ios))[0], { timeout: 3000, what: 'pause toast on a young page' });
    assert(t.text.includes('멈출 수 없어요'), 'wrong toast: ' + t.text);
    // 예전 코드는 페이지 나이 6초 전의 안내를 모두 삼켰다. 느린 기계에서 6초를 넘겼다면 이 실행은 그 점을 증명하지 못한 것.
    if (t.at >= 6000) console.log(`        (참고: 토스트가 페이지 나이 ${t.at}ms 에 떠서, 이번 실행은 "6초 안에도 뜬다"를 확인하지 못했다)`);
  });

  await rep.check('버퍼링이나 멈춘 화면(광고)으로 뒤처진 것을 "넘겼다"고 나무라지 않는다', async () => {
    const cases = [
      ['1.4초 버퍼링', { stallAt: 50, stallMs: 1400 }, -40000],
      ['1.4초 버퍼링(박자 어긋남)', { stallAt: 50, stallMs: 1400 }, -40170],
      ['5초 동안 재생 중인데 시간이 멈춤', { freezeAt: 50, freezeMs: 5000 }, -40000],
    ];
    const res = await Promise.all(cases.map(async ([label, mock, inMs]) => {
      const pg = await person(label, { ytMock: { duration: 300, ...mock } });
      await open(pg, { inMs, dur: 300 });
      await pg.waitForSelector('.mock-yt', { timeout: 10000 });
      await sleep(17000);
      const hit = (await ytLog(pg)).some((e) => e[1] === 'freeze' || (e[1] === 'state' && e[2] === 3));
      return { label, hit, scolds: await scolds(pg), p: await look(pg) };
    }));
    for (const r of res) {
      assert(r.hit, `${r.label}: the stall never happened (test setup)`);
      assert(r.scolds.length === 0, `${r.label}: scolded ${JSON.stringify(r.scolds)}`);
      assert(r.p.state === 1 && Math.abs(r.p.drift) < 0.9, `${r.label}: did not recover, drift ${r.p.drift.toFixed(2)}s`);
    }
  });

  await rep.check('쉬는 시간: 안내 문구가 자연스럽고, 다시 상영할 때 "눌러 주세요"나 꾸중이 뜨지 않는다', async () => {
    const host = await person('영사기사', { ytMock: { playDelay: 1500, duration: 600 } });
    await open(host, { inMs: -30000, dur: 600 });
    await host.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(3500);
    await booth(host, '쉬는 시간');
    await until(async () => (await host.textContent('.hall-strip')).includes('쉬어 갑니다'), { timeout: 4000, what: 'intermission strip' });
    const strip = await host.textContent('.hall-strip');
    assert(strip.includes('길어도 10분 안에 이어져요') && /남은 시간 (10:00|9:\d\d)/.test(strip) && !strip.includes('뒤엔'), 'intermission copy: ' + strip);
    await sleep(7000);                                           // "재생이 안 된다"고 보는 5초보다 길게 쉰다
    const from = (await toasts(host)).length;
    await booth(host, '다시 상영');
    const seen = await watchStrip(host, 5500);
    assert(!seen.some((s) => s.includes('한 번 눌러')), 'need-tap warning after the intermission: ' + JSON.stringify(seen));
    assert((await scolds(host, from)).length === 0, 'scolded after the intermission: ' + JSON.stringify(await scolds(host, from)));
    assert((await look(host)).state === 1, 'not playing again');
  });

  await rep.check('화면이 가려진 동안 멈춘 영상을 억지로 다시 틀지 않고, 돌아오면 안내 없이 이어 간다', async () => {
    const a = await person('다른 앱 다녀오는 관객', { ytMock: { playDelay: 1200, duration: 600 } });
    await open(a, { inMs: -30000, dur: 600 });
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(3500);
    const setHidden = (hidden) => a.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      if (hidden) window.__ytPlayers.filter((p) => !p.destroyed).pop().pauseVideo();     // 가려진 페이지의 영상은 브라우저가 멈춘다
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await setHidden(true);
    const before = (await look(a)).playCalls;
    await sleep(2000);
    let p = await look(a);
    assert(p.playCalls === before && p.state === 2, `playVideo() called ${p.playCalls - before} times while hidden (state ${p.state})`);
    await sleep(4500);                                           // 모두 6.5초 가려져 있었다
    const from = (await toasts(a)).length;
    await setHidden(false);
    const seen = await watchStrip(a, 4000);
    assert(!seen.some((s) => s.includes('한 번 눌러')), 'need-tap warning after returning: ' + JSON.stringify(seen));
    await sleep(3500);
    p = await look(a);
    assert(p.state === 1 && Math.abs(p.drift) < 0.9, `after returning: state ${p.state}, drift ${p.drift.toFixed(2)}s`);
    assert((await scolds(a, from)).length === 0, 'scolded after returning: ' + JSON.stringify(await scolds(a, from)));
  });

  await rep.check('다른 탭에 가 있는 사이 쉬는 시간이 끝나도 영상은 다시 재생된다 (소리로 듣는 관객)', async () => {
    const host = await person('다른 탭의 영사기사', { ytMock: { duration: 600 } });
    await open(host, { inMs: -60000, dur: 600 });
    await host.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(3000);
    await booth(host, '쉬는 시간');
    await until(async () => (await look(host)).state === 2, { timeout: 5000, what: 'paused for the intermission' });
    // 데스크톱의 뒤쪽 탭: 페이지는 가려졌지만 브라우저가 영상을 건드리지는 않는다
    await host.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(1500);
    await host.evaluate(async () => { const R = await import('./js/room.js'); const r = window.__dsy.room; await r.setCtl(R.resumePatch(r.ctl, r.now())); });
    await until(async () => (await look(host)).state === 1, { timeout: 6000, what: 'playing again while the tab is hidden' });
  });
});

// ------------------------------------------------------------------
await group('영사실', async () => {
  const host = await person('영사기사', { ytMock: { duration: 3600 } });
  await open(host, { inMs: -120000, dur: 3600 });
  await host.waitForSelector('.mock-yt', { timeout: 10000 });
  await sleep(2500);
  const pos = () => host.evaluate(async () => { const R = await import('./js/room.js'); const r = window.__dsy.room; const p = R.showPosition(r.ctl, r.now(), 3600); return { phase: p.phase, pos: p.pos, rev: r.ctl.rev }; });
  const items = () => host.locator('.sheet-wrap.open .sheet .btn-block').allTextContents();
  const skipClock = (ms) => host.evaluate((ms) => { const real = Date.now.bind(Date); Date.now = () => real() + ms; }, ms);

  await rep.check('열어 둔 사이 쉬는 시간이 저절로 끝났다면, 낡은 [다시 상영]은 아무것도 바꾸지 않는다', async () => {
    await booth(host, '쉬는 시간');
    await until(async () => (await pos()).phase === 'paused', { timeout: 4000, what: 'pause' });
    const paused = await pos();
    await host.click('.booth-btn');
    await until(async () => (await items()).join('|') === '다시 상영', { timeout: 3000, what: 'booth offering resume' });
    // 11분이 흘러 쉬는 시간이 저절로 끝난 바로 그 순간(시트가 다시 그려지기 전)에 낡은 버튼을 누른다
    const from = (await toasts(host)).length;
    await host.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 11 * 60000; document.querySelector('.sheet-wrap.open .sheet .btn-block').click(); });
    await sleep(1200);
    const now = await pos();
    assert((await toasts(host, from)).some((t) => t.text.includes('상황이 바뀌었어요')), 'no notice: ' + JSON.stringify(await toasts(host, from)));
    assert(now.rev === paused.rev, `ctl changed by a stale button (rev ${paused.rev} → ${now.rev})`);
    assert(now.phase === 'playing' && now.pos > paused.pos + 55, `viewers were rewound: ${paused.pos.toFixed(1)}s → ${now.pos.toFixed(1)}s`);
  });

  await rep.check('열어 둔 사이 상황이 바뀌면 영사실 버튼이 지금에 맞게 다시 만들어진다', async () => {
    await host.click('.booth-btn');
    await until(async () => (await items()).some((t) => t.includes('쉬는 시간 주기')), { timeout: 3000, what: 'booth offering a pause' });
    await skipClock(2 * 3600000);                                // 영화가 끝날 만큼 시간이 흐른다
    await until(async () => { const it = await items(); return it.length === 1 && it[0].includes('한 번 더 상영'); }, { timeout: 4000, what: 'booth rebuilt for the ended show' });
    assert((await view(host)).card === 'end', 'not on the credits');
  });

  await rep.check('영사실 버튼을 연달아 눌러도 한 번만 바뀐다', async () => {
    const before = (await pos()).rev;
    await host.evaluate(() => { const b = document.querySelector('.sheet-wrap.open .sheet .btn-block'); b.click(); b.click(); });
    await sleep(1000);
    const now = await pos();
    assert(now.rev === before + 1, `ctl changed ${now.rev - before} times`);
    assert(now.phase === 'before', 'the show was not scheduled again: ' + JSON.stringify(now));
  });
});

// ------------------------------------------------------------------
await group('화면 켜 두기', async () => {
  // 세는 가짜 wakeLock. __wakeDelay(ms) 를 주면 요청이 그만큼 늦게 풀린다.
  const wakeStub = () => {
    window.__wake = { requests: 0, releases: 0, active: 0 };
    const request = () => new Promise((resolve) => {
      window.__wake.requests++;
      setTimeout(() => {
        let released = false;
        window.__wake.active++;
        resolve({ get released() { return released; }, release: async () => { if (released) return; released = true; window.__wake.releases++; window.__wake.active--; } });
      }, window.__wakeDelay || 0);
    });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  };
  const wake = (page) => page.evaluate(() => ({ ...window.__wake }));

  await rep.check('상영 3시간 전에는 화면을 켜 두지 않는다', async () => {
    const a = await person('일찍 온 관객', { init: wakeStub });
    await open(a, { inMs: 3 * 3600000 });
    await a.waitForSelector('.pre');
    await sleep(2500);
    const w = await wake(a);
    assert(w.requests === 0, 'wake lock requested hours before showtime: ' + JSON.stringify(w));
  });

  await rep.check('상영 직전부터 상영 중에는 켜 두고, 크레딧이 올라가면 놓는다', async () => {
    const a = await person('관객', { init: wakeStub, ytMock: { duration: 6 } });
    await open(a, { inMs: 9000, dur: 6 });
    await until(async () => (await wake(a)).active === 1, { timeout: 5000, what: 'wake lock before showtime' });
    await a.waitForSelector('.mock-yt', { timeout: 20000 });
    await sleep(2000);
    let w = await wake(a);
    assert(w.active === 1 && w.requests === 1, 'during the show: ' + JSON.stringify(w));
    await a.waitForSelector('.end', { timeout: 15000 });
    await sleep(800);
    w = await wake(a);
    assert(w.active === 0 && w.releases === w.requests, 'after the end: ' + JSON.stringify(w));
  });

  await rep.check('요청이 풀리기 전에 상영관을 나가면, 늦게 받은 잠금을 바로 놓는다', async () => {
    const a = await person('금방 나가는 관객', { init: () => { window.__wakeDelay = 1500; } });
    await a.addInitScript(wakeStub);
    await open(a, { inMs: -3000 });
    await until(async () => (await wake(a)).requests === 1, { timeout: 8000, what: 'wake lock request' });
    await a.click('.room-top .icon-btn');
    await a.waitForSelector('.room.lobby');
    await sleep(2200);
    const w = await wake(a);
    assert(w.requests === 1 && w.active === 0 && w.releases === 1, 'a late wake lock leaked: ' + JSON.stringify(w));
  });
});

// ------------------------------------------------------------------
await group('플레이어 포장 (yt.js)', async () => {
  await rep.check('예매 미리보기: 확인하는 도중에 링크를 바꿔도 새 플레이어가 화면에 남는다', async () => {
    const a = await person('예매하는 사람');
    // 느린 회선: 유튜브 API 스크립트가 1.5초 뒤에 온다. 그 사이에 링크를 고치면 플레이어 두 개가 한꺼번에 만들어진다.
    await a.context().route('https://www.youtube.com/iframe_api', async (r) => { await sleep(1500); await r.fallback(); });
    await a.goto(base + '#/new');
    await a.waitForSelector('.booking');
    await a.fill('input[type=url]', 'https://youtu.be/aaaaaaaaaaa');
    await a.dispatchEvent('input[type=url]', 'change');
    await sleep(400);
    await a.fill('input[type=url]', 'https://youtu.be/bbbbbbbbbbb');
    await a.dispatchEvent('input[type=url]', 'change');
    await a.waitForSelector('.note.good', { timeout: 15000 });
    await sleep(500);
    const s = await a.evaluate(() => ({
      frames: document.querySelectorAll('.preview .mock-yt').length,
      alive: (window.__ytPlayers || []).filter((p) => !p.destroyed).map((p) => ({ vid: p.videoId, attached: p.frame.isConnected })),
    }));
    assert(s.alive.length === 1 && s.alive[0].vid === 'bbbbbbbbbbb' && s.alive[0].attached, 'surviving player: ' + JSON.stringify(s.alive));
    assert(s.frames === 1, `${s.frames} frames in the preview box`);
  });

  await rep.check('소리를 켤 때 관객이 줄여 둔 음량은 그대로 둔다 (0 일 때만 올린다)', async () => {
    const quiet = await person('작게 듣는 관객', { ytMock: { volume: 30 } });
    const zero = await person('음량 0 관객', { ytMock: { volume: 0 } });
    await Promise.all([quiet, zero].map(async (pg) => {
      await open(pg, { inMs: -20000 });
      await pg.waitForSelector('.mock-yt', { timeout: 10000 });
    }));
    await sleep(3000);
    const [q, z] = [await look(quiet), await look(zero)];
    assert(!q.muted && q.volume === 30 && q.volumeSets === 0, 'lowered volume was overridden: ' + JSON.stringify(q));
    assert(!z.muted && z.volume === 100, 'silent volume was left at 0: ' + JSON.stringify(z));
  });
});

// ------------------------------------------------------------------
await group('움직임 줄이기', async () => {
  await rep.check('prefers-reduced-motion: 상영관의 🙇 인사가 이모지 말풍선으로 보인다 (평소에는 끄덕이는 몸짓)', async () => {
    const calm = await person('움직임 줄인 관객');
    const usual = await person('보통 관객');
    await calm.emulateMedia({ reducedMotion: 'reduce' });
    await Promise.all([calm, usual].map(async (pg) => {
      await open(pg, { inMs: 600000 });
      await pg.waitForSelector('.stander.me');
      await pg.click('.emote-btn >> nth=0');
    }));
    await calm.waitForSelector('.stander.me .bubble.emote', { timeout: 3000 });
    assert((await calm.textContent('.stander.me .bubble.emote')) === '🙇', 'wrong bubble');
    await usual.waitForSelector('.stander.me.nod', { timeout: 3000 });
    assert((await usual.locator('.stander.me .bubble').count()) === 0, 'bubble shown although the nod animation is visible');
  });
});

// ------------------------------------------------------------------
// 고친 것을 다시 점검하다 나온 결함들. 모두 "건너뛴 뒤 다시 재생되기까지 걸린 시간을 재서, 다음에는 그만큼 앞을 겨냥한다"에서 나왔다.
// 회선이 끊겨 있던 시간, 화면을 눌러 주기까지의 시간, 쉬는 시간 뒤에 다시 출발하는 시간을 한데 섞어 배우면
// 다음번에 엉뚱하게 앞을 겨냥해서, 그 관객만 남들보다 몇 초 앞선 장면을 보다가 도로 끌려 내려온다.
await group('다시 점검에서 나온 것', async () => {
  /** 페이지 안에서 돈다: 50ms 마다 플레이어가 방의 상영 위치보다 얼마나 앞서(+) / 뒤처져(-) 있는지 적는다 */
  const sampler = () => {
    window.__smp = [];
    setInterval(() => {
      const r = window.__dsy && window.__dsy.room;
      const p = (window.__ytPlayers || []).filter((x) => !x.destroyed).pop();
      if (!r || !p) return;
      window.__smp.push({ at: performance.now(), st: p.state, rate: p.rate, rest: r.ctl.pause != null, drift: p.getCurrentTime() - (r.now() - r.ctl.at) / 1000 });
    }, 50);
  };
  // 여기 점검들은 시간에 민감하다. 끝난 점검의 페이지가 뒤에서 계속 돌지 않게 점검마다 치운다.
  const check = (name, fn) => rep.check(name, async () => { try { await fn(); } finally { await cleanup(); } });
  const clock = (page) => page.evaluate(() => performance.now());
  /** from(페이지의 performance.now) 뒤로 "재생 중"이던 표본들. 쉬는 시간 중의 것은 뺀다 (그동안은 방의 위치가 흐르지 않는다). */
  const playingSince = (page, from) => page.evaluate((from) => window.__smp.filter((s) => s.at >= from && s.st === 1 && !s.rest), from);
  /** 표본들 가운데 방보다 가장 앞서 있던 만큼(초) */
  const mostAhead = (smp) => Math.max(...smp.map((s) => s.drift));
  const seeksIn = (log) => log.filter((e) => e[1] === 'seekTo');
  const speedups = (log) => log.filter((e) => e[1] === 'rate' && e[2] !== 1);
  const settled = async (page) => { const p = await look(page); return p.state === 1 && p.rate === 1 && Math.abs(p.drift) < 0.6; };
  const inSync = (page, what, timeout = 30000) => until(() => settled(page), { timeout, what });
  /** 플레이어가 걸리고 방과 맞을 때까지 기다린다 (자동으로 소리를 켜 보는 일까지 끝나도록 조금 더) */
  async function ready(page) {
    await page.waitForSelector('.mock-yt', { timeout: 15000 });
    await inSync(page, 'first sync', 20000);
    await sleep(1500);
  }
  /** 영사기사가 만든 약속에 관객으로 들어간다 */
  async function join(page, code) {
    await enter(page, base, code);
    await toHall(page);
    await ready(page);
  }
  /**
   * 화면이 가려지거나(다른 앱·다른 탭) 다시 보인다. video 를 주면 그 순간 브라우저가 영상에 하는 일까지 흉내 낸다:
   * 'pause' = 가려진 페이지의 영상을 멈춘다, 'play' = 돌아온 페이지의 멈춰 있던 영상을 다시 돌린다.
   * @returns {Promise<number>} 그때의 performance.now()
   */
  const setHidden = (page, hidden, video = '') => page.evaluate(([hidden, video]) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    const p = window.__ytPlayers.filter((x) => !x.destroyed).pop();
    if (video === 'pause') p.pauseVideo();
    if (video === 'play') p.playVideo();
    document.dispatchEvent(new Event('visibilitychange'));
    return performance.now();
  }, [hidden, video]);
  /**
   * 영사기사가 쉬는 시간을 주고, 조금 쉰 뒤 [다시 상영]을 누른다. whileResting 은 쉬는 동안 관객 쪽에서 일어나는 일.
   * @returns {Promise<{ mark: number, at: number }>} mark = [다시 상영] 직전까지의 유튜브 기록 길이, at = 관객에게 다시 상영이 닿은 때(performance.now)
   */
  async function intermission(host, viewer, whileResting) {
    await booth(host, '쉬는 시간');
    await until(async () => (await look(viewer)).state === 2, { timeout: 8000, what: 'viewer paused for the intermission' });
    await sleep(1500);
    if (whileResting) await whileResting();
    const [mark, from] = [(await ytLog(viewer)).length, await clock(viewer)];
    await booth(host, '다시 상영');
    const at = await until(() => viewer.evaluate((from) => (window.__smp.find((s) => s.at >= from && !s.rest) || {}).at, from), { timeout: 8000, what: 'the resume to reach the viewer' });
    return { mark, at };
  }

  await check('회선이 20초 끊겼다 돌아와도 그 시간을 "건너뛰는 데 걸리는 시간"으로 배우지 않는다 — 방보다 앞선 장면을 틀지 않는다', async () => {
    const a = await person('끊기는 관객', { init: sampler, ytMock: { duration: 900 } });
    await open(a, { inMs: -60000, dur: 900 });
    await ready(a);
    // 아무것도 건드리지 않았는데 영화 중간에 20초 동안 버퍼링한다. 엔진은 12초쯤에 한 번 건너뛰어 보고(불러오는 중이라 소용없다), 돌아오면 다시 맞춘다.
    const mark = (await ytLog(a)).length;
    const from = await a.evaluate(() => {
      const p = window.__ytPlayers.filter((x) => !x.destroyed).pop();
      Object.assign(window.__ytMock, { stallAt: p.getCurrentTime() + 0.2, stallMs: 20000 });
      return performance.now();
    });
    await until(async () => (await look(a)).state === 3, { timeout: 5000, every: 50, what: 'the stall to begin' });
    await until(async () => (await look(a)).state === 1, { timeout: 30000, what: 'playback to come back' });
    // 예전에는 끊겨 있던 7초를 "건너뛰면 그만큼 걸린다"로 배워서, 돌아오자마자 3초 앞으로 건너뛰고 3.5초 뒤에 도로 끌어내렸다 (건너뛰기 세 번)
    await sleep(5500);
    await inSync(a, 're-sync after the stall', 15000);
    const [smp, log] = [await playingSince(a, from), (await ytLog(a)).slice(mark)];
    const began = log.find((e) => e[1] === 'state' && e[2] === 3);
    const came = log.find((e) => e[1] === 'state' && e[2] === 1 && e[0] > began[0]);
    assert(came[0] - began[0] > 19000, `the stall lasted only ${came[0] - began[0]}ms (test setup)`);
    assert(mostAhead(smp) <= 1.5, `played ${mostAhead(smp).toFixed(2)}s ahead of the room after the stall`);
    const seeks = seeksIn(log);
    assert(seeks.length >= 1 && seeks.length <= 2, `seekTo calls for one stall: ${JSON.stringify(seeks)}`);
  });

  await check('다른 앱에 다녀온 뒤 화면을 눌러 주기까지 걸린 시간도 배우지 않는다 — 나중의 3초 버퍼링 뒤에 앞으로 건너뛰지 않는다', async () => {
    const a = await person('다녀온 관객', { init: sampler, ytMock: { duration: 900 } });
    await open(a, { inMs: -60000, dur: 900 });
    await ready(a);
    // 다른 앱에 다녀온다: 화면이 가려지면 브라우저가 영상을 멈추고, 돌아와도 플레이어를 직접 누르기 전에는 재생을 받아 주지 않는다
    await a.evaluate(() => { window.__ytMock.blockPlay = true; });
    await setHidden(a, true, 'pause');
    await sleep(3000);
    const back = await setHidden(a, false);
    // 엔진이 멈춰 있는 플레이어를 방의 위치로 옮겨 놓고 2.4초 뒤에(다음 건너뛰기 전에) 관객이 플레이어를 누른다. 시간은 페이지 안에서 잰다.
    // → 누르기 전에 엔진이 건너뛴 횟수
    const movedBeforeTap = await a.evaluate((back) => new Promise((done, fail) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        const seek = window.__ytLog.find((e) => e[1] === 'seekTo' && e[0] >= back);
        if (!seek && performance.now() - t0 < 8000) return;
        clearInterval(iv);
        if (!seek) return fail(new Error('the engine never moved the paused player (test setup)'));
        setTimeout(() => {
          window.__ytMock.blockPlay = false;
          document.querySelector('.mock-yt').click();
          done(window.__ytLog.filter((e) => e[1] === 'seekTo' && e[0] >= back).length);
        }, Math.max(0, seek[0] + 2400 - performance.now()));
      }, 20);
    }), Math.floor(back));
    // 예전 코드가 틀리게 배우던 것은 "건너뛴 뒤 다음 건너뛰기가 오기 전에 눌렀을 때"다. 느린 기계에서 그 사이에 엔진이 한 번 더 건너뛰었다면 이 실행은 그 점을 증명하지 못한 것.
    if (movedBeforeTap !== 1) console.log(`        (참고: 관객이 누르기 전에 엔진이 ${movedBeforeTap}번 건너뛰어서, 이번 실행은 예전 결함이 드러나는 상황이 아니었다)`);
    await inSync(a, 're-sync after the tap');
    await sleep(1500);
    // 한참 뒤의 평범한 3초 버퍼링. 예전에는 누르기까지 걸린 2.4초를 배워 둔 탓에 여기서 2.6초 앞으로 건너뛰고, 3.5초 뒤에 도로 끌어내렸다.
    const mark = (await ytLog(a)).length;
    const from = await a.evaluate(() => { window.__ytPlayers.filter((x) => !x.destroyed).pop()._buffer(3000); return performance.now(); });
    await until(async () => (await look(a)).state === 1, { timeout: 15000, what: 'playback after the hiccup' });
    await sleep(5000);
    await inSync(a, 're-sync after the hiccup', 15000);
    const [smp, seeks] = [await playingSince(a, from), seeksIn((await ytLog(a)).slice(mark))];
    assert(mostAhead(smp) <= 1.5, `played ${mostAhead(smp).toFixed(2)}s ahead of the room after a 3s hiccup`);
    assert(seeks.length === 1, `seekTo calls for one 3s hiccup: ${JSON.stringify(seeks)}`);
  });

  await check('건너뛸 때마다 2.2초 버퍼링하는 회선에서도, 쉬는 시간 뒤에는 방과 같은 곳에서 다시 출발한다 (재생 중에 배운 만큼 앞에서가 아니라)', async () => {
    const host = await person('영사기사', { ytMock: { duration: 600 } });
    const code = await open(host, { inMs: -60000, dur: 600 });
    const v = await person('느린 회선 관객', { init: sampler, ytMock: { seekDelay: 2200, duration: 600 } });
    await join(v, code);
    // '느린 회선' 점검과 같은 상황: 관객이 20초 되감는다 → 엔진이 한 번 건너뛰고(2.2초 버퍼링), 다음에는 2.4초 앞을 겨냥해야 한다고 배운다
    const before = (await ytLog(v)).length;
    await livePlayer(v, (p) => p.seekTo(p.getCurrentTime() - 20));
    await inSync(v, 'in sync after the rewind');
    assert(seeksIn((await ytLog(v)).slice(before)).length === 2, 'the engine did not bring the viewer back with one seek (test setup)');
    await sleep(1000);
    // 쉬는 시간. 멈춰 둔 곳은 이미 받아 둔 구간이라 다시 트는 데는 시간이 걸리지 않는다.
    const r = await intermission(host, v);
    await sleep(6000);        // 예전에는 2.4초 앞에서 출발해 3.5초 뒤 다시 건너뛰고, 또 버퍼링하고, 7초 동안 1.25배속으로 따라잡았다
    const [smp, log, p] = [await playingSince(v, r.at), (await ytLog(v)).slice(r.mark), await look(v)];
    const landed = smp.find((s) => Math.abs(s.drift) < 0.6);
    assert(smp.length > 0 && mostAhead(smp) <= 1.0, `restarted ${smp.length ? mostAhead(smp).toFixed(2) : '?'}s ahead of the room`);
    assert(landed && landed.at - r.at < 3000, `in step with the room only ${landed ? Math.round(landed.at - r.at) + 'ms' : 'never'} after the resume`);
    assert(seeksIn(log).length === 1, `seekTo calls after the resume: ${JSON.stringify(seeksIn(log))}`);
    assert(speedups(log).length === 0, 'needed a speed change after the resume: ' + JSON.stringify(speedups(log)));
    assert(!log.some((e) => e[1] === 'state' && e[2] === 3), 'buffered again after the resume');
    assert(p.state === 1 && p.rate === 1 && Math.abs(p.drift) < 0.6, `6s after the resume: state ${p.state}, drift ${p.drift.toFixed(2)}s, x${p.rate}`);
  });

  await check('멈춘 영상을 다시 트는 것부터 2.2초 걸리는 회선이면, 그 시간은 따로 배워서 두 번째 쉬는 시간 뒤에는 한 번에 맞는다', async () => {
    const host = await person('영사기사', { ytMock: { duration: 600 } });
    const code = await open(host, { inMs: -60000, dur: 600 });
    const v = await person('다시 틀기 느린 관객', { init: sampler, ytMock: { playDelay: 2200, duration: 600 } });
    await join(v, code);
    // 첫 번째 쉬는 시간: 아직 모르니 1.9초 뒤처져 출발하고, 한 번은 빠르게 감아 따라잡아도 된다
    const r1 = await intermission(host, v);
    await sleep(3000);
    await inSync(v, 'in sync after the first resume');
    const firstSeeks = seeksIn((await ytLog(v)).slice(r1.mark));
    assert(firstSeeks.length === 1, `seekTo calls after the first resume: ${JSON.stringify(firstSeeks)}`);
    await sleep(1000);
    // 두 번째: 다시 출발하는 데 2.2초 걸린다는 걸 안다 → 그만큼 앞을 겨냥해 한 번에 맞는다
    const r2 = await intermission(host, v);
    await sleep(5000);
    let [smp, log] = [await playingSince(v, r2.at), (await ytLog(v)).slice(r2.mark)];
    assert(smp.length > 0, 'not playing 5s after the second resume');
    const worst = Math.max(...smp.map((s) => Math.abs(s.drift)));
    assert(worst < 0.6, `second resume landed ${worst.toFixed(2)}s off the room`);
    assert(seeksIn(log).length === 1 && speedups(log).length === 0, `second resume: ${seeksIn(log).length} seeks, speed changes ${JSON.stringify(speedups(log))}`);
    // 재생 중의 건너뛰기는 이 회선에서 바로 된다. 다시 출발할 때 배운 2.4초가 여기에 섞이면, 되감은 관객을 2.4초 앞에 데려다 놓는다.
    const [mark, from] = [(await ytLog(v)).length, await clock(v)];
    await livePlayer(v, (p) => p.seekTo(p.getCurrentTime() - 20));
    await sleep(4500);
    [smp, log] = [await playingSince(v, from), (await ytLog(v)).slice(mark)];
    const p = await look(v);
    assert(mostAhead(smp) <= 1.0, `a seek while playing aimed ${mostAhead(smp).toFixed(2)}s ahead of the room`);
    assert(seeksIn(log).length === 2, `seekTo calls (1 by the viewer + by the engine): ${JSON.stringify(seeksIn(log))}`);
    assert(p.state === 1 && p.rate === 1 && Math.abs(p.drift) < 0.6, `after the rewind: state ${p.state}, drift ${p.drift.toFixed(2)}s, x${p.rate}`);
  });

  await check('가려진 화면에서 6초 넘게 막혀 있던 다시 출발은 배우지 않는다 — 다음 쉬는 시간 뒤에 앞서 출발하지 않는다', async () => {
    const host = await person('영사기사', { ytMock: { duration: 600 } });
    const code = await open(host, { inMs: -60000, dur: 600 });
    const v = await person('자리 비운 관객', { init: sampler, ytMock: { duration: 600 } });
    await join(v, code);
    // 첫 번째 쉬는 시간이 끝날 때 관객은 다른 앱에 가 있다: 화면이 가려져 있고, 그동안 브라우저는 재생을 받아 주지 않는다
    const r1 = await intermission(host, v, async () => {
      await v.evaluate(() => { window.__ytMock.blockPlay = true; });
      await setHidden(v, true);
    });
    await sleep(6500);
    const [stuck, tried] = [await look(v), seeksIn((await ytLog(v)).slice(r1.mark))];
    assert(stuck.state === 2 && tried.length === 1, `while hidden: state ${stuck.state}, seekTo calls ${JSON.stringify(tried)} (test setup)`);
    // 돌아온다. 그 순간 브라우저가 멈춰 있던 영상을 다시 돌려서, 엔진이 볼 때는 이미 6.5초 늦게 재생 중이다.
    await v.evaluate(() => { window.__ytMock.blockPlay = false; });
    const back = await setHidden(v, false, 'play');
    await sleep(2500);
    await inSync(v, 'in sync after coming back');
    const home = await playingSince(v, back);
    assert(home.length > 0 && mostAhead(home) <= 1.0, `came back ${home.length ? mostAhead(home).toFixed(2) : '?'}s ahead of the room`);
    // 두 번째 쉬는 시간: 이번에는 막히지 않는다. 지난번의 6.5초를 "다시 출발하는 데 걸리는 시간"으로 배웠다면 3초 앞에서 출발한다.
    const r2 = await intermission(host, v);
    await sleep(3000);
    const [smp, log, p] = [await playingSince(v, r2.at), (await ytLog(v)).slice(r2.mark), await look(v)];
    assert(smp.length > 0 && mostAhead(smp) <= 1.0, `restarted ${smp.length ? mostAhead(smp).toFixed(2) : '?'}s ahead of the room`);
    assert(seeksIn(log).length === 1, `seekTo calls after the second resume: ${JSON.stringify(seeksIn(log))}`);
    assert(p.state === 1 && p.rate === 1 && Math.abs(p.drift) < 0.6, `3s after the second resume: state ${p.state}, drift ${p.drift.toFixed(2)}s, x${p.rate}`);
  });
});

// ------------------------------------------------------------------
if (errors.length) {
  console.log('\n브라우저 콘솔 오류:');
  for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e);
}
if (!only) await rep.check('브라우저 콘솔에 오류가 없다', async () => { assert(errors.length === 0, `${errors.length} console errors`); });

const ok = rep.done();
await browser.close();
await site.close();
await broker.close().catch(() => {});
process.exit(ok ? 0 : 1);
