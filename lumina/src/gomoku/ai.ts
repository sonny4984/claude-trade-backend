/**
 * 오목 AI — 자리마다 네 방향의 모양(오·열린 사·사·열린 삼·삼·이)을 점수로 매겨,
 * 내 공격과 상대 막기를 더해 고른다. 명인은 상대의 가장 센 대응까지 한 수 더 내다본다.
 * 흑이 쌍삼 금지면 금지 자리에는 두지 않고, 상대(흑)의 금지 자리는 위협으로 치지 않는다.
 */
import type { AiLevel } from '../game/types';
import type { Rng } from '../game/rng';
import { CELLS, DIRS, SIZE, cellAt, fiveAt, isDoubleThree, runThrough, xy, type GomokuRules, type GomokuState, type Stone } from './engine';

export const SCORE = {
  five: 10_000_000,
  openFour: 200_000,
  four: 12_000,
  openThree: 9_000,
  three: 900,
  openTwo: 350,
  two: 80,
  one: 8,
} as const;

/** 9칸 창을 문자열로: 가운데(둘 자리)와 내 돌 X, 빈칸 ., 상대 돌·판 밖 O */
function windowStr(board: readonly Stone[], cell: number, stone: Stone, dx: number, dy: number): string {
  const [x, y] = xy(cell);
  let s = '';
  for (let k = -4; k <= 4; k++) {
    if (k === 0) {
      s += 'X';
      continue;
    }
    const c = cellAt(x + dx * k, y + dy * k);
    s += c < 0 ? 'O' : board[c] === 0 ? '.' : board[c] === stone ? 'X' : 'O';
  }
  return s;
}

/** 가운데 칸(4번)을 포함하는 자리에 모양이 있는가 */
function has(s: string, p: string): boolean {
  for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) {
    if (i <= 4 && 4 < i + p.length) return true;
  }
  return false;
}

export function dirScore(s: string): number {
  if (has(s, 'XXXXX')) return SCORE.five;
  if (has(s, '.XXXX.')) return SCORE.openFour;
  if (has(s, 'XXXX.') || has(s, '.XXXX') || has(s, 'XXX.X') || has(s, 'X.XXX') || has(s, 'XX.XX')) return SCORE.four;
  if (has(s, '.XXX..') || has(s, '..XXX.') || has(s, '.XX.X.') || has(s, '.X.XX.')) return SCORE.openThree;
  if (['XXX..', '..XXX', '.XXX.', 'XX.X.', '.X.XX', 'X.XX.', '.XX.X', 'X..XX', 'XX..X', 'X.X.X'].some((p) => has(s, p))) return SCORE.three;
  if (['..XX..', '.XX..', '..XX.', '.X.X.', '.X..X.'].some((p) => has(s, p))) return SCORE.openTwo;
  if (has(s, 'XX') || has(s, 'X.X')) return SCORE.two;
  return SCORE.one;
}

/** 이 색이 이 칸에 두었을 때의 힘 (네 방향 합 + 겹치는 위협 보너스) */
export function cellPower(board: readonly Stone[], cell: number, stone: Stone): number {
  let sum = 0;
  let fours = 0;
  let threes = 0;
  for (const [dx, dy] of DIRS) {
    const v = dirScore(windowStr(board, cell, stone, dx, dy));
    sum += v;
    if (v === SCORE.four || v === SCORE.openFour) fours++;
    else if (v === SCORE.openThree) threes++;
  }
  // 사사·사삼·삼삼은 사실상 이긴 모양
  if (fours >= 2 || (fours >= 1 && threes >= 1)) sum += SCORE.openFour * 0.9;
  else if (threes >= 2) sum += SCORE.openFour * 0.45;
  return sum;
}

/** 둘 만한 자리: 돌에서 두 칸 안의 빈칸 (빈 판이면 한가운데) */
export function candidates(s: GomokuState): number[] {
  if (!s.moves.length) return [cellAt(7, 7)];
  const out: number[] = [];
  const near = new Uint8Array(CELLS);
  for (const m of s.moves) {
    const [x, y] = xy(m);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const c = cellAt(x + dx, y + dy);
        if (c >= 0) near[c] = 1;
      }
  }
  for (let c = 0; c < CELLS; c++) if (near[c] && s.board[c] === 0) out.push(c);
  return out;
}

interface Scored {
  readonly cell: number;
  readonly attack: number;
  readonly defend: number;
  readonly value: number;
}

