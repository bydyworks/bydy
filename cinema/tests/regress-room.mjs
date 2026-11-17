// 방(입장·퇴장·자리·같은 기기·위조 방어) 회귀 점검.  실행: (cinema/tests 에서) node regress-room.mjs [묶음 이름 일부]
//
// 정밀 리뷰에서 재현된 결함들이 다시 생기지 않는지 본다. e2e.mjs 와 같은 방식(가짜 유튜브 + 로컬 MQTT)으로 돈다.
import net from 'node:net';
import { chromium, startStatic, startBroker, spawn, createInvite, enter, toHall, peek, until, reporter, assert, sleep } from './harness.mjs';

const only = process.argv[2] || '';
const site = await startStatic();
const broker = await startBroker();
const browser = await chromium.launch();
const errors = [];
const rep = reporter();
const base = (b = broker.url) => `${site.url}index.html?brokers=${encodeURIComponent(b)}`;
const ctxs = [];
async function person(name, opts = {}) {
  const p = await spawn(browser, { name, errors, ...opts });
  ctxs.push(p.ctx);
  return p.page;
}
async function cleanup() { while (ctxs.length) await ctxs.pop().close().catch(() => {}); }
const group = async (name, fn) => {
  if (only && !name.includes(only)) return;
  console.log(`\n■ ${name}`);
  try { await fn(); } catch (e) { await rep.check(`${name} (예기치 못한 오류)`, () => { throw e; }); }
  await cleanup();
};

/** 끊을 수 있는 TCP 중계: 한 사람의 네트워크만 끊긴 상황을 만든다 */
function startProxy(targetPort) {
  return new Promise((resolve) => {
    const socks = new Set();
    let blocked = false;
    const server = net.createServer((c) => {
      if (blocked) { c.destroy(); return; }
      const u = net.connect(targetPort, '127.0.0.1');
      socks.add(c); socks.add(u);
      c.pipe(u); u.pipe(c);
      const kill = () => { c.destroy(); u.destroy(); socks.delete(c); socks.delete(u); };
      c.on('error', kill); u.on('error', kill); c.on('close', kill); u.on('close', kill);
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `ws://127.0.0.1:${server.address().port}`,
      cut() { blocked = true; for (const s of socks) s.destroy(); },
      restore() { blocked = false; },
      close: () => new Promise((r) => { for (const s of socks) s.destroy(); server.close(r); }),
    }));
  });
}

/**
 * 초대 링크만 가진 사람이 직접 짠 코드로 할 수 있는 일: 방의 암호 채널에 아무 ID 로나 메시지를 넣는다.
 * page.evaluate 안에서 window.atk.sendAs(from, type, data) 로 쓴다.
 */
async function intruder(code) {
  const page = await person('불청객');
  await page.goto(site.url + 'index.html');
  await page.waitForSelector('.home');
  await page.evaluate(async ({ brokerUrl, code }) => {
    const L = await import('./js/link.js');
    const scr = L.decodeInvite(code);
    const te = new TextEncoder();
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = './vendor/mqtt.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const c = window.mqtt.connect(brokerUrl, { clean: true, protocolVersion: 4, reconnectPeriod: 0 });
    await new Promise((r) => c.on('connect', r));
    const dig = async (label) => new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(`dsy1|${label}|${scr.room}`)));
    const [kb, tb] = await Promise.all([dig('key'), dig('topic')]);
    const key = await crypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['encrypt']);
    const topic = 'dsy1/' + [...tb].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    let seq = Math.floor(Math.random() * 2 ** 30) * 2 ** 21;
    window.atk = {
      async sendAs(from, type, data) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = te.encode(JSON.stringify({ i: from, q: seq++, y: type, d: data }));
        const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
        const wire = new Uint8Array(12 + sealed.length); wire.set(iv); wire.set(sealed, 12);
        c.publish(topic, wire, { qos: 0 });
      },
      state: (over) => ({ s: { n: '유령', a: [0, 0, 0, 0], u: '', j: Date.now(), sc: 'hall', x: 100, y: 400, s: -1, sa: 0, p: -1, pl: 0, pe: 0, dk: -1, tk: 1, aw: 0, v: Date.now(), ...over } }),
    };
  }, { brokerUrl: broker.url, code });
  return page;
}

