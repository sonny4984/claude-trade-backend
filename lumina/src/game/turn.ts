/**
 * 차례 트랜잭션.
 * 차례가 시작되면 테이블·랙을 스냅샷(start)으로 잡고, 플레이어는 작업본(work)만 고친다.
 * 차례 도중에는 테이블이 잠시 틀려도 괜찮다 — 판정은 "내기(commit)" 순간에만 한다.
 * 되돌리기(past)·다시하기(future)는 이 차례 안의 모든 동작을 순서대로 기억한다.
 */
import { COLORS, type Color, type TableSet, type TileId } from './types';
import type { RuleSet } from './rules';
import { analyzeSet, runValues, type JokerRole, type SetIssue } from './sets';
import { containsAll, sameMembers, tilesOf } from './table';
import { isJoker, tile } from './tiles';

export interface Work {
  readonly sets: readonly TableSet[];
  readonly rack: readonly TileId[];
  /** 작업대: 세트가 아닌, 잠시 올려 둔 타일들. 비어 있어야 낼 수 있다 */
  readonly staging: readonly TileId[];
  readonly nextSetId: number;
}

export interface Turn {
  readonly player: number;
  /** 되돌리기 기준점 = 차례 시작 (하우스 룰 "등록 후 계속"이면 등록 직후로 옮겨진다) */
  readonly start: Work;
  readonly work: Work;
  readonly past: readonly Work[];
  readonly future: readonly Work[];
  readonly meldedAtStart: boolean;
  /** 이번 차례에 첫 등록을 마쳤다 (등록 후 계속 규칙일 때만 차례가 이어진다) */
  readonly meldedNow: boolean;
  readonly meldPoints: number;
  /** 진짜 차례 시작 시점의 랙·테이블 (통계와 "한 장 이상" 판정용) */
  readonly rackAtTurnStart: readonly TileId[];
  readonly tableAtTurnStart: readonly TableSet[];
}

export type MoveTarget =
  | { readonly kind: 'set'; readonly setId: string; readonly index?: number }
  | { readonly kind: 'new'; readonly before?: string }
  | { readonly kind: 'staging'; readonly index?: number }
  | { readonly kind: 'rack' };

export type MoveError =
  | 'empty'
  | 'not-yours'
  | 'locked-before-meld'
  | 'table-to-rack'
  | 'no-such-set'
  | 'not-a-joker'
  | 'bad-split';

export type MoveResult = { readonly ok: true; readonly turn: Turn } | { readonly ok: false; readonly error: MoveError };

const MAX_HISTORY = 200;

export function beginTurn(
  player: number,
  table: readonly TableSet[],
  rack: readonly TileId[],
  melded: boolean,
  nextSetId: number,
): Turn {
  const start: Work = { sets: table, rack, staging: [], nextSetId };
  return {
    player,
    start,
    work: start,
    past: [],
    future: [],
    meldedAtStart: melded,
    meldedNow: false,
    meldPoints: 0,
    rackAtTurnStart: rack,
    tableAtTurnStart: table,
  };
}

/** 테이블(기존 세트)을 건드릴 수 있는가 */
export function canManipulate(turn: Turn): boolean {
  return turn.meldedAtStart || turn.meldedNow;
}

export function startTableTiles(turn: Turn): Set<TileId> {
  return new Set(tilesOf(turn.start.sets));
}

/** 이번 차례에 랙에서 나온 타일로만 이루어진 세트인가 */
export function isFreshSet(turn: Turn, set: TableSet): boolean {
  const table = startTableTiles(turn);
  return set.tiles.every((t) => !table.has(t));
}

export type Where =
  | { readonly kind: 'rack' }
  | { readonly kind: 'staging'; readonly index: number }
  | { readonly kind: 'set'; readonly setId: string; readonly index: number };

export function locate(work: Work, id: TileId): Where | null {
  if (work.rack.includes(id)) return { kind: 'rack' };
  const si = work.staging.indexOf(id);
  if (si >= 0) return { kind: 'staging', index: si };
  for (const s of work.sets) {
    const i = s.tiles.indexOf(id);
    if (i >= 0) return { kind: 'set', setId: s.id, index: i };
  }
  return null;
}

