import { describe, expect, it } from 'vitest';
import { CELLS, canPlace, cellAt, gomokuReduce, gomokuValid, isDoubleThree, newGomoku, type GomokuState, type Stone } from '../engine';
import { gomokuDecide, scoreMoves, SCORE } from '../ai';
import { createRng } from '../../game/rng';
import type { AiLevel } from '../../game/types';

const P = (b: AiLevel | null = null, w: AiLevel | null = null) =>
  [
    { name: '흑', seat: b ? 'ai' : 'human', ...(b ? { ai: b } : {}), stone: 1 },
    { name: '백', seat: w ? 'ai' : 'human', ...(w ? { ai: w } : {}), stone: 2 },
  ] as const;

/** 판에 돌을 직접 놓은 상태 (수순은 흑백 번갈아 맞춘다) */
function board(stones: { b?: [number, number][]; w?: [number, number][] }, rules = { noDoubleThree: true }, turn?: 1 | 2): GomokuState {
  const s = newGomoku(P(), rules);
  const b = s.board.slice() as Stone[];
  const bs = (stones.b ?? []).map(([x, y]) => cellAt(x, y));
  const ws = (stones.w ?? []).map(([x, y]) => cellAt(x, y));
  bs.forEach((c) => (b[c] = 1));
  ws.forEach((c) => (b[c] = 2));
  const moves: number[] = [];
  for (let i = 0; i < Math.max(bs.length, ws.length); i++) {
    if (bs[i] !== undefined) moves.push(bs[i] as number);
    if (ws[i] !== undefined) moves.push(ws[i] as number);
  }
  return { ...s, board: b, moves, turn: turn ?? (bs.length > ws.length ? 2 : 1) };
}

function play(s: GomokuState, ...xys: [number, number][]): GomokuState {
  let cur = s;
  for (const [x, y] of xys) {
    const r = gomokuReduce(cur, { type: 'place', cell: cellAt(x, y) });
    if (!r.ok) throw new Error(`${x},${y}: ${r.error}`);
    cur = r.state;
  }
  return cur;
}

describe('오목 규칙', () => {
  it('가로·세로·대각선 다섯이면 이긴다 (육목도 승)', () => {
    let s = play(newGomoku(P(), { noDoubleThree: true }), [3, 7], [3, 8], [4, 7], [4, 8], [5, 7], [5, 8], [6, 7], [6, 8]);
    const r = gomokuReduce(s, { type: 'place', cell: cellAt(7, 7) });
    expect(r.ok && r.state.winner).toBe(1);
    expect(r.ok && r.state.line.length).toBe(5);
    s = play(newGomoku(P(), { noDoubleThree: false }), [0, 0], [14, 14], [1, 1], [14, 13], [2, 2], [14, 12], [3, 3], [14, 11]);
    const d = gomokuReduce(s, { type: 'place', cell: cellAt(4, 4) });
    expect(d.ok && d.state.winner).toBe(1);
    // 육목: 흑 1 2 3 _ 5 6 에 4를 두면 여섯
    const six = board({ b: [[1, 0], [2, 0], [3, 0], [5, 0], [6, 0]], w: [[0, 9], [1, 9], [2, 9], [3, 9], [8, 9]] }, { noDoubleThree: true }, 1);
    const r6 = gomokuReduce(six, { type: 'place', cell: cellAt(4, 0) });
    expect(r6.ok && r6.state.winner).toBe(1);
  });

  it('놓인 자리·끝난 판에는 못 두고, 판이 꽉 차면 무승부', () => {
    const s = play(newGomoku(P(), { noDoubleThree: true }), [7, 7]);
    expect(canPlace(s, cellAt(7, 7))).toBe('occupied');
    expect(canPlace(s, CELLS)).toBe('bad-cell');
  });

  it('흑 쌍삼은 금지, 백은 괜찮다, 오목이 되면 예외', () => {
    // 세로 (7,5)(7,6) + 가로 (5,7)(6,7) 에서 (7,7) = 열린 삼 둘
    const s = board({ b: [[7, 5], [7, 6], [5, 7], [6, 7]], w: [[0, 0], [14, 0], [0, 14], [14, 14]] }, { noDoubleThree: true }, 1);
    expect(isDoubleThree(s.board, cellAt(7, 7), 1)).toBe(true);
    expect(canPlace(s, cellAt(7, 7))).toBe('forbidden-33');
    expect(canPlace({ ...s, turn: 2 }, cellAt(7, 7), 2)).toBeNull(); // 백은 둘 수 있다
    // 규칙을 끄면 흑도 둔다
    expect(canPlace({ ...s, rules: { noDoubleThree: false } }, cellAt(7, 7))).toBeNull();
    // 한쪽이 막힌 삼은 열린 삼이 아니다 → 쌍삼 아님
    const blocked = board({ b: [[7, 5], [7, 6], [5, 7], [6, 7]], w: [[7, 4], [7, 8], [0, 14], [14, 14]] }, { noDoubleThree: true }, 1);
    expect(isDoubleThree(blocked.board, cellAt(7, 7), 1)).toBe(false);
    // 띈 삼(X.XX)도 삼으로 친다
    const split = board({ b: [[7, 4], [7, 6], [5, 7], [6, 7]], w: [[0, 0], [14, 0], [0, 14], [14, 14]] }, { noDoubleThree: true }, 1);
    expect(isDoubleThree(split.board, cellAt(7, 7), 1)).toBe(true);
    // 쌍삼이어도 그 수로 오목이면 둘 수 있다
    const five = board({ b: [[3, 7], [4, 7], [5, 7], [6, 7], [7, 5], [7, 6], [9, 9]], w: [[0, 0], [14, 0], [0, 14], [14, 14], [1, 1], [2, 2]] }, { noDoubleThree: true }, 1);
    expect(canPlace(five, cellAt(7, 7))).toBeNull();
  });

  it('무르기와 기권', () => {
    let s = play(newGomoku(P(), { noDoubleThree: true }), [7, 7], [7, 8], [8, 8]);
    const u = gomokuReduce(s, { type: 'undo', count: 2 });
    expect(u.ok && u.state.moves.length).toBe(1);
    expect(u.ok && u.state.turn).toBe(2);
    s = u.ok ? u.state : s;
    const r = gomokuReduce(s, { type: 'resign', stone: 2 });
    expect(r.ok && r.state.winner).toBe(1);
    expect(gomokuValid(s)).toBe(true);
    expect(gomokuValid({ ...s, board: s.board.map(() => 1) })).toBe(false);
  });
});

