// 뽀드득 (poddk) — Walking in a Winter Wonderland: 눈밭을 걷는 작은 공간. (1단계 — 혼자 걷는 버전)
// 직접 걸어야 뽀드득 소리가 나고, 지나간 자리에 발자국이 남는다. 실제 시각에 따라 하늘과 그림자가 바뀌고,
// 자정이 되면 폭설이 모든 발자국을 지운다.
import * as THREE from 'three';
import { createClock, snowfallAt, stormPhase, clockText, stormText } from './clock.js';
import { createSky } from './sky.js';
import { createField, FIELD_RADIUS } from './field.js';
import { build as buildPenguin, pose, setSnow, lie, randomLook, COLORS, STEP, STANCE, POP_SWAP } from './penguin.js';
import { createCrumble } from './crumble.js';
import { createTracks } from './tracks.js';
import { createWeather } from './weather.js';
import { createControls } from './controls.js';
import { createAudio } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const q = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const SAVE_KEY = 'snow.v1';
const TEST_MODE = (q.has('t') || q.has('speed')) && !q.has('persist');     // 시각을 바꿔 보는 시험 중에는 기기에 저장하지 않는다

// 걷는 빠르기 (단위/초) — 1초에 두 걸음 반쯤. 들판을 가로지르는 데 3분. 빠르기를 견주어 볼 때는 주소에 ?walk=1.05 처럼 붙인다
const WALK_SPEED = (() => { const v = Number(q.get('walk')); return v >= 0.6 && v <= 2 ? v : 1.25; })();
const TURN_RATE = 9;              // 몸을 돌리는 빠르기 (라디안/초)
const CAM_DIST = 6.6, CAM_DIST_MIN = 3.2, CAM_DIST_MAX = 18, CAM_TARGET_H = 1.05;
const IDLE_BEFORE_SNOW = 4;       // 가만히 선 지 이만큼 지나면 눈이 쌓이기 시작한다 (초)
const SNOW_FILL_SEC = 12;         // 머리와 어깨에 다 쌓이는 데 걸리는 시간 (폭설 때는 더 빠르다)
const SNOWMAN_WAIT = 10;          // 다 쌓인 채로 이만큼 더 서 있으면 눈사람이 되기 시작한다
const POP_SEC = 0.7;              // "뿅" 하고 눈사람으로 바뀌는 데 걸리는 시간 (움츠렸다가 튀어나와 통통 자리 잡기까지)

// ---------- 화면 ----------
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.3, 1200);
const clock = createClock();
const sky = createSky(scene, { shadowSize: coarse ? 1024 : 2048 });
const field = createField(scene);
const tracks = createTracks(scene);
const crumble = createCrumble(scene);
const weather = createWeather(scene, { count: coarse ? 8000 : 14000 });
const audio = createAudio();
const controls = createControls($('#touch'), { stick: $('#stick'), knob: $('#knob') });

// ---------- 내 펭귄: 목도리/담요와 색은 들어올 때 무작위 (같은 탭에서 새로고침하면 그대로) ----------
function chooseLook() {
  const forced = q.get('look');
  if (forced === 'scarf' || forced === 'blanket') {
    const color = COLORS[Math.abs(Number(q.get('color')) || 0) % COLORS.length];
    return { scarf: forced === 'scarf', blanket: forced === 'blanket', color };
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem('snow.look') || 'null');
    if (saved && COLORS.includes(saved.color)) return { scarf: !saved.blanket, blanket: !!saved.blanket, color: saved.color };
  } catch { /* 저장소를 못 쓰면 새로 뽑는다 */ }
  const look = randomLook();
  try { sessionStorage.setItem('snow.look', JSON.stringify(look)); } catch { /* 무시 */ }
  return look;
}
const look = chooseLook();
const penguin = buildPenguin(look);
scene.add(penguin);

const me = {
  x: 0, z: 15, yaw: Math.PI,              // 나무(가운데)를 바라보고 선다
  camYaw: Math.PI, camPitch: 0.27, camDist: CAM_DIST * (window.innerWidth < window.innerHeight ? 1.08 : 1),
  phase: 0, walk: 0, dist: 0, side: 1,
  idle: 0,
  snow: 0, full: 0, pop: 0,               // 쌓인 눈: 머리·어깨(0..1) → 다 쌓인 채 서 있은 시간(초) → 눈사람이 되는 효과(0..1, 1 이면 눈사람)
  angel: null,                            // 눈 천사를 만드는 중이면 { t, item, beats }
  edgeAt: -Infinity,
};

