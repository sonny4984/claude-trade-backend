/**
 * 게임 엔진 — 순수 리듀서. reduce(state, action) → 새 상태 + 이벤트.
 * 같은 시드와 같은 액션 순서면 언제나 같은 결과 (온라인 확장 시 서버가 그대로 재생해 검증할 수 있다).
 */
import type { AiLevel, Seat, TableSet, TileId } from './types';
import type { RuleSet } from './rules';
import { createRng, shuffle } from './rng';
import { TILES, isJoker, tile } from './tiles';
import { analyzeSet } from './sets';
import { canonicalTable, containsAll } from './table';
import {
  beginTurn,
  checkCommit,
  isChanged,
  moveTiles,
  playedTiles,
  proposeTable,
  redo,
  resetTurn,
  splitSet,
  swapJoker,
  undo,
  type CommitCheck,
  type MoveError,
  type MoveResult,
  type MoveTarget,
  type Turn,
} from './turn';
import { scoreGame } from './scoring';

export interface PlayerSetup {
  readonly name: string;
  readonly seat: Seat;
  readonly ai?: AiLevel;
}

export interface Player extends PlayerSetup {
  readonly rack: readonly TileId[];
  readonly melded: boolean;
}

export interface PlayerStats {
  readonly tilesPlayed: number;
  readonly largestMove: number;
  readonly jokersPlayed: number;
  readonly rearrangements: number;
  readonly draws: number;
  readonly timeouts: number;
  readonly meldTurn: number | null;
  readonly longestRun: number;
  readonly turns: number;
}

const EMPTY_STATS: PlayerStats = {
  tilesPlayed: 0,
  largestMove: 0,
  jokersPlayed: 0,
  rearrangements: 0,
  draws: 0,
  timeouts: 0,
  meldTurn: null,
  longestRun: 0,
  turns: 0,
};

export type LogEntry =
  | { readonly t: 'start'; readonly starter: number }
  | {
      readonly t: 'play';
      readonly p: number;
      readonly tiles: readonly TileId[];
      readonly meld: number;
      readonly rearranged: boolean;
      readonly turnNo: number;
    }
  | { readonly t: 'draw'; readonly p: number; readonly turnNo: number }
  | { readonly t: 'pass'; readonly p: number; readonly turnNo: number }
  | { readonly t: 'timeout'; readonly p: number; readonly drew: number; readonly turnNo: number }
  | { readonly t: 'end'; readonly winners: readonly number[]; readonly reason: 'out' | 'stalemate' };

export interface FirstDraw {
  /** 라운드별로 각 플레이어가 뽑은 타일 (재추첨에 빠진 사람은 null) */
  readonly rounds: readonly (readonly (TileId | null)[])[];
  readonly starter: number;
}

export interface GameResult {
  readonly reason: 'out' | 'stalemate';
  readonly winners: readonly number[];
  readonly totals: readonly number[];
  readonly deltas: readonly number[];
}

export interface GameState {
  readonly v: 1;
  readonly rules: RuleSet;
  readonly seed: number;
  readonly players: readonly Player[];
  readonly table: readonly TableSet[];
  readonly pool: readonly TileId[];
  readonly current: number;
  readonly turn: Turn;
  readonly turnNo: number;
  /** 더미가 빈 뒤 연속으로 넘긴 횟수 — 인원수만큼 쌓이면 막힘 종료 */
  readonly passes: number;
  readonly nextSetId: number;
  readonly phase: 'playing' | 'over';
  readonly log: readonly LogEntry[];
  readonly stats: readonly PlayerStats[];
  readonly firstDraw: FirstDraw;
  readonly result: GameResult | null;
}

export type GameAction =
  | { readonly type: 'move'; readonly tiles: readonly TileId[]; readonly to: MoveTarget }
  | { readonly type: 'swap'; readonly tile: TileId; readonly joker: TileId }
  | { readonly type: 'split'; readonly setId: string; readonly at: number }
  | { readonly type: 'propose'; readonly sets: readonly (readonly TileId[])[] }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'reset' }
  | { readonly type: 'commit' }
  | { readonly type: 'draw' }
  | { readonly type: 'timeout' };

export type GameEvent =
  | { readonly type: 'changed' }
  | { readonly type: 'melded'; readonly p: number; readonly points: number; readonly continues: boolean }
  | { readonly type: 'played'; readonly p: number; readonly tiles: readonly TileId[]; readonly rearranged: boolean }
  | { readonly type: 'drew'; readonly p: number; readonly tiles: readonly TileId[] }
  | { readonly type: 'passed'; readonly p: number }
  | { readonly type: 'timeout'; readonly p: number; readonly penalty: number; readonly auto: 'commit' | 'revert' | 'draw' }
  | { readonly type: 'turn'; readonly p: number }
  | { readonly type: 'over'; readonly result: GameResult };

