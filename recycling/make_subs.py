#!/usr/bin/env python3
"""영어 자막을 ASS 로 뽑는다.

요강이 요구하는 것
  · 영상 내 모든 대사·설명·자막은 영어
  · 글꼴은 굴림·고딕·명조체만 → 나눔고딕
  · 화면의 1/3(=360px)을 넘지 않고 하단에 삽입
"""
import json, pathlib

W, H = 1920, 1080
FONT_SIZE = 48
MARGIN_V = 62          # 아래에서 띄울 거리
SIDE = 210             # 좌우 여백 — 한 줄이 화면 끝까지 가지 않게

TXT = {
 "1":  "Every day, we throw away countless things at school.",
 "2":  "But where do they really go?",
 "3":  "Let's take a look at the reality of waste and recycling\\Nat Shinjeong Middle School.",
 "4Q": "Q.  Do students recycle well at our school?",
 "4A": "A.  Most students do, but some bottles are not rinsed\\Nand the labels are not removed. I think we can do better.",
 "5":  "Some students throw away plastic bottles\\Nwithout rinsing them or removing their labels.",
 "6":  "Incorrect sorting means that recyclable materials\\Nend up in landfills.",
 "7":  "But this problem is not limited to our school.",
 "8":  "Waste is a global problem.",
 "9":  "What we do at school can make a difference\\Nbeyond our community.",
 "10": "①  Empty completely",
 "11": "②  Rinse with water",
 "12": "③  Remove the label",
 "13": "④  Sort it into the correct recycling bin",
 "14": "As global citizens, change begins with our small habits.",
 "15": "Empty, rinse, remove, and sort!",
 "16": "Let's protect our Earth together,\\Nstarting from our Shinjeong Middle School.",
 "17": "SMALL ACTIONS.  BIG CHANGES.",
 "18": "START WITH SHINJEONG MIDDLE SCHOOL",
}
LEAD, HOLD = 0.25, 0.45   # 말보다 조금 먼저 뜨고 조금 더 머문다


def t(s):
    s = max(0.0, s)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def main():
    T = json.loads(pathlib.Path("build/timeline.json").read_text())
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,NanumGothic,{FONT_SIZE},&H00FFFFFF,&H00FFFFFF,&H64141414,&H64141414,0,0,0,0,100,100,0,0,4,16,0,2,{SIDE},{SIDE},{MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [head]
    prev_b = 0.0
    for i, r in enumerate(T["lines"]):
        a = max(prev_b + 0.05, r["a"] - LEAD)
        b = r["b"] + HOLD
        nxt = T["lines"][i + 1]["a"] - LEAD if i + 1 < len(T["lines"]) else 1e9
        b = min(b, nxt - 0.1)
        lines.append(f"Dialogue: 0,{t(a)},{t(b)},Base,,0,0,0,,{TXT[r['n']]}\n")
        prev_b = b
    p = pathlib.Path("build/subs.ass")
    p.write_text("".join(lines), encoding="utf-8")
    n2 = sum(1 for v in TXT.values() if "\\N" in v)
    print(f"→ {p}  자막 {len(T['lines'])}장 (두 줄짜리 {n2}장)")
    print(f"   글꼴 나눔고딕 {FONT_SIZE}px · 아래에서 {MARGIN_V}px · 좌우 여백 {SIDE}px")
    h2 = FONT_SIZE * 1.35 * 2 + MARGIN_V
    print(f"   두 줄일 때 차지하는 높이 약 {h2:.0f}px — 화면 1/3({H//3}px) 안")


if __name__ == "__main__":
    main()