// ---------- 저장해 둔 자리와 자국 ----------
function restore() {
  if (TEST_MODE) return;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    if ([saved.x, saved.z, saved.yaw].every(Number.isFinite) && Math.hypot(saved.x, saved.z) <= FIELD_RADIUS) {
      const c = field.confine(saved.x, saved.z);
      me.x = c.x; me.z = c.z; me.yaw = saved.yaw; me.camYaw = Number.isFinite(saved.camYaw) ? saved.camYaw : saved.yaw;
      if (Number.isFinite(saved.camDist)) me.camDist = THREE.MathUtils.clamp(saved.camDist, CAM_DIST_MIN, CAM_DIST_MAX);
    }
    tracks.restore(saved.tracks, clock.now());
  } catch { /* 저장된 것이 깨졌으면 새로 시작한다 */ }
}
function save() {
  if (TEST_MODE) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ x: me.x, z: me.z, yaw: me.yaw, camYaw: me.camYaw, camDist: me.camDist, tracks: tracks.dump(clock.now()) }));
  } catch { /* 저장소가 꽉 찼거나 막혀 있으면 그냥 넘어간다 */ }
}
restore();

// ---------- 안내 글 ----------
let toastTimer = 0;
function toast(text, ms = 2600) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- 쌓인 눈 ----------
/** 쌓인 눈을 턴다 (걸음을 떼거나 눈 천사를 하려고 누울 때). 눈사람이었다면 눈덩이가 부서져 흩어진다 */
function shakeOff(quiet = false) {
  if (me.pop >= POP_SWAP) { crumble.burst(me.x, me.z); if (!quiet) audio.fx('rustle', 0.5); }
  else if (me.snow > 0.35 && !quiet) audio.fx('rustle', 0.3);
  me.full = 0; me.pop = 0;
}

// ---------- 눈 천사 ----------
const ANGEL = { down: 0.6, flap: 7.5, up: 0.8, sweeps: 5, canLeaveAfter: 2 };   // 눕기, 휘젓기, 일어나기 (초). 휘젓는 횟수. 이만큼 지나면 걸으려 할 때 일찍 일어난다
function startAngel() {
  if (!started || me.angel) return;
  me.angel = { t: 0, item: null, beats: 0, fell: false };
  me.walk = 0;
  shakeOff(true); me.snow = 0;                           // 쌓인 눈은 누우면서 털린다
  $('#angel').classList.add('busy');
}
function stepAngel(dt, now) {
  const a = me.angel;
  a.t += dt;
  const total = ANGEL.down + ANGEL.flap + ANGEL.up;
  let k, flap = 0;
  if (a.t < ANGEL.down) {
    const u = a.t / ANGEL.down;
    k = u * u * (3 - 2 * u);
    if (!a.fell && u > 0.6) { a.fell = true; audio.fx('bodyfall', 0.7); a.item = tracks.addAngel(me.x, me.z, me.yaw, now); }
  } else if (a.t < ANGEL.down + ANGEL.flap) {
    k = 1;
    const u = (a.t - ANGEL.down) / ANGEL.flap;
    flap = u * Math.PI * 2 * ANGEL.sweeps;                // 천천히 여러 번 휘젓는다
    if (a.item) a.item.grow = Math.min(1, u * 3);         // 자국은 앞의 1/3 동안 다 드러난다
    const beat = Math.floor(u * ANGEL.sweeps * 2);        // 팔을 벌릴 때와 모을 때마다 눈 쓸리는 소리
    if (beat > a.beats) { a.beats = beat; audio.fx('rustle', 0.4); }
    // 걷고 싶으면 일찍 일어난다
    const mv = controls.read();
    if (a.t - ANGEL.down > ANGEL.canLeaveAfter && Math.hypot(mv.x, mv.y) > 0.3) a.t = ANGEL.down + ANGEL.flap;
  } else {
    const u = Math.min(1, (a.t - ANGEL.down - ANGEL.flap) / ANGEL.up);
    k = 1 - u * u * (3 - 2 * u);
    if (a.item) a.item.grow = 1;
  }
  lie(penguin, k, flap);
  if (a.t >= total) {
    lie(penguin, 0);
    me.angel = null;
    me.idle = 0;
    $('#angel').classList.remove('busy');
  }
}
controls.onAction(startAngel);
$('#angel').addEventListener('click', startAngel);

// ---------- 한 박자 ----------
const fwd = new THREE.Vector3(), camGoal = new THREE.Vector3(), lookAt = new THREE.Vector3(), focus = new THREE.Vector3();
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
let started = false;
let seconds = 0;                 // 흐른 시간 (눈송이의 움직임용)
let hudAt = 0, saveAt = 0, frame = 0;
let angelLift = 0;               // 0(평소)..1(눈 천사를 내려다보는 중)
let manual = false;              // 자동 점검용: 켜면 화면은 그리되 시간은 sim() 으로만 흐른다

