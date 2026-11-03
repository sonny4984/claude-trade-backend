/**
 * 별판 점프 진행 — 한 기기(사람·AI 섞어서 돌아가며)와 온라인(방장이 판정).
 * 말을 누르면 갈 수 있는 곳이 보이고, 그곳을 누르면 옮긴다.
 */
import { create } from 'zustand';
import { legalMoves, newStar, reach, starReduce, starValid, type StarAction, type StarEvent, type StarPlayer, type StarState } from './engine';
import { starDecide } from './ai';
import { createRng, randomSeed } from '../game/rng';
import type { AiLevel } from '../game/types';
import { isCharacterId, type CharacterId } from '../characters/roster';
import { useGame } from '../store/game';
import { aiSpeedFactor, prefersReducedMotion } from '../store/settings';
import { readJSON, removeKey, throttledWriter, writeJSON } from '../store/storage';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import { bridge, gameApis, type OnlineInfo, type TableDoc } from '../net/bridge';

export interface StarSeatConfig {
  readonly name: string;
  readonly kind: 'human' | 'ai';
  readonly level: AiLevel;
  readonly character: CharacterId;
}

export interface StarSetupConfig {
  readonly seats: readonly StarSeatConfig[];
}

export interface StarSession {
  readonly v: 1;
  readonly id: string;
  readonly mode: 'local' | 'online';
  readonly state: StarState;
  readonly startedAt: number;
  readonly online?: OnlineInfo | null;
}

interface StarStore {
  session: StarSession | null;
  /** 고른 말 */
  selected: number | null;
  ai: number | null;
  overlay: null | 'menu' | 'over';
  waiting: boolean;
  start: (cfg: StarSetupConfig) => void;
  resume: () => boolean;
  rematch: () => void;
  quit: () => void;
  tap: (cell: number) => void;
  undo: () => void;
  resign: () => void;
  openMenu: () => void;
  closeOverlay: () => void;
  startOnline: (table: TableDoc, info: OnlineInfo) => void;
  applyRemote: (seat: number, payload: unknown) => boolean;
  adoptRemote: (payload: unknown, events: readonly unknown[], info: OnlineInfo) => void;
  seatToAi: (seat: number) => boolean;
  setWaiting: (v: boolean) => void;
}

const KEY = 'lumina.star.v1';
const SETUP_KEY = 'lumina.star-setup.v1';
const save = throttledWriter(KEY, 300);
const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];
let aiToken = 0;
const aiRng = createRng(randomSeed());
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** 뛰는 모습을 보여 줄 시간 (칸마다) */
export const HOP_MS = 150;

/** 이 기기에서 "나"인 자리 (한 기기에 사람이 여럿이면 null) */
export function viewerSeat(s: StarSession | null): number | null {
  if (!s) return null;
  if (s.online) return s.online.mySeat;
  const humans = s.state.players.flatMap((p, i) => (p.seat === 'human' ? [i] : []));
  return humans.length === 1 ? (humans[0] ?? null) : null;
}

export function isMyTurn(s: StarSession | null): boolean {
  if (!s || s.state.winner !== null) return false;
  if (s.online) return s.state.turn === s.online.mySeat;
  return s.state.players[s.state.turn]?.seat === 'human';
}

function sanitize(raw: unknown): StarSession | null {
  const s = raw as StarSession | null;
  if (!s || typeof s !== 'object' || s.v !== 1 || typeof s.id !== 'string' || !starValid(s.state)) return null;
  if (!s.state.players.every((p) => isCharacterId(p.character) && typeof p.name === 'string')) return null;
  return s;
}

function isAction(x: unknown): x is StarAction {
  const a = x as Record<string, unknown> | null;
  if (!a || typeof a !== 'object') return false;
  if (a.type === 'move') return Number.isInteger(a.from) && Number.isInteger(a.to);
  if (a.type === 'resign') return Number.isInteger(a.seat);
  return false;
}

export function savedStar(): { moves: number; players: number } | null {
  const s = sanitize(readJSON(KEY));
  return s && s.state.winner === null && s.mode !== 'online' ? { moves: s.state.moves.length, players: s.state.players.length } : null;
}

export function loadStarSetup(): StarSetupConfig | null {
  const raw = readJSON<StarSetupConfig>(SETUP_KEY);
  if (!raw || !Array.isArray(raw.seats) || raw.seats.length < 2 || raw.seats.length > 3) return null;
  return {
    seats: raw.seats.map((x, i) => ({
      name: typeof x?.name === 'string' ? x.name.slice(0, 12) : `P${i + 1}`,
      kind: x?.kind === 'ai' ? 'ai' : 'human',
      level: LEVELS.includes(x?.level) ? x.level : 'casual',
      character: isCharacterId(x?.character) ? x.character : 'hwigi',
    })),
  };
}

