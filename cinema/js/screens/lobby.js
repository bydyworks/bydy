// 로비: 걸어 다니고, 매점에서 팝콘을 사고, 검표를 받고 1관으로 들어간다.
import { h, svg, clamp } from '../util.js';
import { lobbySVG, npcSVG, popcornSVG, LOBBY_ANCHORS } from '../art.js';
import { LOBBY, EMOTES, PHRASES, LOBBY_PHRASES, POPCORN_FULL, showPosition } from '../room.js';
import { thumbUrl } from '../link.js';
import { avatarNode, bubble, sheet, toast } from '../ui.js';
import { sfx } from '../sfx.js';
import { topBar, actionBar, askLeave } from './roomui.js';
import { POPCORN_NAMES, POPCORN_KEYS, DRINK_NAMES } from './stub.js';

const W = LOBBY.w, H = LOBBY.h;
const WALK_SPEED = 150;                       // 1초에 걷는 거리 (무대 좌표)
// 무대 위 고정 지점 (그림의 배치는 art.js 의 LOBBY_ANCHORS 가 알려 준다)
const AN = LOBBY_ANCHORS;
export const SPOT = {
  snack: { x: AN.concessionTap.x, y: 240 },   // 매점 앞
  poster: { x: 195, y: 242 },                 // 포스터 앞
  gate: { x: 300, y: 242 },                   // 1관 문 앞 (검표원 옆)
  clerk: AN.clerkFeet,                        // 매점 직원 (계산대 뒤)
  usher: AN.usherFeet,                        // 검표원
  fromHall: { x: 296, y: 262 },               // 상영관에서 나왔을 때
};
// 소파와 화분은 밟고 지나갈 수 없다: 그 안을 누르면 가장 가까운 바깥으로 밀어낸다
const SOLID = [
  { x0: AN.bench.x - 6, x1: AN.bench.x + AN.bench.w + 8, y0: AN.bench.y + 26, y1: 600 },
  { x0: AN.plant.x - 6, x1: 400, y0: AN.plant.y + 70, y1: 600 },
];
function walkable(x, y) {
  x = clamp(x, LOBBY.minX, LOBBY.maxX); y = clamp(y, LOBBY.minY, LOBBY.maxY);
  for (const r of SOLID) {
    if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) {
      const up = y - r.y0, side = r.x0 < 100 ? r.x1 - x : x - r.x0;
      if (up <= side) y = r.y0; else x = r.x0 < 100 ? r.x1 : r.x0;
    }
  }
  return { x, y };
}
const cq = (v) => `${(v / W * 100).toFixed(3)}cqw`;

const MENU_POP = ['인사 한 번', '꾸벅 두 번', '고민 3초'];
const MENU_DRINK = ['트림 참기', '0원', '얼음 와그작'];
const CLERK_LINES = ['어서 오세요. 뭘로 드릴까요?', '방금 튀겼어요. 따뜻할 때 드세요.', '모자라면 또 오세요. 리필은 무한이에요.'];

