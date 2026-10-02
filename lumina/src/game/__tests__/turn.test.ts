import { describe, expect, it } from 'vitest';
import {
  checkCommit,
  isChanged,
  moveTiles,
  proposeTable,
  redo,
  resetTurn,
  splitSet,
  swapJoker,
  undo,
  type MoveResult,
  type MoveTarget,
  type Turn,
} from '../turn';
import { CLASSIC_RULES, type RuleSet } from '../rules';
import { T, TS, turnOf } from '../fixtures';
import type { TileId } from '../types';

function mv(turn: Turn, tiles: string | TileId[], to: MoveTarget): Turn {
  const r: MoveResult = moveTiles(turn, typeof tiles === 'string' ? TS(tiles) : tiles, to);
  if (!r.ok) throw new Error(`move failed: ${r.error}`);
  return r.turn;
}
function setOf(turn: Turn, tileCode: string): string {
  const id = T(tileCode);
  const s = turn.work.sets.find((x) => x.tiles.includes(id));
  if (!s) throw new Error(`no set with ${tileCode}`);
  return s.id;
}
function tableCodes(turn: Turn): TileId[][] {
  return turn.work.sets.map((s) => s.tiles.slice());
}
const rules: RuleSet = CLASSIC_RULES;

describe('차례 트랜잭션 — 이동 권한', () => {
  it('랙 타일로 새 세트를 만든다', () => {
    let t = turnOf({ rack: 'r3 r4 r5 k9' });
    t = mv(t, 'r3 r4 r5', { kind: 'new' });
    expect(tableCodes(t)).toEqual([TS('r3 r4 r5')]);
    expect(t.work.rack).toEqual(TS('k9'));
  });
  it('등록 전에는 기존 세트에 붙일 수 없다', () => {
    const t = turnOf({ table: ['k1 k2 k3'], rack: 'k4 r9', melded: false });
    const r = moveTiles(t, TS('k4'), { kind: 'set', setId: 's1' });
    expect(r.ok ? 'ok' : r.error).toBe('locked-before-meld');
  });
  it('등록 전에는 테이블 타일을 옮길 수 없다', () => {
    const t = turnOf({ table: ['k1 k2 k3'], rack: 'k4', melded: false });
    const r = moveTiles(t, TS('k3'), { kind: 'new' });
    expect(r.ok ? 'ok' : r.error).toBe('locked-before-meld');
  });
  it('테이블 타일은 랙으로 가져올 수 없다', () => {
    const t = turnOf({ table: ['k1 k2 k3 k4'], rack: 'r9' });
    const r = moveTiles(t, TS('k4'), { kind: 'rack' });
    expect(r.ok ? 'ok' : r.error).toBe('table-to-rack');
  });
  it('이번 차례에 낸 랙 타일은 다시 랙으로 가져올 수 있다', () => {
    let t = turnOf({ table: ['k1 k2 k3'], rack: 'k4 r9' });
    t = mv(t, 'k4', { kind: 'set', setId: 's1' });
    t = mv(t, 'k4', { kind: 'rack' });
    expect(t.work.rack).toContain(T('k4'));
    expect(isChanged(t)).toBe(false);
  });
  it('남의 타일(없는 타일)은 옮길 수 없다', () => {
    const t = turnOf({ rack: 'r1' });
    const r = moveTiles(t, TS('b13'), { kind: 'new' });
    expect(r.ok ? 'ok' : r.error).toBe('not-yours');
  });
});

