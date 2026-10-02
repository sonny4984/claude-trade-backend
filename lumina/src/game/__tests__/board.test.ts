import { describe, expect, it } from 'vitest';
import { BOARD_COLS, cellKey, checkLayout, findSpot, layoutSets, normalizeOrder, occupancy, placeOnBoard, reconcile, segments, tidySets } from '../board';
import { checkCommit, moveTiles, placeTiles, proposeTable, quickCells, splitSet, swapJoker, tidyTurn, undo, redo, resetTurn, type Turn } from '../turn';
import { newGame, reduce, type GameAction, type GameState } from '../engine';
import { CLASSIC_RULES } from '../rules';
import { T, TS, gameOf, tableOf, turnOf } from '../fixtures';
import { createRng } from '../rng';
import type { TableSet, TileId } from '../types';

const codes = (sets: readonly TableSet[]): TileId[][] => sets.map((s) => s.tiles.slice());
const at = (turn: Turn, code: string): { row: number; col: number } => {
  const id = T(code);
  for (const s of turn.work.sets) {
    const i = s.tiles.indexOf(id);
    if (i >= 0) return { row: s.row, col: s.col + i };
  }
  throw new Error(`${code} is not on the board`);
};
function place(turn: Turn, tiles: string, row: number, col: number): Turn {
  const r = placeTiles(turn, TS(tiles), { row, col });
  if (!r.ok) throw new Error(`place ${tiles} failed: ${r.error}`);
  return r.turn;
}
const clean = (turn: Turn): void => expect(checkLayout(turn.work.sets)).toEqual([]);
/** 타일이 랙·작업대·보드에 정확히 한 번씩 */
function conserved(turn: Turn, all: readonly TileId[]): void {
  const now = [...turn.work.rack, ...turn.work.staging, ...turn.work.sets.flatMap((s) => s.tiles)];
  expect(now.slice().sort((a, b) => a - b)).toEqual(all.slice().sort((a, b) => a - b));
}

describe('보드 — 자리 주기', () => {
  it('위치가 없는 시험용 테이블은 위에서부터 한 칸씩 띄워 놓는다', () => {
    const sets = tableOf(['r1 r2 r3', 'b4 b5 b6 b7', 'k9 k10 k11']);
    expect(checkLayout(sets)).toEqual([]);
    expect(sets[0]).toMatchObject({ row: 0, col: 0 });
    expect(sets[1]).toMatchObject({ row: 0, col: 4 });
    expect(sets[2]).toMatchObject({ row: 0, col: 9 });
    // 한 줄(13칸)에 안 들어가면 다음 줄
    const more = tableOf(['r1 r2 r3', 'b4 b5 b6 b7', 'k9 k10 k11', 'o1 o2 o3']);
    expect(more[3]).toMatchObject({ row: 1, col: 0 });
  });

  it('이미 제자리인 세트는 그대로, 겹치거나 붙은 세트만 다시 놓는다', () => {
    const base = tableOf(['r1 r2 r3']);
    const sets = layoutSets([
      { id: 'a', tiles: TS('r1 r2 r3'), row: 2, col: 3 },
      { id: 'b', tiles: TS('b1 b2 b3'), row: 2, col: 6 }, // a 바로 곁 — 붙으면 한 세트가 되니 비켜야 한다
      { id: 'c', tiles: TS('k1 k2 k3'), row: 2, col: 7 }, // 한 칸 떨어져 있어 제자리
    ]);
    expect(base).toHaveLength(1);
    expect(sets[0]).toMatchObject({ row: 2, col: 3 });
    expect(sets[2]).toMatchObject({ row: 2, col: 7 });
    expect(sets[1]?.row === 2 && sets[1].col === 6).toBe(false);
    expect(checkLayout(sets)).toEqual([]);
  });

  it('빈 자리 찾기: 위에서부터 처음 들어가는 곳, 가까운 곳, 맨 아래 새 줄', () => {
    const taken = new Set<number>();
    for (let c = 0; c < BOARD_COLS; c++) taken.add(cellKey(0, c));
    expect(findSpot(taken, 3)).toEqual({ row: 1, col: 0 });
    const some = new Set([cellKey(0, 0), cellKey(0, 1), cellKey(0, 2)]);
    expect(findSpot(some, 3)).toEqual({ row: 0, col: 4 });
    expect(findSpot(some, 3, { row: 1, col: 6 })).toEqual({ row: 1, col: 6 });
  });

  it('줄 읽기: 가로로 붙은 칸이 한 세트, 빈 칸이 있으면 갈라진다', () => {
    const occ = new Map<number, TileId>([
      [cellKey(0, 1), 1],
      [cellKey(0, 2), 2],
      [cellKey(0, 4), 3],
      [cellKey(1, 5), 4],
      [cellKey(1, 6), 5],
    ]);
    expect(segments(occ)).toEqual([
      { row: 0, col: 1, tiles: [1, 2] },
      { row: 0, col: 4, tiles: [3] },
      { row: 1, col: 5, tiles: [4, 5] },
    ]);
  });
});

