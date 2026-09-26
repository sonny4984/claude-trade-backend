/**
 * FLIP 애니메이션 — 타일이 어디서 왔는지 눈으로 따라갈 수 있게.
 * 상태를 바꾸기 직전 capture()로 모든 타일 위치를 기억하고,
 * 화면이 다시 그려진 뒤 play()가 이전 위치에서 새 위치로 미끄러뜨린다.
 * CSS의 `translate` 속성만 움직이므로 선택 들림(transform)과 부딪히지 않는다.
 */
import { prefersReducedMotion } from '../store/settings';
import type { TileId } from '../game/types';

const els = new Map<TileId, HTMLElement>();
let snapshot: Map<TileId, DOMRect> | null = null;
const overrides = new Map<TileId, { rect: DOMRect; delay: number; duration?: number }>();

export function registerTile(id: TileId, el: HTMLElement | null): void {
  if (el) els.set(id, el);
  else if (els.get(id) && !els.get(id)?.isConnected) els.delete(id);
}

export function tileElement(id: TileId): HTMLElement | undefined {
  const el = els.get(id);
  return el && el.isConnected ? el : undefined;
}

export function capture(): void {
  snapshot = new Map();
  els.forEach((el, id) => {
    if (el.isConnected) snapshot?.set(id, el.getBoundingClientRect());
  });
}

/** 이 타일은 다른 곳(드래그 고스트, AI 자리)에서 날아온 것으로 친다 */
export function from(id: TileId, rect: DOMRect, delay = 0, duration?: number): void {
  overrides.set(id, { rect, delay, duration });
}

export function play(opts: { duration?: number; easing?: string } = {}): number {
  const reduce = prefersReducedMotion();
  const base = opts.duration ?? 260;
  const easing = opts.easing ?? 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  let longest = 0;
  els.forEach((el, id) => {
    if (!el.isConnected) return;
    const o = overrides.get(id);
    const old = o?.rect ?? snapshot?.get(id);
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left + old.width / 2 - (now.left + now.width / 2);
    const dy = old.top + old.height / 2 - (now.top + now.height / 2);
    const s = now.width > 0 ? old.width / now.width : 1;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.02) return;
    const duration = reduce ? 0 : o?.duration ?? base;
    const delay = reduce ? 0 : o?.delay ?? 0;
    if (!duration) return;
    try {
      el.animate(
        [
          { translate: `${dx}px ${dy}px`, scale: `${s}` },
          { translate: '0px 0px', scale: '1' },
        ],
        { duration, delay, easing, fill: 'backwards' },
      );
      longest = Math.max(longest, duration + delay);
    } catch {
      /* 오래된 브라우저 — 애니메이션 없이 */
    }
  });
  snapshot = null;
  overrides.clear();
  return longest;
}

export function cancelCapture(): void {
  snapshot = null;
  overrides.clear();
}
