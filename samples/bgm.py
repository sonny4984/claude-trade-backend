#!/usr/bin/env python3
"""시안 세 편에 붙일 BGM 과 효과음을 직접 합성한다 (48kHz 스테레오, 40초).

production/bgm.py 와 같은 방식이다. 외부 음원을 쓰지 않으므로 저작권 문제가 없다.
  python3 bgm.py
"""
import math, pathlib, subprocess
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
TOTAL = 40.0
N = int(TOTAL * SR)
rng = np.random.default_rng(20260818)

t_of = lambda n: np.arange(n) / SR
midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sn = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a, endpoint=False) if a else np.array([]),
        np.linspace(1, s, d, endpoint=False) if d else np.array([]),
        np.full(sn, s),
        np.linspace(s, 0, r) if r else np.array([]),
    ])[:n]


try:                                    # 있으면 쓰고, 없으면 파이썬 루프로 돈다
    from scipy.signal import lfilter as _lf
except ImportError:
    _lf = None


def lp(x, cut):
    """1차 저역통과."""
    a = math.exp(-2 * math.pi * cut / SR)
    if _lf is not None:
        return _lf([1 - a], [1.0, -a], x)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_sweep(x, c0, c1):
    """차단주파수가 c0 에서 c1 로 옮겨가는 저역통과. 고정 필터 둘을 겹쳐 흉내낸다."""
    a, b = lp(x, c0), lp(x, c1)
    k = np.linspace(0, 1, len(x))
    return a * (1 - k) + b * k


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[:j - i]


def note(f, dur, kind="sine", detune=0.0):
    n = int(dur * SR); tt = t_of(n)
    if kind == "saw":
        s = np.zeros(n)
        for h in range(1, 14):
            s += np.sin(2 * math.pi * f * h * tt) / h
        s *= 0.5
        if detune:
            for h in range(1, 10):
                s += np.sin(2 * math.pi * f * (1 + detune) * h * tt) / h * 0.3
    else:
        s = np.sin(2 * math.pi * f * tt)
    return s


# ───────── 음악: Am – F – C – G ─────────
BPM = 80.0
BAR = 4 * 60 / BPM                      # 3.0초
PROG = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]]
BASS = [45, 41, 48, 43]
END_BAR = int((TOTAL - 3.0) / BAR)      # 끝은 으뜸화음으로 닫는다

pad = np.zeros(N); bass = np.zeros(N); arp = np.zeros(N)
for b in range(int(TOTAL / BAR) + 1):
    at = b * BAR
    ch = PROG[b % 4] if b < END_BAR else PROG[0]
    for m in ch:
        s = note(midi(m), BAR * 1.05, "saw", detune=0.004)
        s *= adsr(len(s), 0.5, 0.4, 0.7, 0.85)
        lfo = 1 + 0.05 * np.sin(2 * math.pi * 0.14 * (t_of(len(s)) + at))
        add(pad, s * lfo * 0.32, at)
    bs = note(midi(BASS[b % 4] if b < END_BAR else BASS[0]), BAR * 0.9)
    bs *= adsr(len(bs), 0.02, 0.3, 0.55, 0.5)
    add(bass, bs * 0.48, at)
    if at >= 8.0:                       # 타이틀이 끝나고 나서 들어온다
        seq = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12,
               ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12]
        for i, m in enumerate(seq):
            if i % 2 == 1 and rng.random() > 0.7:
                continue
            s = note(midi(m), 0.45)
            s *= np.exp(-t_of(len(s)) * 8.0)
            add(arp, s * 0.13, at + i * BAR / 8)

music = lp(pad, 1700) * 0.9 + bass * 0.85 + lp(arp, 4200)

rev = np.zeros(N)
for dly, gg in ((0.029, 0.32), (0.043, 0.26), (0.067, 0.20), (0.097, 0.15)):
    dd = int(dly * SR)
    rev[dd:] += music[:-dd] * gg
music = music + lp(rev, 2600) * 0.45

tt = t_of(N)
env = np.clip(tt / 2.0, 0, 1) * np.clip((TOTAL - tt) / 2.8, 0, 1)
env *= 0.60 + 0.40 * np.clip((tt - 8.0) / 4.0, 0, 1)
music *= env


# ───────── 효과음 ─────────
def tick(at, g=0.16, m=88):
    n = int(0.16 * SR); tt = t_of(n)
    s = np.sin(2 * math.pi * midi(m) * tt) * np.exp(-tt * 26)
    s += rng.normal(0, 1, n) * np.exp(-tt * 220) * 0.25
    return at, s * g


