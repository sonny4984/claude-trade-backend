#!/usr/bin/env python3
"""scene.html 을 결정론적으로 프레임 캡처해 FHD mp4 로 인코딩한다.

  python3 render.py --stills 3,20,38,52,70,95,120,150,170   # 정지컷 검수
  python3 render.py --video                                  # 본편 렌더
"""
import argparse, functools, http.server, json, pathlib, socket, subprocess, threading, sys
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1920, 1080


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def open_page(pw, port, tl, query=""):
    br = pw.chromium.launch(
        executable_path="/opt/pw-browsers/chromium",
        args=["--force-color-profile=srgb", "--disable-lcd-text",
              "--hide-scrollbars", "--font-render-hinting=none",
              "--disable-gpu", "--no-sandbox"])
    pg = br.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(f"http://127.0.0.1:{port}/scene.html{query}", wait_until="load")
    if errs:
        raise SystemExit("페이지 스크립트 오류:\n  " + "\n  ".join(errs[:6]))
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(700)
    pg.evaluate("t => window.setTiming(t)", tl["timing"])
    pg.evaluate("s => window.setSubs(s)", tl["subs"])
    pg.evaluate("b => window.setBeats(b)", tl.get("beats", {}))
    pg.evaluate("window.render(0)")
    return br, pg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills")
    ap.add_argument("--video", action="store_true")
    ap.add_argument("--out", default=str(D / "out" / "video_raw.mp4"))
    ap.add_argument("--fps", type=int, default=0)
    # 교내대회용: 자막을 10자 이내로 끊고 글꼴을 고딕으로, 첫 화면에 학교명을 넣는다
    ap.add_argument("--timeline", default="timeline.json")
    ap.add_argument("--school", action="store_true")
    ap.add_argument("--name", default="○○중학교")
    ap.add_argument("--who", default="")
    ap.add_argument("--nosub", action="store_true")
    ap.add_argument("--bg", default="", help="1 기본 남색 / 2 한 단계 밝게 / 3 더 밝게")
    a = ap.parse_args()

    query = ""
    if a.school:
        from urllib.parse import urlencode
        q = {"school": 1, "name": a.name, "who": a.who}
        if a.nosub: q["nosub"] = 1
        if a.bg in ("2", "3"): q["bg"] = a.bg
        query = "?" + urlencode(q)

    tl = json.loads((D / a.timeline).read_text())
    fps = a.fps or tl.get("fps", 30)
    total = tl["timing"]["total"]
    httpd, port = serve()

    with sync_playwright() as pw:
        br, pg = open_page(pw, port, tl, query)

        if a.stills:
            outdir = D / "stills"; outdir.mkdir(exist_ok=True)
            for ts in [float(x) for x in a.stills.split(",")]:
                pg.evaluate("t => window.render(t)", ts)
                pg.screenshot(path=str(outdir / f"t{ts:06.1f}.png"))
                print(f"  still @ {ts:6.1f}s")
            br.close(); httpd.shutdown(); return

        if not a.video:
            print("--stills 또는 --video 를 지정하세요"); return

        n = int(round(total * fps))
        pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        enc = subprocess.Popen([
            FF, "-y", "-loglevel", "error",
            "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(fps), "-i", "-",
            "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
            "-x264-params", "keyint=60:min-keyint=30:scenecut=0",
            "-movflags", "+faststart", "-r", str(fps), a.out],
            stdin=subprocess.PIPE)

        print(f"렌더 시작: {n} 프레임 ({total:.1f}s @ {fps}fps)")
        step = max(1, n // 40)
        for i in range(n):
            pg.evaluate("t => window.render(t)", i / fps)
            enc.stdin.write(pg.screenshot(type="jpeg", quality=96))
            if i % step == 0:
                pct = 100 * i / n
                sys.stdout.write(f"\r  {pct:5.1f}%  ({i}/{n})"); sys.stdout.flush()
        enc.stdin.close(); enc.wait()
        print(f"\r  100.0%  ({n}/{n})\n→ {a.out}")
        br.close()
    httpd.shutdown()


if __name__ == "__main__":
    main()
