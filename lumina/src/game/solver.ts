/**
 * 솔버 — "테이블의 모든 타일(필수) + 랙에서 고른 타일(선택)"을 합법 세트들로 나누는 최선의 방법을 찾는다.
 *
 * 숫자 1→13을 차례로 훑는 동적계획법. 상태는
 *   · 색마다 지금 숫자까지 이어져 온 "열린 런"의 개수를 길이별(1장, 2장, 3장 이상)로
 *   · 지금까지 쓴 조커 수
 *   · (한 숫자 안에서) 그룹으로 보낸 타일 수 집계
 * 만 기억한다. 같은 색·같은 길이 부류의 런은 서로 바꿔도 합법성이 같으므로 이것으로 충분하다.
 * 106장 전부가 테이블에 있어도 수십 ms 안에 끝나도록 상태 수를 억제했다.
 *
 * 결과 배치는 커널의 analyzeSet으로 다시 검증하고, 커밋 전에 엔진의 checkCommit이 한 번 더 막는다.
 */
import { COLORS, type TileId } from './types';
import { analyzeSet } from './sets';
import { isJoker, tile } from './tiles';

export interface Weights {
  /** 랙 타일 한 장당 */
  readonly tile: number;
  /** 랙 타일 숫자 1점당 */
  readonly value: number;
  /** 랙 조커 한 장을 쓸 때 (음수면 아끼는 성향) */
  readonly joker: number;
  /** 조커가 나타내는 숫자 1점당 (첫 등록 점수 계산용) */
  readonly jokerValue: number;
}

export const MAX_TILES: Weights = { tile: 1000, value: 1, joker: 1000, jokerValue: 0 };
export const MAX_VALUE_W: Weights = { tile: 0, value: 1, joker: 0, jokerValue: 1 };

export interface SolveInput {
  readonly table: readonly TileId[];
  readonly rack: readonly TileId[];
  readonly weights?: Weights;
  /** 랙 조커를 쓸 수 있는가 */
  readonly rackJokers?: boolean;
}

export interface Solution {
  readonly sets: TileId[][];
  readonly played: TileId[];
  readonly score: number;
}

const NC = 4;
const NV = 13;

interface Tally {
  table: TileId[][][];
  rack: TileId[][][];
  tJ: TileId[];
  rJ: TileId[];
}

function tally(table: readonly TileId[], rack: readonly TileId[]): Tally {
  const mk = (): TileId[][][] => Array.from({ length: NC }, () => Array.from({ length: NV + 1 }, () => [] as TileId[]));
  const out: Tally = { table: mk(), rack: mk(), tJ: [], rJ: [] };
  const put = (id: TileId, into: TileId[][][], jokers: TileId[]): void => {
    const t = tile(id);
    if (t.kind === 'joker') jokers.push(id);
    else (into[COLORS.indexOf(t.color)] as TileId[][])[t.value]?.push(id);
  };
  for (const id of table) put(id, out.table, out.tJ);
  for (const id of rack) put(id, out.rack, out.rJ);
  return out;
}

// ── 그룹 구성법 미리 계산: 2장씩 낸 색 g2개, 1장씩 낸 색 g1개, 조커 jg장으로 3~4장 그룹들을 만들 수 있는가 ──
interface GroupPlan {
  readonly a: readonly number[]; // 2장 낸 색 목록의 인덱스
  readonly b: readonly number[]; // 1장 낸 색 목록의 인덱스
  readonly j: number;
}
type Recipe = readonly GroupPlan[];

function findRecipe(g1: number, g2: number, jg: number): Recipe | null {
  if (g1 === 0 && g2 === 0) return jg === 0 ? [] : null;
  for (let k = g2 > 0 ? 2 : 1; k <= 3; k++) {
    const pairs: [number, number][] = [];
    for (let x = 0; x < k; x++) for (let y = x + 1; y < k; y++) pairs.push([x, y]);
    const aAssign: number[] = [];
    const bAssign: number[] = [];
    const jAssign: number[] = [];
    let found: Recipe | null = null;
    const check = (): void => {
      const groups = Array.from({ length: k }, () => ({ a: [] as number[], b: [] as number[], j: 0 }));
      aAssign.forEach((pi, ai) => {
        const [x, y] = pairs[pi] as [number, number];
        groups[x]?.a.push(ai);
        groups[y]?.a.push(ai);
      });
      bAssign.forEach((g, bi) => groups[g]?.b.push(bi));
      jAssign.forEach((g) => {
        const gr = groups[g];
        if (gr) gr.j++;
      });
      if (groups.every((g) => g.a.length + g.b.length + g.j >= 3 && g.a.length + g.b.length + g.j <= 4 && g.a.length + g.b.length >= 1)) {
        found = groups;
      }
    };
    const recJ = (i: number, min: number): void => {
      if (found) return;
      if (i === jg) return check();
      for (let g = min; g < k; g++) {
        jAssign.push(g);
        recJ(i + 1, g);
        jAssign.pop();
      }
    };
    const recB = (i: number): void => {
      if (found) return;
      if (i === g1) return recJ(0, 0);
      for (let g = 0; g < k; g++) {
        bAssign.push(g);
        recB(i + 1);
        bAssign.pop();
      }
    };
    const recA = (i: number): void => {
      if (found) return;
      if (i === g2) return recB(0);
      for (let p = 0; p < pairs.length; p++) {
        aAssign.push(p);
        recA(i + 1);
        aAssign.pop();
      }
    };
    recA(0);
    if (found) return found;
  }
  return null;
}

