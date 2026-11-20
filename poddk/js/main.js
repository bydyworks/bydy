// 뽀드득 (poddk) — Walking in a Winter Wonderland: 눈밭을 걷는 작은 공간. (1단계 — 혼자 걷는 버전)
// 직접 걸어야 뽀드득 소리가 나고, 지나간 자리에 발자국이 남는다. 실제 시각에 따라 하늘과 그림자가 바뀌고,
// 세 시간마다 폭설이 모든 발자국을 지운다.
import * as THREE from 'three';
import { createClock, snowfallAt, stormPhase, clockText, stormText } from './clock.js';
import { createSky } from './sky.js';
import { createField, FIELD_RADIUS } from './field.js';
import { build as buildPenguin, pose, setSnow, lie, belly, flap, sit, wave, randomLook, COLORS, STEP, STANCE, POP_SWAP, ROD_GRIP } from './penguin.js';
import { createSnowballs } from './snowball.js';
import { buildSnowman, makeRollBall, paint, packPoints, PAD, INKS, WIDTHS, MAX_POINTS } from './snowman.js';
import { createWishboard, WISHBOARD } from './wishboard.js';
import { createSled, LANE, onLane, onPad, laneCoord } from './sled.js';
import { createFlakes, makeFlake, makeHeadStar, bobHeadStar } from './flakes.js';
import { createRabbit, createSeals } from './critters.js';
import { createCampfire, makeStick, CAMPFIRE, STUMP_BLOCKS, STUMP_SEAT_Y, ROAST_REACH, STICK_LEN, donenessAt, marshmallowColor } from './campfire.js';
import { createAurora, auroraAt, nightId } from './aurora.js';
import { createHill, heightAt, onHill, canWalk, slidesOff, nearStairFoot, onTop, HILL } from './hill.js';
import { createCrumble } from './crumble.js';
import { createFox, COATS } from './fox.js';
import { createSanta } from './santa.js';
import { createCamp, BLOCKS, CLEARINGS, onIce, holeNear, HOLES, IGLOOS, PONDS } from './igloo.js';
import { createFishing, makeCatch, CATCHES, objectOf } from './fishing.js';
import { createShowcase } from './showcase.js';
import { ITEMS, SLOTS, wear, worn, makeItem } from './outfit.js';
import { createPostbox, POSTBOX, subject } from './postbox.js';
import { createXmas, makeGiftBox } from './xmas.js';
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
import { setupInstall } from './install.js';

const $ = (sel) => document.querySelector(sel);
const q = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const SAVE_KEY = 'snow.v1';
const TEST_MODE = (q.has('t') || q.has('speed')) && !q.has('persist');     // 시각을 바꿔 보는 시험 중에는 기기에 저장하지 않는다

