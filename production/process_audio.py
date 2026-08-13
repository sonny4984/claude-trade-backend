#!/usr/bin/env python3
"""나레이션 마스터링: 과도한 무음 압축 → 목표 길이 맞춤 → 라우드니스 정규화(-16 LUFS)."""
import re, subprocess, pathlib, sys
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
A = D / "audio"
FF = imageio_ffmpeg.get_ffmpeg_exe()

# 본편 목표: 나레이션 합계 172초 (헤드1.6 + 섹션간격 3x1.0 + 테일2.4 => 약 179초 = 2:59)
TARGET_SPEECH = 172.0
KEEP_SIL = 0.30          # 문장 사이 유지할 최대 무음
THRESH = "-45dB"


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg failed: {' '.join(args[:6])}")
    return r.stderr


def dur(p):
    out = subprocess.run([FF, "-i", str(p), "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    h, mm, ss = m[-1]
    return int(h) * 3600 + int(mm) * 60 + float(ss)


def main():
    srcs = [A / f"s{i}.wav" for i in range(1, 5)]

    # 1단계 — 앞뒤 무음 제거 + 내부 긴 무음 압축
    step1 = []
    for i, s in enumerate(srcs, 1):
        o = A / f"t{i}.wav"
        f = (f"silenceremove=start_periods=1:start_duration=0:start_threshold={THRESH}:"
             f"stop_periods=-1:stop_duration={KEEP_SIL}:stop_threshold={THRESH}:detection=peak,"
             f"areverse,"
             f"silenceremove=start_periods=1:start_duration=0:start_threshold={THRESH},"
             f"areverse")
        run([FF, "-y", "-loglevel", "error", "-i", str(s), "-af", f,
             "-ar", "48000", "-ac", "1", str(o)])
        step1.append(o)

    trimmed = [dur(p) for p in step1]
    tot = sum(trimmed)
    print(f"무음 정리 후 합계: {tot:.2f}s  " + " / ".join(f"{d:.1f}" for d in trimmed))

    # 2단계 — 목표 길이에 맞춰 템포 미세 조정 (자연스러운 범위 0.95~1.12 로 제한)
    tempo = max(0.95, min(1.12, tot / TARGET_SPEECH))
    print(f"템포 계수: {tempo:.4f}")

    finals = []
    for i, p in enumerate(step1, 1):
        o = A / f"n{i}.wav"
        af = (f"atempo={tempo:.5f},"
              "highpass=f=85,"                      # 저역 잡음 제거
              "equalizer=f=250:t=q:w=1.1:g=-1.6,"   # 탁한 저중역 정리
              "equalizer=f=3200:t=q:w=1.6:g=2.2,"   # 명료도(자음) 강조
              "acompressor=threshold=-19dB:ratio=2.6:attack=8:release=190:makeup=1.6,"
              "loudnorm=I=-16:TP=-1.5:LRA=11")
        run([FF, "-y", "-loglevel", "error", "-i", str(p), "-af", af,
             "-ar", "48000", "-ac", "1", str(o)])
        finals.append(o)

    ds = [dur(p) for p in finals]
    print(f"마스터링 완료 합계: {sum(ds):.2f}s  " + " / ".join(f"{d:.1f}" for d in ds))
    for i, d in enumerate(ds, 1):
        (A / f"s{i}.wav").unlink(missing_ok=True)
        (A / f"n{i}.wav").rename(A / f"s{i}.wav")
        (A / f"t{i}.wav").unlink(missing_ok=True)
    print("→ audio/s1..s4.wav 갱신")


if __name__ == "__main__":
    main()