describe('보드 — 칸에 놓기', () => {
  it('랙 타일을 빈 칸에 놓으면 그 칸에 세트가 생긴다', () => {
    let t = turnOf({ rack: 'r3 r4 r5 k9' });
    t = place(t, 'r3 r4 r5', 2, 5);
    expect(codes(t.work.sets)).toEqual([TS('r3 r4 r5')]);
    expect(t.work.sets[0]).toMatchObject({ row: 2, col: 5 });
    expect(t.work.rack).toEqual(TS('k9'));
    clean(t);
  });

  it('옆 칸에 놓으면 그 세트에 붙고, 두 줄 사이 빈 칸에 놓으면 둘이 합쳐진다', () => {
    let t = turnOf({ table: ['r3 r4 r5', 'r7 r8 r9'], rack: 'r6 r10' });
    const a = t.work.sets[0] as TableSet;
    const b = t.work.sets[1] as TableSet;
    expect(b.col - (a.col + 3)).toBe(1); // 한 칸 떨어져 있다
    t = place(t, 'r6', a.row, a.col + 3);
    expect(t.work.sets).toHaveLength(1);
    expect(t.work.sets[0]?.tiles).toEqual(TS('r3 r4 r5 r6 r7 r8 r9'));
    expect(checkCommit(t, CLASSIC_RULES).ok).toBe(true);
    t = place(t, 'r10', a.row, b.col + 3);
    expect(t.work.sets[0]?.tiles).toEqual(TS('r3 r4 r5 r6 r7 r8 r9 r10'));
    clean(t);
  });

  it('한 칸 떨어진 곳에 놓으면 따로 놓인다', () => {
    let t = turnOf({ table: ['r3 r4 r5'], rack: 'r9' });
    const a = t.work.sets[0] as TableSet;
    t = place(t, 'r9', a.row, a.col + 4);
    expect(t.work.sets).toHaveLength(2);
    clean(t);
  });

  it('이미 타일이 있는 칸·판 밖에는 놓을 수 없다', () => {
    const t = turnOf({ table: ['r3 r4 r5'], rack: 'r6 r7' });
    const a = t.work.sets[0] as TableSet;
    const full = placeTiles(t, TS('r6'), { row: a.row, col: a.col + 1 });
    expect(full).toEqual({ ok: false, error: 'occupied' });
    // 여러 장은 한 장이라도 막히면 놓이지 않는다
    expect(placeTiles(t, TS('r6 r7'), { row: a.row, col: a.col + 2 })).toEqual({ ok: false, error: 'occupied' });
    expect(placeTiles(t, TS('r6 r7'), { row: 0, col: BOARD_COLS - 1 })).toEqual({ ok: false, error: 'off-board' });
    expect(placeTiles(t, TS('r6'), { row: -1, col: 0 })).toEqual({ ok: false, error: 'off-board' });
  });

  it('세트 가운데 타일을 빼면 칸이 빈 채로 줄이 갈라지고, 빈 칸에 다시 놓으면 이어진다', () => {
    let t = turnOf({ table: ['r4 r5 r6 r7 r8 r9'], rack: 'k1' });
    const base = t.work.sets[0] as TableSet;
    t = place(t, 'r6', base.row + 2, 0); // 다른 줄로
    expect(codes(t.work.sets)).toContainEqual(TS('r4 r5'));
    expect(codes(t.work.sets)).toContainEqual(TS('r7 r8 r9'));
    expect(at(t, 'r7')).toEqual({ row: base.row, col: base.col + 3 });
    clean(t);
    t = place(t, 'r6', base.row, base.col + 2);
    expect(t.work.sets.some((s) => s.tiles.length === 6)).toBe(true);
    clean(t);
  });

  it('같은 줄에서 한 칸 밀어도 되고 (자기 칸은 비워진다), 여러 장을 한꺼번에 옮길 수도 있다', () => {
    let t = turnOf({ table: ['r4 r5 r6'], rack: 'k1' });
    const a = t.work.sets[0] as TableSet;
    t = place(t, 'r4 r5 r6', a.row, a.col + 1);
    expect(t.work.sets[0]).toMatchObject({ row: a.row, col: a.col + 1 });
    clean(t);
    // 위 줄로 통째로
    t = place(t, 'r4 r5 r6', 3, 2);
    expect(t.work.sets[0]).toMatchObject({ row: 3, col: 2 });
  });

  it('보드 타일은 읽는 순서대로, 랙에서 온 타일은 고른 순서대로 놓인다', () => {
    let t = turnOf({ table: ['r1 r2 r3', 'b1 b2 b3'], rack: 'k5 k4' });
    t = place(t, 'k5 k4', 4, 0);
    expect(t.work.sets.find((s) => s.row === 4)?.tiles).toEqual(TS('k5 k4'));
    t = place(t, 'b3 r1', 5, 0); // 보드에 있던 순서(읽는 순서)가 우선
    expect(t.work.sets.find((s) => s.row === 5)?.tiles).toEqual(TS('r1 b3'));
  });

  it('등록 전에는 기존 세트의 타일을 옮기거나 기존 세트에 붙여 놓을 수 없다', () => {
    const t = turnOf({ table: ['r3 r4 r5'], rack: 'r6 k9', melded: false });
    const a = t.work.sets[0] as TableSet;
    expect(placeTiles(t, TS('r3'), { row: 5, col: 5 })).toEqual({ ok: false, error: 'locked-before-meld' });
    expect(placeTiles(t, TS('r6'), { row: a.row, col: a.col + 3 })).toEqual({ ok: false, error: 'locked-before-meld' });
    // 떨어진 빈 칸은 괜찮다
    const ok = placeTiles(t, TS('k9'), { row: 3, col: 0 });
    expect(ok.ok).toBe(true);
  });

  it('작업대로 보내거나 랙으로 되돌려도 남은 줄은 제자리, 가운데면 갈라진다', () => {
    let t = turnOf({ table: ['r4 r5 r6'], rack: 'r1 r2' });
    t = place(t, 'r1 r2', 3, 0);
    const r = moveTiles(t, TS('r2'), { kind: 'rack' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.turn.work.sets.find((s) => s.row === 3)?.tiles).toEqual(TS('r1'));
      clean(r.turn);
    }
    const s = moveTiles(t, TS('r1'), { kind: 'staging' });
    expect(s.ok && s.turn.work.staging).toEqual(TS('r1'));
  });

  it('되돌리기·다시·처음으로가 위치까지 되돌린다', () => {
    let t = turnOf({ table: ['r4 r5 r6'], rack: 'k1 k2 k3' });
    const first = t.work;
    t = place(t, 'k1 k2 k3', 6, 4);
    expect(t.work.sets).toHaveLength(2);
    const u = undo(t) as Turn;
    expect(u.work).toBe(first);
    expect((redo(u) as Turn).work.sets.find((s) => s.row === 6)).toMatchObject({ col: 4 });
    expect(resetTurn(t).work).toBe(t.start);
  });
});

