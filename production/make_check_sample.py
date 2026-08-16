#!/usr/bin/env python3
"""검수용 샘플을 만든다.

3분을 통으로 듣지 않고도 확인할 수 있도록, 지적받았던 문장 경계만
모아 붙인 것을 따로 만든다. 각 경계는 앞 문장 끝 1.2초 + 다음 문장 앞
1.8초만 잘라내, 문제가 있었다면 그 자리에서 바로 들린다.
"""
import json, re, subprocess, sys
import numpy as np
import wave

sys.path.insert(0, ".")
from pace import SR

D = "."
FF = "/usr/local/bin/ffmpeg"
tl = json.load(open("timeline.json"))
script = json.load(open("script.json"))["sections"]

# 지적받았던 자리 — 앞 문장 끝에 다음 문장 앞머리가 딸려 들어가던 9곳
WATCH = ["밤 열한시", "무거워집니다", "달콤한 간식", "확인하게 됩니다",
         "문제가 아닙니다", "기관이니까요", "오늘의 결론", "탄수화물 순서로",
         "집중력을 원한다면"]


def rd(p):
    w = wave.open(p)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def sents(t):
    return [s for s in re.split(r"(?<=[.!?])\s+", t.strip()) if s]


def sentence_ends(x, n):
    """무음으로 갈라 문장 경계 시각을 얻는다 (앞뒤 여백 제외)."""
    h = int(SR * 0.005)
    m = len(x) // h
    db = 20 * np.log10(np.sqrt(np.maximum(1e-12, (x[:m * h] ** 2).reshape(m, h).mean(1))))
    quiet = db < -46
    runs, c = [], 0
    for i, v in enumerate(quiet):
        if v:
            c += 1
        else:
            if c * 0.005 >= 0.30:
                runs.append(((i - c) * 0.005, i * 0.005))
            c = 0
    return runs[:n]


clips = []
for i, sec in enumerate(script, 1):
    x = rd(f"audio/s{i}.wav")
    ss = sents(sec["narration"])
    gaps = sentence_ends(x, len(ss) - 1)
    for k, (a, b) in enumerate(gaps):
        if k >= len(ss) - 1:
            break
        if not any(w in ss[k] for w in WATCH):
            continue
        lo = max(0, int((a - 1.2) * SR))
        hi = min(len(x), int((b + 1.8) * SR))
        seg = x[lo:hi].copy()
        f = int(SR * 0.02)
        if len(seg) > f * 3:
            seg[:f] *= np.linspace(0, 1, f)
            seg[-f:] *= np.linspace(1, 0, f)
        clips.append(seg)
        clips.append(np.zeros(int(SR * 0.9), np.float32))   # 경계 사이 간격

if clips:
    y = np.concatenate(clips)
    with wave.open("out/샘플_5_문장경계_검사.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", "out/샘플_5_문장경계_검사.wav",
                    "-c:a", "libmp3lame", "-b:a", "192k",
                    "out/샘플_5_문장경계_검사.mp3"], check=True)
    import os
    os.remove("out/샘플_5_문장경계_검사.wav")
    print(f"→ 샘플_5_문장경계_검사.mp3  {len(y)/SR:.1f}초 · 경계 {len(clips)//2}곳")
else:
    print("경계를 찾지 못했습니다")
