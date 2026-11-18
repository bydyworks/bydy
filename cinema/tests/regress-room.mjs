// 방(입장·퇴장·자리·같은 기기·위조 방어) 회귀 점검.  실행: (cinema/tests 에서) node regress-room.mjs [묶음 이름 일부]
//
// 정밀 리뷰에서 재현된 결함들이 다시 생기지 않는지 본다. e2e.mjs 와 같은 방식(가짜 유튜브 + 로컬 MQTT)으로 돈다.
import net from 'node:net';
import { chromium, startStatic, startBroker, spawn, createInvite, enter, toHall, peek, until, reporter, assert, sleep, watchErrors } from './harness.mjs';

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
 * 한 사람의 "중계 서버까지 가는 길"을 흉내 내는 TCP 중계. (startProxy 는 깨끗이 끊기는 경우, 이쪽은 끊기지 않고 느리거나 멎는 경우)
 *   delay    : 한쪽 방향으로 이만큼(ms) 늦게 전한다 (멀리 있는 중계 서버). 순서는 지킨다.
 *   freeze() : 연결(소켓)은 붙어 있는데 길만 양쪽으로 조용해진다 (터널·엘리베이터). 끊겼다는 신호는 어느 쪽에도 가지 않고,
 *              밀린 바이트는 thaw() 때 한꺼번에 흐른다. 얼어 있는 동안 새로 건 연결도 붙기만 하고 아무것도 오가지 않는다.
 */
function startPath(targetPort, { delay = 0 } = {}) {
  return new Promise((resolve) => {
    const links = new Set();
    let frozen = false;
    const server = net.createServer((c) => {
      const u = net.connect(targetPort, '127.0.0.1');
      const link = { c, u };
      links.add(link);
      if (frozen) { c.pause(); u.pause(); }
      const pipe = (from, to) => {
        const queue = [];
        let timer = null;
        const pass = (it) => { if (to.destroyed) return; if (it.end) to.end(); else to.write(it.buf); };
        const flush = () => {
          timer = null;
          while (queue.length && queue[0].due <= Date.now()) pass(queue.shift());
          if (queue.length) timer = setTimeout(flush, Math.max(1, queue[0].due - Date.now()));
        };
        const put = (it) => {
          if (!delay) { pass(it); return; }
          queue.push({ ...it, due: Date.now() + delay });
          if (!timer) timer = setTimeout(flush, delay);
        };
        from.on('data', (buf) => put({ buf }));
        from.on('end', () => put({ end: true }));
      };
      pipe(c, u); pipe(u, c);
      // 한쪽이 닫히면, 가는 중이던 것(작별 인사 등)을 마저 전한 뒤에 반대쪽도 닫는다
      const drop = () => setTimeout(() => { links.delete(link); c.destroy(); u.destroy(); }, delay + 50);
      for (const s of [c, u]) { s.on('error', drop); s.on('close', drop); }
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `ws://127.0.0.1:${server.address().port}`,
      freeze() { frozen = true; for (const l of links) { l.c.pause(); l.u.pause(); } },
      thaw() { frozen = false; for (const l of links) { l.c.resume(); l.u.resume(); } },
      close: () => new Promise((r) => { for (const l of links) { l.c.destroy(); l.u.destroy(); } server.close(r); }),
    }));
  });
}

/** 화면에 뜨는 알림(토스트) 글을 window.__toasts 에 차례로 적어 둔다. 문서가 새로 열리면(새로고침) 다시 걸어야 한다. */
const watchToasts = (page) => page.evaluate(() => {
  if (window.__toasts) return;
  const seen = (window.__toasts = []);
  const root = document.getElementById('toast-root');
  let last = '';
  new MutationObserver(() => { const t = root.textContent; if (t && t !== last) seen.push(t); last = t; }).observe(root, { childList: true, subtree: true, characterData: true });
});
const toastsOf = (page) => page.evaluate(() => window.__toasts.slice());

