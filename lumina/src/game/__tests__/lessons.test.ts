import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../lessons/lessons';
import { reduce, type GameAction, type GameEvent, type GameState } from '../engine';
import { checkLayout } from '../board';
import { T, TS } from '../fixtures';

/** 튜토리얼 1~5과를 칸 위에서 실제로 풀 수 있는가 — 안내 문장대로 움직이면 목표가 이루어져야 한다 */
function run(g0: GameState, actions: readonly GameAction[]): { g: GameState; events: GameEvent[] } {
  let g = g0;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(g, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)}: ${r.error}`);
    g = r.state;
    events.push(...r.events);
    expect(checkLayout(g.turn.work.sets)).toEqual([]);
  }
  return { g, events };
}
const cell = (tiles: string, row: number, col: number): GameAction => ({ type: 'move', tiles: TS(tiles), to: { kind: 'cell', row, col } });

describe('튜토리얼 — 칸 위에서 풀기', () => {
  it('1과: 런을 만들고, 이어서 그룹을 만든다', () => {
    const l = LESSONS[0]!;
    const g0 = l.build();
    expect(l.text(g0)).toBe('lesson.l1');
    const a = run(g0, [cell('r3', 1, 1), cell('r4', 1, 2), cell('r5', 1, 3)]);
    expect(l.goal(a.g, a.events)).toBe(false);
    expect(l.text(a.g)).toBe('lesson.l1b');
    const b = run(a.g, [cell('k7', 3, 1), cell('b7', 3, 2), cell('o7', 3, 3)]);
    expect(l.goal(b.g, b.events)).toBe(true);
  });

  it('2과: 손패만으로 30점 이상을 내려 등록한다', () => {
    const l = LESSONS[1]!;
    const { g, events } = run(l.build(), [cell('r10', 1, 1), cell('r11', 1, 2), cell('r12', 1, 3), { type: 'commit' }]);
    expect(l.goal(g, events)).toBe(true);
  });

  it('3과: 테이블 세트 바로 옆 칸에 붙여 낸다 (두 세트가 이어지지 않는다)', () => {
    const l = LESSONS[2]!;
    const g0 = l.build();
    expect(g0.table).toHaveLength(2);
    // 세트 오른쪽 끝 바로 옆 칸 — 런 b4 b5 b6 의 오른쪽, 그룹 r9 b9 k9 의 오른쪽
    const { g, events } = run(g0, [cell('b7', 1, 4), cell('o9', 3, 4), { type: 'commit' }]);
    expect(l.goal(g, events)).toBe(true);
    expect(g.table.map((s) => s.tiles.length).sort()).toEqual([4, 4]);
  });

  it('4과: 7·8을 함께 옮겨 런을 가르고, 6을 7 왼쪽에 붙이면 런이 둘이 된다', () => {
    const l = LESSONS[3]!;
    const { g, events } = run(l.build(), [
      cell('r7 r8', 3, 5),
      // 가른 자리에 둔 6 (7 바로 왼쪽)
      cell("r6'", 3, 4),
      { type: 'commit' },
    ]);
    expect(l.goal(g, events)).toBe(true);
    expect(g.table.map((s) => s.tiles.length).sort()).toEqual([3, 3]);
  });

  it('5과: 조커 자리에 검정 3을 넣고, 풀려난 조커로 새 세트를 만든다', () => {
    const l = LESSONS[4]!;
    const { g, events } = run(l.build(), [
      { type: 'swap', tile: T('k3'), joker: T('J') },
      cell('o10 o11', 3, 1),
      cell('J', 3, 3),
      { type: 'commit' },
    ]);
    expect(l.goal(g, events)).toBe(true);
  });
});
