/**
 * 게임 스토어 — UI와 커널 사이의 다리.
 * 규칙 판정은 전부 커널(reduce)이 하고, 여기서는 순서·연출·저장만 맡는다.
 */
import { create } from 'zustand';
import {
  AI_PROFILES,
  decide,
  newMatch,
  nextGame as nextGameOf,
  recordGame,
  reduce,
  rematch as rematchOf,
  randomSeed,
  createRng,
  computeHint,
  canMoveTile,
  quickTargets,
  isChanged,
  checkCommit,
  compareByColor,
  compareByValue,
  solveRack,
  analyzeSet,
  thinkTime,
  COLORS,
  type AiDecision,
  type GameAction,
  type GameEvent,
  type GameState,
  type Hint,
  type MatchState,
  type MoveTarget,
  type TileId,
  type PlayerSetup,
  type CommitCheck,
} from '../game';
import { TILE_COUNT, tile } from '../game/tiles';
import { CLASSIC_RULES } from '../game/rules';
import { readJSON, removeKey, throttledWriter } from './storage';
import { aiSpeedFactor, prefersReducedMotion, useSettings, type SetupConfig } from './settings';
import { useStats } from './stats';
import { isCharacterId, type CharacterId } from '../characters/roster';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import * as flip from '../ui/flip';
import { commitIssueText, subj, tileLabel, translate } from '../i18n';
import { LESSONS } from '../lessons/lessons';
import { bridge, type OnlineInfo, type TableDoc } from '../net/bridge';

export type Screen = 'home' | 'setup-solo' | 'setup-local' | 'game' | 'settings' | 'stats' | 'rules' | 'lessons' | 'coda-setup' | 'coda' | 'online' | 'gomoku-setup' | 'gomoku' | 'fireice-setup' | 'fireice' | 'mafia-setup' | 'mafia';
export type Overlay = null | 'menu' | 'gameover' | 'hint' | 'share' | 'confirm-draw' | 'confirm-quit' | 'lesson-done';

export interface SeatMeta {
  readonly character: CharacterId;
}

export interface Session {
  readonly v: 1;
  readonly mode: 'solo' | 'local' | 'lesson' | 'online';
  readonly lesson: number | null;
  readonly match: MatchState;
  readonly seatsMeta: readonly SeatMeta[];
  readonly rackOrder: readonly (readonly TileId[])[];
  readonly drawn: readonly (readonly TileId[])[];
  readonly startedAt: number;
  /** 판이 끝난 시각 (진행 중이면 없음) */
  readonly endedAt?: number | null;
  readonly hintsLeft: number;
  readonly timerLeftMs: number | null;
  /** 온라인 대전이면 방 코드·역할·내 자리 */
  readonly online?: OnlineInfo | null;
}

/** 3D 무대의 캐릭터 반응 */
export type ReactionKind = 'think' | 'play' | 'combo' | 'draw' | 'win' | 'lose' | 'nod' | 'surprise' | 'meld' | 'idle';
export interface Reaction {
  readonly id: number;
  readonly seat: number;
  readonly kind: ReactionKind;
}

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'warn' | 'good' | 'bad';
}

interface State {
  screen: Screen;
  /** 바로 전 화면 (규칙·설정에서 돌아갈 곳) */
  prevScreen: Screen;
  session: Session | null;
  selection: TileId[];
  curtain: boolean;
  overlay: Overlay;
  hint: { level: 0 | 1 | 2 | 3; data: Hint | null };
  toast: Toast | null;
  ai: { seat: number; phase: 'thinking' | 'moving' } | null;
  deadline: number | null;
  splitSet: string | null;
  layoutTick: number;
  reactions: Reaction[];
  lastEventText: string | null;
  shake: { id: number; tiles: TileId[] } | null;
  lessonGoal: boolean;
  /** 온라인 참가자: 방장에게 보낸 수의 답을 기다리는 중 */
  waiting: boolean;
}

interface Actions {
  go: (screen: Screen) => void;
  startMatch: (cfg: SetupConfig) => void;
  startLesson: (i: number) => void;
  resume: () => boolean;
  quit: () => void;
  reveal: () => void;
  act: (action: GameAction, opts?: { noCapture?: boolean; quiet?: boolean }) => boolean;
  select: (id: TileId) => void;
  clearSelection: () => void;
  moveSelectionTo: (to: MoveTarget) => void;
  dropTiles: (tiles: TileId[], to: MoveTarget | { kind: 'swap'; joker: TileId } | { kind: 'rack-order'; index: number }) => boolean;
  quickPlay: (id: TileId) => void;
  sortRack: (mode: 'color' | 'number' | 'smart') => void;
  commit: () => void;
  draw: (force?: boolean) => void;
  requestHint: () => void;
  applyHint: () => void;
  closeOverlay: () => void;
  openMenu: () => void;
  nextGame: () => void;
  rematch: () => void;
  tick: () => void;
  setSplit: (setId: string | null) => void;
  toastMsg: (text: string, tone?: Toast['tone']) => void;
  shakeTiles: (tiles: TileId[]) => void;
  nextLesson: () => void;
  /** 온라인 — 방장: 로비의 자리로 판 시작 */
  startOnline: (table: TableDoc, info: OnlineInfo) => void;
  /** 온라인 — 방장: 참가자가 보낸 수 (틀리면 false) */
  applyRemote: (seat: number, payload: unknown) => boolean;
  /** 온라인 — 참가자(또는 다시 들어온 방장): 방에 올라온 판을 받는다 */
  adoptRemote: (payload: unknown, events: readonly unknown[], info: OnlineInfo) => void;
  /** 온라인 — 방장: 나간 친구 자리를 AI가 이어 둔다 */
  seatToAi: (seat: number) => boolean;
}

