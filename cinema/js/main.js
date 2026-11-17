// 시작점: 주소(#) 에 따라 화면을 바꾸고, 방(영화관) 입장/퇴장을 관리한다.
import { $, h, session, store, randomId, sleep } from './util.js';
import { loadMe } from './me.js';
import { decodeInvite } from './link.js';
import { joinRoom, showPosition } from './room.js';
import { rememberScreening } from './data.js';
import { toast, closeSheet } from './ui.js';
import { sfx } from './sfx.js';
import * as home from './screens/home.js';
import * as booking from './screens/booking.js';
import * as ticket from './screens/ticket.js';
import * as book from './screens/book.js';
import * as lobby from './screens/lobby.js';
import * as hall from './screens/hall.js';

const SCREENS = { home, new: booking, ticket, book, lobby, hall };

/** 시험용: 주소에 ?net=local (같은 브라우저 탭끼리) 또는 ?brokers=ws://localhost:1234 를 붙이면 그쪽으로 연결한다. */
function resolveBrokers() {
  const q = new URLSearchParams(location.search);
  if (q.get('net') === 'local') return ['local:'];
  const list = (q.get('brokers') || '').split(',').map((s) => s.trim()).filter((u) => {
    try {
      const url = new URL(u);
      // 남이 만든 링크가 엉뚱한 서버로 연결시키지 못하게, 내 컴퓨터 주소만 허용한다.
      return (url.protocol === 'ws:' || url.protocol === 'wss:') && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { return false; }
  });
  return list.length ? list : undefined;
}

export const app = {
  me: loadMe(),
  /** @type {import('./room.js').Room | null} */
  room: null,
  /** @type {import('./link.js').Screening | null} */
  scr: null,
  code: '',
  brokers: resolveBrokers(),
  sfx,

  /** 주소 이동. path 예: '', 'new', 'book', 's/<code>' */
  go(path) {
    const target = '#/' + path;
    if (location.hash === target) render();
    else location.hash = target;
  },

  /** 약속의 영화관에 들어간다 (로비부터. 이미 상영 중이면 곧장 상영관으로). */
  async enter(scr, code) {
    if (enteringCode === code) return;         // 같은 약속의 입장 버튼을 연달아 누른 경우만 무시한다
    const seq = ++enterSeq;
    enteringCode = code;
    const dupNotice = () => mount('notice', { emoji: '🚪', title: '다른 탭에서 입장했어요', text: '같은 기기에서 영화관을 한 번 더 열어서, 이 탭은 조용히 퇴장했어요.', action: '여기서 다시 입장', onAction: () => app.enter(scr, code) });
    try {
      if (app.room) dropRoom();
      await mount('loading', { text: '영화관 문을 여는 중…' });
      // 창을 닫았다 다시 열어도(카카오톡 인앱 브라우저 등) 팝콘·검표·자리를 잃지 않게 기기에 적어 둔다.
      const saved = store.get('in.' + scr.room);
      const start = saved && typeof saved === 'object' ? saved : undefined;
      const room = await joinRoom({ scr, me: app.me, brokers: app.brokers, start });
      // 문이 열리기를 기다리는 사이 다른 화면으로 갔다면(뒤로 가기, 다른 약속 열기) 없던 일로 한다.
      if (seq !== enterSeq) { room.leave(); return; }
      app.room = room; app.scr = scr; app.code = code;
      session.set('inroom', code);
      room.on('self', (st) => store.set('in.' + scr.room, { sc: st.sc, x: st.x, y: st.y, s: st.s, p: st.p, pl: st.pl, pe: st.pe, dk: st.dk, tk: st.tk }));
      room.on('kicked', () => {
        dropRoom();
        // 안내문은 방에 들어오기 전의 기록 위에 띄운다 (뒤로 가기가 한 번 헛돌지 않게)
        if (history.state && history.state.inRoom) history.back();
        dupNotice();
      });
      // 처음 들어오는데 이미 상영 중이면, 로비를 거치지 않고 바로 상영관으로 안내한다.
      // (기기 시계가 아니라 방 시계와, 방금 방에서 들은 상영 시각으로 판단한다)
      let late = false;
      if (!start) {
        const phase = showPosition(room.ctl, room.now()).phase;
        if (phase === 'playing' || phase === 'paused') { room.update({ sc: 'hall', tk: 1 }); late = true; }
      }
      if (!(history.state && history.state.inRoom)) history.pushState({ inRoom: true }, '');
      await app.scene(room.self.sc === 'hall' && room.self.tk ? 'hall' : 'lobby');
      if (late && seq === enterSeq && app.room === room) toast('이미 시작했어요. 허리 숙이고 조용히 빈자리로…', 3500);
    } catch (e) {
      if (seq !== enterSeq) return;
      dropRoom();
      if (e && e.code === 'dup') { await dupNotice(); return; }   // 문을 여는 사이 같은 기기의 새 탭이 들어왔다
      console.error('[enter]', e);
      await mount('notice', { emoji: '🔌', title: '영화관 문이 안 열려요', text: '연결에 실패했어요. 잠시 뒤에 다시 시도해 주세요.', action: '다시 시도', onAction: () => app.enter(scr, code) });
    } finally {
      if (seq === enterSeq) enteringCode = '';
    }
  },

  /** 방 안에서 장소 이동: 'lobby' | 'hall' */
  async scene(name) {
    if (!app.room) return;
    await mount(name, {});
  },

  /** 영화관에서 나가 표 화면으로 돌아간다. */
  leave() {
    const code = app.code;
    dropRoom();
    if (history.state && history.state.inRoom) { redrawOnPop = true; history.back(); }   // popstate 에서 다시 그린다
    else app.go(code ? 's/' + code : '');
  },
};

// 개발자 도구와 자동 점검에서 들여다볼 수 있게 열어 둔다 (비밀값은 원래 이 페이지 주소에 다 있다)
window.__dsy = app;

let enterSeq = 0;          // 입장 시도 번호. 화면이 바뀌면 올라가서, 기다리던 입장을 무효로 만든다
let enteringCode = '';
let unmount = null;
let mountSeq = 0;

function dropRoom() {
  if (app.room) { try { app.room.leave(); } catch { /* 무시 */ } }
  app.room = null;
  session.set('inroom', null);
}

/** 화면 교체 */
async function mount(name, params) {
  const seq = ++mountSeq;
  closeSheet();
  if (unmount) { try { unmount(); } catch (e) { console.error('[unmount]', e); } unmount = null; }
  const root = $('#screen');
  root.replaceChildren();
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  if (name === 'loading') {
    root.appendChild(h('div', { class: 'center-msg' }, h('div', { class: 'spinner' }), h('p', null, params.text || '불러오는 중…')));
    return;
  }
  if (name === 'notice') {
    root.appendChild(h('div', { class: 'center-msg' },
      h('div', { class: 'notice-emoji' }, params.emoji || '🎬'),
      h('h2', null, params.title || ''),
      h('p', null, params.text || ''),
      params.action ? h('button', { type: 'button', class: 'btn btn-primary', onclick: params.onAction }, params.action) : null,
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => app.go('') }, '영화관 앞으로'),
    ));
    return;
  }
  const mod = SCREENS[name];
  const un = await mod.mount(root, app, params);
  if (seq !== mountSeq) { try { un && un(); } catch { /* 무시 */ } return; }   // 그 사이 다른 화면으로 넘어갔다
  unmount = un || null;
}

