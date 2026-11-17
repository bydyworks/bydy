// 영화관 앞 (첫 화면)
import { h, svg, fmtDateTime } from '../util.js';
import { marqueeSVG } from '../art.js';
import { button, avatarNode } from '../ui.js';
import { listScreenings, listStubs, statusOf } from '../data.js';
import { thumbUrl } from '../link.js';
import { openMeEditor } from './me-editor.js';

export function mount(root, app) {
  const meCard = h('button', { type: 'button', class: 'me-card', 'aria-label': '내 캐릭터 바꾸기', onclick: () => openMeEditor(app, drawMe) });
  const upcoming = h('div', { class: 'upcoming' });

  function drawMe() {
    meCard.replaceChildren(
      h('span', { class: 'me-card-av' }, avatarNode(app.me.av, { mood: 'happy' })),
      h('span', { class: 'me-card-text' }, h('small', null, '오늘의 관객'), h('strong', null, `나 : ${app.me.name}`)),
      h('span', { class: 'me-card-edit' }, '바꾸기'),
    );
  }

  function drawUpcoming() {
    const now = Date.now();
    const list = listScreenings(now).filter((r) => statusOf(r.scr, now).key !== 'ended');
    if (!list.length) {
      upcoming.replaceChildren(h('p', { class: 'empty' }, '아직 잡힌 약속이 없어요.', h('br'), '보고 싶은 영상 하나만 있으면 돼요.'));
      return;
    }
    upcoming.replaceChildren(...list.map(({ scr, code, mine }) => {
      const st = statusOf(scr, now);
      return h('a', { class: 'appt', href: '#/s/' + code },
        h('img', { class: 'appt-thumb', src: thumbUrl(scr.vid, 'mqdefault'), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
        h('span', { class: 'appt-text' },
          h('strong', null, scr.title),
          h('span', null, fmtDateTime(scr.at)),
          h('span', { class: 'appt-status ' + st.key }, st.label, mine ? ' · 내가 잡은 약속' : ''),
        ),
      );
    }));
  }

  const stubs = listStubs();
  root.appendChild(h('div', { class: 'home' },
    h('div', { class: 'marquee' }, svg(marqueeSVG())),
    h('div', { class: 'home-body' },
      h('p', { class: 'tagline' }, '약속 잡고, 팝콘 사고, 자리 잡고.', h('br'), '같은 시간에 같은 영화를 보는 작은 영화관.'),
      meCard,
      button('🎟️  영화 약속 잡기', { kind: 'primary', cls: 'btn-xl', onClick: () => app.go('new') }),
      h('h2', { class: 'section-title' }, '다가오는 약속'),
      upcoming,
      button(stubs.length ? `📒  내 티켓북 · ${stubs.length}장` : '📒  내 티켓북', { kind: 'ghost', onClick: () => app.go('book') }),
      h('p', { class: 'fineprint' }, '로그인도 설치도 없어요. 약속은 초대 링크 안에 들어 있고, 영상은 유튜브 공식 플레이어로 재생돼요.'),
    ),
  ));
  drawMe();
  drawUpcoming();
  const timer = setInterval(drawUpcoming, 15000);
  return () => clearInterval(timer);
}
