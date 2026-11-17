// 동시상영 자동 점검.  실행: (cinema/tests 에서) npm install && node e2e.mjs
//
// 바깥 네트워크 없이 돈다: 유튜브는 가짜 플레이어(mock-yt.js)로, 공용 MQTT 브로커는 로컬 aedes 로 대신한다.
// 즉 여기서 확인하는 것은 "우리 코드의 논리"이고, 실제 유튜브·실제 공용 브로커와의 궁합은 실기기로 따로 봐야 한다.
import { chromium, startStatic, startBroker, spawn, createInvite, enter, toHall, peek, until, reporter, assert, sleep } from './harness.mjs';

const only = process.argv[2] || '';
const site = await startStatic();
let broker = await startBroker();
const browser = await chromium.launch();
const errors = [];
const rep = reporter();
const base = () => `${site.url}index.html?brokers=${encodeURIComponent(broker.url)}`;
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

// ------------------------------------------------------------------
await group('순수 논리', async () => {
  const page = await person('논리');
  await page.goto(base());
  await page.waitForSelector('.home');

  await rep.check('유튜브 주소 해석: 여러 모양의 주소에서 영상 ID 를 꺼낸다', async () => {
    const r = await page.evaluate(async () => {
      const L = await import('./js/link.js');
      const good = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=90', 'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
        'youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?si=abc', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ',
        '이거 봐 https://youtu.be/dQw4w9WgXcQ 재밌어', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://www.youtube.com/watch/dQw4w9WgXcQ'];
      const bad = ['https://vimeo.com/123', 'https://www.youtube.com/playlist?list=PL123', 'hello', '', 'https://evil.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@someone/live', 'https://www.youtube.com/watch?v=short'];
      return { good: good.map((u) => (L.parseYouTube(u) || {}).id), bad: bad.map((u) => L.parseYouTube(u)), start: L.parseYouTube('https://youtu.be/dQw4w9WgXcQ?t=1m30s').start };
    });
    assert(r.good.every((id) => id === 'dQw4w9WgXcQ'), 'good urls: ' + JSON.stringify(r.good));
    assert(r.bad.every((v) => v === null), 'bad urls accepted: ' + JSON.stringify(r.bad));
    assert(r.start === 90, 'start=' + r.start);
  });

  await rep.check('초대 링크: 부호화↔복호화가 같고, 잘린/조작된 코드는 거부한다', async () => {
    const r = await page.evaluate(async () => {
      const L = await import('./js/link.js');
      const scr = L.normalizeScreening({ room: 'abcdefghijklmnopqrstuv', vid: 'dQw4w9WgXcQ', at: 1795000000000, title: '금요일 심야 영화 🎬', dur: 5400, host: '졸린 팝콘 도둑', hk: 'A'.repeat(87) });
      const code = L.encodeInvite(scr);
      const back = L.decodeInvite(code);
      const hostile = L.normalizeScreening({ room: 'abcdefghijklmnopqrstuv', vid: 'dQw4w9WgXcQ', at: 1795000000000, title: 'x'.repeat(5000) + '\u202e<b>', dur: -5, host: { evil: 1 }, hk: 42 });
      return {
        same: JSON.stringify(scr) === JSON.stringify(back), len: code.length,
        truncated: L.decodeInvite(code.slice(0, code.length - 9)), garbage: L.decodeInvite('!!!!'), empty: L.decodeInvite(''),
        badVid: L.normalizeScreening({ ...scr, vid: '<script>' }), badRoom: L.normalizeScreening({ ...scr, room: 'short' }), badAt: L.normalizeScreening({ ...scr, at: 'soon' }),
        hostile,
      };
    });
    assert(r.same, 'roundtrip differs');
    assert(r.len < 600, 'invite too long: ' + r.len);
    assert(r.truncated === null && r.garbage === null && r.empty === null, 'bad codes accepted');
    assert(r.badVid === null && r.badRoom === null && r.badAt === null, 'bad fields accepted');
    assert(Array.from(r.hostile.title).length <= 60 && r.hostile.dur === 0 && r.hostile.host === '' && r.hostile.hk === '', 'hostile fields not normalised: ' + JSON.stringify(r.hostile).slice(0, 200));
  });

  await rep.check('상영 위치 계산: 시작 전/상영 중/쉬는 시간(자동 재개)/종료', async () => {
    const r = await page.evaluate(async () => {
      const R = await import('./js/room.js');
      const ctl = { rev: 0, at: 1000000, pause: null, vid: 'x', dur: 100, title: '' };
      const paused = { ...ctl, ...R.pausePatch(ctl, 1000000 + 40000) };
      return {
        before: R.showPosition(ctl, 1000000 - 5000),
        playing: R.showPosition(ctl, 1000000 + 40000),
        ended: R.showPosition(ctl, 1000000 + 100000),
        longer: R.showPosition(ctl, 1000000 + 150000, 200),        // 플레이어가 알려준 실제 길이가 우선
        paused: R.showPosition(paused, 1000000 + 40000 + 60000),
        autoResume: R.showPosition(paused, 1000000 + 40000 + R.PAUSE_MAX_MS + 5000),
        resumed: R.showPosition({ ...paused, ...R.resumePatch(paused, 1000000 + 90000) }, 1000000 + 90000),
        unknownOk: R.showPosition({ ...ctl, dur: 0 }, 1000000 + 3 * 3600000).phase,
        unknownCap: R.showPosition({ ...ctl, dur: 0 }, 1000000 + 7 * 3600000).phase,
      };
    });
    assert(r.before.phase === 'before' && r.before.until === 5000, JSON.stringify(r.before));
    assert(r.playing.phase === 'playing' && r.playing.pos === 40, JSON.stringify(r.playing));
    assert(r.ended.phase === 'ended', JSON.stringify(r.ended));
    assert(r.longer.phase === 'playing' && r.longer.pos === 150, JSON.stringify(r.longer));
    assert(r.paused.phase === 'paused' && r.paused.pos === 40 && r.paused.resumeIn > 0, JSON.stringify(r.paused));
    assert(r.autoResume.phase === 'playing' && Math.abs(r.autoResume.pos - 45) < 0.01, 'auto resume: ' + JSON.stringify(r.autoResume));
    assert(r.resumed.phase === 'playing' && Math.abs(r.resumed.pos - 38) < 0.01, 'resume: ' + JSON.stringify(r.resumed));
    assert(r.unknownOk === 'playing' && r.unknownCap === 'ended', `unknown dur: ${r.unknownOk}/${r.unknownCap}`);
  });

  await rep.check('영사실 서명: 조작된 변경은 무시한다', async () => {
    const code = await createInvite(page, { inMs: 3600000 });
    const r = await page.evaluate(async (code) => {
      const L = await import('./js/link.js');
      const R = await import('./js/room.js');
      const S = await import('./js/sign.js');
      const scr = L.decodeInvite(code);
      const jwk = JSON.parse(localStorage.getItem('dsy.host.' + scr.room)).jwk;
      const text = (c) => `dsy1|ctl|${scr.room}|${c.r}|${c.t}|${c.p == null ? '' : c.p}|${c.v}|${c.d}|${c.n}`;
      const good = { r: 3, t: scr.at + 600000, p: null, v: scr.vid, d: scr.dur, n: scr.title };
      good.g = await S.signText(jwk, text(good));
      localStorage.setItem('dsy.ctl.' + scr.room, JSON.stringify(good));
      const a = await R.storedCtl(scr);
      localStorage.setItem('dsy.ctl.' + scr.room, JSON.stringify({ ...good, t: scr.at + 999000 }));   // 서명은 그대로, 값만 바꿈
      const b = await R.storedCtl(scr);
      const other = await S.generateHostKey();
      const forged = { ...good, r: 9 };
      forged.g = await S.signText(other.privateJwk, text(forged));                                       // 다른 사람의 키로 서명
      localStorage.setItem('dsy.ctl.' + scr.room, JSON.stringify(forged));
      const c = await R.storedCtl(scr);
      localStorage.removeItem('dsy.ctl.' + scr.room);
      return { a: a.rev, aAt: a.at - scr.at, b: b.rev, c: c.rev };
    }, code);
    assert(r.a === 3 && r.aAt === 600000, 'valid packet rejected: ' + JSON.stringify(r));
    assert(r.b === 0, 'tampered packet accepted');
    assert(r.c === 0, 'packet signed by another key accepted');
  });
});

