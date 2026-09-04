#!/usr/bin/env python3
"""2-5 자리에 넣을 네 단계 그림을 만든다.

고객님이 보내주신 그림과 같은 짜임인데, 그쪽은 대화창을 찍은 화면이라
가로가 795px 밖에 안 된다. 같은 촬영본에서 다시 떠서 1920x1080 으로 만든다.
띠 색은 보내주신 그림에서 직접 뽑았다.

영어만 넣은 판과 한글까지 넣은 판을 함께 만든다. 요강 3-마 는
「영상 내 모든 대사·설명·자막은 영어」라고 되어 있다.
"""
import pathlib, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
S = pathlib.Path("/tmp/claude-0/-home-user-claude-trade-backend/"
                 "9bc329f1-9649-5e79-9d0d-26f445e4d774/scratchpad/step")
S.mkdir(parents=True, exist_ok=True)
W, H = 1920, 1080
FONT = "/usr/share/fonts/truetype/nanum/"
fnt = lambda n, s: ImageFont.truetype(FONT + n, s)

PW, PH, BAR, GAP = 424, 560, 108, 10          # 칸 너비·사진 높이·띠 높이·틈

# (파일, 뜰 시각, 가로 가운데, 영어, 한글, 띠 색)
STEPS = [
    ("footage/3-1_세면대_C_15.5초.mov", 3.0, 620, "EMPTY",  "비우고",  (41, 100, 168)),
    ("footage/3-1_세면대_A_13.5초.mov", 3.0, 600, "RINSE",  "헹구고",  (55, 127, 80)),
    ("footage/3-1_세면대_B_9.3초.mov",  3.0, 545, "REMOVE", "떼고",    (209, 145, 31)),
    ("footage/3-1_교실바구니_3.0초.mov", 2.0, 640, "SORT",   "분리하고", (99, 110, 107)),
]


def frame(src, t):
    p = S / (pathlib.Path(src).stem + f"_{t}.png")
    if not p.exists():
        subprocess.run([FF, "-y", "-v", "error", "-ss", str(t), "-i", src,
                        "-frames:v", "1", str(p)], check=True)
    return Image.open(p).convert("RGB")


def portrait(im, cx, w, h):
    """세로 칸에 맞춰 잘라낸다. 원본이 가로라 높이를 다 쓰고 폭만 줄인다."""
    iw, ih = im.size
    cw = int(ih * w / h)
    x = max(0, min(iw - cw, int(cx * iw / 1280) - cw // 2))
    return im.crop((x, 0, x + cw, ih)).resize((w, h), Image.LANCZOS)


def build(korean):
    bg = frame(*STEPS[1][:2]).resize((W, H), Image.LANCZOS)
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(30))).enhance(0.24)
    # 가장자리를 더 눌러 네 칸이 떠 보이게 한다
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse([-W*0.30, -H*0.55, W*1.30, H*1.55], fill=255)
    bg = Image.composite(bg, ImageEnhance.Brightness(bg).enhance(0.55),
                         vig.filter(ImageFilter.GaussianBlur(160)))
    im = bg
    d = ImageDraw.Draw(im)

    tot = PW * 4 + GAP * 3
    x0 = (W - tot) // 2
    y0 = (H - (PH + BAR)) // 2
    for i, (src, t, cx, en, ko, col) in enumerate(STEPS):
        x = x0 + i * (PW + GAP)
        im.paste(portrait(frame(src, t), cx, PW, PH), (x, y0))
        d.rectangle([x, y0 + PH, x + PW, y0 + PH + BAR], fill=col)
        if korean:
            d.text((x + 26, y0 + PH + 16), en, font=fnt("NanumSquareB.ttf", 42),
                   fill=(255, 255, 255))
            d.text((x + 27, y0 + PH + 68), ko, font=fnt("NanumSquareR.ttf", 26),
                   fill=(238, 243, 248))
        else:
            d.text((x + 26, y0 + PH + 30), en, font=fnt("NanumSquareB.ttf", 46),
                   fill=(255, 255, 255))
    return im


if __name__ == "__main__":
    out = pathlib.Path("build"); out.mkdir(exist_ok=True)
    cmp = pathlib.Path("out/2-5후보"); cmp.mkdir(parents=True, exist_ok=True)
    a = build(False); a.save("build/2-5_네단계.png"); a.save(cmp / "영어만.jpg", quality=93)
    b = build(True);  b.save(cmp / "영어한글.jpg", quality=93)
    b.save("build/2-5_네단계_한글판.png")
    sheet = Image.new("RGB", (W, H + 6), (18, 18, 18))
    sheet.paste(a.resize((W, H // 2 - 3), Image.LANCZOS), (0, 0))
    sheet.paste(b.resize((W, H // 2 - 3), Image.LANCZOS), (0, H // 2 + 3))
    sheet.save(cmp / "_모아보기.jpg", quality=92)
    print("→ build/2-5_네단계.png (영어만) · out/2-5후보/ 에 견줄 그림")
