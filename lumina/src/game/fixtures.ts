/**
 * 테스트·튜토리얼용 표기법.
 *   r=빨강 b=파랑 o=주황 k=검정, 숫자 1~13, 뒤에 ' 를 붙이면 두 번째 사본. J / J' = 조커 두 장.
 *   예) T('r7'), TS("r3 r4 r5"), TS("k7 k7'")
 */
import type { Color, TableSet, TileId } from './types';
import { numberId } from './tiles';
import { layoutSets, type Pos } from './board';
import { beginTurn, type Turn } from './turn';
import { CLASSIC_RULES, type RuleSet } from './rules';
import type { GameState, Player, PlayerStats } from './engine';

const COLOR_OF: Record<string, Color> = { r: 'red', b: 'blue', o: 'orange', k: 'black' };

export function T(code: string): TileId {
  const c = code.trim();
  if (c === 'J') return 104;
  if (c === "J'") return 105;
  const m = /^([rbok])(\d{1,2})('?)$/.exec(c);
  if (!m) throw new Error(`bad tile code ${code}`);
  const v = Number(m[2]);
  if (v < 1 || v > 13) throw new Error(`bad value ${code}`);
  return numberId(COLOR_OF[m[1] as string] as Color, v, m[3] ? 1 : 0);
}

export function TS(codes: string): TileId[] {
  return codes
    .split(/\s+/)
    .filter(Boolean)
    .map(T);
}

/** 시험용 테이블: 세트마다 id를 붙이고, 칸을 정해 주지 않은 세트는 보드에 위에서부터 차례로 놓는다 */
export function tableOf(sets: readonly string[], layout?: readonly (Pos | undefined)[]): TableSet[] {
  return layoutSets(sets.map((s, i) => ({ id: `s${i + 1}`, tiles: TS(s), ...(layout?.[i] ?? {}) })));
}

export function turnOf(o: { table?: readonly string[]; layout?: readonly (Pos | undefined)[]; rack: string; melded?: boolean; player?: number }): Turn {
  const table = tableOf(o.table ?? [], o.layout);
  return beginTurn(o.player ?? 0, table, TS(o.rack), o.melded ?? true, table.length + 1);
}

const EMPTY: PlayerStats = {
  tilesPlayed: 0,
  largestMove: 0,
  jokersPlayed: 0,
  rearrangements: 0,
  draws: 0,
  timeouts: 0,
  meldTurn: null,
  longestRun: 0,
  turns: 0,
};

/** 원하는 판 상황을 바로 만든다 */
export function gameOf(o: {
  players: readonly { rack: string; melded?: boolean; name?: string }[];
  table?: readonly string[];
  /** table의 세트마다 놓을 칸 (없으면 위에서부터 차례로) */
  layout?: readonly (Pos | undefined)[];
  pool?: string;
  current?: number;
  rules?: Partial<RuleSet>;
}): GameState {
  const rules = { ...CLASSIC_RULES, ...(o.rules ?? {}) };
  const table = tableOf(o.table ?? [], o.layout);
  const players: Player[] = o.players.map((p, i) => ({
    name: p.name ?? `P${i + 1}`,
    seat: 'human',
    rack: TS(p.rack),
    melded: p.melded ?? true,
  }));
  const current = o.current ?? 0;
  const cur = players[current] as Player;
  return {
    v: 1,
    rules,
    seed: 1,
    players,
    table,
    pool: TS(o.pool ?? ''),
    current,
    turn: beginTurn(current, table, cur.rack, cur.melded, table.length + 1),
    turnNo: 1,
    passes: 0,
    nextSetId: table.length + 1,
    phase: 'playing',
    log: [{ t: 'start', starter: current }],
    stats: players.map(() => EMPTY),
    firstDraw: { rounds: [], starter: current },
    result: null,
  };
}
