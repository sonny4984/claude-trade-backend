/**
 * 마피아 판 진행 — 혼자(AI 친구들과) 또는 온라인(방장 기기가 AI와 진행을 맡고, 친구들은 판을 받아 본다).
 *
 * 두 가지를 나눈다.
 *  · 진행: 사람들의 행동을 한 번에 하나씩 처리해 판(engine.Game)과 대사 기록(lines)을 고친다. 방장(혼자 할 때는 이 기기)만 한다.
 *  · 보여 주기: 기록에 새로 붙은 줄을 이 기기에서 한 줄씩 보여 주고 읽어 준다. 모든 기기가 각자 한다.
 * 비밀(내 역할, 경찰 조사 결과, 마피아끼리 귓속말)은 줄마다 볼 수 있는 자리(to)를 적어 두고 화면에서 거른다.
 */
import { create } from 'zustand';
import { sfx, squeakTalk, type TalkMood } from '../audio/sfx';
import type { CharacterId } from '../characters/roster';
import { translate } from '../i18n';
import { bridge, gameApis, type OnlineInfo, type TableDoc } from '../net/bridge';
import { useOnline } from '../net/online';
import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import { readJSON, writeJSON } from '../store/storage';
import { FATAL, LIMITED, claudeSample, claudeWriter, polish, type HistoryLine, type JsonWriter } from './claude';
import { GeminiFail, connectGemini, geminiJson, loadGemini, saveGemini, takeKeyFromUrl } from './gemini';
import { CAST, MAX_PLAYERS, MIN_PLAYERS, PERSONA, aiNight, aiVote, killChoice, lastAct, living, newGame, plan, record, resolveNight, resolveVerdict, resolveVote, tally, toVerdict, aiVerdict, type Act, type Game, type Role, type Trigger } from './engine';
import { humanLine, lineFor, nameOf, narrate, parseHuman, roleName, suggestLine } from './talk';
import { canSpeak, hush, speak, unlockSpeech } from './voice';

export type VoiceMode = 'squeak' | 'read' | 'off';
export const VOICE_MODES: readonly VoiceMode[] = ['squeak', 'read', 'off'];

export interface MafiaConfig {
  count: number;
  me: CharacterId;
  role: Role | 'random';
  /** 대사 소리: 기니피그 목소리(뀨뀨 동물 소리) · 사람 목소리로 읽기 · 끄기 */
  voice: VoiceMode;
  /** 기니피그 목소리 전체 높이 (0.9~1.8, 높을수록 아기 같은 소리) */
  squeakPitch: number;
  /** claude.ai에서 Claude가 대사 다듬기 */
  claude: boolean;
  /** 공개 사이트에서 Gemini(내 키)가 대사 쓰기 */
  gemini: boolean;
}

/** say: AI 대사 · chat: 사람이 한 말 · sys: 진행 · secret: 비밀 · vote: 투표 */
export type LineKind = 'say' | 'chat' | 'sys' | 'secret' | 'vote';
/** 그 줄이 보일 때 낼 소리 */
export type Cue = 'death' | 'caught' | 'dawn' | 'end';
export interface Line {
  id: number;
  kind: LineKind;
  by: number | null;
  text: string;
  /** 볼 수 있는 자리 (없으면 모두) */
  to?: number[];
  cue?: Cue;
}

export interface MafiaSession {
  v: 1;
  id: string;
  game: Game;
  lines: Line[];
  /** 낮: 투표하러 가자고 한 자리 */
  ready: number[];
  /** 밤 행동·투표를 이미 낸 자리 (누구를 골랐는지는 방장만 안다) */
  done: number[];
  /** 방금 투표에서 받은 표 수 */
  counts: number[] | null;
  online: OnlineInfo | null;
}

export type QuickKind = 'accuse' | 'trust' | 'claim' | 'ask';
export type MafiaAction =
  | { type: 'say'; text: string }
  | { type: 'quick'; kind: QuickKind; t: number | null }
  | { type: 'more' }
  | { type: 'ready' }
  | { type: 'vote'; t: number | null }
  | { type: 'night'; t: number | null }
  | { type: 'whisper'; text: string }
  /** 변론대에 선 사람의 최후의 변론 (빈 글이면 변론 없이 넘어가기) */
  | { type: 'defend'; text: string }
  /** 찬반 투표 (yes = 처형 찬성) */
  | { type: 'verdict'; yes: boolean };

const SETUP_KEY = 'lumina.mafia.setup.v1';
const ROLE_CHOICES: readonly (Role | 'random')[] = ['random', 'citizen', 'police', 'doctor', 'mafia'];
const MAX_TEXT = 200;
const MAX_LINES = 320;

