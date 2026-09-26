import { describe, expect, it } from 'vitest';
import { analyzeSet, arrange } from '../sets';
import { TILES, TILE_COUNT, tile } from '../tiles';
import { COLORS } from '../types';
import { T, TS } from '../fixtures';

describe('타일 구성 (공식: 1~13 네 색 두 벌 + 조커 2 = 106)', () => {
  it('106장, id는 0..105 고유', () => {
    expect(TILES.length).toBe(TILE_COUNT);
    expect(new Set(TILES.map((t) => t.id)).size).toBe(106);
    TILES.forEach((t, i) => expect(t.id).toBe(i));
  });
  it('색마다 숫자마다 정확히 2장, 조커 2장', () => {
    for (const c of COLORS) {
      for (let v = 1; v <= 13; v++) {
        const n = TILES.filter((t) => t.kind === 'number' && t.color === c && t.value === v).length;
        expect(n).toBe(2);
      }
    }
    expect(TILES.filter((t) => t.kind === 'joker').length).toBe(2);
  });
  it('표기법이 올바른 타일을 가리킨다', () => {
    const t = tile(T("b12'"));
    expect(t.kind === 'number' && t.color === 'blue' && t.value === 12 && t.copy === 1).toBe(true);
    expect(tile(T('J')).kind).toBe('joker');
  });
});

describe('그룹', () => {
  it('같은 숫자 다른 색 3장은 합법', () => {
    const a = analyzeSet(TS('r7 b7 k7'));
    expect(a.ok).toBe(true);
    expect(a.kind).toBe('group');
    expect(a.points).toBe(21);
  });
  it('네 색 4장도 합법', () => {
    expect(analyzeSet(TS('r7 b7 o7 k7')).ok).toBe(true);
  });
  it('같은 색이 두 장이면 불법 — "검정 7이 두 장"', () => {
    const a = analyzeSet(TS("k7 b7 k7'"));
    expect(a.ok).toBe(false);
    expect(a.issue).toEqual({ code: 'dup-color', color: 'black', value: 7 });
  });
  it('5장 그룹은 불법 (조커 포함)', () => {
    const a = analyzeSet(TS('r7 b7 o7 k7 J'));
    expect(a.ok).toBe(false);
    expect(a.issue?.code).toBe('group-too-long');
  });
  it('조커는 빠진 색을 채운다 — 빠진 색이 둘이면 색은 미정', () => {
    const a = analyzeSet(TS('r5 b5 J'));
    expect(a.ok).toBe(true);
    expect(a.kind).toBe('group');
    expect(a.jokers.get(T('J'))).toEqual({ color: null, value: 5 });
  });
  it('4장 그룹의 조커는 남은 한 색으로 정해진다', () => {
    const a = analyzeSet(TS('r5 b5 k5 J'));
    expect(a.jokers.get(T('J'))).toEqual({ color: 'orange', value: 5 });
  });
  it('조커 두 장 + 숫자 한 장 그룹도 가능 (점수가 더 높은 해석)', () => {
    const a = analyzeSet(TS("k13 J J'"));
    expect(a.ok).toBe(true);
    expect(a.kind).toBe('group');
    expect(a.points).toBe(39);
  });
  it('그룹은 색 순서(빨강·파랑·주황·검정)로 정돈된다', () => {
    expect(arrange(TS('k9 r9 o9 b9'))).toEqual(TS('r9 b9 o9 k9'));
  });
});