function parseRoute() {
  let hash = location.hash.replace(/^#\/?/, '');
  if (!hash) {
    // 일부 메신저가 # 뒤를 잘라먹는 경우를 대비해 ?s= 도 받는다
    const s = new URLSearchParams(location.search).get('s');
    if (s) hash = 's/' + s;
  }
  if (hash === 'new') return { name: 'new' };
  if (hash === 'book') return { name: 'book' };
  if (hash.startsWith('s/')) return { name: 'ticket', code: hash.slice(2).split(/[/?&]/)[0] };
  return { name: 'home' };
}

async function render() {
  enterSeq++; enteringCode = '';
  if (app.room) dropRoom();
  const r = parseRoute();
  if (r.name === 'ticket') {
    const scr = decodeInvite(r.code);
    if (!scr) {
      await mount('notice', { emoji: '🎟️', title: '표를 읽을 수 없어요', text: '초대 링크가 잘렸거나 잘못된 것 같아요. 링크를 다시 받아 주세요.' });
      return;
    }
    rememberScreening(scr);
    // 새로고침으로 다시 열린 경우엔 바로 다시 입장한다.
    if (session.get('inroom') === r.code && !reenteredOnce) {
      reenteredOnce = true;
      // (기록의 inRoom 표시는 그대로 둔다 — 지우면 입장할 때 기록이 한 칸 더 쌓여, 나간 뒤 '뒤로'가 한 번 헛돈다)
      await app.enter(scr, r.code);
      return;
    }
    await mount('ticket', { scr, code: r.code });
    return;
  }
  await mount(r.name, {});
}
let reenteredOnce = false;

window.addEventListener('hashchange', () => { render(); });
let backPressedAt = 0;
let redrawOnPop = false;
window.addEventListener('popstate', () => {
  // (주소의 # 가 바뀌는 이동은 hashchange 가 처리한다. 여기서는 주소가 그대로인 '뒤로'만 다룬다)
  if (redrawOnPop) { redrawOnPop = false; render(); return; }
  if (app.room && !(history.state && history.state.inRoom)) {
    // 방 안에서 '뒤로': 실수로 나가지 않게 한 번 더 눌러야 나간다 (iOS 의 가장자리 쓸기 포함)
    const now = Date.now();
    if (now - backPressedAt > 2500) {
      backPressedAt = now;
      history.pushState({ inRoom: true }, '');
      toast('한 번 더 누르면 영화관에서 나가요');
      return;
    }
    render();
  }
});

// 같은 탭 ID 를 쓰는 탭이 이미 있으면(탭 복제) 새 ID 를 받는다.
async function ensureUniqueTab() {
  if (!('BroadcastChannel' in window)) return;
  try {
    const bc = new BroadcastChannel('dsy.tab');
    let clash = false;
    bc.onmessage = (e) => {
      const d = e.data || {};
      if (d.q === app.me.tab) bc.postMessage({ a: app.me.tab });
      else if (d.a === app.me.tab) clash = true;
    };
    bc.postMessage({ q: app.me.tab });
    await sleep(120);
    if (clash) { app.me.tab = randomId(9); session.set('tab', app.me.tab); }
  } catch { /* 무시 */ }
}

document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

(async function boot() {
  await ensureUniqueTab();
  await render();
})().catch((e) => {
  console.error('[boot]', e);
  toast('문제가 생겼어요. 새로고침해 주세요.');
});
