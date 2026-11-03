/**
 * 별판 점프 AI — 내 말들의 "남은 거리"를 줄이는 수를 고른다.
 *  · 점수 = 줄어든 거리 + 뒤처진 말을 끌어올리는 덤 + (잘하는 AI) 다음 내 수까지 내다본 덤.
 *  · 도착 꼭짓점 안에서는 더 깊은 빈칸으로, 밖에 남은 말은 빈 도착 칸 쪽으로.
 *  · 방금 둔 수를 되돌리는 수는 피해서 왔다 갔다 하지 않는다.
 *  · 실력이 낮을수록 점수에 흔들림을 더하고 가끔 덜 좋은 수를 둔다.
 */
import type { AiLevel } from '../game/types';
import type { Rng } from '../game/rng';
import { apexOf, cornerCells, goalOf, hexDist, legalMoves, type StarState } from './engine';

interface Plan {
  readonly from: number;
  readonly to: number;
}

/** 말 하나의 거리: 도착 칸 안이면 끝까지, 밖이면 가장 가까운 빈(또는 내) 도착 칸까지 + 들어간 뒤 끝까지 */
function pieceCost(board: readonly number[], seat: number, goal: readonly number[], goalSet: ReadonlySet<number>, apex: number, cell: number): number {
  const d = hexDist(cell, apex);
  if (goalSet.has(cell)) return d;
  let near = 99;
  for (const g of goal) {
    if (board[g] !== 0 && board[g] !== seat + 1) continue;
    const x = hexDist(cell, g);
    if (x < near) near = x;
  }
  // 빈 도착 칸까지 가는 거리를 조금 더 무겁게 (밖에 남은 말이 들어가도록)
  return d + (near === 99 ? 0 : near * 0.35);
}

export function evaluate(board: readonly number[], s: Pick<StarState, 'players'>, seat: number): number {
  const goal = cornerCells(goalOf(s, seat));
  const goalSet = new Set(goal);
  const apex = apexOf(goalOf(s, seat));
  let sum = 0;
  let worst = 0;
  board.forEach((v, i) => {
    if (v !== seat + 1) return;
    const c = pieceCost(board, seat, goal, goalSet, apex, i);
    sum += c;
    if (c > worst) worst = c;
  });
  // 혼자 처진 말에 벌점
  return sum + worst * 0.6;
}

function after(board: readonly number[], m: Plan, seat: number): number[] {
  const b = [...board];
  b[m.from] = 0;
  b[m.to] = seat + 1;
  return b;
}

const NOISE: Record<AiLevel, number> = { beginner: 3.2, casual: 1.4, advanced: 0.45, expert: 0.1 };

export function starDecide(s: StarState, rng: Rng, level: AiLevel = 'casual'): Plan | null {
  const seat = s.turn;
  const moves = legalMoves(s, seat);
  if (!moves.length) return null;
  const base = evaluate(s.board, s, seat);
  const last = [...s.moves].reverse().find((m) => m.seat === seat);
  const scored = moves.map((m) => {
    const b = after(s.board, m, seat);
    let gain = base - evaluate(b, s, seat);
    if (last && m.from === last.to && m.to === last.from) gain -= 3;
    return { m, b, gain };
  });
  // 잘하는 AI: 좋은 후보 몇 개만 다음 내 수까지 내다본다 (상대는 가만히 있다고 보고)
  if (level === 'advanced' || level === 'expert') {
    const top = [...scored].sort((x, y) => y.gain - x.gain).slice(0, level === 'expert' ? 14 : 6);
    for (const c of top) {
      const s2 = { ...s, board: c.b };
      const e2 = evaluate(c.b, s, seat);
      let best = 0;
      for (const m2 of legalMoves(s2, seat)) {
        const g2 = e2 - evaluate(after(c.b, m2, seat), s, seat);
        if (g2 > best) best = g2;
      }
      c.gain += best * (level === 'expert' ? 0.6 : 0.4);
    }
  }
  const noise = NOISE[level];
  let pick = scored[0];
  let bestScore = -Infinity;
  for (const c of scored) {
    const v = c.gain + (rng.next() - 0.5) * noise;
    if (v > bestScore) {
      bestScore = v;
      pick = c;
    }
  }
  return pick ? { from: pick.m.from, to: pick.m.to } : null;
}
