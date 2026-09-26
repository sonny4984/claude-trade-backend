/**
 * 세트 판정 — 그룹(같은 숫자·다른 색 3~4장)과 런(같은 색 연속 3장 이상, 1은 항상 가장 낮고 13 다음에 올 수 없다).
 * 조커는 세트를 완성하는 데 필요한 타일의 색·숫자를 가진다. 여러 해석이 가능하면
 *   1) 플레이어가 놓은 순서 그대로 읽히는 해석을 우선하고
 *   2) 아니면 점수가 높은 해석(런은 위로 늘리기)을 고른다.
 */
import { COLORS, MAX_VALUE, MIN_VALUE, type Color, type NumberTile, type TileId } from './types';
import { colorIndex, isJoker, tile } from './tiles';

export type SetKind = 'group' | 'run';

export type SetIssue =
  | { readonly code: 'empty' }
  | { readonly code: 'too-short'; readonly count: number }
  | { readonly code: 'group-too-long' }
  | { readonly code: 'dup-color'; readonly color: Color; readonly value: number }
  | { readonly code: 'mixed-color' }
  | { readonly code: 'dup-value'; readonly color: Color; readonly value: number }
  | { readonly code: 'gap'; readonly color: Color; readonly missing: readonly number[] }
  | { readonly code: 'wrap' }
  | { readonly code: 'run-too-long' }
  | { readonly code: 'mixed' };

/** 조커가 이 세트 안에서 나타내는 타일. 그룹에서 빠진 색이 둘 이상이면 color = null */
export interface JokerRole {
  readonly color: Color | null;
  readonly value: number;
}

export type SetState = 'valid' | 'incomplete' | 'invalid';

export interface SetAnalysis {
  readonly ok: boolean;
  readonly kind: SetKind | null;
  /** 세트 점수 (조커는 나타내는 값). 합법일 때만 의미 있음 */
  readonly points: number;
  /** 합법이면 정돈된 순서, 아니면 입력 순서 그대로 */
  readonly order: readonly TileId[];
  readonly jokers: ReadonlyMap<TileId, JokerRole>;
  readonly issue: SetIssue | null;
  /** UI 테두리: valid 금빛 / incomplete 모래색 / invalid 장밋빛 */
  readonly state: SetState;
  readonly color?: Color;
  readonly start?: number;
  readonly value?: number;
}

const NO_JOKERS: ReadonlyMap<TileId, JokerRole> = new Map();

function fail(ids: readonly TileId[], issue: SetIssue, state: SetState): SetAnalysis {
  return { ok: false, kind: null, points: 0, order: ids.slice(), jokers: NO_JOKERS, issue, state };
}

type Try = { ok: true; a: SetAnalysis } | { ok: false; issue: SetIssue };

function numbersOf(ids: readonly TileId[]): NumberTile[] {
  const out: NumberTile[] = [];
  for (const id of ids) {
    const t = tile(id);
    if (t.kind === 'number') out.push(t);
  }
  return out;
}

/** 13→1을 넘어가야만 이어지는 모양인가 (예: 12·13·1, 13·1·2) */
function looksLikeWrap(values: readonly number[], jokerCount: number): boolean {
  const hasHigh = values.some((v) => v >= 10);
  const hasLow = values.some((v) => v <= 3);
  if (!hasHigh || !hasLow) return false;
  const shifted = values.map((v) => (v <= 6 ? v + 13 : v)).sort((a, b) => a - b);
  for (let i = 1; i < shifted.length; i++) if (shifted[i] === shifted[i - 1]) return false;
  const span = (shifted[shifted.length - 1] as number) - (shifted[0] as number) + 1;
  return span - shifted.length <= jokerCount;
}

function tryRun(ids: readonly TileId[], nums: readonly NumberTile[]): Try {
  const color = (nums[0] as NumberTile).color;
  const L = ids.length;
  const values = nums.map((t) => t.value).sort((a, b) => a - b);
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1]) return { ok: false, issue: { code: 'dup-value', color, value: values[i] as number } };
  }
  if (L > MAX_VALUE) return { ok: false, issue: { code: 'run-too-long' } };
  const jokerCount = L - nums.length;
  const vmin = values[0] as number;
  const vmax = values[values.length - 1] as number;
  const gaps = vmax - vmin + 1 - nums.length;
  if (gaps > jokerCount) {
    if (looksLikeWrap(values, jokerCount)) return { ok: false, issue: { code: 'wrap' } };
    const present = new Set(values);
    const missing: number[] = [];
    for (let v = vmin + 1; v < vmax; v++) if (!present.has(v)) missing.push(v);
    return { ok: false, issue: { code: 'gap', color, missing } };
  }
  const lo = Math.max(MIN_VALUE, vmax - L + 1);
  const hi = Math.min(vmin, MAX_VALUE - L + 1);
  // 놓인 순서를 문자 그대로 읽을 수 있으면 그 해석을 따른다 (예: 조커를 앞에 두면 앞쪽 숫자)
  let start = -1;
  const firstNum = ids.findIndex((id) => !isJoker(id));
  const literal = (nums.find((t) => t.id === ids[firstNum]) as NumberTile).value - firstNum;
  if (literal >= lo && literal <= hi) {
    let consistent = true;
    for (let i = 0; i < L && consistent; i++) {
      const t = tile(ids[i] as TileId);
      if (t.kind === 'number' && t.value !== literal + i) consistent = false;
    }
    if (consistent) start = literal;
  }
  if (start < 0) start = hi; // 남는 조커는 위쪽으로 (점수가 더 높고 자연스럽다)
  const byValue = new Map<number, TileId>();
  for (const t of nums) byValue.set(t.value, t.id);
  const jokerQueue = ids.filter(isJoker);
  const order: TileId[] = [];
  const roles = new Map<TileId, JokerRole>();
  for (let v = start; v < start + L; v++) {
    const id = byValue.get(v);
    if (id !== undefined) order.push(id);
    else {
      const j = jokerQueue.shift() as TileId;
      order.push(j);
      roles.set(j, { color, value: v });
    }
  }
  const points = L * start + (L * (L - 1)) / 2;
  return {
    ok: true,
    a: { ok: true, kind: 'run', points, order, jokers: roles, issue: null, state: 'valid', color, start },
  };
}

