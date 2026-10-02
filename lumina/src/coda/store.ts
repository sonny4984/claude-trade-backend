/**
 * 다빈치 코드 진행 — 커널(engine)과 화면 사이의 다리.
 * 사람의 추리는 잠깐 뜸을 들인 뒤(긴장감) 판정하고, AI는 생각 → 말하기 → 판정 순으로 연출한다.
 * 함께 두기에서는 차례마다 가림막으로 패를 숨긴다.
 */
import { create } from 'zustand';
import { codaReduce, codaInvariants, hiddenCount, newCoda, type CodaAction, type CodaEvent, type CodaGuess, type CodaPenalty, type CodaState } from './engine';
import { codaDecide, codaThinkTime } from './ai';
import { beliefs, guessOptions, narrowest, slotCandidates } from './deduce';
import { useCodaStats } from './stats';
import { createRng, randomSeed } from '../game/rng';
import type { AiLevel } from '../game/types';
import { isCharacterId, type CharacterId } from '../characters/roster';
import { useGame } from '../store/game';
import { useSettings, aiSpeedFactor, prefersReducedMotion } from '../store/settings';
import { readJSON, removeKey, throttledWriter, writeJSON } from '../store/storage';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import { subj, translate } from '../i18n';
import type { StageReaction } from '../stage/Stage3D';
import type { ReactionKind } from '../store/game';
import { bridge, type OnlineInfo, type TableDoc } from '../net/bridge';

export interface CodaSeatConfig {
  readonly name: string;
  readonly kind: 'human' | 'ai';
  readonly level: AiLevel;
  readonly character: CharacterId;
}

export interface CodaSetupConfig {
  readonly mode: 'solo' | 'local' | 'online';
  readonly seats: readonly CodaSeatConfig[];
  readonly jokers: boolean;
  /** 틀렸을 때 공개하는 타일: 내가 고른 숨은 타일(choose, 기본) 또는 방금 뽑은 타일(drawn, 공식) */
  readonly penalty: CodaPenalty;
}

export interface CodaSession {
  readonly v: 1;
  readonly id: string;
  readonly mode: 'solo' | 'local' | 'online';
  readonly config: CodaSetupConfig;
  readonly state: CodaState;
  readonly meta: readonly { readonly character: CharacterId }[];
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly hintsLeft: number;
  readonly recorded: boolean;
  /** 온라인 대전이면 방 코드·역할·내 자리 */
  readonly online?: OnlineInfo | null;
}

/**
 * 힌트 — 도움 정도에 따라 보여 주는 만큼이 다르다.
 *  스스로: 가장 좁혀진 타일(또는 고른 타일)과 올 수 있는 숫자 "개수"만
 *  조금: 올 수 있는 숫자들 (확률 없이)
 *  많이: 숫자마다 확률, 아무것도 안 고르면 가장 그럴듯한 추리
 */
export interface CodaHint {
  readonly target: number;
  readonly index: number;
  /** 많이 — 한 타일을 골라 물었을 때: 그 타일의 후보들과 확률 */
  readonly candidates?: readonly { value: CodaGuess; p: number }[];
  /** 많이 — 아무것도 안 고르고 물었을 때: 가장 그럴듯한 추리 */
  readonly best?: { value: CodaGuess; p: number };
  /** 조금 — 올 수 있는 숫자들 */
  readonly possible?: readonly CodaGuess[];
  /** 스스로 — 올 수 있는 숫자 개수 */
  readonly count?: number;
}

