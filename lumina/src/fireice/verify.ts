/**
 * 단계 검사기 — "칸 모형"으로 두 캐릭터가 함께 문까지 갈 수 있는지 전부 찾아본다 (테스트용).
 *
 * 칸 모형은 실제 물리보다 보수적이다:
 *  · 설 수 있는 칸 = 빈칸 + 바로 아래가 블록·안전한 웅덩이·발판
 *  · 걷기(한 칸) · 떨어지기(곧장 아래) · 점프: 위로 3칸이면 옆으로 2칸까지, 2칸이면 3칸, 1칸이면 4칸,
 *    같은 높이·아래로는 머리 위 여유에 따라 2~4칸 (실제 점프는 약 3.5칸 높이, 5칸 가까이 난다)
 *  · 점프 길: 제자리에서 곧장 올라가 착지 높이에서 옆으로 가는 ㄱ자 길이 비어 있어야 한다
 *    (몸이 꼭대기에서 착지 줄 위 칸까지 들어가므로 그 윗줄도 함께 비어 있어야 함)
 *  · 머리 위 천장이 낮으면 덜 높이·덜 멀리 뛴다 (뛴 높이와 공중에 있는 시간으로 옆 거리를 셈)
 *  · 크림 선반은 위에서만 딛고(아래·옆으로는 지나감), 젤리 위에는 설 수 없고 밟으면 약 5칸까지 튄다(다시 젤리에 떨어지는 길은 뺀다),
 *    커튼은 제 원소에게만 빈칸이다
 *  · 버튼은 누가 그 칸에 서 있는 동안 켜짐, 레버는 그 칸에 서서 켜고 끔. 발판은 켜지면 옮겨 간 자리에 있다고 본다
 *  · 발판이 움직이면 위에 선 캐릭터도 같이 옮기고, 발 밑이 비면 떨어진다. 발판에 끼이는 상태는 버린다
 * 칸 모형에서 풀리면 실제 게임에서도 풀린다(물리가 더 너그러우므로).
 */
import { LEVEL_H, LEVEL_W, at, deadly, wallFor, type Cell, type Element, type ParsedLevel } from './level';

type Occ = Set<number>;

/** 한 번의 움직임: 도착 칸, 젤리를 밟고 튀었다면 밟은 자리(젤리 바로 위 칸) */
export interface Move {
  readonly cell: Cell;
  readonly via?: Cell;
  /** via가 젤리(튀기)인지 순간이동 구멍인지 */
  readonly viaKind?: 'jelly' | 'portal';
  /** 옆 칸으로 걸어간 움직임 (레버 칸을 떠나거나 들어서면 그쪽으로 밀린다) */
  readonly walk?: -1 | 1;
}

/** 걸어서 레버 칸을 떠나거나 같은 줄 옆 레버 칸에 들어서면 그쪽으로 민 것 (오른쪽이면 켬, 왼쪽이면 끔) */
function walkLevers(level: ParsedLevel, lev: number, from: Cell, m: Move): number {
  if (!m.walk) return lev;
  let out = lev;
  level.levers.forEach((l, k) => {
    const onFrom = l.x === from.x && l.y === from.y;
    const onTo = l.x === m.cell.x && l.y === m.cell.y && m.cell.y === from.y;
    if (onFrom || onTo) out = m.walk === 1 ? out | (1 << k) : out & ~(1 << k);
  });
  return out;
}

/** 움직이는 벽: 발판 + 닫힌 문 + 잠긴 자물쇠 */
function platCells(level: ParsedLevel, active: readonly boolean[], open = 0, gateActive: readonly boolean[] = active): Occ {
  const occ: Occ = new Set();
  level.gate.forEach((g, i) => {
    if (!g) return;
    const on = gateActive[Math.abs(g)] ?? false;
    if (g > 0 ? !on : on) occ.add(i);
  });
  level.locks.forEach((l) => {
    if (!(open & (1 << l.id))) occ.add(at(l.x, l.y));
  });
  for (const d of level.platforms) {
    const on = active[d.group] ?? false;
    const px = d.x + (on ? d.dx : 0);
    const py = d.y + (on ? d.dy : 0);
    for (let y = py; y < py + d.h; y++) for (let x = px; x < px + d.w; x++) occ.add(at(x, y));
  }
  return occ;
}

const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < LEVEL_W && y < LEVEL_H;

/** 이 원소의 몸이 들어갈 수 없는 칸: 벽·웅덩이·젤리·막는 커튼·발판 */
function solid(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): boolean {
  if (!inside(x, y)) return true;
  return wallFor(level, el, x, y) || occ.has(at(x, y));
}

