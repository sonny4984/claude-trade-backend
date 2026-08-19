#!/usr/bin/env python3
"""교내대회용 자막을 만든다.

공모 요강이 "자막은 한 화면 당 10자 내외"를 요구한다. 지금 자막은 나레이션
문장을 통째로 얹어서 평균 19.9자, 최장 32자다. 이걸 10자 이내로 다시 끊는다.

말소리는 손대지 않는다. 화면에 뜨는 글자만 잘게 나누고, 시간은 글자 수에
비례해 나눠 준다. 나레이션 내용도 순서도 그대로다.

  python3 make_subs_school.py            # timeline_school.json 을 만든다
  python3 make_subs_school.py --check    # 결과만 찍어 본다
"""
import argparse, json, pathlib, re

D = pathlib.Path(__file__).parent
MAX = 10          # 한 화면 최대 글자 수 (공백 제외)
MIN_DUR = 0.55    # 너무 빨리 지나가지 않게
GAP = 0.06        # 자막 사이 간격


def nlen(s):
    return len(s.replace(" ", ""))


TARGET = 8       # 이 정도 길이가 읽기 좋다

# 이 말들로 줄을 끝내면 다음 줄에 붙을 말을 기다리게 된다
HANG = {"더", "좀", "못", "안", "잘", "또", "막", "바로", "거의", "자꾸", "계속",
        "아주", "매우", "정말", "그런", "이런", "저런", "어떤", "무슨", "새", "첫",
        "한", "두", "세", "이", "그", "저", "왜", "다시", "함께", "가장",
        "내", "제", "우리", "내가", "우리는"}
# 이 말들로 줄을 시작하면 앞말과 떨어져 뜻이 흐려진다
LEAN = {"것", "것이", "것을", "거", "거라고", "거죠", "게", "수", "때", "줄", "뿐",
        "만큼", "대로", "채", "바", "점", "중", "등", "및", "속", "안", "위", "밖"}

BARE = str.maketrans("", "", ",.!?")   # 앞뒤 문장부호를 떼고 견준다
# 한 덩어리로 읽어야 하는 말
TERMS = ["혈당 스파이크", "뇌 세포", "오렉신 스위치", "혈당 크래시", "가짜 피로",
         "거꾸로 식사법", "식후 혈당", "학습 효율", "통곡물이나 견과류",
         "통곡물과 견과류", "정제된 탄수화물", "포도당 농도", "인슐린은 포도당을"]


def break_cost(words, i, j, last):
    """words[i:j] 를 한 줄로 뽑을 때의 나쁜 정도. 낮을수록 좋다."""
    line = " ".join(words[i:j])
    n = nlen(line)
    if n > MAX:
        return None
    c = (n - TARGET) ** 2                       # 너무 짧거나 길면 감점
    if last:                                    # 문장 마지막 줄은 짧아도 된다
        c *= 0.35
    else:
        end = words[j - 1]
        if end.endswith((",", ".", "!", "?")):
            c -= 26                             # 문장부호에서 끊으면 좋다
        if end.translate(BARE) in HANG:
            c += 90                             # 수식어로 줄을 끝내지 않는다
        if end.endswith(("는", "은", "을", "를", "의", "에", "와", "과", "도", "만")):
            c -= 6                              # 조사로 끝나면 무난하다
        if j < len(words) and words[j].translate(BARE) in LEAN:
            c += 70                             # 의존명사를 다음 줄로 넘기지 않는다
        if j < len(words) and words[j].translate(BARE).startswith(tuple(LEAN)) \
                and len(words[j].translate(BARE)) <= 4:
            c += 40                             # 「점입니다」처럼 의존명사로 시작하는 말도
        # 붙여 읽어야 하는 말 사이를 가르지 않는다
        pair = words[j - 1] + " " + words[j] if j < len(words) else ""
        if any(pair in t or t in pair for t in TERMS if " " in t):
            c += 120
    return c


def chunks(tx):
    """어절을 10자 이내로 묶는다. 끊을 자리마다 비용을 매겨 가장 싼 조합을 고른다."""
    tx = re.sub(r",(?=\S)", ", ", tx)              # 쉼표 뒤 빠진 공백을 채운다
    words = tx.split()
    N = len(words)
    INF = float("inf")
    best = [INF] * (N + 1); best[0] = 0
    prev = [0] * (N + 1)
    for j in range(1, N + 1):
        for i in range(j):
            c = break_cost(words, i, j, last=(j == N))
            if c is None or best[i] == INF:
                continue
            if best[i] + c < best[j]:
                best[j] = best[i] + c; prev[j] = i
    if best[N] == INF:                             # 10자를 넘는 어절이 있으면 그대로 둔다
        return [tx]
    out, j = [], N
    while j:
        i = prev[j]; out.append(" ".join(words[i:j])); j = i
    return out[::-1]


def split_cue(c):
    parts = chunks(c["tx"])
    if len(parts) == 1:
        return [dict(c)]
    span = c["b"] - c["a"] - GAP * (len(parts) - 1)
    tot = sum(nlen(p) for p in parts)
    out, at = [], c["a"]
    for p in parts:
        d = max(MIN_DUR, span * nlen(p) / tot)
        out.append({"a": round(at, 3), "b": round(at + d, 3), "tx": p})
        at += d + GAP
    # 배분하다 보면 원래 끝을 넘길 수 있다. 넘친 만큼 고르게 당긴다.
    over = out[-1]["b"] - c["b"]
    if over > 0:
        for i, o in enumerate(out):
            o["a"] = round(o["a"] - over * i / len(out), 3)
            o["b"] = round(o["b"] - over * (i + 1) / len(out), 3)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    tl = json.loads((D / "timeline.json").read_text())
    new = []
    for c in tl["subs"]:
        new.extend(split_cue(c))

    bad = [c for c in new if nlen(c["tx"]) > MAX]
    short = [c for c in new if c["b"] - c["a"] < MIN_DUR - 0.01]
    overlap = [(new[i]["tx"], new[i + 1]["tx"])
               for i in range(len(new) - 1) if new[i]["b"] > new[i + 1]["a"] + 1e-6]

    print(f"자막 {len(tl['subs'])}개 → {len(new)}개")
    print(f"  평균 {sum(nlen(c['tx']) for c in new)/len(new):.1f}자 · "
          f"최장 {max(nlen(c['tx']) for c in new)}자")
    print(f"  10자 초과 {len(bad)}개 · {MIN_DUR}초 미만 {len(short)}개 · 겹침 {len(overlap)}곳")
    for c in bad:
        print(f"    초과: {nlen(c['tx'])}자  {c['tx']}")
    for c in short:
        print(f"    짧음: {c['b']-c['a']:.2f}초  {c['tx']}")

    if a.check:
        print()
        for c in new:
            print(f"  {c['a']:7.2f}~{c['b']:7.2f} {c['b']-c['a']:5.2f}s "
                  f"{nlen(c['tx']):2d}자  {c['tx']}")
        return

    tl["subs"] = new
    (D / "timeline_school.json").write_text(
        json.dumps(tl, ensure_ascii=False, indent=1))
    print("→ timeline_school.json")


if __name__ == "__main__":
    main()
