#!/usr/bin/env python3
"""4구간에서 눌려 버린 한 문장을 원본 음원으로 되돌린다.

「최고의 학습 효율과 집중력을 원한다면?」이 원본에서는 3.42초인데 다듬은
파일에서는 2.27초로 눌려 있었다. 첫 글자 「최」가 뭉개져 「코에 악수표율과」
처럼 들린다. 받아쓰기로 확인했다.

말소리를 늘리지 않는다. 원본 문장을 그대로 가져와 끼우고, 늘어난 1.15초는
앞뒤 쉼에서 빌린다. 그래서 파일 길이가 그대로라 뒤따르는 자막과 컷이
움직이지 않는다.

  python3 repair_s4.py            # audio/s4.wav 를 고친다 (원본은 s4_before.wav 로 남긴다)
"""
import pathlib, shutil, subprocess, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

CUT_A, CUT_B = 14.84, 17.11      # 다듬은 파일에서 눌린 문장의 자리
RAW_A, RAW_B = 24.91, 28.33      # 원본에서 같은 문장의 자리
BORROW_PRE, BORROW_POST = 0.55, 0.60   # 앞뒤 쉼에서 빌릴 길이
XF = int(0.012 * SR)             # 이음매에서 딸깍 소리가 나지 않게 12ms 씩 겹친다


def pcm(path):
    r = subprocess.run([FF, "-v", "error", "-i", str(path), "-ac", "1",
                        "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)


def rms(x):
    return float(np.sqrt((x * x).mean()) + 1e-12)


def join(a, b):
    """두 조각을 12ms 겹쳐 잇는다."""
    if len(a) < XF or len(b) < XF:
        return np.concatenate([a, b])
    f = np.linspace(0, 1, XF)
    mid = a[-XF:] * (1 - f) + b[:XF] * f
    return np.concatenate([a[:-XF], mid, b[XF:]])


def main():
    cut, raw = pcm(D / "audio/s4.wav"), pcm(D / "audio/raw_s4.wav")
    n = lambda t: int(t * SR)

    head = cut[:n(CUT_A - BORROW_PRE)]
    body = raw[n(RAW_A):n(RAW_B)]
    tail = cut[n(CUT_B + BORROW_POST):]

    # 원본은 마스터링 전이라 크기가 다르다. 앞뒤 말소리에 맞춰 키를 맞춘다.
    ref = rms(np.concatenate([cut[n(11.0):n(13.2)], cut[n(19.0):n(21.5)]]))
    body = body * (ref / rms(body))
    print(f"  크기 맞춤  원본 조각을 {ref / rms(raw[n(RAW_A):n(RAW_B)]):.3f} 배")

    out = join(join(head, body), tail)
    print(f"  길이  고치기 전 {len(cut)/SR:.3f}초  →  고친 뒤 {len(out)/SR:.3f}초"
          f"   차이 {(len(out)-len(cut))/SR:+.3f}초")

    # 길이가 조금이라도 어긋나면 뒤따르는 자막이 밀린다. 끝을 잘라 맞춘다.
    out = out[:len(cut)] if len(out) >= len(cut) else np.pad(out, (0, len(cut) - len(out)))
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    print(f"  최대 {np.abs(out).max():.3f}")

    src = D / "audio/s4.wav"
    if not (D / "audio/s4_before.wav").exists():
        shutil.copy(src, D / "audio/s4_before.wav")
    with wave.open(str(src), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"→ {src.name} 를 고쳤습니다 (고치기 전 파일은 s4_before.wav)")


if __name__ == "__main__":
    main()
