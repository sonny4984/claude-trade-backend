#!/usr/bin/env python3
"""나레이션 마스터링.

TTS 는 문장 사이 쉼을 과하게 길게 잡는 편이라 그대로 쓰면 뚝뚝 끊겨 들린다.
그렇다고 모든 쉼을 같은 길이로 깎으면 그것대로 기계적이므로, 원래 리듬
(마침표 뒤는 길게, 쉼표 뒤는 짧게)을 유지한 채 쉼 구간만 '비율로' 줄인다.
말소리 구간은 손대지 않으므로 발음이 뭉개지지 않는다.

섹션별 목표 길이는 기획서 콘티의 타임코드에서 온다.
"""
import json, re, subprocess, pathlib, sys, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
A = D / "audio"
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

HOP = 0.010              # 분석 간격
SIL_DB = -42.0           # 이보다 조용하면 쉼으로 본다
MIN_SIL = 0.12           # 이보다 짧으면 말소리의 일부(파열음 앞 등)
# 쉼을 한 덩어리로 보면 안 된다. 문장 끝의 호흡은 남겨야 자연스럽고,
# 단어 사이에 낀 미세한 끊김은 없애야 말이 이어진다.
# (원래 길이 하한, 줄인 뒤 최소, 줄인 뒤 최대)
PAUSE_BANDS = [
    (0.50, 0.26, 0.44),   # 문장 끝 호흡 — 남겨야 자연스럽다
    (0.28, 0.15, 0.28),   # 쉼표·구 경계
    (0.16, 0.06, 0.13),   # 약한 끊김
    (0.00, 0.015, 0.05),  # 어절 사이 미세한 틈 — '열 한 시'처럼 들리게 만드는 주범
]
XFADE = int(0.004 * 48000)          # 이어붙일 때 클릭음 방지
EDGE = 0.06              # 앞뒤로 남길 여백
TEMPO_MIN, TEMPO_MAX = 0.94, 1.09


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit("ffmpeg 실패")


def load(p):
    out = subprocess.run([FF, "-v", "error", "-i", str(p), "-f", "s16le",
                          "-acodec", "pcm_s16le", "-ar", str(SR), "-ac", "1", "-"],
                         capture_output=True).stdout
    return np.frombuffer(out, "<i2").astype(np.float32) / 32768.0


def save(x, p):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def find_pauses(x):
    """(시작, 끝) 샘플 인덱스로 쉼 구간을 찾는다."""
    h = int(HOP * SR)
    n = len(x) // h
    rms = np.sqrt(np.maximum(1e-12, np.mean(
        x[:n * h].reshape(n, h) ** 2, axis=1)))
    db = 20 * np.log10(np.maximum(rms, 1e-9))
    quiet = db < SIL_DB
    runs, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * HOP >= MIN_SIL:
                runs.append((i * h, j * h))
            i = j
        else:
            i += 1
    return runs


def target_pause(orig, k):
    """원래 쉼의 성격(문장 끝인지 단어 사이인지)에 따라 다르게 줄인다."""
    for lo, mn, mx in PAUSE_BANDS:
        if orig >= lo:
            return float(np.clip(orig * k, mn, mx))
    return orig * k


def rescale(x, runs, k):
    """쉼 구간만 줄이고 말소리는 원본 그대로 이어 붙인다."""
    keep, prev = [], 0
    for a, b in runs:
        keep.append(x[prev:a])
        seg = x[a:b]
        want = max(XFADE * 2, int(target_pause((b - a) / SR, k) * SR))
        if want >= len(seg):
            keep.append(np.pad(seg, (0, want - len(seg))))
        else:
            # 앞뒤 끝을 살려 자르고 이음매는 짧게 교차 페이드한다
            head = seg[:want - XFADE]
            tail = seg[len(seg) - XFADE:]
            f = np.linspace(0, 1, XFADE, dtype=np.float32)
            head[-XFADE:] = head[-XFADE:] * (1 - f) + tail * f
            keep.append(head)
        prev = b
    keep.append(x[prev:])
    return np.concatenate(keep)


def trim_edges(x, runs):
    s = 0 if not runs or runs[0][0] > int(0.25 * SR) else max(0, runs[0][1] - int(EDGE * SR))
    e = len(x)
    if runs and runs[-1][1] >= len(x) - int(0.05 * SR):
        e = min(len(x), runs[-1][0] + int(EDGE * SR))
    return x[s:e]


def fit(src, out, target):
    x = load(src)
    runs = find_pauses(x)
    x = trim_edges(x, runs)
    runs = find_pauses(x)
    total_sil = sum(b - a for a, b in runs) / SR
    lo, hi = 0.05, 3.0
    best = None
    for _ in range(24):
        k = (lo + hi) / 2
        y = rescale(x, runs, k)
        d = len(y) / SR
        if best is None or abs(d - target) < abs(best[1] - target):
            best = (k, d, y)
        if d < target:
            lo = k
        else:
            hi = k
    k, d, y = best
    save(y, out)
    return k, d, len(runs), total_sil


def dur(p):
    out = subprocess.run([FF, "-i", str(p), "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    h, mm, ss = m[-1]
    return int(h) * 3600 + int(mm) * 60 + float(ss)


def main():
    script = json.loads((D / "script.json").read_text())
    print("쉼 구간 비율 조절 (말소리는 원본 그대로)")
    fitted = []
    for i, sec in enumerate(script["sections"], 1):
        t = sec["speech_sec"]
        k, d, n, sil = fit(A / f"raw_s{i}.wav", A / f"t{i}.wav", t)
        fitted.append(d)
        print(f"  s{i} 쉼 {n:2d}곳 {sil:5.1f}s (×{k:.2f}) | 길이 {d:5.1f}s / 목표 {t:.1f}s")

    print("\n마스터링")
    for i, sec in enumerate(script["sections"], 1):
        t = sec["speech_sec"]
        tempo = max(TEMPO_MIN, min(TEMPO_MAX, fitted[i - 1] / t))
        af = (f"atempo={tempo:.5f},highpass=f=85,"
              "equalizer=f=250:t=q:w=1.1:g=-1.6,"
              "equalizer=f=3200:t=q:w=1.6:g=2.0,"
              "acompressor=threshold=-19dB:ratio=2.4:attack=10:release=200:makeup=1.5,"
              "loudnorm=I=-16:TP=-1.5:LRA=11")
        run([FF, "-y", "-loglevel", "error", "-i", str(A / f"t{i}.wav"), "-af", af,
             "-ar", "48000", "-ac", "1", str(A / f"s{i}.wav")])
        (A / f"t{i}.wav").unlink(missing_ok=True)
        d = dur(A / f"s{i}.wav")
        print(f"  s{i} 템포 {tempo:.3f} → {d:5.1f}s (목표 {t:.1f}s, 오차 {d-t:+.2f}s)")


if __name__ == "__main__":
    main()
