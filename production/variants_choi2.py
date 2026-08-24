#!/usr/bin/env python3
"""높이를 맞춘 「최고의」 세 안. 4번이 어색했던 까닭을 고친 판이다.

4번은 이음매에서 목소리 높이가 230Hz → 349Hz 로 튀었다. 붙여 넣은 원본
「최」가 306Hz 인데 뒤따르는 다듬은 파일의 「고의」는 349Hz 라서다.

process_audio.py 는 atempo 를 쓴다. 배속을 걸어도 높이는 안 변하는 필터다.
그런데도 두 파일의 같은 낱말 높이가 다른 것은, 원본 자체가 문장마다 높낮이가
다르기 때문이다. 실제로 「효율과」는 원본 293Hz · 완성본 305Hz 로 거의 같은데
「최고의」 자리만 크게 벌어져 있다.

그래서 붙일 조각만 1.14배(+2.3반음) 올린다. 길이는 그대로 둔다. 어머님이
「너무 빨리 발음된다」고 하셨으니 빠르기는 원본이 가진 제 속도가 맞다.

  asetrate 로 올리면 그만큼 짧아지므로 atempo 로 길이를 되돌린다.

  python3 variants_choi2.py
"""
import pathlib, subprocess, tempfile, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
OUT = D / "out"
EQ = ("highpass=f=85,equalizer=f=250:t=q:w=1.1:g=-1.6,"
      "equalizer=f=3200:t=q:w=1.6:g=2.0")
PITCH = 1.140                     # 자기상관으로 잰 값. 파일 전체 평균과 같다

R_FRIC = 24.896
R_VOW = 24.976
C_VOW = 14.844
C_NEAR = (15.415, 15.975)
n = lambda t: int(t * SR)

# (이름, 원본에서 가져올 끝, 다듬은 파일에서 못 박을 자리, 설명)
C_SS = (15.175, 15.275)   # 이 파일 자신의 「습」 ㅅ 마찰음
PLAN = [("가", 25.100, 14.938, "「최」 한 음절만 · 높이 맞춤"),
        ("나", 25.400, 15.150, "「최고의」 통째 · 높이 맞춤 · 이음매를 조용한 데로"),
        ("다", 25.950, 15.400, "「최고의 학습」 통째 · 높이 맞춤")]


def pcm(path, af=None):
    c = [FF, "-v", "error", "-i", str(path)]
    if af:
        c += ["-af", af]
    c += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(c, capture_output=True).stdout,
                         dtype=np.float32).astype(np.float64)


