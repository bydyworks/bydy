// 하늘과 빛. 구름도 해도 그리지 않는다: 해의 높이에 따라 하늘 색이 위아래로 번지며 바뀌고,
// 낮은 해가 긴 그림자를 만든다. 밤에는 달빛이 대신한다.
import * as THREE from 'three';
import { sunAt } from './clock.js';

// 해의 높이(도)별 색. 사이는 섞는다.
// (빛의 세기는 "흰 눈밭이 볕에서는 거의 흰색, 그늘에서는 그 2/3쯤" 이 되도록 맞춘 값이다 — 그래야 그림자가 또렷하다)
//   sky: [지평선, 중간, 꼭대기]  sun: 직사광 색·세기  hemi: 하늘빛(위/아래)·세기  glow: 해 쪽 지평선의 번짐  print: 발자국 색  flake: 눈송이 색
const KEYS = [
  { e: -18, sky: ['#3d4288', '#262b66', '#0e1236'], sun: '#c3ceff', sunI: 1.3, hemi: ['#7480cc', '#8f98d6'], hemiI: 1.3, glow: '#3d4288', glowI: 0, print: '#59629e', flake: '#e6eaff' },
  { e: -8, sky: ['#6d5a9e', '#3f3d86', '#161a4a'], sun: '#c3ceff', sunI: 1.0, hemi: ['#8c8fd2', '#a09fd8'], hemiI: 1.45, glow: '#b06a8c', glowI: 0.25, print: '#646aa6', flake: '#ecebff' },
  { e: -2, sky: ['#f29a7c', '#a56fa6', '#3a3d86'], sun: '#ffb38a', sunI: 1.6, hemi: ['#b9a6d8', '#c9b4d6'], hemiI: 1.75, glow: '#ff9a6a', glowI: 0.7, print: '#7a78b0', flake: '#fff0ee' },
  { e: 4, sky: ['#ffc08a', '#f29bb0', '#6a6fc0'], sun: '#ffcf9f', sunI: 4.8, hemi: ['#d6d3f6', '#dcd6ee'], hemiI: 1.9, glow: '#ffd08a', glowI: 0.8, print: '#8f9ccf', flake: '#fff6ee' },
  { e: 12, sky: ['#ffe2bd', '#c4d8f4', '#6fa7ea'], sun: '#fff0d8', sunI: 4.6, hemi: ['#dfeaff', '#e6ecfa'], hemiI: 2.05, glow: '#fff0c8', glowI: 0.45, print: '#93a6d6', flake: '#f1f5fc' },
  { e: 24, sky: ['#e2f1ff', '#a9d6fa', '#5aa5ea'], sun: '#ffffff', sunI: 2.6, hemi: ['#e3efff', '#eaf1fb'], hemiI: 2.1, glow: '#ffffff', glowI: 0.2, print: '#9ab0dc', flake: '#dfe8f6' },
];
const C = (hex) => new THREE.Color(hex);
KEYS.forEach((k) => {
  k.skyC = k.sky.map(C); k.sunC = C(k.sun); k.hemiC = k.hemi.map(C); k.glowC = C(k.glow); k.printC = C(k.print); k.flakeC = C(k.flake);
});

/** 해의 높이 → 섞인 팔레트 (같은 객체를 다시 채워 돌려준다) */
const mixed = { sky: [C('#000'), C('#000'), C('#000')], sun: C('#000'), sunI: 0, hemi: [C('#000'), C('#000')], hemiI: 0, glow: C('#000'), glowI: 0, print: C('#000'), flake: C('#000'), elev: 0 };
export function paletteAt(elev) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1], t = 0;
  if (elev <= a.e) { b = a; } else if (elev >= b.e) { a = b; } else {
    for (let i = 0; i < KEYS.length - 1; i++) if (elev >= KEYS[i].e && elev <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; t = (elev - a.e) / (b.e - a.e); break; }
  }
  for (let i = 0; i < 3; i++) mixed.sky[i].copy(a.skyC[i]).lerp(b.skyC[i], t);
  mixed.sun.copy(a.sunC).lerp(b.sunC, t);
  mixed.hemi[0].copy(a.hemiC[0]).lerp(b.hemiC[0], t);
  mixed.hemi[1].copy(a.hemiC[1]).lerp(b.hemiC[1], t);
  mixed.glow.copy(a.glowC).lerp(b.glowC, t);
  mixed.print.copy(a.printC).lerp(b.printC, t);
  mixed.flake.copy(a.flakeC).lerp(b.flakeC, t);
  mixed.sunI = a.sunI + (b.sunI - a.sunI) * t;
  mixed.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  mixed.glowI = a.glowI + (b.glowI - a.glowI) * t;
  mixed.elev = elev;
  return mixed;
}

