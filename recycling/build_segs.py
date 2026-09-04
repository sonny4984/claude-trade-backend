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
            # 5초를 멈춰 세워 두면 죽어 보인다. 아주 천천히 밀어 넣는다.
            vf=("scale=2112:1188,zoompan=z='min(1+0.0004*on,1.06)':"
                "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,format=yuv420p")
            # zoompan 은 -t 만으로는 프레임 수를 안 지킨다. 5.00초짜리가 4.17초로
            # 나와 뒤의 모든 화면이 0.83초씩 앞당겨졌다. 낼 장수를 못박는다.
            run([FF,"-y","-v","error","-loop","1","-t",str(d+1),"-i",src,
                 "-vf",vf,"-r","30","-frames:v",str(round(d*30)),
                 "-c:v","libx264","-preset","veryfast","-crf","20",str(out)])
        else:
            # 흐린 배경 위에 원본 전체를 얹고 아주 천천히 확대한다
            fc=("[1:v]scale=1782:1188,zoompan=z='min(1+0.00025*on,1.09)':"
                "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1620x1080:fps=30[fg];"
                "[0:v][fg]overlay=(W-w)/2:0,format=yuv420p")
            run([FF,"-y","-v","error","-loop","1","-t",str(d+1),"-i",str(bg),
                 "-loop","1","-t",str(d+1),"-i",src,"-filter_complex",fc,
                 "-r","30","-frames:v",str(round(d*30)),
                 "-c:v","libx264","-preset","veryfast","-crf","20",str(out)])
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
        if r.get("mosaic"):
            # 동의를 받지 않은 학생들의 얼굴을 가린다. 카메라가 최대 56px
            # 흔들려 그만큼 여유를 뒀다. 차민은 x 945~1305 라 비켜 간다.
            vf += ",split=4[m0][m1][m2][m3];" + ";".join(
                f"[m{i+1}]crop={w}:{h}:{x}:{y},scale={max(2,w//20)}:{max(2,h//20)}:flags=neighbor,"
                f"scale={w}:{h}:flags=neighbor[b{i}]"
                for i,(x,y,w,h) in enumerate(r["mosaic"]))
            prev="[m0]"
            for i,(x,y,w,h) in enumerate(r["mosaic"]):
                tag = f"[o{i}]" if i < len(r["mosaic"])-1 else ""
                vf += f";{prev}[b{i}]overlay={x}:{y}{tag}"
                prev = f"[o{i}]"
        run([FF,"-y","-v","error","-ss",str(st),"-i",src,"-an","-vf",vf+",format=yuv420p",
             "-r","30","-frames:v",str(round(d*30)),
             "-c:v","libx264","-preset","veryfast","-crf","20",str(out)])
    print("  %02d  %6.2f~%6.2f (%5.2f초)  %-38s %5.1f MB"
          %(i,r["a"],r["b"],d,pathlib.Path(src).name,out.stat().st_size/1e6))
print("\n조각 %d개"%len(rows))
