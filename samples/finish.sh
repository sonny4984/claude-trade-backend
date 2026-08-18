#!/usr/bin/env bash
# 시안 세 편을 완성한다. render.py 로 무음 영상을 만든 뒤 bgm.py 의 소리를 붙인다.
#   bash finish.sh
set -euo pipefail
cd "$(dirname "$0")"
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")

python3 bgm.py

for n in 시안_1_그네진자 시안_2_온도지도 시안_3_미끄럼각도; do
  # 무음 영상이 없으면 이미 완성된 파일에서 영상만 떼어 쓴다
  if [ ! -f "out/${n}_무음.mp4" ] && [ -f "out/${n}.mp4" ]; then
    "$FF" -y -loglevel error -i "out/${n}.mp4" -an -c:v copy "out/${n}_무음.mp4"
  fi
  "$FF" -y -loglevel error -i "out/${n}_무음.mp4" -i "out/${n}.m4a" \
        -c:v copy -c:a copy -shortest -movflags +faststart "out/${n}.tmp.mp4"
  mv "out/${n}.tmp.mp4" "out/${n}.mp4"
  rm -f "out/${n}_무음.mp4" "out/${n}.m4a"
  echo "→ out/${n}.mp4"
done

ls -la out/*.mp4
