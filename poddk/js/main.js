// 뽀드득 (poddk) — Walking in a Winter Wonderland: 눈밭을 걷는 작은 공간. (1단계 — 혼자 걷는 버전)
// 직접 걸어야 뽀드득 소리가 나고, 지나간 자리에 발자국이 남는다. 실제 시각에 따라 하늘과 그림자가 바뀌고,
// 세 시간마다 폭설이 모든 발자국을 지운다.
import * as THREE from 'three';
import { createClock, snowfallAt, stormPhase, clockText, stormText } from './clock.js';
import { createSky } from './sky.js';
import { createField, FIELD_RADIUS } from './field.js';
import { build as buildPenguin, pose, setSnow, lie, belly, flap, sit, randomLook, COLORS, STEP, STANCE, POP_SWAP } from './penguin.js';
import { createCrumble } from './crumble.js';
import { createFox } from './fox.js';
import { createSanta } from './santa.js';
import { createCamp, BLOCKS, CLEARINGS, onIce, holeNear, HOLES, IGLOOS, PONDS } from './igloo.js';
import { createFishing } from './fishing.js';
import { createXmas } from './xmas.js';
import { myName, rename } from './names.js';
import { createDens, STATUSES } from './den.js';
import { createNet, ACT } from './net.js';
// 함께 걷는 눈밭의 서버 (server/ 를 Cloudflare 에 올린 주소). 비어 있으면 혼자 걷는 눈밭이다. 주소에 ?server=… 를 붙여 바꿀 수 있고, ?server=off 면 끈다
const SERVER_URL = 'wss://poddk.poddk-server.workers.dev/ws';
import { createTracks, SLIDE_PIECE } from './tracks.js';
import { createWeather } from './weather.js';
import { createControls } from './controls.js';
import { createAudio } from './audio.js';
import { createCapture } from './capture.js';

const $ = (sel) => document.querySelector(sel);
const q = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const SAVE_KEY = 'snow.v1';
const TEST_MODE = (q.has('t') || q.has('speed')) && !q.has('persist');     // 시각을 바꿔 보는 시험 중에는 기기에 저장하지 않는다

// 걷는 빠르기 (단위/초) — 1초에 두 걸음 반쯤. 들판을 가로지르는 데 3분. 빠르기를 견주어 볼 때는 주소에 ?walk=1.05 처럼 붙인다
const WALK_SPEED = (() => { const v = Number(q.get('walk')); return v >= 0.6 && v <= 2 ? v : 1.25; })();
const TURN_RATE = 9;              // 몸을 돌리는 빠르기 (라디안/초)
const CAM_DIST = 6.6, CAM_DIST_MIN = 3.2, CAM_DIST_MAX = 18, CAM_TARGET_H = 1.05;
const DEN_CAM = { near: 3.6, far: 13, start: 8.5, pitch: 0.42, tilt: 0.38 };      // 이글루 안 카메라: 가장 가까이·멀리, 들어갔을 때의 거리, 내려다보는 각도(가까이)와 멀어질수록 더 내려다보는 만큼
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
const field = createField(scene, { clearings: CLEARINGS, blocks: BLOCKS });
const camp = createCamp(scene);            // 이글루 셋과 얼음 낚시터 셋
const dens = createDens(scene);            // 이글루 셋의 안쪽 방 (들판 밖 먼 곳에 지어 둔다)
const tracks = createTracks(scene);
const crumble = createCrumble(scene);
const fox = createFox(scene, tracks, { skipPaw: onIce });      // 얼음 위에는 발자국이 남지 않는다
const santa = createSanta(scene);
// 크리스마스: 눈밭 곳곳의 선물 상자와 트리 옆의 산타. 선물은 눈 위의 빈자리(얼음, 이글루, 나무 곁이 아닌 곳)에만 놓인다
const xmas = createXmas(scene, { crumble: { puff: (...a) => crumble.puff(...a) }, free: (x, z) => {
  if (Math.hypot(x, z) < 7 || PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 1.5) || IGLOOS.some((g) => Math.hypot(x - g.x, z - g.z) < g.radius + 4)) return false;
  const c = field.confine(x, z); return Math.hypot(c.x - x, c.z - z) < 1e-6;
} });
if (q.has('santa')) santa.force(clock.now() + 4000);       // 구경용: 주소에 ?santa 를 붙이면 들어오고 4초 뒤에 나무 쪽 하늘로 지나간다
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
  flap: null,                             // 파닥이는 중이면 { t }
  inside: null,                           // 이글루 안이면 그 이글루의 번호 (0..2)
  outside: null,                          // 이글루에 들어가기 전에 서 있던 자리 { x, z, yaw }
  seat: null,                             // 방석에 앉는 중이거나 앉아 있으면 { k(방석), t, phase: 'down' | 'sat' | 'up', from, to }
  status: null,                           // 앉아서 고른 상태 [그림, 글]
  slide: null,                            // 배로 미끄러지는 중이면 { t, v(빠르기), phase: 'down' | 'glide' | 'up', dist }
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
    const at = me.inside !== null && me.outside ? me.outside : me;      // 이글루 안에 있으면 들어가기 전의 자리를 적는다
    localStorage.setItem(SAVE_KEY, JSON.stringify({ x: at.x, z: at.z, yaw: at.yaw, camYaw: me.camYaw, camDist: me.inside !== null && me.camOut ? me.camOut : me.camDist, tracks: tracks.dump(clock.now()) }));
  } catch { /* 저장소가 꽉 찼거나 막혀 있으면 그냥 넘어간다 */ }
}
restore();

