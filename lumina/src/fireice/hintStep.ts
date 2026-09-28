/**
 * 풀이 경로의 다음 한 수를 사람이 알아볼 힌트로: 누가 어디로 갈지, 어느 레버를 어느 쪽으로, 어느 자물쇠를.
 * 같은 캐릭터가 이어서 걷는 걸음은 한 번에 묶는다 (레버·열쇠·자물쇠가 바뀌는 걸음에서 멈춤).
 */
import type { Cell, Element, ParsedLevel } from './level';
import type { PathState } from './verify';

export interface HintStep {
  readonly kind: 'move' | 'lever' | 'unlock';
  readonly el: Element;
  readonly x: number;
  readonly y: number;
  /** 레버: 켜야 하면 true (오른쪽으로), 꺼야 하면 false (왼쪽으로) */
  readonly on?: boolean;
}

export function describeHint(level: ParsedLevel, path: readonly PathState[]): HintStep | null {
  const a = path[0];
  const n = path[1];
  if (!a || !n) return null;
  const at = (c: Cell, x: number, y: number): boolean => c.x === x && c.y === y;
  if (n.by === 'lever') {
    const k = level.levers.findIndex((_, i) => ((a.lev ^ n.lev) >> i) & 1);
    const lv = level.levers[k];
    if (!lv) return null;
    return { kind: 'lever', el: at(a.f, lv.x, lv.y) ? 'fire' : 'ice', x: lv.x, y: lv.y, on: ((n.lev >> k) & 1) === 1 };
  }
  if (n.by === 'unlock') {
    const k = level.locks.findIndex((_, i) => ((a.open ^ n.open) >> i) & 1);
    const lk = level.locks[k];
    if (!lk) return null;
    const near = (c: Cell): boolean => c.y === lk.y && Math.abs(c.x - lk.x) === 1;
    return { kind: 'unlock', el: near(a.f) ? 'fire' : 'ice', x: lk.x, y: lk.y };
  }
  if (n.by !== 'fire' && n.by !== 'ice') return null;
  const el = n.by;
  const changed = (p: PathState, q: PathState): boolean => p.lev !== q.lev || p.keys !== q.keys || p.open !== q.open;
  let k = 1;
  if (!changed(n, a))
    for (let j = 2; j < path.length && j <= 14; j++) {
      const p = path[j] as PathState;
      if (p.by !== el) break;
      k = j;
      if (changed(p, path[j - 1] as PathState)) break;
    }
  const c = (path[k] as PathState)[el === 'fire' ? 'f' : 'i'];
  return { kind: 'move', el, x: c.x, y: c.y };
}
