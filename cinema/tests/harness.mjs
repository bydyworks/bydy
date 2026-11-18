// 시험 공용 도구: 정적 서버 + 로컬 MQTT 브로커(웹소켓) + 브라우저 준비.
// 바깥 네트워크 없이 돌아가도록 유튜브 API·썸네일·폰트 요청을 가로채 로컬 대역으로 바꾼다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// playwright 는 전역(NODE_PATH)에 깔려 있을 수 있어 require 로 찾는다
export const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');           // cinema/
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.json': 'application/json' };

/** cinema/ 를 내려주는 정적 서버. Date 헤더는 node 가 자동으로 붙인다(시계 맞추기 시험에 쓰인다). */
export function startStatic({ clockSkewMs = 0 } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = path.join(ROOT, decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (err, data) => {
        const headers = { 'Cache-Control': 'no-store' };
        if (clockSkewMs) headers.Date = new Date(Date.now() + clockSkewMs).toUTCString();
        if (err) { res.writeHead(404, headers).end('not found'); return; }
        res.writeHead(200, { ...headers, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) }));
  });
}

/** 웹소켓으로 접속하는 로컬 MQTT 브로커 (aedes) */
export async function startBroker(port = 0) {
  const { Aedes } = await import('aedes');
  const { WebSocketServer, createWebSocketStream } = await import('ws');
  const broker = await Aedes.createBroker();
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => broker.handle(createWebSocketStream(ws), req));
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const actual = server.address().port;
  return {
    url: `ws://127.0.0.1:${actual}`,
    port: actual,
    close: async () => {
      for (const c of wss.clients) c.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await new Promise((r) => broker.close(r));
    },
  };
}

const THUMB = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#274060"/><stop offset="1" stop-color="#8e3b5e"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/><circle cx="370" cy="110" r="46" fill="#ffd766" opacity=".9"/><path d="M0 300 L120 200 L220 270 L330 180 L480 290 V360 H0Z" fill="#17142b" opacity=".75"/><text x="24" y="60" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff4dc">SAMPLE FILM</text></svg>`);

/**
 * 브라우저 컨텍스트에 가로채기를 건다: 가짜 유튜브, 가짜 썸네일, 로컬 폰트.
 * @param {import('playwright').BrowserContext} ctx
 */
