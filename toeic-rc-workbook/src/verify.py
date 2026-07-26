#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""신규 RC 문제집 자동 검산: 구조·번호·중복보기·해설·정답분포."""
import sys
from collections import Counter

from data_p5 import part5
from data_p6 import part6
from data_p7_single import p7_single
from data_p7_double import p7_double
from data_p7_triple import p7_triple


def check_q(q, need_blank=False, need_stem=False):
    e = []
    n = q.get("no")
    if len(q.get("opts", [])) != 4:
        e.append(f"#{n}: 보기 개수 != 4")
    if len(set(q.get("opts", []))) != len(q.get("opts", [])):
        e.append(f"#{n}: 보기 중복")
    if not (isinstance(q.get("ans"), int) and 0 <= q["ans"] < 4):
        e.append(f"#{n}: ans 인덱스 오류")
    if not q.get("expl"):
        e.append(f"#{n}: 해설 없음")
    if q.get("opt_why") and len(q["opt_why"]) != 4:
        e.append(f"#{n}: opt_why 길이!=4")
    if need_blank and "-------" not in q.get("text", ""):
        e.append(f"#{n}: 빈칸(-------) 없음")
    if need_stem and not q.get("stem"):
        e.append(f"#{n}: stem 없음")
    return e


def main():
    errs = []
    all_ans = []

    # Part 5
    nums = [q["no"] for q in part5]
    if nums != list(range(101, 131)):
        errs.append("Part5 번호 오류")
    for q in part5:
        errs += check_q(q, need_blank=True)
        all_ans.append(q["ans"])

    # Part 6
    p6q = [q for p in part6 for q in p["questions"]]
    if [q["no"] for q in p6q] != list(range(131, 147)):
        errs.append("Part6 번호 오류")
    for p in part6:
        if sum(1 for q in p["questions"] if q.get("insert")) != 1:
            errs.append(f"Part6 지문 문장삽입 개수 오류: {p['intro']}")
        if not p.get("trans"):
            errs.append(f"Part6 지문해석 없음: {p['intro']}")
        for q in p["questions"]:
            if f'[[{q["no"]}]]' not in p["passage"]:
                errs.append(f"Part6 #{q['no']}: 마커 없음")
            errs += check_q(q)
            all_ans.append(q["ans"])

    # Part 7
    def check_set(sets, rng, label):
        qs = [q for s in sets for q in s["questions"]]
        if [q["no"] for q in qs] != list(rng):
            errs.append(f"{label} 번호 오류")
        for s in sets:
            if not s.get("trans"):
                errs.append(f"{label} 지문해석 없음: {s['intro']}")
        for q in qs:
            errs.extend(check_q(q, need_stem=True))
            all_ans.append(q["ans"])

    check_set(p7_single, range(147, 176), "P7단일")
    check_set(p7_double, range(176, 186), "P7이중")
    check_set(p7_triple, range(186, 201), "P7삼중")

    dist = Counter("ABCD"[a] for a in all_ans)
    xref = sum(1 for s in (p7_double + p7_triple) for q in s["questions"] if "연계" in q.get("type", ""))
    ins = sum(1 for coll in (part6,) for p in coll for q in p["questions"] if q.get("insert")) \
        + sum(1 for s in p7_single for q in s["questions"] if q.get("type") == "문장삽입")

    print(f"총 문항: {len(all_ans)} (101–200)")
    print(f"정답 분포: {dict(sorted(dist.items()))}")
    print(f"연계추론(Part7): {xref}문항 | 문장삽입: {ins}문항")
    print("=" * 46)
    if errs:
        print(f"❌ 오류 {len(errs)}건:")
        for e in errs:
            print("  -", e)
        sys.exit(1)
    print("✅ 구조 검산 전부 통과 — 오류 0건")


if __name__ == "__main__":
    main()