const SESSION_KEY = 'lumina.session.v1';
const saveSession = throttledWriter(SESSION_KEY, 300);
let toastSeq = 0;
let reactionSeq = 0;
let aiToken = 0;
let lastTickSecond = -1;
/** 주소의 ?seed=N 으로 판을 고정할 수 있다 (테스트·같은 판 다시 두기) */
function urlSeed(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('seed');
    if (!v || !/^\d{1,9}$/.test(v)) return null;
    const n = Number(v);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
const aiRng = createRng(urlSeed() ?? randomSeed());

function lang(): 'ko' | 'en' {
  return useSettings.getState().lang;
}
function t(path: string, params?: Record<string, string | number>): string {
  return translate(lang(), path, params);
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────── 도우미 ───────────────────────────────

/** 이 기기가 둘 차례인가 (온라인이면 내 자리 차례만) */
export function currentSeatIsHuman(s: Session): boolean {
  const g = s.match.game;
  if (s.online) return g.current === s.online.mySeat;
  return s.match.seats[g.current]?.seat === 'human';
}

/** 이 기기에서 "나"인 자리 (기록·결과 화면) */
export function mySeatOf(s: Session): number {
  if (s.online) return s.online.mySeat;
  return Math.max(0, s.match.seats.findIndex((p) => p.seat === 'human'));
}

/** 판을 방에 올릴 때 (이 기기에만 의미 있는 값은 뺀다) */
function payloadOf(s: Session): Session {
  const g = s.match.game;
  // 되돌리기 기록은 둔 사람 기기에만 있으면 된다 — 문서 크기를 줄인다
  const turn = { ...g.turn, past: [], future: [] };
  return { ...s, match: { ...s.match, game: { ...g, turn } }, rackOrder: s.match.game.players.map(() => []), hintsLeft: 0, online: null, timerLeftMs: null };
}

/** 방장에게 보낼 수 (참가자 → 방장) */
type RemoteMove = { readonly type: 'commit'; readonly sets: readonly (readonly TileId[])[] } | { readonly type: 'draw' };

function isRemoteMove(x: unknown): x is RemoteMove {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  if (a.type === 'draw') return true;
  if (a.type !== 'commit' || !Array.isArray(a.sets) || a.sets.length > 60) return false;
  return a.sets.every((st) => Array.isArray(st) && st.length <= 13 && st.every((id) => Number.isInteger(id) && id >= 0 && id < TILE_COUNT));
}

/** 방에 알릴 만한 변화인지 (차례 안의 타일 옮기기는 올리지 않는다) */
const PUBLISHED_EVENTS = new Set<GameEvent['type']>(['melded', 'played', 'drew', 'passed', 'timeout', 'turn', 'over']);

function humanCount(s: Session): number {
  return s.match.seats.filter((p) => p.seat === 'human').length;
}

/** 함께 두기에서 사람이 둘 이상이면 차례마다 가림막 */
function needsCurtain(s: Session): boolean {
  return s.mode === 'local' && humanCount(s) >= 2 && currentSeatIsHuman(s) && s.match.game.phase === 'playing';
}

function sortIds(ids: readonly TileId[], mode: 'color' | 'number'): TileId[] {
  return ids.slice().sort(mode === 'color' ? compareByColor : compareByValue);
}

/** 스마트 정렬: 이미 되는 세트끼리 붙이고, 남은 건 색깔순 */
export function smartOrder(ids: readonly TileId[]): { order: TileId[]; clusters: TileId[][] } {
  const sol = solveRack(ids);
  const clusters: TileId[][] = [];
  const used = new Set<TileId>();
  if (sol) {
    const sets = sol.sets.slice().sort((a, b) => {
      const A = analyzeSet(a);
      const B = analyzeSet(b);
      const ka = A.kind === 'run' ? COLORS.indexOf(A.color ?? 'red') * 20 + (A.start ?? 0) : 100 + (A.value ?? 0);
      const kb = B.kind === 'run' ? COLORS.indexOf(B.color ?? 'red') * 20 + (B.start ?? 0) : 100 + (B.value ?? 0);
      return ka - kb;
    });
    for (const s of sets) {
      clusters.push(s);
      s.forEach((x) => used.add(x));
    }
  }
  const rest = sortIds(
    ids.filter((x) => !used.has(x)),
    'color',
  );
  return { order: [...clusters.flat(), ...rest], clusters };
}

/** 랙 표시 순서를 실제 랙 내용에 맞춘다 (새 타일은 뒤에) */
function syncOrder(order: readonly TileId[], rack: readonly TileId[]): TileId[] {
  const inRack = new Set(rack);
  const kept = order.filter((x) => inRack.has(x));
  const seen = new Set(kept);
  return [...kept, ...rack.filter((x) => !seen.has(x))];
}

/** 현재 차례 사람의 작업 중인 랙 (표시 순서대로) */
export function visibleRack(s: Session): TileId[] {
  const g = s.match.game;
  const order = s.rackOrder[g.current] ?? [];
  return syncOrder(order, g.turn.work.rack);
}

function validSession(x: unknown): x is Session {
  try {
    const s = x as Session;
    if (!s || s.v !== 1 || !s.match || s.match.v !== 1) return false;
    const g = s.match.game;
    if (!g || g.v !== 1 || !Array.isArray(g.players) || g.players.length < 2) return false;
    if (!Array.isArray(s.seatsMeta) || s.seatsMeta.length !== g.players.length) return false;
    if (!Array.isArray(s.rackOrder) || !Array.isArray(s.drawn)) return false;
    if (!s.seatsMeta.every((m) => isCharacterId(m.character))) return false;
    // 타일 보존: 더미 + 다른 사람 랙 + 현재 작업본(테이블·랙·작업대)이 106장, 중복 없음
    const w = g.turn.work;
    const all: TileId[] = [...g.pool, ...w.rack, ...w.staging, ...w.sets.flatMap((st) => st.tiles)];
    g.players.forEach((p, i) => {
      if (i !== g.current) all.push(...p.rack);
    });
    if (all.length !== TILE_COUNT || new Set(all).size !== TILE_COUNT) return false;
    return all.every((id) => Number.isInteger(id) && id >= 0 && id < TILE_COUNT);
  } catch {
    return false;
  }
}

function seatsFrom(cfg: SetupConfig): { seats: PlayerSetup[]; meta: SeatMeta[] } {
  return {
    seats: cfg.seats.map((s) => ({ name: s.name, seat: s.kind, ...(s.kind === 'ai' ? { ai: s.level } : {}) })),
    meta: cfg.seats.map((s) => ({ character: s.character })),
  };
}

function initialOrders(m: MatchState): TileId[][] {
  const mode = useSettings.getState().autoSort;
  return m.game.players.map((p) => (mode === 'off' ? p.rack.slice() : sortIds(p.rack, mode)));
}

/** 루미큐브 도움 정도 — 튜토리얼은 늘 "많이" */
export type Assist = 'self' | 'some' | 'lots';
export function assistOf(mode: Session['mode'] | undefined, setting: Assist = useSettings.getState().assist): Assist {
  return mode === 'lesson' ? 'lots' : setting;
}

/** 힌트를 어디까지 보여 주나: 1 = 쓸 타일, 2 = 놓을 자리, 3 = 완성된 테이블(대신 놓기) */
const HINT_DEPTH: Readonly<Record<Assist, 1 | 2 | 3>> = { self: 1, some: 2, lots: 3 };

function hintBudget(mode: Session['mode']): number {
  const a = assistOf(mode);
  return a === 'lots' ? Infinity : a === 'some' ? 3 : 1;
}

export function meldProgress(g: GameState): { points: number; need: number } | null {
  const turn = g.turn;
  if (turn.meldedAtStart || turn.meldedNow) return null;
  const startIds = new Set(turn.start.sets.map((s) => s.id));
  let points = 0;
  for (const s of turn.work.sets) {
    if (startIds.has(s.id)) continue;
    const a = analyzeSet(s.tiles);
    if (a.ok) points += a.points;
  }
  return { points, need: g.rules.initialMeldPoints };
}

// ─────────────────────────────── 스토어 ───────────────────────────────

export const useGame = create<State & Actions>((set, get) => {
  /** 세션을 바꾸고 저장 */
  const put = (session: Session | null, extra: Partial<State> = {}): void => {
    const wasOnline = !!get().session?.online;
    set({ session, ...extra });
    // 온라인 판은 방(db)이 기억한다 — 기기에 저장된 혼자 두기 판을 덮거나 지우지 않는다
    if (session) {
      if (!session.online) saveSession(session);
    } else if (!wasOnline) removeKey(SESSION_KEY);
  };

  /** 방장: 바뀐 판을 방에 올린다 */
  const publish = (s: Session, events: readonly GameEvent[]): void => {
    if (s.online?.role === 'host') bridge.publish?.('lumina', payloadOf(s), events);
  };

  /** 다른 자리(AI·친구)에서 타일이 날아와 놓이는 연출. 걸리는 시간(ms)을 돌려준다 */
  const flyFrom = (seat: number, next: GameState, played: readonly TileId[]): number => {
    const origin = document.querySelector<HTMLElement>(`[data-seat-origin="${seat}"]`)?.getBoundingClientRect();
    const order = next.table.flatMap((x) => x.tiles).filter((id) => played.includes(id));
    const step = prefersReducedMotion() ? 0 : 110;
    order.forEach((id, i) => {
      if (origin) flip.from(id, origin, 140 + i * step, 380);
      sfx('place', { delay: 140 + i * step + 360 });
    });
    return order.length ? 140 + order.length * step + 420 : 0;
  };

  const react = (seat: number, kind: ReactionKind): void => {
    const r: Reaction = { id: ++reactionSeq, seat, kind };
    set({ reactions: [...get().reactions.slice(-12), r] });
  };

  const toast = (text: string, tone: Toast['tone'] = 'info'): void => {
    set({ toast: { id: ++toastSeq, text, tone } });
  };

  const nameOf = (s: Session, seat: number): string => s.match.seats[seat]?.name ?? '';

  const startTimer = (s: Session, restart: boolean): void => {
    const secs = s.match.rules.turnSeconds;
    if (!secs || s.match.game.phase !== 'playing' || !currentSeatIsHuman(s)) {
      set({ deadline: null });
      return;
    }
    const left = !restart && s.timerLeftMs !== null ? s.timerLeftMs : secs * 1000;
    lastTickSecond = -1;
    set({ deadline: Date.now() + left });
  };

  const pauseTimer = (): void => {
    const { deadline, session } = get();
    if (deadline && session) put({ ...session, timerLeftMs: Math.max(0, deadline - Date.now()) }, { deadline: null });
  };

  /** 차례가 바뀌었거나 판이 시작/복구됐을 때 */
  const beginTurnFlow = (restartTimer: boolean): void => {
    const s = get().session;
    if (!s) return;
    const g = s.match.game;
    set({ selection: [], hint: { level: 0, data: null }, splitSet: null });
    if (g.phase !== 'playing') return;
    if (s.online) {
      // 온라인: AI는 방장만 돌리고, 친구 차례는 기다린다
      set({ curtain: false });
      if (currentSeatIsHuman(s)) startTimer(s, restartTimer);
      else {
        set({ deadline: null });
        if (s.online.role === 'host' && s.match.seats[g.current]?.seat === 'ai') void runAi();
      }
      return;
    }
    if (!currentSeatIsHuman(s)) {
      set({ curtain: false, deadline: null });
      if (s.mode !== 'lesson' || (s.lesson !== null && LESSONS[s.lesson]?.aiPlays)) void runAi();
      return;
    }
    if (needsCurtain(s)) {
      set({ curtain: true, deadline: null });
      if (restartTimer) put({ ...s, timerLeftMs: null });
      return;
    }
    set({ curtain: false });
    startTimer(s, restartTimer);
  };

  const recordStats = (s: Session): void => {
    if (s.mode === 'lesson') return;
    const g = s.match.game;
    if (!g.result) return;
    const humans = s.match.seats.map((p) => p.seat === 'human');
    const me = mySeatOf(s);
    const st = g.stats[me];
    useStats.getState().add({
      at: Date.now(),
      mode: s.mode === 'local' ? 'local' : s.mode === 'online' ? 'online' : 'solo',
      names: s.match.seats.map((p) => p.name),
      humans,
      me,
      winners: g.result.winners,
      deltas: g.result.deltas,
      durationMs: Date.now() - s.startedAt,
      largestMove: st?.largestMove ?? 0,
      jokers: st?.jokersPlayed ?? 0,
      rearrangements: st?.rearrangements ?? 0,
      longestRun: st?.longestRun ?? 0,
      theme: useSettings.getState().theme,
      reason: g.result.reason,
    });
  };

  /** 이벤트 → 소리·진동·캐릭터 반응·알림 문구 */
  const handleEvents = (s: Session, events: readonly GameEvent[], byAi: boolean): string | null => {
    let text: string | null = null;
    const L = lang();
    for (const e of events) {
      switch (e.type) {
        case 'melded': {
          text = translate(L, 'event.melded', { subj: subj(L, nameOf(s, e.p)), points: e.points });
          if (!byAi) sfx('meld');
          react(e.p, 'meld');
          break;
        }
        case 'played': {
          text = translate(L, e.rearranged ? 'event.playedRe' : 'event.played', { subj: subj(L, nameOf(s, e.p)), n: e.tiles.length });
          if (!byAi) sfx('commit');
          const big = e.tiles.length >= 4 || e.rearranged;
          react(e.p, big ? 'combo' : 'play');
          if (big) s.match.seats.forEach((_, i) => i !== e.p && react(i, 'surprise'));
          break;
        }
        case 'drew': {
          text = translate(L, 'event.drew', { subj: subj(L, nameOf(s, e.p)) });
          sfx('draw', byAi ? {} : { delay: 0 });
          react(e.p, 'draw');
          if (!byAi && e.tiles[0] !== undefined && e.tiles.length === 1) {
            toast(translate(L, 'event.yourDraw', { tile: tileLabel(L, e.tiles[0]) }), 'info');
          }
          break;
        }
        case 'passed':
          text = translate(L, 'event.passed', { subj: subj(L, nameOf(s, e.p)) });
          react(e.p, 'nod');
          break;
        case 'timeout':
          text =
            e.auto === 'revert'
              ? translate(L, 'event.timeout', { name: nameOf(s, e.p), n: e.penalty })
              : e.auto === 'draw'
                ? translate(L, 'event.timeoutDraw', { name: nameOf(s, e.p) })
                : null;
          if (e.auto !== 'commit') {
            sfx('invalid');
            buzz('warn');
            if (text) toast(text, 'warn');
          }
          break;
        case 'turn':
          sfx('turn', { delay: 120 });
          break;
        case 'over': {
          const winners = e.result.winners;
          const humanWon = s.online ? winners.includes(s.online.mySeat) : winners.some((w) => s.match.seats[w]?.seat === 'human');
          sfx(humanWon || s.mode === 'local' ? 'win' : 'lose', { delay: 200 });
          buzz(humanWon ? 'success' : 'turn');
          s.match.seats.forEach((_, i) => react(i, winners.includes(i) ? 'win' : 'lose'));
          break;
        }
        default:
          break;
      }
    }
    return text;
  };

  /** 커널이 돌려준 다음 상태를 반영 */
  const applyGame = (next: GameState, events: readonly GameEvent[], byAi: boolean): void => {
    const s = get().session;
    if (!s) return;
    const prev = s.match.game;
    const rackOrder = s.rackOrder.map((o, i) => {
      const rack = i === next.current ? next.turn.work.rack : next.players[i]?.rack ?? [];
      return syncOrder(o, rack);
    });
    const drawn = s.drawn.map((d, i) => {
      const ev = events.find((e) => e.type === 'drew' && e.p === i);
      if (ev && ev.type === 'drew') return ev.tiles;
      // 자기 차례가 시작되면 "새" 표시는 유지, 끝나면 지운다
      return i === prev.current && next.current !== prev.current ? [] : d;
    });
    let match: MatchState = { ...s.match, game: next };
    const over = next.phase === 'over';
    if (over) match = recordGame(match);
    const turnChanged = next.current !== prev.current || next.turnNo !== prev.turnNo;
    const session: Session = { ...s, match, rackOrder, drawn, timerLeftMs: turnChanged ? null : s.timerLeftMs, endedAt: over ? Date.now() : (s.endedAt ?? null) };
    const text = handleEvents(session, events, byAi);
    if (events.some((e) => PUBLISHED_EVENTS.has(e.type))) publish(session, events);
    put(session, {
      layoutTick: get().layoutTick + 1,
      lastEventText: text ?? get().lastEventText,
      selection: turnChanged ? [] : get().selection.filter((id) => !events.some((e) => e.type === 'turn') && locateOk(next, id)),
      hint: turnChanged ? { level: 0, data: null } : get().hint,
    });
    if (over) {
      recordStats(session);
      set({ deadline: null, ai: null });
      setTimeout(() => set({ overlay: session.mode === 'lesson' ? 'lesson-done' : 'gameover' }), prefersReducedMotion() ? 200 : 1300);
      return;
    }
    if (session.mode === 'lesson') checkLesson(session, events);
    if (turnChanged) {
      const delay = byAi ? 0 : 260;
      setTimeout(() => beginTurnFlow(true), delay);
    }
  };

  const locateOk = (g: GameState, id: TileId): boolean =>
    g.turn.work.rack.includes(id) || g.turn.work.staging.includes(id) || g.turn.work.sets.some((x) => x.tiles.includes(id));

  const checkLesson = (s: Session, events: readonly GameEvent[]): void => {
    if (s.lesson === null) return;
    const lesson = LESSONS[s.lesson];
    if (!lesson || get().lessonGoal) return;
    if (lesson.goal(s.match.game, events)) {
      set({ lessonGoal: true });
      sfx('meld');
      buzz('success');
      react(1, 'combo');
      setTimeout(() => set({ overlay: 'lesson-done' }), 900);
    }
  };

  /** AI 한 차례: 생각 → 결정 → 커널 확인 → 타일이 AI 자리에서 날아와 놓인다 */
  const runAi = async (): Promise<void> => {
    const token = ++aiToken;
    const s0 = get().session;
    if (!s0) return;
    const g0 = s0.match.game;
    const seat = g0.current;
    const profile = AI_PROFILES[s0.match.seats[seat]?.ai ?? 'casual'];
    set({ ai: { seat, phase: 'thinking' } });
    react(seat, 'think');
    const wait = thinkTime(profile, aiRng, aiSpeedFactor());
    const t0 = Date.now();
    // 메뉴가 열려 있으면 기다린다
    while (Date.now() - t0 < wait || get().overlay === 'menu') {
      await sleep(80);
      if (token !== aiToken || get().session?.match !== s0.match) return;
    }
    const s = get().session;
    if (!s || token !== aiToken) return;
    const g = s.match.game;
    let decision: AiDecision = decide(g, aiRng, profile);
    let result = runDecision(g, decision);
    if (!result) {
      decision = g.turn.meldedNow ? { kind: 'end' } : { kind: 'draw' };
      result = runDecision(g, decision);
    }
    if (!result) return;
    set({ ai: { seat, phase: 'moving' } });
    flip.capture();
    const anim = decision.kind === 'play' ? flyFrom(seat, result.state, decision.played) : 0;
    applyGame(result.state, result.events, true);
    await sleep(anim);
    if (token !== aiToken) return;
    set({ ai: null });
    const after = get().session;
    if (after && after.match.game.phase === 'playing' && after.match.game.current === seat && after.match.seats[seat]?.seat === 'ai') {
      // 하우스 룰 "등록 후 계속": 같은 AI가 이어서 둔다
      void runAi();
    }
  };

  const runDecision = (g: GameState, d: AiDecision): { state: GameState; events: GameEvent[] } | null => {
    const events: GameEvent[] = [];
    if (d.kind === 'draw') {
      const r = reduce(g, { type: 'draw' });
      return r.ok ? { state: r.state, events: [...r.events] } : null;
    }
    if (d.kind === 'end') {
      const r = reduce(g, { type: 'commit' });
      return r.ok ? { state: r.state, events: [...r.events] } : null;
    }
    const p = reduce(g, { type: 'propose', sets: d.sets });
    if (!p.ok) return null;
    const c = reduce(p.state, { type: 'commit' });
    if (!c.ok) return null;
    events.push(...c.events);
    return { state: c.state, events };
  };

  const reportError = (error: string, check?: CommitCheck, tiles: TileId[] = []): void => {
    const L = lang();
    let text = translate(L, `err.${error}`);
    if (check && check.issues[0]) text = commitIssueText(L, check.issues[0]);
    toast(text, 'bad');
    sfx('invalid');
    buzz('error');
    if (tiles.length) set({ shake: { id: ++toastSeq, tiles } });
  };

  return {
    screen: 'home',
    prevScreen: 'home',
    session: null,
    selection: [],
    curtain: false,
    overlay: null,
    hint: { level: 0, data: null },
    toast: null,
    ai: null,
    deadline: null,
    splitSet: null,
    layoutTick: 0,
    reactions: [],
    lastEventText: null,
    shake: null,
    lessonGoal: false,
    waiting: false,

    go: (screen) => {
      const from = get().screen;
      const online = !!get().session?.online;
      // 온라인 판은 다른 사람들이 기다리므로 화면을 옮겨도 AI를 멈추지 않는다
      if (from === 'game' && screen !== 'game' && !online) {
        pauseTimer();
        aiToken++;
        set({ ai: null });
      }
      set({ screen, prevScreen: from, overlay: null });
      sfx('button');
      // 설정·규칙에서 돌아오면 멈췄던 차례를 이어 간다
      if (screen === 'game' && from !== 'game' && !online && get().session?.match.game.phase === 'playing') beginTurnFlow(false);
    },

    startMatch: (cfg) => {
      aiToken++;
      const { seats, meta } = seatsFrom(cfg);
      const match = newMatch({ seats, rules: cfg.rules, format: cfg.format, seed: urlSeed() ?? randomSeed() });
      const session: Session = {
        v: 1,
        mode: cfg.mode,
        lesson: null,
        match,
        seatsMeta: meta,
        rackOrder: initialOrders(match),
        drawn: match.game.players.map(() => []),
        startedAt: Date.now(),
        hintsLeft: hintBudget(cfg.mode),
        timerLeftMs: null,
      };
      if (cfg.mode === 'solo') useSettings.getState().set({ lastSolo: cfg });
      else useSettings.getState().set({ lastLocal: cfg });
      put(session, { screen: 'game', overlay: null, reactions: [], lastEventText: null, ai: null, lessonGoal: false });
      sfx('shuffle');
      beginTurnFlow(true);
    },

    startLesson: (i) => {
      aiToken++;
      const lesson = LESSONS[i];
      if (!lesson) return;
      const game = lesson.build();
      const seats: PlayerSetup[] = game.players.map((p) => ({ name: p.name, seat: p.seat, ...(p.ai ? { ai: p.ai } : {}) }));
      const match: MatchState = {
        v: 1,
        id: `lesson${i}`,
        seed: game.seed,
        format: { kind: 'games', games: 1 },
        rules: game.rules,
        seats,
        scores: seats.map(() => 0),
        wins: seats.map(() => 0),
        history: [],
        gameNo: 1,
        game,
        recorded: false,
        over: false,
        champions: [],
      };
      const session: Session = {
        v: 1,
        mode: 'lesson',
        lesson: i,
        match,
        seatsMeta: game.players.map((_, k) => ({ character: k === 0 ? 'moka' : (['hwigi', 'ginini', 'pponi'] as const)[(k - 1) % 3] as CharacterId })),
        rackOrder: game.players.map((p) => sortIds(p.rack, 'color')),
        drawn: game.players.map(() => []),
        startedAt: Date.now(),
        hintsLeft: Infinity,
        timerLeftMs: null,
      };
      put(session, { screen: 'game', overlay: null, reactions: [], lastEventText: null, ai: null, lessonGoal: false, curtain: false });
      beginTurnFlow(true);
    },

    nextLesson: () => {
      const s = get().session;
      const i = (s?.lesson ?? -1) + 1;
      set({ overlay: null });
      if (i < LESSONS.length) get().startLesson(i);
      else {
        put(null);
        set({ screen: 'home', overlay: null });
      }
    },

    resume: () => {
      const raw = readJSON<Session>(SESSION_KEY);
      if (!raw) return false;
      if (!validSession(raw)) {
        removeKey(SESSION_KEY);
        toast(t('misc.corrupted'), 'warn');
        return false;
      }
      const s: Session = { ...raw, hintsLeft: raw.hintsLeft ?? hintBudget(raw.mode) };
      aiToken++;
      set({ session: s, screen: 'game', overlay: s.match.game.phase === 'over' ? (s.mode === 'lesson' ? 'lesson-done' : 'gameover') : null, ai: null, reactions: [] });
      if (s.match.game.phase === 'playing') {
        // 다시 열면 패를 가린다 (함께 두기) — 타이머는 남은 시간부터
        beginTurnFlow(false);
      }
      return true;
    },

    quit: () => {
      aiToken++;
      if (get().session?.online) bridge.leave?.();
      put(null, { screen: 'home', overlay: null, ai: null, deadline: null, curtain: false, selection: [], waiting: false });
    },

    reveal: () => {
      const s = get().session;
      if (!s) return;
      set({ curtain: false });
      sfx('turn');
      buzz('turn');
      startTimer(s, false);
    },

    act: (action, opts = {}) => {
      const s = get().session;
      if (!s) return false;
      const g = s.match.game;
      if (g.phase !== 'playing' || !currentSeatIsHuman(s) || get().curtain || get().ai || get().waiting) return false;
      const r = reduce(g, action);
      if (!r.ok) {
        if (!opts.quiet) reportError(r.error, r.check);
        return false;
      }
      if (s.online?.role === 'guest' && (action.type === 'commit' || action.type === 'draw' || action.type === 'timeout')) {
        // 참가자: 차례를 끝내는 수는 방장이 판정한다 (여기서는 미리 확인만)
        const move: RemoteMove = action.type === 'commit' ? { type: 'commit', sets: g.turn.work.sets.map((x) => x.tiles.slice()) } : { type: 'draw' };
        set({ waiting: true, selection: [] });
        bridge.send?.('lumina', move);
        sfx('button');
        return true;
      }
      if (!opts.noCapture) flip.capture();
      applyGame(r.state, r.events, false);
      return true;
    },

    select: (id) => {
      const s = get().session;
      if (!s || get().curtain || get().ai || get().waiting || !currentSeatIsHuman(s)) return;
      const g = s.match.game;
      const err = canMoveTile(g.turn, id);
      if (err) {
        reportError(err, undefined, [id]);
        return;
      }
      const sel = get().selection;
      const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      set({ selection: next, splitSet: null });
      sfx('pick');
      buzz('tap');
    },

    clearSelection: () => set({ selection: [], splitSet: null }),

    moveSelectionTo: (to) => {
      const sel = get().selection;
      if (!sel.length) return;
      if (get().act({ type: 'move', tiles: sel, to })) {
        set({ selection: [] });
        sfx('place');
        buzz('place');
      }
    },

    dropTiles: (tiles, to) => {
      const s = get().session;
      if (!s) return false;
      if (to.kind === 'rack-order') {
        // 랙 안에서 순서만 바꾸기 (규칙과 무관)
        const g = s.match.game;
        const order = syncOrder(s.rackOrder[g.current] ?? [], g.turn.work.rack).filter((x) => !tiles.includes(x));
        const i = Math.max(0, Math.min(order.length, to.index));
        const fromTable = tiles.filter((x) => !g.turn.work.rack.includes(x));
        if (fromTable.length) {
          // 이번 차례에 낸 타일을 랙으로 되돌리면서 원하는 자리에 끼운다
          if (!get().act({ type: 'move', tiles: fromTable, to: { kind: 'rack' } }, { noCapture: true })) return false;
        }
        const s2 = get().session as Session;
        const order2 = [...order.slice(0, i), ...tiles, ...order.slice(i)];
        const rackOrder = s2.rackOrder.map((o, k) => (k === g.current ? syncOrder(order2, s2.match.game.turn.work.rack) : o));
        put({ ...s2, rackOrder }, { layoutTick: get().layoutTick + 1, selection: [] });
        sfx('slide');
        return true;
      }
      let ok = false;
      if (to.kind === 'swap') ok = get().act({ type: 'swap', tile: tiles[0] as TileId, joker: to.joker }, { noCapture: true });
      else ok = get().act({ type: 'move', tiles, to }, { noCapture: true });
      if (ok) {
        set({ selection: [] });
        sfx(to.kind === 'staging' ? 'slide' : 'place');
        buzz('place');
      }
      return ok;
    },

    quickPlay: (id) => {
      const s = get().session;
      if (!s) return;
      // 스스로 모드: 두 번 톡은 그냥 고르기 (들어갈 곳을 대신 찾아 주지 않는다)
      if (assistOf(s.mode) === 'self') return;
      const targets = quickTargets(s.match.game.turn, id);
      if (targets.length === 1) {
        flip.capture();
        if (get().act({ type: 'move', tiles: [id], to: { kind: 'set', setId: targets[0] as string } }, { noCapture: true })) {
          sfx('place');
          buzz('place');
          set({ selection: [] });
        }
      } else if (targets.length > 1) {
        set({ selection: [id] });
        toast(t('hint.l2'), 'info');
      }
    },

    sortRack: (mode) => {
      const s = get().session;
      if (!s) return;
      const g = s.match.game;
      const rack = g.turn.work.rack;
      const order = mode === 'smart' ? smartOrder(rack).order : sortIds(rack, mode);
      flip.capture();
      const rackOrder = s.rackOrder.map((o, i) => (i === g.current ? order : o));
      put({ ...s, rackOrder }, { layoutTick: get().layoutTick + 1 });
      sfx('slide');
    },

    commit: () => {
      const s = get().session;
      if (!s) return;
      if (get().act({ type: 'commit' })) buzz('success');
    },

    draw: (force = false) => {
      const s = get().session;
      if (!s) return;
      const g = s.match.game;
      if (g.turn.meldedNow) {
        get().act({ type: 'commit' });
        return;
      }
      // "낼 수 있는데 뽑을까요?"는 낼 수 있다는 걸 알려 주는 셈이라 스스로 모드에서는 묻지 않는다
      if (!force && useSettings.getState().confirmDraw && g.pool.length > 0 && assistOf(s.mode) !== 'self') {
        const h = computeHint(g);
        if (h.kind === 'play' || h.kind === 'meld') {
          set({ overlay: 'confirm-draw' });
          return;
        }
      }
      set({ overlay: null });
      get().act({ type: 'draw' });
    },

    requestHint: () => {
      const s = get().session;
      // 온라인 판에서는 힌트 없음 (서로 공정하게)
      if (!s || s.online || !currentSeatIsHuman(s) || get().curtain) return;
      const h = get().hint;
      const assist = assistOf(s.mode);
      if (h.level === 0) {
        if (s.hintsLeft <= 0) {
          toast(t('hint.out'), 'warn');
          return;
        }
        // "낼 게 없다"는 답도 알려 주는 것이니 한 번으로 친다 (무제한이면 상관없음)
        const data = computeHint(s.match.game);
        if (data.kind === 'draw' || data.kind === 'end') {
          put({ ...s, hintsLeft: s.hintsLeft - 1 }, {});
          toast(t(data.kind === 'draw' ? 'hint.none' : 'hint.end'), 'info');
          return;
        }
        put({ ...s, hintsLeft: s.hintsLeft - 1 }, { hint: { level: 1, data } });
        sfx('hint');
        toast(data.kind === 'meld' && assist !== 'self' ? t('hint.meld', { points: data.points }) : t('hint.l1'), 'good');
        return;
      }
      if (h.level >= HINT_DEPTH[assist]) {
        toast(t(assist === 'self' ? 'hint.depthSelf' : 'hint.depthSome'), 'info');
        return;
      }
      if (h.level === 1) {
        set({ hint: { ...h, level: 2 } });
        sfx('hint');
        toast(t(h.data?.targetSetId ? 'hint.l2' : 'hint.l2New'), 'good');
        return;
      }
      set({ hint: { ...h, level: 3 }, overlay: 'hint' });
      sfx('hint');
    },

    applyHint: () => {
      const h = get().hint.data;
      set({ overlay: null });
      if (!h || !h.proposal.length) return;
      if (get().act({ type: 'propose', sets: h.proposal.map((x) => x.slice()) })) {
        sfx('place');
        set({ hint: { level: 0, data: null } });
      }
    },

    closeOverlay: () => {
      const o = get().overlay;
      set({ overlay: null });
      if (o === 'menu') {
        const s = get().session;
        if (s && currentSeatIsHuman(s) && !get().curtain && s.timerLeftMs !== null) startTimer(s, false);
      }
      if (o === 'hint') set({ hint: { ...get().hint, level: 2 } });
    },

    openMenu: () => {
      pauseTimer();
      set({ overlay: 'menu' });
      sfx('button');
    },

    nextGame: () => {
      const s = get().session;
      if (!s || !s.match.recorded || s.match.over || s.online?.role === 'guest') return;
      const match = nextGameOf(s.match);
      aiToken++;
      put(
        { ...s, match, rackOrder: initialOrders(match), drawn: match.game.players.map(() => []), startedAt: Date.now(), endedAt: null, hintsLeft: hintBudget(s.mode), timerLeftMs: null },
        { overlay: null, reactions: [], lastEventText: null, ai: null },
      );
      sfx('shuffle');
      publish(get().session as Session, []);
      beginTurnFlow(true);
    },

    rematch: () => {
      const s = get().session;
      if (!s || s.online?.role === 'guest') return;
      const match = rematchOf(s.match, randomSeed());
      aiToken++;
      put(
        { ...s, match, rackOrder: initialOrders(match), drawn: match.game.players.map(() => []), startedAt: Date.now(), endedAt: null, hintsLeft: hintBudget(s.mode), timerLeftMs: null },
        { overlay: null, reactions: [], lastEventText: null, ai: null },
      );
      sfx('shuffle');
      publish(get().session as Session, []);
      beginTurnFlow(true);
    },

    tick: () => {
      const { deadline, session, overlay } = get();
      if (!deadline || !session || overlay === 'menu') return;
      const left = deadline - Date.now();
      const sec = Math.ceil(left / 1000);
      if (left > 0 && sec <= 10 && sec !== lastTickSecond) {
        lastTickSecond = sec;
        sfx('tick');
        if (sec <= 3) buzz('tap');
      }
      if (left <= 0) {
        set({ deadline: null, selection: [] });
        flip.capture();
        const r = reduce(session.match.game, { type: 'timeout' });
        if (r.ok) applyGame(r.state, r.events, false);
      }
    },

    startOnline: (table, info) => {
      aiToken++;
      const st = useSettings.getState();
      // 규칙은 방장이 마지막으로 쓴 것, 온라인은 차례 시간 없이
      const rules = { ...(st.lastSolo?.rules ?? st.lastLocal?.rules ?? CLASSIC_RULES), turnSeconds: null };
      const seats: PlayerSetup[] = table.seats.map((x) => ({ name: x.name, seat: x.kind, ...(x.kind === 'ai' ? { ai: x.level ?? 'casual' } : {}) }));
      const match = newMatch({ seats, rules, format: { kind: 'games', games: 1 }, seed: urlSeed() ?? randomSeed() });
      const session: Session = {
        v: 1,
        mode: 'online',
        lesson: null,
        match,
        seatsMeta: table.seats.map((x) => ({ character: x.character })),
        rackOrder: initialOrders(match),
        drawn: match.game.players.map(() => []),
        startedAt: Date.now(),
        endedAt: null,
        hintsLeft: hintBudget('online'),
        timerLeftMs: null,
        online: info,
      };
      put(session, { screen: 'game', overlay: null, reactions: [], lastEventText: null, ai: null, lessonGoal: false, curtain: false, waiting: false, selection: [] });
      sfx('shuffle');
      publish(session, []);
      beginTurnFlow(true);
    },

    applyRemote: (seat, payload) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host' || !isRemoteMove(payload)) return false;
      const g = s.match.game;
      // (AI 연출이 끝나기 전에 친구가 빨리 두어도 받는다 — 차례와 자리만 맞으면 된다)
      if (g.phase !== 'playing' || g.current !== seat || seat === s.online.mySeat || s.match.seats[seat]?.seat !== 'human') return false;
      let result: { state: GameState; events: GameEvent[] } | null = null;
      if (payload.type === 'draw') {
        const r = reduce(g, g.turn.meldedNow ? { type: 'commit' } : { type: 'draw' });
        if (r.ok) result = { state: r.state, events: [...r.events] };
      } else {
        const p = reduce(g, { type: 'propose', sets: payload.sets });
        const c = p.ok ? reduce(p.state, { type: 'commit' }) : null;
        if (c?.ok) result = { state: c.state, events: [...c.events] };
      }
      if (!result) return false;
      flip.capture();
      const before = new Set(g.table.flatMap((x) => x.tiles));
      flyFrom(
        seat,
        result.state,
        result.state.table.flatMap((x) => x.tiles).filter((id) => !before.has(id)),
      );
      applyGame(result.state, result.events, true);
      return true;
    },

    adoptRemote: (payload, events, info) => {
      const raw = payload as Session | null;
      if (!raw || typeof raw !== 'object' || !validSession(raw) || raw.match.game.players.length <= info.mySeat) return;
      const prev = get().session;
      const pg = prev?.online ? prev.match.game : null;
      const ng = raw.match.game;
      const same = !!prev?.online && !!pg && prev.match.id === raw.match.id && prev.match.gameNo === raw.match.gameNo;
      const me = info.mySeat;
      const evs = (Array.isArray(events) ? events : []).filter((e): e is GameEvent => !!e && typeof e === 'object' && typeof (e as GameEvent).type === 'string');
      // 내 차례에 옮겨 둔 타일은 지킨다 (방장이 자리 정보만 바꿔 다시 올린 경우)
      const keepLocal =
        same && !!pg && pg.phase === 'playing' && ng.phase === 'playing' && pg.current === me && ng.current === me && pg.turnNo === ng.turnNo && pg.turn.meldedNow === ng.turn.meldedNow && isChanged(pg.turn);
      const game = keepLocal && pg ? { ...pg, players: pg.players.map((p, i) => ({ ...p, seat: ng.players[i]?.seat ?? p.seat, ...(ng.players[i]?.ai ? { ai: ng.players[i]?.ai } : {}) })) } : ng;
      const myRack = game.current === me ? game.turn.work.rack : (game.players[me]?.rack ?? []);
      const sortMode = useSettings.getState().autoSort;
      const prevOrder = same && prev ? (prev.rackOrder[me] ?? []) : [];
      const order = prevOrder.length ? syncOrder(prevOrder, myRack) : sortMode === 'off' ? myRack.slice() : sortIds(myRack, sortMode);
      const myDraw = evs.find((e) => e.type === 'drew' && e.p === me);
      const prevDrawn = same && prev && pg && !(pg.current === me && game.current !== me) ? (prev.drawn[me] ?? []) : [];
      const drawn = game.players.map((_, i) => (i !== me ? [] : myDraw && myDraw.type === 'drew' ? myDraw.tiles : prevDrawn));
      const newlyOver = ng.phase === 'over' && !(same && pg?.phase === 'over');
      const session: Session = {
        ...raw,
        match: { ...raw.match, game },
        rackOrder: game.players.map((_, i) => (i === me ? order : [])),
        drawn,
        online: info,
        hintsLeft: same && prev ? prev.hintsLeft : hintBudget('online'),
        timerLeftMs: null,
        startedAt: same && prev ? prev.startedAt : Date.now(),
        endedAt: ng.phase === 'over' ? (same && prev?.endedAt ? prev.endedAt : Date.now()) : null,
      };
      const turnChanged = !same || !pg || pg.current !== game.current || pg.turnNo !== game.turnNo;
      // 다른 자리에서 낸 타일은 그 자리에서 날아온다
      if (same && pg) {
        flip.capture();
        const mover = [...evs].reverse().find((e) => (e.type === 'played' || e.type === 'melded') && e.p !== me);
        if (mover && 'p' in mover) {
          const before = new Set(pg.table.flatMap((x) => x.tiles));
          flyFrom(
            mover.p,
            game,
            game.table.flatMap((x) => x.tiles).filter((id) => !before.has(id)),
          );
        }
      }
      const mine = evs.some((e) => (e.type === 'played' || e.type === 'melded' || e.type === 'drew' || e.type === 'passed') && e.p === me);
      const text = handleEvents(session, evs, !mine);
      aiToken++;
      put(session, {
        screen: 'game',
        layoutTick: get().layoutTick + 1,
        lastEventText: text ?? (same ? get().lastEventText : null),
        selection: keepLocal ? get().selection : [],
        hint: turnChanged ? { level: 0, data: null } : get().hint,
        ai: null,
        curtain: false,
        ...(same ? {} : { reactions: [], overlay: null, lessonGoal: false, deadline: null }),
      });
      if (!same) sfx('shuffle');
      if (ng.phase === 'over') {
        set({ deadline: null });
        if (newlyOver) {
          recordStats(session);
          setTimeout(() => {
            if (get().session?.match.id === session.match.id) set({ overlay: 'gameover' });
          }, prefersReducedMotion() ? 200 : 1300);
        }
        return;
      }
      if (turnChanged && game.current === me) buzz('turn');
      if (turnChanged) beginTurnFlow(true);
    },

    seatToAi: (seat) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host') return false;
      const p = s.match.seats[seat];
      if (!p || p.seat !== 'human' || seat === s.online.mySeat) return false;
      const g = s.match.game;
      const seats = s.match.seats.map((x, i) => (i === seat ? { ...x, seat: 'ai' as const, ai: 'casual' as const } : x));
      const players = g.players.map((x, i) => (i === seat ? { ...x, seat: 'ai' as const, ai: 'casual' as const } : x));
      const next: Session = { ...s, match: { ...s.match, seats, game: { ...g, players } } };
      put(next);
      publish(next, []);
      if (g.phase === 'playing' && g.current === seat && !get().ai) void runAi();
      return true;
    },

    setSplit: (setId) => set({ splitSet: setId }),
    toastMsg: (text, tone = 'info') => toast(text, tone),
    shakeTiles: (tiles) => set({ shake: { id: ++toastSeq, tiles } }),
  };
});

