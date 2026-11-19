// 서버 점검: 실제로 wrangler dev(내 컴퓨터 안에서 도는 Cloudflare) 를 띄워 웹소켓으로 이어 본다.
import { spawn } from 'node:child_process';
const PORT = 8799, BASE = `http://127.0.0.1:${PORT}`, WS = `ws://127.0.0.1:${PORT}/ws`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (cond, what) => { if (cond) { ok++; console.log('  PASS  ' + what); } else { bad++; console.log('  FAIL  ' + what); } };
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', '.wrangler/test-state'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
let log = ''; dev.stdout.on('data', (d) => { log += d; }); dev.stderr.on('data', (d) => { log += d; });
try {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE + '/'); if (r.ok) break; } catch { /* 아직 */ } await sleep(500); }
  const join = (name, look = 'scarf', color = 0, d = Math.random().toString(16).slice(2, 14).padEnd(12, '0')) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?name=${encodeURIComponent(name)}&look=${look}&color=${color}&d=${d}`), got = [];
    ws.onmessage = (e) => got.push(JSON.parse(e.data));
    ws.onerror = () => reject(new Error('이어지지 않았다: ' + name));
    ws.onopen = async () => { for (let i = 0; i < 40 && !got.length; i++) await sleep(50); resolve({ ws, got, hello: got[0] }); };
  });
  const until = async (fn, ms = 4000) => { for (let t = 0; t < ms; t += 50) { if (fn()) return true; await sleep(50); } return false; };

  check((await (await fetch(BASE + '/')).text()).includes('poddk'), '서버가 뜬다');
  const a = await join('졸린 붕어빵', 'scarf', 2, 'aaaaaaaaaaaa');
  check(a.hello && a.hello.t === 'hello' && a.hello.id && Array.isArray(a.hello.peers) && Array.isArray(a.hello.marks), '들어오면 내 번호와 펭귄들, 지난 자국을 받는다');
  const b = await join('통통한 고드름', 'blanket', 5);
  check(b.hello.peers.some((p) => p.id === a.hello.id && p.name === '졸린 붕어빵' && p.look === 'scarf' && p.color === 2), '나중에 온 펭귄은 먼저 온 펭귄을 안다');
  check(await until(() => a.got.some((m) => m.t === 'join' && m.id === b.hello.id && m.name === '통통한 고드름')), '먼저 온 펭귄은 새로 온 펭귄을 듣는다');
  // 자리
  a.ws.send(JSON.stringify({ t: 's', x: 3.14159, z: 12, yaw: 1.2, w: 1, a: 0, i: -1, k: -1, st: -1 }));
  check(await until(() => b.got.some((m) => m.t === 's' && m.id === a.hello.id && m.s.x === 3.14 && m.s.z === 12)), '자리를 보내면 다른 펭귄에게 전해진다');
  // 이상한 자리는 버린다
  const n0 = b.got.length;
  a.ws.send(JSON.stringify({ t: 's', x: 500, z: 500, yaw: 0, w: 0, a: 0, i: -1, k: -1, st: -1 }));
  a.ws.send(JSON.stringify({ t: 's', x: 1, z: 1, yaw: 0, w: 0, a: 99, i: -1, k: -1, st: -1 }));
  a.ws.send('이건 아무 글');
  await sleep(500);
  check(b.got.length === n0, '들판 밖의 자리, 없는 동작, 엉뚱한 글은 전하지 않는다');
  // 이글루 방 안의 자리는 된다
  a.ws.send(JSON.stringify({ t: 's', x: 2081, z: 2003, yaw: 0, w: 0, a: 5, i: 1, k: 2, st: 4 }));
  check(await until(() => b.got.some((m) => m.t === 's' && m.s.i === 1 && m.s.k === 2 && m.s.st === 4)), '이글루 안에서 앉아 고른 상태도 전해진다');
  // 자국
  a.ws.send(JSON.stringify({ t: 'm', l: [[0, 1, 2, 0.5, 1], [0, 1.3, 2.4, 0.5, -1], [1, 5, 5, 0, 1], [2, 900, 0, 0, 1]] }));
  check(await until(() => b.got.some((m) => m.t === 'm' && m.l.length === 3 && m.l.every((q) => q.length === 6))), '자국을 보내면 들판 안의 것만 찍힌 시각과 함께 전해진다');
  const c = await join('보송보송한 귤');
  check(c.hello.marks.length === 3 && c.hello.peers.length === 2, '나중에 온 펭귄도 지난 자국과 펭귄들을 받는다');
  // 이름은 정해진 낱말로 된 것만
  let refused = false; try { await join('<b>아무 이름</b>'); } catch { refused = true; }
  check(refused, '정해진 낱말이 아닌 이름은 받지 않는다');
  check((await (await fetch(BASE + '/count')).json()).peers === 3, '지금 몇 마리인지 알려 준다');
  // 나가면 알린다
  a.ws.close();
  check(await until(() => b.got.some((m) => m.t === 'bye' && m.id === a.hello.id)), '나가면 다른 펭귄에게 알린다');
  // 내가 남긴 자국은 내가 다시 들어올 때 다시 받지 않는다 (이미 내 화면에 있다)
  const a2 = await join('졸린 붕어빵', 'scarf', 2, 'aaaaaaaaaaaa');
  check(a2.hello.marks.length === 0, '내가 남긴 자국은 다시 들어와도 다시 받지 않는다');
  a2.ws.close(); b.ws.close(); c.ws.close();
} catch (e) { bad++; console.log('  FAIL  ' + e.message); console.log(log.slice(-2000)); }
finally { try { process.kill(-dev.pid, 'SIGTERM'); } catch { /* 이미 끝났다 */ } await sleep(500); console.log(`\n${ok}/${ok + bad} passed`); process.exit(bad ? 1 : 0); }
