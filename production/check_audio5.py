#!/usr/bin/env python3
"""소리가 중간에 빨라지거나 끊기지 않았는지 서로 다른 다섯 가지 방법으로 검산한다.

한 가지 방법만 쓰면 그 방법이 못 보는 고장은 끝까지 못 본다. 그래서 원리가
겹치지 않는 다섯 가지를 따로 돌린다.

  1) 표본 수 세기       — 파일에 든 표본 개수가 길이와 맞는가
  2) 시간축 밀림 검사   — 나레이션 원본과 견줘 구간 앞뒤의 밀린 정도가 같은가
  3) 되받아쓰기         — 다시 받아쓴 말이 자막 시각과 맞는가
  4) 말 빠르기 곡선     — 초당 음절 수가 중간에 튀지 않는가
  5) 목소리 높이        — 배속이 걸리면 음이 올라간다. 원본과 같은 높이인가

  python3 check_audio5.py out/파일.mp4
"""
import json, pathlib, subprocess, sys, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
# 자리를 손으로 적지 않는다. timeline.json 에서 읽는다.
_tl = json.loads((pathlib.Path(__file__).parent / "timeline.json").read_text())
SEC = [(f"{i}구간", "audio/" + a["file"].split("/")[-1], a["at"])
       for i, a in enumerate(_tl["audio"], 1)]
verdicts = []