function push(turn: Turn, work: Work): Turn {
  const past = turn.past.length >= MAX_HISTORY ? turn.past.slice(1) : turn.past.slice();
  past.push(turn.work);
  return { ...turn, work, past, future: [] };
}

function newId(n: number): string {
  return `s${n}`;
}

/**
 * 타일을 세트에서 뺀다. 합법 런의 가운데를 빼면 실제 테이블처럼 그 자리에서 두 줄로 갈라진다.
 * (예: 4-5-6-7-8-9에서 6을 빼면 4-5 / 7-8-9)
 */
function removeFromSets(
  sets: readonly TableSet[],
  moving: ReadonlySet<TileId>,
  nextSetId: number,
): { sets: TableSet[]; nextSetId: number } {
  const out: TableSet[] = [];
  let next = nextSetId;
  for (const s of sets) {
    if (!s.tiles.some((t) => moving.has(t))) {
      out.push(s);
      continue;
    }
    const wasRun = analyzeSet(s.tiles);
    if (wasRun.ok && wasRun.kind === 'run') {
      const parts: TileId[][] = [[]];
      for (const t of s.tiles) {
        if (moving.has(t)) parts.push([]);
        else (parts[parts.length - 1] as TileId[]).push(t);
      }
      const kept = parts.filter((p) => p.length > 0);
      kept.forEach((p, i) => out.push({ id: i === 0 ? s.id : newId(next++), tiles: p }));
    } else {
      const rest = s.tiles.filter((t) => !moving.has(t));
      if (rest.length) out.push({ id: s.id, tiles: rest });
    }
  }
  return { sets: out, nextSetId: next };
}

/**
 * 세트에 타일을 넣는다. 합법이 되면 정돈하고,
 * 합법 런에 이미 있는 숫자를 넣으면 공식 예시처럼 그 숫자에서 두 줄로 나눈다 (4-5-6-7-8 + 6 → 4-5-6 / 6-7-8).
 */
export function insertIntoSet(base: readonly TileId[], incoming: readonly TileId[], index?: number): TileId[][] {
  const at = index === undefined ? base.length : Math.max(0, Math.min(base.length, index));
  const literal = [...base.slice(0, at), ...incoming, ...base.slice(at)];
  const a = analyzeSet(literal);
  if (a.ok) return [a.order.slice()];
  if (index === undefined) {
    const front = [...incoming, ...base];
    const b = analyzeSet(front);
    if (b.ok) return [b.order.slice()];
  }
  const split = splitOnDuplicate(base, incoming);
  if (split) return split;
  return [literal];
}

function splitOnDuplicate(base: readonly TileId[], incoming: readonly TileId[]): TileId[][] | null {
  if (incoming.length !== 1) return null;
  const x = tile(incoming[0] as TileId);
  if (x.kind !== 'number') return null;
  const a = analyzeSet(base);
  if (!a.ok || a.kind !== 'run' || a.color !== x.color) return null;
  const vals = runValues(a.order);
  if (!vals) return null;
  const at = a.order.findIndex((id, i) => vals[i] === x.value && !isJoker(id));
  if (at < 0) return null;
  const left = a.order.slice(0, at + 1);
  const right = [x.id, ...a.order.slice(at + 1)];
  return [left, right];
}

