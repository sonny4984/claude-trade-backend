/**
 * 바다거북 스프 규칙 — UI와 무관한 순수 함수. 모든 변화는 soupReduce()만 만든다.
 *  · 진행자(AI 또는 사람 한 명)만 전말을 안다. 나머지는 예/아니요로 답할 수 있는 질문을 던진다.
 *  · 답은 둘: 예 · 아니요.
 *  · 전말을 알 것 같으면 "정답"을 말한다 — 진행자가 맞음 · 거의 맞음 · 아니에요로 판정한다.
 *  · 힌트는 문제마다 셋, 하나씩 연다. 포기하면 전말을 공개한다.
 *  · 맞힌 사람이 점수를 얻는다: 힌트를 안 쓰면 3점, 하나 쓸 때마다 1점씩 줄어 최소 1점.
 *  · 한 번에 여러 문제를 이어서 푼다 (나온 문제는 다시 안 나온다).
 */
import { PUZZLES, puzzleById, type SoupLevel, type SoupPuzzle, type SoupSpice } from './puzzles';
import type { CharacterId } from '../characters/roster';

export type SoupAnswer = 'yes' | 'no';
export type SoupVerdict = 'correct' | 'close' | 'wrong';
export type SoupReply = SoupAnswer | SoupVerdict;

export const ANSWERS: readonly SoupAnswer[] = ['yes', 'no'];
export const VERDICTS: readonly SoupVerdict[] = ['correct', 'close', 'wrong'];

/** 글자 수 한도 (질문·정답) */
export const MAX_TEXT = 140;

export interface SoupEntry {
  readonly n: number;
  readonly by: number;
  readonly kind: 'ask' | 'guess';
  /** 빈 글이면 말로 한 질문 (사람 진행자가 답 단추만 누름) */
  readonly text: string;
  /** null이면 아직 답을 기다리는 중 */
  readonly reply: SoupReply | null;
  /** AI 진행자의 짧은 한마디 (전말은 말하지 않는다) */
  readonly note?: string;
  /** 이 기록으로 새로 찾은 핵심 (puzzle.keys 번호) */
  readonly hit?: readonly number[];
}

export interface SoupPlayer {
  readonly name: string;
  readonly character: CharacterId;
}

export interface SoupFilter {
  /** mild: 순한맛만 · all: 매운맛(죽음이 나오는 고전)까지 */
  readonly spice: 'mild' | 'all';
  /** 0이면 아무 난이도 */
  readonly level: 0 | SoupLevel;
}

export interface SoupState {
  readonly v: 1;
  readonly puzzle: string;
  /** ai: AI 진행자 · human: hostSeat 자리의 사람이 진행 */
  readonly host: 'ai' | 'human';
  readonly hostSeat: number | null;
  readonly players: readonly SoupPlayer[];
  readonly log: readonly SoupEntry[];
  /** 지금까지 연 힌트 수 (0~3) */
  readonly hints: number;
  readonly phase: 'play' | 'over';
  /** 맞힌 사람 (over인데 null이면 포기) */
  readonly solvedBy: number | null;
  readonly scores: readonly number[];
  /** 몇 번째 문제 */
  readonly round: number;
  /** 지금까지 나온 문제 (지금 문제 포함) */
  readonly played: readonly string[];
  readonly filter: SoupFilter;
  /** 지금까지 찾은 핵심 (puzzle.keys 번호) — 진척도. 예전 저장본엔 없다 */
  readonly found?: readonly number[];
  /** 다음에 물을 차례 (진행자는 빼고 돌아간다 — 정해진 규칙은 아니고 화면이 기본으로 고른다) */
  readonly turn: number;
}

export type SoupAction =
  | { readonly type: 'ask'; readonly by: number; readonly text: string }
  | { readonly type: 'guess'; readonly by: number; readonly text: string }
  | { readonly type: 'reply'; readonly n: number; readonly reply: SoupReply; readonly note?: string; readonly keys?: readonly number[] }
  /** 사람 진행자: 말로 들은 질문에 바로 답 (기록만 남긴다) */
  | { readonly type: 'quick'; readonly by: number; readonly reply: SoupAnswer }
  | { readonly type: 'hint' }
  | { readonly type: 'reveal' }
  | { readonly type: 'next'; readonly puzzle: string }
  /** 전말을 보지 않고 다른 문제로 (AI가 이 문제에 답하지 못할 때) — 점수·기록 없이 */
  | { readonly type: 'skip'; readonly puzzle: string };

