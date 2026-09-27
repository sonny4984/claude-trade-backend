/**
 * 불과 얼음 — 물리와 판정 (순수 시뮬레이션, 화면과 무관).
 * 칸 = 1. 몸은 사각형(너비 0.68, 키 0.86). 달리기·가속, 점프(길게 누르면 높이, 약 3.5칸), 코요테 타임·점프 예약.
 * 발판은 버튼·레버 번호가 켜지면 정해진 칸만큼 움직이고, 위에 탄 몸을 싣고 간다.
 * 크림 선반은 위에서 내려올 때만 딛고, 젤리는 밟으면 통 튀어 오르며, 커튼은 제 원소만 지나간다.
 * 두 몸은 서로 부딪히지 않는다. 온라인에서 상대 몸은 "꼭두각시"로 두고 위치만 받아 쓴다.
 */
import { LEVEL_H, LEVEL_W, at, deadly, wallFor, type Element, type ParsedLevel, type Pool } from './level';

export const PHYS = {
  gravity: 34,
  jumpV: 15.5,
  /** 점프를 일찍 떼면 이만큼만 (짧은 점프) */
  shortHop: 0.45,
  run: 6,
  accel: 70,
  airAccel: 45,
  decel: 90,
  maxFall: 18,
  coyote: 0.09,
  buffer: 0.12,
  w: 0.68,
  h: 0.86,
  platSpeed: 3,
  /** 젤리가 튕겨 올리는 속도 (약 5.9칸 높이) */
  jellyV: 20,
} as const;

const EPS = 1e-4;
export const ELEMENTS: readonly Element[] = ['fire', 'ice'];

export interface Input {
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
}
export const NO_INPUT: Input = { left: false, right: false, jump: false };

export interface Body {
  readonly el: Element;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** -2 공중, -1 블록 위, 0 이상 발판 번호 */
  ground: number;
  coyote: number;
  buffer: number;
  face: 1 | -1;
  alive: boolean;
  atDoor: boolean;
  jumpHeld: boolean;
  /** 젤리에 튕겨 오르는 중 (점프를 떼도 높이가 줄지 않는다) */
  bouncing: boolean;
}

export interface Plat {
  x: number;
  y: number;
}

export interface WorldState {
  readonly level: ParsedLevel;
  readonly bodies: Record<Element, Body>;
  readonly plats: Plat[];
  readonly levers: boolean[];
  readonly gems: boolean[];
  readonly pressed: boolean[];
  time: number;
  /** 밖에서 위치를 넣어 주는 몸 (온라인 상대) */
  readonly puppets: Set<Element>;
}

export type WorldEvent =
  | { readonly type: 'gem'; readonly id: number; readonly el: Element }
  | { readonly type: 'dead'; readonly el: Element; readonly cause: Pool }
  | { readonly type: 'lever'; readonly id: number; readonly on: boolean }
  | { readonly type: 'door'; readonly el: Element; readonly in: boolean }
  | { readonly type: 'jump'; readonly el: Element }
  | { readonly type: 'land'; readonly el: Element }
  | { readonly type: 'bounce'; readonly el: Element; readonly x: number; readonly y: number }
  | { readonly type: 'button'; readonly group: number; readonly on: boolean };

function spawnBody(level: ParsedLevel, el: Element): Body {
  const c = level.spawn[el];
  return { el, x: c.x + (1 - PHYS.w) / 2, y: c.y + 1 - PHYS.h - EPS, vx: 0, vy: 0, ground: -1, coyote: 0, buffer: 0, face: el === 'fire' ? 1 : -1, alive: true, atDoor: false, jumpHeld: false, bouncing: false };
}

export function newWorld(level: ParsedLevel): WorldState {
  return {
    level,
    bodies: { fire: spawnBody(level, 'fire'), ice: spawnBody(level, 'ice') },
    plats: level.platforms.map((p) => ({ x: p.x, y: p.y })),
    levers: level.levers.map(() => false),
    gems: level.gems.map(() => false),
    pressed: [false, false, false, false, false],
    time: 0,
    puppets: new Set(),
  };
}

function oneWayAt(level: ParsedLevel, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= LEVEL_W || ty >= LEVEL_H) return false;
  return level.oneway[at(tx, ty)] === true;
}

interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
  /** -1 블록, 0 이상 발판 */
  readonly id: number;
}

/** 사각형과 겹치는 단단한 것들 — 이 원소에게 막히는 커튼 포함 (skip: 빼고 볼 발판 번호) */
function hits(w: WorldState, el: Element, l: number, t: number, r: number, b: number, skip = -1): Box[] {
  const out: Box[] = [];
  for (let ty = Math.floor(t); ty <= Math.floor(b - EPS); ty++)
    for (let tx = Math.floor(l); tx <= Math.floor(r - EPS); tx++) if (wallFor(w.level, el, tx, ty)) out.push({ l: tx, t: ty, r: tx + 1, b: ty + 1, id: -1 });
  w.level.platforms.forEach((d, i) => {
    if (i === skip) return;
    const p = w.plats[i] as Plat;
    if (l < p.x + d.w && r > p.x && t < p.y + d.h && b > p.y) out.push({ l: p.x, t: p.y, r: p.x + d.w, b: p.y + d.h, id: i });
  });
  return out;
}

function moveX(w: WorldState, b: Body, dx: number): void {
  if (!dx) return;
  const nx = b.x + dx;
  const hs = hits(w, b.el, nx, b.y, nx + PHYS.w, b.y + PHYS.h);
  if (!hs.length) {
    b.x = nx;
    return;
  }
  b.x = dx > 0 ? Math.min(...hs.map((h) => h.l)) - PHYS.w - EPS : Math.max(...hs.map((h) => h.r)) + EPS;
  b.vx = 0;
}

/** 세로로 움직이고, 바닥에 닿았으면 그 바닥 번호를 돌려준다 */
function moveY(w: WorldState, b: Body, dy: number): number {
  if (!dy) return -2;
  const ny = b.y + dy;
  const hs = hits(w, b.el, b.x, ny, b.x + PHYS.w, ny + PHYS.h);
  if (dy > 0) {
    // 크림 선반: 발이 선반 윗면 위에 있다가 내려올 때만 딛는다
    const feet0 = b.y + PHYS.h;
    const feet1 = ny + PHYS.h;
    for (let ty = Math.ceil(feet0 - EPS * 2); ty <= Math.floor(feet1); ty++)
      for (let tx = Math.floor(b.x); tx <= Math.floor(b.x + PHYS.w - EPS); tx++) if (ty >= feet0 - EPS * 2 && ty <= feet1 && oneWayAt(w.level, tx, ty)) hs.push({ l: tx, t: ty, r: tx + 1, b: ty + 1, id: -1 });
  }
  if (!hs.length) {
    b.y = ny;
    return -2;
  }
  if (dy > 0) {
    let top = Infinity;
    let id = -1;
    for (const h of hs)
      if (h.t < top) {
        top = h.t;
        id = h.id;
      }
    b.y = top - PHYS.h - EPS;
    b.vy = 0;
    return id;
  }
  b.y = Math.max(...hs.map((h) => h.b)) + EPS;
  b.vy = 0;
  return -2;
}

/** 발 아래 가운데 칸 */
function floorTile(b: Body): { tx: number; ty: number } {
  return { tx: Math.floor(b.x + PHYS.w / 2), ty: Math.floor(b.y + PHYS.h + 0.05) };
}

export function groupActive(w: WorldState, g: number): boolean {
  if (w.pressed[g]) return true;
  return w.level.levers.some((lv, i) => lv.group === g && w.levers[i]);
}

function standingOnCell(b: Body, cx: number, cy: number): boolean {
  if (!b.alive) return false;
  const feet = b.y + PHYS.h;
  return feet > cy + 1 - 0.12 && feet < cy + 1 + 0.08 && b.x < cx + 0.8 && b.x + PHYS.w > cx + 0.2;
}

