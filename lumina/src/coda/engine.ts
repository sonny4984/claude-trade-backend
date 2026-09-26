/**
 * 다빈치 코드 규칙 커널 — UI와 무관한 순수 함수. 모든 수는 codaReduce()만 판정한다.
 *
 * 타일: 검정·하양 0~11 각 12장 + (선택) 조커 2장(검정 하나, 하양 하나) = 24/26장.
 *  · 2~3인은 4장, 4인은 3장씩 받는다. 시작패에는 조커가 없다(배분한 뒤 더미에 섞는다).
 *  · 자기 줄은 작은 수가 왼쪽. 같은 수면 검정이 왼쪽. 조커는 아무 자리에나 둘 수 있다.
 *  · 차례: 더미에서 한 장 뽑아 혼자 본다 → 상대의 숨은 타일 하나를 가리켜 숫자를 말한다.
 *    맞으면 그 타일이 공개되고, 더 맞힐지 멈출지 고른다. 멈추면 뽑은 타일을 숨긴 채 제자리에 끼운다.
 *    틀리면 뽑은 타일을 공개한 채 제자리에 끼우고 차례가 끝난다.
 *  · 더미가 비면 뽑지 않고 추리한다. 틀리면 자기 숨은 타일 하나를 골라 공개한다.
 *  · 줄이 모두 공개되면 탈락. 마지막까지 숨은 타일이 남은 사람이 이긴다.
 */
import { createRng, shuffle } from '../game/rng';
import type { AiLevel } from '../game/types';

export type CodaColor = 'black' | 'white';
/** 0~12 검정(12 = 검정 조커), 13~25 하양(25 = 하양 조커) */
export type CodaTileId = number;
/** 추리할 때 말하는 값: 숫자 0~11 또는 조커 */
export type CodaGuess = number | 'joker';

export const CODA_JOKER = 12;
export const BLACK_JOKER: CodaTileId = CODA_JOKER;
export const WHITE_JOKER: CodaTileId = 13 + CODA_JOKER;

export function codaColor(id: CodaTileId): CodaColor {
  return id < 13 ? 'black' : 'white';
}

/** 숫자 (조커는 null) */
export function codaValue(id: CodaTileId): number | null {
  const v = id % 13;
  return v === CODA_JOKER ? null : v;
}

export function codaId(color: CodaColor, value: number | null): CodaTileId {
  return (color === 'black' ? 0 : 13) + (value === null ? CODA_JOKER : value);
}

export function isCodaJoker(id: CodaTileId): boolean {
  return id % 13 === CODA_JOKER;
}

/** 줄 순서의 기준: 숫자 × 2 + (검정 0, 하양 1). 조커는 null (어디든 된다) */
export function codaKey(id: CodaTileId): number | null {
  const v = codaValue(id);
  return v === null ? null : v * 2 + (codaColor(id) === 'black' ? 0 : 1);
}

export function codaTiles(jokers: boolean): CodaTileId[] {
  const out: CodaTileId[] = [];
  for (let id = 0; id < 26; id++) if (jokers || !isCodaJoker(id)) out.push(id);
  return out;
}

/** 추리 값이 이 타일과 맞는가 */
export function guessMatches(id: CodaTileId, value: CodaGuess): boolean {
  const v = codaValue(id);
  return value === 'joker' ? v === null : v === value;
}

/** 이 타일을 말할 때 쓰는 값 */
export function guessOf(id: CodaTileId): CodaGuess {
  return codaValue(id) ?? 'joker';
}

export interface CodaSlot {
  readonly tile: CodaTileId;
  readonly revealed: boolean;
  /** 이 타일에 대해 틀렸던 추리 값들 (모두가 아는 공개 정보) */
  readonly misses: readonly CodaGuess[];
}

export interface CodaStats {
  readonly guesses: number;
  readonly correct: number;
  readonly bestStreak: number;
}

export interface CodaPlayer {
  readonly name: string;
  readonly seat: 'human' | 'ai';
  readonly ai?: AiLevel;
  readonly row: readonly CodaSlot[];
  readonly out: boolean;
  readonly stats: CodaStats;
}

export type CodaPhase = 'guess' | 'decide' | 'place' | 'reveal-own' | 'over';

export interface CodaLogEntry {
  readonly turn: number;
  readonly p: number;
  readonly target: number;
  readonly color: CodaColor;
  readonly value: CodaGuess;
  readonly hit: boolean;
}

