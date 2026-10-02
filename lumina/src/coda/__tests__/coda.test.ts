import { describe, expect, it } from 'vitest';
import {
  BLACK_JOKER,
  WHITE_JOKER,
  codaId,
  codaInvariants,
  codaKey,
  codaReduce,
  hiddenCount,
  isCodaJoker,
  newCoda,
  validSlots,
  type CodaAction,
  type CodaPlayer,
  type CodaSlot,
  type CodaState,
  type CodaTileId,
} from '../engine';
import { beliefs, guessOptions, narrowest } from '../deduce';
import { CODA_PROFILES, codaDecide } from '../ai';
import { createRng } from '../../game/rng';
import type { AiLevel } from '../../game/types';

const B = (v: number | null): CodaTileId => codaId('black', v);
const W = (v: number | null): CodaTileId => codaId('white', v);
const hid = (tile: CodaTileId): CodaSlot => ({ tile, revealed: false, misses: [] });
const open = (tile: CodaTileId): CodaSlot => ({ tile, revealed: true, misses: [] });

function seats(n: number, ai = false) {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, seat: ai ? ('ai' as const) : ('human' as const), ...(ai ? { ai: 'casual' as AiLevel } : {}) }));
}

/** 손으로 만든 판 */
function board(rows: CodaSlot[][], o: { pool?: CodaTileId[]; drawn?: CodaTileId | null; current?: number; jokers?: boolean } = {}): CodaState {
  const players: CodaPlayer[] = rows.map((row, i) => ({ name: `P${i}`, seat: 'human', row, out: row.every((x) => x.revealed), stats: { guesses: 0, correct: 0, bestStreak: 0 } }));
  return {
    v: 1,
    seed: 1,
    jokers: o.jokers ?? true,
    players,
    pool: o.pool ?? [],
    current: o.current ?? 0,
    phase: 'guess',
    drawn: o.drawn ?? null,
    placeRevealed: false,
    streak: 0,
    turnNo: 1,
    winner: null,
    log: [],
    first: 0,
  };
}

/** 손으로 만든 판은 26장을 다 쓰지 않으니 순서만 본다 */
function sortedRows(s: CodaState): boolean {
  return s.players.every((p) => {
    const keys = p.row.map((x) => codaKey(x.tile)).filter((k): k is number => k !== null);
    return keys.every((k, i) => i === 0 || k > (keys[i - 1] as number));
  });
}

function act(s: CodaState, a: CodaAction): CodaState {
  const r = codaReduce(s, a);
  if (!r.ok) throw new Error(`거절됨: ${r.error}`);
  return r.state;
}