function loadSetup(): MafiaConfig {
  const raw = readJSON<Partial<MafiaConfig>>(SETUP_KEY);
  return {
    count: Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(Number(raw?.count)) || 7)),
    me: CAST.includes(raw?.me as CharacterId) ? (raw?.me as CharacterId) : 'moka',
    role: ROLE_CHOICES.includes(raw?.role as Role) ? (raw?.role as Role | 'random') : 'random',
    // 예전 값(켜기/끄기, 'speak'·'babble')은 기니피그 목소리로 — 사람 목소리가 무섭다는 말을 듣고 바꿨다
    voice: VOICE_MODES.includes(raw?.voice as VoiceMode) ? (raw?.voice as VoiceMode) : (raw?.voice as unknown) === false || (raw?.voice as unknown) === 'off' ? 'off' : 'squeak',
    squeakPitch: Math.max(0.9, Math.min(1.8, Number(raw?.squeakPitch) || 1.25)),
    claude: raw?.claude !== false,
    gemini: raw?.gemini !== false,
  };
}

interface MafiaState {
  cfg: MafiaConfig;
  session: MafiaSession | null;
  /** 판을 고칠 때마다 올려서 다시 그리게 한다 (판은 그 자리에서 고친다) */
  rev: number;
  /** 이 기기에서 보여 준 마지막 줄 번호 */
  shownId: number;
  /** 지금 말하는 친구 */
  speaking: number | null;
  /** Claude가 대사를 쓰는 중 (방장) */
  thinking: boolean;
  /** 참가자: 방장에게 보낸 행동의 답을 기다리는 중 */
  waiting: boolean;
  /** 눌러서 고른 친구 (밤 행동·투표·빠른 말) */
  pick: number | null;
  /** 이 화면에서 Claude를 부를 수 있는지 */
  claudeOk: boolean;
  /** Gemini 키로 고른 모델 (키가 없으면 null) */
  geminiModel: string | null;
  /** Gemini 연결 확인 중 · 실패 이유 */
  geminiState: 'idle' | 'checking' | GeminiFail['code'];
  note: 'claudeOff' | 'claudeLimit' | 'geminiKey' | 'geminiLimit' | 'geminiBusy' | null;
  connectGemini(key: string): Promise<boolean>;
  forgetGemini(): void;
  setCfg(p: Partial<MafiaConfig>): void;
  probe(): void;
  start(): void;
  again(): void;
  select(i: number | null): void;
  say(text: string): boolean;
  quick(kind: QuickKind): boolean;
  more(): void;
  ready(): void;
  vote(t: number | null): void;
  night(t: number | null): void;
  whisper(text: string): boolean;
  /** 변론대에 선 내가 하는 최후의 변론 (빈 글이면 그냥 마치기) */
  defend(text: string): void;
  /** 찬반 투표 */
  verdict(yes: boolean): void;
  /** "억울해요!" 단추에 쓸 맹세 한 줄 */
  pleaText(): string;
  skip(): void;
  quit(): void;
  // 온라인 (net/online이 부른다)
  startOnline(table: TableDoc, info: OnlineInfo): void;
  applyRemote(seat: number, payload: unknown): boolean;
  adoptRemote(payload: unknown, events: readonly unknown[], info: OnlineInfo): void;
  seatToAi(seat: number): boolean;
  setWaiting(v: boolean): void;
}

const lang = () => useSettings.getState().lang;
const get = (): MafiaState => useMafia.getState();
export const mySeatOf = (s: MafiaSession | null): number => s?.online?.mySeat ?? 0;
const isHost = (s: MafiaSession | null): boolean => !!s && (!s.online || s.online.role === 'host');
export const visible = (l: Line, seat: number): boolean => !l.to || l.to.includes(seat);
/** 지금 정해야 하는 사람들 — 살아 있는 사람 자리 (모두 탈락했으면 빈 목록: 지켜보는 누구든 넘길 수 있다) */
export const deciders = (g: Game): number[] => g.players.filter((p) => p.human && p.alive).map((p) => p.id);
const mafiaSeats = (g: Game): number[] => g.players.filter((p) => p.role === 'mafia').map((p) => p.id);

// ── 진행 (방장) ───────────────────────────────────────────

/** 방장만 아는 것: 밤에 고른 대상·투표 (넣은 순서 = 마지막에 고른 마피아의 선택이 이긴다) */
const picks = new Map<number, number | null>();
/** 방장만 아는 것: 찬반 투표 */
const verdicts = new Map<number, boolean>();
let queue: Promise<void> = Promise.resolve();
let ctl: AbortController | null = null;

