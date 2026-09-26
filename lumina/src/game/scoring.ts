/**
 * 점수 — 공식 규칙서 "Scoring"
 * - 누군가 랙을 비우면: 나머지는 랙 합계를 음수로, 승자는 그 합을 양수로 얻는다. 랙의 조커는 30점.
 * - 더미가 떨어져 아무도 못 낼 때: 랙 합계가 가장 낮은 사람이 이기고,
 *   각자 (자기 합 − 승자 합)만큼 잃으며, 승자는 그 합을 얻는다.
 */
import type { TileId } from './types';
import type { RuleSet } from './rules';
import { faceValue, isJoker } from './tiles';

export function rackValue(rack: readonly TileId[], rules: RuleSet, melded = true): number {
  let sum = 0;
  for (const t of rack) sum += isJoker(t) ? rules.jokerPenalty : faceValue(t);
  if (!melded) sum += rules.unmeldedPenalty;
  return sum;
}

export interface ScoreOutcome {
  readonly winners: readonly number[];
  readonly totals: readonly number[];
  readonly deltas: readonly number[];
}

/** winner가 있으면 그 사람이 랙을 비운 것, null이면 막힘(더미 소진) 종료 */
export function scoreGame(
  racks: readonly (readonly TileId[])[],
  melded: readonly boolean[],
  winner: number | null,
  rules: RuleSet,
): ScoreOutcome {
  const totals = racks.map((r, i) => rackValue(r, rules, melded[i] ?? true));
  const n = racks.length;
  if (winner !== null) {
    const deltas = totals.map((t, i) => (i === winner ? 0 : -t));
    deltas[winner] = totals.reduce((s, t, i) => (i === winner ? s : s + t), 0);
    return { winners: [winner], totals, deltas };
  }
  const min = Math.min(...totals);
  const winners: number[] = [];
  for (let i = 0; i < n; i++) if (totals[i] === min) winners.push(i);
  const deltas = totals.map((t) => -(t - min));
  const pot = totals.reduce((s, t) => s + (t - min), 0);
  const share = Math.floor(pot / winners.length);
  let rest = pot - share * winners.length;
  for (const w of winners) {
    deltas[w] = share + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return { winners, totals, deltas };
}