const inRoom = (page) => page.evaluate(() => !!(window.__dsy.room && !window.__dsy.room.closed));
const screenText = (page) => page.textContent('#screen');

// ------------------------------------------------------------------
await group('입장과 퇴장', async () => {
  const a = await person('먼저 온 A');
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 3600000, dur: 60 });
  await enter(a, base(), code);

  await rep.check('들어오자마자 인사한다: 로비가 뜨고 1.5초 안에 서로가 보인다', async () => {
    const b = await person('나중 온 B');
    await enter(b, base(), code);
    await until(async () => (await peek(a)).peers.length === 1 && (await peek(b)).peers.length === 1, { timeout: 1500, every: 50, what: '서로 보임 (예전에는 인사가 빠져 3초쯤 걸렸다)' });
    await b.context().close();
    await until(async () => (await peek(a)).peers.length === 0, { timeout: 15000, what: 'B 정리' });
  });

  await rep.check('창을 닫으면 바로 사라지고, "자리 비움" 유령이 자리를 붙잡지 않는다', async () => {
    const c = await person('닫는 C');
    await enter(c, base(), code);
    await toHall(a); await toHall(c);
    await sleep(1700);
    await c.click('.seat >> nth=8');
    await until(async () => (await peek(a)).seats[8] === 'taken', { what: 'C 가 8번에 앉음' });
    await c.close();                       // 실제 창 닫기: pagehide 다음에 visibilitychange(hidden) 가 온다
    await until(async () => (await peek(a)).peers.length === 0, { timeout: 3000, what: 'C 가 사라짐' });
    await sleep(4500);                     // 뒤따라온 "자리 비움" 상태로 되살아나지 않는지
    const p = await peek(a);
    assert(p.peers.length === 0 && p.seats[8] !== 'taken', `유령이 남았다: peers=${p.peers.length}, 8번=${p.seats[8]}`);
  });

  await rep.check('다른 사이트로 가 버려도 마찬가지로 사라진다', async () => {
    const d = await person('떠나는 D');
    await enter(d, base(), code);
    await until(async () => (await peek(a)).peers.length === 1, { what: 'D 보임' });
    await d.goto(site.url + 'vendor/mqtt.LICENSE.md');   // 영화관이 아닌 다른 문서로 이동
    await until(async () => (await peek(a)).peers.length === 0, { timeout: 3000, what: 'D 가 사라짐' });
    await sleep(4000);
    assert((await peek(a)).peers.length === 0, '유령이 남았다');
  });
});

await group('입장 취소와 뒤로 가기', async () => {
  const a = await person('마음 바꾼 A');
  await a.goto(base()); await a.waitForSelector('.home');
  await createInvite(a, { inMs: 3600000, dur: 60, title: '첫 번째 약속' });
  await createInvite(a, { inMs: 7200000, dur: 60, title: '두 번째 약속' });
  await a.reload(); await a.waitForSelector('.home .appt');

  await rep.check('"문을 여는 중"에 뒤로 가면 입장은 없던 일이 된다', async () => {
    await a.click('.home .appt >> nth=0'); await a.waitForSelector('.ticket');
    await a.click('.ticket-actions .btn-xl'); await a.waitForSelector('.spinner');
    await a.goBack(); await a.waitForSelector('.home');
    await sleep(3500);
    const st = await a.evaluate(() => ({ screen: document.body.dataset.screen, room: !!window.__dsy.room, session: sessionStorage.getItem('dsy.inroom') }));
    assert(st.screen === 'home' && !st.room && !st.session, JSON.stringify(st));
  });

  await rep.check('그 사이 다른 약속에 입장하면 그 약속의 영화관으로 들어간다', async () => {
    await a.click('.home .appt >> nth=0'); await a.waitForSelector('.ticket');
    await a.click('.ticket-actions .btn-xl'); await a.waitForSelector('.spinner');
    await a.goBack(); await a.waitForSelector('.home');
    await a.click('.home .appt >> nth=1'); await a.waitForSelector('.ticket');
    await a.click('.ticket-actions .btn-xl');
    await a.waitForSelector('.room.lobby');
    await sleep(2500);
    const title = await a.evaluate(() => window.__dsy.room && window.__dsy.room.ctl.title);
    assert(title === '두 번째 약속', `들어간 방: ${title}`);
    assert(await a.evaluate(() => document.body.dataset.screen) === 'lobby');
  });

  await rep.check('방 안에서 새로고침을 거듭해도, 나간 뒤 "뒤로"가 헛돌지 않는다', async () => {
    await a.reload(); await a.waitForSelector('.room.lobby');
    await a.reload(); await a.waitForSelector('.room.lobby');
    await a.evaluate(() => window.__dsy.leave());
    await a.waitForSelector('.ticket');
    await a.goBack();
    await a.waitForSelector('.home', { timeout: 3000 });
  });
});

