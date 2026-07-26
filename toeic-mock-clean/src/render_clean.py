#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
간결한 시판 문제집 스타일 렌더러.
- 문제집: 흑백, 세리프, Part 5 2단, 지문은 얇은 테두리(문서 칩 없음)
- 해설지: 정답 + 해석 + 상세 해설 + 보기 분석 + 어휘 (시중 해설지 형식)
"""
import html as _html
LETTERS = ["A", "B", "C", "D"]


def esc(s): return _html.escape(str(s))
def letter(i): return LETTERS[i]


CSS = r"""
*{box-sizing:border-box;}
@page{ size:A4; margin:17mm 15mm 16mm 15mm; }
html,body{margin:0;padding:0;}
body{ font-family:'Noto Serif CJK KR',serif; color:#111; font-size:10.4pt; line-height:1.46;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.ko{ font-family:'Noto Sans CJK KR',sans-serif; }
h1,h2,h3{margin:0;}

/* cover */
.cover{ text-align:center; padding-top:70mm; page-break-after:always; }
.cover .t{ font-size:26pt; font-weight:700; letter-spacing:-.5px; }
.cover .s{ font-size:13pt; margin-top:8px; color:#333; }
.cover .rule{ width:120px; border-top:2px solid #111; margin:22px auto; }
.cover .m{ font-size:10.5pt; color:#444; }

/* part header */
.parthead{ font-size:13pt; font-weight:700; border-bottom:2px solid #111; padding-bottom:3px;
  margin:0 0 8px; page-break-after:avoid; }
.parthead .sub{ font-size:9.5pt; font-weight:400; color:#555; }
.subhead{ font-weight:700; font-size:10.5pt; margin:14px 0 6px; page-break-after:avoid; }
.dir{ font-style:italic; font-size:9.4pt; color:#333; margin:0 0 12px; }
.dir b{font-style:normal;}

/* Part 5 two-column */
.p5{ column-count:2; column-gap:24px; }
.p5 .q{ break-inside:avoid; page-break-inside:avoid; margin:0 0 11px; }
.q .num{ font-weight:700; margin-right:3px; }
.blank{ display:inline-block; min-width:58px; border-bottom:1px solid #333; vertical-align:baseline; }
.opt{ margin:1px 0 0 15px; text-indent:-15px; padding-left:15px; }
.opt .l{ margin-right:3px; }

/* passages */
.intro{ font-style:italic; margin:15px 0 6px; page-break-after:avoid; }
.passage{ border:1px solid #8a8a8a; padding:11px 13px; margin:0 0 10px; font-size:9.9pt;
  page-break-inside:avoid; }
.passage.long{ page-break-inside:auto; }
.passage p{ margin:0 0 7px; }
.passage .center{ text-align:center; } .passage .big{ font-size:11.5pt; font-weight:700; }
.passage .sig{ margin-top:8px; }
.hd{ border-bottom:1px solid #bbb; padding-bottom:6px; margin-bottom:8px; }
.hd .row{ display:flex; } .hd .row .k{ width:60px; color:#555; flex:none; }
.chat .line{ margin:3px 0; } .chat .who{ font-weight:700; } .chat .time{ color:#888; font-size:8.6pt; margin-left:6px;}
table.tbl{ border-collapse:collapse; width:100%; margin:6px 0; font-size:9.3pt; }
table.tbl th,table.tbl td{ border:1px solid #bbb; padding:4px 7px; text-align:left; }
table.tbl th{ background:#eee; }

.qs .q{ margin:0 0 9px; break-inside:avoid; page-break-inside:avoid; }
.qs .opt{ margin-left:16px; }

/* answer key table */
.akey{ border-collapse:collapse; margin:6px 0 4px; font-size:9.6pt; }
.akey td{ border:1px solid #bbb; padding:3px 8px; text-align:center; }
.akey td.n{ color:#666; } .akey td.a{ font-weight:700; }

/* explanations (해설지) */
.sol{ margin:0 0 13px; padding:0 0 11px; border-bottom:1px solid #e2e2e2; page-break-inside:avoid; }
.sol .qn{ font-weight:700; font-size:11pt; }
.sol .ansmark{ font-weight:700; color:#b30000; margin-left:4px; }
.sol .typ{ font-size:8.6pt; color:#555; border:1px solid #ccc; border-radius:9px; padding:0 7px; margin-left:6px; }
.sol .en{ font-family:'Noto Serif CJK KR',serif; }
.sol .row2{ margin:4px 0 0; }
.sol .lbl{ font-family:'Noto Sans CJK KR',sans-serif; font-weight:700; color:#111; font-size:9.2pt;
  display:inline-block; min-width:34px; }
.sol .kot{ font-family:'Noto Sans CJK KR',sans-serif; font-size:9.7pt; }
.sol .opts .o{ font-family:'Noto Sans CJK KR',sans-serif; font-size:9.4pt; margin:1px 0 0 34px;
  text-indent:-16px; padding-left:16px; }
.sol .opts .o .ok{ color:#127a2e; font-weight:700; } .sol .opts .o .no{ color:#999; }
.setintro{ font-style:italic; font-weight:700; margin:16px 0 3px; border-top:1px solid #111; padding-top:8px; page-break-after:avoid;}
.trans{ font-family:'Noto Sans CJK KR',sans-serif; font-size:9.6pt; background:#f6f6f6; border:1px solid #e2e2e2;
  padding:9px 11px; margin:4px 0 10px; }
.trans .th{ font-weight:700; margin-bottom:3px; }
.small{ font-size:9pt; color:#555; }
.pagebreak{ page-break-before:always; }
"""


# ---------------- 문제집 ----------------
def _stem5(text):
    return esc(text).replace("-------", '<span class="blank">&nbsp;</span>')


def problem_p5(items):
    out = ['<div class="p5">']
    for it in items:
        opts = "".join(
            f'<div class="opt"><span class="l">({letter(i)})</span>{esc(o)}</div>'
            for i, o in enumerate(it["opts"]))
        out.append(f'<div class="q"><span class="num">{it["no"]}.</span>'
                   f'<span class="stem">{_stem5(it["text"])}</span>{opts}</div>')
    out.append('</div>')
    return "\n".join(out)


def _passage_html(p):
    return f'<div class="passage long">{p["html"]}</div>'


def _p6_passage(pset):
    body = pset["passage"]
    for q in pset["questions"]:
        n = q["no"]
        body = body.replace(f"[[{n}]]", f'<span class="blank" style="min-width:{"120px" if q.get("insert") else "40px"}">&nbsp;({n})&nbsp;</span>')
    return f'<div class="passage long">{body}</div>'


def problem_p6(sets):
    out = []
    for pset in sets:
        out.append(f'<div class="intro">{esc(pset["intro"])}</div>')
        out.append(_p6_passage(pset))
        qs = ['<div class="qs">']
        for q in pset["questions"]:
            opts = "".join(f'<div class="opt"><span class="l">({letter(i)})</span>{esc(o)}</div>'
                           for i, o in enumerate(q["opts"]))
            qs.append(f'<div class="q"><span class="num">{q["no"]}.</span>{opts}</div>')
        qs.append('</div>')
        out.append("".join(qs))
    return "\n".join(out)


def problem_p7(sets):
    out = []
    for pset in sets:
        out.append(f'<div class="intro">{esc(pset["intro"])}</div>')
        for p in pset["passages"]:
            out.append(_passage_html(p))
        qs = ['<div class="qs">']
        for q in pset["questions"]:
            opts = "".join(f'<div class="opt"><span class="l">({letter(i)})</span>{esc(o)}</div>'
                           for i, o in enumerate(q["opts"]))
            qs.append(f'<div class="q"><span class="num">{q["no"]}.</span> {esc(q["stem"])}{opts}</div>')
        qs.append('</div>')
        out.append("".join(qs))
    return "\n".join(out)


# ---------------- 해설지 ----------------
def answer_key_table(pairs, cols=10):
    rows = []
    for i in range(0, len(pairs), cols):
        ch = pairs[i:i + cols]
        n = "".join(f'<td class="n">{no}</td>' for no, _ in ch)
        a = "".join(f'<td class="a">{letter(x)}</td>' for _, x in ch)
        rows.append(f'<tr>{n}</tr><tr>{a}</tr>')
    return f'<table class="akey">{"".join(rows)}</table>'


def _vocab(v):
    if not v: return ""
    items = " / ".join(f'<b>{esc(w)}</b> {esc(m)}' for w, m in v)
    return f'<div class="row2 kot"><span class="lbl">어휘</span>{items}</div>'


def _optwhy(q):
    ow = q.get("opt_why")
    if not ow: return ""
    rows = []
    for i, t in enumerate(ow):
        cls = "ok" if i == q["ans"] else "no"
        mark = "○" if i == q["ans"] else "✕"
        rows.append(f'<div class="o"><span class="{cls}">({letter(i)}) {mark}</span> {esc(t)}</div>')
    return f'<div class="row2 opts"><span class="lbl">보기</span></div>' + "".join(rows)


def sol_p5(items):
    out = []
    for it in items:
        trans = f'<div class="row2 kot"><span class="lbl">해석</span>{it["trans"]}</div>' if it.get("trans") else ""
        expl = f'<div class="row2 kot"><span class="lbl">해설</span>{it["expl"]}</div>'
        out.append(
            f'<div class="sol"><span class="qn">{it["no"]}.</span>'
            f'<span class="ansmark">정답 ({letter(it["ans"])}) {esc(it["opts"][it["ans"]])}</span>'
            f'<span class="typ">{esc(it.get("type",""))}</span>'
            f'{trans}{expl}{_optwhy(it)}{_vocab(it.get("vocab"))}</div>')
    return "\n".join(out)


def _sol_reading(sets, show_stem=True):
    out = []
    for pset in sets:
        out.append(f'<div class="setintro en">{esc(pset["intro"])}</div>')
        if pset.get("trans"):
            out.append(f'<div class="trans"><div class="th">지문 해석</div>{pset["trans"]}</div>')
        for q in pset["questions"]:
            stem = f'<div class="row2 en" style="color:#333;font-size:9.5pt">Q. {esc(q["stem"])}</div>' if show_stem and q.get("stem") else ""
            expl = f'<div class="row2 kot"><span class="lbl">해설</span>{q["expl"]}</div>'
            out.append(
                f'<div class="sol"><span class="qn">{q["no"]}.</span>'
                f'<span class="ansmark">정답 ({letter(q["ans"])}) {esc(q["opts"][q["ans"]])}</span>'
                f'<span class="typ">{esc(q.get("type",""))}</span>'
                f'{stem}{expl}{_optwhy(q)}{_vocab(q.get("vocab"))}</div>')
    return "\n".join(out)


def sol_p6(sets): return _sol_reading(sets, show_stem=False)
def sol_p7(sets): return _sol_reading(sets, show_stem=True)


def parthead(title, sub=""):
    s = f'<span class="sub">{esc(sub)}</span>' if sub else ""
    return f'<div class="parthead">{esc(title)} {s}</div>'


def doc(title, body):
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            f'<title>{esc(title)}</title><style>{CSS}</style></head><body>{body}</body></html>')
