// 화면·조작 쪽 되돌이 점검 (모바일 UX 리뷰에서 나온 결함들).  실행: (cinema/tests 에서) node regress-ux.mjs [묶음 이름 일부]
//
// e2e.mjs 와 같은 도구(harness.mjs: 가짜 유튜브 + 로컬 MQTT)를 쓴다. 한 줄에 점검 하나, 실패하면 종료 코드 1.
import { chromium, startStatic, startBroker, spawn, createInvite, enter, toHall, peek, until, reporter, assert, sleep } from './harness.mjs';

const only = process.argv[2] || '';
const site = await startStatic();
const broker = await startBroker();
const browser = await chromium.launch();
const errors = [];
const rep = reporter();
const base = () => `${site.url}index.html?brokers=${encodeURIComponent(broker.url)}`;
const ctxs = [];
async function person(name, opts = {}) {
  const p = await spawn(browser, { name, errors, ...opts });
  ctxs.push(p.ctx);
  return p.page;
}
async function cleanup() { while (ctxs.length) await ctxs.pop().close().catch(() => {}); }
const group = async (name, fn) => {
  if (only && !name.includes(only)) return;
  console.log(`\n■ ${name}`);
  try { await fn(); } catch (e) { await rep.check(`${name} (예기치 못한 오류)`, () => { throw e; }); }
  await cleanup();
};

const LONG_A = '쿠키 기다리는 박수부대';
const LONG_B = '예고편 좋아하는 조조 관객';
const LONG_TITLE = '금요일 심야 영화: 다 같이 보는 블렌더 단편 모음 상영회 (자막 있음)';
const PORTRAIT = { width: 390, height: 844 };
const SHORT = { width: 390, height: 664 };          // 아이폰 사파리(주소창 포함)쯤
const SMALL = { width: 360, height: 640 };
const LANDSCAPE = { width: 844, height: 390 };
const LAPTOP = { width: 1366, height: 657 };

/** 요소의 화면 좌표 [left, top, right, bottom] (없으면 null) */
const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return [r.left, r.top, r.right, r.bottom];
}, sel);
const overlap = (a, b) => (a && b ? Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) : 0);
const inside = (inner, outer, slack = 0.5) => inner[0] >= outer[0] - slack && inner[1] >= outer[1] - slack && inner[2] <= outer[2] + slack && inner[3] <= outer[3] + slack;
const fmt = (r) => (r ? '[' + r.map((v) => Math.round(v)).join(',') + ']' : 'null');

/**
 * 플레이어 사각형 위를 촘촘히 찍어 본다: 모든 점에서 맨 위에 그려진 것이 플레이어여야 한다.
 * 토스트는 원래 누름을 받지 않아(pointer-events: none) elementFromPoint 에 안 잡히므로 재는 동안만 잡히게 하고,
 * 시트가 떠 있는 동안 뒤 화면에 걸리는 inert 는 "덮는 것"이 아니므로 재는 동안만 푼다.
 */
const probePlayer = (page) => page.evaluate(() => {
  const app = document.querySelector('#app');
  const wasInert = app.inert;
  app.inert = false;
  const st = document.createElement('style');
  st.textContent = '#toast-root .toast { pointer-events: auto !important; }';
  document.head.appendChild(st);
  const pl = document.querySelector('.mock-yt');
  const box = pl.getBoundingClientRect();
  const covered = [];
  const N = 12;
  // 화면에 보이는 부분만 찍는다 (아주 작은 창에서는 상영관이 스크롤되어 플레이어가 위로 반쯤 나가 있을 수 있다)
  const x0 = Math.max(0, box.left), x1 = Math.min(innerWidth, box.right), y0 = Math.max(0, box.top), y1 = Math.min(innerHeight, box.bottom);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    if (x1 - x0 < 3 || y1 - y0 < 3) break;
    const x = x0 + 1 + (x1 - x0 - 2) * i / N, y = y0 + 1 + (y1 - y0 - 2) * j / N;
    const el = document.elementFromPoint(x, y);
    if (!(el && el.closest('.mock-yt'))) covered.push(`(${Math.round(x)},${Math.round(y)}) ${el ? el.tagName + '.' + String(el.className.baseVal != null ? el.className.baseVal : el.className) + '#' + el.id : 'null'}`);
  }
  st.remove();
  app.inert = wasInert;
  const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  return {
    covered, points: (N + 1) * (N + 1), player: [box.left, box.top, box.right, box.bottom],
    toast: rect('.toast'), wrap: rect('.sheet-wrap.open'), sheet: rect('.sheet-wrap.open .sheet'), view: [0, 0, innerWidth, innerHeight],
  };
});

function assertClear(r, what) {
  assert(r.covered.length === 0, `${what}: ${r.covered.length}/${r.points} points of the player are covered, e.g. ${r.covered.slice(0, 3).join(' | ')}`);
  for (const k of ['toast', 'wrap', 'sheet']) assert(overlap(r[k], r.player) === 0, `${what}: .${k} ${fmt(r[k])} overlaps the player ${fmt(r.player)}`);
  assert(r.player[2] - r.player[0] >= 200 && r.player[3] - r.player[1] >= 200, `${what}: player ${fmt(r.player)} smaller than 200x200`);
}

/** 상영 중인 약속을 만들어 곧장 상영관(플레이어가 걸린 상태)으로 들어간다 */
async function intoShow(page, { dur = 180 } = {}) {
  await page.goto(base()); await page.waitForSelector('.home');
  const code = await createInvite(page, { inMs: -4000, dur });
  await enter(page, base(), code);
  await page.waitForSelector('.mock-yt', { timeout: 15000 });
  await sleep(500);
  return code;
}

