#!/usr/bin/env python3
"""문장 단위 속도 균일화.

구간 전체의 평균 속도만 맞추면 문장마다 빠르고 느린 편차가 그대로 남는다.
실제로 핵심 문장("혈당 스파이크입니다", "혈당 크래시입니다")이 오히려 +28%로
빨리 지나가고 짧은 문장은 처졌다.

여기서는 음성인식으로 문장 경계를 찾아 문장마다 따로 속도를 맞추고,
문장 사이 호흡도 문장부호에 맞춰 다시 놓는다. 말소리 자체는 늘이거나 줄일 뿐
잘라내지 않으므로 내용은 그대로다.
"""
import json, re, subprocess, sys, wave
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
HANGUL = re.compile(r"[가-힣]")

TARGET_HINT = 5.90       # 틈 조절용 기준값 — 실제 목표는 슬롯에서 계산한다
KEY_SLOWDOWN = 0.93      # 핵심 문장은 조금 천천히 — 강조는 속도로 준다
TEMPO_LO, TEMPO_HI = 0.82, 1.30
PAUSE_END = 0.31         # 마침표·느낌표 뒤
PAUSE_Q = 0.40           # 물음표 뒤 — 질문은 여운을 준다
PAUSE_KEY = 0.46         # 핵심 문장 앞 호흡
HEAD, TAIL = 0.10, 0.18

KEY = ("혈당 스파이크입니다", "혈당 크래시입니다", "오렉신 스위치가 있습니다",
       "삼분 과학 소통이었습니다")


def load(p):
    raw = subprocess.run([FF, "-v", "error", "-i", str(p), "-f", "s16le",
                          "-ar", str(SR), "-ac", "1", "-"], capture_output=True).stdout
    return np.frombuffer(raw, "<i2").astype(np.float32) / 32768.0


def save(x, p):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def tighten(seg, keep=0.075):
    """문장 안쪽의 미세한 끊김만 줄인다.

    TTS 는 어절 사이에 0.1~0.3초씩 틈을 넣는데, 이걸 둔 채로 속도를 올리면
    말소리까지 같이 빨라져 부자연스럽다. 틈을 먼저 정리하면 훨씬 적은
    속도 보정으로 목표에 닿는다.
    """
    h = int(0.005 * SR)
    n = len(seg) // h
    if n < 4:
        return seg
    rms = np.sqrt(np.maximum(1e-12, np.mean(seg[:n * h].reshape(n, h) ** 2, axis=1)))
    db = 20 * np.log10(np.maximum(rms, 1e-9))
    quiet = db < np.percentile(db, 90) - 24
    out, prev, i = [], 0, 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * 0.005 >= 0.10:
                out.append(seg[prev:i * h])
                out.append(seg[i * h:i * h + int(keep * SR)])
                prev = j * h
            i = j
        else:
            i += 1
    out.append(seg[prev:])
    return np.concatenate(out) if out else seg


def fit_segment(x, st, en, nsyl, ceiling=1.18):
    """문장을 잘라내고, 배속을 과하게 쓰지 않아도 되도록 틈을 조절한다.

    느린 문장을 배속만으로 끌어올리면 그 문장만 가공 티가 난다. 어절 사이
    틈을 조금 더 줄이면 같은 속도에 훨씬 적은 배속으로 닿을 수 있으므로,
    필요한 배속이 ceiling 을 넘지 않는 선에서 틈을 좁혀 나간다.
    """
    seg0 = x[int(st * SR):int(min(en + 0.06, len(x) / SR) * SR)]
    best = None
    for keep in (0.075, 0.060, 0.048, 0.038, 0.030):
        seg = tighten(seg0, keep)
        rate = nsyl / max(0.2, len(seg) / SR)
        best = seg
        if rate * ceiling >= TARGET_HINT:
            break
    return best


