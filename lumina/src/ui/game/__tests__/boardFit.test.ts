import { describe, expect, it } from 'vitest';
import { BOARD_COLS } from '../../../game';
import { CELL_GAP, WANT_ROWS, cellFromOffset, fitBoard, startCell, strideX, strideY } from '../boardGeometry';

describe('보드 크기 맞추기', () => {
  it('13칸이 늘 가로에 다 들어온다', () => {
    for (const [W, H] of [[316, 200], [346, 392], [386, 465], [760, 718], [1120, 346], [1120, 626], [800, 144]] as const) {
      const { tw } = fitBoard(W, H);
      expect(tw * (1 + CELL_GAP) * BOARD_COLS).toBeLessThanOrEqual(W + 0.001);
    }
  });

  it('폰: 가로 너비가 크기를 정한다 (세로는 줄 수만 정함)', () => {
    const a = fitBoard(318, 253);
    expect(a.tw).toBe(23);
    expect(a.viewRows).toBe(Math.floor(253 / strideY(23)));
  });

  it('낮은 노트북 화면: 타일을 줄여서라도 WANT_ROWS줄은 보이게', () => {
    const { tw, viewRows } = fitBoard(1120, 270);
    expect(tw).toBeLessThan(58);
    expect(viewRows).toBeGreaterThanOrEqual(WANT_ROWS);
  });

  it('높은 화면: 최대 크기에서 멈춘다 (설정의 타일 크기 반영)', () => {
    expect(fitBoard(1120, 900).tw).toBe(58);
    expect(fitBoard(1120, 900, 0.86).tw).toBe(Math.floor(58 * 0.86));
    expect(fitBoard(1120, 900, 1.16).tw).toBe(Math.min(Math.floor(58 * 1.16), Math.floor(1120 / (BOARD_COLS * (1 + CELL_GAP)))));
  });

  it('아주 낮은 화면에서도 타일이 작아지는 데 한계가 있다', () => {
    const { tw, viewRows } = fitBoard(800, 120);
    expect(tw).toBeGreaterThanOrEqual(30);
    expect(viewRows).toBeGreaterThanOrEqual(3);
  });

  it('칸 간격: 한 칸·한 줄', () => {
    expect(strideX(50)).toBeCloseTo(53);
    expect(strideY(50)).toBeCloseTo(81);
  });

  it('가리킨 칸과 그 칸의 어느 쪽 절반인가', () => {
    expect(cellFromOffset(3.2, 2.9, 8)).toEqual({ row: 2, col: 3, after: false });
    expect(cellFromOffset(3.5, 0.1, 8)).toEqual({ row: 0, col: 3, after: false }); // 한가운데는 앞쪽
    expect(cellFromOffset(3.51, 0.1, 8)).toEqual({ row: 0, col: 3, after: true });
  });

  it('판 밖을 가리키면 가장 가까운 칸 — 오른쪽 밖은 끝 칸의 뒤, 왼쪽 밖은 첫 칸의 앞', () => {
    expect(cellFromOffset(13.4, 1, 8)).toEqual({ row: 1, col: BOARD_COLS - 1, after: true });
    expect(cellFromOffset(-0.6, 1, 8)).toEqual({ row: 1, col: 0, after: false });
    expect(cellFromOffset(5, -2, 8).row).toBe(0);
    expect(cellFromOffset(5, 99, 8).row).toBe(7);
  });

  it('여러 장을 끌 때 시작 칸은 판을 넘지 않고 앞/뒤 힌트는 그대로 따라간다', () => {
    expect(startCell({ row: 1, col: 12, after: true }, 0, 3)).toEqual({ row: 1, col: BOARD_COLS - 3, after: true });
    expect(startCell({ row: 1, col: 4, after: false }, 1, 3)).toEqual({ row: 1, col: 3, after: false });
  });
});