describe('시작', () => {
  /** 처음 고르기를 AI처럼 끝까지 */
  function dealAll(s0: CodaState, rng = createRng(5)): CodaState {
    let s = s0;
    for (let k = 0; k < 20 && s.phase === 'deal'; k++) s = act(s, codaDecide(s, rng, 'casual'));
    return s;
  }

  it('처음에는 자리 순서대로 각자 색을 골라 가져온다: 2~3인은 4장, 4인은 3장, 조커 없음, 줄은 정렬', () => {
    for (const [n, per] of [
      [2, 4],
      [3, 4],
      [4, 3],
    ] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const s0 = newCoda({ seats: seats(n), jokers: true, seed });
        expect(s0.phase).toBe('deal');
        expect(s0.current).toBe(0);
        expect(s0.players.every((p) => p.row.length === 0)).toBe(true);
        expect(codaInvariants(s0)).toEqual([]);
        const s = dealAll(s0);
        s.players.forEach((p) => {
          expect(p.row).toHaveLength(per);
          expect(p.row.some((x) => isCodaJoker(x.tile))).toBe(false);
          const keys = p.row.map((x) => codaKey(x.tile) as number);
          expect([...keys].sort((a, b) => a - b)).toEqual(keys);
        });
        // 다 가져가면 조커를 섞고 첫 사람이 한 장 뽑을 차례
        expect(s.phase).toBe('draw');
        expect(s.current).toBe(s0.first);
        expect(s.drawn).toBeNull();
        expect(s.pool.length + n * per).toBe(26);
        expect(s.pool.filter(isCodaJoker)).toHaveLength(2);
        expect(codaInvariants(s)).toEqual([]);
      }
    }
  });

  it('고른 색이 그대로 온다 — 검정 셋, 하양 하나', () => {
    let s = newCoda({ seats: seats(2), jokers: false, seed: 11 });
    for (const c of ['black', 'white', 'black', 'black'] as const) s = act(s, { type: 'draw', color: c });
    const colors = s.players[0]?.row.map((x) => (x.tile < 13 ? 'black' : 'white')).sort();
    expect(colors).toEqual(['black', 'black', 'black', 'white']);
    expect(s.current).toBe(1);
    expect(s.phase).toBe('deal');
  });

  it('차례마다 원하는 색을 한 장 뽑아 혼자 본 뒤 추리한다. 없는 색은 못 뽑는다', () => {
    let s = dealAll(newCoda({ seats: seats(2), jokers: false, seed: 21 }));
    expect(s.phase).toBe('draw');
    expect(codaReduce(s, { type: 'guess', target: 1 - s.current, index: 0, value: 0 }).ok).toBe(false); // 뽑기 전
    const before = s.pool.length;
    s = act(s, { type: 'draw', color: 'white' });
    expect(s.phase).toBe('guess');
    expect(s.drawn !== null && s.drawn >= 13).toBe(true);
    expect(s.pool.length).toBe(before - 1);
    // 더미에 한 색만 남으면 다른 색은 거절
    const onlyBlack = { ...s, phase: 'draw' as const, drawn: null, pool: s.pool.filter((t) => t < 13) };
    expect(codaReduce(onlyBlack, { type: 'draw', color: 'white' }).ok).toBe(false);
    expect(codaReduce(onlyBlack, { type: 'draw', color: 'black' }).ok).toBe(true);
  });

  it('조커를 빼면 24장', () => {
    const s = dealAll(newCoda({ seats: seats(3), jokers: false, seed: 7 }));
    expect(s.pool.length + 12).toBe(24);
    expect(s.pool.some((t) => isCodaJoker(t))).toBe(false);
  });
});

describe('줄 순서', () => {
  it('같은 숫자면 검정이 왼쪽', () => {
    expect(validSlots([hid(W(5))], B(5))).toEqual([0]);
    expect(validSlots([hid(B(5))], W(5))).toEqual([1]);
  });
  it('조커는 아무 자리에나, 숫자는 조커 양옆 어디든', () => {
    const row = [hid(B(2)), hid(BLACK_JOKER), hid(W(7))];
    expect(validSlots(row, WHITE_JOKER)).toEqual([0, 1, 2, 3]);
    expect(validSlots(row, B(5))).toEqual([1, 2]);
    expect(validSlots(row, B(0))).toEqual([0]);
    expect(validSlots(row, W(11))).toEqual([3]);
  });
});

