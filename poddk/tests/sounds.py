"""뽀드득의 소리를 코드로 직접 만든다 (녹음이나 남의 소리를 쓰지 않는다 → 이드의 저작물).

    python3 tests/sounds.py        → audio/steps-fresh.mp3, steps-packed.mp3, snowfall.mp3, blizzard.mp3, fire.mp3, fx.mp3

만드는 법 (모두 잡음과 짧은 떨림을 겹쳐 빚는다. 같은 씨앗이면 늘 같은 소리가 나온다):
  · 새 눈 발소리: 눈 결정이 눌려 부서지는 아주 짧은 '톡' 수백 개를 몇 번의 뭉치로 뿌린다 (뽀드득, 뽀드득).
    뭉치마다 높낮이가 조금씩 다르고, 첫 뭉치에는 발이 닿는 낮은 '쿵'을 깐다.
  · 밟힌 눈 발소리: 더 짧고 단단하게, 뭉치 둘셋.
  · 눈 내리는 소리: 아주 부드러운 쉬- 소리에, 가끔 가지에서 눈이 사르르 떨어지는 소리.
  · 눈보라: 낮게 웅웅대는 바람과 휘파람처럼 우는 바람이 밀려왔다 빠진다.
  · 모닥불: 낮게 웅웅 타는 소리에 타닥, 탁 튀는 소리.
  · 눈에 풀썩 눕는 소리, 눈을 쓰는 소리.
배경 소리(눈, 눈보라, 모닥불)는 주파수에서 바로 빚어 길이 끝과 처음이 저절로 이어진다 (돌려 틀어도 이음매가 없다).
js/audio.js 의 MAP 은 이 파일들 안에서 소리마다 [시작, 길이] 를 가리킨다 — 아래 LAYOUT 을 출력해 그대로 옮긴다.
"""
import json
import os
import subprocess
import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'audio')
rng = np.random.default_rng(20261120)


def secs(n):
    return int(round(n * SR))


