/**
 * 보드 — 테이블은 가로 13칸(런의 최대 길이)짜리 격자판이고, 세트는 "가로로 붙어 있는 타일 줄"이다.
 *  · 타일은 칸 하나를 차지한다. 서로 다른 세트는 한 칸 이상 떨어져 있어야 한다 (붙어 있으면 한 세트).
 *  · 세트 목록은 격자에서 읽어 낸 것이다 — 타일을 칸에 놓으면 줄이 합쳐지고, 가운데를 빼면 갈라진다.
 *  · 규칙 판정(합법 세트인가)은 여기서 하지 않는다 (turn.ts가 한다). 여기는 칸 계산만 한다 (React·DOM 없음).
 */
import type { TableSet, TileId } from './types';
import { analyzeSet } from './sets';

export const BOARD_COLS = 13;
/** 칸 키 = 줄 × KEY + 칸 (칸 번호는 KEY보다 작다) */
const KEY = 64;

export interface Pos {
  readonly row: number;
  readonly col: number;
}

/** 위치가 아직 없을 수 있는 세트 (AI·힌트 제안, 옛 저장본, 시험용 표기) */
export interface Loose {
  readonly id: string;
  readonly tiles: readonly TileId[];
  readonly row?: number;
  readonly col?: number;
}

export const cellKey = (row: number, col: number): number => row * KEY + col;
const rowOf = (k: number): number => Math.floor(k / KEY);
const colOf = (k: number): number => k % KEY;

function hasPos(s: Loose): s is Loose & Pos {
  return Number.isInteger(s.row) && Number.isInteger(s.col) && (s.row as number) >= 0 && (s.col as number) >= 0 && (s.col as number) < KEY;
}

/** 세트들이 차지한 칸 → 타일 */
export function occupancy(sets: readonly TableSet[]): Map<number, TileId> {
  const occ = new Map<number, TileId>();
  for (const s of sets) s.tiles.forEach((t, i) => occ.set(cellKey(s.row, s.col + i), t));
  return occ;
}

/** 한 세트가 놓이는 칸들 */
export function cellsOf(s: Pick<TableSet, 'tiles' | 'row' | 'col'>): Pos[] {
  return s.tiles.map((_, i) => ({ row: s.row, col: s.col + i }));
}

/** 타일이 놓인 칸 (없으면 null) */
export function cellOf(sets: readonly TableSet[], id: TileId): Pos | null {
  for (const s of sets) {
    const i = s.tiles.indexOf(id);
    if (i >= 0) return { row: s.row, col: s.col + i };
  }
  return null;
}

/** 점유 지도에서 세트(가로로 붙은 줄)를 읽어 낸다 — (줄, 칸) 순서 */
export function segments(occ: ReadonlyMap<number, TileId>): { row: number; col: number; tiles: TileId[] }[] {
  const keys = [...occ.keys()].sort((a, b) => a - b);
  const out: { row: number; col: number; tiles: TileId[] }[] = [];
  let cur: { row: number; col: number; tiles: TileId[] } | null = null;
  let last = -2;
  for (const k of keys) {
    const row = rowOf(k);
    const col = colOf(k);
    const id = occ.get(k) as TileId;
    if (cur && row === cur.row && k === last + 1) cur.tiles.push(id);
    else {
      cur = { row, col, tiles: [id] };
      out.push(cur);
    }
    last = k;
  }
  return out;
}

/**
 * 읽어 낸 줄에 세트 id를 붙인다. 이전 세트와 겹치는 타일이 가장 많은 줄이 그 id를 물려받고 (같으면 왼쪽·위쪽 줄),
 * 나머지는 새 id. 화면이 덜 흔들리고 "이 세트를 건드렸나"를 이어서 판정할 수 있다.
 */
export function withIds(
  prev: readonly { readonly id: string; readonly tiles: readonly TileId[] }[],
  segs: readonly { row: number; col: number; tiles: TileId[] }[],
  nextSetId: number,
): { sets: TableSet[]; nextSetId: number } {
  const owner = new Map<TileId, string>();
  for (const p of prev) for (const t of p.tiles) owner.set(t, p.id);
  const pairs: { i: number; id: string; overlap: number; order: number }[] = [];
  segs.forEach((s, i) => {
    const count = new Map<string, number>();
    for (const t of s.tiles) {
      const o = owner.get(t);
      if (o !== undefined) count.set(o, (count.get(o) ?? 0) + 1);
    }
    for (const [id, overlap] of count) pairs.push({ i, id, overlap, order: prev.findIndex((p) => p.id === id) });
  });
  pairs.sort((a, b) => b.overlap - a.overlap || a.i - b.i || a.order - b.order);
  const taken = new Set<string>();
  const assigned = new Map<number, string>();
  for (const p of pairs) {
    if (assigned.has(p.i) || taken.has(p.id)) continue;
    assigned.set(p.i, p.id);
    taken.add(p.id);
  }
  let next = nextSetId;
  const sets = segs.map((s, i): TableSet => ({ id: assigned.get(i) ?? `s${next++}`, tiles: s.tiles, row: s.row, col: s.col }));
  return { sets, nextSetId: next };
}