// ------------------------------------------------------------------
await group('예매와 표', async () => {
  const page = await person('예매하는 사람');
  await page.goto(base());
  await page.waitForSelector('.home');

  await rep.check('홈 → 예매 → 표: 링크를 넣으면 미리보기로 확인하고 표가 나온다', async () => {
    await page.click('.home .btn-xl');
    await page.waitForSelector('.booking');
    assert(await page.locator('.booking .btn-xl').isDisabled(), '영상 없이도 표 끊기가 눌린다');
    await page.fill('input[type=url]', '이거 보자 https://youtu.be/WhWc3b3KhnY?si=zzz');
    await page.dispatchEvent('input[type=url]', 'change');
    await page.waitForSelector('.note.good', { timeout: 15000 });
    await page.click('.chip:has-text("10분 뒤")');
    await page.click('.booking .btn-xl');
    await page.waitForSelector('.ticket');
    await page.waitForSelector('.sheet', { timeout: 5000 });          // "표가 나왔어요" 안내
    const info = await page.evaluate(async () => {
      const L = await import('./js/link.js');
      const scr = L.decodeInvite(location.hash.slice(4));
      return { vid: scr.vid, inMin: Math.round((scr.at - Date.now()) / 60000), host: scr.host, hasKey: scr.hk.length > 80, hostKeyStored: !!localStorage.getItem('dsy.host.' + scr.room), title: scr.title };
    });
    assert(info.vid === 'WhWc3b3KhnY', 'vid ' + info.vid);
    assert(info.inMin >= 9 && info.inMin <= 11, 'showtime in ' + info.inMin + ' min');
    assert(info.host === '예매하는 사람' && info.hasKey && info.hostKeyStored, JSON.stringify(info));
  });

  await rep.check('재생이 막힌 영상(오류 150)은 표를 끊을 수 없다', async () => {
    const p2 = await person('막힌 영상', { ytMock: { error: 150 } });
    await p2.goto(base() + '#/new');
    await p2.waitForSelector('.booking');
    await p2.fill('input[type=url]', 'https://youtu.be/WhWc3b3KhnY');
    await p2.dispatchEvent('input[type=url]', 'change');
    await p2.waitForSelector('.note.bad', { timeout: 10000 });
    assert(await p2.locator('.booking .btn-xl').isDisabled(), '막힌 영상인데 표 끊기가 눌린다');
  });

  await rep.check('악성 초대 링크: 제목·이름의 태그는 글자로만 보이고 실행되지 않는다', async () => {
    const p3 = await person('피해자');
    await p3.goto(base());
    await p3.waitForSelector('.home');
    const code = await p3.evaluate(async () => {
      const L = await import('./js/link.js');
      return L.encodeInvite({ room: 'abcdefghijklmnopqrstuv', vid: 'dQw4w9WgXcQ', at: Date.now() + 5000, title: '<img src=x onerror="window.__xss=1">', dur: 60, host: '"><script>window.__xss=2</script>', hk: '' });
    });
    await p3.goto(`${base()}#/s/${code}`);
    await p3.waitForSelector('.ticket');
    const title = await p3.textContent('.ticket-title');
    assert(title.includes('<img'), 'title not shown as text: ' + title);
    await p3.click('.ticket-actions .btn-xl');
    await p3.waitForSelector('.room.lobby');
    await toHall(p3);
    await sleep(800);
    assert((await p3.evaluate(() => window.__xss)) === undefined, 'script executed!');
    assert((await p3.locator('img[src="x"]').count()) === 0, 'img element injected');
  });

  await rep.check('잘린 초대 링크는 안내 화면을 보여 준다', async () => {
    await page.goto(base() + '#/s/WzEsImFiY2Q');
    await page.waitForSelector('.center-msg');
    assert((await page.textContent('.center-msg')).includes('표를 읽을 수 없어요'), 'no notice');
  });
});

