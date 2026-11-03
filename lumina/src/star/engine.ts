/**
 * 별판 점프 규칙 — UI와 무관한 순수 함수. 모든 변화는 starReduce()만 만든다.
 *  · 판: 육각 별 모양 121칸 (가운데 육각형 61칸 + 꼭짓점 삼각형 6개 × 10칸).
 *  · 각자 자기 꼭짓점에 말 10개. 맞은편 꼭짓점에 말을 모두 옮기면 이긴다.
 *  · 한 번에 하나: 바로 옆 빈칸으로 한 칸, 또는 바로 옆 말(누구 것이든)을 넘어 그 뒤 빈칸으로 뛰기.
 *    뛰기는 이어서 여러 번 할 수 있다 (한 칸 걷기 뒤에는 못 뛴다).
 *  · 막기 방지: 도착 꼭짓점이 다 찼고 그중 하나라도 내 말이면 이긴 것으로 친다.
 *  · 수가 너무 길어지면(자리마다 MAX_TURNS 번) 남은 거리가 가장 짧은 사람이 이긴다.
 * 좌표: 축 좌표 (q, r), s = -q - r. 화면: x = √3(q + r/2), y = 1.5r.
 */
import type { AiLevel } from '../game/types';
import type { CharacterId } from '../characters/roster';

export type Corner = 'q+' | 'q-' | 'r+' | 'r-' | 's+' | 's-';

export interface Cell {
  readonly q: number;
  readonly r: number;
  readonly s: number;
  readonly corner: Corner | null;
}

/** 이웃 6방향 */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

function cornerOf(q: number, r: number, s: number): Corner | null {
  if (q > 4) return 'q+';
  if (q < -4) return 'q-';
  if (r > 4) return 'r+';
  if (r < -4) return 'r-';
  if (s > 4) return 's+';
  if (s < -4) return 's-';
  return null;
}

/** 121칸 — 위에서 아래(r), 왼쪽에서 오른쪽(q) 순서 */
export const CELLS: readonly Cell[] = (() => {
  const out: Cell[] = [];
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const s = -q - r;
      const up = q >= -4 && r >= -4 && s >= -4;
      const down = q <= 4 && r <= 4 && s <= 4;
      if (up || down) out.push({ q, r, s, corner: cornerOf(q, r, s) });
    }
  }
  return out;
})();

const INDEX = new Map(CELLS.map((c, i) => [`${c.q},${c.r}`, i] as const));
export const cellAt = (q: number, r: number): number => INDEX.get(`${q},${r}`) ?? -1;

/** 칸마다 이웃 (방향별, 없으면 -1) */
export const NEIGHBORS: readonly (readonly number[])[] = CELLS.map((c) => DIRS.map(([dq, dr]) => cellAt(c.q + dq, c.r + dr)));

const OPPOSITE: Record<Corner, Corner> = { 'q+': 'q-', 'q-': 'q+', 'r+': 'r-', 'r-': 'r+', 's+': 's-', 's-': 's+' };

/** 자리 수별 출발 꼭짓점 (0번 자리가 화면 아래, 시계 방향으로 돈다) */
export function homesFor(n: number): Corner[] {
  return n === 2 ? ['r+', 'r-'] : ['r+', 's+', 'q+'];
}
export const targetOf = (home: Corner): Corner => OPPOSITE[home];

export const cornerCells = (c: Corner): number[] => CELLS.flatMap((x, i) => (x.corner === c ? [i] : []));

/** 꼭짓점의 맨 끝 칸 */
export function apexOf(c: Corner): number {
  const sign = c[1] === '+' ? 1 : -1;
  const axis = c[0] as 'q' | 'r' | 's';
  const v = { q: -4 * sign, r: -4 * sign, s: -4 * sign };
  v[axis] = 8 * sign;
  return cellAt(v.q, v.r);
}

export function hexDist(a: number, b: number): number {
  const x = CELLS[a];
  const y = CELLS[b];
  if (!x || !y) return 99;
  return (Math.abs(x.q - y.q) + Math.abs(x.r - y.r) + Math.abs(x.s - y.s)) / 2;
}

export interface StarPlayer {
  readonly name: string;
  readonly seat: 'human' | 'ai';
  readonly ai?: AiLevel;
  readonly character: CharacterId;
}

export interface StarMove {
  readonly seat: number;
  readonly from: number;
  readonly to: number;
  /** 지나간 칸들 (from 포함, to 포함) */
  readonly path: readonly number[];
}

