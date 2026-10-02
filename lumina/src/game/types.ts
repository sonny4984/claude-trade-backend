/**
 * LUMINA 게임 커널 — 공용 타입.
 * 이 폴더(src/game)는 React·DOM·타이머를 전혀 모른다. UI는 여기 있는 순수 함수에 "제안"만 하고,
 * 규칙 판정은 모두 커널이 한다.
 */

/** 표시·정렬 순서: 빨강, 파랑, 주황, 검정 */
export const COLORS = ['red', 'blue', 'orange', 'black'] as const;
export type Color = (typeof COLORS)[number];

export const MIN_VALUE = 1;
export const MAX_VALUE = 13;

/** 0..103 = 숫자 타일(copy*52 + color*13 + value-1), 104·105 = 조커 */
export type TileId = number;

export interface NumberTile {
  readonly id: TileId;
  readonly kind: 'number';
  readonly color: Color;
  readonly value: number;
  readonly copy: 0 | 1;
}

export interface JokerTile {
  readonly id: TileId;
  readonly kind: 'joker';
  readonly copy: 0 | 1;
}

export type Tile = NumberTile | JokerTile;

/**
 * 테이블 위 세트 하나 = 보드에서 가로로 붙은 타일 줄. tiles는 왼쪽 → 오른쪽 순서이고,
 * (row, col)은 맨 왼쪽 타일이 놓인 칸이다 (board.ts가 칸 계산을 맡는다).
 */
export interface TableSet {
  readonly id: string;
  readonly tiles: readonly TileId[];
  readonly row: number;
  readonly col: number;
}

export type Seat = 'human' | 'ai';
export type AiLevel = 'beginner' | 'casual' | 'advanced' | 'expert';
