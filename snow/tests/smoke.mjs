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

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try { await fn(); results.push([true, name]); console.log(`  PASS  ${name} (${Date.now() - t0}ms)`); } catch (e) { results.push([false, name]); console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
  while (opened.length) await opened.pop().close().catch(() => {});
}

try {
  console.log('\n■ 들어가기');
  await test('처음 화면에서 [걸어 들어가기]를 누르면 눈밭에 들어가고, 소리 다섯 개가 모두 준비된다', async () => {
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

  console.log('\n■ 걷기와 발자국');
  await test('걸으면 걸음마다 발자국이 남고 발소리가 난다 (새 눈 소리)', async () => {
    const p = await page();
    const a = await state(p);
    await walk(p, 0, 1, 4);
    const b = await state(p);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    assert(dist > 3.8 && dist < 4.6, '4초에 4단위쯤 걸어야 한다 (1초에 두 걸음): ' + dist.toFixed(2));
    assert(b.prints >= 7 && b.prints <= 9, '발자국 수: ' + b.prints);
    assert(b.audio.steps === b.prints, `발소리 ${b.audio.steps} ≠ 발자국 ${b.prints}`);
    assert(b.audio.packed === 0, '새 눈인데 다져진 눈 소리가 났다');
    await until(async () => (await state(p)).alive === b.prints, { what: '발자국이 보임' });
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

  await test('가만히 서 있으면 눈이 쌓이고, 아주 오래 서 있으면 눈사람이 되며, 걸으면 털린다', async () => {
    const p = await page();
    await walk(p, 0, 0, 4);
    assert((await state(p)).snow === 0, '서자마자 쌓였다');
    await walk(p, 0, 0, 40);
    let s = await state(p);
    assert(s.snow > 0.5 && s.snow <= 1, '40초 뒤 쌓인 양: ' + s.snow.toFixed(2));
    // line: 눈이 쌓여 내려온 높이 (머리 꼭대기에서 시작해 발치까지)
    const look = () => snow(p, () => { const u = window.__snow.penguin.userData; return { shell: u.shell.visible, line: -u.snowPlane.constant, top: u.snowTop, eyeZ: u.eyes[0].position.z, beakZ: u.beak.position.z, hatScale: u.cap.scale.y }; });
    const before = await look();
    assert(!before.shell && before.hatScale > 0.6, '아직 눈사람이 아니고, 머리에 눈 모자가 있어야 한다');
    // 눈 모자에서 이어서 쌓인다: 중간 단계에서 눈이 머리 위에서 아래로 내려오는 중이고, 모자는 줄어들지 않는다
    await walk(p, 0, 0, 45);
    const mid = await look();
    assert(mid.shell && mid.line < mid.top - 0.2 && mid.line > 0.2, '눈이 위에서부터 쌓여 내려와야 한다: ' + JSON.stringify(mid));
    assert(mid.hatScale >= before.hatScale, '쌓이는 도중에 눈 모자가 줄어들었다');
    await walk(p, 0, 0, 70);
    s = await state(p);
    assert(s.snow > 1.95, '2분 반 서 있으면 눈사람: ' + s.snow.toFixed(2));
    const after = await look();
    assert(after.shell && after.line < 0.01, '온몸이 눈에 덮이지 않았다: ' + JSON.stringify(after));
    assert(after.eyeZ > before.eyeZ + 0.03 && after.beakZ > before.beakZ + 0.02, '눈과 부리가 눈 밖으로 나오지 않았다: ' + JSON.stringify(after));
    await walk(p, 0, 1, 1.5);
    assert((await state(p)).snow === 0, '걸어도 눈이 안 털렸다');
    assert(!(await look()).shell, '걸었는데 눈사람 그대로다');
  });

  console.log('\n■ 하루의 흐름');
  await test('하늘과 빛이 시각을 따라 바뀐다 (한낮, 해 질 녘, 밤)', async () => {
    const p = await page('t=12:20&speed=0');
    const read = () => snow(p, () => { const s = window.__snow; const sun = s.sky.sun; return { elev: s.palette.elev, top: '#' + s.palette.sky[2].getHexString(), horizon: '#' + s.palette.sky[0].getHexString(), I: sun.intensity, y: sun.position.y - sun.target.position.y }; });
    await sleep(400); const noon = await read();
    await snow(p, () => window.__snow.clock.setTime('17:10')); await sleep(600); const dusk = await read();
    await snow(p, () => window.__snow.clock.setTime('22:00')); await sleep(600); const night = await read();
    assert(noon.elev > 28 && dusk.elev > 0 && dusk.elev < 6 && night.elev < -20, `해의 높이: ${noon.elev.toFixed(1)}, ${dusk.elev.toFixed(1)}, ${night.elev.toFixed(1)}`);
    assert(new Set([noon.top, dusk.top, night.top]).size === 3 && new Set([noon.horizon, dusk.horizon, night.horizon]).size === 3, '하늘 색이 바뀌지 않는다');
    assert(noon.I > 1 && dusk.I > 1 && night.I > 0.5, '빛이 꺼졌다: ' + [noon.I, dusk.I, night.I].map((v) => v.toFixed(2)));
    assert(dusk.y > 0 && dusk.y < noon.y, '해 질 녘에는 빛이 낮게 누워야 한다 (긴 그림자)');
    assert((await p.textContent('#clock')).includes('오후 10:00'), '시각 표시: ' + await p.textContent('#clock'));
  });

  await test('발자국은 6시간에 걸쳐 흐려지다 사라진다', async () => {
    const p = await page('t=08:00&speed=0');
    await walk(p, 0, 1, 3);
    const n = (await state(p)).prints;
    await until(async () => (await state(p)).alive === n, { what: '발자국' });
    const a0 = await snow(p, () => window.__snow.tracks.alphas());
    await snow(p, () => window.__snow.clock.skip(3 * 3600e3));
    await until(async () => { const a = await snow(p, () => window.__snow.tracks.alphas()); return a[0] < a0[0] * 0.8; }, { what: '흐려짐' });
    assert((await state(p)).alive === n, '3시간 만에 사라졌다');
    await snow(p, () => window.__snow.clock.skip(3.1 * 3600e3));
    await until(async () => (await state(p)).alive === 0, { what: '사라짐' });
  });

  await test('자정부터 폭설: 1시에 들판이 완전히 비고, 5시까지는 발자국이 남지 않는다', async () => {
    const p = await page('t=23:30&speed=0');
    await walk(p, 0, 1, 3);
    const n = (await state(p)).prints;
    await until(async () => (await state(p)).alive === n, { what: '발자국' });
    assert((await state(p)).snowfall < 0.45, '자정 전인데 눈발이 굵다');
    const a0 = (await snow(p, () => window.__snow.tracks.alphas()))[n - 1];
    await snow(p, () => window.__snow.clock.skip(60 * 60e3));                 // 0시 30분
    await until(async () => (await snow(p, () => window.__snow.tracks.alphas()))[n - 1] < a0 * 0.6, { what: '덮이는 중' });
    let s = await state(p);
    assert(s.alive === n, '0시 30분에 이미 다 지워졌다');
    assert(s.snowfall > 0.6 && s.snowfall < 0.7, '0시 30분의 눈발: ' + s.snowfall.toFixed(2));
    await snow(p, () => window.__snow.clock.skip(31 * 60e3));                 // 1시 1분
    await until(async () => (await state(p)).alive === 0, { what: '1시에 비워짐' });
    assert((await state(p)).snowfall === 1, '1시에는 폭설 절정');
    assert((await p.textContent('#storm')).includes('폭설'), '눈 소식: ' + await p.textContent('#storm'));
    // 폭설 한가운데: 밟는 순간엔 자국이 보이지만 몇 초 만에 덮인다
    await walk(p, 0, 1, 2);
    await until(async () => (await state(p)).alive >= 3, { what: '방금 밟은 자국' });
    await snow(p, () => window.__snow.clock.skip(7000));
    await until(async () => (await state(p)).alive === 0, { what: '금방 덮임' });
    // 5시가 지나면 다시 남는다
    await snow(p, () => window.__snow.clock.setTime('05:10'));
    await walk(p, 0, 1, 2);
    await snow(p, () => window.__snow.clock.skip(60e3));
    await sleep(500);
    s = await state(p);
    assert(s.alive >= 3, '5시가 지났는데 발자국이 안 남는다');
    assert(s.snowfall < 0.45, '5시가 지났는데 눈발이 굵다: ' + s.snowfall.toFixed(2));
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
    await until(async () => (await p.textContent('#carol')).startsWith('♪'), { what: '캐롤 제목' });
    await snow(p, () => window.__snow.teleport(0, 80));
    await until(async () => (await state(p)).audio.carol.gain === 0, { what: '멀어짐' });
    const n = (await state(p)).audio.carol.notes;
    await sleep(2500);
    assert((await state(p)).audio.carol.notes === n, '멀리서도 음표를 계속 만든다');
    assert((await p.textContent('#carol')) === '', '멀리서도 제목이 보인다');
  });

  console.log('\n■ 다시 왔을 때');
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

  console.log('\n■ 화면 배치');
  for (const [w, h, mobile] of [[360, 640, true], [390, 844, true], [844, 390, true], [1280, 720, false]]) {
    await test(`${w}x${h}: 글과 버튼이 화면 안에 있고 서로 겹치지 않는다`, async () => {
      const p = await page(undefined, { viewport: { width: w, height: h }, mobile });
      await sleep(900);
      const r = await p.evaluate(() => {
        const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const c = document.querySelector('#view').getBoundingClientRect();
        return { hud: box('#hud'), mute: box('#mute'), angel: box('#angel'), canvas: [c.width, c.height], view: [innerWidth, innerHeight], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
      });
      const inside = (b) => b.l >= 0 && b.t >= 0 && b.r <= r.view[0] && b.b <= r.view[1];
      const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      assert(inside(r.hud) && inside(r.mute) && inside(r.angel), '화면 밖으로 나간 것이 있다: ' + JSON.stringify(r));
      assert(!overlap(r.hud, r.mute) && !overlap(r.hud, r.angel) && !overlap(r.mute, r.angel), '겹친다: ' + JSON.stringify(r));
      assert(r.canvas[0] === r.view[0] && r.canvas[1] === r.view[1], '눈밭이 화면을 다 채우지 않는다');
      assert(r.scroll[0] <= r.view[0] && r.scroll[1] <= r.view[1], '화면이 밀린다');
      assert(r.angel.r - r.angel.l >= 64, '눈 천사 버튼이 너무 작다');
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
