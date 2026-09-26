import { describe, expect, it } from 'vitest';
import { drawForFirst, newGame, reduce, type GameAction, type GameState } from '../engine';
import { CLASSIC_RULES } from '../rules';
import { scoreGame, rackValue } from '../scoring';
import { T, TS, gameOf } from '../fixtures';
import { tile } from '../tiles';
import type { TileId } from '../types';

function run(state: GameState, ...actions: GameAction[]): GameState {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a);
    if (!r.ok) throw new Error(`action ${a.type} failed: ${r.error} ${JSON.stringify(r.check?.issues ?? '')}`);
    s = r.state;
  }
  return s;
}
const players2 = [
  { name: '나', seat: 'human' as const },
  { name: '하린', seat: 'ai' as const, ai: 'beginner' as const },
];

describe('시작 (공식 Set-up)', () => {
  it('각자 14장, 나머지는 더미 — 모든 타일이 정확히 한 번', () => {
    const g = newGame({ players: players2, rules: CLASSIC_RULES, seed: 42 });
    expect(g.players.map((p) => p.rack.length)).toEqual([14, 14]);
    expect(g.pool.length).toBe(106 - 28);
    const all = [...g.pool, ...g.players.flatMap((p) => p.rack)];
    expect(new Set(all).size).toBe(106);
  });
  it('4명이면 더미 50장', () => {
    const g = newGame({ players: [...players2, ...players2], rules: CLASSIC_RULES, seed: 7 });
    expect(g.pool.length).toBe(50);
  });
  it('가장 높은 숫자를 뽑은 사람이 먼저 한다 (동점·조커는 다시)', () => {
    for (let seed = 1; seed < 60; seed++) {
      const fd = drawForFirst(3, seed);
      const last = fd.rounds[fd.rounds.length - 1] as (TileId | null)[];
      const vals = last.map((id) => {
        if (id === null) return -2;
        const t = tile(id);
        return t.kind === 'number' ? t.value : -1;
      });
      const best = Math.max(...vals);
      expect(vals[fd.starter]).toBe(best);
      expect(vals.filter((v) => v === best).length).toBe(1);
    }
  });
  it('같은 시드면 같은 게임', () => {
    const a = newGame({ players: players2, rules: CLASSIC_RULES, seed: 99 });
    const b = newGame({ players: players2, rules: CLASSIC_RULES, seed: 99 });
    expect(a.players[0]?.rack).toEqual(b.players[0]?.rack);
    expect(a.pool).toEqual(b.pool);
    expect(a.current).toBe(b.current);
  });
  it('다른 시드면 다른 배분', () => {
    const a = newGame({ players: players2, rules: CLASSIC_RULES, seed: 1 });
    const b = newGame({ players: players2, rules: CLASSIC_RULES, seed: 2 });
    expect(a.pool).not.toEqual(b.pool);
  });
  it('인원이 2~4명이 아니면 거절', () => {
    expect(() => newGame({ players: [players2[0] as never], rules: CLASSIC_RULES, seed: 1 })).toThrow();
  });
});

describe('뽑기와 넘기기', () => {
  it('뽑으면 한 장 늘고 차례가 넘어간다 (시계 방향)', () => {
    const g = gameOf({ players: [{ rack: 'r1 r5' }, { rack: 'b2' }], pool: 'k7 k8' });
    const s = run(g, { type: 'draw' });
    expect(s.players[0]?.rack).toEqual(TS('r1 r5 k8'));
    expect(s.pool).toEqual(TS('k7'));
    expect(s.current).toBe(1);
    expect(s.turn.player).toBe(1);
  });
  it('놓아 둔 타일이 있으면 되돌린 뒤 뽑는다', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 r3 k9' }, { rack: 'b2' }], pool: 'o4' });
    const s = run(g, { type: 'move', tiles: TS('r1 r2 r3'), to: { kind: 'new' } }, { type: 'draw' });
    expect(s.table).toEqual([]);
    expect(new Set(s.players[0]?.rack)).toEqual(new Set(TS('r1 r2 r3 k9 o4')));
  });
  it('더미가 비었으면 뽑지 않고 넘긴다', () => {
    const g = gameOf({ players: [{ rack: 'r1' }, { rack: 'b2' }], pool: '' });
    const s = run(g, { type: 'draw' });
    expect(s.players[0]?.rack).toEqual(TS('r1'));
    expect(s.passes).toBe(1);
  });
  it('더미가 빈 뒤 모두 연달아 넘기면 판이 끝나고 랙 합이 가장 낮은 사람이 이긴다', () => {
    const g = gameOf({ players: [{ rack: 'r10' }, { rack: 'b2 b3' }, { rack: 'k9' }], pool: '' });
    const s = run(g, { type: 'draw' }, { type: 'draw' }, { type: 'draw' });
    expect(s.phase).toBe('over');
    expect(s.result?.reason).toBe('stalemate');
    expect(s.result?.winners).toEqual([1]);
    // 공식: 각자 (자기 합 − 승자 합)을 잃고, 승자는 그 합을 얻는다
    expect(s.result?.deltas).toEqual([5, 0, 4].map((x, i) => (i === 1 ? 9 : -x)));
  });
  it('누가 내면 넘긴 횟수는 다시 0', () => {
    const g = gameOf({ players: [{ rack: 'r1' }, { rack: 'b2 b3 b4 b9' }], pool: '', table: ['k1 k2 k3'] });
    const s = run(g, { type: 'draw' }, { type: 'move', tiles: TS('b2 b3 b4'), to: { kind: 'new' } }, { type: 'commit' });
    expect(s.passes).toBe(0);
  });
});