// ------------------------------------------------------------------
await group('플레이어 위에는 아무것도 그리지 않는다 (토스트·시트)', async () => {
  for (const vp of [PORTRAIT, LANDSCAPE, LAPTOP]) {
    const tag = `${vp.width}x${vp.height}`;
    const a = await person('관객 ' + tag, { viewport: vp, mobile: vp.width < 1000, ytMock: { duration: 180 } });
    await intoShow(a);

    await rep.check(`${tag}: 토스트가 플레이어를 덮지 않고, 화면 안에 보인다`, async () => {
      await a.click('.pop-btn');                       // 팝콘이 없으면 토스트가 뜬다
      await a.waitForSelector('.toast');
      await sleep(350);                                // 등장 애니메이션이 끝난 뒤
      const r = await probePlayer(a);
      assert(r.toast, 'no toast');
      assertClear(r, 'toast');
      assert(inside(r.toast, r.view), `toast ${fmt(r.toast)} is outside the viewport`);
    });

    await rep.check(`${tag}: 사람 목록 시트 — 어두운 배경도 시트도 플레이어를 덮지 않는다`, async () => {
      await a.click('.net-pill');
      await a.waitForSelector('.sheet-wrap.open');
      await sleep(400);
      const r = await probePlayer(a);
      assert(r.wrap && r.sheet, 'sheet not open');
      assertClear(r, 'people sheet');
      assert(inside(r.sheet, r.view), `sheet ${fmt(r.sheet)} is outside the viewport`);
      assert((await peek(a)).player.state === 1, 'player stopped while the sheet is open');
    });

    await rep.check(`${tag}: 긴 시트(내 캐릭터)도 플레이어를 피하고, 완료 버튼은 눌린다`, async () => {
      await a.click('.sheet .btn-soft');                // 내 캐릭터 바꾸기
      await a.waitForSelector('.sheet .me-preview');
      await sleep(450);
      const r = await probePlayer(a);
      assertClear(r, 'me editor');
      const done = await rectOf(a, '.sheet .btn-primary');
      assert(inside(done, r.sheet) && inside(done, r.view), `완료 ${fmt(done)} not reachable inside sheet ${fmt(r.sheet)}`);
      await a.click('.sheet .btn-primary');
      await until(async () => (await a.locator('.sheet-wrap.open').count()) === 0, { what: 'sheet closed' });
    });

    await rep.check(`${tag}: 어두운 배경이 스크린을 덮지 않아도, 스크린 쪽을 누르면 시트가 닫힌다 (영상은 건드리지 않는다)`, async () => {
      await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'old sheet removed' });
      await a.click('.net-pill');
      await a.waitForSelector('.sheet-wrap.open');
      await sleep(300);
      const p = await rectOf(a, '.mock-yt');
      await a.mouse.click((p[0] + p[2]) / 2, (p[1] + p[3]) / 2);
      await until(async () => (await a.locator('.sheet-wrap.open').count()) === 0, { timeout: 3000, what: 'sheet closed by a tap on the screen side' });
      const r = await a.evaluate(() => ({ inert: document.querySelector('#app').inert, touched: window.__ytPlayers.filter((x) => !x.destroyed).pop().gesture === true }));
      assert(!r.inert && !r.touched, JSON.stringify(r));
    });

    if (vp === LANDSCAPE) {
      await rep.check(`${tag}: 영사실 시트의 긴 버튼 글이 좁은 칸 밖으로 넘치지 않는다`, async () => {
        await a.click('.booth-btn');
        await a.waitForSelector('.sheet-wrap.open');
        await sleep(400);
        const r = await probePlayer(a);
        assertClear(r, 'booth sheet');
        const over = await a.evaluate(() => {
          const s = document.querySelector('.sheet-wrap.open .sheet');
          return { sheet: s.scrollWidth - s.clientWidth, btns: Array.from(s.querySelectorAll('.btn')).map((b) => b.scrollWidth - b.clientWidth) };
        });
        assert(over.sheet <= 0 && over.btns.every((d) => d <= 0), 'booth sheet overflows: ' + JSON.stringify(over));
        await a.keyboard.press('Escape');
        await until(async () => (await a.locator('.sheet-wrap.open').count()) === 0, { what: 'sheet closed' });
      });
    }
    await cleanup();
  }

  // 시트·토스트가 먼저 떠 있고 플레이어가 나중에 걸리는 경우 (상영 시작 순간)
  for (const vp of [PORTRAIT, LANDSCAPE]) {
    const tag = `${vp.width}x${vp.height}`;
    await rep.check(`${tag}: 시트를 열어 둔 채 상영이 시작돼도 플레이어는 시트 밖에 걸린다`, async () => {
      const a = await person('미리 온 관객 ' + tag, { viewport: vp, ytMock: { duration: 180 } });
      await a.goto(base()); await a.waitForSelector('.home');
      const code = await createInvite(a, { inMs: 9000, dur: 180 });
      await enter(a, base(), code);
      await toHall(a);
      await a.click('.net-pill');
      await a.waitForSelector('.sheet-wrap.open');
      const before = await rectOf(a, '.sheet-wrap.open');
      await a.waitForSelector('.mock-yt', { timeout: 25000 });
      await sleep(300);
      const r = await probePlayer(a);
      assert(r.wrap, 'sheet was closed by the start of the show');
      assertClear(r, 'sheet opened before the show');
      assert(before[0] < r.wrap[0] || before[1] < r.wrap[1], `sheet layer did not move out of the way: ${fmt(before)} → ${fmt(r.wrap)}`);
      // 로비로 나가면 다시 화면 전체를 쓴다
      await a.keyboard.press('Escape');
      await a.click('.room-top .icon-btn');
      await a.waitForSelector('.room.lobby');
      await a.click('.net-pill');
      await a.waitForSelector('.sheet-wrap.open');
      const lobbyWrap = await rectOf(a, '.sheet-wrap.open');
      assert(lobbyWrap[0] === 0 && lobbyWrap[1] === 0 && lobbyWrap[2] === vp.width, 'sheet layer still narrowed outside the hall: ' + fmt(lobbyWrap));
    });
    await cleanup();
  }
});

