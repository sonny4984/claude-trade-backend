#!/usr/bin/env python3
"""아이가 찍은 화면을 그래픽 영상 위에 끼워 넣는다.

cuts.json 의 표를 그대로 따른다. 클립이 더 오면 그 표에 줄만 더하면 된다.

휴대폰으로 찍은 화면은 커튼과 형광등 때문에 밝고 누렇다. 그래픽 쪽은 밤을
그린 남색이라 그냥 붙이면 장면이 튄다. 그래서 밝기를 조금 낮추고 색을
푸른 쪽으로 밀어 두 화면이 같은 밤으로 보이게 맞춘다.

  python3 insert_clips.py --base out/g33.mp4 --out out/sample.mp4 --dur 33
"""
import argparse, json, pathlib, subprocess, sys
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
UP = pathlib.Path("/root/.claude/uploads/9bc329f1-9649-5e79-9d0d-26f445e4d774")


def find(name):
    hits = sorted(UP.glob(f"*{name}.*"))
    if not hits:
        raise SystemExit(f"{name} 을 찾지 못했습니다")
    return hits[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=str(D / "out" / "g33.mp4"))
    ap.add_argument("--out", default=str(D / "out" / "sample.mp4"))
    ap.add_argument("--dur", type=float, default=0)
    a = ap.parse_args()

    cfg = json.loads((D / "cuts.json").read_text())
    grade = cfg["grade"]
    cuts = [c for c in cfg["cuts"] if not a.dur or c["at"] < a.dur]
    if not cuts:
        raise SystemExit("이 길이 안에 넣을 화면이 없습니다")

    ins = ["-i", a.base]
    for c in cuts:
        ins += ["-i", str(find(c["clip"]))]

    parts, chain, prev = [], [], "[0:v]"
    for i, c in enumerate(cuts, start=1):
        n = min(c["to"], a.dur) if a.dur else c["to"]
        span = round(n - c["at"], 3)
        # 클립에서 쓸 구간만 잘라, 영상 시각 c["at"] 자리로 옮긴다
        parts.append(
            f"[{i}:v]trim=start={c['from']}:duration={span},setpts=PTS-STARTPTS+{c['at']}/TB,"
            f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
            f"{grade},format=yuv420p[c{i}]")
        out = f"[o{i}]"
        chain.append(f"{prev}[c{i}]overlay=0:0:enable='between(t,{c['at']},{n})'{out}")
        prev = out

    fc = ";".join(parts + chain)
    cmd = [FF, "-y", "-loglevel", "error", *ins,
           "-filter_complex", fc, "-map", prev,
           "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"]
    if a.dur:
        cmd += ["-t", f"{a.dur:.3f}"]
    cmd.append(a.out)

    print(f"화면 {len(cuts)}컷을 끼워 넣습니다")
    for c in cuts:
        print(f"  {c['at']:6.2f} ~ {c['to']:6.2f}초   {c['clip']}  ({c['line']})")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:]); raise SystemExit("합성 실패")
    p = pathlib.Path(a.out)
    print(f"→ {p.name}  {p.stat().st_size/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