function add(s: MafiaSession, kind: LineKind, by: number | null, text: string, extra: { to?: number[]; cue?: Cue } = {}): void {
  if (!text) return;
  const id = (s.lines[s.lines.length - 1]?.id ?? 0) + 1;
  const line: Line = { id, kind, by, text, ...(extra.to ? { to: extra.to } : {}), ...(extra.cue ? { cue: extra.cue } : {}) };
  s.lines = [...s.lines, line].slice(-MAX_LINES);
}

const payloadOf = (s: MafiaSession): MafiaSession => ({ ...s, online: null });

/** 고친 판을 화면에 알리고, 온라인 방장이면 방에 올린다 */
function commit(s: MafiaSession): void {
  if (get().session !== s) return;
  useMafia.setState((st) => ({ rev: st.rev + 1 }));
  if (s.online?.role === 'host') bridge.publish?.('mafia', payloadOf(s), []);
  void pump();
}

/** 행동은 한 번에 하나씩 (Claude가 대사를 쓰는 동안 온 행동은 줄을 선다) */
function job(fn: (s: MafiaSession) => Promise<void> | void): void {
  queue = queue
    .then(async () => {
      const s = get().session;
      if (s && isHost(s)) await fn(s);
    })
    .catch((e: unknown) => console.error(e));
}

function history(s: MafiaSession): HistoryLine[] {
  const L = lang();
  const g = s.game;
  return s.lines
    .filter((l) => !l.to)
    .slice(-14)
    .map((l) => ({
      name: l.by === null ? (L === 'ko' ? '진행' : 'Narrator') : nameOf(g, l.by, L) + (g.players[l.by]?.human ? (L === 'ko' ? '(사람)' : ' (human)') : ''),
      text: l.text,
    }));
}

/** 대사를 써 줄 쪽: claude.ai면 Claude, 공개 사이트에서 키가 있으면 Gemini, 아니면 없음 (기본 대사) */
async function writer(): Promise<JsonWriter | null> {
  const { cfg, claudeOk, geminiModel } = get();
  if (cfg.claude && claudeOk) {
    const sample = await claudeSample();
    if (sample) return claudeWriter(sample);
  }
  const gem = loadGemini();
  if (cfg.gemini && gem && geminiModel) return (prompt, signal) => geminiJson(gem, prompt, signal);
  return null;
}

/** AI들이 한 차례 말한다 (Claude·Gemini를 쓸 수 있으면 초안을 다듬어서) */
async function talk(s: MafiaSession, tr: Trigger): Promise<void> {
  const g = s.game;
  const said = g.phase === 'day' ? plan(g, tr) : [];
  if (!said.length) {
    commit(s);
    return;
  }
  const L = lang();
  let texts = said.map((x) => lineFor(g, x, L));
  const write = await writer();
  if (write) {
    // 사람이 한 말은 먼저 올려 두고, 대사를 쓰는 동안 기다린다
    commit(s);
    const c = (ctl = new AbortController());
    useMafia.setState({ thinking: true });
    const asked = tr.k === 'human' ? [...s.lines].reverse().find((l) => l.kind === 'chat' && l.by === tr.by) : undefined;
    const latest = asked ? { name: nameOf(g, tr.k === 'human' ? tr.by : 0, L) + (L === 'ko' ? '(사람)' : ' (human)'), text: asked.text } : undefined;
    try {
      texts = await polish(write, g, said, texts, history(s), L, c.signal, latest);
    } catch (e) {
      if (e instanceof GeminiFail) {
        if (e.code === 'bad-key') useMafia.setState({ note: 'geminiKey', geminiModel: null, geminiState: 'bad-key' });
        else if (e.code === 'rate') useMafia.setState({ note: 'geminiLimit' });
        else if (e.code === 'busy') useMafia.setState({ note: 'geminiBusy' });
      } else {
        const code = String((e as { code?: unknown } | null)?.code ?? '');
        if (FATAL.has(code)) useMafia.setState({ claudeOk: false, note: 'claudeOff' });
        else if (LIMITED.has(code)) {
          useMafia.setState({ note: 'claudeLimit' });
          get().setCfg({ claude: false });
        }
      }
    } finally {
      ctl = null;
      useMafia.setState({ thinking: false });
    }
  }
  said.forEach((x, k) => add(s, 'say', x.by, texts[k] ?? ''));
  commit(s);
}

/** 판을 열 때: 각자에게 역할, 마피아에게 동료, 첫 밤 */
function opening(s: MafiaSession): void {
  const g = s.game;
  const L = lang();
  add(s, 'sys', null, narrate('start', { n: String(g.players.length), m: String(g.mafia) }, L));
  for (const p of g.players) {
    if (!p.human) continue;
    add(s, 'secret', null, narrate('myRole', { r: roleName(p.role, L), d: translate(L, `mafia.roleSub.${p.role}`) }, L), { to: [p.id] });
    const mates = g.players.filter((q) => q.role === 'mafia' && q.id !== p.id).map((q) => nameOf(g, q.id, L));
    if (p.role === 'mafia' && mates.length) add(s, 'secret', null, narrate('mates', { list: mates.join(', ') }, L), { to: [p.id] });
  }
  dusk(s);
}

