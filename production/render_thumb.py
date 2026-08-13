#!/usr/bin/env python3
"""썸네일 오버레이를 렌더해 FHD 1920x1080 jpg 로 저장한다."""
import functools, http.server, pathlib, socket, threading, sys
from playwright.sync_api import sync_playwright
from PIL import Image

D = pathlib.Path(__file__).parent
OUT = D / "out"


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    OUT.mkdir(exist_ok=True)
    httpd, port = serve()
    png = OUT / "thumbnail.png"
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                                args=["--force-color-profile=srgb", "--hide-scrollbars",
                                      "--font-render-hinting=none", "--disable-gpu", "--no-sandbox"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://127.0.0.1:{port}/thumbnail.html", wait_until="load")
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(900)
        if errs:
            sys.stderr.write("오류: " + "; ".join(errs) + "\n")
        pg.screenshot(path=str(png))
        br.close()
    httpd.shutdown()

    im = Image.open(png).convert("RGB")
    assert im.size == (1920, 1080), im.size
    jpg = OUT / "thumbnail.jpg"
    im.save(jpg, "JPEG", quality=94, optimize=True, progressive=True, subsampling=0)
    print(f"→ {jpg}  {im.size}  {jpg.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
