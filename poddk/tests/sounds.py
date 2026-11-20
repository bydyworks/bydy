"""뽀드득의 소리를 만든다: 누구나 자유롭게 쓸 수 있는(CC0) 녹음을 OpenGameArt 에서 받아 다듬는다.
(눈 내리는 소리만은 맞는 녹음이 없어 코드로 직접 빚는다.)

    pip install py7zr numpy && python3 tests/sounds.py     → audio/*.mp3 를 새로 만들고, js/audio.js 에 옮길 LAYOUT 을 출력한다

쓰는 녹음 (모두 CC0 — 출처 표시 의무는 없지만 CREDITS.md 와 게임 안 '만든 이와 쓰인 것'에 고마움을 적는다):
  · 발소리: "42 Snow and Gravel Footsteps" — Corsica_S 녹음, qubodup 정리 (https://opengameart.org/content/42-snow-and-gravel-footsteps)
  · 눈에 풀썩: "41 snow shoe steps" — Corsica_S 녹음, qubodup 정리 (https://opengameart.org/content/41-snow-shoe-steps)
  · 모닥불: "Fireplace Sound loop" — PagDev (https://opengameart.org/content/fireplace-sound-loop)
  · 눈보라: "windy ambient noise" — Some Weirdo (https://opengameart.org/content/windy-ambient-noise)
  · 눈 쓰는 소리: "Shovel Sound" (https://opengameart.org/content/shovel-sound)
다듬는 법: 조용한 앞뒤를 자르고, 예전 소리와 비슷한 높낮이(음색)와 크기로 맞추고, 배경 소리는 끝과 처음을 겹쳐 이어지게 한다.
"""
import glob
import json
import os
import subprocess
import tempfile
import urllib.request
import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'audio')
BASE = 'https://opengameart.org/sites/default/files/'
SOURCES = {'steps': 'corsica_s-walking_in_snow.7z', 'shoes': 'corsica_s-snow_shoes.7z', 'fire': 'fire.wav', 'wind': 'windy_ambiance_0.ogg', 'shovel': 'shovel_0.ogg'}
BANDS = [0, 150, 400, 1000, 2500, 5000, 22050]
# 예전 소리의 음색 (띠마다 소리 힘의 비율). 새 소리를 이 비율에 가깝게 맞춘다
TONE = {
    'fresh': [0.07, 0.24, 0.29, 0.38, 0.02, 0.003],
    'packed': [0.07, 0.24, 0.27, 0.40, 0.02, 0.003],
    'fire': [0.84, 0.13, 0.02, 0.01, 0.003, 0.002],
    'blizzard': [0.16, 0.41, 0.34, 0.07, 0.02, 0.01],
    'snowfall': [0.17, 0.37, 0.19, 0.10, 0.04, 0.13],
    'bodyfall': [0.35, 0.34, 0.16, 0.05, 0.04, 0.06],
    'rustle': [0.10, 0.05, 0.25, 0.34, 0.11, 0.15],
}
rng = np.random.default_rng(20261120)


def secs(t):
    return int(round(t * SR))


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def tone_of(x):
    S = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    e = np.array([S[(f >= BANDS[i]) & (f < BANDS[i + 1])].sum() for i in range(len(BANDS) - 1)])
    return e / (e.sum() + 1e-12)


def match_tone(x, target, limit_db=12, rounds=4):
    """띠마다 소리 힘을 target 비율에 맞추는 부드러운 음색 조절 (띠 사이는 로그 주파수로 이어 붙인다). 몇 번 되풀이해 가까이 간다"""
    for _ in range(rounds):
        x = _tone_step(x, target, limit_db)
    return x


def _tone_step(x, target, limit_db):
    cur = tone_of(x)
    gain_db = np.clip(10 * np.log10((np.array(target) + 1e-6) / (cur + 1e-6)), -limit_db, limit_db)
    centers = np.array([60, 250, 630, 1600, 3500, 9000])
    X = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 20)
    g = np.interp(np.log(f), np.log(centers), gain_db)
    return np.fft.irfft(X * 10 ** (g / 20), len(x))


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-12)


def trim(x, thresh=0.06, pre=0.012, maxlen=None, fade=0.05):
    """앞뒤의 조용한 곳을 자르고 끝을 부드럽게 줄인다"""
    env = np.convolve(np.abs(x), np.ones(secs(0.01)) / secs(0.01), 'same')
    on = np.where(env > env.max() * thresh)[0]
    a, b = max(0, on[0] - secs(pre)), min(len(x), on[-1] + secs(0.03))
    y = x[a:b].copy()
    if maxlen and len(y) > secs(maxlen):
        y = y[: secs(maxlen)]
    k = min(len(y) // 3, secs(fade))
    y[-k:] *= np.linspace(1, 0, k) ** 2
    y[: secs(0.003)] *= np.linspace(0, 1, secs(0.003))
    return y


def lay(clips, gap=0.12, lead=0.2):
    parts = [np.zeros(secs(lead))]
    marks, at = [], lead
    for c in clips:
        marks.append([round(at, 3), round(len(c) / SR, 3)])
        parts += [c, np.zeros(secs(gap))]
        at += len(c) / SR + gap
    return np.concatenate(parts), marks


def level(x, target, segs=None):
    cur = np.mean([rms(x[secs(a): secs(a + l)]) for a, l in segs]) if segs else rms(x)
    y = x * (target / cur)
    pk = np.abs(y).max()
    return y * (0.95 / pk) if pk > 0.95 else y


def seamless(x, length, xfade):
    """length 초짜리 이음매 없는 고리: 뒤 xfade 초를 앞에 겹쳐 녹인다"""
    n, k = secs(length), secs(xfade)
    seg = x[: n + k].copy()
    w = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
    loop = seg[:n].copy()
    loop[:k] = seg[n: n + k] * (1 - w) + seg[:k] * w
    return loop


def loop_file(loop, lead):
    return np.concatenate([loop[-secs(lead):], loop, loop[: secs(0.5)]])


def colored(n, slope):
    f = np.fft.rfftfreq(n, 1 / SR)
    mag = np.where(f > 0, np.maximum(f, 20) ** (slope / 2), 0)
    x = np.fft.irfft(mag * np.exp(1j * rng.uniform(0, 2 * np.pi, len(f))), n)
    return x / (np.abs(x).max() + 1e-9)


def snowfall(length=20.0):
    """눈 내리는 소리 (코드로 빚는다): 아주 부드러운 쉬- 소리가 천천히 숨 쉬듯 오르내린다. 주파수에서 빚어 끝과 처음이 이어진다"""
    n = secs(length)
    t = np.arange(n) / SR
    return colored(n, -1.0) * (1 + 0.12 * np.sin(2 * np.pi * t / (length / 2))) * (1 + 0.06 * np.sin(2 * np.pi * t / (length / 5) + 1.3))


def save(name, x):
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, name)], input=pcm, check=True)
    print(name, '%.2fs' % (len(x) / SR))


