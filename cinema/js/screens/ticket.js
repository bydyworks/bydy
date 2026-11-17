// 표 화면: 초대 링크를 열면 가장 먼저 보이는 곳. 여기서 입장한다.
import { h, setChildren, session, fmtDateTime, fmtDuration, fmtCountdown } from '../util.js';
import { thumbUrl, inviteUrl, icsFor } from '../link.js';
import { storedCtl, showPosition } from '../room.js';
import { createClock } from '../clock.js';
import { statusOf, hasStub, endOf } from '../data.js';
import { button, sheet, toast, copyText } from '../ui.js';
import { sfx } from '../sfx.js';

export function mount(root, app, { scr, code }) {
  let view = scr;                       // 영사기사가 시각을 바꿨다면 반영된 값
  let ctl = null;                       // 지난번에 방에서 들은 영사실 상태 (없으면 null)
  // 기기 시계가 몇 분 틀려도 "상영 전/상영 중"을 바르게 보여 주도록 서버 시각에 맞춘 시계를 쓴다 (맞추기 전에는 기기 시계 그대로)
  const clock = createClock();
  const isHost = !!(scr.hk && localStorageHasHost(scr.room));
  const url = inviteUrl(scr);

  const statusEl = h('p', { class: 'ticket-status' });
  const whenEl = h('dd');
  const enterBtn = button('입장하기', { kind: 'primary', cls: 'btn-xl', onClick: () => { sfx.door(); app.enter(scr, code); } });
  // 입장 버튼만 따로 둔다: 표가 길어 화면을 넘겨도 아래쪽에 붙어 있게 (css 의 .ticket-actions)
  const actions = h('div', { class: 'ticket-actions' }, enterBtn);
  const more = h('div', { class: 'ticket-more' });

  function draw() {
    const now = clock.now();
    // 쉬는 시간에는 시작 시각이 뒤로 밀려 있어 "상영 전"처럼 보인다: 영사실 상태로 직접 확인한다
    const paused = ctl && showPosition(ctl, now).phase === 'paused';
    const st = paused ? { key: 'playing', label: '쉬는 시간', until: 0 } : statusOf(view, now);
    whenEl.textContent = fmtDateTime(view.at) + (view.at !== scr.at ? ' (변경됨)' : '');
    if (st.key === 'ended') {
      statusEl.textContent = '이 상영은 끝났어요';
      statusEl.className = 'ticket-status ended';
    } else if (st.key === 'playing') {
      statusEl.textContent = `${st.label} — 지금 들어가면 중간부터 볼 수 있어요`;
      statusEl.className = 'ticket-status playing';
    } else {
      statusEl.textContent = st.until < 3600000 ? `상영 시작까지 ${fmtCountdown(st.until)}` : st.label;
      statusEl.className = 'ticket-status ' + st.key;
    }
    enterBtn.textContent = st.key === 'ended' ? '텅 빈 상영관 둘러보기'
      : st.key === 'playing' ? '지금 입장하기 (상영 중)'
      : st.key === 'soon' ? '입장하기' : '미리 입장해서 기다리기';
    enterBtn.className = 'btn btn-xl ' + (st.key === 'ended' ? 'btn-ghost' : 'btn-primary');
    return st;
  }

  async function share() {
    const text = `🎬 ${view.title}\n${fmtDateTime(view.at)}, 동시상영 1관에서 만나요!`;
    try {
      if (navigator.share) { await navigator.share({ title: '동시상영 · 영화 약속', text, url }); return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    toast((await copyText(`${text}\n${url}`)) ? '초대 링크를 복사했어요. 친구에게 붙여 넣어 보내세요.' : '복사하지 못했어요. 주소창의 주소를 직접 복사해 주세요.');
  }

  function calendar() {
    const end = endOf(view);
    const fmt = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + `&text=${encodeURIComponent('🎬 ' + view.title + ' · 동시상영')}`
      + `&dates=${fmt(view.at)}/${fmt(end)}`
      + `&details=${encodeURIComponent('온라인 영화관에서 만나요.\n' + url)}`;
    const close = sheet({
      title: '캘린더에 추가',
      content: [
        button('기본 캘린더 (.ics 파일)', {
          kind: 'soft', cls: 'btn-block', onClick: () => {
            const blob = new Blob([icsFor(view, url)], { type: 'text/calendar;charset=utf-8' });
            const a = h('a', { href: URL.createObjectURL(blob), download: '동시상영-약속.ics' });
            document.body.appendChild(a); a.click(); a.remove();
            close();
          },
        }),
        h('a', { class: 'btn btn-soft btn-block', href: gcal, target: '_blank', rel: 'noopener noreferrer', onclick: () => close() }, '구글 캘린더'),
      ],
    });
  }

  function rebook() {
    session.set('prefill', { vid: view.vid, title: view.title });
    app.go('new');
  }

  function drawActions(st) {
    setChildren(more,
      st.key === 'ended'
        ? button('같은 영화로 새 약속 잡기', { kind: 'primary', cls: 'btn-block', onClick: rebook })
        : h('div', { class: 'row gap' },
          button('초대 링크 보내기', { kind: 'soft', cls: 'grow', onClick: share }),
          button('캘린더에 추가', { kind: 'soft', cls: 'grow', onClick: calendar }),
        ),
      hasStub(scr.room) ? button('📒 이 상영의 기념 티켓 보기', { kind: 'ghost', cls: 'btn-block', onClick: () => app.go('book') }) : null,
    );
  }

  const thumb = h('img', { class: 'ticket-thumb', src: thumbUrl(scr.vid, 'hqdefault'), alt: '', referrerpolicy: 'no-referrer' });
  const titleEl = h('h1', { class: 'ticket-title' }, scr.title);
  const durEl = h('dd', null, scr.dur ? fmtDuration(scr.dur) : '상영관에서 확인');

  root.appendChild(h('div', { class: 'page ticket-page' },
    h('header', { class: 'page-top' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '영화관 앞으로', onclick: () => app.go('') }, '←'),
      h('h1', null, isHost ? '내가 잡은 약속' : '영화 약속에 초대받았어요'),
    ),
    h('article', { class: 'ticket' },
      h('div', { class: 'ticket-main' },
        h('div', { class: 'ticket-thumb-wrap' }, thumb),
        h('p', { class: 'ticket-kicker' }, '동시상영 · 입장권'),
        titleEl,
        h('dl', { class: 'ticket-info' },
          h('div', null, h('dt', null, '상영 시각'), whenEl),
          h('div', null, h('dt', null, '상영관'), h('dd', null, '1관 · 자유석')),
          h('div', null, h('dt', null, '러닝타임'), durEl),
          h('div', null, h('dt', null, '영사기사'), h('dd', null, scr.host ? (isHost ? `${scr.host} (나)` : scr.host) : '—')),
        ),
      ),
      h('div', { class: 'ticket-tear', 'aria-hidden': 'true' }),
      h('div', { class: 'ticket-stub' }, statusEl),
    ),
    actions,
    more,
    h('p', { class: 'fineprint' }, isHost
      ? '영사기사는 상영관 안에서 상영을 바로 시작하거나, 미루거나, 쉬는 시간을 줄 수 있어요.'
      : '상영은 정시에 시작해요. 로비에서 팝콘을 사고, 검표를 받고, 자리를 잡아 주세요.'),
  ));

  let lastKey = '';
  function tick() {
    const st = draw();
    if (st.key !== lastKey) { lastKey = st.key; drawActions(st); }
  }
  tick();
  const timer = setInterval(tick, 1000);

  // 지난번에 들은 시각 변경이 있으면 반영
  let alive = true;
  clock.syncWithServer().then(() => { if (alive) { lastKey = ''; tick(); } });
  storedCtl(scr).then((c) => {
    if (!alive || c.rev === 0) return;
    ctl = c;
    view = { ...scr, at: ctl.at, title: ctl.title, dur: ctl.dur, vid: ctl.vid };
    titleEl.textContent = view.title;
    durEl.textContent = view.dur ? fmtDuration(view.dur) : '상영관에서 확인';
    thumb.src = thumbUrl(view.vid, 'hqdefault');
    lastKey = '';
    tick();
  });

  // 방금 만든 약속이면 바로 초대 링크를 보내도록 권한다
  if (session.get('fresh') === scr.room) {
    session.set('fresh', null);
    setTimeout(() => {
      if (!alive) return;
      const close = sheet({
        title: '표가 나왔어요 🎟️',
        content: [
          h('p', { class: 'sheet-text' }, '이제 친구에게 초대 링크를 보내 주세요. 링크를 누르면 같은 영화관, 같은 상영으로 들어와요.'),
          button('초대 링크 보내기', { kind: 'primary', cls: 'btn-block', onClick: () => { close(); share(); } }),
          button('나중에 할게요', { kind: 'ghost', cls: 'btn-block', onClick: () => close() }),
        ],
      });
    }, 500);
  }

  return () => { alive = false; clearInterval(timer); };
}

function localStorageHasHost(room) {
  try { return !!localStorage.getItem('dsy.host.' + room); } catch { return false; }
}
