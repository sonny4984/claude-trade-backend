import { describe, expect, it } from 'vitest';
import { MAX_TILES, MAX_VALUE_W, solve, solveRack, stabilize, setsPoints, type Solution } from '../solver';
import { analyzeSet } from '../sets';
import { createRng, shuffle } from '../rng';
import { TILES, isJoker, tile } from '../tiles';
import { TS } from '../fixtures';
import { COLORS, type TileId } from '../types';

function assertValid(sol: Solution | null, table: readonly TileId[], rack: readonly TileId[]): Solution {
  expect(sol).not.toBeNull();
  const s = sol as Solution;
  const used = s.sets.flat();
  expect(new Set(used).size).toBe(used.length);
  for (const t of table) expect(used).toContain(t);
  const rackSet = new Set(rack);
  for (const t of s.played) expect(rackSet.has(t)).toBe(true);
  expect(used.length).toBe(table.length + s.played.length);
  for (const set of s.sets) expect(analyzeSet(set).ok).toBe(true);
  return s;
}

/** 작은 입력에서 정답(랙에서 낼 수 있는 최대 장수)을 전수 탐색으로 구한다 */
function bruteMaxPlayed(table: TileId[], rack: TileId[]): number {
  const canPartition = (tiles: TileId[]): boolean => {
    if (!tiles.length) return true;
    const [first, ...rest] = tiles as [TileId, ...TileId[]];
    const n = rest.length;
    for (let mask = 0; mask < 1 << n; mask++) {
      let bits = 0;
      for (let m = mask; m; m &= m - 1) bits++;
      if (bits < 2 || bits > 12) continue;
      const pick: TileId[] = [first];
      const left: TileId[] = [];
      rest.forEach((t, i) => (mask & (1 << i) ? pick : left).push(t));
      if (analyzeSet(pick).ok && canPartition(left)) return true;
    }
    return false;
  };
  let best = -1;
  const r = rack.length;
  for (let mask = 0; mask < 1 << r; mask++) {
    let bits = 0;
    for (let m = mask; m; m &= m - 1) bits++;
    if (bits <= best) continue;
    const chosen = rack.filter((_, i) => mask & (1 << i));
    if (canPartition([...table, ...chosen])) best = bits;
  }
  return best;
}

/** 무작위 합법 테이블 만들기 */
function randomTable(seed: number, sets: number): { table: TileId[]; remaining: TileId[] } {
  const rng = createRng(seed);
  let deck = shuffle(TILES.map((t) => t.id), rng);
  const table: TileId[] = [];
  const take = (pred: (id: TileId) => boolean): TileId | undefined => {
    const i = deck.findIndex(pred);
    if (i < 0) return undefined;
    const id = deck[i] as TileId;
    deck = [...deck.slice(0, i), ...deck.slice(i + 1)];
    return id;
  };
  for (let k = 0; k < sets; k++) {
    if (rng.next() < 0.5) {
      const c = COLORS[rng.int(4)] as string;
      const len = 3 + rng.int(4);
      const start = 1 + rng.int(13 - len + 1);
      const got: TileId[] = [];
      for (let v = start; v < start + len; v++) {
        const useJoker = rng.next() < 0.08;
        const id = useJoker ? take((x) => isJoker(x)) : undefined;
        const real = id ?? take((x) => {
          const t = tile(x);
          return t.kind === 'number' && t.color === c && t.value === v;
        });
        if (real === undefined) break;
        got.push(real);
      }
      if (got.length >= 3 && analyzeSet(got).ok) table.push(...got);
      else deck.push(...got);
    } else {
      const v = 1 + rng.int(13);
      const cols = shuffle([...COLORS], rng).slice(0, 3 + rng.int(2));
      const got: TileId[] = [];
      for (const c of cols) {
        const id = take((x) => {
          const t = tile(x);
          return t.kind === 'number' && t.color === c && t.value === v;
        });
        if (id !== undefined) got.push(id);
      }
      if (got.length >= 3 && analyzeSet(got).ok) table.push(...got);
      else deck.push(...got);
    }
  }
  return { table, remaining: deck };
}