def pcm(path, sr=SR):
    p = subprocess.run([FF, "-v", "error", "-i", str(path), "-ac", "1",
                        "-ar", str(sr), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)


def wav(path, sr=SR):
    p = subprocess.run([FF, "-v", "error", "-i", str(D / path), "-ac", "1",
                        "-ar", str(sr), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)


def env(x, hop=480):                      # 10ms 간격 소리 세기
    n = len(x) // hop
    return np.abs(x[:n * hop]).reshape(n, hop).mean(axis=1)


def say(no, name, ok, detail):
    verdicts.append(ok)
    print(f"\n[{no}] {name}   {'통과' if ok else '★ 확인 필요'}")
    for d in detail:
        print("     " + d)


# ── 1) 표본 수 세기 ────────────────────────────────────────────────
def check1(path, a):
    info = subprocess.run([FF, "-hide_banner", "-i", str(path)],
                          capture_output=True, text=True).stderr
    dur = [l for l in info.splitlines() if "Duration" in l][0]
    hh, mm, ss = dur.split("Duration: ")[1].split(",")[0].split(":")
    d = int(hh) * 3600 + int(mm) * 60 + float(ss)
    want, got = d * SR, len(a)
    diff = (got - want) / SR
    ok = abs(diff) < 0.05
    say(1, "표본 수 세기", ok, [
        f"길이 {d:.2f}초 × {SR}Hz = {want:,.0f} 표본이 있어야 합니다",
        f"실제로 들어 있는 표본 {got:,} 개  →  차이 {diff*1000:+.1f}밀리초",
        "중간에 배속이 걸렸다면 표본 수가 길이와 어긋납니다. 어긋나지 않았습니다."
        if ok else "표본 수가 길이와 맞지 않습니다."])


# ── 2) 시간축 밀림 검사 ────────────────────────────────────────────
def check2(a):
    ea, det, ok = env(a), [], True
    for name, f, at in SEC:
        eo = env(wav(f))
        n = len(eo)
        lags = []
        for k in range(3):                      # 구간을 셋으로 잘라 각각 밀린 정도를 잰다
            s, e = n * k // 3, n * (k + 1) // 3
            seg = eo[s:e]
            base = int(at * 100) + s
            win = ea[max(0, base - 60):base + len(seg) + 60]
            if len(win) < len(seg) + 10:
                continue
            c = np.correlate(win - win.mean(), seg - seg.mean(), mode="valid")
            lags.append((np.argmax(c) - min(60, base)) * 10)   # 밀리초
        if len(lags) < 3:
            continue
        drift = max(lags) - min(lags)
        ok &= drift <= 60
        det.append(f"{name}  앞 {lags[0]:+4d}ms · 가운데 {lags[1]:+4d}ms · 뒤 {lags[2]:+4d}ms"
                   f"   →  벌어진 폭 {drift}ms")
    det.append("배속이 걸리면 구간 뒤로 갈수록 밀린 정도가 커집니다. 앞뒤가 같으면 등속입니다."
               if ok else "구간 안에서 밀린 정도가 벌어집니다.")
    say(2, "나레이션 원본과 시간축 대조", ok, det)


# ── 3) 되받아쓰기 ──────────────────────────────────────────────────
def check3(path):
    from faster_whisper import WhisperModel
    # timeline.json 의 시각은 글자 수로 나눈 옛 방식이라 실제 말과 어긋난다.
    tl = json.loads((D / "timeline_school.json").read_text())
    m = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = m.transcribe(str(path), language="ko", word_timestamps=True, vad_filter=False)
    # 글자 단위로 통째 정렬한다. 앞서 쓰던 "네 자 중 두 자 맞으면 같은 말" 식
    # 짝 맞추기는 엉뚱한 단어를 끌어와 없는 어긋남을 만들어냈다.
    import difflib, re
    bare = lambda x: re.sub(r"[^가-힣0-9]", "", x)
    words = [(bare(w.word), w.start, w.end) for s in segs for w in s.words]
    words = [w for w in words if w[0]]
    heard, wpos, at = "", [], 0
    for w, st, en in words:
        wpos.append((at, at + len(w), st, en)); heard += w; at += len(w)
    target = "".join(bare(c["tx"]) for c in tl["subs"])
    sm = difflib.SequenceMatcher(None, target, heard, autojunk=False)
    m2h = {}
    for i, j, n in sm.get_matching_blocks():
        for k in range(n):
            m2h[i + k] = j + k

    def tof(h):
        for lo, hi, st, en in wpos:
            if lo <= h < hi:
                return st + (en - st) * (h - lo) / max(1, hi - lo)
        return None

    det, gaps, pos = [], [], 0
    for cue in tl["subs"]:
        n = len(bare(cue["tx"]))
        hs = [m2h[i] for i in range(pos, pos + n) if i in m2h]
        pos += n
        if len(hs) < max(2, n // 3):
            continue
        t = tof(min(hs))
        if t is not None:
            gaps.append(t - cue["a"])
    if not gaps:
        say(3, "되받아쓰기", False, ["대조할 단어를 찾지 못했습니다"]); return
    g = np.array(gaps)
    # 배속이 걸렸다면 뒤로 갈수록 어긋남이 한쪽으로 커진다 → 기울기를 본다
    xs = np.arange(len(g))
    slope = np.polyfit(xs, g, 1)[0] * len(g)
    ok = abs(np.median(g)) < 0.6 and abs(slope) < 1.0
    det = [f"글자 일치율 {len(m2h)/len(target)*100:.1f}%, 자막 {len(g)}장 대조",
           f"어긋남 중앙값 {np.median(g):+.2f}초, 가장 큰 것 {np.abs(g).max():.2f}초",
           f"처음부터 끝까지 어긋남이 흘러간 폭 {slope:+.2f}초",
           "배속이 걸리면 뒤로 갈수록 어긋남이 한쪽으로 쌓입니다. 쌓이지 않았습니다."
           if ok else "어긋남이 한쪽으로 쌓입니다."]
    say(3, "다시 받아쓴 말과 자막 시각 대조", ok, det)


# ── 4) 말 빠르기 곡선 ──────────────────────────────────────────────
def check4(a):
    e = env(a)
    det, rates, ok = [], [], True
    for name, f, at in SEC:
        eo = env(wav(f))
        s, n = int(at * 100), len(eo)
        seg = e[s:s + n]
        if len(seg) < 300:
            continue
        # 소리 세기의 봉우리 수를 센다. 대략 음절 수에 해당한다.
        def peaks(x):
            th = x.mean() * 0.9
            up = (x[1:-1] > x[:-2]) & (x[1:-1] >= x[2:]) & (x[1:-1] > th)
            return up.sum()
        third = len(seg) // 3
        r = [peaks(seg[k * third:(k + 1) * third]) / (third / 100) for k in range(3)]
        rates += r
        spread = (max(r) - min(r)) / (sum(r) / 3)
        ok &= spread < 0.45
        det.append(f"{name}  초당 {r[0]:.1f} · {r[1]:.1f} · {r[2]:.1f} 마디"
                   f"   →  들쭉날쭉한 정도 {spread*100:.0f}%")
    det.append("한 대목만 배속이 걸리면 그 자리에서 마디 수가 튑니다. 튀지 않았습니다."
               if ok else "말 빠르기가 한 자리에서 튑니다.")
    say(4, "말 빠르기 곡선", ok, det)


# ── 5) 목소리 높이 ─────────────────────────────────────────────────
def check5(a):
    from scipy.signal import butter, sosfiltfilt
    FS = 32000
    # 목소리 대역만 남긴다. 아래로는 배경음악 베이스, 위로는 아르페지오를 뺀다.
    SOS = butter(4, [170, 400], "bandpass", fs=FS, output="sos")

    def f0(x, sr=FS):
        # 16kHz 로 재면 240Hz 근처 눈금 간격이 1.5% 라, 한 칸만 밀려도 "음이
        # 달라졌다" 는 헛경보가 난다. 표본율을 올리고 봉우리 주변을 포물선으로
        # 맞춰 눈금 사이를 읽는다.
        x = sosfiltfilt(SOS, x)
        w, out = 2048, []
        for i in range(0, len(x) - w, w):
            s = x[i:i + w]
            if np.abs(s).mean() < 0.02:
                continue
            s = s - s.mean()
            c = np.correlate(s, s, mode="full")[w - 1:]
            lo, hi = sr // 350, sr // 170
            if hi >= len(c) - 1:
                continue
            k = lo + int(np.argmax(c[lo:hi]))
            if c[k] <= 0.3 * c[0] or k <= 0 or k >= len(c) - 1:
                continue
            y0, y1, y2 = c[k - 1], c[k], c[k + 1]
            den = y0 - 2 * y1 + y2
            d = 0.5 * (y0 - y2) / den if abs(den) > 1e-12 else 0.0
            out.append(sr / (k + np.clip(d, -0.5, 0.5)))
        return np.median(out) if out else 0.0

    a16 = pcm(PATH, FS)
    det, ok = [], True
    for name, f, at in SEC:
        o = wav(f, FS)
        s = int(at * FS)
        got = f0(a16[s:s + len(o)])
        want = f0(o)
        if want == 0 or got == 0:
            continue
        ratio = got / want
        ok &= abs(ratio - 1) < 0.03
        det.append(f"{name}  원본 {want:5.1f}Hz  →  완성본 {got:5.1f}Hz"
                   f"   →  {ratio:.3f}배")
    det.append("배속을 걸면 목소리가 그만큼 높아집니다. 높이가 그대로입니다."
               if ok else "목소리 높이가 달라졌습니다.")
    say(5, "목소리 높이 대조", ok, det)


if __name__ == "__main__":
    PATH = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                        else D / "out" / "신정중학교_차민_교내대회_최종.mp4")
    print(f"검산 대상: {PATH.name}")
    A = pcm(PATH)
    check1(PATH, A)
    check2(A)
    check4(A)
    check5(A)
    check3(PATH)
    print("\n" + "=" * 58)
    print(f"다섯 가지 중 {sum(verdicts)}가지 통과"
          + ("  —  소리가 빨라지거나 끊긴 곳 없습니다." if all(verdicts) else "  —  확인이 필요합니다."))
