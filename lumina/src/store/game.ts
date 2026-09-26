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
import { readJSON, removeKey, throttledWriter } from './storage';
import { aiSpeedFactor, prefersReducedMotion, useSettings, type SetupConfig } from './settings';
import { useStats } from './stats';
import { isCharacterId, type CharacterId } from '../characters/roster';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import * as flip from '../ui/flip';
import { commitIssueText, subj, tileLabel, translate } from '../i18n';
import { LESSONS } from '../lessons/lessons';

export type Screen = 'home' | 'setup-solo' | 'setup-local' | 'game' | 'settings' | 'stats' | 'rules' | 'lessons';
export type Overlay = null | 'menu' | 'gameover' | 'hint' | 'share' | 'confirm-draw' | 'confirm-quit' | 'lesson-done';

export interface SeatMeta {
  readonly character: CharacterId;
}

export interface Session {
  readonly v: 1;
  readonly mode: 'solo' | 'local' | 'lesson';
  readonly lesson: number | null;
  readonly match: MatchState;
  readonly seatsMeta: readonly SeatMeta[];
  readonly rackOrder: readonly (readonly TileId[])[];
  readonly drawn: readonly (readonly TileId[])[];
  readonly startedAt: number;
  readonly hintsLeft: number;
  readonly timerLeftMs: number | null;
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
}

const SESSION_KEY = 'lumina.session.v1';
const saveSession = throttledWriter(SESSION_KEY, 300);
let toastSeq = 0;
let reactionSeq = 0;
let aiToken = 0;
let lastTickSecond = -1;
const aiRng = createRng(randomSeed());

function lang(): 'ko' | 'en' {
  return useSettings.getState().lang;
}
function t(path: string, params?: Record<string, string | number>): string {
  return translate(lang(), path, params);
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────── 도우미 ───────────────────────────────

export function currentSeatIsHuman(s: Session): boolean {
  const g = s.match.game;
  return s.match.seats[g.current]?.seat === 'human';
}

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

function hintBudget(mode: Session['mode']): number {
  const h = useSettings.getState().hints;
  if (mode === 'lesson' || h === 'unlimited') return Infinity;
  return h === 'off' ? 0 : 3;
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
    set({ session, ...extra });
    if (session) saveSession(session);
    else removeKey(SESSION_KEY);
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
    const me = Math.max(0, humans.indexOf(true));
    const st = g.stats[me];
    useStats.getState().add({
      at: Date.now(),
      mode: s.mode === 'local' ? 'local' : 'solo',
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
          const humanWon = winners.some((w) => s.match.seats[w]?.seat === 'human');
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
    const session: Session = { ...s, match, rackOrder, drawn, timerLeftMs: turnChanged ? null : s.timerLeftMs };
    const text = handleEvents(session, events, byAi);
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
    let anim = 0;
    if (decision.kind === 'play') {
      const origin = document.querySelector<HTMLElement>(`[data-seat-origin="${seat}"]`)?.getBoundingClientRect();
      const order = result.state.table.flatMap((x) => x.tiles).filter((id) => decision.kind === 'play' && decision.played.includes(id));
      const step = prefersReducedMotion() ? 0 : 110;
      order.forEach((id, i) => {
        if (origin) flip.from(id, origin, 140 + i * step, 380);
        sfx('place', { delay: 140 + i * step + 360 });
      });
      anim = 140 + order.length * step + 420;
    }
    applyGame(result.state, result.events, true);
    await sleep(anim);
    if (token !== aiToken) return;
    set({ ai: null });
    const after = get().session;
    if (after && after.match.game.phase === 'playing' && after.match.game.current === seat && !currentSeatIsHuman(after)) {
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

    go: (screen) => {
      if (get().screen === 'game' && screen !== 'game') {
        pauseTimer();
        aiToken++;
        set({ ai: null });
      }
      set({ screen, overlay: null });
      sfx('button');
    },

    startMatch: (cfg) => {
      aiToken++;
      const { seats, meta } = seatsFrom(cfg);
      const match = newMatch({ seats, rules: cfg.rules, format: cfg.format, seed: randomSeed() });
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
      put(null, { screen: 'home', overlay: null, ai: null, deadline: null, curtain: false, selection: [] });
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
      if (g.phase !== 'playing' || !currentSeatIsHuman(s) || get().curtain || get().ai) return false;
      const r = reduce(g, action);
      if (!r.ok) {
        if (!opts.quiet) reportError(r.error, r.check);
        return false;
      }
      if (!opts.noCapture) flip.capture();
      applyGame(r.state, r.events, false);
      return true;
    },

    select: (id) => {
      const s = get().session;
      if (!s || get().curtain || get().ai) return;
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
      if (!force && useSettings.getState().confirmDraw && g.pool.length > 0) {
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
      if (!s || !currentSeatIsHuman(s) || get().curtain) return;
      const h = get().hint;
      if (h.level === 0) {
        if (s.hintsLeft <= 0) {
          toast(t(useSettings.getState().hints === 'off' ? 'hint.out' : 'hint.out'), 'warn');
          return;
        }
        const data = computeHint(s.match.game);
        if (data.kind === 'draw' || data.kind === 'end') {
          toast(t(data.kind === 'draw' ? 'hint.none' : 'hint.end'), 'info');
          return;
        }
        put({ ...s, hintsLeft: s.hintsLeft - 1 }, { hint: { level: 1, data } });
        sfx('hint');
        toast(data.kind === 'meld' ? t('hint.meld', { points: data.points }) : t('hint.l1'), 'good');
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
      if (!s || !s.match.recorded || s.match.over) return;
      const match = nextGameOf(s.match);
      aiToken++;
      put(
        { ...s, match, rackOrder: initialOrders(match), drawn: match.game.players.map(() => []), startedAt: Date.now(), hintsLeft: hintBudget(s.mode), timerLeftMs: null },
        { overlay: null, reactions: [], lastEventText: null, ai: null },
      );
      sfx('shuffle');
      beginTurnFlow(true);
    },

    rematch: () => {
      const s = get().session;
      if (!s) return;
      const match = rematchOf(s.match, randomSeed());
      aiToken++;
      put(
        { ...s, match, rackOrder: initialOrders(match), drawn: match.game.players.map(() => []), startedAt: Date.now(), hintsLeft: hintBudget(s.mode), timerLeftMs: null },
        { overlay: null, reactions: [], lastEventText: null, ai: null },
      );
      sfx('shuffle');
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