const RECIPES: (Recipe | null)[][][] = Array.from({ length: 5 }, (_, g1) =>
  Array.from({ length: 5 }, (_, g2) => Array.from({ length: 3 }, (_, jg) => (g1 + g2 <= 4 ? findRecipe(g1, g2, jg) : null))),
);

// ── 상태 인코딩 ──
// 색 하나의 열린 런 = n1 + 5*n2 + 25*n3 (각 0..4) → 0..124
// 전체 키 = c0 + 125*(c1 + 125*(c2 + 125*(c3 + 125*(j + 3*(g1 + 5*g2)))))
const B = 125;
const B2 = B * B;
const B3 = B2 * B;
const B4 = B3 * B;

interface Node {
  readonly key: number;
  readonly s: number;
  readonly p: Node | null;
  readonly d: number;
}

function relax(map: Map<number, Node>, key: number, s: number, p: Node, d: number): void {
  const cur = map.get(key);
  if (!cur || cur.s < s) map.set(key, { key, s, p, d });
}

const POW = [1, B, B2, B3] as const;

function colorPart(key: number, c: number): number {
  return Math.floor(key / POW[c as 0]) % B;
}

function tailOf(key: number): { j: number; g1: number; g2: number } {
  const t = Math.floor(key / B4);
  return { j: t % 3, g1: Math.floor(t / 3) % 5, g2: Math.floor(t / 15) % 5 };
}

function withTail(key: number, j: number, g1: number, g2: number): number {
  return (key % B4) + B4 * (j + 3 * (g1 + 5 * g2));
}

/**
 * 가장 점수가 높은 배치를 찾는다. 테이블 타일만으로도 배치가 불가능하면 null.
 * (현재 테이블이 합법이면 랙 타일 0장인 배치가 항상 존재하므로 null은 버그 신호다)
 */
