#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC Part 5 검산 해설지 — 렌더링 엔진 (자체 완결형)
각 문항: 문장(빈칸) + 보기 4개(정답 강조) + 정답 배지 + 검산표시 + 해설 + 어휘
빈칸 토큰: '▢'
"""
import html as _html

LETTERS = ["A", "B", "C", "D"]
BLANK = "▢"


def esc(s):
    return _html.escape(str(s))


def letter(i):
    return LETTERS[i]


BASE_CSS = r"""
:root{ --ink:#1a1a1a; --muted:#555; --line:#c9c9c9; --soft:#e9e9e9;
  --accent:#1f4e79; --accent2:#c0392b; --ok:#1e7d34; }
*{box-sizing:border-box;}
@page{ size:A4; margin:15mm 14mm 16mm 14mm; }
html,body{margin:0;padding:0;}
body{ font-family:'Noto Sans CJK KR','Noto Sans',sans-serif; color:var(--ink);
  font-size:10.2pt; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.en{ font-family:'Noto Serif CJK KR','Georgia',serif; }
h1,h2,h3{margin:0;}
.cover{ text-align:center; padding-top:52mm; page-break-after:always;}
.cover .kicker{letter-spacing:6px; color:var(--accent); font-weight:700; font-size:12pt;}
.cover .title{font-size:30pt; font-weight:800; margin:10px 0 4px; letter-spacing:-1px;}
.cover .sub{font-size:14pt; color:var(--muted); margin-bottom:36px;}
.cover .meta{display:inline-block; text-align:left; border-top:2px solid var(--ink);
  border-bottom:2px solid var(--ink); padding:14px 26px; margin-top:6px; font-size:10.5pt;}
.cover .meta b{display:inline-block; width:120px; color:var(--accent);}
.cover .foot{margin-top:52px; color:var(--muted); font-size:9.5pt;}

.section-banner{ background:var(--accent); color:#fff; padding:9px 14px; margin:16px 0 6px;
  border-radius:4px; page-break-after:avoid;}
.section-banner .big{font-size:14pt; font-weight:800; letter-spacing:.5px;}
.section-banner .small{font-size:10pt; color:rgba(255,255,255,.9);}

.note{ background:#f5f7fa; border-left:3px solid var(--accent); padding:9px 13px;
  margin:8px 0 14px; font-size:9.6pt; }
.note b{color:var(--accent);}
.verify{ background:#eafaef; border:1px solid #b7e4c4; border-radius:6px; padding:11px 14px;
  margin:8px 0 16px; font-size:9.8pt;}
.verify .vt{ font-weight:800; color:var(--ok); font-size:10.5pt; margin-bottom:4px;}

.ans-table{ border-collapse:collapse; width:100%; margin:6px 0 16px; font-size:9.3pt;}
.ans-table th,.ans-table td{ border:1px solid #cbcbcb; padding:3px 5px; text-align:center;}
.ans-table th{ background:var(--accent); color:#fff; }
.ans-table td.n{ color:#888; } .ans-table td.a{ font-weight:800; color:var(--accent2); }

.sol{ margin:0 0 12px; padding:0 0 10px; border-bottom:1px dashed var(--soft);
  page-break-inside:avoid;}
.sol .qline{ margin-bottom:3px;}
.sol .qn{ font-weight:800; color:var(--ink); margin-right:5px;}
.sol .stem{ }
.blank{ display:inline-block; min-width:52px; border-bottom:1.3px solid #333; text-align:center;}
.opts{ margin:3px 0 4px; color:#333; }
.opts .o{ margin-right:16px; white-space:nowrap; display:inline-block;}
.opts .o .l{ font-weight:700; color:#666; margin-right:3px;}
.opts .o.correct{ color:var(--ok); font-weight:800;}
.opts .o.correct .l{ color:var(--ok);}
.badge-row{ margin:3px 0; }
.badge{ font-weight:800; color:#fff; background:var(--accent2); border-radius:3px;
  padding:1px 8px; font-size:9.6pt; margin-right:7px;}
.tag{ font-size:8.4pt; background:#eef2f6; color:var(--accent); border:1px solid #d5e0ea;
  border-radius:10px; padding:1px 9px; margin-right:6px;}
.chk{ font-size:8.4pt; background:#eafaef; color:var(--ok); border:1px solid #b7e4c4;
  border-radius:10px; padding:1px 9px; font-weight:700;}
.flag{ font-size:8.4pt; background:#fff4e5; color:#a15c00; border:1px solid #f0d0a0;
  border-radius:10px; padding:1px 9px; font-weight:700;}
.expl{ margin:2px 0 0; }
.vocab{ margin:3px 0 0; font-size:9.1pt; color:#333;}
.vocab .th{ font-weight:800; color:var(--accent);}
.vocab .w{ font-weight:700;}
.warn{ margin:3px 0 0; font-size:9.1pt; color:#a15c00;}
.warn .th{ font-weight:800;}
.pagebreak{page-break-before:always;}
.small{font-size:9pt;color:var(--muted);}
"""


def stem_html(text):
    return esc(text).replace(BLANK, '<span class="blank">&nbsp;&nbsp;&nbsp;</span>')


def opts_inline(opts, ans):
    cells = []
    for i, o in enumerate(opts):
        cls = "o correct" if i == ans else "o"
        cells.append(f'<span class="{cls}"><span class="l">({letter(i)})</span>{esc(o)}</span>')
    return '<div class="opts en">' + "".join(cells) + "</div>"


def vocab_html(vlist):
    if not vlist:
        return ""
    items = " · ".join(f'<span class="w">{esc(w)}</span> {esc(m)}' for w, m in vlist)
    return f'<div class="vocab"><span class="th">어휘</span> {items}</div>'


def solution_block(it):
    ans = it["ans"]
    chk = '<span class="chk">검산 ✓ 원본정답 일치</span>' if it.get("verified") else \
          ('<span class="chk">자체정답 확정</span>' if it.get("selfkey") else "")
    tag = f'<span class="tag">{esc(it["type"])}</span>' if it.get("type") else ""
    warn = ""
    if it.get("warn"):
        warn = f'<div class="warn"><span class="th">참고</span> {it["warn"]}</div>'
    return (
        '<div class="sol">'
        f'<div class="qline en"><span class="qn">{it["no"]}.</span>'
        f'<span class="stem">{stem_html(it["text"])}</span></div>'
        f'{opts_inline(it["opts"], ans)}'
        '<div class="badge-row">'
        f'<span class="badge">정답 ({letter(ans)})</span>{tag}{chk}'
        '</div>'
        f'<div class="expl">{it["expl"]}</div>'
        f'{vocab_html(it.get("vocab"))}'
        f'{warn}'
        '</div>'
    )


def solutions(items):
    return "\n".join(solution_block(it) for it in items)


def answer_table(items, cols=10):
    rows = []
    for i in range(0, len(items), cols):
        chunk = items[i:i + cols]
        nrow = "".join(f'<td class="n">{it["no"]}</td>' for it in chunk)
        arow = "".join(f'<td class="a">{letter(it["ans"])}</td>' for it in chunk)
        rows.append(f"<tr><th>No.</th>{nrow}</tr><tr><th>정답</th>{arow}</tr>")
    return f'<table class="ans-table">{"".join(rows)}</table>'


def banner(big, small=""):
    s = f'<span class="small">{esc(small)}</span>' if small else ""
    return f'<div class="section-banner"><span class="big">{esc(big)}</span> {s}</div>'


def html_doc(title, body):
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            f'<title>{esc(title)}</title><style>{BASE_CSS}</style></head>'
            f'<body>{body}</body></html>')
