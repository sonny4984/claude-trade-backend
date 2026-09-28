/**
 * 불과 얼음 힌트·막힘 알림 — 지금 세계를 풀이 모형 상태로 옮겨 작업자에서 풀이기를 돌린다.
 * 작업자를 못 쓰는 곳(막힌 창 등)에서는 여기서 작게 푼다.
 */
import HintWorker from './hint.worker?worker&inline';
import type { Element } from './level';
import { PHYS, platformsSettled, type WorldState } from './world';
import { searchFrom, type SolverState } from './verify';
import { describeHint, type HintStep } from './hintStep';

export type { HintStep };
export interface SolveResult {
  readonly sig: string;
  readonly solvable: boolean;
  readonly truncated: boolean;
  readonly hint: HintStep | null;
}

/** 둘 다 땅에 서 있고 발판이 멈췄을 때만 풀이 상태로 옮길 수 있다 */
export function solverState(w: WorldState): { readonly state: SolverState; readonly sig: string } | null {
  const cell = (el: Element): { x: number; y: number } | null => {
    const b = w.bodies[el];
    return !b.alive || b.ground === -2 ? null : { x: Math.floor(b.x + PHYS.w / 2), y: Math.round(b.y + PHYS.h) - 1 };
  };
  const f = cell('fire');
  const i = cell('ice');
  const l = w.level.players.includes('leaf') ? cell('leaf') : w.level.spawn.leaf;
  if (!f || !i || !l || !platformsSettled(w)) return null;
  const bits = (a: readonly boolean[]): number => a.reduce((n, on, k) => (on ? n | (1 << k) : n), 0);
  const state: SolverState = { f, i, l, lev: bits(w.levers), keys: bits(w.keysGot), open: bits(w.lockOpen) };
  return { state, sig: `${f.x},${f.y},${i.x},${i.y},${l.x},${l.y},${state.lev},${state.keys},${state.open}` };
}

let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (d: { solvable: boolean; truncated: boolean; hint: HintStep | null } | null) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const wk = new HintWorker();
    wk.onmessage = (e: MessageEvent<{ id: number; solvable: boolean; truncated: boolean; hint: HintStep | null }>) => {
      const cb = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      cb?.(e.data);
    };
    wk.onerror = () => {
      worker = null;
      waiting.forEach((cb) => cb(null));
      waiting.clear();
    };
    worker = wk;
  } catch {
    worker = null;
  }
  return worker;
}

/** 지금 상태에서 풀어 본다 (둘 중 하나라도 공중이면 null) */
export function solve(w: WorldState, limit = 250_000): Promise<SolveResult | null> {
  const s = solverState(w);
  if (!s) return Promise.resolve(null);
  const wk = getWorker();
  if (wk) {
    const id = ++seq;
    return new Promise((res) => {
      waiting.set(id, (d) => res(d ? { sig: s.sig, ...d } : null));
      wk.postMessage({ id, def: w.level.def, from: s.state, limit });
    });
  }
  const r = searchFrom(w.level, s.state, Math.min(limit, 60_000));
  return Promise.resolve({ sig: s.sig, solvable: r.solvable, truncated: r.truncated, hint: r.solvable ? describeHint(w.level, r.path) : null });
}