describe('차례', () => {
  it('맞히면 공개되고 계속/멈춤을 고른다. 멈추면 뽑은 타일이 숨은 채 제자리에', () => {
    let s = board([[hid(B(1)), hid(W(8))], [hid(B(3)), hid(W(6)), hid(B(9))]], { drawn: B(7), pool: [W(0)] });
    s = act(s, { type: 'guess', target: 1, index: 1, value: 6 });
    expect(s.phase).toBe('decide');
    expect(s.players[1]?.row[1]?.revealed).toBe(true);
    expect(s.players[0]?.stats).toEqual({ guesses: 1, correct: 1, bestStreak: 1 });
    s = act(s, { type: 'stop' });
    // 1, 7, 8 순서로 숨긴 채 들어가고 다음 사람 차례
    expect(s.players[0]?.row.map((x) => x.tile)).toEqual([B(1), B(7), W(8)]);
    expect(s.players[0]?.row[1]?.revealed).toBe(false);
    expect(s.current).toBe(1);
    // 다음 사람은 더미에서 색을 골라 뽑는 것부터
    expect(s.phase).toBe('draw');
    expect(s.drawn).toBeNull();
    expect(sortedRows(s)).toBe(true);
  });

  it('계속하면 다시 추리한다', () => {
    let s = board([[hid(B(1))], [hid(B(3)), hid(W(6))]], { drawn: B(7) });
    s = act(s, { type: 'guess', target: 1, index: 0, value: 3 });
    s = act(s, { type: 'continue' });
    expect(s.phase).toBe('guess');
    s = act(s, { type: 'guess', target: 1, index: 1, value: 6 });
    // 상대가 모두 공개 → 끝
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    expect(s.players[1]?.out).toBe(true);
    expect(s.players[0]?.stats.bestStreak).toBe(2);
  });

  it('틀리면 뽑은 타일을 공개한 채 제자리에 끼우고, 틀린 값은 그 타일에 기록된다', () => {
    let s = board([[hid(B(1)), hid(W(8))], [hid(B(3)), hid(W(6))]], { drawn: W(4), pool: [B(10)] });
    s = act(s, { type: 'guess', target: 1, index: 0, value: 2 });
    expect(s.players[0]?.row.map((x) => [x.tile, x.revealed])).toEqual([
      [B(1), false],
      [W(4), true],
      [W(8), false],
    ]);
    expect(s.players[1]?.row[0]?.misses).toEqual([2]);
    expect(s.current).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ p: 0, target: 1, value: 2, hit: false });
    expect(sortedRows(s)).toBe(true);
  });

  it('조커를 뽑고 멈추면 놓을 자리를 고른다', () => {
    let s = board([[hid(B(1)), hid(W(8))], [hid(B(3)), hid(W(6))]], { drawn: WHITE_JOKER });
    s = act(s, { type: 'guess', target: 1, index: 0, value: 3 });
    s = act(s, { type: 'stop' });
    expect(s.phase).toBe('place');
    expect(codaReduce(s, { type: 'place', index: 5 }).ok).toBe(false);
    s = act(s, { type: 'place', index: 0 });
    expect(s.players[0]?.row[0]?.tile).toBe(WHITE_JOKER);
    expect(s.players[0]?.row[0]?.revealed).toBe(false);
    expect(s.current).toBe(1);
  });

  it('줄에 조커가 있으면 숫자도 자리를 고를 수 있다', () => {
    let s = board([[hid(B(2)), hid(BLACK_JOKER), hid(W(9))], [hid(B(3)), hid(W(6))]], { drawn: B(5) });
    s = act(s, { type: 'guess', target: 1, index: 0, value: 0 });
    // 틀림 → 공개하며 놓을 자리 선택 (조커 앞/뒤)
    expect(s.phase).toBe('place');
    expect(s.placeRevealed).toBe(true);
    s = act(s, { type: 'place', index: 2 });
    expect(s.players[0]?.row.map((x) => x.tile)).toEqual([B(2), BLACK_JOKER, B(5), W(9)]);
    expect(s.players[0]?.row[2]?.revealed).toBe(true);
  });

  it('조커는 "조커"라고 말해야 맞는다', () => {
    let s = board([[hid(B(1))], [hid(B(3)), hid(WHITE_JOKER)]], { drawn: B(7) });
    expect(codaReduce(s, { type: 'guess', target: 1, index: 1, value: 11 }).ok).toBe(true);
    s = act(s, { type: 'guess', target: 1, index: 1, value: 'joker' });
    expect(s.players[1]?.row[1]?.revealed).toBe(true);
  });

  it('더미가 비었으면 틀렸을 때 내 숨은 타일 하나를 골라 공개한다', () => {
    let s = board([[hid(B(1)), hid(W(8))], [hid(B(3)), hid(W(6))]], { drawn: null });
    s = act(s, { type: 'guess', target: 1, index: 0, value: 9 });
    expect(s.phase).toBe('reveal-own');
    expect(codaReduce(s, { type: 'reveal-own', index: 7 }).ok).toBe(false);
    s = act(s, { type: 'reveal-own', index: 1 });
    expect(s.players[0]?.row[1]?.revealed).toBe(true);
    expect(s.current).toBe(1);
  });

  it('더미가 비고 숨은 타일이 하나뿐이면 그게 공개되며 탈락한다', () => {
    let s = board([[open(B(1)), hid(W(8))], [hid(B(3)), hid(W(6))], [hid(B(4))]], { drawn: null });
    s = act(s, { type: 'guess', target: 1, index: 0, value: 9 });
    expect(s.players[0]?.out).toBe(true);
    expect(s.current).toBe(1);
    expect(s.phase).toBe('guess');
  });

  it('잘못된 수는 거절된다', () => {
    const s = board([[hid(B(1))], [open(B(3)), hid(W(6))]], { drawn: B(7), jokers: false });
    expect(codaReduce(s, { type: 'guess', target: 0, index: 0, value: 1 }).ok).toBe(false); // 내 줄
    expect(codaReduce(s, { type: 'guess', target: 1, index: 0, value: 3 }).ok).toBe(false); // 이미 공개
    expect(codaReduce(s, { type: 'guess', target: 1, index: 1, value: 12 }).ok).toBe(false); // 범위 밖
    expect(codaReduce(s, { type: 'guess', target: 1, index: 1, value: 'joker' }).ok).toBe(false); // 조커 없는 판
    expect(codaReduce(s, { type: 'stop' }).ok).toBe(false); // 추리 전
  });
});