def chime(at, g=0.20, m=79):
    n = int(1.5 * SR); tt = t_of(n)
    s = (np.sin(2 * math.pi * midi(m) * tt)
         + 0.5 * np.sin(2 * math.pi * midi(m + 12) * tt)
         + 0.25 * np.sin(2 * math.pi * midi(m + 19) * tt))
    return at, s * np.exp(-tt * 3.0) * g


def whoosh(at, dur=0.9, g=0.13):
    n = int(dur * SR); tt = t_of(n)
    s = lp_sweep(rng.normal(0, 1, n), 400, 3000)
    return at, s * np.sin(math.pi * tt / dur) ** 2 * g


def slide(at, dur=0.55, g=0.15):
    """신발이 판에서 쓸려 내려가는 소리."""
    n = int(dur * SR); tt = t_of(n)
    s = lp_sweep(rng.normal(0, 1, n), 1800, 700)
    return at, s * np.exp(-tt * 2.4) * g


# 시안 1 은 그래픽이 올라오는 자리, 시안 3 은 신발이 미끄러지는 자리에 맞춘다
def ease_io(x):
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def slide_time(ang, a=9.0, b=16.4, top=41.0):
    """scene.html 의 eio 보간을 거꾸로 풀어 그 각도가 되는 시각을 찾는다."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if ease_io(mid) * top < ang:
            lo = mid
        else:
            hi = mid
    return a + (lo + hi) / 2 * (b - a)


SFX = {
    1: [whoosh(0.2, 1.2, .12), whoosh(4.5), tick(10.0), tick(11.2), chime(12.8, .16),
        whoosh(16.5, .7), tick(17.0), tick(18.0), tick(19.4), tick(20.15), chime(21.0, .17),
        whoosh(23.0, .7), tick(23.4), tick(24.4), tick(25.8), tick(26.65), tick(27.5),
        chime(28.35, .20, 84),
        whoosh(31.0, .7), tick(31.3), tick(32.25), tick(33.2), chime(34.4, .20, 84),
        whoosh(37.0, 1.0, .11)],
    2: [whoosh(0.2, 1.2, .12), whoosh(4.5)]
       + [tick(9.2 + i * .48, .13) for i in range(7)]
       + [chime(14.6, .17),
          whoosh(17.0, .7), tick(17.5), tick(18.6), chime(20.0, .16),
          whoosh(24.0, .7), tick(24.3), tick(25.2), tick(26.4), chime(28.0, .20, 84),
          whoosh(32.5, .8)]
       + [tick(33.0 + i * .55, .07, 92) for i in range(7)]
       + [chime(35.6, .17), whoosh(37.0, 1.0, .11)],
    3: [whoosh(0.2, 1.2, .12), whoosh(4.5), whoosh(9.0, 1.6, .10)]
       + [slide(slide_time(a)) for a in (25, 29, 33, 39)]
       + [chime(13.8, .17),
          whoosh(18.0, .7), tick(18.5), tick(18.92), tick(19.34), tick(19.76),
          tick(20.6), tick(20.94), tick(21.28), tick(21.62), chime(22.6, .16),
          whoosh(24.5, .7), tick(25.2), tick(25.7), tick(26.2), tick(26.7),
          chime(28.4, .18),
          whoosh(31.0, .7), tick(31.5), tick(32.08), tick(32.66), tick(33.24),
          chime(34.6, .20, 84), whoosh(37.0, 1.0, .11)],
}

NAMES = {1: "시안_1_그네진자", 2: "시안_2_온도지도", 3: "시안_3_미끄럼각도"}

for s in (1, 2, 3):
    sfx = np.zeros(N)
    for at, sig in SFX[s]:
        add(sfx, sig, at)
    mix = music * 0.62 + sfx
    peak = np.max(np.abs(mix))
    mix = mix / peak * 0.86 if peak > 0 else mix
    # 살짝 벌린 스테레오
    st = np.stack([mix, np.concatenate([np.zeros(int(0.0007 * SR)),
                                        mix[:-int(0.0007 * SR)]])], 1)
    raw = D / "out" / f"_{s}.raw"
    raw.parent.mkdir(exist_ok=True)
    (st * 32767).astype("<i2").tofile(raw)
    out = D / "out" / f"{NAMES[s]}.m4a"
    subprocess.run([FF, "-y", "-loglevel", "error",
                    "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", str(raw),
                    # loudnorm 은 내부에서 샘플레이트를 올린다. 48kHz 로 되돌려 둔다.
                    "-af", "loudnorm=I=-15:TP=-1.5:LRA=9",
                    "-ar", str(SR), "-ac", "2",
                    "-c:a", "aac", "-b:a", "192k", str(out)], check=True)
    raw.unlink()
    print(f"  → {out.name}  {TOTAL:.0f}s  효과음 {len(SFX[s])}개")