// ---------- 안내 글 ----------
// 길잡이는 처음 한 번만: 해 본 것은 이 기기에 적어 두고 다시 말하지 않는다 (시각을 바꿔 보는 시험 중에는 적지 않는다)
const HINT_KEY = 'poddk.hints.v1';
const hints = (() => { if (TEST_MODE) return {}; try { return JSON.parse(localStorage.getItem(HINT_KEY) || '{}') || {}; } catch { return {}; } })();
/** 이 길잡이를 아직 안 보여 줬는가. 물으면 보여 준 것으로 적는다 */
function firstTime(name) {
  if (hints[name]) return false;
  hints[name] = 1;
  if (!TEST_MODE) { try { localStorage.setItem(HINT_KEY, JSON.stringify(hints)); } catch { /* 저장소가 막혀 있으면 이번 방문 동안만 기억한다 */ } }
  return true;
}
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
  if (me.pop >= POP_SWAP) { crumble.burst(me.x, me.z); audio.snowFx('burst'); }      // 눈사람이 부서져 흩어진다: 와르르
  else if (me.snow > 0.35) audio.snowFx('shake');      // 머리와 어깨의 눈이 털린다: 후두둑
  else if (!quiet && me.snow > 0.15) audio.fx('rustle', 0.25);
  me.full = 0; me.pop = 0;
}

// ---------- 얼음낚시 ----------
const fishing = createFishing(scene, {
  penguin, audio, crumble, toast: (text, ms) => toast(text, ms),
  early: () => { if (firstTime('early')) toast('조금 일렀어요. 찌가 쑥 들어갈 때까지 기다려요', 3600); },
  free: (x, z) => { const c = field.confine(x, z); return Math.hypot(c.x - x, c.z - z) < 1e-6; },
});
/** 지금 낚시를 시작할 수 있는가: 낚시 구멍 곁에 서 있고, 다른 것을 하고 있지 않다 */
const canFish = () => started && me.inside === null && !me.angel && !me.slide && !me.flap && !fishing.active && holeNear(me.x, me.z) !== null;
const FISH_VIEW = { turn: 1.05, pitch: 0.22, look: 0.9 };      // 낚시하는 동안의 카메라: 등 뒤에서 이만큼(라디안) 옆으로 비켜서고, 조금 더 내려다보며, 펭귄보다 구멍 쪽을 본다
let fishTurn = 0;                // 낚시를 시작하며 카메라가 마저 돌아야 할 각 (라디안)
let fishView = 0;
let slideLift = 0;
let viewYaw = 0;                 // 이글루 안에서 카메라가 실제로 보는 쪽 (걷는 방향의 기준)               // 0(평소)..1(미끄러지는 중)                // 0(평소)..1(낚시를 들여다보는 중)
function startFishing() {
  const hole = canFish() ? holeNear(me.x, me.z) : null;
  if (!hole || !fishing.start(me, hole)) return;
  // 카메라가 등 뒤에 있으면 구멍도 찌도 낚인 물고기도 펭귄 몸에 가려 보이지 않는다: 옆으로 비켜서서 들여다본다 (낚싯대를 든 쪽으로)
  const rel = angleDiff(me.camYaw, Math.atan2(hole.x - me.x, hole.z - me.z));       // 0 이면 카메라가 정확히 등 뒤
  fishTurn = Math.abs(rel) >= FISH_VIEW.turn ? 0 : (Math.abs(rel) < 0.05 ? -1 : Math.sign(rel)) * FISH_VIEW.turn - rel;
  me.walk = 0;
  shakeOff(true); me.snow = 0;                           // 쌓인 눈은 앉으면서 털린다
  me.idle = 0;
  if (firstTime('fish')) toast('찌가 쑥 들어가면 물고기 단추를 눌러요. ✕는 그만두기예요', 4800);
}
/**
 * 가운데 버튼의 모습을 지금 할 수 있는 일에 맞춘다:
 *   평소 눈 천사 → 낚시 구멍 곁에서는 물고기(낚시하기) → 낚시 중에는 ✕(그만두기) → 입질이 오면 두근거리는 물고기(낚아 올리기)
 */
let actionShown = '';
function showAction() {
  const slideOff = fishing.active || !!me.angel || !!me.flap || me.inside !== null;          // 낚시나 눈 천사를 하는 동안에는 미끄러질 수 없다
  if ($('#slide').classList.contains('off') !== slideOff) $('#slide').classList.toggle('off', slideOff);
  const flapOff = fishing.active || !!me.angel || !!me.slide || !!me.seat;
  if ($('#flap').classList.contains('off') !== flapOff) $('#flap').classList.toggle('off', flapOff);
  const now = fishing.active ? (fishing.button === 'pull' ? 'pull' : fishing.button === 'quit' ? 'quit' : fishing.nibbling ? 'nib' : 'wait')
    : me.inside !== null ? (me.seat ? (me.seat.phase === 'sat' ? 'standup' : 'none') : dens.seatNear(me.inside, me.x, me.z) >= 0 ? 'sitdown' : dens.nearDoor(me.inside, me.x, me.z) ? 'exit' : 'none')
    : canFish() ? 'fish' : canEnter() >= 0 ? 'enter' : 'angel';
  if (now === actionShown) return;
  actionShown = now;
  const el = $('#angel');
  el.classList.toggle('fish', now === 'fish' || now === 'pull');
  el.classList.toggle('bite', now === 'pull');
  el.classList.toggle('quit', now === 'quit' || now === 'wait' || now === 'nib');
  el.classList.toggle('hold', now === 'wait');            // 낚아 올리거나 놓아주는 동안: 누를 수 없다
  el.classList.toggle('rest', now === 'nib');             // 가짜 입질이 지나가는 잠깐: 흐려져 쉰다 (눌러도 그만두지 않는다)
  for (const c of ['enter', 'exit', 'sitdown', 'standup', 'none']) el.classList.toggle(c, now === c);
  el.setAttribute('aria-label', { angel: '눈 천사 만들기', fish: '낚시하기', pull: '낚아 올리기', quit: '낚시 그만두기', wait: '낚시 그만두기', nib: '낚시 그만두기', enter: '이글루에 들어가기', exit: '이글루에서 나가기', sitdown: '방석에 앉기', standup: '일어나기', none: '할 수 있는 것이 없어요' }[now]);
}

/** 오른쪽 아래의 가운데 버튼(과 스페이스): 낚시 구멍 곁에서는 낚시, 낚시 중에는 낚아 올리기나 그만두기, 그 밖에서는 눈 천사 */
function act() {
  if (!started || me.slide || me.flap || giftOpen || busyDoor) return;
  if (me.inside !== null) {
    if (me.seat) { if (me.seat.phase === 'sat') standUp(); return; }
    const k = dens.seatNear(me.inside, me.x, me.z);
    if (k >= 0) sitDown(k);
    else if (dens.nearDoor(me.inside, me.x, me.z)) goOut();
    return;
  }
  if (fishing.active) fishing.press();
  else if (canEnter() >= 0) goIn(canEnter());
  else if (canFish()) startFishing();
  else startAngel();
}