// ─────────────────────────────── 빈 자리 찾기 ───────────────────────────────

/** (row, col)에서 n장짜리 세트를 놓을 수 있는가 — 칸이 비었고, 양옆 한 칸도 비어 있어야 다른 세트와 붙지 않는다 */
export function fitsAt(taken: { has(k: number): boolean }, row: number, col: number, n: number, cols = BOARD_COLS): boolean {
  if (row < 0 || col < 0 || n < 1) return false;
  if (n <= cols ? col + n > cols : col !== 0) return false;
  for (let c = col - 1; c <= col + n; c++) if (c >= 0 && taken.has(cellKey(row, c))) return false;
  return true;
}

function mark(taken: Set<number>, row: number, col: number, n: number): void {
  for (let i = 0; i < n; i++) taken.add(cellKey(row, col + i));
}

function lastRow(taken: ReadonlySet<number>): number {
  let m = -1;
  for (const k of taken) m = Math.max(m, rowOf(k));
  return m;
}

/**
 * n장짜리 세트를 놓을 빈 자리. near가 있으면 가장 가까운 자리(같은 줄에서 옆으로 먼저),
 * 없으면 위에서부터 읽는 순서로 처음 들어가는 자리. 맨 아래 새 줄은 언제나 비어 있어서 반드시 찾는다.
 */
export function findSpot(taken: ReadonlySet<number>, n: number, near?: Pos): Pos {
  const bottom = lastRow(taken) + 1;
  const maxCol = n <= BOARD_COLS ? BOARD_COLS - n : 0;
  let best: { p: Pos; cost: number } | null = null;
  for (let row = 0; row <= bottom; row++) {
    for (let col = 0; col <= maxCol; col++) {
      if (!fitsAt(taken, row, col, n)) continue;
      if (!near) return { row, col };
      const cost = Math.abs(row - near.row) * (BOARD_COLS + 2) + Math.abs(col - near.col);
      if (!best || cost < best.cost) best = { p: { row, col }, cost };
    }
  }
  return best ? best.p : { row: bottom, col: 0 };
}

/** 위치가 없거나 겹치는 세트에 자리를 준다 (이미 제자리인 세트는 그대로) */
export function layoutSets(sets: readonly Loose[]): TableSet[] {
  const taken = new Set<number>();
  const out: (TableSet | null)[] = sets.map(() => null);
  sets.forEach((s, i) => {
    if (!hasPos(s) || !fitsAt(taken, s.row, s.col, s.tiles.length)) return;
    mark(taken, s.row, s.col, s.tiles.length);
    out[i] = { id: s.id, tiles: s.tiles, row: s.row, col: s.col };
  });
  sets.forEach((s, i) => {
    if (out[i]) return;
    const p = findSpot(taken, s.tiles.length);
    mark(taken, p.row, p.col, s.tiles.length);
    out[i] = { id: s.id, tiles: s.tiles, row: p.row, col: p.col };
  });
  return out as TableSet[];
}

/** (row, col)에서 n장이 놓이도록, 같은 줄 오른쪽 세트들을 한꺼번에 오른쪽으로 민다 (밀 자리가 없거나 왼쪽이 막혀 있으면 false) */
function pushRight(
  placed: Map<number, Pos>,
  sizeOf: (k: number) => number,
  taken: Set<number>,
  row: number,
  col: number,
  n: number,
): boolean {
  const right: [number, Pos][] = [];
  for (const [k, p] of placed) {
    if (p.row !== row) continue;
    if (p.col < col) {
      if (p.col + sizeOf(k) >= col) return false; // 왼쪽 줄이 바로 곁에 닿아 있다
      continue;
    }
    right.push([k, p]);
  }
  if (!right.length) return false;
  const first = Math.min(...right.map(([, p]) => p.col));
  const shift = col + n + 1 - first;
  if (shift <= 0) return false;
  const end = Math.max(...right.map(([k, p]) => p.col + sizeOf(k) - 1));
  if (end + shift > BOARD_COLS - 1) return false;
  for (const [k, p] of right) placed.set(k, { row, col: p.col + shift });
  taken.clear();
  for (const [k, p] of placed) mark(taken, p.row, p.col, sizeOf(k));
  return fitsAt(taken, row, col, n);
}

