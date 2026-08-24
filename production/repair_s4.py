#!/usr/bin/env python3
"""4구간 「최」의 ㅊ 마찰음을 되살린다. 앞 무음 자리에만 쓴다.

process_audio.py 는 -42 dB(SIL_DB) 아래를 쉼으로 보고 줄인다. 그런데 「최」의
ㅊ 마찰음은 -45 dB 언저리라 쉼으로 분류돼 통째로 잘려 나갔다. 원본에는 79ms
있는 마찰음이 다듬은 파일에는 6ms 밖에 없다. 그래서 모음 ㅚ 가 무음에서 바로
튀어나오고, 받아쓰기를 돌리면 「최고의」가 아니라 「코에」로 들린다.
어머님이 「최 이것만 너무 빨리 발음 되어서」라고 하신 그대로다.

앞서 네 번은 낱말을 통째로 갈아 끼웠다가 목소리가 달라졌다. 이번에는 다르다.

  · 모음이 시작하는 자리부터 파일 끝까지 표본 하나 건드리지 않는다
  · 되살리는 마찰음은 잡음이라 성대 진동이 없다 — 음색이 바뀔 수가 없다
  · 앞에 1.57초짜리 완전한 무음이 있어 길이도 그대로다
  · 컴프레서를 다시 걸지 않는다. 짧은 조각에 걸면 10dB 밝아지던 문제가 없다

크기는 원본 안에서 잰 마찰음:모음 비를 그대로 옮겨 온다. 다듬은 파일의 모음
크기에 그 비를 곱하면 절대값이 정해진다. 원본을 절대 기준으로 쓰지 않으므로
마스터링으로 얼마가 올라갔는지 몰라도 된다.

  python3 repair_s4.py
"""
import pathlib, shutil, subprocess, tempfile, wave
import numpy as np
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

# 마스터링 체인에서 정적인 부분만. acompressor 는 뺀다.
EQ = ("highpass=f=85,"
      "equalizer=f=250:t=q:w=1.1:g=-1.6,"
      "equalizer=f=3200:t=q:w=1.6:g=2.0")

CUT_NEAR = (14.70, 15.10)    # 다듬은 파일에서 「최」가 있는 언저리
RAW_NEAR = (24.80, 25.10)    # 원본에서 같은 자리
FRIC_LEAD = 0.080            # 모음 앞에서 마찰음을 얼마나 가져올지
FADE_IN = int(0.012 * SR)    # 무음에서 서서히 올라오게
XF = int(0.004 * SR)         # 모음과 만나는 자리 4ms 겹침


def i16(path):
    """16비트 그대로 읽는다. float 로 돌렸다 오면 32767/32768 만큼 어긋나
    건드리지도 않은 표본이 전부 1 LSB 씩 달라진다. 실제로 그랬다."""
    out = subprocess.run([FF, "-v", "error", "-i", str(path), "-ac", "1",
                          "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True).stdout
    return np.frombuffer(out, dtype="<i2").copy()


def pcm(path, af=None):
    cmd = [FF, "-v", "error", "-i", str(path)]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout,
                         dtype=np.float32).astype(np.float64)


def vowel_onset(path, lo, hi):
    """울림대(100~1k) 힘이 솟는 자리. 마찰음에는 성대 진동이 없어 안 걸린다."""
    v = pcm(path, "highpass=f=100,lowpass=f=1000")[int(lo * SR):int(hi * SR)]
    h = 192                                   # 4ms — 목소리 한 주기(240Hz)보다 길게.
    m = len(v) // h                           # 더 짧게 잡으면 한 주기 안에서
                                              # 힘이 오르내려 20ms 일찍 걸린다
    e = np.sqrt((v[:m * h].reshape(m, h) ** 2).mean(axis=1))
    peak = np.sort(e)[int(m * 0.97)]          # 모음이 자리잡은 크기
    th = peak * 0.10                          # 그 20dB 아래를 시작으로 본다
    i = int(np.argmax(e > th))
    return lo + i * h / SR, 20 * np.log10(peak + 1e-12)


def db(x):
    return 20 * np.log10(np.sqrt((x * x).mean()) + 1e-12)


def main():
    src = D / "audio/s4.wav"
    before = D / "audio/s4_before.wav"
    raw = D / "audio/raw_s4.wav"
    if not before.exists():
        shutil.copy(src, before)
    cut16 = i16(before)                        # 언제나 손 안 댄 원본에서 시작한다
    cut = cut16.astype(np.float64) / 32768.0
    n = lambda t: int(t * SR)

    c_vow, c_peak = vowel_onset(before, *CUT_NEAR)
    r_vow, r_peak = vowel_onset(raw, *RAW_NEAR)
    print(f"  모음 ㅚ 시작   다듬은 {c_vow:.4f}초 · 원본 {r_vow:.4f}초")

    nz = np.nonzero(cut[n(CUT_NEAR[0]):n(c_vow)])[0]
    have = (c_vow - (CUT_NEAR[0] + nz[0] / SR)) * 1000 if len(nz) else 0.0
    print(f"  마찰음 길이    다듬은 {have:.0f} ms · 원본 {FRIC_LEAD*1000:.0f} ms"
          f"  → {FRIC_LEAD*1000-have:+.0f} ms 되살린다")

    # 원본 안에서 마찰음이 모음보다 몇 dB 낮은지 잰다. 이 비만 옮겨 온다.
    rawE = pcm(raw, EQ)
    fric = rawE[n(r_vow - FRIC_LEAD):n(r_vow)].copy()
    ratio = db(fric) - db(rawE[n(r_vow):n(r_vow + 0.065)])
    want = db(cut[n(c_vow):n(c_vow + 0.065)]) + ratio
    fric *= 10 ** ((want - db(fric)) / 20)
    print(f"  크기          원본에서 마찰음이 모음보다 {ratio:+.1f} dB"
          f"  → 다듬은 파일 기준 {want:.1f} dB")

    # 무음 → 마찰음 → 모음. 뒤는 한 표본도 안 옮긴다.
    fric[:FADE_IN] *= np.linspace(0, 1, FADE_IN)
    a = n(c_vow) - len(fric)
    tail = cut[a:n(c_vow)]                     # 지금 거기 있던 것 (거의 다 0)
    f = np.linspace(0, 1, XF)                  # 이음매만 4ms 섞는다
    fric[-XF:] = fric[-XF:] * (1 - f) + tail[-XF:] * f

    # 16비트 배열에 그 자리만 덮어쓴다. 나머지는 읽은 그대로 다시 나간다.
    out = cut16.copy()
    out[a:n(c_vow)] = np.rint(np.clip(fric, -1, 1) * 32768).clip(-32768, 32767)
    d = np.nonzero(out != cut16)[0]
    touched = np.count_nonzero(cut16[a:n(c_vow)])
    print(f"  새로 쓴 자리   {a/SR:.4f} ~ {c_vow:.4f}초"
          f" (그중 소리가 있던 표본 {touched}개 = {touched/SR*1000:.0f} ms)")
    print(f"  검산          길이 {len(out)/SR:.3f}초 (그대로) · 달라진 표본"
          f" {d[0]/SR:.4f}~{d[-1]/SR:.4f}초 한 덩어리"
          f" · 그 밖의 모든 자리 완전히 같음"
          f" {np.array_equal(np.delete(out, d), np.delete(cut16, d))}")

    with wave.open(str(src), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(out.astype("<i2").tobytes())
    print(f"→ {src.name}")


if __name__ == "__main__":
    main()
