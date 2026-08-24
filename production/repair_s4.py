#!/usr/bin/env python3
"""4구간 「최」를 원본에서 가져오되, 높이를 뒤따르는 말에 맞춰 갈아 끼운다.

무엇이 망가져 있었나
  process_audio.py 는 -42 dB(SIL_DB) 아래를 쉼으로 보고 줄인다. 「최」의 ㅊ
  마찰음은 -45 dB 언저리라 쉼으로 분류돼 통째로 깎였다. 원본에 80ms 있던
  것이 7ms 만 남아, 모음 ㅚ 가 완전한 무음에서 바로 튀어나온다. 받아쓰기를
  돌리면 「최고의」가 아니라 「코에」로 찍힌다.

왜 그냥 붙이면 안 되나
  원본 「최」는 306Hz 인데 뒤따르는 다듬은 파일의 「고의」는 349Hz 다. 그냥
  이으면 낱말 한가운데서 6.5 반음이 뛴다. 어머님이 「뭔가 어색하다」고 하신
  자리가 여기다. 그래서 붙일 조각만 1.14배(+2.3반음) 올린다. 튐이 47Hz 로
  줄어든다. 길이는 그대로 둔다 — 「너무 빨리 발음된다」고 하셨으니 빠르기는
  원본이 가진 제 속도가 맞다.

못 박는 것
  · 14.938초부터 파일 끝까지 표본 하나 안 바뀐다 (100.00% 확인)
  · 늘어난 길이는 앞 쉼에서 꾸어 온다. 1.57 → 1.43초. 파일 길이는 그대로다
  · 컴프레서를 다시 걸지 않는다. 짧은 조각에 걸면 10dB 밝아진다

조심할 것 셋 (다 실제로 밟았다)
  · raw_s4.wav 는 44100Hz 다. 표본율을 먼저 안 맞추고 asetrate=48000*1.14 를
    걸면 실제 비율이 54720/44100 = 1.24 가 된다. 그래서 조각을 먼저 48000 으로
    잘라낸 뒤에 건다
  · 파일 통째로 필터를 걸고 시각으로 조각을 찾으면 안 된다. atempo 반올림으로
    37.97초 파일에서 26ms 어긋나 25초 자리에서는 17ms 밀린다
  · 16비트로 읽고 16비트로 쓴다. float 를 거치면 32767/32768 만큼 어긋나
    건드리지도 않은 표본이 전부 1 LSB 씩 달라진다

  python3 repair_s4.py
"""
import pathlib, shutil, subprocess, tempfile, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

EQ = ("highpass=f=85,equalizer=f=250:t=q:w=1.1:g=-1.6,"
      "equalizer=f=3200:t=q:w=1.6:g=2.0")
PITCH = 1.140          # 자기상관으로 잰 값. 파일 전체 평균(1.141)과 같다
R_A, R_B = 24.846, 25.100   # 원본에서 가져올 구간 (마찰음 앞부터 「고」 앞까지)
R_VOW = 24.976              # 그 안에서 모음 ㅚ 가 시작하는 자리
C_VOW = 14.844              # 다듬은 파일에서 모음이 시작하는 자리
ANCHOR = 14.938             # 여기부터 뒤는 못 박는다
FADE_IN = int(0.012 * SR)
XF = int(0.008 * SR)

n = lambda t: int(t * SR)


def pcm(path, af=None):
    c = [FF, "-v", "error", "-i", str(path)]
    if af:
        c += ["-af", af]
    c += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(c, capture_output=True).stdout,
                         dtype=np.float32).astype(np.float64)


def i16(path):
    return np.frombuffer(subprocess.run(
        [FF, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
         "-f", "s16le", "-"], capture_output=True).stdout, dtype="<i2").copy()


