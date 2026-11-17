// 상영관(1관): 자리를 잡고, 불이 꺼지고, 모두 같은 장면을 본다.
//
// 화면(스크린) 자리에는 두 가지가 번갈아 들어간다 — 절대 겹치지 않는다(유튜브 플레이어 위엔 아무것도 덮지 않는다).
//   · 카드: 상영 전 커튼·카운트다운·관람 예절, 상영 후 엔딩 크레딧
//   · 유튜브 플레이어: 상영 중과 쉬는 시간에만
import { h, svg, store, fmtCountdown, fmtTime } from '../util.js';
import { hallSVG, hallSeatRects, hallAvatarBox, seatSVG, curtainSVG, popcornSVG } from '../art.js';
import { SEAT_ROWS, SEAT_COLS, EMOTES, PHRASES, HALL_PHRASES, POPCORN_FULL, showPosition, pausePatch, resumePatch } from '../room.js';
import { createPlayer, ytErrorText } from '../yt.js';
import { createSync } from '../sync.js';
import { saveStub } from '../data.js';
import { avatarNode, bubble, sheet, toast, button } from '../ui.js';
import { sfx } from '../sfx.js';
import { topBar, actionBar } from './roomui.js';
import { stubCard, shareStub, seatLabel, POPCORN_KEYS } from './stub.js';

