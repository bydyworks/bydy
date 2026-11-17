// 로비·상영관이 함께 쓰는 위/아래 막대와 안내
import { h, fmtCountdown, fmtDuration, fmtTime } from '../util.js';
import { EMOTES, PHRASES, showPosition } from '../room.js';
import { sheet, button, confirmSheet, avatarNode } from '../ui.js';
import { sfx } from '../sfx.js';
import { openMeEditor } from './me-editor.js';

/** 지금 상영 상태를 한 줄로 */
export function phaseLabel(room, knownDur = 0) {
  const p = showPosition(room.ctl, room.now(), knownDur);
  if (p.phase === 'before') return p.until > 3600000 ? `${fmtTime(room.ctl.at)} 상영` : `상영까지 ${fmtCountdown(p.until)}`;
  if (p.phase === 'playing') return `상영 중 · ${fmtDuration(p.pos)}`;
  if (p.phase === 'paused') return '쉬는 시간';
  return '상영 종료';
}

/**
 * 위쪽 막대: 뒤로 · 제목/상태 · 인원
 * @param {typeof import('../main.js').app} app
 * @param {{ backLabel: string, onBack: () => void, extra?: Node|null, knownDur?: () => number }} o
 */
export function topBar(app, o) {
  const room = app.room;
  const title = h('strong', { class: 'room-title-text' }, room.ctl.title);
  const sub = h('span', { class: 'room-sub' });
  const count = h('span', { class: 'net-count' });
  const dot = h('span', { class: 'net-dot' });
  const pill = h('button', { type: 'button', class: 'net-pill', 'aria-label': '누가 와 있는지 보기', onclick: () => openPeople(app) }, dot, count);
  const el = h('header', { class: 'room-top' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': o.backLabel, onclick: () => { sfx.tap(); o.onBack(); } }, '←'),
    h('div', { class: 'room-title' }, title, sub),
    o.extra || null,
    pill,
  );
  function update() {
    title.textContent = room.ctl.title;
    sub.textContent = phaseLabel(room, o.knownDur ? o.knownDur() : 0);
    const n = room.peers.size + 1;
    count.textContent = `${n}명`;
    pill.dataset.net = room.net.connected ? 'on' : 'off';
    pill.title = room.net.connected ? '연결됨' : '연결 중…';
  }
  update();
  return { el, update };
}

/** 와 있는 사람 목록 */
export function openPeople(app) {
  const room = app.room;
  if (!room) return;
  const list = h('ul', { class: 'people' });
  const netLine = h('p', { class: 'note' });
  function draw() {
    const rows = room.everyone().sort((a, b) => a.st.j - b.st.j).map((p) => h('li', { class: p.st.aw ? 'away' : '' },
      h('span', { class: 'people-av' }, avatarNode(p.st.a)),
      h('span', { class: 'people-name' }, p.isSelf ? `나: ${p.st.n}` : p.st.n),
      h('span', { class: 'people-where' }, p.st.aw ? '잠깐 자리 비움' : p.st.sc === 'hall' ? (p.st.s >= 0 ? '상영관 · 착석' : '상영관') : '로비'),
    ));
    list.replaceChildren(...rows);
    netLine.textContent = room.net.connected
      ? (room.peers.size ? '' : '오늘은 전세 냈네요. 초대 링크를 보내면 친구가 이 영화관으로 들어와요.')
      : '다른 관객과 연결하는 중이에요. 연결이 안 돼도 영화는 제시간에 같이 흘러가요.';
  }
  draw();
  const offs = [room.on('peer:join', draw), room.on('peer:leave', draw), room.on('peer:update', draw), room.on('net', draw), room.on('self', draw)];
  const close = sheet({
    title: '지금 영화관에',
    content: [
      list,
      netLine,
      h('div', { class: 'row gap' },
        button('내 캐릭터 바꾸기', { kind: 'soft', cls: 'grow', onClick: () => { close(); openMeEditor(app); } }),
        button(sfx.enabled ? '효과음 끄기' : '효과음 켜기', { kind: 'ghost', cls: 'grow', onClick: (e) => { sfx.enabled = !sfx.enabled; e.currentTarget.textContent = sfx.enabled ? '효과음 끄기' : '효과음 켜기'; } }),
      ),
    ],
    onClose: () => offs.forEach((off) => off()),
  });
}

/**
 * 아래쪽 막대: 이모지 + 정해진 한마디. 자유 채팅은 없다.
 * @param {{ phrases: number[], onEmote: (i: number) => void, onPhrase: (i: number) => void, left?: Node|null }} o
 */
export function actionBar(o) {
  let last = 0;
  const guard = (fn) => () => {
    const now = performance.now();
    if (now - last < 450) return;       // 연타 방지
    last = now;
    fn();
  };
  return h('footer', { class: 'room-bottom' },
    o.left || null,
    h('div', { class: 'bar-scroll' },
      h('div', { class: 'emotes', role: 'group', 'aria-label': '이모지 반응' },
        EMOTES.map((e, i) => h('button', { type: 'button', class: 'emote-btn', 'aria-label': i === 0 ? '꾸벅 인사' : `${e} 반응`, onclick: guard(() => o.onEmote(i)) }, e))),
      h('div', { class: 'phrases', role: 'group', 'aria-label': '한마디' },
        o.phrases.map((i) => h('button', { type: 'button', class: 'phrase-btn', onclick: guard(() => o.onPhrase(i)) }, PHRASES[i]))),
    ),
  );
}

/** 영화관에서 나갈지 묻기 */
export async function askLeave(app) {
  const ok = await confirmSheet({
    title: '영화관에서 나갈까요?',
    body: '이 탭을 닫기 전까지는 자리와 팝콘을 맡아 둘게요.',
    ok: '나가기', cancel: '계속 있기',
  });
  if (ok) app.leave();
}
