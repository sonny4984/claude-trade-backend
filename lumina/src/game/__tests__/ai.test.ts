import { describe, expect, it } from 'vitest';
import { AI_PROFILES, applyDecision, decide, extendOnly, findMeld } from '../ai';
import { simulateGame } from '../simulate';
import { computeHint } from '../hints';
import { createRng } from '../rng';
import { CAFE_HOUSE_RULES, CLASSIC_RULES } from '../rules';
import { TS, gameOf } from '../fixtures';
import { analyzeSet } from '../sets';
import type { AiLevel } from '../types';

describe('AI — 첫 등록', () => {
  it('30점 이상이면 등록한다', () => {
    const m = findMeld(TS('r10 r11 r12 k1 k5'), 30, AI_PROFILES.beginner);
    expect(m?.points).toBeGreaterThanOrEqual(30);
  });
  it('30점이 안 되면 등록하지 않는다', () => {
    expect(findMeld(TS('r1 r2 r3 k1 k5'), 30, AI_PROFILES.expert)).toBeNull();
  });
  it('세현·이안은 필요한 만큼만 등록한다 (더 큰 조합은 아낀다)', () => {
    const rack = TS('r10 r11 r12 b1 b2 b3 k7 o7 b7 k1'); // k1은 어디에도 못 들어가 한 번에 끝낼 수는 없다
    const dump = findMeld(rack, 30, AI_PROFILES.beginner);
    const minimal = findMeld(rack, 30, AI_PROFILES.advanced);
    expect((dump?.played.length ?? 0)).toBeGreaterThan(minimal?.played.length ?? 0);
    expect(minimal?.points).toBeGreaterThanOrEqual(30);
  });
  it('조커를 아끼는 성격도 조커 없이는 안 될 때는 쓴다', () => {
    const m = findMeld(TS('r10 r11 J k2'), 30, AI_PROFILES.advanced);
    expect(m?.played).toContain(104);
  });
});

describe('AI — 수 두기', () => {
  it('붙일 수 있으면 붙인다 (초보도)', () => {
    const g = gameOf({ players: [{ rack: 'b7 k1' }, { rack: 'r1' }], table: ['b4 b5 b6'] });
    const d = decide(g, createRng(1), { ...AI_PROFILES.beginner, missRate: 0 });
    expect(d.kind).toBe('play');
    const s = applyDecision(g, d);
    expect(s?.players[0]?.rack).toEqual(TS('k1'));
  });
  it('초보는 테이블을 쪼개지 않는다, 고수는 쪼갠다 (4-5-6-7-8 + 6)', () => {
    const g = gameOf({ players: [{ rack: "r6' k1" }, { rack: 'r1' }], table: ['r4 r5 r6 r7 r8'] });
    expect(decide(g, createRng(1), { ...AI_PROFILES.beginner, missRate: 0 }).kind).toBe('draw');
    const d = decide(g, createRng(1), AI_PROFILES.advanced);
    expect(d.kind).toBe('play');
    expect(applyDecision(g, d)).not.toBeNull();
  });
  it('민재는 4장 그룹에서 한 장을 빌려 쓴다', () => {
    const g = gameOf({ players: [{ rack: 'b3 b5 b6 k1' }, { rack: 'r1' }], table: ['b4 r4 k4 o4'] });
    const d = decide(g, createRng(3), { ...AI_PROFILES.casual, missRate: 0 });
    expect(d.kind).toBe('play');
    const s = applyDecision(g, d);
    expect(s?.players[0]?.rack).toEqual(TS('k1'));
  });
  it('랙을 다 비울 수 있으면 조커를 아끼는 성격도 다 낸다', () => {
    const g = gameOf({ players: [{ rack: 'r9 r10 J' }, { rack: 'r1' }], table: [] });
    const d = decide(g, createRng(1), AI_PROFILES.advanced);
    const s = applyDecision(g, d);
    expect(s?.phase).toBe('over');
  });
  it('낼 게 없으면 뽑는다', () => {
    const g = gameOf({ players: [{ rack: 'r1 k9' }, { rack: 'r1' }], table: ['b4 b5 b6'], pool: 'o3' });
    expect(decide(g, createRng(1), AI_PROFILES.expert).kind).toBe('draw');
  });
  it('끝에 붙이기만 하는 도우미', () => {
    const r = extendOnly([TS('b4 b5 b6'), TS('r9 b9 k9')], TS('b3 o9 b2 k1'), true);
    expect(r.played.length).toBe(3);
    expect(r.sets.every((s) => analyzeSet(s).ok)).toBe(true);
  });
});

describe('힌트', () => {
  it('등록 전: 30점 조합을 알려 준다', () => {
    const g = gameOf({ players: [{ rack: 'r10 r11 r12 k1', melded: false }, { rack: 'r1' }] });
    const h = computeHint(g);
    expect(h.kind).toBe('meld');
    expect(h.points).toBeGreaterThanOrEqual(30);
  });
  it('기존 세트에 붙는 타일을 먼저 가리킨다', () => {
    const g = gameOf({ players: [{ rack: 'b7 k1' }, { rack: 'r1' }], table: ['b4 b5 b6'] });
    const h = computeHint(g);
    expect(h.kind).toBe('play');
    expect(h.focus).toBe(TS('b7')[0]);
    expect(h.targetSetId).toBe('s1');
  });
  it('낼 게 없으면 뽑으라고 한다', () => {
    const g = gameOf({ players: [{ rack: 'k1 r9' }, { rack: 'r1' }], table: ['b4 b5 b6'] });
    expect(computeHint(g).kind).toBe('draw');
  });
});

describe('AI 대 AI — 불법 커밋 0, 불변식 유지', () => {
  const lineups: AiLevel[][] = [
    ['beginner', 'casual'],
    ['advanced', 'expert'],
    ['beginner', 'casual', 'advanced'],
    ['expert', 'advanced', 'casual', 'beginner'],
  ];
  it('공식 규칙 24판', () => {
    for (let k = 0; k < 24; k++) {
      const r = simulateGame(500 + k, lineups[k % lineups.length] as AiLevel[], CLASSIC_RULES);
      expect(r.violations).toEqual([]);
      expect(r.fallbacks).toBe(0);
      expect(r.state.phase).toBe('over');
    }
  }, 120000);
  it('하우스 룰(등록 후 계속·원래 타일만·세트 잠금) 12판', () => {
    for (let k = 0; k < 12; k++) {
      const rules = { ...CAFE_HOUSE_RULES, jokerReplace: 'exact-tile' as const, jokerSetLocked: k % 2 === 0 };
      const r = simulateGame(900 + k, lineups[k % lineups.length] as AiLevel[], rules);
      expect(r.violations).toEqual([]);
      expect(r.fallbacks).toBe(0);
    }
  }, 120000);
});
