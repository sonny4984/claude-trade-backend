#!/usr/bin/env python3
"""문장 단위 속도 균일화.

구간 전체의 평균 속도만 맞추면 문장마다 빠르고 느린 편차가 그대로 남는다.
실제로 핵심 문장("혈당 스파이크입니다", "혈당 크래시입니다")이 오히려 +28%로
빨리 지나가고 짧은 문장은 처졌다.

여기서는 음성인식으로 문장 경계를 찾아 문장마다 따로 속도를 맞추고,
문장 사이 호흡도 문장부호에 맞춰 다시 놓는다. 말소리 자체는 늘이거나 줄일 뿐
잘라내지 않으므로 내용은 그대로다.
"""
import json, pathlib, re, subprocess, sys, wave
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
HANGUL = re.compile(r"[가-힣]")

NATURAL_RATE = 5.40      # 편안한 한국어 나레이션 속도. 슬롯이 남아도
                         # 이보다 늦추지 않는다 — 늘어지면 그것도 어색하다.
GAP_MIN = 0.62           # 문장 사이 최소 호흡
FILL = 0.92              # 나레이션이 슬롯에서 차지할 비율. 남는 시간은
                         # 문장 사이에 고르게 나눠 여백이 한쪽에 몰리지 않게 한다.
# 배속은 음색을 건드리지 않는다. 원본 문장 하나를 0.85~1.40 으로 늘여 보고
# 스펙트럼을 원본과 견줘 보니 어느 값에서도 차이가 측정 바닥값에 묻혔다.
# 반면 어절 틈을 잘라 붙이는 방식은 숨소리를 끊어 그대로 들린다.
# 그래서 길이 맞추기는 전부 배속에 맡기고, 대역을 넉넉히 연다.
TEMPO_LO, TEMPO_HI = 0.85, 1.36
PAUSE_KEY = 0.46         # 핵심 문장 앞 호흡
HEAD, TAIL = 0.10, 0.18

GAP_MAX = 1.55       # 여유가 있을 때 문장 사이를 어디까지 벌릴지
SAME_END_GAP = 1.45  # 끝맺음이 겹치는 자리는 그만큼 더 벌린다


def ending(t):
    """문장 끝맺음의 종류. 같은 가락이 잇따르는지 보려는 것뿐이라 거칠게 나눈다."""
    t = t.rstrip(" .!?")
    return "니다" if t.endswith("니다") else t[-1:]


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


def onset(x, t, floor, look=0.40, lead=0.020):
    """t 직전에서 말이 실제로 시작되는 지점을 찾는다.

    인식이 주는 단어 시작 시각은 말이 이미 시작된 뒤를 가리킬 때가 많다.
    그대로 자르면 첫 음절의 앞머리(자음 파열)가 날아가서, 그 음절만
    유난히 빠르고 뭉개진 것처럼 들린다. 파형에서 직접 되짚어 올라간다.
    """
    h = int(0.002 * SR)
    lo = max(int(floor * SR), int((t - look) * SR), 0)
    hi = min(int(t * SR) + h, len(x))
    if hi - lo < h * 3:
        return t
    seg = x[lo:hi]
    n = len(seg) // h
    rms = np.sqrt(np.maximum(1e-12, (seg[:n * h] ** 2).reshape(n, h).mean(1)))
    db = 20 * np.log10(rms)
    # 문장 본문 세기를 기준으로 잡아, 녹음 레벨이 달라도 같게 동작한다
    body = x[int(t * SR):int(min(t + 0.6, len(x) / SR) * SR)]
    ref = 20 * np.log10(max(1e-9, float(np.sqrt(np.mean(body ** 2))))) if len(body) else -30.0
    thr = ref - 26
    k = n - 1
    while k > 0 and db[k] > thr:            # 뒤로 훑어 조용해지는 지점까지 물러난다
        k -= 1
    while k < n - 1 and db[k] <= thr:       # 다시 앞으로 나와 소리가 시작되는 첫 지점
        k += 1
    # 리드는 어느 문장에서나 같아야 한다. 더 물러나면 그만큼 앞에 정적이 붙어
    # 그 문장만 느리게 측정되고, 배속 보정이 한쪽으로 쏠린다.
    return max(floor, (lo + k * h) / SR - lead)