export function moveTiles(turn: Turn, tiles: readonly TileId[], to: MoveTarget): MoveResult {
  if (!tiles.length) return { ok: false, error: 'empty' };
  const w = turn.work;
  const moving = new Set(tiles);
  const table = startTableTiles(turn);
  const manip = canManipulate(turn);
  for (const id of tiles) {
    const where = locate(w, id);
    if (!where) return { ok: false, error: 'not-yours' };
    if (table.has(id) && !manip) return { ok: false, error: 'locked-before-meld' };
    if (to.kind === 'rack' && !turn.start.rack.includes(id)) return { ok: false, error: 'table-to-rack' };
  }
  if (to.kind === 'set') {
    const target = w.sets.find((s) => s.id === to.setId);
    if (!target) return { ok: false, error: 'no-such-set' };
    if (!manip && target.tiles.some((t) => table.has(t) && !moving.has(t))) return { ok: false, error: 'locked-before-meld' };
  }

  // 옮길 타일은 고른 순서가 아니라 원래 놓인 순서를 유지한다 (세트에서 여러 장을 집을 때 자연스럽게)
  const ordered = orderByPlacement(w, tiles);
  const removed = removeFromSets(w.sets, moving, w.nextSetId);
  let sets = removed.sets;
  let nextSetId = removed.nextSetId;
  let rack = w.rack.filter((t) => !moving.has(t));
  let staging = w.staging.filter((t) => !moving.has(t));

  switch (to.kind) {
    case 'set': {
      const i = sets.findIndex((s) => s.id === to.setId);
      if (i < 0) {
        // 대상 세트가 통째로 옮겨지는 타일로만 이루어졌던 경우 — 새 세트로 취급
        sets = [...sets, { id: newId(nextSetId++), tiles: insertIntoSet([], ordered)[0] as TileId[] }];
        break;
      }
      const parts = insertIntoSet((sets[i] as TableSet).tiles, ordered, to.index);
      const replaced: TableSet[] = parts.map((p, k) => ({ id: k === 0 ? to.setId : newId(nextSetId++), tiles: p }));
      sets = [...sets.slice(0, i), ...replaced, ...sets.slice(i + 1)];
      break;
    }
    case 'new': {
      const fresh: TableSet = { id: newId(nextSetId++), tiles: insertIntoSet([], ordered)[0] as TileId[] };
      const i = to.before ? sets.findIndex((s) => s.id === to.before) : -1;
      sets = i >= 0 ? [...sets.slice(0, i), fresh, ...sets.slice(i)] : [...sets, fresh];
      break;
    }
    case 'staging': {
      const at = to.index === undefined ? staging.length : Math.max(0, Math.min(staging.length, to.index));
      staging = [...staging.slice(0, at), ...ordered, ...staging.slice(at)];
      break;
    }
    case 'rack': {
      rack = [...rack, ...ordered];
      break;
    }
  }
  return { ok: true, turn: push(turn, { sets, rack, staging, nextSetId }) };
}

function orderByPlacement(w: Work, tiles: readonly TileId[]): TileId[] {
  const rank = new Map<TileId, number>();
  let r = 0;
  for (const s of w.sets) for (const t of s.tiles) rank.set(t, r++);
  for (const t of w.staging) rank.set(t, r++);
  // 랙에서 온 타일은 고른 순서 그대로 (랙 표시 순서는 UI가 관리)
  return tiles.slice().sort((a, b) => (rank.get(a) ?? 1e6 + tiles.indexOf(a)) - (rank.get(b) ?? 1e6 + tiles.indexOf(b)));
}

/** 세트를 at 위치에서 둘로 나눈다 (가위) */
export function splitSet(turn: Turn, setId: string, at: number): MoveResult {
  const w = turn.work;
  const i = w.sets.findIndex((s) => s.id === setId);
  if (i < 0) return { ok: false, error: 'no-such-set' };
  const s = w.sets[i] as TableSet;
  if (at <= 0 || at >= s.tiles.length) return { ok: false, error: 'bad-split' };
  if (!canManipulate(turn) && !isFreshSet(turn, s)) return { ok: false, error: 'locked-before-meld' };
  let nextSetId = w.nextSetId;
  const a: TableSet = { id: s.id, tiles: s.tiles.slice(0, at) };
  const b: TableSet = { id: newId(nextSetId++), tiles: s.tiles.slice(at) };
  const sets = [...w.sets.slice(0, i), a, b, ...w.sets.slice(i + 1)];
  return { ok: true, turn: push(turn, { ...w, sets, nextSetId }) };
}

/**
 * 테이블의 조커 자리에 타일을 넣고, 풀려난 조커는 작업대로 옮긴다.
 * (조커 회수 — 등록 전에는 자기가 이번 차례에 놓은 조커만 가능)
 */