describe('보드 — 이전 배치 이어 주기 (AI·힌트·세트 단위 이동)', () => {
  it('그대로인 세트는 제자리, 새 세트는 빈 곳에', () => {
    const prev = tableOf(['r1 r2 r3', 'b4 b5 b6']);
    const next = reconcile(prev, [
      { id: 's1', tiles: TS('r1 r2 r3') },
      { id: 's2', tiles: TS('b4 b5 b6') },
      { id: 's3', tiles: TS('k1 k2 k3') },
    ]);
    expect(next[0]).toMatchObject({ row: prev[0]?.row, col: prev[0]?.col });
    expect(next[1]).toMatchObject({ row: prev[1]?.row, col: prev[1]?.col });
    expect(checkLayout(next)).toEqual([]);
  });

  it('런을 둘로 가르면 왼쪽은 제자리, 오른쪽은 겹치는 타일의 칸을 따라 한 칸 띄워서', () => {
    const prev = tableOf(['r4 r5 r6 r7 r8 r9']);
    const p = prev[0] as TableSet;
    const next = reconcile(prev, [
      { id: 's1', tiles: TS('r4 r5 r6') },
      { id: 's2', tiles: TS('r7 r8 r9') },
    ]);
    expect(next[0]).toMatchObject({ row: p.row, col: p.col });
    expect(next[1]?.row).toBe(p.row);
    expect((next[1]?.col ?? 0) - (p.col + 3)).toBeGreaterThanOrEqual(1);
    expect(checkLayout(next)).toEqual([]);
  });

  it('가위로 자르기는 오른쪽 조각이 한 칸 비켜 간다', () => {
    const t = turnOf({ table: ['r4 r5 r6 r7'], rack: 'k1' });
    const r = splitSet(t, 's1', 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(codes(r.turn.work.sets)).toEqual([TS('r4 r5'), TS('r6 r7')]);
      clean(r.turn);
    }
  });

  it('세트 단위 이동(옛 방식)도 겹치지 않게 놓인다', () => {
    let t = turnOf({ table: ['r4 r5 r6', 'r8 r9 r10'], rack: 'r7 k1' });
    const r = moveTiles(t, TS('r7'), { kind: 'set', setId: 's1' });
    expect(r.ok).toBe(true);
    if (r.ok) t = r.turn;
    clean(t);
    expect(t.work.sets.flatMap((s) => s.tiles)).toContain(T('r7'));
  });

  it('붙이기: 세트는 제자리에서 자라고, 오른쪽 이웃이 걸리면 이웃이 비켜 준다', () => {
    // 한 칸 띄워 놓인 두 세트 — r7을 붙이면 r4 r5 r6 r7이 되어 이웃(k1 k2 k3)에 닿는다
    const t = turnOf({ table: ['r4 r5 r6', 'k1 k2 k3'], rack: 'r7 b9' });
    const a = t.work.sets[0] as TableSet;
    const b = t.work.sets[1] as TableSet;
    const r = proposeTable(t, [TS('r4 r5 r6 r7'), TS('k1 k2 k3')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    clean(r.turn);
    const grown = r.turn.work.sets.find((s) => s.tiles.includes(T('r7'))) as TableSet;
    const other = r.turn.work.sets.find((s) => s.tiles.includes(T('k1'))) as TableSet;
    expect(grown).toMatchObject({ row: a.row, col: a.col });
    expect(other.row).toBe(b.row);
    expect(other.col).toBe(b.col + 1);
    // 이웃을 밀 자리가 없는 가득 찬 줄이면 이웃이 아니라 늘어난 세트가 다른 빈 자리로 간다
    const full = turnOf({ table: ['r1 r2 r3 r4 r5', 'k1 k2 k3 k4 k5 k6'], rack: 'r6 b9' });
    const f = proposeTable(full, [TS('r1 r2 r3 r4 r5 r6'), TS('k1 k2 k3 k4 k5 k6')]);
    expect(f.ok).toBe(true);
    if (f.ok) clean(f.turn);
  });

  it('제안(힌트·AI): 이전 배치를 이어서, 친구가 보낸 배치는 그대로', () => {
    const t = turnOf({ table: ['r4 r5 r6', 'k1 k2 k3'], rack: 'r7 b9' });
    // 친구의 배치: 두 세트를 멀리 놓았다
    const g = proposeTable(t, [TS('r4 r5 r6 r7'), TS('k1 k2 k3')], [{ row: 5, col: 2 }, { row: 7, col: 8 }]);
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.turn.work.sets.map((s) => [s.row, s.col]).sort()).toEqual([[5, 2], [7, 8]]);
      clean(g.turn);
    }
    // 겹치는 배치는 받아들이지 않고 자리를 다시 준다
    const bad = proposeTable(t, [TS('r4 r5 r6 r7'), TS('k1 k2 k3')], [{ row: 1, col: 1 }, { row: 1, col: 3 }]);
    expect(bad.ok).toBe(true);
    if (bad.ok) clean(bad.turn);
  });
});