export type SoupError = 'phase' | 'empty' | 'long' | 'who' | 'entry' | 'reply' | 'hints' | 'puzzle' | 'host';
export type SoupResult = { readonly ok: true; readonly state: SoupState } | { readonly ok: false; readonly error: SoupError };

export function pointsFor(hints: number): number {
  return Math.max(1, 3 - hints);
}

/** 이 조건에 맞는 문제들 */
export function candidates(filter: SoupFilter): SoupPuzzle[] {
  return PUZZLES.filter((p) => (filter.spice === 'all' || p.spice === 'mild') && (filter.level === 0 || p.level === filter.level));
}

/** 아직 안 나온 문제 중 하나 (다 나왔으면 처음부터 다시) — rnd는 0 이상 1 미만 */
export function pickPuzzle(filter: SoupFilter, played: readonly string[], rnd: number): SoupPuzzle | null {
  const all = candidates(filter);
  if (!all.length) return null;
  const fresh = all.filter((p) => !played.includes(p.id));
  const pool = fresh.length ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))] ?? null;
}

/** 진행자가 아닌, 묻고 맞히는 사람들 */
export function guessers(s: Pick<SoupState, 'players' | 'host' | 'hostSeat'>): number[] {
  return s.players.map((_, i) => i).filter((i) => !(s.host === 'human' && s.hostSeat === i));
}

function nextTurn(s: SoupState, after: number): number {
  const g = guessers(s);
  if (!g.length) return 0;
  const k = g.indexOf(after);
  return g[(k + 1) % g.length] ?? g[0] ?? 0;
}

export function newSoup(o: { players: readonly SoupPlayer[]; host: 'ai' | 'human'; hostSeat?: number | null; puzzle: string; filter: SoupFilter }): SoupState {
  if (o.players.length < 1 || o.players.length > 8) throw new Error('바다거북 스프는 1~8명');
  if (!puzzleById(o.puzzle)) throw new Error(`없는 문제 ${o.puzzle}`);
  const hostSeat = o.host === 'human' ? Math.max(0, Math.min(o.players.length - 1, o.hostSeat ?? 0)) : null;
  if (o.host === 'human' && o.players.length < 2) throw new Error('사람이 진행하려면 둘 이상');
  const base: SoupState = {
    v: 1,
    puzzle: o.puzzle,
    host: o.host,
    hostSeat,
    players: o.players,
    log: [],
    hints: 0,
    phase: 'play',
    solvedBy: null,
    scores: o.players.map(() => 0),
    round: 1,
    played: [o.puzzle],
    found: [],
    filter: o.filter,
    turn: 0,
  };
  return { ...base, turn: guessers(base)[0] ?? 0 };
}

const isGuesser = (s: SoupState, by: number): boolean => Number.isInteger(by) && guessers(s).includes(by);

function push(s: SoupState, e: Omit<SoupEntry, 'n'>): SoupState {
  const n = (s.log[s.log.length - 1]?.n ?? 0) + 1;
  return { ...s, log: [...s.log, { n, ...e }] };
}