// ------------------------------------------------------------------
await group('함께 있기 (로비)', async () => {
  const a = await person('호스트 A', { av: [0, 0, 0, 0] });
  const b = await person('친구 B', { av: [1, 2, 3, 1] });
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 120000, dur: 30 });
  await enter(a, base(), code);
  await enter(b, base(), code);

  await rep.check('서로의 아바타와 이름표가 보인다 (실제 MQTT 중계 경유)', async () => {
    await until(async () => (await a.locator('.av:not(.npc)').count()) === 2 && (await b.locator('.av:not(.npc)').count()) === 2, { what: 'two avatars on both screens' });
    const tagsA = await a.locator('.av:not(.npc) .av-tag').allTextContents();
    assert(tagsA.includes('나: 호스트 A') && tagsA.includes('친구 B'), 'tags on A: ' + tagsA.join('|'));
    assert((await a.getAttribute('.net-pill', 'data-net')) === 'on', 'A not shown as connected');
    const pa = await peek(a);
    assert(pa.isHost && !(await peek(b)).isHost, 'host flag wrong');
  });

  await rep.check('B가 걸어가면 A의 화면에서도 걸어간다', async () => {
    const box = await b.locator('.lobby-stage').boundingBox();
    await b.mouse.click(box.x + box.width * (80 / 390), box.y + box.height * (480 / 560));
    await until(async () => { const p = (await peek(a)).peers[0]; return p && Math.abs(p.x - 80) < 3 && Math.abs(p.y - 480) < 3; }, { what: 'B position on A' });
  });

  await rep.check('이모지와 한마디가 말풍선으로 전해진다 (자유 채팅은 없다)', async () => {
    await b.click('.emote-btn >> nth=1');
    await a.waitForSelector('.av:not(.me) .bubble.emote', { timeout: 5000 });
    await sleep(500);
    await b.click('.phrase-btn >> nth=2');
    await a.waitForSelector('.av:not(.me) .bubble.say', { timeout: 5000 });
    assert((await a.textContent('.av:not(.me) .bubble.say')) === '팝콘 살게', 'wrong phrase');
    assert((await a.locator('.room-bottom input, .room-bottom textarea').count()) === 0, 'free text input exists');
  });

  await rep.check('매점에서 팝콘을 사면 들고 다니는 모습이 남에게도 보인다', async () => {
    await b.click('.hs-snack');
    await b.waitForSelector('.menu-grid', { timeout: 10000 });
    await b.click('.menu-item >> nth=1');
    await until(async () => { const p = (await peek(a)).peers[0]; return p && p.p === 1 && p.pl === 20; }, { what: 'B popcorn on A' });
  });

  await rep.check('검표를 받아야 상영관에 들어간다', async () => {
    assert((await peek(b)).self.tk === 0, 'already checked');
    await toHall(b);
    const s = (await peek(b)).self;
    assert(s.tk === 1 && s.sc === 'hall', JSON.stringify(s));
    await until(async () => (await a.locator('.av:not(.npc)').count()) === 1, { what: 'B leaves lobby on A' });
  });

  await rep.check('창을 닫으면 곧 사라진다', async () => {
    await b.context().close();
    await until(async () => (await peek(a)).peers.length === 0, { timeout: 16000, what: 'B removed from A' });
  });
});

