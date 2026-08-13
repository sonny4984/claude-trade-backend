#!/usr/bin/env python3
"""저작권 부담이 없는 오리지널 BGM과 효과음을 직접 합성한다 (48kHz 스테레오)."""
import json, pathlib
import numpy as np

D = pathlib.Path(__file__).parent
SR = 48000
tl = json.loads((D / "timeline.json").read_text())
TOTAL = tl["timing"]["total"] + 0.4
N = int(TOTAL * SR)
rng = np.random.default_rng(20260813)


def t_of(n):
    return np.arange(n) / SR


def adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a, endpoint=False) if a else np.array([]),
        np.linspace(1, s, d, endpoint=False) if d else np.array([]),
        np.full(s_n, s),
        np.linspace(s, 0, r) if r else np.array([]),
    ])[:n]


def lp(x, cut):
    """1차 저역통과."""
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, cut):
    """블록 단위 근사 저역통과 (긴 신호용, 훨씬 빠름)."""
    k = max(1, int(SR / (2 * np.pi * cut)))
    ker = np.exp(-np.arange(k * 4) / k)
    ker /= ker.sum()
    return np.convolve(x, ker, mode="same")


def add(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[:j - i]


def note(f, dur, kind="sine", detune=0.0):
    n = int(dur * SR)
    tt = t_of(n)
    if kind == "saw":
        x = np.zeros(n)
        for h in range(1, 12):
            x += np.sin(2 * np.pi * f * h * tt + h) / h
        x /= 2.2
    elif kind == "tri":
        x = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * tt))
    else:
        x = np.sin(2 * np.pi * f * tt) + 0.22 * np.sin(4 * np.pi * f * tt)
    if detune:
        x = x + np.sin(2 * np.pi * f * (1 + detune) * tt) * 0.6
    return x


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------- 음악 ----------------
BPM = 84.0
BAR = 4 * 60 / BPM                      # 2.857s
# Am – F – C – G  (담담하고 사색적인 진행)
PROG = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]]
BASS = [45, 41, 48, 43]

pad = np.zeros(N)
bass = np.zeros(N)
arp = np.zeros(N)
perc = np.zeros(N)

nbars = int(TOTAL / BAR) + 1
for b in range(nbars):
    at = b * BAR
    ch = PROG[b % 4]
    # 패드
    for m in ch:
        s = note(midi(m), BAR * 1.06, "saw", detune=0.004)
        s *= adsr(len(s), 0.55, 0.4, 0.72, 0.9)
        lfo = 1 + 0.05 * np.sin(2 * np.pi * 0.13 * (t_of(len(s)) + at))
        add(pad, s * lfo * 0.34, at)
    # 베이스
    bs = note(midi(BASS[b % 4]), BAR * 0.9, "sine")
    bs *= adsr(len(bs), 0.02, 0.3, 0.55, 0.5)
    add(bass, bs * 0.5, at)
    # 아르페지오 (중반부에서만 등장)
    dens = 0.0 if at < 34 else (0.75 if at < 138 else 0.5)
    if dens:
        seq = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12,
               ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12]
        for i, m in enumerate(seq):
            st = at + i * BAR / 8
            if i % 2 == 1 and rng.random() > 0.72:
                continue
            s = note(midi(m), 0.5, "sine")
            s *= np.exp(-t_of(len(s)) * 7.5)
            add(arp, s * 0.15 * dens, st)
    # 퍼커션
    if at >= 34:
        for beat in (0, 2):
            n_ = int(0.22 * SR)
            tt = t_of(n_)
            k = np.sin(2 * np.pi * (95 * np.exp(-tt * 26) + 44) * tt) * np.exp(-tt * 15)
            add(perc, k * 0.30, at + beat * BAR / 4)
        for e in range(8):
            if e % 2 == 0:
                continue
            n_ = int(0.05 * SR)
            h = rng.normal(0, 1, n_) * np.exp(-t_of(n_) * 90)
            add(perc, h * 0.035, at + e * BAR / 8)

pad = lp_fast(pad, 1700)
arp = lp_fast(arp, 4200)
music = pad * 0.9 + bass * 0.85 + arp + perc

# 간단한 잔향 (슈뢰더 근사)
rev = np.zeros(N)
for dly, g in ((0.031, 0.34), (0.047, 0.28), (0.071, 0.22), (0.103, 0.16)):
    d = int(dly * SR)
    rev[d:] += music[:-d] * g
music = music + lp_fast(rev, 2600) * 0.5

# 섹션별 다이내믹 (도입 조용 → 본론 → 결론 상승 → 엔딩 감쇠)
env = np.ones(N)
tt = t_of(N)
env *= np.clip(tt / 2.5, 0, 1)                                   # 페이드 인
env *= np.clip((TOTAL - tt) / 3.0, 0, 1)                         # 페이드 아웃
env *= 0.62 + 0.38 * np.clip((tt - 30) / 12, 0, 1)               # 본론 진입
music *= env

# ---------------- 효과음 ----------------
sfx = np.zeros(N)


def whoosh(at, dur=0.85, up=True):
    n = int(dur * SR)
    tt = t_of(n)
    nz = rng.normal(0, 1, n)
    f = np.linspace(400, 4200, n) if up else np.linspace(3800, 350, n)
    ph = np.cumsum(f) / SR
    tone = np.sin(2 * np.pi * ph) * 0.25
    body = lp_fast(nz, 2200) * np.hanning(n)
    add(sfx, (body * 0.5 + tone * np.hanning(n)) * 0.28, at)