// ------------------------------------------------------------------
await group('작은 창에서도 플레이어는 200px 이상', async () => {
  const a = await person('작은 창', { viewport: { width: 640, height: 360 }, ytMock: { duration: 600 } });
  await intoShow(a, { dur: 600 });
  const closeSheet = async () => {
    await a.evaluate(async () => { (await import('./js/ui.js')).closeSheet(); });
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'sheet removed' });
  };
  for (const vp of [[360, 300], [400, 300], [420, 380], [480, 320], [568, 320], [667, 375], [844, 390]]) {
    await rep.check(`${vp[0]}x${vp[1]}: 플레이어가 200x200 이상이고 화면 안에 있고, 토스트·시트에 덮이지 않는다`, async () => {
      await a.setViewportSize({ width: vp[0], height: vp[1] });
      await sleep(350);
      await a.evaluate(() => { document.querySelector('.room.hall').scrollTop = 0; });
      await a.evaluate(async () => { (await import('./js/ui.js')).toast('토스트 자리 시험', 6000); });
      await sleep(400);
      const r = await probePlayer(a);
      assert(r.toast, 'no toast');
      assertClear(r, 'toast');
      assert(inside(r.player, r.view, 1), `player ${fmt(r.player)} not fully inside the viewport ${fmt(r.view)}`);
      const overflow = await a.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 0, `page overflows sideways by ${overflow}px`);
      try {
        await a.click('.net-pill');
        await a.waitForSelector('.sheet-wrap.open');
        await sleep(400);
        const s = await probePlayer(a);
        assertClear(s, 'sheet + toast');
        // 시트는 쓸 수 있을 만큼 펴져 있어야 한다 (가느다란 띠로 눌려 닫을 수도 없게 되면 안 된다)
        assert(s.sheet[3] - s.sheet[1] >= 150 && inside(s.sheet, s.view), `sheet ${fmt(s.sheet)} is not usable in ${fmt(s.view)}`);
      } finally {
        await closeSheet();
      }
      await sleep(100);
      const back = await rectOf(a, '.mock-yt');
      assert(inside(back, [0, 0, vp[0], vp[1]], 1), `player ${fmt(back)} did not come back into view after the sheet closed`);
    });
  }
  await rep.check('360x300: 세로 배치로 물러나도 객석과 아래 막대에 스크롤로 닿을 수 있다', async () => {
    await a.setViewportSize({ width: 360, height: 300 });
    await sleep(350);
    await a.locator('.seat >> nth=20').scrollIntoViewIfNeeded();
    await a.click('.seat >> nth=20');
    await until(async () => (await peek(a)).self.s === 20, { what: 'seated after scrolling' });
    await a.locator('.emote-btn >> nth=1').scrollIntoViewIfNeeded();
    const btn = await rectOf(a, '.emote-btn');
    assert(btn && btn[1] >= 0 && btn[3] <= 300.5, 'action bar still cut off: ' + fmt(btn));
  });
});