describe('차례 트랜잭션 — 배치 규칙', () => {
  it('런 끝에 붙이면 정돈된다 (앞에 붙여도 숫자 순)', () => {
    let t = turnOf({ table: ['b4 b5 b6'], rack: 'b3 b7' });
    t = mv(t, 'b7', { kind: 'set', setId: 's1' });
    t = mv(t, 'b3', { kind: 'set', setId: 's1' });
    expect(tableCodes(t)).toEqual([TS('b3 b4 b5 b6 b7')]);
  });
  it('합법 런의 가운데를 빼면 그 자리에서 두 줄로 갈라진다', () => {
    let t = turnOf({ table: ['r1 r2 r3 r4 r5 r6 r7'], rack: 'k9' });
    t = mv(t, 'r4', { kind: 'staging' });
    expect(tableCodes(t)).toEqual([TS('r1 r2 r3'), TS('r5 r6 r7')]);
    expect(t.work.staging).toEqual(TS('r4'));
  });
  it('런에 이미 있는 숫자를 넣으면 거기서 둘로 나뉜다 (공식 "Splitting a run")', () => {
    let t = turnOf({ table: ['r4 r5 r6 r7 r8'], rack: "r6'" });
    t = mv(t, "r6'", { kind: 'set', setId: 's1', index: 3 });
    expect(tableCodes(t)).toEqual([TS('r4 r5 r6'), TS("r6' r7 r8")]);
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('가위로 세트를 나눈다', () => {
    let t = turnOf({ table: ['o1 o2 o3 o4 o5 o6'], rack: 'k9' });
    const r = splitSet(t, 's1', 3);
    if (!r.ok) throw new Error(r.error);
    t = r.turn;
    expect(tableCodes(t)).toEqual([TS('o1 o2 o3'), TS('o4 o5 o6')]);
  });
  it('작업대에 타일이 남아 있으면 낼 수 없다', () => {
    let t = turnOf({ table: ['r1 r2 r3 r4'], rack: 'r5 k9' });
    t = mv(t, 'r5', { kind: 'set', setId: 's1' });
    t = mv(t, 'k9', { kind: 'staging' });
    const c = checkCommit(t, rules);
    expect(c.ok).toBe(false);
    expect(c.issues.map((i) => i.code)).toContain('staging');
  });
  it('틀린 세트가 있으면 낼 수 없다 — 어느 세트인지 알려준다', () => {
    let t = turnOf({ table: ['r1 r2 r3'], rack: 'b9 k9' });
    t = mv(t, 'b9 k9', { kind: 'new' });
    const c = checkCommit(t, rules);
    expect(c.ok).toBe(false);
    expect(c.issues[0]).toMatchObject({ code: 'invalid-set' });
  });
  it('랙에서 한 장도 안 내고 재배열만 하면 낼 수 없다', () => {
    let t = turnOf({ table: ['r1 r2 r3 r4 r5 r6'], rack: 'k9' });
    const r = splitSet(t, 's1', 3);
    if (!r.ok) throw new Error(r.error);
    t = r.turn;
    const c = checkCommit(t, rules);
    expect(c.ok).toBe(false);
    expect(c.issues.map((i) => i.code)).toContain('nothing-played');
  });
});

describe('되돌리기 · 다시하기 · 테이블 되돌리기', () => {
  it('동작을 순서대로 되돌리고 다시 한다', () => {
    let t = turnOf({ table: ['b4 b5 b6'], rack: 'b3 b7 r1' });
    t = mv(t, 'b3', { kind: 'set', setId: 's1' });
    t = mv(t, 'b7', { kind: 'set', setId: 's1' });
    const u1 = undo(t) as Turn;
    expect(tableCodes(u1)).toEqual([TS('b3 b4 b5 b6')]);
    const u2 = undo(u1) as Turn;
    expect(tableCodes(u2)).toEqual([TS('b4 b5 b6')]);
    expect(undo(u2)).toBeNull();
    const r1 = redo(u2) as Turn;
    expect(tableCodes(r1)).toEqual([TS('b3 b4 b5 b6')]);
  });
  it('새 동작을 하면 다시하기 기록은 사라진다', () => {
    let t = turnOf({ rack: 'b3 b4 b5 k1' });
    t = mv(t, 'b3 b4 b5', { kind: 'new' });
    t = undo(t) as Turn;
    t = mv(t, 'k1', { kind: 'staging' });
    expect(redo(t)).toBeNull();
  });
  it('테이블 되돌리기는 차례 시작 상태로 가고, 그것도 되돌릴 수 있다', () => {
    let t = turnOf({ table: ['b4 b5 b6'], rack: 'b3 b7' });
    t = mv(t, 'b3', { kind: 'set', setId: 's1' });
    t = mv(t, 'b7', { kind: 'set', setId: 's1' });
    const r = resetTurn(t);
    expect(tableCodes(r)).toEqual([TS('b4 b5 b6')]);
    expect(isChanged(r)).toBe(false);
    expect(tableCodes(undo(r) as Turn)).toEqual([TS('b3 b4 b5 b6 b7')]);
  });
});

describe('첫 등록 (공식: 랙 타일로만, 30점 이상)', () => {
  it('29점이면 안 된다', () => {
    let t = turnOf({ rack: 'b2 b3 b4 b5 r5 k5 o5 k13', melded: false });
    t = mv(t, 'b2 b3 b4 b5', { kind: 'new' });
    t = mv(t, 'r5 k5 o5', { kind: 'new' });
    const c = checkCommit(t, rules);
    expect(c.kind).toBe('meld');
    expect(c.issues).toContainEqual({ code: 'meld-too-low', points: 29, need: 30 });
  });
  it('30점이면 된다', () => {
    let t = turnOf({ rack: 'b3 b4 b5 b6 r4 k4 o4 k13', melded: false });
    t = mv(t, 'b3 b4 b5 b6', { kind: 'new' });
    t = mv(t, 'r4 k4 o4', { kind: 'new' });
    const c = checkCommit(t, rules);
    expect(c.ok).toBe(true);
    expect(c.meldPoints).toBe(30);
  });
  it('조커는 나타내는 값으로 계산한다 (10·11·조커 = 33)', () => {
    let t = turnOf({ rack: 'r10 r11 J k1', melded: false });
    t = mv(t, 'r10 r11 J', { kind: 'new' });
    expect(checkCommit(t, rules).meldPoints).toBe(33);
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('등록 기준 40점 하우스 룰', () => {
    let t = turnOf({ rack: 'r10 r11 r12 k1', melded: false });
    t = mv(t, 'r10 r11 r12', { kind: 'new' });
    const c = checkCommit(t, { ...rules, initialMeldPoints: 40 });
    expect(c.issues).toContainEqual({ code: 'meld-too-low', points: 33, need: 40 });
  });
  it('등록 전 제안(AI)도 기존 세트를 건드릴 수 없다', () => {
    const t = turnOf({ table: ['k1 k2 k3'], rack: 'k4 k5 k6', melded: false });
    const r = proposeTable(t, [TS('k1 k2 k3 k4 k5 k6')]);
    expect(r.ok ? 'ok' : r.error).toBe('locked-before-meld');
  });
});

describe('공식 조작 예시 (Manipulation)', () => {
  it('① 랙 타일로 기존 세트에 더하기: 파랑 3을 4·5·6에, 파랑 8을 8 그룹에', () => {
    let t = turnOf({ table: ['b4 b5 b6', 'o8 r8 k8'], rack: 'b3 b8 k12' });
    t = mv(t, 'b3', { kind: 'set', setId: 's1' });
    t = mv(t, 'b8', { kind: 'set', setId: 's2' });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('② 4장 그룹에서 한 장을 빼 새 런 (파랑 4를 빼서 파랑 3·4·5·6)', () => {
    let t = turnOf({ table: ['b4 r4 k4 o4'], rack: 'b3 b5 b6' });
    t = mv(t, 'b3 b5 b6', { kind: 'new' });
    const run = setOf(t, 'b3');
    t = mv(t, 'b4', { kind: 'set', setId: run });
    expect(checkCommit(t, rules).ok).toBe(true);
    expect(t.work.sets.map((s) => s.tiles.length).sort()).toEqual([3, 4]);
  });
  it('③ 런에 11을 더하고 8을 빼서 8 그룹', () => {
    let t = turnOf({ table: ['b8 b9 b10'], rack: 'b11 k8 o8' });
    t = mv(t, 'b11', { kind: 'set', setId: 's1' });
    t = mv(t, 'k8 o8', { kind: 'new' });
    t = mv(t, 'b8', { kind: 'set', setId: setOf(t, 'k8') });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('④ 복합 분할: 랙의 파랑 1 + 런의 주황 1 + 그룹의 빨강 1', () => {
    let t = turnOf({ table: ['o1 o2 o3 o4', "b1' k1 r1 o1'"], rack: 'b1' });
    t = mv(t, 'b1', { kind: 'new' });
    const g = setOf(t, 'b1');
    t = mv(t, 'o1', { kind: 'set', setId: g });
    t = mv(t, 'r1', { kind: 'set', setId: g });
    // 가운데 타일을 빼면 칸이 빈 채로 줄이 갈라진다 (실제 테이블처럼) — 빈 칸에 남은 타일을 놓아 다시 이어 붙인다
    expect(checkCommit(t, rules).ok).toBe(false);
    const k = t.work.sets.find((s) => s.tiles.includes(T('k1'))) as unknown as { row: number; col: number; tiles: TileId[] };
    t = mv(t, "o1'", { kind: 'cell', row: k.row, col: k.col + k.tiles.length });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('⑤ 다중 분할: 검정 10·파랑 5로 세 그룹 + 한 런', () => {
    let t = turnOf({ table: ['o5 o6 o7', 'r5 r6 r7', 'k5 k6 k7 k8 k9'], rack: 'k10 b5' });
    t = mv(t, 'k10', { kind: 'set', setId: 's3' });
    t = mv(t, 'b5 o5 r5 k5', { kind: 'new' });
    t = mv(t, 'o6 r6 k6', { kind: 'new' });
    t = mv(t, 'o7 r7 k7', { kind: 'new' });
    const c = checkCommit(t, rules);
    expect(c.ok).toBe(true);
    expect(t.work.sets.length).toBe(4);
  });
});

describe('조커 회수 (공식 4가지 방법)', () => {
  it('① 조커 자리에 검정 3을 넣고, 풀려난 조커는 새 세트로', () => {
    let t = turnOf({ table: ['r3 b3 J'], rack: 'k3 o3 b10 b11' });
    const s = swapJoker(t, T('k3'), T('J'));
    if (!s.ok) throw new Error(s.error);
    t = s.turn;
    expect(t.work.staging).toEqual(TS('J'));
    t = mv(t, 'o3', { kind: 'set', setId: 's1' });
    t = mv(t, 'b10 b11 J', { kind: 'new' });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('풀려난 조커를 작업대에 두면 낼 수 없다 (그 차례에 써야 한다)', () => {
    let t = turnOf({ table: ['r3 b3 J'], rack: 'k3 o9' });
    const s = swapJoker(t, T('k3'), T('J'));
    if (!s.ok) throw new Error(s.error);
    t = s.turn;
    expect(checkCommit(t, rules).issues.map((i) => i.code)).toContain('staging');
  });
  it('조커는 랙으로 가져갈 수 없다', () => {
    const t = turnOf({ table: ['r3 b3 J'], rack: 'k3' });
    expect(moveTiles(t, TS('J'), { kind: 'rack' }).ok).toBe(false);
  });
  it('② 런을 나눠 조커를 푼다 (빨강 2·3·조커·5·6 + 1·7)', () => {
    let t = turnOf({ table: ['r2 r3 J r5 r6'], rack: 'r1 r7 k9 k10' });
    t = mv(t, 'r1', { kind: 'set', setId: 's1' });
    t = mv(t, 'r7', { kind: 'set', setId: 's1' });
    t = mv(t, 'J', { kind: 'staging' });
    expect(tableCodes(t)).toEqual([TS('r1 r2 r3'), TS('r5 r6 r7')]);
    t = mv(t, 'k9 k10', { kind: 'new' });
    t = mv(t, 'J', { kind: 'set', setId: setOf(t, 'k9') });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('③ 파랑 5를 붙이고 조커를 뺀다', () => {
    let t = turnOf({ table: ['b6 b7 J'], rack: 'b5 r12 r13' });
    t = mv(t, 'b5', { kind: 'set', setId: 's1' });
    t = mv(t, 'J', { kind: 'new' });
    t = mv(t, 'r12 r13', { kind: 'set', setId: setOf(t, 'J') });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('④ 런을 해체해 1·2를 각 그룹에 넣으면 조커가 풀린다', () => {
    let t = turnOf({ table: ['k1 k2 J', 'b1 o1 r1', 'b2 o2 r2'], rack: 'k11 k12' });
    t = mv(t, 'k1', { kind: 'set', setId: 's2' });
    t = mv(t, 'k2', { kind: 'set', setId: 's3' });
    t = mv(t, 'k11 k12', { kind: 'new' });
    t = mv(t, 'J', { kind: 'set', setId: setOf(t, 'k11') });
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('등록 전에는 테이블 조커를 회수할 수 없다', () => {
    const t = turnOf({ table: ['r3 b3 J'], rack: 'k3', melded: false });
    expect(swapJoker(t, T('k3'), T('J')).ok).toBe(false);
  });
  it('하우스 룰 "원래 타일만": 정확한 타일로 바꾸지 않으면 조커를 뺄 수 없다', () => {
    const exact: RuleSet = { ...rules, jokerReplace: 'exact-tile' };
    let t = turnOf({ table: ['r5 r6 J'], rack: 'r4 k9 k10' });
    t = mv(t, 'r4', { kind: 'set', setId: 's1' }); // 4·5·6·조커(7)
    t = mv(t, 'k9 k10', { kind: 'new' });
    t = mv(t, 'J', { kind: 'set', setId: setOf(t, 'k9') });
    expect(checkCommit(t, exact).issues.map((i) => i.code)).toContain('joker-not-replaced');
    expect(checkCommit(t, rules).ok).toBe(true);
  });
  it('하우스 룰 "원래 타일만": 나타내던 타일(빨강 7)로 바꾸면 된다', () => {
    const exact: RuleSet = { ...rules, jokerReplace: 'exact-tile' };
    let t = turnOf({ table: ['r5 r6 J'], rack: 'r7 k9 k10' });
    const s = swapJoker(t, T('r7'), T('J'));
    if (!s.ok) throw new Error(s.error);
    t = s.turn;
    t = mv(t, 'k9 k10 J', { kind: 'new' });
    expect(checkCommit(t, exact).ok).toBe(true);
  });
  it('하우스 룰 "조커 세트 잠금": 조커가 든 세트를 쪼개면 안 된다', () => {
    const locked: RuleSet = { ...rules, jokerSetLocked: true };
    let t = turnOf({ table: ['b1 b2 b3 J b5 b6'], rack: 'b4' });
    t = mv(t, 'b4', { kind: 'new' });
    const r = splitSet(t, 's1', 3);
    if (!r.ok) throw new Error(r.error);
    t = r.turn;
    expect(checkCommit(t, locked).issues.map((i) => i.code)).toContain('joker-set-broken');
  });
});

describe('AI 제안 테이블', () => {
  it('겹치는 기존 세트의 id를 물려받는다', () => {
    const t = turnOf({ table: ['b4 b5 b6', 'r9 b9 k9'], rack: 'b7 o9' });
    const r = proposeTable(t, [TS('r9 b9 k9 o9'), TS('b4 b5 b6 b7')]);
    if (!r.ok) throw new Error(r.error);
    expect(r.turn.work.sets.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(r.turn.work.rack).toEqual([]);
    expect(checkCommit(r.turn, rules).ok).toBe(true);
  });
  it('테이블 타일을 빠뜨린 제안은 거절한다', () => {
    const t = turnOf({ table: ['b4 b5 b6'], rack: 'b7' });
    expect(proposeTable(t, [TS('b5 b6 b7')]).ok).toBe(false);
  });
  it('같은 타일을 두 번 쓴 제안은 거절한다', () => {
    const t = turnOf({ table: ['b4 b5 b6'], rack: 'b7' });
    expect(proposeTable(t, [TS('b4 b5 b6'), TS('b6 b7 b8')]).ok).toBe(false);
  });
});