interface CodaStore {
  session: CodaSession | null;
  selected: { target: number; index: number } | null;
  ai: { seat: number; phase: 'thinking' | 'speaking' | 'deciding' } | null;
  /** 말한 뒤 판정까지의 뜸 — 대상 타일을 가리킨다 */
  pending: { by: number; target: number; index: number; value: CodaGuess } | null;
  /** 틀린 뒤 공개하려고 고른 내 타일 (공개하기를 눌러야 확정) */
  ownPick: number | null;
  /** 판정 결과를 번쩍 보여 줄 타일 */
  flash: { id: number; target: number; tile: number; hit: boolean } | null;
  curtain: boolean;
  overlay: null | 'menu' | 'over' | 'log';
  hint: CodaHint | null;
  reactions: StageReaction[];
  lastText: string | null;
  /** 온라인 참가자: 방장에게 보낸 수의 답을 기다리는 중 */
  waiting: boolean;
  start: (cfg: CodaSetupConfig) => void;
  resume: () => boolean;
  rematch: () => void;
  quit: () => void;
  leave: () => void;
  /** 더미에서 이 색을 한 장 가져온다 (처음 고르기·차례 뽑기) */
  drawColor: (color: 'black' | 'white') => void;
  select: (target: number, index: number) => void;
  clearSelect: () => void;
  guess: (value: CodaGuess) => void;
  cont: () => void;
  stop: () => void;
  place: (index: number) => void;
  revealOwn: (index: number) => void;
  /** 공개할 내 타일 고르기 (한 번 더 누르면 취소) */
  pickOwn: (index: number) => void;
  /** 고른 타일을 공개하기 */
  revealPicked: () => void;
  reveal: () => void;
  openMenu: () => void;
  openLog: () => void;
  closeOverlay: () => void;
  requestHint: () => void;
  /** 온라인 — 방장: 로비의 자리로 판 시작 */
  startOnline: (table: TableDoc, info: OnlineInfo) => void;
  /** 온라인 — 방장: 참가자가 보낸 수 (틀리면 false) */
  applyRemote: (seat: number, payload: unknown) => boolean;
  /** 온라인 — 참가자: 방장이 올린 판을 받는다 */
  adoptRemote: (payload: unknown, events: readonly unknown[], info: OnlineInfo) => void;
  /** 온라인 — 방장: 나간 친구 자리를 AI가 이어 둔다 */
  seatToAi: (seat: number) => boolean;
}

const KEY = 'lumina.coda.v1';
const save = throttledWriter(KEY, 300);
let aiToken = 0;
let reactionSeq = 0;
let flashSeq = 0;
const aiRng = createRng(randomSeed());

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lang = (): 'ko' | 'en' => useSettings.getState().lang;
const tr = (path: string, params?: Record<string, string | number>): string => translate(lang(), path, params);

/** 주소의 ?seed=N 으로 판 고정 (테스트) */
function urlSeed(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('seed');
    return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null;
  } catch {
    return null;
  }
}

/** 도움 정도(루미큐브와 같은 설정): 스스로 1번 · 조금 3번 · 많이 무제한 */
function hintBudget(): number {
  const a = useSettings.getState().assist;
  return a === 'lots' ? Infinity : a === 'some' ? 3 : 1;
}

export function valueText(v: CodaGuess): string {
  return v === 'joker' ? tr('coda.joker') : String(v);
}

/** 이 기기가 둘 차례인가 (온라인이면 내 자리 차례만) */
export function isHumanTurn(s: CodaSession | null): boolean {
  if (!s) return false;
  const st = s.state;
  if (st.phase === 'over') return false;
  if (s.online) return st.current === s.online.mySeat;
  return st.players[st.current]?.seat === 'human';
}

/** 판을 방에 올릴 때 (이 기기에만 의미 있는 값은 뺀다) */
function payloadOf(s: CodaSession): CodaSession {
  return { ...s, hintsLeft: 0, online: null, recorded: false };
}

const isAction = (x: unknown): x is CodaAction => {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  switch (a.type) {
    case 'draw':
      return a.color === 'black' || a.color === 'white';
    case 'guess':
      return Number.isInteger(a.target) && Number.isInteger(a.index) && (a.value === 'joker' || Number.isInteger(a.value));
    case 'continue':
    case 'stop':
      return true;
    case 'place':
    case 'reveal-own':
      return Number.isInteger(a.index);
    default:
      return false;
  }
};

