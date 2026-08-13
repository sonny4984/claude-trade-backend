#!/usr/bin/env python3
"""생성된 나레이션을 음성인식으로 역전사해 원본 대본과 대조한다.

TTS 가 한국어를 실제로 정확히 읽었는지 객관적으로 확인하기 위한 QA 단계.
"""
import difflib, json, pathlib, re, sys

D = pathlib.Path(__file__).parent
script = json.loads((D / "script.json").read_text())


def norm(s):
    """비교용 정규화: 공백·문장부호 제거."""
    return re.sub(r"[^가-힣0-9a-zA-Z]", "", s)


def main():
    from faster_whisper import WhisperModel
    size = sys.argv[1] if len(sys.argv) > 1 else "medium"
    print(f"모델 로드: {size}")
    model = WhisperModel(size, device="cpu", compute_type="int8")

    rows = []
    for i, sec in enumerate(script["sections"], 1):
        wav = D / "audio" / f"s{i}.wav"
        segs, _ = model.transcribe(str(wav), language="ko", beam_size=5,
                                   vad_filter=False, condition_on_previous_text=False)
        heard = " ".join(s.text.strip() for s in segs)
        want = sec["narration"]
        ratio = difflib.SequenceMatcher(None, norm(want), norm(heard)).ratio()
        rows.append((i, sec["name"], ratio, want, heard))
        print(f"\n{'='*70}\ns{i} {sec['name']}  일치율 {ratio*100:.1f}%")
        print(f"  [대본] {want[:120]}…")
        print(f"  [인식] {heard[:120]}…")

    print(f"\n{'='*70}")
    avg = sum(r[2] for r in rows) / len(rows)
    print(f"평균 일치율 {avg*100:.1f}%")
    for i, name, ratio, want, heard in rows:
        mark = "OK " if ratio >= 0.85 else ("확인" if ratio >= 0.70 else "불량")
        print(f"  [{mark}] s{i} {name}: {ratio*100:.1f}%")

    # 불일치 구간 상세
    print("\n--- 차이가 큰 구간 ---")
    for i, name, ratio, want, heard in rows:
        if ratio >= 0.93:
            continue
        sm = difflib.SequenceMatcher(None, norm(want), norm(heard))
        for tag, a1, a2, b1, b2 in sm.get_opcodes():
            if tag != "equal" and (a2 - a1 > 2 or b2 - b1 > 2):
                print(f"  s{i} {tag}: 대본«{norm(want)[a1:a2][:40]}» → 인식«{norm(heard)[b1:b2][:40]}»")

    (D / "speech_check.json").write_text(json.dumps(
        [{"section": f"s{i}", "name": n, "ratio": round(r, 4), "heard": h}
         for i, n, r, w, h in rows], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
