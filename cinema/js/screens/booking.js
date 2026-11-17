// 예매 = 영화 약속 잡기: 유튜브 링크 → 상영 시각 → 표(초대 링크)
import { h, randomId, store, session, fmtDateTime, fmtUntil, fmtDuration, toLocalInput, cleanText } from '../util.js';
import { parseYouTube, thumbUrl, normalizeScreening, encodeInvite } from '../link.js';
import { createPlayer, ytErrorText, YT_STATE } from '../yt.js';
import { generateHostKey } from '../sign.js';
import { rememberScreening } from '../data.js';
import { button, toast } from '../ui.js';
import { sfx } from '../sfx.js';

// 예시 영상: 블렌더 재단의 오픈 무비 (누구나 자유롭게 볼 수 있게 공개된 단편)
const SAMPLE = { id: 'WhWc3b3KhnY', title: 'Spring (블렌더 오픈 무비)' };

export function mount(root, app) {
  /** @type {import('../yt.js').Player | null} */
  let player = null;
  let previewSeq = 0;
  const st = {
    vid: '', title: '', titleEdited: false, dur: 0, ok: false, checking: false, error: '',
    at: 0, chip: '',
  };

  // ---------- 1. 영상 ----------
  const urlInput = h('input', {
    class: 'input', type: 'url', inputmode: 'url', placeholder: '유튜브 링크를 붙여 넣어 주세요',
    'aria-label': '유튜브 링크', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go',
  });
  const previewMount = h('div', { class: 'yt-mount' });
  const previewBox = h('div', { class: 'preview', hidden: true }, h('div', { class: 'screen-frame' }, previewMount));
  const previewNote = h('p', { class: 'note' });
  const titleInput = h('input', {
    class: 'input', type: 'text', maxlength: 60, placeholder: '약속 이름 (예: 금요일 심야 영화)', 'aria-label': '약속 이름',
    autocomplete: 'off', enterkeyhint: 'done',
  });
  const titleRow = h('label', { class: 'field', hidden: true }, h('span', { class: 'field-label' }, '약속 이름'), titleInput);

  titleInput.addEventListener('input', () => { st.title = titleInput.value; st.titleEdited = true; });

  function setNote(text, kind = '') { previewNote.textContent = text; previewNote.className = 'note ' + kind; }

  async function fetchTitle(vid, seq) {
    // 유튜브 oEmbed 로 제목만 가져와 본다. 막혀 있으면 조용히 넘어간다(플레이어가 알려 주는 제목을 쓴다).
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + vid)}`, { referrerPolicy: 'strict-origin-when-cross-origin' });
      if (!res.ok) return;
      const j = await res.json();
      if (seq === previewSeq && j && typeof j.title === 'string') applyTitle(j.title);
    } catch { /* 무시 */ }
  }

  function applyTitle(t) {
    t = cleanText(t, 60);
    if (!t || st.titleEdited) return;
    st.title = t;
    titleInput.value = t;
  }

  async function loadPreview(vid, presetTitle) {
    const seq = ++previewSeq;
    if (player) { player.destroy(); player = null; }
    Object.assign(st, { vid, dur: 0, ok: false, checking: true, error: '', title: presetTitle || '', titleEdited: false });
    titleInput.value = st.title;
    previewBox.hidden = false;
    titleRow.hidden = false;
    setNote('상영할 수 있는 영상인지 확인하는 중…');
    drawSubmit();
    fetchTitle(vid, seq);
    try {
      const p = await createPlayer(previewMount, { videoId: vid, autoplay: true, muted: true });
      if (seq !== previewSeq) { p.destroy(); return; }
      player = p;
      let confirmed = false;
      p.on('error', (code) => {
        if (seq !== previewSeq) return;
        Object.assign(st, { ok: false, checking: false, error: ytErrorText(code) });
        setNote(st.error, 'bad');
        drawSubmit();
      });
      p.on('state', (s) => {
        if (seq !== previewSeq || confirmed || s !== YT_STATE.PLAYING) return;
        confirmed = true;
        // 실제로 재생이 시작됐다 = 이 사이트에서 틀 수 있는 영상. 길이와 제목을 읽고 살짝 뒤에 멈춘다.
        setTimeout(() => {
          if (seq !== previewSeq) return;
          st.dur = p.isLive() ? 0 : Math.round(p.duration());
          applyTitle(p.title());
          Object.assign(st, { ok: true, checking: false });
          setNote(p.isLive() ? '✓ 라이브 방송이에요. 모두 실시간으로 같이 봐요.' : `✓ 상영할 수 있어요${st.dur ? ' · ' + fmtDuration(st.dur) : ''}`, 'good');
          p.pause();
          drawSubmit();
        }, 1200);
      });
      await p.ready;
      if (seq !== previewSeq) return;
      applyTitle(p.title());
      // 자동재생이 막힌 환경이면 재생 확인을 못 한다. 그래도 약속은 만들 수 있게 둔다.
      setTimeout(() => {
        if (seq !== previewSeq || confirmed || st.error) return;
        Object.assign(st, { ok: true, checking: false });
        setNote('미리보기를 눌러 재생되는지 확인해 보세요. (재생이 안 되는 영상은 상영관에서도 안 나와요)', '');
        drawSubmit();
      }, 6000);
    } catch (e) {
      if (seq !== previewSeq) return;
      const code = e && e.code;
      if (code) {
        Object.assign(st, { ok: false, checking: false, error: ytErrorText(code) });
        setNote(st.error, 'bad');
      } else {
        // 유튜브 스크립트를 못 불러온 경우 (네트워크/차단). 확인 없이 진행은 허용한다.
        Object.assign(st, { ok: true, checking: false });
        previewBox.hidden = true;
        setNote('미리보기를 불러오지 못했어요. 그래도 약속은 만들 수 있어요.', '');
      }
      drawSubmit();
    }
  }

  function onUrl() {
    const parsed = parseYouTube(urlInput.value);
    if (!parsed) {
      if (urlInput.value.trim()) setNote('유튜브 영상 주소가 아닌 것 같아요. 공유 → 링크 복사로 받은 주소를 넣어 주세요.', 'bad');
      else setNote('');
      return;
    }
    if (parsed.id === st.vid) return;
    loadPreview(parsed.id);
  }
  urlInput.addEventListener('change', onUrl);
  urlInput.addEventListener('paste', () => setTimeout(onUrl, 0));
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); urlInput.blur(); onUrl(); } });

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { urlInput.value = text.trim(); onUrl(); return; }
    } catch { /* 권한 없음 */ }
    urlInput.focus();
    toast('주소 칸을 길게 눌러 붙여넣기 해 주세요');
  }

  // ---------- 2. 시각 ----------
  const whenLabel = h('p', { class: 'when-label' });
  const dtInput = h('input', { class: 'input', type: 'datetime-local', 'aria-label': '상영 시각 직접 선택' });
  const chipRow = h('div', { class: 'chips' });

  function tonight9() {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    if (d.getTime() - Date.now() < 10 * 60000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const CHIPS = [
    { key: 'now', label: '지금 바로', at: () => Math.ceil((Date.now() + 60000) / 10000) * 10000 },
    { key: '10', label: '10분 뒤', at: () => Math.ceil((Date.now() + 10 * 60000) / 60000) * 60000 },
    { key: '30', label: '30분 뒤', at: () => Math.ceil((Date.now() + 30 * 60000) / 60000) * 60000 },
    { key: '9pm', label: () => (new Date(tonight9()).getDate() === new Date().getDate() ? '오늘 밤 9시' : '내일 밤 9시'), at: tonight9 },
  ];

  function setWhen(at, chip) {
    st.at = at; st.chip = chip;
    dtInput.value = toLocalInput(at);
    drawWhen();
  }
  function drawWhen() {
    chipRow.replaceChildren(...CHIPS.map((c) => h('button', {
      type: 'button', class: 'chip' + (st.chip === c.key ? ' on' : ''), 'aria-pressed': String(st.chip === c.key),
      onclick: () => { sfx.tap(); setWhen(c.at(), c.key); },
    }, typeof c.label === 'function' ? c.label() : c.label)));
    const until = st.at - Date.now();
    whenLabel.textContent = st.chip === 'now'
      ? '표를 끊고 1분 뒤에 상영을 시작해요.'
      : `${fmtDateTime(st.at)} · ${until > 0 ? fmtUntil(until) : '이미 지난 시각이에요'}`;
    whenLabel.className = 'when-label' + (until <= 0 && st.chip !== 'now' ? ' bad' : '');
    drawSubmit();
  }
  dtInput.addEventListener('change', () => {
    const t = new Date(dtInput.value).getTime();
    if (Number.isFinite(t)) { st.at = t; st.chip = 'custom'; drawWhen(); }
  });

  // ---------- 3. 표 끊기 ----------
  const submit = button('🎟️  표 끊기', { kind: 'primary', cls: 'btn-xl', onClick: create });
  function drawSubmit() {
    const future = st.chip === 'now' || st.at > Date.now();
    submit.disabled = !(st.vid && st.ok && future);
    submit.textContent = st.checking ? '영상 확인 중…' : '🎟️  표 끊기';
  }

  let creating = false;
  async function create() {
    if (creating) return;
    creating = true;
    try {
      const at = st.chip === 'now' ? CHIPS[0].at() : st.at;
      let hk = '', jwk = null;
      try {
        const key = await generateHostKey();
        hk = key.publicKey; jwk = key.privateJwk;
      } catch { /* 보안 컨텍스트가 아니면 영사기사 기능 없이 진행 */ }
      const scr = normalizeScreening({
        room: randomId(16), vid: st.vid, at, title: cleanText(st.title, 60) || '제목 없는 상영', dur: st.dur, host: app.me.name, hk,
      });
      if (!scr) { toast('약속을 만들지 못했어요. 다시 시도해 주세요.'); return; }
      if (jwk) store.set('host.' + scr.room, { jwk });
      rememberScreening(scr, true);
      session.set('fresh', scr.room);
      sfx.print();
      app.go('s/' + encodeInvite(scr));
    } finally {
      creating = false;
    }
  }

  root.appendChild(h('div', { class: 'page booking' },
    h('header', { class: 'page-top' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '뒤로', onclick: () => app.go('') }, '←'),
      h('h1', null, '영화 약속 잡기'),
    ),
    h('section', { class: 'card' },
      h('h2', { class: 'step' }, h('span', { class: 'step-n' }, '1'), '무엇을 볼까요?'),
      h('div', { class: 'row gap' }, urlInput, button('붙여넣기', { kind: 'soft', onClick: pasteFromClipboard })),
      previewBox,
      previewNote,
      titleRow,
      h('button', { type: 'button', class: 'link-btn', onclick: () => { urlInput.value = 'https://youtu.be/' + SAMPLE.id; loadPreview(SAMPLE.id, SAMPLE.title); } }, '볼 게 안 떠오르면 → 예시 단편으로 해 보기'),
    ),
    h('section', { class: 'card' },
      h('h2', { class: 'step' }, h('span', { class: 'step-n' }, '2'), '언제 만날까요?'),
      chipRow,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, '직접 고르기'), dtInput),
      whenLabel,
    ),
    h('section', { class: 'card card-plain' },
      submit,
      h('p', { class: 'fineprint' }, '표를 끊으면 초대 링크가 만들어져요. 친구에게 보내면 같은 영화관에서 만나요. 상영은 정시에 시작하고, 늦게 오면 중간부터 봐요.'),
    ),
  ));

  // 다시 잡기(같은 영상으로)로 넘어온 경우 미리 채운다
  const prefill = session.get('prefill');
  if (prefill && typeof prefill.vid === 'string') {
    session.set('prefill', null);
    urlInput.value = 'https://youtu.be/' + prefill.vid;
    loadPreview(prefill.vid, typeof prefill.title === 'string' ? prefill.title : '');
  }
  setWhen(CHIPS[1].at(), '10');
  const timer = setInterval(drawWhen, 20000);

  return () => {
    previewSeq++;
    clearInterval(timer);
    if (player) player.destroy();
  };
}