def _tempo_chain(tempo):
    """atempo 는 한 번에 0.5~2.0 까지만 된다. 넘으면 나눠 건다."""
    out = []
    while tempo > 2.0:
        out.append(2.0); tempo /= 2.0
    while tempo < 0.5:
        out.append(0.5); tempo /= 0.5
    out.append(tempo)
    return ",".join(f"atempo={v:.5f}" for v in out)


def _af(seg, af):
    if len(seg) < SR // 100:
        return seg
    p = subprocess.run(
        [FF, "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", af, "-f", "s16le", "-ar", str(SR), "-ac", "1", "-"],
        input=(np.clip(seg, -1, 1) * 32767).astype("<i2").tobytes(), capture_output=True)
    return np.frombuffer(p.stdout, "<i2").astype(np.float32) / 32768.0


def _join(parts, xf=0.008):
    """이음매를 짧게 겹쳐 넘긴다 — 맞대어 붙이면 그 자리가 딱 소리로 들린다."""
    n = int(xf * SR)
    out = parts[0]
    for nxt in parts[1:]:
        m = min(n, len(out), len(nxt))
        if m < 8:
            out = np.concatenate([out, nxt]); continue
        w = np.linspace(0, 1, m, dtype=np.float32)
        tail = out[-m:] * np.cos(w * np.pi / 2)          # 등파워 교차
        head = nxt[:m] * np.sin(w * np.pi / 2)
        out = np.concatenate([out[:-m], tail + head, nxt[m:]])
    return out


def ease_pauses(seg, thresh=0.16, target=0.11):
    """문장 안의 긴 틈만 빠르게 돌려 줄인다.

    예전에는 이 틈을 잘라 붙였다. 그런데 틈의 대부분은 완전한 무음이 아니라
    숨소리와 앞 음절의 여운이 실린 자리여서, 잘라내면 숨이 반토막 나
    목소리가 끊겨 들렸다. 여기서는 아무것도 버리지 않고 그 구간만
    빠르게 돌린다 — 숨은 그대로 있고 길이만 준다.
    """
    h = int(0.005 * SR)
    n = len(seg) // h
    if n < 8:
        return seg
    rms = np.sqrt(np.maximum(1e-12, np.mean(seg[:n * h].reshape(n, h) ** 2, axis=1)))
    db = 20 * np.log10(np.maximum(rms, 1e-9))
    quiet = db < np.percentile(db, 90) - 24
    parts, prev, i = [], 0, 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            L = (j - i) * 0.005
            if L >= thresh:
                parts.append(seg[prev:i * h])
                gap = seg[i * h:j * h]
                parts.append(_af(gap, _tempo_chain(L / target)))
                prev = j * h
            i = j
        else:
            i += 1
    if not parts:
        return seg
    parts.append(seg[prev:])
    return _join([p for p in parts if len(p)])


def edges(seg, ms=0.004):
    """머리·꼬리에 4ms 페이드. 파형이 0 아닌 값에서 시작·끝나면 그 자리가 딱 소리가 된다."""
    n = int(ms * SR)
    if len(seg) < n * 3:
        return seg
    seg = seg.copy()
    w = np.linspace(0, 1, n, dtype=np.float32)
    seg[:n] *= w
    seg[-n:] *= w[::-1]
    return seg


