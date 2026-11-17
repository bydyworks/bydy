// 티켓북: 지금까지 본 상영의 기념 티켓 모음
import { h } from '../util.js';
import { listStubs } from '../data.js';
import { button, toast } from '../ui.js';
import { stubCard, shareStub } from './stub.js';

export function mount(root, app) {
  const stubs = listStubs();
  root.appendChild(h('div', { class: 'page book' },
    h('header', { class: 'page-top' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '뒤로', onclick: () => app.go('') }, '←'),
      h('h1', null, '내 티켓북'),
    ),
    stubs.length
      ? [
        h('p', { class: 'book-count' }, `지금까지 ${stubs.length}편을 함께 봤어요.`),
        h('div', { class: 'book-list' }, stubs.map((s) => h('div', { class: 'book-item' },
          stubCard(s),
          button('이미지로 저장 · 공유', {
            kind: 'ghost', small: true,
            onClick: async () => { if (!(await shareStub(s))) toast('이미지를 만들지 못했어요.'); },
          }),
        ))),
      ]
      : h('div', { class: 'center-msg small' },
        h('div', { class: 'notice-emoji' }, '📒'),
        h('h2', null, '아직 빈 티켓북이에요'),
        h('p', null, '영화를 끝까지 보면 기념 티켓을 한 장 받아요. 누구와 어느 자리에서 봤는지 적혀 있어요.'),
        button('영화 약속 잡기', { kind: 'primary', onClick: () => app.go('new') }),
      ),
  ));
  return () => {};
}