// ------------------------------------------------------------------
await group('상영관 객석', async () => {
  const a = await person('조용한 관객', { viewport: SHORT });
  const d = await person('맨 뒷줄 졸음꾼', { viewport: SHORT, av: [3, 5, 3, 3] });
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 20 * 60000, dur: 60 });
  await enter(a, base(), code); await enter(d, base(), code);
  await toHall(a); await toHall(d);
  await sleep(1700);                                   // 자리 소식이 다 올 때까지

  await rep.check('서 있는 사람의 긴 이름표가 통로 폭에 잘리지 않는다', async () => {
    const r = await a.evaluate(() => {
      const box = document.querySelector('.standing');
      const b = box.getBoundingClientRect(), cs = getComputedStyle(box);
      const m = /inset\(\s*0(?:px)?\s+(-?[\d.]+)px/.exec(cs.clipPath);      // 옆으로 얼마나 더 보이게 두었나
      const spare = m ? -parseFloat(m[1]) : 0;
      const tags = Array.from(document.querySelectorAll('.stander .seat-tag')).map((t) => { const q = t.getBoundingClientRect(); return { text: t.textContent, l: q.left, r: q.right }; });
      return { overflowX: cs.overflowX, clip: cs.clipPath, visL: b.left - spare, visR: b.right + spare, tags };
    });
    const long = r.tags.find((t) => t.text === '맨 뒷줄 졸음꾼');
    assert(long, 'no stander tag: ' + JSON.stringify(r.tags));
    assert(r.overflowX !== 'hidden', 'aisle still clips sideways (overflow hidden)');
    assert(long.l >= r.visL - 0.5 && long.r <= r.visR + 0.5, `tag [${Math.round(long.l)},${Math.round(long.r)}] cut by visible area [${Math.round(r.visL)},${Math.round(r.visR)}] (${r.clip})`);
  });

  await rep.check('뒷줄에 사람이 앉아 있어도, 그 앞 빈자리는 자기 사각형 어디를 눌러도 앉아진다', async () => {
    await d.click('.seat >> nth=20');                  // D열 3번
    await until(async () => (await peek(a)).seats[20] === 'taken', { what: 'D3 taken on A' });
    await sleep(500);
    const grid = await a.evaluate(() => {
      const seats = Array.from(document.querySelectorAll('.seat'));
      const t = seats[14].getBoundingClientRect();
      let stolen = 0;
      for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) {
        const el = document.elementFromPoint(t.left + t.width * (i + .5) / 10, t.top + t.height * (j + .5) / 10);
        if (seats.indexOf(el && el.closest('.seat')) !== 14) stolen++;
      }
      return { stolen, box: [t.left, t.top, t.width, t.height] };
    });
    assert(grid.stolen === 0, `${grid.stolen}/100 points of empty C3 go to another seat`);
    const [x, y, w, hh] = grid.box;
    await a.mouse.click(x + w / 2, y + hh * 0.8);      // 손가락이 닿는 아래쪽 (뒷사람 머리가 겹쳐 그려지는 곳)
    await until(async () => (await peek(a)).self.s === 14, { timeout: 4000, what: 'A seated in C3' });
  });

  await rep.check('주인 있는 자리를 누르면 누구 자리인지 알려 주고, 가장자리 자리의 말풍선도 무대 안에 다 보인다', async () => {
    await d.evaluate((n) => { const r = window.__dsy.room; r.update({ n }); r.sit(0); }, LONG_A);     // A열 1번 (왼쪽 벽)
    await until(async () => (await peek(a)).seats[0] === 'taken', { what: 'A1 taken on A' });
    await sleep(600);
    for (const [idx, name] of [[0, 'left edge'], [5, 'right edge']]) {
      if (idx === 5) {
        await d.evaluate(() => window.__dsy.room.sit(5));
        await until(async () => (await peek(a)).seats[5] === 'taken', { what: 'A6 taken on A' });
        await sleep(2000);                             // 앞 말풍선이 사라진 뒤
      }
      await a.click(`.seat >> nth=${idx}`);
      await a.waitForSelector('.seat .bubble.say');
      await sleep(450);                                // 등장 애니메이션이 끝난 뒤의 실제 자리
      const [b, s] = [await rectOf(a, '.seat .bubble.say'), await rectOf(a, '.hall-stage')];
      assert((await a.textContent('.seat .bubble.say')) === `${LONG_A} 님 자리`, 'wrong bubble text');
      assert(b[0] >= s[0] && b[2] <= s[2], `${name}: bubble [${Math.round(b[0])},${Math.round(b[2])}] cut by stage [${Math.round(s[0])},${Math.round(s[2])}]`);
    }
    assert((await peek(a)).self.s === 14, 'tapping a taken seat moved me');
  });
});