export interface CodaState {
  readonly v: 1;
  readonly seed: number;
  readonly jokers: boolean;
  readonly players: readonly CodaPlayer[];
  readonly pool: readonly CodaTileId[];
  readonly current: number;
  readonly phase: CodaPhase;
  /** 이번 차례에 뽑아 혼자 보고 있는 타일 (더미가 비었으면 null) */
  readonly drawn: CodaTileId | null;
  /** place 단계에서 뽑은 타일을 공개하며 놓는가 (틀렸을 때) */
  readonly placeRevealed: boolean;
  /** 이번 차례에 연속으로 맞힌 수 */
  readonly streak: number;
  readonly turnNo: number;
  readonly winner: number | null;
  readonly log: readonly CodaLogEntry[];
}

export type CodaAction =
  | { readonly type: 'guess'; readonly target: number; readonly index: number; readonly value: CodaGuess }
  | { readonly type: 'continue' }
  | { readonly type: 'stop' }
  | { readonly type: 'place'; readonly index: number }
  | { readonly type: 'reveal-own'; readonly index: number };

export type CodaEvent =
  | { readonly type: 'turn'; readonly p: number; readonly drew: boolean }
  | { readonly type: 'hit'; readonly p: number; readonly target: number; readonly index: number; readonly value: CodaGuess; readonly tile: CodaTileId; readonly streak: number }
  | { readonly type: 'miss'; readonly p: number; readonly target: number; readonly index: number; readonly value: CodaGuess }
  | { readonly type: 'placed'; readonly p: number; readonly index: number; readonly revealed: boolean; readonly tile: CodaTileId | null }
  | { readonly type: 'reveal-own'; readonly p: number; readonly index: number; readonly tile: CodaTileId }
  | { readonly type: 'out'; readonly p: number }
  | { readonly type: 'over'; readonly winner: number };

export type CodaError = 'phase' | 'target' | 'slot' | 'value' | 'index';

export type CodaResult = { readonly ok: true; readonly state: CodaState; readonly events: readonly CodaEvent[] } | { readonly ok: false; readonly error: CodaError };

export interface CodaSeat {
  readonly name: string;
  readonly seat: 'human' | 'ai';
  readonly ai?: AiLevel;
}

const LOG_MAX = 80;

// ─────────────────────────────── 줄 다루기 ───────────────────────────────

/** 이 타일을 줄에 끼울 수 있는 자리들 (조커 때문에 여러 곳일 수 있다) */
export function validSlots(row: readonly CodaSlot[], tile: CodaTileId): number[] {
  const k = codaKey(tile);
  const n = row.length;
  if (k === null) return Array.from({ length: n + 1 }, (_, i) => i);
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const kk = codaKey((row[i] as CodaSlot).tile);
    if (kk !== null && kk < k) lo = i + 1;
  }
  let hi = n;
  for (let i = n - 1; i >= 0; i--) {
    const kk = codaKey((row[i] as CodaSlot).tile);
    if (kk !== null && kk > k) hi = i;
  }
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function insertAt(row: readonly CodaSlot[], index: number, slot: CodaSlot): CodaSlot[] {
  return [...row.slice(0, index), slot, ...row.slice(index)];
}

export function hiddenCount(p: CodaPlayer): number {
  return p.row.reduce((n, s) => n + (s.revealed ? 0 : 1), 0);
}

export function activePlayers(s: CodaState): number[] {
  return s.players.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
}

function withPlayer(s: CodaState, i: number, patch: Partial<CodaPlayer>): CodaState {
  return { ...s, players: s.players.map((p, k) => (k === i ? { ...p, ...patch } : p)) };
}

function withSlot(s: CodaState, p: number, index: number, patch: Partial<CodaSlot>): CodaState {
  const pl = s.players[p] as CodaPlayer;
  return withPlayer(s, p, { row: pl.row.map((slot, k) => (k === index ? { ...slot, ...patch } : slot)) });
}

// ─────────────────────────────── 시작 ───────────────────────────────

function beginTurn(s: CodaState, p: number, events: CodaEvent[]): CodaState {
  let pool = s.pool;
  let drawn: CodaTileId | null = null;
  if (pool.length) {
    drawn = pool[pool.length - 1] as CodaTileId;
    pool = pool.slice(0, -1);
  }
  events.push({ type: 'turn', p, drew: drawn !== null });
  return { ...s, pool, drawn, current: p, phase: 'guess', placeRevealed: false, streak: 0, turnNo: s.turnNo + 1 };
}