export type GameError =
  | MoveError
  | 'not-playing'
  | 'nothing-to-undo'
  | 'nothing-to-redo'
  | 'commit-invalid'
  | 'no-draw-after-meld';

export type Reduction =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: GameError; readonly check?: CommitCheck };

// ─────────────────────────────── 시작 ───────────────────────────────

function tileRank(id: TileId | null): number {
  if (id === null) return -2;
  const t = tile(id);
  return t.kind === 'number' ? t.value : -1; // 조커는 숫자가 없으니 다시 뽑는다
}

/** 공식: 각자 한 장씩 뽑아 가장 높은 숫자가 먼저. 동점·조커는 그 사람들끼리 다시 뽑는다 */
export function drawForFirst(n: number, seed: number): FirstDraw {
  const rng = createRng(seed ^ 0x5f3759df);
  let deck = shuffle(TILES.map((t) => t.id), rng);
  let contenders = Array.from({ length: n }, (_, i) => i);
  const rounds: (TileId | null)[][] = [];
  for (let guard = 0; guard < 20; guard++) {
    if (deck.length < contenders.length) deck = shuffle(TILES.map((t) => t.id), rng);
    const row: (TileId | null)[] = Array.from({ length: n }, () => null);
    for (const p of contenders) row[p] = deck.pop() as TileId;
    rounds.push(row);
    const best = Math.max(...contenders.map((p) => tileRank(row[p] ?? null)));
    const top = contenders.filter((p) => tileRank(row[p] ?? null) === best);
    if (top.length === 1 && best > 0) return { rounds, starter: top[0] as number };
    contenders = best > 0 ? top : contenders;
  }
  return { rounds, starter: contenders[0] ?? 0 };
}

export interface NewGameOptions {
  readonly players: readonly PlayerSetup[];
  readonly rules: RuleSet;
  readonly seed: number;
}

export function newGame(opts: NewGameOptions): GameState {
  const n = opts.players.length;
  if (n < 2 || n > 4) throw new Error('2~4명이 필요합니다');
  const firstDraw = drawForFirst(n, opts.seed);
  const rng = createRng(opts.seed);
  const deck = shuffle(TILES.map((t) => t.id), rng);
  const per = opts.rules.tilesPerPlayer;
  const players: Player[] = opts.players.map((p, i) => ({
    ...p,
    rack: deck.slice(i * per, (i + 1) * per),
    melded: false,
  }));
  const pool = deck.slice(n * per);
  const starter = firstDraw.starter;
  return {
    v: 1,
    rules: opts.rules,
    seed: opts.seed,
    players,
    table: [],
    pool,
    current: starter,
    turn: beginTurn(starter, [], (players[starter] as Player).rack, false, 1),
    turnNo: 1,
    passes: 0,
    nextSetId: 1,
    phase: 'playing',
    log: [{ t: 'start', starter }],
    stats: players.map(() => EMPTY_STATS),
    firstDraw,
    result: null,
  };
}

// ─────────────────────────────── 진행 ───────────────────────────────

function withTurn(state: GameState, r: MoveResult): Reduction {
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, state: { ...state, turn: r.turn }, events: [{ type: 'changed' }] };
}

function setAt<T>(arr: readonly T[], i: number, v: T): T[] {
  const out = arr.slice();
  out[i] = v;
  return out;
}

function nextTurn(state: GameState, events: GameEvent[]): Reduction {
  const n = state.players.length;
  const next = (state.current + 1) % n;
  const p = state.players[next] as Player;
  const turn = beginTurn(next, state.table, p.rack, p.melded, state.nextSetId);
  events.push({ type: 'turn', p: next });
  return { ok: true, state: { ...state, current: next, turn, turnNo: state.turnNo + 1 }, events };
}

function finishGame(state: GameState, winner: number | null, events: GameEvent[]): Reduction {
  const out = scoreGame(
    state.players.map((p) => p.rack),
    state.players.map((p) => p.melded),
    winner,
    state.rules,
  );
  const result: GameResult = {
    reason: winner === null ? 'stalemate' : 'out',
    winners: out.winners,
    totals: out.totals,
    deltas: out.deltas,
  };
  events.push({ type: 'over', result });
  return {
    ok: true,
    state: {
      ...state,
      phase: 'over',
      result,
      log: [...state.log, { t: 'end', winners: out.winners, reason: result.reason }],
    },
    events,
  };
}