/**
 * 초대 링크만 가진 사람이 직접 짠 코드로 할 수 있는 일: 방의 암호 채널에 아무 ID 로나 메시지를 넣는다.
 * page.evaluate 안에서 window.atk.sendAs(from, type, data) 로 쓴다.
 * window.atk.listen() 을 부르면 그때부터 방에 오가는 소식도 엿듣는다 (초대 링크만 있으면 암호가 풀린다):
 * 들은 것은 window.atk.heard 에 { i: 보낸 ID, y: 종류, at: 들은 시각 } 으로 쌓인다.
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
    const key = await crypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
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
      heard: [],
      listen() {
        const td = new TextDecoder();
        c.on('message', async (_topic, payload) => {
          try {
            const wire = new Uint8Array(payload);
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wire.subarray(0, 12) }, key, wire.subarray(12));
            const m = JSON.parse(td.decode(plain));
            window.atk.heard.push({ i: m.i, y: m.y, at: Date.now() });
          } catch { /* 이 방의 소식이 아니다 */ }
        });
        return new Promise((res, rej) => c.subscribe(topic, { qos: 0 }, (err) => (err ? rej(err) : res())));
      },
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

// ------------------------------------------------------------------
// 고친 것을 다시 점검했을 때 나온 결함들. (묶음 이름에 모두 "다시 점검"이 들어 있다: node regress-room.mjs "다시 점검")
// 점검마다 고치기 전의 room.js·main.js·net.js 로 돌리면 떨어지는 것을 확인해 두었다.

