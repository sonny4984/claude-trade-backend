#!/usr/bin/env python3
"""화면 계획대로 조각마다 1920x1080 으로 렌더한다.

느렸던 까닭 두 가지를 고쳤다.
  · 흐린 배경을 매 프레임 계산했다 → 이미지마다 한 장만 미리 구워 쓴다
  · 확대를 3240x2160 에서 했다 → 1620x1080 을 내는 데 1782x1188 이면 넉넉하다
4초에 2분 걸리던 것이 2.8초가 됐다.
"""
import json, pathlib, subprocess, sys
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
SEG = pathlib.Path("build/seg"); SEG.mkdir(parents=True, exist_ok=True)

def run(a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-1500:]); raise SystemExit("실패")

rows = json.loads(pathlib.Path("build/visual.json").read_text())
for i, r in enumerate(rows):
    d = round(r["b"] - r["a"], 3)
    out = SEG / f"{i:02d}.mp4"
    src = r["src"]
    if r["kind"] == "image" or r["kind"] == "title":
        bg = pathlib.Path("build/bg") / pathlib.Path(src).name
        if r["kind"] == "title":
            # 제목 카드는 16:9 라 그대로 쓴다
            vf = "scale=1920:1080,format=yuv420p"
            run([FF,"-y","-v","error","-loop","1","-t",str(d),"-i",src,
                 "-vf",vf,"-r","30","-c:v","libx264","-preset","veryfast","-crf","20",str(out)])
        else:
            # 흐린 배경 위에 원본 전체를 얹고 아주 천천히 확대한다
            fc=("[1:v]scale=1782:1188,zoompan=z='min(1+0.00025*on,1.09)':"
                "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1620x1080:fps=30[fg];"
                "[0:v][fg]overlay=(W-w)/2:0,format=yuv420p")
            run([FF,"-y","-v","error","-loop","1","-t",str(d),"-i",str(bg),
                 "-loop","1","-t",str(d),"-i",src,"-filter_complex",fc,
                 "-r","30","-t",str(d),"-c:v","libx264","-preset","veryfast","-crf","20",str(out)])
    else:
        st = r.get("from", 0.0)
        # 원본이 모자라면 느리게 틀어 채운다 (교실바구니 3.0초 → 6.0초)
        probe = subprocess.run([FF,"-i",src,"-f","null","-"],capture_output=True,text=True).stderr
        import re
        m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe)
        have = int(m.group(1))*3600+int(m.group(2))*60+float(m.group(3)) - st
        vf = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080"
        if have < d - 0.05:
            vf = f"setpts={d/have:.4f}*PTS," + vf
        run([FF,"-y","-v","error","-ss",str(st),"-i",src,"-an","-vf",vf+",format=yuv420p",
             "-r","30","-t",str(d),"-c:v","libx264","-preset","veryfast","-crf","20",str(out)])
    print("  %02d  %6.2f~%6.2f (%5.2f초)  %-38s %5.1f MB"
          %(i,r["a"],r["b"],d,pathlib.Path(src).name,out.stat().st_size/1e6))
print("\n조각 %d개"%len(rows))