// ------------------------------------------------------------------
await group('상영 (동기화)', async () => {
  const a = await person('호스트 A', { ytMock: { duration: 26 } });
  const b = await person('친구 B', { ytMock: { duration: 26 } });
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 14000, dur: 26 });
  await enter(a, base(), code); await enter(b, base(), code);
  await toHall(a); await toHall(b);

  await rep.check('자리 잡기: 내가 앉은 자리는 남에게 "주인 있음"으로 보이고, 빼앗을 수 없다', async () => {
    await sleep(1600);
    await a.click('.seat >> nth=8');
    await until(async () => (await peek(b)).seats[8] === 'taken' && (await peek(a)).seats[8] === 'mine', { what: 'seat 8 state' });
    await b.click('.seat >> nth=8');
    await sleep(600);
    assert((await peek(b)).self.s === -1, 'B took an occupied seat');
    await b.click('.seat >> nth=9');
    await until(async () => (await peek(a)).seats[9] === 'taken', { what: 'seat 9 on A' });
  });

  await rep.check('상영 전에는 커튼과 카운트다운, 플레이어는 아직 없다', async () => {
    assert((await a.locator('.pre .curtain svg').count()) === 1, 'no curtain');
    assert((await a.locator('.mock-yt').count()) === 0, 'player mounted before showtime');
    assert((await peek(a)).lights === 'on' || (await peek(a)).lights === 'dim', 'lights');
  });

  await rep.check('정시에 불이 꺼지고 두 사람의 영상이 같은 위치로 흐른다 (오차 0.7초 이내)', async () => {
    await a.waitForSelector('.mock-yt', { timeout: 30000 });
    await b.waitForSelector('.mock-yt', { timeout: 30000 });
    await sleep(6000);
    const [pa, pb] = await Promise.all([peek(a), peek(b)]);
    const expA = (pa.now - pa.ctl.at) / 1000, expB = (pb.now - pb.ctl.at) / 1000;
    assert(pa.lights === 'off' && pb.lights === 'off', `lights ${pa.lights}/${pb.lights}`);
    assert(pa.player.state === 1 && pb.player.state === 1, 'not playing');
    assert(Math.abs(pa.player.t - expA) < 0.7, `A drift ${(pa.player.t - expA).toFixed(2)}s`);
    assert(Math.abs(pb.player.t - expB) < 0.7, `B drift ${(pb.player.t - expB).toFixed(2)}s`);
    assert(Math.abs(pa.now - pb.now) < 400, `room clocks differ by ${Math.abs(pa.now - pb.now)}ms`);
    assert((await a.locator('.pre, .curtain').count()) === 0, 'curtain still there while playing');
  });

  await rep.check('플레이어 위에는 아무것도 덮여 있지 않다 (유튜브 정책)', async () => {
    const r = await a.evaluate(() => {
      const box = document.querySelector('.mock-yt').getBoundingClientRect();
      const pts = [[0.5, 0.5], [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.5, 0.1], [0.5, 0.9]];
      const covered = pts.filter(([fx, fy]) => {
        const el = document.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy);
        return !(el && el.closest('.mock-yt'));
      });
      return { covered: covered.length, h: box.height, w: box.width };
    });
    assert(r.covered === 0, `${r.covered} points covered`);
    assert(r.h >= 200 && r.w >= 200, `player ${r.w}x${r.h} smaller than 200px`);
  });

  await rep.check('관객이 영상을 넘기거나 멈춰도 곧 제자리로 돌아온다', async () => {
    await b.evaluate(() => { const p = window.__ytPlayers.filter((x) => !x.destroyed).pop(); p.seekTo(1); });
    await sleep(4500);
    let pb = await peek(b);
    assert(Math.abs(pb.player.t - (pb.now - pb.ctl.at) / 1000) < 0.9, 'did not resync after seek: ' + (pb.player.t - (pb.now - pb.ctl.at) / 1000).toFixed(2));
    await b.evaluate(() => { window.__ytPlayers.filter((x) => !x.destroyed).pop().pauseVideo(); });
    await sleep(1500);
    pb = await peek(b);
    assert(pb.player.state === 1, 'did not resume after pause');
  });

  await rep.check('늦게 온 사람은 로비를 건너뛰고 중간부터 본다', async () => {
    const c = await person('지각생 C', { ytMock: { duration: 26 } });
    await enter(c, base(), code);
    assert((await c.locator('.room.hall').count()) === 1, 'late joiner not sent to hall');
    await c.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(3500);
    const pc = await peek(c);
    assert(pc.player.state === 1, 'late joiner not playing');
    assert(pc.player.t > 5 && Math.abs(pc.player.t - (pc.now - pc.ctl.at) / 1000) < 0.9, `late joiner at ${pc.player.t.toFixed(1)}s`);
    assert(pc.seats[8] === 'taken' && pc.seats[9] === 'taken', 'late joiner does not see seats');
  });

  await rep.check('팝콘: 없으면 안내, 있으면 한 알씩 줄고 먹은 수가 쌓인다', async () => {
    await a.click('.pop-btn');
    assert((await a.textContent('#toast-root')).includes('팝콘이 없어요'), 'no toast');
    await a.evaluate(() => window.__dsy.room.update({ p: 0, pl: 3 }));
    for (let i = 0; i < 5; i++) { await a.click('.pop-btn'); await sleep(120); }
    const s = (await peek(a)).self;
    assert(s.pl === 0 && s.pe === 3, JSON.stringify({ pl: s.pl, pe: s.pe }));
    await until(async () => (await peek(b)).peers.find((p) => p.n === '호스트 A').pe === 3, { what: 'eaten count on B' });
  });

  await rep.check('끝나면 엔딩 크레딧, 본 사람만 기념 티켓을 받아 티켓북에 남는다', async () => {
    await a.waitForSelector('.end', { timeout: 40000 });
    assert((await a.locator('.mock-yt').count()) === 0, 'player still mounted after end');
    const names = await a.locator('.credits-name').allTextContents();
    assert(names.some((n) => n.includes('호스트 A')) && names.some((n) => n.includes('친구 B')) && names.some((n) => n.includes('지각생 C')), 'credits: ' + names.join('|'));
    await a.click('.hall-strip .btn-primary');
    await a.waitForSelector('.sheet .stub');
    const stub = await a.evaluate(() => JSON.parse(localStorage.getItem('dsy.stubs'))[0]);
    assert(stub.seat === 'B열 3번' && stub.with.includes('친구 B') && stub.pe === 3, JSON.stringify(stub));
    await a.click('.sheet .btn-primary');
    await a.goto(base() + '#/book');
    await a.waitForSelector('.book .stub');
    // 끝난 뒤에 처음 들어온 사람에게는 주지 않는다
    const d = await person('뒷북 D', { ytMock: { duration: 26 } });
    await enter(d, base(), code);
    await toHall(d);
    await d.waitForSelector('.end', { timeout: 10000 });
    assert((await d.locator('.hall-strip .btn-primary').count()) === 0, 'souvenir offered to someone who did not watch');
  });
});

