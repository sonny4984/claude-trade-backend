#!/usr/bin/env python3
"""4구간에서 「최고의 학습」 두 낱말만 원본으로 되돌린다.

「최」의 ㅊ 마찰음이 잘려 나가 「코에」 처럼 들린다. 원본은 소리가 80ms 에
걸쳐 서서히 올라오는데 다듬은 파일은 완전한 무음에서 30ms 만에 툭 튀어
오른다. 잘린 자국이다.

처음에는 문장 전체(3.42초)를 갈아 끼웠다. 그랬더니 멀쩡하던 「학습 효율과
집중력을 원한다면」까지 바뀌어 목소리가 달라 들렸다. 그래서 망가진 단어
두 낱말만(0.59초) 손댄다. 나머지 22.4초는 원래 파일 그대로다.
「학습」도 함께 뭉개져 있었다. 「최고의」만 고치니 「스프일과」로 들렸다.

원본은 마스터링 전 소리라 그냥 붙이면 톤이 안 맞는다. process_audio.py 와
같은 체인을 걸고, 뒤따르는 「학습 효율과」와의 크기 비율까지 맞춘다.

  python3 repair_s4.py
"""
import pathlib, shutil, subprocess, tempfile, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

# 다듬은 파일에서 망가진 「최고의」 자리 (앞 무음 조금 포함)
CUT_A, CUT_B = 14.80, 15.39
# 원본에서 같은 단어 (ㅊ 마찰음 시작 전부터)
RAW_A, RAW_B = 24.88, 25.90
# 배속과 크기를 맞출 때 기준으로 삼는 뒷말 「효율과」.
# 앞뒤로 쉼이 뚜렷해 경계가 확실한 낱말이라야 한다.
REF_CUT = (15.41, 15.84)
REF_RAW = (26.13, 26.68)
XF = int(0.008 * SR)             # 이음매 8ms 겹침

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


def slice_wav(src, t0, t1, af=None):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        p = f.name
    subprocess.run([FF, "-y", "-v", "error", "-ss", str(t0), "-to", str(t1),
                    "-i", str(src), "-ac", "1", "-ar", str(SR), p], check=True)
    x = pcm(p, af)
    pathlib.Path(p).unlink()
    return x


def voiced(a, t0, t1):
    s = a[int(t0 * SR):int(t1 * SR)]
    e = np.abs(s[:len(s) // 480 * 480]).reshape(-1, 480).mean(axis=1)
    return float((e > max(0.004, e.max() * 0.10)).sum()) / 100


def rms(x):
    v = x[np.abs(x) > 0.01]
    return float(np.sqrt((v * v).mean()) + 1e-12) if len(v) else 1e-12


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
    cut = pcm(before)
    raw = D / "audio/raw_s4.wav"
    n = lambda t: int(t * SR)

    # 배속을 되짚는다. 소리 나는 시간을 세어 견주면 문턱값에 따라 1.09~1.22 로
    # 흔들린다. 그래서 원본 「효율과」를 여러 배속으로 늘려 보고 다듬은 파일과
    # 가장 닮는 값을 고른다. 봉우리가 뚜렷해 흔들리지 않는다.
    def shape(x, h=240):
        m = len(x) // h
        e = np.abs(x[:m * h]).reshape(m, h).mean(axis=1)
        return (e - e.mean()) / (e.std() + 1e-9)

    tgt = shape(cut[n(REF_CUT[0]):n(REF_CUT[1])])
    best = (1.0, -9.0)
    for k in range(21):
        t = round(1.00 + 0.02 * k, 2)
        sh = shape(slice_wav(raw, *REF_RAW, af=f"atempo={t:.3f}"))
        m = min(len(sh), len(tgt))
        if m < 6:
            continue
        r = float(np.dot(sh[:m], tgt[:m]) / m)
        if r > best[1]:
            best = (t, r)
    tempo = best[0]
    print(f"  배속 {tempo:.2f}  (원본 「효율과」와 닮음 {best[1]:+.3f})")

    word = slice_wav(raw, RAW_A, RAW_B, f"atempo={tempo:.5f},{CHAIN}")

    # 짧은 조각에 컴프레서를 걸면 파일 전체에 걸 때와 다르게 작동해 소리가
    # 훨씬 밝아진다(10dB 차이가 났다). 앞뒤 말소리의 색에 맞춰 고음을 깎는다.
    def tilt(x):
        v = x[np.abs(x) > 0.01]
        m = len(v) // 4096 * 4096
        if m < 4096:
            return 0.0
        sp = np.abs(np.fft.rfft(v[:m].reshape(-1, 4096) * np.hanning(4096), axis=1)).mean(axis=0)
        fr = np.fft.rfftfreq(4096, 1 / SR)
        b = lambda lo, hi: 20 * np.log10(sp[(fr >= lo) & (fr < hi)].mean() + 1e-12)
        return b(200, 400) - b(2500, 4000)

    near = np.concatenate([cut[n(11.0):n(13.2)], cut[n(15.41):n(17.11)]])
    want_tilt = tilt(near)
    for _ in range(6):
        gap = want_tilt - tilt(word)
        if abs(gap) < 0.5:
            break
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        with wave.open(tmp, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(word, -1, 1) * 32767).astype("<i2").tobytes())
        word = pcm(tmp, f"treble=g={-gap:.2f}:f=2600:width_type=q:w=0.7")
        pathlib.Path(tmp).unlink()
    print(f"  목소리 색  앞뒤 {want_tilt:.1f} dB → 갈아 낀 조각 {tilt(word):.1f} dB")
    ref = slice_wav(raw, *REF_RAW, af=f"atempo={tempo:.5f},{CHAIN}")
    # 원본 안에서 「최고의」와 「학습 효율과」의 크기 비율을 그대로 지킨다
    want = rms(cut[n(REF_CUT[0]):n(REF_CUT[1])]) * (rms(word) / rms(ref))
    word *= want / rms(word)
    print(f"  단어 길이 {len(word)/SR:.3f}초 (자리 {CUT_B-CUT_A:.3f}초)")

    # 이음매를 겹치면 겹친 만큼 짧아진다. 두 번 이으니 2XF 를 미리 더해 둬야
    # 뒷부분이 원래 자리에 그대로 앉는다. 안 그러면 뒤가 통째로 16ms 밀린다.
    extra = len(word) / SR - (CUT_B - CUT_A)
    out = join(join(cut[:n(CUT_A - extra) + 2 * XF], word), cut[n(CUT_B):])
    out = out[:len(cut)] if len(out) >= len(cut) else np.pad(out, (0, len(cut) - len(out)))
    peak = np.abs(out).max()
    if peak > 0.98:
        out *= 0.98 / peak
    same = np.abs(out - cut) < 1e-4
    print(f"  앞 무음에서 {extra*1000:+.0f}ms 빌림 · 길이 {len(out)/SR:.3f}초"
          f" · 원본과 같은 구간 {same.mean()*100:.1f}%")

    with wave.open(str(src), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"→ {src.name}")


if __name__ == "__main__":
    main()