/** 화면 앞자리(아래쪽 "내 코드")의 주인: 혼자 두기는 사람, 함께 두기는 지금 차례의 사람 */
export function viewerOf(s: CodaSession): number {
  const st = s.state;
  if (s.online) return s.online.mySeat;
  if (s.mode === 'local') {
    if (st.players[st.current]?.seat === 'human') return st.current;
    // AI 차례에는 마지막으로 둔 사람 시점을 유지
    const humans = st.players.map((p, i) => (p.seat === 'human' ? i : -1)).filter((i) => i >= 0);
    return humans[0] ?? 0;
  }
  return Math.max(0, st.players.findIndex((p) => p.seat === 'human'));
}

function sanitize(raw: unknown): CodaSession | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as CodaSession;
  if (s.v !== 1 || !s.state || !Array.isArray(s.state.players) || !Array.isArray(s.meta)) return null;
  // 예전 저장에는 첫 차례 자리(first)가 없다 — 이미 처음 고르기가 끝난 판이라 아무 값이면 된다
  if (typeof s.state.first !== 'number') s = { ...s, state: { ...s.state, first: 0 } };
  // 공개 규칙이 생기기 전 판은 공식 규칙(뽑은 타일 공개) 그대로 이어 둔다
  if (s.state.penalty !== 'choose' && s.state.penalty !== 'drawn') s = { ...s, state: { ...s.state, penalty: 'drawn' } };
  if (typeof s.state.mustReveal !== 'boolean') s = { ...s, state: { ...s.state, mustReveal: false } };
  if (typeof s.state.justPlaced !== 'number') s = { ...s, state: { ...s.state, justPlaced: null } };
  if (s.config && s.config.penalty !== 'drawn') s = { ...s, config: { ...s.config, penalty: 'choose' } };
  if (codaInvariants(s.state).length) return null;
  if (!s.meta.every((m) => isCharacterId(m?.character))) return null;
  return s;
}

export function savedCoda(): { turn: number; players: number } | null {
  const s = sanitize(readJSON(KEY));
  if (!s || s.state.phase === 'over') return null;
  return { turn: s.state.turnNo, players: s.state.players.length };
}

