/**
 * 추리기 — "이 숨은 타일이 무엇일 확률"을 계산한다. AI와 힌트가 같이 쓴다.
 *
 * 보는 사람(viewer)이 아는 것만 쓴다:
 *  · 모든 공개된 타일, 자기 줄의 타일, 자기가 뽑은 타일 (viewer < 0 이면 공개 정보만)
 *  · 각 타일의 색(뒷면), 줄 안의 위치, 그 타일에 틀렸던 추리 값
 * 한 줄 안에서 "숫자는 왼쪽부터 커진다(같은 수면 검정 먼저), 조커는 어디든"을 만족하는
 * 모든 배치를 동적 계획법으로 세고(앞·뒤 방향), 자리마다 각 타일이 나오는 배치 수의 비율을 확률로 삼는다.
 * 줄 사이의 중복은 "확실한 타일은 다른 줄에서 뺀다"를 두 번 반복해 반영한다.
 */
import {
  BLACK_JOKER,
  WHITE_JOKER,
  codaColor,
  codaKey,
  codaTiles,
  guessOf,
  type CodaGuess,
  type CodaSlot,
  type CodaState,
  type CodaTileId,
} from './engine';

/** 한 자리의 확률 분포 (숨은 자리만. 공개됐거나 보는 사람 자신의 타일이면 null) */
export type SlotBelief = ReadonlyMap<CodaTileId, number> | null;

/** 보는 사람이 위치를 아는 타일들 */
export function knownTiles(s: CodaState, viewer: number): Set<CodaTileId> {
  const known = new Set<CodaTileId>();
  s.players.forEach((p, i) =>
    p.row.forEach((x) => {
      if (x.revealed || i === viewer) known.add(x.tile);
    }),
  );
  if (viewer >= 0 && viewer === s.current && s.drawn !== null) known.add(s.drawn);
  return known;
}

// 상태: 마지막 숫자 키(-1..23) × 검정 조커 사용 × 하양 조커 사용
const KEYS = 25;
const STATES = KEYS * 4;
const START = 0; // last = -1, 조커 둘 다 안 씀

function step(state: number, tile: CodaTileId): number {
  const last = Math.floor(state / 4) - 1;
  const jb = state & 2;
  const jw = state & 1;
  if (tile === BLACK_JOKER) return jb ? -1 : state | 2;
  if (tile === WHITE_JOKER) return jw ? -1 : state | 1;
  const k = codaKey(tile) as number;
  if (k <= last) return -1;
  return (k + 1) * 4 + jb + jw;
}

function candidatesFor(slot: CodaSlot, unknown: ReadonlySet<CodaTileId>, exclude: ReadonlySet<CodaTileId>): CodaTileId[] {
  const color = codaColor(slot.tile);
  const out: CodaTileId[] = [];
  for (const t of unknown) {
    if (codaColor(t) !== color || exclude.has(t)) continue;
    if (slot.misses.includes(guessOf(t))) continue;
    out.push(t);
  }
  return out;
}

/**
 * 한 사람 줄의 자리별 확률. hiddenFor가 true인 자리만 추리 대상이고 나머지는 알려진 타일로 고정한다.
 */
function rowBeliefs(row: readonly CodaSlot[], isHidden: (i: number) => boolean, unknown: ReadonlySet<CodaTileId>, exclude: ReadonlySet<CodaTileId>): SlotBelief[] {
  const n = row.length;
  const cands: CodaTileId[][] = row.map((slot, i) => (isHidden(i) ? candidatesFor(slot, unknown, exclude) : [slot.tile]));
  // 앞쪽: f[i][st] = 0..i-1 자리를 채워 상태 st에 이르는 배치 수
  const f: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(STATES));
  (f[0] as Float64Array)[START] = 1;
  for (let i = 0; i < n; i++) {
    const cur = f[i] as Float64Array;
    const nxt = f[i + 1] as Float64Array;
    for (let st = 0; st < STATES; st++) {
      const w = cur[st] as number;
      if (!w) continue;
      for (const t of cands[i] as CodaTileId[]) {
        const ns = step(st, t);
        if (ns >= 0) nxt[ns] = (nxt[ns] as number) + w;
      }
    }
  }
  // 뒤쪽: g[i][st] = 상태 st에서 i..n-1 자리를 채우는 배치 수
  const g: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(STATES));
  (g[n] as Float64Array).fill(1);
  for (let i = n - 1; i >= 0; i--) {
    const cur = g[i] as Float64Array;
    const nxt = g[i + 1] as Float64Array;
    for (let st = 0; st < STATES; st++) {
      let sum = 0;
      for (const t of cands[i] as CodaTileId[]) {
        const ns = step(st, t);
        if (ns >= 0) sum += nxt[ns] as number;
      }
      cur[st] = sum;
    }
  }
  const total = (g[0] as Float64Array)[START] as number;
  return row.map((_, i) => {
    if (!isHidden(i)) return null;
    const probs = new Map<CodaTileId, number>();
    const list = cands[i] as CodaTileId[];
    if (total <= 0) {
      // 정보가 서로 어긋나면(다른 줄에서 빼낸 게 틀렸을 때 등) 후보를 고르게 본다
      for (const t of list) probs.set(t, 1 / Math.max(1, list.length));
      return probs;
    }
    const fi = f[i] as Float64Array;
    const gn = g[i + 1] as Float64Array;
    for (const t of list) {
      let sum = 0;
      for (let st = 0; st < STATES; st++) {
        const w = fi[st] as number;
        if (!w) continue;
        const ns = step(st, t);
        if (ns >= 0) sum += w * (gn[ns] as number);
      }
      if (sum > 0) probs.set(t, sum / total);
    }
    return probs;
  });
}

