// 화면 캡쳐: 버튼과 글자를 뺀 눈밭 그림만 사진 한 장으로 만든다. 구석에 작게 이름을 적는다.
// 휴대폰에서는 공유 창을 띄워 사진첩에 저장하거나 보낼 수 있게 하고, 그 밖에는 파일로 내려받는다.

const MARK = '뽀드득 · poddk';

/**
 * @param {{ canvas: HTMLCanvasElement, draw: () => void, touch: boolean }} o draw: 지금 장면을 한 번 더 그리는 함수
 * @returns {() => Promise<{ how: 'share' | 'download' | 'show' | 'cancel', width: number, height: number, bytes: number, name: string, url?: string }>}
 *   how 'show': 손가락으로 쓰는 기기인데 공유 창을 띄울 수 없었다 (메신저 속 브라우저 등 — 그런 곳은 내려받기도 대개 막혀 있다).
 *   이때는 저장하지 않고 사진의 주소(url)를 돌려준다: 부른 쪽이 화면에 띄워 길게 눌러 저장하게 한다
 */
export function createCapture({ canvas, draw, touch }) {
  let busy = false;
  const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };

  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  return async function shoot() {
    if (busy) return null;
    busy = true;
    try {
      // 3D 그림은 그린 바로 그 박자에만 읽을 수 있으므로, 다시 그리자마자 다른 판에 옮겨 그린다
      draw();
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      const g = out.getContext('2d');
      g.drawImage(canvas, 0, 0);
      // 구석의 작은 이름 (화면 너비에 맞춘 크기)
      const unit = out.width / Math.max(1, canvas.clientWidth || out.width);        // 화면 1px 이 사진에서 몇 px 인가
      const size = Math.round(13 * unit * Math.max(1, Math.min(1.4, (canvas.clientWidth || 390) / 520)));
      g.font = `700 ${size}px system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
      g.textBaseline = 'alphabetic';
      g.shadowColor = 'rgba(42, 49, 88, 0.45)'; g.shadowBlur = 4 * unit; g.shadowOffsetY = 1 * unit;
      g.fillStyle = 'rgba(255, 255, 255, 0.92)';
      g.fillText(MARK, Math.round(14 * unit), out.height - Math.round(14 * unit));
      const blob = await new Promise((done) => out.toBlob(done, 'image/jpeg', 0.92));
      if (!blob) throw new Error('사진을 만들지 못했어요');
      const name = `poddk-${stamp()}.jpg`;
      const info = { how: 'download', width: out.width, height: out.height, bytes: blob.size, name };
      if (touch && navigator.canShare) {
        const file = new File([blob], name, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); info.how = 'share'; return info; }
          catch (e) { if (e && e.name === 'AbortError') { info.how = 'cancel'; return info; } }      // 공유를 못 하면 아래에서 내려받는다
        }
      }
      if (touch) { info.how = 'show'; info.url = URL.createObjectURL(blob); return info; }
      download(blob, name);
      return info;
    } finally { busy = false; }
  };
}
