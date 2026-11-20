// 링크를 공유할 때 뜨는 미리보기 그림(og.png, 1200×630)을 게임 화면으로 만든다.
//   node tests/og.mjs   → og.png
// 해 질 녘 트리 곁의 펭귄을 찍고, 그 위에 "뽀드득"과 한 줄 소개를 얹는다. (그림을 바꾸고 싶을 때만 다시 돌린다)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStatic, launch, open, sleep } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = await startStatic(); const browser = await launch(); const errors = [];
try {
  const { page } = await open(browser, site.url, { query: 't=16:55&speed=0&server=off&xmas=1&look=scarf&color=0', errors, viewport: { width: 1200, height: 630 }, scale: 1 });
  await page.addStyleTag({ content: `
    #hud, #stick, #act, #slide, #angel, #flap, #zoom, #mute, #shot, #closet, #coach, #toast, #catch, #ticker, .peer-name, .peer-say, .seal-say { display: none !important; }
    #og { position: fixed; left: 64px; top: 70px; z-index: 50; font-family: NanumSquareRound, sans-serif; color: #fff; text-shadow: 0 4px 18px rgba(40, 50, 110, 0.45); }
    #og b { display: block; font-size: 132px; font-weight: 900; letter-spacing: 4px; line-height: 1; }
    #og span { display: inline-block; margin-top: 18px; padding: 12px 24px; border-radius: 999px; font-size: 34px; font-weight: 800; color: #3b4a7a; text-shadow: none; background: rgba(255, 255, 255, 0.88); box-shadow: 0 8px 24px rgba(40, 50, 110, 0.18); }` });
  await sleep(1500);
  await page.evaluate(() => {
    const s = window.__snow; s.teleport(4.2, 9.5); s.me.yaw = -2.5; s.me.camYaw = -2.35; s.me.camDist = 8.5; s.me.camPitch = 0.12; if (s.flakes && s.flakes.clear) s.flakes.clear();
    const d = document.createElement('div'); d.id = 'og'; d.innerHTML = '<b>뽀드득</b><span>펭귄이 되어 눈밭을 뽀드득 걸어요 ❄️</span>'; document.body.append(d);
  });
  await sleep(2500);
  await page.screenshot({ path: path.join(root, 'og.png') });
  console.log('og.png', errors.length ? errors : 'ok');
} finally { await browser.close(); await site.close(); }
