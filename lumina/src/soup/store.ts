/**
 * 바다거북 스프 진행 — 규칙(engine)과 화면 사이의 다리.
 *  · AI 진행자: 질문·정답이 들어오면 차례로 Claude/Gemini에게 물어 답을 넣는다 (방장 기기만).
 *  · 사람 진행자: 진행자가 전말을 몰래 보고 답 단추를 누른다.
 *  · 온라인: 방장 기기가 판을 들고 있고, 참가자는 질문·정답·힌트만 보낸다.
 */
import { create } from 'zustand';
import { candidates, newSoup, pending, pickPuzzle, soupReduce, validSoup, type SoupAction, type SoupAnswer, type SoupFilter, type SoupPlayer, type SoupReply, type SoupState } from './engine';
import { puzzleById } from './puzzles';
import { HostError, aiAnswer, aiJudge, hostAvailable, type HostFail, type HostWho } from './host';
import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import { readJSON, removeKey, throttledWriter, writeJSON } from '../store/storage';
import { isCharacterId } from '../characters/roster';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import { translate } from '../i18n';
import { bridge, gameApis, type OnlineInfo, type TableDoc } from '../net/bridge';

export interface SoupSetupConfig {
  readonly host: 'ai' | 'human';
  /** 사람 진행자 자리 */
  readonly hostSeat: number;
  readonly players: readonly SoupPlayer[];
  readonly filter: SoupFilter;
}

export interface SoupSession {
  readonly v: 1;
  readonly id: string;
  readonly mode: 'local' | 'online';
  readonly state: SoupState;
  readonly startedAt: number;
  readonly online?: OnlineInfo | null;
}

interface SoupStore {
  session: SoupSession | null;
  /** 이 기기에서 지금 묻는 사람 (함께 하기에서 고른다) */
  asker: number;
  /** AI 진행자가 생각 중인 기록 번호 */
  thinking: number | null;
  /** AI 진행자를 부르지 못한 이유 (다시 묻기 단추를 보인다) */
  fail: HostFail | null;
  who: HostWho | null;
  /** 사람 진행자가 전말을 보는 중 */
  peek: boolean;
  overlay: null | 'menu';
  /** 온라인 참가자: 방장에게 보낸 것의 답을 기다리는 중 */
  waiting: boolean;
  start(cfg: SoupSetupConfig): void;
  resume(): boolean;
  quit(): void;
  setAsker(i: number): void;
  ask(text: string): boolean;
  guess(text: string): boolean;
  quick(reply: SoupAnswer): void;
  reply(n: number, reply: SoupReply): void;
  hint(): void;
  reveal(): void;
  next(): void;
  retry(): void;
  setPeek(v: boolean): void;
  openMenu(): void;
  closeOverlay(): void;
  startOnline(table: TableDoc, info: OnlineInfo): void;
  applyRemote(seat: number, payload: unknown): boolean;
  adoptRemote(payload: unknown, events: readonly unknown[], info: OnlineInfo): void;
  seatToAi(seat: number): boolean;
  setWaiting(v: boolean): void;
}

const KEY = 'lumina.soup.v1';
const SETUP_KEY = 'lumina.soup-setup.v1';
const save = throttledWriter(KEY, 300);
const tr = (path: string, params?: Record<string, string | number>): string => translate(useSettings.getState().lang, path, params);
const get = (): SoupStore => useSoup.getState();

function urlSeed(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('seed');
    return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null;
  } catch {
    return null;
  }
}

/** 문제 고르기 — ?seed=N 이면 매번 같은 순서 (시험) */
function rnd(round: number): number {
  const seed = urlSeed();
  if (seed === null) return Math.random();
  const x = Math.sin(seed * 9301 + round * 49297) * 233280;
  return x - Math.floor(x);
}

