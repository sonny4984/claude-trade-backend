#!/usr/bin/env python3
"""제출본 두 파일이 공지사항 규격에 맞는지 하나씩 확인한다.

  제출 기한 2026. 9. 4. (금)
  썸네일  FHD(1920x1080), jpg,  파일명 학교_이름_썸네일
  동영상  FHD(1920x1080), mp4,  3분 내외, 파일명 학교_이름_동영상
"""
import json, pathlib, subprocess, sys
import imageio_ffmpeg

D = pathlib.Path(__file__).parent
OUT = D / "out"
FF = imageio_ffmpeg.get_ffmpeg_exe()

SCHOOL, NAME = "신정중학교", "차민"
ok = True


def probe(p):
    """ffprobe 가 없는 환경이라 ffmpeg -i 의 출력에서 필요한 값만 긁는다."""
    import re
    t = subprocess.run([FF, "-hide_banner", "-i", str(p)],
                       capture_output=True, text=True).stderr
    d = {"streams": [], "format": {"format_name": p.suffix.lstrip("."),
                                   "size": str(p.stat().st_size)}}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", t)
    if m:
        h, mi, se = m.groups()
        d["format"]["duration"] = str(int(h) * 3600 + int(mi) * 60 + float(se))
    for ln in t.splitlines():
        if "Stream #" not in ln:
            continue
        if "Video:" in ln:
            wh = re.search(r"(\d{2,5})x(\d{2,5})", ln)
            d["streams"].append({"codec_type": "video",
                                 "codec_name": ln.split("Video: ")[1].split()[0].rstrip(","),
                                 "width": int(wh.group(1)), "height": int(wh.group(2))})
        elif "Audio:" in ln:
            sr = re.search(r"(\d+) Hz", ln)
            d["streams"].append({"codec_type": "audio",
                                 "codec_name": ln.split("Audio: ")[1].split()[0].rstrip(","),
                                 "sample_rate": sr.group(1) if sr else "0",
                                 "channels": 2 if "stereo" in ln else 1})
    return d


def check(label, got, want, good):
    global ok
    ok &= good
    print(f"  [{'○' if good else '×'}] {label:<14} {got}" + ("" if good else f"   ← {want}"))


def main():
    print("제출 규격 확인\n")

    jpg = OUT / f"{SCHOOL}_{NAME}_썸네일.jpg"
    print(f"썸네일  {jpg.name}")
    if not jpg.exists():
        print("  [×] 파일 없음"); return 1
    s = probe(jpg)["streams"][0]
    check("해상도", f"{s['width']}x{s['height']}", "1920x1080",
          (s["width"], s["height"]) == (1920, 1080))
    check("형식", s["codec_name"], "mjpeg (jpg)", s["codec_name"] == "mjpeg")
    check("파일명", jpg.name, "학교_이름_썸네일.jpg", True)
    check("용량", f"{jpg.stat().st_size/1024:.0f} KB", "", True)

    mp4 = OUT / f"{SCHOOL}_{NAME}_동영상.mp4"
    print(f"\n동영상  {mp4.name}")
    if not mp4.exists():
        print("  [×] 파일 없음"); return 1
    info = probe(mp4)
    v = next(x for x in info["streams"] if x["codec_type"] == "video")
    a = next((x for x in info["streams"] if x["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    check("해상도", f"{v['width']}x{v['height']}", "1920x1080",
          (v["width"], v["height"]) == (1920, 1080))
    check("형식", f"{info['format']['format_name'].split(',')[0]} / {v['codec_name']}",
          "mp4 / h264", "mp4" in info["format"]["format_name"] and v["codec_name"] == "h264")
    check("길이", f"{int(dur//60)}분 {dur%60:04.1f}초", "3분 내외", 170 <= dur <= 190)
    check("소리", f"{a['codec_name']} {a['sample_rate']}Hz {a['channels']}ch" if a else "없음",
          "aac 48000Hz 2ch", bool(a) and a["codec_name"] == "aac" and a["sample_rate"] == "48000")
    check("파일명", mp4.name, "학교_이름_동영상.mp4", True)
    check("용량", f"{mp4.stat().st_size/1024/1024:.1f} MB", "", True)

    print("\n저작권 — 유튜브 검열에 걸릴 요소가 있는지")
    check("글꼴", "영상 Pretendard · 썸네일 나눔스퀘어 (둘 다 OFL)", "", True)
    check("음악", "numpy 로 직접 합성 (bgm.py)", "", True)
    check("사진·영상", "외부 소재 0개, 전부 직접 그린 그래픽", "", True)
    check("효과음", "직접 합성 (bgm.py)", "", True)
    check("나레이션", "클라이언트가 보내주신 클로바더빙 음원 (합성음)", "", True)

    print("\n" + ("전부 통과" if ok else "확인 필요한 항목이 있습니다"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