// ---------- 눈 천사 ----------
const ANGEL = { down: 0.6, flap: 7.5, up: 0.8, sweeps: 5, canLeaveAfter: 2 };   // 눕기, 휘젓기, 일어나기 (초). 휘젓는 횟수. 이만큼 지나면 걸으려 할 때 일찍 일어난다
const LYING = [[0, -1.0], [0, 0.6], [-1.0, -0.38], [1.0, -0.38], [0, 0]];      // 누운 몸이 닿는 곳들 (선 자리 기준 [옆, 앞]): 머리, 발, 휘젓는 두 날개의 끝, 가운데
const ANGEL_REACH = 1.1;           // 눈 천사 자국이 선 자리에서 퍼지는 거리
/**
 * 눈 천사를 만들 자리. 누운 몸이 이글루 벽이나 나무에 파묻히지 않고 자국이 얼음 위로 넘어가지 않게, 필요하면 조금 비켜난 자리를 돌려준다.
 * 얼음 한가운데처럼 눈이 없는 곳이면 null.
 */
function roomToLie() {
  if (onIce(me.x, me.z)) return null;
  let x = me.x, z = me.z;
  const c = Math.cos(me.yaw), s = Math.sin(me.yaw);
  for (let pass = 0; pass < 5; pass++) {
    let px = 0, pz = 0;
    for (const p of PONDS) {                               // 연못 가장자리: 자국이 얼음에 걸치지 않을 만큼 물러난다
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), need = p.radius + ANGEL_REACH;
      if (d < need && d > 1e-4) { px = dx / d * (need - d); pz = dz / d * (need - d); }
    }
    for (const [lx, lz] of LYING) {                        // 이글루, 나무, 들판 끝: 몸의 어느 곳도 걸리지 않게
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      const free = field.confine(wx, wz), dx = free.x - wx, dz = free.z - wz;
      if (Math.hypot(dx, dz) > Math.hypot(px, pz)) { px = dx; pz = dz; }
    }
    if (Math.hypot(px, pz) < 1e-3) break;
    x += px; z += pz;
  }
  return { x, z };
}
function startAngel() {
  if (!started || me.inside !== null || me.angel || me.slide || me.flap || fishing.active) return;
  const to = roomToLie();
  if (!to) { toast('얼음 위에서는 눈 천사를 못 만들어요. 눈 위에서 해 봐요'); return; }
  me.angel = { t: 0, item: null, beats: 0, fell: false, from: { x: me.x, z: me.z }, to };
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
    const m = Math.min(1, u / 0.55), e = m * m * (3 - 2 * m);          // 누울 자리가 조금 비켜난 곳이면, 눕는 사이에 그리로 미끄러지듯 옮겨 간다 (자국이 찍히기 전에 다 옮긴다)
    me.x = a.from.x + (a.to.x - a.from.x) * e; me.z = a.from.z + (a.to.z - a.from.z) * e;
    if (!a.fell && u > 0.6) { a.fell = true; audio.fx('bodyfall', 0.7); a.item = tracks.addAngel(me.x, me.z, me.yaw, now); net.mark(1, me.x, me.z, me.yaw); }
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
controls.onAction(act);
$('#angel').addEventListener('click', act);

// ---------- 배 썰매 ----------
// 버튼을 누르면 배를 깔고 엎드려, 바라보던 쪽으로 쭉 미끄러지다가 천천히 멈추고 일어난다.
// 눈 위에서는 배로 쓸린 넓은 자국이 남고, 얼음 위에서는 자국 없이 훨씬 멀리 미끄러진다. 이글루나 나무에 닿으면 그 자리에서 멈춘다.
const SLIDE = {
  down: 0.32,            // 엎드리기 (초)
  push: 5.4,             // 엎드리며 밀고 나가는 빠르기 (초당 거리)
  snow: 2.1, ice: 0.55,  // 눈 위와 얼음 위에서 줄어드는 빠르기 (초당) — 얼음에서는 훨씬 덜 줄어 멀리 간다
  iceBoost: 1.35,        // 얼음 위에 들어서면 미끄러짐이 살아난다 (얼음 위에서 밀고 나간 빠르기의 배수 상한)
  stop: 0.3,             // 이보다 느려지면 멈춘다
  up: 0.55,              // 일어나기 (초)
};
function startSlide() {
  if (!started || giftOpen || me.inside !== null || me.seat || me.angel || me.slide || me.flap || fishing.active) return;
  me.slide = { t: 0, v: 0, phase: 'down', mark: 0, spray: 0, wiggle: 0, dist: 0, top: SLIDE.push };
  me.walk = 0;
  shakeOff(true); me.snow = 0; me.idle = 0;              // 엎드리면서 쌓인 눈이 털린다
  $('#slide').classList.add('busy');
  audio.slide.start();
}
function stepSlide(dt, now) {
  const s = me.slide;
  s.t += dt;
  const ice = onIce(me.x, me.z);
  let k = 1;
  if (s.phase === 'down') {
    const u = Math.min(1, s.t / SLIDE.down);
    k = u * u * (3 - 2 * u);
    s.v = SLIDE.push * Math.max(0, (u - 0.35) / 0.65);
    if (u >= 1) { s.phase = 'glide'; audio.fx('bodyfall', 0.45); crumble.puff(me.x + Math.sin(me.yaw) * 0.5, me.z + Math.cos(me.yaw) * 0.5, 0.45); }
  } else if (s.phase === 'glide') {
    s.v = Math.max(0, s.v - (ice ? SLIDE.ice : SLIDE.snow) * dt);
    if (ice && s.v < SLIDE.push * 0.75 && s.v > SLIDE.stop) s.v = Math.min(SLIDE.push * SLIDE.iceBoost, s.v + 0.9 * dt);      // 얼음 위: 미끄러움이 쉽게 죽지 않는다
    if (s.v < SLIDE.stop) { s.v = 0; s.phase = 'up'; s.t = 0; audio.slide.stop(); }
  } else {
    const u = Math.min(1, s.t / SLIDE.up);
    k = 1 - u * u * (3 - 2 * u);
    s.v = 0;
  }
  if (s.v > 0) {
    const dx = Math.sin(me.yaw), dz = Math.cos(me.yaw), want = s.v * dt;
    const c = field.confine(me.x + dx * want, me.z + dz * want);
    const moved = Math.hypot(c.x - me.x, c.z - me.z);
    me.x = c.x; me.z = c.z;
    if (moved < want * 0.45) { s.v = 0; s.phase = 'up'; s.t = 0; audio.slide.stop(); audio.fx('bodyfall', 0.3); }      // 무엇엔가 막혔다: 그 자리에서 멈춘다
    s.dist += moved;
    // 눈 위에는 배로 쓸린 자국을 조각조각 이어 남긴다 (얼음 위에는 남지 않는다)
    s.mark += moved;
    while (s.mark >= SLIDE_PIECE) {
      s.mark -= SLIDE_PIECE;
      const bx = me.x - dx * (0.25 + s.mark), bz = me.z - dz * (0.25 + s.mark);
      if (!onIce(bx, bz)) { tracks.addSlide(bx, bz, me.yaw, now); net.mark(2, bx, bz, me.yaw); }
    }
    // 눈 위에서는 앞쪽으로 눈가루가 살짝 튄다
    s.spray -= dt;
    if (!ice && s.spray <= 0 && s.v > 1.2) { s.spray = 0.22; crumble.puff(me.x + dx * 0.75, me.z + dz * 0.75, 0.22 + 0.04 * s.v); }
    if (s.phase === 'glide') audio.slide.level(Math.min(1, s.v / SLIDE.push), ice);
  }
  s.wiggle += dt * (4 + s.v);
  pose(penguin, me.phase, 0);
  belly(penguin, k, s.wiggle);
  if (s.phase === 'up' && s.t >= SLIDE.up) {
    belly(penguin, 0);
    me.slide = null; me.idle = 0; me.dist = 0;
    $('#slide').classList.remove('busy');
  }
}
$('#slide').addEventListener('click', startSlide);

// ---------- 서서 파닥파닥 ----------
// 제자리에서 양 날개를 빠르게 퍼덕인다. 머리와 어깨에 쌓인 눈은 털려 흩날리고(눈사람이었으면 부서지고), 가까이 있던 여우는 깜짝 놀라 쳐다본다
const FLAP = { len: 1.4, beats: 6 };
function startFlap() {
  if (!started || giftOpen || me.seat || me.angel || me.slide || me.flap || fishing.active) return;
  me.flap = { t: 0 };
  me.walk = 0;
  const hadSnow = me.snow > 0.35 || me.pop >= POP_SWAP;
  shakeOff(true);                                         // (소리는 아래에서 한꺼번에)
  if (hadSnow) { crumble.puff(me.x, me.z, 1.2); audio.snowFx('shake'); }      // 쌓인 눈이 흩날린다
  me.snow = 0; me.idle = 0;
  audio.snowFx('flap');
  fox.startle(me);
  $('#flap').classList.add('busy');
}
function stepFlap(dt) {
  const f = me.flap;
  f.t += dt;
  const u = Math.min(1, f.t / FLAP.len);
  const k = Math.min(1, u / 0.12, (1 - u) / 0.15);
  pose(penguin, me.phase, 0);
  flap(penguin, k, u * Math.PI * 2 * FLAP.beats);
  if (u >= 1) { flap(penguin, 0); me.flap = null; me.idle = 0; $('#flap').classList.remove('busy'); }
}
$('#flap').addEventListener('click', startFlap);
window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat) startFlap(); });      // PC: F 키로도 파닥인다
window.addEventListener('keydown', (e) => { if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) startSlide(); });      // PC: 시프트 키로도 미끄러진다

