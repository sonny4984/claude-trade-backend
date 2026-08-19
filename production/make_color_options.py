#!/usr/bin/env python3
"""배경 밝기 세 단계를 같은 장면에서 뽑아 나란히 붙인다.

색은 말로 정하기 어렵다. 고객이 "남색보다 좀 더 밝게" 라고만 했으니
단계를 보여 주고 고르게 한다. 렌더 없이 정지컷만 찍으므로 1분이면 된다.

  python3 make_color_options.py
"""
import functools, http.server, json, pathlib, socket, threading
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

D = pathlib.Path(__file__).parent
OUT = D / "out"
SHOTS = [(2.0, "제목 화면"), (62.0, "혈당 그래프"), (120.0, "오렉신 스위치"), (157.0, "결론")]
LEVELS = [("1", "지금 (남색)"), ("2", "조금 밝게"), ("3", "많이 밝게")]
FONT = "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main():
    tl = json.loads((D / "timeline_school.json").read_text())
    httpd, port = serve()
    tmp = OUT / "_color"; tmp.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                                args=["--force-color-profile=srgb", "--disable-lcd-text",
                                      "--hide-scrollbars", "--font-render-hinting=none",
                                      "--disable-gpu", "--no-sandbox"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        for lv, _ in LEVELS:
            url = (f"http://127.0.0.1:{port}/scene.html"
                   f"?school=1&name=%E2%97%8B%E2%97%8B%EC%A4%91%ED%95%99%EA%B5%90&bg={lv}")
            pg.goto(url, wait_until="load")
            pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(600)
            pg.evaluate("t => window.setTiming(t)", tl["timing"])
            pg.evaluate("s => window.setSubs(s)", tl["subs"])
            pg.evaluate("b => window.setBeats(b)", tl.get("beats", {}))
            for ts, _ in SHOTS:
                pg.evaluate("t => window.render(t)", ts)
                pg.screenshot(path=str(tmp / f"L{lv}_{ts:06.1f}.png"))
            print(f"  밝기 {lv} · 정지컷 {len(SHOTS)}장")
        br.close()
    httpd.shutdown()

    # 장면마다 세 단계를 가로로 붙인다
    W = 620
    f = ImageFont.truetype(FONT, 26)
    for ts, name in SHOTS:
        tiles = []
        for lv, label in LEVELS:
            im = Image.open(tmp / f"L{lv}_{ts:06.1f}.png").convert("RGB")
            im = im.resize((W, int(W * im.height / im.width)), Image.LANCZOS)
            pad = Image.new("RGB", (W, im.height + 44), (14, 14, 16))
            pad.paste(im, (0, 44))
            ImageDraw.Draw(pad).text((14, 10), f"{lv}. {label}", font=f, fill=(230, 230, 235))
            tiles.append(pad)
        strip = Image.new("RGB", (W * 3, tiles[0].height), (14, 14, 16))
        for i, t in enumerate(tiles):
            strip.paste(t, (i * W, 0))
        p = OUT / f"색시안_{name}.png"
        strip.save(p, quality=92)
        print(f"→ {p.name}")


if __name__ == "__main__":
    main()
