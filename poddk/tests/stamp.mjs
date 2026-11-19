// 버전 도장: 게임 파일(js, css)이 바뀌면 index.html 과 map.html 이 부르는 주소 끝에 붙는 ?v=… 를 새로 찍는다.
//
// 왜: GitHub Pages 는 파일을 브라우저에 10분쯤 저장해 둔다. 새로 올린 직후에는 새 main.js 와 저장돼 있던 예전 net.js 가
//     섞여서 게임이 깨질 수 있다. 주소에 파일 내용으로 만든 도장을 붙이면, 내용이 바뀐 순간 모든 파일이 새 주소가 되어
//     한꺼번에 새로 내려받는다. (모듈끼리 부르는 './net.js' 같은 주소는 importmap 으로 도장 붙은 주소에 이어 준다.)
//
//   node tests/stamp.mjs          도장을 새로 찍는다 (js, css 를 고친 뒤, PR 을 만들기 전에)
//   node tests/stamp.mjs --check  도장이 지금 파일과 맞는지만 본다 (smoke.mjs 가 처음에 확인한다)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'map.html'];

/** 도장을 붙일 파일들 (poddk/ 에서 본 경로) */
export function stampedFiles() {
  const js = readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).sort().map((f) => 'js/' + f);
  const css = readdirSync(path.join(root, 'css')).filter((f) => f.endsWith('.css')).sort().map((f) => 'css/' + f);
  return [...js, ...css];
}

/** 지금 파일 내용으로 만든 도장 (8글자) */
export function currentStamp() {
  const h = createHash('sha1');
  for (const f of stampedFiles()) { h.update(f + '\0'); h.update(readFileSync(path.join(root, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 8);
}

/** 한 페이지에 도장을 찍은 결과 (바뀐 html 글) */
export function stampPage(html, v) {
  const js = stampedFiles().filter((f) => f.startsWith('js/'));
  const imports = { three: './vendor/three.module.min.js' };
  for (const f of js) imports['./' + f] = './' + f + '?v=' + v;
  const map = '<script type="importmap">' + JSON.stringify({ imports }) + '</script>';
  let out = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, map);
  // 페이지가 직접 부르는 css 와 js 에도 도장
  out = out.replace(/(href|src)="((?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w]+)?"/g, (_, attr, file) => `${attr}="${file}?v=${v}"`);
  return out;
}

/** 페이지에 찍혀 있는 도장 (없으면 null) */
export function pageStamp(html) {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let map; try { map = JSON.parse(m[1]); } catch { return null; }
  const vs = new Set(Object.entries(map.imports || {}).filter(([k]) => k.startsWith('./js/')).map(([, u]) => (u.match(/\?v=(\w+)$/) || [])[1]));
  const direct = [...html.matchAll(/(?:href|src)="(?:css|js)\/[\w.-]+\.(?:css|js)(?:\?v=(\w+))?"/g)].map((x) => x[1]);
  for (const d of direct) vs.add(d);
  return vs.size === 1 ? [...vs][0] ?? null : null;
}

/** 모든 페이지의 도장이 지금 파일과 맞는가. 안 맞는 페이지 이름들을 돌려준다 */
export function checkStamps() {
  const v = currentStamp(), bad = [];
  for (const p of PAGES) {
    const html = readFileSync(path.join(root, p), 'utf8');
    if (pageStamp(html) !== v || stampPage(html, v) !== html) bad.push(p);
  }
  return { v, bad };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const { v, bad } = checkStamps();
    if (bad.length) { console.log(`도장이 맞지 않아요 (${bad.join(', ')}). node tests/stamp.mjs 로 새로 찍어 주세요. (지금 파일의 도장: ${v})`); process.exit(1); }
    console.log('도장이 맞아요: ' + v);
  } else {
    const v = currentStamp();
    for (const p of PAGES) { const f = path.join(root, p); writeFileSync(f, stampPage(readFileSync(f, 'utf8'), v)); }
    console.log('도장을 찍었어요: ' + v);
  }
}