def band(x, lo, hi, soft=0.25):
    """주파수에서 lo..hi 만 남긴다 (가장자리는 부드럽게). 길이가 그대로인 둥근(이어지는) 거르개"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo > 0:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 / soft))
    if hi < SR / 2:
        g *= 1 / (1 + (f / hi) ** (2 / soft))
    return np.fft.irfft(X * g, len(x))


def colored(n, slope):
    """둥글게 이어지는 색 잡음: slope 0 = 흰, -1 = 분홍, -2 = 갈색"""
    f = np.fft.rfftfreq(n, 1 / SR)
    mag = np.where(f > 0, np.maximum(f, 20) ** (slope / 2), 0)
    ph = rng.uniform(0, 2 * np.pi, len(f))
    x = np.fft.irfft(mag * np.exp(1j * ph), n)
    return x / (np.abs(x).max() + 1e-9)


def periodic_lfo(n, period_s, depth, phase=None):
    t = np.arange(n) / SR
    return 1 + depth * np.sin(2 * np.pi * t / period_s + (rng.uniform(0, 6.28) if phase is None else phase))


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-12)


def grain(kind, f0, dur, amp):
    """눌려 부서지는 결정 하나: 짧게 떨리는 '톡' (kind='tone') 또는 잡음 '틱' (kind='noise')"""
    n = max(8, secs(dur))
    t = np.arange(n) / SR
    env = np.exp(-t / (dur / 4)) * (1 - np.exp(-t / 0.00025))
    if kind == 'tone':
        y = np.sin(2 * np.pi * f0 * t * (1 + rng.uniform(-0.04, 0.04) * t / dur) + rng.uniform(0, 6.28))
    else:
        y = rng.standard_normal(n)
    return amp * env * y


def crunch(length, pulses, lo, hi, density, thud, tone_mix, seed_shift=0.0):
    """발소리 하나. pulses: [(시작초, 길이초, 세기, 높낮이배수)]"""
    n = secs(length)
    x = np.zeros(n)
    for (p0, plen, pamp, pitch) in pulses:
        count = int(density * plen * (0.7 + 0.6 * rng.random()))
        times = p0 + plen * rng.beta(1.4, 2.6, count)          # 뭉치 앞쪽에 몰렸다가 잦아든다
        for tt in times:
            i = secs(tt)
            if i >= n - 10:
                continue
            kind = 'tone' if rng.random() < tone_mix else 'noise'
            f0 = np.exp(rng.uniform(np.log(lo), np.log(hi))) * pitch
            g = grain(kind, f0, rng.uniform(0.0008, 0.0045), pamp * rng.lognormal(0, 0.7))
            j = min(n, i + len(g))
            x[i:j] += g[: j - i]
    x = band(x, 90, hi * 1.25, soft=0.35)
    if thud:      # 발이 닿는 낮은 '쿵'과, 눈이 눌려 꺼지는 '푹'
        tl = secs(0.12)
        t = np.arange(tl) / SR
        th = rng.standard_normal(tl) * np.exp(-t / 0.03) * (1 - np.exp(-t / 0.003))
        x[: tl] += band(th, 45, 300) * thud
        p0, plen = pulses[0][0], pulses[0][1] * 2.2
        wl = min(n - secs(p0), secs(plen))
        u = np.arange(wl) / max(1, wl)
        x[secs(p0): secs(p0) + wl] += band(rng.standard_normal(wl), 150, 550) * np.sin(np.pi * u) ** 1.5 * thud * 0.35
    fade = np.ones(n)
    k = secs(0.04)
    fade[-k:] = np.linspace(1, 0, k) ** 2
    return x * fade


def fresh_step(i):
    """새 눈: 뭉치 셋에서 여섯, 0.5~1초 동안 뽀드득 뽀드득"""
    length = rng.uniform(0.55, 0.95)
    k = int(rng.integers(3, 7))
    starts = np.sort(rng.uniform(0.02, length - 0.18, k))
    starts[0] = 0.02
    pulses = []
    for j, s in enumerate(starts):
        pulses.append((s, rng.uniform(0.05, 0.13), (1.0 if j == 0 else rng.uniform(0.55, 1.1)), rng.uniform(0.85, 1.25)))
    return crunch(length, pulses, 170, 1700, density=2400, thud=3.2, tone_mix=0.55)


def packed_step(i):
    """밟힌 눈: 짧고 단단하게, 뭉치 둘셋"""
    length = rng.uniform(0.36, 0.5)
    k = int(rng.integers(2, 4))
    starts = np.sort(rng.uniform(0.02, length - 0.12, k))
    starts[0] = 0.015
    pulses = [(s, rng.uniform(0.04, 0.08), (1.0 if j == 0 else rng.uniform(0.5, 0.9)), rng.uniform(1.0, 1.5)) for j, s in enumerate(starts)]
    return crunch(length, pulses, 400, 2400, density=1800, thud=2.0, tone_mix=0.35)


def lay(clips, gap=0.12, lead=0.2):
    """소리 여럿을 한 줄로 늘어놓는다 → (이어 붙인 소리, [[시작, 길이], …])"""
    parts = [np.zeros(secs(lead))]
    marks, at = [], lead
    for c in clips:
        marks.append([round(at, 3), round(len(c) / SR, 3)])
        parts += [c, np.zeros(secs(gap))]
        at += len(c) / SR + gap
    return np.concatenate(parts), marks


def match(x, target_rms, segs=None):
    """지금 쓰는 소리와 비슷한 크기로 맞춘다"""
    if segs:
        cur = np.mean([rms(x[secs(a): secs(a + l)]) for a, l in segs])
    else:
        cur = rms(x)
    y = x * (target_rms / cur)
    peak = np.abs(y).max()
    return y * (0.95 / peak) if peak > 0.95 else y


def loop_file(loop, lead):
    """돌려 트는 소리: 앞에 loop 의 끝 lead 초를 붙이고, 뒤에 처음 0.5초를 붙인다 (MAP 은 start=lead, length=len(loop))"""
    return np.concatenate([loop[-secs(lead):], loop, loop[: secs(0.5)]])


def snowfall(length=20.0):
    n = secs(length)
    hush = band(colored(n, -1.0), 150, 1400, 0.5) * 0.9 + band(colored(n, 0), 4000, 9000, 0.5) * 0.12
    hush *= periodic_lfo(n, length / 2, 0.12) * periodic_lfo(n, length / 5, 0.06)
    # 가지에서 눈이 사르르 떨어지는 소리 (끝과 처음을 넘어가면 돌려 붙인다)
    for _ in range(9):
        at, ln = rng.uniform(0, length), rng.uniform(0.25, 0.7)
        m = secs(ln)
        t = np.arange(m) / SR
        s = band(rng.standard_normal(m), 900, 5000, 0.6) * np.sin(np.pi * t / ln) ** 2 * rng.uniform(0.15, 0.35)
        idx = (secs(at) + np.arange(m)) % n
        np.add.at(hush, idx, s)
    return hush


def blizzard(length=18.0):
    n = secs(length)
    low = band(colored(n, -1.6), 90, 700, 0.5)
    low *= periodic_lfo(n, length / 3, 0.35) * periodic_lfo(n, length / 7, 0.18)
    # 휘파람처럼 우는 바람: 좁은 띠 몇 개가 밀려왔다 빠진다
    howl = np.zeros(n)
    for fc, per in [(430, length / 2), (610, length / 3), (820, length / 4), (520, length / 5)]:
        h = band(colored(n, 0), fc * 0.94, fc * 1.06, 0.12)
        howl += h / (np.abs(h).max() + 1e-9) * np.clip(np.sin(2 * np.pi * np.arange(n) / SR / per + rng.uniform(0, 6.28)), 0, 1) ** 2
    hiss = band(colored(n, -0.5), 1500, 5000, 0.5) * periodic_lfo(n, length / 3, 0.5) * 0.15
    return low + howl * 0.35 + hiss


def fire(length=24.0):
    n = secs(length)
    roar = band(colored(n, -2.0), 30, 260, 0.6) * periodic_lfo(n, length / 6, 0.15) * periodic_lfo(n, length / 11, 0.1)
    breath = band(colored(n, -1.0), 300, 1600, 0.6) * 0.12 * periodic_lfo(n, length / 4, 0.4)
    pops = np.zeros(n)
    t = 0.0
    while t < length:
        t += rng.exponential(0.16)
        if rng.random() < 0.15:          # 타닥타닥 몰려 튄다
            burst = int(rng.integers(3, 9))
        else:
            burst = 1
        for b in range(burst):
            at = t + b * rng.uniform(0.015, 0.06)
            big = rng.random() < 0.06
            dur = rng.uniform(0.003, 0.012) * (3 if big else 1)
            m = secs(dur * 6)
            tt = np.arange(m) / SR
            g = rng.standard_normal(m) * np.exp(-tt / dur)
            if big:
                g += np.sin(2 * np.pi * rng.uniform(500, 900) * tt) * np.exp(-tt / (dur * 1.5)) * 2
            g = band(np.pad(g, (0, 64)), 700, 5500, 0.5)[:m] * rng.lognormal(0, 0.6) * (2.2 if big else 1)
            idx = (secs(at) + np.arange(m)) % n
            np.add.at(pops, idx, g)
    roar /= np.abs(roar).max()
    return roar * 1.0 + breath + pops * 0.28


def bodyfall():
    """눈에 풀썩 눕는 소리: 낮은 쿵 다음에 눈이 사르르 눌리며 퍼진다"""
    length = 1.298
    n = secs(length)
    x = np.zeros(n)
    t = np.arange(n) / SR
    for at, amp in [(0.22, 0.6), (0.36, 0.5), (0.5, 1.0)]:
        m = secs(0.35)
        tt = np.arange(m) / SR
        th = band(rng.standard_normal(m) * np.exp(-tt / 0.07) * (1 - np.exp(-tt / 0.004)), 40, 400) * amp
        i = secs(at)
        x[i: i + m] += th[: n - i]
    pulses = [(0.48, 0.25, 0.8, 0.8), (0.62, 0.3, 0.5, 0.75)]
    x += crunch(length, pulses, 220, 1600, density=2600, thud=0, tone_mix=0.3) * 0.7
    x += band(rng.standard_normal(n), 800, 4000, 0.6) * np.exp(-np.maximum(t - 0.5, 0) / 0.25) * (t > 0.48) * 0.08
    return x


def rustle():
    """눈을 쓰는 소리: 쓱, 쓱"""
    length = 1.01
    n = secs(length)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for at, ln, amp in [(0.24, 0.32, 1.0), (0.5, 0.26, 0.9)]:
        u = np.clip((t - at) / ln, 0, 1)
        env += np.sin(np.pi * u) ** 1.5 * amp * ((t >= at) & (t <= at + ln))
    x = band(rng.standard_normal(n), 600, 6000, 0.5) * env
    x += crunch(length, [(0.25, 0.3, 0.35, 1.3), (0.5, 0.25, 0.3, 1.3)], 600, 3000, density=1500, thud=0, tone_mix=0.4)
    return x


def save(name, x):
    path = os.path.join(OUT, name)
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '96k', path], input=pcm, check=True)
    print(name, '%.2fs' % (len(x) / SR))


def main():
    layout = {}
    fresh, layout['fresh'] = lay([fresh_step(i) for i in range(14)])
    save('steps-fresh.mp3', match(fresh, 0.075, layout['fresh']))
    packed, layout['packed'] = lay([packed_step(i) for i in range(8)])
    save('steps-packed.mp3', match(packed, 0.058, layout['packed']))
    bf, rs = bodyfall(), rustle()
    bf = match(bf, 0.094)
    rs = match(rs, 0.049)
    fx = np.concatenate([np.zeros(secs(0.2)), bf, np.zeros(secs(0.2)), rs, np.zeros(secs(0.25))])
    layout['bodyfall'] = [0.2, round(len(bf) / SR, 3)]
    layout['rustle'] = [[round(0.4 + len(bf) / SR, 3), round(len(rs) / SR, 3)]]
    save('fx.mp3', fx)
    sf = match(snowfall(20.0), 0.047)
    save('snowfall.mp3', loop_file(sf, 0.5)); layout['snowfall'] = {'start': 0.5, 'length': 20.0}
    bz = match(blizzard(18.0), 0.094)
    save('blizzard.mp3', loop_file(bz, 0.5)); layout['blizzard'] = {'start': 0.5, 'length': 18.0}
    fr = match(fire(24.0), 0.125)
    save('fire.mp3', loop_file(fr, 2.0)); layout['fire'] = {'start': 2.0, 'length': 24.0}
    print('LAYOUT ' + json.dumps(layout, ensure_ascii=False))


if __name__ == '__main__':
    main()