/** 밤이 되면: 사람 마피아에게는 동료 AI가 노릴 친구를 귀띔한다 */
function dusk(s: MafiaSession): void {
  const g = s.game;
  const L = lang();
  add(s, 'sys', null, narrate('night', { d: String(g.day) }, L));
  const humans = living(g).filter((p) => p.human && p.role === 'mafia');
  const mate = living(g).find((p) => p.role === 'mafia' && !p.human);
  if (!humans.length || !mate) return;
  const t = killChoice(g);
  if (t !== null) add(s, 'secret', mate.id, suggestLine(g, mate.id, t, L), { to: humans.map((p) => p.id) });
}

function finish(s: MafiaSession): void {
  add(s, 'sys', null, narrate(s.game.winner === 'town' ? 'townWin' : 'mafiaWin', {}, lang()), { cue: 'end' });
}

function toVote(s: MafiaSession): void {
  s.game.phase = 'vote';
  s.ready = [];
  s.done = [];
  picks.clear();
  add(s, 'sys', null, narrate('vote', {}, lang()));
}

async function endNight(s: MafiaSession): Promise<void> {
  const g = s.game;
  const L = lang();
  const n = aiNight(g);
  const humans = living(g).filter((p) => p.human);
  if (humans.some((p) => p.role === 'mafia')) {
    const last = [...picks].reverse().find(([seat, t]) => t !== null && g.players[seat]?.role === 'mafia' && g.players[seat]?.alive);
    n.kill = last ? last[1] : killChoice(g);
  }
  const doc = humans.find((p) => p.role === 'doctor');
  if (doc) n.save = picks.get(doc.id) ?? null;
  const cop = humans.find((p) => p.role === 'police');
  if (cop) n.check = picks.get(cop.id) ?? null;
  const res = resolveNight(g, n);
  s.done = [];
  s.ready = [];
  s.counts = null;
  picks.clear();
  if (res.checked && cop) add(s, 'secret', null, narrate(res.checked[1] ? 'checkMafia' : 'checkTown', { t: nameOf(g, res.checked[0], L) }, L), { to: [cop.id] });
  const dead = res.died === null ? undefined : g.players[res.died];
  if (dead) {
    add(s, 'sys', null, narrate('died', { t: nameOf(g, dead.id, L), r: roleName(dead.role, L) }, L), { cue: 'death' });
    if (dead.human) add(s, 'secret', null, narrate('youDied', {}, L), { to: [dead.id] });
  } else add(s, 'sys', null, narrate(res.saved ? 'saved' : 'calm', {}, L), { cue: 'dawn' });
  if (g.phase === 'over') {
    finish(s);
    commit(s);
    return;
  }
  commit(s);
  await talk(s, { k: 'open' });
}

/** 지목 투표 → 가장 많이 받은 친구가 변론대에 (동점이면 밤으로) */
async function endVote(s: MafiaSession): Promise<void> {
  const g = s.game;
  const L = lang();
  const ballots = living(g).map((p) => ({ day: g.day, by: p.id, t: p.human ? (picks.get(p.id) ?? null) : aiVote(g, p.id) }));
  for (const b of ballots) add(s, 'vote', b.by, lineFor(g, { day: g.day, by: b.by, act: { k: 'vote', t: b.t } }, L));
  const { counts } = tally(g, ballots);
  const accused = resolveVote(g, ballots);
  s.counts = counts;
  s.done = [];
  s.ready = [];
  picks.clear();
  const p = accused === null ? undefined : g.players[accused];
  if (!p) {
    add(s, 'sys', null, narrate('tie', {}, L));
    dusk(s);
    return commit(s);
  }
  add(s, 'sys', null, narrate('accused', { t: nameOf(g, p.id, L), c: String(counts[p.id] ?? 0) }, L), { cue: 'dawn' });
  if (p.human) {
    // 사람이면 직접 변론한다 (기다린다)
    add(s, 'secret', null, narrate('yourDefense', {}, L), { to: [p.id] });
    return commit(s);
  }
  await talk(s, { k: 'defense', by: p.id });
  startVerdict(s);
  // 찬반을 정할 사람이 없으면 (모두 AI이거나 탈락) 바로 결과
  if (allVoted(g, s.done)) return endVerdict(s);
  commit(s);
}

/** 변론이 끝나면 찬반 투표 */
function startVerdict(s: MafiaSession): void {
  const g = s.game;
  if (g.accused === null) return;
  toVerdict(g);
  s.done = [];
  verdicts.clear();
  add(s, 'sys', null, narrate('verdict', { t: nameOf(g, g.accused, lang()) }, lang()));
}

