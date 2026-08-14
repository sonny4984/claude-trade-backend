#!/usr/bin/env bash
# 렌더가 끝난 뒤 납품물을 마무리한다.
#   video_raw.mp4 → 사운드 합성 → 30MiB 이하 재인코딩 → 구간별 샘플 mp3
set -euo pipefail
cd "$(dirname "$0")"
FF=/usr/local/bin/ffmpeg
MASTER=out/MASTER.mp4
FINAL="out/혈당스파이크와_뇌과학의_비밀_FHD.mp4"

python3 mux.py --video out/video_raw.mp4 --out "$MASTER"

# 채팅 첨부 한도(30MiB) 안에 들어가도록 다시 인코딩한다.
"$FF" -y -loglevel error -i "$MASTER" \
  -c:v libx264 -preset slow -crf 21 -tune animation \
  -pix_fmt yuv420p -profile:v high -level 4.1 \
  -x264-params "keyint=60:min-keyint=30:scenecut=0" \
  -c:a copy -movflags +faststart "$FINAL"

# 재인코딩 품질 확인 (SSIM)
"$FF" -hide_banner -i "$FINAL" -i "$MASTER" \
  -lavfi "[0:v][1:v]ssim" -f null - 2>&1 | grep -o "All:[0-9.]*" | tail -1

# 구간별 나레이션 샘플 — 말투가 고른지 귀로 확인하기 위한 것
python3 - <<'PY'
import json, subprocess
tl = json.load(open("timeline.json"))
names = ["1_도입부", "2_전개부", "3_심화부", "4_결론"]
for i, (a, nm) in enumerate(zip(tl["audio"], names), 1):
    subprocess.run(["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error",
                    "-i", f"audio/s{i}.wav", "-c:a", "libmp3lame", "-b:a", "192k",
                    f"out/샘플_{nm}.mp3"], check=True)
    print(f"  샘플_{nm}.mp3  {a['dur']:.1f}s")
PY

ls -la "$FINAL" out/*.mp3