// ------------------------------------------------------------------
await group('영사기사', async () => {
  const a = await person('호스트 A');
  const b = await person('친구 B');
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 3600000, dur: 60 });
  await enter(a, base(), code); await enter(b, base(), code);
  await toHall(a); await toHall(b);
  await sleep(1700);

  await rep.check('영사실 버튼은 약속을 만든 사람에게만 보인다', async () => {
    assert((await a.locator('.booth-btn').count()) === 1 && (await b.locator('.booth-btn').count()) === 0, 'booth button visibility');
  });

  await rep.check('"지금 바로 시작"을 누르면 모두의 카운트다운이 10초로 바뀌고 상영이 시작된다', async () => {
    await a.click('.booth-btn');
    await a.click('.sheet .btn >> nth=0');
    await until(async () => { const p = await peek(b); return p.ctl.rev === 1 && p.ctl.at - p.now < 11000; }, { what: 'ctl on B' });
    await b.waitForSelector('.mock-yt', { timeout: 20000 });
    await a.waitForSelector('.mock-yt', { timeout: 20000 });
  });

  await rep.check('쉬는 시간: 모두 멈추고, 다시 상영하면 모두 이어진다', async () => {
    await sleep(3500);
    await a.click('.booth-btn');
    await a.click('.sheet .btn >> nth=0');
    await until(async () => { const [pa, pb] = await Promise.all([peek(a), peek(b)]); return pa.player && pb.player && pa.player.state === 2 && pb.player.state === 2 && pb.lights === 'dim'; }, { what: 'both paused' });
    const [pa, pb] = await Promise.all([peek(a), peek(b)]);
    assert(Math.abs(pa.player.t - pb.player.t) < 0.8, `paused at ${pa.player.t.toFixed(1)} vs ${pb.player.t.toFixed(1)}`);
    assert((await b.textContent('.hall-strip')).includes('쉬어 갑니다'), 'no intermission notice');
    await a.click('.booth-btn');
    await a.click('.sheet .btn >> nth=0');
    await until(async () => { const [x, y] = await Promise.all([peek(a), peek(b)]); return x.player.state === 1 && y.player.state === 1; }, { what: 'both resumed' });
    await sleep(3000);
    const [qa, qb] = await Promise.all([peek(a), peek(b)]);
    assert(Math.abs(qa.player.t - qb.player.t) < 0.8, `resumed at ${qa.player.t.toFixed(1)} vs ${qb.player.t.toFixed(1)}`);
  });

  await rep.check('나중에 들어온 사람도 바뀐 일정을 받는다 (영사기사가 없어도 다른 관객이 전해 준다)', async () => {
    await a.context().close();
    await sleep(500);
    const c = await person('새 손님 C');
    await enter(c, base(), code);
    await until(async () => (await peek(c)).ctl.rev >= 3, { what: 'ctl gossip to C' });
    await toHall(c);                         // 표에는 원래 시각(1시간 뒤)이 적혀 있어 로비로 들어왔다
    await c.waitForSelector('.mock-yt', { timeout: 10000 });
    await sleep(2500);
    const [pb, pc] = await Promise.all([peek(b), peek(c)]);
    assert(Math.abs(pb.player.t - pc.player.t) < 0.9, `B ${pb.player.t.toFixed(1)} vs C ${pc.player.t.toFixed(1)}`);
  });
});