// ---------- 이글루 안 ----------
// 이글루 문 앞에 서면 가운데 단추가 "들어가기"가 된다. 들어가면 잠깐 어두워졌다가 모닥불이 타는 둥근 방 안에 선다.
// 방석 곁에서 단추를 누르면 앉고, 앉으면 지금 하는 일(상태)을 고를 수 있다. 문 앞에서 누르면 밖으로 나온다.
const ENTRANCES = IGLOOS.map((g) => { const r = Math.hypot(g.x, g.z); return { x: g.x - g.x / r * 5.1, z: g.z - g.z / r * 5.1, yaw: Math.atan2(g.x, g.z) }; });      // 문 바로 앞 (트리 쪽)
/** 들어갈 수 있는 이글루의 번호 (문 앞이 아니면 -1) */
function canEnter() {
  if (!started || me.inside !== null || me.angel || me.slide || me.flap || fishing.active) return -1;
  return ENTRANCES.findIndex((e) => Math.hypot(e.x - me.x, e.z - me.z) < 1.9);
}
let busyDoor = false;
/** 잠깐 어두워진 사이에 자리를 옮긴다 */
function throughDoor(move) {
  busyDoor = true;
  $('#fade').classList.add('on');
  setTimeout(() => { move(); placeCamera(0); camera.position.copy(camGoal); $('#fade').classList.remove('on'); busyDoor = false; }, manual ? 0 : 330);
}
function goIn(i) {
  if (busyDoor || i < 0) return;
  shakeOff(true); me.snow = 0; me.idle = 0; me.walk = 0;
  me.outside = { x: me.x, z: me.z, yaw: me.yaw };
  audio.fx('rustle', 0.35);
  throughDoor(() => { const d = dens.dens[i]; me.inside = i; me.x = d.spawn.x; me.z = d.spawn.z; me.yaw = me.camYaw = d.spawn.yaw; me.camOut = me.camDist; me.camDist = DEN_CAM.start; if (firstTime('den')) toast('따뜻하다! 방석에 앉아 쉬어 가요', 3200); });
}
function goOut() {
  if (busyDoor || me.inside === null) return;
  const i = me.inside, e = ENTRANCES[i];
  audio.fx('rustle', 0.35);
  throughDoor(() => { me.inside = null; me.x = e.x; me.z = e.z; me.yaw = me.camYaw = e.yaw + Math.PI; me.idle = 0; if (me.camOut) me.camDist = me.camOut; });      // 문 앞에서 트리 쪽을 보고 선다
}
function sitDown(k) {
  const s = dens.dens[me.inside].seats[k];
  me.seat = { k, t: 0, phase: 'down', from: { x: me.x, z: me.z, yaw: me.yaw }, to: { x: s.x, z: s.z, yaw: s.yaw } };
  me.walk = 0;
}
function standUp() { if (me.seat) { me.seat.phase = 'up'; me.seat.t = 0; closeStatus(); showSay(); } }
const SIT_T = 0.5;
function stepSeat(dt) {
  const s = me.seat;
  s.t += dt;
  let k = 1;
  if (s.phase === 'down') {
    const u = Math.min(1, s.t / SIT_T), e = u * u * (3 - 2 * u); k = e;
    me.x = s.from.x + (s.to.x - s.from.x) * e; me.z = s.from.z + (s.to.z - s.from.z) * e;
    me.yaw = s.from.yaw + angleDiff(s.to.yaw, s.from.yaw) * e;
    if (u >= 1) { s.phase = 'sat'; openStatus(); }
  } else if (s.phase === 'up') {
    const u = Math.min(1, s.t / SIT_T); k = 1 - u * u * (3 - 2 * u);
    if (u >= 1) { me.seat = null; k = 0; }
  }
  pose(penguin, me.phase, 0);
  sit(penguin, k);
  penguin.userData.wings[1].rotation.x = -0.35 * k;       // (낚시할 때처럼 날개를 들지 않고 무릎 위에 둔다)
  showSay();
}
// 상태 고르기
const statusList = $('#status .status-list');
for (const [emoji, text] of STATUSES) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = emoji + ' ' + text; b.dataset.text = text;
  b.addEventListener('click', () => { me.status = [emoji, text]; closeStatus(); showSay(); });
  statusList.append(b);
}
function openStatus() {
  for (const b of statusList.children) b.setAttribute('aria-pressed', String(!!me.status && b.dataset.text === me.status[1]));
  $('#status').hidden = false;
}
function closeStatus() { $('#status').hidden = true; }
$('#status .status-close').addEventListener('click', () => { me.status = null; closeStatus(); showSay(); });
$('#me-say').addEventListener('click', () => { if (me.seat && me.seat.phase === 'sat') openStatus(); });
const sayHead = new THREE.Vector3();
/** 앉아서 고른 상태를 머리 위 말풍선으로 */
function showSay() {
  const el = $('#me-say'), on = !!(me.seat && me.seat.phase === 'sat' && me.status) && $('#status').hidden;
  if (el.hidden === on) el.hidden = !on;
  if (!on) return;
  const text = me.status[0] + ' ' + me.status[1];
  if (el.dataset.text !== text + name) { el.dataset.text = text + name; el.innerHTML = ''; el.append(text); const sm = document.createElement('small'); sm.textContent = name; el.append(sm); }
  sayHead.set(me.x, 1.75, me.z).project(camera);
  el.style.left = ((sayHead.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - sayHead.y) / 2 * innerHeight) + 'px';
}
let crackleIn = 0;