export interface StarState {
  readonly v: 1;
  readonly players: readonly StarPlayer[];
  /** 칸마다 0(빈칸) 또는 자리 번호 + 1 */
  readonly board: readonly number[];
  readonly turn: number;
  readonly moves: readonly StarMove[];
  /** 이긴 자리 (끝나지 않았으면 null) */
  readonly winner: number | null;
  readonly reason: 'home' | 'limit' | 'resign' | null;
}

export type StarAction =
  | { readonly type: 'move'; readonly from: number; readonly to: number }
  | { readonly type: 'resign'; readonly seat: number }
  | { readonly type: 'undo'; readonly count: number };

export type StarEvent =
  | { readonly type: 'moved'; readonly move: StarMove }
  | { readonly type: 'arrived'; readonly seat: number; readonly count: number }
  | { readonly type: 'win'; readonly seat: number; readonly reason: 'home' | 'limit' | 'resign' }
  | { readonly type: 'pass'; readonly seat: number }
  | { readonly type: 'undo' };

export type StarError = 'over' | 'not-yours' | 'blocked' | 'no-undo';
export type StarResult = { readonly ok: true; readonly state: StarState; readonly events: readonly StarEvent[] } | { readonly ok: false; readonly error: StarError };

/** 한 사람이 둘 수 있는 최대 수 — 넘으면 남은 거리로 승부 */
export const MAX_TURNS = 120;

export function newStar(players: readonly StarPlayer[]): StarState {
  if (players.length !== 2 && players.length !== 3) throw new Error('별판 점프는 2~3명');
  const board = CELLS.map(() => 0);
  homesFor(players.length).forEach((c, seat) => {
    for (const i of cornerCells(c)) board[i] = seat + 1;
  });
  return { v: 1, players, board, turn: 0, moves: [], winner: null, reason: null };
}

/** 이 말이 갈 수 있는 곳과 가는 길 (도착 칸 → 지나는 칸들) */
export function reach(board: readonly number[], from: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const nb = NEIGHBORS[from];
  if (!nb) return out;
  // 한 칸 걷기
  for (const n of nb) if (n >= 0 && board[n] === 0) out.set(n, [from, n]);
  // 이어 뛰기 (BFS — 가장 짧은 길을 기억)
  const queue: number[][] = [[from]];
  const seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift() as number[];
    const at = path[path.length - 1] as number;
    const around = NEIGHBORS[at] ?? [];
    around.forEach((over, d) => {
      if (over < 0 || board[over] === 0 || over === from) return;
      const land = NEIGHBORS[over]?.[d] ?? -1;
      if (land < 0 || seen.has(land) || (board[land] !== 0 && land !== from)) return;
      if (land === from) return;
      seen.add(land);
      const next = [...path, land];
      if (!out.has(land)) out.set(land, next);
      queue.push(next);
    });
  }
  return out;
}

/** 이 자리의 모든 수 */
export function legalMoves(s: Pick<StarState, 'board'>, seat: number): { from: number; to: number; path: number[] }[] {
  const out: { from: number; to: number; path: number[] }[] = [];
  s.board.forEach((v, from) => {
    if (v !== seat + 1) return;
    for (const [to, path] of reach(s.board, from)) out.push({ from, to, path });
  });
  return out;
}

export const homeOf = (s: Pick<StarState, 'players'>, seat: number): Corner => homesFor(s.players.length)[seat] as Corner;
export const goalOf = (s: Pick<StarState, 'players'>, seat: number): Corner => targetOf(homeOf(s, seat));

/** 도착 꼭짓점에 들어간 내 말 수 */
export function arrived(s: Pick<StarState, 'players' | 'board'>, seat: number): number {
  return cornerCells(goalOf(s, seat)).filter((i) => s.board[i] === seat + 1).length;
}

/** 이겼나: 도착 꼭짓점이 꽉 찼고 그중 내 말이 하나라도 있으면 */
export function hasWon(s: Pick<StarState, 'players' | 'board'>, seat: number): boolean {
  const goal = cornerCells(goalOf(s, seat));
  return goal.every((i) => s.board[i] !== 0) && goal.some((i) => s.board[i] === seat + 1);
}

/** 남은 거리 (말마다 도착 꼭짓점 끝까지의 칸 수 합, 다 들어가면 20) */
export function remaining(s: Pick<StarState, 'players' | 'board'>, seat: number): number {
  const apex = apexOf(goalOf(s, seat));
  let sum = 0;
  s.board.forEach((v, i) => {
    if (v === seat + 1) sum += hexDist(i, apex);
  });
  return sum;
}

