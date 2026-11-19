// 눈밭과 가운데의 나무. 땅은 평평하다(발자국이 그대로 눕도록).
// 온통 흰 땅에서는 걸어도 움직이는 느낌이 나지 않으므로, 눈 위로 삐죽 나온 마른 풀을 드문드문 심어 둔다.
import * as THREE from 'three';

export const FIELD_RADIUS = 110;      // 걸어 다닐 수 있는 들판의 반지름 (끝에서 끝까지 걸어서 3분쯤)
export const TREE_RADIUS = 1.9;       // 나무 둥치 둘레 — 이 안으로는 못 들어간다

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 눈밭의 얼룩: 아주 옅은 푸른 그늘이 구름처럼 번진 무늬 (평평한 흰색이 밋밋해 보이지 않게) */
function snowTexture() {
  const size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, size, size);
  const rand = mulberry(11);
  for (let i = 0; i < 90; i++) {
    const px = rand() * size, py = rand() * size, r = 18 + rand() * 46;
    const dark = rand() < 0.5;
    // 가장자리에 걸친 얼룩은 반대편에도 똑같이 그려 이음매가 없게 한다
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, dark ? 'rgba(196,208,236,0.16)' : 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 26);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 나무의 네 단: [아래쪽 반지름, 높이, 가운데 높이]
const TIERS = [[3.5, 4.4, 3.6], [2.9, 4.0, 6.0], [2.2, 3.6, 8.2], [1.5, 3.2, 10.3]];
const ORNAMENT_COLORS = ['#d0312d', '#e3a51f', '#2f66c0', '#e0528f', '#f2efe6'];
const BULB_COLORS = ['#ffd27a', '#ff8a7a', '#8fd0ff', '#b6f0a0', '#ffb3e6'];

/** 단의 겉면 위의 한 점: 높이 비율 f(0 = 아래 가장자리, 1 = 꼭대기), 둘레 각도 a. out 만큼 바깥으로 */
function onTier([r, h, y], f, a, out = 0) {
  const rad = r * (1 - f) + out;
  return new THREE.Vector3(Math.cos(a) * rad, y - h / 2 + f * h, Math.sin(a) * rad);
}

function loneTree() {
  const g = new THREE.Group();
  const rand = mulberry(21);
  const leaf = new THREE.MeshStandardMaterial({ color: '#2f5d50', roughness: 1, flatShading: true });
  const cap = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#5b4336', roughness: 1 }));
  trunk.position.y = 1.1; g.add(trunk);
  // 아래에서 위로 갈수록 작아지는 네 단. 단마다 위쪽 절반에 눈이 얹혀 있다.
  TIERS.forEach(([r, h, y]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), leaf); c.position.y = y; g.add(c);
    const hc = h * 0.5, s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5 * 1.16, hc, 9), cap); s.position.y = y + h / 2 - hc / 2 + 0.04; g.add(s);
  });
  // 둥치 둘레에 쌓인 눈 둔덕
  const mound = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }));
  mound.scale.set(1, 0.16, 1); g.add(mound);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // 방울 장식: 단마다 아래쪽(눈이 없는 초록 부분)에 빙 둘러 단다
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 }), 60);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  let n = 0;
  TIERS.forEach((tier, ti) => {
    const count = [11, 9, 7, 5][ti];
    for (let i = 0; i < count; i++) {
      const p = onTier(tier, 0.08 + rand() * 0.34, (i / count) * Math.PI * 2 + rand() * 0.35 + ti, 0.02);
      m.makeScale(1, 1, 1).setPosition(p.x, p.y - 0.12, p.z);
      balls.setMatrixAt(n, m);
      balls.setColorAt(n, col.set(ORNAMENT_COLORS[Math.floor(rand() * ORNAMENT_COLORS.length)]));
      n++;
    }
  });
  balls.count = n; balls.castShadow = true;
  balls.instanceMatrix.needsUpdate = true; balls.instanceColor.needsUpdate = true;
  g.add(balls);

  // 꼭대기 별: 납작한 다섯 갈래 별 두 장을 엇갈려 세운다
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.26 : 0.6; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  starShape.closePath();
  const starMat = new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb400', emissiveIntensity: 0.25, roughness: 0.4, side: THREE.DoubleSide });
  const star = new THREE.Group();
  [0, Math.PI / 2].forEach((ry) => { const s = new THREE.Mesh(new THREE.ShapeGeometry(starShape), starMat); s.rotation.y = ry; s.castShadow = true; star.add(s); });
  star.position.y = 10.3 + 1.6 + 0.45;
  g.add(star);

  // 전구: 나무를 나선으로 감아 올라가는 줄. 낮에는 작은 알갱이, 해가 지면 불이 들어온다.
  const bulbs = [];
  TIERS.forEach((tier, ti) => {
    const turns = 1.15, count = [16, 13, 10, 7][ti];
    for (let i = 0; i < count; i++) {
      const f = 0.04 + (i / count) * 0.5;
      const p = onTier(tier, f, (i / count) * Math.PI * 2 * turns + ti * 1.3, 0.05);
      bulbs.push({ p, color: new THREE.Color(BULB_COLORS[(i + ti) % BULB_COLORS.length]), phase: rand() * Math.PI * 2, speed: 0.6 + rand() * 1.2 });
    }
  });
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), bulbs.length);
  bulbs.forEach((b, i) => { m.makeScale(1, 1, 1).setPosition(b.p.x, b.p.y, b.p.z); bulbMesh.setMatrixAt(i, m); bulbMesh.setColorAt(i, b.color); });
  bulbMesh.instanceMatrix.needsUpdate = true;
  g.add(bulbMesh);

  // 불빛의 번짐: 전구마다 부드러운 빛 덩이를 겹쳐 그린다 (밤에만 보인다)
  const glowPos = new Float32Array(bulbs.length * 3), glowCol = new Float32Array(bulbs.length * 3), glowAmp = new Float32Array(bulbs.length);
  bulbs.forEach((b, i) => { glowPos.set([b.p.x, b.p.y, b.p.z], i * 3); glowCol.set([b.color.r, b.color.g, b.color.b], i * 3); });
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setAttribute('aColor', new THREE.BufferAttribute(glowCol, 3));
  glowGeo.setAttribute('aAmp', new THREE.BufferAttribute(glowAmp, 1));
  const glowUniforms = { uScale: { value: 600 }, uNight: { value: 0 } };
  const glow = new THREE.Points(glowGeo, new THREE.ShaderMaterial({
    uniforms: glowUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aAmp; uniform float uScale; varying vec3 vColor; varying float vAmp;
      void main(){ vColor = aColor; vAmp = aAmp; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(1.35 * uScale / max(0.3, -mv.z), 2.0, 90.0); }`,
    fragmentShader: `uniform float uNight; varying vec3 vColor; varying float vAmp;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.2) * uNight * vAmp;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  glow.frustumCulled = false; glow.renderOrder = 4;
  g.add(glow);

  // 밤에 나무 둘레의 눈밭을 은은하게 물들이는 빛 (전구 하나하나가 빛을 내면 무거우니, 따뜻한 빛 하나로 대신한다)
  const lamp = new THREE.PointLight('#ffcf8f', 0, 34, 1.6);
  lamp.position.set(0, 4.2, 0);
  g.add(lamp);

  const white = new THREE.Color('#ffffff'), dim = new THREE.Color();
  /** @param {number} time 초 @param {number} night 0(낮)..1(밤) @param {number} viewHeight 화면 높이(px) @param {THREE.Camera} camera */
  function update(time, night, viewHeight, camera) {
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const tw = 0.72 + 0.28 * Math.sin(time * b.speed + b.phase);          // 천천히 깜빡인다
      glowAmp[i] = tw;
      // 낮: 꺼진 전구(색이 옅게 도는 흰 알갱이). 밤: 제 색으로 밝게
      bulbMesh.setColorAt(i, dim.copy(white).lerp(b.color, 0.35 + 0.65 * night).multiplyScalar(0.75 + night * tw * 1.6));
    }
    bulbMesh.instanceColor.needsUpdate = true;
    glowGeo.attributes.aAmp.needsUpdate = true;
    glowUniforms.uNight.value = night;
    glowUniforms.uScale.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    starMat.emissiveIntensity = 0.25 + night * 1.5;
    lamp.intensity = night * 55 * (0.92 + 0.08 * Math.sin(time * 1.7));
  }

  return { group: g, update, bulbCount: bulbs.length, lamp };
}

