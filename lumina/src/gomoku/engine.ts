/**
 * 오목 커널 — 15×15, 흑이 먼저. 다섯 알 이상 이으면 이긴다.
 * 한국식 규칙 선택지: 흑 쌍삼 금지(기본 켬) — 한 수로 열린 삼이 둘 생기면 둘 수 없다(그 수로 오목이 되면 예외).
 * 순수 함수만. 화면·저장·온라인은 store.ts가 맡는다.
 */
import type { AiLevel } from '../game/types';

export type Stone = 0 | 1 | 2; // 0 빈칸, 1 흑, 2 백
export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export interface GomokuPlayer {
  readonly name: string;
  readonly seat: 'human' | 'ai';
  readonly ai?: AiLevel;
  readonly stone: 1 | 2;
}

export interface GomokuRules {
  /** 흑 쌍삼 금지 */
  readonly noDoubleThree: boolean;
}

export interface GomokuState {
  readonly v: 1;
  readonly board: readonly Stone[];
  /** 둘 차례의 돌 색 */
  readonly turn: 1 | 2;
  /** 둔 자리 (칸 번호) 순서대로 */
  readonly moves: readonly number[];
  /** 0 진행 중, 1 흑 승, 2 백 승, 3 무승부 */
  readonly winner: 0 | 1 | 2 | 3;
  /** 이긴 다섯 알 */
  readonly line: readonly number[];
  /** 기권한 쪽 (없으면 0) */
  readonly resigned: 0 | 1 | 2;
  readonly rules: GomokuRules;
  readonly players: readonly [GomokuPlayer, GomokuPlayer];
}

export type GomokuAction =
  | { readonly type: 'place'; readonly cell: number }
  | { readonly type: 'undo'; readonly count: number }
  | { readonly type: 'resign'; readonly stone: 1 | 2 };

export type GomokuEvent =
  | { readonly type: 'placed'; readonly cell: number; readonly stone: 1 | 2 }
  | { readonly type: 'win'; readonly stone: 1 | 2; readonly line: readonly number[] }
  | { readonly type: 'draw' }
  | { readonly type: 'resign'; readonly stone: 1 | 2 }
  | { readonly type: 'undo'; readonly cells: readonly number[] };

export type GomokuError = 'over' | 'bad-cell' | 'occupied' | 'forbidden-33' | 'nothing-to-undo';

export type GomokuResult = { readonly ok: true; readonly state: GomokuState; readonly events: readonly GomokuEvent[] } | { readonly ok: false; readonly error: GomokuError };

export const xy = (cell: number): [number, number] => [cell % SIZE, Math.floor(cell / SIZE)];
export const cellAt = (x: number, y: number): number => (x >= 0 && y >= 0 && x < SIZE && y < SIZE ? y * SIZE + x : -1);

export function newGomoku(players: readonly [GomokuPlayer, GomokuPlayer], rules: GomokuRules): GomokuState {
  return { v: 1, board: new Array<Stone>(CELLS).fill(0), turn: 1, moves: [], winner: 0, line: [], resigned: 0, rules, players };
}

/** 지금 차례인 사람 (players 번호) */
export function currentPlayer(s: GomokuState): number {
  return s.players[0].stone === s.turn ? 0 : 1;
}

/** cell을 지나 (dx, dy) 방향으로 같은 색이 몇 알 이어지는지 — 이어진 칸들 */
export function runThrough(board: readonly Stone[], cell: number, stone: Stone, dx: number, dy: number): number[] {
  const [x, y] = xy(cell);
  const cells = [cell];
  for (const sgn of [1, -1]) {
    let k = 1;
    for (;;) {
      const c = cellAt(x + dx * k * sgn, y + dy * k * sgn);
      if (c < 0 || board[c] !== stone) break;
      if (sgn === 1) cells.push(c);
      else cells.unshift(c);
      k++;
    }
  }
  return cells;
}

/** 이 칸에 두면 다섯 이상이 되는 줄 (없으면 null) — board에는 이미 놓여 있어야 한다 */
export function fiveAt(board: readonly Stone[], cell: number, stone: Stone): number[] | null {
  for (const [dx, dy] of DIRS) {
    const run = runThrough(board, cell, stone, dx, dy);
    if (run.length >= 5) return run;
  }
  return null;
}

/** 줄의 양 끝 바로 바깥이 비었는지 */
function openEnds(board: readonly Stone[], run: readonly number[], dx: number, dy: number): boolean {
  const [fx, fy] = xy(run[0] as number);
  const [lx, ly] = xy(run[run.length - 1] as number);
  const before = cellAt(fx - dx, fy - dy);
  const after = cellAt(lx + dx, ly + dy);
  return before >= 0 && after >= 0 && board[before] === 0 && board[after] === 0;
}

