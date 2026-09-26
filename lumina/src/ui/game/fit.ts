/**
 * 화면에 맞춘 타일 크기. CSS의 간격 공식과 같은 계산을 JS에서 미리 해서,
 * 테이블이 스크롤 없이 한눈에 들어오는 가장 큰 타일 너비를 고른다.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';
import { useSettings } from '../../store/settings';

export const TILE_RATIO = 1.36;

const sizeFactor = (s: 'S' | 'M' | 'L'): number => (s === 'S' ? 0.86 : s === 'L' ? 1.16 : 1);

/** CSS(table.css)와 같은 비율: 세트 안 간격 .06, 세트 안쪽 여백 .16, 세트 사이 .42, 줄 사이 .5 */
export function tableHeightFor(tw: number, width: number, lens: readonly number[]): number {
  const th = tw * TILE_RATIO;
  const gap = tw * 0.06;
  const pad = tw * 0.16 * 2;
  const setGap = tw * 0.42;
  const rowGap = tw * 0.5;
  let rows = 1;
  let x = 0;
  for (const n of lens) {
    const w = n * tw + (n - 1) * gap + pad;
    if (w > width) {
      // 한 줄에 안 들어가는 긴 세트는 세트 안에서 줄바꿈
      const per = Math.max(1, Math.floor((width - pad + gap) / (tw + gap)));
      const lines = Math.ceil(n / per);
      rows += x > 0 ? lines : lines - 1;
      x = width;
      continue;
    }
    if (x > 0 && x + setGap + w > width) {
      rows++;
      x = w;
    } else x += (x > 0 ? setGap : 0) + w;
  }
  return rows * (th + pad) + (rows - 1) * rowGap;
}

export function fitTable(width: number, height: number, lens: readonly number[], max: number, min = 22): number {
  for (let tw = Math.floor(max); tw > min; tw--) {
    if (tableHeightFor(tw, width, lens) <= height) return tw;
  }
  return min;
}

export function useTableFit(ref: RefObject<HTMLElement | null>, lens: readonly number[], frozen: boolean): number {
  const size = useSettings((s) => s.tileSize);
  const [tw, setTw] = useState(40);
  const key = lens.join(',');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = (): void => {
      if (frozen) return;
      const cs = getComputedStyle(el);
      const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      const H = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
      if (W <= 0 || H <= 0) return;
      const max = (W < 520 ? 44 : W < 900 ? 52 : 60) * sizeFactor(size);
      setTw(fitTable(W, H, lens.length ? lens : [3], max, 24));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frozen, size]);
  return tw;
}

/** 랙: 두 줄(많으면 세 줄)에 들어가는 가장 큰 타일 */
export function useRackFit(ref: RefObject<HTMLElement | null>, count: number): number {
  const size = useSettings((s) => s.tileSize);
  const [rw, setRw] = useState(46);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = (): void => {
      const cs = getComputedStyle(el);
      const W = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      if (W <= 0) return;
      const max = (W < 520 ? 48 : 58) * sizeFactor(size);
      const n = Math.max(1, count);
      // 가로 폰처럼 낮은 화면에서는 랙이 화면 높이의 30%를 넘지 않게
      const hMax = window.innerHeight < 521 ? window.innerHeight * 0.3 : Infinity;
      let best = 28;
      for (let w = Math.floor(max); w >= 26; w--) {
        const gap = Math.max(3, w * 0.1);
        const per = Math.max(1, Math.floor((W + gap) / (w + gap)));
        const rows = Math.ceil(n / per);
        const height = rows * w * 1.36 + (rows - 1) * gap + 16;
        best = w;
        if (rows <= 2 && height <= hMax) break;
      }
      setRw(best);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, count, size]);
  return rw;
}