function tryGroup(ids: readonly TileId[], nums: readonly NumberTile[]): Try {
  const value = (nums[0] as NumberTile).value;
  if (ids.length > COLORS.length) return { ok: false, issue: { code: 'group-too-long' } };
  const seen = new Set<Color>();
  for (const t of nums) {
    if (seen.has(t.color)) return { ok: false, issue: { code: 'dup-color', color: t.color, value } };
    seen.add(t.color);
  }
  const missing = COLORS.filter((c) => !seen.has(c));
  const jokers = ids.filter(isJoker);
  const roles = new Map<TileId, JokerRole>();
  jokers.forEach((j, i) => roles.set(j, { color: jokers.length === missing.length ? (missing[i] as Color) : null, value }));
  const order = nums
    .slice()
    .sort((a, b) => colorIndex(a.color) - colorIndex(b.color))
    .map((t) => t.id)
    .concat(jokers);
  return {
    ok: true,
    a: { ok: true, kind: 'group', points: value * ids.length, order, jokers: roles, issue: null, state: 'valid', value },
  };
}

export function analyzeSet(ids: readonly TileId[]): SetAnalysis {
  const n = ids.length;
  if (n === 0) return fail(ids, { code: 'empty' }, 'invalid');
  const nums = numbersOf(ids);
  const sameValue = nums.every((t) => t.value === (nums[0] as NumberTile).value);
  const sameColor = nums.every((t) => t.color === (nums[0] as NumberTile).color);

  if (nums.length === 0) {
    // 조커만 (최대 2장) — 아직 미완성
    return fail(ids, { code: 'too-short', count: n }, 'incomplete');
  }

  if (n < 3) {
    let completable = false;
    if (sameColor) {
      const vals = nums.map((t) => t.value);
      completable = new Set(vals).size === vals.length;
    }
    if (!completable && sameValue) {
      const cols = nums.map((t) => t.color);
      completable = new Set(cols).size === cols.length;
    }
    return fail(ids, { code: 'too-short', count: n }, completable ? 'incomplete' : 'invalid');
  }

  const run = sameColor ? tryRun(ids, nums) : null;
  const group = sameValue ? tryGroup(ids, nums) : null;
  if (run?.ok && group?.ok) {
    // 숫자 타일이 1장뿐일 때만 생긴다 (예: 빨강7 + 조커 2). 점수가 높은 해석, 같으면 런.
    return group.a.points > run.a.points ? group.a : run.a;
  }
  if (run?.ok) return run.a;
  if (group?.ok) return group.a;

  // 같은 타일(색·숫자 모두 같음)이 겹친 경우는 그룹 관점의 설명이 더 자연스럽다: "검정 7이 두 장입니다"
  if (sameValue && sameColor && group && !group.ok) return fail(ids, group.issue, 'invalid');
  if (sameColor && run && !run.ok) return fail(ids, run.issue, 'invalid');
  if (sameValue && group && !group.ok) return fail(ids, group.issue, 'invalid');
  const values = nums.map((t) => t.value);
  const distinctValues = new Set(values).size === values.length;
  return fail(ids, distinctValues ? { code: 'mixed-color' } : { code: 'mixed' }, 'invalid');
}

/** 세트가 합법이면 정돈된 순서로, 아니면 그대로 */
export function arrange(ids: readonly TileId[]): TileId[] {
  const a = analyzeSet(ids);
  return a.ok ? a.order.slice() : ids.slice();
}

/** 조커가 나타내는 값까지 포함해, 런에서 각 타일이 차지하는 숫자 (런이 아니면 null) */
export function runValues(ids: readonly TileId[]): number[] | null {
  const a = analyzeSet(ids);
  if (!a.ok || a.kind !== 'run' || a.start === undefined) return null;
  const pos = new Map<TileId, number>();
  a.order.forEach((id, i) => pos.set(id, (a.start as number) + i));
  return ids.map((id) => pos.get(id) as number);
}
