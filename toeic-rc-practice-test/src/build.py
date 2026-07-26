#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TOEIC RC 실전 모의고사 Vol.1 — 문제집/해설집 PDF 빌드
$ python3 build.py         # HTML 생성 + Chromium으로 PDF 렌더
"""
import os, subprocess, sys
from collections import Counter

import render as R
from data_p5 import part5
from data_p6 import part6
from data_p7_single import p7_single
from data_p7_double import p7_double
from data_p7_triple import p7_triple

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHROME = "/opt/pw-browsers/chromium"

DIR_P5 = ("A word or phrase is missing in each of the sentences below. Four answer choices "
          "are given below each sentence. Select the best answer to complete the sentence.")
DIR_P6 = ("Read the texts that follow. A word, phrase, or sentence is missing in parts of each "
          "text. Four answer choices are given for each blank. Select the best answer to complete "
          "the text.")
DIR_P7 = ("In this part you will read a selection of texts, such as advertisements, articles, "
          "e-mails, and text-message chains. Each text or set of texts is followed by several "
          "questions. Select the best answer for each question.")

ALL_Q = (part5
         + [q for s in part6 for q in s["questions"]]
         + [q for s in p7_single for q in s["questions"]]
         + [q for s in p7_double for q in s["questions"]]
         + [q for s in p7_triple for q in s["questions"]])


# ---------------------------------------------------------------- covers
def cover(title_lines, subtitle, tag):
    big = "<br>".join(title_lines)
    return f'''
    <div class="cover">
      <div class="kicker">TOEIC&nbsp;&nbsp;READING</div>
      <div class="title">{big}</div>
      <div class="sub">{subtitle}</div>
      <div class="meta">
        <div><b>구성</b> Part 5 · 6 · 7 (문항 101–200, 총 100문항)</div>
        <div><b>권장 시간</b> 75분 (실전 RC 기준)</div>
        <div><b>수록</b> {tag}</div>
        <div><b>난이도</b> 실전 (목표 700–900점)</div>
      </div>
      <div class="foot">Practice Test Vol.1 &nbsp;·&nbsp; 실전 대비용 자체 제작 모의고사</div>
    </div>'''


def info_page():
    return '''
    <div class="section-banner"><span class="big">시험 안내</span>
      <span class="small">Reading Comprehension</span></div>
    <div class="directions" style="font-style:normal">
      <p><b>TOEIC Reading(RC) 구성</b> — 총 100문항, 권장 풀이 시간 75분.</p>
      <p>&bull; <b>Part 5</b> 단문 빈칸 (문법·어휘) … 30문항 (101–130)<br>
         &bull; <b>Part 6</b> 장문 빈칸 … 16문항 (131–146)<br>
         &bull; <b>Part 7</b> 독해 (단일·이중·삼중지문) … 54문항 (147–200)</p>
      <p><b>시간 배분 팁</b> — Part 5·6에 20분 이내, Part 7에 약 55분을 배분하세요. Part 7의
         이중·삼중지문(176–200)은 두 개 이상의 지문을 연결해 푸는 <b>연계추론</b> 문제가 포함됩니다.</p>
      <p><b>이용 방법</b> — 실제 시험처럼 75분 타이머를 맞추고 한 번에 풀어 보세요. 채점 후 반드시
         <b>해설집</b>으로 오답의 근거와 유형을 확인하고, ‘지문 해석’과 ‘어휘’를 복습하면 효과가 큽니다.</p>
    </div>'''


# ---------------------------------------------------------------- problem book
def build_problem_html():
    body = []
    body.append(cover(["실전 모의고사", "READING TEST"], "문제집 · Questions", "Part 5 · 6 · 7 (100문항)"))
    body.append(info_page())
    body.append('<div class="pagebreak"></div>')

    body.append(R.banner("PART 5", "Incomplete Sentences · 문법·어휘"))
    body.append(f'<div class="directions"><b>Directions:</b> {DIR_P5}</div>')
    body.append(R.problem_part5(part5))

    body.append('<div class="pagebreak"></div>')
    body.append(R.banner("PART 6", "Text Completion · 장문 빈칸"))
    body.append(f'<div class="directions"><b>Directions:</b> {DIR_P6}</div>')
    body.append(R.problem_part6(part6))

    body.append('<div class="pagebreak"></div>')
    body.append(R.banner("PART 7", "Reading Comprehension · 독해"))
    body.append(f'<div class="directions"><b>Directions:</b> {DIR_P7}</div>')
    body.append('<h3 style="color:#1f4e79;margin:10px 0 2px">Single Passages · 단일 지문 (147–175)</h3>')
    body.append(R.problem_part7(p7_single))
    body.append('<div class="pagebreak"></div>')
    body.append('<h3 style="color:#1f4e79;margin:4px 0 2px">Double Passages · 이중 지문 (176–185)</h3>')
    body.append(R.problem_part7(p7_double))
    body.append('<div class="pagebreak"></div>')
    body.append('<h3 style="color:#1f4e79;margin:4px 0 2px">Triple Passages · 삼중 지문 (186–200)</h3>')
    body.append(R.problem_part7(p7_triple))

    body.append('<div class="pagebreak"></div>')
    body.append('<div class="section-banner"><span class="big">This is the end of the Reading Test.</span></div>'
                '<p class="small" style="margin-top:10px">수고하셨습니다. 채점 후 해설집으로 복습하세요. '
                '정답은 해설집 첫 페이지의 정답표에서 확인할 수 있습니다.</p>')
    return R.html_doc("TOEIC RC 실전 모의고사 Vol.1 — 문제집", "\n".join(body))


# ---------------------------------------------------------------- answer book
def build_answer_html():
    body = []
    body.append(cover(["실전 모의고사", "정답 및 해설"], "해설집 · Answers & Explanations",
                       "정답표 · 상세해설 · 지문해석 · 어휘"))

    # 정답표
    body.append(R.banner("정답 한눈에 보기", "ANSWER KEY (101–200)"))
    body.append(R.answer_table([(q["no"], q["ans"]) for q in ALL_Q], cols=10))

    # 파트별 개요
    dist = Counter("ABCD"[q["ans"]] for q in ALL_Q)
    body.append(f'<p class="small">전체 정답 분포 — A {dist["A"]} · B {dist["B"]} · C {dist["C"]} · D {dist["D"]} '
                f'(총 {len(ALL_Q)}문항). 각 문항의 <b>유형 태그</b>와 <b>보기별 해설</b>, <b>지문 해석</b>, '
                f'<b>어휘</b>를 함께 정리했습니다.</p>')
    body.append('<div class="pagebreak"></div>')

    # Part 5
    body.append(R.banner("PART 5 해설", "Incomplete Sentences"))
    body.append(R.answer_part5(part5))

    # Part 6
    body.append('<div class="pagebreak"></div>')
    body.append(R.banner("PART 6 해설", "Text Completion"))
    body.append(R.answer_part6(part6))

    # Part 7
    body.append('<div class="pagebreak"></div>')
    body.append(R.banner("PART 7 해설", "Reading Comprehension"))
    body.append('<h3 style="color:#1f4e79">Single Passages (147–175)</h3>')
    body.append(R.answer_part7(p7_single))
    body.append('<div class="pagebreak"></div>')
    body.append('<h3 style="color:#1f4e79">Double Passages (176–185)</h3>')
    body.append(R.answer_part7(p7_double))
    body.append('<div class="pagebreak"></div>')
    body.append('<h3 style="color:#1f4e79">Triple Passages (186–200)</h3>')
    body.append(R.answer_part7(p7_triple))

    # 학습 가이드
    body.append('<div class="pagebreak"></div>')
    body.append(study_guide())
    return R.html_doc("TOEIC RC 실전 모의고사 Vol.1 — 해설집", "\n".join(body))


def study_guide():
    return '''
    <div class="section-banner"><span class="big">RC 학습 가이드</span>
      <span class="small">파트별 전략 &amp; 자주 나오는 포인트</span></div>
    <div class="trans" style="background:#fff">
      <div class="th">⏱ 시간 배분 (총 75분)</div>
      <p>Part 5 (30문항) 약 <b>10–12분</b> · Part 6 (16문항) 약 <b>8분</b> · Part 7 (54문항) 약
      <b>53–55분</b>. Part 5는 한 문항당 20초 이내를 목표로 빠르게 처리하고, 남는 시간을 Part 7 독해에
      투자하세요.</p>
    </div>
    <div class="trans" style="background:#fff">
      <div class="th">📌 Part 5·6 빈출 포인트</div>
      <p>&bull; <b>품사 자리 찾기</b>: 관사·소유격 뒤 → 명사, be동사/일반동사 앞뒤 → 부사, 명사 앞 → 형용사.<br>
      &bull; <b>동사 문제</b>: ① 수일치(주어 단/복수) ② 시제(시간 표지: next month→미래, since→현재완료,
      by the time→미래완료) ③ 태(주어가 행위의 주체면 능동, 대상이면 수동).<br>
      &bull; <b>전치사 vs 접속사</b>: 뒤에 <u>명사(구)</u>면 전치사(despite, during, because of), <u>절</u>이면
      접속사(although, while, because).<br>
      &bull; <b>연결어(Part 6)</b>: 인과 As a result / 역접 However · Nevertheless / 추가 In addition ·
      Moreover / 대조 In contrast. 앞뒤 문장의 <b>논리 관계</b>를 먼저 파악하세요.<br>
      &bull; <b>문장삽입(Part 6)</b>: 지시어(this, these, the), 접속부사, 시간 흐름을 단서로 앞뒤와의
      연결을 확인합니다.</p>
    </div>
    <div class="trans" style="background:#fff">
      <div class="th">📖 Part 7 독해 전략</div>
      <p>&bull; <b>질문 먼저</b> 읽고 지문에서 근거를 찾으세요. 주제·목적 문제는 대개 <b>첫 1–2문장</b>에 답이 있습니다.<br>
      &bull; <b>패러프레이징</b>: 정답 보기는 지문 표현을 바꿔 씁니다 (예: sign up → register, out of stock →
      unavailable).<br>
      &bull; <b>의도파악(문자·채팅)</b>: 따옴표 문장 <b>바로 앞뒤 맥락</b>으로 숨은 뜻을 판단합니다.<br>
      &bull; <b>NOT/사실확인</b>: 보기 4개를 지문과 하나씩 대조해 <b>언급되지 않은 것</b>을 소거법으로 찾습니다.<br>
      &bull; <b>연계추론(이중·삼중지문)</b>: 한 지문의 정보(예: 신청 품목·인원·회원 여부)를 다른 지문의
      정보(가격표·할인 조건·일정)와 <b>결합</b>해야 풉니다. 이름·날짜·금액·조건을 서로 연결하는 연습이 핵심입니다.</p>
    </div>
    <div class="trans" style="background:#fff">
      <div class="th">✅ 복습법</div>
      <p>틀린 문항은 <b>유형 태그</b>를 기록해 약점 유형을 파악하고, ‘지문 해석’으로 문장을 다시 읽으며
      ‘어휘’를 암기하세요. 같은 지문을 <b>시간을 재며 2회독</b>하면 실전 속도가 빨라집니다.</p>
    </div>
    <p class="small" style="margin-top:14px">— 본 모의고사는 실전 TOEIC의 구성·유형을 참고해 학습용으로
    제작한 창작 콘텐츠이며, 실제 시험 문제가 아닙니다. 꾸준한 반복 학습으로 목표 점수를 달성하시길 바랍니다!</p>'''


# ---------------------------------------------------------------- render
def render_pdf(html_path, pdf_path):
    cmd = [CHROME, "--headless", "--no-sandbox", "--disable-gpu",
           "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", html_path]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    prob_html = os.path.join(OUT, "src", "_problem.html")
    ans_html = os.path.join(OUT, "src", "_answer.html")
    prob_pdf = os.path.join(OUT, "TOEIC_RC_모의고사_Vol1_문제집.pdf")
    ans_pdf = os.path.join(OUT, "TOEIC_RC_모의고사_Vol1_해설집.pdf")

    with open(prob_html, "w", encoding="utf-8") as f:
        f.write(build_problem_html())
    with open(ans_html, "w", encoding="utf-8") as f:
        f.write(build_answer_html())

    render_pdf(prob_html, prob_pdf)
    render_pdf(ans_html, ans_pdf)

    dist = Counter("ABCD"[q["ans"]] for q in ALL_Q)
    print(f"총 문항: {len(ALL_Q)}")
    print(f"정답 분포: {dict(sorted(dist.items()))}")
    print(f"문제집 PDF: {prob_pdf}")
    print(f"해설집 PDF: {ans_pdf}")


if __name__ == "__main__":
    main()