/**
 * 이 방향으로 "열린 삼"을 만들었는지: 빈칸 하나를 더 채우면 양쪽이 열린 곧은 사(.XXXX.)가 되는 모양.
 * (board에는 이미 cell이 놓여 있어야 한다. 이미 사·오가 된 방향은 삼이 아니다)
 */
export function openThreeDir(board: Stone[], cell: number, stone: Stone, dx: number, dy: number): boolean {
  if (runThrough(board, cell, stone, dx, dy).length >= 4) return false;
  const [x, y] = xy(cell);
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const e = cellAt(x + dx * k, y + dy * k);
    if (e < 0 || board[e] !== 0) continue;
    board[e] = stone;
    const run = runThrough(board, cell, stone, dx, dy);
    const ok = run.length === 4 && run.includes(e) && openEnds(board, run, dx, dy);
    board[e] = 0;
    if (ok) return true;
  }
  return false;
}

/** 흑이 여기 두면 쌍삼인가 (오목이 되면 예외) */
export function isDoubleThree(board: readonly Stone[], cell: number, stone: Stone): boolean {
  if (board[cell] !== 0) return false;
  const b = board.slice() as Stone[];
  b[cell] = stone;
  if (fiveAt(b, cell, stone)) return false;
  let threes = 0;
  for (const [dx, dy] of DIRS) {
    if (openThreeDir(b, cell, stone, dx, dy)) threes++;
    if (threes >= 2) return true;
  }
  return false;
}

/** 이 색이 이 칸에 둘 수 있는가 */
export function canPlace(s: GomokuState, cell: number, stone: 1 | 2 = s.turn): GomokuError | null {
  if (s.winner) return 'over';
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return 'bad-cell';
  if (s.board[cell] !== 0) return 'occupied';
  if (stone === 1 && s.rules.noDoubleThree && isDoubleThree(s.board, cell, 1)) return 'forbidden-33';
  return null;
}

export function gomokuReduce(s: GomokuState, a: GomokuAction): GomokuResult {
  switch (a.type) {
    case 'place': {
      const err = canPlace(s, a.cell);
      if (err) return { ok: false, error: err };
      const board = s.board.slice() as Stone[];
      board[a.cell] = s.turn;
      const moves = [...s.moves, a.cell];
      const events: GomokuEvent[] = [{ type: 'placed', cell: a.cell, stone: s.turn }];
      const five = fiveAt(board, a.cell, s.turn);
      if (five) {
        events.push({ type: 'win', stone: s.turn, line: five });
        return { ok: true, state: { ...s, board, moves, winner: s.turn, line: five }, events };
      }
      if (moves.length >= CELLS) {
        events.push({ type: 'draw' });
        return { ok: true, state: { ...s, board, moves, winner: 3 }, events };
      }
      return { ok: true, state: { ...s, board, moves, turn: s.turn === 1 ? 2 : 1 }, events };
    }
    case 'undo': {
      const n = Math.max(1, Math.min(a.count, s.moves.length));
      if (!s.moves.length) return { ok: false, error: 'nothing-to-undo' };
      const board = s.board.slice() as Stone[];
      const gone = s.moves.slice(-n);
      gone.forEach((c) => (board[c] = 0));
      const moves = s.moves.slice(0, -n);
      return { ok: true, state: { ...s, board, moves, turn: moves.length % 2 === 0 ? 1 : 2, winner: 0, line: [], resigned: 0 }, events: [{ type: 'undo', cells: gone }] };
    }
    case 'resign': {
      if (s.winner) return { ok: false, error: 'over' };
      const winner = a.stone === 1 ? 2 : 1;
      return { ok: true, state: { ...s, winner, resigned: a.stone }, events: [{ type: 'resign', stone: a.stone }] };
    }
    default:
      return { ok: false, error: 'bad-cell' };
  }
}

/** 저장·온라인으로 받은 판이 멀쩡한지 */
export function gomokuValid(s: unknown): s is GomokuState {
  try {
    const g = s as GomokuState;
    if (!g || g.v !== 1 || !Array.isArray(g.board) || g.board.length !== CELLS || !Array.isArray(g.moves)) return false;
    if (!Array.isArray(g.players) || g.players.length !== 2) return false;
    if (g.players[0].stone === g.players[1].stone) return false;
    const blacks = g.board.filter((c) => c === 1).length;
    const whites = g.board.filter((c) => c === 2).length;
    if (blacks + whites !== g.moves.length || blacks - whites < 0 || blacks - whites > 1) return false;
    if (!g.moves.every((c, i) => g.board[c] === (i % 2 === 0 ? 1 : 2))) return false;
    return g.turn === 1 || g.turn === 2;
  } catch {
    return false;
  }
}
