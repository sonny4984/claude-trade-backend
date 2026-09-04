#!/usr/bin/env python3
"""영어 자막을 ASS 로 뽑는다.

요강이 요구하는 것
  · 영상 내 모든 대사·설명·자막은 영어
  · 글꼴은 굴림·고딕·명조체만 → 나눔고딕
  · 화면의 1/3(=360px)을 넘지 않고 하단에 삽입

자막이 뜨는 시각은 녹음 파일이 시작하는 시각이 아니라
파일 안에서 목소리가 실제로 나오기 시작하는 시각에 맞춘다.
녹음 파일 앞에는 숨소리와 방 소리가 최대 1.6초까지 남아 있어서
파일 시작에 맞추면 자막이 목소리보다 그만큼 먼저 뜬다.
"""
import json, pathlib, subprocess
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

W, H = 1920, 1080
FONT_SIZE = 48
MARGIN_V = 62          # 아래에서 띄울 거리
SIDE = 210             # 좌우 여백 — 한 줄이 화면 끝까지 가지 않게

TXT = {
 "1":  "Every day, we throw away countless things at school.",
 "2":  "But where do they really go?",
 "3":  "Let's take a look at the reality of waste and recycling\\Nat Shinjeong Middle School.",
 "4Q": "Q.  Do students recycle well at our school?",
 "4A": "A.  Most people do a good job, but some plastic bottles\\Nare not rinsed or still have their labels on.\\NI think we can do a little better.",
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

LEAD = 0.04    # 한 프레임. 반올림 때문에 자막이 한 박자 늦게 뜨는 것만 막는다
HOLD = 0.50    # 말이 끝나고 이만큼 더 머문다
CPS  = 17      # 읽는 속도 — 초당 글자 수. 이보다 빨리 지나가지 않게 한다


def voice_span(path):
    """파일 안에서 목소리가 시작하고 끝나는 자리를 잰다.

    큰 소리(hi)로 먼저 말의 한복판을 찾고, 거기서 앞뒤로 되짚어 나가면서
    방 소리(lo)보다 큰 동안 계속 늘린다. 되짚지 않으면 s·f 같은
    바람 소리로 시작하는 줄에서 첫 자음이 잘린다(13번 75ms, 17번 105ms).
    """
    raw = subprocess.run([FF, "-v", "error", "-i", path, "-ac", "1",
                          "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    h = SR // 200                                   # 5ms 창
    n = len(x) // h
    e = np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(axis=1))

    peak = e.max()
    floor = np.median(np.sort(e)[:max(4, n // 5)])  # 조용한 쪽 20%가 방 소리
    hi = max(peak * 0.10, 0.008)
    lo = max(floor * 3.0, peak * 0.02)

    i = int(np.argmax(e > hi))
    j = n - 1 - int(np.argmax(e[::-1] > hi))
    while i > 0 and e[i - 1] > lo:
        i -= 1
    while j < n - 1 and e[j + 1] > lo:
        j += 1
    return i * h / SR, (j + 1) * h / SR


def t(s):
    s = max(0.0, s)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def main():
    T = json.loads(pathlib.Path("build/timeline.json").read_text())

    # 줄마다 목소리가 실제로 나오는 시각을 잰다
    span = []
    for r in T["lines"]:
        on, off = voice_span(f"build/nar/{r['n']}.wav")
        span.append((r["a"] + on, r["a"] + off, on))

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
    rows = []
    prev_b = 0.0
    for i, r in enumerate(T["lines"]):
        vs, ve, lag = span[i]
        nxt = span[i + 1][0] - LEAD if i + 1 < len(span) else 1e9

        a = max(prev_b + 0.05, vs - LEAD)
        chars = len(TXT[r["n"]].replace("\\N", " "))
        b = max(ve + HOLD, a + chars / CPS)         # 읽을 시간은 남겨 둔다
        b = min(b, nxt - 0.1)                       # 다음 자막과 겹치지 않게

        lines.append(f"Dialogue: 0,{t(a)},{t(b)},Base,,0,0,0,,{TXT[r['n']]}\n")
        rows.append((r["n"], r["a"], a, vs, lag, b - a))
        prev_b = b

    p = pathlib.Path("build/subs.ass")
    p.write_text("".join(lines), encoding="utf-8")

    print(f"→ {p}  자막 {len(rows)}장")
    print(f"{'줄':>4} {'파일시작':>8} {'자막':>8} {'목소리':>8} {'앞여백':>7} {'떠있는시간':>9}")
    for n, fa, a, vs, lag, dur in rows:
        print(f"{n:>4} {fa:8.2f} {a:8.2f} {vs:8.2f} {lag:7.2f} {dur:9.2f}")
    gap = max(abs(a - vs) for _, _, a, vs, _, _ in rows)
    print(f"\n자막과 목소리가 어긋난 최대 폭 {gap*1000:.0f}ms "
          f"(30프레임 한 장 {1000/30:.0f}ms)")
    tight = min((dur / (len(TXT[n].replace("\\N", " ")) / CPS), n)
                for n, _, _, _, _, dur in rows)
    print(f"읽을 시간이 가장 빡빡한 줄 {tight[1]}번 — 필요한 시간의 {tight[0]:.2f}배"
          f" ({'모자란 줄 없음' if tight[0] >= 1 else '모자람'})")
    n2 = sum(1 for v in TXT.values() if "\\N" in v)
    print(f"글꼴 나눔고딕 {FONT_SIZE}px · 아래에서 {MARGIN_V}px · 좌우 여백 {SIDE}px "
          f"· 두 줄 이상 {n2}장")


if __name__ == "__main__":
    main()
