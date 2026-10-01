/**
 * 마피아 판 진행 — 밤 행동, 낮 토론(AI 대사를 한 줄씩 보여 주고 읽어 주기, 되면 Claude로 다듬기), 투표.
 * 게임 객체(engine.Game)는 그 자리에서 고치고, 고칠 때마다 rev를 올려 화면을 다시 그린다.
 */
import { create } from 'zustand';
import { sfx } from '../audio/sfx';
import type { CharacterId } from '../characters/roster';
import { translate } from '../i18n';
import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import { readJSON, writeJSON } from '../store/storage';
import { FATAL, LIMITED, claudeSample, polish, type HistoryLine } from './claude';
import { CAST, MAX_PLAYERS, MIN_PLAYERS, PERSONA, aiNight, aiVote, killChoice, lastAct, living, newGame, plan, quietNight, record, resolveNight, resolveVote, tally, type Act, type Game, type Role, type Trigger } from './engine';
import { humanLine, lineFor, nameOf, narrate, parseHuman, roleName, suggestLine } from './talk';
import { canSpeak, hush, speak, unlockSpeech } from './voice';

export interface MafiaConfig {
  count: number;
  me: CharacterId;
  role: Role | 'random';
  /** 대사를 목소리로 읽어 주기 */
  voice: boolean;
  /** claude.ai에서 Claude가 대사 다듬기 */
  claude: boolean;
}
export type LineKind = 'say' | 'me' | 'sys' | 'secret' | 'vote';
export interface Line {
  id: number;
  kind: LineKind;
  by: number | null;
  text: string;
}

const SETUP_KEY = 'lumina.mafia.setup.v1';
const ROLE_CHOICES: readonly (Role | 'random')[] = ['random', 'citizen', 'police', 'doctor', 'mafia'];

function loadSetup(): MafiaConfig {
  const raw = readJSON<Partial<MafiaConfig>>(SETUP_KEY);
  return {
    count: Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(Number(raw?.count)) || 7)),
    me: CAST.includes(raw?.me as CharacterId) ? (raw?.me as CharacterId) : 'moka',
    role: ROLE_CHOICES.includes(raw?.role as Role) ? (raw?.role as Role | 'random') : 'random',
    voice: raw?.voice !== false,
    claude: raw?.claude !== false,
  };
}

interface MafiaState {
  cfg: MafiaConfig;
  game: Game | null;
  rev: number;
  lines: Line[];
  /** 지금 말하는 친구 */
  speaking: number | null;
  /** AI 차례가 진행 중 (사람 입력을 잠깐 막는다) */
  busy: boolean;
  /** Claude가 대사를 쓰는 중 */
  thinking: boolean;
  /** 눌러서 고른 친구 (밤 행동·투표·빠른 말) */
  pick: number | null;
  /** 방금 투표에서 받은 표 수 (다음 밤까지 보여 준다) */
  counts: number[] | null;
  /** 이 화면에서 Claude를 부를 수 있는지 */
  claudeOk: boolean;
  note: 'claudeOff' | 'claudeLimit' | null;
  setCfg(p: Partial<MafiaConfig>): void;
  probe(): void;
  start(): void;
  select(i: number | null): void;
  say(text: string): boolean;
  quick(kind: 'accuse' | 'trust' | 'claim' | 'ask'): boolean;
  more(): void;
  toVote(): void;
  vote(t: number | null): void;
  night(t: number | null): void;
  skip(): void;
  quit(): void;
}

let token = 0;
let ctl: AbortController | null = null;
let lineId = 0;

const lang = () => useSettings.getState().lang;
const get = (): MafiaState => useMafia.getState();
const bump = (): void => useMafia.setState((s) => ({ rev: s.rev + 1 }));

function push(kind: LineKind, by: number | null, text: string): void {
  if (!get().game || !text) return;
  useMafia.setState((s) => ({ lines: [...s.lines, { id: ++lineId, kind, by, text }].slice(-240) }));
}

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

interface Cue {
  by: number;
  text: string;
  kind?: LineKind;
}

/** 대사를 한 줄씩 보여 주고 읽어 준다 — 건너뛰면 남은 줄을 한꺼번에 */
async function play(cues: readonly Cue[], quick = false): Promise<void> {
  const my = token;
  for (const c of cues) {
    push(c.kind ?? 'say', c.by, c.text);
    if (my !== token) continue;
    useMafia.setState({ speaking: c.by });
    const { cfg, game } = get();
    const p = game?.players[c.by];
    if (!quick && cfg.voice && canSpeak() && p) await speak(c.text, { lang: lang(), pitch: PERSONA[p.character].pitch, rate: PERSONA[p.character].rate });
    else {
      sfx('pop');
      await pause(quick ? 600 : Math.min(3400, 1000 + c.text.length * 45), my);
    }
    await pause(quick ? 100 : 260, my);
  }
  useMafia.setState({ speaking: null });
}

