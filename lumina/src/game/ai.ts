/**
 * AI 플레이어 — 솔버 위에 얹은 "성격(정책)".
 * 어떤 성격이든 결과는 엔진의 propose → checkCommit을 통과해야만 커밋된다 (불법 수 불가).
 *
 *  하린 (beginner)  : 눈에 보이는 조합만. 테이블은 끝에 붙이기만, 쪼개지 않는다. 조커를 바로 쓴다. 가끔(18%) 놓친다.
 *  민재 (casual)    : 4장 그룹·긴 런처럼 여유 있는 세트만 손댄다. 조커는 아낀다. 드물게(5%) 놓친다.
 *  세현 (advanced)  : 테이블 전체를 재배열. 첫 등록은 필요한 만큼만, 조커는 끝까지 아낀다.
 *  이안 (expert)    : 전체 재배열 + 상대 랙 수를 읽는다. 누가 곧 끝낼 것 같으면 큰 숫자·조커부터 턴다.
 */
import type { AiLevel, TableSet, TileId } from './types';
import type { Rng } from './rng';
import type { GameState, Player } from './engine';
import { reduce } from './engine';
import { analyzeSet, arrange } from './sets';
import { isJoker, tile } from './tiles';
import { MAX_TILES, MAX_VALUE_W, solve, stabilize, setsPoints, type Weights } from './solver';
import { tilesOf } from './table';

export interface AiProfile {
  readonly level: AiLevel;
  readonly name: string;
  readonly style: string;
  readonly missRate: number;
  readonly thinkMs: readonly [number, number];
  readonly rearrange: 'none' | 'local' | 'full';
  readonly holdJokers: 'never' | 'always' | 'smart';
  readonly meld: 'dump' | 'minimal';
}

export const AI_PROFILES: Readonly<Record<AiLevel, AiProfile>> = {
  beginner: {
    level: 'beginner',
    name: '하린',
    style: '보이는 조합부터 차근차근',
    missRate: 0.18,
    thinkMs: [600, 1200],
    rearrange: 'none',
    holdJokers: 'never',
    meld: 'dump',
  },
  casual: {
    level: 'casual',
    name: '민재',
    style: '여유 있는 세트만 손대는 실속파',
    missRate: 0.05,
    thinkMs: [800, 1600],
    rearrange: 'local',
    holdJokers: 'always',
    meld: 'dump',
  },
  advanced: {
    level: 'advanced',
    name: '세현',
    style: '테이블 전체를 다시 짜는 설계자',
    missRate: 0,
    thinkMs: [1200, 2200],
    rearrange: 'full',
    holdJokers: 'always',
    meld: 'minimal',
  },
  expert: {
    level: 'expert',
    name: '이안',
    style: '상대 랙까지 읽는 승부사',
    missRate: 0,
    thinkMs: [1500, 2800],
    rearrange: 'full',
    holdJokers: 'smart',
    meld: 'minimal',
  },
};

export type AiDecision =
  | { readonly kind: 'play'; readonly sets: TileId[][]; readonly played: TileId[]; readonly meld: boolean }
  | { readonly kind: 'end' }
  | { readonly kind: 'draw' };

/** 붙이기 전후로 조커가 나타내는 타일이 그대로인가 (하우스 룰 "원래 타일만"에서 조커 뜻이 바뀌면 회수로 본다) */
function keepsJokerRoles(before: readonly TileId[], after: readonly TileId[]): boolean {
  const a = analyzeSet(before);
  if (!a.ok) return true;
  const b = analyzeSet(after);
  for (const [j, role] of a.jokers) {
    const r2 = b.jokers.get(j);
    if (!r2 || r2.value !== role.value || (role.color && r2.color && role.color !== r2.color)) return false;
  }
  return true;
}

