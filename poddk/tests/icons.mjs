// 홈 화면 아이콘을 그린다: 하늘빛 바탕에 눈 언덕, 빨간 목도리를 두른 펭귄 얼굴, 내리는 눈송이.
//   node tests/icons.mjs     → icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png, favicon-32.png
// (그림을 바꾸고 싶을 때만 다시 돌린다. 만든 그림은 저장소에 함께 넣는다)
import { chromium } from './harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'icons');
mkdirSync(out, { recursive: true });

// size: 그림 크기, pad: 가장자리 여백 비율 (maskable 은 둥글게·네모로 잘려도 펭귄이 남도록 더 작게)
const DRAW = (size, pad) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const S = size, k = S * (1 - pad * 2) / 512, o = S * pad;           // 512 칸 기준으로 그린다
  const sky = x.createLinearGradient(0, 0, 0, S); sky.addColorStop(0, '#bfe0fb'); sky.addColorStop(1, '#eaf5ff');
  x.fillStyle = sky; x.fillRect(0, 0, S, S);
  // 눈송이
  x.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [px, py, r] of [[0.14, 0.16, 0.018], [0.3, 0.08, 0.012], [0.82, 0.12, 0.02], [0.9, 0.34, 0.012], [0.08, 0.44, 0.013], [0.7, 0.05, 0.01], [0.55, 0.13, 0.011]]) { x.beginPath(); x.arc(px * S, py * S, r * S, 0, Math.PI * 2); x.fill(); }
  // 눈 언덕
  x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, S * 0.8); x.quadraticCurveTo(S * 0.5, S * 0.66, S, S * 0.8); x.lineTo(S, S); x.lineTo(0, S); x.closePath(); x.fill();
  x.fillStyle = 'rgba(160,190,225,0.35)'; x.beginPath(); x.ellipse(S * 0.5, S * 0.86, S * 0.3, S * 0.035, 0, 0, Math.PI * 2); x.fill();      // 그림자
  x.save(); x.translate(o, o); x.scale(k, k);
  // 몸
  x.fillStyle = '#26324a'; x.beginPath(); x.ellipse(256, 300, 150, 168, 0, 0, Math.PI * 2); x.fill();
  // 날개
  for (const s of [-1, 1]) { x.save(); x.translate(256 + s * 140, 330); x.rotate(s * -0.35); x.beginPath(); x.ellipse(0, 0, 34, 86, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  // 얼굴과 배 (하얀 하트 모양 가면)
  x.fillStyle = '#ffffff';
  x.beginPath(); x.moveTo(256, 196);
  x.bezierCurveTo(206, 140, 128, 168, 136, 250); x.bezierCurveTo(140, 300, 170, 340, 172, 380);
  x.bezierCurveTo(176, 440, 220, 462, 256, 462); x.bezierCurveTo(292, 462, 336, 440, 340, 380);
  x.bezierCurveTo(342, 340, 372, 300, 376, 250); x.bezierCurveTo(384, 168, 306, 140, 256, 196); x.fill();
  // 볼
  x.fillStyle = 'rgba(255,150,160,0.55)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(256 + s * 72, 272, 24, 15, 0, 0, Math.PI * 2); x.fill(); }
  // 눈
  x.fillStyle = '#1b2233'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(256 + s * 50, 238, 15, 19, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#ffffff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(256 + s * 50 + 5, 231, 5.5, 0, Math.PI * 2); x.fill(); }
  // 부리
  x.fillStyle = '#f5a43a'; x.beginPath(); x.moveTo(232, 262); x.quadraticCurveTo(256, 250, 280, 262); x.quadraticCurveTo(256, 296, 232, 262); x.fill();
  // 빨간 목도리
  x.fillStyle = '#e0503f'; x.beginPath(); x.moveTo(126, 318); x.quadraticCurveTo(256, 362, 386, 318); x.lineTo(392, 350); x.quadraticCurveTo(256, 400, 120, 350); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(316, 350); x.lineTo(352, 350); x.lineTo(362, 440); x.lineTo(324, 444); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.5)'; for (const t of [0.25, 0.5, 0.75]) { x.fillRect(120 + t * 272 - 6, 326 + Math.sin(t * Math.PI) * 26, 12, 22); }
  // 머리 위 소복한 눈
  x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(256, 146, 64, 22, 0, Math.PI, 0); x.ellipse(256, 146, 64, 10, 0, 0, Math.PI); x.fill();
  x.restore();
  return c.toDataURL('image/png');
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const make = async (name, size, pad) => { const url = await page.evaluate(DRAW.toString().replace(/^/, '(') + `)(${size}, ${pad})`); writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64')); console.log(name); };
  await make('icon-192.png', 192, 0.08);
  await make('icon-512.png', 512, 0.08);
  await make('maskable-512.png', 512, 0.2);
  await make('apple-touch-icon.png', 180, 0.1);
  await make('favicon-32.png', 32, 0.02);
} finally { await browser.close(); }
