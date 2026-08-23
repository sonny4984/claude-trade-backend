#!/usr/bin/env python3
"""영상 + 나레이션 + BGM/효과음을 합성해 최종 납품 mp4 를 만든다.

나레이션이 울릴 때 BGM 을 자동으로 낮추는 사이드체인 더킹을 적용한다.
"""
import argparse, json, pathlib, subprocess, sys
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
OUT = D / "out"
FF = imageio_ffmpeg.get_ffmpeg_exe()
tl = json.loads((D / "timeline.json").read_text())
TOTAL = tl["timing"]["total"]

ap = argparse.ArgumentParser()
ap.add_argument("--video", default=str(OUT / "video_raw.mp4"))
ap.add_argument("--out", default=str(OUT / "혈당스파이크와_뇌과학의_비밀_FHD.mp4"))
ap.add_argument("--bed", default="bed.wav")
# 요강이 "3분 이내" 를 요구한다. 끝을 조금 당겨 끊고 여운을 남긴다.
ap.add_argument("--dur", type=float, default=0, help="이 길이로 끊는다")
ap.add_argument("--fade", type=float, default=0, help="끝에서 이만큼 소리를 줄인다")
args = ap.parse_args()
if args.dur:
    TOTAL = args.dur

vid = pathlib.Path(args.video)
bed = D / "audio" / args.bed
final = pathlib.Path(args.out)

# 나레이션 4트랙을 타임라인 위치에 배치 → 하나의 보이스 트랙으로 합성
inputs = ["-i", str(vid), "-i", str(bed)]
for a in tl["audio"]:
    inputs += ["-i", a["file"]]

parts, mixnames = [], []
for i, a in enumerate(tl["audio"]):
    idx = i + 2
    delay = int(a["at"] * 1000)
    parts.append(f"[{idx}:a]aresample=48000,adelay={delay}|{delay},apad[v{i}]")
    mixnames.append(f"[v{i}]")

fc = ";".join(parts) + ";"
fc += "".join(mixnames) + f"amix=inputs={len(mixnames)}:normalize=0:duration=longest[voiceraw];"
fc += f"[voiceraw]atrim=0:{TOTAL},asetpts=N/SR/TB,alimiter=level_in=1:level_out=0.94:limit=0.95[voice];"
fc += "[voice]asplit=2[voice_out][voice_sc];"
# BGM 을 나레이션으로 더킹
fc += f"[1:a]aresample=48000,atrim=0:{TOTAL},asetpts=N/SR/TB,volume=0.60[bedv];"
fc += "[bedv][voice_sc]sidechaincompress=threshold=0.055:ratio=9:attack=12:release=460:makeup=1[bedduck];"
fc += "[voice_out][bedduck]amix=inputs=2:normalize=0:duration=first[premix];"
fade = (f"afade=t=out:st={TOTAL - args.fade:.3f}:d={args.fade}," if args.fade else "")
# loudnorm 은 표본율을 올려놓는 버릇이 있어 뒤에 48000 을 다시 못박는다
fc += ("[premix]loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000," + fade +
       "alimiter=level_in=1:level_out=0.97:limit=0.98[aout]")

cmd = [FF, "-y", "-loglevel", "error", *inputs,
       "-filter_complex", fc,
       "-map", "0:v", "-map", "[aout]",
       "-c:v", "copy",
       "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
       "-movflags", "+faststart",
       "-t", f"{TOTAL:.3f}", str(final)]

print("합성 중…")
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    sys.stderr.write(r.stderr[-4000:]); raise SystemExit("합성 실패")

probe = subprocess.run([FF, "-hide_banner", "-i", str(final)],
                       capture_output=True, text=True).stderr
print(f"→ {final.name}  {final.stat().st_size/1024/1024:.1f} MB")
for ln in probe.splitlines():
    if "Duration" in ln or "Stream #" in ln:
        print("  " + ln.strip())