// ------------------------------------------------------------------
await group('로비', async () => {
  const a = await person('호스트 A', { viewport: SHORT });
  const b = await person('친구 B', { viewport: SHORT, av: [1, 2, 3, 1] });
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 30 * 60000, dur: 60 });
  await enter(a, base(), code); await enter(b, base(), code);
  await until(async () => (await a.locator('.av:not(.npc)').count()) === 2, { what: 'two avatars' });
  await a.evaluate(() => { window.__acts = []; window.__dsy.room.on('act', (id, type, d) => window.__acts.push(type + ':' + JSON.stringify(d))); });

  await rep.check('"입장하기" 표시가 검표원에게 가리지 않는다', async () => {
    await sleep(400);
    for (const vp of [SHORT, LANDSCAPE, SHORT]) {       // 가로 모드에서는 무대가 작아 표시가 상대적으로 커진다
      await a.setViewportSize(vp);
      await sleep(300);
      // 검표원 그림에서 실제로 칠해진 부분 (요소 상자의 투명한 여백은 뺀다)
      const usher = await a.evaluate(() => {
        const svg = document.querySelectorAll('.av.npc')[1].querySelector('svg');
        const r = svg.getBoundingClientRect(), bb = svg.getBBox(), vb = svg.viewBox.baseVal;
        const sx = r.width / vb.width, sy = r.height / vb.height;
        return [r.left + (bb.x - vb.x) * sx, r.top + (bb.y - vb.y) * sy, r.left + (bb.x + bb.width - vb.x) * sx, r.top + (bb.y + bb.height - vb.y) * sy];
      });
      const chip = await a.evaluate(() => {
        const e = document.querySelector('.hs-gate .hotspot-label');
        e.style.animation = 'none';                     // 위아래로 까딱이는 중간값이 아니라 제자리에서 잰다
        const r = e.getBoundingClientRect();
        e.style.animation = '';
        return [r.left, r.top, r.right, r.bottom];
      });
      assert(overlap(chip, usher) === 0, `${vp.width}x${vp.height}: chip ${fmt(chip)} under the usher ${fmt(usher)}`);
      const stage = await rectOf(a, '.lobby-stage');
      assert(inside(chip, stage), `${vp.width}x${vp.height}: chip ${fmt(chip)} outside the stage ${fmt(stage)}`);
    }
  });

  await rep.check('팝콘을 산 뒤 "팝콘 사기"를 다시 눌러도 매점이 열린다 (내 아바타가 가로채 인사하지 않는다)', async () => {
    await a.click('.hs-snack');
    await a.waitForSelector('.menu-grid', { timeout: 10000 });
    const tea = await a.locator('.menu-grid >> nth=1').locator('.menu-emoji').allTextContents();
    assert(tea.length === 3 && tea[2] !== '🧋', '아이스티 그림이 아직 버블티: ' + tea.join(' '));
    await a.click('.menu-item >> nth=0');
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'menu closed' });
    assert((await peek(a)).self.p === 0, 'popcorn not bought');
    const chip = await rectOf(a, '.hs-snack .hotspot-label');
    const me = await rectOf(a, '.av.me');
    assert(overlap(chip, me) > 0, 'test premise: my avatar should be standing on the chip');
    await a.mouse.click((chip[0] + chip[2]) / 2, (chip[1] + chip[3]) / 2);
    await a.waitForSelector('.menu-grid', { timeout: 5000 });
    assert((await a.evaluate(() => window.__acts)).length === 0, 'tap on the chip was turned into: ' + (await a.evaluate(() => window.__acts)).join(','));
    await a.keyboard.press('Escape');
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'menu closed' });
  });

  await rep.check('이름표: "나: 이름"으로 쓰고, 벽 가까이 서 있어도 무대 밖으로 잘리지 않는다', async () => {
    await a.evaluate((n) => window.__dsy.room.update({ n, x: 22, y: 300 }), LONG_A);
    await b.evaluate((n) => window.__dsy.room.update({ n, x: 368, y: 330 }), LONG_B);
    await until(async () => { const p = (await peek(a)).peers[0]; return p && p.x === 368 && p.n === LONG_B; }, { what: 'B at the right wall' });
    await sleep(2600);                                 // 다 걸어갈 때까지
    const r = await a.evaluate(() => {
      const s = document.querySelector('.lobby-stage').getBoundingClientRect();
      return { stage: [s.left, s.right], tags: Array.from(document.querySelectorAll('.av:not(.npc) .av-tag')).map((t) => { const q = t.getBoundingClientRect(); return { text: t.textContent, l: q.left, r: q.right }; }) };
    });
    assert(r.tags.some((t) => t.text === `나: ${LONG_A}`) && r.tags.some((t) => t.text === LONG_B), 'tags: ' + r.tags.map((t) => t.text).join('|'));
    for (const t of r.tags) assert(t.l >= r.stage[0] && t.r <= r.stage[1], `tag "${t.text}" [${Math.round(t.l)},${Math.round(t.r)}] cut by stage [${Math.round(r.stage[0])},${Math.round(r.stage[1])}]`);
  });

  await rep.check('시트가 열리면 초점이 시트로 가고, 뒤 화면은 Tab 으로도 갈 수 없다. Esc 로 닫으면 초점이 연 곳으로 돌아온다', async () => {
    await a.focus('.net-pill');
    await a.keyboard.press('Enter');
    await a.waitForSelector('.sheet-wrap.open');
    const at = await a.evaluate(() => ({ inSheet: !!document.activeElement.closest('.sheet'), inert: document.querySelector('#app').inert, name: document.querySelector('.sheet .people-name').textContent }));
    assert(at.inSheet && at.inert, 'focus/inert at open: ' + JSON.stringify(at));
    assert(at.name.startsWith('나: '), 'people list name: ' + at.name);
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await a.keyboard.press('Tab');
      seen.push(await a.evaluate(() => { const e = document.activeElement; return e.closest('#app') ? 'BEHIND:' + (e.getAttribute('aria-label') || e.textContent).slice(0, 12) : e.closest('.sheet') ? 'sheet' : e.tagName; }));
    }
    assert(!seen.some((s) => s.startsWith('BEHIND')) && seen.includes('sheet'), 'tab order: ' + seen.join(', '));
    await a.keyboard.press('Escape');
    await until(async () => (await a.locator('.sheet-wrap.open').count()) === 0, { what: 'sheet closed by Escape' });
    const after = await a.evaluate(() => ({ inert: document.querySelector('#app').inert, focus: document.activeElement.className }));
    assert(!after.inert && after.focus.includes('net-pill'), 'after Escape: ' + JSON.stringify(after));
  });

  await rep.check('시트 바깥(어두운 곳)을 누르면 닫히고, 이어 열린 시트·갈아 끼운 시트 뒤에도 뒤 화면이 막힌 채 남지 않는다', async () => {
    await a.click('.net-pill');
    await a.waitForSelector('.sheet-wrap.open');
    await sleep(300);
    await a.mouse.click(8, 8);                         // 어두운 배경
    await until(async () => (await a.locator('.sheet-wrap.open').count()) === 0, { what: 'sheet closed by scrim tap' });
    assert(!(await a.evaluate(() => document.querySelector('#app').inert)), 'app still inert after scrim tap');
    // 사람 목록 → 내 캐릭터 (앞 시트를 닫고 다음 시트를 연다)
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'old sheet removed' });
    await a.click('.net-pill');
    await a.waitForSelector('.sheet-wrap.open');
    await a.click('.sheet .btn-soft');
    await a.waitForSelector('.sheet .me-preview');
    const mid = await a.evaluate(() => ({ inert: document.querySelector('#app').inert, inSheet: !!document.activeElement.closest('.sheet-wrap.open .sheet'), open: document.querySelectorAll('.sheet-wrap.open').length }));
    assert(mid.inert && mid.inSheet && mid.open === 1, 'chained sheet: ' + JSON.stringify(mid));
    await a.click('.sheet-wrap.open .btn-primary');     // 완료
    await until(async () => (await a.locator('.sheet-wrap.open').count()) === 0, { what: 'editor closed' });
    const end = await a.evaluate(() => ({ inert: document.querySelector('#app').inert, focus: document.activeElement.className }));
    assert(!end.inert && end.focus.includes('net-pill'), 'after chained close: ' + JSON.stringify(end));
    // sheet() 를 연달아 부르면 앞 시트를 스스로 닫는다. 뒤늦게 불린 앞 시트의 닫기 함수가 뒤 화면을 풀어 버리면 안 된다.
    const swap = await a.evaluate(async () => {
      const U = await import('./js/ui.js');
      const app = document.querySelector('#app');
      const closeA = U.sheet({ title: '가', content: [] });
      const closeB = U.sheet({ title: '나', content: [] });
      const afterSwap = { inert: app.inert, open: Array.from(document.querySelectorAll('.sheet-wrap')).filter((w) => w.querySelector('[aria-label="나"]')).length };
      closeA();
      const afterStale = app.inert;
      closeB();
      return { afterSwap, afterStale, end: app.inert };
    });
    assert(swap.afterSwap.inert && swap.afterSwap.open === 1 && swap.afterStale && !swap.end, 'replaced sheets: ' + JSON.stringify(swap));
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'sheets removed' });
  });

  await rep.check('검표원의 말풍선이 무대 오른쪽 끝에서 잘리지 않는다', async () => {
    await a.click('.hs-gate');
    await a.waitForSelector('.tear-ticket', { timeout: 10000 });
    await sleep(450);
    const [bub, stage] = [await rectOf(a, '.av.npc .bubble.say'), await rectOf(a, '.lobby-stage')];
    assert(bub, 'no usher bubble');
    assert(bub[0] >= stage[0] && bub[2] <= stage[2], `bubble [${Math.round(bub[0])},${Math.round(bub[2])}] cut by stage [${Math.round(stage[0])},${Math.round(stage[2])}]`);
    const focus = await a.evaluate(() => !!document.activeElement.closest('.sheet'));
    assert(focus, 'focus not in the ticket sheet');
    await a.keyboard.press('Escape');
  });
});