// ---------- 내 이름 ----------
let name = myName(!TEST_MODE);
function showName() { $('#my-name').textContent = name; }
showName();
$('#rename').addEventListener('click', () => { name = rename(!TEST_MODE); showName(); });

// ---------- 함께 걷는 눈밭 ----------
const net = createNet({
  url: q.get('server') === 'off' ? '' : (q.get('server') || SERVER_URL), scene, camera, tracks, look, name: () => name,
  onCount: (n) => { $('#peers').textContent = `함께 걷는 펭귄 ${n}마리`; $('#peer-row').hidden = n === 0; },
});
/** 내 모습을 서버에 보낼 꼴로 */
function myState() {
  const a = me.angel ? ACT.angel : me.slide ? ACT.slide : me.flap ? ACT.flap : fishing.active ? ACT.fish : me.seat ? ACT.sit : me.pop >= 1 ? ACT.snowman : ACT.stand;
  const st = me.seat && me.seat.phase === 'sat' && me.status ? STATUSES.findIndex((x) => x[1] === me.status[1]) : -1;
  return { x: me.x, z: me.z, yaw: me.yaw, w: Math.min(1, Math.max(0, me.walk)), a, i: me.inside === null ? -1 : me.inside, k: me.seat ? me.seat.k : -1, st };
}

// ---------- 크리스마스 선물 ----------
let giftOpen = null;             // 열고 있는 선물 { g, taps }
const GIFT_TAPS = 3;
function openGift(g) {
  giftOpen = { g, taps: 0 };
  me.walk = 0;
  controls.setEnabled(false);
  const el = $('#gift'), box = el.querySelector('.gift-box');
  el.className = '';
  const PAPER = ['#e8503f', '#3f8f6a', '#4f7fd0', '#e7b23c', '#c066b8', '#f08aa0'], RIBBON = ['#fff3c4', '#ffffff', '#ffd75e', '#f9e1e6'];
  box.style.setProperty('--paper', PAPER[g.i % PAPER.length]); box.style.setProperty('--ribbon', RIBBON[g.i % RIBBON.length]);
  el.hidden = false;
  audio.snowFx('ding');
}
function tapGift() {
  const o = giftOpen;
  if (!o || o.taps >= GIFT_TAPS) return;
  o.taps++;
  const el = $('#gift');
  if (o.taps < GIFT_TAPS) { el.className = ''; void el.offsetWidth; el.className = 'tap' + o.taps; audio.snowFx('paper'); return; }
  const [emoji, name] = xmas.open(o.g);
  o.present = name;
  el.querySelector('.emoji').textContent = emoji;
  el.querySelector('.name').textContent = name;
  el.className = 'opened';
  audio.snowFx('tear');
  setTimeout(() => audio.snowFx('ding'), 260);
}
function closeGift() {
  if (!giftOpen || giftOpen.taps < GIFT_TAPS) return;
  giftOpen = null;
  $('#gift').hidden = true; $('#gift').className = '';
  controls.setEnabled(true);
}
$('#gift .gift-box').addEventListener('click', tapGift);
$('#gift .gift-close').addEventListener('click', closeGift);
// 트리 옆 산타의 말풍선: 산타가 와 있고, 가까이(30 안) 화면에 보일 때 머리 위에
const sayAt = new THREE.Vector3();
function placeSantaSay() {
  const el = $('#santa-say');
  let show = started && xmas.santaHere && Math.hypot(me.x - xmas.santaAt.x, me.z - xmas.santaAt.z) < 30;
  if (show) {
    sayAt.copy(xmas.santaHead).project(camera);
    show = sayAt.z < 1 && Math.abs(sayAt.x) < 1.1 && Math.abs(sayAt.y) < 1.1;
    const half = el.offsetWidth / 2 + 10;      // 말풍선이 화면 밖으로 잘리지 않게
    if (show) el.style.left = Math.min(innerWidth - half, Math.max(half, (sayAt.x + 1) / 2 * innerWidth)) + 'px', el.style.top = Math.max(60, (1 - sayAt.y) / 2 * innerHeight) + 'px';
  }
  if (el.classList.contains('show') !== show) el.classList.toggle('show', show);
}

