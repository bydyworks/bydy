// 홈 화면에 추가하기: 첫 화면의 작은 단추를 누르면
//   · 바로 설치해 주는 브라우저(안드로이드 크롬 등)에서는 설치 창을 띄우고,
//   · 그렇지 못한 브라우저(아이폰 사파리, 앱 안의 브라우저 등)에서는 어떻게 하면 되는지 알려 준다.
// 이미 홈 화면에서 앱으로 열었으면 단추를 보이지 않는다.
// 앱처럼 열리게 하는 작은 일꾼(sw.js)은 실제 주소(poddk.pages.dev)에서만 붙인다 (점검할 때 저장해 둔 파일이 섞이지 않게).
const $ = (s) => document.querySelector(s);

export const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

/** 어떤 기기·브라우저인지에 따라 홈 화면에 추가하는 방법 */
export function howTo(ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch);
  const inApp = /NAVER|KAKAOTALK|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const android = /Android/.test(ua);
  if (inApp && /NAVER/i.test(ua)) return '네이버 앱에서는 아래쪽 <b>≡ 메뉴</b>에서 <b>‘홈 화면에 추가’</b>를 눌러요.<br>메뉴에 없으면 <b>사파리</b>나 <b>크롬</b>으로 열어서 추가해 주세요.';
  if (inApp) return '이 앱 안에서는 바로 추가할 수 없어요.<br>오른쪽 위 메뉴에서 <b>‘다른 브라우저로 열기’</b>를 누른 뒤, 거기서 홈 화면에 추가해 주세요.';
  if (ios && !/CriOS|FxiOS|EdgiOS/.test(ua)) return '아래쪽의 <b>공유 단추</b>(네모에서 화살표가 나온 모양)를 누르고, <b>‘홈 화면에 추가’</b>를 골라요.';
  if (ios) return '오른쪽 위(또는 아래)의 <b>공유 단추</b>를 누르고 <b>‘홈 화면에 추가’</b>를 골라요.<br>없으면 <b>사파리</b>로 열어서 추가해 주세요.';
  if (android && /SamsungBrowser/.test(ua)) return '아래쪽 <b>≡ 메뉴</b>에서 <b>‘현재 페이지 추가’</b> → <b>‘홈 화면’</b>을 골라요.';
  if (android) return '오른쪽 위 <b>⋮ 메뉴</b>에서 <b>‘홈 화면에 추가’</b> 또는 <b>‘앱 설치’</b>를 눌러요.';
  return '주소창 오른쪽의 <b>설치 아이콘</b>을 누르거나, 브라우저 메뉴에서 <b>‘앱 설치’</b>를 골라요.';
}

export function setupInstall() {
  const btn = $('#install'), help = $('#install-help');
  if (!btn || !help) return;
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; prompt = null; });
  btn.hidden = standalone();
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (prompt) {
      const p = prompt; prompt = null;
      try { await p.prompt(); const r = await p.userChoice; if (r && r.outcome === 'accepted') btn.hidden = true; } catch { /* 창을 못 띄우면 방법을 알려 준다 */ help.querySelector('.how').innerHTML = howTo(); help.hidden = false; }
      return;
    }
    help.querySelector('.how').innerHTML = howTo();
    help.hidden = false;
  });
  help.querySelector('.close').addEventListener('click', () => { help.hidden = true; });
  help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });
  if ('serviceWorker' in navigator && /(^|\.)poddk\.pages\.dev$/.test(location.hostname)) {
    const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
  }
}