export function swapJoker(turn: Turn, incoming: TileId, joker: TileId): MoveResult {
  if (!isJoker(joker)) return { ok: false, error: 'not-a-joker' };
  const w = turn.work;
  const jw = locate(w, joker);
  if (!jw || jw.kind !== 'set') return { ok: false, error: 'not-a-joker' };
  const holder = w.sets.find((s) => s.id === jw.setId) as TableSet;
  const table = startTableTiles(turn);
  if (!canManipulate(turn) && (table.has(joker) || !isFreshSet(turn, holder))) return { ok: false, error: 'locked-before-meld' };
  const iw = locate(w, incoming);
  if (!iw) return { ok: false, error: 'not-yours' };
  if (table.has(incoming) && !canManipulate(turn)) return { ok: false, error: 'locked-before-meld' };
  if (incoming === joker) return { ok: false, error: 'empty' };

  // 들어올 타일을 먼저 원래 자리에서 빼고 (런 가운데였다면 갈라짐), 조커 자리에 넣는다
  const moving = new Set([incoming]);
  const removed = removeFromSets(w.sets, moving, w.nextSetId);
  let sets = removed.sets;
  const rack = w.rack.filter((t) => t !== incoming);
  const staging = w.staging.filter((t) => t !== incoming);
  const hi = sets.findIndex((s) => s.tiles.includes(joker));
  if (hi < 0) return { ok: false, error: 'not-a-joker' };
  const h = sets[hi] as TableSet;
  const swapped = h.tiles.map((t) => (t === joker ? incoming : t));
  const a = analyzeSet(swapped);
  sets = [...sets.slice(0, hi), { id: h.id, tiles: a.ok ? a.order.slice() : swapped }, ...sets.slice(hi + 1)];
  return {
    ok: true,
    turn: push(turn, { sets, rack, staging: [...staging, joker], nextSetId: removed.nextSetId }),
  };
}

export function undo(turn: Turn): Turn | null {
  if (!turn.past.length) return null;
  const past = turn.past.slice();
  const prev = past.pop() as Work;
  return { ...turn, work: prev, past, future: [turn.work, ...turn.future] };
}

export function redo(turn: Turn): Turn | null {
  if (!turn.future.length) return null;
  const [next, ...future] = turn.future;
  return { ...turn, work: next as Work, past: [...turn.past, turn.work], future };
}

/** 테이블 되돌리기 — 이 차례 시작(또는 등록 직후) 상태로. 이것도 되돌릴 수 있다 */
export function resetTurn(turn: Turn): Turn {
  if (!isChanged(turn)) return turn;
  return push(turn, turn.start);
}

export function isChanged(turn: Turn): boolean {
  const a = turn.start;
  const b = turn.work;
  if (a === b) return false;
  if (b.staging.length) return true;
  if (a.rack.length !== b.rack.length) return true;
  if (a.sets.length !== b.sets.length) return true;
  for (let i = 0; i < a.sets.length; i++) {
    const x = a.sets[i] as TableSet;
    const y = b.sets.find((s) => s.id === x.id);
    if (!y || !sameMembers(x.tiles, y.tiles)) return true;
  }
  return false;
}

/** start 이후 랙에서 테이블로 나간 타일 */
export function playedTiles(turn: Turn): TileId[] {
  const now = new Set(turn.work.rack);
  const staged = new Set(turn.work.staging);
  return turn.start.rack.filter((t) => !now.has(t) && !staged.has(t));
}

// ─────────────────────────────── 내기 판정 ───────────────────────────────

export type CommitIssue =
  | { readonly code: 'staging'; readonly count: number }
  | { readonly code: 'invalid-set'; readonly setId: string; readonly issue: SetIssue }
  | { readonly code: 'nothing-played' }
  | { readonly code: 'meld-too-low'; readonly points: number; readonly need: number }
  | { readonly code: 'meld-touched-table' }
  | { readonly code: 'joker-not-replaced' }
  | { readonly code: 'joker-set-broken' };

export interface CommitCheck {
  readonly ok: boolean;
  /** meld = 첫 등록, play = 일반, end = (등록 후 계속 규칙에서) 추가로 낼 것 없이 차례 끝 */
  readonly kind: 'meld' | 'play' | 'end';
  readonly issues: readonly CommitIssue[];
  readonly played: readonly TileId[];
  readonly meldPoints: number;
  readonly changed: boolean;
}