await group('틀린 기기 시계', async () => {
  const h = await person('호스트');
  await h.goto(base()); await h.waitForSelector('.home');

  await rep.check('기기 시계가 2분 빨라도, 상영 전이면 로비부터 들어간다', async () => {
    const code = await createInvite(h, { inMs: 60000, dur: 300 });
    const f = await person('빠른 시계', { clockSkewMs: 120000 });
    await enter(f, base(), code);
    await sleep(1500);
    const st = await f.evaluate(() => ({ screen: document.body.dataset.screen, tk: window.__dsy.room.self.tk, toast: document.querySelector('#toast-root').textContent }));
    assert(st.screen === 'lobby' && st.tk === 0, JSON.stringify(st));
    assert(!st.toast.includes('이미 시작'), '늦지 않았는데 지각 안내가 떴다');
  });

  await rep.check('기기 시계가 2분 느려도, 상영 중이면 곧장 상영관으로 간다', async () => {
    const code = await createInvite(h, { inMs: -30000, dur: 300 });
    const s = await person('느린 시계', { clockSkewMs: -120000 });
    await enter(s, base(), code);
    await s.waitForSelector('.room.hall', { timeout: 5000 });
  });
});

await group('같은 기기와 위조', async () => {
  const host = await person('호스트');
  await host.goto(base()); await host.waitForSelector('.home');
  const code = await createInvite(host, { inMs: 3600000, dur: 60 });
  const guest = await person('손님');
  await enter(host, base(), code); await enter(guest, base(), code);
  await until(async () => (await peek(host)).peers.length === 1, { what: '둘이 만남' });

  await rep.check('남이 내 기기 ID 를 흉내 내도 방에서 쫓겨나지 않는다', async () => {
    const atk = await intruder(code);
    const ids = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__dsy.room.self.u)));
    await atk.evaluate(async (ids) => {
      for (let round = 0; round < 3; round++) {
        for (const [k, u] of ids.entries()) {
          await window.atk.sendAs('fake-' + k + '-' + round, 'st', window.atk.state({ u, j: round ? 4e12 : Date.now() + 1000, sc: 'lobby' }));
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    }, ids);
    await sleep(800);
    assert(await inRoom(host) && await inRoom(guest), '쫓겨났다');
    assert(!(await screenText(host)).includes('다른 탭에서') && !(await screenText(guest)).includes('다른 탭에서'));
    // 서로의 화면에서도 지워지지 않았다 (지금 보고 있는 사람은 "교체" 규칙에 걸리지 않는다)
    const [ph, pg] = await Promise.all([peek(host), peek(guest)]);
    assert(ph.peers.some((p) => p.n === '손님') && pg.peers.some((p) => p.n === '호스트'), '서로가 안 보인다');
    await atk.context().close();
  });

  await rep.check('같은 브라우저에서 두 탭이 거의 동시에 들어가면 한 탭만 남고, 오류는 없다', async () => {
    const t1 = await person('두 탭');
    const t2 = await t1.context().newPage();
    for (const t of [t1, t2]) { await t.goto(`${base()}#/s/${code}`); await t.waitForSelector('.ticket'); }
    const before = errors.length;
    await Promise.all([t1.click('.ticket-actions .btn-xl'), sleep(60).then(() => t2.click('.ticket-actions .btn-xl'))]);
    await until(async () => {
      const [r1, r2, s1, s2] = await Promise.all([inRoom(t1), inRoom(t2), screenText(t1), screenText(t2)]);
      return (r1 !== r2) && (r1 ? s2 : s1).includes('다른 탭에서 입장했어요');
    }, { timeout: 8000, what: '한 탭만 남음' });
    await sleep(3500);
    assert(await inRoom(t1) !== await inRoom(t2), '두 탭이 다 남았거나 다 나갔다');
    // 남들에게도 한 사람으로만 보인다
    const twins = (await peek(host)).peers.filter((p) => p.n === '두 탭').length;
    assert(twins === 1, `남의 화면에 ${twins}명으로 보인다`);
    assert(errors.length === before, '콘솔 오류: ' + errors.slice(before).join(' / '));
  });
});

