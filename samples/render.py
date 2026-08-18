#!/usr/bin/env python3
"""기획안 세 편의 시안을 FHD mp4 로 렌더한다.

  python3 render.py --stills 1.5,6,12,19,27,34,38   # 정지컷 검수 (세 편 모두)
  python3 render.py --video                          # 시안 3편 렌더
  python3 render.py --video --only 3                 # 3편만
"""
import argparse, functools, http.server, pathlib, socket, subprocess, sys, threading
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, TOTAL = 1920, 1080, 30, 40.0

NAMES = {1: "시안_1_그네진자", 2: "시안_2_온도지도", 3: "시안_3_미끄럼각도"}


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def open_page(pw, port, s):
    br = pw.chromium.launch(
        executable_path="/opt/pw-browsers/chromium",
        args=["--force-color-profile=srgb", "--disable-lcd-text",
              "--hide-scrollbars", "--font-render-hinting=none",
              "--disable-gpu", "--no-sandbox"])
    pg = br.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(f"http://127.0.0.1:{port}/scene.html?s={s}", wait_until="load")
    if errs:
        raise SystemExit(f"[시안 {s}] 페이지 오류:\n  " + "\n  ".join(errs[:6]))
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(600)
    return br, pg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills")
    ap.add_argument("--video", action="store_true")
    ap.add_argument("--only", type=int)
    a = ap.parse_args()

    which = [a.only] if a.only else [1, 2, 3]
    httpd, port = serve()
    (D / "out").mkdir(exist_ok=True)

    with sync_playwright() as pw:
        for s in which:
            br, pg = open_page(pw, port, s)

            if a.stills:
                outdir = D / "stills"; outdir.mkdir(exist_ok=True)
                for ts in [float(x) for x in a.stills.split(",")]:
                    pg.evaluate("t => window.render(t)", ts)
                    pg.screenshot(path=str(outdir / f"s{s}_t{ts:04.1f}.png"))
                print(f"  시안 {s} 정지컷 {len(a.stills.split(','))}장")
                br.close(); continue

            if not a.video:
                print("--stills 또는 --video 를 지정하세요"); br.close(); return

            out = D / "out" / f"{NAMES[s]}_무음.mp4"
            n = int(round(TOTAL * FPS))
            enc = subprocess.Popen([
                FF, "-y", "-loglevel", "error",
                "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(FPS), "-i", "-",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
                "-x264-params", "keyint=60:min-keyint=30:scenecut=0",
                "-movflags", "+faststart", "-r", str(FPS), str(out)],
                stdin=subprocess.PIPE)
            step = max(1, n // 25)
            for i in range(n):
                pg.evaluate("t => window.render(t)", i / FPS)
                enc.stdin.write(pg.screenshot(type="jpeg", quality=95))
                if i % step == 0:
                    sys.stdout.write(f"\r  시안 {s}: {100*i/n:5.1f}%  ({i}/{n})")
                    sys.stdout.flush()
            enc.stdin.close(); enc.wait()
            print(f"\r  시안 {s}: 100.0%  ({n}/{n})  → {out.name}")
            br.close()
    httpd.shutdown()


if __name__ == "__main__":
    main()