def fetch(tmp):
    import py7zr
    got = {}
    for key, fname in SOURCES.items():
        path = os.path.join(tmp, fname)
        if not os.path.exists(path):
            urllib.request.urlretrieve(BASE + fname, path)
        if fname.endswith('.7z'):
            d = os.path.join(tmp, key)
            os.makedirs(d, exist_ok=True)
            py7zr.SevenZipFile(path).extractall(d)
            got[key] = sorted(glob.glob(os.path.join(d, '**', '*.flac'), recursive=True))
        else:
            got[key] = path
    return got


def main(tmp=None):
    tmp = tmp or tempfile.mkdtemp(prefix='poddk-sounds-')
    src = fetch(tmp)
    layout = {}
    # 발소리: 음색이 예전 새 눈 소리와 가장 가까운 녹음 열넷 (새 눈), 그다음 짧고 비슷한 것 여덟 (밟힌 눈)
    steps = [(f, load(f)) for f in src['steps']]
    near = lambda x, t: float(np.abs(tone_of(x) - np.array(t)).sum())
    ranked = sorted(steps, key=lambda s: near(s[1], TONE['fresh']))
    fresh_src, rest = ranked[:14], ranked[14:]
    packed_src = sorted(rest, key=lambda s: (len(trim(s[1])) / SR) + near(s[1], TONE['packed']))[:8]
    fresh = [match_tone(trim(x, maxlen=0.95), TONE['fresh']) for _, x in fresh_src]
    packed = [match_tone(trim(x, maxlen=0.5, fade=0.08), TONE['packed']) for _, x in packed_src]
    f_all, layout['fresh'] = lay(fresh)
    save('steps-fresh.mp3', level(f_all, 0.075, layout['fresh']))
    p_all, layout['packed'] = lay(packed)
    save('steps-packed.mp3', level(p_all, 0.058, layout['packed']))
    print('fresh from', [os.path.basename(f) for f, _ in fresh_src])
    print('packed from', [os.path.basename(f) for f, _ in packed_src])
    # 눈에 풀썩: 눈신 발소리 둘을 조금 어긋나게 겹친다 / 눈 쓰는 소리: 삽질 소리
    shoes = sorted([load(f) for f in src['shoes']], key=lambda x: -tone_of(x)[0])
    a, b = trim(shoes[0]), trim(shoes[1])
    bf = np.zeros(secs(1.298))
    bf[secs(0.18): secs(0.18) + len(a)] += a[: len(bf) - secs(0.18)]
    bf[secs(0.42): secs(0.42) + len(b)] += 0.8 * b[: len(bf) - secs(0.42)]
    bf = level(match_tone(bf, TONE['bodyfall']), 0.094)
    rs = trim(load(src['shovel']), maxlen=1.01)
    rs = np.pad(rs, (0, max(0, secs(1.01) - len(rs))))[: secs(1.01)]
    rs = level(match_tone(rs, TONE['rustle']), 0.049)
    fx = np.concatenate([np.zeros(secs(0.2)), bf, np.zeros(secs(0.2)), rs, np.zeros(secs(0.25))])
    layout['bodyfall'] = [0.2, round(len(bf) / SR, 3)]
    layout['rustle'] = [[round(0.4 + len(bf) / SR, 3), round(len(rs) / SR, 3)]]
    save('fx.mp3', fx)
    # 모닥불: 벽난로 녹음 24초를 고리로
    fire = match_tone(load(src['fire']), TONE['fire'])
    save('fire.mp3', loop_file(level(seamless(fire, 24.0, 2.0), 0.125), 2.0)); layout['fire'] = {'start': 2.0, 'length': 24.0}
    # 눈보라: 바람 녹음에서 가장 거센 20초를 골라 18초 고리로
    wind = load(src['wind'])
    win = secs(20)
    best = max(range(0, len(wind) - win, secs(5)), key=lambda i: rms(wind[i: i + win]))
    bz = match_tone(wind[best: best + win], TONE['blizzard'])
    save('blizzard.mp3', loop_file(level(seamless(bz, 18.0, 1.5), 0.094), 0.5)); layout['blizzard'] = {'start': 0.5, 'length': 18.0}
    # 눈 내리는 소리
    sf = match_tone(snowfall(20.0), TONE['snowfall'])
    save('snowfall.mp3', loop_file(level(sf, 0.047), 0.5)); layout['snowfall'] = {'start': 0.5, 'length': 20.0}
    print('LAYOUT ' + json.dumps(layout, ensure_ascii=False))


if __name__ == '__main__':
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else None)
