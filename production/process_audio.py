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
# EBS 교육방송 나레이션 기준의 쉼 구조.
# 문장 끝 호흡은 남기되 짧게, 어절 사이 미세한 틈은 없앤다.
# (원래 길이 하한, 줄인 뒤 최소, 줄인 뒤 최대)
PAUSE_BANDS = [
    (0.50, 0.27, 0.40),   # 문장 끝 호흡
    (0.28, 0.15, 0.25),   # 쉼표·구 경계
    (0.16, 0.07, 0.13),   # 약한 끊김
    (0.00, 0.035, 0.075), # 어절 사이 — 너무 줄이면 단어가 붙어 뭉개진다
]
TARGET_RATE = 6.45       # 말할 때 음절/초 — EBS 대역 안에서 약간 여유 있는 쪽
PAUSE_SHARE = 0.16       # 쉼이 전체에서 차지하는 비율
XFADE = int(0.004 * 48000)          # 이어붙일 때 클릭음 방지
EDGE = 0.06              # 앞뒤로 남길 여백
TEMPO_MIN, TEMPO_MAX = 0.95, 1.26


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


def find_pauses(x, rel=False):
    """(시작, 끝) 샘플 인덱스로 쉼 구간을 찾는다.

    rel=True 면 파일 자체의 말소리 레벨을 기준으로 상대 판정한다. 마스터링 뒤에는
    컴프레서가 바닥 소음을 끌어올려 절대 임계값으로는 쉼이 덜 잡히기 때문이다.
    """
    h = int(HOP * SR)
    n = len(x) // h
    rms = np.sqrt(np.maximum(1e-12, np.mean(
        x[:n * h].reshape(n, h) ** 2, axis=1)))
    db = 20 * np.log10(np.maximum(rms, 1e-9))
    thr = (np.percentile(db, 92) - 26) if rel else SIL_DB
    quiet = db < thr
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


CLOSER_PAUSE = 0.50      # 마무리 인사 앞에 두는 호흡


def closer_index(x, runs):
    """마무리 인사가 시작되는 지점의 쉼을 찾는다.

    앞에서부터 훑어 뒤에 남은 말소리가 인사 한 문장 분량(1.8~4.5초)으로
    처음 줄어드는 쉼이 그 자리다. 끝에서부터 찾으면 인사 문장 안쪽의
    어절 간격을 집어 "과학 / 소통이었습니다"처럼 갈라놓게 된다.
    """
    for idx, (_, b) in enumerate(runs):
        tail = (len(x) - b) / SR
        if 1.8 <= tail <= 4.5:
            return idx
    return -1


def rescale(x, runs, k, closer=-1):
    """쉼 구간만 줄이고 말소리는 원본 그대로 이어 붙인다."""
    keep, prev = [], 0
    for ri, (a, b) in enumerate(runs):
        keep.append(x[prev:a])
        seg = x[a:b]
        tp = CLOSER_PAUSE if ri == closer else target_pause((b - a) / SR, k)
        want = max(XFADE * 2, int(tp * SR))
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
    closer = closer_index(x, runs)
    lo, hi = 0.05, 3.0
    best = None
    for _ in range(24):
        k = (lo + hi) / 2
        y = rescale(x, runs, k, closer)
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


def syllables(t):
    return len(re.findall(r"[가-힣]", t))


def analyze(p, rel=False):
    """(전체 길이, 쉼 합계) — 말한 시간은 둘의 차이."""
    x = load(p)
    runs = find_pauses(x, rel=rel)
    return len(x) / SR, sum(b - a for a, b in runs) / SR


def main():
    script = json.loads((D / "script.json").read_text())
    print("발화 속도를 EBS 대역(6.8~7.0 음절/초)에 맞춘다\n")
    plan = []
    for i, sec in enumerate(script["sections"], 1):
        n = syllables(sec["narration"])
        d, sil = analyze(A / f"raw_s{i}.wav")
        rate = n / (d - sil)
        tempo = max(TEMPO_MIN, min(TEMPO_MAX, rate and TARGET_RATE / rate))
        speech_after = (d - sil) / tempo
        target_total = speech_after / (1 - PAUSE_SHARE)
        slot = sec["slot"][1] - sec["slot"][0]
        room = slot - sec["lead"] - 1.4
        target_total = min(target_total, room)
        plan.append((tempo, target_total * tempo))   # 템포 전 길이로 환산
        print(f"  s{i} {n:3d}음절 | 원본 {rate:.2f} 음절/초 → 템포 {tempo:.3f} "
              f"| 목표 길이 {target_total:.1f}s (슬롯 {slot:.0f}s)")

    print("\n쉼 정리 + 마스터링")
    for i, sec in enumerate(script["sections"], 1):
        tempo, pre_len = plan[i - 1]
        k, d, n_runs, sil = fit(A / f"raw_s{i}.wav", A / f"t{i}.wav", pre_len)
        af = (f"atempo={tempo:.5f},highpass=f=85,"
              "equalizer=f=250:t=q:w=1.1:g=-1.6,"
              "equalizer=f=3200:t=q:w=1.6:g=2.0,"
              "acompressor=threshold=-19dB:ratio=2.4:attack=10:release=200:makeup=1.5,"
              "loudnorm=I=-16:TP=-1.5:LRA=11")
        run([FF, "-y", "-loglevel", "error", "-i", str(A / f"t{i}.wav"), "-af", af,
             "-ar", "48000", "-ac", "1", str(A / f"s{i}.wav")])
        (A / f"t{i}.wav").unlink(missing_ok=True)
        fd, fsil = analyze(A / f"s{i}.wav", rel=True)
        rate = syllables(sec["narration"]) / (fd - fsil)
        print(f"  s{i} {fd:5.1f}s | 쉼 {fsil:4.1f}s ({fsil/fd*100:4.1f}%) "
              f"| 말할때 {rate:.2f} 음절/초")


if __name__ == "__main__":
    main()