// ------------------------------------------------------------------
await group('모바일 재생 정책 대응', async () => {
  await rep.check('소리 켜기가 막히는 브라우저(iOS 흉내): 음소거로 계속 재생하고 "소리 켜기" 버튼을 보여 준다', async () => {
    const a = await person('아이폰', { ytMock: { blockUnmute: true } });
    await a.goto(base()); await a.waitForSelector('.home');
    const code = await createInvite(a, { inMs: -3000, dur: 60 });
    await enter(a, base(), code);
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await a.waitForSelector('.sound-btn', { timeout: 8000 });
    let p = await until(async () => { const q = await peek(a); return q.player.state === 1 && q.player.muted ? q : null; }, { timeout: 4000, what: 'muted playback' });
    await a.click('.sound-btn');
    await until(async () => (await a.textContent('.hall-strip')).includes('직접 눌러'), { what: 'tap-the-player hint' });
    p = await peek(a);
    assert(p.player.state === 1 && p.player.muted, 'should fall back to muted playback');
    await a.click('.mock-yt');                                   // 영상 안을 직접 누르면(가짜 플레이어는 이때 소리가 켜진다)
    await until(async () => !(await peek(a)).player.muted && (await a.locator('.sound-btn').count()) === 0, { what: 'unmuted by tapping the player' });
  });

  await rep.check('자동재생이 아예 막히면 "영상을 눌러 주세요" 안내가 뜬다', async () => {
    const a = await person('막힌 폰', { ytMock: { blockAutoplay: true, blockPlay: true } });
    await a.goto(base()); await a.waitForSelector('.home');
    const code = await createInvite(a, { inMs: -3000, dur: 60 });
    await enter(a, base(), code);
    await a.waitForSelector('.mock-yt', { timeout: 10000 });
    await until(async () => (await a.textContent('.hall-strip')).includes('한 번 눌러'), { timeout: 12000, what: 'need-tap hint' });
  });

  await rep.check('상영관에서 영상 오류가 나면 안내 카드와 다시 시도 버튼', async () => {
    const a = await person('오류', { ytMock: { error: 150 } });
    await a.goto(base()); await a.waitForSelector('.home');
    const code = await createInvite(a, { inMs: -3000, dur: 60 });
    await enter(a, base(), code);
    await until(async () => (await a.textContent('.screen')).includes('막아 둔 영상'), { what: 'error card' });
    assert((await a.locator('.screen .btn').count()) === 1, 'no retry button');
  });
});