await group('자리', async () => {
  const b = await person('친구 B');
  await b.goto(base()); await b.waitForSelector('.home');
  const code = await createInvite(b, { inMs: 3600000, dur: 60 });
  await enter(b, base(), code); await toHall(b);

  await rep.check('끊겼다 돌아온 사람은, 그 사이 빈자리에 앉은 사람을 밀어내지 않는다', async () => {
    const proxy = await startProxy(broker.port);
    const a = await person('끊기는 A');
    await enter(a, base(proxy.url), code); await toHall(a);
    await sleep(1700);
    await a.click('.seat >> nth=8');
    await until(async () => (await peek(b)).seats[8] === 'taken', { what: 'A 가 8번에 앉음' });
    proxy.cut();
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 20000, what: 'B 가 A 를 지움' });
    await b.click('.seat >> nth=8');
    await until(async () => (await peek(b)).self.s === 8, { what: 'B 가 8번에 앉음' });
    await sleep(1200);
    proxy.restore();
    await until(async () => (await peek(b)).peers.length === 1, { timeout: 30000, what: 'A 가 돌아옴' });
    await sleep(1500);
    const [pa, pb] = await Promise.all([peek(a), peek(b)]);
    assert(pb.self.s === 8 && pa.self.s === -1, `A.s=${pa.self.s}, B.s=${pb.self.s}`);
    await proxy.close();
    await a.context().close();
    await b.evaluate(() => window.__dsy.room.stand());
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 15000, what: 'A 정리' });
  });

  await rep.check('나갔다 다시 들어온 사람은 (기기 시계가 1분 느려도) 그 사이 앉은 사람의 자리를 뺏지 않는다', async () => {
    const a = await person('느린 시계 A', { clockSkewMs: -60000 });
    await enter(a, base(), code); await toHall(a);
    await sleep(1700);
    await a.click('.seat >> nth=9');
    await until(async () => (await peek(b)).seats[9] === 'taken', { what: 'A 가 9번에 앉음' });
    await a.evaluate(() => window.__dsy.leave());
    await a.waitForSelector('.ticket');
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 15000, what: 'A 나감' });
    await b.click('.seat >> nth=9');
    await until(async () => (await peek(b)).self.s === 9, { what: 'B 가 9번에 앉음' });
    await sleep(3000);
    await a.click('.ticket-actions .btn-xl'); await a.waitForSelector('.room.hall');
    await sleep(4000);
    const [pa, pb] = await Promise.all([peek(a), peek(b)]);
    assert(pb.self.s === 9 && pa.self.s === -1, `A.s=${pa.self.s}, B.s=${pb.self.s}`);
    await a.context().close();
    await b.evaluate(() => window.__dsy.room.stand());
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 15000, what: 'A 정리' });
  });

  await rep.check('나갔다 다시 들어오면, 비어 있는 내 자리에는 다시 앉는다', async () => {
    const a = await person('돌아온 A');
    await enter(a, base(), code); await toHall(a);
    await sleep(1700);
    await a.click('.seat >> nth=3');
    await until(async () => (await peek(b)).seats[3] === 'taken', { what: 'A 가 3번에 앉음' });
    await a.evaluate(() => window.__dsy.leave());
    await a.waitForSelector('.ticket');
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 15000, what: 'A 나감' });
    await a.click('.ticket-actions .btn-xl'); await a.waitForSelector('.room.hall');
    await until(async () => (await peek(a)).self.s === 3 && (await peek(b)).seats[3] === 'taken', { timeout: 6000, what: 'A 가 3번에 다시 앉음' });
    await a.context().close();
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 15000, what: 'A 정리' });
  });

  await rep.check('새 탭으로 옮겨 와도 앉아 있던 자리를 잃지 않는다', async () => {
    const a = await person('탭 옮기는 A');
    await enter(a, base(), code); await toHall(a);
    await sleep(1700);
    await a.click('.seat >> nth=2');
    await until(async () => (await peek(b)).seats[2] === 'taken', { what: 'A 가 2번에 앉음' });
    const a2 = await a.context().newPage();
    await a2.goto(`${base()}#/s/${code}`); await a2.waitForSelector('.ticket');
    await a2.click('.ticket-actions .btn-xl');
    await a2.waitForSelector('.room.hall');
    await until(async () => (await screenText(a)).includes('다른 탭에서 입장했어요'), { timeout: 8000, what: '옛 탭이 물러남' });
    await until(async () => (await peek(a2)).self.s === 2, { timeout: 6000, what: '새 탭이 2번에 앉음' });
    await sleep(2500);
    const [p2, pb] = await Promise.all([peek(a2), peek(b)]);
    assert(p2.self.s === 2 && pb.seats[2] === 'taken' && pb.peers.length === 1, `새 탭 s=${p2.self.s}, B 가 본 2번=${pb.seats[2]}, B 가 본 사람 수=${pb.peers.length}`);
    await a.context().close();
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 15000, what: 'A 정리' });
  });

  await rep.check('10초 넘게 앉아 있던 사람은 "내가 훨씬 먼저 앉았다"는 뒤늦은 주장에 밀려나지 않는다', async () => {
    await b.click('.seat >> nth=14');
    await until(async () => (await peek(b)).self.s === 14, { what: 'B 가 14번에 앉음' });
    await sleep(11000);
    const atk = await intruder(code);
    await atk.evaluate(async () => {
      await window.atk.sendAs('ghost-a', 'st', window.atk.state({ n: '억지 1', s: 14, sa: -1e308 }));
      await window.atk.sendAs('ghost-b', 'st', window.atk.state({ n: '억지 2', s: 14, sa: Date.now() - 3600000 }));
    });
    await until(async () => (await peek(b)).peers.length === 2, { what: '주장이 도착함' });
    await sleep(800);
    const p = await peek(b);
    assert(p.self.s === 14, `밀려났다: s=${p.self.s}`);
    await atk.context().close();
  });
});

