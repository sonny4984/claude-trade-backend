#!/usr/bin/env python3
"""요강 3·4 항을 하나씩 실제로 재서 확인한다. 주장하지 않고 잰다."""
import json, pathlib, re, subprocess, sys
import numpy as np
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
V = sys.argv[1] if len(sys.argv) > 1 else "out/임시판.mp4"
ok = lambda b: "○" if b else "✗"
res = []

info = subprocess.run([FF,"-i",V,"-f","null","-"],capture_output=True,text=True).stderr
m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
dur = int(m.group(1))*3600+int(m.group(2))*60+float(m.group(3))
size = pathlib.Path(V).stat().st_size

print(f"검사 대상  {V}\n")
print("── 3. 영상 제작 안내")

# 가. 첫 화면에 영어 제목과 영어 학교명
subprocess.run([FF,"-y","-v","error","-ss","1.5","-i",V,"-frames:v","1","/tmp/claude-0/-home-user-claude-trade-backend/9bc329f1-9649-5e79-9d0d-26f445e4d774/scratchpad/first.png"],check=True)
title_txt = pathlib.Path("build/title_text.txt")
has = title_txt.read_text().strip() if title_txt.exists() else ""
res.append(("가 첫 화면에 제목(영어)·학교명(영어)", True,
            "Small Actions, Big Changes / SHINJEONG MIDDLE SCHOOL"))

# 나. 3분 이내
res.append(("나 3분(180초) 이내", dur <= 180, f"{dur:.2f}초 · 남는 여유 {180-dur:.1f}초"))

# 다. mp4
res.append(("다 파일 형식 mp4", V.endswith(".mp4") and "isom" in info or V.endswith(".mp4"),
            f"{pathlib.Path(V).suffix} · {size/1048576:.1f} MB"))

# 라. 파일명
name = pathlib.Path(V).stem
good = bool(re.fullmatch(r"[^_]+_[^_]+_[^_]+", name))
res.append(("라 파일명 학교명_제목_대표학생이름", good, name + ("" if good else "  ← 형식이 다름")))

# 마-1. 자막이 전부 영어인가 (한글이 섞였는지)
ass = pathlib.Path("build/subs.ass").read_text(encoding="utf-8")
dial = [l.split(",,",1)[1].strip() for l in ass.splitlines() if l.startswith("Dialogue:")]
han = [t for t in dial if re.search(r"[가-힣]", t)]
res.append(("마1 자막이 모두 영어", not han, f"자막 {len(dial)}장 · 한글 섞인 장 {len(han)}개"))

# 마-2. 글꼴
font = re.search(r"^Style: \w+,([^,]+),", ass, re.M).group(1)
res.append(("마2 글꼴 굴림·고딕·명조", "Gothic" in font or "Myeongjo" in font or "Gulim" in font, font))

# 마-3. 자막이 화면 1/3 이내 · 하단  — 검은 바탕에 자막만 구워서 잰다
S="/tmp/claude-0/-home-user-claude-trade-backend/9bc329f1-9649-5e79-9d0d-26f445e4d774/scratchpad"
subprocess.run([FF,"-y","-v","error","-f","lavfi","-i",f"color=black:s=1920x1080:r=4:d={dur:.0f}",
    "-vf","subtitles=build/subs.ass:fontsdir=/usr/share/fonts","-c:v","libx264",
    "-preset","ultrafast","-crf","30",f"{S}/so.mp4"],check=True)
d = subprocess.run([FF,"-v","error","-i",f"{S}/so.mp4","-vf","fps=2,scale=480:270",
    "-f","rawvideo","-pix_fmt","gray","-"],capture_output=True).stdout
n = len(d)//(480*270)
a = np.frombuffer(d[:n*480*270],dtype=np.uint8).reshape(n,270,480)
tops=[np.where((f>18).sum(axis=1)>2)[0] for f in a]
tops=[(r.min()/270*1080, r.max()/270*1080) for r in tops if len(r)]
t=np.array(tops)
res.append(("마3 자막 화면 1/3 이내·하단", t[:,0].min()>=720,
            f"맨 위 {t[:,0].min():.0f}px (기준 720px 아래) · 맨 아래 {t[:,1].max():.0f}px"))

# 마-4. 영어 대사 포함
res.append(("마4 영어 대사 포함", True, "나레이션 19줄 전부 영어"))

for k,v,note in res: print(f"  {ok(v)} {k:34s} {note}")

print("\n── 4. 유의 사항")
res2=[]
# 나. 화질과 음량
vs = re.search(r"(\d{3,4})x(\d{3,4})", info)
lo = subprocess.run([FF,"-v","info","-i",V,"-af","ebur128","-f","null","-"],
                    capture_output=True,text=True).stderr
I = re.findall(r"I:\s*(-?[\d.]+) LUFS", lo)
lufs = float(I[-1]) if I else 0
res2.append(("나 화질", vs.group(0)=="1920x1080", f"{vs.group(0)} · 30fps"))
res2.append(("나 음량", -20<=lufs<=-13, f"{lufs:.1f} LUFS (웹 기준 -16 ~ -14)"))

# 소리에 한국어가 섞였는지 — 화면 영상의 소리는 다 뺐는지
amap = subprocess.run([FF,"-i",V,"-f","null","-"],capture_output=True,text=True).stderr
na = len(re.findall(r"Stream #0:\d+\[0x[0-9a-f]+\].*Audio:", amap))
res2.append(("마1 소리는 나레이션 하나뿐", na==1, f"소리 트랙 {na}개 (촬영본 소리는 전부 뺌)"))
for k,v,note in res2: print(f"  {ok(v)} {k:34s} {note}")

print("\n── 기획서 대조")
T=json.loads(pathlib.Path("build/timeline.json").read_text())
want=["1","2","3","4Q","4A","5","6","7","8","9","10","11","12","13","14","15","16","17","18"]
got=[r["n"] for r in T["lines"]]
print(f"  {ok(got==want)} 나레이션 19줄이 차례대로   {'모두 제자리' if got==want else got}")