def chime(at, m=76, dur=1.5, g=0.22):
    n = int(dur * SR)
    tt = t_of(n)
    x = np.zeros(n)
    for h, a in ((1, 1), (2, .5), (3, .25), (4.2, .12)):
        x += np.sin(2 * np.pi * midi(m) * h * tt) * a
    add(sfx, x * np.exp(-tt * 3.2) * g, at)


def pop(at, m=84, g=0.20):
    n = int(0.28 * SR)
    tt = t_of(n)
    x = np.sin(2 * np.pi * midi(m) * (1 + 2.2 * np.exp(-tt * 40)) * tt)
    add(sfx, x * np.exp(-tt * 14) * g, at)


def impact(at, g=0.36):
    n = int(1.3 * SR)
    tt = t_of(n)
    sub = np.sin(2 * np.pi * (58 * np.exp(-tt * 3.2) + 34) * tt) * np.exp(-tt * 2.6)
    crack = lp_fast(rng.normal(0, 1, n), 900) * np.exp(-tt * 20)
    add(sfx, (sub * 0.85 + crack * 0.4) * g, at)


def riser(at, dur=2.2, g=0.20):
    n = int(dur * SR)
    tt = t_of(n)
    f = 220 * 2 ** (tt / dur * 2.4)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    nz = lp_fast(rng.normal(0, 1, n), 3000)
    add(sfx, (x * 0.5 + nz * 0.5) * (tt / dur) ** 2 * g, at)


def click(at, g=0.26):
    n = int(0.14 * SR)
    tt = t_of(n)
    x = np.sin(2 * np.pi * 1750 * tt) * np.exp(-tt * 55)
    x += lp_fast(rng.normal(0, 1, n), 5200) * np.exp(-tt * 90) * 0.5
    add(sfx, x * g, at)


def powerdown(at, g=0.26):
    n = int(1.1 * SR)
    tt = t_of(n)
    f = 780 * np.exp(-tt * 2.6) + 70
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    add(sfx, x * np.exp(-tt * 1.9) * g, at)


T = tl["timing"]
s1, s2, s3, s4 = T["s1"], T["s2"], T["s3"], T["s4"]
d1, d2, d3, d4 = [x[1] - x[0] for x in (s1, s2, s3, s4)]

chime(0.35, 79, 2.2, 0.18)                       # 타이틀
whoosh(s1[0] + d1 * 0.12, 0.7)                   # 책상 씬 진입
pop(s1[0] + d1 * 0.31, 72, .16)                  # 초콜릿
pop(s1[0] + d1 * 0.37, 67, .16)                  # 탄산음료
powerdown(s1[0] + d1 * 0.60, .22)                # 기력 저하
whoosh(s1[0] + d1 * 0.71, 0.8, up=False)         # 안개
impact(s1[0] + d1 * 0.875)                       # 혈당 스파이크 등장

whoosh(s2[0] + 0.05, 0.75)
riser(s2[0] + d2 * 0.18, 2.4, .18)               # 스파이크 상승
impact(s2[0] + d2 * 0.30, .26)                   # SPIKE
whoosh(s2[0] + d2 * 0.40, 0.7, up=False)         # 인슐린 투입
impact(s2[0] + d2 * 0.55, .24)                   # CRASH
whoosh(s2[0] + d2 * 0.79, 0.8)
chime(s2[0] + d2 * 0.93, 69, 1.6, .16)

whoosh(s3[0] + 0.05, 0.75)
chime(s3[0] + d3 * 0.12, 84, 1.4, .15)           # 시상하부 조명
click(s3[0] + d3 * 0.34)                         # 스위치 전환
powerdown(s3[0] + d3 * 0.36, .28)
whoosh(s3[0] + d3 * 0.64, 0.7)
for i, f in enumerate((0.70, 0.74)):
    pop(s3[0] + d3 * f, 79 + i * 3, .14)

whoosh(s4[0] + 0.05, 0.75)
for i, f in enumerate((0.10, 0.17, 0.24)):
    pop(s4[0] + d4 * f, 74 + i * 4, .17)
for i, f in enumerate((0.31, 0.38, 0.45)):
    pop(s4[0] + d4 * f, 81 + i * 3, .14)
chime(s4[0] + d4 * 0.81, 76, 2.6, .20)           # 엔딩

# ---------------- 출력 ----------------
def to_stereo(x, width=0.22):
    d = int(0.012 * SR)
    l = x.copy(); r = np.zeros_like(x)
    r[d:] = x[:-d]
    return np.stack([x * (1 - width) + l * width, x * (1 - width) + r * width], 1)


def norm(x, peak=0.89):
    m = np.max(np.abs(x))
    return x / m * peak if m > 0 else x


mix = to_stereo(norm(music, 0.55)) + to_stereo(norm(sfx, 0.75), 0.10)
mix = np.tanh(mix * 1.05) * 0.95
mix = norm(mix, 0.9)

(D / "audio").mkdir(exist_ok=True)
out = (mix * 32767).astype("<i2")
import wave
with wave.open(str(D / "audio" / "bed.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(out.tobytes())
print(f"→ audio/bed.wav  {TOTAL:.1f}s  (BGM {nbars}마디 + 효과음)")
