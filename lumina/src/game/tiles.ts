import { COLORS, MAX_VALUE, type Color, type Tile, type TileId } from './types';

export const NUMBER_TILES = 104;
export const JOKER_IDS: readonly TileId[] = [104, 105];
export const TILE_COUNT = 106;

function build(): Tile[] {
  const out: Tile[] = [];
  for (const copy of [0, 1] as const) {
    COLORS.forEach((color, ci) => {
      for (let v = 1; v <= MAX_VALUE; v++) {
        out.push({ id: copy * 52 + ci * 13 + (v - 1), kind: 'number', color, value: v, copy });
      }
    });
  }
  out.push({ id: 104, kind: 'joker', copy: 0 }, { id: 105, kind: 'joker', copy: 1 });
  return out;
}

/** 106장 전체. 인덱스 = TileId */
export const TILES: readonly Tile[] = Object.freeze(build());

export function tile(id: TileId): Tile {
  const t = TILES[id];
  if (!t) throw new Error(`unknown tile ${id}`);
  return t;
}

export const isJoker = (id: TileId): boolean => id >= NUMBER_TILES;

export function colorIndex(c: Color): number {
  return COLORS.indexOf(c);
}

/** 숫자 타일 id (조커 아님) */
export function numberId(color: Color, value: number, copy: 0 | 1 = 0): TileId {
  return copy * 52 + colorIndex(color) * 13 + (value - 1);
}

/** 액면가. 조커는 0 (벌점은 규칙의 jokerPenalty를 따로 쓴다) */
export function faceValue(id: TileId): number {
  const t = tile(id);
  return t.kind === 'number' ? t.value : 0;
}

/** 색 → 숫자 → 사본 순 비교 (조커는 맨 뒤) */
export function compareByColor(a: TileId, b: TileId): number {
  const A = tile(a);
  const B = tile(b);
  if (A.kind === 'joker' || B.kind === 'joker') {
    if (A.kind === B.kind) return a - b;
    return A.kind === 'joker' ? 1 : -1;
  }
  return colorIndex(A.color) - colorIndex(B.color) || A.value - B.value || a - b;
}

/** 숫자 → 색 순 비교 (조커는 맨 뒤) */
export function compareByValue(a: TileId, b: TileId): number {
  const A = tile(a);
  const B = tile(b);
  if (A.kind === 'joker' || B.kind === 'joker') {
    if (A.kind === B.kind) return a - b;
    return A.kind === 'joker' ? 1 : -1;
  }
  return A.value - B.value || colorIndex(A.color) - colorIndex(B.color) || a - b;
}

/** 같은 그림(색·숫자)의 타일인가 — 서로 다른 사본이어도 true */
export function sameFace(a: TileId, b: TileId): boolean {
  const A = tile(a);
  const B = tile(b);
  if (A.kind === 'joker' || B.kind === 'joker') return A.kind === B.kind;
  return A.color === B.color && A.value === B.value;
}
