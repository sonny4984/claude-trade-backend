/**
 * 단계 검사기 — "칸 모형"으로 두 캐릭터가 함께 문까지 갈 수 있는지 전부 찾아본다 (테스트용).
 *
 * 칸 모형은 실제 물리보다 보수적이다:
 *  · 설 수 있는 칸 = 빈칸 + 바로 아래가 블록·안전한 웅덩이·발판
 *  · 걷기(한 칸) · 떨어지기(곧장 아래) · 점프: 위로 3칸이면 옆으로 2칸까지, 2칸이면 3칸, 1칸이면 4칸,
 *    같은 높이·아래로는 머리 위 여유에 따라 2~4칸 (실제 점프는 약 3.5칸 높이, 5칸 가까이 난다)
 *  · 점프 길: 제자리에서 곧장 올라가 착지 높이에서 옆으로 가는 ㄱ자 길이 비어 있어야 한다
 *    (몸이 꼭대기에서 착지 줄 위 칸까지 들어가므로 그 윗줄도 함께 비어 있어야 함)
 *  · 버튼은 누가 그 칸에 서 있는 동안 켜짐, 레버는 그 칸에 서서 켜고 끔. 발판은 켜지면 옮겨 간 자리에 있다고 본다
 *  · 발판이 움직이면 위에 선 캐릭터도 같이 옮기고, 발 밑이 비면 떨어진다. 발판에 끼이는 상태는 버린다
 * 칸 모형에서 풀리면 실제 게임에서도 풀린다(물리가 더 너그러우므로).
 */
import { LEVEL_H, LEVEL_W, at, deadly, type Cell, type Element, type ParsedLevel } from './level';

type Occ = Set<number>;

function platCells(level: ParsedLevel, active: readonly boolean[]): Occ {
  const occ: Occ = new Set();
  for (const d of level.platforms) {
    const on = active[d.group] ?? false;
    const px = d.x + (on ? d.dx : 0);
    const py = d.y + (on ? d.dy : 0);
    for (let y = py; y < py + d.h; y++) for (let x = px; x < px + d.w; x++) occ.add(at(x, y));
  }
  return occ;
}

function solid(level: ParsedLevel, occ: Occ, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H) return true;
  return (level.solid[at(x, y)] as boolean) || occ.has(at(x, y));
}

function standable(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): boolean {
  if (solid(level, occ, x, y) || !solid(level, occ, x, y + 1)) return false;
  if (occ.has(at(x, y + 1))) return true;
  return !deadly(el, level.pool[at(x, y + 1)] ?? null);
}

/** (x, y)에서 곧장 떨어져 닿는 칸 (죽으면 null) */
function fall(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): Cell | null {
  let yy = y;
  while (yy < LEVEL_H - 1 && !solid(level, occ, x, yy + 1)) yy++;
  if (solid(level, occ, x, yy)) return null;
  return standable(level, occ, el, x, yy) ? { x, y: yy } : null;
}

function clearCol(level: ParsedLevel, occ: Occ, x: number, y0: number, y1: number): boolean {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (solid(level, occ, x, y)) return false;
  return true;
}

function clearRow(level: ParsedLevel, occ: Occ, y: number, x0: number, x1: number): boolean {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (solid(level, occ, x, y)) return false;
  return true;
}

/** 한 캐릭터가 한 번에 갈 수 있는 칸들 */
export function movesFrom(level: ParsedLevel, occ: Occ, el: Element, x: number, y: number): Cell[] {
  const out = new Map<number, Cell>();
  const add = (c: Cell | null): void => {
    if (c && !(c.x === x && c.y === y)) out.set(at(c.x, c.y), c);
  };
  // 걷기·걸어서 떨어지기
  for (const dx of [-1, 1]) {
    const nx = x + dx;
    if (!solid(level, occ, nx, y)) add(fall(level, occ, el, nx, y));
  }
  // 위로 점프 — 꼭대기에서 머리가 착지 줄 위 칸까지 올라가므로 그 줄(ty-1)도 길 따라 비어 있어야 한다
  const reachUp = [0, 4, 3, 2];
  for (let h = 1; h <= 3; h++) {
    const ty = y - h;
    if (ty < 1 || !clearCol(level, occ, x, y - 1, ty - 1)) break;
    const reach = reachUp[h] as number;
    for (let dx = -reach; dx <= reach; dx++) {
      const tx = x + dx;
      if (tx < 0 || tx >= LEVEL_W || !clearRow(level, occ, ty, x, tx) || !clearRow(level, occ, ty - 1, x, tx)) continue;
      add(standable(level, occ, el, tx, ty) ? { x: tx, y: ty } : fall(level, occ, el, tx, ty));
    }
  }
  // 같은 높이로 건너뛰기 (떨어지며 착지 포함) — 머리 위 여유만큼 멀리
  let head = 0;
  while (head < 3 && clearCol(level, occ, x, y - 1, y - 1 - head)) head++;
  for (const sgn of [-1, 1]) {
    for (let d = 2; d <= 4; d++) {
      const tx = x + sgn * d;
      if (tx < 0 || tx >= LEVEL_W || !clearRow(level, occ, y, x, tx)) break;
      let room = 0;
      while (room < 3 && clearRow(level, occ, y - 1 - room, x, tx)) room++;
      const maxD = [1, 2, 3, 4][Math.min(room, head)] as number;
      if (d > maxD) break;
      add(fall(level, occ, el, tx, y));
    }
  }
  return [...out.values()];
}