function history(g: Game): HistoryLine[] {
  const L = lang();
  return get()
    .lines.filter((l) => l.kind !== 'secret')
    .slice(-14)
    .map((l) => ({
      name: l.by === null ? (L === 'ko' ? '진행' : 'Narrator') : nameOf(g, l.by, L) + (g.players[l.by]?.human ? (L === 'ko' ? '(사람)' : ' (human)') : ''),
      text: l.text,
    }));
}

/** AI들이 한 차례 말한다 (Claude를 쓸 수 있으면 초안을 다듬어서) */
async function talk(tr: Trigger): Promise<void> {
  const g = get().game;
  if (!g || g.phase !== 'day') return;
  const said = plan(g, tr);
  bump();
  if (!said.length) return;
  const L = lang();
  let texts = said.map((s) => lineFor(g, s, L));
  const { cfg, claudeOk } = get();
  const sample = cfg.claude && claudeOk ? await claudeSample() : null;
  if (sample) {
    const c = (ctl = new AbortController());
    useMafia.setState({ thinking: true });
    try {
      texts = await polish(sample, g, said, texts, history(g), L, c.signal);
    } catch (e) {
      const code = String((e as { code?: unknown } | null)?.code ?? '');
      if (FATAL.has(code)) useMafia.setState({ claudeOk: false, note: 'claudeOff' });
      else if (LIMITED.has(code)) {
        useMafia.setState({ note: 'claudeLimit' });
        get().setCfg({ claude: false });
      }
    } finally {
      ctl = null;
      useMafia.setState({ thinking: false });
    }
  }
  if (get().game !== g) return;
  await play(said.map((s, k) => ({ by: s.by, text: texts[k] ?? '' })));
}

/** 한 번에 하나씩 — 사람이 누른 순간 시작해야 iOS에서 목소리가 난다 */
function run(job: () => Promise<void>): void {
  if (get().busy) return;
  useMafia.setState({ busy: true, note: null });
  void job()
    .catch((e: unknown) => console.error(e))
    .finally(() => {
      useMafia.setState({ busy: false, speaking: null, thinking: false });
      bump();
    });
}

function finish(g: Game): void {
  push('sys', null, narrate(g.winner === 'town' ? 'townWin' : 'mafiaWin', {}, lang()));
  const me = g.players.find((p) => p.human);
  sfx(me && (g.winner === 'mafia') === (me.role === 'mafia') ? 'win' : 'lose');
}

/** 밤이 되면: 사람이 마피아면 동료 AI가 노릴 친구를 귀띔한다 */
function dusk(g: Game): void {
  const L = lang();
  push('sys', null, narrate(quietNight(g) ? 'quiet' : 'night', { d: String(g.day) }, L));
  const me = g.players.find((p) => p.human);
  const mate = living(g).find((p) => p.role === 'mafia' && !p.human);
  if (!me?.alive || me.role !== 'mafia' || !mate || quietNight(g)) return;
  const t = killChoice(g);
  if (t !== null) push('secret', mate.id, suggestLine(g, mate.id, t, L));
}