describe('솔버 — 기본', () => {
  it('랙만으로 런과 그룹을 찾는다', () => {
    const rack = TS('r3 r4 r5 b9 o9 k9 k1');
    const s = assertValid(solveRack(rack), [], rack);
    expect(s.played.length).toBe(6);
  });
  it('테이블 세트 끝에 붙인다', () => {
    const table = TS('b4 b5 b6');
    const rack = TS('b3 b7 r1');
    const s = assertValid(solve({ table, rack }), table, rack);
    expect(new Set(s.played)).toEqual(new Set(TS('b3 b7')));
  });
  it('공식 "다중 분할"을 찾아낸다 (검정 10·파랑 5를 모두 낸다)', () => {
    const table = TS('o5 o6 o7 r5 r6 r7 k5 k6 k7 k8 k9');
    const rack = TS('k10 b5');
    const s = assertValid(solve({ table, rack }), table, rack);
    expect(s.played.length).toBe(2);
  });
  it('공식 "복합 분할": 파랑 1 한 장을 낸다', () => {
    const table = TS("o1 o2 o3 o4 b1' k1 r1 o1'");
    const rack = TS('b1');
    const s = assertValid(solve({ table, rack }), table, rack);
    expect(s.played).toEqual(TS('b1'));
  });
  it('런을 나눠 사이에 넣는다 (4-5-6-7-8 + 6)', () => {
    const table = TS('r4 r5 r6 r7 r8');
    const rack = TS("r6'");
    const s = assertValid(solve({ table, rack }), table, rack);
    expect(s.played.length).toBe(1);
    expect(s.sets.length).toBe(2);
  });
  it('테이블 조커는 반드시 테이블에 남는다', () => {
    const table = TS('r2 r3 J r5 r6');
    const rack = TS('r4 k9 k10');
    const s = assertValid(solve({ table, rack }), table, rack);
    expect(s.sets.flat()).toContain(104);
    expect(s.played.length).toBe(3); // r4가 조커 자리에 들어가고, 조커는 k9·k10과 새 런
  });
  it('조커를 아끼는 가중치면 랙 조커를 쓰지 않는다', () => {
    const rack = TS('r3 r4 J k7');
    const withJ = assertValid(solveRack(rack), [], rack);
    expect(withJ.played).toContain(104);
    const hold = solveRack(rack, { ...MAX_TILES, joker: -5000 });
    expect(hold?.played ?? []).not.toContain(104);
  });
  it('낼 게 없으면 랙 타일 0장', () => {
    const table = TS('b4 b5 b6');
    const rack = TS('r1 k9 o13');
    const s = assertValid(solve({ table, rack }), table, rack);
    expect(s.played).toEqual([]);
  });
  it('첫 등록 점수 계산: 조커 값을 포함해 최대 점수', () => {
    const rack = TS('r10 r11 J k1 k2 k3');
    const s = assertValid(solveRack(rack, MAX_VALUE_W), [], rack);
    expect(setsPoints(s.sets)).toBe(10 + 11 + 12 + 6);
  });
});

describe('솔버 — 정답 대조 (작은 입력 전수 탐색)', () => {
  it('무작위 60가지 작은 상황에서 최대 장수가 전수 탐색과 같다', () => {
    const rng = createRng(2024);
    for (let k = 0; k < 60; k++) {
      const { table, remaining } = randomTable(1000 + k, 1 + rng.int(2));
      const pool = shuffle(remaining, rng);
      // 테이블 근처 숫자를 섞어 넣어 재배열 상황이 자주 생기게 한다
      const rack = pool.slice(0, 3 + rng.int(3));
      if (table.length + rack.length > 11) continue;
      const s = assertValid(solve({ table, rack }), table, rack);
      expect(s.played.length).toBe(bruteMaxPlayed(table, rack));
    }
  });
});

describe('솔버 — 퍼즈 (큰 테이블)', () => {
  it('무작위 큰 테이블 + 랙 200가지: 항상 합법 배치, 테이블 타일 보존', () => {
    for (let k = 0; k < 200; k++) {
      const { table, remaining } = randomTable(k * 7 + 3, 6 + (k % 10));
      const rng = createRng(k + 11);
      const rack = shuffle(remaining, rng).slice(0, 5 + (k % 20));
      assertValid(solve({ table, rack }), table, rack);
    }
  }, 30000);
  it('106장 가까이 쌓인 테이블도 빨리 푼다', () => {
    const { table, remaining } = randomTable(77, 30);
    const rack = remaining.slice(0, 14);
    const t0 = performance.now();
    assertValid(solve({ table, rack }), table, rack);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('안정화 (화면이 덜 흔들리게)', () => {
  it('같은 그림 타일을 맞바꿔 원래 세트와 겹치게 한다', () => {
    const original = [TS('r5 b5 k5'), TS("r5' r6 r7")];
    const moved = [TS("r5' b5 k5"), TS('r5 r6 r7')];
    const s = stabilize(moved, original);
    expect(s[0]).toEqual(TS('r5 b5 k5'));
    expect(s[1]).toEqual(TS("r5' r6 r7"));
  });
});

describe('타일 표기 확인', () => {
  it('조커 id', () => {
    expect(TS("J J'")).toEqual([104, 105]);
    expect(tile(104).kind).toBe('joker');
  });
});
