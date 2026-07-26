#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC RC 실전 모의고사 - 렌더링 엔진
데이터(data_*.py)를 받아 문제집/해설집 HTML을 생성한다.
HTML -> PDF 변환은 build.py에서 Chromium(headless)으로 수행.
"""
import html as _html

LETTERS = ["A", "B", "C", "D"]


def esc(s):
    return _html.escape(str(s))


def letter(i):
    return LETTERS[i]


# ---------------------------------------------------------------------------
# 공통 CSS
# ---------------------------------------------------------------------------
BASE_CSS = r"""
:root{
  --ink:#1a1a1a; --muted:#555; --line:#c9c9c9; --soft:#e8e8e8;
  --accent:#1f4e79; --accent2:#c0392b; --hl:#fff3bf;
}
*{box-sizing:border-box;}
@page{ size:A4; margin:16mm 15mm 18mm 15mm; }
html,body{margin:0;padding:0;}
body{
  font-family:'Noto Sans CJK KR','Noto Sans',sans-serif;
  color:var(--ink); font-size:10.3pt; line-height:1.5;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.en{ font-family:'Noto Serif CJK KR','Georgia',serif; }
h1,h2,h3{margin:0;}
.cover{ text-align:center; padding-top:60mm; page-break-after:always;}
.cover .kicker{letter-spacing:6px; color:var(--accent); font-weight:700; font-size:12pt;}
.cover .title{font-size:34pt; font-weight:800; margin:10px 0 4px; letter-spacing:-1px;}
.cover .sub{font-size:15pt; color:var(--muted); margin-bottom:40px;}
.cover .meta{display:inline-block; text-align:left; border-top:2px solid var(--ink);
  border-bottom:2px solid var(--ink); padding:14px 26px; margin-top:10px; font-size:11pt;}
.cover .meta b{display:inline-block; width:120px; color:var(--accent);}
.cover .foot{margin-top:60px; color:var(--muted); font-size:9.5pt;}

.section-banner{
  background:var(--accent); color:#fff; padding:9px 14px; margin:0 0 6px;
  border-radius:4px; page-break-after:avoid;
}
.section-banner .big{font-size:15pt; font-weight:800; letter-spacing:1px;}
.section-banner .small{font-size:10pt; color:rgba(255,255,255,.9);}
.directions{
  font-style:italic; color:#333; background:#f5f7fa; border-left:3px solid var(--accent);
  padding:8px 12px; margin:6px 0 14px; font-size:9.6pt; page-break-inside:avoid;
}
.directions b{font-style:normal;}

/* Part 5 / 6 questions */
.q{ margin:0 0 11px; page-break-inside:avoid; }
.q .stem{ margin-bottom:3px; }
.q .num{ font-weight:800; color:var(--ink); margin-right:5px; }
.opts{ margin:2px 0 0 20px; }
.opts.grid{ display:grid; grid-template-columns:1fr 1fr; column-gap:24px; row-gap:1px; }
.opt{ margin:1px 0; }
.opt .lab{ font-weight:700; margin-right:5px; }
.blank{ display:inline-block; min-width:74px; border-bottom:1.3px solid #333;
  text-align:center; font-weight:700; color:var(--accent); }

/* passages */
.passage-intro{ font-style:italic; color:#333; margin:16px 0 7px; font-size:9.8pt;
  page-break-after:avoid; }
.doc{
  border:1px solid #bbb; border-radius:5px; padding:13px 16px; margin:0 0 10px;
  background:#fcfcfc; page-break-inside:avoid;
}
.doc.wide{page-break-inside:auto;}
.doc-label{ display:inline-block; font-size:8pt; letter-spacing:1px; text-transform:uppercase;
  color:#fff; background:#7a7a7a; padding:1px 7px; border-radius:3px; margin-bottom:7px;}
.doc .hd{ border-bottom:1px solid #ddd; padding-bottom:6px; margin-bottom:8px; font-size:9.6pt;}
.doc .hd .row{ display:flex; }
.doc .hd .row .k{ width:64px; color:#666; flex:none; }
.doc p{ margin:0 0 7px; }
.doc .center{text-align:center;}
.doc .big{font-size:12pt; font-weight:800;}
.doc .sig{margin-top:8px;}
.doc table.tbl{ border-collapse:collapse; width:100%; margin:6px 0; font-size:9.4pt;}
.doc table.tbl th,.doc table.tbl td{ border:1px solid #cfcfcf; padding:4px 7px; text-align:left;}
.doc table.tbl th{ background:#eef2f6; }
.chat{ }
.chat .line{ margin:3px 0; }
.chat .who{ font-weight:700; }
.chat .time{ color:#999; font-size:8.5pt; margin-left:6px;}
.ins{ background:var(--hl); }  /* sentence-insertion marker area */

.q-block{ margin-top:4px; }
.pb-note{ font-size:9pt; color:#888; text-align:right; margin:-4px 0 10px;}

/* answer key */
.ans-table{ border-collapse:collapse; width:100%; margin:8px 0 18px; font-size:9.6pt;}
.ans-table th,.ans-table td{ border:1px solid #cbcbcb; padding:4px 6px; text-align:center;}
.ans-table th{ background:var(--accent); color:#fff; }
.ans-table td.n{ color:#888; }
.ans-table td.a{ font-weight:800; color:var(--accent2); }

/* explanations */
.exp{ margin:0 0 13px; padding:0 0 11px; border-bottom:1px dashed var(--soft);
  page-break-inside:avoid;}
.exp .top{ display:flex; align-items:baseline; gap:9px; margin-bottom:3px;}
.exp .qn{ font-weight:800; font-size:11pt; }
.exp .ans{ font-weight:800; color:#fff; background:var(--accent2); border-radius:3px;
  padding:0 8px; font-size:10pt;}
.exp .tag{ font-size:8.4pt; background:#eef2f6; color:var(--accent); border:1px solid #d5e0ea;
  border-radius:10px; padding:1px 9px; }
.exp .stem{ color:#333; font-size:9.5pt; margin-bottom:4px; }
.exp .body{ }
.exp .body p{ margin:3px 0; }
.exp .why{ }
.exp .lab{ font-weight:800; color:var(--accent); }
.exp .opt-why{ margin:2px 0 0 8px; font-size:9.5pt; color:#444;}
.exp .opt-why .ok{ color:#1e7d34; font-weight:700;}
.exp .opt-why .no{ color:#a23; }
.trans{ background:#f7f9fb; border:1px solid #e4e9ee; border-radius:5px; padding:9px 12px;
  margin:6px 0 12px; font-size:9.5pt; page-break-inside:avoid;}
.trans .th{ font-weight:800; color:var(--accent); margin-bottom:3px; font-size:9.3pt;}
.vocab{ margin:4px 0 0; font-size:9.2pt; color:#333;}
.vocab .th{ font-weight:800; color:var(--accent); }
.vocab .item{ margin-right:4px; }
.vocab .w{ font-weight:700; }
.set-head{ font-weight:800; color:var(--accent); font-size:11pt; margin:18px 0 4px;
  border-top:2px solid var(--accent); padding-top:8px; page-break-after:avoid;}
.solstem{ font-family:'Noto Serif CJK KR','Georgia',serif; margin-bottom:1px; }
.solstem .num{ font-weight:800; margin-right:5px; }
.solblank{ display:inline-block; min-width:46px; border-bottom:1.2px solid #333; }
.solopts{ font-family:'Noto Serif CJK KR','Georgia',serif; margin:1px 0 3px; color:#333; }
.solopts .oc{ margin-right:15px; display:inline-block; }
.solopts .oc .l{ font-weight:700; color:#777; margin-right:2px; }
.solopts .oc.right{ color:#1e7d34; font-weight:800; }
.solopts .oc.right .l{ color:#1e7d34; }
.small{font-size:9pt;color:var(--muted);}
hr.soft{border:none;border-top:1px solid var(--soft);margin:14px 0;}
.pagebreak{page-break-before:always;}
"""


# ---------------------------------------------------------------------------
# 옵션 렌더
# ---------------------------------------------------------------------------
def render_opts(opts, grid=False, en=True):
    cls = "opts grid" if grid else "opts"
    enc = " en" if en else ""
    rows = []
    for i, o in enumerate(opts):
        rows.append(f'<div class="opt{enc}"><span class="lab">({letter(i)})</span>{esc(o)}</div>')
    return f'<div class="{cls}">' + "".join(rows) + "</div>"


# ---------------------------------------------------------------------------
# 문제집: Part 5
# ---------------------------------------------------------------------------
def problem_part5(items):
    out = []
    for it in items:
        stem = esc(it["text"]).replace("-------",
                 '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;</span>')
        grid = max(len(str(o)) for o in it["opts"]) <= 16
        out.append(
            '<div class="q">'
            f'<div class="stem en"><span class="num">{it["no"]}.</span>{stem}</div>'
            f'{render_opts(it["opts"], grid=grid)}'
            '</div>'
        )
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 문제집: Part 6 지문 + 문항
# ---------------------------------------------------------------------------
def _p6_passage_problem(pset):
    body = pset["passage"]
    for qq in pset["questions"]:
        n = qq["no"]
        if qq.get("insert"):
            marker = f'<span class="blank" style="min-width:150px">&nbsp;({n})&nbsp;</span>'
        else:
            marker = f'<span class="blank">&nbsp;({n})&nbsp;</span>'
        body = body.replace(f"[[{n}]]", marker)
    label = pset.get("doc", "").upper()
    lab = f'<span class="doc-label">{esc(label)}</span>' if label else ""
    return f'<div class="doc">{lab}{body}</div>'


def problem_part6(sets):
    out = []
    for pset in sets:
        out.append(f'<div class="passage-intro en">{esc(pset["intro"])}</div>')
        out.append(_p6_passage_problem(pset))
        qs = []
        for qq in pset["questions"]:
            grid = (not qq.get("insert")) and max(len(str(o)) for o in qq["opts"]) <= 16
            qs.append(
                '<div class="q">'
                f'<div class="stem"><span class="num">{qq["no"]}.</span></div>'
                f'{render_opts(qq["opts"], grid=grid)}'
                '</div>'
            )
        out.append('<div class="q-block">' + "".join(qs) + "</div>")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 문제집: Part 7 지문 + 문항
# ---------------------------------------------------------------------------
def _p7_passages_html(pset):
    parts = []
    for p in pset["passages"]:
        label = p.get("doc", "").upper()
        lab = f'<span class="doc-label">{esc(label)}</span>' if label else ""
        parts.append(f'<div class="doc">{lab}{p["html"]}</div>')
    return "".join(parts)


def problem_part7(sets):
    out = []
    for pset in sets:
        out.append(f'<div class="passage-intro en">{esc(pset["intro"])}</div>')
        out.append(_p7_passages_html(pset))
        qs = []
        for qq in pset["questions"]:
            grid = max(len(str(o)) for o in qq["opts"]) <= 20
            qs.append(
                '<div class="q">'
                f'<div class="stem en"><span class="num">{qq["no"]}.</span>{esc(qq["stem"])}</div>'
                f'{render_opts(qq["opts"], grid=grid)}'
                '</div>'
            )
        out.append('<div class="q-block">' + "".join(qs) + "</div>")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 해설집: 정답표
# ---------------------------------------------------------------------------
def answer_table(all_items, cols=10):
    # all_items: list of (no, ans_index)
    rows_html = []
    for i in range(0, len(all_items), cols):
        chunk = all_items[i:i + cols]
        nrow = "".join(f'<td class="n">{n}</td>' for n, _ in chunk)
        arow = "".join(f'<td class="a">{letter(a)}</td>' for _, a in chunk)
        rows_html.append(f"<tr><th>No.</th>{nrow}</tr><tr><th>Ans</th>{arow}</tr>")
    return f'<table class="ans-table">{"".join(rows_html)}</table>'


# ---------------------------------------------------------------------------
# 해설집: 어휘/보기별 해설 헬퍼
# ---------------------------------------------------------------------------
def _vocab(vlist):
    if not vlist:
        return ""
    items = " · ".join(f'<span class="item"><span class="w">{esc(w)}</span> {esc(m)}</span>'
                       for w, m in vlist)
    return f'<div class="vocab"><span class="th">어휘</span> {items}</div>'


def _opt_why(qq):
    ow = qq.get("opt_why")
    if not ow:
        return ""
    rows = []
    for i, txt in enumerate(ow):
        mark = "ok" if i == qq["ans"] else "no"
        sym = "○" if i == qq["ans"] else "×"
        rows.append(f'<div class="opt-why"><span class="{mark}">({letter(i)}) {sym}</span> {esc(txt)}</div>')
    return "".join(rows)


def _exp_block(qq, show_stem=True):
    ans = letter(qq["ans"])
    answord = qq["opts"][qq["ans"]]
    tag = qq.get("type", "")
    stem = ""
    if show_stem and qq.get("stem"):
        stem = f'<div class="stem en">Q. {esc(qq["stem"])}</div>'
    body = f'<p>{qq["expl"]}</p>' if qq.get("expl") else ""
    ow = _opt_why(qq)
    voc = _vocab(qq.get("vocab"))
    return (
        '<div class="exp">'
        '<div class="top">'
        f'<span class="qn">{qq["no"]}</span>'
        f'<span class="ans">정답 ({ans}) {esc(answord)}</span>'
        + (f'<span class="tag">{esc(tag)}</span>' if tag else "")
        + '</div>'
        f'{stem}'
        f'<div class="body">{body}{ow}</div>'
        f'{voc}'
        '</div>'
    )


# ---------------------------------------------------------------------------
# 해설집: Part 5
# ---------------------------------------------------------------------------
def _p5_answer_block(it):
    ans = it["ans"]
    stem = esc(it["text"]).replace("-------",
             '<span class="solblank">&nbsp;&nbsp;&nbsp;</span>')
    opts = []
    for i, o in enumerate(it["opts"]):
        cls = "oc right" if i == ans else "oc"
        opts.append(f'<span class="{cls}"><span class="l">({letter(i)})</span>{esc(o)}</span>')
    tag = f'<span class="tag">{esc(it["type"])}</span>' if it.get("type") else ""
    body = f'<p>{it["expl"]}</p>' if it.get("expl") else ""
    ow = _opt_why(it)
    voc = _vocab(it.get("vocab"))
    return (
        '<div class="exp">'
        f'<div class="solstem en"><span class="num">{it["no"]}.</span>{stem}</div>'
        f'<div class="solopts">{"".join(opts)}</div>'
        '<div class="top">'
        f'<span class="ans">정답 ({letter(ans)}) {esc(it["opts"][ans])}</span>{tag}</div>'
        f'<div class="body">{body}{ow}</div>{voc}</div>'
    )


def answer_part5(items):
    return "\n".join(_p5_answer_block(it) for it in items)


def _trans(pset):
    if not pset.get("trans"):
        return ""
    return f'<div class="trans"><div class="th">지문 해석</div>{pset["trans"]}</div>'


def answer_part6(sets):
    out = []
    for idx, pset in enumerate(sets, 1):
        out.append(f'<div class="set-head en">{esc(pset["intro"])}</div>')
        out.append(_trans(pset))
        for qq in pset["questions"]:
            out.append(_exp_block(qq, show_stem=False))
    return "\n".join(out)


def answer_part7(sets):
    out = []
    for pset in sets:
        out.append(f'<div class="set-head en">{esc(pset["intro"])}</div>')
        out.append(_trans(pset))
        for qq in pset["questions"]:
            out.append(_exp_block(qq, show_stem=True))
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 페이지 조립
# ---------------------------------------------------------------------------
def html_doc(title, body):
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        f'<title>{esc(title)}</title><style>{BASE_CSS}</style></head>'
        f'<body>{body}</body></html>'
    )


def banner(big, small):
    return (f'<div class="section-banner"><span class="big">{esc(big)}</span> '
            f'<span class="small">{esc(small)}</span></div>')