export const useMafia = create<MafiaState>((set) => ({
  cfg: loadSetup(),
  game: null,
  rev: 0,
  lines: [],
  speaking: null,
  busy: false,
  thinking: false,
  pick: null,
  counts: null,
  claudeOk: false,
  note: null,

  setCfg(p) {
    const cfg = { ...get().cfg, ...p };
    set({ cfg });
    writeJSON(SETUP_KEY, cfg);
    if (p.voice === false) hush();
  },

  probe() {
    void claudeSample().then((s) => set({ claudeOk: !!s }));
  },

  start() {
    unlockSpeech();
    token++;
    hush();
    ctl?.abort();
    const { cfg } = get();
    const g = newGame({ count: cfg.count, me: cfg.me, myRole: cfg.role === 'random' ? null : cfg.role });
    lineId = 0;
    set({ game: g, lines: [], pick: null, speaking: null, busy: false, thinking: false, counts: null, note: null, rev: 0 });
    const L = lang();
    const me = g.players[0];
    if (me) {
      push('sys', null, narrate('start', { n: String(g.players.length), m: String(g.mafia) }, L));
      push('secret', null, narrate('myRole', { r: roleName(me.role, L), d: translate(L, `mafia.roleSub.${me.role}`) }, L));
      const mates = g.players.filter((p) => p.role === 'mafia' && !p.human).map((p) => nameOf(g, p.id, L));
      if (me.role === 'mafia' && mates.length) push('secret', null, narrate('mates', { list: mates.join(', ') }, L));
    }
    dusk(g);
    sfx('shuffle');
    useGame.getState().go('mafia');
  },

  select(i) {
    set((s) => ({ pick: s.pick === i ? null : i }));
  },

  say(text) {
    const g = get().game;
    const clean = text.trim().slice(0, 200);
    const me = g?.players.find((p) => p.human);
    if (!g || g.phase !== 'day' || !clean || !me?.alive || get().busy) return false;
    run(async () => {
      unlockSpeech();
      push('me', me.id, clean);
      const p = parseHuman(g, clean);
      for (const a of p.acts) record(g, me.id, a);
      await talk({ k: 'human', acts: p.acts, ask: p.ask, why: p.why });
    });
    return true;
  },

  quick(kind) {
    const { game: g, pick, busy } = get();
    const me = g?.players.find((p) => p.human);
    if (!g || g.phase !== 'day' || !me?.alive || busy) return false;
    let act: Act | null = null;
    if (kind === 'accuse' || kind === 'trust') {
      if (pick === null || pick === me.id || !g.players[pick]?.alive) return false;
      act = kind === 'accuse' ? { k: 'accuse', t: pick, why: 'gut' } : { k: 'trust', t: pick, why: 'gut' };
    } else if (kind === 'claim') {
      // 마피아는 시민이라고 둘러댄다
      act = me.role === 'mafia' ? { k: 'claim', role: 'citizen' } : { k: 'claim', role: me.role, res: me.role === 'police' ? g.checks.map(([t, m]): [number, boolean] => [t, m]) : undefined };
    }
    const text = humanLine(g, act, lang());
    run(async () => {
      unlockSpeech();
      push('me', me.id, text);
      if (act) record(g, me.id, act);
      await talk({ k: 'human', acts: act ? [act] : [], ask: kind === 'ask', why: null });
    });
    return true;
  },

  more() {
    if (get().game?.phase === 'day') run(() => talk({ k: 'more' }));
  },

  toVote() {
    const g = get().game;
    if (!g || g.phase !== 'day' || get().busy) return;
    g.phase = 'vote';
    set({ pick: null });
    push('sys', null, narrate('vote', {}, lang()));
    bump();
  },

  vote(t) {
    const g = get().game;
    if (!g || g.phase !== 'vote') return;
    run(async () => {
      unlockSpeech();
      const L = lang();
      const ballots = living(g).map((p) => ({ day: g.day, by: p.id, t: p.human ? t : aiVote(g, p.id) }));
      const me = g.players.find((p) => p.human);
      if (me?.alive) push('vote', me.id, lineFor(g, { day: g.day, by: me.id, act: { k: 'vote', t } }, L, () => 0));
      await play(
        ballots.filter((b) => !g.players[b.by]?.human).map((b) => ({ by: b.by, kind: 'vote' as const, text: lineFor(g, { day: g.day, by: b.by, act: { k: 'vote', t: b.t } }, L) })),
        true,
      );
      const { counts } = tally(g, ballots);
      const day = g.day;
      const out = resolveVote(g, ballots);
      set({ counts, pick: null });
      bump();
      const gone = out === null ? undefined : g.players[out];
      if (!gone) push('sys', null, narrate('tie', {}, L));
      else {
        push('sys', null, narrate('out', { t: nameOf(g, gone.id, L), c: String(counts[gone.id] ?? 0) }, L));
        if (!gone.human) await play([{ by: gone.id, text: lineFor(g, { day, by: gone.id, act: lastAct(g, gone.id) }, L) }]);
        push('sys', null, narrate('reveal', { t: nameOf(g, gone.id, L), r: roleName(gone.role, L) }, L));
        sfx(gone.role === 'mafia' ? 'wheek' : 'sadsqueak');
        if (gone.human) push('sys', null, narrate('youDied', {}, L));
      }
      if (g.phase === 'over') finish(g);
      else dusk(g);
    });
  },

  night(t) {
    const g = get().game;
    if (!g || g.phase !== 'night') return;
    run(async () => {
      unlockSpeech();
      const L = lang();
      const me = g.players.find((p) => p.human);
      const n = aiNight(g);
      if (me?.alive) {
        if (me.role === 'mafia') n.kill = t ?? killChoice(g);
        if (me.role === 'doctor') n.save = t;
        if (me.role === 'police') n.check = t;
      }
      const quiet = quietNight(g);
      const res = resolveNight(g, n);
      set({ pick: null, counts: null });
      bump();
      if (res.checked && me?.role === 'police') push('secret', null, narrate(res.checked[1] ? 'checkMafia' : 'checkTown', { t: nameOf(g, res.checked[0], L) }, L));
      const dead = res.died === null ? undefined : g.players[res.died];
      if (dead) {
        push('sys', null, narrate('died', { t: nameOf(g, dead.id, L), r: roleName(dead.role, L) }, L));
        sfx('sadsqueak');
        if (dead.human) push('sys', null, narrate('youDied', {}, L));
      } else push('sys', null, narrate(!quiet && res.saved ? 'saved' : 'calm', {}, L));
      if (g.phase === 'over') {
        finish(g);
        return;
      }
      sfx('turn');
      await talk({ k: 'open' });
    });
  },

  skip() {
    token++;
    hush();
    ctl?.abort();
  },

  quit() {
    get().skip();
    set({ game: null, lines: [], busy: false, speaking: null, thinking: false, pick: null, counts: null });
    useGame.getState().go('mafia-setup');
  },
}));

// 시험용 손잡이 — 내 컴퓨터(localhost)에서 열었을 때만
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  (window as unknown as { __mafia?: unknown }).__mafia = { store: useMafia };
}
