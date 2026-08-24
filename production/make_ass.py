#!/usr/bin/env python3
"""자막을 ASS 파일로 뽑는다. 촬영분 위에 덧입히기 위해서다.

scene.html 이 그리는 자막은 그래픽 위에 얹혀 있어서, 그 위에 아이가 찍은
화면을 덮으면 자막이 가려진다. 촬영분이 22.9초나 되어 그동안 자막이 통째로
사라졌다. 그래서 자막은 그래픽에서 빼고, 화면을 다 합친 뒤에 마지막으로
덧입힌다.

모양은 scene.html 의 #sub 규칙을 그대로 옮긴다.
  44px(ASS 로는 53) · 굵기 600 · 자간 -.02em · 안쪽 여백 20/40 · 배경 rgba(6,10,24,.62)
  아래에서 74px

  python3 make_ass.py            # out/자막.ass
"""
import json, pathlib, sys

D = pathlib.Path(__file__).parent
OUT = D / "out" / "자막.ass"
W, H = 1920, 1080
BOTTOM = 74          # scene.html 의 bottom:74px
PAD_V = 25           # 안쪽 여백. 구운 자막이 5px 낮게 앉아 그만큼 올린다


def t(sec):
    sec = max(0.0, sec)
    h, sec = divmod(sec, 3600)
    m, sec = divmod(sec, 60)
    return f"{int(h)}:{int(m):02d}:{sec:05.2f}"


def main():
    subs = json.loads((D / "timeline_school.json").read_text())["subs"]
    OUT.parent.mkdir(exist_ok=True)
    # ASS 의 색은 &HAABBGGRR 이고 알파는 뒤집혀 있다 (00 이 불투명).
    # rgba(6,10,24,.62) → 알파 (1-.62)*255 = 97 = 0x61, 색 BGR = 18 0A 06
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,NanumGothic,53,&H00FFFFFF,&H00FFFFFF,&H61180A06,&H61180A06,0,0,0,0,100,100,-0.9,0,4,14,0,2,60,60,{BOTTOM + PAD_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [head]
    for c in subs:
        tx = c["tx"].replace("\n", "\\N")
        lines.append(f"Dialogue: 0,{t(c['a'])},{t(c['b'])},Base,,0,0,0,,{tx}\n")
    OUT.write_text("".join(lines), encoding="utf-8")
    print(f"→ {OUT.name}  자막 {len(subs)}장")
    return 0


if __name__ == "__main__":
    sys.exit(main())