/**
 * 세트 목록(id·타일 순서만 있는 새 구성)에 이전 배치를 이어서 자리를 준다.
 *  · 그대로인 세트는 제자리
 *  · 이전 세트가 통째로 들어 있으면(붙이기·합치기) 가장 왼쪽 세트의 왼쪽 끝을 그대로 — 오른쪽 이웃이 걸리면 이웃을 밀어 준다
 *  · 갈라지거나 섞였으면 겹치는 타일이 있던 칸에 맞추고, 막혔으면 가까운 빈 자리
 *  · 새 타일뿐인 세트는 위에서부터 처음 들어가는 자리
 */
export function reconcile(prev: readonly Loose[], next: readonly { readonly id: string; readonly tiles: readonly TileId[] }[]): TableSet[] {
  const P = layoutSets(prev);
  const home = new Map<TileId, { set: TableSet; idx: number }>();
  for (const s of P) s.tiles.forEach((t, idx) => home.set(t, { set: s, idx }));
  const byId = new Map(P.map((s) => [s.id, s] as const));
  const sizeOf = (k: number): number => (next[k] as { tiles: readonly TileId[] }).tiles.length;

  interface Want {
    k: number;
    desired: Pos | null;
    overlap: number;
    same: boolean;
  }
  const wants: Want[] = next.map((n, k) => {
    const count = new Map<string, number>();
    for (const t of n.tiles) {
      const h = home.get(t);
      if (h) count.set(h.set.id, (count.get(h.set.id) ?? 0) + 1);
    }
    let best: TableSet | null = null;
    let bo = 0;
    for (const [id, c] of count) {
      const s = byId.get(id) as TableSet;
      if (c > bo || (c === bo && id === n.id)) {
        best = s;
        bo = c;
      }
    }
    if (!best) return { k, desired: null, overlap: 0, same: false };
    const same = best.id === n.id && best.tiles.length === n.tiles.length && best.tiles.every((t, i) => t === n.tiles[i]);
    const room = Math.max(0, BOARD_COLS - n.tiles.length);
    // 이전 세트가 통째로 들어 있는 경우(붙이기·합치기): 그 중 가장 왼쪽 세트의 왼쪽 끝에 맞춘다
    const whole = [...count.entries()].filter(([id, c]) => c === (byId.get(id) as TableSet).tiles.length).map(([id]) => byId.get(id) as TableSet);
    if (whole.length) {
      const left = whole.reduce((a, b) => (b.row < a.row || (b.row === a.row && b.col < a.col) ? b : a));
      return { k, desired: { row: left.row, col: Math.min(left.col, room) }, overlap: bo, same };
    }
    // 가장 왼쪽의 겹치는 타일을 기준으로 그 칸이 그대로이도록
    const ti = n.tiles.findIndex((t) => home.get(t)?.set === best);
    const anchor = home.get(n.tiles[ti] as TileId) as { set: TableSet; idx: number };
    return { k, desired: { row: best.row, col: Math.max(0, Math.min(best.col + anchor.idx - ti, room)) }, overlap: bo, same };
  });

  const taken = new Set<number>();
  const placed = new Map<number, Pos>();
  for (const w of wants) {
    if (!w.same || !w.desired) continue;
    const s = byId.get((next[w.k] as { id: string }).id) as TableSet;
    placed.set(w.k, { row: s.row, col: s.col });
    mark(taken, s.row, s.col, s.tiles.length);
  }
  const rest = wants.filter((w) => !placed.has(w.k)).sort((a, b) => b.overlap - a.overlap || a.k - b.k);
  for (const w of rest) {
    const n = sizeOf(w.k);
    let p: Pos;
    if (w.desired && (fitsAt(taken, w.desired.row, w.desired.col, n) || pushRight(placed, sizeOf, taken, w.desired.row, w.desired.col, n))) p = w.desired;
    else p = findSpot(taken, n, w.desired ?? undefined);
    placed.set(w.k, p);
    mark(taken, p.row, p.col, n);
  }
  return next.map((n, k) => {
    const p = placed.get(k) as Pos;
    return { id: n.id, tiles: n.tiles, row: p.row, col: p.col };
  });
}

// ─────────────────────────────── 칸에 놓기 ───────────────────────────────

export type PlaceError = 'off-board' | 'occupied';