export const useCoda = create<CodaStore>((set, get) => {
  const put = (session: CodaSession | null, extra: Partial<CodaStore> = {}): void => {
    set({ session, ...extra });
    if (session) save(session);
    else removeKey(KEY);
  };

  const react = (seat: number, kind: ReactionKind, say?: string, sayMs?: number): void => {
    const r: StageReaction = { id: ++reactionSeq, seat, kind, ...(say ? { say, sayMs: sayMs ?? 1400 } : {}) };
    set({ reactions: [...get().reactions.slice(-12), r] });
  };

  const nameOf = (s: CodaSession, p: number): string => s.state.players[p]?.name ?? '';

  const record = (s: CodaSession): CodaSession => {
    if (s.recorded || s.state.winner === null) return s;
    const st = s.state;
    const humans = st.players.map((p, i) => (p.seat === 'human' ? i : -1)).filter((i) => i >= 0);
    const me = s.online ? s.online.mySeat : (humans[0] ?? 0);
    const stats = st.players[me]?.stats;
    useCodaStats.getState().add({
      at: Date.now(),
      mode: s.mode,
      names: st.players.map((p) => p.name),
      me,
      winner: st.winner ?? 0,
      guesses: stats?.guesses ?? 0,
      correct: stats?.correct ?? 0,
      bestStreak: stats?.bestStreak ?? 0,
      durationMs: Date.now() - s.startedAt,
    });
    return { ...s, recorded: true };
  };

  /** 이벤트 → 소리·진동·캐릭터 반응·알림 */
  const effects = (s: CodaSession, events: readonly CodaEvent[], byAi: boolean): void => {
    const viewer = viewerOf(s);
    let text: string | null = null;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const who = nameOf(s, e.p);
          const whom = nameOf(s, e.target);
          text = tr('coda.logHit', { subj: subj(lang(), who), name: whom, value: valueText(e.value) });
          sfx(e.streak >= 2 ? 'meld' : 'commit');
          react(e.p, e.streak >= 2 ? 'combo' : 'play', tr('coda.sayHit'));
          react(e.target, 'surprise');
          set({ flash: { id: ++flashSeq, target: e.target, tile: e.tile, hit: true } });
          if (e.target === viewer && s.state.players[viewer]?.seat === 'human') {
            buzz('warn');
            useGame.getState().toastMsg(tr('coda.youWereHit', { subj: subj(lang(), who), value: valueText(e.value) }), 'warn');
          } else if (!byAi) buzz('success');
          break;
        }
        case 'miss': {
          const who = nameOf(s, e.p);
          text = tr('coda.logMiss', { subj: subj(lang(), who), name: nameOf(s, e.target), value: valueText(e.value) });
          sfx('invalid');
          react(e.p, 'draw', tr('coda.sayMiss'));
          react(e.target, 'nod');
          if (!byAi) buzz('error');
          break;
        }
        case 'placed':
          sfx('place', { delay: 120 });
          if (e.revealed && e.tile !== null) set({ flash: { id: ++flashSeq, target: e.p, tile: e.tile, hit: false } });
          break;
        case 'reveal-own':
          sfx('place');
          set({ flash: { id: ++flashSeq, target: e.p, tile: e.tile, hit: false } });
          break;
        case 'out': {
          react(e.p, 'lose');
          const mine = s.online ? e.p === s.online.mySeat : s.state.players[e.p]?.seat === 'human' && s.mode === 'solo';
          useGame.getState().toastMsg(mine ? tr('coda.youOut') : tr('coda.out', { name: nameOf(s, e.p) }), mine ? 'bad' : 'info');
          break;
        }
        case 'over': {
          const humanWon = s.online ? e.winner === s.online.mySeat : s.state.players[e.winner]?.seat === 'human';
          sfx(humanWon || s.mode === 'local' ? 'win' : 'lose', { delay: 250 });
          buzz(humanWon ? 'success' : 'turn');
          s.state.players.forEach((_, i) => react(i, i === e.winner ? 'win' : 'lose'));
          break;
        }
        case 'turn':
          sfx('turn', { delay: 150 });
          break;
        case 'drew': {
          const mine = s.online ? e.p === s.online.mySeat : s.state.players[e.p]?.seat === 'human';
          sfx(e.deal ? 'pick' : 'draw', { pitch: e.color === 'black' ? 0.9 : 1.1 });
          if (!mine && !e.deal) react(e.p, 'play');
          break;
        }
        default:
          break;
      }
    }
    if (text) set({ lastText: text });
  };

  /** 커널에 수를 넣는다. 성공하면 true */
  const apply = (action: CodaAction, byAi: boolean): boolean => {
    const s = get().session;
    if (!s) return false;
    const prev = s.state;
    const r = codaReduce(prev, action);
    if (!r.ok) {
      if (!byAi) {
        sfx('invalid');
        useGame.getState().toastMsg(tr(`coda.err.${r.error}`), 'bad');
      }
      return false;
    }
    let next: CodaSession = { ...s, state: r.state };
    if (r.state.phase === 'over') next = record({ ...next, endedAt: Date.now() });
    const turnChanged = r.state.current !== prev.current || r.state.turnNo !== prev.turnNo;
    put(next, { selected: null, pending: null, ownPick: null, hint: turnChanged ? null : get().hint });
    effects(next, r.events, byAi);
    if (next.online?.role === 'host') bridge.publish?.('coda', payloadOf(next), r.events);
    if (r.state.phase === 'over') {
      set({ ai: null });
      window.setTimeout(() => {
        if (get().session === next || get().session?.state === next.state) set({ overlay: 'over' });
      }, prefersReducedMotion() ? 300 : 1600);
      return true;
    }
    if (turnChanged) beginTurnFlow();
    return true;
  };

  const beginTurnFlow = (): void => {
    const s = get().session;
    if (!s || s.state.phase === 'over') return;
    const cur = s.state.players[s.state.current];
    if (!cur) return;
    if (s.online) {
      // 온라인: AI는 방장만 돌리고, 다른 사람 차례는 기다린다
      set({ curtain: false });
      if (s.online.role === 'host' && cur.seat === 'ai') void runAi();
      return;
    }
    if (cur.seat === 'ai') {
      set({ curtain: false });
      void runAi();
      return;
    }
    // 함께 두기: 사람이 둘 이상이면 차례마다 가림막
    const humans = s.state.players.filter((p) => p.seat === 'human' && !p.out).length;
    if (s.mode === 'local' && humans > 1) set({ curtain: true });
  };

  const runAi = async (): Promise<void> => {
    const token = ++aiToken;
    const alive = (): boolean => token === aiToken && !!get().session && get().session?.state.phase !== 'over';
    const speed = aiSpeedFactor();
    const reduced = prefersReducedMotion();
    while (alive()) {
      const s = get().session as CodaSession;
      const st = s.state;
      const me = st.players[st.current];
      if (!me || me.seat !== 'ai') break;
      const seat = st.current;
      const level = me.ai ?? 'casual';
      if (st.phase === 'guess') {
        set({ ai: { seat, phase: 'thinking' } });
        react(seat, 'think');
        const t0 = Date.now();
        const wait = codaThinkTime(level, aiRng, speed);
        while (Date.now() - t0 < wait || get().overlay === 'menu') {
          await sleep(80);
          if (!alive()) return;
        }
        const a = codaDecide(get().session?.state as CodaState, aiRng);
        if (a.type !== 'guess') break;
        set({ ai: { seat, phase: 'speaking' }, pending: { by: seat, target: a.target, index: a.index, value: a.value } });
        react(seat, 'nod', tr('coda.say', { value: valueText(a.value) }), 1100);
        sfx('pick');
        await sleep(reduced ? 250 : 900 * Math.max(0.6, speed));
        if (!alive()) return;
        apply(a, true);
        await sleep(reduced ? 150 : 700 * speed);
      } else if (st.phase === 'deal' || st.phase === 'draw') {
        // 펼친 타일에서 한 장 집기 (처음 고르기는 빠르게)
        await sleep(reduced ? 80 : (st.phase === 'deal' ? 260 : 520) * speed);
        while (get().overlay === 'menu') {
          await sleep(80);
          if (!alive()) return;
        }
        if (!alive()) return;
        apply(codaDecide(get().session?.state as CodaState, aiRng), true);
      } else if (st.phase === 'decide') {
        set({ ai: { seat, phase: 'deciding' } });
        await sleep(reduced ? 100 : 550 * speed);
        if (!alive()) return;
        apply(codaDecide(st, aiRng), true);
        await sleep(reduced ? 100 : 350 * speed);
      } else if (st.phase === 'place' || st.phase === 'reveal-own') {
        await sleep(reduced ? 100 : 500 * speed);
        if (!alive()) return;
        apply(codaDecide(st, aiRng), true);
        await sleep(reduced ? 100 : 400 * speed);
      } else break;
    }
    if (token === aiToken) set({ ai: null });
  };

  const fresh = (cfg: CodaSetupConfig): CodaSession => {
    const seed = urlSeed() ?? randomSeed();
    const state = newCoda({
      seats: cfg.seats.map((x) => ({ name: x.name, seat: x.kind, ...(x.kind === 'ai' ? { ai: x.level } : {}) })),
      jokers: cfg.jokers,
      penalty: cfg.penalty,
      seed,
    });
    return {
      v: 1,
      id: `c${seed.toString(36)}${Date.now().toString(36)}`,
      mode: cfg.mode,
      config: cfg,
      state,
      meta: cfg.seats.map((x) => ({ character: x.character })),
      startedAt: Date.now(),
      endedAt: null,
      hintsLeft: hintBudget(),
      recorded: false,
    };
  };

  const startSession = (session: CodaSession, resumed = false): void => {
    aiToken++;
    const needsCurtain = !session.online && session.mode === 'local' && session.state.players.filter((p) => p.seat === 'human').length > 1 && session.state.players[session.state.current]?.seat === 'human';
    put(session, { selected: null, pending: null, ownPick: null, flash: null, ai: null, overlay: null, hint: null, reactions: [], lastText: null, curtain: needsCurtain });
    useGame.getState().go('coda');
    if (!resumed) sfx('shuffle');
    if (session.online?.role === 'host') bridge.publish?.('coda', payloadOf(session), []);
    if (!needsCurtain && session.online?.role !== 'guest' && session.state.players[session.state.current]?.seat === 'ai') void runAi();
  };

  /** 이 기기의 수: 참가자는 방장에게 보내고, 나머지는 바로 적용 */
  const submit = (action: CodaAction): void => {
    const s = get().session;
    if (!s || get().waiting) return;
    if (s.online?.role === 'guest') {
      bridge.send?.('coda', action);
      sfx('button');
      return;
    }
    apply(action, false);
  };

  return {
    session: null,
    selected: null,
    ai: null,
    pending: null,
    ownPick: null,
    flash: null,
    curtain: false,
    overlay: null,
    hint: null,
    reactions: [],
    lastText: null,
    waiting: false,

    start: (cfg) => {
      writeJSON('lumina.coda-setup.v1', cfg);
      startSession(fresh(cfg));
    },

    resume: () => {
      const s = sanitize(readJSON(KEY));
      if (!s || s.state.phase === 'over') return false;
      startSession({ ...s, hintsLeft: Number.isFinite(s.hintsLeft) || s.hintsLeft === Infinity ? s.hintsLeft : hintBudget() }, true);
      return true;
    },

    rematch: () => {
      const s = get().session;
      if (!s || s.online?.role === 'guest') return;
      startSession({ ...fresh(s.config), online: s.online ?? null });
    },

    quit: () => {
      aiToken++;
      if (get().session?.online) bridge.leave?.();
      put(null, { ai: null, pending: null, overlay: null, curtain: false, selected: null, ownPick: null, hint: null });
      useGame.getState().go('home');
    },

    leave: () => {
      aiToken++;
      set({ ai: null, pending: null, overlay: null });
    },

    drawColor: (color) => {
      const s = get().session;
      if (!s || !isHumanTurn(s) || get().curtain || get().waiting) return;
      if (s.state.phase !== 'deal' && s.state.phase !== 'draw') return;
      buzz('pick');
      submit({ type: 'draw', color });
    },

    select: (target, index) => {
      const s = get().session;
      if (!s || !isHumanTurn(s) || get().curtain || get().pending || get().waiting) return;
      const st = s.state;
      if (st.phase !== 'guess' || target === st.current) return;
      const slot = st.players[target]?.row[index];
      if (!slot || slot.revealed || st.players[target]?.out) return;
      const same = get().selected?.target === target && get().selected?.index === index;
      set({ selected: same ? null : { target, index }, hint: get().hint && get().hint?.target === target && get().hint?.index === index ? get().hint : null });
      sfx('pick');
      buzz('pick');
    },

    clearSelect: () => set({ selected: null, ownPick: null }),

    guess: (value) => {
      const s = get().session;
      const sel = get().selected;
      if (!s || !sel || !isHumanTurn(s) || s.state.phase !== 'guess' || get().pending || get().waiting) return;
      const by = s.state.current;
      set({ pending: { by, target: sel.target, index: sel.index, value }, selected: null, hint: null });
      sfx('pick');
      if (s.online?.role === 'guest') {
        bridge.send?.('coda', { type: 'guess', target: sel.target, index: sel.index, value });
        return;
      }
      const wait = prefersReducedMotion() ? 120 : 650;
      window.setTimeout(() => {
        const p = get().pending;
        if (!p || get().session !== s) return;
        apply({ type: 'guess', target: p.target, index: p.index, value: p.value }, false);
      }, wait);
    },

    cont: () => {
      const s = get().session;
      if (!s || !isHumanTurn(s)) return;
      sfx('button');
      submit({ type: 'continue' });
    },

    stop: () => {
      const s = get().session;
      if (!s || !isHumanTurn(s)) return;
      submit({ type: 'stop' });
    },

    place: (index) => {
      const s = get().session;
      if (!s || !isHumanTurn(s)) return;
      submit({ type: 'place', index });
    },

    revealOwn: (index) => {
      const s = get().session;
      if (!s || !isHumanTurn(s)) return;
      submit({ type: 'reveal-own', index });
    },

    pickOwn: (index) => {
      const s = get().session;
      if (!s || !isHumanTurn(s) || get().curtain || get().waiting) return;
      const st = s.state;
      if (st.phase !== 'reveal-own') return;
      const slot = st.players[st.current]?.row[index];
      if (!slot || slot.revealed) return;
      set({ ownPick: get().ownPick === index ? null : index });
      sfx('pick');
      buzz('pick');
    },

    revealPicked: () => {
      const idx = get().ownPick;
      const s = get().session;
      if (idx === null || !s || s.state.phase !== 'reveal-own') return;
      get().revealOwn(idx);
      // 온라인 참가자는 방장의 답이 올 때까지 같은 수를 또 보내지 않게
      if (s.online?.role === 'guest') set({ ownPick: null });
    },

    reveal: () => {
      set({ curtain: false });
      sfx('button');
    },

    openMenu: () => set({ overlay: 'menu' }),
    openLog: () => set({ overlay: 'log' }),
    closeOverlay: () => set({ overlay: null }),

    requestHint: () => {
      const s = get().session;
      if (!s || !isHumanTurn(s) || s.state.phase !== 'guess') return;
      if (s.hintsLeft <= 0) {
        useGame.getState().toastMsg(tr('coda.hintOut'), 'warn');
        return;
      }
      const viewer = s.state.current;
      const b = beliefs(s.state, viewer);
      const sel = get().selected;
      const assist = useSettings.getState().assist;
      let hint: CodaHint | null = null;
      let say = '';
      if (assist === 'lots') {
        if (sel) {
          hint = { target: sel.target, index: sel.index, candidates: slotCandidates(s.state, viewer, sel.target, sel.index, b) };
        } else {
          const best = guessOptions(s.state, viewer, b)[0];
          if (best) {
            hint = { target: best.target, index: best.index, best: { value: best.value, p: best.p } };
            set({ selected: { target: best.target, index: best.index } });
          }
        }
      } else {
        // 답 대신 실마리: 고른 타일(없으면 가장 좁혀진 타일)에 올 수 있는 숫자 — 스스로는 개수만, 조금은 숫자들
        const spot = sel
          ? { target: sel.target, index: sel.index, values: slotCandidates(s.state, viewer, sel.target, sel.index, b).filter((c) => c.p > 1e-9).map((c) => c.value) }
          : narrowest(s.state, viewer, b);
        if (spot && spot.values.length) {
          hint = assist === 'some' ? { target: spot.target, index: spot.index, possible: spot.values } : { target: spot.target, index: spot.index, count: spot.values.length };
          if (!sel) set({ selected: { target: spot.target, index: spot.index } });
          say = assist === 'some' ? tr('coda.hintPossible') : sel ? tr('coda.hintCount', { n: spot.values.length }) : tr('coda.hintNarrow', { n: spot.values.length });
        }
      }
      if (!hint) return;
      sfx('hint');
      put({ ...s, hintsLeft: s.hintsLeft - 1 }, { hint });
      if (say) useGame.getState().toastMsg(say, 'good');
    },

    startOnline: (table, info) => {
      const cfg: CodaSetupConfig = {
        mode: 'online',
        jokers: table.jokers,
        penalty: table.penalty === 'drawn' ? 'drawn' : 'choose',
        seats: table.seats.map((x) => ({ name: x.name, kind: x.kind, level: x.level ?? 'casual', character: x.character })),
      };
      startSession({ ...fresh(cfg), online: info });
    },

    applyRemote: (seat, payload) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host' || !isAction(payload)) return false;
      const st = s.state;
      if (st.phase === 'over' || st.current !== seat || seat === s.online.mySeat || st.players[seat]?.seat !== 'human' || get().pending) return false;
      // 먼저 커널로 검사만 해 보고, 되는 수만 받는다
      if (!codaReduce(st, payload).ok) return false;
      if (payload.type === 'guess') {
        // 친구의 추리도 잠깐 뜸을 들여 보여 준다
        set({ pending: { by: seat, target: payload.target, index: payload.index, value: payload.value }, selected: null });
        sfx('pick');
        const token = aiToken;
        window.setTimeout(
          () => {
            if (token !== aiToken || get().session?.state !== st) return;
            apply(payload, true);
          },
          prefersReducedMotion() ? 150 : 700,
        );
        return true;
      }
      return apply(payload, true);
    },

    adoptRemote: (payload, events, info) => {
      const incoming = sanitize({ ...(payload as object), hintsLeft: 0 });
      if (!incoming) return;
      const prev = get().session;
      const same = prev?.id === incoming.id;
      let next: CodaSession = { ...incoming, online: info, hintsLeft: same && prev ? prev.hintsLeft : hintBudget(), recorded: same && prev ? prev.recorded : false };
      if (next.state.phase === 'over' && !next.endedAt) next = { ...next, endedAt: Date.now() };
      if (next.state.phase === 'over') next = record(next);
      const turnChanged = !prev || !same || prev.state.turnNo !== next.state.turnNo || prev.state.current !== next.state.current;
      const phaseChanged = !prev || prev.state.phase !== next.state.phase;
      put(next, {
        pending: null,
        ownPick: turnChanged || phaseChanged ? null : get().ownPick,
        selected: turnChanged || phaseChanged ? null : get().selected,
        hint: turnChanged ? null : get().hint,
        curtain: false,
        ai: null,
        ...(same ? {} : { reactions: [], lastText: null, overlay: null, flash: null }),
      });
      if (useGame.getState().screen !== 'coda') useGame.getState().go('coda');
      effects(next, events as readonly CodaEvent[], true);
      // 다시 들어온 방장: AI 차례면 이어서 둔다
      if (info.role === 'host' && next.state.phase !== 'over') {
        aiToken++;
        beginTurnFlow();
      }
      if (next.state.phase === 'over' && get().overlay !== 'over') {
        window.setTimeout(() => {
          if (get().session?.id === next.id && get().session?.state.phase === 'over') set({ overlay: 'over' });
        }, prefersReducedMotion() ? 300 : 1600);
      }
    },

    seatToAi: (seat) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host') return false;
      const p = s.state.players[seat];
      if (!p || p.seat !== 'human' || seat === s.online.mySeat) return false;
      const players = s.state.players.map((x, i) => (i === seat ? { ...x, seat: 'ai' as const, ai: 'casual' as const } : x));
      const next: CodaSession = { ...s, state: { ...s.state, players } };
      put(next);
      bridge.publish?.('coda', payloadOf(next), []);
      if (next.state.current === seat && next.state.phase !== 'over') void runAi();
      return true;
    },
  };
});

/** 누가 몇 장 숨겼는지 (결과·이름판용) */
export function hiddenOf(s: CodaState, p: number): number {
  const pl = s.players[p];
  return pl ? hiddenCount(pl) : 0;
}

export function loadCodaSetup(): CodaSetupConfig | null {
  const raw = readJSON<CodaSetupConfig>('lumina.coda-setup.v1');
  if (!raw || !Array.isArray(raw.seats) || raw.seats.length < 2 || raw.seats.length > 4) return null;
  const levels: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];
  return {
    mode: raw.mode === 'local' ? 'local' : 'solo',
    jokers: raw.jokers !== false,
    penalty: raw.penalty === 'drawn' ? 'drawn' : 'choose',
    seats: raw.seats.map((x, i) => ({
      name: typeof x?.name === 'string' ? x.name.slice(0, 12) : `P${i + 1}`,
      kind: x?.kind === 'ai' ? 'ai' : 'human',
      level: levels.includes(x?.level) ? x.level : 'casual',
      character: isCharacterId(x?.character) ? x.character : 'hwigi',
    })),
  };
}