/** 세트에 랙 타일을 끝에 붙이거나 4번째 색으로 더하기만 한다 (쪼개지 않음) */
export function extendOnly(
  sets: readonly (readonly TileId[])[],
  rack: readonly TileId[],
  allowJokers: boolean,
): { sets: TileId[][]; played: TileId[] } {
  const out = sets.map((s) => s.slice());
  const left = rack.filter((t) => allowJokers || !isJoker(t)).sort((a, b) => Number(isJoker(a)) - Number(isJoker(b)));
  const played: TileId[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < left.length && !changed; i++) {
      const t = left[i] as TileId;
      for (let k = 0; k < out.length; k++) {
        const cand = arrange([...(out[k] as TileId[]), t]);
        if (analyzeSet(cand).ok && keepsJokerRoles(out[k] as TileId[], cand)) {
          out[k] = cand;
          played.push(t);
          left.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return { sets: out, played };
}

/** 첫 등록: 랙 타일로만 기준 점수 이상. minimal이면 기준을 넘는 가장 적은 장수만 */
export function findMeld(
  rack: readonly TileId[],
  need: number,
  profile: AiProfile,
): { sets: TileId[][]; points: number; played: TileId[] } | null {
  const tryWith = (jokers: boolean): { sets: TileId[][]; points: number } | null => {
    const s = solve({ table: [], rack, weights: MAX_VALUE_W, rackJokers: jokers });
    if (!s || !s.sets.length) return null;
    return { sets: s.sets, points: setsPoints(s.sets) };
  };
  let best = profile.holdJokers === 'never' ? tryWith(true) : tryWith(false);
  if ((!best || best.points < need) && profile.holdJokers !== 'never') best = tryWith(true);
  if (!best || best.points < need) return null;
  // 전부 내서 랙을 비울 수 있으면 그게 최선
  const all = solve({ table: [], rack, weights: MAX_TILES });
  if (all && all.played.length === rack.length && setsPoints(all.sets) >= need) {
    return { sets: all.sets, points: setsPoints(all.sets), played: all.played };
  }
  let sets = best.sets;
  if (profile.meld === 'minimal' && sets.length > 1) {
    let pick: TileId[][] | null = null;
    let pickTiles = Infinity;
    const n = sets.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const chosen = sets.filter((_, i) => mask & (1 << i));
      const pts = setsPoints(chosen);
      const tiles = chosen.reduce((a, s) => a + s.length, 0);
      if (pts >= need && (tiles < pickTiles || (tiles === pickTiles && pts > setsPoints(pick ?? [])))) {
        pick = chosen;
        pickTiles = tiles;
      }
    }
    if (pick) sets = pick;
  }
  return { sets, points: setsPoints(sets), played: sets.flat() };
}

function weightsFor(profile: AiProfile, state: GameState, rng: Rng): Weights {
  const me = state.current;
  const threat = state.players.some((p, i) => i !== me && p.rack.length <= 3);
  const noise = 0.85 + rng.next() * 0.3; // 같은 상황에서도 매번 같은 수만 두지 않게
  let joker = 1000;
  if (profile.holdJokers === 'always') joker = -1500;
  if (profile.holdJokers === 'smart') joker = threat ? 1000 : -1500;
  const value = profile.level === 'expert' && threat ? 12 * noise : noise;
  return { tile: 1000, value, joker, jokerValue: 0 };
}

/** 민재용: 손대도 되는 세트 = 4장 그룹, 4장 이상 런 */
function isFlexible(set: TableSet): boolean {
  const a = analyzeSet(set.tiles);
  return a.ok && ((a.kind === 'group' && set.tiles.length === 4) || (a.kind === 'run' && set.tiles.length >= 4));
}

export function findPlay(
  state: GameState,
  profile: AiProfile,
  rng: Rng,
): { sets: TileId[][]; played: TileId[] } | null {
  const player = state.players[state.current] as Player;
  const rack = player.rack;
  const table = state.table;
  const original = table.map((s) => s.tiles);
  const rules = state.rules;
  // 조커 회수 제한 하우스 룰에서는 조커 세트를 통째로 고정하고 붙이기만 한다
  const jokerLocked = rules.jokerReplace === 'exact-tile' || rules.jokerSetLocked;
  const frozen = (s: TableSet): boolean => jokerLocked && s.tiles.some(isJoker);

  // 1) 랙을 다 비울 수 있으면 무조건 (모든 성격 공통 — 단 초보는 재배열 없이 가능한 경우만)
  if (profile.rearrange !== 'none') {
    const free = table.filter((s) => !frozen(s));
    const fixed = table.filter(frozen);
    const out = solve({ table: tilesOf(free), rack, weights: MAX_TILES });
    if (out && out.played.length === rack.length && !fixed.length) {
      return { sets: stabilize(out.sets, original), played: out.played };
    }
  }

  const w = weightsFor(profile, state, rng);
  let result: { sets: TileId[][]; played: TileId[] } | null = null;

  if (profile.rearrange === 'none') {
    const own = solve({ table: [], rack, weights: w });
    const newSets = own?.sets ?? [];
    const left = rack.filter((t) => !(own?.played ?? []).includes(t));
    const ext = extendOnly(original, left, true);
    result = { sets: [...ext.sets, ...newSets], played: [...(own?.played ?? []), ...ext.played] };
  } else {
    const pickable = table.filter((s) => !frozen(s) && (profile.rearrange === 'full' || isFlexible(s)));
    const kept = table.filter((s) => !pickable.includes(s));
    const out = solve({ table: tilesOf(pickable), rack, weights: w });
    if (out) {
      const left = rack.filter((t) => !out.played.includes(t));
      const ext = extendOnly(
        kept.map((s) => s.tiles),
        left,
        profile.holdJokers === 'never',
      );
      const arranged = stabilize(out.sets, pickable.map((s) => s.tiles));
      result = { sets: [...ext.sets, ...arranged], played: [...out.played, ...ext.played] };
    }
  }
  if (!result || !result.played.length) return null;
  return result;
}

/** 이번 차례에 무엇을 할지 — 결과는 반드시 validateDecision으로 한 번 더 확인해서 쓴다 */
export function decide(state: GameState, rng: Rng, profile?: AiProfile): AiDecision {
  const player = state.players[state.current] as Player;
  const prof = profile ?? AI_PROFILES[player.ai ?? 'casual'];
  const turn = state.turn;
  if (!player.melded) {
    const meld = findMeld(player.rack, state.rules.initialMeldPoints, prof);
    if (!meld) return { kind: 'draw' };
    const goesOut = meld.played.length === player.rack.length;
    if (!goesOut && rng.next() < prof.missRate) return { kind: 'draw' };
    return { kind: 'play', sets: [...state.table.map((s) => s.tiles.slice()), ...meld.sets], played: meld.played, meld: true };
  }
  const play = findPlay(state, prof, rng);
  if (!play) return turn.meldedNow ? { kind: 'end' } : { kind: 'draw' };
  const goesOut = play.played.length === player.rack.length;
  if (!goesOut && !turn.meldedNow && rng.next() < prof.missRate) return { kind: 'draw' };
  return { kind: 'play', sets: play.sets, played: play.played, meld: false };
}

/**
 * 결정을 엔진에 실제로 적용해 본다. 커밋까지 통과하면 그 결과 상태를, 아니면 null.
 * AI는 이 함수를 통과한 수만 둔다 — 불법 수가 테이블에 올라갈 길이 없다.
 */
export function applyDecision(state: GameState, d: AiDecision): GameState | null {
  if (d.kind === 'draw') {
    const r = reduce(state, { type: 'draw' });
    return r.ok ? r.state : null;
  }
  if (d.kind === 'end') {
    const r = reduce(state, { type: 'commit' });
    return r.ok ? r.state : null;
  }
  const p = reduce(state, { type: 'propose', sets: d.sets });
  if (!p.ok) return null;
  const c = reduce(p.state, { type: 'commit' });
  return c.ok ? c.state : null;
}

/** 안전한 AI 한 수: 결정이 거절되면 뽑기(또는 차례 끝)로 물러선다 */
export function playAiTurn(state: GameState, rng: Rng, profile?: AiProfile): { state: GameState; decision: AiDecision; fallback: boolean } {
  const d = decide(state, rng, profile);
  const next = applyDecision(state, d);
  if (next) return { state: next, decision: d, fallback: false };
  const safe: AiDecision = state.turn.meldedNow ? { kind: 'end' } : { kind: 'draw' };
  const s2 = applyDecision(state, safe);
  if (!s2) throw new Error('AI fallback failed');
  return { state: s2, decision: safe, fallback: true };
}

/** 사람처럼 보이는 생각 시간 */
export function thinkTime(profile: AiProfile, rng: Rng, speed = 1): number {
  const [a, b] = profile.thinkMs;
  return Math.round((a + (b - a) * rng.next()) * speed);
}

/** 조커를 제외한 가장 큰 숫자 (결과 연출용) */
export function highestTile(ids: readonly TileId[]): number {
  return ids.reduce((m, id) => {
    const t = tile(id);
    return t.kind === 'number' ? Math.max(m, t.value) : m;
  }, 0);
}