await group('기록', async () => {
  const a = await person('기록하는 A');
  await a.goto(base()); await a.waitForSelector('.home');

  await rep.check('기념 티켓을 나중에 혼자 다시 받아도 "함께 본 사람"과 자리가 지워지지 않는다', async () => {
    const out = await a.evaluate(async () => {
      const D = await import('./js/data.js');
      const first = { room: 'room-keep', title: '그날의 영화', vid: 'aaaaaaaaaaa', at: Date.now(), seat: 'B열 3번', with: ['친구 B'], pop: 1, pe: 12, name: '나' };
      D.saveStub(first);
      const saved = D.saveStub({ ...first, seat: '입석', with: ['친구 C'], pop: -1, pe: 0 });
      return { saved, list: D.listStubs().filter((s) => s.room === 'room-keep') };
    });
    assert(out.list.length === 1, '티켓이 두 장이 됐다');
    const s = out.list[0];
    assert(s.with.includes('친구 B') && s.with.includes('친구 C') && s.seat === 'B열 3번' && s.pop === 1 && s.pe === 12, JSON.stringify(s));
    assert(out.saved && out.saved.seat === 'B열 3번', 'saveStub 이 합쳐진 티켓을 돌려주지 않는다');
  });

  await rep.check('홈 화면은 영사기사가 미룬 상영 시각을 따른다 (끝난 것으로 치워 버리지 않는다)', async () => {
    const code = await createInvite(a, { inMs: 4000, dur: 5, title: '짧은 영화' });
    await enter(a, base(), code);
    await a.evaluate(() => window.__dsy.room.setCtl({ at: Math.round(window.__dsy.room.now() + 20 * 60000) }));
    await a.evaluate(() => window.__dsy.leave());
    await a.waitForSelector('.ticket');
    await sleep(10000);                    // 링크에 적힌 원래 시각 + 길이가 지나간다
    await a.evaluate(() => { location.hash = '#/'; });
    await a.waitForSelector('.home');
    await until(async () => (await a.textContent('.upcoming')).includes('짧은 영화'), { timeout: 3000, what: '미룬 약속이 목록에 남음' });
    const text = await a.textContent('.upcoming');
    assert(/상영까지 (19|20)분/.test(text), text);
  });
});