export function newCoda(o: { seats: readonly CodaSeat[]; jokers: boolean; seed: number; first?: number }): CodaState {
  const n = o.seats.length;
  if (n < 2 || n > 4) throw new Error('다빈치 코드는 2~4명이 둡니다');
  const rng = createRng(o.seed);
  const numbers = shuffle(codaTiles(false), rng);
  const per = n >= 4 ? 3 : 4;
  const byKey = (a: CodaTileId, b: CodaTileId): number => (codaKey(a) as number) - (codaKey(b) as number);
  const players: CodaPlayer[] = o.seats.map((seat, i) => ({
    name: seat.name,
    seat: seat.seat,
    ...(seat.ai ? { ai: seat.ai } : {}),
    row: numbers
      .slice(i * per, (i + 1) * per)
      .sort(byKey)
      .map((tile) => ({ tile, revealed: false, misses: [] })),
    out: false,
    stats: { guesses: 0, correct: 0, bestStreak: 0 },
  }));
  const rest = numbers.slice(n * per);
  const pool = shuffle(o.jokers ? [...rest, BLACK_JOKER, WHITE_JOKER] : rest, rng);
  const first = o.first !== undefined && o.first >= 0 && o.first < n ? o.first : rng.int(n);
  const base: CodaState = {
    v: 1,
    seed: o.seed,
    jokers: o.jokers,
    players,
    pool,
    current: first,
    phase: 'guess',
    drawn: null,
    placeRevealed: false,
    streak: 0,
    turnNo: 0,
    winner: null,
    log: [],
  };
  return beginTurn(base, first, []);
}

// ─────────────────────────────── 진행 ───────────────────────────────

/** 모두 공개된 사람을 탈락시키고, 한 명만 남으면 끝낸다. 끝났으면 true */
function settle(s: CodaState, events: CodaEvent[]): { state: CodaState; over: boolean } {
  let st = s;
  st.players.forEach((p, i) => {
    if (!p.out && hiddenCount(p) === 0) {
      st = withPlayer(st, i, { out: true });
      events.push({ type: 'out', p: i });
    }
  });
  const alive = activePlayers(st);
  if (alive.length <= 1) {
    const winner = alive[0] ?? st.current;
    events.push({ type: 'over', winner });
    return { state: { ...st, phase: 'over', winner }, over: true };
  }
  return { state: st, over: false };
}

function endTurn(s: CodaState, events: CodaEvent[]): CodaState {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const p = (s.current + k) % n;
    if (!(s.players[p] as CodaPlayer).out) return beginTurn(s, p, events);
  }
  return s;
}

/** 뽑은 타일을 끼운다. 자리가 하나뿐이면 바로, 여러 곳이면 place 단계로 */
function placeDrawn(s: CodaState, revealed: boolean, events: CodaEvent[]): CodaState {
  if (s.drawn === null) return endTurn(s, events);
  const me = s.players[s.current] as CodaPlayer;
  const slots = validSlots(me.row, s.drawn);
  if (slots.length === 1) return finishPlace(s, slots[0] as number, revealed, events);
  return { ...s, phase: 'place', placeRevealed: revealed };
}

function finishPlace(s: CodaState, index: number, revealed: boolean, events: CodaEvent[]): CodaState {
  const tile = s.drawn as CodaTileId;
  const me = s.players[s.current] as CodaPlayer;
  let st = withPlayer(s, s.current, { row: insertAt(me.row, index, { tile, revealed, misses: [] }) });
  st = { ...st, drawn: null, placeRevealed: false };
  events.push({ type: 'placed', p: s.current, index, revealed, tile: revealed ? tile : null });
  const r = settle(st, events);
  return r.over ? r.state : endTurn(r.state, events);
}

function statsAfter(p: CodaPlayer, hit: boolean, streak: number): CodaStats {
  return {
    guesses: p.stats.guesses + 1,
    correct: p.stats.correct + (hit ? 1 : 0),
    bestStreak: Math.max(p.stats.bestStreak, hit ? streak : 0),
  };
}