const HALL_W = 390;
const cq = (v) => `${(v / HALL_W * 100).toFixed(3)}cqw`;
const ETIQUETTE = [
  '휴대폰은… 지금 보고 계신 그거라 끌 수가 없네요. 알림만 꺼 주세요.',
  '앞좌석을 발로 차지 마세요. 어차피 닿지 않습니다.',
  '촬영은 금지입니다. 스크린샷은 못 본 걸로 할게요.',
  '다른 탭에 다녀오셔도 영화는 기다려 주지 않습니다.',
  '스포일러는 속삭임으로도 안 됩니다.',
  '비상구는 뒤로 가기 버튼입니다.',
];
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function mount(root, app) {
  const room = app.room;
  const offs = [];
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  let alive = true;

  if (room.self.sc !== 'hall') room.update({ sc: 'hall', s: -1, sa: 0 });

  // ---------- 스크린 ----------
  const ytMount = h('div', { class: 'yt-mount' });
  const card = h('div', { class: 'screen-card' });
  const screen = h('div', { class: 'screen' }, ytMount, card);
  const strip = h('div', { class: 'hall-strip' });

  /** @type {''|'pre'|'opening'|'show'|'end'|'error'} */
  let mode = '';
  /** @type {import('../yt.js').Player | null} */
  let player = null;
  /** @type {ReturnType<typeof createSync> | null} */
  let sync = null;
  let playerSeq = 0;
  let syncStatus = null;
  let watched = !!store.get('watched.' + room.scr.room);
  let chimed = false;

  function dropPlayer() {
    playerSeq++;
    if (sync) { sync.stop(); sync = null; }
    if (player) { player.destroy(); player = null; }
    syncStatus = null;
    ytMount.replaceChildren();
  }

  function showCard(...nodes) {
    card.replaceChildren(...nodes);
    card.hidden = false;
    ytMount.hidden = true;
  }
  function hideCard() {
    card.replaceChildren();
    card.hidden = true;
    ytMount.hidden = false;
  }

  // --- 상영 전: 커튼 + 카운트다운 + 관람 예절 ---
  let preEls = null;
  function enterPre() {
    dropPlayer();
    mode = 'pre';
    const count = h('div', { class: 'pre-count' });
    const label = h('div', { class: 'pre-label' }, '상영 시작까지');
    const tip = h('p', { class: 'pre-tip' });
    const curtain = h('div', { class: 'curtain' }, svg(curtainSVG()));
    const box = h('div', { class: 'pre-box' }, label, count, tip);
    preEls = { count, label, tip, curtain, box, slide: -1 };
    showCard(h('div', { class: 'pre' }, curtain, box));
    drawStrip();
  }

  function updatePre(until) {
    if (!preEls) return;
    const secs = Math.ceil(until / 1000);
    if (secs <= 10) {
      preEls.label.textContent = '조명이 꺼집니다';
      preEls.count.textContent = String(Math.max(1, secs));
      preEls.count.classList.add('big');
      preEls.tip.textContent = '곧 영화가 시작됩니다.';
    } else {
      preEls.label.textContent = until > 3600000 ? `${fmtTime(room.ctl.at)} 상영` : '상영 시작까지';
      preEls.count.textContent = fmtCountdown(until);
      preEls.count.classList.remove('big');
      const slide = Math.floor(Date.now() / 6000) % ETIQUETTE.length;
      if (slide !== preEls.slide) { preEls.slide = slide; preEls.tip.textContent = ETIQUETTE[slide]; }
    }
    if (secs <= 60 && secs > 50 && !chimed) { chimed = true; sfx.chime(); toast('1분 뒤 상영이 시작돼요. 자리에 앉아 주세요.', 3500); }
  }

  // --- 상영 ---
  function enterShow(fromPre) {
    if (fromPre && preEls) {
      // 커튼이 열리는 동안에는 플레이어가 아직 없다. 다 열린 뒤에 플레이어를 건다.
      mode = 'opening';
      preEls.box.classList.add('gone');
      preEls.curtain.classList.add('open');
      sfx.dim();
      drawStrip();
      later(mountPlayer, 1500);
    } else {
      mountPlayer();
    }
  }

  async function mountPlayer() {
    dropPlayer();
    preEls = null;
    mode = 'show';
    hideCard();
    drawStrip();
    const seq = playerSeq;
    const vid = room.ctl.vid;
    const pos = showPosition(room.ctl, room.now()).pos;
    try {
      const p = await createPlayer(ytMount, { videoId: vid, start: pos, autoplay: true, muted: true });
      if (seq !== playerSeq || !alive) { p.destroy(); return; }
      player = p;
      p.on('error', (code) => { if (seq === playerSeq) showError(ytErrorText(code)); });
      await p.ready;
      if (seq !== playerSeq || !alive) return;
      sync = createSync({
        player: p,
        target: (dur) => showPosition(room.ctl, room.now(), dur),
        autoUnmute: !isIOS,
        onStatus: (s) => {
          syncStatus = s;
          if (s.playing && !watched) { watched = true; store.set('watched.' + room.scr.room, 1); }
          drawStrip();
        },
        onEnded: () => { if (mode === 'show') enterEnd(); },
        onUserMeddle: meddle,
      });
    } catch (e) {
      if (seq !== playerSeq || !alive) return;
      showError(e && e.code ? ytErrorText(e.code) : '유튜브에 연결하지 못했어요. 네트워크를 확인해 주세요.');
    }
  }

  function showError(text) {
    dropPlayer();
    mode = 'error';
    showCard(h('div', { class: 'screen-msg' },
      h('p', { class: 'screen-msg-title' }, '이 필름은 우리 영사기에 걸 수 없대요'),
      h('p', null, text),
      button('다시 시도', { kind: 'soft', small: true, onClick: () => { mode = ''; tick(); } }),
    ));
    drawStrip();
  }

  let lastMeddle = 0;
  function meddle(kind) {
    const now = performance.now();
    if (now - lastMeddle < 6000) return;
    lastMeddle = now;
    toast(kind === 'seek' ? '영화관에서는 넘겨 볼 수 없어요. 모두 같은 장면을 봐요 🎞️' : '상영 중에는 멈출 수 없어요. 쉬는 시간은 영사기사만 줄 수 있어요.', 3200);
  }

  // --- 상영 후: 엔딩 크레딧 ---
  function enterEnd() {
    dropPlayer();
    preEls = null;
    mode = 'end';
    const people = Array.from(room.seenInHall.entries());
    const eaten = new Map(room.everyone().map((p) => [p.id, p.st.pe]));
    const lines = [
      h('p', { class: 'credits-h' }, '함께 본 사람들'),
      ...people.map(([id, name]) => h('p', { class: 'credits-name' }, name, eaten.get(id) ? h('small', null, ` · 팝콘 ${eaten.get(id)}알`) : null)),
      room.scr.host ? h('p', { class: 'credits-h' }, '오늘의 영사기사') : null,
      room.scr.host ? h('p', { class: 'credits-name' }, room.scr.host) : null,
      h('p', { class: 'credits-h' }, '상영관'),
      h('p', { class: 'credits-name' }, '동시상영 1관'),
      h('p', { class: 'credits-bye' }, '와 주셔서 고맙습니다.', h('br'), '조심히 들어가세요.'),
    ];
    showCard(h('div', { class: 'end' },
      h('div', { class: 'end-title' }, '끝'),
      h('div', { class: 'credits' }, h('div', { class: 'credits-roll', style: { '--n': String(lines.length) } }, lines)),
    ));
    drawStrip();
  }

  function openSouvenir() {
    const names = Array.from(room.seenInHall.entries()).filter(([id]) => id !== room.selfId).map(([, n]) => n);
    const stub = {
      room: room.scr.room, title: room.ctl.title, vid: room.ctl.vid, at: room.ctl.at,
      seat: seatLabel(room.self.s), with: names, pop: room.self.p, pe: room.self.pe, name: room.self.n,
    };
    saveStub(stub);
    sfx.stamp();
    const close = sheet({
      title: '기념 티켓이 나왔어요',
      content: [
        h('div', { class: 'stub-wrap stamped' }, stubCard(stub)),
        h('p', { class: 'sheet-text' }, '티켓북에 넣어 뒀어요.'),
        h('div', { class: 'row gap' },
          button('이미지로 저장 · 공유', { kind: 'soft', cls: 'grow', onClick: async () => { if (!(await shareStub(stub))) toast('이미지를 만들지 못했어요.'); } }),
          button('닫기', { kind: 'primary', cls: 'grow', onClick: () => close() }),
        ),
      ],
    });
  }

  // --- 스크린 아래 한 줄 (소리 켜기, 안내) ---
  function drawStrip() {
    const nodes = [];
    const s = syncStatus;
    const p = showPosition(room.ctl, room.now(), player && player.isReady ? player.duration() : 0);
    if (mode === 'pre') {
      nodes.push(h('span', { class: 'strip-text' }, room.self.s >= 0 ? '자리에서 기다리는 중이에요. 팝콘은 미리 사 두셨나요?' : (room.peers.size ? '빈자리를 눌러 앉아 보세요.' : '오늘은 전세 냈네요. 아무 데나 앉으세요.')));
    } else if (mode === 'opening') {
      nodes.push(h('span', { class: 'strip-text' }, '조명이 꺼집니다. 곧 영화가 시작됩니다.'));
    } else if (mode === 'show') {
      if (p.phase === 'paused') {
        nodes.push(h('span', { class: 'strip-text' }, `☕ 잠시 쉬어 갑니다. 영사기사가 필름을 갈고 있어요. (길어도 ${fmtCountdown(p.resumeIn || 0)} 뒤엔 이어져요)`));
      } else if (!s) {
        nodes.push(h('span', { class: 'strip-text' }, '필름을 거는 중…'));
      } else if (s.needTap) {
        nodes.push(h('span', { class: 'strip-text warn' }, '▶ 영상 화면을 한 번 눌러 재생해 주세요.'));
      } else if (s.playing && s.muted) {
        if (s.unmuteBlocked) nodes.push(h('span', { class: 'strip-text warn' }, '영상 화면 안의 음소거 해제(🔇)를 직접 눌러 주세요.'));
        else nodes.push(h('button', { type: 'button', class: 'btn btn-primary btn-sm sound-btn', onclick: () => { if (sync) sync.unmute(); } }, '🔊 소리 켜기'));
        nodes.push(h('span', { class: 'strip-text' }, '지금은 소리 없이 상영 중이에요.'));
      } else if (s.live) {
        nodes.push(h('span', { class: 'strip-live' }, 'LIVE'), h('span', { class: 'strip-text' }, '모두 실시간으로 같이 보고 있어요.'));
      } else if (!s.playing) {
        nodes.push(h('span', { class: 'strip-text' }, '장면을 맞추는 중…'));
      } else if (s.catching) {
        nodes.push(h('span', { class: 'strip-text' }, '장면을 따라잡는 중… 광고가 나오면 끝난 뒤에 맞춰져요.'));
      } else {
        nodes.push(h('span', { class: 'strip-text dim' }, room.peers.size ? '모두 같은 장면을 보고 있어요.' : '혼자서도 영화는 제시간에 흘러가요.'));
      }
    } else if (mode === 'end') {
      nodes.push(button('👏 박수', { kind: 'soft', small: true, onClick: () => { room.act('em', { e: 4 }); } }));
      if (watched) nodes.push(button('🎟️ 기념 티켓 받기', { kind: 'primary', small: true, onClick: openSouvenir }));
      else nodes.push(h('span', { class: 'strip-text' }, '상영이 끝난 뒤에 들어왔어요. 기념 티켓은 영화를 본 관객에게 드려요.'));
    }
    strip.replaceChildren(...nodes);
  }

  // ---------- 객석 ----------
  const stage = h('div', { class: 'stage hall-stage' });
  stage.appendChild(svg(hallSVG({ rows: SEAT_ROWS, cols: SEAT_COLS })));
  const rects = hallSeatRects({ rows: SEAT_ROWS, cols: SEAT_COLS });
  const seatSvgs = { empty: seatSVG({ state: 'empty' }), mine: seatSVG({ state: 'mine' }), taken: seatSVG({ state: 'taken' }) };
  /** @type {{ el: HTMLElement, av: HTMLElement, front: HTMLElement, tag: HTMLElement, key: string, owner: string|null }[]} */
  const seats = rects.map((r, i) => {
    const box = hallAvatarBox(r);       // 앉은 사람(뒷모습)이 그려질 자리: 머리와 어깨만 등받이 위로 나온다
    const av = h('span', { class: 'seat-av', style: { left: cq(box.x - r.x), top: cq(box.y - r.y), width: cq(box.w), height: cq(box.h) } });
    const front = h('span', { class: 'seat-front' });
    const tag = h('span', { class: 'seat-tag' });
    const el = h('button', {
      type: 'button', class: 'seat', 'aria-label': `${seatLabel(i)} 빈자리`,
      style: { left: cq(r.x), top: cq(r.y), width: cq(r.w), height: cq(r.h), zIndex: String(10 + r.row) },
      onclick: () => tapSeat(i),
    }, av, front, tag);
    stage.appendChild(el);
    return { el, av, front, tag, key: null, owner: null };
  });
  const standing = h('div', { class: 'standing' });
  stage.appendChild(standing);
  /** @type {Map<string, HTMLElement>} id → 서 있는 사람의 요소 */
  const standEls = new Map();

  function tapSeat(i) {
    sfx.unlock();
    const owner = room.seatOwner(i);
    if (owner && owner.id !== room.selfId) {
      sfx.nope();
      bubble(seats[i].el, `${owner.st.n} 님 자리`, { kind: 'say', ms: 1800 });
      return;
    }
    if (owner && owner.id === room.selfId) return;
    // 막 들어왔다면 누가 어디 앉았는지 소식이 올 때까지 잠깐 기다렸다가 앉는다
    const wait = room.settleMs();
    if (wait > 0) {
      clearTimeout(sitTimer);
      sitTimer = later(() => tapSeat(i), wait + 30);
      return;
    }
    if (room.sit(i)) sfx.sit();
  }
  let sitTimer = 0;

  function drawSeats() {
    seats.forEach((seat, i) => {
      const owner = room.seatOwner(i);
      const state = !owner ? 'empty' : owner.id === room.selfId ? 'mine' : 'taken';
      const key = owner ? `${owner.id}|${owner.st.a.join(',')}|${owner.st.n}|${owner.st.aw}|${owner.st.p >= 0}` : '';
      if (key === seat.key) return;
      const wasOwner = seat.owner;
      seat.key = key;
      seat.owner = owner ? owner.id : null;
      seat.el.dataset.state = state;
      seat.el.classList.toggle('away', !!(owner && owner.st.aw));
      seat.el.setAttribute('aria-label', owner ? `${seatLabel(i)} · ${owner.id === room.selfId ? '내 자리' : owner.st.n}` : `${seatLabel(i)} 빈자리`);
      seat.front.replaceChildren(svg(seatSvgs[state]));
      if (owner) {
        seat.av.replaceChildren(avatarNode(owner.st.a, { view: 'back', holding: owner.st.p >= 0 ? 'popcorn' : null }));
        seat.tag.textContent = owner.id === room.selfId ? '나' : owner.st.n;
        if (wasOwner !== owner.id) { seat.av.classList.remove('sit-in'); void seat.av.offsetWidth; seat.av.classList.add('sit-in'); }
      } else {
        seat.av.replaceChildren();
        seat.tag.textContent = '';
      }
    });
    // 아직 앉지 않은 사람들은 맨 뒤에 서 있다
    const standers = room.everyone().filter((p) => p.st.sc === 'hall' && !(p.st.s >= 0 && room.seatOwner(p.st.s) && room.seatOwner(p.st.s).id === p.id));
    const ids = new Set(standers.map((p) => p.id));
    for (const [id, el] of standEls) if (!ids.has(id)) { el.remove(); standEls.delete(id); }
    for (const p of standers) {
      let el = standEls.get(p.id);
      const key = `${p.st.a.join(',')}|${p.st.n}|${p.st.aw}`;
      if (!el) {
        el = h('div', { class: 'stander' + (p.isSelf ? ' me' : '') }, h('span', { class: 'stander-av' }), h('span', { class: 'seat-tag' }));
        standEls.set(p.id, el);
        standing.appendChild(el);
      }
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.firstChild.replaceChildren(avatarNode(p.st.a, { view: 'back' }));
        el.lastChild.textContent = p.isSelf ? '나' : p.st.n;
        el.classList.toggle('away', !!p.st.aw);
      }
    }
    standing.classList.toggle('has', standers.length > 0);
  }

  /** 그 사람이 지금 그려져 있는 요소 (앉은 자리 또는 서 있는 곳) */
  function elOf(id) {
    const seat = seats.find((s) => s.owner === id);
    return seat ? seat.el : standEls.get(id) || null;
  }

  function onAct(id, type, d) {
    const el = elOf(id);
    if (!el) return;
    if (type === 'em') {
      if (d.e === 0) { el.classList.remove('nod'); void el.offsetWidth; el.classList.add('nod'); }
      else bubble(el, EMOTES[d.e]);
      if (id === room.selfId || mode !== 'show') (d.e === 4 ? sfx.clap : sfx.pop)();
    } else if (type === 'sy') {
      bubble(el, PHRASES[d.i], { kind: 'say', ms: 3000 });
    } else if (type === 'ea') {
      el.classList.remove('munch'); void el.offsetWidth; el.classList.add('munch');
      if (id === room.selfId) sfx.crunch();
    }
  }

  // ---------- 팝콘 ----------
  const popBtn = h('button', { type: 'button', class: 'pop-btn', onclick: eat });
  function drawPop() {
    const st = room.self;
    if (st.p < 0) {
      popBtn.replaceChildren(h('span', { class: 'pop-pic none' }, svg(popcornSVG({ kind: 'butter', level: 0 }))), h('span', { class: 'pop-count' }, '없음'));
      popBtn.setAttribute('aria-label', '팝콘 없음');
    } else {
      popBtn.replaceChildren(h('span', { class: 'pop-pic' }, svg(popcornSVG({ kind: POPCORN_KEYS[st.p], level: st.pl / POPCORN_FULL }))), h('span', { class: 'pop-count' }, `${st.pl}알`));
      popBtn.setAttribute('aria-label', `팝콘 한 알 먹기, ${st.pl}알 남음`);
    }
  }
  function eat() {
    sfx.unlock();
    if (room.self.p < 0) { toast('팝콘이 없어요. 매점은 로비에 있어요.'); sfx.nope(); return; }
    if (!room.eat()) { toast('팝콘이 바닥났어요. 매점은 로비에 있어요.'); sfx.nope(); return; }
    popBtn.classList.remove('bump'); void popBtn.offsetWidth; popBtn.classList.add('bump');
  }

  // ---------- 영사실 (호스트만) ----------
  function openBooth() {
    if (!room.net.connected) {
      // 연결이 끊긴 채 바꾸면 나중에 다시 연결될 때 엉뚱한 시점에 모두의 화면이 바뀐다
      toast('지금은 다른 관객과 연결이 끊겨 있어요. 연결된 뒤에 바꿀 수 있어요.', 3200);
      return;
    }
    const knownDur = () => (player && player.isReady ? player.duration() : 0);
    const p = showPosition(room.ctl, room.now(), knownDur());
    const act = (label, patch, done) => button(label, {
      kind: 'soft', cls: 'btn-block',
      onClick: async () => { close(); if (await room.setCtl(patch())) toast(done); else toast('바꾸지 못했어요. 다시 시도해 주세요.'); },
    });
    const items = [];
    if (p.phase === 'before') {
      items.push(act('지금 바로 시작 (10초 뒤)', () => ({ at: room.now() + 10000, pause: null }), '10초 뒤에 상영을 시작해요.'));
      items.push(act('5분 미루기', () => ({ at: room.ctl.at + 5 * 60000 }), '상영을 5분 미뤘어요.'));
    } else if (p.phase === 'playing') {
      items.push(act('쉬는 시간 주기 (모두 일시정지, 최대 10분)', () => pausePatch(room.ctl, room.now(), knownDur()), '쉬는 시간이에요. 10분 안에 [다시 상영]을 누르지 않으면 저절로 이어져요.'));
      items.push(act('처음부터 다시 상영 (10초 뒤)', () => ({ at: room.now() + 10000, pause: null }), '10초 뒤에 처음부터 다시 상영해요.'));
    } else if (p.phase === 'paused') {
      items.push(act('다시 상영', () => resumePatch(room.ctl, room.now()), '상영을 이어 갑니다.'));
    } else {
      items.push(act('한 번 더 상영 (10초 뒤)', () => ({ at: room.now() + 10000, pause: null }), '10초 뒤에 다시 상영해요.'));
    }
    const close = sheet({
      title: '영사실',
      content: [h('p', { class: 'sheet-text' }, '영사기사만 들어올 수 있는 곳이에요. 여기서 바꾸면 모든 관객의 화면이 함께 바뀌어요.'), ...items],
    });
  }

  // ---------- 조립 ----------
  const top = topBar(app, {
    backLabel: '로비로 나가기',
    onBack: () => { room.update({ sc: 'lobby', s: -1, sa: 0 }); app.scene('lobby'); },
    extra: room.isHost ? h('button', { type: 'button', class: 'booth-btn', onclick: () => { sfx.tap(); openBooth(); } }, '🎬 영사실') : null,
    knownDur: () => (player && player.isReady ? player.duration() : 0),
  });
  const el = h('div', { class: 'room hall', dataset: { lights: 'on' } },
    top.el,
    h('div', { class: 'screen-wrap' }, screen),
    strip,
    h('div', { class: 'stage-wrap' }, stage),
    actionBar({ phrases: HALL_PHRASES, onEmote: (i) => room.act('em', { e: i }), onPhrase: (i) => room.act('sy', { i }), left: popBtn }),
  );
  root.appendChild(el);

  // ---------- 흐름 ----------
  function tick() {
    if (!alive) return;
    const dur = player && player.isReady ? player.duration() : 0;
    const p = showPosition(room.ctl, room.now(), dur);
    top.update();
    if (mode === '' && room.settleMs() > 0) {
      // 막 들어왔다: 영사기사가 상영 시각을 바꿨을 수도 있으니 소식을 잠깐 기다린 뒤에 스크린을 정한다
      if (card.childElementCount === 0) showCard(h('div', { class: 'screen-msg' }, h('div', { class: 'spinner' }), h('p', null, '상영 정보를 확인하는 중…')));
      return;
    }
    if (p.phase === 'before') {
      if (mode !== 'pre') enterPre();
      updatePre(p.until);
      el.dataset.lights = p.until <= 10000 ? 'dim' : 'on';
    } else if (p.phase === 'ended') {
      if (mode !== 'end') enterEnd();
      el.dataset.lights = 'on';
    } else {
      if (mode === 'pre') enterShow(true);
      else if (mode === '' || mode === 'end') enterShow(false);
      el.dataset.lights = p.phase === 'paused' ? 'dim' : 'off';
      if (p.phase === 'paused' || wasPaused) drawStrip();      // 쉬는 시간 남은 시간 표시를 갱신
      wasPaused = p.phase === 'paused';
    }
  }

  let wasPaused = false;
  let prevCtl = room.ctl;
  offs.push(
    room.on('self', () => { drawSeats(); drawPop(); drawStrip(); }),
    room.on('peer:join', () => { drawSeats(); top.update(); drawStrip(); }),
    room.on('peer:update', drawSeats),
    room.on('peer:leave', () => { drawSeats(); top.update(); }),
    room.on('seat:lost', () => { sfx.nope(); toast('앗, 방금 다른 분이 앉았어요. 다른 자리를 골라 주세요.'); }),
    room.on('act', onAct),
    room.on('net', () => top.update()),
    room.on('resume', () => { acquireWake(); tick(); }),
    room.on('ctl', (ctl) => {
      if (!room.isHost) {
        if (ctl.pause != null && prevCtl.pause == null) toast('쉬는 시간이에요 ☕');
        else if (ctl.pause == null && prevCtl.pause != null) toast('상영을 이어 갑니다.');
        else if (ctl.at !== prevCtl.at) toast(`영사기사가 상영 시각을 바꿨어요 → ${fmtTime(ctl.at)}`, 3500);
      }
      prevCtl = ctl;
      chimed = false;
      if (mode === 'error') mode = '';
      tick();
      drawStrip();
    }),
  );

  // 화면이 꺼지지 않게 (지원하는 브라우저에서만)
  let wake = null;
  async function acquireWake() {
    try { if (navigator.wakeLock && !document.hidden) wake = await navigator.wakeLock.request('screen'); } catch { /* 무시 */ }
  }
  acquireWake();

  drawSeats();
  drawPop();
  tick();
  const interval = setInterval(tick, 500);

  return () => {
    alive = false;
    clearInterval(interval);
    timers.forEach(clearTimeout);
    offs.forEach((off) => off());
    dropPlayer();
    try { wake && wake.release(); } catch { /* 무시 */ }
  };
}
