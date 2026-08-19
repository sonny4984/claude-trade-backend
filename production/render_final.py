#!/usr/bin/env python3
"""최종 썸네일 한 장을 FHD jpg 로 뽑는다.

바탕은 영상에서 직접 뽑은 프레임(stills/t0029.0.png)을 쓴다.
외부 사진이 한 장도 없어야 요강의 "직접 촬영/제작한 것만 사용" 에 걸리지 않는다.

바탕 프레임이 없으면(stills/ 는 커밋하지 않는다) 먼저 뽑아 둔다.
  python3 render.py --stills 29 --timeline timeline_school.json --school --name 신정중학교 --who 차민

  python3 render_final.py
"""
import functools, http.server, pathlib, shutil, socket, threading
from playwright.sync_api import sync_playwright

D = pathlib.Path(__file__).parent
OUT = D / "out"
PLATE = "t0029.0.png"          # 졸린 표정이 나오는 프레임
NAMES = ["썸네일_최종.jpg", "신정중학교_차민_썸네일.jpg"]   # 뒤쪽이 공지 파일명 규칙


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    shutil.copy(D / "stills" / PLATE, D / "plate_desk.png")
    httpd, port = serve()
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                                args=["--force-color-profile=srgb", "--disable-lcd-text",
                                      "--hide-scrollbars", "--font-render-hinting=none",
                                      "--disable-gpu", "--no-sandbox"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        pg.goto(f"http://127.0.0.1:{port}/thumb_final.html", wait_until="load")
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / NAMES[0]), type="jpeg", quality=95)
        br.close()
    httpd.shutdown()

    for n in NAMES[1:]:
        shutil.copy(OUT / NAMES[0], OUT / n)
    for n in NAMES:
        p = OUT / n
        print(f"→ {p.name}  {p.stat().st_size/1024:.0f} KB")
    (D / "plate_desk.png").unlink(missing_ok=True)      # 소재는 남기지 않는다


if __name__ == "__main__":
    main()
