/** 진동 — 지원하지 않는 기기(iOS 사파리 등)에서는 조용히 아무것도 하지 않는다 */
import { useSettings } from '../store/settings';

const PATTERNS = {
  tap: 6,
  pick: 8,
  place: 12,
  error: [18, 40, 18],
  success: [10, 30, 10, 30, 36],
  turn: 14,
  warn: 20,
} as const;

export type Buzz = keyof typeof PATTERNS;

export function buzz(kind: Buzz): void {
  if (!useSettings.getState().haptics) return;
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | readonly number[]) => boolean };
    nav.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    /* noop */
  }
}