describe('내기', () => {
  it('첫 등록(공식): 성공하면 차례가 끝나고 등록 상태가 된다', () => {
    const g = gameOf({ players: [{ rack: 'r10 r11 r12 k1', melded: false }, { rack: 'b2' }] });
    const s = run(g, { type: 'move', tiles: TS('r10 r11 r12'), to: { kind: 'new' } }, { type: 'commit' });
    expect(s.players[0]?.melded).toBe(true);
    expect(s.current).toBe(1);
    expect(s.table.length).toBe(1);
  });
  it('첫 등록 30점 미만이면 거절되고 이유를 돌려준다', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 r3 k1', melded: false }, { rack: 'b2' }] });
    const s = run(g, { type: 'move', tiles: TS('r1 r2 r3'), to: { kind: 'new' } });
    const r = reduce(s, { type: 'commit' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.check?.issues).toContainEqual({ code: 'meld-too-low', points: 6, need: 30 });
  });
  it('공식: 등록한 차례에는 기존 테이블에 붙일 수 없다 (다음 차례부터)', () => {
    const g = gameOf({ players: [{ rack: 'r10 r11 r12 k4', melded: false }, { rack: 'b2' }], table: ['k1 k2 k3'] });
    const s = run(g, { type: 'move', tiles: TS('r10 r11 r12'), to: { kind: 'new' } });
    const r = reduce(s, { type: 'move', tiles: TS('k4'), to: { kind: 'set', setId: 's1' } });
    expect(r.ok ? 'ok' : r.error).toBe('locked-before-meld');
  });
  it('하우스 룰 "등록 후 계속": 등록 뒤 같은 차례에 붙이고 끝낼 수 있다', () => {
    const g = gameOf({
      players: [{ rack: 'r10 r11 r12 k4 o9', melded: false }, { rack: 'b2' }],
      table: ['k1 k2 k3'],
      rules: { initialMeldContinuesTurn: true },
    });
    let s = run(g, { type: 'move', tiles: TS('r10 r11 r12'), to: { kind: 'new' } }, { type: 'commit' });
    expect(s.current).toBe(0);
    expect(s.turn.meldedNow).toBe(true);
    expect(reduce(s, { type: 'draw' }).ok).toBe(false);
    s = run(s, { type: 'move', tiles: TS('k4'), to: { kind: 'set', setId: 's1' } }, { type: 'commit' });
    expect(s.current).toBe(1);
    expect(s.players[0]?.rack).toEqual(TS('o9'));
  });
  it('하우스 룰 "등록 후 계속": 더 낼 게 없으면 그대로 차례를 끝낸다', () => {
    const g = gameOf({ players: [{ rack: 'r10 r11 r12 o9', melded: false }, { rack: 'b2' }], rules: { initialMeldContinuesTurn: true } });
    const s = run(g, { type: 'move', tiles: TS('r10 r11 r12'), to: { kind: 'new' } }, { type: 'commit' }, { type: 'commit' });
    expect(s.current).toBe(1);
  });
  it('마지막 타일을 내면 판이 끝나고 승자가 나머지 랙 합을 얻는다 (조커 30)', () => {
    const g = gameOf({ players: [{ rack: 'b5' }, { rack: 'r3 J' }, { rack: 'k10 k2' }], table: ['b2 b3 b4'] });
    const s = run(g, { type: 'move', tiles: TS('b5'), to: { kind: 'set', setId: 's1' } }, { type: 'commit' });
    expect(s.phase).toBe('over');
    expect(s.result?.reason).toBe('out');
    expect(s.result?.winners).toEqual([0]);
    expect(s.result?.deltas).toEqual([33 + 12, -33, -12]);
  });
  it('판이 끝나면 어떤 동작도 받지 않는다', () => {
    const g = gameOf({ players: [{ rack: 'b5' }, { rack: 'r3' }], table: ['b2 b3 b4'] });
    const s = run(g, { type: 'move', tiles: TS('b5'), to: { kind: 'set', setId: 's1' } }, { type: 'commit' });
    expect(reduce(s, { type: 'draw' }).ok).toBe(false);
  });
  it('되돌릴 것이 없으면 오류', () => {
    const g = gameOf({ players: [{ rack: 'b5' }, { rack: 'r3' }] });
    expect(reduce(g, { type: 'undo' }).ok).toBe(false);
    expect(reduce(g, { type: 'redo' }).ok).toBe(false);
  });
  it('통계: 한 번에 낸 장수, 조커, 재배열', () => {
    const g = gameOf({ players: [{ rack: 'b5 J r9 r10 k1' }, { rack: 'r3' }], table: ['b2 b3 b4', 'o9 k9 b9'] });
    const s = run(
      g,
      { type: 'move', tiles: TS('b5'), to: { kind: 'set', setId: 's1' } },
      { type: 'move', tiles: TS('r9 r10 J'), to: { kind: 'new' } },
      { type: 'commit' },
    );
    expect(s.stats[0]?.largestMove).toBe(4);
    expect(s.stats[0]?.jokersPlayed).toBe(1);
    expect(s.log[s.log.length - 1]).toMatchObject({ t: 'play', p: 0 });
  });
});

