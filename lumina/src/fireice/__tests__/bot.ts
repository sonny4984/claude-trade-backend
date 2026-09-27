/**
 * 시험용 로봇: verify.ts가 찾은 칸 모형 풀이를 실제 물리(world.ts)로 한 걸음씩 따라가 본다.
 * 걸음마다 몇 가지 몸놀림(걷기, 곧장 뛰어올라 틀기, 달리며 뛰기)을 복사본에서 시험해 보고 되는 것을 고른다.
 */
import type { Cell, Element, ParsedLevel } from '../level';
import type { PathState } from '../verify';
import { NO_INPUT, PHYS, cleared, newWorld, platformsSettled, step, type Input, type WorldState } from '../world';

const DT = 1 / 120;

export function cellOf(w: WorldState, el: Element): Cell | null {
  const b = w.bodies[el];
  if (!b.alive || b.ground === -2) return null;
  return { x: Math.floor(b.x + PHYS.w / 2), y: Math.round(b.y + PHYS.h) - 1 };
}

const same = (a: Cell | null, b: Cell): boolean => !!a && a.x === b.x && a.y === b.y;

function tick(w: WorldState, el: Element | null, inp: Input): void {
  step(w, { fire: el === 'fire' ? inp : NO_INPUT, ice: el === 'ice' ? inp : NO_INPUT }, DT);
}

/** 발판이 다 서고 둘 다 땅에 설 때까지 기다린다 */
function settle(w: WorldState, maxT = 6): void {
  let calm = 0;
  for (let t = 0; t < maxT && calm < 15; t += DT) {
    tick(w, null, NO_INPUT);
    const still = (['fire', 'ice'] as const).every((e) => !w.bodies[e].alive || (w.bodies[e].ground !== -2 && Math.abs(w.bodies[e].vx) < 0.01));
    calm = platformsSettled(w) && still ? calm + 1 : 0;
  }
}

interface Strat {
  readonly jump: boolean;
  /** 발이 이만큼 올라가야 옆으로 튼다 (0이면 처음부터) */
  readonly rise: number;
  readonly hold: number;
}

/** 한 몸놀림을 복사본에서 해 본다. 목표 칸에 (한 번이라도) 내려섰으면 그 세계를 돌려준다 */
function attempt(w0: WorldState, el: Element, to: Cell, s: Strat): WorldState | null {
  const w = structuredClone(w0);
  const b = w.bodies[el];
  const feet0 = b.y + PHYS.h;
  let steer = s.rise <= 0;
  let calm = 0;
  let reached = false;
  for (let t = 0; t < 3.5 && calm < 15; t += DT) {
    if (!steer && b.y + PHYS.h < feet0 - s.rise) steer = true;
    const err = to.x + 0.5 - (b.x + PHYS.w / 2);
    const v = err - b.vx * 0.12;
    const want = steer ? (Math.abs(v) < 0.06 ? 0 : Math.sign(v)) : 0;
    tick(w, el, { left: want < 0, right: want > 0, jump: s.jump && t < s.hold });
    if (!b.alive) return null;
    if (t > 0.05 && same(cellOf(w, el), to)) reached = true;
    calm = t > 0.1 && b.ground !== -2 && Math.abs(err) < 0.2 && Math.abs(b.vx) < 0.05 ? calm + 1 : 0;
  }
  return reached ? w : null;
}

function strategies(from: Cell, to: Cell): Strat[] {
  const dx = Math.abs(to.x - from.x);
  const dy = to.y - from.y;
  const walk: Strat = { jump: false, rise: 0, hold: 0 };
  const flat: Strat = { jump: true, rise: 0, hold: 0.5 };
  const up = (r: number, hold = 0.5): Strat => ({ jump: true, rise: r, hold });
  const hop: Strat = { jump: true, rise: 0, hold: 0.12 };
  if (dx <= 1 && dy >= 0) return [walk, up(0.7, 0.15), up(1.2), flat];
  if (dy < 0) return [up(-dy + 0.02), up(-dy + 0.3), up(Math.min(3.3, -dy + 0.6)), flat];
  return [walk, hop, flat, up(1), up(2), up(3)];
}

export interface BotResult {
  readonly ok: boolean;
  readonly failedAt: number;
  readonly why: string;
  readonly world: WorldState;
}

/** 풀이를 따라가 본다 */
export function replay(level: ParsedLevel, path: readonly PathState[]): BotResult {
  let w = newWorld(level);
  settle(w);
  const fail = (k: number, why: string): BotResult => ({ ok: false, failedAt: k, why, world: w });
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1] as PathState;
    const n = path[k] as PathState;
    if (n.by === 'lever') {
      // 레버 칸에 선 쪽이 민다: 켜려면 오른쪽, 끄려면 왼쪽
      const idx = level.levers.findIndex((_, i) => ((a.lev ^ n.lev) >> i) & 1);
      const lv = level.levers[idx];
      if (!lv) return fail(k, 'lever?');
      const el: Element | null = same(cellOf(w, 'fire'), lv) ? 'fire' : same(cellOf(w, 'ice'), lv) ? 'ice' : null;
      if (!el) return fail(k, `nobody at lever ${idx}`);
      const on = ((n.lev >> idx) & 1) === 1;
      for (let f = 0; f < 4; f++) tick(w, el, { left: !on, right: on, jump: false });
    } else {
      const el: Element = n.by === 'ice' ? 'ice' : 'fire';
      const from = el === 'fire' ? a.f : a.i;
      // 움직인 칸 (발판이 움직여 실려 가면 그 뒤 칸은 settle 뒤에 본다)
      const to = n.to ?? (el === 'fire' ? n.f : n.i);
      let done: WorldState | null = null;
      for (const s of strategies(from, to)) {
        const r = attempt(w, el, to, s);
        if (!r) continue;
        // 레버를 지나며 잘못 건드렸으면, 레버 칸에 서 있을 때 되돌린다
        r.level.levers.forEach((lv, i) => {
          const want = ((n.lev >> i) & 1) === 1;
          if (r.levers[i] !== want && same(cellOf(r, el), lv)) for (let f = 0; f < 4; f++) tick(r, el, { left: !want, right: want, jump: false });
        });
        settle(r);
        const levOk = r.levers.every((on, i) => on === (((n.lev >> i) & 1) === 1));
        if (same(cellOf(r, 'fire'), n.f) && same(cellOf(r, 'ice'), n.i) && levOk) {
          done = r;
          break;
        }
      }
      if (!done) return fail(k, `${el} (${from.x},${from.y}) → (${to.x},${to.y})`);
      w = done;
    }
    settle(w);
    if (!same(cellOf(w, 'fire'), n.f) || !same(cellOf(w, 'ice'), n.i)) return fail(k, `positions after step: fire ${JSON.stringify(cellOf(w, 'fire'))} ice ${JSON.stringify(cellOf(w, 'ice'))}`);
  }
  return cleared(w) ? { ok: true, failedAt: -1, why: '', world: w } : fail(path.length, 'not cleared at the end');
}