export const isHostDevice = (s: SoupSession | null): boolean => !!s && (!s.online || s.online.role === 'host');
/** 이 기기의 자리 (온라인) — 혼자·함께 하기는 null */
export const mySeat = (s: SoupSession | null): number | null => (s?.online ? s.online.mySeat : null);
/** 이 기기에서 전말을 볼 수 있는가: 사람 진행자 판에서, 함께 하기거나 진행자 자리의 기기 */
export function canSeeAnswer(s: SoupSession | null): boolean {
  if (!s || s.state.host !== 'human') return false;
  if (!s.online) return true;
  return s.online.mySeat === s.state.hostSeat;
}
/** 이 기기가 진행자 단추(답·힌트·공개·다음 문제)를 쓸 수 있는가 */
export function canHost(s: SoupSession | null): boolean {
  if (!s) return false;
  if (s.state.host === 'human') return canSeeAnswer(s);
  return isHostDevice(s);
}

const payloadOf = (s: SoupSession): SoupSession => ({ ...s, online: null });

function sanitize(raw: unknown): SoupSession | null {
  const s = raw as SoupSession | null;
  if (!s || s.v !== 1 || typeof s.id !== 'string' || !validSoup(s.state)) return null;
  if (!s.state.players.every((p) => isCharacterId(p.character))) return null;
  return { ...s, mode: s.mode === 'online' ? 'online' : 'local' };
}

export function savedSoup(): { round: number; players: number } | null {
  const s = sanitize(readJSON(KEY));
  if (!s || s.online) return null;
  return { round: s.state.round, players: s.state.players.length };
}

export function loadSoupSetup(): SoupSetupConfig | null {
  const raw = readJSON<SoupSetupConfig>(SETUP_KEY);
  if (!raw || !Array.isArray(raw.players) || !raw.players.length || raw.players.length > 8) return null;
  const players = raw.players.map((p, i) => ({ name: typeof p?.name === 'string' ? p.name.slice(0, 12) : `P${i + 1}`, character: isCharacterId(p?.character) ? p.character : 'hwigi' }));
  const level = [0, 1, 2, 3].includes(raw.filter?.level as number) ? (raw.filter.level as SoupFilter['level']) : 0;
  return {
    host: raw.host === 'human' && players.length >= 2 ? 'human' : 'ai',
    hostSeat: Number.isInteger(raw.hostSeat) && raw.hostSeat >= 0 && raw.hostSeat < players.length ? raw.hostSeat : 0,
    players,
    filter: { spice: raw.filter?.spice === 'all' ? 'all' : 'mild', level },
  };
}

let token = 0;
let ctl: AbortController | null = null;
let running = false;

function put(session: SoupSession | null, extra: Partial<SoupStore> = {}): void {
  useSoup.setState({ session, ...extra });
  if (session && !session.online) save(session);
  else if (!session) removeKey(KEY);
}

/** 판을 바꾸고, 방장이면 방에 올린다 */
function apply(action: SoupAction): boolean {
  const s = get().session;
  if (!s) return false;
  const r = soupReduce(s.state, action);
  if (!r.ok) return false;
  const next: SoupSession = { ...s, state: r.state };
  put(next);
  effects(s.state, r.state);
  if (next.online?.role === 'host') bridge.publish?.('soup', payloadOf(next), []);
  void pump();
  return true;
}

/** 소리·진동·알림 */
function effects(prev: SoupState, next: SoupState): void {
  const before = new Map(prev.log.map((e) => [e.n, e.reply] as const));
  for (const e of next.log) {
    if (e.reply === null || before.get(e.n) === e.reply) continue;
    if (!before.has(e.n) && e.reply !== null && e.kind === 'ask') sfx('pick');
    switch (e.reply) {
      case 'yes':
        sfx('place');
        break;
      case 'close':
        sfx('hint');
        break;
      case 'correct':
        sfx('win', { delay: 120 });
        buzz('success');
        break;
      case 'wrong':
        sfx('invalid');
        break;
      default:
        sfx('button');
    }
  }
  if (next.log.length > prev.log.length && next.log[next.log.length - 1]?.reply === null) sfx('pick');
  if (next.phase === 'over' && prev.phase === 'play' && next.solvedBy === null) sfx('lose');
  if (next.hints > prev.hints) sfx('hint');
  if (next.round > prev.round) sfx('shuffle');
}

