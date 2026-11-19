// 밤하늘을 지나가는 썰매. 순록 두 마리가 끄는 썰매의 그림자 그림(실루엣)이 하늘 낮은 곳을 가로질러 간다.
// 매일 밤 세 번, 언제 어느 쪽 하늘로 지나갈지는 날짜로 정해진다 — 누가 보든 같은 순간에 같은 하늘에서 본다.
// 알림은 없다. 마침 그쪽 하늘을 보고 있던 사람만 본다.
import * as THREE from 'three';

const KST = 9 * 3600e3, HOUR = 3600e3, DAY = 24 * HOUR;
export const PASS_MS = 75e3;                    // 한 번 지나가는 데 걸리는 시간
// 지나가는 때: 그날 낮 12시(한국 시간)부터 센 시각의 범위. 폭설(18시, 21시, 0시, 3시부터 30분)과 겹치지 않는 사이사이다
const WINDOWS = [[7 + 10 / 60, 8 + 50 / 60], [10 + 10 / 60, 11 + 50 / 60], [13 + 10 / 60, 14 + 50 / 60]];     // 19:10~20:50, 22:10~23:50, 01:10~02:50
const FAR = 480;                                 // 들판 가운데에서 이만큼 먼 하늘
const SWEEP = 150 * Math.PI / 180;               // 하늘을 이만큼 가로지른다
const LOW = 6, ARC = 5;                          // 지평선 위 6도에서 떠올라, 가운데에서 11도까지 올랐다가 다시 내려간다 (휴대폰을 눕혀도 화면 안에 들어오는 높이)
const WIDTH = 2 * FAR * Math.tan(4.4 * Math.PI / 180);      // 보이는 너비가 9도쯤 되게
const TEX_W = 800, TEX_H = 300;

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
function rand(a, b) {
  let h = Math.imul(a ^ 0x51ed270b, 0x85ebca6b) ^ Math.imul((b + 0x2545f491) | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** 그 밤(낮 12시부터 다음 날 낮 12시까지)의 번호 */
const nightOf = (ms) => Math.floor((ms + KST - 12 * HOUR) / DAY);
/** night 번째 밤의 세 번: [{ index, start(세계 시각 ms), azimuth(처음 나타나는 쪽, 라디안), dir(+1 | -1) }] */
export function passesOf(night) {
  const noon = night * DAY + 12 * HOUR - KST;
  return WINDOWS.map(([from, to], index) => ({
    index, night,
    start: noon + from * HOUR + rand(night, index) * ((to - from) * HOUR - PASS_MS),
    azimuth: rand(night, 10 + index) * Math.PI * 2,
    dir: rand(night, 20 + index) < 0.5 ? 1 : -1,
  }));
}
/** 세계 시각 ms 에 지나가는 중이면 { ...그 번, p: 0..1 }, 아니면 null */
export function passAt(ms) {
  for (const pass of passesOf(nightOf(ms))) if (ms >= pass.start && ms < pass.start + PASS_MS) return { ...pass, p: (ms - pass.start) / PASS_MS };
  return null;
}
/** ms 뒤에 처음 시작되는 번 */
export function nextPass(ms) {
  for (let n = nightOf(ms), i = 0; i < 3; i++, n++) for (const pass of passesOf(n)) if (pass.start >= ms) return pass;
  return null;
}
/** 지나가는 길 위의 자리: p 0..1 → 들판 가운데를 기준으로 한 하늘의 한 점 */
function place(pass, p, out) {
  const az = pass.azimuth + pass.dir * SWEEP * p, el = (LOW + ARC * Math.sin(Math.PI * p)) * Math.PI / 180;
  return out.set(Math.sin(az) * Math.cos(el) * FAR, Math.sin(el) * FAR, Math.cos(az) * Math.cos(el) * FAR);
}

// ---------- 그림: 오른쪽으로 달리는 순록 두 마리와 썰매 ----------
function drawing() {
  const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');
  const PALE = '#f6efdc';                        // 달빛을 받은 듯한 밝은 색 (어두운 밤하늘에서 보이도록)
  g.fillStyle = PALE; g.strokeStyle = PALE; g.lineCap = 'round'; g.lineJoin = 'round';
  const oval = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
  const line = (w, pts) => { g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };

  // 뒤에 남는 반짝임
  for (let i = 0; i < 10; i++) { g.globalAlpha = 0.75 - i * 0.065; oval(118 - i * 11.5, 178 + Math.sin(i * 1.7) * 9, 3.6 - i * 0.26, 3.6 - i * 0.26); }
  g.globalAlpha = 1;

  // 썰매: 앞이 말려 올라간 날, 둥근 몸체, 선물 자루, 모자 쓴 산타
  g.lineWidth = 6; g.beginPath(); g.moveTo(140, 232); g.lineTo(318, 232); g.bezierCurveTo(352, 232, 366, 206, 350, 190); g.bezierCurveTo(342, 182, 330, 188, 334, 198); g.stroke();
  line(5, [176, 232, 182, 206]); line(5, [292, 232, 288, 206]);
  g.beginPath(); g.moveTo(138, 150); g.bezierCurveTo(126, 150, 124, 168, 136, 170); g.lineTo(146, 204); g.bezierCurveTo(150, 214, 160, 216, 172, 216); g.lineTo(300, 216);
  g.bezierCurveTo(326, 216, 338, 196, 334, 170); g.bezierCurveTo(322, 178, 312, 184, 298, 184); g.lineTo(176, 184); g.bezierCurveTo(166, 184, 160, 172, 158, 150); g.closePath(); g.fill();
  oval(186, 150, 34, 37);                                                       // 선물 자루
  oval(250, 160, 30, 33);                                                       // 산타의 몸
  oval(262, 118, 15.5, 15.5);                                                   // 머리
  oval(272, 128, 9, 8);                                                         // 수염
  g.beginPath(); g.moveTo(248, 112); g.quadraticCurveTo(250, 92, 270, 102); g.lineTo(276, 112); g.quadraticCurveTo(236, 104, 226, 116); g.closePath(); g.fill();      // 뒤로 넘어간 모자
  g.beginPath(); g.moveTo(250, 106); g.quadraticCurveTo(232, 96, 222, 112); g.lineTo(230, 118); g.quadraticCurveTo(240, 108, 256, 114); g.closePath(); g.fill();
  oval(223, 116, 6.5, 6.5);                                                     // 모자 끝 방울
  line(11, [262, 150, 296, 156]);                                               // 고삐를 쥔 팔

  // 순록 한 마리: 앞다리는 앞으로, 뒷다리는 뒤로 뻗고 달린다
  const deer = (x, y, s) => {
    oval(x, y, 47 * s, 19 * s, -0.1);                                           // 몸
    line(17 * s, [x + 32 * s, y - 8 * s, x + 54 * s, y - 34 * s]);              // 목
    oval(x + 64 * s, y - 40 * s, 17 * s, 9.5 * s, 0.3);                         // 머리
    g.beginPath(); g.moveTo(x + 50 * s, y - 46 * s); g.lineTo(x + 40 * s, y - 58 * s); g.lineTo(x + 56 * s, y - 50 * s); g.closePath(); g.fill();      // 귀
    line(4.2 * s, [x + 56 * s, y - 48 * s, x + 50 * s, y - 70 * s, x + 38 * s, y - 86 * s]);                // 뿔
    line(3.6 * s, [x + 51 * s, y - 66 * s, x + 62 * s, y - 78 * s]); line(3.6 * s, [x + 45 * s, y - 77 * s, x + 53 * s, y - 90 * s]); line(3.4 * s, [x + 53 * s, y - 58 * s, x + 64 * s, y - 64 * s]);
    line(6.6 * s, [x + 30 * s, y + 10 * s, x + 58 * s, y + 30 * s, x + 72 * s, y + 25 * s]);                // 앞다리 둘
    line(6.6 * s, [x + 22 * s, y + 13 * s, x + 44 * s, y + 40 * s, x + 57 * s, y + 38 * s]);
    line(6.6 * s, [x - 32 * s, y + 8 * s, x - 58 * s, y + 28 * s, x - 74 * s, y + 21 * s]);                 // 뒷다리 둘
    line(6.6 * s, [x - 26 * s, y + 12 * s, x - 46 * s, y + 39 * s, x - 61 * s, y + 35 * s]);
    oval(x - 47 * s, y - 9 * s, 8 * s, 6 * s, -0.5);                            // 꼬리
  };
  deer(470, 172, 1); deer(650, 150, 1);
  // 고삐
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(296, 156); g.quadraticCurveTo(370, 176, 436, 160); g.moveTo(498, 158); g.quadraticCurveTo(560, 160, 614, 140); g.stroke();

  // 맨 앞 순록 코끝의 빨간 불빛
  const nx = 650 + 80, ny = 150 - 36;
  const glow = g.createRadialGradient(nx, ny, 0, nx, ny, 24);
  glow.addColorStop(0, 'rgba(255, 86, 64, 0.95)'); glow.addColorStop(0.3, 'rgba(255, 86, 64, 0.5)'); glow.addColorStop(1, 'rgba(255, 86, 64, 0)');
  g.fillStyle = glow; g.fillRect(nx - 26, ny - 26, 52, 52);
  g.fillStyle = '#ff5a43'; g.beginPath(); g.arc(nx, ny, 5.2, 0, Math.PI * 2); g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function createSanta(scene) {
  const map = drawing();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  sprite.scale.set(WIDTH, WIDTH * TEX_H / TEX_W, 1);
  sprite.visible = false;
  sprite.renderOrder = -5;                       // 하늘 바로 다음에 그린다 (눈송이나 나무보다 뒤)
  scene.add(sprite);
  const here = new THREE.Vector3(), ahead = new THREE.Vector3();
  let forced = null, current = null;

  return {
    passAt, nextPass, passesOf,
    /** 지금 지나가는 중이면 그 번(p 포함), 아니면 null */
    get current() { return current; },
    get sprite() { return sprite; },
    /** 시험·구경용: start 시각에 azimuth(라디안) 쪽 하늘을 가운데로 지나가게 한다 (null 로 풀기) */
    force(start, center = Math.PI, dir = 1) { forced = start === null ? null : { index: -1, night: 0, start, azimuth: center - dir * SWEEP / 2, dir }; },
    /**
     * @param {number} now 세계 시각(ms)  @param {THREE.Camera} camera  @param {number} sunElev 해의 높이(도). 해가 져야 보인다
     */
    update(now, camera, sunElev) {
      const pass = forced && now >= forced.start && now < forced.start + PASS_MS ? { ...forced, p: (now - forced.start) / PASS_MS } : passAt(now);
      const dark = forced ? 1 : smooth((-4 - sunElev) / 4);
      current = pass && dark > 0 ? pass : null;
      sprite.visible = !!current;
      if (!current) return;
      const p = pass.p;
      place(pass, p, here); place(pass, Math.min(1, p + 0.004), ahead);
      const bob = Math.sin(now / 900) * 1.6;      // 살짝 출렁이며 난다 (기울기는 길을 따라가야 하므로, 앞을 보는 점도 똑같이 출렁인다)
      here.y += bob; ahead.y += bob;
      sprite.position.copy(here);
      sprite.material.opacity = 0.9 * dark * smooth(p / 0.07) * smooth((1 - p) / 0.07);
      // 화면에서 어느 쪽으로 가는지에 맞춰 그림을 뒤집고, 오르내리는 만큼 기울인다
      const a = here.clone().project(camera), b = ahead.clone().project(camera);
      const dx = (b.x - a.x) * camera.aspect, dy = b.y - a.y, left = dx < 0;
      map.repeat.x = left ? -1 : 1; map.offset.x = left ? 1 : 0;
      const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(dy, Math.abs(dx) || 1e-6)));
      sprite.material.rotation = left ? -tilt : tilt;
    },
  };
}