// ---------- 처음의 길잡이 ----------
// 들어오자마자 화면에 "밀어서 걷기", "끌어서 둘러보기"가 잠깐 보인다. 해 보면 그 길잡이는 사라지고, 가만히 있어도 얼마 뒤에는 사라진다
const coach = {
  walked: 0, looked: 0, until: 0, on: false,
  show() {
    if (hints.coach) return;                               // 한 번 해 본 기기에서는 다시 나오지 않는다
    $('#coach .walk b').textContent = coarse ? '밀어서 걷기' : '방향키로 걷기';
    $('#coach .look b').innerHTML = coarse ? '끌어서 둘러보기<br><small>두 손가락으로 가까이·멀리</small>' : '마우스로 끌어 둘러보기<br><small>휠로 가까이·멀리</small>';      // (확대·축소 단추가 없으므로 여기서 알려 준다)
    document.body.classList.add('coach-walk', 'coach-look');
    this.on = true; this.walked = 0; this.looked = 0; this.until = performance.now() + 16000;
  },
  /** moved: 방금 걸은 거리, looked: 방금 둘러본 양(px) */
  note(moved, looked) {
    if (!this.on) return;
    this.walked += moved; this.looked += looked;
    const late = performance.now() > this.until;
    if (this.walked > 1 || late) document.body.classList.remove('coach-walk');
    if (this.looked > 60 || late) document.body.classList.remove('coach-look');
    this.on = document.body.classList.contains('coach-walk') || document.body.classList.contains('coach-look');
    if (!this.on) firstTime('coach');
  },
};

// ---------- 한 박자 ----------
const fwd = new THREE.Vector3(), camGoal = new THREE.Vector3(), lookAt = new THREE.Vector3(), focus = new THREE.Vector3();
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
let started = false;
let seconds = 0;                 // 흐른 시간 (눈송이의 움직임용)
let hudAt = 0, saveAt = 0, frame = 0;
let angelLift = 0;               // 0(평소)..1(눈 천사를 내려다보는 중)

let strolled = 0, rested = 9;    // 이어서 걸은 시간과 멈춰 선 시간(초): 걷는 동안에는 위쪽 글이 물러나고, 멈춰 서면 다시 나온다
let hudAway = false;
const HUD_HIDE_AFTER = 0.9, HUD_BACK_AFTER = 1.3;
let manual = false;              // 자동 점검용: 켜면 화면은 그리되 시간은 sim() 으로만 흐른다