await group('예매와 표', async () => {
  const a = await person('예매하는 A', { ytMock: { duration: 30 } });
  await a.goto(base()); await a.waitForSelector('.home');

  await rep.check('확인된 영상 주소를 유튜브가 아닌 주소로 바꾸면 표를 끊을 수 없다 (앞 영상으로 끊기지 않는다)', async () => {
    await a.click('.home .btn-xl'); await a.waitForSelector('.booking');
    await a.fill('input[type=url]', 'https://youtu.be/aaaaaaaaaaa');
    await a.dispatchEvent('input[type=url]', 'change');
    await a.waitForSelector('.note.good', { timeout: 15000 });
    assert(!(await a.isDisabled('.booking .btn-xl')), '확인된 영상인데 표 끊기가 막혀 있다');
    await a.fill('input[type=url]', 'https://example.com/not-a-video');
    await a.dispatchEvent('input[type=url]', 'change');
    await a.waitForSelector('.note.bad', { timeout: 3000 });
    assert(await a.isDisabled('.booking .btn-xl'), '유튜브 주소가 아닌데 표 끊기가 눌린다');
    assert(await a.locator('.booking .preview').isHidden(), '앞 영상의 미리보기가 남아 있다');
    await a.fill('input[type=url]', 'https://youtu.be/bbbbbbbbbbb');
    await a.dispatchEvent('input[type=url]', 'change');
    await a.waitForSelector('.note.good', { timeout: 15000 });
    assert(!(await a.isDisabled('.booking .btn-xl')), '다시 올바른 주소를 넣었는데 표 끊기가 막혀 있다');
  });

  await rep.check('표 화면도 서버 시각을 따른다: 기기 시계가 2분 빨라도 1분 남은 상영을 "상영 중"이라 하지 않는다', async () => {
    const code = await createInvite(a, { inMs: 60000, dur: 300 });
    const f = await person('빠른 시계', { clockSkewMs: 120000 });
    await f.goto(`${base()}#/s/${code}`); await f.waitForSelector('.ticket');
    await until(async () => (await f.textContent('.ticket-status')).includes('상영 시작까지'), { timeout: 5000, what: '서버 시각으로 고쳐 보여 줌' });
    assert((await f.textContent('.ticket-actions .btn-xl')).trim() === '입장하기', await f.textContent('.ticket-actions .btn-xl'));
  });

  await rep.check('쉬는 시간에는 표 화면이 "쉬는 시간"이라고 알려 준다 (상영 전으로 보이지 않는다)', async () => {
    const code = await createInvite(a, { inMs: -60000, dur: 300 });
    await enter(a, base(), code);
    await a.evaluate(async () => { const R = await import('./js/room.js'); const r = window.__dsy.room; await r.setCtl(R.pausePatch(r.ctl, r.now())); });
    await a.evaluate(() => window.__dsy.leave());
    await a.waitForSelector('.ticket');
    await until(async () => (await a.textContent('.ticket-status')).includes('쉬는 시간'), { timeout: 4000, what: '쉬는 시간 표시' });
  });

  await rep.check('링크에 길이가 없는 약속: 영사기사의 플레이어가 알아낸 길이가 로비의 관객에게도 전해지고, "일정 변경" 알림은 뜨지 않는다', async () => {
    const code = await createInvite(a, { inMs: 5000, dur: 0, title: '길이 모르는 영화' });
    const g = await person('로비의 관객');
    await enter(a, base(), code); await enter(g, base(), code);
    await g.evaluate(() => { window.__t = []; new MutationObserver(() => { const t = document.getElementById('toast-root').textContent; if (t) window.__t.push(t); }).observe(document.getElementById('toast-root'), { childList: true, subtree: true }); });
    await toHall(a);
    await until(async () => (await peek(a)).ctl.dur === 30 && (await peek(g)).ctl.dur === 30, { timeout: 15000, what: '길이(30초)가 모두에게 전해짐' });
    await sleep(500);
    const seen = await g.evaluate(() => window.__t);
    assert(!seen.some((t) => t.includes('일정을 바꿨어요')), '일정 변경 알림이 떴다: ' + seen.join(' | '));
    assert((await peek(a)).ctl.rev === 1, `rev ${(await peek(a)).ctl.rev}`);
  });
});