await group('다시 점검에서 나온 것: 소리 없이 멎은 연결과 자리', async () => {
  const b = await person('자리 잡는 B');
  await b.goto(base()); await b.waitForSelector('.home');
  const code = await createInvite(b, { inMs: 3600000, dur: 60 });
  await enter(b, base(), code); await toHall(b);
  // A 와 C 는 저마다 다른 길로 중계 서버에 닿는다 (그 길이 소리 없이 멎었다 풀린다)
  const pathA = await startPath(broker.port);
  const pathC = await startPath(broker.port);
  const a = await person('터널 속 A');
  await enter(a, base(pathA.url), code); await toHall(a);
  await sleep(1700);
  await a.click('.seat >> nth=9');
  await until(async () => (await peek(b)).seats[9] === 'taken', { what: 'A 가 9번에 앉음' });
  const seatedAt = Date.now();
  const c = await person('터널 속 C');
  await enter(c, base(pathC.url), code); await toHall(c);
  await sleep(1700);
  await c.click('.seat >> nth=3');
  await until(async () => (await peek(a)).seats[3] === 'taken' && (await peek(b)).seats[3] === 'taken', { what: 'C 가 3번에 앉음' });
  for (const p of [a, b, c]) await watchToasts(p);

  const together = async () => (await Promise.all([a, b, c].map(peek))).every((p) => p.peers.length === 2);
  /** 세 사람의 화면에 지금 보이는 것 */
  const look = async () => {
    const [A, B, C] = await Promise.all([a, b, c].map((p) => p.evaluate(() => ({
      s: window.__dsy.room.self.s,
      seat9: document.querySelectorAll('.seat')[9].getAttribute('aria-label'),
      seat3: document.querySelectorAll('.seat')[3].getAttribute('aria-label'),
      standing: Array.from(document.querySelectorAll('.stander .seat-tag')).map((e) => e.textContent),
      lost: window.__toasts.filter((t) => t.includes('방금 다른 분이 앉았어요')).length,   // "앗, 방금 다른 분이 앉았어요" 알림이 뜬 횟수
    }))));
    return { A, B, C };
  };

  // (50초쯤 걸린다: 10초 넘게 앉아 있기 + 26초 동안 멎음 + 그 뒤 몇 초 지켜보기)
  await rep.check('연결이 소리 없이 26초 멎었다 풀린 사람은, 그 사이 빈자리에 앉은 사람과 자리가 겹치지 않는다: 두 화면 모두 나중에 앉은 사람이 주인이다 (아무도 앉지 않은 자리는 그대로 지킨다)', async () => {
    await sleep(Math.max(0, 10500 - (Date.now() - seatedAt)));     // A 는 10초 넘게 앉아 있었다
    const t0 = Date.now();
    pathA.freeze(); pathC.freeze();                                 // 소켓은 붙어 있다. 길만 조용해진다
    await until(async () => (await peek(b)).peers.length === 0, { timeout: 25000, what: 'B 가 A 와 C 를 지움 (12초 동안 소식 없음)' });
    await sleep(Math.max(0, 14000 - (Date.now() - t0)));
    await b.click('.seat >> nth=9');
    await until(async () => (await peek(b)).self.s === 9, { what: 'B 가 비어 보이는 9번에 앉음' });
    const satAt = Date.now();
    const claimed = await b.evaluate(() => window.__dsy.room.self.sa);
    await sleep(Math.max(0, Math.max(t0 + 26000, satAt + 12000) - Date.now()));   // B 가 앉고 12초 뒤에 길이 풀린다
    pathA.thaw(); pathC.thaw();
    await until(together, { timeout: 60000, every: 300, what: '셋이 다시 서로 보임' });

    const verdict = (v) => {
      // 9번: 두 화면(과 C 의 화면) 모두 B 가 주인이고 A 는 서 있다. A 에게는 늘 뜨던 그 알림이 뜬다.
      assert(v.B.s === 9 && v.A.s === -1, `자리가 겹쳤거나 뒤바뀌었다: A.s=${v.A.s}, B.s=${v.B.s}\n${JSON.stringify(v)}`);
      assert(v.B.seat9.includes('내 자리') && v.A.seat9.includes('자리 잡는 B') && v.C.seat9.includes('자리 잡는 B'), `9번 좌석의 주인이 화면마다 다르다\n${JSON.stringify(v)}`);
      assert(v.A.standing.includes('나') && v.B.standing.includes('터널 속 A'), `A 가 서 있는 사람으로 보이지 않는다\n${JSON.stringify(v)}`);
      assert(v.A.lost === 1 && v.B.lost === 0, `"앗, 방금 다른 분이 앉았어요" 알림: A 에게 ${v.A.lost}번 (한 번 떠야 한다), B 에게 ${v.B.lost}번 (뜨면 안 된다)`);
      // 3번: 아무도 앉지 않았으니 C 가 그대로 앉아 있고, 알림도 없다
      assert(v.C.s === 3 && v.C.seat3.includes('내 자리') && v.A.seat3.includes('터널 속 C') && v.B.seat3.includes('터널 속 C') && v.C.lost === 0, `아무도 앉지 않은 자리를 잃었다\n${JSON.stringify(v)}`);
    };
    await sleep(2000);
    verdict(await look());
    await sleep(5000);                                              // 몇 초 뒤에도 그대로다
    verdict(await look());
    // 줄곧 연결돼 있던 B 의 자리 주장은 건드리지 않는다 (멀쩡한 사람까지 "다시 앉은 것"으로 치지 않는다)
    assert(await b.evaluate(() => window.__dsy.room.self.sa) === claimed, 'B 의 자리 주장 시각이 바뀌었다');
  });

  // 위와 같은 일인데 "돌아오기 5초 전"에 앉은 경우. 예전에는 뒤늦게 들은 자리 주장을 10초 전까지 쳐 주는 바람에,
  // 돌아온 사람의 밀린 옛 소식이 방금 앉은 사람을 밀어냈다.
  await rep.check('소리 없이 멎었다 풀린 사람의 밀린 옛 소식은, 5초 전에 그 빈자리에 앉은 사람을 밀어내지 않는다 (둘 다 자리를 잃지도 않는다)', async () => {
    // 시작할 때의 모습: 길은 풀려 있고, C 는 3번에 앉아 있고, A 는 연결돼 있다 (앞 점검이 어떻게 끝났든)
    pathA.thaw(); pathC.thaw();
    await until(async () => await together() && (await peek(c)).self.s === 3 && (await peek(a)).seats[3] === 'taken' && (await peek(b)).seats[3] === 'taken', { timeout: 60000, every: 300, what: '셋이 서로 보이고 C 가 3번에 앉아 있음' });
    const was = await look();
    const t0 = Date.now();
    pathC.freeze();
    await until(async () => (await peek(a)).peers.length === 1 && (await peek(b)).peers.length === 1, { timeout: 25000, what: 'A 와 B 가 C 를 지움' });
    await sleep(Math.max(0, 14000 - (Date.now() - t0)));
    await a.click('.seat >> nth=3');
    await until(async () => (await peek(a)).self.s === 3 && (await peek(b)).seats[3] === 'taken', { what: 'A 가 비어 보이는 3번에 앉음' });
    await sleep(5000);                                              // A 가 앉고 5초 뒤에 C 의 길이 풀린다
    pathC.thaw();
    await until(together, { timeout: 60000, every: 300, what: '셋이 다시 서로 보임' });

    const verdict = (v) => {
      assert(v.A.s === 3 && v.C.s === -1, `자리가 겹쳤거나, 뒤바뀌었거나, 둘 다 잃었다: A.s=${v.A.s}, C.s=${v.C.s}\n${JSON.stringify(v)}`);
      assert(v.A.seat3.includes('내 자리') && v.B.seat3.includes('터널 속 A') && v.C.seat3.includes('터널 속 A'), `3번 좌석의 주인이 화면마다 다르다\n${JSON.stringify(v)}`);
      assert(v.C.standing.includes('나') && v.A.standing.includes('터널 속 C') && v.B.standing.includes('터널 속 C'), `C 가 서 있는 사람으로 보이지 않는다\n${JSON.stringify(v)}`);
      assert(v.C.lost === was.C.lost + 1 && v.A.lost === was.A.lost, `"앗, 방금 다른 분이 앉았어요" 알림: C 에게 새로 ${v.C.lost - was.C.lost}번 (한 번 떠야 한다), A 에게 새로 ${v.A.lost - was.A.lost}번 (뜨면 안 된다)`);
    };
    await sleep(2000);
    verdict(await look());
    await sleep(4000);
    verdict(await look());
  });
  await pathA.close(); await pathC.close();
});

