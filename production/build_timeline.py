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
DISPLAY = [("삼십 분", "30분"), ("단 이 퍼센트", "단 2%"), ("이십 퍼센트", "20%"),
           ("삼 분 과학 소통", "3분 과학 소통")]


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
        start = a + sec["lead"]
        audio.append({"file": str(wav), "at": round(start, 3), "dur": round(d, 3)})
        timing[f"s{i}"] = [round(a, 3), round(b, 3)]

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

    total = script["sections"][-1]["slot"][1]
    timing["total"] = total
    (D / "timeline.json").write_text(json.dumps(
        {"timing": timing, "subs": subs, "audio": audio, "fps": 30},
        ensure_ascii=False, indent=1))

    print(f"총 길이 {total:.1f}s ({int(total//60)}:{total%60:04.1f}) — 기획서 콘티 타임코드 고정")
    for i, (sec, a) in enumerate(zip(script["sections"], audio), 1):
        s, e = sec["slot"]
        print(f"  s{i} 슬롯 {s:6.1f}–{e:6.1f}s | 나레이션 {a['at']:6.2f}s +{a['dur']:5.2f}s "
              f"→ 끝 {a['at']+a['dur']:6.2f}s (여백 {e - a['at'] - a['dur']:.2f}s)")
    print(f"  자막 큐 {len(subs)}개")


if __name__ == "__main__":
    main()