export function codaReduce(s: CodaState, a: CodaAction): CodaResult {
  const events: CodaEvent[] = [];
  const me = s.players[s.current] as CodaPlayer;
  switch (a.type) {
    case 'guess': {
      if (s.phase !== 'guess') return { ok: false, error: 'phase' };
      const t = s.players[a.target];
      if (!t || a.target === s.current || t.out) return { ok: false, error: 'target' };
      const slot = t.row[a.index];
      if (!slot || slot.revealed) return { ok: false, error: 'slot' };
      const okValue = a.value === 'joker' ? s.jokers : Number.isInteger(a.value) && a.value >= 0 && a.value <= 11;
      if (!okValue) return { ok: false, error: 'value' };
      const hit = guessMatches(slot.tile, a.value);
      const streak = hit ? s.streak + 1 : 0;
      let st = withPlayer(s, s.current, { stats: statsAfter(me, hit, streak) });
      const entry: CodaLogEntry = { turn: s.turnNo, p: s.current, target: a.target, color: codaColor(slot.tile), value: a.value, hit };
      st = { ...st, streak, log: [...st.log, entry].slice(-LOG_MAX) };
      if (hit) {
        st = withSlot(st, a.target, a.index, { revealed: true });
        events.push({ type: 'hit', p: s.current, target: a.target, index: a.index, value: a.value, tile: slot.tile, streak });
        const r = settle(st, events);
        if (r.over) return { ok: true, state: r.state, events };
        return { ok: true, state: { ...r.state, phase: 'decide' }, events };
      }
      st = withSlot(st, a.target, a.index, { misses: [...slot.misses, a.value] });
      events.push({ type: 'miss', p: s.current, target: a.target, index: a.index, value: a.value });
      if (st.drawn !== null) return { ok: true, state: placeDrawn(st, true, events), events };
      // 더미가 비었다: 자기 숨은 타일 하나를 공개
      const hidden = me.row.map((x, i) => (x.revealed ? -1 : i)).filter((i) => i >= 0);
      if (hidden.length === 1) return { ok: true, state: revealOwn(st, hidden[0] as number, events), events };
      return { ok: true, state: { ...st, phase: 'reveal-own' }, events };
    }
    case 'continue': {
      if (s.phase !== 'decide') return { ok: false, error: 'phase' };
      return { ok: true, state: { ...s, phase: 'guess' }, events };
    }
    case 'stop': {
      if (s.phase !== 'decide') return { ok: false, error: 'phase' };
      return { ok: true, state: placeDrawn(s, false, events), events };
    }
    case 'place': {
      if (s.phase !== 'place' || s.drawn === null) return { ok: false, error: 'phase' };
      if (!validSlots(me.row, s.drawn).includes(a.index)) return { ok: false, error: 'index' };
      return { ok: true, state: finishPlace(s, a.index, s.placeRevealed, events), events };
    }
    case 'reveal-own': {
      if (s.phase !== 'reveal-own') return { ok: false, error: 'phase' };
      const slot = me.row[a.index];
      if (!slot || slot.revealed) return { ok: false, error: 'index' };
      return { ok: true, state: revealOwn(s, a.index, events), events };
    }
    default:
      return { ok: false, error: 'phase' };
  }
}

function revealOwn(s: CodaState, index: number, events: CodaEvent[]): CodaState {
  const me = s.players[s.current] as CodaPlayer;
  const slot = me.row[index] as CodaSlot;
  const st = withSlot(s, s.current, index, { revealed: true });
  events.push({ type: 'reveal-own', p: s.current, index, tile: slot.tile });
  const r = settle(st, events);
  return r.over ? r.state : endTurn(r.state, events);
}

// ─────────────────────────────── 검사 (테스트·복구용) ───────────────────────────────

/** 규칙상 항상 참이어야 하는 것들. 문제가 있으면 설명 문자열 목록 */
export function codaInvariants(s: CodaState): string[] {
  const issues: string[] = [];
  const seen = new Map<CodaTileId, number>();
  const count = (t: CodaTileId): void => {
    seen.set(t, (seen.get(t) ?? 0) + 1);
  };
  s.players.forEach((p) => p.row.forEach((x) => count(x.tile)));
  s.pool.forEach(count);
  if (s.drawn !== null) count(s.drawn);
  const all = codaTiles(s.jokers);
  for (const t of all) if (seen.get(t) !== 1) issues.push(`타일 ${t}: ${seen.get(t) ?? 0}번`);
  for (const t of seen.keys()) if (!all.includes(t)) issues.push(`없는 타일 ${t}`);
  s.players.forEach((p, i) => {
    let last = -1;
    for (const x of p.row) {
      const k = codaKey(x.tile);
      if (k === null) continue;
      if (k <= last) issues.push(`${i}번 줄 순서`);
      last = k;
    }
    if (p.out !== (hiddenCount(p) === 0)) issues.push(`${i}번 탈락 표시`);
  });
  if (s.phase === 'over' && s.winner === null) issues.push('승자 없음');
  if (s.phase !== 'over' && activePlayers(s).length < 2) issues.push('끝났어야 함');
  return issues;
}