export async function wire(ctx, { ytMock = {} } = {}) {
  const mockSrc = fs.readFileSync(path.join(here, 'mock-yt.js'), 'utf8');
  await ctx.addInitScript((cfg) => { window.__ytMock = Object.assign(window.__ytMock || {}, cfg); }, ytMock);
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: mockSrc }));
  await ctx.route('https://www.youtube.com/oembed**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: THUMB }));
  // Pretendard: CDN 대신 npm 패키지에서 (없으면 그냥 실패시키고 시스템 글꼴로)
  let fontDir = null;
  try { fontDir = path.join(path.dirname(require.resolve('pretendard/package.json')), 'dist/web/static'); } catch { /* 없음 */ }
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => {
    const m = /\/dist\/web\/static\/(.+)$/.exec(new URL(r.request().url()).pathname);
    if (!fontDir || !m) return r.abort();
    let file = path.join(fontDir, m[1]);
    if (m[1] === 'pretendard.min.css') file = path.join(fontDir, 'pretendard.css');
    if (!fs.existsSync(file)) return r.abort();
    return r.fulfill({ contentType: MIME[path.extname(file)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
}

/** 결과 모으기 */
export function reporter() {
  const results = [];
  return {
    async check(name, fn) {
      const t = Date.now();
      try { await fn(); results.push({ name, ok: true }); console.log(`  PASS  ${name} (${Date.now() - t}ms)`); }
      catch (e) { results.push({ name, ok: false, err: e }); console.log(`  FAIL  ${name}\n        ${String(e && e.message || e).split('\n').join('\n        ')}`); }
    },
    done() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length}/${results.length} passed`);
      return failed.length === 0;
    },
  };
}

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 페이지의 콘솔 오류를 모은다 */
export function watchErrors(page, bag, label) {
  page.on('pageerror', (e) => bag.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // 바깥 네트워크 차단은 시험 대상이 아니다. 중계 서버를 일부러 끊는 시험에서는 브라우저가 웹소켓 실패를 콘솔에 적는다 — 그것도 앱의 오류가 아니다.
    if (/Failed to load resource|net::ERR_|fonts\.g|WebSocket connection to '[^']*' failed/.test(text)) return;
    bag.push(`[${label}] console.error: ${text}`);
  });
}

/**
 * 관객 한 명 = 브라우저 컨텍스트 하나 (저장소가 분리된 "다른 기기").
 * @returns {Promise<{ ctx: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
export async function spawn(browser, { name, av = [0, 0, 0, 0], viewport = { width: 390, height: 844 }, scale = 1, ytMock = {}, errors = [], clockSkewMs = 0, mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, hasTouch: mobile, isMobile: mobile, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await wire(ctx, { ytMock });
  await ctx.addInitScript(([n, a, skew]) => {
    if (n && !localStorage.getItem('dsy.me')) localStorage.setItem('dsy.me', JSON.stringify({ device: 'dev-' + n, name: n, av: a }));
    if (skew) {                                   // 시계가 틀린 기기 흉내
      const real = Date.now.bind(Date);
      Date.now = () => real() + skew;
    }
  }, [name || '', av, clockSkewMs]);
  const page = await ctx.newPage();
  watchErrors(page, errors, name || 'page');
  return { ctx, page };
}

/**
 * 호스트의 브라우저 안에서 약속(초대 링크)을 만든다. UI 를 거치지 않으므로 상영 시각을 초 단위로 정할 수 있다.
 * @returns {Promise<string>} 초대 코드
 */
export function createInvite(page, { inMs = 8000, dur = 30, title = '시험 상영', vid = 'aaaaaaaaaaa', withKey = true } = {}) {
  return page.evaluate(async ({ inMs, dur, title, vid, withKey }) => {
    const L = await import('./js/link.js');
    const S = await import('./js/sign.js');
    const U = await import('./js/util.js');
    const D = await import('./js/data.js');
    let hk = '';
    const room = U.randomId(16);
    if (withKey) {
      const key = await S.generateHostKey();
      hk = key.publicKey;
      localStorage.setItem('dsy.host.' + room, JSON.stringify({ jwk: key.privateJwk }));
    }
    const me = JSON.parse(localStorage.getItem('dsy.me') || '{}');
    const scr = L.normalizeScreening({ room, vid, at: Date.now() + inMs, title, dur, host: me.name || '', hk });
    D.rememberScreening(scr, true);
    return L.encodeInvite(scr);
  }, { inMs, dur, title, vid, withKey });
}

/** 초대 링크로 들어가 입장 버튼을 누른다 → 로비(또는 상영 중이면 상영관) */
export async function enter(page, base, code) {
  await page.goto(`${base}#/s/${code}`);
  await page.waitForSelector('.ticket');
  await page.click('.ticket-actions .btn-xl');
  await page.waitForSelector('.room.lobby, .room.hall');
}

/** 로비 → 검표 → 상영관 */
export async function toHall(page) {
  if (await page.locator('.room.hall').count()) return;
  await page.click('.hs-gate');
  await page.waitForSelector('.tear-ticket', { timeout: 10000 });
  await page.click('.sheet .btn-primary');
  await page.waitForSelector('.room.hall', { timeout: 10000 });
}

/** 방 상태 들여다보기 */
export const peek = (page) => page.evaluate(() => {
  const r = window.__dsy && window.__dsy.room;
  if (!r) return null;
  const pl = (window.__ytPlayers || []).filter((p) => !p.destroyed).pop();
  return {
    self: { ...r.self },
    peers: Array.from(r.peers.values()).map((p) => ({ id: p.id, ...p.st })),
    ctl: { ...r.ctl },
    now: r.now(),
    net: r.net.connected,
    isHost: r.isHost,
    player: pl ? { t: pl.getCurrentTime(), state: pl.state, muted: pl.muted, rate: pl.rate, seeks: pl.seeks.length } : null,
    seats: Array.from(document.querySelectorAll('.seat')).map((s) => s.dataset.state || ''),
    lights: (document.querySelector('.room.hall') || {}).dataset ? document.querySelector('.room.hall').dataset.lights : null,
  };
});

/** 조건이 참이 될 때까지 기다린다 */
export async function until(fn, { timeout = 10000, every = 150, what = 'condition' } = {}) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}` + (last instanceof Error ? `: ${last.message}` : ''));
    await sleep(every);
  }
}