export function createSky(scene, { shadowSize = 2048 } = {}) {
  const uniforms = {
    c0: { value: C('#000') }, c1: { value: C('#000') }, c2: { value: C('#000') },
    glow: { value: C('#000') }, glowI: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 0, 1) }, haze: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 glow; uniform float glowI; uniform vec3 sunDir; uniform float haze;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = h < 0.2 ? mix(c0, c1, h / 0.2) : mix(c1, c2, smoothstep(0.2, 0.85, h));
          // 해가 있는 쪽 지평선이 조금 더 밝게 번진다 (해 자체는 그리지 않는다)
          vec2 a = normalize(d.xz + 1e-5), b = normalize(sunDir.xz + 1e-5);
          float toward = pow(max(dot(a, b), 0.0), 3.0) * (1.0 - smoothstep(0.0, 0.45, h));
          c = mix(c, glow, toward * glowI);
          c = mix(c, c0, haze * (1.0 - h * 0.6));           // 눈발이 굵으면 하늘이 지평선 색으로 뿌옇게 덮인다
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const S = 46;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 30, 150);

  const dir = new THREE.Vector3();
  const fogColor = C('#fff');
  const white = C('#fff');
  let palette = mixed;

  /** @param {number} ms 세계 시각 @param {THREE.Vector3} focus 그림자를 맞출 곳(펭귄) @param {number} snowfall 0..1 */
  function update(ms, focus, snowfall) {
    const { elev, azim } = sunAt(ms);
    palette = paletteAt(elev);
    uniforms.c0.value.copy(palette.sky[0]); uniforms.c1.value.copy(palette.sky[1]); uniforms.c2.value.copy(palette.sky[2]);
    uniforms.glow.value.copy(palette.glow); uniforms.glowI.value = palette.glowI;
    uniforms.haze.value = Math.max(0, snowfall - 0.35) * 1.1;

    // 빛이 오는 쪽: 해가 떠 있으면 해, 지면 달(해의 맞은편 하늘, 높이는 고정). 바뀌는 순간에는 빛이 가장 약하다.
    const day = elev > -5;
    const lightElev = day ? Math.max(elev, 12) : 34;      // 해가 지평선에 붙어도 빛은 12도보다 눕지 않는다 (그림자가 길되, 땅에 볕이 닿도록)
    const lightAzim = day ? azim : azim + 180;
    const el = THREE.MathUtils.degToRad(lightElev), az = THREE.MathUtils.degToRad(lightAzim);
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));   // 동쪽이 +X, 남쪽이 +Z (방위 90도 = 동, 180도 = 남)
    uniforms.sunDir.value.copy(dir);
    const dip = THREE.MathUtils.clamp(Math.abs(elev + 5) / 3.5, 0, 1);                   // 높이 -5도 부근에서 0
    const lowSun = day ? THREE.MathUtils.clamp((elev + 5) / 9, 0, 1) : 1;
    sun.color.copy(palette.sun);
    sun.intensity = palette.sunI * dip * (0.25 + 0.75 * lowSun) * (1 - 0.55 * Math.max(0, snowfall - 0.35) / 0.65);
    sun.position.copy(focus).addScaledVector(dir, 120);
    sun.target.position.copy(focus);
    sun.target.updateMatrixWorld();

    hemi.color.copy(palette.hemi[0]);
    hemi.groundColor.copy(palette.hemi[1]);
    hemi.intensity = palette.hemiI;

    // 안개: 지평선 색. 눈발이 굵을수록 가까이서부터 뿌옇다.
    fogColor.copy(palette.sky[0]).lerp(white, 0.18 + snowfall * 0.2);
    scene.fog.color.copy(fogColor);
    scene.fog.near = 34 - snowfall * 26;
    scene.fog.far = 165 - snowfall * 118;
    dome.position.set(focus.x, 0, focus.z);
    return palette;
  }

  return { update, get palette() { return palette; }, sun, hemi, dome, lightDir: dir };
}
