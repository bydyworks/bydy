// 시험 도구: 폴더를 그대로 내주는 작은 서버와, 3D 를 그릴 수 있게 띄운 브라우저.
// 실제 주소(…/bydy/poddk/)처럼 저장소 맨 위를 내주고, 게임은 그 아래 /poddk/ 에서 연다.
// Playwright 는 이 환경에 미리 깔려 있는 것을 쓴다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(ROOT, '..');          // 저장소 맨 위 (GitHub Pages 가 내주는 곳)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg', '.png': 'image/png', '.json': 'application/json' };

export async function startStatic() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    let file = path.normalize(path.join(SITE, p));
    const inside = file === SITE || file.startsWith(SITE + path.sep);
    if (inside && !p.endsWith('/') && fs.existsSync(file) && fs.statSync(file).isDirectory()) {      // 폴더 이름만 적으면 끝에 / 를 붙여 다시 보낸다 (GitHub Pages 와 같게)
      res.writeHead(301, { location: p + '/' + query }); res.end(); return;
    }
    if (p.endsWith('/')) file = path.join(file, 'index.html');
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  return { origin, url: origin + path.basename(ROOT) + '/', close: () => new Promise((r) => server.close(r)) };
}

/** 그래픽 카드가 없어도 3D 를 그리도록 띄운다 */
export const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

/** 페이지를 열고 준비될 때까지 기다린다. opts: { query, viewport, mobile, enter } */
export async function open(browser, base, { query = '', viewport = { width: 390, height: 844 }, mobile = true, enter = true, scale = 1, errors = [] } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, hasTouch: mobile, isMobile: mobile, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + 'index.html' + (query ? '?' + query : ''));
  await page.waitForFunction(() => window.__snow && window.__snow.ready, null, { timeout: 60000 });
  if (enter) { await page.click('#enter'); await page.waitForFunction(() => window.__snow.started); }
  return { ctx, page };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export async function until(fn, { timeout = 15000, step = 100, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + what);
    await sleep(step);
  }
}
