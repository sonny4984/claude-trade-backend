/**
 * 불과 얼음 힌트·막힘 알림 작업자 — 게임 화면을 멈추지 않게 따로 돌며 지금 상태에서 풀이기를 돌린다.
 * 받는 것 { id, def, from, limit } → 주는 것 { id, solvable, truncated, hint }
 */
import { parseLevel, type LevelDef, type ParsedLevel } from './level';
import { searchFrom, type SolverState } from './verify';
import { describeHint } from './hintStep';

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (d: unknown) => void };
let cache: { id: string; lv: ParsedLevel } | null = null;

ctx.onmessage = (e: MessageEvent<{ id: number; def: LevelDef; from: SolverState; limit: number }>) => {
  const { id, def, from, limit } = e.data;
  try {
    if (!cache || cache.id !== def.id) cache = { id: def.id, lv: parseLevel(def) };
    const r = searchFrom(cache.lv, from, limit);
    ctx.postMessage({ id, solvable: r.solvable, truncated: r.truncated, hint: r.solvable ? describeHint(cache.lv, r.path) : null });
  } catch {
    ctx.postMessage({ id, solvable: true, truncated: true, hint: null });
  }
};
