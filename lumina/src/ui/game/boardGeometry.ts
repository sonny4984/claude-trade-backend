/**
 * 보드 위 좌표 ↔ 칸 — 끌어 놓기와 누르고 놓기가 같이 쓴다.
 * 보드 요소([data-board])가 한 칸·한 줄의 간격(px)을 data-sx·data-sy로 알려 준다.
 */
import { BOARD_COLS } from '../../game';

/**
 * 보드 크기. 보드는 가로 13칸 고정이라 (온라인에서 폰·컴퓨터가 같은 판을 본다) 타일 너비는 화면 크기로만 정해진다.
 * 칸 간격은 CSS(table.css)와 같은 비율: 타일 사이 .06, 줄 사이 .30 (타일 높이 1.36 별도).
 */
export const TILE_RATIO = 1.36;
export const CELL_GAP = 0.06;
export const ROW_GAP = 0.3;
/** 한 칸·한 줄의 간격(px) — 끌어 놓을 칸을 계산할 때 쓴다 */
export const strideX = (tw: number): number => tw * (1 + CELL_GAP);
export const strideY = (tw: number): number => tw * (TILE_RATIO + ROW_GAP);

/** 화면에 한눈에 들어오면 좋은 줄 수 — 낮은 화면(노트북)에서는 타일을 줄여서라도 이만큼 보이게 */
export const WANT_ROWS = 4;
/** 줄 수를 맞추려고 타일을 줄일 때의 아래 한계 (이보다 작아지진 않는다) */
const MIN_FIT_TW = 30;

/**
 * 보드 영역(W×H px)에 맞는 타일 너비와 보이는 줄 수.
 * 가로에는 13칸이 다 들어와야 하고, 세로로는 WANT_ROWS줄이 보이면 좋다. cap은 화면 종류별 최대 크기(설정의 타일 크기 반영).
 */
export function fitBoard(W: number, H: number, factor = 1): { tw: number; viewRows: number } {
  const cap = (W < 520 ? 44 : W < 900 ? 52 : 58) * factor;
  const byWidth = Math.floor(W / (BOARD_COLS * (1 + CELL_GAP)));
  const byHeight = Math.max(MIN_FIT_TW, Math.floor(H / (WANT_ROWS * (TILE_RATIO + ROW_GAP))));
  const tw = Math.max(18, Math.min(Math.floor(cap), byWidth, byHeight));
  return { tw, viewRows: Math.max(3, Math.floor(H / strideY(tw))) };
}

export interface Cell {
  readonly row: number;
  readonly col: number;
}

export function boardElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-board]');
}

/** 화면 좌표(x, y)가 놓인 칸 (보드 밖이어도 가장 가까운 칸으로 — 줄은 0~마지막 줄, 칸은 0~12) */
export function cellAt(x: number, y: number): Cell | null {
  const board = boardElement();
  if (!board) return null;
  const sx = Number(board.dataset.sx);
  const sy = Number(board.dataset.sy);
  if (!(sx > 0) || !(sy > 0)) return null;
  const rows = Math.max(1, Number(board.dataset.rows) || 1);
  const r = board.getBoundingClientRect();
  return { row: Math.max(0, Math.min(rows - 1, Math.floor((y - r.top) / sy))), col: Math.max(0, Math.min(BOARD_COLS - 1, Math.floor((x - r.left) / sx))) };
}

/** 타일 k장을 첫 타일이 anchor 칸에 오도록 놓을 때의 시작 칸 (오른쪽 끝이 판을 넘지 않게) */
export function startCell(c: Cell, anchorIndex: number, count: number): Cell {
  return { row: c.row, col: Math.max(0, Math.min(BOARD_COLS - count, c.col - anchorIndex)) };
}