interface State {
  readonly f: Cell;
  readonly i: Cell;
  readonly lev: number;
}

const key = (s: State): string => `${s.f.x},${s.f.y},${s.i.x},${s.i.y},${s.lev}`;

function activeOf(level: ParsedLevel, s: State): boolean[] {
  const act = [false, false, false, false, false];
  for (const b of level.buttons) if ((s.f.x === b.x && s.f.y === b.y) || (s.i.x === b.x && s.i.y === b.y)) act[b.group] = true;
  level.levers.forEach((l, k) => {
    if (s.lev & (1 << k)) act[l.group] = true;
  });
  return act;
}

/** 장치가 바뀐 뒤: 발판에 탄 캐릭터를 옮기고, 발이 뜨면 떨어뜨린다 (죽거나 끼이면 null) */
function settle(level: ParsedLevel, before: State, after: State): State | null {
  const a0 = activeOf(level, before);
  const a1 = activeOf(level, after);
  const occ0 = platCells(level, a0);
  const occ1 = platCells(level, a1);
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
    if (solid(level, occ1, moved.x, moved.y)) return null;
    if (standable(level, occ1, el, moved.x, moved.y)) return moved;
    return fall(level, occ1, el, moved.x, moved.y);
  };
  const f = fix(after.f, 'fire');
  const i = fix(after.i, 'ice');
  if (!f || !i) return null;
  return { f, i, lev: after.lev };
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
  /** 레버 켜짐 (비트) */
  readonly lev: number;
  /** 이 상태로 오려고 움직인 쪽 (처음 상태는 null) — 발판에 실려 같이 옮겨진 쪽과 구별 */
  readonly by: Element | 'lever' | null;
  /** 움직인 쪽이 간 칸 (발판이 싣고 가기 전) */
  readonly to: Cell | null;
}

/** 둘 다 문에 닿을 수 있는지 (그리고 사탕을 각자 먹을 수 있는지). path: 가장 짧은 풀이 (시작 → 끝) */
export function verifyLevel(level: ParsedLevel, limit = 400_000): VerifyResult & { readonly path: readonly PathState[] } {
  const start: State = { f: level.spawn.fire, i: level.spawn.ice, lev: 0 };
  const seen = new Map<string, number>([[key(start), 0]]);
  const parent = new Map<string, { readonly prev: State; readonly by: Element | 'lever'; readonly to: Cell | null } | null>([[key(start), null]]);
  const queue: State[] = [start];
  const gems = new Set<number>();
  let solvedAt = -1;
  let goal: State | null = null;
  for (let qi = 0; qi < queue.length && seen.size < limit; qi++) {
    const s = queue[qi] as State;
    const depth = seen.get(key(s)) as number;
    level.gems.forEach((g) => {
      const c = g.el === 'fire' ? s.f : s.i;
      if (c.x === g.x && c.y === g.y) gems.add(g.id);
    });
    if (solvedAt < 0 && s.f.x === level.door.fire.x && s.f.y === level.door.fire.y && s.i.x === level.door.ice.x && s.i.y === level.door.ice.y) {
      solvedAt = depth;
      goal = s;
    }
    const occ = platCells(level, activeOf(level, s));
    const next: { readonly n: State; readonly by: Element | 'lever'; readonly to: Cell | null }[] = [];
    for (const c of movesFrom(level, occ, 'fire', s.f.x, s.f.y)) next.push({ n: { ...s, f: c }, by: 'fire', to: c });
    for (const c of movesFrom(level, occ, 'ice', s.i.x, s.i.y)) next.push({ n: { ...s, i: c }, by: 'ice', to: c });
    level.levers.forEach((l, k) => {
      if ((s.f.x === l.x && s.f.y === l.y) || (s.i.x === l.x && s.i.y === l.y)) next.push({ n: { ...s, lev: s.lev ^ (1 << k) }, by: 'lever', to: null });
    });
    for (const { n, by, to } of next) {
      const st = settle(level, s, n);
      if (!st) continue;
      const k = key(st);
      if (seen.has(k)) continue;
      seen.set(k, depth + 1);
      parent.set(k, { prev: s, by, to });
      queue.push(st);
    }
  }
  const path: PathState[] = [];
  for (let c: State | null = goal; c; ) {
    const p = parent.get(key(c)) ?? null;
    path.unshift({ ...c, by: p?.by ?? null, to: p?.to ?? null });
    c = p?.prev ?? null;
  }
  return { solvable: solvedAt >= 0, states: seen.size, gemsReachable: [...gems].sort((a, b) => a - b), steps: solvedAt, path };
}