def stretch(seg, tempo):
    """말소리 구간의 속도만 바꾼다 (음정은 유지)."""
    if abs(tempo - 1.0) < 0.005 or len(seg) < SR // 20:
        return seg
    p = subprocess.run(
        [FF, "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", f"atempo={tempo:.5f}", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-"],
        input=(np.clip(seg, -1, 1) * 32767).astype("<i2").tobytes(),
        capture_output=True)
    return np.frombuffer(p.stdout, "<i2").astype(np.float32) / 32768.0


def sentence_spans(model, path, narration):
    """대본 문장별 (문장, 시작초, 끝초)."""
    segs, _ = model.transcribe(str(path), language="ko", beam_size=5,
                               vad_filter=False, word_timestamps=True)
    words = [w for s in segs for w in (s.words or [])]
    sents = [s for s in re.split(r"(?<=[.!?])\s+", narration.strip()) if s]
    counts = [len(HANGUL.findall(s)) for s in sents]
    spoken = sum(len(HANGUL.findall(w.word)) for w in words)
    scale = spoken / sum(counts) if counts else 1
    cum = np.cumsum([len(HANGUL.findall(w.word)) for w in words])
    out, start_w, target = [], 0, 0.0
    for s, c in zip(sents, counts):
        target += c * scale
        end_w = min(max(int(np.searchsorted(cum, target, side="left")), start_w),
                    len(words) - 1)
        chunk = words[start_w:end_w + 1]
        start_w = end_w + 1
        if chunk:
            out.append((s, chunk[0].start, chunk[-1].end))
    return out


def main():
    from faster_whisper import WhisperModel
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    script = json.loads(open("script.json").read())["sections"]

    # 1차: 문장 경계와 정리된 말소리 길이를 재서, 네 구간이 모두 슬롯에 들어가는
    # 단일 목표 속도를 구한다. 구간마다 다른 속도를 쓰면 중간에 톤이 바뀌어 들린다.
    prep, need = {}, []
    for i, sec in enumerate(script, 1):
        src = f"audio/raw_s{i}.wav"
        x = load(src)
        spans = sentence_spans(model, src, sec["narration"])
        segs = [fit_segment(x, st, en, len(HANGUL.findall(s)))
                for s, st, en in spans]
        prep[i] = (x, spans, segs)
        syl = sum(len(HANGUL.findall(s)) for s, _, _ in spans)
        speech = sum(len(g) for g in segs) / SR
        nkey = sum(1 for s, _, _ in spans if any(t in s for t in KEY))
        pause = (len(spans) - 1) * PAUSE_END + nkey * PAUSE_KEY + HEAD + TAIL
        slot = sec["slot"][1] - sec["slot"][0]
        room = slot - 0.4 - 0.4
        need.append(syl / max(1.0, room - pause))
    target = max(need)
    print(f"슬롯에 맞는 단일 목표 속도 {target:.2f} 음절/초 "
          f"(구간별 요구 {' '.join(f'{r:.2f}' for r in need)})\n")

    for i, sec in enumerate(script, 1):
        x, spans, segs = prep[i]

        pieces, report = [], []
        pieces.append(np.zeros(int(HEAD * SR), np.float32))
        for k, (s, st, en) in enumerate(spans):
            seg = segs[k]
            n = len(HANGUL.findall(s))
            rate = n / max(0.2, len(seg) / SR)
            is_key = any(t in s for t in KEY)
            want = target * (KEY_SLOWDOWN if is_key else 1.0)
            # atempo 는 값이 클수록 빨라진다 — 느린 문장일수록 큰 값이 필요하다
            tempo = float(np.clip(rate and want / rate, TEMPO_LO, TEMPO_HI))
            out = stretch(seg, tempo)
            if is_key and k > 0:
                pieces.append(np.zeros(int(PAUSE_KEY * SR), np.float32))
            pieces.append(out)
            report.append((s, rate, tempo, n / (len(out) / SR)))
            if k < len(spans) - 1:
                gap = PAUSE_Q if s.rstrip().endswith("?") else PAUSE_END
                pieces.append(np.zeros(int(gap * SR), np.float32))
        pieces.append(np.zeros(int(TAIL * SR), np.float32))
        y = np.concatenate(pieces)
        save(y, f"audio/t{i}.wav")

        # 편차는 '고르게 하려던 문장'끼리만 본다. 핵심 문장의 감속은 의도한 것이고,
        # 아주 짧은 문장은 앞뒤 여운 때문에 실제보다 느리게 측정된다.
        rates = [r[3] for r, (s, _, _) in zip(report, spans)
                 if len(HANGUL.findall(s)) >= 9 and not any(t in s for t in KEY)] \
                or [r[3] for r in report]
        print(f"[{sec['id']}] {len(spans)}문장 · {len(y)/SR:5.1f}s · "
              f"문장 속도 {min(rates):.2f}~{max(rates):.2f} "
              f"(편차 {(max(rates)/min(rates)-1)*100:.1f}%)")
        for s, r0, tp, r1 in report:
            mark = "  ★핵심" if any(t in s for t in KEY) else ""
            print(f"    {r0:5.2f} →{r1:5.2f}  x{tp:.2f}  {s[:38]}{mark}")

    # 톤 정리는 네 구간 모두 동일하게
    print("\n마스터링")
    for i in range(1, 5):
        af = ("highpass=f=85,equalizer=f=250:t=q:w=1.1:g=-1.6,"
              "equalizer=f=3200:t=q:w=1.6:g=2.0,"
              "acompressor=threshold=-19dB:ratio=2.4:attack=10:release=200:makeup=1.5,"
              "loudnorm=I=-16:TP=-1.5:LRA=11")
        subprocess.run([FF, "-y", "-loglevel", "error", "-i", f"audio/t{i}.wav",
                        "-af", af, "-ar", "48000", "-ac", "1", f"audio/s{i}.wav"],
                       check=True)
        d = len(load(f"audio/s{i}.wav")) / SR
        print(f"  s{i} {d:5.1f}s")


if __name__ == "__main__":
    main()
