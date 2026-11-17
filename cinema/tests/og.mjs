// 링크 미리보기용 그림(og.png, 1200x630)을 그림(js/art.js)에서 뽑아낸다:  node og.mjs
import path from 'node:path';
import { chromium, startStatic, wire, ROOT } from './harness.mjs';

const site = await startStatic();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await wire(ctx);
const page = await ctx.newPage();
await page.goto(site.url + 'index.html');
await page.waitForSelector('.home');
await page.evaluate(async () => {
  const A = await import('./js/art.js');
  document.body.innerHTML = `
    <div style="width:1200px;height:630px;display:flex;align-items:center;background:#12172f;overflow:hidden;font-family:Pretendard,sans-serif">
      <div id="art" style="width:660px;flex:none;margin-left:-10px"></div>
      <div style="flex:1;padding:0 56px 0 28px;color:#fbf3e0">
        <div style="font-family:'Black Han Sans',Pretendard,sans-serif;font-size:92px;line-height:1.05;color:#f2c95c">동시상영</div>
        <div style="font-size:34px;font-weight:700;margin-top:10px">온라인 영화관</div>
        <div style="font-size:30px;line-height:1.5;margin-top:34px;color:#c9cde6;word-break:keep-all">약속 잡고, 팝콘 사고, 자리 잡고.<br>따로 앉아, 같이 봅니다.</div>
      </div>
    </div>`;
  document.getElementById('art').innerHTML = A.marqueeSVG();
  document.querySelector('#art svg').style.cssText = 'width:100%;height:auto;display:block';
  document.querySelectorAll('.bulb,.star').forEach((n) => { n.style.animation = 'none'; });
  await document.fonts.ready;
});
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(ROOT, 'og.png') });
await browser.close();
await site.close();
console.log('saved', path.join(ROOT, 'og.png'));