// 걷는 빠르기 (단위/초) — 1초에 두 걸음 반쯤. 들판을 가로지르는 데 3분. 빠르기를 견주어 볼 때는 주소에 ?walk=1.05 처럼 붙인다
const WALK_SPEED = (() => { const v = Number(q.get('walk')); return v >= 0.6 && v <= 2 ? v : 1.25; })();
const TURN_RATE = 9;              // 몸을 돌리는 빠르기 (라디안/초)
const CAM_DIST = 6.6, CAM_DIST_MIN = 3.2, CAM_DIST_MAX = 18, CAM_TARGET_H = 1.05;
const DEN_CAM = { near: 2.4, far: 13, start: 8.5, pitch: 0.42, tilt: 0.38, low: -0.04, high: 1.25 };      // (위아래로 끌면 펭귄 눈높이까지 내려와 정면도 볼 수 있다: low..high)      // 이글루 안 카메라: 가장 가까이·멀리, 들어갔을 때의 거리, 내려다보는 각도(가까이)와 멀어질수록 더 내려다보는 만큼
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
const fieldBlocks = [...BLOCKS, POSTBOX, WISHBOARD, CAMPFIRE, ...STUMP_BLOCKS];      // (눈사람이 서면 여기에 더한다)
const field = createField(scene, { clearings: CLEARINGS, blocks: fieldBlocks });
const wishboard = createWishboard(scene);  // 트리 뒤쪽의 크리스마스 소원판
const sled = createSled(scene);            // 썰매 경주 길
const hill = createHill(scene);            // 슬라이딩 언덕
const campfire = createCampfire(scene);    // 들판의 모닥불 (마시멜로 굽기)
const aurora = createAurora(scene);        // 어떤 밤에 뜨는 오로라
const AURORA_FORCED = q.has('aurora');     // 주소에 ?aurora: 그날 밤이 아니어도 띄운다 (구경용)
let auroraSaid = null;                     // 오로라 알림을 띄운 밤 (한 밤에 한 번만)
const postbox = createPostbox(scene);      // 트리 옆 우체통 (친구에게 엽서 보내기)
const camp = createCamp(scene);            // 이글루 셋과 얼음 낚시터 셋
const dens = createDens(scene);            // 이글루 셋의 안쪽 방 (들판 밖 먼 곳에 지어 둔다)
const tracks = createTracks(scene);
const crumble = createCrumble(scene);
const fox = createFox(scene, tracks, { skipPaw: (x, z) => onIce(x, z) || onLane(x, z) });      // 얼음 위에는 발자국이 남지 않는다
const arctic = createFox(scene, tracks, { skipPaw: (x, z) => onIce(x, z) || onLane(x, z), kind: 1, coat: COATS.arctic });      // 하얀 북극여우: 붉은여우와 다른 길로 다닌다
const foxes = [fox, arctic];
const santa = createSanta(scene);
// 크리스마스: 눈밭 곳곳의 선물 상자와 트리 옆의 산타. 선물은 눈 위의 빈자리(얼음, 이글루, 나무 곁이 아닌 곳)에만 놓인다
/** 눈 위의 빈자리인가 (얼음, 이글루, 나무 곁, 썰매 길이 아닌 곳): 선물 상자와 특별한 눈송이가 놓이는 자리 */
const openSnow = (x, z) => {
  if (Math.hypot(x, z) < 7 || PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 1.5) || IGLOOS.some((g) => Math.hypot(x - g.x, z - g.z) < g.radius + 4)) return false;
  if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.r + 2.5 || Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 4.5) return false;
  const c = laneCoord(x, z); if (c.along > -LANE.pad - 3 && c.along < LANE.len + 2 && Math.abs(c.side) < LANE.half + 3) return false;
  const f = field.confine(x, z); return Math.hypot(f.x - x, f.z - z) < 1e-6;
};
const nearTree = (x, z) => { const f = field.confine(x, z); return Math.hypot(f.x - x, f.z - z) < 1e-6 && Math.hypot(x - POSTBOX.x, z - POSTBOX.z) > 3.2 && Math.hypot(x - WISHBOARD.x, z - WISHBOARD.z) > 3.6; };      // 트리 둘레에 선물을 둘 수 있는가 (우체통·소원판·들어오는 자리는 비켜서)
const xmas = createXmas(scene, { crumble: { puff: (...a) => crumble.puff(...a) }, free: openSnow, nearTree });
const flakes = createFlakes(scene, { free: openSnow });      // 가끔 내려앉는 특별한 눈송이 (육각, 하트, 밤의 별)
const rabbit = createRabbit(scene, tracks, { free: (x, z) => openSnow(x, z) || onLane(x, z) });      // 밤에만 나오는 눈토끼
const seals = createSeals(scene, PONDS, { puff: (x, z, s) => crumble.puff(x, z, s) });      // 연못마다 아기 물개
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
    if (saved.star != null && saved.star === nightId(clock.now())) me.star = true;      // (같은 밤이면 주운 별이 그대로 머리 위에)
    tracks.restore(saved.tracks, clock.now());
  } catch { /* 저장된 것이 깨졌으면 새로 시작한다 */ }
}
function save() {
  if (TEST_MODE) return;
  try {
    const at = me.inside !== null && me.outside ? me.outside : me;      // 이글루 안에 있으면 들어가기 전의 자리를 적는다
    localStorage.setItem(SAVE_KEY, JSON.stringify({ x: at.x, z: at.z, yaw: at.yaw, camYaw: me.camYaw, camDist: me.inside !== null && me.camOut ? me.camOut : me.camDist, star: me.star ? nightId(clock.now()) : null, tracks: tracks.dump(clock.now()) }));
  } catch { /* 저장소가 꽉 찼거나 막혀 있으면 그냥 넘어간다 */ }
}
const TITLE_VIEW = { x: me.x, z: me.z, camYaw: me.camYaw, pitch: me.camPitch, dist: me.camDist };      // 타이틀 화면의 카메라 (처음 들어오는 자리, 저장된 자리를 불러오기 전 값)
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
// ---------- 새 놀이 발견 ----------
// 처음 해 본 놀이마다 위쪽에 작은 쪽지가 뿅: "✨ 새 놀이 발견! 눈 천사 · 3/15" — 아 이것도 되네~ 하고 알게 되도록 (기기마다 한 번씩)
const FINDS = { walk: '뽀드득 걷기', slide: '배 썰매', angel: '눈 천사', flap: '파닥파닥', wave: '친구에게 인사', snowball: '눈덩이 던지기', snowman: '눈사람 만들기', fish: '얼음 낚시', igloo: '이글루 놀러 가기', hill: '언덕 슬라이딩', race: '썰매 경주', roast: '마시멜로 굽기', wish: '소원 붙이기', mail: '엽서 보내기', flake: '특별한 눈송이' };
let foundTimer = 0;
function found(key) {
  if (!FINDS[key] || !firstTime('found-' + key)) return;
  const n = Object.keys(FINDS).filter((k) => hints['found-' + k]).length;
  const el = $('#found');
  el.innerHTML = `✨ 새 놀이 발견! <b>${FINDS[key]}</b> <small>${n}/${Object.keys(FINDS).length}</small>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  audio.snowFx('ding');
  clearTimeout(foundTimer); foundTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
let toastTimer = 0, toastUntil = 0;
function toast(text, ms = 2600) {
  toastUntil = performance.now() + ms;
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
  caught: (kind) => showCatch(kind),
  aurora: () => aurora.strength > 0.4,
});
// 낚아 올린 것을 보여 주는 창: 선물을 받을 때처럼 작은 카드가 뿅 튀어나오고, 그 안에서 낚은 것이 3D 로 빙글 돈다
const showcase = createShowcase();
const CATCH_SAY = {
  smelt: '은빛으로 반짝이는 작은 빙어', cherry: '알록달록 무늬가 예쁜 산천어', trout: '묵직한 손맛! 커다란 송어', carp: '통통하게 살이 오른 붕어',
  aurora: '오로라 빛을 머금고 반짝이는 빙어! 오로라가 뜬 밤에만 만날 수 있어요', catfish: '수염이 멋진 메기 아저씨', goldcarp: '눈부신 황금빛! 행운이 올 것 같아요', boot: '누가 빠뜨렸을까? 물이 뚝뚝…', mitten: '누가 잃어버린 한 짝일까요?',
  duck: '꽥! 목욕하다 놀러 나왔나 봐요', can: '눈밭은 깨끗하게! 잘 건졌어요', bottle: '안에 누군가의 편지가 들어 있어요', treasure: '와, 금화가 반짝반짝! 오늘 운이 좋아요',
};
let catchHide = 0;
function showCatch(kind) {
  const el = $('#catch'), c = CATCHES.find((x) => x.id === kind);
  seals.caught(me, kind, !!c.junk);      // 그 연못의 아기 물개가 깨어나 달라고 조른다
  el.querySelector('.name').textContent = objectOf(c.name) + ' 낚았어요!';
  el.querySelector('.say').textContent = CATCH_SAY[kind] || '';
  el.dataset.kind = kind;
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  const ok = showcase.show(el.querySelector('.view'), makeCatch(kind), { tilt: 0.35 });
  el.classList.toggle('flat', !ok);
  audio.snowFx(c.junk && !c.rare ? 'pop' : 'ding');
  el.classList.toggle('rare', !!c.rare);
  clearTimeout(catchHide); catchHide = setTimeout(hideCatch, 3200);
}
function hideCatch() { clearTimeout(catchHide); const el = $('#catch'); if (el.hidden) return; el.hidden = true; el.classList.remove('pop'); if (!giftOpen) showcase.hide(); }
$('#catch').addEventListener('click', hideCatch);
/** 지금 낚시를 시작할 수 있는가: 낚시 구멍 곁에 서 있고, 다른 것을 하고 있지 않다 */
const canFish = () => started && me.inside === null && !me.angel && !me.slide && !me.flap && !(fishing.active || !!me.roast) && holeNear(me.x, me.z) !== null;
const FISH_VIEW = { turn: 1.05, pitch: 0.22, look: 0.9 };      // 낚시하는 동안의 카메라: 등 뒤에서 이만큼(라디안) 옆으로 비켜서고, 조금 더 내려다보며, 펭귄보다 구멍 쪽을 본다
let fishTurn = 0;                // 낚시를 시작하며 카메라가 마저 돌아야 할 각 (라디안)
let fishView = 0;
let slideLift = 0;
let viewYaw = 0;                 // 이글루 안에서 카메라가 실제로 보는 쪽 (걷는 방향의 기준)               // 0(평소)..1(미끄러지는 중)                // 0(평소)..1(낚시를 들여다보는 중)
function startFishing() {
  const hole = canFish() ? holeNear(me.x, me.z) : null;
  if (!hole || !fishing.start(me, hole)) return;
  found('fish');
  // 카메라가 등 뒤에 있으면 구멍도 찌도 낚인 물고기도 펭귄 몸에 가려 보이지 않는다: 옆으로 비켜서서 들여다본다 (낚싯대를 든 쪽으로)
  const rel = angleDiff(me.camYaw, Math.atan2(hole.x - me.x, hole.z - me.z));       // 0 이면 카메라가 정확히 등 뒤
  fishTurn = Math.abs(rel) >= FISH_VIEW.turn ? 0 : (Math.abs(rel) < 0.05 ? -1 : Math.sign(rel)) * FISH_VIEW.turn - rel;
  me.walk = 0;
  shakeOff(true); me.snow = 0;                           // 쌓인 눈은 앉으면서 털린다
  me.idle = 0;
  if (firstTime('fish')) toast('찌가 쑥 들어가면 물고기 단추를 눌러요. ✕는 그만두기예요', 4800);
}
// ---------- 모닥불: 그루터기 의자에 앉아 마시멜로 굽기 ----------
// 불 곁에서 상황 단추를 누르면 가장 가까운 그루터기 의자에 폴짝 올라앉아 불을 본다.
// 앉은 채로 🔥 단추를 누르면 막대 끝의 마시멜로를 불에 댄다. 하얗던 마시멜로가 노릇노릇해지다가 너무 오래 두면 까맣게 탄다.
// 😋 단추로 냠 먹으면 다시 앉아 있는 채로 돌아온다 (또 구울 수 있다). 조이스틱을 밀면 일어나 의자에서 내려온다.
// me.roast.phase: sit(올라앉는 중) → seated(앉아 있음) ⇄ cook(굽는 중) → eat(먹는 중) → seated … → stand(내려오는 중)
const ROAST = { sit: 0.7, eat: 1.2, stand: 0.55, tilt: 1.45 };
let roastTurn = 0;               // 앉으며 카메라가 마저 돌아야 할 각: 옆에서 불과 펭귄이 함께 보이게
const roastStick = makeStick(); roastStick.visible = false; penguin.add(roastStick);
const headStar = makeHeadStar(); penguin.add(headStar);      // 밤에 주운 별 눈송이 (머리 위)
const canRoast = () => started && me.inside === null && !me.angel && !me.slide && !me.flap && !me.roll && !me.roast && !fishing.active && !me.seat && !me.wave && campfire.dist(me.x, me.z) < ROAST_REACH;
/** 그루터기 의자에 앉는다 (가장 가까운 것) */
function startRoast() {
  if (!canRoast()) return;
  let best = STUMP_BLOCKS[0], bd = Infinity;
  for (const b of STUMP_BLOCKS) { const d = Math.hypot(b.x - me.x, b.z - me.z); if (d < bd) { bd = d; best = b; } }
  const out = Math.hypot(best.x - CAMPFIRE.x, best.z - CAMPFIRE.z) || 1, ux = (best.x - CAMPFIRE.x) / out, uz = (best.z - CAMPFIRE.z) / out;
  me.roast = { phase: 'sit', t: 0, cook: 0, k: 0, lift: 0, stick: 0, from: { x: me.x, z: me.z, yaw: me.yaw }, to: { x: best.x, z: best.z, yaw: Math.atan2(-ux, -uz) }, off: { x: best.x + ux * 0.85, z: best.z + uz * 0.85 }, hinted: 0 };
  { const rel = angleDiff(me.camYaw, me.roast.to.yaw); roastTurn = (rel >= 0 ? 1 : -1) * 1.3 - rel; }      // 카메라를 등 뒤에서 비스듬히 옆으로 (불이 펭귄 몸에 가리지 않게)
  me.walk = 0; shakeOff(true); me.snow = 0; me.idle = 0;
  audio.snowFx('pop');
  if (firstTime('stump')) toast('🔥 단추로 마시멜로를 구워요. 일어나려면 조이스틱을 밀어요', 4200);
}
/** 앉은 채로 마시멜로를 불에 댄다 */
function cookRoast() {
  const r = me.roast; if (!r || r.phase !== 'seated') return;
  r.phase = 'cook'; r.t = 0; r.cook = 0; r.hinted = 0; r.result = null;
  roastStick.userData.mallow.visible = true;
  found('roast');
  if (firstTime('roast')) toast('노릇노릇해지면 😋 단추를 눌러 먹어요. 너무 오래 두면 타요!', 4200);
}
/** 다 구웠다: 먹는다 (구운 정도에 따라 한마디) */
function eatRoast() {
  const r = me.roast; if (!r || r.phase !== 'cook') return;
  const d = donenessAt(r.cook);
  r.phase = 'eat'; r.t = 0; r.result = d.id;
  toast(d.say, 3000);
  audio.snowFx(d.id === 'gold' ? 'ding' : d.id === 'burnt' ? 'paper' : 'pop');
  stats.mallows = (stats.mallows || 0) + 1;
}
/** 상황 단추: 앉아 있으면 굽기, 굽는 중이면 먹기 */
function pressRoast() { const r = me.roast; if (!r) return; if (r.phase === 'seated') cookRoast(); else if (r.phase === 'cook') eatRoast(); }
/** 일어나 의자에서 내려온다 (굽던 마시멜로는 먹지 않고 거둔다) */
function stopRoast() { const r = me.roast; if (!r || r.phase === 'stand' || r.phase === 'eat' || r.phase === 'sit') return; r.phase = 'stand'; r.t = 0; }
function stepRoast(dt, wantWalk, looked = false) {
  const r = me.roast;
  r.t += dt;
  const ease = (u) => u * u * (3 - 2 * u);
  let lift = 0, stickGoal = r.phase === 'cook' || r.phase === 'eat' ? 1 : 0;
  if (r.phase === 'sit') {      // 폴짝 올라앉는다
    const u = Math.min(1, r.t / ROAST.sit), e = ease(u);
    me.x = r.from.x + (r.to.x - r.from.x) * e; me.z = r.from.z + (r.to.z - r.from.z) * e;
    me.yaw = r.from.yaw + angleDiff(r.to.yaw, r.from.yaw) * Math.min(1, e * 1.4); r.k = e;
    r.lift = STUMP_SEAT_Y * e + Math.sin(Math.PI * u) * 0.28;
    if (u >= 1) { r.phase = 'seated'; r.t = 0; r.lift = STUMP_SEAT_Y; }
  } else if (r.phase === 'seated' || r.phase === 'cook') {
    if (wantWalk) stopRoast();
    else if (r.phase === 'cook') {
      r.cook += dt;
      if (r.hinted === 0 && r.cook > 4.8) { r.hinted = 1; toast('노릇노릇! 지금 먹으면 딱 좋아요 😋', 2200); }
      else if (r.hinted === 1 && r.cook > 7.6) { r.hinted = 2; toast('앗, 타기 시작했어요! 🔥', 1800); }
      if (r.cook > 9 && Math.random() < dt * 3) { const tip = roastStick.localToWorld(new THREE.Vector3(0, STICK_LEN, 0)); crumble.puff(tip.x, tip.z, 0.12); }      // 탄 마시멜로에서 연기가 폴폴
    }
  } else if (r.phase === 'eat') {
    const u = Math.min(1, r.t / ROAST.eat);
    lift = Math.sin(Math.min(1, u * 1.6) * Math.PI / 2) * (1 - Math.max(0, (u - 0.75) / 0.25));      // 막대를 입가로 들어 올렸다 내린다
    if (u > 0.5) roastStick.userData.mallow.visible = false;
    if (u >= 1) { r.phase = 'seated'; r.t = 0; }
  } else {      // 폴짝 내려온다
    const u = Math.min(1, r.t / ROAST.stand), e = ease(u);
    me.x = r.to.x + (r.off.x - r.to.x) * e; me.z = r.to.z + (r.off.z - r.to.z) * e;
    r.k = 1 - e; r.lift = STUMP_SEAT_Y * (1 - e) + Math.sin(Math.PI * u) * 0.22;
    if (u >= 1) { me.roast = null; roastStick.visible = false; me.idle = 0; return; }
  }
  r.stick += (stickGoal - r.stick) * (1 - Math.exp(-dt * 10));
  if (looked) roastTurn = 0;      // 직접 둘러보기 시작하면 더 돌리지 않는다
  { const turn = roastTurn * (1 - Math.exp(-dt * 3.4)); me.camYaw += turn; roastTurn -= turn; }
  me.walk = 0; me.idle = 0; me.snow = 0;
  pose(penguin, me.phase, 0);
  sit(penguin, r.k, Math.sin(performance.now() / 700) * 0.012);
  const sk = r.stick * r.k;
  roastStick.visible = sk > 0.02;
  roastStick.scale.setScalar(Math.max(0.001, sk));
  roastStick.position.set(ROD_GRIP.x - 0.1 * lift, ROD_GRIP.y - 0.09 * r.k + 0.25 * lift, ROD_GRIP.z);
  roastStick.rotation.set(ROAST.tilt - 2.05 * lift, 0, 0.1 + 0.55 * lift);
  marshmallowColor(r.cook, roastStick.userData.mallow.material.color);
  roastStick.userData.mallow.material.emissive.setRGB(r.phase === 'cook' ? 0.18 + 0.05 * Math.sin(r.t * 9) : 0, r.phase === 'cook' ? 0.07 : 0, 0);      // 불빛을 받아 살짝 발그레
}

/**
 * 가운데 버튼의 모습을 지금 할 수 있는 일에 맞춘다:
 *   평소 눈 천사 → 낚시 구멍 곁에서는 물고기(낚시하기) → 낚시 중에는 ✕(그만두기) → 입질이 오면 두근거리는 물고기(낚아 올리기)
 */
let actionShown = '', socialShown = '';
const meHead = new THREE.Vector3();
const waveFrom = new Map();      // 나에게 인사한 펭귄 → 마지막으로 알린 때 (같은 펭귄의 인사는 9초에 한 번만 알린다)
function showAction() {
  const slideOff = (fishing.active || !!me.roast) || !!me.angel || !!me.flap || !!me.roll || me.inside !== null;          // 낚시나 눈 천사를 하는 동안에는 미끄러질 수 없다
  if ($('#slide').classList.contains('off') !== slideOff) $('#slide').classList.toggle('off', slideOff);
  const flapOff = (fishing.active || !!me.roast) || !!me.angel || !!me.slide || !!me.seat || !!me.roll;
  if ($('#flap').classList.contains('off') !== flapOff) $('#flap').classList.toggle('off', flapOff);
  const now = fishing.active ? (fishing.button === 'pull' ? 'pull' : fishing.button === 'quit' ? 'quit' : fishing.nibbling ? 'nib' : 'wait')
    : me.inside !== null ? (me.seat ? (me.seat.phase === 'sat' ? 'standup' : 'none') : dens.seatNear(me.inside, me.x, me.z) >= 0 ? 'sitdown' : dens.nearDoor(me.inside, me.x, me.z) ? 'exit' : 'none')
    : me.roast ? (me.roast.phase === 'cook' ? 'eat' : me.roast.phase === 'seated' ? 'roast' : me.roast.phase === 'eat' ? 'eatwait' : 'none')
    : canFish() ? 'fish' : canEnter() >= 0 ? 'enter' : canRoast() ? 'stump' : canMail() ? 'mail' : canWish() ? 'wish' : snowmanNear() ? 'look' : me.roll ? 'rollstop' : canRoll() ? 'roll' : 'angel';
  // 눈 천사 단추: 눈 천사를 할 수 없을 때(이글루 안, 낚시·썰매·파닥 중, 방석) 흐려진다
  const angelOff = me.inside !== null || (fishing.active || !!me.roast) || !!me.slide || !!me.flap || !!me.seat || !!me.roll;
  if ($('#angel').classList.contains('off') !== angelOff) $('#angel').classList.toggle('off', angelOff);
  // 상대 단추 (상황 단추 위): 다른 펭귄·동물에게 하는 일만 — 가까우면 👋 인사, 조금 떨어진 펭귄에게는 ❄️ 눈덩이
  const soc = greetTarget() ? 'wave' : throwTarget() ? 'throw' : 'idle';
  if (soc !== socialShown) {
    socialShown = soc;
    const b = $('#social');
    b.classList.toggle('idle', soc === 'idle'); b.classList.toggle('wave', soc === 'wave'); b.classList.toggle('throw', soc === 'throw');
    b.setAttribute('aria-label', { wave: '인사하기', throw: '눈덩이 던지기', idle: '함께 할 상대가 없어요' }[soc]);
    if (soc !== 'idle') setTimeout(() => { if (socialShown === soc) nudge.show(soc); }, 300);      // (뿅 나타난 뒤에, 그때도 같은 모습이면 말풍선)
  }
  if (now === actionShown) return;
  actionShown = now;
  if (NUDGE[now] && NUDGE[now][0] === '#act') setTimeout(() => { if (actionShown === now) nudge.show(now); }, 300);
  const el = $('#act');
  el.classList.toggle('idle', now === 'angel' || now === 'none');      // 할 수 있는 것이 없으면 상황 단추는 숨는다
  el.classList.toggle('fish', now === 'fish' || now === 'pull');
  el.classList.toggle('bite', now === 'pull');
  el.classList.toggle('quit', now === 'quit' || now === 'wait' || now === 'nib');
  el.classList.toggle('hold', now === 'wait' || now === 'eatwait');            // 낚아 올리거나 놓아주는 동안: 누를 수 없다
  el.classList.toggle('rest', now === 'nib');             // 가짜 입질이 지나가는 잠깐: 흐려져 쉰다 (눌러도 그만두지 않는다)
  for (const c of ['enter', 'exit', 'sitdown', 'standup', 'mail', 'wave', 'throw', 'roll', 'rollstop', 'wish', 'look', 'roast', 'eat']) el.classList.toggle(c, now === c);
  el.classList.toggle('eat', now === 'eat' || now === 'eatwait'); if (now === 'eatwait') el.classList.add('hold');
  if (now === 'stump') el.classList.add('sitdown');      // 그루터기에 앉기: 이글루 방석과 같은 앉기 그림
  el.setAttribute('aria-label', { angel: '할 수 있는 것이 없어요', fish: '낚시하기', pull: '낚아 올리기', quit: '낚시 그만두기', wait: '낚시 그만두기', nib: '낚시 그만두기', enter: '이글루에 들어가기', exit: '이글루에서 나가기', sitdown: '방석에 앉기', standup: '일어나기', none: '할 수 있는 것이 없어요', mail: '친구에게 엽서 보내기', wave: '인사하기', throw: '눈덩이 던지기', roll: '눈 굴리기', rollstop: '그만 굴리기', wish: '소원판 보기', look: '눈사람 보기', roast: '마시멜로 굽기', eat: '마시멜로 먹기', eatwait: '마시멜로 먹기', stump: '그루터기에 앉기' }[now]);
}

/** 오른쪽 아래의 가운데 버튼(과 스페이스): 낚시 구멍 곁에서는 낚시, 낚시 중에는 낚아 올리기나 그만두기, 그 밖에서는 눈 천사 */
/**
 * 상황 단추를 눌렀다. how: 'button'(단추) | 'key'(PC 스페이스: 할 것이 없으면 배 썰매) | 'test'(점검: 할 것이 없으면 눈 천사).
 * 눈 굴리기는 단추로만 한다
 */
function act(how = 'button') {
  const key = how !== 'button';
  if (!started || me.slide || me.flap || giftOpen || busyDoor || postOpen || modal()) return;
  if (me.inside !== null) {
    if (me.seat) { if (me.seat.phase === 'sat') standUp(); return; }
    const k = dens.seatNear(me.inside, me.x, me.z);
    if (k >= 0) sitDown(k);
    else if (dens.nearDoor(me.inside, me.x, me.z)) goOut();
    return;
  }
  if (fishing.active) fishing.press();
  else if (me.roast) pressRoast();
  else if (canEnter() >= 0) goIn(canEnter());
  else if (canFish()) startFishing();
  else if (canRoast()) startRoast();
  else if (canMail()) openPostcard();
  else if (canWish()) openWishes();
  else if (snowmanNear()) openSnowcard();
  else if (me.roll) stopRoll();
  else if (canRoll() && !key) startRoll();
  else if (how === 'key') startSlide();
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
  if (!started || me.inside !== null || me.angel || me.slide || me.flap || fishing.active || me.roast) return;
  const to = roomToLie();
  if (!to) { toast('얼음 위에서는 눈 천사를 못 만들어요. 눈 위에서 해 봐요'); return; }
  found('angel');
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
controls.onAction(() => act('key'));      // PC 스페이스: 상황 단추가 있으면 그것, 없으면 배 썰매
$('#act').addEventListener('click', () => act('button'));
/** 상대 단추를 눌렀다: 가까운 상대에게 인사, 조금 떨어진 펭귄에게는 눈덩이 */
function pressSocial() {
  if (!started || giftOpen || busyDoor || postOpen || modal()) return;
  if (greetTarget()) startWave();
  else if (throwTarget()) throwBall();
}
$('#social').addEventListener('click', () => pressSocial());
window.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) pressSocial(); });      // PC: E 키로 인사·눈덩이      // (클릭 이벤트가 key 자리로 들어가지 않게)
$('#angel').addEventListener('click', () => { if (!started || giftOpen || postOpen || busyDoor || me.roll || modal() || me.slide || me.flap || me.inside !== null || me.seat || (fishing.active || !!me.roast)) return; startAngel(); });

// ---------- 배 썰매 ----------
// 버튼을 누르면 배를 깔고 엎드려, 바라보던 쪽으로 쭉 미끄러지다가 천천히 멈추고 일어난다.
// 눈 위에서는 배로 쓸린 넓은 자국이 남고, 얼음 위에서는 자국 없이 훨씬 멀리 미끄러진다. 이글루나 나무에 닿으면 그 자리에서 멈춘다.
const SLIDE = {
  down: 0.32,            // 엎드리기 (초)
  push: 5.4,             // 엎드리며 밀고 나가는 빠르기 (초당 거리)
  snow: 2.1, ice: 0.55,  // 눈 위와 얼음 위에서 줄어드는 빠르기 (초당) — 얼음에서는 훨씬 덜 줄어 멀리 간다
  iceBoost: 1.35,        // 얼음 위에 들어서면 미끄러짐이 살아난다 (얼음 위에서 밀고 나간 빠르기의 배수 상한)
  stop: 0.3,             // 이보다 느려지면 멈춘다
  hill: 1.0, gravity: 9, max: 11,      // 슬라이딩 언덕: 눈보다 덜 줄고, 비탈의 기울기만큼 빨라지거나 느려진다 (가장 빨라야 이만큼)
  up: 0.55,              // 일어나기 (초)
};
function startSlide() {
  if (!started || giftOpen || postOpen || busyDoor || me.roll || modal() || me.inside !== null || me.seat || me.angel || me.slide || me.flap || fishing.active || me.roast) return;
  const boost = Math.min(1.6, (me.recent || 0) * 1.1);      // 걸어오던 기세를 살려 엎드리면 더 빨리 미끄러진다
  me.slide = { t: 0, v: 0, phase: 'down', mark: 0, spray: 0, wiggle: 0, dist: 0, top: SLIDE.push + boost, race: onPad(me.x, me.z) ? { done: false } : null };
  found(onHill(me.x, me.z) ? 'hill' : 'slide');
  me.walk = 0;
  shakeOff(true); me.snow = 0; me.idle = 0;              // 엎드리면서 쌓인 눈이 털린다
  $('#slide').classList.add('busy');
  audio.slide.start();
}
/** 썰매 경주가 끝났다: 출발선에서 길을 따라 간 거리를 잰다 */
function raceDone(s) {
  s.race.done = true;
  const d = Math.max(0, laneCoord(me.x, me.z).along);
  if (d < 0.5) return;
  found('race');
  const best = sled.record(d);
  toast(`🛷 ${d.toFixed(1)}m!` + (best ? ' 내 최고 기록이에요 🎉' : ` (내 최고 ${sled.best.toFixed(1)}m)`), 3000);
  audio.snowFx(best ? 'ding' : 'paper');
  if (net.connected) net.race(d);
  stats.races++;
}
function stepSlide(dt, now) {
  const s = me.slide;
  s.t += dt;
  const ice = onIce(me.x, me.z);
  let k = 1;
  if (s.phase === 'down') {
    const u = Math.min(1, s.t / SLIDE.down);
    k = u * u * (3 - 2 * u);
    s.v = s.top * Math.max(0, (u - 0.35) / 0.65);
    if (u >= 1) { s.phase = 'glide'; audio.fx('bodyfall', 0.45); crumble.puff(me.x + Math.sin(me.yaw) * 0.5, me.z + Math.cos(me.yaw) * 0.5, 0.45); }
  } else if (s.phase === 'glide') {
    const lane = onLane(me.x, me.z), hilly = onHill(me.x, me.z);
    s.v = Math.max(0, s.v - (lane ? LANE.decel : ice ? SLIDE.ice : hilly ? SLIDE.hill : SLIDE.snow) * dt);
    if (hilly) {      // 언덕 비탈: 내리막이면 빨라지고 오르막이면 느려진다
      const ax = Math.sin(me.yaw), az = Math.cos(me.yaw), slope = (heightAt(me.x + ax * 0.25, me.z + az * 0.25) - heightAt(me.x - ax * 0.25, me.z - az * 0.25)) / 0.5;
      s.v = Math.min(SLIDE.max, Math.max(0, s.v - slope * SLIDE.gravity * dt));
    }      // (썰매 길은 매끈하지만, 얼음 연못처럼 기세가 되살아나지는 않는다)
    if (ice && !lane && s.v < SLIDE.push * 0.75 && s.v > SLIDE.stop) s.v = Math.min(SLIDE.push * SLIDE.iceBoost, s.v + 0.9 * dt);      // 얼음 위: 미끄러움이 쉽게 죽지 않는다
    if (s.v < SLIDE.stop) { s.v = 0; s.phase = 'up'; s.t = 0; audio.slide.stop(); }
  } else {
    const u = Math.min(1, s.t / SLIDE.up);
    k = 1 - u * u * (3 - 2 * u);
    s.v = 0;
    if (s.race && !s.race.done) raceDone(s);
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
      if (!onIce(bx, bz) && !onLane(bx, bz) && !onHill(bx, bz)) { tracks.addSlide(bx, bz, me.yaw, now); net.mark(2, bx, bz, me.yaw); }
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
  if (!started || giftOpen || postOpen || busyDoor || me.roll || modal() || me.seat || me.angel || me.slide || me.flap || fishing.active || me.roast) return;
  me.flap = { t: 0 };
  me.walk = 0;
  found('flap');
  const hadSnow = me.snow > 0.35 || me.pop >= POP_SWAP;
  shakeOff(true);                                         // (소리는 아래에서 한꺼번에)
  if (hadSnow) { crumble.puff(me.x, me.z, 1.2); audio.snowFx('shake'); }      // 쌓인 눈이 흩날린다
  me.snow = 0; me.idle = 0;
  audio.snowFx('flap');
  for (const f of foxes) f.startle(me);
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

// ---------- 인사하기와 눈덩이 ----------
// 다른 펭귄·산타·여우 가까이(3 안)에 서면 상황 단추가 👋 가 되고, 누르면 날개를 흔들어 인사한다 (여우는 쳐다보며 꼬리를 흔들고, 산타는 허허허).
// 다른 펭귄이 조금 떨어져(3~14) 있으면 상황 단추가 ❄️ 가 되고, 누르면 그 펭귄에게 눈덩이를 던진다. 맞은 펭귄은 머리에 눈을 뒤집어쓴다
const GREET = 3.2, THROW = 14, WAVE_LEN = 1.5, THROW_GAP = 0.9, SPLASH = 1.5;      // SPLASH: 눈덩이가 떨어진 자리에서 이만큼 안의 펭귄은 맞는다
const snowballs = createSnowballs(scene, { puff: (x, z, s) => crumble.puff(x, z, s) });
let throwIn = 0, hitToast = 0;
const free = () => started && me.inside === null && !me.angel && !me.slide && !me.flap && !me.wave && !me.roll && !fishing.active && !me.roast && !me.seat && !giftOpen && !postOpen && !busyDoor && !modal();
/** 인사할 상대: 가장 가까운 것 (펭귄, 산타, 여우) 또는 null */
function greetTarget() {
  if (!free()) return null;
  let best = null;
  const take = (kind, x, z, obj, who) => { const d = Math.hypot(x - me.x, z - me.z); if (d < GREET && (!best || d < best.d)) best = { kind, x, z, d, obj, who }; };
  for (const [id, p] of net.peers) if (p.root.visible) take('peer', p.x, p.z, id, p.name);
  if (xmas.santaHere) take('santa', xmas.santaAt.x, xmas.santaAt.z, null, '산타');
  for (const f of foxes) take('fox', f.state.x, f.state.z, f, f === arctic ? '북극여우' : '여우');
  if (rabbit.visible) take('rabbit', rabbit.pos.x, rabbit.pos.z, rabbit, '눈토끼');
  for (const s of seals.seals) take('seal', s.x, s.z, s, '아기 물개');
  return best;
}
/** 눈덩이를 던질 상대: 조금 떨어진 가장 가까운 펭귄 */
let aimAt = null, aimUntil = 0;   // 톡 눌러 고른 펭귄 (번호), 그 고름이 이어지는 때
function throwTarget() {
  if (!free() || throwIn > 0) return null;
  if (aimAt && performance.now() < aimUntil) { const p = net.peers.get(aimAt); if (p && p.root.visible) { const d = Math.hypot(p.x - me.x, p.z - me.z); if (d >= 1.5 && d <= THROW) return { id: aimAt, p, d }; } }      // (고른 펭귄이 던질 수 있는 곳에 있으면 그 펭귄)
  let best = null;
  for (const [id, p] of net.peers) { if (!p.root.visible) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (d >= GREET && d <= THROW && (!best || d < best.d)) best = { id, p, d }; }
  return best;
}
function faceTo(x, z) { me.yaw = Math.atan2(x - me.x, z - me.z); }
function startWave() {
  const t = greetTarget(); if (!t) return;
  faceTo(t.x, t.z);
  me.wave = { t: 0 }; me.walk = 0; me.idle = 0;
  audio.snowFx('ding');
  if (t.kind === 'fox') t.obj.greet(me);
  else if (t.kind === 'rabbit') rabbit.greet(me);
  else if (t.kind === 'seal') seals.greet(me);
  else if (t.kind === 'santa') { xmas.greet(() => audio.snowFx('hohoho')); santaLine('안녕~ 허허허!', 3200); }
  if (t.kind === 'peer') { toast(`👋 ${t.who}에게 인사했어요`, 2000); if (net.connected) net.wave(t.obj); }
  found('wave');      // (상대 화면에서도 내 펭귄이 손을 흔든다)
  stats.waves++;
}
function stepWave(dt) {
  const w = me.wave; w.t += dt;
  const u = Math.min(1, w.t / WAVE_LEN), k = Math.min(1, u / 0.15, (1 - u) / 0.18);
  pose(penguin, me.phase, 0);
  wave(penguin, k, w.t * 11);
  if (u >= 1) { wave(penguin, 0); me.wave = null; me.idle = 0; }
}
function throwBall() {
  const t = throwTarget(); if (!t) return;
  faceTo(t.p.x, t.p.z);
  throwIn = THROW_GAP; me.throwT = 0;
  const from = { x: me.x + Math.sin(me.yaw) * 0.3, y: 1.3, z: me.z + Math.cos(me.yaw) * 0.3 }, to = { x: t.p.x, y: 0.95, z: t.p.z };
  audio.fx('rustle', 0.3);
  snowballs.throw(from, to, (x, z) => { let hit = false; for (const p of net.peers.values()) if (p.root.visible && Math.hypot(p.x - x, p.z - z) < SPLASH) { crumble.puff(p.x, p.z, 0.7); hit = hit || p.name; } if (hit) { audio.snowFx('shake'); toast(`❄️ ${hit} 맞혔어요!`, 1800); } });      // (떨어진 자리 곁의 펭귄은 누구든 맞는다)
  net.ball(me.x, me.z, to.x, to.z, t.id);
  stats.throws++;
  found('snowball');
}
// 화면의 다른 펭귄을 톡 누르면 그 펭귄을 노린다 (6초 동안). 던질 수 있는 거리면 바로 던진다
const ray = new THREE.Raycaster(), tapAt = new THREE.Vector2();
let tapDown = null;
canvas.addEventListener('pointerdown', (e) => { tapDown = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  const d = tapDown; tapDown = null;
  if (!d || performance.now() - d.t > 350 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || !started || me.inside !== null) return;
  const b = canvas.getBoundingClientRect(); tapAt.set((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(tapAt, camera);
  let best = null;
  for (const [id, p] of net.peers) { if (!p.root.visible) continue; const h = ray.intersectObject(p.root, true)[0]; if (h && (!best || h.distance < best.dist)) best = { id, p, dist: h.distance }; }
  if (!best) return;
  aimAt = best.id; aimUntil = performance.now() + 6000;
  const t = throwTarget();
  if (t && t.id === best.id) throwBall(); else toast('🎯 ' + best.p.name + ' 노리는 중 (조금 떨어져서 ❄️)', 2200);
});
/** 다른 펭귄이 던진 눈덩이: 날아오는 모습, 그리고 나를 맞혔으면 머리에 눈을 뒤집어쓴다 */
function ballCame(m) {
  if (me.inside !== null) return;
  snowballs.throw({ x: m.x, y: 1.3, z: m.z }, { x: m.tx, y: 0.95, z: m.tz }, (x, z) => {
    if (Math.hypot(me.x - x, me.z - z) > SPLASH) return;      // (노린 펭귄이 아니어도 떨어진 자리 곁에 있으면 맞는다)
    me.snow = Math.min(1, me.snow + 0.45); me.idle = 0;
    crumble.puff(me.x, me.z, 0.9); audio.snowFx('shake');
    stats.hits++;
    if (hitToast <= 0) { toast(subject(m.name) + ' 던진 눈덩이에 맞았어요! ❄️', 2400); hitToast = 8; }
  });
}
/** 산타 말풍선에 잠깐 다른 말 */
let santaLineT = 0;
function santaLine(text, ms) { $('#santa-say').textContent = text; clearTimeout(santaLineT); santaLineT = setTimeout(() => { $('#santa-say').textContent = '메리 크리스마스~'; }, ms); }
const stats = { waves: 0, throws: 0, hits: 0, rolled: 0, built: 0, wishes: 0, races: 0, flakes: 0 };

// ---------- 눈사람 만들기 ----------
// 상황 단추에 할 것이 없을 때(눈 위에서) ⛄ 눈 굴리기가 나온다. 누르고 걸으면 앞에서 눈덩이가 굴러가며 커지고 (얼음 위에서는 크지 않는다),
// 다 커지면 눈사람 만들기 창이 떠서 틀 위에 얼굴과 단추를 그린다. 세우면 그 그림을 입은 눈사람이 앞에 선다 (다른 펭귄에게도 6시간 보인다).
const ROLL = { start: 0.14, grow: 0.024, full: 0.62 };       // 눈덩이의 처음 반지름, 한 걸음(1)마다 커지는 만큼, 다 커진 반지름
const rollBall = makeRollBall(); rollBall.visible = false; scene.add(rollBall);
const snowmen = new Map();       // 번호 → { id, x, z, yaw, mesh, mine, block, birth }
const SNOWMAN_LIFE = 6 * 3600e3, MY_SNOWMEN = 3;
let localNo = 0; const pendingLocal = [];      // 서버에서 번호를 받기 전의 내 눈사람들 (세운 차례대로)
const hiddenSnowmen = new Set();      // (예전에 신고로 치우던 것: 이제 신고는 없다)
const modal = () => !$('#sculpt').hidden || !$('#wishes').hidden;
const canRoll = () => free() && !onIce(me.x, me.z) && !onHill(me.x, me.z) && !fishing.button;
function startRoll() { me.roll = { size: ROLL.start, last: { x: me.x, z: me.z } }; rollBall.visible = true; placeRollBall(); audio.fx('rustle', 0.3); }
function stopRoll(puffIt = true) { if (!me.roll) return; if (puffIt) crumble.puff(rollBall.position.x, rollBall.position.z, me.roll.size * 1.4); me.roll = null; rollBall.visible = false; }
function placeRollBall() {
  const r = me.roll.size, d = 0.45 + r;
  const tx = me.x + Math.sin(me.yaw) * d, tz = me.z + Math.cos(me.yaw) * d;
  rollBall.position.set(tx, r * 0.92, tz); rollBall.scale.setScalar(r);
}
function stepRoll() {
  const R = me.roll, moved = Math.hypot(me.x - R.last.x, me.z - R.last.z);
  R.last = { x: me.x, z: me.z };
  if (moved > 0 && moved < 2 && !onIce(me.x, me.z)) {
    R.size = Math.min(ROLL.full, R.size + moved * ROLL.grow);
    rollBall.rotateOnWorldAxis(new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw)), moved / Math.max(0.1, R.size));
    stats.rolled += moved;
  }
  placeRollBall();
  if (R.size >= ROLL.full && $('#sculpt').hidden) openSculpt();
}
// 그리는 판
const pad = $('#sculpt .pad'), padCtx = pad.getContext('2d');
let strokes = [], drawing = null, ink = 0, width = 2;
function drawPad() {
  padCtx.clearRect(0, 0, PAD.w, PAD.h);
  padCtx.fillStyle = '#ffffff'; padCtx.strokeStyle = 'rgba(120, 160, 210, 0.55)'; padCtx.lineWidth = 2; padCtx.setLineDash([6, 6]);
  for (const c of [PAD.body, PAD.head]) { padCtx.beginPath(); padCtx.arc(c.x, c.y, c.r, 0, Math.PI * 2); padCtx.fill(); padCtx.stroke(); }
  padCtx.setLineDash([]);
  paint(padCtx, strokes.map((s) => [s[0], s[1], s[2]]));
}
const points = () => strokes.reduce((a, s) => a + s[2].length, 0);
function padPoint(e) { const b = pad.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * PAD.w, (e.clientY - b.top) / b.height * PAD.h]; }
pad.addEventListener('pointerdown', (e) => { if (points() >= MAX_POINTS) return; pad.setPointerCapture(e.pointerId); drawing = [ink, width, [padPoint(e)]]; strokes.push(drawing); drawPad(); });
pad.addEventListener('pointermove', (e) => {
  if (!drawing || points() >= MAX_POINTS) return;
  const p = padPoint(e), last = drawing[2][drawing[2].length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2.5) return;      // (점을 너무 촘촘히 찍지 않는다)
  drawing[2].push(p); drawPad();
});
for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, () => { drawing = null; });
INKS.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--ink-c', c); b.setAttribute('aria-label', ['숯', '당근', '빨강', '파랑', '초록'][i]); b.addEventListener('click', () => { ink = i; pickers(); }); $('#sculpt .inks').append(b); });
[1, 2, 3].forEach((w) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', ['가늘게', '보통', '굵게'][w - 1]); const i = document.createElement('i'); i.style.width = i.style.height = WIDTHS[w] + 'px'; b.append(i); b.addEventListener('click', () => { width = w; pickers(); }); $('#sculpt .widths').append(b); });
function pickers() {
  [...$('#sculpt .inks').children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === ink)));
  [...$('#sculpt .widths').children].forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === width)));
}
// 옷장의 아이템을 눈사람에게 씌운다 (자리마다 하나: 안경·모자·귀마개). 내가 지금 쓰고 있는 것과는 따로다
let dress = [-1, -1, -1];
function drawDress() {
  const box = $('#sculpt .dress'), list = box.querySelector('.items'); list.innerHTML = '';
  box.hidden = !owned.length;
  for (const it of owned) {
    const j = SLOTS.indexOf(it.slot), b = document.createElement('button'); b.type = 'button';
    b.setAttribute('aria-pressed', String(dress[j] === it.n)); b.setAttribute('aria-label', it.name); b.title = it.name;
    if (!thumbs.has(it)) thumbs.set(it, showcase.snapshot(makeItem(it.slot, it.n)));
    const src = thumbs.get(it); if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; b.append(img); } else b.textContent = it.name;
    b.addEventListener('click', () => { dress[j] = dress[j] === it.n ? -1 : it.n; audio.snowFx('paper'); drawDress(); });
    list.append(b);
  }
}
function openSculpt() { strokes = []; drawing = null; ink = 0; width = 2; dress = [-1, -1, -1]; drawDress(); pickers(); drawPad(); $('#sculpt').hidden = false; me.walk = 0; controls.setEnabled(false); audio.snowFx('pop'); }
function closeSculpt() { $('#sculpt').hidden = true; controls.setEnabled(true); }
$('#sculpt .undo').addEventListener('click', () => { strokes.pop(); drawPad(); });
$('#sculpt .clear').addEventListener('click', () => { strokes = []; drawPad(); });
$('#sculpt .cancel').addEventListener('click', () => { closeSculpt(); stopRoll(); });
$('#sculpt .make').addEventListener('click', () => {
  const d = strokes.filter((s) => s[2].length).slice(0, 120).map(([c, w, pts]) => [c, w, packPoints(pts)]);
  const at = { x: rollBall.position.x, z: rollBall.position.z }, yaw = Math.atan2(me.x - at.x, me.z - at.z);      // 펭귄을 보고 선다
  closeSculpt(); stopRoll(false);
  const c = field.confine(at.x, at.z);
  const lid = 'local' + (++localNo), f = dress.slice();
  placeSnowman({ id: lid, x: c.x, z: c.z, yaw, d, f, birth: clock.now(), mine: true });
  pendingLocal.push(lid);
  if (net.connected) net.snowman(c.x, c.z, yaw, d, f);
  crumble.puff(c.x, c.z, 1); audio.snowFx('pop');
  stats.built++;
  found('snowman');
  toast('눈사람을 만들었어요! ⛄', 2400);
});
/** 이글루·연못·언덕·썰매 길·모닥불 자리인가 (자리를 옮기기 전에 세운 눈사람이 그 안에 파묻혀 보이지 않게) */
const MOVED_AT = Date.UTC(2026, 10, 21, 0, 0, 0);      // 놀 거리를 트리 쪽으로 모은 때: 이보다 먼저 세운 눈사람만 살핀다 (새로 세운 것은 늘 보인다)
const snowmanBuried = (x, z) => IGLOOS.some((g) => Math.hypot(x - g.x, z - g.z) < g.radius + 3.2) || PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 0.6) || onHill(x, z) || onLane(x, z) || campfire.dist(x, z) < 3.3;
function placeSnowman(s) {
  if (hiddenSnowmen.has(s.id) || (!(s.birth >= MOVED_AT) && snowmanBuried(s.x, s.z))) return;
  if (s.mine) { const mine = [...snowmen.values()].filter((o) => o.mine && o.id !== s.id).sort((a, b) => a.birth - b.birth); while (mine.length >= MY_SNOWMEN) removeSnowman(mine.shift().id); }      // (내 눈사람은 셋까지: 넷째를 세우면 가장 오래된 것이 녹는다)
  if (snowmen.has(s.id)) removeSnowman(s.id);
  const mesh = buildSnowman(s.d, s.f); mesh.position.set(s.x, 0, s.z); mesh.rotation.y = s.yaw; scene.add(mesh);
  const block = { x: s.x, z: s.z, r: 0.72 }; fieldBlocks.push(block);
  snowmen.set(s.id, { ...s, mesh, block });
}
function removeSnowman(id) {
  const o = snowmen.get(id); if (!o) return;
  scene.remove(o.mesh); o.mesh.userData.dispose();
  const k = fieldBlocks.indexOf(o.block); if (k >= 0) fieldBlocks.splice(k, 1);
  snowmen.delete(id);
}
const snowmanNear = () => { if (!free()) return null; let best = null; for (const o of snowmen.values()) { const d = Math.hypot(o.x - me.x, o.z - me.z); if (d < 1.9 && (!best || d < best.d)) best = { o, d }; } return best && best.o; };
let snowcardFor = null;
function openSnowcard() {
  const o = snowmanNear(); if (!o) return;
  snowcardFor = o.id;
  $('#snowcard .what').textContent = o.mine ? '⛄ 내가 만든 눈사람이에요' : '⛄ 누군가 만든 눈사람이에요';
  $('#snowcard .remove').hidden = !o.mine;
  $('#snowcard').hidden = false;
}
function closeSnowcard() { $('#snowcard').hidden = true; snowcardFor = null; }
$('#snowcard .close').addEventListener('click', closeSnowcard);
$('#snowcard .remove').addEventListener('click', () => {
  const id = snowcardFor; if (!id) return;
  const o = snowmen.get(id); if (o) crumble.puff(o.x, o.z, 1.2);
  removeSnowman(id); if (!id.startsWith('local')) net.snowmanRemove(id);
  closeSnowcard(); audio.snowFx('burst');
});

// ---------- 크리스마스 소원판 ----------
let wishes = [], wrote = false, myWish = null;
const NOTE_COLORS = ['#ffd75e', '#f9b4c6', '#a8dcf5', '#b9e6b0', '#ffffff', '#f5c59a'], PINS = ['#e0503f', '#3f7fe0', '#3f9a5e', '#c066b8'];
const canWish = () => free() && wishboard.near(me.x, me.z);
function drawWishes() {
  const box = $('#wishes .notes'); box.innerHTML = '';
  let marked = false;
  wishes.slice(0, 40).forEach((w, i) => {
    const p = document.createElement('p'); p.textContent = w.text;
    const h = [...w.text].reduce((a, ch) => a + ch.charCodeAt(0), w.birth % 97);
    p.style.background = NOTE_COLORS[h % NOTE_COLORS.length]; p.style.setProperty('--pin', PINS[h % PINS.length]); p.style.transform = `rotate(${((h % 7) - 3) * 1.2}deg)`;
    if (myWish && !marked && w.text === myWish.text) { p.classList.add('mine'); marked = true; }      // (내가 붙인 것: 점선 테두리)
    box.append(p);
  });
  $('#wishes .empty').hidden = wishes.length > 0;
  $('#wishes .write').classList.toggle('off', wrote || !net.connected);
  $('#wishes .done').textContent = !net.connected ? '함께 걷는 눈밭에 이어져 있을 때 소원을 보고 붙일 수 있어요' : wrote ? '올해 소원은 이미 붙였어요 ✨' : '';
}
function openWishes() { drawWishes(); $('#wishes').hidden = false; me.walk = 0; controls.setEnabled(false); audio.snowFx('paper'); }
function closeWishes() { $('#wishes').hidden = true; controls.setEnabled(true); }
$('#wishes .close').addEventListener('click', closeWishes);
$('#wishes').addEventListener('click', (e) => { if (e.target.id === 'wishes') closeWishes(); });
$('#wishes .write').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#wishes .write input'), text = input.value.trim();
  if (!text || wrote || !net.connected) return;
  $('#wishes .done').textContent = '붙이는 중…';
  pendingWish = text; net.wish(text);
});
let pendingWish = null;
/** 서버에서 온 소원·눈사람 소식 */
function social(m) {
  if (m.t === 'top') { sled.setTop(m.top); return; }
  if (m.t === 'hello') {
    wishes = m.wishes; wrote = m.wrote; sled.setTop(m.top);
    for (const id of [...snowmen.keys()]) if (!id.startsWith('local')) removeSnowman(id);
    const now = clock.now();
    for (const s of m.snowmen) if (now - s.birth < SNOWMAN_LIFE) placeSnowman(s);
    if (!$('#wishes').hidden) drawWishes();
  } else if (m.t === 'wish') {
    wishes.unshift({ text: m.text, birth: m.birth });
    if (!$('#wishes').hidden) drawWishes();
  } else if (m.t === 'wished') {
    const done = $('#wishes .done');
    if (m.ok) { wrote = true; stats.wishes++; $('#wishes .write input').value = ''; audio.snowFx('ding'); toast('소원을 붙였어요 ✨', 2400); found('wish'); myWish = { text: pendingWish, birth: null }; }
    else done.textContent = { bad: '고운 말로 다시 써 볼까요? 🙂', link: '연락처나 주소는 붙일 수 없어요', long: '30자까지만 쓸 수 있어요', once: '올해 소원은 이미 붙였어요 ✨', empty: '소원을 써 주세요' }[m.why] || '붙이지 못했어요';
    if (m.why === 'once') wrote = true;
    pendingWish = null;
    if (m.ok) drawWishes();
  } else if (m.t === 'sm') {
    if (m.mine) { const lid = pendingLocal.shift(), loc = lid && snowmen.get(lid); if (loc) { snowmen.delete(lid); snowmen.set(m.id, { ...loc, id: m.id }); } else placeSnowman(m); }      // 내가 세운 것: 번호만 받는다
    else placeSnowman(m);
  } else if (m.t === 'smx') removeSnowman(m.id);
}
window.addEventListener('keydown', (e) => { if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat && !me.slide && !me.angel) { if (!started || giftOpen || postOpen || busyDoor || me.roll || modal() || me.slide || me.flap || me.inside !== null || me.seat || (fishing.active || !!me.roast)) return; startAngel(); } });      // PC: 시프트 키는 눈 천사 (스페이스는 배 썰매)      // PC: 시프트 키로도 미끄러진다

// ---------- 이글루 안 ----------
// 이글루 문 앞에 서면 가운데 단추가 "들어가기"가 된다. 들어가면 잠깐 어두워졌다가 모닥불이 타는 둥근 방 안에 선다.
// 방석 곁에서 단추를 누르면 앉고, 앉으면 지금 하는 일(상태)을 고를 수 있다. 문 앞에서 누르면 밖으로 나온다.
const ENTRANCES = IGLOOS.map((g) => { const r = Math.hypot(g.x, g.z); return { x: g.x - g.x / r * 5.1, z: g.z - g.z / r * 5.1, yaw: Math.atan2(g.x, g.z) }; });      // 문 바로 앞 (트리 쪽)
/** 들어갈 수 있는 이글루의 번호 (문 앞이 아니면 -1) */
function canEnter() {
  if (!started || me.inside !== null || me.angel || me.slide || me.flap || fishing.active || me.roast) return -1;
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
  found('igloo');
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
function standUp() { if (me.seat) { me.seat.phase = 'up'; me.seat.t = 0; closeStatus(); showSay(); if (dice) closeDice(); hideDiceAsk(); } }
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
  $('#status .dice-invite').hidden = !net.connected;
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

// ---------- 내 이름 ----------
let name = myName(!TEST_MODE);
function showName() { $('#my-name').textContent = name; }
showName();
$('#rename').addEventListener('click', () => { name = rename(!TEST_MODE); showName(); });

// ---------- 함께 걷는 눈밭 ----------
const net = createNet({
  onWave: (m) => { const now = performance.now(); if (m.me && started && !(now - (waveFrom.get(m.id) || -1e9) < 9000)) { waveFrom.set(m.id, now); toast(`👋 ${subject(m.name)} 나에게 인사했어요! 위 단추로 답인사해 봐요`, 2800); audio.snowFx('ding'); } },      // 나에게 한 인사만 알린다 (다른 펭귄끼리의 인사는 머리 위 👋 로 보인다)
  url: q.get('server') === 'off' ? '' : (q.get('server') || SERVER_URL), scene, camera, tracks, look, name: () => name,
  onCount: (n) => { $('#peers').textContent = `함께 걷는 펭귄 ${n}마리`; $('#peer-row').hidden = n === 0; xmas.setPeers(n); },
  onGame: (m) => diceMessage(m),
  onBall: (m) => ballCame(m),
  onSocial: (m) => social(m),
});

// ---------- 이글루 안 주사위 놀이 ----------
// 방석에 앉아 상태를 고르는 창 맨 위의 "주사위 놀이" 단추를 누르면, 같은 방에 앉아 있는 펭귄들에게만 쪽지가 간다.
// 쪽지를 받은 펭귄은 "같이 하기"를 누를 때만 함께한다 (그냥 두면 조용히 사라진다). 부른 펭귄이 굴리면 저마다 주사위가 데굴데굴 구르고, 가장 큰 눈이 이긴다.
let dice = null;                 // { gid, host(번호), mine(내가 불렀나), players: [[번호, 이름]], done }
let diceAskGid = null, diceAskHide = 0;
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieFace(el, v) { el.className = 'die' + (v === 1 ? ' one' : ''); el.innerHTML = ''; for (let k = 0; k < 9; k++) { const i = document.createElement('i'); if (v && PIPS[v].includes(k)) i.className = 'on'; el.append(i); } }
function drawDice(rolls = null) {
  const el = $('#dice'), list = el.querySelector('.players');
  list.innerHTML = '';
  const rows = rolls || dice.players.map(([id, nm]) => [id, nm, 0]);
  for (const [id, nm, v] of rows) {
    const li = document.createElement('li'), d = document.createElement('div');
    dieFace(d, v || 0); if (!v) d.classList.add('wait');
    li.dataset.id = id; li.append(d, document.createTextNode(id === net.id ? nm + ' (나)' : nm));
    list.append(li);
  }
  const roll = el.querySelector('.roll');
  roll.hidden = !dice.mine || dice.done; roll.disabled = dice.players.length < 2;
  el.querySelector('.again').hidden = !(dice.mine && dice.done);
  el.querySelector('.quit').textContent = dice.done ? '닫기' : '그만하기';
  el.hidden = false;
}
function diceNote(text) { $('#dice .note').textContent = text; }
function closeDice(tell = true) {
  if (dice && dice.rolling) clearInterval(dice.rolling);
  if (dice && tell && !dice.done) net.game('leave', dice.gid);
  dice = null; $('#dice').hidden = true;
}
function hideDiceAsk() { clearTimeout(diceAskHide); diceAskGid = null; $('#dice-ask').hidden = true; }
function inviteDice() {
  if (!net.connected) { toast('함께 걷는 눈밭에 이어져 있을 때 할 수 있어요', 2600); return; }
  closeStatus(); showSay();
  net.game('invite');
}
function diceMessage(m) {
  const seated = !!(me.seat && me.seat.phase === 'sat');
  if (m.op === 'lost') { if (dice) closeDice(false); hideDiceAsk(); return; }      // 서버와 끊겼다
  if (m.op === 'alone') { toast('같은 방에 앉아 있는 펭귄이 없어요. 누가 방석에 앉으면 불러 봐요!', 3200); return; }
  if (m.op === 'busy') { toast('이 방에서는 벌써 주사위 놀이가 열려 있어요', 2600); return; }
  if (m.op === 'wait') { toast('조금 있다가 다시 불러 봐요', 2200); return; }
  if (m.op === 'open') {
    dice = { gid: m.gid, host: m.host, mine: true, players: m.players, done: false };
    drawDice(); diceNote(`같은 방 펭귄 ${m.asked}마리에게 물어봤어요. 누가 오나 기다려요…`);
    audio.snowFx('paper');
    return;
  }
  if (m.op === 'invite') {
    if (!seated || (dice && !dice.done)) return;       // 앉아 있지 않거나 놀이 중이면 묻지 않는다 (끝난 판을 보고 있으면 묻는다)
    diceAskGid = m.gid;
    $('#dice-ask .who').textContent = subject(m.name);
    $('#dice-ask').hidden = false;
    audio.snowFx('paper');
    clearTimeout(diceAskHide); diceAskHide = setTimeout(hideDiceAsk, 15000);
    $('#dice-ask').dataset.host = m.host;
    return;
  }
  if (!dice || m.gid !== dice.gid) { if (m.op === 'cancel' && m.gid === diceAskGid) hideDiceAsk(); return; }
  if (m.op === 'players') {
    dice.players = m.players; drawDice();
    const n = m.players.length;
    diceNote(dice.mine ? (n > 1 ? `${n}마리가 함께해요. 굴려 볼까요?` : '누가 오나 기다려요…') : `${n}마리가 함께해요. 부른 펭귄이 굴릴 때까지 기다려요`);
    if (n > 1) audio.snowFx('ding');
    return;
  }
  if (m.op === 'cancel') {
    const mine = dice.mine; closeDice(false);
    if (!mine || m.why !== 'host') toast(m.why === 'host' ? '부른 펭귄이 주사위 놀이를 그만뒀어요' : '주사위 놀이가 닫혔어요', 2600);
    return;
  }
  if (m.op === 'result') {
    dice.done = true; dice.players = m.rolls.map(([id, nm]) => [id, nm]);
    drawDice(m.rolls.map(([id, nm]) => [id, nm, 1 + Math.floor(Math.random() * 6)]));
    diceNote('데굴데굴…');
    const faces = [...$('#dice .players').querySelectorAll('.die')];
    faces.forEach((d) => d.classList.add('spin'));
    let n = 0;
    const game = dice;
    const tick = setInterval(() => {
      if (dice !== game) { clearInterval(tick); return; }      // (그사이 닫았거나 새 판이 열렸다)
      n++;
      if (n % 2) audio.snowFx('dice');
      faces.forEach((d) => { dieFace(d, 1 + Math.floor(Math.random() * 6)); d.classList.add('spin'); });
      if (n < 12) return;
      clearInterval(tick);
      const best = Math.max(...m.rolls.map((r) => r[2]));
      m.rolls.forEach(([id, , v], k) => { dieFace(faces[k], v); faces[k].parentNode.classList.toggle('win', v === best); });
      const winners = m.rolls.filter((r) => r[2] === best);
      diceNote(winners.length > 1 ? `🤝 ${best}! 비겼어요` : `🎉 ${winners[0][1]} 승리!` + (winners[0][0] === net.id ? ' (나)' : ''));
      audio.snowFx('ding');
      if (dice) dice.rolled = m.rolls;
    }, 110);
    if (dice) dice.rolling = tick;
    return;
  }
}
$('#status .dice-invite').addEventListener('click', inviteDice);
$('#dice-ask .yes').addEventListener('click', () => {
  const gid = diceAskGid, host = $('#dice-ask').dataset.host; hideDiceAsk();
  if (!gid || !(me.seat && me.seat.phase === 'sat')) return;
  if (dice) closeDice(false);                         // (끝난 판이 떠 있었으면 닫는다)
  dice = { gid, host, mine: false, players: [], done: false };
  net.game('join', gid);
  drawDice(); diceNote('함께하기로 했어요. 부른 펭귄이 굴릴 때까지 기다려요');
});
$('#dice-ask .no').addEventListener('click', hideDiceAsk);
$('#dice .roll').addEventListener('click', () => { if (dice && dice.mine && !dice.done) net.game('roll', dice.gid); });
$('#dice .again').addEventListener('click', () => { closeDice(false); inviteDice(); });
$('#dice .quit').addEventListener('click', () => closeDice());
/** 내 모습을 서버에 보낼 꼴로 */
function myState() {
  const a = me.wave ? ACT.wave : me.angel ? ACT.angel : me.slide ? ACT.slide : me.flap ? ACT.flap : fishing.active ? ACT.fish : me.roast ? (me.roast.phase === 'cook' ? ACT.roast : me.roast.phase === 'seated' || me.roast.phase === 'eat' ? ACT.sit : ACT.stand) : me.seat ? ACT.sit : me.pop >= 1 ? ACT.snowman : ACT.stand;
  const st = me.seat && me.seat.phase === 'sat' && me.status ? STATUSES.findIndex((x) => x[1] === me.status[1]) : -1;
  return { x: me.x, z: me.z, yaw: me.yaw, w: Math.min(1, Math.max(0, me.walk)), a, i: me.inside === null ? -1 : me.inside, k: me.seat ? me.seat.k : -1, st, f: worn(penguin), g: me.star ? 1 : 0 };
}

// ---------- 크리스마스 선물 ----------
let giftOpen = null;             // 열고 있는 선물 { g, taps }
const GIFT_TAPS = 3;
let forcedItem = null;          // 점검용: 다음 선물에서 나올 아이템 (ITEMS 의 번호)
function openGift(g) {
  giftOpen = { g, taps: 0 };
  me.walk = 0;
  controls.setEnabled(false);
  const el = $('#gift'), box = el.querySelector('.gift-box');
  el.className = '';
  const PAPER = ['#e8503f', '#3f8f6a', '#4f7fd0', '#e7b23c', '#c066b8', '#f08aa0'], RIBBON = ['#fff3c4', '#ffffff', '#ffd75e', '#f9e1e6'];
  box.style.setProperty('--paper', PAPER[g.i % PAPER.length]); box.style.setProperty('--ribbon', RIBBON[g.i % RIBBON.length]);
  el.hidden = false;
  // 3D 선물 상자: 천천히 돌고, 두드릴 때마다 들썩이며 뚜껑이 조금씩 들리고, 세 번째에 뚜껑이 휙 날아간다 (WebGL 이 안 되면 그림 상자)
  const model = makeGiftBox(g.i), { body, lid } = model.userData;
  const anim = { shake: 0, lift: 0, lidY: 0, fly: -1 };
  giftOpen.anim = anim;
  const ok = showcase.show(box.querySelector('.view'), model, { tilt: 0.32, turn: 0.7, yaw: 0.6, zoom: 2.3, frame: (dt) => {
    anim.shake = Math.max(0, anim.shake - dt * 3);
    const w = Math.sin(anim.shake * 22) * anim.shake;
    body.rotation.z = w * 0.12; body.rotation.x = w * 0.06;
    body.scale.set(1 + anim.shake * 0.06, 1 - anim.shake * 0.08, 1 + anim.shake * 0.06);
    if (anim.fly >= 0) {                                   // 세 번째: 뚜껑이 위로 솟구치며 빙글 돌고 사라진다
      anim.fly += dt;
      const u = Math.min(1, anim.fly / 0.5);
      lid.position.set(u * 0.25, model.userData.h + u * 1.1 - u * u * 0.3, 0); lid.rotation.set(u * 1.2, 0, -u * 2.2);
      lid.scale.setScalar(Math.max(0.001, 1 - u * 0.6));
    } else { anim.lidY += (anim.lift - anim.lidY) * Math.min(1, dt * 14); lid.position.y = model.userData.h + anim.lidY; lid.rotation.z = Math.sin(anim.shake * 18) * anim.lift * 1.4; }
  } });
  el.classList.toggle('three', ok);
  audio.snowFx('ding');
}
function tapGift() {
  const o = giftOpen;
  if (!o || o.taps >= GIFT_TAPS) return;
  o.taps++;
  const el = $('#gift');
  const three = el.classList.contains('three');
  if (o.anim) { o.anim.shake = 1; o.anim.lift = o.taps * 0.045; }
  if (o.taps < GIFT_TAPS) { el.className = three ? 'three' : ''; void el.offsetWidth; el.className = 'tap' + o.taps + (three ? ' three' : ''); audio.snowFx('paper'); return; }
  // 선물은 패션 아이템이다: 안경, 모자, 귀마개 가운데 하나가 나와 바로 쓴다. 같은 자리에 쓰고 있던 것은 새것으로 바뀐다
  // (지금 쓰고 있는 것과 똑같은 것은 나오지 않는다). 이번 산책 동안만 쓰고, 다시 들어오면 맨몸으로 시작한다
  xmas.open(o.g);
  const now = worn(penguin), pool = ITEMS.filter((it) => now[SLOTS.indexOf(it.slot)] !== it.n);
  const item = forcedItem !== null ? ITEMS[forcedItem] : pool[Math.floor(Math.random() * pool.length)];
  forcedItem = null;
  o.present = item.name; o.item = item;
  el.querySelector('.name').textContent = item.name;
  el.querySelector('.from').textContent = item.say + ' · 바로 써 봤어요!';
  const view = el.querySelector('.gift-item .view');
  el.querySelector('.gift-item').classList.toggle('flat', !three);
  if (o.anim) o.anim.fly = 0;                          // 뚜껑이 날아가는 모습을 잠깐 보여 주고 나서 아이템을 띄운다
  setTimeout(() => { if (giftOpen === o) showcase.show(view, makeItem(item.slot, item.n), { tilt: 0.2 }); }, three ? 420 : 0);
  el.querySelector('.emoji').textContent = { glasses: '🕶️', hat: '🎩', ear: '🎧' }[item.slot];
  wear(penguin, item.slot, item.n);
  addToCloset(item);
  el.className = 'opened' + (three ? ' three' : '');
  audio.snowFx('tear');
  setTimeout(() => audio.snowFx('ding'), 260);
}
function closeGift() {
  if (!giftOpen || giftOpen.taps < GIFT_TAPS) return;
  giftOpen = null;
  $('#gift').hidden = true; $('#gift').className = '';
  if ($('#catch').hidden) showcase.hide();
  controls.setEnabled(true);
}
// ---------- 전광판: 시각 아래 줄에 큰 눈 소식과 도움말이 번갈아 (한 줄씩, 길면 옆으로 흘러간다) ----------
const TIPS = [
  { text: '큰 눈이 오는 동안은 발자국과 선물이 눈에 묻혀요', xmas: true },
  { text: '큰 눈이 오면 발자국이 덮이고 새 눈밭이 돼요', xmas: false },
  { text: '트리 옆 우체통에서 친구를 초대할 수 있어요 💌' },
  { text: '선물을 찾으면 옷장에서 골라 입어 보세요 🧥', xmas: true },
  { text: '이글루 방석에 앉아 주사위 놀이를 할 수 있어요 🎲' },
  { text: '산타는 매시 정각에 트리 앞에서 잠깐 볼 수 있대요 🎅', xmas: true },
  { text: '눈 위에서 ⛄ 단추로 눈을 굴려 눈사람을 만들어 봐요' },
  { text: '트리 뒤 소원판에 크리스마스 소원을 붙여 봐요 🎄', xmas: true },
  { text: '친구 곁에서 👋 인사, 조금 떨어져서 ❄️ 눈덩이!' },
  { text: '연못의 얼음 구멍에서 낚시를 할 수 있어요 🎣' },
  { text: '날개를 파닥이면 쌓인 눈이 털려요. 여우가 깜짝 놀라요' },
];
const TICK = { storm: 6000, tip: 7000 };      // 큰 눈 소식, 도움말을 보여 주는 시간 (흘러가는 동안은 그만큼 더)
let tipAt = 0, tipShown = false, lastTip = -1;
function tickTip(t) {
  if (t < tipAt) return;
  const storm = $('#storm'), tip = $('#tip'), track = $('.ticker .track');
  const loud = document.body.dataset.storm && document.body.dataset.storm !== 'calm';      // 큰 눈이 오는 동안에는 소식만
  tipShown = !tipShown && !loud;
  if (tipShown) {
    const pool = TIPS.map((x, i) => i).filter((i) => i !== lastTip && (TIPS[i].xmas === undefined || TIPS[i].xmas === xmas.on));      // (크리스마스에만 있는 것은 그때만)
    lastTip = pool[Math.floor(Math.random() * pool.length)];
    tip.textContent = TIPS[lastTip].text;
  }
  storm.hidden = tipShown; tip.hidden = !tipShown;
  // 칸보다 길면 전광판처럼 흘러간다 (처음 잠깐 멈췄다가, 끝까지 가서 잠깐 멈춘다)
  // 칸보다 길면: 칸 오른쪽 끝에서 들어와 왼쪽 끝으로 다 빠져나가기를 되풀이한다 (초당 40px). 짧으면 가만히
  const box = track.parentElement, w = track.getBoundingClientRect().width, long = w > box.clientWidth - 4;      // (글 칸은 inline 이라 scrollWidth 가 0 이다: 감싼 줄의 실제 너비로 잰다)
  track.classList.remove('scroll', 'in'); void track.offsetWidth;
  // 긴 글: 처음은 왼쪽 끝부터 보이게 멈춰 있다가, 천천히(초당 28px) 왼쪽으로 흘러 끝 글자까지 보이면 다시 잠깐 멈춘다 (되풀이)
  let run = 0;
  if (long) { const over = w - box.clientWidth + 8; run = over / 28 / 0.6; track.style.setProperty('--over', -over + 'px'); track.style.setProperty('--run', run + 's'); track.classList.add('scroll'); }
  else track.classList.add('in');
  tipAt = t + Math.max(tipShown ? TICK.tip : TICK.storm, run * 2000);      // (긴 글은 두 번 흘러가는 동안 보여 준다)
}

// ---------- 옷장: 이번 산책에서 받은 아이템을 골라 입고 벗는다 ----------
// (다시 들어오면 비어 있다. 처음 선물을 받으면 오른쪽 위에 옷장 단추가 뿅 나타난다)
const owned = [];                // 받은 차례대로 ITEMS 의 것들
const thumbs = new Map();        // 아이템 → 작은 그림 주소
const SLOT_NAME = { glasses: '안경', hat: '모자', ear: '귀마개' };
function addToCloset(item) {
  if (owned.includes(item)) return;
  owned.push(item);
  const b = $('#closet'); b.hidden = false;
  b.classList.remove('new'); void b.offsetWidth; b.classList.add('new');      // (받을 때마다 통 튄다)
  b.addEventListener('animationend', () => b.classList.remove('new'), { once: true });      // (끝나면 떼어 말풍선의 두근거림이 보이게)
  if (!$('#closet-panel').hidden) drawCloset();
}
function drawCloset() {
  const box = $('#closet-panel .shelves'); box.innerHTML = '';
  const now = worn(penguin);
  for (const slot of SLOTS) {
    const shelf = document.createElement('div'); shelf.className = 'shelf';
    const t = document.createElement('b'); t.textContent = SLOT_NAME[slot]; shelf.append(t);
    const mine = owned.filter((it) => it.slot === slot);
    if (!mine.length) { const e = document.createElement('p'); e.className = 'empty'; e.textContent = '아직 없어요. 선물 상자를 찾아봐요!'; shelf.append(e); }
    else {
      const list = document.createElement('div'); list.className = 'items';
      for (const it of mine) {
        const btn = document.createElement('button'); btn.type = 'button';
        btn.setAttribute('aria-pressed', String(now[SLOTS.indexOf(slot)] === it.n));
        btn.dataset.slot = slot; btn.dataset.n = it.n;
        if (!thumbs.has(it)) thumbs.set(it, showcase.snapshot(makeItem(it.slot, it.n)));
        const src = thumbs.get(it);
        if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; btn.append(img); }
        btn.append(document.createTextNode(it.name));
        btn.addEventListener('click', () => { const on = worn(penguin)[SLOTS.indexOf(slot)] === it.n; wear(penguin, slot, on ? -1 : it.n); audio.snowFx(on ? 'paper' : 'ding'); drawCloset(); });
        list.append(btn);
      }
      shelf.append(list);
    }
    box.append(shelf);
  }
}
function openCloset() { drawCloset(); $('#closet-panel').hidden = false; }
function closeCloset() { $('#closet-panel').hidden = true; }
$('#closet').addEventListener('click', () => ($('#closet-panel').hidden ? openCloset() : closeCloset()));
$('#closet-panel .close').addEventListener('click', closeCloset);

// ---------- 트리 옆 우체통: 친구에게 엽서 ----------
let postOpen = false;
const canMail = () => started && me.inside === null && !me.angel && !me.slide && !me.flap && !(fishing.active || !!me.roast) && !me.seat && postbox.near(me.x, me.z);
/** 친구에게 보낼 주소: 지금 이 게임의 주소에서 점검용 덧붙임(?t= 같은 것)을 뗀 것 */
const inviteUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const inviteText = () => subject(name) + ' 뽀드득 눈밭에서 기다려요! 같이 걸을래? ⛄';
function openPostcard() {
  postOpen = true; me.walk = 0;
  controls.setEnabled(false);
  const el = $('#postcard');
  el.querySelector('.from b').textContent = name;
  el.querySelector('.done').textContent = '';
  el.querySelector('.link').textContent = inviteUrl();
  el.hidden = false;
  audio.snowFx('paper');
}
function closePostcard() { postOpen = false; $('#postcard').hidden = true; controls.setEnabled(true); }
async function sendPostcard() {
  const done = $('#postcard .done');
  const data = { title: '뽀드득', text: inviteText(), url: inviteUrl() };
  if (navigator.share) {
    // (공유가 실패한 뒤에 바로 복사하면, 누른 손길이 이미 쓰여 휴대폰이 복사를 막는다: 복사 단추를 다시 누르게 한다)
    try { await navigator.share(data); done.textContent = '엽서를 보냈어요! 💌'; audio.snowFx('ding'); found('mail'); } catch (e) { if (!e || e.name !== 'AbortError') done.textContent = "'주소 복사'를 눌러 보내 봐요"; }
    return;
  }
  copyInvite();
}
async function copyInvite() {
  const done = $('#postcard .done');
  try { await navigator.clipboard.writeText(inviteText() + ' ' + inviteUrl()); done.textContent = '주소를 복사했어요. 카톡이나 DM에 붙여 넣어 보내요!'; audio.snowFx('ding'); }
  catch { done.textContent = '아래 주소를 길게 눌러 복사해 보내요'; }
}
$('#postcard .send').addEventListener('click', sendPostcard);
$('#postcard .copy').addEventListener('click', copyInvite);
$('#postcard .close').addEventListener('click', closePostcard);
$('#postcard').addEventListener('click', (e) => { if (e.target.id === 'postcard') closePostcard(); });

$('#gift .gift-box').addEventListener('click', tapGift);
$('#gift .gift-close').addEventListener('click', closeGift);
// 트리 옆 산타의 말풍선: 산타가 와 있고, 가까이(30 안) 화면에 보일 때 머리 위에
const sayAt = new THREE.Vector3();
// 아기 물개의 말풍선 (머리 위)
const sealSays = seals.seals.map(() => { const el = document.createElement('div'); el.className = 'seal-say'; el.hidden = true; document.body.append(el); return el; });
const sealAt = new THREE.Vector3();
function placeSealSay() {
  seals.seals.forEach((s, i) => {
    const el = sealSays[i];
    let on = !!s.say && me.inside === null && Math.hypot(s.x - me.x, s.z - me.z) < 18;
    if (on) { sealAt.set(s.x, 1.0, s.z).project(camera); on = sealAt.z < 1 && Math.abs(sealAt.x) < 1.1 && Math.abs(sealAt.y) < 1.1; }
    if (on) { if (el.textContent !== s.say) el.textContent = s.say; el.style.left = ((sealAt.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - sealAt.y) / 2 * innerHeight) + 'px'; }
    el.hidden = !on;
  });
}
// ---------- 특별한 눈송이: 주우면 카드가 잠깐 뜬다 (낚은 것 카드와 같은 자리) ----------
function flakeFound(g) {
  found('flake');
  if (g.f.id === 'star') { me.star = true; setTimeout(() => toast('🌟 별 눈송이가 머리 위에서 반짝여요! 밤이 끝날 때까지 함께해요', 3600), 3200); }      // (주운 별은 아침까지 머리 위에 떠 있다 — 다른 펭귄에게도 보인다)
  crumble.puff(g.x, g.z, 0.4);
  const el = $('#catch');
  el.querySelector('.name').textContent = (g.f.night ? '🌟 ' : '❄️ ') + g.f.name + '를 주웠어요!';
  el.querySelector('.say').textContent = g.f.say;
  el.dataset.kind = g.f.id;
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  el.classList.toggle('rare', g.f.id !== 'hex');
  const ok = showcase.show(el.querySelector('.view'), makeFlake(g.f), { tilt: 1.1, turn: 1.2 });
  el.classList.toggle('flat', !ok);
  audio.snowFx('ding');
  clearTimeout(catchHide); catchHide = setTimeout(hideCatch, 3000);
  stats.flakes++;
}

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

// ---------- 단추 말풍선 (자연스러운 길잡이) ----------
// 단추가 처음 어떤 모습으로 나타나면, 그 옆에 무엇을 하는 단추인지 짧은 말풍선이 뜨고 단추가 살짝 두근거린다 (기기마다 한 번씩).
// 걷기 길잡이가 끝나고 잠시 서 있으면 아래 단추들(배 썰매, 눈 천사, 파닥파닥)도 하나씩 알려 준다.
const NUDGE = {
  // 상황 단추
  roll: ['#act', '⛄ 눌러서 눈을 굴려요. 다 굴리면 눈사람을 꾸밀 수 있어요'],
  fish: ['#act', '🎣 눌러서 낚시! 찌가 쑥 들어가면 한 번 더 눌러요'],
  enter: ['#act', '눌러서 이글루에 들어가요. 안에서 친구랑 앉아 쉴 수 있어요'],
  stump: ['#act', '눌러서 그루터기에 앉아요'],
  roast: ['#act', '🔥 눌러서 마시멜로를 구워요'],
  mail: ['#act', '✉️ 친구에게 같이 걷자고 엽서를 보내요'],
  wish: ['#act', '🎄 다른 펭귄들이 남긴 소원을 보고, 내 소원도 붙여요'],
  look: ['#act', '🔍 누가 만든 눈사람인지 봐요'],
  sitdown: ['#act', '방석에 앉아 지금 하는 일을 골라요'],
  // 상대 단추
  wave: ['#social', '👋 위 단추로 인사해요. 상대 화면에서도 손을 흔들어요'],
  throw: ['#social', '❄️ 조금 떨어진 친구에게 눈덩이! 펭귄을 톡 눌러 고를 수도 있어요'],
  // 아래 단추들 (걷기에 익숙해진 뒤 하나씩)
  slide: ['#slide', '배를 깔고 쭉 미끄러져요. 얼음 위나 언덕에서는 더 멀리!'],
  angel: ['#angel', '눈에 누워 팔을 휘저어 눈 천사를 만들어요'],
  flap: ['#flap', '파닥파닥! 날개를 퍼덕여요'],
  closet: ['#closet', '👒 선물에서 나온 모자·선글라스는 여기 옷장에서 쓰고 벗어요'],
};
const nudge = {
  key: null, until: 0, next: 0,
  /** key 의 말풍선을 (이 기기에서 처음이면) 띄운다. 다른 말풍선이 떠 있으면 다음 기회로 미룬다 */
  show(key) {
    const n = NUDGE[key]; if (!n || hints['nudge-' + key] || !started || modal() || giftOpen || postOpen || busyDoor || coach.on) return false;      // (곧바로 접힐 때는 본 것으로 치지 않는다)
    const now = performance.now();
    if (this.key && now < this.until) return false;
    const btn = $(n[0]); if (!btn || btn.classList.contains('idle')) return false;
    firstTime('nudge-' + key);
    this.hide();
    this.key = key; this.until = now + 6500; this.next = now + 9000;
    const el = $('#nudge'); el.textContent = n[1]; el.hidden = false; el.dataset.for = n[0].slice(1);
    btn.classList.add('nudged');
    this.place();
    return true;
  },
  place() {
    if (!this.key) return;
    const btn = $(NUDGE[this.key][0]), el = $('#nudge'), r = btn.getBoundingClientRect();
    el.style.right = Math.round(innerWidth - r.left + 12) + 'px'; el.style.top = Math.round(r.top + r.height / 2) + 'px';
  },
  hide() {
    if (!this.key) return;
    $(NUDGE[this.key][0]).classList.remove('nudged');
    $('#nudge').hidden = true; this.key = null;
  },
  /** 매 박자: 시간이 다 됐거나 단추가 숨으면 접는다. 걷기 길잡이가 끝나고 가만히 서 있으면 아래 단추를 하나씩 알려 준다 */
  update(now) {
    if (this.key) {
      const sel = NUDGE[this.key][0], stale = (sel === '#act' && actionShown !== this.key) || (sel === '#social' && socialShown !== this.key);      // 단추가 다른 모습으로 바뀌었으면 접는다
      if (now > this.until || stale || $(sel).classList.contains('idle') || modal() || giftOpen || postOpen) this.hide(); else this.place();
      return;
    }
    if (owned.length && !hints['nudge-closet'] && !giftOpen && !modal() && now > this.next) { this.show('closet'); return; }      // 처음 선물을 받으면 옷장을 알려 준다
    if (now < this.next || coach.on || !hints.coach || !free() || me.idle < 3) return;
    for (const k of ['slide', 'angel', 'flap']) if (!hints['nudge-' + k]) { this.show(k); break; }
  },
};
for (const sel of ['#act', '#social', '#slide', '#angel', '#flap', '#closet']) $(sel).addEventListener('click', () => { if (nudge.key && NUDGE[nudge.key][0] === sel) nudge.hide(); });

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
  const mv = giftOpen || busyDoor || postOpen || modal() ? { x: 0, y: 0 } : controls.read();      // 선물 창이 떠 있거나 문을 드나드는 동안에는 걷지 않는다
  const mag = Math.min(1, Math.hypot(mv.x, mv.y));
  // 둘러보기: 오른쪽으로 끌면 오른쪽을, 위로 끌면 위를 본다
  const lk = controls.takeLook();
  me.camYaw -= lk.dx * 0.0052;
  me.camPitch = THREE.MathUtils.clamp(me.camPitch + lk.dy * 0.0035, me.inside !== null ? 0 : 0.08, 0.75);
  me.camDist = THREE.MathUtils.clamp(me.camDist * controls.takeZoom(), CAM_DIST_MIN, me.inside !== null ? DEN_CAM.far : CAM_DIST_MAX);
  coach.note(0, Math.abs(lk.dx) + Math.abs(lk.dy));
  if (mag > 0.02 && !me.angel && !(fishing.active || !!me.roast)) { strolled += dt; rested = 0; } else { rested += dt; strolled = 0; }

  if (me.angel) { stepAngel(dt, now); setSnow(penguin, me.snow, me.pop); return; }
  if (me.slide) { stepSlide(dt, now); setSnow(penguin, 0, 0); return; }      // 미끄러지는 동안에는 걷지 않는다
  if (me.flap) { stepFlap(dt); setSnow(penguin, 0, 0); return; }
  if (me.wave) { stepWave(dt); setSnow(penguin, me.snow, me.pop); return; }      // 인사하는 동안에는 제자리
  if (me.seat) { stepSeat(dt); setSnow(penguin, 0, 0); me.idle = 0; me.snow = 0; return; }      // 앉아 있는 동안에는 걷지 않는다 (일어나려면 단추)        // 파닥이는 동안에도 제자리      // 누울 때 털린 눈이 모습에도 바로 드러나게

  if (me.roast) { stepRoast(dt, mag > 0.3, Math.abs(lk.dx) + Math.abs(lk.dy) > 0); setSnow(penguin, 0, 0); return; }      // 마시멜로를 굽는 동안에는 걷지 않는다 (조이스틱을 밀면 일어난다)
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
    let c = me.inside !== null ? dens.confine(me.inside, me.x + dx * speed * dt, me.z + dz * speed * dt) : field.confine(me.x + dx * speed * dt, me.z + dz * speed * dt);
    if (me.inside === null && slidesOff(me.x, me.z, c.x, c.z)) {      // 언덕 꼭대기에서 비탈로 걸어 나가면: 걷지 않고 비탈 아래쪽을 보고 엎드려 슬라이딩으로 내려간다
      me.yaw = Math.atan2(c.x - HILL.x, c.z - HILL.z);
      startSlide();
      if (me.slide) return;
    }
    if (me.inside === null && !canWalk(me.x, me.z, c.x, c.z)) {      // 슬라이딩 언덕의 비탈은 걸어서 오르지 못한다 (계단으로만): 비탈을 따라 옆으로 비껴 걷는 것도 막는다
      const sx = { x: c.x, z: me.z }, sz = { x: me.x, z: c.z };
      c = canWalk(me.x, me.z, sx.x, sx.z) ? { ...sx, edge: true } : canWalk(me.x, me.z, sz.x, sz.z) ? { ...sz, edge: true } : { x: me.x, z: me.z, edge: true };
    }
    const moved = Math.hypot(c.x - me.x, c.z - me.z);
    me.x = c.x; me.z = c.z;
    me.recent = Math.max(me.recent || 0, moved / Math.max(dt, 1e-3));      // 걸어오던 기세 (배 썰매에 보탠다)
    if (me.roll) stepRoll();                               // 굴리는 눈덩이가 걸은 만큼 커진다
    coach.note(moved, 0);
    if ((me.walked = (me.walked || 0) + moved) > 8 && !hints['found-walk']) found('walk');      // (여덟 걸음쯤 걸으면)
    if (!giftOpen) { const g = xmas.touch(me.x, me.z); if (g) openGift(g); }
    if (c.edge && me.inside === null && performance.now() - me.edgeAt > 7000) { me.edgeAt = performance.now(); toast(onHill(me.x + dx * 0.6, me.z + dz * 0.6) ? '언덕은 계단으로 올라가요 🐧' : '여기부터는 눈이 너무 깊어요'); }
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
      const ice = onIce(px, pz) || onLane(px, pz) || onHill(px, pz), indoors = me.inside !== null;      // 얼음 위와 이글루 안: 발자국이 남지 않고, 발소리는 다져진 눈처럼 낮게 난다
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
  const gy = me.inside === null ? heightAt(me.x, me.z) : 0;      // 언덕 위에서는 그 높이에 선다
  penguin.position.set(me.x, gy + (me.roast ? me.roast.lift : 0), me.z);      // (그루터기 의자에 앉으면 그만큼 높이)
  penguin.rotation.y = me.yaw;
  fwd.set(Math.sin(me.camYaw), 0, Math.cos(me.camYaw));
  focus.set(me.x, CAM_TARGET_H + gy, me.z);
  // 눈 천사를 만드는 동안에는 카메라가 위로 올라가 내려다본다 (자국이 그려지는 모습이 보이게)
  angelLift += ((me.angel ? 1 : 0) - angelLift) * (dt > 0 ? 1 - Math.exp(-dt * 3.5) : 1);
  fishView += ((fishing.active ? 1 : 0) - fishView) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
  slideLift += ((me.slide || me.roll ? 1 : 0) - slideLift) * (dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1);      // (눈을 굴리는 동안에도 앞의 눈덩이가 보이게)      // 미끄러지는 동안 카메라가 조금 올라가 엎드린 몸과 자국이 보이게
  const pitch = Math.min(1.25, me.camPitch + angelLift * 0.62 + fishView * FISH_VIEW.pitch + slideLift * 0.32 + (me.inside !== null ? 0.3 : 0));      // 이글루 안에서는 조금 내려다본다
  const dist = me.camDist + angelLift * 1.2 + slideLift * 1.6;
  camGoal.copy(focus).addScaledVector(fwd, -dist * Math.cos(pitch));
  camGoal.y = focus.y + dist * Math.sin(pitch);
  if (me.inside !== null) {
    // 이글루 안: 바깥처럼 펭귄 뒤 조금 위에서 내려다본다. 벽은 안쪽 면만 그려지므로, 카메라가 벽 밖으로 물러나도 방이 가리지 않고
    // 지붕을 걷어 낸 것처럼 넓게 보인다. 끌어서 돌리고, 두 손가락이나 휠로 가까이·멀리 한다. 걷는 방향의 기준은 카메라가 실제로 보는 쪽이다
    const d = THREE.MathUtils.clamp(me.camDist, DEN_CAM.near, DEN_CAM.far), pitch = THREE.MathUtils.clamp(DEN_CAM.pitch + (d - DEN_CAM.near) / (DEN_CAM.far - DEN_CAM.near) * DEN_CAM.tilt + (me.camPitch - 0.27) * 2.2, DEN_CAM.low, DEN_CAM.high);
    const cx = me.x - Math.sin(me.camYaw) * d * Math.cos(pitch), cz = me.z - Math.cos(me.camYaw) * d * Math.cos(pitch);
    camGoal.set(cx, 0.9 + d * Math.sin(pitch), cz);
    const k = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    camera.position.lerp(camGoal, k);
    viewYaw = Math.atan2(me.x - camera.position.x, me.z - camera.position.z);
    const low = 1 - THREE.MathUtils.clamp((pitch - DEN_CAM.low) / 0.4, 0, 1);      // 낮게 내려올수록 펭귄 얼굴 높이를 본다
    lookAt.set(me.x + Math.sin(me.camYaw) * 0.6 * (1 - low), 0.7 + low * 0.35, me.z + Math.cos(me.camYaw) * 0.6 * (1 - low));
    camera.lookAt(lookAt);
    return;
  }
  if (!started) {      // 타이틀 화면: 마지막에 있던 자리와 상관없이 늘 들어오는 자리에서 트리를 크게 올려다본다 (카드 위로 트리가 보이게)
    const T = TITLE_VIEW, tf = { x: Math.sin(T.camYaw), z: Math.cos(T.camYaw) };
    camera.position.set(T.x - tf.x * T.dist * Math.cos(T.pitch), CAM_TARGET_H + T.dist * Math.sin(T.pitch), T.z - tf.z * T.dist * Math.cos(T.pitch));
    lookAt.set(T.x + tf.x * 2.4, CAM_TARGET_H + 0.55, T.z + tf.z * 2.4);
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
  {      // 오로라: 뜨는 밤, 하늘이 충분히 어두울 때, 바깥에 있을 때만
    const dark = Math.min(1, Math.max(0, (-6 - palette.elev) / 8));
    const level = me.inside === null ? auroraAt(now, snowfall, AURORA_FORCED) * dark : 0;
    aurora.update(seconds, level, focus);
    if (level > 0.5 && started && auroraSaid !== nightId(now)) { auroraSaid = nightId(now); toast('하늘에 오로라가 떴어요! ✨ 오늘 밤엔 오로라 빙어가 낚여요', 4500); }
  }
  weather.update(seconds, camera, snowfall, palette.flake, renderer.domElement.height);
  weather.points.visible = me.inside === null;              // 이글루 안에는 눈이 내리지 않는다
  for (const [i, d] of dens.dens.entries()) d.group.visible = me.inside === i;
  dens.update(dt, camera);
  campfire.update(seconds, Math.min(1, Math.max(0, (6 - palette.elev) / 14)));      // 모닥불: 해가 낮을수록 불빛이 밝다
  postbox.update(dt);
  // 해가 지평선 가까이 내려오면 나무의 전구에 불이 들어온다
  const night = THREE.MathUtils.clamp((3 - palette.elev) / 9, 0, 1);
  field.tree.update(seconds, night, renderer.domElement.height, camera);
  camp.update(night, seconds, camera, scene.fog);
  fox.update(now, dt, me);
  arctic.update(now, dt, me);
  // 해가 지면(저녁부터) 눈토끼가 나오고 빛나는 별 눈송이가 내려온다
  const dusk = night > 0.6 || q.has('night');
  rabbit.update(dt, dusk, me.inside === null ? me : null, now);
  seals.update(dt); placeSealSay();
  if (me.star && !dusk) { me.star = false; }      // 아침이 오면 별은 하늘로 돌아간다
  headStar.visible = !!me.star && me.inside === null && me.pop < 1; if (headStar.visible) bobHeadStar(headStar, seconds, camera);
  const got = flakes.update(dt, dusk, started && me.inside === null ? me : null);
  if (got) flakeFound(got);
  if (me.roll) placeRollBall();
  if (snowcardFor && !snowmanNear()) closeSnowcard();
  snowballs.update(dt); throwIn = Math.max(0, throwIn - dt); hitToast = Math.max(0, hitToast - dt);
  if (me.throwT !== undefined && me.throwT < 0.45) { me.throwT += dt; if (!me.wave) wave(penguin, Math.sin(Math.PI * Math.min(1, me.throwT / 0.45)), 1.5 - me.throwT * 9); if (me.throwT >= 0.45) wave(penguin, 0); }      // 던지는 날갯짓
  xmas.update(now, dt, seconds, me, () => audio.snowFx('hohoho'));
  placeSantaSay();
  if (me.seat) showSay();
  if (started) { net.me(myState()); net.update(dt, me.inside === null ? -1 : me.inside, me); }
  santa.update(now, camera, palette.elev);
  if (frame % 2 === 0) tracks.update(now);
  audio.setWeather(me.inside !== null ? 0 : snowfall);
  audio.setIndoor(me.inside !== null);
  if (frame % 6 === 0) audio.setTreeDistance(Math.hypot(me.x, me.z));
  if (frame % 6 === 3) audio.setCampfireDistance(me.inside === null ? campfire.dist(me.x, me.z) : Infinity);

  if (t - hudAt > 500) {
    hudAt = t;
    $('#clock').textContent = clockText(now);
    $('#storm').textContent = stormText(now);
    tickTip(t);
    const carol = audio.carolTitle;
    $('#carol').textContent = carol;
    $('#carol-row').hidden = !carol;
    document.body.dataset.storm = stormPhase(now);
    document.body.dataset.sky = palette.elev > 6 ? 'day' : palette.elev > -6 ? 'dusk' : 'night';      // 시각 옆의 그림: 해, 지평선의 해, 달
    spotTips(t);
  }
  showAction();
  nudge.update(t);
  { // 내 펭귄 머리 위의 내 이름 (다른 펭귄들에게 보이는 이름과 같다). 이글루 안·창이 떠 있을 때는 감춘다
    const el = $('#me-name'), show = started && me.inside === null && !modal() && !giftOpen && !postOpen && !me.angel && !me.slide;
    if (show) {
      meHead.set(me.x, 1.95 + heightAt(me.x, me.z) + (me.roast ? me.roast.lift : 0), me.z).project(camera);
      if (el.textContent !== name) el.textContent = name;
      el.style.left = ((meHead.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - meHead.y) / 2 * innerHeight) + 'px';
    }
    el.hidden = !show;
  }

  if (started && t - saveAt > 8000) { saveAt = t; save(); }
  renderer.render(scene, camera);
  raf = document.hidden ? 0 : requestAnimationFrame(tick);
}

// ---------- 놀 거리 곁에 오면 알림 ----------
// 낚시 구멍, 이글루, 슬라이딩 언덕, 썰매 길, 모닥불 곁에 들어서면 "해 볼래요?" 알림이 뜬다.
// 한 자리에서 한 번 뜨면 그 자리를 떠났다가 다시 와야 또 뜨고, 같은 종류는 1분 반 안에 다시 뜨지 않는다.
const SPOTS = [
  { key: 'hole', near: () => canFish(), say: '얼음 구멍이에요. 낚시 한번 해 볼래요? 🎣' },
  { key: 'den', near: () => canEnter() >= 0, say: '이글루예요. 들어가서 쉬었다 갈래요? 🔥' },
  { key: 'hill', near: () => nearStairFoot(me.x, me.z), say: '슬라이딩 언덕이에요. 계단으로 올라가 볼래요? 🐧' },
  { key: 'top', near: () => onTop(me.x, me.z), say: '비탈 쪽으로 걸어 나가면 슬라이딩으로 쌩 내려가요!' },
  { key: 'lane', near: () => onPad(me.x, me.z), say: '썰매 경주 길이에요. 슬라이딩으로 기록을 세워 볼래요? 🏁' },
  { key: 'fire', near: () => campfire.dist(me.x, me.z) < ROAST_REACH, say: '모닥불이에요. 그루터기에 앉아 마시멜로 구워 볼래요? 🔥' },
];
const spotWas = {}, spotAt = {};
// 멀리서 처음 보이면 한 번씩: 저기 무엇이 있고 거기서 무엇을 할 수 있는지 (기기마다 한 번, 화면 앞쪽에 보일 때만)
const nearestOf = (list) => Math.min(...list.map((p) => Math.hypot(p.x - me.x, p.z - me.z)));
const inView = (x, z) => { const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz) || 1; return (dx * Math.sin(me.camYaw) + dz * Math.cos(me.camYaw)) / d > 0.55; };
const nearestPt = (list) => list.reduce((b, p) => (Math.hypot(p.x - me.x, p.z - me.z) < Math.hypot(b.x - me.x, b.z - me.z) ? p : b));
const SIGHTS = [
  { key: 'postbox', far: 13, at: () => POSTBOX, say: '트리 옆 빨간 우체통 보여요? 거기서 친구에게 같이 걷자고 엽서를 보낼 수 있어요 💌' },
  { key: 'wishboard', far: 13, at: () => WISHBOARD, say: '트리 뒤 나무 소원판에는 크리스마스 소원을 붙일 수 있어요 🎄' },
  { key: 'igloo', far: 18, at: () => nearestPt(IGLOOS), say: '저기 눈집 이글루가 보여요! 문 앞에서 들어가면 친구랑 앉아 쉴 수 있어요 🏠' },
  { key: 'pond', far: 18, at: () => nearestPt(PONDS), say: '저기 얼음 연못에서는 낚시를 할 수 있어요 🎣 구멍 곁으로 가 봐요' },
  { key: 'hill', far: 22, at: () => HILL, say: '저 언덕은 계단으로 올라가서 슬라이딩으로 쌩 내려올 수 있어요 🐧' },
  { key: 'lane', far: 16, at: () => LANE.start, say: '얼음 썰매 길이 있어요! 출발선에서 슬라이딩하면 얼마나 갔는지 재요 🏁' },
  { key: 'campfire', far: 14, at: () => CAMPFIRE, say: '모닥불이 보여요! 그루터기에 앉아 마시멜로를 구울 수 있어요 🔥' },
  { key: 'gift', far: 11, dist: () => xmas.nearest(me.x, me.z), say: '반짝이는 선물 상자! 다가가서 열면 모자나 선글라스가 나올지도 몰라요 🎁' },
];
let sightAt = -Infinity;
function sightTips(t) {
  if (t - sightAt < 25000 || t < toastUntil || coach.on) return;
  for (const s of SIGHTS) {
    if (hints['sight-' + s.key]) continue;
    const p = s.at ? s.at() : null, d = s.dist ? s.dist() : Math.hypot(p.x - me.x, p.z - me.z);
    if (d > s.far || d < 2.5 || (p && !inView(p.x, p.z))) continue;
    firstTime('sight-' + s.key); sightAt = t; toast(s.say, 4200); return;
  }
}
function spotTips(t) {
  if (!started) return;      // (시작하기 전에는 아무것도 기억하지 않는다)
  const free = !busyDoor && me.inside === null && !(fishing.active || !!me.roast) && !me.slide && !me.angel && !me.seat && !giftOpen && !postOpen && !modal();
  if (!free) { for (const s of SPOTS) spotWas[s.key] = true; return; }      // 미끄러지거나 낚시하거나 이글루에 있는 동안: 알림 없이, 끝난 자리에서 바로 알림이 뜨지 않게 '이미 곁에 있었다'로 둔다
  if (t < toastUntil) return;      // 다른 알림이 떠 있는 동안에는 덮지 않는다 (곁에 있었는지도 그대로 두어, 그 알림이 사라진 뒤에 뜬다)
  for (const s of SPOTS) {
    const near = !!s.near();
    if (near && !spotWas[s.key] && !(t - (spotAt[s.key] ?? -Infinity) < 90000)) { spotAt[s.key] = t; toast(s.say, 3600); }
    spotWas[s.key] = near;
  }
  sightTips(t);
}

// ---------- 시작 ----------
window.addEventListener('resize', resize);
resize();
placeCamera(0);
camera.position.copy(camGoal);

setupInstall();                       // 첫 화면의 '홈 화면에 추가하기' 단추
$('#enter').addEventListener('click', () => {
  if (started || !$('#credits').hidden || !$('#install-help').hidden) return;      // (만든 이·홈 화면 안내 창이 떠 있으면 들어가지 않는다)
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
for (const el of document.querySelectorAll('#mute, #shot, #closet, #act, #social, #slide, #angel, #flap')) el.addEventListener('click', (e) => { if (e.detail > 0) el.blur(); });
// (눌렀다가 단추 밖에서 떼면 click 이 오지 않는다: 마우스로 누르는 것만으로는 아예 초점을 받지 않게 한다)
for (const el of document.querySelectorAll('#mute, #shot, #act, #social, #slide, #angel, #flap')) el.addEventListener('mousedown', (e) => e.preventDefault());

// 누른 단추는 살짝 커졌다가 제자리로 돌아온다 (0.2초쯤)
for (const el of document.querySelectorAll('#mute, #shot, #act, #social, #slide, #angel, #flap, #enter')) {
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
  campfire, aurora, get roast() { return me.roast ? { phase: me.roast.phase, cook: me.roast.cook, result: me.roast.result || null } : null; }, myState: () => myState(),
  get snowfall() { return snowfallAt(clock.now()); },
  get palette() { return sky.palette; },
  get treeLight() { return field.tree.lamp.intensity; },
  get dice() { return dice; }, inviteDice, get diceAsk() { return diceAskGid; },
  snowman: { start: startRoll, stop: stopRoll, open: openSculpt, get roll() { return me.roll; }, get list() { return [...snowmen.values()].map(({ id, x, z, mine, f }) => ({ id, x, z, mine, f })); }, get strokes() { return strokes; }, set strokes(v) { strokes = v; drawPad(); } },
  wishes: { open: openWishes, close: closeWishes, get list() { return wishes; }, get wrote() { return wrote; } },
  flakes, rabbit, seals, sled, lane: LANE,
  closet: { add: (i) => addToCloset(ITEMS[i]), get owned() { return owned.map((it) => it.name); }, open: openCloset, close: closeCloset },
  arctic, foxes, snowballs, social: stats, wave: startWave, throwBall, greetTarget, throwTarget,
  outfit: { force(i) { forcedItem = i; }, wear: (slot, n) => wear(penguin, slot, n), get worn() { return worn(penguin); } }, showCatch, hideCatch,
  net, angel: startAngel, slide: startSlide, flap: startFlap, act: () => act('test'), pressSocial: () => pressSocial(), fishing, xmas, dens, entrances: ENTRANCES, goIn, goOut, get inside() { return me.inside; }, get seat() { return me.seat; }, get status() { return me.status; }, get name() { return name; }, get gift() { return giftOpen; }, tapGift, closeGift,
  photo: takePhoto, get lastShot() { return lastShot; },
  teleport(x, z) { const c = me.inside !== null ? dens.confine(me.inside, x, z) : field.confine(x, z); me.x = c.x; me.z = c.z; },
  /** 지금의 조작 상태로 sec 초를 한꺼번에 흘려보낸다 (화면을 그리지 않고 걷기만 — 느린 기기에서도 같은 결과) */
  sim(sec) { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { walk(1 / 60, clock.now()); crumble.update(1 / 60); } },
  /** 켜 두면 실제 프레임으로는 시간이 흐르지 않고 sim() 으로만 흐른다 (점검에서 한 순간을 정확히 붙잡을 때) */
  get manual() { return manual; }, set manual(on) { manual = !!on; },
  ready: true,
};
