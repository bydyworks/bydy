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
    assert(dist > 4.8 && dist < 5.3, '4초에 5단위쯤 걸어야 한다 (1초에 두 걸음 반): ' + dist.toFixed(2));
    assert(b.prints >= 9 && b.prints <= 10, '발자국 수: ' + b.prints);
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
    return { snow: s.me.snow, full: s.me.full, pop: s.me.pop, idle: s.me.idle, hat: u.cap.visible, hatScale: u.cap.scale.y, shoulders: u.shoulders[0].visible,
      shell: u.shell.visible, shellScale: u.shell.scale.x, shine: u.shellMat.emissiveIntensity, skin: u.skin.visible, feet: u.feet[0].visible,
      fx: u.fx.visible, glow: u.glow.material.opacity, twinkles: u.twinkles.filter((t) => t.visible).length,
      eyeZ: u.eyes[0].position.z, beakZ: u.beak.position.z, squash: u.top.scale.y, crumble: s.crumble.active };
  });
  /** 조건이 될 때까지 조금씩 시간을 흘려보낸다 (가만히 선 채로) */
  const stand = async (p, done, { step = 0.1, max = 60 } = {}) => { for (let t = 0; t < max; t += step) { if (done(await snowLook(p))) return snowLook(p); await walk(p, 0, 0, step); } throw new Error('기다려도 되지 않았다'); };

  await test('가만히 서 있으면 머리와 어깨에 눈이 금방 쌓이고, 다 쌓인 채 10초쯤 지나면 환해지면서 눈사람이 된다', async () => {
    const p = await page();
    await walk(p, 0, 0, 3);
    assert((await snowLook(p)).snow === 0, '서자마자 쌓였다');
    await walk(p, 0, 0, 7);                                             // 선 지 10초: 쌓이는 중
    let s = await snowLook(p);
    assert(s.snow > 0.3 && s.snow < 0.8 && s.hat && !s.shell, '10초쯤 서 있으면 눈 모자가 반쯤 쌓여 있어야 한다: ' + s.snow.toFixed(2));
    const full = await stand(p, (v) => v.snow === 1);
    assert(full.idle > 12 && full.idle < 18.5, '머리와 어깨에 다 쌓이는 데 걸린 시간(초, 눈발에 따라 조금 다르다): ' + full.idle.toFixed(1));
    assert(full.hat && full.shoulders && full.hatScale >= 0.74 && !full.shell && !full.fx && full.pop === 0, '다 쌓였을 때는 눈 모자를 쓴 펭귄이어야 한다: ' + JSON.stringify(full));
    await walk(p, 0, 0, 6);
    s = await snowLook(p);
    assert(s.pop === 0 && !s.fx && s.skin && s.hatScale === full.hatScale, '다 쌓이고 10초가 되기 전에는 그대로여야 한다: ' + JSON.stringify(s));
    // 효과의 앞 절반: 빛이 차오르고, 아직 펭귄 모습
    const lit = await stand(p, (v) => v.pop > 0.15, { step: 0.05 });
    assert(lit.full >= 10 && lit.full < 10.2, '다 쌓인 뒤 10초가 지나 효과가 시작돼야 한다: ' + lit.full.toFixed(2));
    assert(lit.fx && lit.glow > 0.1 && lit.skin && !lit.shell && lit.squash < 1, '빛이 차오르는 중에는 아직 펭귄이어야 한다: ' + JSON.stringify(lit));
    // 뒤 절반: 눈사람으로 바뀌어 통 하고 자리 잡는다 (빛은 걷히는 중)
    const popped = await stand(p, (v) => v.shell, { step: 0.05 });
    assert(popped.pop < 0.6 && popped.fx && popped.glow > 0.3 && !popped.skin && !popped.feet && popped.shellScale < 1 && popped.shine > 0, '바뀐 직후: ' + JSON.stringify(popped));
    const twinkling = await stand(p, (v) => v.pop > 0.62, { step: 0.05 });
    assert(twinkling.twinkles >= 6, '둘레에 반짝임이 보여야 한다: ' + twinkling.twinkles);
    // 다 된 눈사람: 눈과 부리만 밖으로 보이고, 빛은 사라졌다
    const done = await stand(p, (v) => v.pop === 1, { step: 0.05 });
    assert(done.idle > 23 && done.idle < 32, '서 있기 시작해 눈사람이 되기까지(초): ' + done.idle.toFixed(1));
    assert(done.shell && !done.skin && !done.feet && !done.fx && done.shellScale === 1 && done.shine === 0 && done.squash === 1, '다 된 눈사람: ' + JSON.stringify(done));
    assert(done.eyeZ > full.eyeZ + 0.1 && done.beakZ > full.beakZ + 0.1, '눈과 부리가 눈 밖으로 나오지 않았다: ' + JSON.stringify(done));
    await walk(p, 0, 0, 30);
    s = await snowLook(p);
    assert(s.pop === 1 && s.shell && !s.fx, '눈사람인 채로 더 서 있어도 그대로여야 한다');
  });

  await test('눈사람은 걸음을 떼면 눈덩이가 부서져 흩어지며 털리고, 효과 도중에 걸어도 탈이 없다', async () => {
    const p = await page();
    await stand(p, (v) => v.pop === 1, { step: 0.5 });
    const fx0 = (await state(p)).audio.fx;
    await walk(p, 0, 1, 0.2);
    let s = await snowLook(p);
    assert(!s.shell && s.skin && s.feet && s.pop === 0 && s.full === 0 && s.snow < 1 && s.eyeZ < 0.3, '걸음을 뗐는데 눈사람 그대로다: ' + JSON.stringify(s));
    assert(s.crumble > 0, '눈덩이가 흩어지지 않았다');
    assert((await state(p)).audio.fx === fx0 + 1, '눈 털리는 소리가 한 번 나야 한다');
    await walk(p, 0, 1, 1.3);
    assert((await snowLook(p)).snow === 0, '걸어도 눈이 안 털렸다');
    await until(async () => (await snowLook(p)).crumble === 0, { what: '눈덩이가 눈밭에 스며듦', timeout: 40000 });
    // 빛이 차오르는 도중(아직 펭귄일 때) 걸으면: 눈사람이 되지 않고, 눈덩이도 없다
    await stand(p, (v) => v.pop > 0.2 && v.pop < 0.4, { step: 0.05 });
    await walk(p, 0, 1, 0.2);
    s = await snowLook(p);
    assert(s.pop === 0 && !s.fx && !s.shell && s.skin && s.crumble === 0 && s.squash === 1, '효과 도중에 걸으면 그냥 눈만 털려야 한다: ' + JSON.stringify(s));
    // 눈사람인 채로 눈 천사를 하면: 눈이 부서져 털리고 평소처럼 눕는다
    await walk(p, 0, 1, 1.5);
    await stand(p, (v) => v.pop === 1, { step: 0.5 });
    await p.click('#angel');
    await walk(p, 0, 0, 0.3);
    s = await snowLook(p);
    assert((await state(p)).angel && !s.shell && s.skin && s.feet && s.snow === 0 && s.pop === 0 && s.crumble > 0, '눈사람인 채로 눈 천사: ' + JSON.stringify(s));
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
    for (const p of [scarf, blanket]) await stand(p, (v) => v.pop === 1, { step: 0.5 });
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
      assert((await p.title()) === '뽀드득 · poddk', '넘어온 곳이 게임이 아니다');
      const at = await p.evaluate(() => new Date(window.__snow.clock.now()).toISOString().slice(11, 16));      // 한국 14:00 = UTC 05:00
      assert(at === '05:00', `?t= 가 따라오지 않았다 (${old}): ${at}`);
    }
    await p.goto(site.origin + 'snow/');
    await p.waitForURL(site.url, { timeout: 15000 });
    await p.goBack().catch(() => {});                                             // 뒤로 가기에 옛 주소가 남아 다시 튕기지 않는다
    assert(!p.url().includes('/snow'), '뒤로 가면 옛 주소로 돌아간다: ' + p.url());
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