def grab(a, b, af):
    """원본에서 [a,b] 를 48000Hz 로 먼저 잘라낸 다음 그 조각에만 필터를 건다."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        t = f.name
    subprocess.run([FF, "-y", "-v", "error", "-ss", f"{a:.6f}", "-to", f"{b:.6f}",
                    "-i", str(D / "audio/raw_s4.wav"), "-ac", "1",
                    "-ar", str(SR), t], check=True)
    x = pcm(t, af)
    pathlib.Path(t).unlink()
    return x


def db(x):
    return 20 * np.log10(np.sqrt((x * x).mean()) + 1e-12)


def f0(x):
    """자기상관 + 포물선 보간. 모음 자리에서만 부를 것."""
    W = min(len(x), int(0.040 * SR))
    lo, hi = int(SR / 400), int(SR / 150)
    out = []
    for i in range(0, len(x) - W + 1, int(0.005 * SR)):
        s = x[i:i + W]
        if np.sqrt((s * s).mean()) < 0.01:
            continue
        s = s - s.mean()
        r = np.correlate(s, s, "full")[W - 1:]
        if hi >= len(r):
            continue
        k = int(np.argmax(r[lo:hi])) + lo
        if 0 < k < len(r) - 1:
            d = r[k - 1] - 2 * r[k] + r[k + 1]
            k = k + ((r[k - 1] - r[k + 1]) / (2 * d)) if d else k
        out.append(SR / k)
    return float(np.median(out)) if out else 0.0


def main():
    src = D / "audio/s4.wav"
    before = D / "audio/s4_before.wav"
    if not before.exists():
        shutil.copy(src, before)
    cut16 = i16(before)
    cut = cut16.astype(np.float64) / 32768.0

    shift = f"asetrate={SR*PITCH:.0f},aresample={SR},atempo={1/PITCH:.5f},{EQ}"
    v0, v1 = R_VOW + 0.005, R_VOW + 0.060
    print(f"  높이  원본 「최」 {f0(grab(v0,v1,EQ)):.0f}Hz"
          f" → {f0(grab(v0,v1,shift)):.0f}Hz"
          f"  (이음매 뒤가 요구하는 값 {f0(cut[n(14.95):n(15.09)]):.0f}Hz)")

    x = grab(R_A, R_B, shift)
    # 원본과 다듬은 파일의 같은 모음끼리 견줘 크기를 옮긴다
    g = db(cut[n(C_VOW):n(C_VOW + 0.065)]) - db(grab(v0, v1, shift))
    x *= 10 ** (g / 20)
    x[:FADE_IN] *= np.linspace(0, 1, FADE_IN)

    # ANCHOR 에서 끝나도록 놓는다. 조각 꼬리를 깎아 가며 그 앞 원래 파형과
    # 맞물리는 자리를 찾는다. 뒤를 밀면 낱말 뒤 전체가 앞당겨진다.
    e, ref = n(ANCHOR), cut[n(ANCHOR) - XF:n(ANCHOR)]
    best = (0, -9.0)
    for d in range(0, int(0.006 * SR) + 1):
        s = x[len(x) - XF - d:len(x) - d]
        if len(s) < XF:
            break
        r = float(np.dot(ref, s) / (np.linalg.norm(ref) * np.linalg.norm(s) + 1e-12))
        if r > best[1]:
            best = (d, r)
    y = x[:len(x) - best[0]] if best[0] else x.copy()
    f = np.linspace(0, 1, XF)
    y[-XF:] = y[-XF:] * (1 - f) + ref * f

    out = cut.copy()
    out[e - len(y):e] = y
    o = np.rint(np.clip(out, -1, 1) * 32768).clip(-32768, 32767).astype("<i2")
    d = np.nonzero(o != cut16)[0]
    same = (o[e:] == cut16[e:]).mean() * 100
    print(f"  갈아 낀 자리 {d[0]/SR:.3f}~{d[-1]/SR:.3f}초"
          f" ({(d[-1]-d[0])/SR*1000:.0f}ms) · 이음매 맞물림 {best[1]:+.2f}")
    print(f"  앞 쉼 {(e-len(y))/SR-13.27:.2f}초 (원래 1.57초)"
          f" · 길이 {len(o)/SR:.3f}초 (그대로)"
          f" · {ANCHOR:.3f}초부터 끝까지 그대로 {same:.2f}%")
    if same < 100.0:
        raise SystemExit("이음매 뒤가 바뀌었습니다")

    with wave.open(str(src), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(o.tobytes())
    print(f"→ {src.name}")


if __name__ == "__main__":
    main()