describe('런', () => {
  it('같은 색 연속 3장은 합법', () => {
    const a = analyzeSet(TS('b3 b4 b5'));
    expect(a.ok).toBe(true);
    expect(a.kind).toBe('run');
    expect(a.points).toBe(12);
  });
  it('1부터 13까지 13장 런도 합법', () => {
    const a = analyzeSet(TS('o1 o2 o3 o4 o5 o6 o7 o8 o9 o10 o11 o12 o13'));
    expect(a.ok).toBe(true);
    expect(a.points).toBe(91);
  });
  it('숫자가 비면 불법 — 빠진 숫자를 알려준다', () => {
    const a = analyzeSet(TS('r3 r4 r6'));
    expect(a.ok).toBe(false);
    expect(a.issue).toEqual({ code: 'gap', color: 'red', missing: [5] });
  });
  it('색이 섞이면 불법', () => {
    const a = analyzeSet(TS('r3 b4 r5'));
    expect(a.ok).toBe(false);
    expect(a.issue?.code).toBe('mixed-color');
  });
  it('13 다음에 1은 올 수 없다 (12-13-1)', () => {
    expect(analyzeSet(TS('k12 k13 k1')).issue?.code).toBe('wrap');
  });
  it('13-1-2도 불법', () => {
    expect(analyzeSet(TS('k13 k1 k2')).issue?.code).toBe('wrap');
  });
  it('같은 숫자가 두 번 있으면 불법', () => {
    const a = analyzeSet(TS("b4 b5 b5' b6"));
    expect(a.ok).toBe(false);
    expect(a.issue).toEqual({ code: 'dup-value', color: 'blue', value: 5 });
  });
  it('조커가 빈 숫자를 채운다 (빨강 3·조커·5 → 조커=빨강 4)', () => {
    const a = analyzeSet(TS('r3 J r5'));
    expect(a.ok).toBe(true);
    expect(a.jokers.get(T('J'))).toEqual({ color: 'red', value: 4 });
    expect(a.points).toBe(12);
  });
  it('끝에 붙은 조커는 다음 숫자 (11·12·조커 → 13)', () => {
    const a = analyzeSet(TS('r11 r12 J'));
    expect(a.jokers.get(T('J'))?.value).toBe(13);
    expect(a.points).toBe(36);
  });
  it('조커는 14가 될 수 없다 (12·13·조커 → 조커=11)', () => {
    const a = analyzeSet(TS('r12 r13 J'));
    expect(a.ok).toBe(true);
    expect(a.jokers.get(T('J'))?.value).toBe(11);
    expect(a.order).toEqual(TS('J r12 r13'));
  });
  it('조커는 0이 될 수 없다 (조커·1·2 → 1·2·3)', () => {
    const a = analyzeSet(TS('J b1 b2'));
    expect(a.ok).toBe(true);
    expect(a.jokers.get(T('J'))?.value).toBe(3);
  });
  it('놓은 순서를 존중한다 (조커를 앞에 두면 앞 숫자)', () => {
    const a = analyzeSet(TS('J r10 r11'));
    expect(a.jokers.get(T('J'))?.value).toBe(9);
    expect(a.points).toBe(30);
  });
  it('조커 두 장이 든 런 (빨강 3·조커·조커 → 3·4·5)', () => {
    const a = analyzeSet(TS("r3 J J'"));
    expect(a.ok).toBe(true);
    expect(a.kind).toBe('run');
    expect(a.points).toBe(12);
  });
  it('조커가 부족하면 불법 (1·조커·5)', () => {
    expect(analyzeSet(TS('o1 J o5')).ok).toBe(false);
  });
  it('런은 숫자 순으로 정돈된다', () => {
    expect(arrange(TS('b6 b4 b5'))).toEqual(TS('b4 b5 b6'));
  });
});

describe('미완성·기타', () => {
  it('2장은 세트가 아니다 — 이어질 수 있으면 미완성', () => {
    const a = analyzeSet(TS('r3 r4'));
    expect(a.ok).toBe(false);
    expect(a.state).toBe('incomplete');
  });
  it('2장이 서로 어긋나면 틀린 상태', () => {
    expect(analyzeSet(TS('r3 b5')).state).toBe('invalid');
  });
  it('숫자도 색도 다 다르면 섞임', () => {
    const a = analyzeSet(TS('r3 b3 b4'));
    expect(a.ok).toBe(false);
    expect(a.issue?.code).toBe('mixed');
  });
  it('합법 세트의 state는 valid', () => {
    expect(analyzeSet(TS('r1 r2 r3')).state).toBe('valid');
  });
  it('조커 한 장만 있으면 미완성', () => {
    expect(analyzeSet(TS('J')).state).toBe('incomplete');
  });
});
