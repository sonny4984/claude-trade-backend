/**
 * AI 대 AI 시뮬레이션 — 테스트·밸런스 확인용. 매 수마다 불변식을 검사한다.
 *  · 106장이 더미·랙·테이블에 정확히 한 번씩
 *  · 확정된 테이블의 모든 세트가 합법
 *  · AI 결정이 엔진에서 거절된 횟수(fallback) — 0이어야 정상
 */
import type { AiLevel, TileId } from './types';
import { createRng } from './rng';
import { newGame, type GameState, type PlayerSetup } from './engine';
import { AI_PROFILES, playAiTurn } from './ai';
import { analyzeSet } from './sets';
import { CLASSIC_RULES, type RuleSet } from './rules';

export interface SimResult {
  readonly state: GameState;
  readonly turns: number;
  readonly fallbacks: number;
  readonly violations: readonly string[];
  readonly decisionsMs: number;
}

export function checkInvariants(s: GameState): string[] {
  const out: string[] = [];
  const all: TileId[] = [...s.pool, ...s.players.flatMap((p) => p.rack), ...s.table.flatMap((x) => x.tiles)];
  if (all.length !== 106) out.push(`tile count ${all.length}`);
  if (new Set(all).size !== all.length) out.push('duplicate tile');
  for (const set of s.table) if (!analyzeSet(set.tiles).ok) out.push(`invalid set ${set.id}`);
  return out;
}

export function simulateGame(seed: number, levels: readonly AiLevel[], rules: RuleSet = CLASSIC_RULES, maxTurns = 3000): SimResult {
  const players: PlayerSetup[] = levels.map((l) => ({ name: AI_PROFILES[l].name, seat: 'ai', ai: l }));
  let state = newGame({ players, rules, seed });
  const rng = createRng(seed ^ 0xabcdef);
  let fallbacks = 0;
  let steps = 0;
  let ms = 0;
  const violations: string[] = [];
  while (state.phase === 'playing' && steps < maxTurns) {
    const lvl = levels[state.current] as AiLevel;
    const t0 = Date.now();
    const r = playAiTurn(state, rng, AI_PROFILES[lvl]);
    ms += Date.now() - t0;
    if (r.fallback) fallbacks++;
    state = r.state;
    steps++;
    const v = checkInvariants(state);
    if (v.length) {
      violations.push(...v.map((x) => `step ${steps}: ${x}`));
      break;
    }
  }
  if (state.phase === 'playing') violations.push('did not finish');
  return { state, turns: steps, fallbacks, violations, decisionsMs: ms };
}
