#!/usr/bin/env python3
"""타임라인의 자막 큐를 SRT 파일로 내보낸다 (영상에 이미 번인되어 있으나, 편집·재활용용)."""
import json, pathlib

D = pathlib.Path(__file__).parent
tl = json.loads((D / "timeline.json").read_text())


def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


lines = []
for i, s in enumerate(tl["subs"], 1):
    lines += [str(i), f"{ts(s['a'])} --> {ts(s['b'])}", s["tx"], ""]

out = D / "out" / "혈당스파이크와_뇌과학의_비밀.srt"
out.write_text("\n".join(lines), encoding="utf-8")
print(f"→ {out.name}  ({len(tl['subs'])}개 자막)")