/** 위에서 딛을 수 있는 칸: 단단한 것 + 크림 선반 */
function floor(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): boolean {
  return solid(level, occ, el, x, y) || (inside(x, y) && level.oneway[at(x, y)] === true);
}

function jellyUnder(level: ParsedLevel, occ: Occ, x: number, y: number): boolean {
  if (!inside(x, y + 1)) return false;
  const i = at(x, y + 1);
  return level.jelly[i] === true && !occ.has(i);
}

/** 설 수 있는 칸 (젤리 위는 설 수 없다 — 튕긴다) */
function standable(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): boolean {
  if (solid(level, occ, el, x, y) || !floor(level, occ, el, x, y + 1)) return false;
  const i = at(x, y + 1);
  if (occ.has(i)) return true;
  if (level.jelly[i]) return false;
  return !deadly(el, level.pool[i] ?? null);
}

/** (x, y)에서 곧장 떨어져 닿는 곳: 설 칸, 또는 젤리 위(튈 자리). 죽거나 막히면 null */
function drop(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): { readonly x: number; readonly y: number; readonly jelly: boolean } | null {
  if (solid(level, occ, el, x, y)) return null;
  let yy = y;
  while (yy < LEVEL_H - 1 && !floor(level, occ, el, x, yy + 1)) yy++;
  if (jellyUnder(level, occ, x, yy)) return { x, y: yy, jelly: true };
  return standable(level, occ, el, x, yy) ? { x, y: yy, jelly: false } : null;
}

function clearCol(level: ParsedLevel, occ: Occ, el: Element, x: number, y0: number, y1: number): boolean {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (solid(level, occ, el, x, y)) return false;
  return true;
}

function clearRow(level: ParsedLevel, occ: Occ, el: Element, y: number, x0: number, x1: number): boolean {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (solid(level, occ, el, x, y)) return false;
  return true;
}

const GRAVITY = 34;
const RUN = 6;
/**
 * 처음 속도 v0로 뛰어 h칸 위에 내려앉을 때 옆으로 갈 수 있는 칸 수 (천장이 room칸 위에 있으면 덜 난다).
 * 발이 착지 높이보다 위에 있는 동안(올라가서 떨어질 때까지) 달리는 거리로 셈하고, 표(cap)보다 크게 보지 않는다.
 */
function reachFor(v0: number, h: number, room: number, cap: number): number {
  const full = (v0 * v0) / (2 * GRAVITY);
  const rise = Math.min(full, room + 0.14);
  if (rise < h + 0.02) return -1;
  const tAt = (d: number): number => (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * GRAVITY * d))) / GRAVITY;
  const tTop = rise >= full ? v0 / GRAVITY : tAt(rise);
  const window = tTop - tAt(h + 0.02) + Math.sqrt((2 * Math.max(0, rise - h - 0.02)) / GRAVITY);
  return Math.min(cap, Math.floor(RUN * window + 0.44));
}

/**
 * (x, y)에서 곧장 뛰어올라 h칸 위에서 옆으로 가는 ㄱ자 길로 닿는 곳들.
 * 꼭대기에서 머리가 착지 줄 위 칸까지 올라가므로 그 줄(ty-1)도 길 따라 비어 있어야 하고,
 * 머리 위 천장이 낮으면 덜 높이·덜 멀리 난다.
 */
function upPaths(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number, v0: number, reachUp: readonly number[], each: (tx: number, ty: number) => void): void {
  let room = 0;
  while (room < 8 && !solid(level, occ, el, x, y - 1 - room)) room++;
  for (let h = 1; h < reachUp.length; h++) {
    const ty = y - h;
    if (ty < 1 || !clearCol(level, occ, el, x, y - 1, ty - 1)) break;
    const reach = reachFor(v0, h, room, reachUp[h] as number);
    if (reach < 0) break;
    for (let dx = -reach; dx <= reach; dx++) {
      const tx = x + dx;
      if (tx < 0 || tx >= LEVEL_W || !clearRow(level, occ, el, ty, x, tx) || !clearRow(level, occ, el, ty - 1, x, tx)) continue;
      each(tx, ty);
    }
  }
}

/** 젤리에 튕겨서(약 5.9칸) 닿는 곳들 — 다시 젤리에 떨어지는 길은 보수적으로 뺀다 */
const BOUNCE_REACH = [0, 4, 4, 4, 3, 2];
function bounceFrom(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): Cell[] {
  const out = new Map<number, Cell>();
  upPaths(level, occ, el, x, y, 20, BOUNCE_REACH, (tx, ty) => {
    const d = drop(level, occ, el, tx, ty);
    if (d && !d.jelly) out.set(at(d.x, d.y), { x: d.x, y: d.y });
  });
  return [...out.values()];
}

