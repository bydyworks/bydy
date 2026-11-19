// 뽀드득(poddk) 자동 점검.  node smoke.mjs [이름에 들어간 글자]
// 실제 브라우저(그래픽 카드 없이)로 띄워 걷기·발자국·소리·카메라·눈 천사·하루의 흐름·저장을 확인한다.
// 느린 기기에서도 결과가 같도록, 걷는 시간은 __snow.sim(초) 으로 한꺼번에 흘려보낸다.
import { startStatic, launch, open, sleep, assert, until } from './harness.mjs';

const only = process.argv[2] || '';
const site = await startStatic();
const browser = await launch();
const errors = [];
const results = [];
const opened = [];

async function page(query = 't=14:00&speed=0&look=scarf&color=0', opts = {}) {
  const o = await open(browser, site.url, { query, errors, ...opts });
  opened.push(o.ctx);
  return o.page;
}
const snow = (p, fn, arg) => p.evaluate(fn, arg);
/** 조이스틱을 (x, y) 로 민 채 sec 초를 흘려보낸다 */
const walk = (p, x, y, sec) => snow(p, ([a, b, t]) => { const s = window.__snow; s.controls.debugMove(a, b); s.sim(t); s.controls.debugMove(0, 0); }, [x, y, sec]);
const state = (p) => snow(p, () => { const s = window.__snow; return { x: s.me.x, z: s.me.z, yaw: s.me.yaw, camYaw: s.me.camYaw, camPitch: s.me.camPitch, camDist: s.me.camDist, snow: s.me.snow, angel: !!s.me.angel, prints: s.tracks.printCount, angels: s.tracks.angelCount, alive: s.tracks.alive, audio: { ...s.audio }, snowfall: s.snowfall }; });
/** 손가락·마우스 이벤트를 직접 보낸다 */
const pointer = (p, type, id, x, y, kind = 'touch') => snow(p, ([t, i, px, py, k]) => {
  document.querySelector('#touch').dispatchEvent(new PointerEvent(t, { pointerId: i, pointerType: k, clientX: px, clientY: py, bubbles: true, cancelable: true, isPrimary: i === 1 }));
}, [type, id, x, y, kind]);

/** 실제 프레임으로는 시간이 흐르지 않게 한다 (그 뒤로는 sim 으로만 흐른다) */
const byHand = (p) => snow(p, () => { window.__snow.manual = true; });
/** 첫 낚시 구멍 곁(트리 쪽으로 1.8 떨어진 자리)으로 옮긴다 */
const toHole = (p) => snow(p, () => { const s = window.__snow, h = s.place.hole, d = Math.hypot(h.x, h.z); s.teleport(h.x - h.x / d * 1.8, h.z - h.z / d * 1.8); s.me.idle = 0; });

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try { await fn(); results.push([true, name]); console.log(`  PASS  ${name} (${Date.now() - t0}ms)`); } catch (e) { results.push([false, name]); console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
  while (opened.length) await opened.pop().close().catch(() => {});
}

