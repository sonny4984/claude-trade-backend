#!/usr/bin/env python3
"""씬 타이밍과 자막 큐 생성.

섹션 경계는 기획서 콘티의 타임코드를 그대로 쓴다(고정 슬롯). 나레이션은 슬롯 안에서
lead 만큼 늦게 시작하고, 남는 뒤쪽 여백이 다음 섹션으로 넘어가는 호흡이 된다.
"""
import json, re, subprocess, pathlib
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
MAXLEN = 34

# 나레이션은 TTS 가 정확히 읽도록 숫자를 한글로 풀어 쓰지만, 화면 자막은 숫자로 보여준다.
DISPLAY = [("밤 열한시", "밤 11시"), ("삼십분 뒤", "30분 뒤"),
           ("단 이퍼센트", "단 2%"), ("이십퍼센트를", "20%를"),
           ("삼분 과학 소통", "3분 과학 소통"), ("뇌세포", "뇌 세포"),
           ("오렉신세포", "오렉신 세포")]


def to_display(t):
    for a, b in DISPLAY:
        t = t.replace(a, b)
    return t


def dur(p):
    out = subprocess.run([FF, "-i", str(p), "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    h, mm, ss = m[-1]
    return int(h) * 3600 + int(mm) * 60 + float(ss)


def split_subs(text):
    """문장 → 자막 단위. 문장부호 우선, 길면 쉼표·어절로 재분할."""
    out = []
    for p in re.split(r"(?<=[.!?])\s+", text.strip()):
        p = p.strip()
        if not p:
            continue
        if len(p) <= MAXLEN:
            out.append(p)
            continue
        chunks, cur = [], ""
        for seg in re.split(r"(?<=,)\s*", p):
            if len(cur) + len(seg) <= MAXLEN or not cur:
                cur += seg
            else:
                chunks.append(cur.strip())
                cur = seg
        if cur.strip():
            chunks.append(cur.strip())
        for c in chunks:
            if len(c) <= MAXLEN + 8:
                out.append(c)
            else:
                cur = ""
                for w in c.split(" "):
                    if len(cur) + len(w) + 1 <= MAXLEN or not cur:
                        cur = (cur + " " + w).strip()
                    else:
                        out.append(cur)
                        cur = w
                if cur:
                    out.append(cur)
    return out


def main():
    script = json.loads((D / "script.json").read_text())
    timing, subs, audio = {}, [], []

    for i, sec in enumerate(script["sections"], 1):
        wav = D / "audio" / f"s{i}.wav"
        d = dur(wav)
        a, b = sec["slot"]
        # 나레이션이 길면 앞 여백을 줄여서라도 슬롯 안에 들어오게 한다
        start = a + min(sec["lead"], max(0.2, (b - a) - d - 0.4))
        audio.append({"file": str(wav), "at": round(start, 3), "dur": round(d, 3)})
        timing[f"s{i}"] = [round(a, 3), round(b, 3)]
        # 화면 연출은 슬롯이 아니라 나레이션 구간에 맞춰 진행시킨다.
        timing[f"n{i}"] = [round(start, 3), round(d, 3)]

        lines = split_subs(sec["narration"])
        total = sum(len(x) for x in lines)
        c = start
        for ln in lines:
            span = d * len(ln) / total          # 시간 배분은 실제 발화 텍스트 기준
            subs.append({"a": round(c, 3), "b": round(c + span - 0.06, 3),
                         "tx": to_display(ln)})
            c += span
        if c > b + 0.35:
            print(f"  ⚠ s{i} 나레이션이 슬롯을 {c - b:.2f}s 초과합니다")

    # 연출 타이밍은 해당 말이 끝나는(또는 시작하는) 지점에서 직접 뽑는다.
    # 대본이 바뀌어도 그림이 말과 어긋나지 않도록 자막에서 계산한다.
    beats = {}

    def frac(nkey, keyword, default, edge="b"):
        """nkey 구간 안에서 keyword 가 든 자막의 위치를 0~1 진행도로 돌려준다."""
        n = timing.get(nkey)
        if not n:
            return default
        lo, hi = n[0], n[0] + n[1]
        for s in subs:
            if lo - 0.3 <= s["a"] <= hi + 0.5 and keyword in s["tx"]:
                return round(min(1.0, max(0.0, (s[edge] - n[0]) / n[1])), 4)
        return default

    beats["peak"] = frac("n2", "끌어올리", 0.24)
    beats["trough"] = frac("n2", "곤두박질", 0.68)
    # 심화부: "강제로 꺼집니다" 를 말하는 순간 스위치가 내려가고,
    #         "반면" 에서 비교 그래프가 올라온다.
    beats["off"] = frac("n3", "꺼집니다", 0.40)
    beats["ev"] = frac("n3", "기면증", 0.55, edge="a")
    beats["cmp"] = frac("n3", "반면", 0.71, edge="a")
    # 결론: 카드뉴스 → 거꾸로 식사법 → 마무리 카드
    beats["cards"] = frac("n4", "간식은", 0.05, edge="a")
    beats["flip"] = frac("n4", "거꾸로", 0.29, edge="a")
    beats["end"] = frac("n4", "시작해", 0.90)
    print("  연출 비트 " + " · ".join(f"{k} {v:.3f}" for k, v in beats.items()) + " (자막 기준)")

    total = script["sections"][-1]["slot"][1]
    timing["total"] = total
    (D / "timeline.json").write_text(json.dumps(
        {"timing": timing, "subs": subs, "audio": audio, "beats": beats, "fps": 30},
        ensure_ascii=False, indent=1))

    print(f"총 길이 {total:.1f}s ({int(total//60)}:{total%60:04.1f}) — 기획서 콘티 타임코드 고정")
    for i, (sec, a) in enumerate(zip(script["sections"], audio), 1):
        s, e = sec["slot"]
        print(f"  s{i} 슬롯 {s:6.1f}–{e:6.1f}s | 나레이션 {a['at']:6.2f}s +{a['dur']:5.2f}s "
              f"→ 끝 {a['at']+a['dur']:6.2f}s (여백 {e - a['at'] - a['dur']:.2f}s)")
    print(f"  자막 큐 {len(subs)}개")


if __name__ == "__main__":
    main()