// ------------------------------------------------------------------
await group('세로가 짧은 휴대폰', async () => {
  for (const vp of [SMALL, SHORT]) {
    const tag = `${vp.width}x${vp.height}`;
    const a = await person('짧은 화면 ' + tag, { viewport: vp });
    await a.goto(base()); await a.waitForSelector('.home');
    const code = await createInvite(a, { inMs: 30 * 60000, dur: 60 });
    await enter(a, base(), code);
    // 화면 안에 온전히 보이는 한마디 버튼 수
    const phrasesInView = () => a.evaluate(() => Array.from(document.querySelectorAll('.phrase-btn')).filter((b) => {
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && el === b;
    }).length);

    await rep.check(`${tag} 로비: 한마디 버튼이 화면 밖에 숨어 있지 않다`, async () => {
      const n = await phrasesInView();
      assert(n >= 3, `only ${n} phrase buttons visible`);
      const stage = await rectOf(a, '.lobby-stage');
      assert(stage[2] - stage[0] >= 300, `lobby stage shrank to ${Math.round(stage[2] - stage[0])}px`);
    });

    if (vp === SMALL) {
      await rep.check(`${tag}: 내 캐릭터 시트가 화면보다 길어도 "완료"가 보이고 눌린다`, async () => {
        await a.click('.net-pill');
        await a.waitForSelector('.sheet-wrap.open');
        await a.click('.sheet .btn-soft');
        await a.waitForSelector('.sheet .me-preview');
        await sleep(450);
        const r = await a.evaluate(() => {
          const s = document.querySelector('.sheet-wrap.open .sheet');
          const b = s.querySelector('.btn-primary').getBoundingClientRect();
          const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
          return { scrolls: s.scrollHeight > s.clientHeight, top: b.top, bottom: b.bottom, vh: innerHeight, hit: hit && hit.textContent };
        });
        assert(r.scrolls, 'test premise: the sheet should be taller than the screen here');
        assert(r.bottom <= r.vh && r.top > r.vh / 2 && r.hit === '완료', '완료 button: ' + JSON.stringify(r));
        await a.click('.sheet-wrap.open .btn-primary');
        await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'editor closed' });
      });
    }

    await rep.check(`${tag} 상영관: 한마디 버튼이 보이고, 좌석은 누를 만한 크기로 남는다`, async () => {
      await toHall(a);
      await sleep(400);
      const n = await phrasesInView();
      assert(n >= 3, `only ${n} phrase buttons visible`);
      const r = await a.evaluate(() => {
        const q = (s) => document.querySelector(s).getBoundingClientRect();
        return { seat: q('.seat').width, emote: q('.emote-btn').width, phrase: q('.phrase-btn').height, bottom: q('.room-bottom').bottom, vh: innerHeight, stage: q('.hall-stage').width };
      });
      assert(r.seat >= 34, `seat ${r.seat.toFixed(1)}px wide`);
      assert(r.emote >= 40 && r.phrase >= 36, `small buttons: emote ${r.emote}, phrase ${r.phrase}`);
      assert(r.bottom <= r.vh + 0.5, 'action bar cut off');
    });
    await cleanup();
  }
});

