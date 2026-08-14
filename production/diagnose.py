#!/usr/bin/env python3
"""나레이션 전수 진단.

들어서 판단할 수 없으니 수치로 찾는다. 음성인식으로 단어 위치를 얻은 뒤
대본 문장에 맞춰, 문장마다 속도가 튀는 곳·쉼이 엉뚱한 데 들어간 곳·
끝맺음이 늘어지거나 잘린 곳을 뽑아낸다.
"""
import json, re, subprocess, sys
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
HANGUL = re.compile(r"[가-힣]")


def load(p):
    raw = subprocess.run([FF, "-v", "error", "-i", p, "-f", "s16le",
                          "-ar", str(SR), "-ac", "1", "-"], capture_output=True).stdout
    return np.frombuffer(raw, "<i2").astype(np.float32) / 32768.0


def gaps(x, min_len=0.06):
    """실제 무음 구간 (시작, 끝, 길이)."""
    h = int(0.005 * SR)
    n = len(x) // h
    rms = np.sqrt(np.maximum(1e-12, np.mean(x[:n * h].reshape(n, h) ** 2, axis=1)))
    db = 20 * np.log10(np.maximum(rms, 1e-9))
    quiet = db < np.percentile(db, 92) - 24
    out, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            L = (j - i) * 0.005
            if L >= min_len:
                out.append((i * 0.005, j * 0.005, L))
            i = j
        else:
            i += 1
    return out


def main():
    from faster_whisper import WhisperModel
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    script = json.loads(open("script.json").read())["sections"]

    print("=" * 78)
    print("문장별 속도 — 같은 구간 안에서 튀는 문장을 찾는다")
    print("=" * 78)
    all_rates, problems = [], []

    for i, sec in enumerate(script, 1):
        f = f"audio/s{i}.wav"
        segs, _ = model.transcribe(f, language="ko", beam_size=5,
                                   vad_filter=False, word_timestamps=True)
        words = [w for s in segs for w in (s.words or [])]
        if not words:
            continue
        x = load(f)
        g = gaps(x, 0.16)          # 귀에 들리는 정도의 쉼만

        # 인식된 단어를 대본 문장에 순서대로 배분
        sents = [s for s in re.split(r"(?<=[.!?])\s+", sec["narration"].strip()) if s]
        counts = [len(HANGUL.findall(s)) for s in sents]
        total = sum(counts)
        spoken = sum(len(HANGUL.findall(w.word)) for w in words)
        scale = spoken / total if total else 1

        # 인식 단어의 누적 음절수가 대본 문장의 누적 음절수를 넘어서는 지점에서 끊는다.
        # 비례 배분은 인식 누락·병합이 있으면 뒤로 갈수록 어긋난다.
        wsyl = [len(HANGUL.findall(w.word)) for w in words]
        cum = np.cumsum(wsyl)
        rows, start_w = [], 0
        target = 0.0
        for s, c in zip(sents, counts):
            target += c * scale
            end_w = int(np.searchsorted(cum, target, side="left"))
            end_w = min(max(end_w, start_w), len(words) - 1)
            chunk = words[start_w:end_w + 1]
            start_w = end_w + 1
            if not chunk:
                continue
            st, en = chunk[0].start, chunk[-1].end
            dur = max(0.15, en - st)
            rows.append((s, c, st, en, c / dur))
        rates = [r[4] for r in rows]
        med = float(np.median(rates))
        all_rates.append(med)

        print(f"\n[{sec['id']}] {sec['name']}  중앙값 {med:.2f} 음절/초")
        for s, c, st, en, r in rows:
            dev = (r / med - 1) * 100
            flag = ""
            if abs(dev) >= 22:
                flag = "  ← 속도 튐"
                problems.append((sec["id"], st, f"{'빠름' if dev>0 else '느림'} {dev:+.0f}%", s[:34]))
            print(f"  {st:6.2f}s {r:5.2f} ({dev:+5.0f}%) {s[:40]}{flag}")

        # 문장 경계가 아닌 곳의 긴 쉼
        bounds = [r[3] for r in rows[:-1]]
        for a, b, L in g:
            if L >= 0.26 and all(abs(a - bd) > 0.45 for bd in bounds):
                problems.append((sec["id"], a, f"문장 중간 쉼 {L:.2f}s", ""))

    print("\n" + "=" * 78)
    print("구간별 중앙 속도:", "  ".join(f"{r:.2f}" for r in all_rates),
          f"→ 편차 {(max(all_rates)/min(all_rates)-1)*100:.1f}%")
    print("=" * 78)
    print(f"\n발견된 문제 {len(problems)}건")
    for sid, t, kind, txt in sorted(problems, key=lambda p: (p[0], p[1])):
        print(f"  [{sid}] {t:6.2f}s  {kind:18s} {txt}")


if __name__ == "__main__":
    main()
