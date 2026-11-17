// 상영관(1관): 자리를 잡고, 불이 꺼지고, 모두 같은 장면을 본다.
//
// 화면(스크린) 자리에는 두 가지가 번갈아 들어간다 — 절대 겹치지 않는다(유튜브 플레이어 위엔 아무것도 덮지 않는다).
//   · 카드: 상영 전 커튼·카운트다운·관람 예절, 상영 후 엔딩 크레딧
//   · 유튜브 플레이어: 상영 중과 쉬는 시간에만
import { h, svg, store, fmtCountdown, fmtTime, prefersReducedMotion } from '../util.js';
import { hallSVG, hallSeatRects, hallAvatarBox, seatSVG, curtainSVG, popcornSVG } from '../art.js';
import { SEAT_ROWS, SEAT_COLS, EMOTES, PHRASES, HALL_PHRASES, POPCORN_FULL, PAUSE_MAX_MS, showPosition, pausePatch, resumePatch } from '../room.js';
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
const OPEN_BEFORE_MS = 2000;       // 상영 이만큼 전에 커튼을 열기 시작한다 (여는 데 1.5초 + 박자 한 번) — 정시에는 다 열려 있게
const MOUNT_LEAD = 1;              // 늦게 거는 플레이어는 이만큼(초) 앞에서 시작한다 (불러오는 동안 흐르는 시간만큼)
const WAKE_BEFORE_MS = 10 * 60000; // 상영 10분 전부터 화면이 꺼지지 않게 한다

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
  let learnedDur = 0;          // 플레이어가 알려 준 실제 길이(초). 플레이어를 내린 뒤에도 기억한다 — 링크에 길이가 없어도 끝을 알도록
  let learnedVid = '';
  let endedRev = -1;           // 엔딩 크레딧을 올린 때의 ctl.rev
  let openTimer = 0;           // 커튼을 열고 정시에 플레이어를 걸려고 기다리는 타이머

  /** 지금 아는 영상 길이(초). 모르거나 라이브면 0 */
  function knownDur() {
    if (learnedVid !== room.ctl.vid) { learnedVid = room.ctl.vid; learnedDur = 0; }
    if (player && player.isReady) {
      // 라이브의 getDuration() 은 길이가 아니라 "방송이 시작된 뒤 흐른 시간"이다
      if (player.isLive()) learnedDur = 0;
      else if (player.duration() > 0) learnedDur = player.duration();
    }
    return learnedDur;
  }

  /** 지금 상영이 어디쯤인지. 크레딧을 올린 뒤에는 영사기사가 뭔가 바꾸기 전까지 끝난 것으로 본다 (끝과 상영 사이를 오가지 않게). */
  function where() {
    const p = showPosition(room.ctl, room.now(), knownDur());
    if (endedRev === room.ctl.rev && p.phase !== 'before') return { phase: 'ended', pos: p.pos, until: 0 };
    return p;
  }

  // 화면이 꺼지지 않게 (지원하는 브라우저에서만). 상영 직전부터 끝날 때까지만 잡는다 —
  // 몇 시간 전부터 기다리는 동안이나 크레딧이 끝난 뒤까지 켜 두면 배터리만 닳는다.
  let wake = null;
  let wakeWanted = false;
  let wakeAsking = false;
  const letGo = (lock) => { try { Promise.resolve(lock.release()).catch(() => {}); } catch { /* 무시 */ } };
  async function setWake(on) {
    wakeWanted = on;
    if (!on) {
      if (wake) { letGo(wake); wake = null; }
      return;
    }
    if (wakeAsking || (wake && !wake.released) || !navigator.wakeLock || document.hidden) return;
    wakeAsking = true;
    try {
      const got = await navigator.wakeLock.request('screen');
      // 기다리는 사이 상영관을 나갔거나 상영이 끝났다면 바로 놓는다
      if (alive && wakeWanted) wake = got; else letGo(got);
    } catch { /* 무시 */ }
    wakeAsking = false;
  }

  function dropPlayer() {
    playerSeq++;
    clearTimeout(openTimer);
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
  /** 상영 직전: 커튼을 미리 열어 두고 정시에 플레이어를 건다. 그래야 영화의 첫 장면부터 보인다. */
  function openCurtain(until) {
    mode = 'opening';
    void preEls.curtain.offsetWidth;          // 방금 그린 커튼도 열리는 모습이 보이게
    preEls.box.classList.add('gone');
    preEls.curtain.classList.add('open');
    sfx.dim();
    drawStrip();
    // 그 사이 상영 시각이 바뀌어 커튼이 다시 닫혔다면 걸지 않는다
    openTimer = later(() => { if (mode === 'opening') mountPlayer(); }, until);
  }

  async function mountPlayer() {
    dropPlayer();
    preEls = null;
    mode = 'show';
    hideCard();
    drawStrip();
    const seq = playerSeq;
    const vid = room.ctl.vid;
    const at = showPosition(room.ctl, room.now());
    // 정시에 걸면 0초부터. 늦게 걸면 조금 앞에서 시작해, 불러온 뒤에 건너뛰지 않고 속도만으로 맞출 수 있게 한다.
    const start = at.phase === 'playing' && at.pos > 1 ? at.pos + MOUNT_LEAD : at.pos;
    try {
      const p = await createPlayer(ytMount, { videoId: vid, start, autoplay: true, muted: true });
      if (seq !== playerSeq || !alive) { p.destroy(); return; }
      player = p;
      p.on('error', (code) => { if (seq === playerSeq) showError(ytErrorText(code)); });
      await p.ready;
      if (seq !== playerSeq || !alive) return;
      sync = createSync({
        player: p,
        target: where,
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
    setWake(false);
    mode = 'error';
    showCard(h('div', { class: 'screen-msg' },
      h('p', { class: 'screen-msg-title' }, '이 필름은 우리 영사기에 걸 수 없대요'),
      h('p', null, text),
      button('다시 시도', { kind: 'soft', small: true, onClick: () => { mode = ''; tick(); } }),
    ));
    drawStrip();
  }

  let lastMeddle = -Infinity;    // 0 으로 두면 페이지를 연 뒤 첫 6초 동안의 안내가 통째로 삼켜진다
  function meddle(kind) {
    const now = performance.now();
    if (now - lastMeddle < 6000) return;
    lastMeddle = now;
    toast(kind === 'seek' ? '영화관에서는 넘겨 볼 수 없어요. 모두 같은 장면을 봐요 🎞️' : '상영 중에는 멈출 수 없어요. 쉬는 시간은 영사기사만 줄 수 있어요.', 3200);
  }

  // --- 상영 후: 엔딩 크레딧 ---
  function enterEnd() {
    dropPlayer();
    setWake(false);
    preEls = null;
    mode = 'end';
    endedRev = room.ctl.rev;
    top.update();                // 위 막대도 곧바로 "상영 종료"로
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
    const p = where();
    if (mode === 'pre') {
      nodes.push(h('span', { class: 'strip-text' }, room.self.s >= 0 ? '자리에서 기다리는 중이에요. 팝콘은 미리 사 두셨나요?' : (room.peers.size ? '빈자리를 눌러 앉아 보세요.' : '오늘은 전세 냈네요. 아무 데나 앉으세요.')));
    } else if (mode === 'opening') {
      nodes.push(h('span', { class: 'strip-text' }, '조명이 꺼집니다. 곧 영화가 시작됩니다.'));
    } else if (mode === 'show') {
      if (p.phase === 'paused') {
        nodes.push(h('span', { class: 'strip-text' },
          `☕ 잠시 쉬어 갑니다. 영사기사가 필름을 갈고 있어요. 길어도 ${Math.round(PAUSE_MAX_MS / 60000)}분 안에 이어져요. `,
          h('span', { class: 'strip-text dim' }, `남은 시간 ${fmtCountdown(p.resumeIn || 0)}`)));
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
      // 꾸벅 인사는 몸짓으로. 움직임을 줄인 기기에서는 몸짓이 보이지 않으니 이모지 말풍선으로 대신한다.
      if (d.e === 0 && !prefersReducedMotion()) { el.classList.remove('nod'); void el.offsetWidth; el.classList.add('nod'); }
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
    const built = where().phase;         // 이 버튼들이 만들어진 때의 상황
    let used = false;                    // 시트 하나로는 한 번만 바꾼다 (닫히는 사이의 연타 방지)
    const act = (label, patch, done) => button(label, {
      kind: 'soft', cls: 'btn-block',
      onClick: async () => {
        if (used) return;
        used = true;
        close();
        // 시트를 열어 둔 사이 상황이 바뀌었다면(쉬는 시간이 저절로 끝남 등) 옛 버튼대로 바꾸지 않는다
        if (where().phase !== built) { toast('그 사이 상황이 바뀌었어요. 영사실을 다시 열어 주세요.', 3200); return; }
        if (await room.setCtl(patch())) toast(done); else toast('바꾸지 못했어요. 다시 시도해 주세요.');
      },
    });
    const items = [];
    if (built === 'before') {
      items.push(act('지금 바로 시작 (10초 뒤)', () => ({ at: room.now() + 10000, pause: null }), '10초 뒤에 상영을 시작해요.'));
      items.push(act('5분 미루기', () => ({ at: room.ctl.at + 5 * 60000 }), '상영을 5분 미뤘어요.'));
    } else if (built === 'playing') {
      items.push(act('쉬는 시간 주기 (모두 일시정지, 최대 10분)', () => pausePatch(room.ctl, room.now(), knownDur()), '쉬는 시간이에요. 10분 안에 [다시 상영]을 누르지 않으면 저절로 이어져요.'));
      items.push(act('처음부터 다시 상영 (10초 뒤)', () => ({ at: room.now() + 10000, pause: null }), '10초 뒤에 처음부터 다시 상영해요.'));
    } else if (built === 'paused') {
      items.push(act('다시 상영', () => resumePatch(room.ctl, room.now()), '상영을 이어 갑니다.'));
    } else {
      items.push(act('한 번 더 상영 (10초 뒤)', () => ({ at: room.now() + 10000, pause: null }), '10초 뒤에 다시 상영해요.'));
    }
    const close = sheet({
      title: '영사실',
      content: [h('p', { class: 'sheet-text' }, '영사기사만 들어올 수 있는 곳이에요. 여기서 바꾸면 모든 관객의 화면이 함께 바뀌어요.'), ...items],
      onClose: () => { if (booth && booth.close === close) booth = null; },
    });
    booth = { close, phase: built, rev: room.ctl.rev };
  }
  /** @type {{ close: () => void, phase: string, rev: number } | null} 열려 있는 영사실 시트와, 그 버튼들이 만들어진 때의 상황 */
  let booth = null;
  /** 영사실을 열어 둔 사이 상황이 바뀌면(상영 시작·종료, 쉬는 시간이 저절로 끝남, 일정 변경) 버튼을 지금에 맞게 다시 만든다 */
  function refreshBooth(phase) {
    if (!booth || (booth.phase === phase && booth.rev === room.ctl.rev)) return;
    booth.close();
    openBooth();
  }

  // ---------- 조립 ----------
  const top = topBar(app, {
    backLabel: '로비로 나가기',
    onBack: () => { room.update({ sc: 'lobby', s: -1, sa: 0 }); app.scene('lobby'); },
    extra: room.isHost ? h('button', { type: 'button', class: 'booth-btn', onclick: () => { sfx.tap(); openBooth(); } }, '🎬 영사실') : null,
    // 크레딧을 올린 뒤에는 위 막대도 "상영 종료"로 (길이를 끝내 모르는 라이브도)
    knownDur: () => (endedRev === room.ctl.rev ? 0.001 : knownDur()),
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
    const p = where();
    top.update();
    refreshBooth(p.phase);
    if (mode === '' && room.settleMs() > 0) {
      // 막 들어왔다: 영사기사가 상영 시각을 바꿨을 수도 있으니 소식을 잠깐 기다린 뒤에 스크린을 정한다
      if (card.childElementCount === 0) showCard(h('div', { class: 'screen-msg' }, h('div', { class: 'spinner' }), h('p', null, '상영 정보를 확인하는 중…')));
      return;
    }
    if (p.phase === 'before') {
      // 상영 직전에 연 커튼과 정시에 건 플레이어는 그대로 둔다 (방 시계가 살짝 되감겨도 다시 닫지 않는다).
      // 그 밖에 '시작 전'으로 돌아왔다면(영사기사가 미룸·다시 상영) 커튼을 닫고 다시 기다린다.
      const soon = p.until <= OPEN_BEFORE_MS;
      if (mode !== 'pre' && !(soon && (mode === 'opening' || mode === 'show'))) enterPre();
      if (mode === 'pre') {
        updatePre(p.until);
        if (soon) openCurtain(p.until);
      }
      el.dataset.lights = mode !== 'pre' ? 'off' : p.until <= 10000 ? 'dim' : 'on';
    } else if (p.phase === 'ended') {
      if (mode !== 'end') enterEnd();
      el.dataset.lights = 'on';
    } else {
      // 커튼을 여는 중이면 곧 타이머가 건다. 그 밖에는(늦게 들어옴, 박자를 놓침) 바로 건다.
      if (mode === 'pre' || mode === '' || mode === 'end' || (mode === 'opening' && p.pos > 1)) mountPlayer();
      el.dataset.lights = p.phase === 'paused' ? 'dim' : 'off';
      if (p.phase === 'paused' || wasPaused) drawStrip();      // 쉬는 시간 남은 시간 표시를 갱신
      wasPaused = p.phase === 'paused';
    }
    // 화면은 상영 직전부터 끝날 때까지만 켜 둔다
    setWake(mode === 'opening' || mode === 'show' || (mode === 'pre' && p.until <= WAKE_BEFORE_MS));
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
    room.on('resume', tick),       // 화면 켜 두기도 여기서 다시 잡힌다 (가려지면 브라우저가 풀어 버린다)
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
    setWake(false);
  };
}
