#!/usr/bin/env python3
"""첫 화면을 만든다.

고객님이 「학교분리수거장을 첫 화면에 넣는게 좋을듯 합니다」라고 하셔서
교실 장면에서 분리수거장 촬영본으로 바꿨다.

요강 3-가 : 첫 화면에 영어 제목과 영어 학교명이 들어가야 한다.
인자 없이 돌리면 후보를 모두 만들고, 이름을 주면 그것을 build/title.png 로 굽는다.
"""
import pathlib, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
S = pathlib.Path("/tmp/claude-0/-home-user-claude-trade-backend/"
                 "9bc329f1-9649-5e79-9d0d-26f445e4d774/scratchpad/shed/f")
S.mkdir(parents=True, exist_ok=True)
W, H = 1920, 1080
FONT = "/usr/share/fonts/truetype/nanum/"
f = lambda n, s: ImageFont.truetype(FONT + n, s)

EYE = "SHINJEONG MIDDLE SCHOOL"
TIT = "Small Actions, Big Changes"
SUB = "Shinjeong's Recycling Revolution"
BLUE = (128, 196, 250)
CLIP = "footage/2-1_분리수거장_풍경.mov"


def track(d, xy, text, font, fill, sp=0.0, sh=True):
    """자간을 벌려 쓴다. PIL 에는 자간 기능이 없어 한 글자씩 그린다."""
    x, y = xy
    for ch in text:
        if sh:
            d.text((x + 2, y + 3), ch, font=font, fill=(0, 0, 0, 160))
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + sp
    return x


def grab(t, crop):
    p = S / f"t{t}.png"
    if not p.exists():
        subprocess.run([FF, "-y", "-v", "error", "-ss", str(t), "-i", CLIP,
                        "-frames:v", "1", str(p)], check=True)
    im = Image.open(p).convert("RGB")
    w, h = im.size
    return im.crop((int(w*crop[0]), int(h*crop[1]), int(w*crop[2]), int(h*crop[3]))) \
             .resize((W, H), Image.LANCZOS)


def grade(im):
    """촬영본이 초록 차광막 아래라 전체가 물빠져 보인다.
    대비를 세우고 초록기를 덜고 붉은 쪽을 아주 조금 올린다."""
    im = ImageEnhance.Contrast(im).enhance(1.13)
    im = ImageEnhance.Color(im).enhance(1.06)
    r, g, b = im.split()
    g = g.point([min(255, int(255*((i/255)**1.06))) for i in range(256)])
    r = r.point([min(255, int(i*1.03+3)) for i in range(256)])
    return Image.merge("RGB", (r, g, b))


def scrim(im, top, alpha, up=False):
    """글자 쪽만 어둡게 덮는다. 화면 전체를 어둡게 하면 장소가 안 보인다."""
    lay = Image.new("L", (1, H), 0)
    px = lay.load()
    for y in range(H):
        if up:
            px[0, y] = int(alpha*((top-y)/top)**1.4) if y < top else 0
        else:
            px[0, y] = 0 if y < top else int(alpha*((y-top)/(H-top))**1.4)
    return Image.composite(Image.new("RGB", (W, H), (6, 10, 16)), im, lay.resize((W, H)))


def low(im):                                    # 글자를 왼쪽 아래에
    im = scrim(im, 420, 240)
    d = ImageDraw.Draw(im)
    d.rectangle([120, 748, 127, 908], fill=BLUE)
    track(d, (170, 744), EYE, f("NanumSquareB.ttf", 33), BLUE, 5.5)
    track(d, (166, 792), TIT, f("NanumSquareB.ttf", 96), (255, 255, 255))
    track(d, (170, 906), SUB, f("NanumSquareR.ttf", 41), (224, 232, 240), 1.2)
    return im


def top(im):                                    # 글자를 왼쪽 위에
    im = scrim(im, 560, 235, up=True)
    d = ImageDraw.Draw(im)
    d.rectangle([120, 132, 127, 292], fill=BLUE)
    track(d, (170, 128), EYE, f("NanumSquareB.ttf", 33), BLUE, 5.5)
    track(d, (166, 176), TIT, f("NanumSquareB.ttf", 96), (255, 255, 255))
    track(d, (170, 290), SUB, f("NanumSquareR.ttf", 41), (224, 232, 240), 1.2)
    return im


def build(name):
    if name == "1":  return low(grade(grab(1.6, (0.16, 0.0, 1.00, 0.86))))
    if name == "2":  return top(grade(grab(1.6, (0.16, 0.0, 1.00, 0.86))))
    if name == "3":  return low(grade(grab(3.6, (0.10, 0.0, 0.96, 0.90))))
    if name == "4":
        img = Image.open("assets/4-1_마지막화면_학교홍보.png").convert("RGB")
        return low(img.resize((W, H), Image.LANCZOS))
    raise SystemExit(f"모르는 후보: {name}")


NAMES = {"1": "1_분리수거장_와이드_글자아래",
         "2": "2_분리수거장_와이드_글자위",
         "3": "3_분리수거장_바짝_글자아래",
         "4": "4_마지막학교사진"}

if __name__ == "__main__":
    if len(sys.argv) > 1:                       # 고른 것을 굽는다
        k = sys.argv[1]
        build(k).save("build/title.png")
        print(f"→ build/title.png  ({NAMES[k]})")
    else:                                       # 후보를 모두 만든다
        out = pathlib.Path("out/첫화면후보"); out.mkdir(parents=True, exist_ok=True)
        for p in out.glob("*.jpg"): p.unlink()
        ims = []
        for k, nm in NAMES.items():
            im = build(k); im.save(out / f"{nm}.jpg", quality=93)
            ims.append(im); print(" ", nm)
        sheet = Image.new("RGB", (W, H), (18, 18, 18))
        for i, im in enumerate(ims):
            sheet.paste(im.resize((W//2-6, H//2-6), Image.LANCZOS),
                        ((i % 2)*(W//2)+3, (i//2)*(H//2)+3))
        sheet.save(out / "_모아보기.jpg", quality=92)
        print("  _모아보기.jpg")