/** 테이블에 있던 세트가 쪼개지거나 섞였는가 (붙이기만 한 건 재배열이 아님) */
function wasRearranged(before: readonly TableSet[], after: readonly TableSet[]): boolean {
  return before.some((s0) => !after.some((s1) => containsAll(s1.tiles, s0.tiles)));
}

function longestRunWith(sets: readonly TableSet[], tiles: readonly TileId[]): number {
  let best = 0;
  const mine = new Set(tiles);
  for (const s of sets) {
    if (!s.tiles.some((t) => mine.has(t))) continue;
    const a = analyzeSet(s.tiles);
    if (a.ok && a.kind === 'run') best = Math.max(best, s.tiles.length);
  }
  return best;
}

/** 작업본을 확정하고 차례를 넘긴다 (endTurn=false면 첫 등록 체크포인트) */
function applyCommit(state: GameState, check: CommitCheck, endTurn: boolean, events: GameEvent[]): Reduction {
  const turn = state.turn;
  const p = turn.player;
  const w = turn.work;
  const player = state.players[p] as Player;
  const played = check.played;
  const totalPlayed = turn.rackAtTurnStart.filter((t) => !w.rack.includes(t));
  const becameMelded = !player.melded && check.kind === 'meld';
  const players = setAt(state.players, p, { ...player, rack: w.rack.slice(), melded: player.melded || check.kind === 'meld' });
  const st = state.stats[p] as PlayerStats;
  const rearranged = wasRearranged(turn.start.sets, w.sets);
  const stats = setAt(state.stats, p, {
    ...st,
    tilesPlayed: st.tilesPlayed + played.length,
    jokersPlayed: st.jokersPlayed + played.filter(isJoker).length,
    rearrangements: st.rearrangements + (rearranged ? 1 : 0),
    meldTurn: becameMelded ? state.turnNo : st.meldTurn,
    largestMove: Math.max(st.largestMove, totalPlayed.length),
    longestRun: Math.max(st.longestRun, longestRunWith(w.sets, played)),
    turns: st.turns + (endTurn ? 1 : 0),
  });
  let next: GameState = { ...state, players, stats, table: canonicalTable(w.sets), nextSetId: w.nextSetId, passes: 0 };

  if (check.kind === 'meld') {
    events.push({ type: 'melded', p, points: check.meldPoints, continues: !endTurn && w.rack.length > 0 });
  }
  if (played.length) events.push({ type: 'played', p, tiles: played, rearranged });

  if (!w.rack.length) {
    next = {
      ...next,
      log: [...next.log, { t: 'play', p, tiles: totalPlayed, meld: check.meldPoints || turn.meldPoints, rearranged, turnNo: state.turnNo }],
    };
    return finishGame(next, p, events);
  }

  if (!endTurn) {
    // 하우스 룰 "등록 후 계속": 등록한 타일은 확정되고, 여기서부터 새 기준점으로 계속한다
    const cp = { ...w, sets: next.table, staging: [] as TileId[] };
    return {
      ok: true,
      state: {
        ...next,
        turn: { ...turn, start: cp, work: cp, past: [], future: [], meldedNow: true, meldPoints: check.meldPoints },
      },
      events,
    };
  }

  next = {
    ...next,
    log: [
      ...next.log,
      { t: 'play', p, tiles: totalPlayed, meld: check.kind === 'meld' ? check.meldPoints : turn.meldPoints, rearranged, turnNo: state.turnNo },
    ],
  };
  return nextTurn(next, events);
}

function drawTiles(state: GameState, count: number): { state: GameState; drawn: TileId[] } {
  const p = state.turn.player;
  const k = Math.min(count, state.pool.length);
  const drawn = state.pool.slice(state.pool.length - k).reverse();
  const pool = state.pool.slice(0, state.pool.length - k);
  const player = state.players[p] as Player;
  const players = setAt(state.players, p, { ...player, rack: [...player.rack, ...drawn] });
  return { state: { ...state, pool, players }, drawn };
}