await group('다시 점검에서 나온 것: 미뤄진 상영에 늦게 온 첫 손님', async () => {
  const far = await startPath(broker.port, { delay: 100 });         // 손님에게는 중계 서버가 조금 멀다: 한쪽 방향 0.1초
  const host = await person('영사기사');
  await host.goto(base()); await host.waitForSelector('.home');

  /** 이 약속을 처음 여는 손님이 표 화면에서 입장하기를 누른다. 문이 열렸을 때 선 곳(first)과 조금 뒤의 상태를 돌려준다 */
  async function arrive(name, code) {
    const g = await person(name);
    await g.goto(`${base(far.url)}#/s/${code}`); await g.waitForSelector('.ticket');
    await watchToasts(g);
    // 서버 시계의 초가 넘어가기 0.3초 전에 누른다: 시계 맞추기(초가 넘어가는 순간을 잡는다)가 금방 끝나서,
    // 문이 열릴 채비가 됐을 때 방의 소식은 아직 한 통도 오지 않았다 — 고치기 전에는 바로 그때 링크에 적힌 시각만 보고 상영관으로 보냈다.
    await sleep((1700 - (Date.now() % 1000)) % 1000);
    await g.click('.ticket-actions .btn-xl');
    await g.waitForSelector('.room.lobby, .room.hall');
    const first = await g.evaluate(() => document.body.dataset.screen);
    await sleep(1500);
    const st = await g.evaluate(() => ({ screen: document.body.dataset.screen, tk: window.__dsy.room.self.tk, rev: window.__dsy.room.ctl.rev, toasts: window.__toasts.slice() }));
    await g.context().close();
    return { first, ...st };
  }
  const told = (st) => st.toasts.some((t) => t.includes('이미 시작했어요'));

  await rep.check('영사기사가 상영을 5분 미뤘으면, 표에 적힌 시각이 지난 뒤 처음 온 손님도 로비로 들어간다 ("이미 시작했어요" 안내와 상영관 직행은 정말 상영 중일 때만)', async () => {
    const code = await createInvite(host, { inMs: 15000, dur: 1800, title: '미뤄진 영화' });
    await enter(host, base(), code); await toHall(host);
    await host.click('.booth-btn');
    await host.click('.sheet button:has-text("5분 미루기")');
    await until(async () => (await peek(host)).ctl.rev === 1, { what: '영사실에서 5분 미룸' });
    const printed = await host.evaluate(() => window.__dsy.scr.at);

    // 표에 적힌 시각이 지나기를 기다리는 동안, 견줄 경우를 본다: 미룬 적 없이 정말 상영 중인 영화관
    const friend = await person('먼저 온 관객');
    await friend.goto(base()); await friend.waitForSelector('.home');
    const running = await createInvite(friend, { inMs: -60000, dur: 1800, title: '상영 중인 영화' });
    await enter(friend, base(), running);
    const late = await arrive('지각한 손님', running);
    assert(late.first === 'hall' && late.screen === 'hall' && late.tk === 1 && told(late), `상영 중인데 처음 온 손님이 곧장 상영관으로 안내되지 않았다: ${JSON.stringify(late)}`);

    await until(async () => (await peek(host)).now > printed + 2500, { timeout: 30000, what: '표에 적힌 상영 시각이 지남' });
    for (const name of ['늦게 온 손님 1', '늦게 온 손님 2']) {
      const st = await arrive(name, code);
      assert(st.first === 'lobby' && st.screen === 'lobby' && st.tk === 0, `${name}: 상영이 미뤄졌는데 로비와 검표를 건너뛰었다: ${JSON.stringify(st)}`);
      assert(!told(st), `${name}: 시작하지도 않은 상영에 지각 안내가 떴다: ${JSON.stringify(st.toasts)}`);
      assert(st.rev === 1, `${name}: 미뤄진 상영 시각을 듣지 못했다 (rev ${st.rev})`);
    }
  });
  await far.close();
});