await group('도배 방어', async () => {
  const v = await person('관객');
  await v.goto(base()); await v.waitForSelector('.home');
  const code = await createInvite(v, { inMs: 3600000, dur: 60 });
  await enter(v, base(), code); await toHall(v);
  const atk = await intruder(code);

  await rep.check('지어낸 ID 를 갈아 끼워도 엔딩 크레딧 명단이 끝없이 늘지 않는다', async () => {
    await atk.evaluate(async () => {
      for (let i = 0; i < 400; i++) {
        await window.atk.sendAs('junk-' + i, 'st', window.atk.state({ n: '이름 ' + i }));
        await window.atk.sendAs('junk-' + i, 'by', {});
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 700));   // 방 전체 한도(1초에 새 사람 60명) 아래로 천천히
      }
    });
    await sleep(500);
    const n = await v.evaluate(() => window.__dsy.room.seenInHall.size);
    assert(n > 50 && n <= 101, `명단 ${n}명`);
  });

  await rep.check('ID 를 갈아 끼우며 몰려드는 가짜 입장은 1초에 60명(정원)까지만 받는다', async () => {
    await until(async () => (await peek(v)).peers.length === 0, { timeout: 15000, what: '앞선 가짜들이 정리됨' });
    await v.evaluate(() => { window.__j = 0; window.__dsy.room.on('peer:join', () => window.__j++); });
    // 한도는 관객 쪽 시계의 "초" 단위로 센다. 초가 막 바뀐 직후에 몰아 보내 한 칸 안에 들어가게 한다.
    await sleep(await v.evaluate(() => 1000 - (performance.now() % 1000) + 80));
    await atk.evaluate(async () => {
      for (let i = 0; i < 110; i++) {
        await window.atk.sendAs('rush-' + i, 'st', window.atk.state({ n: '몰려온 ' + i, sc: 'lobby' }));
        await window.atk.sendAs('rush-' + i, 'by', {});
      }
    });
    await sleep(600);
    const n = await v.evaluate(() => window.__j);
    assert(n >= 30 && n <= 60, `받은 사람 ${n}명 (한도 60)`);
  });

  await rep.check('팝콘 먹는 소리도 한 사람당 0.3초에 한 번만 전해진다', async () => {
    await sleep(1100);                     // 앞 점검이 쓴 입장 한도가 풀리기를 기다린다
    await v.evaluate(() => { window.__ea = 0; window.__dsy.room.on('act', (from, type) => { if (type === 'ea' && from === 'muncher') window.__ea++; }); });
    await atk.evaluate(async () => {
      await window.atk.sendAs('muncher', 'st', window.atk.state({ n: '먹보', s: 5, sa: Date.now() }));
      await new Promise((r) => setTimeout(r, 400));
      for (let i = 0; i < 30; i++) { await window.atk.sendAs('muncher', 'ea', {}); await new Promise((r) => setTimeout(r, 30)); }
    });
    await sleep(500);
    const n = await v.evaluate(() => window.__ea);
    assert(n >= 2 && n <= 5, `전해진 횟수 ${n}`);
  });
});

await group('마무리', async () => {
  await rep.check('브라우저 콘솔에 오류가 없다', async () => {
    assert(errors.length === 0, [...new Set(errors)].slice(0, 8).join('\n'));
  });
});

const ok = rep.done();
await browser.close();
await site.close();
await broker.close().catch(() => {});
process.exit(ok ? 0 : 1);
