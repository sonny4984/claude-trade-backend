#!/usr/bin/env python3
"""「최고의」를 고치는 다섯 가지 안을 만들어 견줘 듣게 한다.

손대는 정도가 1번에서 5번으로 갈수록 커진다. 1번은 잡음 한 조각만 되살리고,
5번은 낱말 세 음절을 원본에서 통째로 가져온다. 앞쪽일수록 목소리가 바뀔
위험이 없고, 뒤쪽일수록 발음이 또렷해진다.

어느 안이든 지키는 것:
  · 이어 붙이는 자리는 이 낱말 안에서 끝난다. 뒤따르는 「학습 효율과
    집중력을 원한다면」은 표본 하나 안 건드린다.
  · 늘어난 길이는 앞의 1.58초짜리 무음에서 꾸어 온다. 파일 길이가 그대로라
    영상 자리도 그대로다.
  · 컴프레서를 다시 걸지 않는다. 짧은 조각에 걸면 10dB 밝아진다.
  · 배속은 1.0 이다. 어머님이 「너무 빨리 발음된다」고 하셨으니 원본이 가진
    제 속도가 맞다.

  python3 variants_choi.py
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

# 원본에서 잰 자리 (울림대·마찰음대 그림에서 읽었다)
R_FRIC = 24.896      # ㅊ 마찰음 시작
R_VOW = 24.976       # 모음 ㅚ 시작
R_STOP = 25.048      # ㄱ 닫힘 시작
R_GO = 25.100        # 「고」 시작
R_HAK = 25.950       # 「학습」까지 지나 무음이 된 자리
# 다듬은 파일에서 잰 자리
C_VOW = 14.844       # 모음 시작 (여기부터 뒤는 되도록 안 건드린다)
C_WORD_END = 15.115  # 울림이 끝나는 자리
C_SIL = 15.400       # 「효율과」 바로 앞 무음. 여기부터 뒤는 못 박는다
C_NEAR = (15.415, 15.975)   # 음색을 맞출 이웃 말소리 「효율과」

n = lambda t: int(t * SR)


def pcm(path, af=None):
    c = [FF, "-v", "error", "-i", str(path)]
    if af:
        c += ["-af", af]
    c += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(c, capture_output=True).stdout,
                         dtype=np.float32).astype(np.float64)


def i16(path):
    out = subprocess.run([FF, "-v", "error", "-i", str(path), "-ac", "1",
                          "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True).stdout
    return np.frombuffer(out, dtype="<i2").copy()


def db(x):
    return 20 * np.log10(np.sqrt((x * x).mean()) + 1e-12)


def tilt(x):
    """낮은 소리(200~400)와 높은 소리(2.5k~4k)의 차. 목소리 색을 나타낸다."""
    v = x[np.abs(x) > 0.01]
    m = len(v) // 4096 * 4096
    if m < 4096:
        return 0.0
    sp = np.abs(np.fft.rfft(v[:m].reshape(-1, 4096) * np.hanning(4096), axis=1)).mean(axis=0)
    fr = np.fft.rfftfreq(4096, 1 / SR)
    b = lambda lo, hi: 20 * np.log10(sp[(fr >= lo) & (fr < hi)].mean() + 1e-12)
    return b(200, 400) - b(2500, 4000)


def match_tilt(x, want):
    """이웃 말소리와 같은 색이 되도록 고음을 깎거나 올린다."""
    for _ in range(6):
        gap = want - tilt(x)
        if abs(gap) < 0.4:
            break
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            t = f.name
        with wave.open(t, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.rint(np.clip(x, -1, 1) * 32768)
                           .clip(-32768, 32767)).astype("<i2").tobytes())
        x = pcm(t, f"treble=g={-gap:.2f}:f=2600:width_type=q:w=0.7")
        pathlib.Path(t).unlink()
    return x


def place(cut, x, anchor, xf=int(0.008 * SR), search=int(0.006 * SR)):
    """x 가 anchor 에서 끝나도록 놓는다. anchor 뒤로는 한 표본도 안 바뀐다.

    처음에는 뒷부분을 밀어서 이음매를 맞췄다. 그랬더니 낱말 뒤 전체가 최대
    6ms 앞당겨져 파일의 70%가 달라졌다. 그래서 뒤는 못 박아 두고, x 의 꼬리를
    깎아 가며 anchor 바로 앞 원래 파형과 맞물리는 자리를 찾는다. 목소리는
    주기가 있어 아무 데서나 이으면 마루와 골이 겹쳐 소리가 팩 죽는다."""
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


def build(cut16, cut, rawE, kind):
    """(바꿔 끼울 소리, 다듬은 파일에서 그 소리가 끝나는 자리) 를 돌려준다."""
    want_tilt = tilt(cut[n(C_NEAR[0]):n(C_NEAR[1])])
    # 원본 → 다듬은 파일 크기 옮김. 같은 모음끼리 견줘 정한다.
    g = db(cut[n(C_VOW):n(C_VOW + 0.065)]) - db(rawE[n(R_VOW):n(R_VOW + 0.065)])

    if kind in (1, 2, 3):
        # 마찰음은 성대 진동이 없어 목소리 정보가 없다. 되살려도 음색이 안 바뀐다.
        lead = {1: 0.080, 2: 0.130, 3: 0.080}[kind]
        boost = {1: 0.0, 2: 4.0, 3: 0.0}[kind]
        a0 = max(R_VOW - lead, R_FRIC - 0.050)
        x = rawE[n(a0):n(R_VOW)].copy()
        ratio = db(x) - db(rawE[n(R_VOW):n(R_VOW + 0.065)])
        x *= 10 ** ((db(cut[n(C_VOW):n(C_VOW + 0.065)]) + ratio + boost - db(x)) / 20)
        fi = int(0.012 * SR)
        x[:fi] *= np.linspace(0, 1, fi)
        if kind < 3:
            return x, C_VOW, None          # 모음 앞에서 딱 끝난다
        # 3번은 모음 앞머리 60ms 까지 원본으로 이어 간다
        v = rawE[n(R_VOW):n(R_VOW + 0.060)] * 10 ** (g / 20)
        v = match_tilt(v, want_tilt)
        return np.concatenate([x, v]), C_VOW + 0.060, None

    # 4·5번은 목소리가 들어 있다. 크기와 색을 이웃 말소리에 맞춘다.
    # 5번은 「학습」까지 함께 가져와야 한다. 처음에는 「최고의」 만 가져와
    # 다듬은 파일의 「학습」을 덮어 버렸고, 받아쓰기에서 낱말이 통째로
    # 사라졌다(「최고의 효율과」). 덮는 구간 안에 든 말은 다 가져와야 한다.
    a0, r1, anchor = ((R_FRIC - 0.050, R_GO, 14.938) if kind == 4
                      else (R_FRIC - 0.050, R_HAK, C_SIL))
    x = rawE[n(a0):n(r1)] * 10 ** (g / 20)
    x = match_tilt(x, want_tilt)
    fi = int(0.012 * SR)
    x[:fi] *= np.linspace(0, 1, fi)
    return x, anchor, None


NAMES = {1: "마찰음만", 2: "마찰음_길게세게", 3: "마찰음＋모음앞머리",
         4: "최_한음절_통째", 5: "최고의학습_통째"}
DESC = {1: "ㅊ 바람소리 80ms 만 되살림 (지금 보내드린 것)",
        2: "ㅊ 바람소리를 130ms 로 더 길게, 4dB 더 세게",
        3: "ㅊ 바람소리 + 모음 앞머리 60ms 까지 원본으로",
        4: "「최」 한 음절을 원본에서 통째로 (제 속도)",
        5: "「최고의 학습」을 원본에서 통째로 (앞 쉼에서 시간을 꾸어 옴)"}


def main():
    (OUT / "변형").mkdir(parents=True, exist_ok=True)
    before = D / "audio/s4_before.wav"
    cut16 = i16(before)
    cut = cut16.astype(np.float64) / 32768.0
    rawE = pcm(D / "audio/raw_s4.wav", EQ)
    clips = []
    for k in (1, 2, 3, 4, 5):
        x, anchor, _ = build(cut16, cut, rawE, k)
        new, start, r = place(cut, x, anchor)
        if start < n(13.35):
            raise SystemExit(f"{k}번: 앞 무음이 모자랍니다 ({start/SR:.3f}초)")
        o = np.rint(np.clip(new, -1, 1) * 32768).clip(-32768, 32767).astype("<i2")
        # anchor 뒤가 한 표본도 안 바뀌었는지 확인한다
        same = (o[n(anchor):] == cut16[n(anchor):]).mean() * 100
        d = np.nonzero(o != cut16)[0]
        p = OUT / "변형" / f"s4_v{k}.wav"
        with wave.open(str(p), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes(o.tobytes())
        print(f"{k}번 {DESC[k]}")
        print(f"     달라진 자리 {d[0]/SR:.3f}~{d[-1]/SR:.3f}초 ({(d[-1]-d[0])/SR*1000:.0f}ms)"
              f" · 이음매 맞물림 {r:+.2f}"
              f" · {anchor:.3f}초부터 끝까지 그대로 {same:.2f}%")
        m = OUT / f"최고의_{k}_{NAMES[k]}.mp3"
        subprocess.run([FF, "-y", "-v", "error", "-ss", "13.2", "-to", "17.3",
                        "-i", str(p), "-b:a", "192k", str(m)], check=True)
        clips.append(m)

    # 다섯 개를 번호 세는 삑 소리 없이 그냥 쉬어 가며 이어 붙인다
    args = [FF, "-y", "-v", "error"]
    fc = []
    for i, c in enumerate(clips):
        args += ["-i", str(c)]
        fc.append(f"[{i}:a]")
    args += ["-f", "lavfi", "-t", "0.9", "-i", "anullsrc=r=48000:cl=mono"]
    seq = "".join(f"{fc[i]}[{len(clips)}:a]" for i in range(len(clips)))
    args += ["-filter_complex", f"{seq}concat=n={len(clips)*2}:v=0:a=1[a]",
             "-map", "[a]", "-b:a", "192k", str(OUT / "최고의_다섯개_모아듣기.mp3")]
    subprocess.run(args, check=True)
    print(f"\n→ out/ 에 낱개 5개 + 모아듣기 1개")


if __name__ == "__main__":
    main()