describe('보드 — 조커 바꾸기·정리·두 번 탭', () => {
  it('조커 자리에 타일을 넣으면 그 칸에 들어가고 조커는 작업대로, 타일이 있던 줄은 갈라진다', () => {
    const t = turnOf({ table: ['r3 b3 J', 'k4 k5 k6'], rack: 'o3' });
    const j = t.work.sets[0] as TableSet;
    const r = swapJoker(t, T('o3'), T('J'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const holder = r.turn.work.sets.find((s) => s.tiles.includes(T('o3'))) as TableSet;
    expect(holder).toMatchObject({ row: j.row, col: j.col });
    expect(holder.tiles).toEqual(TS('r3 b3 o3'));
    expect(r.turn.work.staging).toEqual([T('J')]);
    clean(r.turn);
    // 다른 줄의 가운데 타일로 바꾸면 그 줄이 갈라진다
    const m = swapJoker(turnOf({ table: ['r3 b3 J', 'o3 o4 o5'], rack: 'k1' }), T('o3'), T('J'));
    expect(m.ok).toBe(true);
    if (m.ok) clean(m.turn);
  });

  it('정리하기: 세트는 그대로 두고 위쪽부터 빈틈없이, 이미 정리돼 있으면 기록을 남기지 않는다', () => {
    let t = turnOf({ table: ['r1 r2 r3'], rack: 'b1 b2 b3 k1 k2 k3' });
    t = place(t, 'b1 b2 b3', 9, 7);
    t = place(t, 'k1 k2 k3', 5, 1);
    const r = tidyTurn(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes(r.turn.work.sets).map((x) => x.length)).toEqual([3, 3, 3]);
    expect(r.turn.work.sets.every((s) => s.row === 0)).toBe(true);
    clean(r.turn);
    const again = tidyTurn(r.turn);
    expect(again.ok && again.turn).toBe(r.turn);
  });

  it('등록 전 정리하기는 기존 세트를 제자리에 둔다', () => {
    let t = turnOf({ table: ['r1 r2 r3'], rack: 'b1 b2 b3', melded: false });
    const old = { ...(t.work.sets[0] as TableSet) };
    t = place(t, 'b1 b2 b3', 8, 8);
    const r = tidyTurn(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.turn.work.sets.find((s) => s.tiles.includes(T('r1')))).toMatchObject({ row: old.row, col: old.col });
    expect(r.turn.work.sets.find((s) => s.tiles.includes(T('b1')))?.row).toBe(0);
  });

  it('두 번 탭 자동 배치: 합법 세트 곁에서 맞는 쪽 끝 칸만, 다른 세트와 또 붙는 칸은 뺀다', () => {
    const spaced = (rows: [string, number, number][], rack: string): Turn => {
      const table = layoutSets(rows.map(([c, row, col], i) => ({ id: `s${i + 1}`, tiles: TS(c), row, col })));
      return { ...turnOf({ rack }), start: { sets: table, rack: TS(rack), staging: [], nextSetId: 9 }, work: { sets: table, rack: TS(rack), staging: [], nextSetId: 9 } };
    };
    const t = spaced([['r4 r5 r6', 0, 3], ['k7 b7 o7', 4, 3]], 'r7 r3 r9 r1');
    // r7: 런의 오른쪽 끝(숫자가 이어진다)과, 7 그룹의 양쪽 끝(네 번째 색)
    expect(quickCells(t, T('r7')).filter((c) => c.row === 0)).toEqual([{ row: 0, col: 6 }]);
    expect(quickCells(t, T('r7')).filter((c) => c.row === 4)).toHaveLength(2);
    expect(quickCells(t, T('r3'))).toEqual([{ row: 0, col: 2 }]); // 런의 왼쪽 끝
    expect(quickCells(t, T('r9'))).toEqual([]);
    // 그룹은 어느 쪽이든 (4번째 색)
    const g = quickCells(spaced([['k7 b7 o7', 2, 5]], 'r7'), T('r7'));
    expect(g).toContainEqual({ row: 2, col: 8 });
    expect(g).toContainEqual({ row: 2, col: 4 });
    // 한 칸 떨어진 세트들 사이의 빈 칸은 놓으면 둘이 합쳐지니 뺀다
    const tight = turnOf({ table: ['r4 r5 r6', 'k7 b7 o7'], rack: 'r7' });
    expect(quickCells(tight, T('r7')).every((c) => c.col !== (tight.work.sets[0] as TableSet).col + 3)).toBe(true);
  });

  it('커밋하면 합법 세트는 읽기 쉬운 순서로 정돈되고 칸은 그대로', () => {
    const g = gameOf({ players: [{ rack: 'r5 r3 r4 k9' }, { rack: 'b2' }], pool: 'k1 k2 k3' });
    const mv = reduce(g, { type: 'move', tiles: TS('r5 r3 r4'), to: { kind: 'cell', row: 2, col: 3 } });
    expect(mv.ok).toBe(true);
    if (!mv.ok) return;
    // 놓인 그대로(5 3 4)여도 합법으로 읽힌다
    const c = reduce(mv.state, { type: 'commit' });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.state.table).toHaveLength(1);
    expect(c.state.table[0]).toMatchObject({ row: 2, col: 3, tiles: TS('r3 r4 r5') });
    expect(normalizeOrder(c.state.table)).toEqual(c.state.table);
  });
});

describe('보드 — 무작위 시험', () => {
  it('아무렇게나 놓고 옮기고 가르고 제안해도 칸이 겹치거나 붙지 않고 타일은 한 번씩만', () => {
    const rng = createRng(2026);
    for (let game = 0; game < 40; game++) {
      const g0 = newGame({ players: [{ name: 'a', seat: 'human' }, { name: 'b', seat: 'human' }], rules: CLASSIC_RULES, seed: 500 + game });
      // 보드에 세트가 있는 상태에서 시작하려고 몇 판 진행한 척: 첫 사람 랙을 큰 세트들로 바꿔 둔다
      // 보드에 세트가 있는 상태에서 시작 (랙은 보드에 없는 두 번째 사본들 중에서)
      const spare = Array.from({ length: 8 }, () => `${['r', 'b', 'o', 'k'][Math.floor(rng.next() * 4)]}${1 + Math.floor(rng.next() * 13)}'`);
      let t: Turn = turnOf({ table: ['r1 r2 r3 r4 r5', 'b7 b8 b9', 'k3 b3 o3', 'o10 o11 o12 o13'], rack: Array.from(new Set(spare)).join(' ') + (g0.pool.length ? '' : '') });
      const all = [...t.work.rack, ...t.work.sets.flatMap((s) => s.tiles)];
      const ids = Array.from(new Set(all));
      for (let step = 0; step < 60; step++) {
        const pick = ids[Math.floor(rng.next() * ids.length)] as TileId;
        const k = rng.next();
        let r;
        if (k < 0.6) r = placeTiles(t, [pick], { row: Math.floor(rng.next() * 8), col: Math.floor(rng.next() * BOARD_COLS) });
        else if (k < 0.7) r = moveTiles(t, [pick], { kind: 'rack' });
        else if (k < 0.78) r = moveTiles(t, [pick], { kind: 'staging' });
        else if (k < 0.86) r = moveTiles(t, [pick], { kind: 'new' });
        else if (k < 0.93) {
          const s = t.work.sets[Math.floor(rng.next() * t.work.sets.length)];
          r = s && s.tiles.length > 1 ? splitSet(t, s.id, 1 + Math.floor(rng.next() * (s.tiles.length - 1))) : tidyTurn(t);
        } else r = tidyTurn(t);
        if (r.ok) t = r.turn;
        clean(t);
        conserved(t, ids);
      }
    }
  });
});

describe('보드 — 한 판 통째로', () => {
  it('칸 놓기로 둔 판도 규칙대로 끝까지 가고, 매 차례 보드가 약속을 지킨다', () => {
    const rng = createRng(77);
    let g: GameState = newGame({ players: [{ name: 'a', seat: 'human' }, { name: 'b', seat: 'human' }], rules: CLASSIC_RULES, seed: 11 });
    const act = (a: GameAction): boolean => {
      const r = reduce(g, a);
      if (r.ok) g = r.state;
      return r.ok;
    };
    for (let turn = 0; turn < 120 && g.phase === 'playing'; turn++) {
      // 랙에서 아무 세 장을 보드의 빈 곳에 놓아 보고 (대부분 틀려서 못 낸다), 안 되면 뽑는다
      const rack = g.turn.work.rack;
      const three = [0, 1, 2].map(() => rack[Math.floor(rng.next() * rack.length)] as TileId);
      const spot = findSpot(new Set(occupancy(g.turn.work.sets).keys()), 3);
      if (new Set(three).size === 3) act({ type: 'move', tiles: three, to: { kind: 'cell', row: spot.row, col: spot.col } });
      if (!act({ type: 'commit' })) act({ type: 'draw' });
      expect(checkLayout(g.table)).toEqual([]);
      expect(checkLayout(g.turn.work.sets)).toEqual([]);
    }
  });
});

describe('보드 — 놓기 계산', () => {
  it('placeOnBoard는 놓을 칸이 막히면 아무것도 바꾸지 않는다', () => {
    const sets = tableOf(['r1 r2 r3']);
    const r = placeOnBoard(sets, TS('b1'), { row: sets[0]?.row ?? 0, col: (sets[0]?.col ?? 0) + 1 }, 9);
    expect(r).toEqual({ ok: false, error: 'occupied' });
  });

  it('정리: 고정한 세트는 자리를 지킨다', () => {
    const sets = layoutSets([
      { id: 'a', tiles: TS('r1 r2 r3'), row: 4, col: 4 },
      { id: 'b', tiles: TS('b1 b2 b3'), row: 6, col: 0 },
    ]);
    const out = tidySets(sets, new Set(['a']));
    expect(out.find((s) => s.id === 'a')).toMatchObject({ row: 4, col: 4 });
    expect(out.find((s) => s.id === 'b')).toMatchObject({ row: 0, col: 0 });
  });
});
