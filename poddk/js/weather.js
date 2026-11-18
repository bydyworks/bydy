// 내리는 눈. 눈송이는 세계에 고정된 자리에서 떨어지고(걸어가면 눈발 사이를 지나가게 된다),
// 카메라 둘레의 상자 밖으로 나간 송이는 반대편에서 다시 나타난다. 위치 계산은 전부 그래픽 카드에서 한다.
import * as THREE from 'three';

const BOX = new THREE.Vector3(56, 18, 56);     // 카메라 둘레에 눈이 내리는 상자 (가로, 높이, 세로)

export function createWeather(scene, { count = 14000 } = {}) {
  const base = new Float32Array(count * 3), rnd = new Float32Array(count * 3);
  let seed = 9;
  const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < count; i++) {
    base[i * 3] = rand() * BOX.x; base[i * 3 + 1] = rand() * BOX.y; base[i * 3 + 2] = rand() * BOX.z;
    // 크기: 대부분 작고, 가끔 큰 송이(가까이 지나가면 뿌옇게 크게 보인다)
    const big = rand();
    rnd[i * 3] = big < 0.72 ? 0.08 + rand() * 0.05 : big < 0.95 ? 0.14 + rand() * 0.07 : 0.24 + rand() * 0.14;
    rnd[i * 3 + 1] = rand();      // 떨어지는 빠르기
    rnd[i * 3 + 2] = rand();      // 흔들림의 엇박
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
  const uniforms = {
    uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: BOX }, uWind: { value: 0 },
    uScale: { value: 600 }, uColor: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 0.95 },
    uFogColor: { value: new THREE.Color('#ffffff') }, uFogNear: { value: 30 }, uFogFar: { value: 150 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 aRnd; uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform float uWind; uniform float uScale;
      varying float vFog; varying float vSoft;
      void main(){
        vec3 p = position;
        float fall = uTime * (0.9 + aRnd.y * 1.1) * (1.0 + uWind * 1.6);
        p.y = mod(position.y - fall, uBox.y);
        float sway = sin(uTime * (0.5 + aRnd.z * 0.9) + aRnd.z * 50.0);
        p.x += sway * 0.35 - uWind * 5.0 * (1.0 - p.y / uBox.y);     // 눈발이 굵을수록 바람에 비스듬히 날린다
        p.z += cos(uTime * 0.4 + aRnd.z * 31.0) * 0.25;
        // 카메라 둘레의 상자 안으로 접어 넣는다 (세계에 고정된 채로 끝없이 이어진다)
        p.x += uBox.x * floor((uCenter.x - p.x) / uBox.x + 0.5);
        p.z += uBox.z * floor((uCenter.z - p.z) / uBox.z + 0.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = aRnd.x * uScale / max(0.2, -mv.z);
        gl_PointSize = clamp(size, 1.0, 46.0);
        vSoft = clamp(size / 14.0, 0.0, 1.0);                        // 큰(가까운) 송이일수록 가장자리가 흐리다
        vFog = smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p.xz - uCenter.xz));   // 상자 가장자리에서 서서히 사라진다
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; varying float vFog; varying float vSoft;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, mix(0.32, 0.05, vSoft), d) * uOpacity * (1.0 - vFog) * mix(1.0, 0.55, vSoft);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  /**
   * @param {number} time 초 (흐르는 시간) @param {THREE.Camera} camera @param {number} snowfall 0..1
   * @param {THREE.Color} color 눈송이 색 @param {number} viewHeight 화면 높이(px)
   */
  function update(time, camera, snowfall, color, viewHeight) {
    uniforms.uTime.value = time;
    uniforms.uCenter.value.copy(camera.position);
    uniforms.uWind.value = Math.max(0, snowfall - 0.3) / 0.7;
    uniforms.uColor.value.copy(color);
    uniforms.uScale.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    geo.setDrawRange(0, Math.floor(count * (0.12 + 0.88 * Math.min(1, snowfall))));
  }

  return { update, points };
}