export function step(w: WorldState, inputs: Readonly<Record<Element, Input>>, dt: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  w.time += dt;
  const bodies = ELEMENTS.map((e) => w.bodies[e]);

  // 1) 버튼: 누가 서 있나
  for (let g = 1; g <= 4; g++) {
    const on = w.level.buttons.some((bt) => bt.group === g && bodies.some((b) => standingOnCell(b, bt.x, bt.y)));
    if (on !== w.pressed[g]) {
      w.pressed[g] = on;
      events.push({ type: 'button', group: g, on });
    }
  }

  // 2) 발판 움직이기 — 탄 몸은 같이 싣고, 몸을 끼우게 되면 그동안 멈춰 기다린다
  const local = bodies.filter((b) => b.alive && !w.puppets.has(b.el));
  w.level.platforms.forEach((d, i) => {
    const p = w.plats[i] as Plat;
    const active = groupActive(w, d.group);
    const ddx = d.x + (active ? d.dx : 0) - p.x;
    const ddy = d.y + (active ? d.dy : 0) - p.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 1e-6) return;
    const k = Math.min(1, (PHYS.platSpeed * dt) / dist);
    const mx = ddx * k;
    const my = ddy * k;
    const nl = p.x + mx;
    const nt = p.y + my;
    const plan: { b: Body; x: number; y: number; lift: boolean }[] = [];
    for (const b of local) {
      const free = (x: number, y: number): boolean => !hits(w, b.el, x, y, x + PHYS.w, y + PHYS.h, i).length;
      if (b.ground === i) {
        // 탄 몸: 위로는 반드시 같이 (막히면 발판이 멈춤), 옆·아래는 막히면 그 자리에 남는다
        const x = free(b.x + mx, b.y) ? b.x + mx : b.x;
        if (my < 0 && !free(x, b.y + my)) return;
        const y = my < 0 || free(x, b.y + my) ? b.y + my : b.y;
        plan.push({ b, x, y, lift: false });
        continue;
      }
      if (!(b.x < nl + d.w && b.x + PHYS.w > nl && b.y < nt + d.h && b.y + PHYS.h > nt)) continue;
      if (my <= 0 && b.y + PHYS.h - nt < 0.6 && free(b.x, nt - PHYS.h - EPS)) plan.push({ b, x: b.x, y: nt - PHYS.h - EPS, lift: true });
      else if (mx !== 0 && free(mx > 0 ? nl + d.w + EPS : nl - PHYS.w - EPS, b.y)) plan.push({ b, x: mx > 0 ? nl + d.w + EPS : nl - PHYS.w - EPS, y: b.y, lift: false });
      else return;
    }
    p.x = nl;
    p.y = nt;
    for (const q of plan) {
      q.b.x = q.x;
      q.b.y = q.y;
      if (q.lift) {
        q.b.vy = Math.min(q.b.vy, 0);
        q.b.ground = i;
      }
    }
  });

  // 3) 몸 움직이기
  for (const b of bodies) {
    if (!b.alive || w.puppets.has(b.el)) continue;
    const inp = inputs[b.el] ?? NO_INPUT;
    const want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const grounded = b.ground !== -2;
    const accel = want !== 0 ? (grounded ? PHYS.accel : PHYS.airAccel) : grounded ? PHYS.decel : PHYS.airAccel * 0.5;
    const target = want * PHYS.run;
    if (b.vx < target) b.vx = Math.min(target, b.vx + accel * dt);
    else if (b.vx > target) b.vx = Math.max(target, b.vx - accel * dt);
    if (want) b.face = want > 0 ? 1 : -1;

    // 점프: 누른 순간 예약, 땅(또는 막 떨어진 직후)이면 뛴다
    if (inp.jump && !b.jumpHeld) b.buffer = PHYS.buffer;
    b.jumpHeld = inp.jump;
    b.coyote = grounded ? PHYS.coyote : Math.max(0, b.coyote - dt);
    b.buffer = Math.max(0, b.buffer - dt);
    if (b.buffer > 0 && b.coyote > 0) {
      b.vy = -PHYS.jumpV;
      b.buffer = 0;
      b.coyote = 0;
      b.ground = -2;
      events.push({ type: 'jump', el: b.el });
    }
    if (b.vy >= 0) b.bouncing = false;
    if (!inp.jump && !b.bouncing && b.vy < -PHYS.jumpV * PHYS.shortHop) b.vy = -PHYS.jumpV * PHYS.shortHop;
    b.vy = Math.min(PHYS.maxFall, b.vy + PHYS.gravity * dt);

    const wasGround = b.ground;
    moveX(w, b, b.vx * dt);
    const g = moveY(w, b, b.vy * dt);
    b.ground = g;
    if (g !== -2 && wasGround === -2) events.push({ type: 'land', el: b.el });

    // 웅덩이 판정·젤리 (발 아래 가운데 칸)
    if (g === -1) {
      const { tx, ty } = floorTile(b);
      const pool = ty < LEVEL_H ? w.level.pool[at(tx, ty)] ?? null : null;
      if (pool && deadly(b.el, pool)) {
        b.alive = false;
        b.vx = 0;
        b.vy = 0;
        events.push({ type: 'dead', el: b.el, cause: pool });
        continue;
      }
      if (ty < LEVEL_H && tx >= 0 && tx < LEVEL_W && w.level.jelly[at(tx, ty)]) {
        b.vy = -PHYS.jellyV;
        b.ground = -2;
        b.coyote = 0;
        b.buffer = 0;
        b.bouncing = true;
        events.push({ type: 'bounce', el: b.el, x: tx, y: ty });
      }
    }

    // 레버: 밀고 지나가면 (오른쪽으로 켜고, 왼쪽으로 끔)
    w.level.levers.forEach((lv, i) => {
      if (b.x < lv.x + 0.75 && b.x + PHYS.w > lv.x + 0.25 && b.y + PHYS.h > lv.y + 0.4 && b.y < lv.y + 1) {
        if (b.vx > 1 && !w.levers[i]) {
          w.levers[i] = true;
          events.push({ type: 'lever', id: i, on: true });
        } else if (b.vx < -1 && w.levers[i]) {
          w.levers[i] = false;
          events.push({ type: 'lever', id: i, on: false });
        }
      }
    });

    // 사탕
    w.level.gems.forEach((gm, i) => {
      if (w.gems[i] || gm.el !== b.el) return;
      const cx = gm.x + 0.5;
      const cy = gm.y + 0.5;
      const nx = Math.max(b.x, Math.min(cx, b.x + PHYS.w));
      const ny = Math.max(b.y, Math.min(cy, b.y + PHYS.h));
      if ((nx - cx) ** 2 + (ny - cy) ** 2 < 0.36 * 0.36) {
        w.gems[i] = true;
        events.push({ type: 'gem', id: i, el: b.el });
      }
    });
  }

  // 4) 문
  for (const b of bodies) {
    const d = w.level.door[b.el];
    const cx = b.x + PHYS.w / 2;
    const inside = b.alive && b.ground !== -2 && cx > d.x + 0.1 && cx < d.x + 0.9 && Math.abs(b.y + PHYS.h - (d.y + 1)) < 0.15;
    if (inside !== b.atDoor) {
      b.atDoor = inside;
      events.push({ type: 'door', el: b.el, in: inside });
    }
  }
  return events;
}

/** 둘 다 문 안에 있으면 통과 */
export function cleared(w: WorldState): boolean {
  return w.bodies.fire.alive && w.bodies.ice.alive && w.bodies.fire.atDoor && w.bodies.ice.atDoor;
}

/** 온라인 상대 몸에 받은 위치를 넣는다 */
export function setPuppet(w: WorldState, el: Element, s: { x: number; y: number; vx: number; vy: number; face: 1 | -1; ground: boolean; alive: boolean; door: boolean }): void {
  const b = w.bodies[el];
  b.x = s.x;
  b.y = s.y;
  b.vx = s.vx;
  b.vy = s.vy;
  b.face = s.face;
  b.ground = s.ground ? -1 : -2;
  b.alive = s.alive;
  b.atDoor = s.door;
}

/** 모든 발판이 제자리(켜짐·꺼짐에 맞는 자리)에 도착했나 */
export function platformsSettled(w: WorldState): boolean {
  return w.level.platforms.every((d, i) => {
    const p = w.plats[i] as Plat;
    const on = groupActive(w, d.group);
    return Math.abs(p.x - (d.x + (on ? d.dx : 0))) < 1e-6 && Math.abs(p.y - (d.y + (on ? d.dy : 0))) < 1e-6;
  });
}