// ------------------------------------------------------------------
await group('끊김과 복구', async () => {
  const a = await person('호스트 A');
  const b = await person('친구 B');
  await a.goto(base()); await a.waitForSelector('.home');
  const code = await createInvite(a, { inMs: 6000, dur: 90 });
  await enter(a, base(), code); await enter(b, base(), code);
  await toHall(a); await toHall(b);
  await sleep(1700);
  await a.click('.seat >> nth=2');
  await a.evaluate(() => window.__dsy.room.update({ p: 2, pl: 11 }));
  await a.waitForSelector('.mock-yt', { timeout: 20000 });

  await rep.check('새로고침해도 자리·팝콘이 그대로이고, 남의 화면에 내가 둘로 보이지 않는다', async () => {
    await a.reload();
    await a.waitForSelector('.room.hall', { timeout: 15000 });
    await a.waitForSelector('.mock-yt', { timeout: 15000 });
    const s = (await peek(a)).self;
    assert(s.s === 2 && s.p === 2 && s.pl === 11 && s.tk === 1, JSON.stringify(s));
    await sleep(2500);
    const pb = await peek(b);
    assert(pb.peers.length === 1, `B sees ${pb.peers.length} peers`);
    assert(pb.seats[2] === 'taken', 'seat lost after reload');
  });

  await rep.check('중계 서버가 죽어도 영화는 계속 맞게 흐르고, 살아나면 다시 만난다', async () => {
    const port = broker.port;
    await broker.close();
    await until(async () => (await a.getAttribute('.net-pill', 'data-net')) === 'off', { timeout: 20000, what: 'A notices disconnect' });
    await sleep(3000);
    const [pa, pb] = await Promise.all([peek(a), peek(b)]);
    assert(pa.player.state === 1 && pb.player.state === 1, 'playback stopped when relay died');
    assert(Math.abs(pa.player.t - (pa.now - pa.ctl.at) / 1000) < 0.8 && Math.abs(pb.player.t - (pb.now - pb.ctl.at) / 1000) < 0.8, 'drifted while offline');
    broker = await startBroker(port);
    await until(async () => (await a.getAttribute('.net-pill', 'data-net')) === 'on' && (await b.getAttribute('.net-pill', 'data-net')) === 'on', { timeout: 45000, what: 'reconnect' });
    await until(async () => (await peek(a)).peers.length === 1 && (await peek(b)).peers.length === 1, { timeout: 15000, what: 'peers back' });
  });

  await rep.check('같은 기기에서 한 번 더 열면, 먼저 열린 탭이 물러난다', async () => {
    const a2 = await a.context().newPage();
    await a2.goto(`${base()}#/s/${code}`);
    await a2.waitForSelector('.ticket');
    await a2.click('.ticket-actions .btn-xl');
    await a2.waitForSelector('.room.hall, .room.lobby');
    await until(async () => (await a.textContent('#screen')).includes('다른 탭에서 입장했어요'), { timeout: 12000, what: 'old tab steps aside' });
    await sleep(1500);
    assert((await peek(b)).peers.length === 1, 'B sees duplicates of A');
  });
});

