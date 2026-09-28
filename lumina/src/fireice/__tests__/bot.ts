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

const pos = (p: PathState, el: Element): Cell => (el === 'fire' ? p.f : el === 'ice' ? p.i : p.l);
const same = (a: Cell | null, b: Cell): boolean => !!a && a.x === b.x && a.y === b.y;

function tick(w: WorldState, el: Element | null, inp: Input): ReturnType<typeof step> {
  return step(w, el ? { [el]: inp } : {}, DT);
}

/** 발판이 다 서고 둘 다 땅에 설 때까지 기다린다 */
function settle(w: WorldState, maxT = 6): void {
  let calm = 0;
  for (let t = 0; t < maxT && calm < 15; t += DT) {
    tick(w, null, NO_INPUT);
    const still = w.level.players.every((e) => !w.bodies[e].alive || (w.bodies[e].ground !== -2 && Math.abs(w.bodies[e].vx) < 0.01));
    calm = platformsSettled(w) && still ? calm + 1 : 0;
  }
}

interface Strat {
  readonly jump: boolean;
  /** 발이 이만큼 올라가야 옆으로 튼다 (0이면 처음부터) */
  readonly rise: number;
  readonly hold: number;
}

/**
 * 한 몸놀림을 복사본에서 해 본다. 목표 칸에 (한 번이라도) 내려섰으면 그 세계를 돌려준다.
 * via가 있으면: 먼저 그 칸의 젤리를 밟아 튀어 오른 뒤, 발이 (튄 자리 기준) bounceRise만큼 오르면 목표로 몸을 튼다.
 */
function attempt(w0: WorldState, el: Element, to: Cell, s: Strat, via: Cell | null = null, kind: 'jelly' | 'portal' = 'jelly', bounceRise = 0): WorldState | null {
  const w = structuredClone(w0);
  const b = w.bodies[el];
  const feet0 = b.y + PHYS.h;
  let steer = s.rise <= 0;
  let calm = 0;
  let reached = false;
  let bounced = !via;
  let launchFeet = 0;
  for (let t = 0; t < 4 && calm < 15; t += DT) {
    const target = bounced ? to : (via as Cell);
    if (via && bounced) steer = kind === 'portal' || b.y + PHYS.h < launchFeet - bounceRise || b.vy > 0;
    else if (!steer && b.y + PHYS.h < feet0 - s.rise) steer = true;
    const err = target.x + 0.5 - (b.x + PHYS.w / 2);
    const v = err - b.vx * 0.12;
    const want = steer ? (Math.abs(v) < 0.06 ? 0 : Math.sign(v)) : 0;
    const ev = tick(w, el, { left: want < 0, right: want > 0, jump: (!via || !bounced) && s.jump && t < s.hold });
    if (!b.alive) return null;
    if (!bounced && via && ev.some((e) => (kind === 'portal' ? e.type === 'teleport' && e.el === el : e.type === 'bounce' && e.el === el && e.x === via.x))) {
      bounced = true;
      launchFeet = via.y + 1;
      continue;
    }
    // 튀기(구멍에 들기) 전에 다른 젤리·구멍을 밟았으면 실패
    if (ev.some((e) => (e.type === 'teleport' || (!bounced && e.type === 'bounce')) && e.el === el)) return null;
    if (bounced && t > 0.05 && same(cellOf(w, el), to)) reached = true;
    calm = bounced && t > 0.1 && b.ground !== -2 && Math.abs(err) < 0.2 && Math.abs(b.vx) < 0.05 ? calm + 1 : 0;
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
    if (n.by === 'unlock') {
      // 자물쇠 옆에 선 쪽이 자물쇠 쪽으로 밀어 연 뒤 제자리로
      const id = level.locks.findIndex((_, i) => ((a.open ^ n.open) >> i) & 1);
      const lk = level.locks[id];
      const el = level.players.find((e) => {
        const c = cellOf(w, e);
        return !!lk && !!c && c.y === lk.y && Math.abs(c.x - lk.x) === 1;
      });
      if (!lk || !el) return fail(k, `nobody at lock ${id}`);
      const home = cellOf(w, el) as Cell;
      const right = lk.x > home.x;
      for (let t = 0; t < 1 && !w.lockOpen[id]; t += DT) tick(w, el, { left: !right, right, jump: false });
      if (!w.lockOpen[id]) return fail(k, `lock ${id} stays shut`);
      const b = w.bodies[el];
      for (let t = 0; t < 1; t += DT) {
        const err = home.x + 0.5 - (b.x + PHYS.w / 2);
        const v = err - b.vx * 0.12;
        if (Math.abs(err) < 0.1 && Math.abs(b.vx) < 0.05) break;
        tick(w, el, { left: v < -0.06, right: v > 0.06, jump: false });
      }
    } else if (n.by === 'lever') {
      // 레버 칸에 선 쪽이 민다: 켜려면 오른쪽, 끄려면 왼쪽
      const idx = level.levers.findIndex((_, i) => ((a.lev ^ n.lev) >> i) & 1);
      const lv = level.levers[idx];
      if (!lv) return fail(k, 'lever?');
      const el: Element | null = level.players.find((e) => same(cellOf(w, e), lv)) ?? null;
      if (!el) return fail(k, `nobody at lever ${idx}`);
      const on = ((n.lev >> idx) & 1) === 1;
      for (let f = 0; f < 4; f++) tick(w, el, { left: !on, right: on, jump: false });
    } else {
      const el: Element = n.by === 'ice' || n.by === 'leaf' ? n.by : 'fire';
      const from = pos(a, el);
      // 움직인 칸 (발판이 움직여 실려 가면 그 뒤 칸은 settle 뒤에 본다)
      const to = n.to ?? pos(n, el);
      let done: WorldState | null = null;
      const via = n.via;
      // 젤리로 튀는 길: 젤리까지 가는 몸놀림 × 튄 뒤 몸을 트는 높이
      const portal = n.viaKind === 'portal';
      const tries: { s: Strat; rise: number }[] = via && portal
        ? strategies(from, via).map((s) => ({ s, rise: 0 }))
        : via
        ? strategies(from, via).flatMap((s) => [Math.max(0.3, via.y - to.y + 0.05), 1, 2, 3, 4, 5, 0].map((rise) => ({ s, rise })))
        : strategies(from, to).map((s) => ({ s, rise: 0 }));
      for (const { s, rise } of tries) {
        const r = attempt(w, el, to, s, via, portal ? 'portal' : 'jelly', rise);
        if (!r) continue;
        // 레버를 지나며 잘못 건드렸으면, 레버 칸에 서 있을 때 되돌린다
        r.level.levers.forEach((lv, i) => {
          const want = ((n.lev >> i) & 1) === 1;
          if (r.levers[i] !== want && same(cellOf(r, el), lv)) for (let f = 0; f < 4; f++) tick(r, el, { left: !want, right: want, jump: false });
        });
        settle(r);
        const levOk = r.levers.every((on, i) => on === (((n.lev >> i) & 1) === 1));
        if (level.players.every((e) => same(cellOf(r, e), pos(n, e))) && levOk) {
          done = r;
          break;
        }
      }
      if (!done) return fail(k, `${el} (${from.x},${from.y}) → (${to.x},${to.y})`);
      w = done;
    }
    settle(w);
    if (!level.players.every((e) => same(cellOf(w, e), pos(n, e)))) return fail(k, `positions after step: ${level.players.map((e) => `${e} ${JSON.stringify(cellOf(w, e))}`).join(' ')}`);
  }
  return cleared(w) ? { ok: true, failedAt: -1, why: '', world: w } : fail(path.length, 'not cleared at the end');
}