function centerBias(cell: number): number {
  const [x, y] = xy(cell);
  const mid = (SIZE - 1) / 2;
  return (SIZE - Math.abs(x - mid) - Math.abs(y - mid)) * 0.5;
}

export function scoreMoves(s: GomokuState, stone: 1 | 2 = s.turn): Scored[] {
  const opp: 1 | 2 = stone === 1 ? 2 : 1;
  const ban = s.rules.noDoubleThree;
  const out: Scored[] = [];
  for (const cell of candidates(s)) {
    if (stone === 1 && ban && isDoubleThree(s.board, cell, 1)) continue;
    const attack = cellPower(s.board, cell, stone);
    let defend = cellPower(s.board, cell, opp);
    // 상대가 흑이고 그 자리가 금지면, 오목이 아닌 한 위협이 아니다
    if (opp === 1 && ban && defend < SCORE.five && isDoubleThree(s.board, cell, 1)) defend *= 0.15;
    out.push({ cell, attack, defend, value: attack + defend * 0.88 + centerBias(cell) });
  }
  return out.sort((a, b) => b.value - a.value);
}

function pickWeighted(list: readonly Scored[], rng: Rng, n: number): number {
  const top = list.slice(0, Math.max(1, n));
  const weights = top.map((_, i) => 1 / (i + 1));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return (top[i] as Scored).cell;
  }
  return (top[0] as Scored).cell;
}

/** AI가 둘 자리 (둘 곳이 없으면 -1) */
export function gomokuDecide(s: GomokuState, rng: Rng, level: AiLevel): number {
  const me = s.turn;
  const list = scoreMoves(s, me);
  if (!list.length) return -1;
  const first = list[0] as Scored;
  // 이길 수 있으면 이기고, 지는 자리는 막는다 (입문도)
  const win = list.find((m) => m.attack >= SCORE.five);
  if (win) return win.cell;
  const mustBlock = list.filter((m) => m.defend >= SCORE.five);
  if (mustBlock.length) return (mustBlock[0] as Scored).cell;
  switch (level) {
    case 'beginner': {
      // 열린 사를 막는 건 가끔 놓친다
      const block4 = list.find((m) => m.defend >= SCORE.openFour);
      if (block4 && rng.next() < 0.6) return block4.cell;
      return pickWeighted(list, rng, 7);
    }
    case 'casual': {
      const block4 = list.find((m) => m.defend >= SCORE.openFour || m.attack >= SCORE.openFour);
      if (block4) return block4.cell;
      // 가끔은 제 공격만 보느라 상대의 삼을 못 본다
      if (rng.next() < 0.3) return pickWeighted([...list].sort((a, b) => b.attack - a.attack), rng, 2);
      return pickWeighted(list, rng, 3);
    }
    case 'advanced': {
      // 연속 사로 끝낼 수 있으면 끝낸다 (상대 수순까지 읽지는 않는다)
      const mine = findVcf(s, me, 2500);
      if (mine?.[0] !== undefined) return mine[0];
      const ties = list.filter((m) => m.value >= first.value * 0.97);
      return (ties[rng.int(ties.length)] as Scored).cell;
    }
    default:
      return lookahead(s, list, rng);
  }
}

// ─────────────────────────────── 연속 사 (VCF) ───────────────────────────────

/** 방금 둔 cell을 지나는 줄에서, me가 한 알 더 두면 오목이 되는 빈칸들 */
function completions(board: Stone[], cell: number, me: Stone): number[] {
  const out: number[] = [];
  const [x, y] = xy(cell);
  for (const [dx, dy] of DIRS) {
    for (let k = -4; k <= 4; k++) {
      const e = cellAt(x + dx * k, y + dy * k);
      if (e < 0 || board[e] !== 0 || out.includes(e)) continue;
      board[e] = me;
      if (runThrough(board, e, me, dx, dy).length >= 5) out.push(e);
      board[e] = 0;
    }
  }
  return out;
}

function nearCells(board: readonly Stone[]): number[] {
  const near = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    if (!board[c]) continue;
    const [x, y] = xy(c);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const n = cellAt(x + dx, y + dy);
        if (n >= 0) near[n] = 1;
      }
  }
  const out: number[] = [];
  for (let c = 0; c < CELLS; c++) if (near[c] && board[c] === 0) out.push(c);
  return out;
}

interface VcfCtx {
  nodes: number;
  readonly limit: number;
  readonly rules: GomokuRules;
}