/** 찬반 결과: 찬성이 많으면 처형 (마지막 한마디와 정체 공개), 아니면 살아남고 밤 */
function endVerdict(s: MafiaSession): void {
  const g = s.game;
  const L = lang();
  const t = g.accused;
  if (t === null) return commit(s);
  const votes = living(g)
    .filter((p) => p.id !== t)
    .map((p) => ({ by: p.id, yes: p.human ? (verdicts.get(p.id) ?? false) : aiVerdict(g, p.id) }));
  for (const v of votes) if (!g.players[v.by]?.human) add(s, 'vote', v.by, lineFor(g, { day: g.day, by: v.by, act: { k: 'verdict', t, yes: v.yes } }, L));
  const day = g.day;
  const r = resolveVerdict(g, votes);
  s.done = [];
  verdicts.clear();
  const p = g.players[t] as Game['players'][number];
  const name = nameOf(g, t, L);
  if (!r.executed) add(s, 'sys', null, narrate('spared', { t: name, y: String(r.yes), n: String(r.no) }, L), { cue: 'dawn' });
  else {
    add(s, 'sys', null, narrate('executed', { t: name, y: String(r.yes), n: String(r.no) }, L));
    if (!p.human) add(s, 'say', t, lineFor(g, { day, by: t, act: lastAct(g, t) }, L));
    add(s, 'sys', null, narrate('reveal', { t: name, r: roleName(p.role, L) }, L), { cue: p.role === 'mafia' ? 'caught' : 'death' });
    if (p.human) add(s, 'secret', null, narrate('youDied', {}, L), { to: [t] });
  }
  if (g.phase === 'over') finish(s);
  else dusk(s);
  commit(s);
}

/** 모두 정했는지 (모두 탈락했으면 누가 누르든 넘어간다) */
const allIn = (g: Game, have: readonly number[]): boolean => deciders(g).every((x) => have.includes(x));
/** 찬반 투표는 변론대에 선 사람을 빼고 */
const allVoted = (g: Game, have: readonly number[]): boolean => deciders(g).every((x) => x === g.accused || have.includes(x));

async function handle(s: MafiaSession, seat: number, a: MafiaAction): Promise<void> {
  const g = s.game;
  const p = g.players[seat];
  if (!p?.human) return;
  const L = lang();
  switch (a.type) {
    case 'say': {
      if (g.phase !== 'day' || !p.alive) return commit(s);
      add(s, 'chat', seat, a.text);
      const parsed = parseHuman(g, a.text, seat);
      for (const x of parsed.acts) record(g, seat, x);
      return talk(s, { k: 'human', by: seat, acts: parsed.acts, ask: parsed.ask, why: parsed.why });
    }
    case 'quick': {
      if (g.phase !== 'day' || !p.alive) return commit(s);
      let act: Act | null = null;
      if (a.kind === 'accuse' || a.kind === 'trust') {
        if (a.t === null || a.t === seat || !g.players[a.t]?.alive) return commit(s);
        act = a.kind === 'accuse' ? { k: 'accuse', t: a.t, why: 'gut' } : { k: 'trust', t: a.t, why: 'gut' };
      } else if (a.kind === 'claim') {
        // 마피아는 시민이라고 둘러댄다
        act = p.role === 'mafia' ? { k: 'claim', role: 'citizen' } : { k: 'claim', role: p.role, res: p.role === 'police' ? g.checks.map(([t, m]): [number, boolean] => [t, m]) : undefined };
      }
      add(s, 'chat', seat, humanLine(g, act, L));
      if (act) record(g, seat, act);
      return talk(s, { k: 'human', by: seat, acts: act ? [act] : [], ask: a.kind === 'ask', why: null });
    }
    case 'more':
      // 탈락한 사람은 모두 탈락했을 때만 (지켜보며 넘기기)
      return g.phase === 'day' && (p.alive || !deciders(g).length) ? talk(s, { k: 'more' }) : commit(s);
    case 'whisper':
      if (g.phase === 'night' && p.alive && p.role === 'mafia') add(s, 'secret', seat, a.text, { to: mafiaSeats(g) });
      return commit(s);
    case 'ready':
      if (g.phase === 'day') {
        if (p.alive && !s.ready.includes(seat)) s.ready = [...s.ready, seat];
        if (allIn(g, s.ready)) toVote(s);
      }
      return commit(s);
    case 'vote':
      if (g.phase !== 'vote') return commit(s);
      if (p.alive) {
        picks.delete(seat);
        picks.set(seat, a.t !== null && a.t !== seat && g.players[a.t]?.alive ? a.t : null);
        if (!s.done.includes(seat)) s.done = [...s.done, seat];
      }
      if (allIn(g, s.done)) return endVote(s);
      return commit(s);
    case 'defend': {
      if (g.phase !== 'defense' || g.accused !== seat) return commit(s);
      if (a.text) {
        add(s, 'chat', seat, a.text);
        for (const x of parseHuman(g, a.text, seat).acts) record(g, seat, x);
      }
      await talk(s, { k: 'defense', by: seat });
      startVerdict(s);
      if (allVoted(g, s.done)) return endVerdict(s);
      return commit(s);
    }
    case 'verdict':
      if (g.phase !== 'verdict') return commit(s);
      if (p.alive && seat !== g.accused) {
        verdicts.set(seat, a.yes);
        if (!s.done.includes(seat)) s.done = [...s.done, seat];
      }
      if (allVoted(g, s.done)) return endVerdict(s);
      return commit(s);
    case 'night':
      if (g.phase !== 'night') return commit(s);
      if (p.alive) {
        picks.delete(seat);
        picks.set(seat, a.t !== null && g.players[a.t]?.alive ? a.t : null);
        if (!s.done.includes(seat)) s.done = [...s.done, seat];
      }
      if (allIn(g, s.done)) return endNight(s);
      return commit(s);
  }
}