// ------------------------------------------------------------------
await group('시계가 틀린 기기', async () => {
  await rep.check('기기 시계가 90초 빨라도 서버 시각에 맞춰 같은 장면을 본다', async () => {
    const a = await person('정상 시계');
    const b = await person('빠른 시계', { clockSkewMs: 90000 });
    await a.goto(base()); await a.waitForSelector('.home');
    const code = await createInvite(a, { inMs: -4000, dur: 120 });
    await enter(a, base(), code); await enter(b, base(), code);
    await a.waitForSelector('.mock-yt', { timeout: 15000 }); await b.waitForSelector('.mock-yt', { timeout: 15000 });
    await sleep(6000);
    const [pa, pb] = await Promise.all([peek(a), peek(b)]);
    const synced = await b.evaluate(() => window.__dsy.room.clock.serverSynced);
    assert(synced, 'server clock sync did not succeed');
    assert(Math.abs(pa.player.t - pb.player.t) < 1.0, `positions differ: ${pa.player.t.toFixed(1)} vs ${pb.player.t.toFixed(1)}`);
    assert(pb.player.t < 40, 'skewed device is playing far ahead: ' + pb.player.t.toFixed(1));
  });
});

// ------------------------------------------------------------------
await group('화면 배치', async () => {
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await rep.check(`${vp.width}x${vp.height}: 가로로 넘치지 않고, 플레이어는 200px 이상, 버튼은 누를 만한 크기`, async () => {
      const a = await person('배치', { viewport: vp, mobile: vp.width < 1000 });
      await a.goto(base()); await a.waitForSelector('.home');
      const overflowHome = await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflowHome <= 0, `home overflows by ${overflowHome}px`);
      const code = await createInvite(a, { inMs: -3000, dur: 120 });
      await enter(a, base(), code);
      await a.waitForSelector('.mock-yt', { timeout: 15000 });
      await sleep(600);
      const r = await a.evaluate(() => {
        const box = document.querySelector('.mock-yt').getBoundingClientRect();
        const vw = innerWidth, vh = innerHeight;
        // 좌석은 최소 24px(WCAG 2.2 최소 기준), 그 밖의 버튼은 34px 이상
        const small = Array.from(document.querySelectorAll('.room button')).filter((b) => { const q = b.getBoundingClientRect(); const min = b.classList.contains('seat') ? 24 : 34; return q.width > 0 && (q.width < min || q.height < min); }).map((b) => `${b.className}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
        const stage = document.querySelector('.hall-stage').getBoundingClientRect();
        const bottom = document.querySelector('.room-bottom').getBoundingClientRect();
        return { w: box.width, h: box.height, inView: box.left >= -1 && box.right <= vw + 1 && box.top >= -1 && box.bottom <= vh + 1, overflow: document.documentElement.scrollWidth - vw, small, stageW: stage.width, bottomInView: bottom.bottom <= vh + 1 };
      });
      assert(r.h >= 200 && r.w >= 200, `player ${Math.round(r.w)}x${Math.round(r.h)}`);
      assert(r.inView, 'player not fully inside the viewport');
      assert(r.overflow <= 0, `hall overflows by ${r.overflow}px`);
      assert(r.bottomInView, 'action bar is cut off');
      assert(r.stageW >= 150, `seats too small: ${Math.round(r.stageW)}px wide`);
      assert(r.small.length === 0, 'tiny buttons: ' + r.small.slice(0, 5).join(', '));
    });
    await cleanup();
  }
});

// ------------------------------------------------------------------
if (errors.length) {
  console.log('\n브라우저 콘솔 오류:');
  for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e);
}
await rep.check('브라우저 콘솔에 오류가 없다', async () => { assert(errors.length === 0, `${errors.length} console errors`); });

const ok = rep.done();
await browser.close();
await site.close();
await broker.close().catch(() => {});
process.exit(ok ? 0 : 1);
