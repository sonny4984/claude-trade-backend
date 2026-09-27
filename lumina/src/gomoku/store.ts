/**
 * 오목 진행 — 커널(engine)과 화면 사이의 다리.
 * 혼자 두기(AI)·함께 두기(한 기기)·온라인(방장이 판정). 판을 누르면 먼저 미리보기, 한 번 더(또는 "놓기") 누르면 둔다.
 */
import { create } from 'zustand';
import { canPlace, currentPlayer, gomokuReduce, gomokuValid, newGomoku, type GomokuAction, type GomokuEvent, type GomokuPlayer, type GomokuState } from './engine';
import { gomokuDecide } from './ai';
import { createRng, randomSeed } from '../game/rng';
import type { AiLevel } from '../game/types';
import { isCharacterId, type CharacterId } from '../characters/roster';
import { useGame } from '../store/game';
import { useSettings, aiSpeedFactor, prefersReducedMotion } from '../store/settings';
import { readJSON, removeKey, throttledWriter, writeJSON } from '../store/storage';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import { translate } from '../i18n';
import type { StageReaction } from '../stage/Stage3D';
import type { ReactionKind } from '../store/game';
import { bridge, gameApis, type OnlineInfo, type TableDoc } from '../net/bridge';

export interface GomokuSeatConfig {
  readonly name: string;
  readonly kind: 'human' | 'ai';
  readonly level: AiLevel;
  readonly character: CharacterId;
}

export interface GomokuSetupConfig {
  readonly mode: 'solo' | 'local' | 'online';
  readonly seats: readonly [GomokuSeatConfig, GomokuSeatConfig];
  /** 0번 자리가 잡을 돌 (1 흑·먼저, 2 백) */
  readonly firstStone: 1 | 2;
  readonly noDoubleThree: boolean;
}

export interface GomokuSession {
  readonly v: 1;
  readonly id: string;
  readonly mode: 'solo' | 'local' | 'online';
  readonly config: GomokuSetupConfig;
  readonly state: GomokuState;
  readonly meta: readonly [{ readonly character: CharacterId }, { readonly character: CharacterId }];
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly recorded: boolean;
  readonly hintsLeft: number;
  readonly online?: OnlineInfo | null;
}

export interface GomokuRecord {
  readonly at: number;
  readonly mode: 'solo' | 'local' | 'online';
  readonly won: boolean | null;
  readonly moves: number;
  readonly level?: AiLevel;
}

interface GomokuStore {
  session: GomokuSession | null;
  ai: { seat: number } | null;
  /** 두기 전 미리보기 칸 */
  preview: number | null;
  /** 힌트로 보여 줄 칸 */
  hintCell: number | null;
  overlay: null | 'menu' | 'over';
  reactions: StageReaction[];
  waiting: boolean;
  records: readonly GomokuRecord[];
  start: (cfg: GomokuSetupConfig) => void;
  resume: () => boolean;
  rematch: () => void;
  quit: () => void;
  tap: (cell: number) => void;
  confirm: () => void;
  cancelPreview: () => void;
  undo: () => void;
  resign: () => void;
  hint: () => void;
  openMenu: () => void;
  closeOverlay: () => void;
  startOnline: (table: TableDoc, info: OnlineInfo) => void;
  applyRemote: (seat: number, payload: unknown) => boolean;
  adoptRemote: (payload: unknown, events: readonly unknown[], info: OnlineInfo) => void;
  seatToAi: (seat: number) => boolean;
  setWaiting: (v: boolean) => void;
}

const KEY = 'lumina.gomoku.v1';
const STATS_KEY = 'lumina.gomoku-stats.v1';
const SETUP_KEY = 'lumina.gomoku-setup.v1';
const save = throttledWriter(KEY, 300);
let aiToken = 0;
let reactionSeq = 0;
const aiRng = createRng(randomSeed());
const lang = (): 'ko' | 'en' => useSettings.getState().lang;
const tr = (path: string, params?: Record<string, string | number>): string => translate(lang(), path, params);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function hintBudget(): number {
  const h = useSettings.getState().hints;
  return h === 'unlimited' ? Infinity : h === 'off' ? 0 : 3;
}