/** 방장: 사람(나 또는 친구)의 행동 받기 — 판에 맞지 않으면 false */
function act(seat: number, a: MafiaAction): boolean {
  const s = get().session;
  if (!s || !isHost(s) || !s.game.players[seat]?.human || s.game.phase === 'over') return false;
  job((cur) => (cur.id === s.id ? handle(cur, seat, a) : undefined));
  return true;
}

/** 내 행동: 방장(혼자 포함)은 바로, 참가자는 방장에게 보낸다 */
function send(a: MafiaAction): boolean {
  unlockSpeech();
  const s = get().session;
  if (!s) return false;
  if (isHost(s)) return act(mySeatOf(s), a);
  if (get().waiting || !bridge.send) return false;
  bridge.send('mafia', a);
  return true;
}

function cleanAction(x: unknown, n: number): MafiaAction | null {
  if (!x || typeof x !== 'object') return null;
  const a = x as Record<string, unknown>;
  const target = (v: unknown): number | null | undefined => (v === null ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : undefined);
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '');
  switch (a.type) {
    case 'say':
    case 'whisper':
      return text(a.text) ? { type: a.type, text: text(a.text) } : null;
    case 'quick': {
      const t = target(a.t);
      return (a.kind === 'accuse' || a.kind === 'trust' || a.kind === 'claim' || a.kind === 'ask') && t !== undefined ? { type: 'quick', kind: a.kind, t } : null;
    }
    case 'more':
    case 'ready':
      return { type: a.type };
    case 'vote':
    case 'night': {
      const t = target(a.t);
      return t === undefined ? null : { type: a.type, t };
    }
    case 'defend':
      return { type: 'defend', text: text(a.text) };
    case 'verdict':
      return typeof a.yes === 'boolean' ? { type: 'verdict', yes: a.yes } : null;
    default:
      return null;
  }
}

// ── 보여 주기 (모든 기기) ─────────────────────────────────

let token = 0;
let playing = false;

/** 건너뛰기를 누르면 바로 끝나는 기다림 */
function pause(ms: number, my: number): Promise<void> {
  return new Promise((done) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (my !== token || Date.now() - t0 >= ms) done();
      else setTimeout(tick, 60);
    };
    tick();
  });
}

function cue(l: Line, s: MafiaSession): void {
  if (l.cue === 'death') sfx('sadsqueak');
  else if (l.cue === 'caught') sfx('wheek');
  else if (l.cue === 'dawn') sfx('turn');
  else if (l.cue === 'end') {
    const me = s.game.players[mySeatOf(s)];
    sfx(me && (s.game.winner === 'mafia') === (me.role === 'mafia') ? 'win' : 'lose');
  }
}

async function present(l: Line, s: MafiaSession, my: number): Promise<void> {
  cue(l, s);
  const p = l.by === null ? undefined : s.game.players[l.by];
  const { cfg } = get();
  // 비밀과 사람이 친 말은 소리 내어 읽지 않는다 (같은 방에 있으면 들리니까)
  if (l.kind === 'say' && p) {
    const per = PERSONA[p.character];
    if (cfg.voice === 'squeak') {
      const ms = squeakTalk(l.text, per.squeak * cfg.squeakPitch, moodOf(l.text));
      // 말풍선을 읽을 시간도 준다
      await pause(Math.min(3600, Math.max(ms + 250, 700 + l.text.length * 38)), my);
      return;
    }
    if (cfg.voice === 'read' && canSpeak()) {
      sfx('squeak', { pitch: per.pitch / 1.6 });
      await pause(160, my);
      await speak(l.text, { lang: lang(), pitch: per.pitch, rate: per.rate });
      await pause(220, my);
      return;
    }
  }
  if (l.kind === 'say') sfx('pop');
  await pause(l.kind === 'say' ? Math.min(3400, 1000 + l.text.length * 45) : l.kind === 'vote' ? 550 : l.kind === 'chat' ? 250 : 450, my);
}