// ------------------------------------------------------------------
await group('휴대폰 가로 모드', async () => {
  const a = await person('가로로 든 영사기사', { viewport: LANDSCAPE, ytMock: { duration: 5400 } });
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 25 * 60000, dur: 5400, title: '금요일 심야 영화' });
  await enter(a, base(), code);
  await sleep(600);                                    // 아바타가 톡 나타나는 애니메이션이 끝난 뒤에 잰다

  await rep.check('로비: 무대가 화면 높이를 다 쓰고, 위·아래 막대는 옆 칸에 있다', async () => {
    const r = await a.evaluate(() => {
      const q = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return [e.left, e.top, e.right, e.bottom]; };
      return { stage: q('.lobby-stage'), top: q('.room-top'), bottom: q('.room-bottom'), av: q('.av.me'), hint: q('.stage-hint'), vw: innerWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert(r.stage[3] - r.stage[1] >= r.vh * 0.95, `stage only ${Math.round(r.stage[3] - r.stage[1])}px of ${r.vh}px high`);
    assert(r.av[2] - r.av[0] >= 34, `avatar ${Math.round(r.av[2] - r.av[0])}px wide`);
    assert(r.top[0] >= r.stage[2] - 1 && r.bottom[0] >= r.stage[2] - 1, `bars not beside the stage: top ${fmt(r.top)} bottom ${fmt(r.bottom)} stage ${fmt(r.stage)}`);
    assert(r.bottom[3] <= r.vh + 0.5 && r.overflow <= 0, 'bars cut off or page overflows');
    assert(inside(r.hint, r.stage, 1), `hint ${fmt(r.hint)} spills out of the stage ${fmt(r.stage)}`);
  });

  await rep.check('로비: 가로 모드에서도 매점과 검표가 된다', async () => {
    await a.click('.hs-snack');
    await a.waitForSelector('.menu-grid', { timeout: 10000 });
    await sleep(300);
    const sheet = await rectOf(a, '.sheet-wrap.open .sheet');
    assert(inside(sheet, [0, 0, LANDSCAPE.width, LANDSCAPE.height]), 'menu sheet outside the viewport: ' + fmt(sheet));
    await a.click('.menu-item >> nth=1');
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'menu closed' });
    await toHall(a);
  });

  await rep.check('상영관(영사기사): 위 막대가 한 줄이고 상태 글이 잘리지 않는다. 좌석은 30px 이상', async () => {
    await sleep(1700);
    const r = await a.evaluate(() => {
      const q = (s) => document.querySelector(s).getBoundingClientRect();
      const sub = document.querySelector('.room-sub');
      return {
        top: q('.room-top').height, sub: { h: q('.room-sub').height, text: sub.textContent, cut: sub.scrollWidth - sub.clientWidth },
        booth: q('.booth-btn').width, seat: [q('.seat').width, q('.seat').height], side: q('.stage-wrap').width,
        small: Array.from(document.querySelectorAll('.room button')).filter((b) => { const c = b.getBoundingClientRect(); const min = b.classList.contains('seat') ? 24 : 34; return c.width > 0 && (c.width < min || c.height < min); }).map((b) => b.className),
      };
    });
    assert(r.top <= 48, `top bar ${r.top}px high`);
    assert(r.sub.h <= 20 && r.sub.cut <= 0 && r.sub.text.startsWith('상영까지'), 'status line: ' + JSON.stringify(r.sub));
    assert(r.booth > 0, 'booth button missing');
    assert(r.seat[0] >= 30, `seat ${r.seat.map((v) => v.toFixed(1)).join('x')}`);
    assert(r.small.length === 0, 'tiny buttons: ' + r.small.join(', '));
  });

  await rep.check('상영관(영사기사): 한 시간 넘게 상영 중이어도 상태 글이 다 보이고, 플레이어는 200px 이상', async () => {
    await a.evaluate(() => window.__dsy.room.setCtl({ at: window.__dsy.room.now() - 3725000, pause: null }));     // 1:02:05 째 상영 중
    await a.waitForSelector('.mock-yt', { timeout: 15000 });
    for (const vp of [LANDSCAPE, { width: 667, height: 375 }, { width: 568, height: 320 }]) {      // 작은 휴대폰일수록 옆 칸이 좁다
      await a.setViewportSize(vp);
      await sleep(500);
      const r = await a.evaluate(() => {
        const sub = document.querySelector('.room-sub'), p = document.querySelector('.mock-yt').getBoundingClientRect(), top = document.querySelector('.room-top').getBoundingClientRect();
        return { text: sub.textContent, cut: sub.scrollWidth - sub.clientWidth, top: top.height, player: [p.width, p.height], inView: p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight };
      });
      const tag = `${vp.width}x${vp.height}: `;
      assert(/^상영 중 · 1:0\d:\d\d$/.test(r.text) && r.cut <= 0 && r.top <= 48, tag + 'status line: ' + JSON.stringify(r));
      assert(r.player[0] >= 200 && r.player[1] >= 200 && r.inView, tag + 'player ' + r.player.join('x'));
    }
  });
});

// ------------------------------------------------------------------
await group('움직임 줄이기 (prefers-reduced-motion)', async () => {
  const a = await person('멀미 나는 관객', { viewport: SHORT });
  await a.emulateMedia({ reducedMotion: 'reduce' });
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 30 * 60000, dur: 60 });
  await enter(a, base(), code);
  await sleep(600);

  await rep.check('매점을 누르면 걷는 시간만큼 기다리지 않고 바로 열린다', async () => {
    const t0 = Date.now();
    await a.click('.hs-snack');
    await a.waitForSelector('.menu-grid', { timeout: 5000 });
    const ms = Date.now() - t0;
    assert(ms < 700, `menu opened after ${ms}ms`);
    const s = (await peek(a)).self;
    assert(Math.abs(s.x - 68) < 3 && Math.abs(s.y - 240) < 3, 'did not move to the counter: ' + s.x + ',' + s.y);
    await a.keyboard.press('Escape');
    await until(async () => (await a.locator('.sheet-wrap').count()) === 0, { what: 'menu closed' });
  });

  await rep.check('꾸벅 인사가 (몸짓 대신) 🙇 말풍선으로 보인다', async () => {
    await a.click('.emote-btn >> nth=0');
    await a.waitForSelector('.av.me .bubble.emote', { timeout: 3000 });
    assert((await a.textContent('.av.me .bubble.emote')) === '🙇', 'wrong bubble');
  });
});