def cut(x, st, en, floor=0.0):
    """문장 하나를 원본 그대로 떼어낸다.

    문장 안의 긴 틈은 ease_pauses 가 배속으로 줄인다. 잘라내지 않는다.
    """
    st = onset(x, st, floor)
    return edges(ease_pauses(x[int(st * SR):int(min(en + 0.06, len(x) / SR) * SR)]))


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
    """대본 문장별 (문장, 시작초, 끝초).

    음절 개수를 비례 배분하면 인식 누락·병합이 한 번만 생겨도 뒤쪽 문장이
    통째로 밀린다. 실제 인식된 글자열과 대본 글자열을 정렬해서 경계를 찾는다.
    """
    import difflib
    segs, _ = model.transcribe(str(path), language="ko", beam_size=5,
                               vad_filter=False, word_timestamps=True)
    words = [w for s in segs for w in (s.words or [])]
    sents = [s for s in re.split(r"(?<=[.!?])\s+", narration.strip()) if s]

    script_chars, sent_of = [], []
    for si, s in enumerate(sents):
        for ch in HANGUL.findall(s):
            script_chars.append(ch); sent_of.append(si)

    heard_chars, word_of = [], []
    for wi, w in enumerate(words):
        for ch in HANGUL.findall(w.word):
            heard_chars.append(ch); word_of.append(wi)

    mapping = {}
    sm = difflib.SequenceMatcher(None, script_chars, heard_chars, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            mapping[a + k] = b + k

    out = []
    for si, s in enumerate(sents):
        idx = [i for i, v in enumerate(sent_of) if v == si and i in mapping]
        if not idx:
            continue
        w0, w1 = word_of[mapping[idx[0]]], word_of[mapping[idx[-1]]]
        out.append((s, words[w0].start, words[w1].end))
    return out


SOURCE = "audio/source.wav"     # 통으로 한 번에 읽은 나레이션. source.mp3 에서 만든다
TARGET_ART = 6.00              # 목표 조음속도(무음 제외). 원본보다 한 단계 느긋하게.


def single_source(model, script):
    """한 번에 통으로 읽은 음원 하나를 문장별로 갈라 구간에 나눠 담는다.

    구간마다 따로 뽑은 음원을 이어 붙이면 아무리 손봐도 이음매가 남는다.
    통으로 읽은 것이 있으면 배속도 영상 전체에 하나만 걸어, 3분 내내
    한 사람의 한 번의 연기 그대로 유지된다.
    """
    x = load(SOURCE)
    flat, owner = [], []
    for i, sec in enumerate(script):
        for t in re.split(r"(?<=[.!?])\s+", sec["narration"].strip()):
            if t:
                flat.append(t); owner.append(i)
    got = {sp[0]: sp for sp in sentence_spans(model, SOURCE, " ".join(flat))}
    missing = [t for t in flat if t not in got]
    if missing:
        raise SystemExit(f"음원에서 못 찾은 문장 {len(missing)}개: {missing[:2]}")

    # 1차: 배속을 걸지 않은 상태로 재서 필요한 배속을 구한다
    segs, floor = [], 0.0
    for t in flat:
        _, st, en = got[t]
        segs.append(cut(x, st, en, floor))
        floor = en + 0.02
    syl = sum(len(HANGUL.findall(t)) for t in flat)
    art = syl / (sum(len(g) for g in segs) / SR)
    tempo = float(np.clip(TARGET_ART / art, TEMPO_LO, TEMPO_HI))

    # 2차: 배속은 문장마다 걸지 않고 파일 전체에 한 번만 건다.
    #      atempo 는 버퍼 앞부분에서 분석창이 덜 찬 상태로 시작해 과도현상이 생긴다.
    #      문장마다 걸면 그 현상이 문장 수만큼 생겨, 첫 단어가 버벅이는 것처럼
    #      들린다. 통으로 한 번 걸면 과도현상도 한 번뿐이고 맨 앞 침묵에 묻힌다.
    xs = stretch(x, tempo)
    out, floor = [], 0.0
    for t in flat:
        _, st, en = got[t]
        out.append(cut(xs, st / tempo, en / tempo, floor))   # 경계도 같은 비율로 옮긴다
        floor = en / tempo + 0.02
    print(f"원본 조음속도 {art:.2f} → {art*tempo:.2f} 음절/초 · "
          f"배속 x{tempo:.3f} (파일 전체에 한 번, 문장별 아님)\n")

    for i, sec in enumerate(script):
        idx = [k for k, o in enumerate(owner) if o == i]
        ss, oo = [flat[k] for k in idx], [out[k] for k in idx]
        speech = sum(len(g) for g in oo) / SR
        # 화면이 자리를 잡는 동안(lead)은 말이 없다. 그만큼 빼고 계산해야
        # 나레이션이 슬롯 끝을 밀고 나가지 않는다.
        slot = sec["slot"][1] - sec["slot"][0] - sec.get("lead", 0.9) - 0.4
        nkey = sum(1 for t in ss if any(z in t for z in KEY))
        # 쉼에는 배수가 붙는다(질문 뒤, 끝맺음이 겹치는 자리). 배수를 빼고
        # 문장 수로만 나누면 실제 길이가 예산을 넘어 슬롯을 밀고 나간다.
        w = [1.18 if t.rstrip().endswith("?") else
             SAME_END_GAP if ending(t) == ending(ss[k + 1]) else 1.0
             for k, t in enumerate(ss[:-1])]
        budget = slot * FILL - speech - HEAD - TAIL - nkey * PAUSE_KEY
        gap = float(np.clip(budget / max(1e-6, sum(w)), GAP_MIN, GAP_MAX))

        pieces = [np.zeros(int(HEAD * SR), np.float32)]
        for k, t in enumerate(ss):
            if any(z in t for z in KEY) and k > 0:
                pieces.append(np.zeros(int(PAUSE_KEY * SR), np.float32))
            pieces.append(oo[k])
            if k < len(ss) - 1:
                g = gap * (1.18 if t.rstrip().endswith("?") else
                           SAME_END_GAP if ending(t) == ending(ss[k + 1]) else 1.0)
                pieces.append(np.zeros(int(g * SR), np.float32))
        pieces.append(np.zeros(int(TAIL * SR), np.float32))
        y = np.concatenate(pieces)
        save(y, f"audio/t{i+1}.wav")
        n = sum(len(HANGUL.findall(t)) for t in ss)
        print(f"[{sec['id']}] {len(ss)}문장 · {len(y)/SR:5.1f}s (말할 수 있는 시간 {slot:.1f}s) · "
              f"{n}음절 · 문장 사이 {gap:.2f}s")


def master():
    """톤 정리는 네 구간 모두 같은 설정으로 — 여기서 갈리면 구간마다 음색이 달라진다."""
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


def main():
    from faster_whisper import WhisperModel
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    script = json.loads(open("script.json").read())["sections"]
    # 받은 원본(mp3)은 저장소에 그대로 두고, 작업용 wav 는 여기서 만든다.
    src_mp3 = pathlib.Path("audio/source.mp3")
    if src_mp3.exists() and not pathlib.Path(SOURCE).exists():
        subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(src_mp3),
                        "-af", "highpass=f=60,volume=0.85", "-ar", str(SR), "-ac", "1",
                        SOURCE], check=True)
        print(f"원본 {src_mp3} → {SOURCE}")

    if pathlib.Path(SOURCE).exists():
        single_source(model, script)
    else:
        per_section(model, script)
    master()


