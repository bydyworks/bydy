// 내 캐릭터·닉네임 고치기 (바텀시트)
import { h } from '../util.js';
import { sheet, button, avatarNode } from '../ui.js';
import { saveMe, randomName, randomAvatar, NAME_MAX, AVATAR_LIMITS, normalizeName } from '../me.js';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../art.js';
import { sfx } from '../sfx.js';

/**
 * @param {typeof import('../main.js').app} app
 * @param {() => void} [onChange] 바뀔 때마다 호출
 */
export function openMeEditor(app, onChange) {
  const me = app.me;
  const preview = h('div', { class: 'me-preview' });
  const nameInput = h('input', {
    class: 'input', type: 'text', maxlength: NAME_MAX, value: me.name, 'aria-label': '닉네임',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
  });
  const rows = h('div', { class: 'me-rows' });

  function commit() {
    saveMe(me);
    if (app.room) app.room.update({ n: me.name, a: me.av.slice() });
    onChange && onChange();
  }

  function draw() {
    preview.replaceChildren(avatarNode(me.av, { mood: 'happy' }));
    rows.replaceChildren(
      row('머리', AVATAR_LIMITS.hair, 0, (i) => h('span', { class: 'swatch-av' }, avatarNode([i, me.av[1], me.av[2], me.av[3]]))),
      row('머리 색', AVATAR_LIMITS.hairColor, 1, (i) => h('span', { class: 'swatch', style: { background: HAIR_COLORS[i] } })),
      row('옷 색', AVATAR_LIMITS.outfit, 2, (i) => h('span', { class: 'swatch', style: { background: OUTFIT_COLORS[i] } })),
      row('피부', AVATAR_LIMITS.skin, 3, (i) => h('span', { class: 'swatch', style: { background: SKIN_TONES[i] } })),
    );
  }

  function row(label, count, slot, render) {
    const opts = [];
    for (let i = 0; i < count; i++) {
      opts.push(h('button', {
        type: 'button', class: 'swatch-btn' + (me.av[slot] === i ? ' on' : ''),
        'aria-label': `${label} ${i + 1}`, 'aria-pressed': String(me.av[slot] === i),
        onclick: () => { me.av[slot] = i; sfx.tap(); commit(); draw(); },
      }, render(i)));
    }
    return h('div', { class: 'me-row' }, h('span', { class: 'me-row-label' }, label), h('div', { class: 'me-row-opts' }, opts));
  }

  nameInput.addEventListener('change', () => { me.name = normalizeName(nameInput.value); nameInput.value = me.name; commit(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  draw();
  const close = sheet({
    title: '내 캐릭터',
    content: [
      preview,
      h('div', { class: 'row gap' },
        nameInput,
        button('🎲', { kind: 'soft', aria: '닉네임 다시 뽑기', onClick: () => { me.name = randomName(); nameInput.value = me.name; commit(); } }),
      ),
      rows,
      h('div', { class: 'row gap' },
        button('🎲 통째로 다시 뽑기', { kind: 'ghost', cls: 'grow', onClick: () => { me.av = randomAvatar(); me.name = randomName(); nameInput.value = me.name; commit(); draw(); } }),
        button('완료', { kind: 'primary', cls: 'grow', onClick: () => close() }),
      ),
    ],
    onClose: () => { me.name = normalizeName(nameInput.value); commit(); },
  });
  return close;
}
