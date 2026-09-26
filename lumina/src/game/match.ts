/**
 * 매치 = 여러 판(game). 공식: 한 라운드는 인원수만큼의 판,
 * 마지막 라운드가 끝나면 이긴 판 수가 가장 많은 사람이 우승 (동률이면 점수가 높은 사람).
 */
import type { RuleSet } from './rules';
import { newGame, type GameState, type PlayerSetup } from './engine';

export type MatchFormat =
  | { readonly kind: 'games'; readonly games: number }
  | { readonly kind: 'points'; readonly target: number };

export interface GameSummary {
  readonly gameNo: number;
  readonly reason: 'out' | 'stalemate';
  readonly winners: readonly number[];
  readonly totals: readonly number[];
  readonly deltas: readonly number[];
  readonly turns: number;
}

export interface MatchState {
  readonly v: 1;
  readonly id: string;
  readonly seed: number;
  readonly format: MatchFormat;
  readonly rules: RuleSet;
  readonly seats: readonly PlayerSetup[];
  readonly scores: readonly number[];
  readonly wins: readonly number[];
  readonly history: readonly GameSummary[];
  readonly gameNo: number;
  readonly game: GameState;
  readonly recorded: boolean;
  readonly over: boolean;
  readonly champions: readonly number[];
}

export function gameSeed(matchSeed: number, gameNo: number): number {
  let h = (matchSeed ^ Math.imul(gameNo + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface NewMatchOptions {
  readonly seats: readonly PlayerSetup[];
  readonly rules: RuleSet;
  readonly format: MatchFormat;
  readonly seed: number;
  readonly id?: string;
}

export function newMatch(o: NewMatchOptions): MatchState {
  const n = o.seats.length;
  return {
    v: 1,
    id: o.id ?? `m${o.seed.toString(36)}`,
    seed: o.seed,
    format: o.format,
    rules: o.rules,
    seats: o.seats,
    scores: Array.from({ length: n }, () => 0),
    wins: Array.from({ length: n }, () => 0),
    history: [],
    gameNo: 1,
    game: newGame({ players: o.seats, rules: o.rules, seed: gameSeed(o.seed, 1) }),
    recorded: false,
    over: false,
    champions: [],
  };
}

function decideChampions(scores: readonly number[], wins: readonly number[], byWins: boolean): number[] {
  const idx = scores.map((_, i) => i);
  let pool = idx;
  if (byWins) {
    const w = Math.max(...wins);
    pool = idx.filter((i) => wins[i] === w);
  }
  const s = Math.max(...pool.map((i) => scores[i] as number));
  return pool.filter((i) => scores[i] === s);
}

/** 판이 끝났으면 점수표에 반영 (여러 번 불러도 한 번만 반영) */
export function recordGame(m: MatchState): MatchState {
  const g = m.game;
  if (g.phase !== 'over' || !g.result || m.recorded) return m;
  const r = g.result;
  const scores = m.scores.map((s, i) => s + (r.deltas[i] ?? 0));
  const wins = m.wins.map((w, i) => w + (r.winners.includes(i) ? 1 : 0));
  const history = [
    ...m.history,
    { gameNo: m.gameNo, reason: r.reason, winners: r.winners, totals: r.totals, deltas: r.deltas, turns: g.turnNo },
  ];
  let over = false;
  let champions: number[] = [];
  if (m.format.kind === 'games') {
    over = history.length >= m.format.games;
    if (over) champions = decideChampions(scores, wins, true);
  } else {
    over = scores.some((s) => s >= (m.format as { target: number }).target);
    if (over) champions = decideChampions(scores, wins, false);
  }
  return { ...m, scores, wins, history, recorded: true, over, champions };
}

export function nextGame(m: MatchState): MatchState {
  if (!m.recorded || m.over) return m;
  const gameNo = m.gameNo + 1;
  return {
    ...m,
    gameNo,
    game: newGame({ players: m.seats, rules: m.rules, seed: gameSeed(m.seed, gameNo) }),
    recorded: false,
  };
}

/** 같은 사람들로 처음부터 (새 시드) */
export function rematch(m: MatchState, seed: number): MatchState {
  return newMatch({ seats: m.seats, rules: m.rules, format: m.format, seed });
}