describe('오목 AI', () => {
  it('넷이면 이기고, 상대의 넷은 막는다', () => {
    const win = board({ b: [[3, 7], [4, 7], [5, 7], [6, 7]], w: [[3, 8], [4, 8], [5, 8]] }, { noDoubleThree: true }, 1);
    const c = gomokuDecide(win, createRng(1), 'beginner');
    expect([cellAt(7, 7), cellAt(2, 7)]).toContain(c);
    const block = board({ b: [[3, 7], [4, 7], [5, 7], [6, 7], [10, 10]], w: [[3, 8], [4, 8], [5, 8], [12, 1]] }, { noDoubleThree: true }, 2);
    for (const lvl of ['beginner', 'casual', 'advanced', 'expert'] as const) {
      expect([cellAt(7, 7), cellAt(2, 7)]).toContain(gomokuDecide(block, createRng(2), lvl));
    }
  });

  it('흑 AI는 쌍삼 자리에 두지 않는다', () => {
    const s = board({ b: [[7, 5], [7, 6], [5, 7], [6, 7]], w: [[0, 0], [14, 0], [0, 14], [14, 14]] }, { noDoubleThree: true }, 1);
    expect(scoreMoves(s).some((m) => m.cell === cellAt(7, 7))).toBe(false);
  });

  it('열린 삼은 막을 줄 안다 (보통 이상)', () => {
    const s = board({ b: [[6, 7], [7, 7], [8, 7], [2, 2]], w: [[7, 8], [9, 9], [12, 12]] }, { noDoubleThree: true }, 2);
    const c = gomokuDecide(s, createRng(3), 'advanced');
    expect([cellAt(5, 7), cellAt(9, 7), cellAt(4, 7), cellAt(10, 7)]).toContain(c);
    expect(SCORE.openFour).toBeGreaterThan(SCORE.four);
  });

  it('AI끼리 끝까지 두면 불법 수 없이 끝나고, 명인이 입문을 거의 이긴다', () => {
    let expertWins = 0;
    let expertLosses = 0;
    const games = 12;
    for (let g = 0; g < games; g++) {
      const expertBlack = g % 2 === 0;
      let s = newGomoku(P(expertBlack ? 'expert' : 'beginner', expertBlack ? 'beginner' : 'expert'), { noDoubleThree: true });
      const rng = createRng(100 + g);
      let guard = 0;
      while (!s.winner && guard++ < CELLS) {
        const lvl = s.players[s.turn === 1 ? 0 : 1].ai as AiLevel;
        const cell = gomokuDecide(s, rng, lvl);
        const r = gomokuReduce(s, { type: 'place', cell });
        expect(r.ok).toBe(true);
        if (!r.ok) break;
        s = r.state;
        expect(gomokuValid(s)).toBe(true);
      }
      expect(s.winner).not.toBe(0);
      if (s.winner === (expertBlack ? 1 : 2)) expertWins++;
      else if (s.winner !== 3) expertLosses++;
    }
    // AI끼리는 판이 꽉 차 비기기도 한다 — 명인은 지지 않고 대부분 이긴다
    expect(expertLosses).toBe(0);
    expect(expertWins).toBeGreaterThanOrEqual(8);
  });
});
