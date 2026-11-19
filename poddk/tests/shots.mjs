// 화면 캡처: 여러 시각의 눈밭을 찍는다 → tests/shots/*.png
//   node shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startStatic, launch, open, sleep, ROOT } from './harness.mjs';

const OUT = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const site = await startStatic();
const browser = await launch();
const errors = [];
const walk = async (page, x, y, ms) => { await page.evaluate(([a, b, t]) => { const s = window.__snow; s.controls.debugMove(a, b); s.sim(t / 1000); s.controls.debugMove(0, 0); }, [x, y, ms]); await sleep(500); };
try {
  const jobs = [
    ['01-start', 't=17:05&speed=0&look=scarf&color=0', { enter: false }],
    ['02-sunset', 't=16:35&speed=0&look=scarf&color=0', { walk: [0.25, 1, 5000] }],
    ['03-noon', 't=13:20&speed=0&look=blanket&color=5', { walk: [-0.3, 1, 4000] }],
    ['04-dawn', 't=07:35&speed=0&look=scarf&color=3', { walk: [0, 1, 4000] }],
    ['05-night', 't=21:45&speed=0&look=blanket&color=2', { walk: [0.2, 1, 4000] }],
    ['06-blizzard', 't=03:12&speed=0&look=scarf&color=0', { walk: [0, 1, 3000] }],
    ['07-angel', 't=15:40&speed=0&look=scarf&color=4', { walk: [0.5, 1, 2500], angel: true }],
    ['08-wide-sunset', 't=16:50&speed=0&look=blanket&color=0', { walk: [0.4, 1, 5000], viewport: { width: 1280, height: 720 }, mobile: false }],
    ['09-wide-night-tree', 't=21:40&speed=0&look=scarf&color=0', { walk: [0, 0, 100], viewport: { width: 1280, height: 720 }, mobile: false, far: true }],
  ];

  for (const [name, query, o] of jobs) {
    const { ctx, page } = await open(browser, site.url, { query, enter: o.enter !== false, errors, scale: 2, viewport: o.viewport, mobile: o.mobile });
    await sleep(600);
    if (o.far) await page.evaluate(() => { const s = window.__snow; s.teleport(3, 17); s.me.camDist = 13; s.me.camPitch = 0.16; });
    if (o.walk) await walk(page, ...o.walk);
    if (o.angel) { await page.evaluate(() => { window.__snow.angel(); window.__snow.sim(4.0); }); await sleep(1800); await page.screenshot({ path: path.join(OUT, name + '-lying.png') }); await page.evaluate(() => window.__snow.sim(5.2)); await walk(page, 0, 1, 2600); }
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('saved', name);
    await ctx.close();
  }
} catch (e) {
  console.error('SHOTS FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errors.length) { console.log('브라우저 오류:'); [...new Set(errors)].forEach((e) => console.log('  ' + e)); }
  await browser.close();
  await site.close();
}