def per_section(model, script):

    # 1차: 문장을 원본 그대로 떼어내 구간별 실제 말 속도를 잰다.
    prep, need = {}, []
    for i, sec in enumerate(script, 1):
        src = f"audio/raw_s{i}.wav"
        x = load(src)
        spans = sentence_spans(model, src, sec.get("narration_full", sec["narration"]))
        # narration_full 은 원본 녹음 순서라 정렬에만 쓰고, 실제로 내보낼 문장과
        # 그 순서는 narration 이 정한다.
        want = [t for t in re.split(r"(?<=[.!?])\s+", sec["narration"].strip()) if t]
        pos = {t: k for k, t in enumerate(want)}
        spans = [sp for sp in spans if sp[0] in pos]
        spans.sort(key=lambda sp: pos[sp[0]])
        missing = [t for t in want if t not in {sp[0] for sp in spans}]
        if missing:
            raise SystemExit(f"{sec['id']}: 원본 음성에서 못 찾은 문장 {missing}")
        segs, floor = [], 0.0
        for s, st, en in spans:
            segs.append(cut(x, st, en, floor))
            floor = en + 0.02
        prep[i] = (spans, segs)

        syl = sum(len(HANGUL.findall(s)) for s, _, _ in spans)
        nkey = sum(1 for s, _, _ in spans if any(t in s for t in KEY))
        pause = (len(spans) - 1) * GAP_MIN + nkey * PAUSE_KEY + HEAD + TAIL
        slot = sec["slot"][1] - sec["slot"][0]
        need.append(syl / max(1.0, slot * FILL - pause))
    target = max(NATURAL_RATE, max(need))
    print(f"목표 속도 {target:.2f} 음절/초 "
          f"(구간별 요구 {' '.join(f'{r:.2f}' for r in need)})\n")

    for i, sec in enumerate(script, 1):
        spans, segs = prep[i]
        syl = sum(len(HANGUL.findall(s)) for s, _, _ in spans)
        raw = syl / max(0.2, sum(len(g) for g in segs) / SR)

        # 배속은 구간에 하나만 건다. 문장마다 따로 걸면 원래 연기가 갖고 있던
        # 문장 사이 완급이 지워져서, 한 사람이 이어 말하는 게 아니라 문장을
        # 따로 녹음해 붙인 것처럼 들린다.
        tempo = float(np.clip(target / raw, TEMPO_LO, TEMPO_HI))
        out = [stretch(g, tempo) for g in segs]

        speech = sum(len(g) for g in out) / SR
        slot = sec["slot"][1] - sec["slot"][0]
        nkey = sum(1 for s, _, _ in spans if any(t in s for t in KEY))
        w = [1.18 if s0.rstrip().endswith("?") else
             SAME_END_GAP if ending(s0) == ending(spans[k + 1][0]) else 1.0
             for k, (s0, _, _) in enumerate(spans[:-1])]
        budget = slot * FILL - speech - HEAD - TAIL - nkey * PAUSE_KEY
        gap_len = float(np.clip(budget / max(1e-6, sum(w)), GAP_MIN, GAP_MAX))

        pieces = [np.zeros(int(HEAD * SR), np.float32)]
        for k, (s, st, en) in enumerate(spans):
            if any(t in s for t in KEY) and k > 0:
                pieces.append(np.zeros(int(PAUSE_KEY * SR), np.float32))
            pieces.append(out[k])
            if k < len(spans) - 1:
                # 강조는 배속이 아니라 호흡으로 준다. 끝맺음이 겹치는 자리는
                # 더 벌려 같은 가락이 잇따르는 느낌을 끊는다.
                g = gap_len
                if s.rstrip().endswith("?"):
                    g *= 1.18
                elif ending(s) == ending(spans[k + 1][0]):
                    g *= SAME_END_GAP
                pieces.append(np.zeros(int(g * SR), np.float32))
        pieces.append(np.zeros(int(TAIL * SR), np.float32))
        y = np.concatenate(pieces)
        save(y, f"audio/t{i}.wav")

        print(f"[{sec['id']}] {len(spans)}문장 · {len(y)/SR:5.1f}s · "
              f"원본 {raw:.2f} → {raw*tempo:.2f} 음절/초 · 배속 x{tempo:.3f} "
              f"(구간 전체 동일) · 문장 사이 {gap_len:.2f}s")

    # 톤 정리는 네 구간 모두 동일하게

if __name__ == "__main__":
    main()