/**
 * 타일들을 (at.row, at.col)부터 오른쪽으로 한 칸씩 놓는다. 먼저 있던 자리에서 빠지고,
 * 놓은 뒤 가로로 붙은 줄이 세트가 된다 (옆 세트에 붙으면 합쳐지고, 빠진 자리 때문에 줄이 갈라지기도 한다).
 */
export function placeOnBoard(
  sets: readonly TableSet[],
  moving: readonly TileId[],
  at: Pos,
  nextSetId: number,
): { ok: true; sets: TableSet[]; nextSetId: number } | { ok: false; error: PlaceError } {
  const occ = occupancy(sets);
  const mv = new Set(moving);
  for (const [k, t] of occ) if (mv.has(t)) occ.delete(k);
  if (at.row < 0 || at.col < 0 || at.col + moving.length > BOARD_COLS) return { ok: false, error: 'off-board' };
  for (let i = 0; i < moving.length; i++) if (occ.has(cellKey(at.row, at.col + i))) return { ok: false, error: 'occupied' };
  moving.forEach((t, i) => occ.set(cellKey(at.row, at.col + i), t));
  return { ok: true, ...withIds(sets, segments(occ), nextSetId) };
}

/** 타일들을 보드에서 뺀다 — 가운데가 빠지면 그 자리에서 줄이 갈라진다 */
export function removeFromBoard(sets: readonly TableSet[], moving: ReadonlySet<TileId>, nextSetId: number): { sets: TableSet[]; nextSetId: number } {
  const occ = occupancy(sets);
  for (const [k, t] of occ) if (moving.has(t)) occ.delete(k);
  return withIds(sets, segments(occ), nextSetId);
}

/**
 * 정리하기 — 고정된 세트는 제자리에 두고, 나머지는 읽는 순서(위→아래, 왼쪽→오른쪽)로
 * 위에서부터 처음 들어가는 자리에 다시 놓는다. 세트의 내용은 바뀌지 않는다.
 */
export function tidySets(sets: readonly TableSet[], fixed: ReadonlySet<string>): TableSet[] {
  const taken = new Set<number>();
  for (const s of sets) if (fixed.has(s.id)) mark(taken, s.row, s.col, s.tiles.length);
  const order = sets
    .map((s, i) => ({ s, i }))
    .filter((x) => !fixed.has(x.s.id))
    .sort((a, b) => a.s.row - b.s.row || a.s.col - b.s.col || a.i - b.i);
  const moved = new Map<string, Pos>();
  for (const { s } of order) {
    const p = findSpot(taken, s.tiles.length);
    mark(taken, p.row, p.col, s.tiles.length);
    moved.set(s.id, p);
  }
  return sets.map((s) => {
    const p = moved.get(s.id);
    return p ? { ...s, row: p.row, col: p.col } : s;
  });
}

/** 합법인 세트는 읽기 쉬운 순서(런은 오름차순, 그룹은 색 순서)로 — 칸은 그대로, 타일만 자리를 바꾼다 */
export function normalizeOrder(sets: readonly TableSet[]): TableSet[] {
  return sets.map((s) => {
    const a = analyzeSet(s.tiles);
    return a.ok && a.order.some((t, i) => t !== s.tiles[i]) ? { ...s, tiles: a.order.slice() } : s;
  });
}

/** 보드가 지켜야 할 약속을 어긴 곳 (시험·시뮬레이션용): 범위 밖, 겹침, 서로 다른 세트가 붙어 있음, 같은 타일 두 번 */
export function checkLayout(sets: readonly TableSet[]): string[] {
  const out: string[] = [];
  const cell = new Map<number, string>();
  const seen = new Set<TileId>();
  for (const s of sets) {
    if (!Number.isInteger(s.row) || !Number.isInteger(s.col) || s.row < 0 || s.col < 0) {
      out.push(`set ${s.id}: no position`);
      continue;
    }
    if (s.tiles.length <= BOARD_COLS && s.col + s.tiles.length > BOARD_COLS) out.push(`set ${s.id}: off the right edge`);
    s.tiles.forEach((t, i) => {
      if (seen.has(t)) out.push(`tile ${t}: twice`);
      seen.add(t);
      const k = cellKey(s.row, s.col + i);
      if (cell.has(k)) out.push(`cell ${s.row},${s.col + i}: ${cell.get(k)} and ${s.id}`);
      cell.set(k, s.id);
    });
  }
  for (const [k, id] of cell) {
    const right = cell.get(k + 1);
    if (right !== undefined && right !== id && colOf(k) + 1 < KEY) out.push(`sets ${id} and ${right} touch at ${rowOf(k)},${colOf(k)}`);
  }
  return out;
}