describe('추리기', () => {
  it('순서로 좁힌다: 검정3 < ? < 하양5 이고 ?가 하양이면 하양3 또는 하양4', () => {
    const s = board([[hid(B(0))], [open(B(3)), hid(W(4)), open(W(5))]], { drawn: null, jokers: false });
    const b = beliefs(s, 0);
    const slot = b.byPlayer[1]?.[1];
    expect(slot && [...slot.keys()].sort((a, c) => a - c)).toEqual([W(3), W(4)]);
    expect(slot?.get(W(3))).toBeCloseTo(0.5);
  });

  it('가장 좁혀진 타일: 올 수 있는 값이 가장 적은 숨은 자리 (힌트 "스스로·조금"의 실마리)', () => {
    // 하양 ?는 검정6과 하양8 사이라 하양6·하양7 둘뿐, 검정 ?는 검정1~5로 더 넓다
    const s = board([[hid(B(0))], [hid(B(1)), open(B(6)), hid(W(7)), open(W(8))]], { drawn: null, jokers: false });
    const n = narrowest(s, 0);
    expect(n).toMatchObject({ target: 1, index: 2 });
    expect([...(n?.values ?? [])].sort()).toEqual([6, 7]);
    const counts = (beliefs(s, 0).byPlayer[1] ?? []).flatMap((x) => (x ? [[...x.values()].filter((p) => p > 0).length] : []));
    expect(Math.min(...counts)).toBe(n?.values.length);
  });

  it('틀렸던 값은 후보에서 빠진다', () => {
    const s0 = board([[hid(B(0))], [open(B(3)), { tile: W(4), revealed: false, misses: [3] }, open(W(5))]], { drawn: null, jokers: false });
    const slot = beliefs(s0, 0).byPlayer[1]?.[1];
    expect(slot && [...slot.entries()]).toEqual([[W(4), 1]]);
  });

  it('무작위 판에서 진짜 타일의 확률은 언제나 0보다 크고, 자리마다 합은 1', () => {
    const rng = createRng(99);
    for (let g = 0; g < 40; g++) {
      let s = newCoda({ seats: seats(2 + (g % 3), true), jokers: g % 2 === 0, seed: 1000 + g });
      for (let step = 0; step < 60 && s.phase !== 'over'; step++) {
        for (let viewer = -1; viewer < s.players.length; viewer++) {
          const b = beliefs(s, viewer);
          s.players.forEach((p, pi) =>
            p.row.forEach((x, i) => {
              const bel = b.byPlayer[pi]?.[i];
              if (!bel) return;
              expect(bel.get(x.tile) ?? 0).toBeGreaterThan(0);
              const sum = [...bel.values()].reduce((a, c) => a + c, 0);
              expect(sum).toBeCloseTo(1, 6);
            }),
          );
        }
        s = act(s, codaDecide(s, rng));
      }
    }
    // 판 40개를 끝까지 두며 매 수마다 모두의 추리를 다시 셈하는 무거운 시험 (느린 기기에서 5초 넘음)
  }, 30_000);
});

