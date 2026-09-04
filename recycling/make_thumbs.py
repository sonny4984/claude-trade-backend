#!/usr/bin/env python3
"""썸네일 다섯 안. 아이들이 실제로 찍은 화면만 쓴다.

AI 티가 나던 까닭은 바탕에 깔았던 학교 홍보 그림이 AI 로 만든 것이어서다.
실제로 찍은 사진은 그 학교, 그 벽, 그 바구니라서 흉내 낼 수가 없다.

색은 학교 분리수거함 라벨에서 그대로 가져왔다.
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

W, H = 1920, 1080
S = pathlib.Path("build/still")
OUT = pathlib.Path("out/썸네일후보"); OUT.mkdir(parents=True, exist_ok=True)
NB  = "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf"
NR  = "/usr/share/fonts/truetype/nanum/NanumSquareR.ttf"
NGB = "/usr/share/fonts/truetype/nanum/NanumBarunGothicBold.ttf"
NG  = "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf"

BLUE, GREEN, YELLOW, GREY = (27,95,168), (46,125,70), (216,146,20), (90,103,113)
INK = (17,24,31)
T1, T2 = "Small Actions, Big Changes", "Shinjeong's Recycling Revolution"
SCH = "SHINJEONG MIDDLE SCHOOL"
f = lambda p,s: ImageFont.truetype(p,s)


def cover(p, w, h, crop_y=0.5):
    im = Image.open(p).convert("RGB")
    r = max(w/im.width, h/im.height)
    im = im.resize((round(im.width*r), round(im.height*r)), Image.LANCZOS)
    x = (im.width-w)//2
    y = int((im.height-h)*crop_y)
    return im.crop((x, y, x+w, y+h))


def shade(im, box, a0, a1, horiz=False):
    """한쪽에서 다른 쪽으로 어두워지는 막. 글자가 사진 위에서 읽히게 한다."""
    x0,y0,x1,y1 = box
    g = Image.new("L", (x1-x0, y1-y0))
    d = ImageDraw.Draw(g)
    n = (x1-x0) if horiz else (y1-y0)
    for i in range(n):
        v = int(a0 + (a1-a0)*i/max(1,n-1))
        if horiz: d.line([(i,0),(i,y1-y0)], fill=v)
        else:     d.line([(0,i),(x1-x0,i)], fill=v)
    im.paste(Image.new("RGB",(x1-x0,y1-y0),(0,0,0)), (x0,y0), g)
    return im


# ── 1. 다큐 스틸 ──────────────────────────────────────────
def one():
    im = cover(S/"sort.png", W, H, 0.45)
    im = shade(im, (0,430,W,H), 0, 205)
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([120,742,128,900], fill=BLUE+(255,))
    d.text((166,738), SCH, font=f(NB,34), fill=(150,205,255,255))
    d.text((166,796), T1, font=f(NB,86), fill=(255,255,255,255))
    d.text((166,900), T2, font=f(NR,42), fill=(196,214,228,255))
    return im


# ── 2. 접지 격자 ──────────────────────────────────────────
def two():
    im = Image.new("RGB",(W,H),(246,247,248))
    g, top = 6, 0
    cw, ch = (W-g)//2, (600-g)//2
    for i,(n,cy) in enumerate([("basket",.5),("shed",.5),("empty",.45),("sort",.45)]):
        x = (i%2)*(cw+g); y = top+(i//2)*(ch+g)
        im.paste(cover(S/f"{n}.png", cw, ch, cy), (x,y))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([0,600,W,H], fill=(255,255,255,255))
    for i,c in enumerate([BLUE,GREEN,YELLOW,GREY]):
        d.rectangle([120+i*30,652,120+i*30+20,672], fill=c+(255,))
    d.text((120,706), SCH, font=f(NB,32), fill=BLUE+(255,))
    d.text((120,760), T1, font=f(NB,92), fill=INK+(255,))
    d.text((120,872), T2, font=f(NR,44), fill=(105,118,128,255))
    d.line([(120,960),(W-120,960)], fill=(214,220,226,255), width=2)
    d.text((120,982), "작은 행동, 큰 변화", font=f(NG,32), fill=(140,150,158,255))
    return im


# ── 3. 활자 우선 ──────────────────────────────────────────
def three():
    im = Image.new("RGB",(W,H),BLUE)
    im.paste(cover(S/"basket.png", 720, H, 0.5), (W-720,0))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([W-720,0,W-714,H], fill=(255,255,255,255))
    d.text((132,250), SCH, font=f(NB,34), fill=(150,200,246,255))
    d.line([(132,318),(430,318)], fill=(255,255,255,255), width=4)
    for i,ln in enumerate(["Small Actions,","Big Changes"]):
        d.text((132,366+i*118), ln, font=f(NB,104), fill=(255,255,255,255))
    d.text((132,634), T2, font=f(NR,44), fill=(178,213,246,255))
    d.text((132,716), "작은 행동, 큰 변화", font=f(NG,34), fill=(140,186,228,255))
    return im


# ── 4. 네 단계 띠 ─────────────────────────────────────────
def four():
    """네 단계를 세로 네 칸으로. 가로 띠 위에 흰 막을 덮었더니 사진이 다 죽었다."""
    im = Image.new("RGB",(W,H),(250,250,251))
    names = ["empty","rinse","label","sort"]   # ①C ②A ③B ④교실바구니
    caps  = [("EMPTY","비우고"),("RINSE","헹구고"),("REMOVE","떼고"),("SORT","분리하고")]
    cols  = [BLUE,GREEN,YELLOW,GREY]
    g, top, colh = 5, 0, 690
    cw = (W-g*3)//4
    for i,(n,(en,ko),col) in enumerate(zip(names,caps,cols)):
        x = i*(cw+g)
        st = cover(S/f"{n}.png", cw, colh, 0.45)
        im.paste(st,(x,top))
        d = ImageDraw.Draw(im,"RGBA")
        d.rectangle([x,top+colh-112,x+cw,top+colh], fill=col+(234,))
        d.text((x+26,top+colh-96), en, font=f(NB,34), fill=(255,255,255,255))
        d.text((x+26,top+colh-52), ko, font=f(NG,26), fill=(255,255,255,210))
    d = ImageDraw.Draw(im,"RGBA")
    d.text((132,754), SCH, font=f(NB,32), fill=BLUE+(255,))
    d.text((132,806), T1, font=f(NB,92), fill=INK+(255,))
    d.text((132,918), T2, font=f(NR,42), fill=(105,118,128,255))
    return im


# ── 5. 현장 클로즈업 ──────────────────────────────────────
def five():
    im = Image.open(S/"basket.png").convert("RGB")
    im = im.resize((2688,1512), Image.LANCZOS).crop((420,300,2340,1380))
    im = ImageEnhance.Color(im).enhance(1.06)
    v = Image.new("L",(W,H),0); dv = ImageDraw.Draw(v)
    dv.ellipse([-460,-320,W+460,H+320], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(220))
    im = Image.composite(im, ImageEnhance.Brightness(im).enhance(0.52), v)
    im = shade(im, (0,0,W,300), 175, 0)
    d = ImageDraw.Draw(im,"RGBA")
    for i,c in enumerate([BLUE,GREEN,YELLOW,GREY]):
        d.rectangle([132+i*26,86,132+i*26+18,104], fill=c+(255,))
    d.text((132,132), SCH, font=f(NB,32), fill=(198,222,244,255))
    d.text((132,182), T1, font=f(NB,88), fill=(255,255,255,255))
    d.text((132,292), T2, font=f(NR,42), fill=(206,220,232,255))
    return im


for i,fn in enumerate((one,two,three,four,five),1):
    p = OUT/f"{i}.jpg"
    fn().save(p, quality=93)
    print("  %d번 → %s"%(i,p))