function walk(dt, now) {
  const mv = giftOpen || busyDoor ? { x: 0, y: 0 } : controls.read();      // 선물 창이 떠 있거나 문을 드나드는 동안에는 걷지 않는다
  const mag = Math.min(1, Math.hypot(mv.x, mv.y));
  // 둘러보기: 오른쪽으로 끌면 오른쪽을, 위로 끌면 위를 본다
  const lk = controls.takeLook();
  me.camYaw -= lk.dx * 0.0052;
  me.camPitch = THREE.MathUtils.clamp(me.camPitch + lk.dy * 0.0035, 0.08, 0.75);
  me.camDist = THREE.MathUtils.clamp(me.camDist * controls.takeZoom(), CAM_DIST_MIN, me.inside !== null ? DEN_CAM.far : CAM_DIST_MAX);
  coach.note(0, Math.abs(lk.dx) + Math.abs(lk.dy));
  if (mag > 0.02 && !me.angel && !fishing.active) { strolled += dt; rested = 0; } else { rested += dt; strolled = 0; }

  if (me.angel) { stepAngel(dt, now); setSnow(penguin, me.snow, me.pop); return; }
  if (me.slide) { stepSlide(dt, now); setSnow(penguin, 0, 0); return; }      // 미끄러지는 동안에는 걷지 않는다
  if (me.flap) { stepFlap(dt); setSnow(penguin, 0, 0); return; }
  if (me.seat) { stepSeat(dt); setSnow(penguin, 0, 0); me.idle = 0; me.snow = 0; return; }      // 앉아 있는 동안에는 걷지 않는다 (일어나려면 단추)        // 파닥이는 동안에도 제자리      // 누울 때 털린 눈이 모습에도 바로 드러나게

  if (fishing.active) {
    // 낚시하는 동안: 조이스틱을 밀어도 걷지 않는다 (그만두려면 버튼을 누른다). 눈은 서 있을 때만 쌓이므로, 앉아 있는 동안에는 쌓이지 않는다
    if (Math.abs(lk.dx) + Math.abs(lk.dy) > 0) fishTurn = 0;          // 직접 둘러보기 시작하면 카메라를 더 돌리지 않는다
    const turn = fishTurn * (1 - Math.exp(-dt * 3.4)); me.camYaw += turn; fishTurn -= turn;
    me.walk = 0;
    pose(penguin, me.phase, 0);
    fishing.step(dt, me);
    me.idle = 0; me.snow = 0;
    setSnow(penguin, 0, 0);
    return;
  }
  fishing.step(dt, me);                                  // (물결이 마저 퍼지게)

  if (mag > 0.02) {
    // 카메라가 보는 방향 기준으로 걷는다 (앞 = 화면 안쪽)
    const base = me.inside !== null ? viewYaw : me.camYaw, fx = Math.sin(base), fz = Math.cos(base);
    let dx = fx * mv.y + -fz * mv.x, dz = fz * mv.y + fx * mv.x;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const want = Math.atan2(dx, dz);
    me.yaw += THREE.MathUtils.clamp(angleDiff(want, me.yaw), -TURN_RATE * dt, TURN_RATE * dt);
    const speed = WALK_SPEED * mag;
    const c = me.inside !== null ? dens.confine(me.inside, me.x + dx * speed * dt, me.z + dz * speed * dt) : field.confine(me.x + dx * speed * dt, me.z + dz * speed * dt);
    const moved = Math.hypot(c.x - me.x, c.z - me.z);
    me.x = c.x; me.z = c.z;
    coach.note(moved, 0);
    if (!giftOpen) { const g = xmas.touch(me.x, me.z); if (g) openGift(g); }
    if (c.edge && me.inside === null && performance.now() - me.edgeAt > 7000) { me.edgeAt = performance.now(); toast('여기부터는 눈이 너무 깊어요'); }
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
      const ice = onIce(px, pz), indoors = me.inside !== null;      // 얼음 위와 이글루 안: 발자국이 남지 않고, 발소리는 다져진 눈처럼 낮게 난다
      const packed = ice || indoors || tracks.isPacked(px, pz, now);
      if (!ice && !indoors) { tracks.addPrint(px, pz, me.yaw, me.side, now); net.mark(0, px, pz, me.yaw, me.side); }
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
    if (me.idle > IDLE_BEFORE_SNOW && me.inside === null) {      // (이글루 안에는 눈이 내리지 않는다)
      // 머리와 어깨에 쌓이고 → 다 쌓인 채 잠시 더 서 있으면 → 뿅 하고 눈사람이 된다
      if (me.snow < 1) me.snow = Math.min(1, me.snow + dt / SNOW_FILL_SEC * (1 + 3 * Math.max(0, snowfallAt(now) - 0.35)));
      else if (me.full < SNOWMAN_WAIT) me.full += dt;
      else if (me.pop < 1) {
        const before = me.pop;
        me.pop = Math.min(1, me.pop + dt / POP_SEC);
        if (before < POP_SWAP && me.pop >= POP_SWAP) { crumble.puff(me.x, me.z); audio.snowFx('pop'); }      // 바뀌는 순간 눈가루가 폭 퍼지고 "뿅" 소리가 난다
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
  fishView += ((fishing.active ? 1 : 0) - fishView) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
  slideLift += ((me.slide ? 1 : 0) - slideLift) * (dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1);      // 미끄러지는 동안 카메라가 조금 올라가 엎드린 몸과 자국이 보이게
  const pitch = Math.min(1.25, me.camPitch + angelLift * 0.62 + fishView * FISH_VIEW.pitch + slideLift * 0.32 + (me.inside !== null ? 0.3 : 0));      // 이글루 안에서는 조금 내려다본다
  const dist = me.camDist + angelLift * 1.2 + slideLift * 1.6;
  camGoal.copy(focus).addScaledVector(fwd, -dist * Math.cos(pitch));
  camGoal.y = CAM_TARGET_H + dist * Math.sin(pitch);
  if (me.inside !== null) {
    // 이글루 안: 바깥처럼 펭귄 뒤 조금 위에서 내려다본다. 벽은 안쪽 면만 그려지므로, 카메라가 벽 밖으로 물러나도 방이 가리지 않고
    // 지붕을 걷어 낸 것처럼 넓게 보인다. 끌어서 돌리고, 두 손가락이나 휠로 가까이·멀리 한다. 걷는 방향의 기준은 카메라가 실제로 보는 쪽이다
    const d = THREE.MathUtils.clamp(me.camDist, DEN_CAM.near, DEN_CAM.far), pitch = DEN_CAM.pitch + (d - DEN_CAM.near) / (DEN_CAM.far - DEN_CAM.near) * DEN_CAM.tilt;
    const cx = me.x - Math.sin(me.camYaw) * d * Math.cos(pitch), cz = me.z - Math.cos(me.camYaw) * d * Math.cos(pitch);
    camGoal.set(cx, 0.9 + d * Math.sin(pitch), cz);
    const k = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    camera.position.lerp(camGoal, k);
    viewYaw = Math.atan2(me.x - camera.position.x, me.z - camera.position.z);
    lookAt.set(me.x + Math.sin(me.camYaw) * 0.6, 0.7, me.z + Math.cos(me.camYaw) * 0.6);
    camera.lookAt(lookAt);
    return;
  }
  const k = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
  camera.position.lerp(camGoal, k);
  // 펭귄보다 조금 앞·위를 본다: 하늘이 화면 위쪽에 넉넉히 들어온다 (이글루 안에서는 펭귄을 본다)
  lookAt.copy(focus).addScaledVector(fwd, (me.inside !== null ? 0.8 : 2.4) * (1 - angelLift) * (1 - fishView)); lookAt.y += 0.55 * (1 - angelLift) * (1 - fishView * 0.7);
  if (fishView > 0.001) { lookAt.x += Math.sin(me.yaw) * FISH_VIEW.look * fishView; lookAt.z += Math.cos(me.yaw) * FISH_VIEW.look * fishView; }      // 낚시 중에는 펭귄과 구멍 사이를 본다
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
  weather.points.visible = me.inside === null;              // 이글루 안에는 눈이 내리지 않는다
  for (const [i, d] of dens.dens.entries()) d.group.visible = me.inside === i;
  dens.update(dt, camera);
  if (me.inside !== null && started) {                       // 모닥불이 타닥타닥
    crackleIn -= dt;
    if (crackleIn <= 0) { crackleIn = 0.04 + Math.random() * 0.22; const c = dens.dens[me.inside].center; audio.snowFx('crackle', Math.max(0.15, 1 - Math.hypot(me.x - c.x, me.z - c.z) / 7)); }
  }
  // 해가 지평선 가까이 내려오면 나무의 전구에 불이 들어온다
  const night = THREE.MathUtils.clamp((3 - palette.elev) / 9, 0, 1);
  field.tree.update(seconds, night, renderer.domElement.height, camera);
  camp.update(night, seconds, camera, scene.fog);
  fox.update(now, dt, me);
  xmas.update(now, dt, seconds, me, () => audio.snowFx('hohoho'));
  placeSantaSay();
  if (me.seat) showSay();
  if (started) { net.me(myState()); net.update(dt, me.inside === null ? -1 : me.inside); }
  santa.update(now, camera, palette.elev);
  if (frame % 2 === 0) tracks.update(now);
  audio.setWeather(me.inside !== null ? 0 : snowfall);
  audio.setIndoor(me.inside !== null);
  if (frame % 6 === 0) audio.setTreeDistance(Math.hypot(me.x, me.z));

  if (t - hudAt > 500) {
    hudAt = t;
    $('#clock').textContent = clockText(now);
    $('#storm').textContent = stormText(now);
    const carol = audio.carolTitle;
    $('#carol').textContent = carol;
    $('#carol-row').hidden = !carol;
    document.body.dataset.storm = stormPhase(now);
    document.body.dataset.sky = palette.elev > 6 ? 'day' : palette.elev > -6 ? 'dusk' : 'night';      // 시각 옆의 그림: 해, 지평선의 해, 달
    if (canFish() && firstTime('hole')) toast('얼음 구멍이에요. 낚시 한번 해 볼래요?', 3600);
  }
  showAction();
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
  $('#enter').blur();                 // 누른 버튼에 초점이 남아 있으면 스페이스(눈 천사)가 이 버튼의 몫이 된다
  audio.start();
  net.start();
  controls.setEnabled(true);
  document.body.classList.add('in');
  coach.show();
});
$('#mute').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  $('#mute').setAttribute('aria-pressed', String(audio.muted));
  $('#mute').setAttribute('aria-label', audio.muted ? '소리 켜기' : '소리 끄기');
});