/** AI 진행자: 기다리는 기록을 하나씩 처리한다 (방장 기기에서만) */
async function pump(): Promise<void> {
  if (running) return;
  running = true;
  const my = token;
  try {
    for (;;) {
      const s = get().session;
      if (!s || my !== token || !isHostDevice(s) || s.state.host !== 'ai' || s.state.phase !== 'play' || get().fail) break;
      const e = pending(s.state)[0];
      if (!e) break;
      const p = puzzleById(s.state.puzzle);
      if (!p) break;
      useSoup.setState({ thinking: e.n });
      ctl = new AbortController();
      try {
        if (e.kind === 'ask') {
          const r = await aiAnswer(p, e.text, s.state.log, ctl.signal);
          if (my !== token || get().session?.id !== s.id) break;
          useSoup.setState({ who: r.who });
          apply({ type: 'reply', n: e.n, reply: r.a, ...(r.note ? { note: r.note } : {}) });
        } else {
          const r = await aiJudge(p, e.text, ctl.signal);
          if (my !== token || get().session?.id !== s.id) break;
          useSoup.setState({ who: r.who });
          apply({ type: 'reply', n: e.n, reply: r.v, ...(r.note ? { note: r.note } : {}) });
        }
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') break;
        const code: HostFail = err instanceof HostError ? err.code : 'net';
        useSoup.setState({ fail: code });
        useGame.getState().toastMsg(tr(`soup.fail.${code}`), 'warn');
        break;
      }
    }
  } finally {
    running = false;
    if (my === token) useSoup.setState({ thinking: null });
  }
}

function stopAi(): void {
  token++;
  ctl?.abort();
  ctl = null;
  running = false;
}

function begin(session: SoupSession): void {
  stopAi();
  const first = session.state.players.findIndex((_, i) => !(session.state.host === 'human' && session.state.hostSeat === i));
  put(session, { asker: session.online ? session.online.mySeat : Math.max(0, first), thinking: null, fail: null, peek: false, overlay: null, waiting: false });
  if (useGame.getState().screen !== 'soup') useGame.getState().go('soup');
  sfx('shuffle');
  if (session.online?.role === 'host') bridge.publish?.('soup', payloadOf(session), []);
  void hostAvailable().then((who) => useSoup.setState({ who }));
  void pump();
}

/** 이 기기의 수: 참가자는 방장에게 보내고, 나머지는 바로 넣는다 */
function submit(action: SoupAction): boolean {
  const s = get().session;
  if (!s || get().waiting) return false;
  if (s.online?.role === 'guest') {
    if (!soupReduce(s.state, action).ok) return false;
    bridge.send?.('soup', action);
    sfx('button');
    return true;
  }
  return apply(action);
}