export function soupReduce(s: SoupState, a: SoupAction): SoupResult {
  switch (a.type) {
    case 'ask':
    case 'guess': {
      if (s.phase !== 'play') return { ok: false, error: 'phase' };
      if (!isGuesser(s, a.by)) return { ok: false, error: 'who' };
      const text = typeof a.text === 'string' ? a.text.trim() : '';
      if (!text) return { ok: false, error: 'empty' };
      if (text.length > MAX_TEXT) return { ok: false, error: 'long' };
      const st = push(s, { by: a.by, kind: a.type, text, reply: null });
      return { ok: true, state: { ...st, turn: nextTurn(st, a.by) } };
    }
    case 'quick': {
      if (s.phase !== 'play') return { ok: false, error: 'phase' };
      if (s.host !== 'human') return { ok: false, error: 'host' };
      if (!isGuesser(s, a.by)) return { ok: false, error: 'who' };
      if (!ANSWERS.includes(a.reply)) return { ok: false, error: 'reply' };
      const st = push(s, { by: a.by, kind: 'ask', text: '', reply: a.reply });
      return { ok: true, state: { ...st, turn: nextTurn(st, a.by) } };
    }
    case 'reply': {
      if (s.phase !== 'play') return { ok: false, error: 'phase' };
      const e = s.log.find((x) => x.n === a.n);
      if (!e || e.reply !== null) return { ok: false, error: 'entry' };
      const okReply = e.kind === 'ask' ? ANSWERS.includes(a.reply as SoupAnswer) : VERDICTS.includes(a.reply as SoupVerdict);
      if (!okReply) return { ok: false, error: 'reply' };
      const note = typeof a.note === 'string' && a.note.trim() ? a.note.trim().slice(0, 80) : undefined;
      // 핵심은 "예"나 정답 쪽 판정일 때만 인정 (아니요로 핵심을 찾을 수는 없다)
      const nKeys = puzzleById(s.puzzle)?.keys.length ?? 0;
      const had = new Set(s.found ?? []);
      const keyOk = a.reply === 'yes' || a.reply === 'close' || a.reply === 'correct';
      const hit = keyOk && Array.isArray(a.keys) ? [...new Set(a.keys)].filter((k) => Number.isInteger(k) && k >= 0 && k < nKeys && !had.has(k)).sort((x, y) => x - y) : [];
      const log = s.log.map((x) => (x.n === a.n ? { ...x, reply: a.reply, ...(note ? { note } : {}), ...(hit.length ? { hit } : {}) } : x));
      let st: SoupState = { ...s, log, ...(hit.length ? { found: [...had, ...hit].sort((x, y) => x - y) } : {}) };
      if (e.kind === 'guess' && a.reply === 'correct') {
        st = { ...st, phase: 'over', solvedBy: e.by, scores: st.scores.map((v, i) => (i === e.by ? v + pointsFor(s.hints) : v)) };
      }
      return { ok: true, state: st };
    }
    case 'hint': {
      if (s.phase !== 'play') return { ok: false, error: 'phase' };
      if (s.hints >= 3) return { ok: false, error: 'hints' };
      return { ok: true, state: { ...s, hints: s.hints + 1 } };
    }
    case 'reveal': {
      if (s.phase !== 'play') return { ok: false, error: 'phase' };
      return { ok: true, state: { ...s, phase: 'over', solvedBy: null } };
    }
    case 'next':
    case 'skip': {
      if (s.phase !== (a.type === 'next' ? 'over' : 'play')) return { ok: false, error: 'phase' };
      if (!puzzleById(a.puzzle)) return { ok: false, error: 'puzzle' };
      const st: SoupState = { ...s, puzzle: a.puzzle, log: [], found: [], hints: 0, phase: 'play', solvedBy: null, round: s.round + 1, played: [...s.played.filter((x) => x !== a.puzzle), a.puzzle] };
      return { ok: true, state: st };
    }
    default:
      return { ok: false, error: 'phase' };
  }
}

/** 아직 답을 못 받은 기록들 (오래된 것부터) */
export function pending(s: SoupState): SoupEntry[] {
  return s.log.filter((e) => e.reply === null);
}

/** 문제 수 세기 (질문 수 · 예라는 답 수) — 결과 화면용 */
export function tally(s: SoupState): { asks: number; yes: number; guesses: number } {
  let asks = 0;
  let yes = 0;
  let guesses = 0;
  for (const e of s.log) {
    if (e.kind === 'ask') {
      asks++;
      if (e.reply === 'yes') yes++;
    } else guesses++;
  }
  return { asks, yes, guesses };
}

/** 저장본·방 문서 검사 */
export function validSoup(x: unknown): x is SoupState {
  const s = x as SoupState;
  if (!s || s.v !== 1 || !puzzleById(s.puzzle) || !Array.isArray(s.players) || !s.players.length || s.players.length > 8) return false;
  if (s.host !== 'ai' && s.host !== 'human') return false;
  if (s.host === 'human' && (!Number.isInteger(s.hostSeat) || (s.hostSeat as number) < 0 || (s.hostSeat as number) >= s.players.length)) return false;
  if (!Array.isArray(s.log) || !Array.isArray(s.scores) || s.scores.length !== s.players.length || !Array.isArray(s.played)) return false;
  if (s.phase !== 'play' && s.phase !== 'over') return false;
  if (!Number.isInteger(s.hints) || s.hints < 0 || s.hints > 3) return false;
  return s.log.every((e) => e && Number.isInteger(e.n) && Number.isInteger(e.by) && (e.kind === 'ask' || e.kind === 'guess') && typeof e.text === 'string');
}

export type { SoupSpice };
