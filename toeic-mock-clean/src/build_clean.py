#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""간결 디자인 모의고사 — 문제집(문제만) / 해설지(정답+상세해설) 분리 빌드."""
import os, subprocess
from collections import Counter

import render_clean as R
from data_p5 import part5
from data_p6 import part6
from data_p7_single import p7_single
from data_p7_double import p7_double
from data_p7_triple import p7_triple

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHROME = "/opt/pw-browsers/chromium"

DIR5 = ("A word or phrase is missing in each of the sentences below. Four answer choices are "
        "given below each sentence. Select the best answer to complete the sentence.")
DIR6 = ("Read the texts that follow. A word, phrase, or sentence is missing in parts of each text. "
        "Four answer choices are given for each blank. Select the best answer to complete the text.")
DIR7 = ("In this part you will read a selection of texts. Each text or set of texts is followed by "
        "several questions. Select the best answer for each question.")

ALL_Q = (part5
         + [q for s in part6 for q in s["questions"]]
         + [q for s in p7_single for q in s["questions"]]
         + [q for s in p7_double for q in s["questions"]]
         + [q for s in p7_triple for q in s["questions"]])


def cover(sub):
    return (f'<div class="cover"><div class="t">TOEIC Reading</div>'
            f'<div class="t" style="font-size:20pt;margin-top:2px">Practice Test 1</div>'
            f'<div class="rule"></div><div class="s">{sub}</div>'
            f'<div class="m" style="margin-top:26px">Part 5 · 6 · 7 &nbsp;|&nbsp; 문항 101–200 (100문항)</div>'
            f'</div>')


def build_problem():
    b = [cover("문제집 · Questions")]
    b += [R.parthead("PART 5", "Incomplete Sentences"),
          f'<div class="dir"><b>Directions:</b> {DIR5}</div>', R.problem_p5(part5),
          '<div class="pagebreak"></div>']
    b += [R.parthead("PART 6", "Text Completion"),
          f'<div class="dir"><b>Directions:</b> {DIR6}</div>', R.problem_p6(part6),
          '<div class="pagebreak"></div>']
    b += [R.parthead("PART 7", "Reading Comprehension"),
          f'<div class="dir"><b>Directions:</b> {DIR7}</div>',
          R.problem_p7(p7_single), '<div class="pagebreak"></div>',
          R.problem_p7(p7_double), '<div class="pagebreak"></div>',
          R.problem_p7(p7_triple)]
    b += ['<div style="margin-top:16px;font-weight:700">This is the end of the test.</div>',
          '<div class="small" style="margin-top:4px">정답과 해설은 <b>해설지</b>에서 확인하세요.</div>']
    return R.doc("TOEIC Practice Test 1 — 문제집", "\n".join(b))


def build_answer():
    b = [cover("해설지 · Answers &amp; Explanations")]
    b += [R.parthead("정답표", "Answer Key (101–200)"),
          R.answer_key_table([(q["no"], q["ans"]) for q in ALL_Q]),
          '<div class="pagebreak"></div>']
    b += [R.parthead("PART 5 해설", "Incomplete Sentences"), R.sol_p5(part5),
          '<div class="pagebreak"></div>']
    b += [R.parthead("PART 6 해설", "Text Completion"), R.sol_p6(part6),
          '<div class="pagebreak"></div>']
    b += [R.parthead("PART 7 해설", "Reading Comprehension"),
          '<div class="subhead">Single Passages (147–175)</div>', R.sol_p7(p7_single),
          '<div class="pagebreak"></div>',
          '<div class="subhead">Double Passages (176–185)</div>', R.sol_p7(p7_double),
          '<div class="pagebreak"></div>',
          '<div class="subhead">Triple Passages (186–200)</div>', R.sol_p7(p7_triple)]
    return R.doc("TOEIC Practice Test 1 — 해설지", "\n".join(b))


def render_pdf(html_path, pdf_path):
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu",
                    "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", html_path],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    ph = os.path.join(OUT, "src", "_problem.html")
    ah = os.path.join(OUT, "src", "_answer.html")
    pp = os.path.join(OUT, "TOEIC_실전모의고사1_문제집.pdf")
    ap = os.path.join(OUT, "TOEIC_실전모의고사1_해설지.pdf")
    open(ph, "w", encoding="utf-8").write(build_problem())
    open(ah, "w", encoding="utf-8").write(build_answer())
    render_pdf(ph, pp)
    render_pdf(ah, ap)
    dist = Counter("ABCD"[q["ans"]] for q in ALL_Q)
    print(f"총 {len(ALL_Q)}문항 | 정답분포 {dict(sorted(dist.items()))}")
    print("문제집:", pp)
    print("해설지:", ap)


if __name__ == "__main__":
    main()
