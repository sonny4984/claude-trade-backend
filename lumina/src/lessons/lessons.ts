/**
 * 인터랙티브 튜토리얼 — 레슨마다 목표 하나, 문장 하나. 실제 타일을 직접 움직여야 끝난다.
 * 판 상황은 커널의 표기법(fixtures)으로 만든다.
 */
import { gameOf, TS } from '../game/fixtures';
import { newGame, type GameEvent, type GameState, type Player } from '../game/engine';
import { analyzeSet } from '../game/sets';
import { CLASSIC_RULES } from '../game/rules';
import { randomSeed } from '../game/rng';

export interface Lesson {
  /** 지금 보여 줄 안내 문장 (i18n 키) */
  readonly text: (g: GameState) => string;
  readonly tip: string;
  readonly aiPlays: boolean;
  readonly build: () => GameState;
  readonly goal: (g: GameState, events: readonly GameEvent[]) => boolean;
}

const OPP = '휘기';

function withOpponent(g: GameState): GameState {
  const players = g.players.map((p, i): Player =>
    i === 0 ? { ...p, name: '나' } : { ...p, name: OPP, seat: 'ai', ai: 'beginner' },
  );
  return { ...g, players, rules: { ...g.rules, turnSeconds: null } };
}

const hasValid = (g: GameState, kind: 'run' | 'group'): boolean =>
  g.turn.work.sets.some((s) => {
    const a = analyzeSet(s.tiles);
    return a.ok && a.kind === kind;
  });

const committed = (events: readonly GameEvent[]): boolean => events.some((e) => e.type === 'played');

export const LESSONS: readonly Lesson[] = [
  {
    text: (g) => (hasValid(g, 'run') ? 'lesson.l1b' : 'lesson.l1'),
    tip: 'lesson.tip1',
    aiPlays: false,
    build: () => withOpponent(gameOf({ players: [{ rack: 'r3 r4 r5 k7 b7 o7 k12 b1', melded: false }, { rack: 'o1 o2' }], pool: 'k1 k2 k3' })),
    goal: (g) => hasValid(g, 'run') && hasValid(g, 'group'),
  },
  {
    text: () => 'lesson.l2',
    tip: 'lesson.tip2',
    aiPlays: false,
    build: () =>
      withOpponent(gameOf({ players: [{ rack: 'r10 r11 r12 b5 k5 o5 k1 b9', melded: false }, { rack: 'o1 o2' }], pool: 'k1 k2 k3' })),
    goal: (_g, e) => e.some((x) => x.type === 'melded'),
  },
  {
    text: () => 'lesson.l3',
    tip: 'lesson.tip3',
    aiPlays: false,
    build: () =>
      withOpponent(
        gameOf({
          players: [{ rack: 'b7 o9 k2 r13' }, { rack: 'o1 o2' }],
          table: ['b4 b5 b6', 'r9 b9 k9'],
          // 두 세트를 멀찍이 — 옆 칸에 놓은 타일이 다른 세트와 붙어 버리지 않게
          layout: [
            { row: 1, col: 1 },
            { row: 3, col: 1 },
          ],
          pool: 'k1 k2 k3',
        }),
      ),
    goal: (_g, e) => committed(e),
  },
  {
    text: () => 'lesson.l4',
    tip: 'lesson.tip4',
    aiPlays: false,
    build: () =>
      withOpponent(
        gameOf({ players: [{ rack: "r6' k1 b13" }, { rack: 'o1 o2' }], table: ['r4 r5 r6 r7 r8'], layout: [{ row: 1, col: 1 }], pool: 'k1 k2 k3' }),
      ),
    goal: (g, e) => committed(e) && g.table.filter((s) => analyzeSet(s.tiles).kind === 'run').length >= 2,
  },
  {
    text: () => 'lesson.l5',
    tip: 'lesson.tip5',
    aiPlays: false,
    build: () =>
      withOpponent(
        gameOf({ players: [{ rack: 'k3 o10 o11 b1' }, { rack: 'o1 o2' }], table: ['r3 b3 J'], layout: [{ row: 1, col: 1 }], pool: 'k1 k2 k3' }),
      ),
    goal: (g, e) => {
      if (!committed(e)) return false;
      const holder = g.table.find((s) => s.tiles.includes(104));
      return !!holder && !holder.tiles.some((t) => TS('r3 b3').includes(t));
    },
  },
  {
    text: () => 'lesson.l6',
    tip: 'lesson.tip6',
    aiPlays: true,
    build: () =>
      newGame({
        players: [
          { name: '나', seat: 'human' },
          { name: OPP, seat: 'ai', ai: 'beginner' },
        ],
        rules: { ...CLASSIC_RULES, turnSeconds: null },
        seed: randomSeed(),
      }),
    goal: (g) => g.phase === 'over',
  },
];