/** 한 캐릭터가 한 번에 갈 수 있는 곳들 */
export function movesFrom(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): Move[] {
  const out = new Map<number, Move>();
  const add = (c0: Cell, via0?: Cell, kind0?: 'jelly' | 'portal', walk?: -1 | 1): void => {
    let c = c0;
    let via = via0;
    let kind = kind0;
    // 순간이동 구멍에 들어서면 짝 칸으로 (짝 칸이 막혔으면 구멍 칸에 선다). 젤리로 튀어 구멍에 내리는 길은 뺀다
    const dest = level.portal.get(at(c.x, c.y));
    if (dest) {
      if (via) return;
      if (standable(level, occ, el, dest.x, dest.y)) {
        via = c;
        kind = 'portal';
        c = dest;
      }
    }
    if (c.x === x && c.y === y) return;
    const k = at(c.x, c.y);
    // 같은 칸이면 젤리·구멍 없이 가는 길을 더 좋게 본다
    if (out.has(k) && !out.get(k)?.via) return;
    out.set(k, via ? { cell: c, via, viaKind: kind } : walk ? { cell: c, walk } : { cell: c });
  };
  const land = (d: ReturnType<typeof drop>, walk?: -1 | 1): void => {
    if (!d) return;
    if (!d.jelly) {
      add({ x: d.x, y: d.y }, undefined, undefined, walk);
      return;
    }
    for (const c of bounceFrom(level, occ, el, d.x, d.y)) add(c, { x: d.x, y: d.y }, 'jelly');
  };
  // 걷기·걸어서 떨어지기
  for (const dx of [-1, 1]) {
    const nx = x + dx;
    if (!solid(level, occ, el, nx, y)) land(drop(level, occ, el, nx, y), dx as -1 | 1);
  }
  // 위로 점프: 위로 1칸이면 옆 4, 2칸 3, 3칸 2
  upPaths(level, occ, el, x, y, 15.5, [0, 4, 3, 2], (tx, ty) => land(drop(level, occ, el, tx, ty)));
  // 같은 높이로 건너뛰기 (떨어지며 착지 포함) — 머리 위 여유만큼 멀리
  let head = 0;
  while (head < 3 && clearCol(level, occ, el, x, y - 1, y - 1 - head)) head++;
  for (const sgn of [-1, 1]) {
    for (let d = 2; d <= 4; d++) {
      const tx = x + sgn * d;
      if (tx < 0 || tx >= LEVEL_W || !clearRow(level, occ, el, y, x, tx)) break;
      let room = 0;
      while (room < 3 && clearRow(level, occ, el, y - 1 - room, x, tx)) room++;
      const maxD = [1, 2, 3, 4][Math.min(room, head)] as number;
      if (d > maxD) break;
      land(drop(level, occ, el, tx, y));
    }
  }
  return [...out.values()];
}

/** 풀이 모형의 한 상태: 두 캐릭터 칸, 레버 비트, 주운 열쇠 비트, 연 자물쇠 비트 */
export interface SolverState {
  readonly f: Cell;
  readonly i: Cell;
  /** 말차 (둘이서 단계에서는 판 밖 (-1, -1)에 가만히) */
  readonly l: Cell;
  readonly lev: number;
  /** 주운 열쇠 (비트) */
  readonly keys: number;
  /** 연 자물쇠 (비트) */
  readonly open: number;
}

const key = (s: State): string => `${s.f.x},${s.f.y},${s.i.x},${s.i.y},${s.l.x},${s.l.y},${s.lev},${s.keys},${s.open}`;
/** 상태에서 캐릭터 칸 */
const cellIn = (s: State, el: Element): Cell => (el === 'fire' ? s.f : el === 'ice' ? s.i : s.l);
const withCell = (s: State, el: Element, c: Cell): State => (el === 'fire' ? { ...s, f: c } : el === 'ice' ? { ...s, i: c } : { ...s, l: c });
const anyAt = (s: State, x: number, y: number): boolean => (s.f.x === x && s.f.y === y) || (s.i.x === x && s.i.y === y) || (s.l.x === x && s.l.y === y);
const bitCount = (n: number): number => {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
};

function activeOf(level: ParsedLevel, s: State): boolean[] {
  const act = [false, false, false, false, false];
  for (const b of level.buttons) if (anyAt(s, b.x, b.y)) act[b.group] = true;
  level.levers.forEach((l, k) => {
    if (s.lev & (1 << k)) act[l.group] = true;
  });
  return act;
}