describe('AI', () => {
  function play(levels: AiLevel[], seed: number, jokers: boolean): { state: CodaState; steps: number } {
    const rng = createRng(seed * 31 + 7);
    let s = newCoda({ seats: levels.map((ai, i) => ({ name: `AI${i}`, seat: 'ai' as const, ai })), jokers, seed });
    let steps = 0;
    while (s.phase !== 'over' && steps < 2000) {
      const a = codaDecide(s, rng);
      const r = codaReduce(s, a);
      if (!r.ok) throw new Error(`AI가 잘못된 수: ${JSON.stringify(a)} (${r.error})`);
      const issues = codaInvariants(r.state);
      if (issues.length) throw new Error(issues.join(', '));
      s = r.state;
      steps++;
    }
    return { state: s, steps };
  }

  it('AI끼리 300판: 모두 승자가 나고 규칙 위반이 없다', () => {
    const levels: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];
    for (let g = 0; g < 300; g++) {
      const n = 2 + (g % 3);
      const seatLevels = Array.from({ length: n }, (_, i) => levels[(g + i) % 4] as AiLevel);
      const { state, steps } = play(seatLevels, 5000 + g, g % 3 !== 0);
      expect(state.phase).toBe('over');
      expect(state.winner).not.toBeNull();
      expect(steps).toBeLessThan(2000);
      expect(hiddenCount(state.players[state.winner as number] as CodaPlayer)).toBeGreaterThan(0);
    }
  }, 30_000);

  it('입문이 아니면 불가능한 값을 말하지 않는다', () => {
    const rng = createRng(3);
    for (let g = 0; g < 30; g++) {
      let s = newCoda({ seats: [{ name: 'a', seat: 'ai', ai: 'casual' }, { name: 'b', seat: 'ai', ai: 'expert' }, { name: 'c', seat: 'ai', ai: 'advanced' }], jokers: true, seed: 300 + g });
      for (let step = 0; step < 200 && s.phase !== 'over'; step++) {
        const a = codaDecide(s, rng);
        if (a.type === 'guess') {
          // 그 AI가 실제로 쓰는 추리 깊이로 확인 (보통은 줄 사이 추리를 하지 않는다)
          const level = s.players[s.current]?.ai ?? 'casual';
          const opts = guessOptions(s, s.current, beliefs(s, s.current, CODA_PROFILES[level].crossRow));
          const found = opts.find((o) => o.target === a.target && o.index === a.index && o.value === a.value);
          expect(found?.p ?? 0).toBeGreaterThan(0);
        }
        s = act(s, a);
      }
    }
  });

  it('명인은 입문을 대부분 이긴다 (1:1, 200판)', () => {
    let expertWins = 0;
    for (let g = 0; g < 200; g++) {
      const levels: AiLevel[] = g % 2 ? ['expert', 'beginner'] : ['beginner', 'expert'];
      const { state } = play(levels, 9000 + g, true);
      if (levels[state.winner as number] === 'expert') expertWins++;
    }
    expect(expertWins).toBeGreaterThan(130);
  });
});
