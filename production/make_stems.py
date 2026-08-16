#!/usr/bin/env python3
"""편집기에서 마무리할 수 있도록 소리를 갈라 내보낸다.

영상·나레이션·배경음악을 각각 정확히 같은 길이로 뽑는다. 편집기 타임라인
0:00 에 셋을 나란히 놓기만 하면 지금 상태가 그대로 재현되므로, 맞추는
작업 없이 바로 귀로 듣고 조정할 수 있다.
"""
import json, pathlib, subprocess
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = D / "out" / "편집용"
OUT.mkdir(parents=True, exist_ok=True)
tl = json.loads((D / "timeline.json").read_text())
T = tl["timing"]["total"]
NAMES = ["도입부", "전개부", "심화부", "결론"]


def run(args):
    subprocess.run([FF, "-y", "-loglevel", "error", *args], check=True)


# 나레이션 — 타임라인 위치 그대로 담은 전체 길이 트랙
inp, parts, mix = [], [], []
for i, a in enumerate(tl["audio"]):
    inp += ["-i", a["file"]]
    d = int(a["at"] * 1000)
    parts.append(f"[{i}:a]aresample=48000,adelay={d}|{d},apad[v{i}]")
    mix.append(f"[v{i}]")
fc = ";".join(parts) + ";" + "".join(mix)
fc += f"amix=inputs={len(mix)}:normalize=0:duration=longest[m];"
fc += f"[m]atrim=0:{T},asetpts=N/SR/TB,loudnorm=I=-16:TP=-1.5:LRA=11[a]"
run([*inp, "-filter_complex", fc, "-map", "[a]",
     "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "48000", "-ac", "1",
     "-t", f"{T:.3f}", str(OUT / "나레이션만_180초.mp3")])

# 배경음악·효과음 — 나레이션보다 한 단계 낮게
run(["-i", str(D / "audio" / "bed.wav"),
     "-af", f"atrim=0:{T},asetpts=N/SR/TB,volume=0.60,"
            "loudnorm=I=-20:TP=-2.0:LRA=11",
     "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "48000", "-ac", "2",
     "-t", f"{T:.3f}", str(OUT / "배경음악_효과음_180초.mp3")])

# 화면만
run(["-i", str(D / "out" / "video_raw.mp4"), "-an",
     "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-tune", "animation",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart",
     "-t", f"{T:.3f}", str(OUT / "영상_소리없음.mp4")])

L = ["영상 편집기에서 마무리하기", "=" * 58, "",
     f"보낸 파일 3개는 전부 정확히 {T:.3f}초입니다.",
     "편집기 타임라인 0:00 에 셋 다 나란히 놓기만 하면 지금 상태 그대로가 됩니다.",
     "",
     "  1. 영상_소리없음.mp4          → 영상 트랙",
     "  2. 나레이션만_180초.mp3       → 오디오 트랙 1",
     "  3. 배경음악_효과음_180초.mp3  → 오디오 트랙 2",
     "",
     "말이 이르거나 늦게 느껴지면 나레이션 트랙만 좌우로 미세하게 밀면 됩니다.",
     "전체를 미는 게 아니라 한 구간만 옮기고 싶으면 아래 지점에서 자르세요.",
     "", "-" * 58, "구간별 나레이션 위치", "-" * 58]
for a, nm in zip(tl["audio"], NAMES):
    s, e = a["at"], a["at"] + a["dur"]
    L.append(f"  {nm:5} {int(s//60)}:{s%60:05.2f} ~ {int(e//60)}:{e%60:05.2f}"
             f"   (길이 {a['dur']:.2f}초)")
L += ["", "-" * 58, "현재 잡아둔 값", "-" * 58,
      "  나레이션  -16 LUFS",
      "  배경음악  -20 LUFS (나레이션보다 낮게 깔았습니다)",
      "  합치면    -14 LUFS 정도가 됩니다. 유튜브 기준입니다.",
      "",
      "배경음악이 크게 느껴지면 그 트랙만 -3dB 정도 내리세요.",
      "말이 묻히면 나레이션을 +1~2dB 올리는 게 음악을 더 내리는 것보다 낫습니다.",
      "", "-" * 58, "추천 편집기 (LG 그램 · 전부 무료)", "-" * 58,
      "  캡컷 데스크톱  가장 쉽습니다. 한국어이고, 파일 끌어다 놓고 밀기만 하면 됩니다.",
      "                 이 작업에는 이걸로 충분합니다.",
      "  다빈치 리졸브  더 전문적이지만 그램에서는 무거울 수 있습니다.",
      "  클로바더빙     영상을 올리고 더빙을 타임라인에 얹는 기능이 있습니다.",
      "                 이미 쓰고 계시니 익숙하실 겁니다."]
(OUT / "편집_안내.txt").write_text("\n".join(L), encoding="utf8")

for f in sorted(OUT.iterdir()):
    print(f"  → {f.name}  {f.stat().st_size/1024/1024:.1f} MB")
