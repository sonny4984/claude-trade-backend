import { useLayoutEffect, useState, type RefObject } from 'react';
import { useSettings } from '../../store/settings';
import { fitBoard } from './boardGeometry';

export { TILE_RATIO, CELL_GAP, ROW_GAP, strideX, strideY } from './boardGeometry';

const sizeFactor = (s: 'S' | 'M' | 'L'): number => (s === 'S' ? 0.86 : s === 'L' ? 1.16 : 1);

export function useBoardFit(ref: RefObject<HTMLElement | null>): { tw: number; viewRows: number } {
  const size = useSettings((s) => s.tileSize);
  const [fit, setFit] = useState({ tw: 26, viewRows: 8 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = (): void => {
      const cs = getComputedStyle(el);
      const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const H = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (W <= 0 || H <= 0) return;
      const next = fitBoard(W, H, sizeFactor(size));
      setFit((f) => (f.tw === next.tw && f.viewRows === next.viewRows ? f : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
  return fit;
}

/** 랙: 두 줄(많으면 세 줄)에 들어가는 가장 큰 타일 — rows는 지금 타일 수가 몇 줄을 차지하는지(한 줄이면 랙을 낮게) */
export function useRackFit(ref: RefObject<HTMLElement | null>, count: number): { rw: number; rows: number } {
  const size = useSettings((s) => s.tileSize);
  const [fit, setFit] = useState({ rw: 46, rows: 2 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = (): void => {
      const cs = getComputedStyle(el);
      const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      if (W <= 0) return;
      const max = (W < 520 ? 48 : 58) * sizeFactor(size);
      const n = Math.max(1, count);
      // 낮은 화면에서는 랙이 판의 자리를 먹지 않게: 가로 폰은 화면 높이의 30%, 세로로 짧은 폰은 19%
      const hMax = window.innerHeight < 521 ? window.innerHeight * 0.3 : W < 520 && window.innerHeight < 780 ? window.innerHeight * 0.19 : Infinity;
      let best = 28;
      let bestRows = 2;
      for (let w = Math.floor(max); w >= 26; w--) {
        const gap = Math.max(3, w * 0.1);
        const per = Math.max(1, Math.floor((W + gap) / (w + gap)));
        const rows = Math.ceil(n / per);
        const height = rows * w * 1.36 + (rows - 1) * gap + 16;
        best = w;
        bestRows = rows;
        if (rows <= 2 && height <= hMax) break;
      }
      setFit((f) => (f.rw === best && f.rows === bestRows ? f : { rw: best, rows: bestRows }));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, count, size]);
  return fit;
}
