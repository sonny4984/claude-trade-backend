#!/usr/bin/env python3
"""썸네일 세 안을 FHD jpg 로 뽑는다.

바탕은 영상에서 직접 뽑은 화면을 쓴다. 외부에서 가져온 사진이 한 장도
없어야 요강의 "직접 촬영한 것만 사용" 에 걸리지 않는다.

  python3 render_thumb3.py
"""
import functools, http.server, pathlib, socket, threading
from PIL import Image
from playwright.sync_api import sync_playwright

D = pathlib.Path(__file__).parent
OUT = D / "out"
NAMES = {1: "썸네일_A_밤책상", 2: "썸네일_B_스위치", 3: "썸네일_C_그래프"}

# 영상에서 뽑은 정지컷을 잘라 바탕 소재로 쓴다
PLATES = [
    ("t0029.0.png", None,                      "plate_desk.png"),
    ("t0120.0.png", (1000, 315, 1830, 645),    "plate_on.png"),
    ("t0127.0.png", (1000, 315, 1830, 645),    "plate_off.png"),
    ("t0062.0.png", (170, 268, 1300, 806),     "plate_graph.png"),
]


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    for src, box, dst in PLATES:
        im = Image.open(D / "stills" / src)
        if box:
            im = im.crop(box)
        im.save(D / dst)
        print(f"  소재 {dst}  {im.size[0]}x{im.size[1]}")

    httpd, port = serve()
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                                args=["--force-color-profile=srgb", "--disable-lcd-text",
                                      "--hide-scrollbars", "--font-render-hinting=none",
                                      "--disable-gpu", "--no-sandbox"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        for v, name in NAMES.items():
            pg.goto(f"http://127.0.0.1:{port}/thumb3.html?v={v}", wait_until="load")
            pg.evaluate("document.fonts.ready")
            pg.wait_for_timeout(500)
            p = OUT / f"{name}.jpg"
            pg.screenshot(path=str(p), type="jpeg", quality=95)
            print(f"→ {p.name}  {p.stat().st_size/1024:.0f} KB")
        br.close()
    httpd.shutdown()

    for _, _, dst in PLATES:          # 소재는 남기지 않는다
        (D / dst).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