await group('다시 점검에서 나온 것: 새로고침과 자리', async () => {
  const b = await person('지켜보는 B');
  await b.goto(base()); await b.waitForSelector('.home');
  const code = await createInvite(b, { inMs: 3600000, dur: 60 });
  await enter(b, base(), code); await toHall(b);
  const slow = await startPath(broker.port);
  const a = await person('새로고침하는 A');
  // 문서가 열릴 때마다 적는다: 방에 들어선 때(그때 중계 서버에 붙어 있었는지), 남들 소식 기다리기가 끝난 때, 자리에 앉은 때
  await a.context().addInitScript(() => {
    const P = (window.__probe = {});
    setInterval(() => {
      const r = window.__dsy && window.__dsy.room;
      if (!r) return;
      const now = performance.now();
      if (P.room == null) { P.room = now; P.connected = r.net.connected; }
      if (P.settled == null && r.settleMs() === 0) P.settled = now;
      if (P.seat == null && r.self.s >= 0) P.seat = now;
    }, 8);
  });
  await enter(a, base(slow.url), code); await toHall(a);
  await sleep(1700);
  await a.click('.seat >> nth=5');
  const seenByB = async () => (await peek(b)).peers.filter((p) => p.n === '새로고침하는 A' && p.s === 5).length === 1 && (await peek(b)).seats[5] === 'taken';
  await until(seenByB, { what: 'A 가 5번에 앉음' });
  await a.evaluate(() => window.__dsy.room.update({ p: 0, pl: 20 }));   // 매점에서 팝콘을 사 온 셈 치고
  /** 새로 열린 문서가 방에 들어설 때까지 기다렸다가 길을 푼다 → 중계 서버는 joinRoom() 이 끝난 뒤에야 붙는다 (통신이 느린 곳에서 흔한 순서) */
  const thawOnceInside = async () => {
    await a.waitForFunction(() => window.__probe && window.__probe.room != null, null, { polling: 20, timeout: 15000 });
    slow.thaw();
  };

  await rep.check('앉은 채 새로고침하면, 중계 서버가 늦게 붙어도 남들 소식 기다리기가 끝나는 대로 자리를 되찾는다 (4초 한도를 다 채우지 않는다)', async () => {
    slow.freeze();
    await a.reload();
    await thawOnceInside();
    const P = await until(async () => { const p = await a.evaluate(() => window.__probe); return p.seat != null && p.settled != null && p; }, { timeout: 9000, every: 100, what: 'A 가 자리를 되찾음' });
    assert(P.connected === false, '시험 전제가 어긋났다: 방에 들어설 때 이미 중계 서버에 붙어 있었다');
    // 고친 뒤: 기다리기가 끝나고 0.05초 안팎. 고치기 전: 들어온 지 4.03초가 돼서야 (기다리기가 끝나고 1~2초 뒤)
    const gap = Math.round(P.seat - P.settled);
    assert(gap < 500, `기다리기가 끝나고 ${gap}ms 뒤에야 자리를 되찾았다 (방에 들어서고 ${Math.round(P.seat - P.room)}ms 뒤)`);
    await until(async () => (await peek(a)).self.s === 5 && await seenByB(), { timeout: 4000, what: 'B 의 화면에서도 A 가 5번에 다시 앉음' });
  });

  await rep.check('자리를 되찾으려고 기다리는 사이 팝콘을 한 알 먹고 또 새로고침해도, 앉아 있던 자리를 잊지 않는다', async () => {
    // 기다리는 시간(길어야 4초) 안에 팝콘을 먹어야 뜻이 있다. 기계가 느려 놓쳤으면 처음부터 다시 해 본다.
    let inTheWait = false;
    for (let round = 0; round < 3 && !inTheWait; round++) {
      slow.thaw();
      await until(async () => (await peek(a)).self.s === 5 && await seenByB(), { timeout: 9000, what: 'A 가 5번에 앉아 있음' });
      slow.freeze();
      await a.reload();
      await a.waitForSelector('.room.hall .pop-btn');
      const eaten = await a.evaluate(() => window.__dsy.room.self.pe);
      await a.click('.pop-btn');
      inTheWait = await a.evaluate((eaten) => { const r = window.__dsy.room; return r.self.pe === eaten + 1 && r.self.s < 0 && r.settleMs() > 0; }, eaten);
    }
    assert(inTheWait, '자리를 기다리는 사이에 팝콘을 먹지 못했다 (시험 기계가 너무 느리다)');
    await a.reload();
    await thawOnceInside();
    await until(async () => (await peek(a)).self.s === 5 && await seenByB(), { timeout: 9000, what: 'A 가 5번을 되찾음 (고치기 전에는 두 번째 새로고침에서 자리를 잊었다)' });
  });
  await slow.close();
});

