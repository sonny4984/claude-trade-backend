#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""자동 검산: 구조 무결성 + 토익응급실 원본 정답 대조."""
import sys
from collections import Counter

LET = {"A":0,"B":1,"C":2,"D":3}


def check_item(it, src=None):
    errs = []
    n = it.get("no")
    if len(it.get("opts", [])) != 4:
        errs.append(f"#{n}: 보기 개수 != 4")
    if not (isinstance(it.get("ans"), int) and 0 <= it["ans"] < 4):
        errs.append(f"#{n}: ans 인덱스 오류")
    if "▢" not in it.get("text", ""):
        errs.append(f"#{n}: 빈칸(▢) 없음")
    if len(set(it.get("opts", []))) != len(it.get("opts", [])):
        errs.append(f"#{n}: 보기 중복")
    if not it.get("expl"):
        errs.append(f"#{n}: 해설 없음")
    if src is not None and it["ans"] != src:
        errs.append(f"#{n}: 내정답({'ABCD'[it['ans']]}) != 원본({'ABCD'[src]})  ★불일치")
    return errs


def verify_keyed(name, items, provided_key):
    keys = [LET[x] for x in provided_key.split()]
    assert len(keys) == len(items), f"{name}: 정답키 개수 불일치 {len(keys)} vs {len(items)}"
    errs = []
    nums = [it["no"] for it in items]
    exp_nums = list(range(101, 101 + len(items)))
    if nums != exp_nums:
        errs.append(f"{name}: 번호 순서 오류")
    match = 0
    for it, k in zip(items, keys):
        e = check_item(it, k)
        if not e:
            match += 1
        errs.extend(e)
    dist = Counter("ABCD"[it["ans"]] for it in items)
    print(f"[{name}] 문항 {len(items)} | 원본정답 대조 {match}/{len(items)} 통과 | "
          f"분포 {dict(sorted(dist.items()))}")
    return errs


def verify_selfkey(name, items):
    errs = []
    nums = [it["no"] for it in items]
    if nums != list(range(1, len(items) + 1)):
        errs.append(f"{name}: 번호 순서 오류 (1..{len(items)})")
    for it in items:
        errs.extend(check_item(it))
    dist = Counter("ABCD"[it["ans"]] for it in items)
    print(f"[{name}] 문항 {len(items)} | 구조검증 완료 | 분포 {dict(sorted(dist.items()))}")
    return errs


def main():
    all_errs = []
    from data_toeicER import ALL_SETS
    print("=== 토익응급실 3세트 (원본 정답 대조) ===")
    for name, items, key in ALL_SETS:
        all_errs += verify_keyed("토익응급실 " + name, items, key)

    try:
        from data_seoa import seoa100
        print("=== 최서아 100제 (자체 정답, 구조검증) ===")
        all_errs += verify_selfkey("최서아 100제", seoa100)
    except ImportError:
        print("(data_seoa 아직 없음 — 스킵)")

    print("=" * 48)
    if all_errs:
        print(f"❌ 오류 {len(all_errs)}건:")
        for e in all_errs:
            print("  -", e)
        sys.exit(1)
    print("✅ 모든 검산 통과 — 오류 0건")


if __name__ == "__main__":
    main()
