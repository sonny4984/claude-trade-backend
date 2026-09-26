import { COLORS, type TableSet, type TileId } from './types';
import { analyzeSet, type SetAnalysis } from './sets';

export interface TableCheck {
  readonly ok: boolean;
  readonly analyses: ReadonlyMap<string, SetAnalysis>;
  /** 합법이 아닌 세트 id (화면 순서) */
  readonly bad: readonly string[];
}

export function checkTable(sets: readonly TableSet[]): TableCheck {
  const analyses = new Map<string, SetAnalysis>();
  const bad: string[] = [];
  for (const s of sets) {
    const a = analyzeSet(s.tiles);
    analyses.set(s.id, a);
    if (!a.ok) bad.push(s.id);
  }
  return { ok: bad.length === 0, analyses, bad };
}

export function tilesOf(sets: readonly TableSet[]): TileId[] {
  const out: TileId[] = [];
  for (const s of sets) out.push(...s.tiles);
  return out;
}

export function findSet(sets: readonly TableSet[], id: TileId): TableSet | undefined {
  return sets.find((s) => s.tiles.includes(id));
}

/** 두 세트가 같은 타일들로 이루어졌는가 (순서 무시) */
export function sameMembers(a: readonly TileId[], b: readonly TileId[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((t) => s.has(t));
}

/** a의 타일이 모두 b에 들어 있는가 */
export function containsAll(b: readonly TileId[], a: readonly TileId[]): boolean {
  const s = new Set(b);
  return a.every((t) => s.has(t));
}

/**
 * 확정된 테이블의 정돈 순서: 런은 색(빨강·파랑·주황·검정)별로 시작 숫자 순, 그 다음 그룹은 숫자 순.
 * 내기 순간 테이블이 이 순서로 "안착"한다 — 차례마다 같은 자리에서 같은 세트를 찾을 수 있게.
 */
export function canonicalTable(sets: readonly TableSet[]): TableSet[] {
  const keyOf = (s: TableSet): [number, number, number] => {
    const a = analyzeSet(s.tiles);
    if (a.ok && a.kind === 'run') return [0, COLORS.indexOf(a.color ?? 'red'), a.start ?? 0];
    if (a.ok && a.kind === 'group') return [1, a.value ?? 0, 0];
    return [2, 0, 0];
  };
  return sets
    .map((s, i) => ({ s, i, k: keyOf(s) }))
    .sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2] || x.i - y.i)
    .map((x) => x.s);
}