// ------------------------------------------------------------------
await group('글과 표', async () => {
  await rep.check('"10분 뒤"·"30분 뒤"를 고르면 안내도 같은 말로 나온다 (11분·31분이 아니다)', async () => {
    // 시계의 초가 0~29 일 때 올림 + 반올림이 겹쳐 1분이 더해졌다: 초를 5초쯤으로 맞춰 놓고 본다
    const skew = 5000 - (Date.now() % 60000);
    const p = await person('예매하는 사람', { viewport: PORTRAIT, clockSkewMs: skew || 60000 });
    await p.goto(base() + '#/new');
    await p.waitForSelector('.booking');
    const sec = await p.evaluate(() => new Date(Date.now()).getSeconds());
    assert(sec >= 1 && sec <= 28, 'test premise: clock second should be early in the minute, got ' + sec);
    const ten = await p.textContent('.when-label');
    assert(ten.endsWith('· 10분 뒤'), 'label for the 10분 chip: ' + ten);
    await p.click('.chip:has-text("30분 뒤")');
    const thirty = await p.textContent('.when-label');
    assert(thirty.endsWith('· 30분 뒤'), 'label for the 30분 chip: ' + thirty);
  });

  await rep.check('안내 글·표의 항목이 낱말 중간에서 끊기지 않는다 (word-break: keep-all)', async () => {
    const p = await person('글 읽는 사람', { viewport: PORTRAIT });
    await p.goto(base() + '#/new');
    await p.waitForSelector('.booking');
    await p.fill('input[type=url]', 'https://example.com/watch');
    await p.dispatchEvent('input[type=url]', 'change');
    await p.waitForSelector('.note.bad');
    const r = await p.evaluate(() => {
      const wb = (el) => getComputedStyle(el).wordBreak;
      const probe = (cls) => { const dl = document.createElement('dl'); dl.className = cls; const dd = document.createElement('dd'); dl.appendChild(dd); document.body.appendChild(dl); const v = wb(dd); dl.remove(); return v; };
      const note = document.querySelector('.note.bad');
      const range = document.createRange(); range.selectNodeContents(note);
      // 줄마다 첫 글자 앞이 공백이어야 낱말 중간에서 끊기지 않은 것
      const text = note.textContent; let lastTop = null; const starts = [];
      for (let i = 0; i < text.length; i++) { range.setStart(note.firstChild, i); range.setEnd(note.firstChild, i + 1); const q = range.getClientRects()[0]; if (!q) continue; if (lastTop !== null && q.top > lastTop + 2) starts.push(i); lastTop = q.top; }
      return { note: wb(note), ticket: probe('ticket-info'), stub: probe('stub-info'), midWord: starts.filter((i) => text[i - 1] !== ' ' && text[i] !== ' ').map((i) => text.slice(i - 2, i + 2)) };
    });
    assert(r.note === 'keep-all' && r.ticket === 'keep-all' && r.stub === 'keep-all', JSON.stringify(r));
    assert(r.midWord.length === 0, 'note breaks inside a word: ' + r.midWord.join(' / '));
  });

  const hostPage = await person(LONG_B, { viewport: SMALL });
  await hostPage.goto(base()); await hostPage.waitForSelector('.home');
  const code = await createInvite(hostPage, { inMs: 25 * 60000, dur: 40, title: LONG_TITLE });
  for (const vp of [SMALL, { width: 320, height: 568 }]) {
    await rep.check(`${vp.width}x${vp.height}, 세 줄 넘는 제목의 초대 표: 입장하기 버튼이 첫 화면에 온전히 보이고 눌린다`, async () => {
      const g = await person(LONG_A, { viewport: vp });
      await g.goto(`${base()}#/s/${code}`);
      await g.waitForSelector('.ticket');
      await sleep(400);
      const r = await g.evaluate(() => {
        const btn = document.querySelector('.ticket-actions .btn-xl');
        const b = btn.getBoundingClientRect();
        const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
        const title = document.querySelector('.ticket-title');
        return {
          top: b.top, bottom: b.bottom, vh: innerHeight, scrollY, hit: hit === btn,
          titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)), pageTaller: document.documentElement.scrollHeight > innerHeight,
        };
      });
      assert(r.titleLines >= 3 && r.pageTaller, 'test premise: long ticket, got ' + JSON.stringify(r));
      assert(r.scrollY === 0 && r.top >= 0 && r.bottom <= r.vh && r.hit, '입장 버튼: ' + JSON.stringify(r));
      // 끝까지 내리면 나머지 버튼들도 가리지 않고 보인다
      await g.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sleep(200);
      const more = await g.evaluate(() => Array.from(document.querySelectorAll('.ticket-more .btn')).map((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint((q.left + q.right) / 2, (q.top + q.bottom) / 2); return hit === b && q.bottom <= innerHeight; }));
      assert(more.length === 2 && more.every(Boolean), 'secondary buttons hidden: ' + JSON.stringify(more));
      await g.click('.ticket-actions .btn-xl');
      await g.waitForSelector('.room.lobby');
    });
  }
});

// ------------------------------------------------------------------
if (errors.length) {
  console.log('\n브라우저 콘솔 오류:');
  for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e);
}
await rep.check('브라우저 콘솔에 오류가 없다', async () => { assert(errors.length === 0, `${errors.length} console errors`); });

const ok = rep.done();
await browser.close();
await site.close();
await broker.close().catch(() => {});
process.exit(ok ? 0 : 1);