/** 눈 위로 나온 마른 풀 포기들 (걸어서 지나갈 수 있다). clearings: 풀이 나지 않는 곳들 [{x, z, r}] */
function grassTufts(count, rand, clearings = []) {
  const blade = new THREE.ConeGeometry(0.02, 0.5, 4);
  blade.translate(0, 0.25, 0);
  const mesh = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#b39a6b', roughness: 1 }), count * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < count; i++) {
    const r = 6 + Math.sqrt(rand()) * (FIELD_RADIUS + 30), a = rand() * Math.PI * 2;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const bare = clearings.some((c) => Math.hypot(cx - c.x, cz - c.z) < c.r);
    for (let k = 0; k < 3; k++) {
      p.set(cx + (rand() - 0.5) * 0.18, 0, cz + (rand() - 0.5) * 0.18);
      e.set((rand() - 0.5) * 0.7, rand() * 6.28, (rand() - 0.5) * 0.7);
      const h = 0.5 + rand() * 0.9;
      s.set(1, bare ? 0 : h, 1);                         // 빈터의 풀은 크기를 0 으로 (자리 순서는 그대로 두어 다른 풀들이 옮겨 가지 않게)
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(n++, m);
    }
  }
  mesh.castShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * @param {{ clearings?: {x:number, z:number, r:number}[], blocks?: {x:number, z:number, r:number}[] }} [o]
 *   clearings: 풀이 나지 않는 곳, blocks: 걸어서 들어갈 수 없는 둥근 자리들 (이글루 같은 것)
 */
export function createField(scene, { clearings = [], blocks = [] } = {}) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(900, 72),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: snowTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // 무늬가 UV 가 아니라 땅 위치에 붙어 있도록 (원판의 UV 는 0..1 로 한 번만 깔려 있다)
  ground.material.map.repeat.set(70, 70);

  const tree = loneTree();
  scene.add(tree.group);
  scene.add(grassTufts(520, mulberry(5), clearings));

  /** 가려는 자리를 들판 안으로, 나무 밖으로 고쳐 준다. @returns {{x:number, z:number, edge:boolean}} */
  function confine(x, z) {
    let edge = false;
    const r = Math.hypot(x, z);
    if (r > FIELD_RADIUS) { x *= FIELD_RADIUS / r; z *= FIELD_RADIUS / r; edge = true; }
    if (r < TREE_RADIUS) {
      const k = r < 1e-4 ? 1 : TREE_RADIUS / r;
      x = r < 1e-4 ? TREE_RADIUS : x * k; z = z * k;
    }
    for (const b of blocks) {
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
      if (d < b.r) { const k = d < 1e-4 ? 0 : b.r / d; x = d < 1e-4 ? b.x + b.r : b.x + dx * k; z = b.z + dz * k; }
    }
    return { x, z, edge };
  }

  return { ground, tree, confine };      // tree.update(time, night, viewHeight, camera) 로 전구를 깜빡인다
}