function playersOf(cfg: GomokuSetupConfig): readonly [GomokuPlayer, GomokuPlayer] {
  const second: 1 | 2 = cfg.firstStone === 1 ? 2 : 1;
  const p = (s: GomokuSeatConfig, stone: 1 | 2): GomokuPlayer => ({ name: s.name, seat: s.kind, ...(s.kind === 'ai' ? { ai: s.level } : {}), stone });
  return [p(cfg.seats[0], cfg.firstStone), p(cfg.seats[1], second)];
}

/** 이 기기에서 "나"인 자리 */
export function viewerSeat(s: GomokuSession): number | null {
  if (s.online) return s.online.mySeat;
  if (s.mode === 'solo') return s.state.players[0].seat === 'human' ? 0 : 1;
  return null;
}

/** 이 기기가 둘 차례인가 */
export function isMyTurn(s: GomokuSession | null): boolean {
  if (!s || s.state.winner) return false;
  const cur = currentPlayer(s.state);
  if (s.online) return cur === s.online.mySeat;
  return s.state.players[cur]?.seat === 'human';
}

function payloadOf(s: GomokuSession): GomokuSession {
  return { ...s, hintsLeft: 0, online: null, recorded: false };
}

function sanitize(raw: unknown): GomokuSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as GomokuSession;
  if (s.v !== 1 || !gomokuValid(s.state) || !Array.isArray(s.meta) || s.meta.length !== 2) return null;
  if (!s.meta.every((m) => isCharacterId(m?.character))) return null;
  return s;
}

function isAction(x: unknown): x is GomokuAction {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  if (a.type === 'place') return Number.isInteger(a.cell);
  if (a.type === 'resign') return a.stone === 1 || a.stone === 2;
  return false;
}

export function savedGomoku(): { moves: number } | null {
  const s = sanitize(readJSON(KEY));
  return s && !s.state.winner && s.mode !== 'online' ? { moves: s.state.moves.length } : null;
}

export function loadGomokuSetup(): GomokuSetupConfig | null {
  const raw = readJSON<GomokuSetupConfig>(SETUP_KEY);
  if (!raw || !Array.isArray(raw.seats) || raw.seats.length !== 2) return null;
  const levels: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];
  const seat = (x: GomokuSeatConfig | undefined, i: number): GomokuSeatConfig => ({
    name: typeof x?.name === 'string' ? x.name.slice(0, 12) : `P${i + 1}`,
    kind: x?.kind === 'ai' ? 'ai' : 'human',
    level: x && levels.includes(x.level) ? x.level : 'casual',
    character: isCharacterId(x?.character) ? x.character : 'hwigi',
  });
  return {
    mode: raw.mode === 'local' ? 'local' : 'solo',
    seats: [seat(raw.seats[0], 0), seat(raw.seats[1], 1)],
    firstStone: raw.firstStone === 2 ? 2 : 1,
    noDoubleThree: raw.noDoubleThree !== false,
  };
}