export const useSoup = create<SoupStore>((set) => ({
  session: null,
  asker: 0,
  thinking: null,
  fail: null,
  who: null,
  peek: false,
  overlay: null,
  waiting: false,

  start(cfg) {
    writeJSON(SETUP_KEY, cfg);
    const p = pickPuzzle(cfg.filter, [], rnd(1));
    if (!p) {
      useGame.getState().toastMsg(tr('soup.noPuzzle'), 'warn');
      return;
    }
    const players = cfg.players.map((x, i) => ({ name: x.name.trim() || `${tr('soup.player')} ${i + 1}`, character: x.character }));
    const host = cfg.host === 'human' && players.length >= 2 ? 'human' : 'ai';
    const state = newSoup({ players, host, hostSeat: cfg.hostSeat, puzzle: p.id, filter: cfg.filter });
    begin({ v: 1, id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, mode: 'local', state, startedAt: Date.now(), online: null });
  },

  resume() {
    const s = sanitize(readJSON(KEY));
    if (!s || s.online) return false;
    begin(s);
    return true;
  },

  quit() {
    stopAi();
    if (get().session?.online) bridge.leave?.();
    put(null, { overlay: null, thinking: null, fail: null, peek: false, waiting: false });
    useGame.getState().go('home');
  },

  setAsker(i) {
    const s = get().session;
    if (!s || s.online) return;
    set({ asker: i });
  },

  ask(text) {
    const s = get().session;
    if (!s) return false;
    const by = s.online ? s.online.mySeat : get().asker;
    const ok = submit({ type: 'ask', by, text });
    if (ok && !s.online) set({ asker: get().session?.state.turn ?? by });
    return ok;
  },

  guess(text) {
    const s = get().session;
    if (!s) return false;
    const by = s.online ? s.online.mySeat : get().asker;
    return submit({ type: 'guess', by, text });
  },

  quick(reply) {
    const s = get().session;
    if (!s || !canHost(s)) return;
    if (apply({ type: 'quick', by: get().asker, reply })) set({ asker: get().session?.state.turn ?? get().asker });
  },

  reply(n, reply) {
    const s = get().session;
    if (!s || !canHost(s)) return;
    apply({ type: 'reply', n, reply });
  },

  hint() {
    const s = get().session;
    if (!s) return;
    submit({ type: 'hint' });
  },

  reveal() {
    const s = get().session;
    if (!s || !canHost(s)) return;
    set({ overlay: null });
    apply({ type: 'reveal' });
  },

  next() {
    const s = get().session;
    if (!s || !canHost(s)) return;
    const p = pickPuzzle(s.state.filter, s.state.played, rnd(s.state.round + 1));
    if (!p) return;
    set({ peek: false, fail: null });
    apply({ type: 'next', puzzle: p.id });
  },

  retry() {
    set({ fail: null });
    void hostAvailable().then((who) => set({ who }));
    void pump();
  },

  setPeek(v) {
    if (v && !canSeeAnswer(get().session)) return;
    set({ peek: v });
  },

  openMenu: () => set({ overlay: 'menu' }),
  closeOverlay: () => set({ overlay: null }),

  startOnline(table, info) {
    const players: SoupPlayer[] = table.seats.map((x, i) => ({ name: x.name || `P${i + 1}`, character: x.character }));
    const filter: SoupFilter = { spice: table.soupSpice === 'all' ? 'all' : 'mild', level: 0 };
    const host = table.soupHost === 'human' && players.length >= 2 ? 'human' : 'ai';
    const p = pickPuzzle(filter, [], rnd(1));
    if (!p) return;
    const state = newSoup({ players, host, hostSeat: info.mySeat, puzzle: p.id, filter });
    begin({ v: 1, id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, mode: 'online', state, startedAt: Date.now(), online: info });
  },

  applyRemote(seat, payload) {
    const s = get().session;
    if (!s?.online || s.online.role !== 'host') return false;
    const a = payload as SoupAction | null;
    if (!a || typeof a !== 'object') return false;
    // 참가자는 자기 이름으로 묻고 맞히고, 힌트만 열 수 있다 (답·공개·다음 문제는 진행자 몫)
    if (a.type === 'ask' || a.type === 'guess') return apply({ type: a.type, by: seat, text: String(a.text ?? '') });
    if (a.type === 'hint') return apply({ type: 'hint' });
    if (a.type === 'reply' && s.state.host === 'human' && s.state.hostSeat === seat) return apply({ type: 'reply', n: Number(a.n), reply: a.reply });
    return false;
  },

  adoptRemote(payload, _events, info) {
    const incoming = sanitize(payload);
    if (!incoming) return;
    const prev = get().session;
    const next: SoupSession = { ...incoming, online: info };
    useSoup.setState({ session: next, waiting: false, ...(prev?.id === next.id ? {} : { peek: false, overlay: null, asker: info.mySeat }) });
    if (prev) effects(prev.state, next.state);
    if (useGame.getState().screen !== 'soup') useGame.getState().go('soup');
    if (info.role === 'host') void pump();
  },

  seatToAi: () => false,
  setWaiting: (v) => set({ waiting: v }),
}));

gameApis.soup = () => useSoup.getState();

/** 준비 화면용: 조건에 맞는 문제 수 */
export const puzzleCount = (filter: SoupFilter): number => candidates(filter).length;

// 시험용 손잡이 — 내 컴퓨터(localhost)에서 열었을 때만
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  (window as unknown as { __soup?: unknown }).__soup = { store: useSoup };
}