/** 대사의 기분 — 억울하거나 외치면 들뜬 소리, 슬프면 처진 소리 */
function moodOf(text: string): TalkMood {
  if (/(ㅠ|흑|…|슬퍼|눈물|안녕히|잘 있어)/.test(text)) return 'sad';
  if (/(억울|아니에|아니야|맹세|바칠|바쳐|살려|제발|!)/.test(text)) return 'excited';
  return 'calm';
}

/** 새로 붙은 줄을 하나씩 */
async function pump(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    for (;;) {
      const st = get();
      const s = st.session;
      const next = s?.lines.find((l) => l.id > st.shownId);
      if (!s || !next) break;
      const seen = visible(next, mySeatOf(s));
      useMafia.setState({ shownId: next.id, speaking: seen && (next.kind === 'say' || next.kind === 'vote') ? next.by : null });
      if (seen) await present(next, s, token);
    }
  } finally {
    playing = false;
    useMafia.setState({ speaking: null });
  }
}

function stopAll(): void {
  token++;
  hush();
  ctl?.abort();
  picks.clear();
}

const freshId = (): string => `m${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;

function begin(s: MafiaSession, shownId = 0): void {
  useMafia.setState((st) => ({ session: s, shownId, pick: null, note: null, waiting: false, thinking: false, rev: st.rev + 1 }));
  if (useGame.getState().screen !== 'mafia') useGame.getState().go('mafia');
  sfx('shuffle');
}

export const useMafia = create<MafiaState>((set) => ({
  cfg: loadSetup(),
  session: null,
  rev: 0,
  shownId: 0,
  speaking: null,
  thinking: false,
  waiting: false,
  pick: null,
  claudeOk: false,
  geminiModel: loadGemini()?.model ?? null,
  geminiState: 'idle',
  note: null,

  setCfg(p) {
    const cfg = { ...get().cfg, ...p };
    set({ cfg });
    writeJSON(SETUP_KEY, cfg);
    if (p.voice && p.voice !== 'read') hush();
  },

  async connectGemini(key) {
    const k = key.trim();
    if (!k) return false;
    set({ geminiState: 'checking' });
    try {
      const { model, models } = await connectGemini(k);
      saveGemini({ key: k, model, models });
      set({ geminiModel: model, geminiState: 'idle', note: null });
      get().setCfg({ gemini: true });
      return true;
    } catch (e) {
      set({ geminiState: e instanceof GeminiFail ? e.code : 'net' });
      return false;
    }
  },

  forgetGemini() {
    saveGemini(null);
    set({ geminiModel: null, geminiState: 'idle' });
  },

  probe() {
    void claudeSample().then((s) => set({ claudeOk: !!s }));
  },

  start() {
    unlockSpeech();
    stopAll();
    const { cfg } = get();
    const g = newGame({ count: cfg.count, me: cfg.me, myRole: cfg.role === 'random' ? null : cfg.role });
    const s: MafiaSession = { v: 1, id: freshId(), game: g, lines: [], ready: [], done: [], counts: null, online: null };
    opening(s);
    begin(s);
    commit(s);
  },

  again() {
    const s = get().session;
    if (!s?.online) return get().start();
    if (s.online.role !== 'host') return;
    // 온라인 방장: 같은 방, 같은 자리로 새 판
    const t = useOnline.getState().table;
    if (t) get().startOnline(t, s.online);
  },

  select(i) {
    set((s) => ({ pick: s.pick === i ? null : i }));
  },

  say(text) {
    const clean = text.trim().slice(0, MAX_TEXT);
    return !!clean && send({ type: 'say', text: clean });
  },

  quick(kind) {
    return send({ type: 'quick', kind, t: get().pick });
  },

  more() {
    send({ type: 'more' });
  },

  ready() {
    send({ type: 'ready' });
  },

  vote(t) {
    if (send({ type: 'vote', t })) set({ pick: null });
  },

  night(t) {
    if (send({ type: 'night', t })) set({ pick: null });
  },

  pleaText() {
    const s = get().session;
    return s ? humanLine(s.game, { k: 'plea' }, lang()) : '';
  },

  defend(text) {
    send({ type: 'defend', text: text.trim().slice(0, MAX_TEXT) });
  },

  verdict(yes) {
    send({ type: 'verdict', yes });
  },

  whisper(text) {
    const clean = text.trim().slice(0, MAX_TEXT);
    return !!clean && send({ type: 'whisper', text: clean });
  },

  skip() {
    token++;
    hush();
    ctl?.abort();
    const s = get().session;
    set({ shownId: s?.lines[s.lines.length - 1]?.id ?? 0, speaking: null });
  },

  quit() {
    const s = get().session;
    stopAll();
    if (s?.online) bridge.leave?.();
    set({ session: null, pick: null, speaking: null, thinking: false, waiting: false });
    useGame.getState().go(s?.online ? 'home' : 'mafia-setup');
  },

  startOnline(table, info) {
    stopAll();
    const seats: { character: CharacterId; human: boolean; name?: string }[] = table.seats.map((x) => ({ character: x.character, human: x.kind === 'human', ...(x.kind === 'human' ? { name: x.name } : {}) }));
    // 5명보다 적으면 AI 친구가 채운다
    for (const c of CAST) {
      if (seats.length >= MIN_PLAYERS) break;
      if (!seats.some((x) => x.character === c)) seats.push({ character: c, human: false });
    }
    const g = newGame({ count: seats.length, me: seats[0]?.character ?? 'hwigi', seats });
    const s: MafiaSession = { v: 1, id: freshId(), game: g, lines: [], ready: [], done: [], counts: null, online: info };
    opening(s);
    begin(s);
    commit(s);
  },

  applyRemote(seat, payload) {
    const s = get().session;
    if (!s?.online || s.online.role !== 'host' || seat === s.online.mySeat) return false;
    const a = cleanAction(payload, s.game.players.length);
    return !!a && act(seat, a);
  },

  adoptRemote(payload, _events, info) {
    const x = payload as Partial<MafiaSession> | null;
    const g = x?.game as Game | undefined;
    if (!x || x.v !== 1 || typeof x.id !== 'string' || !Array.isArray(x.lines) || !g || !Array.isArray(g.players) || !g.players.length) return;
    const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);
    const s: MafiaSession = { v: 1, id: x.id, game: g, lines: x.lines as Line[], ready: nums(x.ready), done: nums(x.done), counts: Array.isArray(x.counts) ? nums(x.counts) : null, online: info };
    const prev = get().session;
    if (info.role === 'host') {
      // 방장이 새로고침해서 돌아옴: 고른 것들은 잊었으니 이번 밤·투표를 다시 받는다
      picks.clear();
      s.done = [];
    }
    if (prev?.id === s.id) {
      useMafia.setState((st) => ({ session: s, rev: st.rev + 1 }));
      void pump();
    } else {
      stopAll();
      // 판 처음부터 받으면 처음부터 보여 주고, 중간에 들어왔으면 지난 줄은 바로 보여 준다
      begin(s, s.lines.length > 12 ? (s.lines[s.lines.length - 1]?.id ?? 0) : 0);
      void pump();
    }
    if (info.role === 'host') commit(s);
  },

  seatToAi(seat) {
    const s = get().session;
    const p = s?.game.players[seat];
    if (!s || !isHost(s) || !p?.human) return false;
    p.human = false;
    picks.delete(seat);
    s.done = s.done.filter((x) => x !== seat);
    s.ready = s.ready.filter((x) => x !== seat);
    verdicts.delete(seat);
    job(async (cur) => {
      if (cur.id !== s.id) return;
      const g = cur.game;
      // 그 친구만 기다리던 중이었으면 이어서 진행 (변론대에 서 있었으면 AI가 대신 변론)
      if (g.phase === 'defense' && g.accused === seat) {
        await talk(cur, { k: 'defense', by: seat });
        startVerdict(cur);
      } else if (g.phase === 'day' && cur.ready.length && allIn(g, cur.ready)) toVote(cur);
      else if (g.phase === 'vote' && allIn(g, cur.done) && deciders(g).length) return endVote(cur);
      else if (g.phase === 'verdict' && allVoted(g, cur.done) && deciders(g).length) return endVerdict(cur);
      else if (g.phase === 'night' && allIn(g, cur.done) && deciders(g).length) return endNight(cur);
      commit(cur);
    });
    return true;
  },

  setWaiting(v) {
    set({ waiting: v });
  },
}));

gameApis.mafia = () => useMafia.getState();

/** 링크(#gemini=키)로 열었으면 키를 이 기기에 넣고 연결해 본다 — 결과를 돌려준다 (없으면 null) */
export async function claimGeminiLink(): Promise<boolean | null> {
  const key = takeKeyFromUrl();
  return key ? useMafia.getState().connectGemini(key) : null;
}

// 시험용 손잡이 — 내 컴퓨터(localhost)에서 열었을 때만
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  (window as unknown as { __mafia?: unknown }).__mafia = { store: useMafia };
}
