#!/usr/bin/env python3
"""제안서 body.html 에 폰트를 심어 proposal.html 을 만든다.

Artifact 는 외부 폰트 요청이 막혀 있어, 쓰인 글자만 남긴 Pretendard 를
본문에 통째로 넣는다. 그래야 어디서 열어도 같은 글꼴로 보인다.
"""
import base64, pathlib
from fontTools import subset

D = pathlib.Path(__file__).parent
FD = D.parent / "production" / "fonts"
body = (D / "body.html").read_text(encoding="utf8")
used = set(body) | set("0123456789.·—’“”%()[]/→")

faces = []
for w, f in ((900, "Black"), (800, "ExtraBold"), (700, "Bold"), (400, "Regular")):
    src = FD / f"Pretendard-{f}.otf"
    if not src.exists():
        print(f"  건너뜀: {src} 없음")
        continue
    opt = subset.Options(flavor="woff2", desubroutinize=True,
                         layout_features=["kern", "liga"])
    fnt = subset.load_font(str(src), opt)
    s = subset.Subsetter(options=opt)
    s.populate(text="".join(sorted(used)))
    s.subset(fnt)
    tmp = D / f"_{w}.woff2"
    subset.save_font(fnt, str(tmp), opt)
    faces.append("@font-face{{font-family:'PD';font-weight:{};font-display:swap;"
                 "src:url(data:font/woff2;base64,{}) format('woff2')}}"
                 .format(w, base64.b64encode(tmp.read_bytes()).decode()))
    tmp.unlink()

out = body.replace("<style>", "<style>\n" + "\n".join(faces), 1)
(D / "proposal.html").write_text(out, encoding="utf8")
print(f"→ proposal.html  {len(out)/1024:.0f} KB · 폰트 {len(faces)}종 내장")