// 손가락이나 마우스로 누른 버튼에는 초점을 남기지 않는다 (그래야 그 뒤의 스페이스가 눈 천사로 간다. 키보드로 고른 버튼은 그대로 둔다)
for (const el of document.querySelectorAll('#mute, #shot, #slide, #angel, #flap')) el.addEventListener('click', (e) => { if (e.detail > 0) el.blur(); });
// (눌렀다가 단추 밖에서 떼면 click 이 오지 않는다: 마우스로 누르는 것만으로는 아예 초점을 받지 않게 한다)
for (const el of document.querySelectorAll('#mute, #shot, #slide, #angel, #flap')) el.addEventListener('mousedown', (e) => e.preventDefault());

// 누른 단추는 살짝 커졌다가 제자리로 돌아온다 (0.2초쯤)
for (const el of document.querySelectorAll('#mute, #shot, #slide, #angel, #flap, #enter')) {
  el.addEventListener('click', () => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); });
  el.addEventListener('animationend', (e) => { if (e.animationName === 'pop') el.classList.remove('pop'); });
}


// 캡쳐 버튼: 버튼과 글자를 뺀 눈밭만 사진으로 남긴다
const shoot = createCapture({ canvas, draw: () => renderer.render(scene, camera), touch: coarse });
let lastShot = null;
async function takePhoto() {
  if (!started) return null;
  const flash = $('#flash');
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  $('#shot').classList.add('busy');
  try {
    lastShot = await shoot();
    if (lastShot && lastShot.how === 'download') toast('사진을 담았어요');
    if (lastShot && lastShot.how === 'show') showPhoto(lastShot.url);
  } catch (e) {
    console.warn('[capture]', e && e.message);
    toast('사진을 담지 못했어요');
  } finally { $('#shot').classList.remove('busy'); }
  return lastShot;
}
$('#shot').addEventListener('click', takePhoto);
/** 찍은 사진을 화면에 띄운다 (공유 창도 내려받기도 없는 휴대폰 브라우저에서: 길게 눌러 저장한다). 사진 밖이나 닫기를 누르면 닫힌다 */
function showPhoto(url) {
  const box = $('#photo');
  box.querySelector('img').src = url;
  box.hidden = false;
}
$('#photo').addEventListener('click', (e) => {
  if (e.target.tagName === 'IMG') return;                 // 사진 자체는 길게 눌러 저장할 수 있게 둔다
  const box = $('#photo'), img = box.querySelector('img');
  box.hidden = true;
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.removeAttribute('src');
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
  clock, me, look, tracks, audio: audio.stats, controls, sky, penguin, crumble, fox, santa, camp, weather, camera,
  place: { hole: HOLES[0], holes: HOLES, igloos: IGLOOS, ponds: PONDS, onIce, holeNear },
  get started() { return started; },
  get snowfall() { return snowfallAt(clock.now()); },
  get palette() { return sky.palette; },
  get treeLight() { return field.tree.lamp.intensity; },
  net, angel: startAngel, slide: startSlide, flap: startFlap, act, fishing, xmas, dens, entrances: ENTRANCES, goIn, goOut, get inside() { return me.inside; }, get seat() { return me.seat; }, get status() { return me.status; }, get name() { return name; }, get gift() { return giftOpen; }, tapGift, closeGift,
  photo: takePhoto, get lastShot() { return lastShot; },
  teleport(x, z) { const c = me.inside !== null ? dens.confine(me.inside, x, z) : field.confine(x, z); me.x = c.x; me.z = c.z; },
  /** 지금의 조작 상태로 sec 초를 한꺼번에 흘려보낸다 (화면을 그리지 않고 걷기만 — 느린 기기에서도 같은 결과) */
  sim(sec) { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { walk(1 / 60, clock.now()); crumble.update(1 / 60); } },
  /** 켜 두면 실제 프레임으로는 시간이 흐르지 않고 sim() 으로만 흐른다 (점검에서 한 순간을 정확히 붙잡을 때) */
  get manual() { return manual; }, set manual(on) { manual = !!on; },
  ready: true,
};