await group('다시 점검에서 나온 것: 들어오다 만 둘째 탭', async () => {
  const obs = await person('지켜보는 관객');
  await obs.goto(base()); await obs.waitForSelector('.home');
  const code = await createInvite(obs, { inMs: 3600000, dur: 60 });
  await enter(obs, base(), code); await toHall(obs);
  const name = '탭 둘 여는 손님';
  const t1 = await person(name);
  /** 지켜보는 관객의 화면에 그 손님이 한 명으로, 5번에 앉아 보이는가 */
  const oneSeated = async () => { const p = await peek(obs); const me = p.peers.filter((x) => x.n === name); return me.length === 1 && me[0].s === 5 && p.seats[5] === 'taken'; };
  /** 점검을 시작할 때의 모습: 그 손님은 탭 하나로 상영관 5번에 앉아 있다 (앞 점검이 어떻게 끝났든 다시 맞춘다) */
  async function firstTabSeated() {
    for (const t of t1.context().pages()) if (t !== t1) await t.close();
    if (!(await t1.evaluate(() => !!(window.__dsy && window.__dsy.room && !window.__dsy.room.closed && window.__dsy.room.self.s === 5)))) {
      await t1.goto(base()); await t1.waitForSelector('.home');   // (쫓겨난 안내 화면에 서 있어도 처음부터 다시 들어가게)
      await enter(t1, base(), code); await toHall(t1);
      await sleep(1700);
      if ((await peek(t1)).self.s !== 5) await t1.click('.seat >> nth=5');
    }
    await until(async () => (await peek(t1)).self.s === 5 && await oneSeated(), { timeout: 15000, what: '첫 탭이 5번에 앉음' });
  }
  /** 같은 브라우저의 새 탭. 이 탭은 통신이 느려 "영화관 문을 여는 중…"이 1.5초는 이어진다 — 그 사이에 마음을 바꾼다 */
  async function slowTab() {
    const t = await t1.context().newPage();
    watchErrors(t, errors, name + '의 새 탭');
    await t.route('**/vendor/mqtt.min.js', async (r) => { await sleep(1500); await r.continue().catch(() => {}); });
    return t;
  }
  /** 첫 탭이 쫓겨나지 않고 5번에 그대로 앉아 있는가 */
  async function firstTabStays(when) {
    const st = await t1.evaluate(() => ({ screen: document.body.dataset.screen, text: document.querySelector('#screen').textContent.slice(0, 40), room: !!(window.__dsy.room && !window.__dsy.room.closed), s: window.__dsy.room ? window.__dsy.room.self.s : null }));
    assert(st.room && st.screen === 'hall' && st.s === 5 && !st.text.includes('다른 탭에서'), `${when}: 첫 탭이 쫓겨났다: ${JSON.stringify(st)}`);
  }

  await rep.check('둘째 탭이 "문을 여는 중"에 뒤로 가 버리면, 잘 보고 있던 첫 탭은 쫓겨나지 않는다', async () => {
    await firstTabSeated();
    const t2 = await slowTab();
    await t2.goto(base()); await t2.waitForSelector('.home .appt');
    await t2.click('.home .appt'); await t2.waitForSelector('.ticket');
    await t2.click('.ticket-actions .btn-xl'); await t2.waitForSelector('.spinner');
    await t2.goBack(); await t2.waitForSelector('.home');
    // 곧바로 첫 탭으로 돌아와 본다: 첫 탭이 "나 여기 있다"고 알리는데, 들어오다 만 탭이 여기에 대꾸해서도 안 된다
    await t1.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await firstTabStays('뒤로 간 직후');
    await sleep(3500);                     // 둘째 탭이 열다 만 문(연결)이 마저 닫힐 때까지
    await firstTabStays('3.5초 뒤');
    const st2 = await t2.evaluate(() => ({ screen: document.body.dataset.screen, room: !!window.__dsy.room }));
    assert(st2.screen === 'home' && !st2.room, `둘째 탭: ${JSON.stringify(st2)}`);
    await until(oneSeated, { timeout: 15000, what: '남의 화면에 한 명으로, 앉은 채 보임' });
    await t2.close();
  });

  await rep.check('둘째 탭을 "문을 여는 중"에 닫아 버려도 첫 탭은 그대로다. 새 탭이 정말로 들어오면 그때는 첫 탭이 물러난다', async () => {
    await firstTabSeated();
    const t3 = await slowTab();
    await t3.goto(`${base()}#/s/${code}`); await t3.waitForSelector('.ticket');
    await t3.click('.ticket-actions .btn-xl'); await t3.waitForSelector('.spinner');
    await t3.close();
    await sleep(3000);
    await firstTabStays('닫고 3초 뒤');
    await until(oneSeated, { timeout: 15000, what: '남의 화면에 한 명으로, 앉은 채 보임' });
    // 문지기가 아예 잠긴 것은 아니다: 끝까지 들어온 새 탭에게는 예전처럼 자리를 넘긴다
    const t4 = await t1.context().newPage();
    watchErrors(t4, errors, name + '의 새 탭');
    await t4.goto(`${base()}#/s/${code}`); await t4.waitForSelector('.ticket');
    await t4.click('.ticket-actions .btn-xl');
    await t4.waitForSelector('.room.hall');
    await until(async () => (await screenText(t1)).includes('다른 탭에서 입장했어요') && !(await inRoom(t1)), { timeout: 8000, what: '옛 탭이 물러남' });
    await until(async () => (await peek(t4)).self.s === 5 && await oneSeated(), { timeout: 15000, what: '새 탭이 5번을 이어받고, 남의 화면에는 한 명으로 보임' });
  });
});

