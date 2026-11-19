// 함께 걷는 눈밭 점검: 서버(server/)를 이 컴퓨터 안에서 띄우고, 두 펭귄을 따로 들여보내 서로 보이는지 본다.
//   node together.mjs
//   SERVER=wss://poddk.poddk-server.workers.dev/ws node together.mjs   (올려 둔 진짜 서버로 점검할 때)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStatic, launch, open, sleep, assert, until } from './harness.mjs';
const PORT = 8798, REMOTE = process.env.SERVER || '', SERVER = REMOTE || `ws://127.0.0.1:${PORT}/ws`;
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server');
if (!process.env.SERVER) (await import('node:fs')).rmSync(path.join(serverDir, '.wrangler/together-state'), { recursive: true, force: true });      // 지난번 점검이 남긴 자국 없이 시작한다
const dev = REMOTE ? null : spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', '.wrangler/together-state'], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
const stopDev = () => { if (!dev) return; try { process.kill(-dev.pid, 'SIGTERM'); } catch { /* 이미 끝났다 */ } };      // (wrangler 가 띄운 것까지 함께 끈다)
let log = ''; if (dev) { dev.stdout.on('data', (d) => { log += d; }); dev.stderr.on('data', (d) => { log += d; }); }
const site = await startStatic(); const browser = await launch(); const errors = [];
let ok = 0, bad = 0;
async function test(name, fn) { try { await fn(); ok++; console.log('  PASS  ' + name); } catch (e) { bad++; console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n')[0]); } }
try {
  for (let i = 0; i < 120 && dev; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* 아직 */ } await sleep(500); }
  console.log('  (서버가 떴다)');
  const enter = async (q) => (await open(browser, site.url, { query: `t=14:00&speed=0&xmas=0&server=${encodeURIComponent(SERVER)}&${q}`, errors })).page;
  const a = await enter('look=scarf&color=0'), b = await enter('look=blanket&color=5');
  const st = (p) => p.evaluate(() => { const s = window.__snow, n = s.net; return { connected: n.connected, count: n.count, peers: [...n.peers.values()].map((x) => ({ visible: x.root.visible, x: x.x, z: x.z, name: x.name })), text: document.querySelector('#peers').textContent, row: !document.querySelector('#peer-row').hidden }; });

  await test('두 펭귄이 이어지면 서로 한 마리씩 보이고, 위쪽에 함께 걷는 펭귄 수가 뜬다', async () => {
    await until(async () => (await st(a)).connected && (await st(b)).connected, { what: '이어짐', timeout: 20000 });
    await until(async () => (await st(a)).count === 1 && (await st(b)).count === 1, { what: '서로', timeout: 20000 });
    const s = await st(a);
    assert(s.row && s.text === '함께 걷는 펭귄 1마리', JSON.stringify(s));
    const names = [await a.evaluate(() => window.__snow.name), await b.evaluate(() => window.__snow.name)];
    assert(s.peers[0].name === names[1], '이름이 전해지지 않았다: ' + JSON.stringify([s.peers, names]));
  });
  await test('한 펭귄이 걸으면 다른 화면에서 그 자리로 걸어가고, 발자국도 남는다', async () => {
    const before = await b.evaluate(() => window.__snow.tracks.printCount);
    await a.evaluate(() => { const s = window.__snow; s.controls.debugMove(0, 1); s.sim(3); s.controls.debugMove(0, 0); });      // (그림이 느린 점검용 브라우저에서도 같은 거리를 걷게 시간을 흘려보낸다)
    const me = await a.evaluate(() => ({ x: window.__snow.me.x, z: window.__snow.me.z }));
    await until(async () => { const p = (await st(b)).peers[0]; return p.visible && Math.hypot(p.x - me.x, p.z - me.z) < 0.3; }, { what: '다른 화면에서 같은 자리', timeout: 10000 });
    await until(async () => (await b.evaluate(() => window.__snow.tracks.printCount)) > before + 2, { what: '다른 펭귄의 발자국', timeout: 10000 });
  });
  await test('이글루에 들어가면 밖에서는 안 보이고, 같은 방에 들어가면 보인다. 앉아 고른 상태가 말풍선으로 뜬다', async () => {
    await a.evaluate(() => { const s = window.__snow, e = s.entrances[0]; s.teleport(e.x, e.z); });
    await sleep(400);
    await a.evaluate(() => window.__snow.act());
    await until(async () => (await a.evaluate(() => window.__snow.inside)) === 0, { what: 'a 이글루 안' });
    await until(async () => !(await st(b)).peers[0].visible, { what: '밖에서는 안 보임', timeout: 8000 });
    await b.evaluate(() => { const s = window.__snow, e = s.entrances[0]; s.teleport(e.x, e.z); });
    await sleep(400);
    await b.evaluate(() => window.__snow.act());
    await until(async () => (await b.evaluate(() => window.__snow.inside)) === 0, { what: 'b 이글루 안' });
    await until(async () => (await st(b)).peers[0].visible, { what: '같은 방에서는 보임', timeout: 8000 });
    // a 가 방석에 앉아 상태를 고른다
    await a.evaluate(() => { const s = window.__snow, seat = s.dens.dens[0].seats[0]; s.teleport(seat.x + 0.3, seat.z + 0.3); });
    await sleep(400); await a.evaluate(() => { const s = window.__snow; s.act(); s.sim(0.8); });
    await until(async () => a.evaluate(() => !document.querySelector('#status').hidden), { what: '상태 고르기' });
    await a.click('#status .status-list button:nth-child(2)');
    // b 는 a 쪽을 바라본다 (말풍선은 화면에 보이는 펭귄 위에만 뜬다)
    const ap = await a.evaluate(() => ({ x: window.__snow.me.x, z: window.__snow.me.z }));
    await b.evaluate((p) => { const s = window.__snow, m = s.me; m.yaw = m.camYaw = Math.atan2(-(p.x - m.x), -(p.z - m.z)); }, ap);
    await until(async () => b.evaluate(() => { const el = document.querySelector('.peer-say'); return !!el && !el.hidden && el.textContent.includes('영화 보는 중'); }), { what: '다른 화면의 말풍선', timeout: 10000 }).catch(async (e) => { throw new Error(e.message + ' a=' + JSON.stringify(await a.evaluate(() => ({ st: window.__snow.net.stats, me: window.__snow.seat ?? null })) ) + ' b=' + JSON.stringify(await b.evaluate(() => [...window.__snow.net.peers.values()].map((p) => p.s))) + ' bubbles=' + JSON.stringify(await b.evaluate(() => [...document.querySelectorAll('.peer-say')].map((el) => [el.hidden, el.textContent])))); });
  });
  await test('다른 펭귄이 배로 미끄러지면 엎드린 모습으로, 낚시하면 낚싯대와 찌를 든 모습으로 보인다', async () => {
    for (const p of [a, b]) await p.evaluate(() => { const s = window.__snow; if (s.seat) { s.act(); s.sim(0.8); } if (s.inside !== null) s.goOut(); });
    await until(async () => (await a.evaluate(() => window.__snow.inside)) === null && (await b.evaluate(() => window.__snow.inside)) === null, { what: '둘 다 밖' });
    await a.evaluate(() => { const s = window.__snow; s.teleport(-2, 26); s.me.yaw = Math.PI / 2; s.sim(0.2); });
    await b.evaluate(() => { const s = window.__snow; s.teleport(0, 31); s.sim(0.2); });
    await sleep(1200);
    await a.evaluate(() => window.__snow.slide());
    const peer = () => b.evaluate(() => { const p = [...window.__snow.net.peers.values()][0], u = p.root.userData; return { a: p.s && p.s.a, act: p.act, k: p.k, y: u.body.position.y, rx: u.body.rotation.x, rod: p.rod.visible, line: p.line.visible, float: p.float.visible }; });
    await until(async () => { const q = await peer(); return q.act === 2 && q.k > 0.9; }, { what: '다른 화면에서 미끄러짐', timeout: 10000 });
    const slid = await peer();
    assert(slid.y > 0.3 && slid.rx > 1.2, '엎드린 몸이 땅에 묻혔다: ' + JSON.stringify(slid));
    await a.evaluate(() => { const s = window.__snow; s.sim(8); const h = s.place.hole, d = Math.hypot(h.x, h.z); s.teleport(h.x - h.x / d * 1.8, h.z - h.z / d * 1.8); s.me.idle = 0; s.sim(0.1); s.act(); s.sim(1.2); });
    assert(await a.evaluate(() => window.__snow.fishing.active), '낚시를 시작하지 못했다');
    await until(async () => { const q = await peer(); return q.act === 4 && q.rod && q.line && q.float; }, { what: '다른 화면의 낚싯대 ' + JSON.stringify(await peer()), timeout: 10000 });
    const fish = await b.evaluate(() => { const p = [...window.__snow.net.peers.values()][0], h = window.__snow.place.hole; return { y: p.root.userData.body.position.y, toHole: Math.hypot(p.float.position.x - h.x, p.float.position.z - h.z) }; });
    assert(fish.y < -0.05 && fish.toHole < 0.3, '낚시하는 모습: ' + JSON.stringify(fish));
    await a.evaluate(() => { const s = window.__snow; s.fishing.cancel(); s.sim(1); });
    await until(async () => { const q = await peer(); return q.act === 0 && !q.rod; }, { what: '낚시를 그만두면 낚싯대가 사라짐', timeout: 10000 });
  });
  await test('선물에서 나온 패션 아이템은 다른 화면에서도 보인다', async () => {
    await a.evaluate(() => { const s = window.__snow; s.outfit.wear('hat', 1); s.outfit.wear('glasses', 0); });
    await until(async () => (await b.evaluate(() => { const p = [...window.__snow.net.peers.values()][0], o = p.root.userData.outfit || {}; return [o.glasses ? o.glasses.userData.item.n : -1, o.hat ? o.hat.userData.item.n : -1, o.ear ? o.ear.userData.item.n : -1].join(); })) === '0,1,-1', { what: '다른 화면의 모자와 안경', timeout: 10000 });
    await a.evaluate(() => window.__snow.outfit.wear('hat', 5));
    await until(async () => (await b.evaluate(() => { const o = [...window.__snow.net.peers.values()][0].root.userData.outfit || {}; return o.hat ? o.hat.userData.item.n : -1; })) === 5, { what: '모자가 갓으로 바뀜', timeout: 10000 });
  });
  await test('이글루에서 주사위 놀이: 부르면 같은 방에 앉은 펭귄에게만 쪽지가 가고, 같이 하기를 누르면 함께 굴려 같은 결과를 본다', async () => {
    for (const [p, k] of [[a, 0], [b, 1]]) {
      await p.evaluate(() => { const s = window.__snow; if (s.inside === null) { const e = s.entrances[0]; s.teleport(e.x, e.z); s.sim(0.1); s.act(); } });
    }
    await until(async () => (await a.evaluate(() => window.__snow.inside)) === 0 && (await b.evaluate(() => window.__snow.inside)) === 0, { what: '둘 다 방 안' });
    for (const [p, k] of [[a, 0], [b, 1]]) {
      await p.evaluate((k) => { const s = window.__snow, seat = s.dens.dens[0].seats[k]; s.teleport(seat.x + 0.3, seat.z + 0.3); s.sim(0.1); s.act(); s.sim(0.8); }, k);
      await until(async () => p.evaluate(() => !document.querySelector('#status').hidden), { what: '상태 고르기' });
    }
    await b.click('#status .status-close');
    await sleep(2500);                                             // (앉은 모습이 서버에 닿게)
    assert(await a.evaluate(() => !document.querySelector('#status .dice-invite').hidden), '주사위 놀이 단추가 없다');
    await a.click('#status .dice-invite');
    await until(async () => b.evaluate(() => !document.querySelector('#dice-ask').hidden), { what: '다른 펭귄에게 온 쪽지', timeout: 10000 }).catch(async (e) => { throw new Error(e.message + ' a: ' + JSON.stringify(await a.evaluate(() => ({ toast: document.querySelector('#toast').textContent, dice: window.__snow.dice, seat: window.__snow.seat && window.__snow.seat.phase }))) + ' b: ' + JSON.stringify(await b.evaluate(() => ({ seat: window.__snow.seat && window.__snow.seat.phase, inside: window.__snow.inside })))); });
    const who = await b.evaluate(() => document.querySelector('#dice-ask .who').textContent);
    assert(who.startsWith(await a.evaluate(() => window.__snow.name)), '쪽지에 부른 펭귄 이름이 없다: ' + who);
    await b.click('#dice-ask .yes');
    await until(async () => a.evaluate(() => !!window.__snow.dice && window.__snow.dice.players.length === 2 && !document.querySelector('#dice .roll').disabled), { what: '함께하는 펭귄 둘', timeout: 10000 });
    await a.click('#dice .roll');
    const result = (p) => p.evaluate(() => window.__snow.dice && window.__snow.dice.rolled ? JSON.stringify(window.__snow.dice.rolled.map((r) => r[2])) : null);
    await until(async () => (await result(a)) && (await result(b)), { what: '두 화면의 결과', timeout: 12000 });
    assert((await result(a)) === (await result(b)), '두 화면의 주사위 눈이 다르다: ' + (await result(a)) + ' / ' + (await result(b)));
    const note = await a.evaluate(() => document.querySelector('#dice .note').textContent);
    assert(/승리|비겼어요/.test(note), '결과 글: ' + note);
    for (const p of [a, b]) await p.click('#dice .quit');
    for (const p of [a, b]) await p.evaluate(() => { const s = window.__snow; if (s.seat) { s.act(); s.sim(0.8); } });
  });
  await test('가까이 가면 상대의 이름이 잠깐 뜨고, 👋 인사하면 상대 화면에서도 날개를 흔든다. 조금 떨어져서 ❄️ 눈덩이를 던지면 맞은 펭귄은 머리에 눈을 뒤집어쓴다', async () => {
    for (const p of [a, b]) await p.evaluate(() => { const s = window.__snow; if (s.seat) { s.act(); s.sim(0.8); } if (s.inside !== null) s.goOut(); });
    await until(async () => (await a.evaluate(() => window.__snow.inside)) === null && (await b.evaluate(() => window.__snow.inside)) === null, { what: '둘 다 밖' });
    await b.evaluate(() => { const s = window.__snow; s.teleport(0, 30); s.me.yaw = s.me.camYaw = 0; s.me.snow = 0; s.sim(0.2); });
    await a.evaluate(() => { const s = window.__snow; s.teleport(0, 40); s.me.yaw = s.me.camYaw = Math.PI; s.sim(0.2); });
    await sleep(1500);
    // 다가가면 이름
    await a.evaluate(() => { const s = window.__snow; s.teleport(0, 32.2); s.sim(0.2); });
    await until(async () => a.evaluate(() => { const el = document.querySelector('.peer-name'); return !!el && !el.hidden && el.textContent.length > 0; }), { what: '다른 펭귄의 이름', timeout: 10000 });
    const nm = await a.evaluate(() => document.querySelector('.peer-name').textContent), bname = await b.evaluate(() => window.__snow.name);
    assert(nm === bname, '이름이 다르다: ' + nm + ' / ' + bname);
    // 인사
    await until(async () => (await a.getAttribute('#act', 'aria-label')) === '인사하기', { what: '인사 단추' });
    await a.click('#act');
    await until(async () => b.evaluate(() => { const p = [...window.__snow.net.peers.values()][0]; return p.act === 7 && p.k > 0.5; }), { what: '다른 화면에서 인사하는 모습', timeout: 10000 });
    await until(async () => b.evaluate(() => { const el = document.querySelector('.peer-name'); return !!el && !el.hidden && el.textContent.startsWith('👋'); }), { what: '👋 표시', timeout: 6000 });
    await a.evaluate(() => window.__snow.sim(2));
    // 눈덩이: 7 걸음 떨어져서
    await a.evaluate(() => { const s = window.__snow; s.teleport(0, 37); s.me.yaw = Math.PI; s.sim(0.3); });
    await sleep(1200);
    await until(async () => (await a.getAttribute('#act', 'aria-label')) === '눈덩이 던지기', { what: '눈덩이 단추', timeout: 8000 });
    await a.click('#act');
    await until(async () => b.evaluate(() => window.__snow.social.hits === 1), { what: '맞은 펭귄', timeout: 10000 });
    const hit = await b.evaluate(() => ({ snow: window.__snow.me.snow, toast: document.querySelector('#toast').textContent }));
    assert(hit.snow >= 0.4 && hit.toast.includes('눈덩이'), '맞은 펭귄: ' + JSON.stringify(hit));
  });
  await test('소원판: 붙인 소원은 다른 화면에도 붙는다. 한 번만 붙일 수 있고, 거친 말은 붙지 않는다', async () => {
    await a.evaluate(() => { const s = window.__snow; s.wishes.open(); });
    await a.fill('#wishes .write input', '눈이 펑펑 오게 해 주세요');
    await a.click('#wishes .write button');
    await until(async () => a.evaluate(() => window.__snow.wishes.wrote), { what: '붙임', timeout: 10000 });
    await until(async () => b.evaluate(() => window.__snow.wishes.list.some((w) => w.text === '눈이 펑펑 오게 해 주세요')), { what: '다른 화면의 소원', timeout: 10000 });
    assert(await a.evaluate(() => document.querySelector('#wishes .write').classList.contains('off') && document.querySelector('#wishes .notes p.mine') !== null), '한 번 붙인 뒤에는 쓰는 칸이 닫히고 내 소원에 표시가 있어야 한다');
    await a.click('#wishes .close');
    await b.evaluate(() => window.__snow.wishes.open());
    await b.fill('#wishes .write input', '시1발 진짜');
    await b.click('#wishes .write button');
    await until(async () => (await b.textContent('#wishes .done')).includes('고운 말'), { what: '걸러짐', timeout: 10000 });
    assert(!(await b.evaluate(() => window.__snow.wishes.wrote)) && !(await a.evaluate(() => window.__snow.wishes.list.some((w) => w.text.includes('발')))), '거친 말이 붙었다');
    await b.click('#wishes .close');
  });
  await test('눈사람: 내가 세운 눈사람은 다른 화면에도 서고, 허물면 사라진다. 이상한 그림은 신고하면 내 화면에서 바로 치워진다', async () => {
    await a.evaluate(() => { const s = window.__snow; s.teleport(-12, 14); s.me.yaw = Math.PI / 2; s.sim(0.2); });
    await sleep(1200);                                             // (옮긴 자리가 서버에 닿게)
    await a.evaluate(() => { const s = window.__snow; s.snowman.start(); s.snowman.open(); s.snowman.strokes = [[0, 2, [[100, 80]]], [0, 2, [[140, 80]]], [1, 2, [[118, 95], [150, 100]]]]; });
    await a.click('#sculpt .make');
    await until(async () => b.evaluate(() => window.__snow.snowman.list.length === 1 && !window.__snow.snowman.list[0].mine), { what: '다른 화면의 눈사람', timeout: 10000 });
    await until(async () => a.evaluate(() => window.__snow.snowman.list.length === 1 && window.__snow.snowman.list[0].id !== 'local'), { what: '내 눈사람의 번호', timeout: 10000 });
    // b 가 다가가 신고하면 b 화면에서만 치워진다 (한 사람의 신고로는 다른 화면에 그대로)
    await b.evaluate(() => { const s = window.__snow, o = s.snowman.list[0]; s.teleport(o.x + 1.3, o.z); s.sim(0.2); });
    await until(async () => (await b.getAttribute('#act', 'aria-label')) === '눈사람 보기', { what: '눈사람 보기 단추' });
    await b.click('#act');
    assert(await b.evaluate(() => !document.querySelector('#snowcard .report').hidden && document.querySelector('#snowcard .remove').hidden), '남의 눈사람에는 신고만 있어야 한다');
    await b.click('#snowcard .report');
    assert((await b.evaluate(() => window.__snow.snowman.list.length)) === 0, '신고했는데 남아 있다');
    await sleep(800);
    assert((await a.evaluate(() => window.__snow.snowman.list.length)) === 1, '한 사람의 신고로 다른 화면에서도 사라졌다');
    // a 가 허물면 사라진다
    await a.evaluate(() => { const s = window.__snow, o = s.snowman.list[0]; s.teleport(o.x - 1.3, o.z); s.sim(0.2); });
    await until(async () => (await a.getAttribute('#act', 'aria-label')) === '눈사람 보기', { what: '내 눈사람 보기 단추' });
    await a.click('#act'); await a.click('#snowcard .remove');
    assert((await a.evaluate(() => window.__snow.snowman.list.length)) === 0, '허물었는데 남아 있다');
  });
  await test('한 펭귄이 나가면 다른 화면에서 사라지고 수가 줄어든다', async () => {
    await a.close();
    await until(async () => (await st(b)).count === 0 && !(await st(b)).row, { what: '사라짐', timeout: 10000 });
  });
  await test('서버가 없어도 혼자 걷는 눈밭은 그대로다', async () => {
    const c = (await open(browser, site.url, { query: 't=14:00&speed=0&server=ws://127.0.0.1:1/ws', errors })).page;
    const n = await c.evaluate(() => { const s = window.__snow; s.controls.debugMove(0, 1); s.sim(2); s.controls.debugMove(0, 0); return { prints: window.__snow.tracks.printCount, connected: window.__snow.net.connected }; });
    assert(n.prints >= 2 && !n.connected, JSON.stringify(n));
  });
  const real = errors.filter((e) => !/WebSocket|ERR_CONNECTION_REFUSED|127\.0\.0\.1:1/.test(e));
  await test('브라우저 콘솔에 오류가 없다 (서버에 못 잇는 것 말고)', async () => { assert(real.length === 0, [...new Set(real)].slice(0, 4).join(' / ')); });
} finally { await browser.close(); await site.close(); stopDev(); await sleep(400); console.log(`\n${ok}/${ok + bad} passed`); if (bad) console.log(log.slice(-1500)); }