describe('시간 제한 (공식 Time Limit / Incomplete Runs)', () => {
  const timed = { turnSeconds: 60 };
  it('아무것도 안 했으면 한 장 뽑고 끝', () => {
    const g = gameOf({ players: [{ rack: 'r1' }, { rack: 'b2' }], pool: 'k1 k2 k3 k4', rules: timed });
    const s = run(g, { type: 'timeout' });
    expect(s.players[0]?.rack.length).toBe(2);
    expect(s.current).toBe(1);
  });
  it('수를 완성하지 못했으면 되돌리고 3장을 벌칙으로 뽑는다', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 k9' }, { rack: 'b2' }], table: ['o5 o6 o7'], pool: 'k1 k2 k3 k4', rules: timed });
    const s = run(g, { type: 'move', tiles: TS('r1 r2'), to: { kind: 'new' } }, { type: 'timeout' });
    expect(s.table).toEqual([{ id: 's1', tiles: TS('o5 o6 o7') }]);
    expect(s.players[0]?.rack.length).toBe(3 + 3);
    expect(s.log[s.log.length - 1]).toMatchObject({ t: 'timeout', drew: 3 });
  });
  it('벌칙 장수는 더미에 남은 만큼만', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 k9' }, { rack: 'b2' }], pool: 'k1', rules: timed });
    const s = run(g, { type: 'move', tiles: TS('r1 r2'), to: { kind: 'new' } }, { type: 'timeout' });
    expect(s.players[0]?.rack.length).toBe(4);
    expect(s.pool.length).toBe(0);
  });
  it('시간이 끝났을 때 이미 합법이면 그대로 확정한다', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 r3 k9' }, { rack: 'b2' }], pool: 'k1', rules: timed });
    const s = run(g, { type: 'move', tiles: TS('r1 r2 r3'), to: { kind: 'new' } }, { type: 'timeout' });
    expect(s.table.length).toBe(1);
    expect(s.players[0]?.rack).toEqual(TS('k9'));
  });
  it('하우스 룰: 벌칙 1장', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 k9' }, { rack: 'b2' }], pool: 'k1 k2 k3', rules: { ...timed, timeoutPenaltyDraw: 1 } });
    const s = run(g, { type: 'move', tiles: TS('r1 r2'), to: { kind: 'new' } }, { type: 'timeout' });
    expect(s.players[0]?.rack.length).toBe(4);
  });
});

describe('점수 (공식 Scoring)', () => {
  it('공식 예시 1판: A가 이기고 B·C·D가 5·16·3 → A +24', () => {
    const out = scoreGame([[], TS('b5'), TS('k10 k6'), TS('r3')], [true, true, true, true], 0, CLASSIC_RULES);
    expect(out.deltas).toEqual([24, -5, -16, -3]);
  });
  it('랙에 남은 조커는 30점 (하우스 50점)', () => {
    expect(rackValue(TS('J r2'), CLASSIC_RULES)).toBe(32);
    expect(rackValue(TS('J r2'), { ...CLASSIC_RULES, jokerPenalty: 50 })).toBe(52);
  });
  it('한 번도 등록 못 한 사람 추가 벌점 (하우스 100)', () => {
    expect(rackValue(TS('r2'), { ...CLASSIC_RULES, unmeldedPenalty: 100 }, false)).toBe(102);
    expect(rackValue(TS('r2'), CLASSIC_RULES, false)).toBe(2);
  });
  it('막힘 종료: 승자 합 4, 다른 사람 10·12 → -6, -8, 승자 +14', () => {
    const out = scoreGame([TS('r10'), TS('b4'), TS('k12')], [true, true, true], null, CLASSIC_RULES);
    expect(out.winners).toEqual([1]);
    expect(out.deltas).toEqual([-6, 14, -8]);
  });
  it('막힘 종료 동점이면 공동 승자가 나눠 갖는다', () => {
    const out = scoreGame([TS('r4'), TS('b4'), TS('k9')], [true, true, true], null, CLASSIC_RULES);
    expect(out.winners).toEqual([0, 1]);
    expect(out.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(out.deltas[2]).toBe(-5);
  });
  it('점수 합은 언제나 0 (승자 점수 = 나머지 합)', () => {
    const out = scoreGame([TS('r1 r2'), [], TS('J k13')], [true, true, true], 1, CLASSIC_RULES);
    expect(out.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(T('r1')).toBeTypeOf('number');
  });
});