export const useGomoku = create<GomokuStore>((set, get) => {
  const put = (session: GomokuSession | null, extra: Partial<GomokuStore> = {}): void => {
    set({ session, ...extra });
    if (session) {
      if (!session.online) save(session);
    } else removeKey(KEY);
  };

  const react = (seat: number, kind: ReactionKind, say?: string): void => {
    const r: StageReaction = { id: ++reactionSeq, seat, kind, ...(say ? { say, sayMs: 1400 } : {}) };
    set({ reactions: [...get().reactions.slice(-12), r] });
  };

  const record = (s: GomokuSession): GomokuSession => {
    if (s.recorded || !s.state.winner) return s;
    const me = viewerSeat(s);
    const won = s.state.winner === 3 || me === null ? null : s.state.players[me]?.stone === s.state.winner;
    const opp = me === null ? null : s.state.players[me === 0 ? 1 : 0];
    const rec: GomokuRecord = { at: Date.now(), mode: s.mode, won, moves: s.state.moves.length, ...(opp?.ai ? { level: opp.ai } : {}) };
    const records = [...get().records, rec].slice(-300);
    set({ records });
    writeJSON(STATS_KEY, records);
    return { ...s, recorded: true };
  };

  const effects = (s: GomokuSession, events: readonly GomokuEvent[], byOther: boolean): void => {
    const me = viewerSeat(s);
    for (const e of events) {
      switch (e.type) {
        case 'placed': {
          sfx('place', { pitch: e.stone === 1 ? 0.9 : 1.1 });
          if (!byOther) buzz('place');
          const seat = s.state.players[0].stone === e.stone ? 0 : 1;
          react(seat, 'play');
          break;
        }
        case 'win': {
          const seat = s.state.players[0].stone === e.stone ? 0 : 1;
          const mine = me === seat;
          sfx(mine || me === null ? 'win' : 'lose', { delay: 200 });
          buzz(mine ? 'success' : 'turn');
          react(seat, 'win', tr('gomoku.sayWin'));
          react(seat === 0 ? 1 : 0, 'lose');
          break;
        }
        case 'resign': {
          const seat = s.state.players[0].stone === e.stone ? 0 : 1;
          react(seat, 'lose');
          react(seat === 0 ? 1 : 0, 'win');
          sfx(me === seat ? 'lose' : 'win', { delay: 150 });
          break;
        }
        case 'draw':
          sfx('meld');
          break;
        case 'undo':
          sfx('slide');
          break;
        default:
          break;
      }
    }
  };

  const apply = (action: GomokuAction, byOther: boolean): boolean => {
    const s = get().session;
    if (!s) return false;
    const r = gomokuReduce(s.state, action);
    if (!r.ok) {
      if (!byOther) {
        sfx('invalid');
        buzz('error');
        useGame.getState().toastMsg(tr(`gomoku.err.${r.error}`), 'bad');
      }
      return false;
    }
    let next: GomokuSession = { ...s, state: r.state };
    if (r.state.winner) next = record({ ...next, endedAt: Date.now() });
    put(next, { preview: null, hintCell: null });
    effects(next, r.events, byOther);
    if (next.online?.role === 'host') bridge.publish?.('gomoku', payloadOf(next), r.events);
    if (r.state.winner) {
      set({ ai: null });
      setTimeout(() => {
        if (get().session?.id === next.id && get().session?.state.winner) set({ overlay: 'over' });
      }, prefersReducedMotion() ? 300 : 1400);
      return true;
    }
    turnFlow();
    return true;
  };

  const turnFlow = (): void => {
    const s = get().session;
    if (!s || s.state.winner) return;
    const cur = currentPlayer(s.state);
    const p = s.state.players[cur];
    if (!p || p.seat !== 'ai') return;
    if (s.online && s.online.role !== 'host') return;
    void runAi(cur);
  };

  const runAi = async (seat: number): Promise<void> => {
    const token = ++aiToken;
    set({ ai: { seat } });
    react(seat, 'think');
    const s0 = get().session;
    if (!s0) return;
    const level = s0.state.players[seat]?.ai ?? 'casual';
    const base = { beginner: 500, casual: 700, advanced: 850, expert: 1000 }[level];
    const t0 = Date.now();
    const cell = gomokuDecide(s0.state, aiRng, level);
    const wait = Math.max(0, base * aiSpeedFactor() * (0.7 + aiRng.next() * 0.6) - (Date.now() - t0));
    await sleep(prefersReducedMotion() ? Math.min(wait, 250) : wait);
    while (get().overlay === 'menu') {
      await sleep(100);
      if (token !== aiToken) return;
    }
    if (token !== aiToken || get().session?.state !== s0.state) return;
    set({ ai: null });
    if (cell >= 0) apply({ type: 'place', cell }, true);
  };

  const fresh = (cfg: GomokuSetupConfig): GomokuSession => ({
    v: 1,
    id: `g${randomSeed().toString(36)}${Date.now().toString(36)}`,
    mode: cfg.mode,
    config: cfg,
    state: newGomoku(playersOf(cfg), { noDoubleThree: cfg.noDoubleThree }),
    meta: [{ character: cfg.seats[0].character }, { character: cfg.seats[1].character }],
    startedAt: Date.now(),
    endedAt: null,
    recorded: false,
    hintsLeft: hintBudget(),
  });

  const startSession = (session: GomokuSession): void => {
    aiToken++;
    put(session, { ai: null, preview: null, hintCell: null, overlay: null, reactions: [], waiting: false });
    useGame.getState().go('gomoku');
    sfx('shuffle');
    if (session.online?.role === 'host') bridge.publish?.('gomoku', payloadOf(session), []);
    turnFlow();
  };

  /** 이 기기의 수: 참가자는 방장에게, 나머지는 바로 */
  const submit = (action: GomokuAction): void => {
    const s = get().session;
    if (!s || get().waiting) return;
    if (s.online?.role === 'guest') {
      set({ waiting: true, preview: null });
      bridge.send?.('gomoku', action);
      sfx('button');
      return;
    }
    apply(action, false);
  };

  return {
    session: null,
    ai: null,
    preview: null,
    hintCell: null,
    overlay: null,
    reactions: [],
    waiting: false,
    records: (() => {
      const raw = readJSON<GomokuRecord[]>(STATS_KEY);
      return Array.isArray(raw) ? raw.filter((r) => r && typeof r.at === 'number').slice(-300) : [];
    })(),

    start: (cfg) => {
      writeJSON(SETUP_KEY, cfg);
      startSession(fresh(cfg));
    },

    resume: () => {
      const s = sanitize(readJSON(KEY));
      if (!s || s.state.winner || s.mode === 'online') return false;
      startSession({ ...s, hintsLeft: Number.isFinite(s.hintsLeft) || s.hintsLeft === Infinity ? s.hintsLeft : hintBudget() });
      return true;
    },

    rematch: () => {
      const s = get().session;
      if (!s || s.online?.role === 'guest') return;
      // 돌 색을 바꿔서 다시
      const cfg: GomokuSetupConfig = { ...s.config, firstStone: s.config.firstStone === 1 ? 2 : 1 };
      startSession({ ...fresh(cfg), online: s.online ?? null });
    },

    quit: () => {
      aiToken++;
      if (get().session?.online) bridge.leave?.();
      put(null, { ai: null, overlay: null, preview: null, hintCell: null, waiting: false });
      useGame.getState().go('home');
    },

    tap: (cell) => {
      const s = get().session;
      if (!s || !isMyTurn(s) || get().ai || get().waiting) return;
      if (get().preview === cell) {
        get().confirm();
        return;
      }
      const err = canPlace(s.state, cell);
      if (err) {
        if (err !== 'occupied') {
          sfx('invalid');
          useGame.getState().toastMsg(tr(`gomoku.err.${err}`), 'bad');
        }
        return;
      }
      set({ preview: cell });
      sfx('pick');
      buzz('tap');
    },

    confirm: () => {
      const cell = get().preview;
      const s = get().session;
      if (cell === null || !s || !isMyTurn(s)) return;
      submit({ type: 'place', cell });
    },

    cancelPreview: () => set({ preview: null }),

    undo: () => {
      const s = get().session;
      if (!s || s.online || get().ai) return;
      if (s.mode === 'solo') {
        // 내 차례로 돌아오게: AI 수와 내 수를 함께 무른다
        if (!isMyTurn(s) && !s.state.winner) return;
        const me = viewerSeat(s) ?? 0;
        const myStone = s.state.players[me]?.stone;
        const last = s.state.moves.length;
        const lastStone = last % 2 === 1 ? 1 : 2;
        const count = lastStone === myStone ? 1 : 2;
        if (last < count) return;
        aiToken++;
        apply({ type: 'undo', count }, false);
        set({ overlay: null });
        return;
      }
      apply({ type: 'undo', count: 1 }, false);
      set({ overlay: null });
    },

    resign: () => {
      const s = get().session;
      if (!s || s.state.winner) return;
      const me = viewerSeat(s) ?? currentPlayer(s.state);
      const stone = s.state.players[me]?.stone ?? s.state.turn;
      set({ overlay: null });
      submit({ type: 'resign', stone });
    },

    hint: () => {
      const s = get().session;
      if (!s || !isMyTurn(s)) return;
      if (s.hintsLeft <= 0) {
        useGame.getState().toastMsg(tr('gomoku.hintOut'), 'warn');
        return;
      }
      const cell = gomokuDecide(s.state, createRng(randomSeed()), 'expert');
      if (cell < 0) return;
      sfx('hint');
      put({ ...s, hintsLeft: s.hintsLeft - 1 }, { hintCell: cell, preview: cell });
    },

    openMenu: () => set({ overlay: 'menu' }),
    closeOverlay: () => set({ overlay: null }),

    startOnline: (table, info) => {
      const seat = (i: number): GomokuSeatConfig => {
        const x = table.seats[i];
        return { name: x?.name ?? `P${i + 1}`, kind: x?.kind ?? 'human', level: x?.level ?? 'casual', character: x?.character ?? 'hwigi' };
      };
      const cfg: GomokuSetupConfig = { mode: 'online', seats: [seat(0), seat(1)], firstStone: 1, noDoubleThree: true };
      startSession({ ...fresh(cfg), online: info });
    },

    applyRemote: (seat, payload) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host' || !isAction(payload)) return false;
      if (seat === s.online.mySeat || s.state.players[seat]?.seat !== 'human') return false;
      if (payload.type === 'place') {
        if (currentPlayer(s.state) !== seat || get().ai) return false;
        return apply(payload, true);
      }
      // 기권은 그 자리의 돌로만
      if (payload.type !== 'resign' || s.state.players[seat]?.stone !== payload.stone) return false;
      return apply(payload, true);
    },

    adoptRemote: (payload, events, info) => {
      const incoming = sanitize({ ...(payload as object), hintsLeft: 0 });
      if (!incoming) return;
      const prev = get().session;
      const same = prev?.id === incoming.id;
      let next: GomokuSession = { ...incoming, online: info, hintsLeft: same && prev ? prev.hintsLeft : hintBudget(), recorded: same && prev ? prev.recorded : false };
      if (next.state.winner && !next.endedAt) next = { ...next, endedAt: Date.now() };
      if (next.state.winner) next = record(next);
      const pv = get().preview;
      put(next, { waiting: false, preview: same && pv !== null && next.state.board[pv] === 0 ? pv : null, ai: null, ...(same ? {} : { reactions: [], overlay: null, hintCell: null }) });
      if (useGame.getState().screen !== 'gomoku') useGame.getState().go('gomoku');
      effects(next, events as readonly GomokuEvent[], true);
      if (next.state.winner && get().overlay !== 'over') {
        setTimeout(() => {
          if (get().session?.id === next.id && get().session?.state.winner) set({ overlay: 'over' });
        }, prefersReducedMotion() ? 300 : 1400);
      }
      if (info.role === 'host') {
        aiToken++;
        turnFlow();
      } else if (isMyTurn(next)) buzz('turn');
    },

    seatToAi: (seat) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host') return false;
      const p = s.state.players[seat];
      if (!p || p.seat !== 'human' || seat === s.online.mySeat) return false;
      const players = s.state.players.map((x, i) => (i === seat ? { ...x, seat: 'ai' as const, ai: 'casual' as const } : x)) as unknown as readonly [GomokuPlayer, GomokuPlayer];
      const next: GomokuSession = { ...s, state: { ...s.state, players } };
      put(next);
      bridge.publish?.('gomoku', payloadOf(next), []);
      turnFlow();
      return true;
    },

    setWaiting: (v) => set({ waiting: v }),
  };
});

gameApis.gomoku = () => useGomoku.getState();