export function solve(input: SolveInput): Solution | null {
  const w = input.weights ?? MAX_TILES;
  const cnt = tally(input.table, input.rack);
  const JT = cnt.tJ.length;
  const JR = input.rackJokers === false ? 0 : cnt.rJ.length;
  const JMAX = Math.min(2, JT + JR);

  let layer = new Map<number, Node>();
  const root: Node = { key: 0, s: 0, p: null, d: 0 };
  layer.set(0, root);

  for (let v = 1; v <= NV; v++) {
    for (let c = 0; c < NC; c++) {
      const T = (cnt.table[c] as TileId[][])[v]!.length;
      const R = (cnt.rack[c] as TileId[][])[v]!.length;
      const rackGain = w.tile + w.value * v;
      // 다음 두 숫자에 이 색 타일이 몇 장 있는가 (짧은 런을 이어 줄 수 있는지 미리 본다)
      const avail = (x: number): number =>
        x <= NV ? (cnt.table[c] as TileId[][])[x]!.length + (cnt.rack[c] as TileId[][])[x]!.length : 0;
      const future1 = avail(v + 1);
      const future2 = avail(v + 2);
      const next = new Map<number, Node>();
      const pc = POW[c as 0];
      for (const node of layer.values()) {
        const key = node.key;
        const cs = Math.floor(key / pc) % B;
        const n1 = cs % 5;
        const n2 = Math.floor(cs / 5) % 5;
        const n3 = Math.floor(cs / 25);
        const tail = Math.floor(key / B4);
        const j = tail % 3;
        const g1 = Math.floor(tail / 3) % 5;
        const g2 = Math.floor(tail / 15) % 5;
        const base = (key % B4) - cs * pc; // 이 색 자리를 비운 키
        const jAvail = JMAX - j;
        const mustCont = n1 + n2;
        for (let u = 0; u <= R; u++) {
          const real = T + u;
          for (let g = 0; g <= Math.min(2, real); g++) {
            const toRuns = real - g;
            for (let k3 = 0; k3 <= n3; k3++) {
              const cont = mustCont + k3;
              const sMin = Math.max(0, toRuns - cont);
              const sMax = Math.min(4 - cont, toRuns + jAvail - cont);
              for (let s = sMin; s <= sMax; s++) {
                const jr = cont + s - toRuns;
                if (jr < 0 || jr > jAvail) continue;
                if (s > 0 && v >= NV - 1) continue; // 12·13에서 시작한 런은 3장이 못 된다
                // 1·2장짜리 런은 다음 숫자들에서 반드시 이어져야 한다 — 실물+남은 조커로 모자라면 버린다
                if (s + n1 > 0) {
                  const need = Math.max(0, s + n1 - future1) + Math.max(0, s - future2);
                  if (need > jAvail - jr) continue;
                }
                const nc = s + 5 * n1 + 25 * (n2 + k3);
                const nk = base + nc * pc + B4 * (j + jr + 3 * (g1 + (g === 1 ? 1 : 0) + 5 * (g2 + (g === 2 ? 1 : 0))));
                const gain = u * rackGain + jr * w.jokerValue * v;
                relax(next, nk, node.s + gain, node, u + 3 * (g + 3 * (k3 + 5 * (s + 5 * jr))));
              }
            }
          }
        }
      }
      layer = next;
      if (!layer.size) return null;
    }
    // 그룹 단계
    const next = new Map<number, Node>();
    for (const node of layer.values()) {
      const { j, g1, g2 } = tailOf(node.key);
      if (g1 + g2 > 4) continue;
      for (let jg = 0; jg <= JMAX - j; jg++) {
        const rec = RECIPES[g1]?.[g2]?.[jg];
        if (rec === null || rec === undefined) continue;
        const nk = withTail(node.key, j + jg, 0, 0);
        relax(next, nk, node.s + jg * w.jokerValue * v, node, jg);
      }
    }
    layer = next;
    if (!layer.size) return null;
  }

  // 끝: 모든 런이 3장 이상이어야 하고, 테이블 조커는 전부 쓰여야 한다
  let best: Node | null = null;
  let bestScore = -Infinity;
  for (const node of layer.values()) {
    let okRuns = true;
    for (let c = 0; c < NC; c++) {
      const cs = colorPart(node.key, c);
      if (cs % 5 !== 0 || Math.floor(cs / 5) % 5 !== 0) okRuns = false;
    }
    if (!okRuns) continue;
    const { j } = tailOf(node.key);
    if (j < JT) continue;
    const score = node.s + w.joker * Math.max(0, j - JT);
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  if (!best) return null;
  const sol = rebuild(best, cnt);
  if (!sol) return null;
  return { ...sol, score: bestScore };
}

function rebuild(end: Node, cnt: Tally): { sets: TileId[][]; played: TileId[] } | null {
  const ds: number[] = [];
  for (let n: Node | null = end; n && n.p; n = n.p) ds.push(n.d);
  ds.reverse();
  if (ds.length !== NV * (NC + 1)) return null;
  const tjQ = cnt.tJ.slice();
  const rjQ = cnt.rJ.slice();
  const playedJ: TileId[] = [];
  const takeJoker = (): TileId => {
    if (tjQ.length) return tjQ.shift() as TileId;
    const id = rjQ.shift() as TileId;
    playedJ.push(id);
    return id;
  };
  type Run = { tiles: TileId[] };
  const open: Run[][] = [[], [], [], []];
  const done: TileId[][] = [];
  const played: TileId[] = [];
  let di = 0;
  for (let v = 1; v <= NV; v++) {
    const gTiles: TileId[][] = [[], [], [], []];
    for (let c = 0; c < NC; c++) {
      let d = ds[di++] as number;
      const u = d % 3;
      d = Math.floor(d / 3);
      const g = d % 3;
      d = Math.floor(d / 3);
      const k3 = d % 5;
      d = Math.floor(d / 5);
      const s = d % 5;
      const tIds = (cnt.table[c] as TileId[][])[v] as TileId[];
      const rIds = ((cnt.rack[c] as TileId[][])[v] as TileId[]).slice(0, u);
      played.push(...rIds);
      const real = [...tIds, ...rIds];
      gTiles[c] = real.slice(0, g);
      const toRun = real.slice(g);
      const runs = open[c] as Run[];
      const short = runs.filter((r) => r.tiles.length < 3);
      const long = runs.filter((r) => r.tiles.length >= 3);
      const cont = [...short, ...long.slice(0, k3)];
      for (const r of long.slice(k3)) done.push(r.tiles);
      const slots: Run[] = [...cont, ...Array.from({ length: s }, () => ({ tiles: [] as TileId[] }))];
      let ri = 0;
      for (const slot of slots) slot.tiles.push(ri < toRun.length ? (toRun[ri++] as TileId) : takeJoker());
      open[c] = slots;
    }
    const jg = ds[di++] as number;
    const A: number[] = [];
    const Bc: number[] = [];
    for (let c = 0; c < NC; c++) {
      if ((gTiles[c] as TileId[]).length === 2) A.push(c);
      else if ((gTiles[c] as TileId[]).length === 1) Bc.push(c);
    }
    const rec = RECIPES[Bc.length]?.[A.length]?.[jg];
    if (!rec) return null;
    const usedA = new Map<number, number>();
    for (const plan of rec) {
      const grp: TileId[] = [];
      for (const ai of plan.a) {
        const c = A[ai] as number;
        const k = usedA.get(c) ?? 0;
        usedA.set(c, k + 1);
        grp.push((gTiles[c] as TileId[])[k] as TileId);
      }
      for (const bi of plan.b) grp.push((gTiles[Bc[bi] as number] as TileId[])[0] as TileId);
      for (let x = 0; x < plan.j; x++) grp.push(takeJoker());
      done.push(grp);
    }
  }
  for (const runs of open) for (const r of runs) done.push(r.tiles);
  const sets = done.map((s) => {
    const a = analyzeSet(s);
    return a.ok ? a.order.slice() : s;
  });
  if (!sets.every((s) => analyzeSet(s).ok)) return null;
  return { sets, played: [...played, ...playedJ] };
}

/**
 * 같은 그림의 타일(두 사본, 두 조커)을 세트 사이에서 맞바꿔, 원래 테이블 배치와 최대한 겹치게 한다.
 * 합법성은 그대로 (같은 그림끼리 교환) — 화면에서 타일이 덜 움직이게 하려는 것.
 */
export function stabilize(sets: TileId[][], original: readonly (readonly TileId[])[]): TileId[][] {
  const origOf = new Map<TileId, number>();
  original.forEach((s, i) => s.forEach((t) => origOf.set(t, i)));
  const out = sets.map((s) => s.slice());
  const where = (): Map<TileId, number> => {
    const m = new Map<TileId, number>();
    out.forEach((s, i) => s.forEach((t) => m.set(t, i)));
    return m;
  };
  const dominant = (si: number): number => {
    const counts = new Map<number, number>();
    for (const t of out[si] as TileId[]) {
      const o = origOf.get(t);
      if (o !== undefined) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    let best = -1;
    let bc = 0;
    counts.forEach((n, o) => {
      if (n > bc) {
        bc = n;
        best = o;
      }
    });
    return best;
  };
  const faceKey = (id: TileId): string => {
    const t = tile(id);
    return t.kind === 'joker' ? 'J' : `${t.color}${t.value}`;
  };
  for (let pass = 0; pass < 2; pass++) {
    const pos = where();
    const byFace = new Map<string, TileId[]>();
    for (const id of pos.keys()) {
      const k = faceKey(id);
      byFace.set(k, [...(byFace.get(k) ?? []), id]);
    }
    for (const ids of byFace.values()) {
      if (ids.length !== 2) continue;
      const [a, b] = ids as [TileId, TileId];
      const sa = pos.get(a) as number;
      const sb = pos.get(b) as number;
      if (sa === sb) continue;
      const da = dominant(sa);
      const db = dominant(sb);
      const now = (origOf.get(a) === da ? 1 : 0) + (origOf.get(b) === db ? 1 : 0);
      const swapped = (origOf.get(b) === da ? 1 : 0) + (origOf.get(a) === db ? 1 : 0);
      if (swapped > now) {
        const A = out[sa] as TileId[];
        const Bs = out[sb] as TileId[];
        A[A.indexOf(a)] = b;
        Bs[Bs.indexOf(b)] = a;
        pos.set(a, sb);
        pos.set(b, sa);
      }
    }
  }
  return out.map((s) => {
    const a = analyzeSet(s);
    return a.ok ? a.order.slice() : s;
  });
}

/** 랙 타일로만 만들 수 있는 최선의 세트들 (첫 등록·초보 AI용) */
export function solveRack(rack: readonly TileId[], weights: Weights = MAX_TILES, rackJokers = true): Solution | null {
  return solve({ table: [], rack, weights, rackJokers });
}

/** 세트들의 점수 합 (조커는 나타내는 값) */
export function setsPoints(sets: readonly (readonly TileId[])[]): number {
  return sets.reduce((s, x) => s + analyzeSet(x).points, 0);
}

/** 조커 제외 랙 타일 수 */
export function countNonJokers(ids: readonly TileId[]): number {
  return ids.filter((t) => !isJoker(t)).length;
}
