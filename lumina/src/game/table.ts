import type { TableSet, TileId } from './types';
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