/** 뽑거나(더미가 있으면) 넘기고(없으면) 차례를 끝낸다 */
function drawOrPass(state: GameState, count: number, events: GameEvent[], kind: 'draw' | 'timeout'): Reduction {
  const p = state.turn.player;
  const st = state.stats[p] as PlayerStats;
  if (!state.pool.length || count === 0) {
    const passes = state.pool.length ? state.passes : state.passes + 1;
    let next: GameState = {
      ...state,
      passes,
      stats: setAt(state.stats, p, { ...st, turns: st.turns + 1, timeouts: st.timeouts + (kind === 'timeout' ? 1 : 0) }),
      log: [...state.log, kind === 'timeout' ? { t: 'timeout', p, drew: 0, turnNo: state.turnNo } : { t: 'pass', p, turnNo: state.turnNo }],
    };
    events.push({ type: 'passed', p });
    if (!state.pool.length && passes >= state.players.length) return finishGame(next, null, events);
    next = { ...next };
    return nextTurn(next, events);
  }
  const d = drawTiles(state, count);
  events.push({ type: 'drew', p, tiles: d.drawn });
  const next: GameState = {
    ...d.state,
    passes: 0,
    stats: setAt(d.state.stats, p, {
      ...st,
      draws: st.draws + d.drawn.length,
      turns: st.turns + 1,
      timeouts: st.timeouts + (kind === 'timeout' ? 1 : 0),
    }),
    log: [
      ...d.state.log,
      kind === 'timeout' ? { t: 'timeout', p, drew: d.drawn.length, turnNo: state.turnNo } : { t: 'draw', p, turnNo: state.turnNo },
    ],
  };
  return nextTurn(next, events);
}

/** 이번 차례에 확정된 것까지 되돌린 상태의 게임 (등록 체크포인트가 있으면 거기까지) */
function revertWork(state: GameState): GameState {
  const t = state.turn;
  return { ...state, turn: { ...t, work: t.start, past: [], future: [] } };
}

export function reduce(state: GameState, action: GameAction): Reduction {
  if (state.phase !== 'playing') return { ok: false, error: 'not-playing' };
  const turn = state.turn;
  switch (action.type) {
    case 'move':
      return withTurn(state, moveTiles(turn, action.tiles, action.to));
    case 'swap':
      return withTurn(state, swapJoker(turn, action.tile, action.joker));
    case 'split':
      return withTurn(state, splitSet(turn, action.setId, action.at));
    case 'propose':
      return withTurn(state, proposeTable(turn, action.sets));
    case 'undo': {
      const t = undo(turn);
      return t ? { ok: true, state: { ...state, turn: t }, events: [{ type: 'changed' }] } : { ok: false, error: 'nothing-to-undo' };
    }
    case 'redo': {
      const t = redo(turn);
      return t ? { ok: true, state: { ...state, turn: t }, events: [{ type: 'changed' }] } : { ok: false, error: 'nothing-to-redo' };
    }
    case 'reset':
      return { ok: true, state: { ...state, turn: resetTurn(turn) }, events: [{ type: 'changed' }] };
    case 'commit': {
      const check = checkCommit(turn, state.rules);
      if (!check.ok) return { ok: false, error: 'commit-invalid', check };
      const endTurn = !(check.kind === 'meld' && state.rules.initialMeldContinuesTurn);
      return applyCommit(state, check, endTurn, []);
    }
    case 'draw': {
      if (turn.meldedNow) return { ok: false, error: 'no-draw-after-meld' };
      return drawOrPass(revertWork(state), 1, [], 'draw');
    }
    case 'timeout': {
      const check = checkCommit(turn, state.rules);
      // 시간이 끝났을 때 테이블이 이미 합법이고 낼 것을 냈다면 그대로 확정한다 (실물 게임엔 "내기" 버튼이 없다)
      // (등록 후 계속 규칙에서 등록만 하고 더 둔 게 없으면 kind='end'로 여기서 끝난다)
      if (check.ok && (check.changed || turn.meldedNow)) {
        const events: GameEvent[] = [{ type: 'timeout', p: turn.player, penalty: 0, auto: 'commit' }];
        return applyCommit(state, check, true, events);
      }
      if (isChanged(turn)) {
        // 공식 "Incomplete Runs": 테이블을 원래대로, 낸 타일은 회수, 벌칙으로 3장.
        // 등록 체크포인트가 있으면 등록한 부분은 이미 확정 — 그 뒤 조작만 되돌린다.
        const penalty = state.rules.timeoutPenaltyDraw;
        const events: GameEvent[] = [{ type: 'timeout', p: turn.player, penalty, auto: 'revert' }];
        return drawOrPass(revertWork(state), penalty, events, 'timeout');
      }
      // 아무것도 안 했으면: 공식 "Time Limit" — 한 장 뽑고 끝
      const events: GameEvent[] = [{ type: 'timeout', p: turn.player, penalty: 1, auto: 'draw' }];
      return drawOrPass(state, 1, events, 'timeout');
    }
  }
}

// ─────────────────────────────── 조회 도우미 ───────────────────────────────

export function currentPlayer(state: GameState): Player {
  return state.players[state.current] as Player;
}

/** 이번 차례에 낸 타일 (UI 강조용) */
export function freshTiles(state: GameState): TileId[] {
  return playedTiles(state.turn);
}

export function canUndo(state: GameState): boolean {
  return state.turn.past.length > 0;
}

export function canRedo(state: GameState): boolean {
  return state.turn.future.length > 0;
}
