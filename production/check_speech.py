#!/usr/bin/env python3
"""말소리가 눌린 곳이 없는지 단어 하나하나 재서 확인한다.

쉼을 줄이는 건 괜찮지만 말소리 자체를 줄이면 발음이 뭉개진다.

받아쓰기가 찍어 주는 단어 끝 시각은 뒤따르는 쉼까지 포함한다. 그래서 그
길이를 그대로 견주면 쉼을 줄인 것까지 "말이 짧아졌다" 로 잡힌다. 원본을
그대로 오려 붙인 자리마저 0.57 배로 나왔다. 그래서 단어 창 안에서 실제로
소리가 나는 시간만 세어 견준다.

  python3 check_speech.py
"""
import difflib, pathlib, re, subprocess, sys
import numpy as np
import imageio_ffmpeg
from faster_whisper import WhisperModel

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

D = pathlib.Path(__file__).parent
bare = lambda s: re.sub(r"[^가-힣0-9]", "", s)
LIMIT = 0.75


def main():
    m = WhisperModel("small", device="cpu", compute_type="int8")

    def pcm(f):
        r = subprocess.run([FF, "-v", "error", "-i", str(D / f), "-ac", "1",
                            "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
        return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)

    def voiced(a, t0, t1):
        """그 구간 안에서 실제로 소리가 나는 시간(초). 쉼은 빼고 센다."""
        seg = a[int(t0 * SR):int(t1 * SR)]
        if len(seg) < 480:
            return 0.0
        e = np.abs(seg[:len(seg) // 480 * 480]).reshape(-1, 480).mean(axis=1)
        return float((e > max(0.004, e.max() * 0.10)).sum()) / 100

    def words(f):
        segs, _ = m.transcribe(str(D / f), language="ko",
                               word_timestamps=True, vad_filter=False)
        return [(bare(w.word), w.start, w.end) for s in segs for w in s.words if bare(w.word)]

    bad_all = 0
    for i in (1, 2, 3, 4):
        raw, cut = words(f"audio/raw_s{i}.wav"), words(f"audio/s{i}.wav")
        ar, ac = pcm(f"audio/raw_s{i}.wav"), pcm(f"audio/s{i}.wav")
        A = [w[0] for w in raw]
        B = [w[0] for w in cut]
        sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
        rows = []
        for o, i1, i2, j1, j2 in sm.get_opcodes():
            if o != "equal":
                continue
            for k in range(i2 - i1):
                r, c = raw[i1 + k], cut[j1 + k]
                dr, dc = voiced(ar, r[1], r[2]), voiced(ac, c[1], c[2])
                if dr > 0.12:
                    rows.append((dc / dr, c[1], r[0], dr, dc))
        if not rows:
            print(f"\n=== {i}구간   짝지을 단어를 찾지 못했습니다"); continue
        ratios = np.array([x[0] for x in rows])
        bad = sorted([x for x in rows if x[0] < LIMIT])[:5]
        bad_all += len(bad)
        print(f"\n=== {i}구간   짝지은 단어 {len(rows)}개   "
              f"길이 비율 중앙값 {np.median(ratios):.2f}배   {LIMIT}배 미만 {len(bad)}개")
        for r, at, w, dr, dc in bad:
            print(f"   {at:6.2f}초  「{w}」  원본 {dr:.2f}초 → {dc:.2f}초   {r:.2f}배")

    print("\n" + "=" * 56)
    print("눌린 말소리가 없습니다." if bad_all == 0
          else f"{bad_all} 곳에서 말소리가 눌렸습니다.")
    return 0 if bad_all == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