/** 꼭짓점을 다 채웠을 때의 거리 합 (0 + 1·2 + 2·3 + 3·4 = 20) */
export const MIN_REMAINING = 20;

function nextSeat(s: StarState, from: number): number {
  return (from + 1) % s.players.length;
}

export function starReduce(s: StarState, a: StarAction): StarResult {
  switch (a.type) {
    case 'move': {
      if (s.winner !== null) return { ok: false, error: 'over' };
      if (s.board[a.from] !== s.turn + 1) return { ok: false, error: 'not-yours' };
      const path = reach(s.board, a.from).get(a.to);
      if (!path) return { ok: false, error: 'blocked' };
      const board = [...s.board];
      board[a.from] = 0;
      board[a.to] = s.turn + 1;
      const move: StarMove = { seat: s.turn, from: a.from, to: a.to, path };
      let st: StarState = { ...s, board, moves: [...s.moves, move] };
      const events: StarEvent[] = [{ type: 'moved', move }];
      const goal = new Set(cornerCells(goalOf(s, s.turn)));
      if (goal.has(a.to) && !goal.has(a.from)) events.push({ type: 'arrived', seat: s.turn, count: arrived(st, s.turn) });
      if (hasWon(st, s.turn)) {
        events.push({ type: 'win', seat: s.turn, reason: 'home' });
        return { ok: true, state: { ...st, winner: s.turn, reason: 'home' }, events };
      }
      // 수 한도: 모두 MAX_TURNS 번씩 두면 남은 거리가 짧은 사람이 이긴다
      if (st.moves.length >= MAX_TURNS * s.players.length) {
        const best = s.players.map((_, i) => i).sort((x, y) => remaining(st, x) - remaining(st, y))[0] ?? 0;
        events.push({ type: 'win', seat: best, reason: 'limit' });
        return { ok: true, state: { ...st, winner: best, reason: 'limit' }, events };
      }
      // 다음 차례 (둘 수 없는 사람은 건너뛴다)
      let turn = nextSeat(st, s.turn);
      for (let k = 0; k < s.players.length && legalMoves(st, turn).length === 0; k++) {
        events.push({ type: 'pass', seat: turn });
        turn = nextSeat(st, turn);
      }
      st = { ...st, turn };
      return { ok: true, state: st, events };
    }
    case 'resign': {
      if (s.winner !== null) return { ok: false, error: 'over' };
      if (!Number.isInteger(a.seat) || a.seat < 0 || a.seat >= s.players.length) return { ok: false, error: 'not-yours' };
      // 남은 사람 중 거리가 가장 짧은 사람이 이긴다
      const rest = s.players.map((_, i) => i).filter((i) => i !== a.seat);
      const best = rest.sort((x, y) => remaining(s, x) - remaining(s, y))[0] ?? 0;
      return { ok: true, state: { ...s, winner: best, reason: 'resign' }, events: [{ type: 'win', seat: best, reason: 'resign' }] };
    }
    case 'undo': {
      const count = Math.max(1, Math.floor(a.count));
      if (s.moves.length < count) return { ok: false, error: 'no-undo' };
      const board = [...s.board];
      const moves = [...s.moves];
      let turn = s.turn;
      for (let k = 0; k < count; k++) {
        const m = moves.pop() as StarMove;
        board[m.to] = 0;
        board[m.from] = m.seat + 1;
        turn = m.seat;
      }
      return { ok: true, state: { ...s, board, moves, turn, winner: null, reason: null }, events: [{ type: 'undo' }] };
    }
    default:
      return { ok: false, error: 'over' };
  }
}

/** 저장본·방 문서 검사 */
export function starValid(x: unknown): x is StarState {
  const s = x as StarState;
  if (!s || s.v !== 1 || !Array.isArray(s.players) || (s.players.length !== 2 && s.players.length !== 3)) return false;
  if (!Array.isArray(s.board) || s.board.length !== CELLS.length || !Array.isArray(s.moves)) return false;
  if (!Number.isInteger(s.turn) || s.turn < 0 || s.turn >= s.players.length) return false;
  for (let seat = 0; seat < s.players.length; seat++) if (s.board.filter((v) => v === seat + 1).length !== 10) return false;
  return s.board.every((v) => Number.isInteger(v) && v >= 0 && v <= s.players.length);
}
