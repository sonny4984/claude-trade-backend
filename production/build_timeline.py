#!/usr/bin/env python3
"""오디오 실제 길이를 측정해 씬 타이밍과 자막 큐를 만든다."""
import json, re, subprocess, sys, pathlib
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()

def dur(p):
    out = subprocess.run([FF, "-i", str(p), "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    if not m:
        raise SystemExit(f"duration not found for {p}")
    h, mm, ss = m[-1]
    return int(h) * 3600 + int(mm) * 60 + float(ss)

# 자막 한 줄 최대 길이(한글 기준). 너무 길면 두 줄로 접힌다.
MAXLEN = 34

def split_subs(text):
    """문장 → 자막 단위로 분할. 문장부호 우선, 길면 어절 단위로 재분할."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(p) <= MAXLEN:
            out.append(p)
            continue
        # 쉼표 기준 병합 분할
        chunks, cur = [], ""
        for seg in re.split(r"(?<=,)\s*", p):
            if len(cur) + len(seg) <= MAXLEN or not cur:
                cur += seg
            else:
                chunks.append(cur.strip())
                cur = seg
        if cur.strip():
            chunks.append(cur.strip())
        # 그래도 길면 어절로 자름
        for c in chunks:
            if len(c) <= MAXLEN + 8:
                out.append(c)
            else:
                words, cur = c.split(" "), ""
                for w in words:
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
    HEAD, GAP, TAIL = 1.6, 1.1, 2.6   # 인트로 여백 / 섹션 간 호흡 / 엔딩 여백
    t = HEAD
    timing, subs, audio = {}, [], []
    for i, sec in enumerate(script["sections"], 1):
        wav = D / "audio" / f"s{i}.wav"
        d = dur(wav)
        start = t
        audio.append({"file": str(wav), "at": round(start, 3), "dur": round(d, 3)})
        # 자막 큐: 글자 수 비례 배분
        lines = split_subs(sec["narration"])
        total = sum(len(x) for x in lines)
        c = start
        for ln in lines:
            span = d * len(ln) / total
            subs.append({"a": round(c, 3), "b": round(c + span - 0.06, 3), "tx": ln})
            c += span
        end = start + d
        timing[f"s{i}"] = [round(start - (0.9 if i == 1 else GAP * 0.55), 3), round(end + GAP * 0.55, 3)]
        t = end + GAP
    total = round(t - GAP + TAIL, 3)
    timing["s1"][0] = 0.0
    timing["s4"][1] = total
    timing["total"] = total
    out = {"timing": timing, "subs": subs, "audio": audio, "fps": 30}
    (D / "timeline.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"total = {total:.2f}s ({int(total//60)}:{total%60:04.1f})")
    for i, a in enumerate(audio, 1):
        print(f"  s{i}: {a['at']:6.2f}s +{a['dur']:5.2f}s")
    print(f"  자막 큐 {len(subs)}개")

if __name__ == "__main__":
    main()