/** 선 칸에 열쇠가 있으면 줍는다 (열쇠는 둘이 함께 쓴다) */
function pickKeys(level: ParsedLevel, s: State): State {
  let keys = s.keys;
  for (const k of level.keys) if (anyAt(s, k.x, k.y)) keys |= 1 << k.id;
  return keys === s.keys ? s : { ...s, keys };
}

/** 장치가 바뀐 뒤: 발판에 탄 캐릭터를 옮기고, 발이 뜨면 떨어뜨린다 (죽거나 끼이면 null) */
function settle(level: ParsedLevel, before: State, after: State): State | null {
  const a0 = activeOf(level, before);
  const a1 = activeOf(level, after);
  const occ0 = platCells(level, a0, before.open);
  const occ1 = platCells(level, a1, after.open);
  const carry = (c: Cell): Cell => {
    for (const d of level.platforms) {
      const on0 = a0[d.group] ?? false;
      const on1 = a1[d.group] ?? false;
      if (on0 === on1) continue;
      const px = d.x + (on0 ? d.dx : 0);
      const py = d.y + (on0 ? d.dy : 0);
      if (c.y + 1 === py && c.x >= px && c.x < px + d.w) {
        const sx = on1 ? d.dx : -d.dx;
        const sy = on1 ? d.dy : -d.dy;
        return { x: c.x + sx, y: c.y + sy };
      }
    }
    return c;
  };
  const fix = (c: Cell, el: Element): Cell | null => {
    const moved = occ0.has(at(c.x, c.y + 1)) ? carry(c) : c;
    if (solid(level, occ1, el, moved.x, moved.y)) return null;
    let end: Cell | null = moved;
    if (!standable(level, occ1, el, moved.x, moved.y)) {
      const d = drop(level, occ1, el, moved.x, moved.y);
      end = d && !d.jelly ? { x: d.x, y: d.y } : null;
    }
    // 장치 때문에 떨어져 구멍 칸에 내리는 경우는 보수적으로 뺀다
    if (end && end !== c && (end.x !== c.x || end.y !== c.y) && level.portal.has(at(end.x, end.y))) return null;
    return end;
  };
  const f = fix(after.f, 'fire');
  const i = fix(after.i, 'ice');
  const l = level.players.includes('leaf') ? fix(after.l, 'leaf') : after.l;
  if (!f || !i || !l) return null;
  return pickKeys(level, { f, i, l, lev: after.lev, keys: after.keys, open: after.open });
}

export interface VerifyResult {
  readonly solvable: boolean;
  readonly states: number;
  /** 원소별로 닿을 수 있는 사탕 번호 */
  readonly gemsReachable: readonly number[];
  readonly steps: number;
}

export interface PathState {
  readonly f: Cell;
  readonly i: Cell;
  readonly l: Cell;
  /** 레버 켜짐 (비트) */
  readonly lev: number;
  readonly keys: number;
  readonly open: number;
  /** 이 상태로 오려고 움직인 쪽 (처음 상태는 null) — 발판에 실려 같이 옮겨진 쪽과 구별. unlock은 자물쇠 열기 */
  readonly by: Element | 'lever' | 'unlock' | null;
  /** 움직인 쪽이 간 칸 (발판이 싣고 가기 전) */
  readonly to: Cell | null;
  /** 젤리를 밟고 튀었거나 순간이동 구멍으로 갔다면 그 칸 */
  readonly via: Cell | null;
  readonly viaKind: 'jelly' | 'portal' | null;
}

type Step = { readonly prev: State; readonly by: Element | 'lever' | 'unlock'; readonly to: Cell | null; readonly via: Cell | null; readonly viaKind: 'jelly' | 'portal' | null };

/** 둘 다 문에 닿을 수 있는지 (그리고 사탕을 각자 먹을 수 있는지). path: 가장 짧은 풀이 (시작 → 끝) */
type State = SolverState;

export function verifyLevel(level: ParsedLevel, limit = 400_000, analyze = false): VerifyResult & { readonly path: readonly PathState[]; readonly deadEnds: number; readonly truncated: boolean } {
  return searchFrom(level, { f: level.spawn.fire, i: level.spawn.ice, l: level.spawn.leaf, lev: 0, keys: 0, open: 0 }, limit, analyze);
}

