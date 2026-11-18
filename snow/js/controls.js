// 조작. 모바일 3D 게임처럼:
//   · 화면 왼쪽을 누른 채 끌면 그 자리에 조이스틱이 생겨 걷는다
//   · 화면의 나머지를 끌면 둘러본다 (카메라 돌리기), 두 손가락을 벌리거나 오므리면 가까이·멀리
//   · PC: 방향키/WASD 로 걷고, 마우스로 끌어 둘러보고, 휠로 가까이·멀리, 스페이스로 눈 천사
const STICK_RADIUS = 56;      // 조이스틱을 끝까지 민 거리(px)
const DEADZONE = 0.14;
const THREE_CLAMP = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {HTMLElement} surface 누르는 곳 (화면 전체를 덮는 요소)
 * @param {{ stick: HTMLElement, knob: HTMLElement }} ui 조이스틱 그림
 */
export function createControls(surface, ui) {
  const move = { x: 0, y: 0 };          // x: 오른쪽 +, y: 앞(화면 위쪽) +. 크기 0..1
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const look = { dx: 0, dy: 0, at: -Infinity };
  const fingers = new Map();            // 둘러보는 손가락들: id → { x, y } (하나면 돌리기, 둘이면 줌)
  let pinch = 0;                        // 두 손가락 사이의 거리 (직전 값)
  let zoom = 1;                         // 지난번 이후 쌓인 줌 배율 (1보다 크면 멀리)
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const keys = new Set();
  let enabled = false;
  const actions = [];

  function showStick(on) {
    ui.stick.style.opacity = on ? '1' : '0';
    if (on) ui.stick.style.transform = `translate(${stick.ox - STICK_RADIUS}px, ${stick.oy - STICK_RADIUS}px)`;
    ui.knob.style.transform = on ? `translate(${stick.x * STICK_RADIUS}px, ${-stick.y * STICK_RADIUS}px)` : 'translate(0, 0)';
  }

  function onDown(e) {
    if (!enabled) return;
    const w = surface.clientWidth, h = surface.clientHeight;
    const touch = e.pointerType !== 'mouse';
    // 손가락: 화면 왼쪽 절반(위쪽 띠 제외)은 조이스틱, 나머지는 둘러보기. 마우스는 언제나 둘러보기.
    if (touch && stick.id === null && e.clientX < w * 0.5 && e.clientY > h * 0.18) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = 0; stick.y = 0;
      showStick(true);
    } else if (fingers.size < 2) {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) pinch = spread();
    } else return;
    try { surface.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저는 지원하지 않는다 */ }
    e.preventDefault();
  }

  function onMove(e) {
    if (e.pointerId === stick.id) {
      let dx = (e.clientX - stick.ox) / STICK_RADIUS, dy = (stick.oy - e.clientY) / STICK_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      stick.x = dx; stick.y = dy;
      showStick(true);
    } else if (fingers.has(e.pointerId)) {
      const f = fingers.get(e.pointerId);
      if (fingers.size === 1) { look.dx += e.clientX - f.x; look.dy += e.clientY - f.y; }
      f.x = e.clientX; f.y = e.clientY;
      if (fingers.size === 2) {
        const d = spread();
        if (pinch > 8 && d > 8) zoom *= pinch / d;          // 벌리면 가까이, 오므리면 멀리
        pinch = d;
      }
      look.at = performance.now();
    }
  }

  function onUp(e) {
    if (e.pointerId === stick.id) { stick.id = null; stick.x = 0; stick.y = 0; showStick(false); }
    fingers.delete(e.pointerId);
  }
  function onWheel(e) {
    if (!enabled) return;
    zoom *= Math.exp(THREE_CLAMP(e.deltaY, -240, 240) * 0.0014);
    look.at = performance.now();
    e.preventDefault();
  }

  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function onKeyDown(e) {
    if (!enabled || e.metaKey || e.ctrlKey || e.altKey) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === 'Space' && !e.repeat) { actions.forEach((fn) => fn()); e.preventDefault(); }
  }
  function onKeyUp(e) { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); }
  function release() { keys.clear(); stick.id = null; stick.x = 0; stick.y = 0; fingers.clear(); showStick(false); }

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);
  surface.addEventListener('wheel', onWheel, { passive: false });
  surface.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  return {
    /** 지금 걷고 싶은 방향과 세기. 조이스틱이 우선, 없으면 키보드. */
    read() {
      let x = stick.x, y = stick.y;
      if (stick.id === null) {
        x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
        y = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
      }
      const len = Math.hypot(x, y);
      if (len < DEADZONE) { move.x = 0; move.y = 0; } else {
        const k = (len - DEADZONE) / (1 - DEADZONE) / len;      // 죽은 구간 바깥을 0..1 로 다시 편다
        move.x = x * k; move.y = y * k;
      }
      return move;
    },
    /** 지난번 이후 둘러본 양(px)을 가져가고 비운다 */
    takeLook() { const d = { dx: look.dx, dy: look.dy }; look.dx = 0; look.dy = 0; return d; },
    /** 방금까지 직접 둘러보고 있었는가 (그동안은 카메라가 저절로 돌지 않는다) */
    /** 지난번 이후의 줌 배율을 가져가고 비운다 (1보다 크면 멀리, 작으면 가까이) */
    takeZoom() { const z = zoom; zoom = 1; return z; },
    get looking() { return fingers.size > 0 || performance.now() - look.at < 1200; },
    get usingStick() { return stick.id !== null; },
    onAction(fn) { actions.push(fn); },
    setEnabled(on) { enabled = on; if (!on) release(); },
    /** 시험용: 조이스틱을 민 것처럼 */
    debugMove(x, y) { stick.id = x || y ? -1 : null; stick.x = x; stick.y = y; },
  };
}
