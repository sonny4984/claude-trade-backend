#!/usr/bin/env python3
"""4구간에서 눌려 버린 한 문장을 원본 음원으로 되돌린다.

「최고의 학습 효율과 집중력을 원한다면?」이 원본에서는 3.42초인데 다듬은
파일에서는 2.27초로 눌려 있었다. 첫 글자 「최」가 뭉개져 「코에 악수표율과」
처럼 들린다. 받아쓰기로 확인했다.

원본을 그냥 오려 붙이면 목소리가 딴사람이 된다. process_audio.py 가 거는
마스터링을 안 거친 소리이기 때문이다. 특히 배속(atempo)이 빠져 있어 그
대목만 느려진다. 그래서 같은 체인을 그대로 걸어서 붙인다.

  배속 → 85Hz 아래 자르기 → 250Hz 낮추기 → 3.2kHz 올리기 → 컴프레서

라우드니스만 뺀다. 그건 파일 전체를 보고 거는 것이라 3초짜리 조각에
걸면 다르게 나온다. 대신 앞뒤 말소리에 크기를 맞춘다.

  python3 repair_s4.py
"""
import pathlib, shutil, subprocess, tempfile, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

CUT_A, CUT_B = 14.84, 17.11      # 눌린 문장이 앉아 있던 자리
RAW_A, RAW_B = 24.91, 28.33      # 원본에서 같은 문장
XF = int(0.012 * SR)             # 이음매 12ms 겹침

# process_audio.py 와 같은 체인. 라우드니스만 뺀다.
CHAIN = ("highpass=f=85,"
         "equalizer=f=250:t=q:w=1.1:g=-1.6,"
         "equalizer=f=3200:t=q:w=1.6:g=2.0,"
         "acompressor=threshold=-19dB:ratio=2.4:attack=10:release=200:makeup=1.5")


def pcm(path, af=None):
    cmd = [FF, "-v", "error", "-i", str(path)]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout,
                         dtype=np.float32).astype(np.float64)


def voiced(a, t0, t1):
    s = a[int(t0 * SR):int(t1 * SR)]
    if len(s) < 480:
        return 0.0
    e = np.abs(s[:len(s) // 480 * 480]).reshape(-1, 480).mean(axis=1)
    return float((e > max(0.004, e.max() * 0.10)).sum()) / 100


def rms(x):
    return float(np.sqrt((x * x).mean()) + 1e-12)


def join(a, b):
    if len(a) < XF or len(b) < XF:
        return np.concatenate([a, b])
    f = np.linspace(0, 1, XF)
    return np.concatenate([a[:-XF], a[-XF:] * (1 - f) + b[:XF] * f, b[XF:]])


def main():
    src = D / "audio/s4.wav"
    before = D / "audio/s4_before.wav"
    if not before.exists():
        shutil.copy(src, before)
    cut = pcm(before)                     # 손대기 전 파일에서 다시 시작한다
    raw_all = pcm(D / "audio/raw_s4.wav")
    n = lambda t: int(t * SR)

    # 손대지 않은 단어로 배속을 되짚는다. 원본과 다듬은 파일에서 같은 말이
    # 얼마나 짧아졌는지 보면 된다.
    pairs = [(26.90, 27.53, 15.84, 16.42), (27.73, 28.33, 16.45, 17.02)]
    rs = [voiced(cut, c, d) / voiced(raw_all, a, b)
          for a, b, c, d in pairs if voiced(raw_all, a, b) > 0.1]
    tempo = 1.0 / float(np.median(rs))
    print(f"  배속 {tempo:.4f} (손대지 않은 단어 {len(rs)}개로 되짚음)")

    # 원본 문장만 잘라 같은 체인을 건다
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        piece = f.name
    subprocess.run([FF, "-y", "-v", "error", "-ss", str(RAW_A), "-to", str(RAW_B),
                    "-i", str(D / "audio/raw_s4.wav"), "-ac", "1", "-ar", str(SR),
                    piece], check=True)
    body = pcm(piece, f"atempo={tempo:.5f},{CHAIN}")
    pathlib.Path(piece).unlink()

    # 짧은 조각에 컴프레서를 걸면 파일 전체에 걸 때와 다르게 작동해서
    # 소리 색이 어긋난다. 앞뒤 말소리의 색에 맞춰 고음을 깎거나 올린다.
    def tilt(x):
        v = x[np.abs(x) > 0.01]
        m = len(v) // 4096 * 4096
        if m < 4096:
            return 0.0
        sp = np.abs(np.fft.rfft(v[:m].reshape(-1, 4096) * np.hanning(4096), axis=1)).mean(axis=0)
        fr = np.fft.rfftfreq(4096, 1 / SR)
        b = lambda lo, hi: 20 * np.log10(sp[(fr >= lo) & (fr < hi)].mean() + 1e-12)
        return b(200, 400) - b(2500, 4000)

    near = np.concatenate([cut[n(11.0):n(13.2)], cut[n(19.0):n(21.5)]])
    want = tilt(near)
    for _ in range(4):
        gap = want - tilt(body)
        if abs(gap) < 0.4:
            break
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        with wave.open(tmp, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(body, -1, 1) * 32767).astype("<i2").tobytes())
        body = pcm(tmp, f"treble=g={-gap:.2f}:f=2600:width_type=q:w=0.7")
        pathlib.Path(tmp).unlink()
    print(f"  소리 색  앞뒤 {want:.1f} dB → 고친 조각 {tilt(body):.1f} dB")

    # 크기는 말소리끼리 견준다. 쉼까지 넣어 재면 쉼이 많은 쪽이 작게 나온다.
    loud = lambda x: rms(x[np.abs(x) > 0.01])
    body *= loud(near) / loud(body)
    print(f"  문장 길이  원본 {RAW_B-RAW_A:.2f}초 → 배속 뒤 {len(body)/SR:.2f}초"
          f"  (눌려 있던 것 {CUT_B-CUT_A:.2f}초)")

    # 늘어난 만큼 앞뒤 쉼에서 반씩 빌린다
    extra = len(body) / SR - (CUT_B - CUT_A)
    pre = post = extra / 2
    print(f"  앞뒤 쉼에서 {pre:.2f}초씩 빌립니다")

    out = join(join(cut[:n(CUT_A - pre)], body), cut[n(CUT_B + post):])
    out = out[:len(cut)] if len(out) >= len(cut) else np.pad(out, (0, len(cut) - len(out)))
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    print(f"  길이 {len(out)/SR:.3f}초 (원래 {len(cut)/SR:.3f}초)  최대 {np.abs(out).max():.3f}")

    with wave.open(str(src), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"→ {src.name} 를 고쳤습니다")


if __name__ == "__main__":
    main()