export function mount(root, app) {
  const room = app.room;
  const offs = [];
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let alive = true;

  if (room.self.sc !== 'lobby') room.update({ sc: 'lobby', s: -1, sa: 0, x: SPOT.fromHall.x, y: SPOT.fromHall.y });

  // ---------- 무대 ----------
  const stage = h('div', { class: 'stage lobby-stage' });
  // 뒤 배경 → 매점 직원 → 계산대(앞 레이어) → 사람들 순서로 겹친다
  stage.appendChild(svg(lobbySVG({ layer: 'back' })));
  const front = svg(lobbySVG({ layer: 'front' }));
  front.classList.add('lobby-front');
  front.style.zIndex = String(AN.counter.y + AN.counter.h);
  stage.appendChild(front);
  stage.appendChild(h('img', {
    class: 'poster-thumb', src: thumbUrl(room.ctl.vid, 'mqdefault'), alt: '', referrerpolicy: 'no-referrer',
    style: { left: cq(147), top: cq(70), width: cq(96), height: cq(54) },
  }));

  const npc = (kind, spot, label) => {
    const el = h('div', { class: 'av npc', style: { transform: `translate(${cq(spot.x)}, ${cq(spot.y)})`, zIndex: String(Math.round(spot.y)) } },
      h('div', { class: 'av-tag npc-tag' }, label),
      h('div', { class: 'av-body' }, svg(npcSVG(kind))),
    );
    stage.appendChild(el);
    return el;
  };
  const clerkEl = npc('clerk', SPOT.clerk, '매점');
  const usherEl = npc('usher', SPOT.usher, '검표원');

  // 그림 위의 누를 수 있는 곳. chip 은 "여기를 누르면 된다"는 작은 표시.
  const hotspot = (cls, label, chip, rect, onTap) => h('button', {
    type: 'button', class: 'hotspot ' + cls, 'aria-label': label,
    style: { left: cq(rect.x), top: cq(rect.y), width: cq(rect.w), height: cq(rect.h) },
    onclick: (e) => { e.stopPropagation(); sfx.unlock(); onTap(); },
  }, h('span', { class: 'hotspot-label' }, chip));
  stage.append(
    hotspot('hs-snack', '매점 가기', '팝콘 사기', { x: 0, y: 10, w: 134, h: 216 }, () => walkTo(SPOT.snack.x, SPOT.snack.y, openSnack)),
    hotspot('hs-poster', '오늘의 상영 보기', '', { x: 136, y: 44, w: 120, h: 96 }, () => walkTo(SPOT.poster.x, SPOT.poster.y, openPoster)),
    hotspot('hs-gate', '1관 입장', '입장하기', { x: 262, y: 30, w: 122, h: 196 }, () => walkTo(SPOT.gate.x, SPOT.gate.y, checkTicket)),
  );

  // ---------- 사람들 ----------
  /** @type {Map<string, { el: HTMLElement, body: HTMLElement, tag: HTMLElement, x: number, y: number, key: string }>} */
  const crowd = new Map();

  const holdingOf = (st) => (st.p >= 0 ? 'popcorn' : st.dk >= 0 ? 'drink' : null);
  const lookKey = (st) => `${st.a.join(',')}|${holdingOf(st)}`;

  function currentPos(entry) {
    // 걷는 도중이면 실제로 보이는 위치를 읽는다
    const r = stage.getBoundingClientRect();
    if (!r.width) return { x: entry.x, y: entry.y };
    const m = new DOMMatrixReadOnly(getComputedStyle(entry.el).transform);
    return { x: m.m41 / r.width * W, y: m.m42 / r.width * W };
  }

  function place(entry, x, y, animate) {
    let dur = 0;
    if (animate) {
      const from = currentPos(entry);
      const dist = Math.hypot(x - from.x, y - from.y);
      dur = Math.round(dist / WALK_SPEED * 1000);
      if (dist > 2) entry.body.classList.toggle('flip', x < from.x);
    }
    entry.x = x; entry.y = y;
    entry.el.style.transition = dur ? `transform ${dur}ms linear` : 'none';
    entry.el.style.transform = `translate(${cq(x)}, ${cq(y)})`;
    entry.el.style.zIndex = String(Math.round(y));
    if (dur > 60) {
      entry.el.classList.add('walking');
      clearTimeout(entry.walkTimer);
      entry.walkTimer = later(() => entry.el.classList.remove('walking'), dur);
    }
    return dur;
  }

  function syncPeer(p) {
    const st = p.st;
    let entry = crowd.get(p.id);
    if (st.sc !== 'lobby') {
      if (entry) { entry.el.remove(); crowd.delete(p.id); }
      return;
    }
    const { x, y } = walkable(st.x, st.y);
    if (!entry) {
      const body = h('div', { class: 'av-body' });
      const tag = h('div', { class: 'av-tag' });
      const el = h('div', { class: 'av' + (p.isSelf ? ' me' : '') }, tag, body);
      if (p.isSelf) el.addEventListener('click', (e) => { e.stopPropagation(); emote(0); });
      entry = { el, body, tag, x, y, key: '', walkTimer: 0 };
      crowd.set(p.id, entry);
      stage.appendChild(el);
      place(entry, x, y, false);
      el.classList.add('pop-in');
    } else if (entry.x !== x || entry.y !== y) {
      place(entry, x, y, true);
    }
    entry.tag.textContent = p.isSelf ? `나 : ${st.n}` : st.n;
    entry.el.classList.toggle('away', !!st.aw);
    const key = lookKey(st);
    if (key !== entry.key) {
      entry.key = key;
      entry.body.replaceChildren(avatarNode(st.a, { holding: holdingOf(st) }));
    }
  }

  function removePeer(p) {
    const entry = crowd.get(p.id);
    if (!entry) return;
    entry.el.classList.add('pop-out');
    later(() => entry.el.remove(), 250);
    crowd.delete(p.id);
  }

  const selfPeer = () => ({ id: room.selfId, st: room.self, isSelf: true });

  /** 내가 (x,y)로 걸어가고, 도착하면 then 을 부른다 */
  let arriveTimer = 0;
  function walkTo(x, y, then) {
    clearTimeout(arriveTimer);
    ({ x, y } = walkable(x, y));
    const entry = crowd.get(room.selfId);
    const from = entry ? currentPos(entry) : { x, y };
    const dur = Math.round(Math.hypot(x - from.x, y - from.y) / WALK_SPEED * 1000);
    room.update({ x: Math.round(x), y: Math.round(y) });
    if (then) arriveTimer = later(() => { if (alive) then(); }, dur + 60);
  }

  stage.addEventListener('click', (e) => {
    sfx.unlock();
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const { x: tx, y: ty } = walkable(x, y);
    const mark = h('div', { class: 'tap-mark', style: { left: cq(tx), top: cq(ty) } });
    stage.appendChild(mark);
    later(() => mark.remove(), 500);
    sfx.step();
    walkTo(tx, ty);
  });

  // ---------- 행동 ----------
  function emote(i) { room.act('em', { e: i }); }
  function phrase(i) { room.act('sy', { i }); }

  let lastGreetToast = 0;
  function onAct(id, type, d) {
    const entry = crowd.get(id);
    if (!entry) return;
    if (type === 'em') {
      if (d.e === 0) {
        entry.body.classList.remove('bow'); void entry.body.offsetWidth; entry.body.classList.add('bow');
        const now = performance.now();
        if (id !== room.selfId && now - lastGreetToast > 4000) {
          lastGreetToast = now;
          const p = room.peers.get(id);
          if (p) toast(`${p.st.n} 님이 꾸벅 인사했어요`);
        }
      } else {
        bubble(entry.el, EMOTES[d.e]);
      }
      sfx.pop();
    } else if (type === 'sy') {
      bubble(entry.el, PHRASES[d.i], { kind: 'say', ms: 3200 });
      sfx.pop();
    }
  }

  // ---------- 매점 ----------
  function openSnack() {
    bubble(clerkEl, CLERK_LINES[0], { kind: 'say', ms: 2600 });
    const item = (node, name, price, onPick) => h('button', { type: 'button', class: 'menu-item', onclick: onPick },
      h('span', { class: 'menu-pic' }, node), h('strong', null, name), h('small', null, price));
    const close = sheet({
      title: '매점',
      content: [
        h('p', { class: 'sheet-text' }, '돈은 안 받아요. 인사면 충분합니다.'),
        h('h3', { class: 'menu-h' }, '팝콘'),
        h('div', { class: 'menu-grid' }, POPCORN_NAMES.map((name, k) => item(svg(popcornSVG({ kind: POPCORN_KEYS[k], level: 1 })), name, MENU_POP[k], () => {
          close();
          sfx.scoop();
          later(() => sfx.coin(), 420);
          room.update({ p: k, pl: POPCORN_FULL });
          bubble(clerkEl, CLERK_LINES[1], { kind: 'say', ms: 2800 });
          toast(`${name} 한 통 나왔어요 🍿`);
        }))),
        h('h3', { class: 'menu-h' }, '음료'),
        h('div', { class: 'menu-grid' }, DRINK_NAMES.map((name, k) => item(h('span', { class: 'menu-emoji' }, ['🥤', '🥤', '🧋'][k]), name, MENU_DRINK[k], () => {
          close();
          sfx.coin();
          room.update({ dk: k });
          bubble(clerkEl, CLERK_LINES[2], { kind: 'say', ms: 2800 });
          toast(`${name} 나왔어요 🥤`);
        }))),
      ],
    });
  }

  // ---------- 포스터 ----------
  function openPoster() {
    const p = showPosition(room.ctl, room.now());
    sheet({
      title: '오늘의 상영',
      content: [
        h('img', { class: 'poster-big', src: thumbUrl(room.ctl.vid, 'hqdefault'), alt: '', referrerpolicy: 'no-referrer' }),
        h('p', { class: 'sheet-text strong' }, room.ctl.title),
        h('p', { class: 'sheet-text' }, p.phase === 'before' ? '상영관은 열려 있어요. 미리 들어가 자리를 잡아도 돼요.'
          : p.phase === 'ended' ? '오늘 상영은 끝났어요.' : '지금 상영 중이에요. 들어가면 중간부터 볼 수 있어요.'),
      ],
    });
  }

  // ---------- 검표 → 1관 ----------
  function usherLine() {
    const p = showPosition(room.ctl, room.now());
    if (p.phase === 'playing' || p.phase === 'paused') return '이미 시작했어요. 허리 숙이고 조용히요.';
    if (p.phase === 'before' && p.until < 10 * 60000) return '아직 광고 중이에요. 천천히 들어가세요.';
    if (p.phase === 'ended') return '상영은 끝났지만, 둘러보셔도 돼요.';
    return '표 확인하겠습니다. 1관은 이쪽이에요.';
  }

  let entering = false;
  function enterHall() {
    if (entering || !alive) return;
    entering = true;
    sfx.door();
    room.update({ sc: 'hall', s: -1, sa: 0 });
    app.scene('hall');
  }

  function checkTicket() {
    bubble(usherEl, usherLine(), { kind: 'say', ms: 2600 });
    if (room.self.tk) { later(enterHall, 500); return; }
    const stubEl = h('div', { class: 'tear-stub' }, '입장권');
    const mainEl = h('div', { class: 'tear-main' }, h('strong', null, room.ctl.title), h('span', null, '1관 · 자유석'));
    const ticketEl = h('div', { class: 'tear-ticket' }, mainEl, stubEl);
    let torn = false;
    const close = sheet({
      title: '검표',
      content: [
        h('p', { class: 'sheet-text' }, '표를 내밀어 주세요.'),
        ticketEl,
        h('button', {
          type: 'button', class: 'btn btn-primary btn-block',
          onclick: () => {
            if (torn) return;
            torn = true;
            sfx.tear();
            ticketEl.classList.add('torn');
            room.update({ tk: 1 });
            later(() => { close(); enterHall(); }, 750);
          },
        }, '표 내밀기'),
      ],
    });
  }

  // ---------- 조립 ----------
  const top = topBar(app, { backLabel: '영화관에서 나가기', onBack: () => askLeave(app) });
  const hint = h('p', { class: 'stage-hint' }, '바닥을 누르면 걸어가요 · 매점과 1관 문을 눌러 보세요');
  root.appendChild(h('div', { class: 'room lobby' },
    top.el,
    h('div', { class: 'stage-wrap' }, stage, hint),
    actionBar({ phrases: LOBBY_PHRASES, onEmote: emote, onPhrase: phrase }),
  ));

  for (const p of room.everyone()) syncPeer(p);
  offs.push(
    room.on('self', () => syncPeer(selfPeer())),
    room.on('peer:join', (p) => { syncPeer(p); if (p.st.sc === 'lobby') toast(`${p.st.n} 님이 들어왔어요`); }),
    room.on('peer:update', (p) => syncPeer(p)),
    room.on('peer:leave', (p) => removePeer(p)),
    room.on('act', onAct),
    room.on('net', () => top.update()),
    room.on('ctl', () => { top.update(); toast('영사기사가 상영 일정을 바꿨어요'); }),
  );

  // 상영이 다가오면 알려 준다
  let lastUntil = Infinity;
  let lastPhase = showPosition(room.ctl, room.now()).phase;
  const tick = setInterval(() => {
    top.update();
    const p = showPosition(room.ctl, room.now());
    if (p.phase === 'before') {
      if (lastUntil > 60000 && p.until <= 60000) {
        sfx.chime();
        toast('1분 뒤 상영이 시작돼요. 1관으로 들어가세요!', 4000);
        bubble(usherEl, '곧 시작합니다. 입장해 주세요.', { kind: 'say', ms: 4000 });
      }
      lastUntil = p.until;
    } else if (lastPhase === 'before' && p.phase === 'playing') {
      toast('상영이 시작됐어요. 지금 들어가도 돼요.', 4000);
      lastUntil = 0;
    }
    lastPhase = p.phase;
  }, 1000);

  later(() => hint.classList.add('fade'), 6000);

  return () => {
    alive = false;
    clearInterval(tick);
    clearTimeout(arriveTimer);
    timers.forEach(clearTimeout);
    offs.forEach((off) => off());
  };
}
