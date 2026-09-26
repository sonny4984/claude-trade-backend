/**
 * 힌트 — 대신 두지 않는다. 단계적으로만 보여 준다.
 *   1단계: 낼 수 있는 타일 하나를 비춘다 (focus)
 *   2단계: 그 타일이 갈 세트를 비춘다 (targetSetId, 새 줄이면 null)
 *   3단계: 완성된 테이블을 미리 보여 주고, 확인하면 그대로 놓는다 (proposal)
 * 기준은 이 차례의 시작 상태(이미 옮겨 둔 게 있어도 처음부터 다시 생각한다).
 */
import type { TableSet, TileId } from './types';
import type { GameState } from './engine';
import { AI_PROFILES, findMeld } from './ai';
import { MAX_TILES, solve, stabilize } from './solver';
import { tilesOf } from './table';
import { canManipulate } from './turn';

export interface Hint {
  readonly kind: 'meld' | 'play' | 'draw' | 'end';
  readonly tiles: readonly TileId[];
  readonly focus: TileId | null;
  readonly targetSetId: string | null;
  readonly proposal: readonly (readonly TileId[])[];
  readonly points: number;
}

const NONE = (kind: 'draw' | 'end'): Hint => ({ kind, tiles: [], focus: null, targetSetId: null, proposal: [], points: 0 });

function bestOverlap(set: readonly TileId[], original: readonly TableSet[], exclude: TileId): { id: string | null; whole: boolean } {
  let id: string | null = null;
  let best = 0;
  let whole = false;
  for (const s of original) {
    const overlap = s.tiles.filter((t) => t !== exclude && set.includes(t)).length;
    if (overlap > best) {
      best = overlap;
      id = s.id;
      whole = overlap === s.tiles.length;
    }
  }
  return { id, whole };
}

export function computeHint(state: GameState): Hint {
  const turn = state.turn;
  const start = turn.start;
  if (!canManipulate(turn)) {
    const meld = findMeld(start.rack, state.rules.initialMeldPoints, AI_PROFILES.beginner);
    if (!meld) return NONE('draw');
    return {
      kind: 'meld',
      tiles: meld.played,
      focus: meld.sets[0]?.[0] ?? null,
      targetSetId: null,
      proposal: [...start.sets.map((s) => s.tiles.slice()), ...meld.sets],
      points: meld.points,
    };
  }
  const sol = solve({ table: tilesOf(start.sets), rack: start.rack, weights: MAX_TILES });
  if (!sol || !sol.played.length) return NONE(turn.meldedNow ? 'end' : 'draw');
  const proposal = stabilize(sol.sets, start.sets.map((s) => s.tiles));
  // 가장 쉬운 수부터: 온전한 기존 세트에 붙는 타일 → 랙 타일끼리 새 줄 → 재배열이 필요한 타일
  let focus: TileId | null = null;
  let target: string | null = null;
  let rank = 9;
  for (const t of sol.played) {
    const home = proposal.find((s) => s.includes(t)) as TileId[];
    const ov = bestOverlap(home, start.sets, t);
    const onlyRack = home.every((x) => start.rack.includes(x));
    const r = ov.whole ? 0 : onlyRack ? 1 : 2;
    if (r < rank) {
      rank = r;
      focus = t;
      target = onlyRack ? null : ov.id;
    }
  }
  return { kind: 'play', tiles: sol.played, focus, targetSetId: target, proposal, points: 0 };
}