function matchesRole(id: TileId, role: JokerRole, groupOthers: readonly TileId[]): boolean {
  const t = tile(id);
  if (t.kind !== 'number' || t.value !== role.value) return false;
  if (role.color) return t.color === role.color;
  const present = new Set<Color>();
  for (const o of groupOthers) {
    const ot = tile(o);
    if (ot.kind === 'number') present.add(ot.color);
  }
  return COLORS.some((c) => c === t.color && !present.has(c));
}

export function checkCommit(turn: Turn, rules: RuleSet): CommitCheck {
  const w = turn.work;
  const issues: CommitIssue[] = [];
  const played = playedTiles(turn);
  const changed = isChanged(turn);
  if (w.staging.length) issues.push({ code: 'staging', count: w.staging.length });
  for (const s of w.sets) {
    const a = analyzeSet(s.tiles);
    if (!a.ok && a.issue) issues.push({ code: 'invalid-set', setId: s.id, issue: a.issue });
  }

  if (!canManipulate(turn)) {
    // 첫 등록: 기존 세트는 그대로, 새 세트는 랙 타일로만, 합 ≥ 기준
    let touched = false;
    for (const s0 of turn.start.sets) {
      const s1 = w.sets.find((s) => s.id === s0.id);
      if (!s1 || !sameMembers(s0.tiles, s1.tiles)) touched = true;
    }
    if (touched) issues.push({ code: 'meld-touched-table' });
    const startIds = new Set(turn.start.sets.map((s) => s.id));
    let points = 0;
    for (const s of w.sets) {
      if (startIds.has(s.id)) continue;
      const a = analyzeSet(s.tiles);
      if (a.ok) points += a.points;
    }
    if (!played.length) issues.push({ code: 'nothing-played' });
    else if (points < rules.initialMeldPoints) issues.push({ code: 'meld-too-low', points, need: rules.initialMeldPoints });
    return { ok: issues.length === 0, kind: 'meld', issues, played, meldPoints: points, changed };
  }

  const kind: CommitCheck['kind'] = !played.length && turn.meldedNow ? 'end' : 'play';
  if (!played.length && !turn.meldedNow) issues.push({ code: 'nothing-played' });

  // 하우스 룰: 조커 회수 제한
  if (rules.jokerReplace === 'exact-tile' || rules.jokerSetLocked) {
    for (const s0 of turn.start.sets) {
      const jokers = s0.tiles.filter(isJoker);
      if (!jokers.length) continue;
      const others = s0.tiles.filter((t) => !isJoker(t));
      const holder = w.sets.find((s) => containsAll(s.tiles, others));
      if (rules.jokerSetLocked && !holder) {
        issues.push({ code: 'joker-set-broken' });
        continue;
      }
      if (rules.jokerReplace !== 'exact-tile') continue;
      const a0 = analyzeSet(s0.tiles);
      for (const j of jokers) {
        const role0 = a0.jokers.get(j);
        if (holder && holder.tiles.includes(j)) {
          const role1 = analyzeSet(holder.tiles).jokers.get(j);
          if (role0 && role1 && role0.value === role1.value && (!role0.color || !role1.color || role0.color === role1.color)) continue;
        }
        const replaced =
          !!holder &&
          !!role0 &&
          holder.tiles.some((t) => !isJoker(t) && !others.includes(t) && matchesRole(t, role0, others));
        if (!replaced) issues.push({ code: 'joker-not-replaced' });
      }
    }
  }
  return { ok: issues.length === 0, kind, issues, played, meldPoints: 0, changed };
}

/**
 * AI·힌트용: 완성된 테이블(세트 목록)을 통째로 작업본으로 만든다.
 * 기존 세트와 가장 많이 겹치는 세트는 같은 id를 물려받아 화면이 덜 흔들린다.
 */
