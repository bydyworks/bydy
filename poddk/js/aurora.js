// 밤의 오로라: 어떤 밤에는 하늘에 초록·보랏빛 커튼이 일렁인다.
//   · 어느 밤에 뜰지는 날짜로 정해진다 (모두에게 같은 밤에 뜬다). 대략 다섯 밤에 두 번.
//   · 저녁 8시쯤 서서히 나타나 새벽 4시쯤 사라진다. 눈이 많이 오는 동안에는 구름에 가려 보이지 않는다.
//   · 오로라가 뜬 동안에만 얼음 구멍에서 "오로라 빙어"가 낚인다.
//   주소에 ?aurora 를 붙이면 그날 밤이 아니어도 (밤이면) 뜬다 (구경용).
import * as THREE from 'three';
import { kst } from './clock.js';

const HOUR = 3600 * 1000;
/** 그 밤(저녁~새벽)의 번호: 정오에서 다음 날 정오까지를 한 밤으로 친다 */
const nightKey = (ms) => kst(ms - 12 * HOUR).dayStart / (24 * HOUR);
/** 그 밤의 번호 (정수) */
export const nightId = (ms) => Math.round(nightKey(ms));
/** 그 밤에 오로라가 뜨는가 (날짜로 정해진다) */
export function auroraNight(ms) {
  const n = Math.round(nightKey(ms));
  let h = Math.imul(n, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h % 5 < 2;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 그 시각의 오로라 세기 0..1 (밤이 아니거나 오로라가 뜨지 않는 밤이면 0). forced: 날짜와 상관없이 띄운다 */
export function auroraAt(ms, snowfall = 0, forced = false) {
  if (!forced && !auroraNight(ms)) return 0;
  const h = kst(ms).hour, t = h < 12 ? h + 24 : h;           // 저녁 8시 = 20, 새벽 4시 = 28
  const time = smooth(19.8, 20.8, t) * (1 - smooth(27.5, 28.5, t));
  const clear = 1 - smooth(0.3, 0.55, snowfall);              // 눈이 많이 오면 가려진다
  return time * clear;
}

const VERT = `
  uniform float time; uniform float seed;
  varying vec2 vUv; varying float vWave;
  void main(){
    vUv = uv;
    vec3 p = position;
    float w = sin(uv.x * 7.0 + time * 0.23 + seed) * 0.6 + sin(uv.x * 17.0 - time * 0.41 + seed * 2.0) * 0.25;
    vWave = w;
    p.z += w * 38.0;                                   // 커튼이 앞뒤로 너울거린다
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FRAG = `
  uniform float time; uniform float strength; uniform float seed;
  varying vec2 vUv; varying float vWave;
  float hash(float n){ return fract(sin(n) * 43758.5453); }
  float noise(float x){ float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main(){
    float y = vUv.y, x = vUv.x + sin(y * 3.0 + time * 0.5 + seed) * 0.012 + vWave * 0.01;      // 빛줄기가 살짝 휘어 흔들린다
    // 세로로 늘어진 빛줄기: 가로로 촘촘한 줄무늬가 천천히 흐른다
    float rays = noise(x * 90.0 + time * 0.8 + seed * 10.0) * 0.6 + noise(x * 31.0 - time * 0.35 + seed * 4.0) * 0.6;
    rays = smoothstep(0.35, 1.05, rays);
    // 아래 끝은 또렷하고 위로 갈수록 옅어진다
    float bottom = smoothstep(0.0, 0.08, y), top = 1.0 - smoothstep(0.25, 1.0, y);
    // 가로로 끝이 부드럽게 사라진다
    float ends = smoothstep(0.0, 0.18, x) * (1.0 - smoothstep(0.82, 1.0, x));
    // 아래는 초록, 위로 갈수록 청록을 지나 보랏빛
    vec3 green = vec3(0.3, 1.0, 0.45), teal = vec3(0.2, 0.9, 0.85), violet = vec3(0.75, 0.38, 1.0);
    vec3 c = mix(green, teal, smoothstep(0.25, 0.55, y));
    c = mix(c, violet, smoothstep(0.5, 0.95, y));
    float a = rays * bottom * top * ends * (0.55 + 0.45 * (0.5 + 0.5 * vWave)) * strength * 1.6;
    gl_FragColor = vec4(c * a, 1.0);
  }`;

export function createAurora(scene) {
  const g = new THREE.Group();
  g.renderOrder = -9;
  const ribbons = [];
  // 커튼 다섯: 하늘을 빙 둘러, 서로 다른 높이와 거리로 (어느 쪽을 보아도 하나쯤은 보인다)
  for (const [yaw, dist, w, h, y, seed] of [[0.3, 560, 760, 220, 70, 1.3], [1.55, 600, 720, 200, 95, 4.1], [2.8, 540, 760, 230, 75, 7.7], [4.05, 590, 700, 200, 90, 2.9], [5.3, 560, 740, 210, 80, 5.6]]) {
    const geo = new THREE.PlaneGeometry(w, h, 120, 1);
    // 활처럼 휘게: 가운데가 멀고 양 끝이 조금 가깝다
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, -Math.pow(x / (w / 2), 2) * 120); }
    geo.translate(0, h / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, strength: { value: 0 }, seed: { value: seed } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.sin(yaw) * dist, y, Math.cos(yaw) * dist); m.lookAt(0, y, 0);
    m.frustumCulled = false; m.renderOrder = -9;
    g.add(m); ribbons.push(m);
  }
  g.visible = false;
  scene.add(g);
  let strength = 0;
  return {
    group: g,
    get strength() { return strength; },
    /** level: 0..1 (auroraAt 으로 잰 세기), focus: 카메라가 보는 곳 (오로라는 늘 하늘 저 멀리에 있도록 따라간다) */
    update(seconds, level, focus) {
      strength += (level - strength) * 0.05;                  // (갑자기 켜지거나 꺼지지 않게)
      if (strength < 0.002 && level === 0) strength = 0;
      g.visible = strength > 0.002;
      if (!g.visible) return;
      g.position.set(focus.x, 0, focus.z);
      for (const r of ribbons) { r.material.uniforms.time.value = seconds; r.material.uniforms.strength.value = strength; }
    },
  };
}
