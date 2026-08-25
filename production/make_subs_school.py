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
MAX = 10          # 한 화면 최대 글자 수 (공백·쉼표 제외).
                  # 요강 「한 화면 당 10자 내외」를 글자 그대로 지킨다. 13 까지
                  # 늘리면 일흔여섯 장으로 줄어 읽기는 편하지만 스물다섯 장이
                  # 10자를 넘는다. 심사에서 지적받을 여지를 남기지 않는다.
MIN_DUR = 0.55    # 너무 빨리 지나가지 않게
GAP = 0.06        # 자막 사이 간격


def nlen(s):
    # 쉼표는 화면에 안 나가므로(show 참조) 글자 수에도 안 센다. 세었더니
    # 「범인은 바로 내 몸속 시한폭탄,」이 13자로 잡혀 막히고, 대신 「시한폭탄」
    # 네 글자만 뜨는 장이 생겼다.
    return len(s.replace(" ", "").replace(",", ""))


TARGET = 11      # 이 정도 길이가 읽기 좋다.
# 8자로 잡았더니 평균 7.6자에 아흔네 장이 되어, 「눈꺼풀은」 「됩니다.」 처럼
# 한 마디만 뜨는 장이 자꾸 생겼다. 읽는 사람이 계속 끊긴다.
MIN_N = 6        # 이보다 짧은 토막은 앞뒤에 붙인다. 벌점을 50 에서 250 으로
                 # 올렸다. 10자로 못박으면 갈 데가 없어 「눈꺼풀은」 「됩니다.」
                 # 같은 장이 열한 개 생기는데, 250 이면 넷으로 준다.

# 이 말들로 줄을 끝내면 다음 줄에 붙을 말을 기다리게 된다
HANG = {"더", "좀", "못", "안", "잘", "또", "막", "바로", "거의", "자꾸", "계속",
        "아주", "매우", "정말", "그런", "이런", "저런", "어떤", "무슨", "새", "첫",
        "한", "두", "세", "단", "이", "그", "저", "왜", "다시", "함께", "가장",
        "내", "제", "우리", "내가", "우리는"}
# 은/는/을 로 끝나지만 조사가 아니라 뒷말을 꾸미는 관형형. 이것들로 줄을 끝내면
# 「집중력을 올리려고 먹은」 / 「달콤한 간식!」 처럼 꾸밈말과 꾸밈받는 말이 갈린다.
# 대본에 나오는 것을 모두 적어 둔다.
# 부사(확연히·거꾸로 같은 것)는 넣지 않는다. 넣었더니 「이」 한 글자짜리 줄이
# 생기는 등 엉뚱한 데가 깨졌다. 뒷말을 직접 꾸미는 용언의 관형형만 적는다.
ADNOM = {"먹은", "낀", "분비된다는", "돌아오는", "쓰는", "소비하는", "만드는",
         "켜두는", "못하는", "소화되는", "지키는", "달콤한", "정제된", "급격한",
         "내보낸", "빼앗긴", "과학적인", "가득한", "필요한"}
HANG |= ADNOM
# 이 말들로 줄을 시작하면 앞말과 떨어져 뜻이 흐려진다
LEAN = {"것", "것이", "것을", "거", "거라고", "거죠", "게", "수", "때", "줄", "뿐",
        "만큼", "대로", "채", "바", "점", "중", "등", "및", "속", "안", "위", "밖"}

BARE = str.maketrans("", "", ",.!?")   # 앞뒤 문장부호를 떼고 견준다
# 한 덩어리로 읽어야 하는 말
TERMS = ["혈당 스파이크", "뇌 세포", "오렉신 스위치", "혈당 크래시", "가짜 피로",
         "거꾸로 식사법", "식후 혈당", "학습 효율", "통곡물이나 견과류",
         "통곡물과 견과류", "정제된 탄수화물", "포도당 농도",
         "안개가 낀", "낀 것처럼", "먹은 달콤한", "달콤한 간식",
         "기면증 환자", "시작해 보세요", "거꾸로 식사법만으로도",
         "소화 과정", "과학적인 식습관", "가짜 피로",
         "깨어있게 만드는", "소비하는 기관이니까요.",
         # 앞뒤가 HANG 에 걸려 「우리가」 세 글자만 0.63초 뜨는 장이 생겼다.
         "우리가 쓰는"]


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
        if end.translate(BARE) not in ADNOM and \
                end.endswith(("는", "은", "을", "를", "에", "와", "과", "도", "만")):
            c -= 6                              # 조사로 끝나면 무난하다. 관형형은 뺀다
        if end.translate(BARE).endswith("의") and len(end.translate(BARE)) > 1:
            c += 20                             # 「의」는 뒷말을 꾸민다. 세게 주면
                                                # 다른 데가 깨져 20 으로 둔다
        if j < len(words) and words[j].translate(BARE) in LEAN:
            c += 70                             # 의존명사를 다음 줄로 넘기지 않는다
        if j < len(words) and words[j].translate(BARE).startswith(tuple(LEAN)) \
                and len(words[j].translate(BARE)) <= 4:
            c += 40                             # 「점입니다」처럼 의존명사로 시작하는 말도
        # 붙여 읽어야 하는 말 사이를 가르지 않는다
        pair = words[j - 1] + " " + words[j] if j < len(words) else ""
        if any(pair in t or t in pair for t in TERMS if " " in t):
            c += 120
    if n < MIN_N:
        c += 250                                # 한 마디만 뜨는 장을 막는다.
                                                # 마지막 줄 할인 뒤에 더해야 한다.
                                                # 앞에 두면 0.35 가 벌점까지 깎아
                                                # 「됩니다.」 같은 장이 남는다
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


def show(p):
    """화면에 내보낼 글자. 쉼표는 뺀다.

    쉼표는 끊을 자리를 고르는 데는 쓸모가 있어(break_cost 에서 -26) 계산이
    끝날 때까지 남겨 두고, 화면에 얹기 직전에만 뗀다. 자막은 장이 바뀌는
    것으로 이미 쉼을 나타내므로 줄 끝의 쉼표는 겹치는 표시다."""
    return re.sub(r"\s+", " ", p.replace(",", " ")).strip()


def split_cue(c):
    parts = [show(x) for x in chunks(c["tx"])]
    if len(parts) == 1:
        return [{**c, "tx": parts[0]}]          # 한 토막이어도 쉼표는 뗀다
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
    print(f"  {MAX}자 초과 {len(bad)}개 · {MIN_DUR}초 미만 {len(short)}개 · 겹침 {len(overlap)}곳")
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