function walk(dt, now) {
  const mv = controls.read();
  const mag = Math.min(1, Math.hypot(mv.x, mv.y));
  // 둘러보기: 오른쪽으로 끌면 오른쪽을, 위로 끌면 위를 본다
  const lk = controls.takeLook();
  me.camYaw -= lk.dx * 0.0052;
  me.camPitch = THREE.MathUtils.clamp(me.camPitch + lk.dy * 0.0035, 0.08, 0.75);
  me.camDist = THREE.MathUtils.clamp(me.camDist * controls.takeZoom(), CAM_DIST_MIN, CAM_DIST_MAX);

  if (me.angel) { stepAngel(dt, now); setSnow(penguin, me.snow, me.pop); return; }      // 누울 때 털린 눈이 모습에도 바로 드러나게

  if (mag > 0.02) {
    // 카메라가 보는 방향 기준으로 걷는다 (앞 = 화면 안쪽)
    const fx = Math.sin(me.camYaw), fz = Math.cos(me.camYaw);
    let dx = fx * mv.y + -fz * mv.x, dz = fz * mv.y + fx * mv.x;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const want = Math.atan2(dx, dz);
    me.yaw += THREE.MathUtils.clamp(angleDiff(want, me.yaw), -TURN_RATE * dt, TURN_RATE * dt);
    const speed = WALK_SPEED * mag;
    const c = field.confine(me.x + dx * speed * dt, me.z + dz * speed * dt);
    const moved = Math.hypot(c.x - me.x, c.z - me.z);
    me.x = c.x; me.z = c.z;
    if (c.edge && performance.now() - me.edgeAt > 7000) { me.edgeAt = performance.now(); toast('여기부터는 눈이 너무 깊어요'); }
    // 옆으로 밀면 카메라도 천천히 그쪽으로 돈다 (직접 둘러보는 중이 아닐 때) — 키보드만으로도 방향을 바꿀 수 있다
    if (!controls.looking) me.camYaw -= mv.x * 0.85 * dt;

    me.walk = Math.min(1, me.walk + dt * 6);
    me.phase = (me.phase + moved / (2 * STEP)) % 1;
    me.dist += moved;
    while (me.dist >= STEP) {
      me.dist -= STEP;
      me.side = -me.side;
      // 발 위치: 몸 가운데에서 옆으로 벌어진 자리
      const px = me.x + me.side * STANCE * Math.cos(me.yaw), pz = me.z - me.side * STANCE * Math.sin(me.yaw);
      const packed = tracks.isPacked(px, pz, now);
      tracks.addPrint(px, pz, me.yaw, me.side, now);
      // 한 걸음 소리의 길이는 걸음 사이의 두 배쯤: 빨리 걸으면 짧게 끊어 뭉개지지 않게 하고, 천천히 걸으면 다 들려준다
      audio.step(packed, Math.min(0.95, Math.max(0.6, 1.92 * STEP / speed)));
    }
    // 쌓인 눈은 걷기 시작하면 털린다
    if (me.snow > 0) {
      if (me.idle > 0) shakeOff();
      me.snow = Math.max(0, me.snow - dt * 2.4);
    }
    me.idle = 0;
  } else {
    me.walk = Math.max(0, me.walk - dt * 5);
    me.idle += dt;
    if (me.idle > IDLE_BEFORE_SNOW) {
      // 머리와 어깨에 쌓이고 → 다 쌓인 채 잠시 더 서 있으면 → 뿅 하고 눈사람이 된다
      if (me.snow < 1) me.snow = Math.min(1, me.snow + dt / SNOW_FILL_SEC * (1 + 3 * Math.max(0, snowfallAt(now) - 0.35)));
      else if (me.full < SNOWMAN_WAIT) me.full += dt;
      else if (me.pop < 1) {
        const before = me.pop;
        me.pop = Math.min(1, me.pop + dt / POP_SEC);
        if (before < POP_SWAP && me.pop >= POP_SWAP) crumble.puff(me.x, me.z);      // 바뀌는 순간 눈가루가 폭 퍼진다
      }
    }
  }
  pose(penguin, me.phase, me.walk);
  setSnow(penguin, me.snow, me.pop);
}