await group('다시 점검에서 나온 것: 꽉 찬 방에 들어설 때 오가는 시계 맞추기', async () => {
  const v = await person('관객');
  await v.goto(base()); await v.waitForSelector('.home');
  const code = await createInvite(v, { inMs: 3600000, dur: 60 });
  await enter(v, base(), code); await toHall(v);
  const friend = await person('옆자리 친구');
  await enter(friend, base(), code); await toHall(friend);
  await until(async () => (await peek(v)).peers.length === 1 && (await peek(friend)).peers.length === 1, { what: '둘이 만남' });
  const [vId, friendId] = await Promise.all([v, friend].map((p) => p.evaluate(() => window.__dsy.room.selfId)));
  const atk = await intruder(code);

  await rep.check('남에게 가는 시계 답장(po)이 1초에 600통 넘게 오가도, 그 사이 옆 사람의 꾸벅 인사는 빠짐없이 그려진다 (방 전체 한도 300통에 세지 않는다)', async () => {
    await v.evaluate((id) => { window.__bows = 0; window.__dsy.room.on('act', (from, type, d) => { if (from === id && type === 'em' && d.e === 0) window.__bows++; }); }, friendId);
    // 꽉 찬 방에 한 명이 들어설 때처럼: 3.6초 동안 1초에 700통, 보내는 ID 25개가 돌아가며 (한 ID 가 1초에 28통 — 한 사람 한도 40통 아래)
    const flood = atk.evaluate(async () => {
      const t0 = performance.now();
      let sent = 0;
      for (;;) {
        const ms = performance.now() - t0;
        if (ms > 3600) return { sent, perSec: Math.round(sent / (ms / 1000)) };
        while (sent < ms * 0.7) { await window.atk.sendAs('clock-' + (sent % 25), 'po', { to: 'someone-else', t: 1, r: 2, y: 1 }); sent++; }
        await new Promise((r) => setTimeout(r, 15));
      }
    });
    await sleep(500);
    // 0.6초 간격으로 다섯 번: 관객 쪽 "1초 칸"의 어느 대목에든 한 번은 걸린다 (고치기 전에는 칸마다 앞의 300통만 받고 나머지는 인사까지 버렸다)
    for (let i = 0; i < 5; i++) { await friend.evaluate(() => window.__dsy.room.act('em', { e: 0 })); await sleep(600); }
    const sent = await flood;
    await sleep(400);
    assert(sent.perSec >= 600, `시험 전제가 어긋났다: 답장을 1초에 ${sent.perSec}통밖에 보내지 못했다`);
    const drawn = await v.evaluate(() => window.__bows);
    assert(drawn === 5, `꾸벅 인사 5번 가운데 ${drawn}번만 그려졌다 (그동안 오간 남의 답장 ${sent.sent}통, 1초에 ${sent.perSec}통)`);
  });

  await rep.check('스무 명을 한꺼번에 만나도 시계 맞추기 물음(pi)은 한 번에 모아 보낸다 (만난 사람 수만큼 보내지 않는다)', async () => {
    await atk.evaluate(() => window.atk.listen());
    await sleep(1200);                     // 앞 점검에서 쏟아진 것이 다 지나가고, 관객 쪽 1초 한도도 새로 시작한 뒤에
    const before = (await peek(v)).peers.length;
    const t0 = await atk.evaluate(async () => {
      const t0 = Date.now();
      for (let i = 0; i < 20; i++) await window.atk.sendAs('crowd-' + i, 'st', window.atk.state({ n: '먼저 온 관객 ' + (i + 1) }));
      return t0;
    });
    await until(async () => (await peek(v)).peers.length === before + 20, { timeout: 3000, every: 50, what: `스무 명이 한꺼번에 보임 (그 전에 ${before}명)` });
    await sleep(2000);
    const asked = await atk.evaluate(({ vId, t0 }) => window.atk.heard.filter((m) => m.i === vId && m.y === 'pi' && m.at >= t0).length, { vId, t0 });
    // 모아서 한 번 (20초마다 보내는 정기 물음이 겹치면 두 번). 고치기 전에는 스무 번.
    assert(asked >= 1 && asked <= 3, `2초 남짓 동안 보낸 시계 맞추기 물음 ${asked}번`);
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