/** 아무 상태에서나 풀어 보기 (게임 중 힌트·막힘 알림) — truncated면 한도에 걸려 끝까지 못 본 것 */
export function searchFrom(level: ParsedLevel, from: SolverState, limit = 400_000, analyze = false): VerifyResult & { readonly path: readonly PathState[]; readonly deadEnds: number; readonly truncated: boolean } {
  // analyze: 되돌릴 수 없이 막힌 상태(어디로 가도 통과 못 함)가 몇 개인지도 센다 — 단계가 얼마나 머리를 쓰게 하는지 가늠
  const rev = analyze ? new Map<string, string[]>() : null;
  const goals: string[] = [];
  const start: State = pickKeys(level, from);
  const seen = new Map<string, number>([[key(start), 0]]);
  const parent = new Map<string, Step | null>([[key(start), null]]);
  const queue: State[] = [start];
  const gems = new Set<number>();
  let solvedAt = -1;
  let goal: State | null = null;
  for (let qi = 0; qi < queue.length && seen.size < limit; qi++) {
    const s = queue[qi] as State;
    const depth = seen.get(key(s)) as number;
    level.gems.forEach((g) => {
      const c = cellIn(s, g.el);
      if (c.x === g.x && c.y === g.y) gems.add(g.id);
    });
    const home = level.players.every((e) => cellIn(s, e).x === level.door[e].x && cellIn(s, e).y === level.door[e].y);
    if (solvedAt < 0 && home) {
      solvedAt = depth;
      goal = s;
    }
    if (rev && home) goals.push(key(s));
    const occ = platCells(level, activeOf(level, s), s.open);
    const next: { readonly n: State; readonly by: Step['by']; readonly to: Cell | null; readonly via: Cell | null; readonly viaKind: Step['viaKind'] }[] = [];
    for (const el of level.players) {
      const c = cellIn(s, el);
      // 움직이는 쪽이 밟고 있던 버튼은 떠나는 순간 풀린다: 그 버튼이 연 문은 곧바로 닫힌다 (발판은 천천히 움직이니 그대로 본다)
      const onButton = level.buttons.some((bt) => bt.x === c.x && bt.y === c.y);
      const occEl = onButton ? platCells(level, activeOf(level, s), s.open, activeOf(level, withCell(s, el, { x: -9, y: -9 }))) : occ;
      for (const m of movesFrom(level, occEl, el, c.x, c.y)) next.push({ n: { ...withCell(s, el, m.cell), lev: walkLevers(level, s.lev, c, m) }, by: el, to: m.cell, via: m.via ?? null, viaKind: m.viaKind ?? null });
    }
    level.levers.forEach((l, k) => {
      if (anyAt(s, l.x, l.y)) next.push({ n: { ...s, lev: s.lev ^ (1 << k) }, by: 'lever', to: null, via: null, viaKind: null });
    });
    // 자물쇠: 남은 열쇠가 있고 바로 옆(같은 줄)에 서 있으면 연다
    if (bitCount(s.keys) > bitCount(s.open))
      for (const lk of level.locks) {
        if (s.open & (1 << lk.id)) continue;
        const near = (c: Cell): boolean => c.y === lk.y && Math.abs(c.x - lk.x) === 1;
        if (near(s.f) || near(s.i) || near(s.l)) next.push({ n: { ...s, open: s.open | (1 << lk.id) }, by: 'unlock', to: null, via: null, viaKind: null });
      }
    for (const { n, by, to, via, viaKind } of next) {
      const st = settle(level, s, n);
      if (!st) continue;
      const k = key(st);
      if (rev) {
        const from = rev.get(k);
        if (from) from.push(key(s));
        else rev.set(k, [key(s)]);
      }
      if (seen.has(k)) continue;
      seen.set(k, depth + 1);
      parent.set(k, { prev: s, by, to, via, viaKind });
      queue.push(st);
    }
  }
  const path: PathState[] = [];
  for (let c: State | null = goal; c; ) {
    const p = parent.get(key(c)) ?? null;
    path.unshift({ ...c, by: p?.by ?? null, to: p?.to ?? null, via: p?.via ?? null, viaKind: p?.viaKind ?? null });
    c = p?.prev ?? null;
  }
  let deadEnds = 0;
  if (rev) {
    const good = new Set(goals);
    const stack = [...goals];
    while (stack.length) for (const p of rev.get(stack.pop() as string) ?? []) if (!good.has(p)) good.add(p), stack.push(p);
    deadEnds = seen.size - good.size;
  }
  return { solvable: solvedAt >= 0, states: seen.size, gemsReachable: [...gems].sort((a, b) => a - b), steps: solvedAt, path, deadEnds, truncated: solvedAt < 0 && seen.size >= limit };
}
