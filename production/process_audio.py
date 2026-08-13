#!/usr/bin/env python3
"""나레이션 마스터링.

기획서 콘티의 섹션 타임코드에 맞추기 위해 섹션마다 목표 길이를 따로 잡는다.
길이를 맞추는 1순위 수단은 '문장 사이 호흡'이다 — 유지할 무음 길이를 이분탐색으로
찾아 목표에 근접시키고, 남는 오차만 아주 약한 템포 보정으로 흡수한다.
템포를 크게 건드리면 말이 빨라지거나 늘어져 티가 나므로 마지막 수단으로만 쓴다.
"""
import json, re, subprocess, pathlib, sys
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
A = D / "audio"
FF = imageio_ffmpeg.get_ffmpeg_exe()

THRESH = "-45dB"
SIL_MIN, SIL_MAX = 0.10, 0.80     # 문장 사이 호흡의 허용 범위
TEMPO_MIN, TEMPO_MAX = 0.94, 1.10  # 티 나지 않는 템포 보정 범위


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg failed: {' '.join(args[:6])}")


def dur(p):
    out = subprocess.run([FF, "-i", str(p), "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    h, mm, ss = m[-1]
    return int(h) * 3600 + int(mm) * 60 + float(ss)


def trim(src, out, keep):
    """앞뒤 무음 제거 + 문장 사이 무음을 keep 초로 통일."""
    f = (f"silenceremove=start_periods=1:start_duration=0:start_threshold={THRESH}:"
         f"stop_periods=-1:stop_duration={keep:.3f}:stop_threshold={THRESH}:detection=peak,"
         f"areverse,"
         f"silenceremove=start_periods=1:start_duration=0:start_threshold={THRESH},"
         f"areverse")
    run([FF, "-y", "-loglevel", "error", "-i", str(src), "-af", f,
         "-ar", "48000", "-ac", "1", str(out)])
    return dur(out)


def fit(src, out, target):
    """목표 길이에 가장 가까워지는 호흡 길이를 이분탐색으로 찾는다."""
    lo, hi = SIL_MIN, SIL_MAX
    d_lo, d_hi = trim(src, out, lo), trim(src, out, hi)
    if target <= d_lo:
        return lo, trim(src, out, lo)
    if target >= d_hi:
        return hi, trim(src, out, hi)
    best = (abs(d_hi - target), hi, d_hi)
    for _ in range(9):
        mid = (lo + hi) / 2
        d = trim(src, out, mid)
        best = min(best, (abs(d - target), mid, d))
        if d < target:
            lo = mid
        else:
            hi = mid
    _, keep, d = best
    return keep, trim(src, out, keep)


def main():
    script = json.loads((D / "script.json").read_text())
    targets = [s["speech_sec"] for s in script["sections"]]

    print("호흡 길이 자동 조절")
    fitted = []
    for i in range(1, 5):
        keep, d = fit(A / f"raw_s{i}.wav", A / f"t{i}.wav", targets[i - 1])
        fitted.append((keep, d))
        print(f"  s{i} 목표 {targets[i-1]:5.1f}s | 문장 사이 호흡 {keep:.2f}s → {d:5.1f}s")

    print("\n마스터링")
    finals = []
    for i in range(1, 5):
        keep, d = fitted[i - 1]
        raw_tempo = d / targets[i - 1]
        tempo = max(TEMPO_MIN, min(TEMPO_MAX, raw_tempo))
        af = (f"atempo={tempo:.5f},"
              "highpass=f=85,"
              "equalizer=f=250:t=q:w=1.1:g=-1.6,"
              "equalizer=f=3200:t=q:w=1.6:g=2.2,"
              "acompressor=threshold=-19dB:ratio=2.6:attack=8:release=190:makeup=1.6,"
              "loudnorm=I=-16:TP=-1.5:LRA=11")
        o = A / f"s{i}.wav"
        run([FF, "-y", "-loglevel", "error", "-i", str(A / f"t{i}.wav"), "-af", af,
             "-ar", "48000", "-ac", "1", str(o)])
        finals.append(dur(o))
        (A / f"t{i}.wav").unlink(missing_ok=True)
        print(f"  s{i} 템포 {tempo:.3f} → {finals[-1]:5.1f}s "
              f"(목표 {targets[i-1]:.1f}s, 오차 {finals[-1]-targets[i-1]:+.2f}s)")

    err = [f - t for f, t in zip(finals, targets)]
    worst = max(abs(e) for e in err)
    print(f"\n최대 오차 {worst:.2f}s " + ("— 양호" if worst <= 1.0 else "— 대본 길이 조정 검토"))


if __name__ == "__main__":
    main()
