import { describe, expect, it } from 'vitest';
import { checkLayout } from '../../game/board';
import { reduce, type GameState } from '../../game/engine';
import { newMatch } from '../../game/match';
import { CLASSIC_RULES } from '../../game/rules';
import { TS, gameOf } from '../../game/fixtures';
import type { TableSet } from '../../game/types';
import { withBoard, type Session } from '../game';

/** 칸 위치가 아직 없던 시절의 저장본·방 문서를 흉내 낸다 */
const strip = (sets: readonly TableSet[]): TableSet[] => sets.map(({ id, tiles }) => ({ id, tiles }) as unknown as TableSet);

function oldSession(g: GameState): Session {
  const m = newMatch({
    seats: [
      { name: 'A', seat: 'human' },
      { name: 'B', seat: 'human' },
    ],
    rules: CLASSIC_RULES,
    format: { kind: 'games', games: 1 },
    seed: 1,
  });
  const t = g.turn;
  const turn = {
    ...t,
    start: { ...t.start, sets: strip(t.start.sets) },
    work: { ...t.work, sets: strip(t.work.sets) },
    past: t.past.map((w) => ({ ...w, sets: strip(w.sets) })),
    future: t.future.map((w) => ({ ...w, sets: strip(w.sets) })),
    tableAtTurnStart: strip(t.tableAtTurnStart),
  };
  return {
    v: 1,
    mode: 'local',
    lesson: null,
    match: { ...m, game: { ...g, table: strip(g.table), turn } },
    seatsMeta: [{ character: 'hwigi' }, { character: 'ginini' }],
    rackOrder: [[], []],
    drawn: [[], []],
    startedAt: 0,
    hintsLeft: 3,
    timerLeftMs: null,
  };
}

describe('칸 위치가 없는 옛 저장본 이어받기', () => {
  it('테이블의 세트마다 겹치지 않는 칸을 주고, 타일 순서는 그대로 둔다', () => {
    const g = gameOf({ players: [{ rack: 'r1 r2 r3 k9' }, { rack: 'o1' }], table: ['b4 b5 b6', 'r9 b9 k9', 'o2 o3 o4 o5'], pool: 'k1 k2 k3' });
    const old = oldSession(g);
    expect(old.match.game.table.every((s) => !Number.isInteger(s.row))).toBe(true);
    const s = withBoard(old);
    const game = s.match.game;
    expect(checkLayout(game.table)).toEqual([]);
    expect(checkLayout(game.turn.start.sets)).toEqual([]);
    expect(checkLayout(game.turn.work.sets)).toEqual([]);
    expect(game.table.map((x) => x.tiles)).toEqual(g.table.map((x) => x.tiles));
    // 차례 시작 때의 테이블과 지금 작업 중인 테이블은 같은 자리
    expect(game.turn.work.sets.map((x) => [x.row, x.col])).toEqual(game.turn.start.sets.map((x) => [x.row, x.col]));
  });

  it('차례 도중 옮겨 놓은 작업본·되돌리기 기록도 이어받은 뒤 규칙대로 움직인다', () => {
    const g0 = gameOf({ players: [{ rack: 'b7 o9 k2 r13' }, { rack: 'o1 o2' }], table: ['b4 b5 b6', 'r9 b9 k9'], pool: 'k1 k2 k3' });
    // 한 수 둔 상태(작업본이 시작과 달라진 상태)를 옛 형식으로 저장했다고 치자
    const r = reduce(g0, { type: 'move', tiles: TS('b7'), to: { kind: 'set', setId: 's1', index: 3 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = withBoard(oldSession(r.state));
    const game = s.match.game;
    expect(checkLayout(game.turn.work.sets)).toEqual([]);
    expect(game.turn.work.sets.find((x) => x.id === 's1')?.tiles).toEqual(TS('b4 b5 b6 b7'));
    expect(game.turn.past.length).toBeGreaterThan(0);
    for (const w of game.turn.past) expect(checkLayout(w.sets)).toEqual([]);
    // 이어서 두고 내기까지
    const next = reduce(game, { type: 'move', tiles: TS('o9'), to: { kind: 'cell', row: 5, col: 1 } });
    expect(next.ok).toBe(true);
  });

  it('이미 칸 위치가 있는 저장본은 그대로 돌려준다', () => {
    const g = gameOf({ players: [{ rack: 'r1' }, { rack: 'o1' }], table: ['b4 b5 b6'], pool: 'k1' });
    const old = oldSession(g);
    const once = withBoard(old);
    expect(withBoard(once)).toBe(once);
  });
});
