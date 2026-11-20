// 홈 화면 아이콘: 게임 속 우리 펭귄(빨간 목도리)을 그대로 3D 로 찍어, 하늘빛 바탕과 눈 언덕 위에 얹는다.
//   node tests/icons.mjs     → icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png, favicon-32.png
// (펭귄 모습이 바뀌었거나 그림을 바꾸고 싶을 때만 다시 돌린다. 만든 그림은 저장소에 함께 넣는다)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStatic, launch, open } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'icons');
mkdirSync(out, { recursive: true });

const site = await startStatic(); const browser = await launch(); const errors = [];
try {
  const { page } = await open(browser, site.url, { query: 'server=off', errors, enter: false });
  // 펭귄을 투명한 바탕에 크게 한 번 찍어 둔다 (정면에서 살짝 위, 고개를 조금 돌린 모습)
  await page.evaluate(async () => {
    const THREE = await import('three');
    const { build, pose } = await import('./js/penguin.js');
    const S = 1024, canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#eef5ff', '#c9d8ee', 2.2));
    const sun = new THREE.DirectionalLight('#fff4e6', 2.6); sun.position.set(2.5, 4, 5); scene.add(sun);
    const rim = new THREE.DirectionalLight('#cfe4ff', 1.2); rim.position.set(-3, 2, -2); scene.add(rim);
    const p = build({ scarf: true, color: '#d0312d' }); pose(p, 0, 0); p.rotation.y = -0.38; scene.add(p);
    const box = new THREE.Box3().setFromObject(p), c = box.getCenter(new THREE.Vector3()), h = box.max.y - box.min.y;
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    cam.position.set(c.x, c.y + h * 0.18, c.z + h * 2.55); cam.lookAt(c.x, c.y + h * 0.02, c.z);
    renderer.render(scene, cam);
    window.__penguinPng = canvas.toDataURL('image/png');
  });
  // 크기마다: 하늘빛 바탕, 눈송이, 눈 언덕, 그림자 위에 펭귄. pad: 가장자리 여백 비율 (maskable 은 잘려도 남도록 더 작게)
  const make = async (name, size, pad) => {
    const url = await page.evaluate(async ([size, pad]) => {
      const img = new Image(); img.src = window.__penguinPng; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), S = size;
      const sky = x.createLinearGradient(0, 0, 0, S); sky.addColorStop(0, '#a9d4fa'); sky.addColorStop(1, '#e6f3ff');
      x.fillStyle = sky; x.fillRect(0, 0, S, S);
      if (size >= 120) { x.fillStyle = 'rgba(255,255,255,0.95)'; for (const [px, py, r] of [[0.13, 0.15, 0.017], [0.3, 0.07, 0.011], [0.84, 0.11, 0.019], [0.9, 0.33, 0.011], [0.07, 0.42, 0.012], [0.7, 0.05, 0.009]]) { x.beginPath(); x.arc(px * S, py * S, r * S, 0, Math.PI * 2); x.fill(); } }
      x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, S * 0.8); x.quadraticCurveTo(S * 0.5, S * 0.68, S, S * 0.8); x.lineTo(S, S); x.lineTo(0, S); x.closePath(); x.fill();
      const inner = S * (1 - pad * 2), o = S * pad;
      x.fillStyle = 'rgba(120,150,195,0.28)'; x.beginPath(); x.ellipse(S * 0.5, o + inner * 0.93, inner * 0.24, inner * 0.04, 0, 0, Math.PI * 2); x.fill();
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, o, o, inner, inner);
      return c.toDataURL('image/png');
    }, [size, pad]);
    writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    console.log(name);
  };
  await make('icon-192.png', 192, 0.04);
  await make('icon-512.png', 512, 0.04);
  await make('maskable-512.png', 512, 0.16);
  await make('apple-touch-icon.png', 180, 0.05);
  await make('favicon-32.png', 32, 0);
  if (errors.length) console.log('errors', errors);
} finally { await browser.close(); await site.close(); }
