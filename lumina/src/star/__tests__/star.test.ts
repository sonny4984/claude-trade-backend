import { describe, expect, it } from 'vitest';
import { CELLS, MAX_TURNS, MIN_REMAINING, NEIGHBORS, apexOf, arrived, cellAt, cornerCells, hasWon, homesFor, legalMoves, newStar, reach, remaining, starReduce, starValid, type StarPlayer, type StarState } from '../engine';
import { starDecide } from '../ai';
import { createRng } from '../../game/rng';
import type { AiLevel } from '../../game/types';

const P = (name: string, ai?: AiLevel): StarPlayer => ({ name, seat: ai ? 'ai' : 'human', ...(ai ? { ai } : {}), character: 'moka' });

function ok(s: StarState, a: Parameters<typeof starReduce>[1]): StarState {
  const r = starReduce(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function play(levels: AiLevel[], seed: number): StarState {
  let s = newStar(levels.map((l, i) => P(`AI${i}`, l)));
  const rng = createRng(seed);
  while (s.winner === null) {
    const m = starDecide(s, rng, s.players[s.turn]?.ai ?? 'casual');
    if (!m) throw new Error('no move');
    s = ok(s, { type: 'move', ...m });
  }
  return s;
}

describe('별판', () => {
  it('121칸, 꼭짓점마다 10칸, 이웃은 최대 6', () => {
    expect(CELLS).toHaveLength(121);
    for (const c of ['q+', 'q-', 'r+', 'r-', 's+', 's-'] as const) expect(cornerCells(c)).toHaveLength(10);
    expect(CELLS.filter((c) => c.corner === null)).toHaveLength(61);
    expect(NEIGHBORS[cellAt(0, 0)]?.every((n) => n >= 0)).toBe(true);
    expect(CELLS[apexOf('r-')]).toMatchObject({ q: 4, r: -8 });
  });
  it('2명은 위아래, 3명은 하나 걸러 꼭짓점', () => {
    expect(homesFor(2)).toEqual(['r+', 'r-']);
    expect(homesFor(3)).toEqual(['r+', 's+', 'q+']);
    const s = newStar([P('a'), P('b'), P('c')]);
    for (let seat = 0; seat < 3; seat++) expect(s.board.filter((v) => v === seat + 1)).toHaveLength(10);
    expect(starValid(s)).toBe(true);
    expect(remaining(s, 0)).toBeGreaterThan(MIN_REMAINING);
  });
});

describe('움직임', () => {
  it('한 칸 걷기와 이어 뛰기', () => {
    const board = CELLS.map(() => 0);
    const a = cellAt(0, 0);
    board[a] = 1;
    board[cellAt(1, 0)] = 2; // 오른쪽에 말
    board[cellAt(3, 0)] = 2; // 하나 건너 또 말 → 두 번 뛰기
    const r = reach(board, a);
    expect(r.get(cellAt(-1, 0))).toEqual([a, cellAt(-1, 0)]);
    expect(r.get(cellAt(2, 0))).toEqual([a, cellAt(2, 0)]);
    expect(r.get(cellAt(4, 0))).toEqual([a, cellAt(2, 0), cellAt(4, 0)]);
    // 걸은 칸에서 더 뛰지는 않는다 / 말이 있는 칸엔 못 간다
    expect(r.has(cellAt(1, 0))).toBe(false);
  });
  it('남의 말은 못 움직이고, 못 가는 곳은 막힌다', () => {
    const s = newStar([P('a'), P('b')]);
    const mine = s.board.findIndex((v) => v === 1);
    const theirs = s.board.findIndex((v) => v === 2);
    expect(starReduce(s, { type: 'move', from: theirs, to: theirs })).toEqual({ ok: false, error: 'not-yours' });
    expect(starReduce(s, { type: 'move', from: mine, to: cellAt(0, 0) })).toEqual({ ok: false, error: 'blocked' });
    const m = legalMoves(s, 0)[0];
    if (!m) throw new Error('no move');
    const next = ok(s, { type: 'move', from: m.from, to: m.to });
    expect(next.turn).toBe(1);
    expect(next.moves).toHaveLength(1);
    const back = ok(next, { type: 'undo', count: 1 });
    expect(back.board).toEqual(s.board);
    expect(back.turn).toBe(0);
  });
  it('도착 꼭짓점이 꽉 차고 내 말이 있으면 이긴다 (막기 방지)', () => {
    const s = newStar([P('a'), P('b')]);
    const board = CELLS.map(() => 0);
    const goal = cornerCells('r-');
    goal.forEach((i, k) => (board[i] = k < 8 ? 1 : 2));
    const st = { ...s, board };
    expect(hasWon(st, 0)).toBe(true);
    expect(arrived(st, 0)).toBe(8);
    expect(hasWon({ ...st, board: board.map((v, i) => (i === goal[0] ? 0 : v)) }, 0)).toBe(false);
  });
  it('기권하면 남은 사람 중 거리가 짧은 사람이 이긴다', () => {
    const s = newStar([P('a'), P('b'), P('c')]);
    const r = ok(s, { type: 'resign', seat: 0 });
    expect(r.winner === 1 || r.winner === 2).toBe(true);
    expect(r.reason).toBe('resign');
  });
});

describe('AI끼리', () => {
  it('3명 판이 집에 다 들어가서 끝난다 (수 한도 전에)', () => {
    let homes = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = play(['expert', 'advanced', 'casual'], seed);
      if (s.reason === 'home') homes++;
      expect(s.moves.length).toBeLessThanOrEqual(MAX_TURNS * 3);
    }
    expect(homes).toBeGreaterThanOrEqual(5);
  });
  it('2명 판도 끝나고, 잘하는 AI가 대체로 이긴다', () => {
    let strong = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = play(seed % 2 ? ['expert', 'beginner'] : ['beginner', 'expert'], seed);
      const expertSeat = seed % 2 ? 0 : 1;
      if (s.winner === expertSeat) strong++;
    }
    expect(strong).toBeGreaterThanOrEqual(6);
  });
});