export function proposeTable(turn: Turn, proposal: readonly (readonly TileId[])[]): MoveResult {
  const table = startTableTiles(turn);
  const rack = new Set(turn.start.rack);
  const seen = new Set<TileId>();
  for (const set of proposal) {
    for (const t of set) {
      if (seen.has(t)) return { ok: false, error: 'not-yours' };
      if (!table.has(t) && !rack.has(t)) return { ok: false, error: 'not-yours' };
      seen.add(t);
    }
  }
  for (const t of table) if (!seen.has(t)) return { ok: false, error: 'table-to-rack' };
  if (!canManipulate(turn)) {
    // 등록 전에는 기존 세트를 그대로 둔 채 새 세트만 더할 수 있다
    for (const s0 of turn.start.sets) {
      if (!proposal.some((p) => sameMembers(p, s0.tiles))) return { ok: false, error: 'locked-before-meld' };
    }
  }
  const used = new Set<string>();
  let nextSetId = turn.work.nextSetId;
  const sets: TableSet[] = [];
  const order = proposal.map((p, i) => ({ p, i }));
  const assigned = new Map<number, string>();
  // 겹침이 큰 순서로 기존 id 배정
  const pairs: { i: number; id: string; overlap: number }[] = [];
  for (const { p, i } of order) {
    for (const s0 of turn.start.sets) {
      const overlap = p.filter((t) => s0.tiles.includes(t)).length;
      if (overlap > 0) pairs.push({ i, id: s0.id, overlap });
    }
  }
  pairs.sort((a, b) => b.overlap - a.overlap);
  for (const pr of pairs) {
    if (assigned.has(pr.i) || used.has(pr.id)) continue;
    assigned.set(pr.i, pr.id);
    used.add(pr.id);
  }
  // 기존 세트 순서를 최대한 유지하고, 새 세트는 뒤에
  const startOrder = new Map(turn.start.sets.map((s, k) => [s.id, k] as const));
  const withIds = order.map(({ p, i }) => ({
    id: assigned.get(i) ?? newId(nextSetId++),
    tiles: analyzeSet(p).ok ? analyzeSet(p).order.slice() : p.slice(),
    rank: assigned.has(i) ? (startOrder.get(assigned.get(i) as string) as number) : 1e6 + i,
  }));
  withIds.sort((a, b) => a.rank - b.rank);
  for (const s of withIds) sets.push({ id: s.id, tiles: s.tiles });
  const rackLeft = turn.start.rack.filter((t) => !seen.has(t));
  return { ok: true, turn: push(turn, { sets, rack: rackLeft, staging: [], nextSetId }) };
}

// ─────────────────────────────── UI 도우미 (순수) ───────────────────────────────

/** 드래그 미리보기: 이 이동을 하면 대상 세트가 어떻게 되는가 (상태는 바꾸지 않는다) */
export function previewMove(
  turn: Turn,
  tiles: readonly TileId[],
  to: MoveTarget,
): { ok: true; turn: Turn; affected: readonly string[] } | { ok: false; error: MoveError } {
  const r = moveTiles(turn, tiles, to);
  if (!r.ok) return r;
  const before = new Map(turn.work.sets.map((s) => [s.id, s.tiles] as const));
  const affected = r.turn.work.sets
    .filter((s) => {
      const b = before.get(s.id);
      return !b || b.length !== s.tiles.length || b.some((t, i) => t !== s.tiles[i]);
    })
    .map((s) => s.id);
  return { ok: true, turn: r.turn, affected };
}

/** 두 번 탭 자동 배치: 이 타일을 넣어 바로 합법이 되는 세트들 */
export function quickTargets(turn: Turn, id: TileId): string[] {
  const out: string[] = [];
  const table = startTableTiles(turn);
  const manip = canManipulate(turn);
  for (const s of turn.work.sets) {
    if (s.tiles.includes(id)) continue;
    if (!manip && s.tiles.some((t) => table.has(t))) continue;
    if (!analyzeSet(s.tiles).ok) continue;
    const r = insertIntoSet(s.tiles, [id]);
    if (r.length === 1 && analyzeSet(r[0] as TileId[]).ok) out.push(s.id);
  }
  return out;
}

/** 이 타일을 지금 옮길 수 있는가 (드래그 시작 전에 부드럽게 거절하려고) */
export function canMoveTile(turn: Turn, id: TileId): MoveError | null {
  if (!locate(turn.work, id)) return 'not-yours';
  if (startTableTiles(turn).has(id) && !canManipulate(turn)) return 'locked-before-meld';
  return null;
}