/**
 * me가 사(오목 한 칸 전)만 계속 두어 이기는 수순을 찾는다. 상대는 매번 그 한 칸을 막아야 한다.
 * 상대가 막으면서 오목이 되거나 사가 생기면 그 수순은 버린다 (보수적으로).
 */
function vcf(board: Stone[], me: 1 | 2, depth: number, ctx: VcfCtx): number[] | null {
  if (depth <= 0 || ctx.nodes > ctx.limit) return null;
  const opp: 1 | 2 = me === 1 ? 2 : 1;
  for (const c of nearCells(board)) {
    if (++ctx.nodes > ctx.limit) return null;
    if (me === 1 && ctx.rules.noDoubleThree && isDoubleThree(board, c, 1)) continue;
    board[c] = me;
    if (fiveAt(board, c, me)) {
      board[c] = 0;
      return [c];
    }
    const threats = completions(board, c, me);
    if (threats.length >= 2) {
      // 막을 곳이 둘 — 이긴다 (흑이면 그 칸들이 금지가 아닌지 확인)
      const real = me === 1 && ctx.rules.noDoubleThree ? threats.filter((t) => !isDoubleThree(board, t, 1) || !!fiveWith(board, t, 1)) : threats;
      if (real.length >= 2) {
        board[c] = 0;
        return [c];
      }
    }
    if (threats.length === 1) {
      const block = threats[0] as number;
      board[block] = opp;
      const counter = fiveAt(board, block, opp) || completions(board, block, opp).length > 0;
      if (!counter) {
        const rest = vcf(board, me, depth - 1, ctx);
        if (rest) {
          board[block] = 0;
          board[c] = 0;
          return [c, block, ...rest];
        }
      }
      board[block] = 0;
    }
    board[c] = 0;
  }
  return null;
}

function fiveWith(board: Stone[], cell: number, stone: Stone): boolean {
  board[cell] = stone;
  const ok = !!fiveAt(board, cell, stone);
  board[cell] = 0;
  return ok;
}

/** me가 지금 둘 차례일 때 연속 사로 이기는 수순 (없으면 null) */
export function findVcf(s: GomokuState, me: 1 | 2, limit = 6000): number[] | null {
  return vcf(s.board.slice() as Stone[], me, 8, { nodes: 0, limit, rules: s.rules });
}

/** 명인: 연속 사로 이길 수 있으면 끝내고, 상대의 연속 사는 미리 끊고, 아니면 상대가 얻을 공격까지 따져 고른다 */
function lookahead(s: GomokuState, list: readonly Scored[], rng: Rng): number {
  const me = s.turn;
  const opp: 1 | 2 = me === 1 ? 2 : 1;
  const mine = findVcf(s, me);
  if (mine?.[0] !== undefined) return mine[0];
  const theirs = findVcf({ ...s, turn: opp }, opp);
  if (theirs) {
    // 상대 수순의 자리들과 상위 후보 중, 두고 나면 상대의 연속 사가 사라지는 곳
    const tries = [...new Set([...theirs.filter((_, i) => i % 2 === 0), ...list.slice(0, 12).map((m) => m.cell)])];
    const scoreOf = new Map(list.map((m) => [m.cell, m.value]));
    const safe = tries
      .filter((c) => s.board[c] === 0 && scoreOf.has(c))
      .filter((c) => {
        const board = s.board.slice() as Stone[];
        board[c] = me;
        return !findVcf({ ...s, board, turn: opp }, opp, 3000);
      })
      .sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0));
    if (safe[0] !== undefined) return safe[0];
  }
  let best = -Infinity;
  let pick: number[] = [];
  for (const m of list.slice(0, 10)) {
    if (m.attack >= SCORE.openFour) return m.cell;
    const board = s.board.slice() as Stone[];
    board[m.cell] = me;
    const next: GomokuState = { ...s, board, moves: [...s.moves, m.cell], turn: opp };
    // 상대가 얻을 수 있는 가장 센 "공격"만 뺀다 (우리 공격을 막는 수는 오히려 우리가 몰아붙인 것)
    let their = 0;
    for (const r of scoreMoves(next, opp).slice(0, 8)) their = Math.max(their, r.attack);
    const v = m.value - their * 0.55;
    if (v > best + 1e-6) {
      best = v;
      pick = [m.cell];
    } else if (Math.abs(v - best) <= 1e-6) pick.push(m.cell);
  }
  return pick[rng.int(pick.length)] ?? (list[0] as Scored).cell;
}
