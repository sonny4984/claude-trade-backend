#!/usr/bin/env python3
"""교내대회 제출본을 처음부터 끝까지 한 번에 만든다.

  그래픽 렌더 → 촬영분 삽입 → 소리 합성 → 2패스 인코딩 → 검산

자리를 손으로 적어 넣지 않는다. 나레이션 자리는 timeline.json 에서,
컷 자리는 cuts.json 에서 읽는다. 예전에 손으로 적었다가 나레이션이
2.4초 일찍 들어간 적이 있다.

  python3 build_final.py            # 그래픽이 이미 있으면 건너뛴다
  python3 build_final.py --regraph  # 그래픽부터 다시
"""
import argparse, json, pathlib, subprocess, sys
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
OUT = D / "out"
FF = imageio_ffmpeg.get_ffmpeg_exe()

DUR = 179.0            # 요강이 3분 이내를 요구한다
FADE = 0.85            # 끝 여운
VBIT = "1080k"         # 30MiB 안에 들어가는 화질
# 대회가 둘이라 판이 둘이다.
#   교내대회      — 어머님이 자막을 빼 달라고 하셨다
#   3분과학축전   — 요강이 "한 화면 10자 내외, 굴림·고딕·명조체만" 을 요구한다
SUB = "--sub" in sys.argv
GRAPH = OUT / ("g_full_sub.mp4" if SUB else "g_full.mp4")
COMP = OUT / "full_cut.mp4"
MUXED = OUT / "muxed.mp4"
FINAL = OUT / ("신정중학교_차민_과학축전_자막판.mp4" if SUB
               else "신정중학교_차민_교내대회_최종.mp4")

# 고객이 요청한 네 가지가 여기서 결정된다
_CFG = json.loads((D / "cuts.json").read_text())["설정"]
SCHOOL = ["--school", "--name", "신정중학교", "--who", "차민",
          "--bg", _CFG["배경밝기"]]   # 남색보다 밝은 색
if not SUB:
    SCHOOL.append("--nosub")          # 교내대회는 자막을 뺀다
BED = _CFG["배경음악"]                # 배경음악 밝게 — 마림바와 피치카토
#  코믹하게 — cuts.json 의 엄지척·고개뚝 컷으로 살린다


def run(cmd, what):
    print(f"\n▶ {what}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write((r.stderr or r.stdout)[-3000:])
        raise SystemExit(f"{what} 실패")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regraph", action="store_true")
    ap.add_argument("--sub", action="store_true", help="자막을 넣는다 (과학축전용)")
    a = ap.parse_args()

    if a.regraph or not GRAPH.exists():
        run([sys.executable, str(D / "render.py"), "--video",
             "--timeline", "timeline_school.json", *SCHOOL,
             "--out", str(GRAPH)], "그래픽 3분 렌더")
    else:
        print(f"▶ 그래픽은 이미 있습니다 ({GRAPH.name})")

    print(run([sys.executable, str(D / "insert_clips.py"),
               "--base", str(GRAPH), "--out", str(COMP)], "촬영분 삽입"))

    print(run([sys.executable, str(D / "mux.py"), "--video", str(COMP),
               "--bed", BED, "--dur", str(DUR), "--fade", str(FADE),
               "--out", str(MUXED)], "나레이션 + 배경음악"))

    vf = f"fade=t=out:st={DUR - FADE - 0.05:.2f}:d={FADE}"
    for p in (1, 2):
        tail = (["-an", "-f", "mp4", "/dev/null"] if p == 1
                else ["-c:a", "copy", "-movflags", "+faststart", str(FINAL)])
        run([FF, "-y", "-loglevel", "error", "-i", str(MUXED), "-vf", vf,
             "-c:v", "libx264", "-preset", "slow", "-b:v", VBIT, "-pass", str(p),
             "-x264-params", "keyint=60:min-keyint=30:scenecut=0",
             "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
             "-t", str(DUR), *tail], f"인코딩 {p}패스")
    for f in D.glob("ffmpeg2pass-*.log*"):
        f.unlink()
    print(f"→ {FINAL.name}  {FINAL.stat().st_size/1048576:.2f} MiB")

    for script in ("check_request.py", "check_audio5.py"):
        extra = ["--sub"] if SUB else []
        print(subprocess.run([sys.executable, str(D / script), str(FINAL), *extra],
                             capture_output=True, text=True).stdout)


if __name__ == "__main__":
    main()