export interface Beliefs {
  /** beliefs[p][i] — p번 사람 줄 i번째 자리의 분포 */
  readonly byPlayer: readonly (readonly SlotBelief[])[];
  readonly unknown: ReadonlySet<CodaTileId>;
}

/**
 * 보는 사람 입장에서 모든 줄의 확률. viewer < 0 이면 공개 정보만으로(모든 숨은 타일이 대상).
 * crossRow: 다른 줄에서 확실해진 타일을 빼고 다시 계산 (더 정확, 조금 더 느림)
 */
export function beliefs(s: CodaState, viewer: number, crossRow = true): Beliefs {
  const known = knownTiles(s, viewer);
  const unknown = new Set(codaTiles(s.jokers).filter((t) => !known.has(t)));
  const hiddenFor = (p: number) => (i: number) => {
    const slot = s.players[p]?.row[i];
    return !!slot && !slot.revealed && p !== viewer;
  };
  let certainElsewhere: Map<CodaTileId, number> = new Map();
  let result: SlotBelief[][] = [];
  const rounds = crossRow ? 3 : 1;
  for (let round = 0; round < rounds; round++) {
    result = s.players.map((p, pi) => {
      const exclude = new Set<CodaTileId>();
      certainElsewhere.forEach((owner, t) => {
        if (owner !== pi) exclude.add(t);
      });
      return rowBeliefs(p.row, hiddenFor(pi), unknown, exclude);
    });
    if (!crossRow) break;
    const next = new Map<CodaTileId, number>();
    result.forEach((row, pi) =>
      row.forEach((b) => {
        if (!b) return;
        b.forEach((prob, t) => {
          if (prob > 0.9999) next.set(t, pi);
        });
      }),
    );
    if (next.size === certainElsewhere.size && [...next].every(([t, o]) => certainElsewhere.get(t) === o)) break;
    certainElsewhere = next;
  }
  return { byPlayer: result, unknown };
}

export interface GuessOption {
  readonly target: number;
  readonly index: number;
  readonly value: CodaGuess;
  readonly p: number;
  /** 그 자리의 후보 수 (적을수록 확실) */
  readonly options: number;
}

/** 지금 둘 수 있는 추리들 (확률 높은 순) */
export function guessOptions(s: CodaState, viewer: number, b: Beliefs = beliefs(s, viewer)): GuessOption[] {
  const out: GuessOption[] = [];
  s.players.forEach((pl, target) => {
    if (target === viewer || pl.out) return;
    (b.byPlayer[target] ?? []).forEach((belief, index) => {
      if (!belief) return;
      // 같은 값(숫자)끼리 합친다 — 색은 이미 정해져 있으니 타일 하나 = 값 하나
      belief.forEach((p, tile) => {
        if (p > 0) out.push({ target, index, value: guessOf(tile), p, options: belief.size });
      });
    });
  });
  return out.sort((a, b2) => b2.p - a.p || a.options - b2.options);
}

/** 한 자리에서 가능한 값들 (UI의 추리 메모용) */
export function slotCandidates(s: CodaState, viewer: number, target: number, index: number, b: Beliefs = beliefs(s, viewer)): { value: CodaGuess; p: number }[] {
  const belief = b.byPlayer[target]?.[index];
  if (!belief) return [];
  return [...belief.entries()].map(([tile, p]) => ({ value: guessOf(tile), p })).sort((a, b2) => b2.p - a.p);
}

/**
 * 가장 좁혀진 숨은 타일 (올 수 있는 값이 가장 적은 자리) — "스스로·조금" 힌트가 답 대신 실마리로 쓴다.
 * 같으면 왼쪽 사람·왼쪽 자리부터.
 */
export function narrowest(s: CodaState, viewer: number, b: Beliefs = beliefs(s, viewer)): { target: number; index: number; values: CodaGuess[] } | null {
  let best: { target: number; index: number; values: CodaGuess[] } | null = null;
  s.players.forEach((pl, target) => {
    if (target === viewer || pl.out) return;
    (b.byPlayer[target] ?? []).forEach((belief, index) => {
      if (!belief) return;
      const values = [...belief.entries()].filter(([, p]) => p > 1e-9).map(([tile]) => guessOf(tile));
      if (values.length && (!best || values.length < best.values.length)) best = { target, index, values };
    });
  });
  return best;
}
