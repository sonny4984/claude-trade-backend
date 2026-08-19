#!/usr/bin/env python3
"""잘라 놓은 자막을 실제 말소리에 맞춰 다시 시각을 잡는다.

make_subs_school.py 는 한 문장을 10자 이내로 쪼개면서 시간을 글자 수에 비례해
나눠 줬다. 사람이 말하는 속도는 균일하지 않아서 이렇게 하면 뒤로 갈수록
어긋난다. 짧은 자막 아흔네 장에서는 그 어긋남이 눈에 보인다.

그래서 나레이션을 다시 받아쓰고, 단어마다 찍힌 시각을 조각에 붙인다.
글자는 하나도 바뀌지 않는다. 뜨고 지는 시각만 바뀐다.

  python3 align_subs.py
"""
import difflib, json, pathlib, re, sys

D = pathlib.Path(__file__).parent
LEAD = 0.12      # 말이 시작되기 조금 전에 떠 있어야 읽힌다
HOLD = 0.22      # 말이 끝나고 조금 더 머문다
MIN = 0.75       # 이보다 짧으면 깜빡이는 것처럼 보인다
GAP = 0.05       # 자막 사이 최소 간격


def bare(s):
    return re.sub(r"[^0-9A-Za-z가-힣%]", "", s)


def transcribe(path):
    from faster_whisper import WhisperModel
    m = WhisperModel("medium", device="cpu", compute_type="int8")
    segs, _ = m.transcribe(str(path), language="ko", beam_size=5,
                           word_timestamps=True, vad_filter=False)
    words = []
    for s in segs:
        for w in (s.words or []):
            if bare(w.word):
                words.append((bare(w.word), float(w.start), float(w.end)))
    return words


def main():
    tl = json.loads((D / "timeline_school.json").read_text())
    subs = tl["subs"]

    # 자막을 구간별로 나눠 담는다. 한 장이 두 구간에 걸치지 않게 가장 가까운
    # 구간 하나에만 넣는다.
    buckets = [[] for _ in tl["audio"]]
    for c in subs:
        mid = (c["a"] + c["b"]) / 2
        def dist(a):
            lo, hi = a["at"], a["at"] + a["dur"]
            return 0.0 if lo <= mid <= hi else min(abs(mid - lo), abs(mid - hi))
        buckets[min(range(len(tl["audio"])), key=lambda i: dist(tl["audio"][i]))].append(c)
    seen = sum(len(b) for b in buckets)
    if seen != len(subs):
        sys.exit(f"자막 {len(subs)}개 중 {seen}개만 구간에 담겼다")

    moved = []
    for si, (a, cues) in enumerate(zip(tl["audio"], buckets), 1):
        words = transcribe(a["file"])
        heard = "".join(w[0] for w in words)
        # 들린 글자 → (시작, 끝) 시각
        wpos, at = [], 0
        for w, s, e in words:
            wpos.append((at, at + len(w), s, e)); at += len(w)

        target = "".join(bare(c["tx"]) for c in cues)
        sm = difflib.SequenceMatcher(None, target, heard, autojunk=False)
        # 목표 글자 index → 들린 글자 index
        m2h = {}
        for i, j, n in sm.get_matching_blocks():
            for k in range(n):
                m2h[i + k] = j + k

        def word_at(h):
            for wi, (lo, hi, s, e) in enumerate(wpos):
                if lo <= h < hi:
                    return wi
            return None

        # 조각마다 "들린 글자" 범위를 잡는다. 짝이 맞은 글자만 모아 최소/최대를
        # 쓴다. 짝이 하나도 없으면(받아쓰기가 통째로 틀린 경우) 비워 두고
        # 앞뒤에서 채운다. 예전에는 짝을 못 찾으면 앞쪽으로 훑어 나갔는데,
        # 그러다 이전 문장의 시각을 끌어와 자막이 2초 넘게 당겨지곤 했다.
        pos, span = 0, []
        for c in cues:
            n = len(bare(c["tx"]))
            hs = [m2h[i] for i in range(pos, pos + n) if i in m2h]
            span.append((min(hs), max(hs)) if hs else None)
            pos += n

        # 빈 칸은 앞뒤 사이를 나눠 채운다
        for k, v in enumerate(span):
            if v is not None:
                continue
            lo = next((span[j][1] for j in range(k - 1, -1, -1) if span[j]), 0)
            hi = next((span[j][0] for j in range(k + 1, len(span)) if span[j]),
                      len(heard) - 1)
            span[k] = (min(lo + 1, hi), min(lo + 1, hi))

        # 순서가 뒤집히지 않게 한다
        for k in range(1, len(span)):
            a0, b0 = span[k]
            span[k] = (max(a0, span[k - 1][0]), max(b0, span[k - 1][1]))

        out = []
        for c, (h0, h1) in zip(cues, span):
            wi, wj = word_at(h0), word_at(h1)
            s = wpos[wi][2] if wi is not None else None
            e = wpos[wj][3] if wj is not None else None
            out.append((c, s, e))

        # 구간 시작 시각을 더해 전체 타임라인 위로 옮긴다
        prev_b = None
        for k, (c, s, e) in enumerate(out):
            if s is None or e is None:
                continue                      # 못 찾으면 원래 시각을 둔다
            na = a["at"] + s - LEAD
            nb = a["at"] + e + HOLD
            if prev_b is not None:
                na = max(na, prev_b + GAP)
            # 다음 자막이 시작되기 전까지는 머물러도 된다
            nxt = out[k + 1][1] if k + 1 < len(out) else None
            ceil = (a["at"] + nxt - LEAD - GAP) if nxt is not None else nb + 1.0
            nb = min(max(nb, na + MIN), max(ceil, na + 0.45))
            moved.append(abs(na - c["a"]))
            c["a"], c["b"] = round(na, 3), round(nb, 3)
            prev_b = nb
        print(f"  구간 {si}: 자막 {len(cues)}개 · 받아쓴 단어 {len(words)}개 · "
              f"일치율 {sm.ratio():.3f}")

    dur = [c["b"] - c["a"] for c in subs]
    bad = [c for c in subs if c["b"] - c["a"] < MIN - 0.01]
    ov = sum(1 for i in range(len(subs) - 1) if subs[i]["b"] > subs[i + 1]["a"] + 1e-6)
    print(f"\n옮긴 자막 {len(moved)}개 · 평균 {sum(moved)/len(moved):.2f}초 이동 · "
          f"최대 {max(moved):.2f}초")
    print(f"표시 시간 평균 {sum(dur)/len(dur):.2f}초 · 최소 {min(dur):.2f}초 · "
          f"{MIN}초 미만 {len(bad)}개 · 겹침 {ov}곳")

    (D / "timeline_school.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1))
    print("→ timeline_school.json (시각만 갱신)")


if __name__ == "__main__":
    main()