const playersOf = (seats: readonly StarSeatConfig[]): StarPlayer[] =>
  seats.map((x) => ({ name: x.name, seat: x.kind, ...(x.kind === 'ai' ? { ai: x.level } : {}), character: x.character }));

export const useStar = create<StarStore>((set, get) => {
  const put = (session: StarSession | null, extra: Partial<StarStore> = {}): void => {
    set({ session, ...extra });
    if (session) {
      if (!session.online) save(session);
    } else removeKey(KEY);
  };

  const effects = (s: StarSession, events: readonly StarEvent[], byOther: boolean): void => {
    const me = viewerSeat(s);
    for (const e of events) {
      if (e.type === 'moved') {
        const hops = e.move.path.length - 1;
        for (let k = 0; k < hops; k++) sfx('place', { pitch: 0.9 + k * 0.08, delay: k * HOP_MS });
        if (!byOther) buzz('place');
      } else if (e.type === 'arrived') {
        sfx('meld', { delay: 200 });
      } else if (e.type === 'win') {
        const mine = me === null || me === e.seat;
        sfx(mine ? 'win' : 'lose', { delay: 300 });
        buzz(mine ? 'success' : 'turn');
      } else if (e.type === 'undo') sfx('slide');
    }
  };

  const showOver = (id: string): void => {
    setTimeout(() => {
      if (get().session?.id === id && get().session?.state.winner !== null) set({ overlay: 'over' });
    }, prefersReducedMotion() ? 300 : 1500);
  };

  const apply = (action: StarAction, byOther: boolean): boolean => {
    const s = get().session;
    if (!s) return false;
    const r = starReduce(s.state, action);
    if (!r.ok) {
      if (!byOther) sfx('invalid');
      return false;
    }
    const next: StarSession = { ...s, state: r.state };
    put(next, { selected: null });
    effects(next, r.events, byOther);
    if (next.online?.role === 'host') bridge.publish?.('star', { ...next, online: null }, r.events);
    if (r.state.winner !== null) {
      set({ ai: null });
      showOver(next.id);
      return true;
    }
    turnFlow();
    return true;
  };

  const turnFlow = (): void => {
    const s = get().session;
    if (!s || s.state.winner !== null) return;
    const p = s.state.players[s.state.turn];
    if (!p || p.seat !== 'ai') return;
    if (s.online && s.online.role !== 'host') return;
    void runAi(s.state.turn);
  };

  const runAi = async (seat: number): Promise<void> => {
    const token = ++aiToken;
    set({ ai: seat });
    const s0 = get().session;
    if (!s0) return;
    // 앞 수가 뛰는 동안 기다린다
    const lastHops = (s0.state.moves[s0.state.moves.length - 1]?.path.length ?? 1) - 1;
    const plan = starDecide(s0.state, aiRng, s0.state.players[seat]?.ai ?? 'casual');
    const wait = lastHops * HOP_MS + 450 * aiSpeedFactor() * (0.7 + aiRng.next() * 0.6);
    await sleep(prefersReducedMotion() ? 200 : wait);
    while (get().overlay === 'menu') {
      await sleep(100);
      if (token !== aiToken) return;
    }
    if (token !== aiToken || get().session?.state !== s0.state) return;
    set({ ai: null });
    if (plan) apply({ type: 'move', ...plan }, true);
  };

  const fresh = (seats: readonly StarSeatConfig[], mode: 'local' | 'online'): StarSession => ({
    v: 1,
    id: `s${randomSeed().toString(36)}${Date.now().toString(36)}`,
    mode,
    state: newStar(playersOf(seats)),
    startedAt: Date.now(),
  });

  const startSession = (session: StarSession): void => {
    aiToken++;
    put(session, { selected: null, ai: null, overlay: null, waiting: false });
    useGame.getState().go('star');
    sfx('shuffle');
    if (session.online?.role === 'host') bridge.publish?.('star', { ...session, online: null }, []);
    turnFlow();
  };

  const submit = (action: StarAction): void => {
    const s = get().session;
    if (!s || get().waiting) return;
    if (s.online?.role === 'guest') {
      set({ waiting: true, selected: null });
      bridge.send?.('star', action);
      sfx('button');
      return;
    }
    apply(action, false);
  };

  return {
    session: null,
    selected: null,
    ai: null,
    overlay: null,
    waiting: false,

    start: (cfg) => {
      writeJSON(SETUP_KEY, cfg);
      startSession(fresh(cfg.seats, 'local'));
    },

    resume: () => {
      const s = sanitize(readJSON(KEY));
      if (!s || s.state.winner !== null || s.mode === 'online') return false;
      startSession(s);
      return true;
    },

    rematch: () => {
      const s = get().session;
      if (!s || s.online?.role === 'guest') return;
      // 먼저 두는 사람을 한 칸씩 돌린다
      const p = s.state.players;
      const seats: StarSeatConfig[] = p.map((x) => ({ name: x.name, kind: x.seat, level: x.ai ?? 'casual', character: x.character }));
      const next = fresh(seats, s.mode);
      const first = (s.state.moves[0]?.seat ?? 0) + 1;
      startSession({ ...next, state: { ...next.state, turn: first % p.length }, online: s.online ?? null });
    },

    quit: () => {
      aiToken++;
      if (get().session?.online) bridge.leave?.();
      put(null, { ai: null, overlay: null, selected: null, waiting: false });
      useGame.getState().go('home');
    },

    tap: (cell) => {
      const s = get().session;
      if (!s || !isMyTurn(s) || get().ai !== null || get().waiting) return;
      const seat = s.state.turn;
      const sel = get().selected;
      if (s.state.board[cell] === seat + 1) {
        if (sel === cell) {
          set({ selected: null });
          return;
        }
        if (reach(s.state.board, cell).size === 0) {
          sfx('invalid');
          return;
        }
        set({ selected: cell });
        sfx('pick');
        buzz('tap');
        return;
      }
      if (sel !== null && reach(s.state.board, sel).has(cell)) {
        submit({ type: 'move', from: sel, to: cell });
        return;
      }
      if (sel !== null) set({ selected: null });
    },

    undo: () => {
      const s = get().session;
      if (!s || s.online || get().ai !== null) return;
      // 마지막 사람 수까지 (그 뒤의 AI 수와 함께) 되돌린다
      const moves = s.state.moves;
      let count = 0;
      for (let k = moves.length - 1; k >= 0; k--) {
        count++;
        if (s.state.players[moves[k]?.seat ?? 0]?.seat === 'human') break;
      }
      if (!count || s.state.players[moves[moves.length - count]?.seat ?? 0]?.seat !== 'human') return;
      aiToken++;
      apply({ type: 'undo', count }, false);
      set({ overlay: null, ai: null });
    },

    resign: () => {
      const s = get().session;
      if (!s || s.state.winner !== null) return;
      const me = viewerSeat(s) ?? s.state.turn;
      set({ overlay: null });
      submit({ type: 'resign', seat: me });
    },

    openMenu: () => set({ overlay: 'menu' }),
    closeOverlay: () => set({ overlay: null }),

    startOnline: (table, info) => {
      const seats: StarSeatConfig[] = table.seats.slice(0, 3).map((x, i) => ({ name: x?.name ?? `P${i + 1}`, kind: x?.kind ?? 'human', level: x?.level ?? 'casual', character: x?.character ?? 'hwigi' }));
      if (seats.length < 2) return;
      startSession({ ...fresh(seats, 'online'), online: info });
    },

    applyRemote: (seat, payload) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host' || !isAction(payload)) return false;
      if (seat === s.online.mySeat || s.state.players[seat]?.seat !== 'human') return false;
      if (payload.type === 'move') {
        if (s.state.turn !== seat || get().ai !== null) return false;
        return apply(payload, true);
      }
      if (payload.type === 'resign' && payload.seat === seat) return apply(payload, true);
      return false;
    },

    adoptRemote: (payload, events, info) => {
      const incoming = sanitize(payload);
      if (!incoming) return;
      const prev = get().session;
      const same = prev?.id === incoming.id;
      const next: StarSession = { ...incoming, online: info };
      put(next, { waiting: false, ai: null, selected: same ? get().selected : null, ...(same ? {} : { overlay: null }) });
      if (useGame.getState().screen !== 'star') useGame.getState().go('star');
      effects(next, events as readonly StarEvent[], true);
      if (next.state.winner !== null && get().overlay !== 'over') showOver(next.id);
      const sel = get().selected;
      if (sel !== null && next.state.board[sel] !== info.mySeat + 1) set({ selected: null });
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
      const players = s.state.players.map((x, i) => (i === seat ? { ...x, seat: 'ai' as const, ai: 'casual' as const } : x));
      const next: StarSession = { ...s, state: { ...s.state, players } };
      put(next);
      bridge.publish?.('star', { ...next, online: null }, []);
      turnFlow();
      return true;
    },

    setWaiting: (v) => set({ waiting: v }),
  };
});

/** 이 기기에서 지금 둘 수 있는 말들 (갈 곳이 있는 내 말) */
export function movable(s: StarSession): Set<number> {
  return new Set(legalMoves(s.state, s.state.turn).map((m) => m.from));
}

gameApis.star = () => useStar.getState();

// 시험용 손잡이 — 내 컴퓨터(localhost)에서 열었을 때만
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  (window as unknown as { __star?: unknown }).__star = { store: useStar };
}