try {
  console.log('\n■ 들어가기');
  await test('처음 화면에서 [눈 밟으러 가기]를 누르면 눈밭에 들어가고, 소리 다섯 개가 모두 준비된다', async () => {
    const p = await page(undefined, { enter: false });
    assert(await p.isVisible('#enter'), '시작 버튼이 안 보인다');
    assert(!(await snow(p, () => window.__snow.started)), '누르기 전에 시작됐다');
    await p.click('#enter');
    await until(async () => (await state(p)).audio.loaded.length === 5, { what: '소리 5개', timeout: 20000 });
    const s = await state(p);
    assert(s.audio.started && s.audio.failed.length === 0, '소리 준비 실패: ' + JSON.stringify(s.audio));
    assert(await p.evaluate(() => getComputedStyle(document.querySelector('#angel')).opacity === '1' || document.body.classList.contains('in')), '버튼이 나타나지 않았다');
    assert((await p.textContent('#clock')).includes('오후 2:00'), '시각 표시: ' + await p.textContent('#clock'));
  });

  await test('들어올 때 목도리/담요와 색이 무작위로 정해지고, 같은 탭에서 새로고침하면 그대로다', async () => {
    const looks = [];
    for (let i = 0; i < 6; i++) {
      const p = await page('t=14:00&speed=0', { enter: false });
      const look = await snow(p, () => window.__snow.look);
      assert(look.scarf !== look.blanket, '목도리와 담요 중 하나여야 한다: ' + JSON.stringify(look));
      assert(/^#[0-9a-f]{6}$/.test(look.color), '색: ' + look.color);
      looks.push(JSON.stringify(look));
      if (i === 0) { await p.reload(); await p.waitForFunction(() => window.__snow && window.__snow.ready); assert(JSON.stringify(await snow(p, () => window.__snow.look)) === looks[0], '새로고침하니 차림이 바뀌었다'); }
      await opened.pop().close();       // 창을 여럿 띄워 두면 느려진다
    }
    assert(new Set(looks).size >= 2, '여섯 번 모두 같은 차림: ' + looks[0]);
  });

  await test('처음 화면은 무엇을 하는 곳인지 알려 주고, 들어가면 걷는 법과 둘러보는 법이 화면에 잠깐 보였다가 해 보면 사라진다', async () => {
    const p = await page(undefined, { enter: false });
    const card = await p.evaluate(() => ({ say: document.querySelector('.start-card .say').textContent, button: document.querySelector('#enter').textContent.trim(), hint: document.querySelector('.start-card .hint').textContent.trim(), title: document.querySelector('.start-card h1').textContent.trim(), sub: document.querySelector('.start-card .sub'), tab: document.title, share: document.querySelector('meta[property="og:description"]').content }));
    const SAYINGS = ['우연히 뽀드득 명당을 발견했다!오늘 산책은 여기로 정했어.', '뽀드득 소리가 딱 좋은 눈밭이다!조금만 더 놀다 가야지.', '아무도 안 밟은 새하얀 눈밭이잖아?내 발자국부터 남겨봐야지.', '뒤뚱뒤뚱 걷다 보니 눈밭을 찾았네.여기 눈, 소리가 유난히 좋잖아?'];
    assert(card.title === '뽀드득' && card.sub === null && SAYINGS.includes(card.say) && card.button === '눈 밟으러 가기' && card.hint.includes('소리'), '처음 화면의 글: ' + JSON.stringify(card));
    // 제목 아래의 한마디는 올 때마다 넷 가운데 하나이고, 두 줄로 나온다. 주소에 ?say=3 처럼 붙이면 그 문장이 나온다
    for (const n of [1, 2, 3, 4]) {
      const q = await page('t=14:00&speed=0&say=' + n, { enter: false });
      const say = await q.evaluate(() => { const el = document.querySelector('.start-card .say'); return { text: el.textContent, n: el.dataset.n, br: el.querySelectorAll('br').length, lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) }; });
      await q.close();                                                    // (화면을 여럿 열어 두면 그리는 일이 겹쳐 느려진다)
      assert(say.text === SAYINGS[n - 1] && say.n === String(n) && say.br === 1 && say.lines === 2, n + '번째 한마디: ' + JSON.stringify(say));
    }
    const seen = new Set();
    for (let i = 0; i < 24 && seen.size < 3; i++) { await p.reload(); await p.waitForFunction(() => window.__snow && window.__snow.ready); seen.add(await p.evaluate(() => document.querySelector('.start-card .say').dataset.n)); }
    assert(seen.size >= 3, '한마디가 올 때마다 바뀌지 않는다: ' + [...seen]);
    assert(card.tab === '뽀드득' && card.share.includes('눈'), '탭 제목과 공유 글에도 눈 이야기인 것이 드러나야 한다: ' + JSON.stringify(card));
    const tips = () => p.evaluate(() => { const on = (q) => Number(getComputedStyle(document.querySelector(q)).opacity) > 0.5; return { walk: document.body.classList.contains('coach-walk'), look: document.body.classList.contains('coach-look'), walkText: document.querySelector('#coach .walk b').textContent, lookText: document.querySelector('#coach .look b').textContent, seen: [on('#coach .walk'), on('#coach .look')] }; });
    let t = await tips();
    assert(!t.walk && !t.look, '들어가기 전부터 길잡이가 보인다');
    await p.click('#enter');
    await until(async () => (await tips()).seen.every(Boolean), { what: '길잡이' });
    t = await tips();
    assert(t.walkText === '밀어서 걷기' && t.lookText === '끌어서 둘러보기', '휴대폰의 길잡이 글: ' + JSON.stringify(t));
    assert((await p.textContent('#toast')) === '', '길잡이 대신 긴 안내 글이 떴다');
    await walk(p, 0, 1, 1.2);                                             // 걸어 보면 걷기 길잡이가 사라진다
    t = await tips();
    assert(!t.walk && t.look, '걸었는데 걷기 길잡이가 남았거나, 둘러보기 길잡이까지 사라졌다: ' + JSON.stringify(t));
    await pointer(p, 'pointerdown', 7, 300, 300); await pointer(p, 'pointermove', 7, 200, 320); await pointer(p, 'pointerup', 7, 200, 320);
    await walk(p, 0, 0, 0.1);
    t = await tips();
    assert(!t.walk && !t.look, '둘러봤는데 길잡이가 남았다: ' + JSON.stringify(t));
    // PC 에서는 글이 다르다
    const q = await page(undefined, { mobile: false, viewport: { width: 1000, height: 640 } });
    t = await q.evaluate(() => ({ walkText: document.querySelector('#coach .walk b').textContent, lookText: document.querySelector('#coach .look b').textContent }));
    assert(t.walkText === '방향키로 걷기' && t.lookText === '마우스로 끌어 둘러보기', 'PC 의 길잡이 글: ' + JSON.stringify(t));
  });

  await test('글자는 함께 실어 둔 나눔스퀘어라운드 글꼴로 보인다 (밖에서 받아 오는 것 없이)', async () => {
    const asked = [];
    const p = await page();
    p.on('request', (r) => asked.push(r.url()));
    await p.evaluate(() => document.fonts.ready);
    const f = await p.evaluate(async () => {
      await Promise.all([document.fonts.load("800 16px 'NanumSquareRound'", '뽀드득 12:30'), document.fonts.load("700 16px 'NanumSquareRound'", '큰 눈은')]);
      const used = (q) => getComputedStyle(document.querySelector(q)).fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      return { heavy: document.fonts.check("800 16px 'NanumSquareRound'", '뽀드득 12:30'), bold: document.fonts.check("700 16px 'NanumSquareRound'", '큰 눈은'), loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/['"]/g, '') + ' ' + x.weight), clock: used('#clock'), toast: used('#toast'), enter: used('#enter'),
        outside: performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith(location.origin)) };
    });
    assert(f.heavy && f.bold && f.loaded.some((x) => x.startsWith('NanumSquareRound 800')) && f.loaded.some((x) => x.startsWith('NanumSquareRound 700')), '글꼴이 실려 오지 않았다: ' + JSON.stringify(f));
    assert(f.clock === 'NanumSquareRound' && f.toast === 'NanumSquareRound' && f.enter === 'NanumSquareRound', '글자가 그 글꼴로 그려지지 않는다: ' + JSON.stringify(f));
    assert(f.outside.length === 0, '밖에서 받아 오는 것이 있다: ' + f.outside.join(', '));
  });

  await test('위쪽 표시의 그림: 시각은 낮에 해, 해 질 녘에 지평선의 해, 밤에 달. 눈 소식은 평소에 눈송이, 폭설에 눈구름', async () => {
    const p = await page('t=13:20&speed=0');
    const icons = () => p.evaluate(() => { const on = (q) => getComputedStyle(document.querySelector(q)).display !== 'none'; return { sky: document.body.dataset.sky, storm: document.body.dataset.storm, day: on('.badge.time .day'), dusk: on('.badge.time .dusk'), night: on('.badge.time .night'), calm: on('.badge.snow .calm'), wild: on('.badge.snow .wild') }; });
    const at = async (time, sky) => { await snow(p, (t) => window.__snow.clock.setTime(t), time); await until(async () => (await icons()).sky === sky && (await p.textContent('#clock')).length > 3, { what: time + ' 의 그림' }); await sleep(700); return icons(); };
    let i = await at('13:20', 'day');
    assert(i.day && !i.dusk && !i.night && i.calm && !i.wild, '한낮: ' + JSON.stringify(i));
    i = await at('17:15', 'dusk');
    assert(!i.day && i.dusk && !i.night, '해 질 녘: ' + JSON.stringify(i));
    i = await at('07:25', 'dusk');
    assert(i.dusk, '해 뜰 녘: ' + JSON.stringify(i));
    i = await at('22:00', 'night');
    assert(!i.day && !i.dusk && i.night && i.calm, '밤: ' + JSON.stringify(i));
    i = await at('21:10', 'night');
    assert(i.storm === 'peak' && !i.calm && i.wild, '폭설: ' + JSON.stringify(i));
  });

  console.log('\n■ 걷기와 발자국');
  await test('걸으면 걸음마다 발자국이 남고 발소리가 난다 (새 눈 소리)', async () => {
    const p = await page();
    const a = await state(p);
    await walk(p, 0, 1, 4);
    const b = await state(p);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    assert(dist > 4.8 && dist < 5.3, '4초에 5단위쯤 걸어야 한다 (1초에 두 걸음 반): ' + dist.toFixed(2));
    assert(b.prints >= 9 && b.prints <= 10, '발자국 수: ' + b.prints);
    assert(b.audio.steps === b.prints, `발소리 ${b.audio.steps} ≠ 발자국 ${b.prints}`);
    assert(b.audio.packed === 0, '새 눈인데 다져진 눈 소리가 났다');
    assert(Math.abs(b.audio.stepLen - 0.8) < 0.01, '빨리 걸을 때 한 걸음 소리는 0.8초에서 끊어야 한다: ' + b.audio.stepLen);
    await until(async () => (await state(p)).alive === b.prints, { what: '발자국이 보임' });
    await walk(p, 0, 0.5, 2);                                           // 조이스틱을 반만 밀어 천천히 걸으면 소리를 더 길게 들려준다
    assert((await state(p)).audio.stepLen === 0.95, '천천히 걸을 때 한 걸음 소리: ' + (await state(p)).audio.stepLen);
  });

  await test('주소에 ?walk=1.05 를 붙이면 그 빠르기로 걷고, 범위를 벗어난 값이면 평소 빠르기로 걷는다', async () => {
    const go = async (extra) => {
      const p = await page('t=14:00&speed=0&look=scarf&color=0' + extra);
      const a = await state(p);
      await walk(p, 0, 1, 4);
      const b = await state(p);
      await opened.pop().close();
      return { dist: Math.hypot(b.x - a.x, b.z - a.z), prints: b.prints, steps: b.audio.steps, stepLen: b.audio.stepLen };
    };
    const slow = await go('&walk=1.05');
    assert(slow.dist > 4.1 && slow.dist < 4.3, 'walk=1.05 이면 4초에 4.2단위쯤 걸어야 한다: ' + slow.dist.toFixed(2));
    assert(slow.prints === 8 && slow.steps === 8 && slow.stepLen === 0.95, '발자국과 발소리: ' + JSON.stringify(slow));
    for (const bad of ['&walk=5', '&walk=abc']) {
      const d = await go(bad);
      assert(d.dist > 4.9 && d.dist < 5.1, bad + ' 는 평소 빠르기(4초에 5단위)여야 한다: ' + d.dist.toFixed(2));
    }
  });

  await test('이미 밟힌 길을 다시 걸으면 다져진 눈 소리가 난다', async () => {
    const p = await page();
    await walk(p, 0, 1, 4);
    await walk(p, 0, -1, 4);            // 온 길을 그대로 되돌아간다
    const s = await state(p);
    assert(s.audio.packed >= 3, '다져진 눈 소리가 거의 안 났다: ' + JSON.stringify(s.audio));
    assert(s.audio.fresh >= 7, '새 눈 소리: ' + s.audio.fresh);
  });

  await test('휴대폰: 화면 왼쪽을 누른 채 끌면 조이스틱이 생겨 걷는다', async () => {
    const p = await page();
    const a = await state(p);
    await pointer(p, 'pointerdown', 1, 90, 620);
    await pointer(p, 'pointermove', 1, 90, 540);
    assert(await p.evaluate(() => document.querySelector('#stick').style.opacity === '1'), '조이스틱이 안 보인다');
    await until(async () => { const b = await state(p); return Math.hypot(b.x - a.x, b.z - a.z) > 0.4; }, { what: '걷기', timeout: 30000 });
    await pointer(p, 'pointerup', 1, 90, 540);
    assert(await p.evaluate(() => document.querySelector('#stick').style.opacity === '0'), '손을 뗐는데 조이스틱이 남았다');
    const b = await state(p); await sleep(700); const c = await state(p);
    assert(Math.hypot(c.x - b.x, c.z - b.z) < 0.2, '손을 뗐는데 계속 걷는다');
  });

  await test('PC: 방향키로 걷고, 스페이스로 눈 천사를 만든다', async () => {
    const p = await page(undefined, { mobile: false, viewport: { width: 1000, height: 640 } });
    const a = await state(p);
    await p.keyboard.down('ArrowUp');
    await until(async () => { const b = await state(p); return Math.hypot(b.x - a.x, b.z - a.z) > 0.4; }, { what: '걷기', timeout: 30000 });
    await p.keyboard.up('ArrowUp');
    await p.keyboard.press('Space');
    assert((await state(p)).angel, '스페이스를 눌러도 눈 천사가 시작되지 않았다');
    // 마우스로 버튼을 누른 뒤의 스페이스도 눈 천사다 (방금 누른 버튼이 다시 눌리지 않는다)
    await walk(p, 0, 0, 9.5);
    assert(!(await state(p)).angel, '눈 천사가 끝나지 않았다');
    await p.click('#mute'); await p.click('#mute');
    await p.keyboard.press('Space');
    assert((await state(p)).angel && (await p.getAttribute('#mute', 'aria-pressed')) === 'false', '버튼을 누른 뒤의 스페이스가 눈 천사로 가지 않았다');
    // 키보드로 고른 버튼에서는 스페이스가 그 버튼만 누른다
    await walk(p, 0, 0, 9.5);
    await p.focus('#mute');
    await p.keyboard.press('Space');
    assert(!(await state(p)).angel && (await p.getAttribute('#mute', 'aria-pressed')) === 'true', '키보드로 고른 소리 버튼에서 스페이스: 소리만 꺼져야 한다');
  });

  await test('들판 끝과 나무 둥치는 지나갈 수 없다', async () => {
    const p = await page();
    await snow(p, () => { const s = window.__snow; s.teleport(0, 108); s.me.camYaw = 0; });      // 가장자리 근처에서 바깥(+Z)을 향해
    await walk(p, 0, 1, 6);
    let s = await state(p);
    assert(Math.hypot(s.x, s.z) <= 110.01, '들판 밖으로 나갔다: ' + Math.hypot(s.x, s.z).toFixed(2));
    assert(await p.evaluate(() => document.querySelector('#toast').classList.contains('show')), '끝에 닿았다는 안내가 없다');
    await snow(p, () => { const s = window.__snow; s.teleport(0, 6); s.me.camYaw = Math.PI; });   // 나무를 향해
    await walk(p, 0, 1, 8);
    s = await state(p);
    assert(Math.hypot(s.x, s.z) >= 1.89, '나무 속으로 들어갔다: ' + Math.hypot(s.x, s.z).toFixed(2));
  });

  console.log('\n■ 카메라');
  await test('끌면 둘러보고, 휠과 두 손가락으로 가까이·멀리 본다', async () => {
    const p = await page(undefined, { mobile: false, viewport: { width: 1000, height: 640 } });
    const a = await state(p);
    await pointer(p, 'pointerdown', 1, 600, 300, 'mouse');
    await pointer(p, 'pointermove', 1, 700, 340, 'mouse');
    await pointer(p, 'pointerup', 1, 700, 340, 'mouse');
    await walk(p, 0, 0, 0.1);
    const b = await state(p);
    assert(b.camYaw < a.camYaw - 0.3, '오른쪽으로 끌면 오른쪽을 봐야 한다: ' + (b.camYaw - a.camYaw).toFixed(2));
    assert(b.camPitch > a.camPitch + 0.05, '아래로 끌면 내려다봐야 한다');
    await p.mouse.move(500, 300); await p.mouse.wheel(0, 600);
    await walk(p, 0, 0, 0.1);
    const c = await state(p);
    assert(c.camDist > b.camDist * 1.3, '휠을 내리면 멀어져야 한다: ' + c.camDist.toFixed(2));
    for (let i = 0; i < 12; i++) await p.mouse.wheel(0, -900);
    await walk(p, 0, 0, 0.1);
    const d = await state(p);
    assert(d.camDist >= 3.19 && d.camDist < 3.4, '가장 가까운 거리에서 멈춰야 한다: ' + d.camDist.toFixed(2));
    // 두 손가락 오므리기 → 멀리
    await pointer(p, 'pointerdown', 5, 600, 300); await pointer(p, 'pointerdown', 6, 800, 300);
    await pointer(p, 'pointermove', 6, 700, 300);
    await pointer(p, 'pointerup', 5, 600, 300); await pointer(p, 'pointerup', 6, 700, 300);
    await walk(p, 0, 0, 0.1);
    const e = await state(p);
    assert(e.camDist > d.camDist * 1.8, '오므리면 멀어져야 한다: ' + e.camDist.toFixed(2));
    assert(Math.abs(e.camYaw - d.camYaw) < 0.01, '줌하는 동안 화면이 돌았다');
  });

  await test('두 손가락을 함께 대면 화면 왼쪽에서도 줌이 되고, 양손 엄지로 걷고 둘러보는 것은 그대로다', async () => {
    const p = await page();
    const stickShown = () => p.evaluate(() => document.querySelector('#stick').style.opacity === '1');
    const a = await state(p);
    // 화면 가운데 왼쪽에 두 손가락을 거의 동시에: 첫 손가락은 왼쪽 절반(조이스틱 자리)에 닿는다
    await snow(p, () => {
      const el = document.querySelector('#touch');
      const send = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
      send('pointerdown', 1, 150, 480); send('pointerdown', 2, 250, 400);
    });
    assert(!(await stickShown()), '두 손가락을 함께 댔는데 조이스틱이 나타났다');
    await pointer(p, 'pointermove', 2, 310, 350);                       // 벌린다 → 가까이
    await pointer(p, 'pointermove', 1, 100, 520);
    await pointer(p, 'pointerup', 1, 100, 520); await pointer(p, 'pointerup', 2, 310, 350);
    await walk(p, 0, 0, 0.1);
    const b = await state(p);
    assert(b.camDist < a.camDist * 0.75, '벌리면 가까워져야 한다: ' + a.camDist.toFixed(2) + ' → ' + b.camDist.toFixed(2));
    assert(Math.hypot(b.x - a.x, b.z - a.z) < 0.01 && Math.abs(b.camYaw - a.camYaw) < 0.01, '줌하는 동안 걷거나 화면이 돌았다');
    // 같은 두 자리에 오른쪽 손가락이 먼저 닿아도 똑같이 줌이다 (어느 손가락이 먼저 닿는지는 그때그때 다르다)
    await snow(p, () => {
      const el = document.querySelector('#touch');
      const send = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 3 }));
      send('pointerdown', 3, 250, 400); send('pointerdown', 4, 150, 480);
    });
    assert(!(await stickShown()), '오른쪽 손가락이 먼저 닿았더니 조이스틱이 나타났다');
    await pointer(p, 'pointermove', 3, 220, 425);                       // 오므린다 → 멀리
    await pointer(p, 'pointermove', 4, 180, 455);
    await pointer(p, 'pointerup', 3, 220, 425); await pointer(p, 'pointerup', 4, 180, 455);
    await walk(p, 0, 0, 0.1);
    const b2 = await state(p);
    assert(b2.camDist > b.camDist * 1.3, '오므리면 멀어져야 한다: ' + b.camDist.toFixed(2) + ' → ' + b2.camDist.toFixed(2));
    assert(Math.hypot(b2.x - b.x, b2.z - b.z) < 0.01 && Math.abs(b2.camYaw - b.camYaw) < 0.01, '오른쪽 손가락이 먼저 닿은 줌에서 걷거나 화면이 돌았다');
    Object.assign(b, b2);                                                // (아래의 비교는 지금 모습에서 이어 간다)
    // 양손 엄지: 멀리 떨어진 두 손가락은 함께 닿아도 왼쪽은 조이스틱, 오른쪽은 둘러보기
    await snow(p, () => {
      const el = document.querySelector('#touch');
      const send = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 3 }));
      send('pointerdown', 3, 80, 640); send('pointerdown', 4, 320, 640);
    });
    assert(await stickShown(), '양손 엄지인데 조이스틱이 사라졌다');
    await pointer(p, 'pointermove', 3, 80, 580); await pointer(p, 'pointermove', 4, 270, 640);
    await snow(p, () => window.__snow.sim(0.1));                        // (walk() 은 조이스틱을 놓아 버리므로 쓰지 않는다)
    const c = await state(p);
    assert(Math.abs(c.camDist - b.camDist) < 0.01 && Math.abs(c.camYaw - b.camYaw) > 0.1, '오른손 엄지로 둘러봐야 한다: ' + JSON.stringify({ d: c.camDist - b.camDist, yaw: c.camYaw - b.camYaw }));
    await until(async () => { const d = await state(p); return Math.hypot(d.x - b.x, d.z - b.z) > 0.3; }, { what: '왼손 엄지로 걷기', timeout: 30000 });
    await pointer(p, 'pointerup', 3, 80, 580); await pointer(p, 'pointerup', 4, 270, 640);
    // 이미 걷고 있는 엄지 곁에 손가락이 닿아도 조이스틱은 풀리지 않는다
    await pointer(p, 'pointerdown', 5, 120, 600); await pointer(p, 'pointermove', 5, 120, 560);
    await pointer(p, 'pointerdown', 6, 200, 520);
    assert(await stickShown(), '걷는 중인데 조이스틱이 풀렸다');
    await pointer(p, 'pointerup', 5, 120, 560); await pointer(p, 'pointerup', 6, 200, 520);
  });

  await test('가까이·멀리 버튼: 한 번 누르면 한 칸, 누르고 있으면 계속 움직이고, 끝에 닿으면 흐려진다', async () => {
    const p = await page();
    const a = await state(p);
    const press = (sel, type) => p.evaluate(([q, t]) => document.querySelector(q).dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true })), [sel, type]);
    await press('#zoom-in', 'pointerdown'); await press('#zoom-in', 'pointerup');
    await until(async () => (await state(p)).camDist < a.camDist * 0.82, { what: '한 칸 가까이' });
    const b = await state(p);
    assert(Math.abs(b.camDist / a.camDist - 0.8) < 0.02, '한 번 누르면 한 칸(0.8배): ' + (b.camDist / a.camDist).toFixed(3));
    assert(Math.hypot(b.x - a.x, b.z - a.z) < 0.01 && Math.abs(b.camYaw - a.camYaw) < 0.001, '버튼을 눌렀는데 걷거나 화면이 돌았다');
    await press('#zoom-out', 'pointerdown');                             // 누르고 있기
    await until(async () => (await state(p)).camDist >= 17.99, { what: '누르고 있으면 끝까지 멀어짐', timeout: 30000 });
    await until(async () => p.evaluate(() => document.querySelector('#zoom-out').disabled), { what: '가장 멀 때 멀리 버튼이 흐려짐' });
    await press('#zoom-out', 'pointerup');
    assert(!(await p.evaluate(() => document.querySelector('#zoom-in').disabled)), '가까이 버튼까지 흐려졌다');
    await press('#zoom-in', 'pointerdown');
    await until(async () => (await state(p)).camDist <= 3.21, { what: '끝까지 가까워짐', timeout: 30000 });
    await press('#zoom-in', 'pointerup');
    await until(async () => p.evaluate(() => document.querySelector('#zoom-in').disabled && !document.querySelector('#zoom-out').disabled), { what: '가장 가까울 때 가까이 버튼이 흐려짐' });
    const d = (await state(p)).camDist; await sleep(500);
    assert((await state(p)).camDist === d, '손을 뗐는데 계속 움직인다');
  });

  await test('걷는 동안에도 위쪽 정보 상자는 그대로 보인다', async () => {
    const p = await page();
    await byHand(p);
    const op = () => p.evaluate(() => Number(getComputedStyle(document.querySelector('#hud')).opacity));
    await until(async () => (await op()) > 0.95, { what: '들어온 직후의 위쪽 글' });
    await snow(p, () => { const s = window.__snow; s.controls.debugMove(0, 1); s.sim(4); });
    await sleep(900);
    assert((await op()) > 0.95, '걷는 동안 위쪽 정보 상자가 사라졌다');
    await snow(p, () => window.__snow.controls.debugMove(0, 0));
  });

  await test('글자와 그림은 바탕과 또렷이 구분된다 (작은 글자 4.5:1, 단추의 그림 3:1 이상 — 낮, 해 질 녘, 밤 모두)', async () => {
    const p = await page('t=13:20&speed=0');
    const measure = () => p.evaluate(() => {
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = (s) => { const [r, g, b] = rgb(s).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const glass = (c) => (/rgba\(.*,\s*0\)$/.test(c) || c === 'transparent' ? 'rgb(228, 240, 252)' : c);      // 얼음 유리: 바탕이 그림(그러데이션)이라 대표 색으로 본다
      const ratio = (a, b) => { const x = lum(glass(a)), y = lum(glass(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const css = (q, prop) => getComputedStyle(document.querySelector(q))[prop];
      const hud = css('#hud', 'backgroundColor');
      return {
        clock: ratio(css('#clock', 'color'), hud), storm: ratio(css('#storm', 'color'), hud), carol: ratio(css('#carol', 'color'), hud),
        toast: ratio(css('#toast', 'color'), css('#toast', 'backgroundColor')), zoom: ratio(css('#zoom-in', 'color'), css('#zoom', 'backgroundColor')),
        mute: ratio(css('#mute', 'color'), css('#mute', 'backgroundColor')), shot: ratio(css('#shot', 'color'), css('#shot', 'backgroundColor')), angel: ratio(css('#angel .angel-icon', 'fill'), css('#angel', 'backgroundColor')),
        badge: ratio(css('.badge.time', 'color'), css('.badge.time', 'backgroundColor')), snowBadge: ratio(css('.badge.snow', 'color'), css('.badge.snow', 'backgroundColor')), music: ratio(css('.badge.music', 'color'), css('.badge.music', 'backgroundColor')),
        say: ratio(css('.start-card .say', 'color'), css('.start-card', 'backgroundColor')), hint: ratio(css('.start-card .hint', 'color'), css('.start-card', 'backgroundColor')), enter: ratio(css('#enter', 'color'), css('#enter', 'backgroundColor')),
      };
    });
    for (const [time, sky] of [['13:20', 'day'], ['17:15', 'dusk'], ['22:00', 'night'], ['21:10', 'night']]) {
      await snow(p, (t) => window.__snow.clock.setTime(t), time);
      await until(async () => (await p.evaluate(() => document.body.dataset.sky)) === sky, { what: time + ' 의 하늘' });
      await sleep(1500);                                                   // 쪽지 색이 옮겨 가기를 기다린다
      const c = await measure();
      for (const k of ['clock', 'storm', 'carol', 'toast', 'say', 'hint', 'enter']) assert(c[k] >= 4.5, `${time} 글자 ${k} 의 대비 ${c[k].toFixed(2)}`);
      for (const k of ['zoom', 'mute', 'shot', 'angel', 'badge', 'snowBadge', 'music']) assert(c[k] >= 3, `${time} 그림 ${k} 의 대비 ${c[k].toFixed(2)}`);
    }
    // 낚시 단추의 세 모습도
    await toHole(p);
    await byHand(p);
    await snow(p, () => window.__snow.sim(0.1));
    const tone = () => p.evaluate(() => { const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const lum = (s) => { const [r, g, b] = s.match(/[\d.]+/g).slice(0, 3).map(Number).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const el = document.querySelector('#angel'), cs = getComputedStyle(el); const bg = /rgba\(.*,\s*0\)$/.test(cs.backgroundColor) ? 'rgb(228, 240, 252)' : cs.backgroundColor; const x = lum(cs.color), y = lum(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); });
    await until(async () => p.evaluate(() => document.querySelector('#angel').classList.contains('fish')), { what: '낚시 단추' });
    await sleep(300); assert((await tone()) >= 3, '낚시하기 단추의 대비 ' + (await tone()).toFixed(2));
    await snow(p, () => { const s = window.__snow; s.fishing.debug.biteIn(1.2); s.act(); s.sim(1.5); });
    await until(async () => p.evaluate(() => document.querySelector('#angel').classList.contains('quit')), { what: '그만두기 단추' });
    await sleep(300); assert((await tone()) >= 3, '그만두기 단추의 대비 ' + (await tone()).toFixed(2));
    await snow(p, () => window.__snow.sim(0.5));
    await until(async () => p.evaluate(() => document.querySelector('#angel').classList.contains('bite')), { what: '입질 단추' });
    await sleep(300); assert((await tone()) >= 3, '입질 단추의 대비 ' + (await tone()).toFixed(2));
  });

  await test('단추는 모두 같은 얼음 유리이고, 뒤의 눈밭이 비쳐 보인다', async () => {
    const p = await page();
    const looks = await p.evaluate(() => ['#mute', '#shot', '#angel'].map((q) => { const cs = getComputedStyle(document.querySelector(q)); return { q, bg: cs.backgroundImage.slice(0, 40), blur: cs.backdropFilter || cs.webkitBackdropFilter || '' }; }));
    assert(looks.every((l) => l.bg === looks[0].bg && l.bg.includes('gradient') && l.blur.includes('blur')), '단추의 모습이 서로 다르거나 유리가 아니다: ' + JSON.stringify(looks));
  });

  await test('단추를 누르면 살짝 커졌다가 제자리로 돌아온다', async () => {
    const p = await page();
    const popped = (q) => p.evaluate((sel) => document.querySelector(sel).classList.contains('pop'), q);
    for (const q of ['#mute', '#zoom-in', '#angel']) {
      await p.click(q);
      assert(await popped(q), q + ' 을 눌렀는데 튀지 않는다');
      await until(async () => !(await popped(q)), { what: q + ' 이 제자리로 돌아옴' });
    }
    const dur = await p.evaluate(() => { const el = document.querySelector('#shot'); el.classList.add('pop'); const d = getComputedStyle(el).animationDuration; el.classList.remove('pop'); return d; });
    assert(dur === '0.22s', '튀는 시간: ' + dur);
  });

  await test('버튼은 글자 없이 그림만 있고, 소리 버튼을 누르면 꺼짐 그림으로 바뀐다', async () => {
    const p = await page();
    const ui = await p.evaluate(() => ['#mute', '#zoom-in', '#zoom-out', '#shot', '#angel'].map((q) => { const el = document.querySelector(q); return { q, text: el.textContent.trim(), label: el.getAttribute('aria-label') || '', svg: el.querySelectorAll('svg').length }; }));
    for (const b of ui) assert(b.text === '' && b.label.length > 2 && b.svg >= 1, '글자 없이 그림과 설명만 있어야 한다: ' + JSON.stringify(b));
    const mute = () => p.evaluate(() => { const el = document.querySelector('#mute'), show = (c) => getComputedStyle(el.querySelector(c)).display !== 'none'; return { pressed: el.getAttribute('aria-pressed'), label: el.getAttribute('aria-label'), on: show('.on'), off: show('.off') }; });
    let m = await mute();
    assert(m.pressed === 'false' && m.on && !m.off && m.label === '소리 끄기', '처음에는 소리가 켜진 그림: ' + JSON.stringify(m));
    await p.click('#mute');
    m = await mute();
    assert(m.pressed === 'true' && !m.on && m.off && m.label === '소리 켜기', '누르면 꺼진 그림: ' + JSON.stringify(m));
    await p.click('#mute');
    assert((await mute()).pressed === 'false', '다시 누르면 켜져야 한다');
  });

  await test('캡쳐 버튼: 버튼 없이 눈밭만 담긴 사진이 저장되고, 구석에 작게 이름이 적힌다', async () => {
    const fs = await import('node:fs');
    const init = () => { const fill = CanvasRenderingContext2D.prototype.fillText; window.__texts = []; window.__marks = []; CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { window.__texts.push(String(t)); window.__marks.push({ t: String(t), x: rest[0], y: rest[1], w: this.canvas.width, h: this.canvas.height, size: parseFloat(this.font.match(/(\d+(\.\d+)?)px/)[1]) }); return fill.call(this, t, ...rest); }; };
    const p = await page(undefined, { mobile: false, viewport: { width: 900, height: 600 }, init });
    await walk(p, 0.3, 1, 2);
    const [file] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#shot')]);
    assert(/^poddk-\d{8}-\d{6}\.jpg$/.test(file.suggestedFilename()), '파일 이름: ' + file.suggestedFilename());
    const bytes = fs.readFileSync(await file.path());
    assert(bytes[0] === 0xff && bytes[1] === 0xd8, 'JPEG 사진이 아니다');
    assert(bytes.length > 20000, '사진이 비어 있는 것 같다 (크기 ' + bytes.length + ')');
    const info = await p.evaluate(() => ({ shot: window.__snow.lastShot, canvas: [document.querySelector('#view').width, document.querySelector('#view').height], texts: window.__texts }));
    assert(info.shot.how === 'download' && info.shot.width === info.canvas[0] && info.shot.height === info.canvas[1] && info.shot.bytes === bytes.length, '사진 크기: ' + JSON.stringify(info));
    assert(info.texts.includes('뽀드득 · poddk'), '사진 구석에 이름이 없다: ' + JSON.stringify(info.texts));
    const mark = await p.evaluate(() => window.__marks.find((m) => m.t === '뽀드득 · poddk'));
    assert(mark.x > 0 && mark.x < mark.w * 0.06 && mark.y < mark.h - 2 && mark.y > mark.h * 0.93 && mark.y - mark.size > mark.h * 0.88, '이름은 사진 안 왼쪽 아래 구석에 적혀야 한다: ' + JSON.stringify(mark));
    assert(mark.size < mark.h * 0.05, '이름이 너무 크다: ' + JSON.stringify(mark));
    await until(async () => (await p.textContent('#toast')).includes('사진을 담았어요'), { what: '사진을 담았다는 안내' });
    // 사진 속 그림이 실제 화면과 같은지: 가운데 한 줄의 색이 한 가지가 아니다 (까맣거나 하얗게 빈 그림이 아니다)
    const varied = await p.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.floor(img.width / 2), 0, 1, img.height).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
      return seen.size;
    }, bytes.toString('base64'));
    assert(varied > 12, '사진이 한 가지 색뿐이다: ' + varied);
  });

  await test('휴대폰에서 캡쳐하면 공유 창 없이 찍은 사진을 띄우고, 꾹 눌러 저장하게 한다', async () => {
    const init = () => { window.__shared = []; navigator.canShare = () => true; navigator.share = async () => { window.__shared.push(1); }; };
    const p = await page(undefined, { init });
    await p.click('#shot');
    await until(async () => p.evaluate(() => !document.querySelector('#photo').hidden && document.querySelector('#photo img').naturalWidth > 100), { what: '찍은 사진' });
    assert((await p.evaluate(() => window.__shared.length)) === 0, '공유 창이 떴다');
    assert((await p.evaluate(() => window.__snow.lastShot.how)) === 'show', '사진을 띄우는 길로 가지 않았다');
    assert((await p.textContent('#photo figcaption')).includes('길게 눌러'), '꾹 눌러 저장하라는 안내가 없다');
  });

  await test('공유 창이 없는 휴대폰 브라우저에서는 저장했다고 하지 않고, 찍은 사진을 띄워 길게 눌러 저장하게 한다', async () => {
    const init = () => { try { Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true }); } catch { /* 이미 없다 */ } };
    const p = await page(undefined, { init });
    const box = () => p.evaluate(() => { const el = document.querySelector('#photo'), img = el.querySelector('img'); return { shown: !el.hidden && getComputedStyle(el).display !== 'none', src: (img.getAttribute('src') || '').slice(0, 5), text: el.querySelector('figcaption').textContent, wide: img.naturalWidth }; });
    assert(!(await box()).shown, '찍기도 전에 사진 자리가 보인다');
    await p.click('#shot');
    await until(async () => (await box()).shown && (await box()).wide > 100, { what: '찍은 사진' });
    const b = await box();
    assert(b.src === 'blob:' && b.text.includes('길게 눌러'), '사진과 안내: ' + JSON.stringify(b));
    assert((await p.evaluate(() => window.__snow.lastShot.how)) === 'show', '사진을 띄우는 길로 가지 않았다');
    assert(!(await p.textContent('#toast')).includes('저장했어요'), '저장하지 못했는데 저장했다고 안내했다');
    await p.click('#photo button');
    assert(!(await box()).shown, '닫기를 눌렀는데 사진이 남았다');
    await walk(p, 0, 1, 1);
    assert((await state(p)).prints >= 2, '사진을 닫은 뒤에 걸을 수 없다');
  });

  await test('확대·축소 단추를 누르고 있는 동안에는 손가락이 조금 미끄러져도 계속 움직이고, 떼면 멈춘다', async () => {
    const p = await page();
    const dist = async () => (await state(p)).camDist;
    const send = (type) => p.evaluate((t) => document.querySelector('#zoom-out').dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'touch', bubbles: t !== 'pointerleave', cancelable: true })), type);
    await send('pointerdown');
    await until(async () => (await dist()) > 9.5, { what: '누르고 있는 동안 멀어짐' });
    await send('pointerleave');                                         // 손가락이 단추 밖으로 살짝 나갔다
    const d1 = await dist();
    await until(async () => (await dist()) > d1 * 1.08, { what: '손가락이 미끄러진 뒤에도 계속 멀어짐' });
    await send('pointerup');
    const d2 = await dist();
    await sleep(300);
    assert(Math.abs((await dist()) - d2) < 1e-6, '손가락을 뗐는데 계속 움직인다');
  });

  await test('시각을 멈춰 두어도 화면의 시각이 1분 모자라지 않는다', async () => {
    const p = await page('t=13:40&speed=0');
    await until(async () => (await p.textContent('#clock')).includes(':'), { what: '시각' });
    assert((await p.textContent('#clock')) === '오후 1:40', '13:40 → ' + await p.textContent('#clock'));
    for (const [time, text] of [['15:10', '오후 3:10'], ['00:00', '오전 12:00'], ['09:05', '오전 9:05'], ['23:59', '오후 11:59']]) {
      await snow(p, (t) => window.__snow.clock.setTime(t), time);
      await until(async () => (await p.textContent('#clock')) === text, { what: time + ' → ' + text });
    }
  });

  console.log('\n■ 눈 천사와 쌓이는 눈');
  await test('[눈 천사] 버튼을 누르면 누워서 자국을 남기고 다시 일어난다 (그동안은 걷지 못한다)', async () => {
    const p = await page();
    await p.click('#angel');
    let s = await state(p);
    assert(s.angel, '눈 천사가 시작되지 않았다');
    const before = s;
    await walk(p, 0, 1, 2);
    s = await state(p);
    assert(Math.hypot(s.x - before.x, s.z - before.z) < 0.01, '누운 채로 걸었다');
    assert(s.angels === 1, '자국이 생기지 않았다');
    await walk(p, 0, 0, 5);
    assert((await state(p)).angel, '가만히 두면 8초쯤 누워 있어야 한다');
    await walk(p, 0, 0, 2.6);
    s = await state(p);
    assert(!s.angel, '다시 일어나지 않았다');
    assert(s.audio.fx >= 4, '눕는 소리·쓰는 소리: ' + s.audio.fx);
    assert(!(await p.evaluate(() => document.querySelector('#angel').classList.contains('busy'))), '버튼이 계속 잠겨 있다');
    // 누운 지 2초가 지나 걸으려 하면 일찍 일어난다
    await p.click('#angel');
    await walk(p, 0, 0, 3);
    await walk(p, 0, 1, 1.2);
    assert(!(await state(p)).angel, '걸으려 해도 일어나지 않는다');
    await walk(p, 0, 1, 1);
    assert(Math.hypot((await state(p)).x - before.x, (await state(p)).z - before.z) > 1, '일어난 뒤에 걸을 수 없다');
  });

  await test('담요를 쓴 펭귄도 눈 천사를 할 때 날개를 꺼내 휘젓고, 일어나면 다시 담요를 여며 쥔다', async () => {
    const p = await page('t=14:00&speed=0&look=blanket&color=5');
    const wing = () => snow(p, () => { const w = window.__snow.penguin.userData.wings[0]; return { x: w.position.x, z: w.position.z, rot: w.rotation.z }; });
    const tucked = await wing();
    await p.click('#angel');
    await walk(p, 0, 0, 2);
    const a = await wing();
    await walk(p, 0, 0, 0.4);
    const b = await wing();
    assert(Math.abs(a.x) > Math.abs(tucked.x) + 0.2 && Math.abs(a.z) < 0.05, '날개를 어깨 밖으로 꺼내지 않았다: ' + JSON.stringify(a));
    assert(Math.abs(a.rot - b.rot) > 0.05, '날개가 움직이지 않는다: ' + a.rot.toFixed(2) + ' → ' + b.rot.toFixed(2));
    await walk(p, 0, 0, 8);
    const end = await wing();
    assert(!(await state(p)).angel && Math.abs(end.x - tucked.x) < 1e-6 && Math.abs(end.z - tucked.z) < 1e-6 && end.rot === 0, '일어난 뒤 날개가 제자리로 돌아오지 않았다: ' + JSON.stringify(end));
  });

  // 쌓인 눈의 상태와, 지금 화면에 보이는 펭귄의 조각들
  const snowLook = (p) => snow(p, () => {
    const s = window.__snow, u = s.penguin.userData;
    // 환해지는 효과가 있는지: 보이는 조각이 스스로 내는 빛(emissive)과, 빛무리·반짝임 같은 덧그림(스프라이트, 점, 더해 섞기)
    let lit = 0;
    const shine = (o) => { if (!o.visible) return; for (const m of [].concat(o.material || [])) { if (m.emissive) lit += (m.emissive.r + m.emissive.g + m.emissive.b) * (m.emissiveIntensity ?? 1); if (o.isSprite || o.isPoints || m.blending === 2) lit += 1; } o.children.forEach(shine); };
    shine(s.penguin);
    const shown = s.crumble.shown;
    return { snow: s.me.snow, full: s.me.full, pop: s.me.pop, idle: s.me.idle, hat: u.cap.visible, hatScale: u.cap.scale.y, shoulders: u.shoulders[0].visible,
      shell: u.shell.visible, skin: u.skin.visible, feet: u.feet[0].visible, eyeZ: u.eyes[0].position.z, beakZ: u.beak.position.z,
      tall: u.top.scale.y, wide: u.top.scale.x, bits: s.crumble.active, lit,
      shown: shown.length, far: Math.max(0, ...shown.map(([x, , z]) => Math.hypot(x - s.me.x, z - s.me.z))) };
  });
  /** 시간이 sim() 으로만 흐르게 한다: 짧은 순간(뿅)도 정확히 붙잡을 수 있다 */
  /** 조건이 될 때까지 조금씩 시간을 흘려보낸다 (가만히 선 채로) */
  const stand = async (p, done, { step = 0.1, max = 60 } = {}) => { for (let t = 0; t < max; t += step) { if (done(await snowLook(p))) return snowLook(p); await walk(p, 0, 0, step); } throw new Error('기다려도 되지 않았다'); };
  const FRAME = 1 / 60;

  await test('가만히 서 있으면 머리와 어깨에 눈이 금방 쌓이고, 다 쌓인 채 10초 지나면 뿅 하고 눈사람이 된다', async () => {
    const p = await page();
    await byHand(p);
    await walk(p, 0, 0, 3);
    assert((await snowLook(p)).snow === 0, '서자마자 쌓였다');
    await walk(p, 0, 0, 7);                                             // 선 지 10초: 쌓이는 중
    let s = await snowLook(p);
    assert(s.snow > 0.3 && s.snow < 0.8 && s.hat && !s.shell, '10초쯤 서 있으면 눈 모자가 반쯤 쌓여 있어야 한다: ' + s.snow.toFixed(2));
    const full = await stand(p, (v) => v.snow === 1);
    assert(full.idle > 13.5 && full.idle < 16.3, '머리와 어깨에 다 쌓이는 데 걸린 시간(초, 눈발에 따라 조금 다르다): ' + full.idle.toFixed(1));
    assert(full.hat && full.shoulders && full.hatScale >= 0.74 && !full.shell && full.pop === 0, '다 쌓였을 때는 눈 모자를 쓴 펭귄이어야 한다: ' + JSON.stringify(full));
    await walk(p, 0, 0, 9.5 - full.full);
    s = await snowLook(p);
    assert(s.pop === 0 && s.skin && s.tall === 1 && s.hatScale === full.hatScale && s.bits === 0, '다 쌓이고 10초가 되기 전에는 그대로여야 한다: ' + JSON.stringify(s));
    // 뿅 하기 직전: 아직 펭귄이고, 몸을 살짝 움츠린다
    const ducked = await stand(p, (v) => v.pop > 0.1, { step: FRAME });
    assert(ducked.full >= 10 && ducked.full < 10.05, '다 쌓인 뒤 10초가 지나 시작돼야 한다: ' + ducked.full.toFixed(2));
    assert(ducked.pop < 0.2 && ducked.skin && !ducked.shell && ducked.tall < 0.97 && ducked.wide > 1.01 && ducked.bits === 0, '뿅 하기 직전에는 움츠린 펭귄이어야 한다: ' + JSON.stringify(ducked));
    // 뿅: 눈사람이 작게 나타나고 눈가루가 퍼진다
    const popped = await stand(p, (v) => v.shell, { step: FRAME });
    assert(!popped.skin && !popped.feet && popped.tall < 0.75 && popped.bits >= 10, '바뀐 순간: ' + JSON.stringify(popped));
    assert(popped.shown === popped.bits && popped.far < 1.5, '눈가루가 펭귄 둘레에 보여야 한다: ' + JSON.stringify(popped));
    assert(popped.eyeZ > full.eyeZ + 0.1 && popped.beakZ > full.beakZ + 0.1, '눈과 부리가 눈 밖으로 나오지 않았다: ' + JSON.stringify(popped));
    // 훌쩍 커졌다가(제 크기보다 조금 더) 통통거리며 자리 잡는다
    let peak = 0, low = 9, lit = Math.max(full.lit, ducked.lit, popped.lit);
    for (let i = 0; i < 40; i++) { await walk(p, 0, 0, FRAME); s = await snowLook(p); lit = Math.max(lit, s.lit); peak = Math.max(peak, s.tall); if (peak > 1.02) low = Math.min(low, s.tall); if (s.pop === 1) break; }
    assert(lit === 0, '환해지는 효과(빛나는 눈, 빛무리, 반짝임) 없이 뿅만 해야 한다: ' + lit.toFixed(2));
    assert(peak > 1.05 && peak < 1.2, '제 크기보다 조금 더 커졌다가 돌아와야 한다(뿅): ' + peak.toFixed(3));
    assert(low < 0.995, '한 번 더 통 하고 눌려야 한다: ' + low.toFixed(3));
    assert(s.pop === 1 && s.tall === 1 && s.wide === 1 && s.shell && !s.skin, '다 된 눈사람은 제 크기여야 한다: ' + JSON.stringify(s));
    assert(s.idle - ducked.idle < 0.8, '뿅은 눈 깜짝할 사이여야 한다(초): ' + (s.idle - ducked.idle).toFixed(2));
    assert(s.idle > 23 && s.idle < 28, '서 있기 시작해 눈사람이 되기까지(초): ' + s.idle.toFixed(1));
    // 눈가루는 금세 사라지고, 눈사람은 그대로 서 있다
    await walk(p, 0, 0, 0.6);
    assert((await snowLook(p)).bits === 0, '눈가루가 남아 있다');
    await walk(p, 0, 0, 30);
    s = await snowLook(p);
    assert(s.pop === 1 && s.shell && s.tall === 1 && s.bits === 0, '눈사람인 채로 더 서 있어도 그대로여야 한다');
  });

  await test('눈사람이 되는 순간 "뿅" 소리가, 쌓인 눈이 털리거나 눈사람이 부서질 때도 소리가 난다', async () => {
    const p = await page();
    await byHand(p);
    const fx = () => snow(p, () => [...window.__snow.audio.snowFx]);
    // 머리와 어깨에만 쌓였을 때 걸음을 떼면: 후두둑
    await snow(p, () => { const s = window.__snow; for (let i = 0; i < 1200 && s.me.snow < 0.9; i++) s.sim(1 / 60); });
    await walk(p, 0, 1, 0.5);
    assert(JSON.stringify(await fx()) === '["shake"]', '털리는 소리: ' + JSON.stringify(await fx()));
    // 눈사람이 되는 순간: 뿅 (한 번만)
    await snow(p, () => { const s = window.__snow; for (let i = 0; i < 60 * 40 && s.me.pop < 1; i++) s.sim(1 / 60); s.sim(1); });
    assert(JSON.stringify(await fx()) === '["shake","pop"]', '뿅 소리: ' + JSON.stringify(await fx()));
    // 눈사람이 걸음을 떼면: 와르르
    await walk(p, 0, 1, 0.5);
    assert(JSON.stringify(await fx()) === '["shake","pop","burst"]', '부서지는 소리: ' + JSON.stringify(await fx()));
  });

  await test('눈사람은 걸음을 떼면 눈덩이가 부서져 흩어지며 털리고, 뿅 하려는 순간에 걸어도 탈이 없다', async () => {
    const p = await page();
    await byHand(p);
    await stand(p, (v) => v.pop === 1, { step: 0.5 });
    await walk(p, 0, 0, 1);
    const fx0 = (await state(p)).audio.snowFx.length;
    await walk(p, 0, 1, 0.2);
    let s = await snowLook(p);
    assert(!s.shell && s.skin && s.feet && s.pop === 0 && s.full === 0 && s.snow < 1 && s.eyeZ < 0.3 && s.tall === 1, '걸음을 뗐는데 눈사람 그대로다: ' + JSON.stringify(s));
    assert(s.bits === 22, '눈덩이가 흩어지지 않았다: ' + s.bits);
    assert(s.shown === 22 && s.far < 1.5, '눈덩이가 펭귄 둘레에 보여야 한다: ' + JSON.stringify(s));
    const after = (await state(p)).audio.snowFx;
    assert(after.length === fx0 + 1 && after[after.length - 1] === 'burst', '눈사람이 부서지는 소리가 한 번 나야 한다: ' + JSON.stringify(after));
    await walk(p, 0, 1, 1.3);
    assert((await snowLook(p)).snow === 0, '걸어도 눈이 안 털렸다');
    await walk(p, 0, 1, 2.5);
    assert((await snowLook(p)).bits === 0, '눈덩이가 눈밭에 스며들지 않고 남아 있다');
    // 몸을 움츠린 순간(아직 펭귄일 때) 걸으면: 눈사람이 되지 않고, 눈가루도 눈덩이도 없다
    await stand(p, (v) => v.full >= 9.9, { step: 0.5 });
    await stand(p, (v) => v.pop > 0.08, { step: FRAME });
    const fx1 = (await state(p)).audio.snowFx.length;
    await walk(p, 0, 1, 0.2);
    s = await snowLook(p);
    assert(s.pop === 0 && !s.shell && s.skin && s.bits === 0 && s.tall === 1 && s.wide === 1, '움츠린 순간에 걸으면 그냥 눈만 털려야 한다: ' + JSON.stringify(s));
    const after2 = (await state(p)).audio.snowFx;
    assert(after2.length === fx1 + 1 && after2[after2.length - 1] === 'shake', '눈 모자가 털리는 소리가 한 번 나야 한다: ' + JSON.stringify(after2));
    // 눈사람인 채로 눈 천사를 하면: 눈이 부서져 털리고 평소처럼 눕는다
    await walk(p, 0, 1, 1.5);
    await stand(p, (v) => v.pop === 1, { step: 0.5 });
    await p.click('#angel');
    await walk(p, 0, 0, 0.3);
    s = await snowLook(p);
    assert((await state(p)).angel && !s.shell && s.skin && s.feet && s.snow === 0 && s.pop === 0 && s.bits > 0 && s.tall === 1, '눈사람인 채로 눈 천사: ' + JSON.stringify(s));
  });

  await test('눈가루는 실제 화면이 흐르는 동안에도 퍼졌다가 사라진다 (손으로 시간을 흘리지 않고)', async () => {
    const p = await page();
    const shown = await snow(p, () => { const s = window.__snow; s.crumble.puff(s.me.x, s.me.z); return s.crumble.shown.length; });
    assert(shown === 14, '눈가루가 보이지 않는다: ' + shown);
    await until(async () => (await snowLook(p)).bits === 0, { what: '눈가루가 사라짐', timeout: 30000 });
    assert((await snowLook(p)).shown === 0, '다 사라진 뒤에도 그려지고 있다');
  });

  await test('눈사람의 모습은 목도리 펭귄이든 담요 펭귄이든 똑같다 (눈과 부리만 보인다)', async () => {
    // 화면에 그려지는 조각들을 모두 적는다: [모양, 색, 펭귄 기준 자리, 크기]
    const pieces = (p) => snow(p, () => {
      const root = window.__snow.penguin, out = [];
      const r = (n) => Math.round(n * 1000) / 1000;
      const visit = (o) => {
        if (!o.visible) return;
        if (o.isMesh || o.isSprite) {
          root.updateWorldMatrix(true, true);
          const at = root.worldToLocal(o.getWorldPosition(o.position.clone())), size = o.getWorldScale(o.scale.clone());
          const g = o.geometry, radius = g && g.parameters ? (g.parameters.radius || 0) : 0;
          out.push([o.isSprite ? 'sprite' : g.type, o.material.color.getHexString(), r(at.x), r(at.y), r(at.z), r(size.x * (radius || 1)), r(size.y * (radius || 1)), r(size.z * (radius || 1))].join(' '));
        }
        o.children.forEach(visit);
      };
      visit(root);
      return out.sort();
    });
    const scarf = await page('t=14:00&speed=0&look=scarf&color=0');
    const blanket = await page('t=14:00&speed=0&look=blanket&color=5');
    const before = [await pieces(scarf), await pieces(blanket)];
    assert(before[0].join('|') !== before[1].join('|'), '평소에는 목도리와 담요가 달라 보여야 한다');
    for (const p of [scarf, blanket]) { await byHand(p); await stand(p, (v) => v.pop === 1, { step: 0.5 }); await walk(p, 0, 0, 1); }      // 눈가루가 사라질 때까지
    const a = await pieces(scarf), b = await pieces(blanket);
    assert(a.join('|') === b.join('|'), '눈사람의 모습이 다르다:\n' + a.join('\n') + '\n--\n' + b.join('\n'));
    // 눈덩이 셋(머리, 몸, 발치) + 눈 둘 + 부리 하나
    assert(a.length === 6, '눈사람에서 보이는 조각: ' + a.length + '\n' + a.join('\n'));
    const colors = [...new Set(a.map((x) => x.split(' ')[1]))].sort().join(',');
    assert(colors === ['17181d', 'e0913c', 'ffffff'].sort().join(','), '눈사람에는 흰 눈, 까만 눈, 주황 부리만 보여야 한다: ' + colors);
    // 날개처럼 옆으로 튀어나온 것이 없다: 모든 조각이 둥근 몸통 너비 안에 있다
    const wide = a.map((x) => x.split(' ').map(Number)).filter((v) => Math.abs(v[2]) > 0.2);
    assert(wide.length === 0, '옆으로 튀어나온 조각이 있다: ' + JSON.stringify(wide));
  });

  console.log('\n■ 하루의 흐름');
  await test('하늘과 빛이 시각을 따라 바뀐다 (한낮, 해 질 녘, 밤)', async () => {
    const p = await page('t=13:20&speed=0');
    const read = () => snow(p, () => { const s = window.__snow; const sun = s.sky.sun; return { elev: s.palette.elev, top: '#' + s.palette.sky[2].getHexString(), horizon: '#' + s.palette.sky[0].getHexString(), I: sun.intensity, y: sun.position.y - sun.target.position.y }; });
    await sleep(400); const noon = await read();
    await snow(p, () => window.__snow.clock.setTime('17:10')); await sleep(600); const dusk = await read();
    await snow(p, () => window.__snow.clock.setTime('22:00')); await sleep(600); const night = await read();
    assert(noon.elev > 28 && dusk.elev > 0 && dusk.elev < 6 && night.elev < -20, `해의 높이: ${noon.elev.toFixed(1)}, ${dusk.elev.toFixed(1)}, ${night.elev.toFixed(1)}`);
    assert(new Set([noon.top, dusk.top, night.top]).size === 3 && new Set([noon.horizon, dusk.horizon, night.horizon]).size === 3, '하늘 색이 바뀌지 않는다');
    assert(noon.I > 1 && dusk.I > 1 && night.I > 0.5, '빛이 꺼졌다: ' + [noon.I, dusk.I, night.I].map((v) => v.toFixed(2)));
    assert(dusk.y > 0 && dusk.y < noon.y, '해 질 녘에는 빛이 낮게 누워야 한다 (긴 그림자)');
    await until(async () => (await p.textContent('#clock')).includes('오후 10:00'), { what: '시각 표시 오후 10:00' });
  });

  await test('발자국은 시간이 갈수록 옅어지고, 다음 폭설까지 남는다', async () => {
    const p = await page('t=12:40&speed=0');
    await walk(p, 0, 1, 3);
    const n = (await state(p)).prints;
    await until(async () => (await state(p)).alive === n, { what: '발자국' });
    const a0 = await snow(p, () => window.__snow.tracks.alphas());
    await snow(p, () => window.__snow.clock.skip(2 * 3600e3));                // 14시 40분: 다음 폭설 20분 전
    await until(async () => { const a = await snow(p, () => window.__snow.tracks.alphas()); return a[0] < a0[0] * 0.9; }, { what: '옅어짐' });
    const a2 = await snow(p, () => window.__snow.tracks.alphas());
    assert((await state(p)).alive === n && a2[0] > a0[0] * 0.6, '두 시간 만에 사라졌거나 너무 옅다: ' + (a2[0] / a0[0]).toFixed(2));
  });

  await test('세 시간마다 폭설: 5분 사이에 들판이 비고, 그칠 때까지 30분 동안은 발자국이 남지 않는다', async () => {
    const p = await page('t=14:50&speed=0');
    await walk(p, 0, 1, 3);
    const n = (await state(p)).prints;
    await until(async () => (await state(p)).alive === n, { what: '발자국' });
    assert((await state(p)).snowfall < 0.45, '폭설 전인데 눈발이 굵다');
    await until(async () => /^큰 눈은 \d+분쯤 뒤$/.test(await p.textContent('#storm')), { what: '큰 눈 소식 (어림으로)' });
    const a0 = (await snow(p, () => window.__snow.tracks.alphas()))[n - 1];
    await snow(p, () => window.__snow.clock.skip(12.5 * 60e3));               // 15시 2분 30초: 눈발이 굵어지는 중
    await until(async () => (await snow(p, () => window.__snow.tracks.alphas()))[n - 1] < a0 * 0.6, { what: '덮이는 중' });
    // 눈발이 굵어지는 첫 5분에도 새 발자국은 남지 않는다 (폭설 30분 내내): 밟는 순간엔 보이지만 몇 초 만에 덮인다
    await walk(p, 1, 0, 2);
    await until(async () => (await state(p)).alive > n, { what: '굵어지는 눈 속에서 방금 밟은 자국' });
    await snow(p, () => window.__snow.clock.skip(7000));
    await until(async () => (await state(p)).alive === n, { what: '굵어지는 눈에도 금방 덮임' });
    let s = await state(p);
    assert(s.alive === n, '폭설이 시작되고 2분 반 만에 다 지워졌다');
    assert(s.snowfall > 0.58 && s.snowfall < 0.72, '폭설이 시작되고 2분 반의 눈발: ' + s.snowfall.toFixed(2));
    await snow(p, () => window.__snow.clock.skip(3 * 60e3));                  // 15시 5분 30초
    await until(async () => (await state(p)).alive === 0, { what: '5분 뒤 비워짐' });
    assert((await state(p)).snowfall === 1, '폭설 절정');
    await until(async () => (await p.textContent('#storm')) === '큰 눈이 와요. 새 눈이 금세 쌓여요', { what: '큰 눈이 오는 동안의 소식' });
    // 폭설 한가운데: 밟는 순간엔 자국이 보이지만 몇 초 만에 덮인다
    await walk(p, 0, 1, 2);
    await until(async () => (await state(p)).alive >= 3, { what: '방금 밟은 자국' });
    await snow(p, () => window.__snow.clock.skip(7000));
    await until(async () => (await state(p)).alive === 0, { what: '금방 덮임' });
    // 잦아드는 마지막 5분에도 아직 남지 않는다
    await snow(p, () => window.__snow.clock.setTime('15:27'));
    s = await state(p);
    assert(s.snowfall > 0.4 && s.snowfall < 1, '잦아드는 중의 눈발: ' + s.snowfall.toFixed(2));
    await walk(p, 0, 1, 2);
    await snow(p, () => window.__snow.clock.skip(7000));
    await until(async () => (await state(p)).alive === 0, { what: '잦아드는 중에도 덮임' });
    // 30분이 지나면 다시 남는다
    await snow(p, () => window.__snow.clock.setTime('15:31'));
    await walk(p, 0, 1, 2);
    await snow(p, () => window.__snow.clock.skip(60e3));
    await until(async () => (await state(p)).alive >= 3, { what: '폭설이 그친 뒤의 발자국' });
    s = await state(p);
    assert(s.snowfall < 0.45, '폭설이 그쳤는데 눈발이 굵다: ' + s.snowfall.toFixed(2));
    await until(async () => (await p.textContent('#storm')) === '큰 눈은 2시간 반쯤 뒤', { what: '다음 큰 눈 소식' });
    // 하루 여덟 번, 세 시간마다. 해 뜰 때와 해 질 때는 비켜 간다
    const day = await snow(p, async () => {
      const { snowfallAt, stormPhase } = await import('./js/clock.js');
      const c = window.__snow.clock, out = { storm: [], calm: [], edge: [] };
      for (let h = 0; h < 24; h += 3) { c.setTime(String(h).padStart(2, '0') + ':10'); out.storm.push(snowfallAt(c.now())); c.setTime(String(h).padStart(2, '0') + ':40'); out.calm.push(snowfallAt(c.now())); }
      for (const t of ['07:20', '17:20', '17:00', '07:00']) { c.setTime(t); out.edge.push(stormPhase(c.now())); }
      return out;
    });
    assert(day.storm.length === 8 && day.storm.every((v) => v === 1), '세 시간마다 폭설이어야 한다: ' + day.storm);
    assert(day.calm.every((v) => v < 0.45), '폭설 30분이 지나면 평소 눈발이어야 한다: ' + day.calm.map((v) => v.toFixed(2)));
    assert(day.edge.every((v) => v === 'calm'), '해 뜰 때와 해 질 때는 폭설이 아니어야 한다: ' + day.edge);
  });

  console.log('\n■ 여우와 산타');
  await test('여우 한 마리가 들판을 돌아다닌다: 걷다 쉬다 하며, 들판 안에서, 건너뛰지 않고 이어서 움직인다', async () => {
    const p = await page();
    const r = await snow(p, () => {
      const s = window.__snow, t0 = s.clock.now(), step = 250, n = 6 * 3600 * 4;       // 여섯 시간을 0.25초 간격으로
      let prev = s.fox.at(t0), jump = 0, far = 0, near = 1e9, moving = 0, sat = 0, turn = 0, bad = 0, walked = 0;
      const cells = new Set();
      for (let i = 1; i <= n; i++) {
        const f = s.fox.at(t0 + i * step);
        if (![f.x, f.z, f.yaw, f.move, f.sit, f.phase, f.look].every(Number.isFinite)) bad++;
        const d = Math.hypot(f.x - prev.x, f.z - prev.z), r = Math.hypot(f.x, f.z);
        jump = Math.max(jump, d); walked += d; far = Math.max(far, r); near = Math.min(near, r);
        turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(f.yaw - prev.yaw), Math.cos(f.yaw - prev.yaw))));
        if (d > 0.02) moving++;
        if (f.sit > 0.95) sat++;
        cells.add(Math.floor(f.x / 20) + ',' + Math.floor(f.z / 20));
        prev = f;
      }
      return { jump, far, near, turn, bad, moving: moving / n, sat: sat / n, walked, cells: cells.size };
    });
    assert(r.bad === 0, '여우의 자리가 숫자가 아니다');
    assert(r.jump < 0.75, '여우가 한순간에 건너뛴다 (0.25초에 ' + r.jump.toFixed(2) + ')');
    assert(r.far <= 96.01 && r.near >= 3.4, '들판 밖이나 나무 속으로 갔다: ' + r.far.toFixed(1) + ' / ' + r.near.toFixed(1));
    assert(r.turn < 0.9, '몸을 한순간에 홱 돌린다: ' + r.turn.toFixed(2));
    assert(r.moving > 0.3 && r.moving < 0.75, '걷는 시간의 비율: ' + r.moving.toFixed(2));
    assert(r.sat > 0.03, '앉아 쉬는 때가 없다: ' + r.sat.toFixed(3));
    assert(r.walked > 6000 && r.cells >= 40, '여기저기 돌아다녀야 한다 (걸은 거리 ' + r.walked.toFixed(0) + ', 다닌 구역 ' + r.cells + ')');
    // 화면의 여우는 그 시각의 자리에 있고, 모두가 같은 여우를 본다
    const q = await page('t=14:00&speed=0&look=blanket&color=3');
    const at = (pg) => snow(pg, () => { const s = window.__snow, f = s.fox.at(s.clock.now()), o = s.fox.root.position; return { now: s.clock.now(), fx: f.x, fz: f.z, x: o.x, z: o.z, seen: s.fox.root.visible && s.fox.root.parent !== null }; });
    await sleep(600);
    const a = await at(p), b = await at(q);
    assert(a.seen && Math.hypot(a.x - a.fx, a.z - a.fz) < 1e-6, '화면의 여우가 제자리에 없다: ' + JSON.stringify(a));
    const same = await snow(q, (t) => { const f = window.__snow.fox.at(t); return [f.x, f.z, f.yaw]; }, a.now);
    const mine = await snow(p, (t) => { const f = window.__snow.fox.at(t); return [f.x, f.z, f.yaw]; }, a.now);
    assert(same.join() === mine.join(), '같은 시각인데 여우의 자리가 다르다: ' + same + ' / ' + mine);
    assert(b.seen, '다른 사람 화면에 여우가 없다');
  });

  await test('여우는 지나간 자리에 작은 발자국을 남기고, 가까이 가면 고개를 돌려 쳐다본다', async () => {
    const p = await page();
    await sleep(700);
    const paws = await snow(p, () => {
      const s = window.__snow, now = s.clock.now(), list = s.tracks.paws();
      let off = 0, newest = -Infinity, oldest = Infinity;
      for (const it of list) { const f = s.fox.at(it.birth); off = Math.max(off, Math.hypot(it.x - f.x, it.z - f.z)); newest = Math.max(newest, it.birth); oldest = Math.min(oldest, it.birth); }
      const f = s.fox.at(now), last = list.reduce((a, b) => (b.birth > a.birth ? b : a), list[0]);
      return { n: list.length, alive: s.tracks.pawsAlive, off, newest: now - newest, oldest: now - oldest, lastGap: Math.hypot(last.x - f.x, last.z - f.z), prints: s.tracks.printCount };
    });
    assert(paws.n > 150 && paws.alive > 100, '여우 발자국이 없다: ' + JSON.stringify(paws));
    assert(paws.off < 0.06, '발자국이 여우가 지나간 길 위에 있지 않다: ' + paws.off.toFixed(3));
    assert(paws.oldest <= 12 * 60e3 && paws.oldest > 8 * 60e3, '지난 12분치 발자국이 있어야 한다 (가장 오래된 것 ' + (paws.oldest / 60e3).toFixed(1) + '분 전)');
    assert(paws.prints === 0, '여우 발자국이 내 발자국으로 세어졌다');
    // 발자국의 끝에 여우가 있다
    const end = await snow(p, () => { const s = window.__snow; let t = s.clock.now(); const walking = (at) => { const f = s.fox.at(at); return f.move >= 0.9 && !s.place.onIce(f.x, f.z); };      // (얼음 위를 걷는 동안에는 발자국이 남지 않으므로 그때는 피한다)
      for (let i = 0; i < 900 && !(walking(t) && walking(t + 3000)); i++) t += 1000; s.clock.skip(t - s.clock.now() + 3000); return t; });
    await sleep(900);
    const tail = await snow(p, () => { const s = window.__snow, f = s.fox.at(s.clock.now()), list = s.tracks.paws(), last = list.reduce((a, b) => (b.birth > a.birth ? b : a), list[0]); return Math.hypot(last.x - f.x, last.z - f.z); });
    assert(tail < 0.4, '걷고 있는 여우 바로 뒤에 발자국이 있어야 한다: ' + tail.toFixed(2));
    // 가까이 가면 쳐다본다: 여우의 왼쪽 옆에 서면 고개가 그쪽으로, 멀리 가면 제 볼일을 본다
    const look = async (side, done, what) => {
      await snow(p, (sd) => { const s = window.__snow; s.fox.hold({ x: 20, z: 30, yaw: 0 }); s.teleport(20 + sd, 30.3); s.me.idle = 0; }, side);
      await until(async () => done(await snow(p, () => window.__snow.fox.headYaw)), { what, timeout: 30000 });
    };
    await look(2.2, (yaw) => yaw > 0.6, '왼쪽 옆의 펭귄을 쳐다봄');
    await look(-2.2, (yaw) => yaw < -0.6, '오른쪽 옆의 펭귄을 쳐다봄');
    await look(40, (yaw) => Math.abs(yaw) < 0.03, '펭귄이 멀어지면 고개를 되돌림');
    await snow(p, () => window.__snow.fox.hold(null));
    // 폭설이 시작되면 여우 발자국도 덮이고, 그친 뒤에는 그 뒤의 발자국만 남는다
    await snow(p, () => window.__snow.clock.setTime('15:06'));
    await sleep(900);
    const storm = await snow(p, async () => {
      const { printAlpha } = await import('./js/clock.js');
      const s = window.__snow, now = s.clock.now(), shown = s.tracks.paws().filter((it) => printAlpha(it.birth, now, 12 * 60e3) > 0.01);
      return { alive: s.tracks.pawsAlive, shown: shown.length, oldest: Math.max(0, ...shown.map((it) => now - it.birth)) };
    });
    assert(storm.alive === storm.shown && storm.oldest < 6000, '폭설 중에는 방금 찍힌 여우 발자국만 잠깐 보여야 한다: ' + JSON.stringify(storm));
    await snow(p, () => window.__snow.clock.setTime('15:40'));
    await until(async () => (await snow(p, () => window.__snow.tracks.pawsAlive)) > 20, { what: '폭설이 그친 뒤의 여우 발자국' });
    const after = await snow(p, () => { const s = window.__snow, now = s.clock.now(); return Math.max(...s.tracks.paws().map((it) => now - it.birth)); });
    assert(after <= 10.01 * 60e3, '폭설 중의 발자국이 남아 있다 (' + (after / 60e3).toFixed(1) + '분 전 것)');
  });

  await test('밤마다 세 번, 순록이 끄는 썰매가 하늘을 지나간다 (밤에만, 폭설을 비켜서)', async () => {
    const p = await page('t=14:00&speed=0');
    const plan = await snow(p, async () => {
      const { sunAt, stormPhase } = await import('./js/clock.js');
      const s = window.__snow, PASS = 75e3, now = s.clock.now(), first = s.santa.nextPass(now).night, out = { nights: 0, bad: [], gaps: [] };
      for (let n = first; n < first + 40; n++) {
        const list = s.santa.passesOf(n);
        if (list.length !== 3) out.bad.push('밤 ' + n + ': ' + list.length + '번');
        list.forEach((ps, i) => {
          for (const t of [ps.start, ps.start + PASS / 2, ps.start + PASS - 1]) {
            if (sunAt(t).elev > -8) out.bad.push('해가 덜 졌다');
            if (stormPhase(t) !== 'calm') out.bad.push('폭설 중이다');
            const hit = s.santa.passAt(t);
            if (!hit || hit.index !== i) out.bad.push('그 시각에 지나가지 않는다');
          }
          if (s.santa.passAt(ps.start - 1000) || s.santa.passAt(ps.start + PASS + 1000)) out.bad.push('75초보다 길다');
          if (i) out.gaps.push((ps.start - list[i - 1].start) / 3600e3);
        });
        out.nights++;
      }
      out.day = !!s.santa.passAt(now);
      out.first = first;
      out.passes = JSON.stringify(s.santa.passesOf(first).map((x) => [Math.round(x.start), Math.round(x.azimuth * 1e4), x.dir]));
      out.differ = new Set(Array.from({ length: 10 }, (_, k) => Math.round(s.santa.passesOf(first + k)[0].start % 86400e3))).size;
      return out;
    });
    assert(plan.nights === 40 && plan.bad.length === 0, '지나가는 때가 잘못됐다: ' + [...new Set(plan.bad)].join(', '));
    assert(plan.gaps.every((g) => g > 1.3 && g < 4.7), '세 번이 밤새 고루 흩어져 있어야 한다: ' + plan.gaps.slice(0, 6).map((g) => g.toFixed(1)));
    assert(!plan.day && plan.differ >= 8, '낮에는 없고, 날마다 시각이 달라야 한다: ' + JSON.stringify({ day: plan.day, differ: plan.differ }));
    // 누가 보든 같은 때에 같은 하늘을 지나간다: 따로 연 다른 화면(다른 펭귄, 다른 시각에 들어옴)에서도 그 밤의 세 번이 똑같다
    const q = await page('t=03:20&speed=0&look=blanket&color=6');
    const other = await snow(q, (night) => JSON.stringify(window.__snow.santa.passesOf(night).map((x) => [Math.round(x.start), Math.round(x.azimuth * 1e4), x.dir])), plan.first);
    assert(other === plan.passes && JSON.parse(other).length === 3, '화면마다 썰매가 지나가는 때가 다르다: ' + plan.passes + ' / ' + other);
    // 낮에는 보이지 않는다
    await sleep(500);
    assert(!(await snow(p, () => window.__snow.santa.sprite.visible)), '낮인데 썰매가 보인다');
    // 지나가는 시각으로 가면 보인다: 낮은 하늘에서, 가는 쪽으로 머리를 두고
    const seen = async (frac) => {
      await snow(p, (f) => { const s = window.__snow; const ps = s.santa.nextPass(s.clock.now() - 80e3); s.clock.skip(ps.start + f * 75e3 - s.clock.now()); }, frac);
      await sleep(900);
      return snow(p, () => {
        const s = window.__snow, sp = s.santa.sprite, cam = s.fox.root.parent.children.find((o) => o.isCamera);
        return { visible: sp.visible, opacity: sp.material.opacity, elev: Math.atan2(sp.position.y, Math.hypot(sp.position.x, sp.position.z)) * 180 / Math.PI, far: sp.position.length(), flip: sp.material.map.repeat.x, p: s.santa.current && s.santa.current.p, dir: s.santa.current && s.santa.current.dir };
      });
    };
    const mid = await seen(0.5);
    assert(mid.visible && mid.opacity > 0.8 && Math.abs(mid.p - 0.5) < 0.05, '지나가는 중인데 보이지 않는다: ' + JSON.stringify(mid));
    assert(mid.elev > 8 && mid.elev < 12.5 && mid.far > 400, '하늘 낮은 곳을 멀리 지나가야 한다: ' + JSON.stringify(mid));
    const early = await seen(0.03);
    assert(early.visible && early.opacity < 0.5 && early.elev < 8, '나타날 때는 지평선 가까이에서 옅게: ' + JSON.stringify(early));
    await snow(p, () => window.__snow.clock.skip(80e3));
    await sleep(700);
    assert(!(await snow(p, () => window.__snow.santa.sprite.visible)), '다 지나갔는데 아직 보인다');
  });

  await test('주소에 ?santa 를 붙이면 들어오자마자 썰매가 지나간다 (구경용)', async () => {
    const p = await page('t=22:00&santa&look=scarf&color=0');
    await until(async () => snow(p, () => { const s = window.__snow.santa; return s.sprite.visible && s.current && s.current.index === -1; }), { what: '썰매', timeout: 40000 });
    // 화면에서 가는 쪽과 그림의 머리 방향이 맞는지: 오른쪽으로 가면 그대로, 왼쪽으로 가면 뒤집는다
    const dir = await snow(p, () => new Promise((done) => {
      const s = window.__snow, sp = s.santa.sprite, cam = s.sky.sun.parent.children.find((o) => o.isCamera) || null;
      const x0 = sp.position.clone(), t0 = performance.now();
      const wait = () => { if (performance.now() - t0 < 1500) return requestAnimationFrame(wait); done({ moved: [sp.position.x - x0.x, sp.position.z - x0.z], flip: sp.material.map.repeat.x, camYaw: s.me.camYaw }); };
      wait();
    }));
    // 카메라는 -Z(나무 쪽)를 보고 있다(camYaw = π): 화면 오른쪽은 +X 쪽
    const right = dir.moved[0] > 0;
    assert(Math.abs(dir.moved[0]) > 0.5, '썰매가 움직이지 않는다: ' + JSON.stringify(dir));
    assert((dir.flip === 1) === right, '가는 쪽과 그림의 방향이 다르다: ' + JSON.stringify(dir));
  });

  console.log('\n■ 이글루와 얼음낚시');
  /** 낚시 구멍 곁(이글루 반대쪽)에 세운다 */
  const fishLook = (p) => snow(p, () => {
    const s = window.__snow, f = s.fishing, u = s.penguin.userData, h = s.place.hole;
    return { active: f.active, phase: f.phase, stats: { ...f.stats }, sitY: u.body.position.y, footZ: u.feet[0].position.z, dist: Math.hypot(s.me.x - h.x, s.me.z - h.z),
      facing: Math.abs(Math.atan2(Math.sin(s.me.yaw - Math.atan2(h.x - s.me.x, h.z - s.me.z)), Math.cos(s.me.yaw - Math.atan2(h.x - s.me.x, h.z - s.me.z)))),
      floatY: f.floatY, item: f.shown, rod: f.rodShown, water: s.audio.water, snow: s.me.snow, pop: s.me.pop, shell: u.shell.visible, hat: u.cap.visible, angels: s.tracks.angelCount };
  });

  await test('이글루 셋과 낚시터 셋이 트리 둘레에 서로 떨어져 있다. 이글루 속으로는 못 들어가고, 얼음 위에는 발자국이 남지 않는다', async () => {
    const p = await page();
    const place = await snow(p, async () => { const m = await import('./js/igloo.js'); const s = window.__snow; return { igloos: m.IGLOOS, ponds: m.PONDS, shown: s.camp.group.visible && s.camp.group.parent !== null, built: [s.camp.igloos.length, s.camp.ponds.length, s.camp.igloos.every((g) => g.children.length >= 5), s.camp.ponds.every((g) => g.children.length === 3)] }; });
    assert(place.igloos.length === 3 && place.ponds.length === 3 && place.shown && place.built.join() === '3,3,true,true', '이글루 셋과 낚시터 셋이 그려져야 한다: ' + JSON.stringify(place.built));
    const sites = [...place.igloos.map((g) => ({ ...g, kind: '이글루' })), ...place.ponds.map((g) => ({ ...g, kind: '낚시터' }))];
    // 서로 겹치지 않고 멀리 떨어져 있다 (이글루끼리도, 낚시터끼리도, 이글루와 낚시터도)
    let closest = 1e9;
    for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) closest = Math.min(closest, Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z));
    assert(closest > 40, '두 곳이 너무 가깝다: ' + closest.toFixed(1));
    // 트리 둘레에 흩어져 있다: 트리에서 멀찍이, 들판 안에, 들어오는 자리에서 바로 보이지 않을 만큼 떨어져, 여러 방향에
    for (const g of sites) {
      const r = Math.hypot(g.x, g.z);
      assert(r > 40 && r + g.radius + 4 < 110, g.kind + '가 트리에 너무 가깝거나 들판 밖이다: ' + r.toFixed(0));
      assert(Math.hypot(g.x, g.z - 15) > 35, g.kind + '가 들어오는 자리에 너무 가깝다');
    }
    const angles = sites.map((g) => (Math.atan2(g.x, g.z) * 180 / Math.PI + 360) % 360).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (angles[(i + 1) % angles.length] - a + 360) % 360);
    assert(Math.max(...gaps) < 100 && Math.min(...gaps) > 30, '트리 둘레에 고루 흩어져 있어야 한다 (사이 각도: ' + gaps.map((g) => g.toFixed(0)) + ')');
    for (const pond of place.ponds) assert(Math.hypot(pond.hole.x - pond.x, pond.hole.z - pond.z) < pond.radius - 1, '낚시 구멍이 연못 위에 있지 않다');
    // 이글루마다: 뒤에서 걸어가도, 문 쪽에서 걸어가도 안으로 들어갈 수 없다
    const toward = (x, z, tx, tz) => snow(p, ([x, z, tx, tz]) => { const s = window.__snow; s.teleport(x, z); s.me.camYaw = Math.atan2(tx - x, tz - z); }, [x, z, tx, tz]);
    for (const g of place.igloos) {
      const r = Math.hypot(g.x, g.z), ux = g.x / r, uz = g.z / r;          // 트리에서 이글루 쪽
      await toward(g.x + ux * 7 + 2, g.z + uz * 7, g.x, g.z);
      await walk(p, 0, 1, 7);
      let s = await state(p);
      assert(Math.hypot(s.x - g.x, s.z - g.z) >= g.radius + 0.29, '이글루 속으로 들어갔다: ' + Math.hypot(s.x - g.x, s.z - g.z).toFixed(2));
      await toward(g.x - ux * 9, g.z - uz * 9, g.x, g.z);
      await walk(p, 0, 1, 7);
      s = await state(p);
      assert(Math.hypot(s.x - g.x, s.z - g.z) >= 4.4, '문간으로 들어갔다: ' + Math.hypot(s.x - g.x, s.z - g.z).toFixed(2));
    }
    // 낚시터마다: 얼음 위를 걸으면 발소리는 나지만 발자국은 남지 않고, 구멍은 밟고 지나갈 수 없다
    for (const pond of place.ponds) {
      const r = Math.hypot(pond.x, pond.z), ux = pond.x / r, uz = pond.z / r;
      await toward(pond.x + ux * 3.4, pond.z + uz * 3.4, pond.hole.x - uz * 0.3, pond.hole.z + ux * 0.3);      // 구멍을 살짝 비껴 향한다 (스치며 돌아 지나가게)
      const a = await state(p);
      await walk(p, 0, 1, 1.4);
      const b = await state(p);
      assert(b.audio.steps - a.audio.steps >= 3 && b.prints === a.prints, '얼음 위: 발소리 ' + (b.audio.steps - a.audio.steps) + '번, 발자국 ' + (b.prints - a.prints) + '개');
      assert(b.audio.packed - a.audio.packed === b.audio.steps - a.audio.steps, '얼음 위의 발소리는 낮은 소리여야 한다');
      await walk(p, 0, 1, 3);
      const c = await state(p);
      assert(Math.hypot(c.x - pond.hole.x, c.z - pond.hole.z) >= pond.hole.radius + 0.37, '낚시 구멍 속으로 들어갔다');
      await walk(p, 0, 1, 7);                                             // 연못을 벗어나면 다시 남는다
      assert((await state(p)).prints > b.prints, '연못 밖인데 발자국이 안 남는다');
    }
  });

  await test('세 낚시터 어디서나 낚시를 할 수 있고, 이글루 곁에서는 눈 천사 버튼 그대로다', async () => {
    const p = await page();
    await byHand(p);
    const n = await snow(p, () => window.__snow.place.holes.length);
    for (let i = 0; i < n; i++) {
      await snow(p, (i) => { const s = window.__snow, h = s.place.holes[i]; s.teleport(h.x + 1.2, h.z - 1.3); s.me.idle = 0; s.fishing.debug.biteIn(0.5); s.fishing.debug.next('smelt'); s.act(); }, i);
      await walk(p, 0, 0, 1.3);
      const f = await snow(p, (i) => { const s = window.__snow, h = s.place.holes[i]; return { phase: s.fishing.phase, dist: Math.hypot(s.me.x - h.x, s.me.z - h.z), angels: s.tracks.angelCount }; }, i);
      assert(f.phase === 'bite' && Math.abs(f.dist - 1.55) < 0.02 && f.angels === 0, (i + 1) + '번째 낚시터에서 낚시가 되지 않는다: ' + JSON.stringify(f));
      await snow(p, () => window.__snow.act());
      await walk(p, 0, 0, 0.8);
      assert((await snow(p, () => window.__snow.fishing.stats.caught)) === i + 1, (i + 1) + '번째 낚시터에서 낚이지 않는다');
      await walk(p, 0, 0, 3.4);                                           // 들어 보이고 놓아준 뒤
      await snow(p, () => window.__snow.act());                           // 그만두기
      await walk(p, 0, 0, 0.6);
      assert(!(await snow(p, () => window.__snow.fishing.active)), '그만두기를 눌렀는데 아직 낚시 중이다');
    }
    // 이글루 문 앞에서는 낚시가 아니라 눈 천사
    await snow(p, () => { const s = window.__snow, g = s.place.igloos[0], r = Math.hypot(g.x, g.z); s.teleport(g.x - g.x / r * 6, g.z - g.z / r * 6); s.act(); });
    await walk(p, 0, 0, 0.2);
    assert((await state(p)).angel && !(await snow(p, () => window.__snow.fishing.active)), '이글루 앞에서는 눈 천사를 해야 한다');
  });

  await test('낚시 구멍 곁에 서면 눈 천사 버튼이 낚시 버튼으로 바뀌고, 누르면 앉아서 낚싯대를 드리운다. 같은 자리의 ✕ 버튼을 눌러야 그만둔다', async () => {
    const p = await page();
    const button = () => p.evaluate(() => { const el = document.querySelector('#angel'), show = (c) => getComputedStyle(el.querySelector(c)).display !== 'none'; return { label: el.getAttribute('aria-label'), angel: show('.angel-icon'), fish: show('.fish-icon'), quit: show('.quit-icon'), at: [el.offsetLeft, el.offsetTop, el.offsetWidth] }; });      // 놓인 자리 (누를 때 잠깐 튀는 것은 빼고)
    let b = await button();
    const home = b.at.join();
    assert(b.angel && !b.fish && !b.quit && b.label === '눈 천사 만들기', '평소에는 눈 천사 버튼: ' + JSON.stringify(b));
    await toHole(p);
    await until(async () => (await button()).fish, { what: '낚시 버튼' });
    b = await button();
    assert(!b.angel && !b.quit && b.label === '낚시하기' && b.at.join() === home, '구멍 곁에서는 같은 자리에 물고기 그림: ' + JSON.stringify(b));
    await until(async () => (await p.textContent('#toast')).includes('얼음 구멍'), { what: '낚시터 안내' });
    await snow(p, () => window.__snow.fishing.debug.biteIn(60));           // 이 점검에서는 입질도 가짜 입질도 오지 않게 한다
    await p.click('#angel');
    await walk(p, 0, 0, 1.3);
    let f = await fishLook(p);
    assert(f.active && f.phase === 'wait' && f.angels === 0, '버튼을 눌렀는데 낚시를 시작하지 않았다: ' + JSON.stringify(f));
    assert(f.sitY < -0.07 && f.footZ > 0.2 && Math.abs(f.dist - 1.55) < 0.02 && f.facing < 0.02, '구멍을 보고 앉아야 한다: ' + JSON.stringify(f));
    assert(f.rod && f.item === null && f.floatY !== null && f.floatY > 0.02 && f.floatY < 0.08, '낚싯대를 들고, 찌가 물 위에 떠 있어야 한다: ' + JSON.stringify(f));
    await until(async () => (await p.textContent('#toast')).includes('찌가 쑥'), { what: '낚시 방법 안내' });
    // 낚시하는 동안 그 버튼은 같은 자리의 그만두기(✕) 버튼이다
    await until(async () => (await button()).quit, { what: '그만두기 버튼' });
    b = await button();
    assert(!b.angel && !b.fish && b.label === '낚시 그만두기' && b.at.join() === home, '낚시 중에는 같은 자리에 ✕ 그림: ' + JSON.stringify(b));
    // 걸으려 해도 일어나지 않는다 (조이스틱을 건드려 낚시가 풀리지 않게)
    const before = await state(p);
    await walk(p, 0, 1, 3);
    f = await fishLook(p);
    const still = await state(p);
    assert(f.active && f.phase === 'wait' && Math.hypot(still.x - before.x, still.z - before.z) < 1e-6, '걸으려 했더니 낚시가 풀렸다: ' + JSON.stringify(f));
    // ✕ 버튼을 누르면 일어난다
    await p.click('#angel');
    await walk(p, 0, 0, 0.6);
    f = await fishLook(p);
    assert(!f.active && f.sitY === 0 && Math.abs(f.footZ - 0.02) < 1e-6 && f.floatY === null && !f.rod, '그만두기 버튼을 누르면 일어나야 한다: ' + JSON.stringify(f));
    await until(async () => (await button()).fish, { what: '다시 낚시 버튼' });
    await walk(p, 0, 1, 2);
    const after = await state(p);
    assert(Math.hypot(after.x - before.x, after.z - before.z) > 1, '일어난 뒤에 걸을 수 없다');
    // 구멍에서 멀어지면 다시 눈 천사 버튼
    await snow(p, () => window.__snow.teleport(0, 20));
    await until(async () => (await button()).angel, { what: '눈 천사 버튼으로 돌아옴' });
    await p.click('#angel');
    assert((await state(p)).angel, '구멍에서 먼 곳에서는 눈 천사를 해야 한다');
  });

  await test('기다리는 동안 가짜 입질이 온다: 찌가 살짝만 까딱이고 단추는 ✕ 그대로다. 그때 서둘러 눌러도 일어나지 않고, 잃는 것 없이 다시 기다린다', async () => {
    const p = await page();
    await byHand(p);
    await toHole(p);
    await snow(p, () => { const s = window.__snow; s.sim(0.1); s.fishing.debug.biteIn(30); s.act(); s.sim(1.4); });
    let f = await fishLook(p);
    const rest = f.floatY, water = f.water;
    assert(f.phase === 'wait' && f.stats.nibbles === 0, '아직 아무 일도 없어야 한다: ' + JSON.stringify(f.stats));
    // 가짜 입질 한 번: 찌가 살짝 내려갔다 올라오고, 가벼운 톡 소리가 난다. 단추는 그만두기 그대로다
    await snow(p, () => { const s = window.__snow; s.fishing.debug.nibbles([0.1]); s.sim(0.1 + 0.16); });
    f = await fishLook(p);
    const button = await snow(p, () => window.__snow.fishing.button);
    assert(f.stats.nibbles === 1 && f.water === water + 1, '가짜 입질이 오지 않았다: ' + JSON.stringify(f.stats));
    assert(f.floatY < rest - 0.02 && f.floatY > -0.01, `찌는 살짝만 내려가야 한다 (물 밖에 남는다): ${rest.toFixed(3)} → ${f.floatY.toFixed(3)}`);
    assert(f.phase === 'wait' && button === null && f.stats.bites === 0, '가짜 입질 동안 단추는 물고기로 바뀌지도, 그만두기로 눌리지도 않아야 한다: ' + button);
    const look = () => p.evaluate(() => { const el = document.querySelector('#angel'); return { rest: el.classList.contains('rest'), quit: el.classList.contains('quit'), bite: el.classList.contains('bite'), opacity: Number(getComputedStyle(el).opacity), clickable: getComputedStyle(el).pointerEvents !== 'none' }; });
    await until(async () => { const v = await look(); return v.rest && v.opacity === 0.5; }, { what: '단추가 흐려져 쉬는 모습' });
    let b = await look();
    assert(b.quit && !b.bite && b.clickable, '가짜 입질 동안의 단추: ' + JSON.stringify(b));
    // 서둘러 눌렀다: 일어나지 않고, 기다림은 그대로 이어진다. 처음 한 번은 일렀다고 알려 준다
    await p.click('#angel');
    await snow(p, () => window.__snow.sim(0.3));
    f = await fishLook(p);
    assert(f.active && f.phase === 'wait' && f.stats.early === 1 && f.stats.missed === 0, '서둘러 눌렀더니 낚시가 풀렸거나 놓친 것으로 쳤다: ' + JSON.stringify(f));
    assert((await p.textContent('#toast')).includes('조금 일렀어요'), '일렀다는 말이 없다: ' + await p.textContent('#toast'));
    // 가짜 입질이 지나가면 단추는 다시 또렷한 그만두기가 되고, 누르면 평소처럼 일어난다
    await snow(p, () => window.__snow.sim(1.1));
    await until(async () => !(await look()).rest, { what: '단추가 돌아옴' });
    assert((await snow(p, () => window.__snow.fishing.button)) === 'quit', '가짜 입질이 지나갔는데 그만둘 수 없다');
    await snow(p, () => { const s = window.__snow; s.act(); s.sim(0.6); });
    f = await fishLook(p);
    assert(!f.active, '가짜 입질 뒤에 그만둘 수 없게 됐다: ' + JSON.stringify(f));
    // 가짜 입질 뒤에 오는 진짜 입질은 그대로 낚인다
    await snow(p, () => { const s = window.__snow; s.sim(0.2); s.fishing.debug.nibbles([0.6]); s.fishing.debug.biteIn(2.4); s.fishing.debug.next('smelt'); s.act(); s.sim(0.6 + 2.4 + 0.2); });
    f = await fishLook(p);
    assert(f.phase === 'bite' && f.stats.nibbles === 2 && f.floatY < 0.02, '가짜 입질 뒤의 진짜 입질: ' + JSON.stringify(f));
    await snow(p, () => { const s = window.__snow; s.act(); s.sim(0.7); });
    assert((await fishLook(p)).item === 'smelt', '진짜 입질에 눌렀는데 낚이지 않았다');
  });

  await test('입질이 오면 찌가 쑥 들어가고 버튼이 물고기로 바뀐다. 그때 누르면 낚아 올려 들어 보인 뒤 놓아주고, 놓치면 다시 기다린다', async () => {
    const p = await page();
    await byHand(p);
    await toHole(p);
    const act = () => snow(p, () => window.__snow.act());
    const label = () => p.getAttribute('#angel', 'aria-label');
    await snow(p, () => { const s = window.__snow; s.fishing.debug.biteIn(2); s.act(); });
    await walk(p, 0, 0, 0.7);
    await act();                                                          // 막 앉자마자 누른 것은 그만두기로 치지 않는다
    await walk(p, 0, 0, 0.1);
    let f = await fishLook(p);
    assert(f.active && f.phase === 'wait', '앉자마자 누른 것 때문에 낚시가 풀렸다: ' + JSON.stringify(f));
    const w0 = f.water;
    await walk(p, 0, 0, 2.0);
    f = await fishLook(p);
    assert(f.phase === 'bite' && f.stats.bites === 1 && f.water === w0 + 1, '2초 뒤에 입질이 와야 한다 (퐁 소리와 함께): ' + JSON.stringify(f));
    let low = 9;
    for (let i = 0; i < 12; i++) { await walk(p, 0, 0, 1 / 30); low = Math.min(low, (await fishLook(p)).floatY); }
    assert(low < 0, '입질인데 찌가 물속으로 들어가지 않는다: ' + low);
    await until(async () => p.evaluate(() => { const c = document.querySelector('#angel').classList; return c.contains('bite') && c.contains('fish') && !c.contains('quit'); }), { what: '두근거리는 물고기 버튼' });
    assert((await label()) === '낚아 올리기', '입질 때의 버튼 설명: ' + await label());
    // 놓치면: 물고기는 달아나고 다시 기다린다. 한 박자 늦게 누른 것은 그만두기로 치지 않는다
    await walk(p, 0, 0, 2.3);
    await act();
    await walk(p, 0, 0, 0.3);
    f = await fishLook(p);
    assert(f.active && f.phase === 'wait' && f.stats.missed === 1 && f.stats.caught === 0, '입질을 놓치면 다시 기다려야 한다 (늦게 눌러도 낚시는 이어진다): ' + JSON.stringify(f));
    await until(async () => (await label()) === '낚시 그만두기', { what: '다시 그만두기 버튼' });
    // 네 가지가 모두 낚인다: 누르면 올라오고, 이름을 알려 주고, 잠깐 들어 보인 뒤 놓아준다
    for (const [id, name] of [['smelt', '빙어'], ['cherry', '산천어'], ['trout', '송어'], ['boot', '낡은 장화']]) {
      const w = (await fishLook(p)).water, n = (await fishLook(p)).stats.caught;
      await snow(p, (k) => { const s = window.__snow; s.fishing.debug.biteIn(0.2); s.fishing.debug.next(k); }, id);
      await walk(p, 0, 0, 0.4);
      await act();
      await walk(p, 0, 0, 0.2);
      assert((await fishLook(p)).phase === 'pull', id + ': 눌렀는데 낚아 올리지 않는다');
      await walk(p, 0, 0, 0.6);
      f = await fishLook(p);
      assert(f.phase === 'show' && f.stats.caught === n + 1 && f.stats.last === id && f.item === id && f.floatY === null, id + ': 낚은 것을 들어 보여야 한다: ' + JSON.stringify(f));
      assert((await p.textContent('#toast')).includes(name + '를 낚았어요'), '낚은 것의 이름: ' + await p.textContent('#toast'));
      await act();                                                        // 들어 보이는 동안에는 눌러도, 걸으려 해도 그대로 있는다
      await walk(p, 0, 0.9, 0.5);
      f = await fishLook(p);
      assert(f.active && f.phase === 'show', '들어 보이는 중에 낚시가 풀렸다: ' + JSON.stringify(f));
      await walk(p, 0, 0, 2.3);
      f = await fishLook(p);
      assert(f.phase === 'wait' && f.water === w + 3 && f.item === null && f.floatY !== null, id + ': 놓아주고 다시 기다려야 한다 (퐁, 첨벙, 퐁): ' + JSON.stringify(f));
    }
    // 눈은 서 있을 때만 쌓인다: 오래 앉아 낚시해도 쌓이지 않고, 그만두고 서 있으면 다시 쌓인다
    await snow(p, () => window.__snow.fishing.debug.biteIn(9999));
    await walk(p, 0, 0, 60);
    f = await fishLook(p);
    assert(f.active && f.snow === 0 && f.pop === 0 && !f.shell && !f.hat, '앉아서 낚시하는 동안에는 눈이 쌓이지 않아야 한다: ' + JSON.stringify(f));
    await act();
    await walk(p, 0, 0, 20);
    f = await fishLook(p);
    assert(!f.active && f.snow === 1 && f.hat, '그만두고 서 있으면 다시 쌓여야 한다: ' + JSON.stringify(f));
    // 무엇이 낚일지: 빙어가 절반을 넘고, 장화는 드물다
    const draws = await snow(p, () => { const n = {}; for (let i = 0; i < 6000; i++) { const k = window.__snow.fishing.debug.draw(); n[k] = (n[k] || 0) + 1; } return n; });
    assert(draws.smelt / 6000 > 0.5 && draws.smelt / 6000 < 0.64 && draws.boot / 6000 > 0.03 && draws.boot / 6000 < 0.09 && draws.cherry > draws.trout && draws.trout > draws.boot, '낚이는 비율: ' + JSON.stringify(draws));
  });

  await test('이글루 벽 곁이나 연못 가에서 눈 천사를 만들면 조금 비켜나서 눕고, 얼음 위에서는 만들지 않는다', async () => {
    const p = await page();
    await byHand(p);
    // 이글루 벽으로 걸어 들어가 선 채로: 누운 몸의 어느 곳도 이글루에 파묻히지 않는다
    const wall = await snow(p, () => {
      const s = window.__snow, g = s.place.igloos[1], away = Math.hypot(g.x, g.z);
      s.teleport(g.x + g.z / away * 6, g.z - g.x / away * 6);            // 이글루 옆(문이 없는 쪽)에서
      s.me.yaw = s.me.camYaw = Math.atan2(g.x - s.me.x, g.z - s.me.z);
      s.controls.debugMove(0, 1); s.sim(4); s.controls.debugMove(0, 0);
      const stood = Math.hypot(s.me.x - g.x, s.me.z - g.z), n0 = s.tracks.angelCount;
      s.act(); s.sim(1.5);
      const c = Math.cos(s.me.yaw), sn = Math.sin(s.me.yaw);
      const reach = [[0, -1.0], [0, 0.6], [-1.0, -0.38], [1.0, -0.38]].map(([lx, lz]) => Math.hypot(s.me.x + lx * c + lz * sn - g.x, s.me.z - lx * sn + lz * c - g.z));
      return { stood, lying: !!s.me.angel, nearest: Math.min(...reach), made: s.tracks.angelCount - n0 };
    });
    assert(wall.stood < 2.9, '이글루 벽까지 가지 못했다: ' + wall.stood.toFixed(2));
    assert(wall.lying && wall.made === 1, '벽 곁에서 눈 천사를 만들지 못했다: ' + JSON.stringify(wall));
    assert(wall.nearest >= 2.75, '누운 몸이 이글루 벽에 파묻힌다 (이글루 가운데에서 ' + wall.nearest.toFixed(2) + ', 벽은 2.5)');
    // 얼음 한가운데: 눈이 없으니 만들지 않고, 그렇다고 알려 준다
    const ice = await snow(p, () => {
      const s = window.__snow; s.sim(12);                                // 앞의 눈 천사를 마저 하고 일어난다
      const pond = s.place.ponds[1], away = Math.hypot(pond.x, pond.z), n0 = s.tracks.angelCount;
      s.teleport(pond.x + pond.x / away * 3.4, pond.z + pond.z / away * 3.4);      // 구멍의 반대쪽 얼음 위
      s.sim(0.1); s.act(); s.sim(0.5);
      return { onIce: s.place.onIce(s.me.x, s.me.z), nearHole: !!s.place.holeNear(s.me.x, s.me.z), lying: !!s.me.angel, fishing: s.fishing.active, made: s.tracks.angelCount - n0 };
    });
    assert(ice.onIce && !ice.nearHole, '얼음 위에 서지 못했다: ' + JSON.stringify(ice));
    assert(!ice.lying && !ice.fishing && ice.made === 0, '얼음 위에서 눈 천사를 만들었다: ' + JSON.stringify(ice));
    assert((await p.textContent('#toast')).includes('얼음 위'), '얼음 위라서 안 된다는 말이 없다: ' + await p.textContent('#toast'));
    // 연못 가의 눈 위: 자국이 얼음에 걸치지 않게 조금 물러나서 눕는다
    const edge = await snow(p, () => {
      const s = window.__snow, pond = s.place.ponds[1], away = Math.hypot(pond.x, pond.z), n0 = s.tracks.angelCount;
      s.teleport(pond.x + pond.x / away * (pond.radius + 0.2), pond.z + pond.z / away * (pond.radius + 0.2));
      s.sim(0.1); s.act(); s.sim(1.5);
      return { lying: !!s.me.angel, made: s.tracks.angelCount - n0, from: Math.hypot(s.me.x - pond.x, s.me.z - pond.z), radius: pond.radius };
    });
    assert(edge.lying && edge.made === 1 && edge.from >= edge.radius + 1.05, '연못 가에서는 자국이 얼음에 걸치지 않게 물러나 누워야 한다: ' + JSON.stringify(edge));
  });

  await test('밤이면 이글루 문에 불이 켜진다. 문은 트리 쪽을 보고, 문 앞의 불빛은 눈발에 묻힌 먼 이글루에서는 보이지 않는다', async () => {
    const p = await page('t=22:00&speed=0');
    const look = (i, d) => snow(p, async ([n, far]) => {
      const s = window.__snow, g = s.place.igloos[n], r = Math.hypot(g.x, g.z);
      s.teleport(g.x - g.x / r * far, g.z - g.z / r * far);              // 트리 쪽으로 far 만큼 떨어진 자리에서 이글루를 본다
      s.me.yaw = s.me.camYaw = Math.atan2(g.x - s.me.x, g.z - s.me.z);
      await new Promise((done) => setTimeout(done, 900));
      const ig = s.camp.igloos[n], spill = ig.userData.spill;
      let lit = 0; ig.traverse((o) => { if (o.isMesh && o.material.emissive && o.material.emissive.getHex() !== 0) lit = Math.max(lit, o.material.emissiveIntensity); });      // 문 안쪽(불빛을 내는 재질)
      const door = [Math.sin(ig.rotation.y), Math.cos(ig.rotation.y)];   // 문이 난 쪽
      return { lit, spill: spill.visible ? spill.material.opacity : 0, toTree: -(door[0] * g.x + door[1] * g.z) / r };
    }, [i, d]);
    for (const i of [0, 1, 2]) {
      const near = await look(i, 12);
      assert(near.lit > 0.9 && near.spill > 0.3, `맑은 밤, 이글루 ${i + 1} 가까이: 문 안과 문 앞에 불빛이 있어야 한다 ` + JSON.stringify(near));
      assert(near.toTree > 0.97, `이글루 ${i + 1} 의 문이 트리 쪽을 보지 않는다: ` + near.toTree.toFixed(2));
    }
    // 폭설의 밤: 가까이에서는 보이고, 눈발에 이글루가 묻히는 먼 곳에서는 불빛도 보이지 않는다
    await snow(p, () => window.__snow.clock.setTime('21:10'));
    await until(async () => (await state(p)).snowfall === 1, { what: '폭설' });
    const close = await look(2, 10), far = await look(2, 60);
    assert(close.spill > 0.15, '폭설의 밤, 가까이에서는 문 앞 불빛이 보여야 한다: ' + JSON.stringify(close));
    assert(far.spill === 0, '눈발에 묻힌 먼 이글루의 불빛이 떠 보인다: ' + JSON.stringify(far));
    // 낮에는 꺼져 있다
    await snow(p, () => window.__snow.clock.setTime('13:00'));
    await until(async () => (await p.evaluate(() => window.__snow.palette.elev)) > 10, { what: '낮' });
    const day = await look(0, 12);
    assert(day.lit === 0 && day.spill === 0, '낮인데 이글루에 불이 켜져 있다: ' + JSON.stringify(day));
  });

  await test('카메라가 등 뒤에 있는 채로 낚시를 시작하면 옆으로 비켜서서 구멍과 찌가 보이고, 물결이 그려진다', async () => {
    const p = await page();
    await byHand(p);
    const rel = () => snow(p, () => { const s = window.__snow; return Math.atan2(Math.sin(s.me.camYaw - s.me.yaw), Math.cos(s.me.camYaw - s.me.yaw)); });
    // 구멍으로 곧장 걸어와서(카메라는 등 뒤) 버튼을 누른다
    await snow(p, () => { const s = window.__snow, h = s.place.hole, d = Math.hypot(h.x, h.z); s.teleport(h.x - h.x / d * 1.8, h.z - h.z / d * 1.8); s.me.yaw = s.me.camYaw = Math.atan2(h.x - s.me.x, h.z - s.me.z); s.me.idle = 0; s.sim(0.1); s.fishing.debug.biteIn(60); s.act(); s.sim(2.5); });
    const side = await rel();
    assert(Math.abs(Math.abs(side) - 1.05) < 0.03, '등 뒤에서 옆으로 비켜서야 한다 (등 뒤가 0): ' + side.toFixed(2));
    // 낚시를 그만둬도 카메라는 그 자리에 있고, 이미 옆에서 보고 있었다면 다시 돌지 않는다
    await snow(p, () => { const s = window.__snow; s.act(); s.sim(0.8); s.fishing.debug.biteIn(60); s.act(); s.sim(2.5); });
    assert(Math.abs((await rel()) - side) < 0.03, '이미 옆에서 보고 있는데 카메라가 또 돌았다: ' + (await rel()).toFixed(2));
    // 직접 둘러보기 시작하면 더 돌리지 않는다
    await snow(p, () => { const s = window.__snow; s.act(); s.sim(0.8); s.me.camYaw = s.me.yaw; s.fishing.debug.biteIn(60); s.act(); s.sim(0.15); });
    await pointer(p, 'pointerdown', 7, 300, 300); await pointer(p, 'pointermove', 7, 296, 300);
    await snow(p, () => window.__snow.sim(2));
    await pointer(p, 'pointerup', 7, 296, 300);
    const held = await rel();
    assert(Math.abs(held) < 0.6, '둘러보는 중에도 카메라가 마저 돌았다: ' + held.toFixed(2));
    // 입질의 물결 고리는 물보다 앞에 그려진다 (전에는 물에 가려 한 번도 보이지 않았다)
    const rings = await snow(p, () => { const s = window.__snow; s.fishing.debug.biteIn(0.05); s.sim(0.3); return s.fishing.ripples; });
    assert(rings.some((r) => r.visible && r.opacity > 0.2), '입질인데 물결이 없다: ' + JSON.stringify(rings));
    assert(rings.every((r) => r.offset <= -4), '물결이 물(-3)보다 앞에 그려지지 않는다: ' + JSON.stringify(rings));
  });

  await test('입질은 4초에서 12초 사이에 오고, 물고기를 놓아준 바로 뒤에 한 박자 늦게 누른 것은 그만두기로 치지 않는다', async () => {
    const p = await page();
    await byHand(p);
    await toHole(p);
    const waits = await snow(p, () => {
      const s = window.__snow, out = [];
      s.sim(0.1);
      for (let i = 0; i < 14; i++) { s.act(); s.sim(0.7); out.push(s.fishing.waitFor); s.sim(0.6); s.act(); s.sim(0.6); }      // 앉았다 일어나기를 되풀이하며 정해진 기다림을 모은다
      return out;
    });
    assert(waits.every((w) => w >= 4 && w <= 12), '입질까지의 기다림이 4~12초를 벗어난다: ' + waits.map((w) => w && w.toFixed(1)));
    assert(Math.max(...waits) - Math.min(...waits) > 2, '기다림이 늘 같다: ' + waits.map((w) => w.toFixed(1)));
    // 낚아서 놓아준 바로 뒤
    await snow(p, () => { const s = window.__snow; s.fishing.debug.biteIn(0.2); s.fishing.debug.next('smelt'); s.act(); s.sim(0.6 + 0.2 + 0.2); s.act(); });
    await snow(p, () => { const s = window.__snow; for (let i = 0; i < 600 && s.fishing.phase !== 'release'; i++) s.sim(1 / 60); for (let i = 0; i < 600 && s.fishing.phase === 'release'; i++) s.sim(1 / 60); s.fishing.debug.biteIn(60); });
    let f = await fishLook(p);
    assert(f.phase === 'wait' && f.stats.caught === 1, '낚아서 놓아주지 못했다: ' + JSON.stringify(f.stats) + ' ' + f.phase);
    await snow(p, () => { const s = window.__snow; s.sim(0.3); s.act(); s.sim(0.6); });
    f = await fishLook(p);
    assert(f.active && f.phase === 'wait', '놓아준 바로 뒤의 누름에 낚시가 풀렸다: ' + f.phase);
    await snow(p, () => { const s = window.__snow; s.sim(0.4); s.act(); s.sim(0.6); });
    assert(!(await fishLook(p)).active, '한숨 돌린 뒤에는 그만둘 수 있어야 한다');
  });

  await test('여우는 이글루들을 돌아서 다니고, 얼음 위에는 여우 발자국도 남지 않는다', async () => {
    const p = await page();
    const r = await snow(p, async () => {
      const { IGLOOS, onIce } = await import('./js/igloo.js');
      const { sinceStorm, STORM_LENGTH_MS } = await import('./js/clock.js');
      const settled = (ms) => sinceStorm(ms) > STORM_LENGTH_MS + 4 * 60e3;      // 폭설 중이거나 막 그친 때에는 여우 발자국이 거의 없다: 그런 때는 피해서 본다
      const s = window.__snow, t0 = s.clock.now();
      let near = 1e9, jump = 0, prev = s.fox.at(t0);
      for (let i = 1; i <= 12 * 3600 * 2; i++) { const f = s.fox.at(t0 + i * 500); for (const g of IGLOOS) near = Math.min(near, Math.hypot(f.x - g.x, f.z - g.z)); jump = Math.max(jump, Math.hypot(f.x - prev.x, f.z - prev.z)); prev = f; }
      // 여우가 연못을 지나간 때를 찾아 그 무렵의 발자국을 본다
      let onPond = null;
      for (let i = 0; i < 48 * 3600 && onPond === null; i++) { const f = s.fox.at(t0 + i * 1000); if (onIce(f.x, f.z) && f.move > 0.5 && settled(t0 + i * 1000 + 60e3)) onPond = t0 + i * 1000; }
      let icy = -1, around = -1;
      if (onPond !== null) {
        s.clock.skip(onPond + 60e3 - s.clock.now());
        await new Promise((done) => setTimeout(done, 900));
        const paws = s.tracks.paws();
        icy = paws.filter((it) => onIce(it.x, it.z)).length; around = paws.length;
      }
      return { near, jump, onPond: onPond !== null, icy, around };
    });
    assert(r.near >= 3.2, '여우가 이글루 속을 지나간다 (가운데에서 ' + r.near.toFixed(2) + ')');
    assert(r.jump < 1.5, '이글루를 돌아가다가 건너뛴다 (0.5초에 ' + r.jump.toFixed(2) + ')');
    assert(!r.onPond || (r.icy === 0 && r.around > 50), '얼음 위에 여우 발자국이 남았다: ' + JSON.stringify(r));
  });

  console.log('\n■ 트리의 캐롤');
  await test('옛 캐롤 열 곡의 악보가 온전하다 (마디가 맞고, 으뜸음으로 끝난다)', async () => {
    const p = await page(undefined, { enter: false });
    const list = await p.evaluate(async () => {
      const m = await import('./js/carols.js');
      return m.CAROLS.map((c) => { const seq = m.parseNotes(c.notes); return { id: c.id, title: c.title, tempo: c.tempo, n: seq.length, beats: seq.reduce((a, [, d]) => a + d, 0), lo: Math.min(...seq.filter(([x]) => x !== null).map(([x]) => x)), hi: Math.max(...seq.filter(([x]) => x !== null).map(([x]) => x)), last: seq[seq.length - 1][0] }; });
    });
    assert(list.length === 10 && new Set(list.map((c) => c.id)).size === 10, '열 곡이어야 한다: ' + list.length);
    // 곡마다: 전체 길이(4분음표 수)와 마지막 음(으뜸음)
    const want = { jingle: [64, 60], silent: [72, 60], deck: [64, 60], joy: [38, 60], tree: [48, 72], wish: [48, 67], noel: [72, 64], manger: [48, 65], hark: [80, 67], angels: [84, 65] };
    for (const c of list) {
      assert(want[c.id], '모르는 곡: ' + c.id);
      assert(Math.abs(c.beats - want[c.id][0]) < 1e-6, `${c.title}: 길이 ${c.beats} (기대 ${want[c.id][0]})`);
      assert(c.last === want[c.id][1], `${c.title}: 마지막 음 ${c.last} (기대 ${want[c.id][1]})`);
      assert(c.lo >= 55 && c.hi <= 84 && c.tempo >= 60 && c.tempo <= 200 && c.title, `${c.title}: 음역 ${c.lo}~${c.hi}, 빠르기 ${c.tempo}`);
    }
  });

  await test('트리 가까이에서는 오르골 캐롤이 들리고, 멀어지면 들리지 않는다', async () => {
    const p = await page();
    await snow(p, () => window.__snow.teleport(0, 5));
    await until(async () => { const c = (await state(p)).audio.carol; return c && c.notes >= 4 && c.gain > 0.2; }, { what: '캐롤 음표', timeout: 30000 });
    await until(async () => (await p.textContent('#carol')).length > 3, { what: '캐롤 제목' });
    const shown = await p.evaluate(() => ({ title: document.querySelector('#carol').textContent, row: !document.querySelector('#carol-row').hidden, note: getComputedStyle(document.querySelector('#carol-row .badge')).display !== 'none' }));
    const TITLES = ['Jingle Bells', 'Silent Night', 'Deck the Halls', 'Joy to the World', 'O Christmas Tree', 'We Wish You a Merry Christmas', 'The First Noel', 'Away in a Manger', 'Hark! The Herald Angels Sing', 'Angels We Have Heard on High'];
    assert(TITLES.includes(shown.title) && shown.row && shown.note, '캐롤 제목은 영어로, 음표 그림과 함께 보여야 한다: ' + JSON.stringify(shown));
    await snow(p, () => window.__snow.teleport(0, 80));
    await until(async () => (await state(p)).audio.carol.gain === 0, { what: '멀어짐' });
    const n = (await state(p)).audio.carol.notes;
    await sleep(2500);
    assert((await state(p)).audio.carol.notes === n, '멀리서도 음표를 계속 만든다');
    assert((await p.textContent('#carol')) === '' && (await p.evaluate(() => document.querySelector('#carol-row').hidden)), '멀리서도 제목이 보인다');
  });

  console.log('\n■ 다시 왔을 때');
  await test('길잡이는 처음 온 기기에서만 보이고, 한 번 해 본 뒤에는 다시 와도 나오지 않는다', async () => {
    const o = await open(browser, site.url, { query: 'persist=1&look=scarf', errors });
    opened.push(o.ctx);
    const p = o.page;
    const tips = () => p.evaluate(() => ({ walk: document.body.classList.contains('coach-walk'), look: document.body.classList.contains('coach-look') }));
    let t = await tips();
    assert(t.walk && t.look, '처음 온 기기인데 길잡이가 없다');
    await walk(p, 0, 1, 1.2);
    await pointer(p, 'pointerdown', 7, 300, 300); await pointer(p, 'pointermove', 7, 200, 320); await pointer(p, 'pointerup', 7, 200, 320);
    await walk(p, 0, 0, 0.1);
    t = await tips();
    assert(!t.walk && !t.look, '해 봤는데 길잡이가 남았다');
    await p.reload();
    await p.waitForFunction(() => window.__snow && window.__snow.ready);
    await p.click('#enter');
    await sleep(600);
    t = await tips();
    assert(!t.walk && !t.look, '두 번째로 왔는데 길잡이가 또 나왔다');
  });

  await test('창을 닫았다 다시 열면 서 있던 자리와 발자국이 그대로다', async () => {
    const o = await open(browser, site.url, { query: 't=14:00&speed=0&persist=1&look=scarf', errors });
    opened.push(o.ctx);
    const p = o.page;
    await walk(p, 0.4, 1, 4);
    await p.click('#angel'); await walk(p, 0, 0, 9.5);
    const a = await state(p);
    await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await p.reload();
    await p.waitForFunction(() => window.__snow && window.__snow.ready);
    const b = await state(p);
    assert(Math.hypot(b.x - a.x, b.z - a.z) < 0.01, '자리가 달라졌다');
    assert(b.prints === a.prints && b.angels === 1, `발자국 ${a.prints} → ${b.prints}, 눈 천사 ${b.angels}`);
  });

  await test('화면이 가려졌다 돌아와도 그리기는 한 프레임에 한 번만 한다', async () => {
    // 한 프레임에 tick 이 몇 번 불리는지 센다
    const init = () => {
      const raf = window.requestAnimationFrame.bind(window);
      const ticks = window.__ticks = { now: 0, last: 0, most: 0, frames: 0 };
      let stamp = -1;
      window.requestAnimationFrame = (fn) => raf((t) => {
        if (fn.name === 'tick') {
          if (t !== stamp) { stamp = t; ticks.last = ticks.now; ticks.most = Math.max(ticks.most, ticks.now); ticks.now = 0; ticks.frames++; }
          ticks.now++;
        }
        fn(t);
      });
    };
    const p = await page(undefined, { init });
    const frames = (n) => until(async () => (await p.evaluate(() => window.__ticks.frames)) >= n, { what: n + '번째 프레임', timeout: 40000 });
    await frames(6);
    assert((await p.evaluate(() => window.__ticks.most)) === 1, '처음부터 한 프레임에 여러 번 그린다');
    // 다른 앱에 갔다 돌아온 것처럼 세 번 알린다
    const at = await p.evaluate(() => { for (let i = 0; i < 3; i++) document.dispatchEvent(new Event('visibilitychange')); window.__ticks.most = 0; return window.__ticks.frames; });
    await frames(at + 6);
    const t = await p.evaluate(() => window.__ticks);
    assert(t.most === 1 && t.last === 1, '돌아온 뒤 한 프레임에 ' + t.most + '번 그린다');
  });

  console.log('\n■ 주소');
  await test('주소는 /poddk/ 이고, 옛 주소(/snow/)로 와도 붙은 것까지 그대로 넘어온다', async () => {
    assert(site.url.endsWith('/poddk/'), '게임 폴더 이름이 poddk 가 아니다: ' + site.url);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    opened.push(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    for (const old of ['snow/?t=14:00&speed=0#here', 'snow?t=14:00&speed=0#here', 'snow/index.html?t=14:00&speed=0#here']) {
      await p.goto(site.origin + old);
      await p.waitForURL(site.url + '?t=14:00&speed=0#here', { timeout: 15000 });
      await p.waitForFunction(() => window.__snow && window.__snow.ready, null, { timeout: 60000 });
      assert((await p.title()) === '뽀드득', '넘어온 곳이 게임이 아니다');
      const at = await p.evaluate(() => new Date(window.__snow.clock.now()).toISOString().slice(11, 16));      // 한국 14:00 = UTC 05:00
      assert(at === '05:00', `?t= 가 따라오지 않았다 (${old}): ${at}`);
    }
    await p.goto(site.origin + 'snow/');
    await p.waitForURL(site.url, { timeout: 15000 });
    await p.goBack().catch(() => {});                                             // 뒤로 가기에 옛 주소가 남아 다시 튕기지 않는다
    assert(!p.url().includes('/snow'), '뒤로 가면 옛 주소로 돌아간다: ' + p.url());
  });

  console.log('\n■ 지도 (만드는 사람끼리 보는 것)');
  await test('지도 페이지: 위에서 본 눈밭에 이글루 셋, 낚시터 셋, 여우가 게임과 같은 자리에 그려지고, 게임에서는 이리로 오는 길이 없다', async () => {
    const p = await page('t=20:10&speed=0&look=scarf&color=0&persist=1');
    await walk(p, 0.2, 1, 6);
    const game = await snow(p, () => { const s = window.__snow; window.dispatchEvent(new Event('pagehide')); const f = s.fox.at(s.clock.now()); return { fox: [f.x, f.z], me: [s.me.x, s.me.z], prints: s.tracks.printCount, igloos: s.place.igloos.map((g) => [g.x, g.z]), ponds: s.place.ponds.map((g) => [g.x, g.z]), links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), html: document.documentElement.innerHTML.includes('map.html') }; });
    assert(game.links.every((h) => !h.includes('map')) && !game.html, '게임 화면에 지도로 가는 길이 있다');
    await p.goto(site.url + 'map.html?t=20:10&speed=0');
    await p.waitForFunction(() => window.__map);
    await sleep(400);
    const m = await p.evaluate(() => {
      const num = (el, k) => Number(el.getAttribute(k)), q = (k) => [...document.querySelectorAll(`[data-kind=${k}]`)];
      const first = (g) => g.querySelector('circle');
      return {
        igloos: q('igloo').map((g) => [num(first(g), 'cx'), num(first(g), 'cy')]), ponds: q('pond').map((g) => [num(first(g), 'cx'), num(first(g), 'cy')]),
        fox: q('fox').map((c) => [num(c, 'cx'), num(c, 'cy')])[0], me: q('me').map((c) => [num(c, 'cx'), num(c, 'cy')])[0], prints: document.querySelectorAll('[data-kind=prints] circle').length,
        trail: (document.querySelector('[data-kind=fox-trail]').getAttribute('d').match(/L/g) || []).length, santa: !!document.querySelector('[data-kind=santa]'),
        rows: document.querySelectorAll('#sites tr').length, now: document.querySelector('#now').textContent, view: document.querySelector('#map').getAttribute('viewBox'),
        wide: document.documentElement.scrollWidth <= innerWidth, noindex: !!document.querySelector('meta[name=robots][content=noindex]'),
      };
    });
    const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v[0] - b[i][0]) < 0.01 && Math.abs(v[1] - b[i][1]) < 0.01);
    assert(same(m.igloos, game.igloos) && same(m.ponds, game.ponds), '지도의 이글루·낚시터 자리가 게임과 다르다: ' + JSON.stringify([m.igloos, game.igloos]));
    assert(Math.hypot(m.fox[0] - game.fox[0], m.fox[1] - game.fox[1]) < 0.01, '지도의 여우 자리가 게임과 다르다: ' + JSON.stringify([m.fox, game.fox]));
    assert(m.me && Math.hypot(m.me[0] - game.me[0], m.me[1] - game.me[1]) < 0.01 && m.prints === game.prints, '내 펭귄의 자리와 발자국이 게임과 다르다: ' + JSON.stringify([m.me, game.me, m.prints, game.prints]));
    assert(m.trail > 100 && m.santa && m.rows === 7, '여우가 지나온 길, 썰매가 지나갈 하늘, 자리 표가 있어야 한다: ' + JSON.stringify(m));
    assert(m.now.includes('오후 8:10') && /큰 눈은 (50분|1시간)쯤 뒤/.test(m.now) && /\d\d:\d\d · \d\d:\d\d · \d\d:\d\d/.test(m.now), '지금의 소식: ' + m.now);
    assert(m.wide && m.noindex, '화면보다 넓거나, 검색에 걸리지 않게 하는 표시가 없다');
  });

  console.log('\n■ 화면 배치');
  for (const [w, h, mobile] of [[360, 640, true], [390, 844, true], [844, 390, true], [1280, 720, false]]) {
    await test(`${w}x${h}: 글과 버튼이 화면 안에 있고 서로 겹치지 않는다`, async () => {
      const p = await page(undefined, { viewport: { width: w, height: h }, mobile });
      await sleep(900);
      const r = await p.evaluate(() => {
        const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const c = document.querySelector('#view').getBoundingClientRect();
        return { hud: box('#hud'), mute: box('#mute'), zoom: box('#zoom'), shot: box('#shot'), angel: box('#angel'), canvas: [c.width, c.height], view: [innerWidth, innerHeight], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
      });
      const inside = (b) => b.l >= 0 && b.t >= 0 && b.r <= r.view[0] && b.b <= r.view[1];
      const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const parts = [r.hud, r.mute, r.zoom, r.shot, r.angel];
      assert(parts.every(inside), '화면 밖으로 나간 것이 있다: ' + JSON.stringify(r));
      assert(parts.every((a, i) => parts.every((b, j) => i >= j || !overlap(a, b))), '겹친다: ' + JSON.stringify(r));
      // 오른쪽 아래 한 줄: 위에서부터 캡쳐, 눈 천사, 확대·축소. 너비가 같고 캡쳐와 눈 천사는 크기가 같다
      const size = (b) => [Math.round(b.r - b.l), Math.round(b.b - b.t)];
      assert(size(r.shot).join() === size(r.angel).join() && size(r.shot)[0] === size(r.shot)[1], '캡쳐와 눈 천사 버튼의 크기가 다르다: ' + size(r.shot) + ' / ' + size(r.angel));
      assert(size(r.zoom)[0] === size(r.shot)[0] && Math.abs(r.zoom.l - r.shot.l) < 0.5 && Math.abs(r.shot.l - r.angel.l) < 0.5, '세 버튼이 한 줄로 서 있지 않다: ' + JSON.stringify(r));
      assert(r.shot.b < r.angel.t && r.angel.b < r.zoom.t, '순서가 다르다 (위에서부터 캡쳐, 눈 천사, 확대·축소)');
      assert(Math.abs((r.view[1] - r.zoom.b) - (r.view[1] < 431 ? 12 : 26)) < 1, '확대·축소가 맨 아래에 있어야 한다: ' + JSON.stringify(r.zoom));
      assert(size(r.shot)[0] >= 44 && size(r.mute)[0] >= 36, '버튼이 누르기에 너무 작다: ' + size(r.shot) + ' / ' + size(r.mute));
      assert(r.canvas[0] === r.view[0] && r.canvas[1] === r.view[1], '눈밭이 화면을 다 채우지 않는다');
      assert(r.scroll[0] <= r.view[0] && r.scroll[1] <= r.view[1], '화면이 밀린다');
    });
  }

  console.log('\n■ 마무리');
  await test('브라우저 콘솔에 오류가 없다', async () => {
    assert(errors.length === 0, [...new Set(errors)].slice(0, 6).join('\n        '));
  });
} finally {
  await browser.close();
  await site.close();
}
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