/** 저장된 판이 있는지 (홈 화면 "이어 하기") */
export function savedSessionInfo(): { mode: Session['mode']; gameNo: number; turnNo: number } | null {
  const raw = readJSON<Session>(SESSION_KEY);
  if (!raw || !validSession(raw) || raw.match.game.phase !== 'playing') return null;
  return { mode: raw.mode, gameNo: raw.match.gameNo, turnNo: raw.match.game.turnNo };
}

/** 이번 차례 상태 요약 (버튼 문구·상태줄) */
export function turnSummary(g: GameState): {
  changed: boolean;
  check: CommitCheck;
  meld: { points: number; need: number } | null;
} {
  return { changed: isChanged(g.turn), check: checkCommit(g.turn, g.rules), meld: meldProgress(g) };
}

export function tileText(id: TileId): string {
  return tileLabel(lang(), id);
}

export { tile };

// 시험용 손잡이 — 내 컴퓨터(localhost)에서 열었을 때만: 온라인 판에는 힌트가 없어서, e2e가 힌트 풀이로 첫 등록을 놓는다
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  (window as unknown as { __lumina?: unknown }).__lumina = {
    proposeHint: (): boolean => {
      const s = useGame.getState().session;
      const data = s ? computeHint(s.match.game) : null;
      return !!data?.proposal.length && useGame.getState().act({ type: 'propose', sets: data.proposal.map((x) => x.slice()) });
    },
  };
}

/** 화면에서 쓰는 루미큐브 도움 정도 (설정을 바꾸면 바로 다시 그린다) */
export function useAssist(): Assist {
  const mode = useGame((s) => s.session?.mode);
  const setting = useSettings((s) => s.assist);
  return assistOf(mode, setting);
}