def grab(a, b, af):
    """원본에서 [a,b] 를 먼저 잘라낸 다음 그 조각에만 필터를 건다.

    통째로 필터를 걸고 시각으로 찾으면 안 된다. atempo 는 반올림 때문에
    37.97초짜리 파일에서 26ms 가 어긋나고, 25초 자리에서는 17ms 가 밀린다.
    250ms 짜리 조각을 뜨는 데 17ms 는 큰 값이다."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        t = f.name
    subprocess.run([FF, "-y", "-v", "error", "-ss", f"{a:.6f}", "-to", f"{b:.6f}",
                    "-i", str(D / "audio/raw_s4.wav"), "-ac", "1",
                    "-ar", str(SR), t], check=True)
    x = pcm(t, af)
    pathlib.Path(t).unlink()
    return x


def i16(path):
    return np.frombuffer(subprocess.run(
        [FF, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
         "-f", "s16le", "-"], capture_output=True).stdout, dtype="<i2").copy()


def db(x):
    return 20 * np.log10(np.sqrt((x * x).mean()) + 1e-12)


def f0(x, a, b):
    """자기상관 + 포물선 보간. 짧은 조각도 잰다.
    배음 간격을 세는 방법은 창이 170ms 라 72ms 짜리 「최」에는 못 쓴다."""
    y = x[n(a):n(b)]
    W = min(len(y), int(0.040 * SR))
    lo, hi = int(SR / 400), int(SR / 150)
    out = []
    for i in range(0, len(y) - W + 1, int(0.005 * SR)):
        s = y[i:i + W]
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


def place(cut, x, anchor, xf=int(0.008 * SR), search=int(0.006 * SR)):
    e = n(anchor)
    ref = cut[e - xf:e]
    best = (0, -9.0)
    for d in range(0, search + 1):
        s = x[len(x) - xf - d:len(x) - d]
        if len(s) < xf:
            break
        r = float(np.dot(ref, s) / (np.linalg.norm(ref) * np.linalg.norm(s) + 1e-12))
        if r > best[1]:
            best = (d, r)
    y = x[:len(x) - best[0]] if best[0] else x.copy()
    f = np.linspace(0, 1, xf)
    y[-xf:] = y[-xf:] * (1 - f) + ref * f
    out = cut.copy()
    out[e - len(y):e] = y
    return out, e - len(y), best[1]


def main():
    (OUT / "변형").mkdir(parents=True, exist_ok=True)
    cut16 = i16(D / "audio/s4_before.wav")
    cut = cut16.astype(np.float64) / 32768.0
    # 높이를 올린 뒤 길이를 되돌리고, 그다음에 마스터링 EQ 를 건다.
    # aresample 을 맨 앞에 두는 것이 중요하다. raw_s4.wav 는 44100Hz 라서
    # 표본율을 먼저 맞추지 않고 asetrate 를 걸면 비율이 1.14 가 아니라
    # 54720/44100 = 1.24 가 된다. 그 탓에 파일이 3.12초 짧아졌었다.
    shift = (f"asetrate={SR*PITCH:.0f},aresample={SR},"
             f"atempo={1/PITCH:.5f},{EQ}")
    # 모음이 울리는 자리에서만 잰다. 마찰음 위에서 재면 163Hz 같은 헛값이 나온다.
    v0, v1 = R_VOW + 0.005, R_VOW + 0.060
    before = grab(v0, v1, EQ)
    after = grab(v0, v1, shift)
    print(f"높이 보정 {PITCH:.3f}배 · 조각 길이 {len(before)/SR*1000:.0f}"
          f" → {len(after)/SR*1000:.0f} ms")
    print(f"  원본 「최」 {f0(before,0,len(before)/SR):.0f}Hz"
          f" → {f0(after,0,len(after)/SR):.0f}Hz"
          f"   (이음매 뒤가 요구하는 높이 {f0(cut,14.95,15.09):.0f}Hz)\n")

    g = db(cut[n(C_VOW):n(C_VOW + 0.065)]) - db(after)
    clips = []
    for tag, r1, anchor, desc in PLAN:
        x = grab(R_FRIC - 0.050, r1, shift) * 10 ** (g / 20)
        fi = int(0.012 * SR)
        x[:fi] *= np.linspace(0, 1, fi)
        new, start, r = place(cut, x, anchor)
        o = np.rint(np.clip(new, -1, 1) * 32768).clip(-32768, 32767).astype("<i2")
        same = (o[n(anchor):] == cut16[n(anchor):]).mean() * 100
        d = np.nonzero(o != cut16)[0]
        p = OUT / "변형" / f"s4_{tag}.wav"
        with wave.open(str(p), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes(o.tobytes())
        print(f"{tag}  {desc}")
        print(f"    달라진 자리 {d[0]/SR:.3f}~{d[-1]/SR:.3f}초"
              f" ({(d[-1]-d[0])/SR*1000:.0f}ms) · 이음매 맞물림 {r:+.2f}")
        print(f"    앞 쉼 {(start/SR-13.27):.2f}초 (원래 1.57초)"
              f" · {anchor:.3f}초부터 끝까지 그대로 {same:.2f}%")
        m = OUT / f"최고의_{tag}_{desc.split(' · ')[0]}.mp3"
        subprocess.run([FF, "-y", "-v", "error", "-ss", "13.2", "-to", "17.3",
                        "-i", str(p), "-b:a", "192k", str(m)], check=True)
        clips.append(m)

    # 라: 원본을 아예 안 쓴다. 마찰음은 성대 진동이 없어 높이가 없으므로
    # 이 파일 자신의 「습」 ㅅ 소리를 ㅊ 자리에 쓸 수 있다. 같은 파일 같은
    # 마스터링이라 음색도 크기도 어긋날 데가 없다. 울리는 소리는 손 안 댄다.
    ss = cut[n(C_SS[0]):n(C_SS[1])].copy()
    ss = ss[:n(0.080)] if len(ss) > n(0.080) else ss
    want = db(cut[n(C_VOW):n(C_VOW + 0.065)]) - 9.9   # 원본에서 잰 마찰음:모음 비
    ss *= 10 ** ((want - db(ss)) / 20)
    fi = int(0.012 * SR)
    ss[:fi] *= np.linspace(0, 1, fi)
    new, start, r = place(cut, ss, C_VOW)
    o = np.rint(np.clip(new, -1, 1) * 32768).clip(-32768, 32767).astype("<i2")
    same = (o[n(C_VOW):] == cut16[n(C_VOW):]).mean() * 100
    d = np.nonzero(o != cut16)[0]
    pth = OUT / "변형" / "s4_라.wav"
    with wave.open(str(pth), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(o.tobytes())
    print("라  ㅊ 를 이 파일 자신의 ㅅ 소리로 만듦 · 원본 안 씀")
    print(f"    달라진 자리 {d[0]/SR:.3f}~{d[-1]/SR:.3f}초"
          f" ({(d[-1]-d[0])/SR*1000:.0f}ms) · 앞 쉼 그대로"
          f" · {C_VOW:.3f}초부터 끝까지 그대로 {same:.2f}%")
    m = OUT / "최고의_라_이파일의ㅅ으로.mp3"
    subprocess.run([FF, "-y", "-v", "error", "-ss", "13.2", "-to", "17.3",
                    "-i", str(pth), "-b:a", "192k", str(m)], check=True)
    clips.append(m)

    args = [FF, "-y", "-v", "error"]
    for c in clips:
        args += ["-i", str(c)]
    args += ["-f", "lavfi", "-t", "0.9", "-i", "anullsrc=r=48000:cl=mono"]
    seq = "".join(f"[{i}:a][{len(clips)}:a]" for i in range(len(clips)))
    args += ["-filter_complex", f"{seq}concat=n={len(clips)*2}:v=0:a=1[a]",
             "-map", "[a]", "-b:a", "192k", str(OUT / "최고의_높이맞춤_모아듣기.mp3")]
    subprocess.run(args, check=True)
    print("\n→ out/ 에 낱개 3개 + 모아듣기 1개")


if __name__ == "__main__":
    main()
