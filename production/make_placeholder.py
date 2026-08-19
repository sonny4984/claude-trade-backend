#!/usr/bin/env python3
"""완성본 위에 "여기에 아이 영상이 들어갑니다" 표시를 덧씌운 시안을 만든다.

말로 설명하면 잘 안 와닿는다. 영상을 새로 렌더하지 않고, 이미 만든 제출본
위에 그 구간만 반투명 표시를 얹는다. 소리도 길이도 그대로라서, 끼워 넣는 게
아니라 덮는 것이라는 점이 화면으로 바로 보인다.

  python3 make_placeholder.py
"""
import functools, http.server, pathlib, socket, subprocess, threading
from urllib.parse import urlencode
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SRC = D / "out" / "교내대회_제출본_오늘먹은간식이_내집중력을바꾼다.mp4"
OUT = D / "out" / "시안_아이촬영이_들어갈_자리.mp4"
TMP = D / "out" / "_ph"

# 나레이션 문장이 곧 컷 경계다. timeline.json 의 원래 자막 시각을 그대로 쓴다.
CUTS = [
    dict(a=4.00,   b=4.87,   cut="컷 1 · 0.9초",  title=1,
         desc="어두운 방. 시계나 휴대폰에 밤 11시가 보이게",
         note="제목과 학교명은 이 위에 그대로 남습니다"),
    dict(a=4.93,   b=8.75,   cut="컷 2 · 3.8초",  title=1,
         desc="책상 앞에서 문제집을 보다 눈을 비빈다. 옆 45도",
         note="제목과 학교명은 이 위에 그대로 남습니다"),
    dict(a=8.81,   b=13.40,  cut="컷 3 · 4.6초",
         desc="초콜릿과 탄산음료를 책상에 올려놓는 손. 위에서",
         note="지금 이 자리에 있는 일러스트를 실제 촬영으로 바꿉니다"),
    dict(a=13.46,  b=17.59,  cut="컷 4 · 4.1초",
         desc="초콜릿을 뜯어 먹고 음료를 마신다. 정면에서 가까이"),
    dict(a=17.65,  b=21.16,  cut="컷 5 · 3.5초",
         desc="턱을 괴고 멍한 표정",
         note="컷 2와 같은 자리, 같은 각도로 찍어야 합니다"),
    dict(a=170.00, b=175.72, cut="컷 6 · 5.7초",
         desc="다음 날 낮. 견과류를 집는 손. 마지막에 카메라를 본다"),
]


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    if not SRC.exists():
        raise SystemExit(f"완성본이 없다: {SRC}")
    TMP.mkdir(parents=True, exist_ok=True)
    httpd, port = serve()

    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                                args=["--force-color-profile=srgb", "--disable-lcd-text",
                                      "--hide-scrollbars", "--font-render-hinting=none",
                                      "--disable-gpu", "--no-sandbox"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)

        shots = []
        for i, c in enumerate(CUTS, 1):
            qs = urlencode({k: v for k, v in c.items() if k not in ("a", "b")})
            pg.goto(f"http://127.0.0.1:{port}/overlay.html?{qs}", wait_until="load")
            pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(300)
            p = TMP / f"cut{i}.png"
            pg.screenshot(path=str(p), omit_background=True)
            shots.append(p)
            print(f"  컷 {i} 표시 그림")

        pg.goto(f"http://127.0.0.1:{port}/overlay.html?mode=tag", wait_until="load")
        pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(300)
        tag = TMP / "tag.png"
        pg.screenshot(path=str(tag), omit_background=True)
        br.close()
    httpd.shutdown()

    # 완성본 위에 얹는다. 영상은 다시 그리지 않고 덧씌우기만 한다.
    ins = ["-i", str(SRC), "-i", str(tag)] + sum([["-i", str(p)] for p in shots], [])
    fc, cur = [], "[0:v]"
    fc.append(f"{cur}[1:v]overlay=0:0[v0]"); cur = "[v0]"
    for k, c in enumerate(CUTS):
        nxt = f"[v{k+1}]"
        fc.append(f"{cur}[{k+2}:v]overlay=0:0:enable='between(t,{c['a']},{c['b']})'{nxt}")
        cur = nxt
    subprocess.run([FF, "-y", "-loglevel", "error", *ins,
                    "-filter_complex", ";".join(fc), "-map", cur, "-map", "0:a",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "21",
                    "-tune", "animation", "-pix_fmt", "yuv420p",
                    "-c:a", "copy", "-movflags", "+faststart", str(OUT)], check=True)
    print(f"→ {OUT.name}  {OUT.stat().st_size/1e6:.1f} MB")


if __name__ == "__main__":
    main()
