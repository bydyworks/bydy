// 화면 캡처: 관객 네 명을 띄워 주요 장면을 찍는다 → tests/shots/*.png
//   node shots.mjs        (휴대폰 세로 390x844, 2배율)
// 유튜브는 가짜 플레이어, 썸네일은 가짜 그림으로 대신한다 (harness.mjs 참고).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, startStatic, startBroker, spawn, createInvite, enter, toHall, sleep, ROOT } from './harness.mjs';

const OUT = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const SCALE = Number(process.env.SCALE || 2);
const site = await startStatic();
const broker = await startBroker();
const browser = await chromium.launch();
const errors = [];
const base = `${site.url}index.html?brokers=${encodeURIComponent(broker.url)}`;
const mk = (name, av, extra = {}) => spawn(browser, { name, av, scale: SCALE, errors, ytMock: { duration: 30 }, ...extra }).then((p) => p.page);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

try {
  const a = await mk('졸린 팝콘 도둑', [0, 0, 0, 0]);

  // 1) 영화관 앞
  await a.goto(base);
  await a.waitForSelector('.home');
  await sleep(700);
  await shot(a, '01-home');

  // 2) 예매
  await a.click('.home .btn-xl');
  await a.waitForSelector('.booking');
  await a.fill('input[type=url]', 'https://youtu.be/WhWc3b3KhnY');
  await a.dispatchEvent('input[type=url]', 'change');
  await a.waitForSelector('.note.good', { timeout: 15000 });
  await a.fill('input[aria-label="약속 이름"]', '금요일 심야 영화');
  await a.dispatchEvent('input[aria-label="약속 이름"]', 'input');
  await a.click('.chip:has-text("30분 뒤")');
  await sleep(300);
  await shot(a, '02-booking');

  // 3) 표
  await a.click('.booking .btn-xl');
  await a.waitForSelector('.ticket');
  await a.waitForSelector('.sheet');
  await sleep(500);
  await shot(a, '03-ticket-share');
  await a.click('.sheet .btn-ghost');
  await sleep(400);
  await shot(a, '04-ticket');

  // 4) 로비 — 곧 시작하는 약속을 따로 만들어 네 명이 모인다
  const code = await createInvite(a, { inMs: 45000, dur: 30, title: '금요일 심야 영화' });
  const b = await mk('심야의 조조 관객', [1, 3, 5, 1]);
  const c = await mk('눈물 많은 올빼미', [2, 4, 6, 2]);
  const d = await mk('맨 뒷줄 졸음꾼', [3, 5, 3, 3]);
  const all = [a, b, c, d];
  for (const p of all) await enter(p, base, code);
  const tap = async (page, x, y) => {
    const box = await page.locator('.lobby-stage').boundingBox();
    await page.mouse.click(box.x + (x / 390) * box.width, box.y + (y / 560) * box.height);
  };
  await tap(b, 150, 320); await tap(c, 255, 400); await tap(d, 190, 500); await tap(a, 120, 420);
  await b.evaluate(() => window.__dsy.room.update({ p: 0, pl: 20 }));
  await c.evaluate(() => window.__dsy.room.update({ dk: 1 }));
  await sleep(2600);
  await b.click('.emote-btn >> nth=1');
  await c.click('.phrase-btn >> nth=2');
  await sleep(500);
  await shot(a, '05-lobby');

  // 5) 매점
  await a.click('.hs-snack');
  await a.waitForSelector('.menu-grid', { timeout: 8000 });
  await sleep(450);
  await shot(a, '06-snack');
  await a.click('.menu-item >> nth=1');
  await sleep(900);

  // 6) 검표
  await a.click('.hs-gate');
  await a.waitForSelector('.tear-ticket', { timeout: 8000 });
  await sleep(450);
  await shot(a, '07-gate');
  await a.click('.sheet .btn-primary');
  await a.waitForSelector('.room.hall', { timeout: 8000 });
  for (const p of [b, c, d]) await toHall(p);
  await sleep(1700);

  // 7) 상영관: 자리 잡기 → 상영 → 엔딩
  await a.click('.seat >> nth=14'); await b.click('.seat >> nth=15'); await c.click('.seat >> nth=9'); await d.click('.seat >> nth=17');
  await sleep(1200);
  await shot(a, '08-hall-pre');
  await a.waitForSelector('.mock-yt', { timeout: 60000 });
  await sleep(2600);
  await b.click('.emote-btn >> nth=1');
  await c.click('.phrase-btn >> nth=1');
  for (let i = 0; i < 4; i++) { await a.click('.pop-btn'); await sleep(150); }
  await sleep(300);
  await shot(a, '09-hall-show');
  await a.waitForSelector('.end', { timeout: 60000 });
  await sleep(7000);
  await shot(a, '10-hall-end');
  await a.click('.hall-strip .btn-primary');
  await a.waitForSelector('.sheet .stub');
  await sleep(1200);
  await shot(a, '11-souvenir');
  await a.click('.sheet .btn-primary');

  // 8) 티켓북
  await a.goto(base + '#/book');
  await a.waitForSelector('.book');
  await sleep(500);
  await shot(a, '12-book');

  // 9) 넓은 화면(데스크톱)에서의 상영관
  const w = await mk('큰 화면 관객', [1, 1, 1, 0], { viewport: { width: 1280, height: 760 }, mobile: false, ytMock: { duration: 600 } });
  await w.goto(base); await w.waitForSelector('.home');
  const code2 = await createInvite(w, { inMs: -20000, dur: 600, title: '주말 낮 영화' });
  await enter(w, base, code2);
  await w.waitForSelector('.mock-yt', { timeout: 15000 });
  await sleep(1800);
  await w.click('.seat >> nth=8');
  await sleep(2500);
  await shot(w, '13-hall-wide');
} catch (e) {
  console.error('SHOTS FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errors.length) { console.log('브라우저 오류:'); [...new Set(errors)].forEach((e) => console.log('  ' + e)); }
  await browser.close();
  await site.close();
  await broker.close();
}
console.log('saved →', OUT);