function placeCamera(dt) {
  penguin.position.set(me.x, 0, me.z);
  penguin.rotation.y = me.yaw;
  fwd.set(Math.sin(me.camYaw), 0, Math.cos(me.camYaw));
  focus.set(me.x, CAM_TARGET_H, me.z);
  // 눈 천사를 만드는 동안에는 카메라가 위로 올라가 내려다본다 (자국이 그려지는 모습이 보이게)
  angelLift += ((me.angel ? 1 : 0) - angelLift) * (dt > 0 ? 1 - Math.exp(-dt * 3.5) : 1);
  const pitch = Math.min(1.25, me.camPitch + angelLift * 0.62);
  const dist = me.camDist + angelLift * 1.2;
  camGoal.copy(focus).addScaledVector(fwd, -dist * Math.cos(pitch));
  camGoal.y = CAM_TARGET_H + dist * Math.sin(pitch);
  const k = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
  camera.position.lerp(camGoal, k);
  // 펭귄보다 조금 앞·위를 본다: 하늘이 화면 위쪽에 넉넉히 들어온다
  lookAt.copy(focus).addScaledVector(fwd, 2.4 * (1 - angelLift)); lookAt.y += 0.55 * (1 - angelLift);
  camera.lookAt(lookAt);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 54 : 44;
  camera.updateProjectionMatrix();
}

let lastFrame = performance.now();
let raf = 0;                     // 다음 프레임 예약 (언제나 하나만 걸려 있어야 한다)
function tick(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastFrame) / 1000));
  lastFrame = t;
  seconds += dt;
  frame++;
  const now = clock.now();
  const snowfall = snowfallAt(now);

  if (!started) { pose(penguin, 0, 0); setSnow(penguin, 0, 0); }
  else if (!manual) { walk(dt, now); crumble.update(dt); }
  placeCamera(started ? dt : 0);
  focus.set(me.x, 0, me.z);
  const palette = sky.update(now, focus, snowfall);
  weather.update(seconds, camera, snowfall, palette.flake, renderer.domElement.height);
  // 해가 지평선 가까이 내려오면 나무의 전구에 불이 들어온다
  const night = THREE.MathUtils.clamp((3 - palette.elev) / 9, 0, 1);
  field.tree.update(seconds, night, renderer.domElement.height, camera);
  if (frame % 2 === 0) tracks.update(now);
  audio.setWeather(snowfall);
  if (frame % 6 === 0) audio.setTreeDistance(Math.hypot(me.x, me.z));

  if (t - hudAt > 500) {
    hudAt = t;
    $('#clock').textContent = clockText(now);
    $('#storm').textContent = stormText(now);
    const carol = audio.carolTitle;
    $('#carol').textContent = carol ? '♪ ' + carol : '';
    document.body.dataset.storm = stormPhase(now);
  }
  if (started && t - saveAt > 8000) { saveAt = t; save(); }
  renderer.render(scene, camera);
  raf = document.hidden ? 0 : requestAnimationFrame(tick);
}

// ---------- 시작 ----------
window.addEventListener('resize', resize);
resize();
placeCamera(0);
camera.position.copy(camGoal);

$('#enter').addEventListener('click', () => {
  if (started) return;
  started = true;
  audio.start();
  controls.setEnabled(true);
  document.body.classList.add('in');
  toast(coarse ? '왼쪽을 누른 채 끌면 걸어요. 오른쪽을 끌면 둘러보고, 두 손가락으로 가까이·멀리' : '방향키로 걷고, 마우스로 끌어 둘러보고, 휠로 가까이·멀리', 5200);
});
$('#mute').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  $('#mute').setAttribute('aria-pressed', String(audio.muted));
  $('#mute').textContent = audio.muted ? '소리 꺼짐' : '소리 켜짐';
});

document.addEventListener('visibilitychange', () => {
  audio.setActive(!document.hidden);
  // 가려진 동안에도 마지막 예약은 남아 있으므로, 돌아올 때 그것을 지우고 새로 건다 (안 그러면 돌아올 때마다 고리가 하나씩 늘어난다)
  if (document.hidden) save(); else { lastFrame = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
});
window.addEventListener('pagehide', save);
raf = requestAnimationFrame(tick);

// 개발자 도구와 자동 점검용
window.__snow = {
  clock, me, look, tracks, audio: audio.stats, controls, sky, penguin, crumble,
  get started() { return started; },
  get snowfall() { return snowfallAt(clock.now()); },
  get palette() { return sky.palette; },
  get treeLight() { return field.tree.lamp.intensity; },
  angel: startAngel,
  teleport(x, z) { const c = field.confine(x, z); me.x = c.x; me.z = c.z; },
  /** 지금의 조작 상태로 sec 초를 한꺼번에 흘려보낸다 (화면을 그리지 않고 걷기만 — 느린 기기에서도 같은 결과) */
  sim(sec) { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { walk(1 / 60, clock.now()); crumble.update(1 / 60); } },
  /** 켜 두면 실제 프레임으로는 시간이 흐르지 않고 sim() 으로만 흐른다 (점검에서 한 순간을 정확히 붙잡을 때) */
  get manual() { return manual; }, set manual(on) { manual = !!on; },
  ready: true,
};
