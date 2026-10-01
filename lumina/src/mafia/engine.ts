/**
 * 마피아 — 규칙과 AI 두뇌. 화면·소리와 상관없는 순수 로직이라 시험에서 AI끼리 수백 판을 돌린다.
 *
 * AI 추리: 마피아가 될 수 있는 모든 조합(8명 중 2명이면 28가지)을 늘어놓고, 각 조합이 지금까지의
 * 투표·발언·역할 주장·밤 희생과 얼마나 잘 맞는지 가중치를 매겨 "이 친구가 마피아일 확률"을 구한다.
 * 마피아 AI는 정답을 알기 때문에, 시민이 공개 정보만으로 볼 확률을 보고 그럴듯한 희생양을 고른다.
 * 여기서는 '무슨 뜻으로 말할지(Act)'까지만 정하고, 문장은 talk.ts(또는 Claude)가 만든다.
 */
import type { CharacterId } from '../characters/roster';

export type Role = 'mafia' | 'police' | 'doctor' | 'citizen';
export type Phase = 'night' | 'day' | 'vote' | 'over';
export type Style = 'polite' | 'casual' | 'cute' | 'cool';
export type Side = 'mafia' | 'town';

export interface Persona {
  /** 먼저 나서서 의심을 던지는 정도 */
  bold: number;
  /** 근거를 따지는 정도 (낮을수록 첫인상에 휘둘림) */
  logic: number;
  /** 남의 의견을 따라가는 정도 */
  follow: number;
  style: Style;
  /** 읽어 주기 목소리 높이·빠르기 */
  pitch: number;
  rate: number;
}

export const CAST: readonly CharacterId[] = ['hwigi', 'ginini', 'pponi', 'moka', 'dubu', 'kongi', 'bori', 'nuri'];

/** 목소리는 모두 높고 조금 빠르게 — 기니피그처럼 귀엽게 (낮은 목소리는 무섭다는 말을 듣고 올렸다) */
export const PERSONA: Readonly<Record<CharacterId, Persona>> = {
  hwigi: { bold: 0.85, logic: 0.5, follow: 0.3, style: 'casual', pitch: 1.7, rate: 1.15 },
  ginini: { bold: 0.45, logic: 0.85, follow: 0.2, style: 'polite', pitch: 1.5, rate: 1.05 },
  pponi: { bold: 0.5, logic: 0.45, follow: 0.6, style: 'cute', pitch: 2, rate: 1.1 },
  moka: { bold: 0.55, logic: 0.9, follow: 0.25, style: 'polite', pitch: 1.6, rate: 1.08 },
  dubu: { bold: 0.3, logic: 0.4, follow: 0.75, style: 'cute', pitch: 1.9, rate: 1.05 },
  kongi: { bold: 0.8, logic: 0.55, follow: 0.4, style: 'casual', pitch: 1.75, rate: 1.18 },
  bori: { bold: 0.4, logic: 0.7, follow: 0.35, style: 'cool', pitch: 1.45, rate: 1.08 },
  nuri: { bold: 0.6, logic: 0.75, follow: 0.3, style: 'polite', pitch: 1.65, rate: 1.1 },
};

export interface Player {
  id: number;
  character: CharacterId;
  /** 사람 자리면 방에서 쓴 이름 (없으면 캐릭터 이름) */
  name?: string;
  human: boolean;
  role: Role;
  alive: boolean;
  /** 근거 없는 첫인상 (-1..1), 다른 친구마다 하나씩 */
  gut: number[];
}

/** 의심하거나 믿는 이유 */
export type Why = 'checked' | 'fakeClaim' | 'claimClash' | 'votedTown' | 'accusedTown' | 'defendedMafia' | 'motive' | 'quiet' | 'gut' | 'claimed' | 'votedMafia';

/** 한 번의 발언이 담은 뜻 — 추리의 재료이자 대사의 뼈대 */
export type Act =
  | { k: 'accuse'; t: number; why: Why; x?: number }
  | { k: 'trust'; t: number; why: Why; x?: number }
  | { k: 'claim'; role: Role; res?: [number, boolean][] }
  | { k: 'defend'; x?: number; counter?: boolean }
  | { k: 'agree'; t: number; x: number }
  | { k: 'doubt'; t: number; x: number }
  | { k: 'ask'; t: number }
  | { k: 'react'; ev: 'died' | 'saved' | 'calm'; t?: number }
  | { k: 'vote'; t: number | null }
  | { k: 'last'; role: Role; t?: number }
  /** 사람의 말에 자유롭게 대꾸 (일상 이야기 — 추리에는 쓰지 않는다) */
  | { k: 'chat'; to: number }
  | { k: 'idle' };

export interface Said {
  day: number;
  by: number;
  act: Act;
}
export interface Ballot {
  day: number;
  by: number;
  t: number | null;
}
export interface Death {
  day: number;
  who: number;
  cause: 'night' | 'vote';
  role: Role;
}
export interface Claim {
  day: number;
  by: number;
  role: Role;
  res: [number, boolean][];
}

export interface Game {
  seed: number;
  players: Player[];
  /** 처음 마피아 수 (모두 안다) */
  mafia: number;
  /** n일째 밤 → n일째 낮 → 투표 → n+1일째 밤 */
  day: number;
  phase: Phase;
  said: Said[];
  votes: Ballot[];
  deaths: Death[];
  claims: Claim[];
  /** 경찰이 밤마다 알아낸 결과 — 경찰 본인만 안다 */
  checks: [number, boolean][];
  /** 의사가 지난밤 지킨 친구 */
  saved: number | null;
  winner: Side | null;
}

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 8;

export function rand(g: Game): number {
  let t = (g.seed = (g.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(g: Game, xs: readonly T[]): T => xs[Math.floor(rand(g) * xs.length)] as T;
function shuffle<T>(g: Game, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
  }
  return xs;
}
function best<T>(xs: readonly T[], score: (x: T) => number): T | undefined {
  let b: T | undefined;
  let s = -Infinity;
  for (const x of xs) {
    const v = score(x);
    if (v > s) {
      s = v;
      b = x;
    }
  }
  return b;
}

/** 인원별 역할 — AI끼리 수백 판을 돌려 시민 승률이 50~65%쯤 되게 맞췄다 (scripts/mafia-sim.ts) */
const SETUPS: Record<number, Role[]> = {
  5: ['mafia', 'police', 'citizen', 'citizen', 'citizen'],
  6: ['mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen'],
  7: ['mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen', 'citizen'],
  8: ['mafia', 'mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen', 'citizen'],
};
export function rolesFor(n: number): Role[] {
  return [...(SETUPS[Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n))] ?? [])];
}
export function mafiaCount(n: number): number {
  return rolesFor(n).filter((r) => r === 'mafia').length;
}

export interface NewGame {
  count: number;
  me: CharacterId;
  myRole?: Role | null;
  seed?: number;
  /** 시험용: 0번 자리도 AI */
  allAi?: boolean;
  /** 온라인: 방의 자리 그대로 (역할은 무작위) */
  seats?: readonly { character: CharacterId; human: boolean; name?: string }[];
}

export function newGame(o: NewGame): Game {
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, o.seats?.length ?? o.count));
  const g: Game = { seed: o.seed ?? (Math.random() * 2 ** 31) | 0, players: [], mafia: mafiaCount(count), day: 1, phase: 'night', said: [], votes: [], deaths: [], claims: [], checks: [], saved: null, winner: null };
  const roles = shuffle(g, rolesFor(count));
  const k = o.myRole ? roles.indexOf(o.myRole) : -1;
  if (k > 0) [roles[0], roles[k]] = [roles[k] as Role, roles[0] as Role];
  if (o.seats) {
    g.players = o.seats.slice(0, count).map((x, id) => ({ id, character: x.character, ...(x.name ? { name: x.name } : {}), human: x.human, role: roles[id] as Role, alive: true, gut: o.seats!.map(() => rand(g) * 2 - 1) }));
    return g;
  }
  const cast = [o.me, ...shuffle(g, CAST.filter((c) => c !== o.me))].slice(0, count);
  g.players = cast.map((character, id) => ({ id, character, human: id === 0 && !o.allAi, role: roles[id] as Role, alive: true, gut: cast.map(() => rand(g) * 2 - 1) }));
  return g;
}

export const living = (g: Game): Player[] => g.players.filter((p) => p.alive);
export const isMafia = (g: Game, i: number): boolean => g.players[i]?.role === 'mafia';
const today = (g: Game): Said[] => g.said.filter((s) => s.day === g.day);

export function winnerOf(g: Game): Side | null {
  const a = living(g);
  const m = a.filter((p) => p.role === 'mafia').length;
  if (m === 0) return 'town';
  return m >= a.length - m ? 'mafia' : null;
}

/** 발언을 기록한다 (역할 주장은 따로 모아 둔다) */
export function record(g: Game, by: number, act: Act): Said {
  const s = { day: g.day, by, act };
  g.said.push(s);
  if (act.k === 'claim') g.claims.push({ day: g.day, by, role: act.role, res: (act.res ?? []).map(([t, m]) => [t, m]) });
  return s;
}

/** 이 발언이 마피아로 몬 친구 / 감싼 친구 */
export function accusedBy(a: Act): number | null {
  if (a.k === 'accuse' || a.k === 'agree') return a.t;
  if (a.k === 'defend' && a.counter && a.x !== undefined) return a.x;
  return null;
}
export function vouchedBy(a: Act): number | null {
  return a.k === 'trust' || a.k === 'doubt' ? a.t : null;
}

/** 오늘 의심받은 횟수 */
export function heat(g: Game): number[] {
  const h = g.players.map(() => 0);
  for (const s of today(g)) {
    const t = accusedBy(s.act);
    if (t !== null) h[t] = (h[t] ?? 0) + 1;
    if (s.act.k === 'claim') for (const [x, m] of s.act.res ?? []) if (m) h[x] = (h[x] ?? 0) + 2;
  }
  return h;
}

/** 내가 마지막으로 말한 뒤에 나를 의심한 친구들 */
export function accusers(g: Game, i: number): number[] {
  const t = today(g);
  let last = -1;
  t.forEach((s, k) => {
    if (s.by === i) last = k;
  });
  const out: number[] = [];
  t.forEach((s, k) => {
    if (k <= last || out.includes(s.by)) return;
    if (accusedBy(s.act) === i || (s.act.k === 'claim' && s.act.res?.some(([x, m]) => x === i && m))) out.push(s.by);
  });
  return out;
}

// ── 추리 ────────────────────────────────────────────────

function combos(pool: readonly number[], k: number, from = 0, cur: number[] = [], out: number[][] = []): number[][] {
  if (cur.length === k) out.push([...cur]);
  else
    for (let i = from; i < pool.length; i++) {
      cur.push(pool[i] as number);
      combos(pool, k, i + 1, cur, out);
      cur.pop();
    }
  return out;
}

/** 거짓 역할 주장을 할 확률 — AI 시민은 거짓말을 안 하지만 사람은 떠볼 수 있다 */
const LIAR_AI = 0.005;
const LIAR_HUMAN = 0.25;

/**
 * 마피아가 경찰을 사칭했을 가능성: 진짜 경찰이 동료를 찍은 뒤에 맞받아치는 게 보통이고,
 * 먼저 나서서 사칭하거나 동료를 마피아라고 부르지는 않는다.
 */
function fakeCop(g: Game, S: Set<number>, c: number): number {
  const k = g.claims.findIndex((x) => x.by === c && x.role === 'police');
  const own = g.claims[k];
  const prompted = g.claims.slice(0, k).some((e) => e.by !== c && e.role === 'police' && e.res.some(([t, m]) => m && S.has(t)));
  return (prompted ? 0.6 : 0.1) * (own?.res.some(([t, m]) => m && S.has(t)) ? 0.05 : 1);
}

/** 마피아 조합 S가 지금까지 일어난 일과 얼마나 잘 맞는지 */
function weight(g: Game, S: Set<number>, holder: Partial<Record<Role, number>>): number {
  let w = 1;
  for (const role of ['police', 'doctor'] as const) {
    const by = [...new Set(g.claims.filter((c) => c.role === role).map((c) => c.by))];
    let town = 0;
    for (const c of by) {
      if (S.has(c)) {
        w *= role === 'police' ? fakeCop(g, S, c) : 0.5;
        continue;
      }
      town++;
      let ok = holder[role] === undefined || holder[role] === c;
      if (ok && role === 'police') ok = g.claims.every((cl) => cl.by !== c || cl.role !== 'police' || cl.res.every(([t, m]) => S.has(t) === m));
      if (!ok) w *= g.players[c]?.human ? LIAR_HUMAN : LIAR_AI;
    }
    // 한 명뿐인 역할을 시민 둘이 주장할 수는 없다
    if (town > 1) w *= 0.05 ** (town - 1);
  }
  for (const v of g.votes) {
    if (v.t === null) continue;
    const a = S.has(v.by);
    const b = S.has(v.t);
    w *= a ? (b ? 0.35 : 1.2) : b ? 1.1 : 1;
  }
  for (const s of g.said) {
    const a = S.has(s.by);
    const t = accusedBy(s.act);
    if (t !== null) {
      const f = s.act.k === 'accuse' ? 1 : 0.6;
      const b = S.has(t);
      w *= a ? (b ? 1 - 0.45 * f : 1 + 0.08 * f) : b ? 1 + 0.12 * f : 1;
    }
    const u = vouchedBy(s.act);
    if (u !== null) w *= a ? (S.has(u) ? 1.6 : 1) : S.has(u) ? 0.92 : 1;
  }
  // 밤에 당한 친구가 전날 의심하던 사람은 입막음 동기가 있다
  for (const d of g.deaths) {
    if (d.cause !== 'night') continue;
    for (const s of g.said) {
      const t = accusedBy(s.act);
      if (s.by === d.who && s.day === d.day - 1 && t !== null && S.has(t)) w *= 1.3;
    }
  }
  return w;
}

/**
 * viewer가 보기에 각 친구가 마피아일 확률. viewer가 null이면 공개 정보만 아는 시민의 눈.
 * 마피아는 동료를 알고, 경찰은 자기 조사 결과를 안다.
 */
export function suspicion(g: Game, viewer: number | null): number[] {
  const out = g.players.map(() => 0);
  const v = viewer === null ? null : g.players[viewer];
  if (v?.role === 'mafia') return g.players.map((p) => (p.role === 'mafia' ? 1 : 0));
  const checks = v?.role === 'police' ? g.checks : [];
  const must: number[] = [];
  const pool: number[] = [];
  for (const p of g.players) {
    const d = g.deaths.find((x) => x.who === p.id);
    const c = checks.find(([t]) => t === p.id);
    const known = d ? d.role === 'mafia' : c ? c[1] : null;
    if (known === true) must.push(p.id);
    else if (known === null && p.id !== viewer) pool.push(p.id);
  }
  const k = g.mafia - must.length;
  const holder: Partial<Record<Role, number>> = {};
  for (const role of ['police', 'doctor'] as const) {
    const d = g.deaths.find((x) => x.role === role);
    if (v?.role === role) holder[role] = v.id;
    else if (d) holder[role] = d.who;
  }
  let total = 0;
  const each = (set: number[]): void => {
    const w = weight(g, new Set(set), holder);
    total += w;
    for (const i of set) out[i] = (out[i] ?? 0) + w;
  };
  if (k <= 0) each(must);
  else if (k <= pool.length) for (const c of combos(pool, k)) each([...must, ...c]);
  if (total > 0) return out.map((x) => x / total);
  for (const i of pool) out[i] = Math.max(0, k) / pool.length;
  return out;
}

/** AI 한 명의 생각 — 추리에 성격(첫인상에 휘둘리는 정도)을 섞는다 */
export function opinion(g: Game, i: number): number[] {
  const me = g.players[i] as Player;
  const p = suspicion(g, i);
  if (me.role === 'mafia') return p;
  const noise = (1 - PERSONA[me.character].logic) * 0.6;
  return p.map((x, j) => (x <= 0 || x >= 1 ? x : Math.min(0.99, x * (1 + noise * (me.gut[j] ?? 0)))));
}

/** 아무 정보가 없을 때 한 친구가 마피아일 확률 */
function base(g: Game): number {
  const left = g.mafia - g.deaths.filter((d) => d.role === 'mafia').length;
  return left / Math.max(1, living(g).length - 1);
}

/** 의심하는 이유 — viewer가 null이면 공개된 사실만으로 (마피아가 남을 몰 때) */
export function accuseWhy(g: Game, viewer: number | null, t: number): { why: Why; x?: number } {
  const v = viewer === null ? null : g.players[viewer];
  if (v?.role === 'police' && g.checks.some(([x, m]) => x === t && m)) return { why: 'checked' };
  for (const role of ['police', 'doctor'] as const) {
    if (!g.claims.some((c) => c.by === t && c.role === role)) continue;
    const holder = v?.role === role ? v.id : g.deaths.find((d) => d.role === role)?.who;
    if (holder !== undefined && holder !== t) return { why: 'fakeClaim', x: holder };
    const rival = g.claims.find((c) => c.role === role && c.by !== t);
    if (rival) return { why: 'claimClash', x: rival.by };
  }
  const innocent = new Set(g.deaths.filter((d) => d.role !== 'mafia').map((d) => d.who));
  const executed = new Set(g.deaths.filter((d) => d.cause === 'vote' && d.role !== 'mafia').map((d) => d.who));
  const vt = [...g.votes].reverse().find((b) => b.by === t && b.t !== null && executed.has(b.t));
  if (vt && vt.t !== null) return { why: 'votedTown', x: vt.t };
  const ac = [...g.said].reverse().find((s) => s.by === t && s.act.k === 'accuse' && innocent.has(s.act.t));
  if (ac?.act.k === 'accuse') return { why: 'accusedTown', x: ac.act.t };
  const mafiaDead = new Set(g.deaths.filter((d) => d.role === 'mafia').map((d) => d.who));
  const dm = [...g.said].reverse().find((s) => s.by === t && mafiaDead.has(vouchedBy(s.act) ?? -1));
  if (dm) return { why: 'defendedMafia', x: vouchedBy(dm.act) ?? undefined };
  const mo = g.deaths.find((d) => d.cause === 'night' && g.said.some((s) => s.by === d.who && s.day === d.day - 1 && accusedBy(s.act) === t));
  if (mo) return { why: 'motive', x: mo.who };
  if (today(g).length >= 4 && !today(g).some((s) => s.by === t)) return { why: 'quiet' };
  return { why: 'gut' };
}

export function trustWhy(g: Game, viewer: number | null, t: number): { why: Why; x?: number } {
  const v = viewer === null ? null : g.players[viewer];
  if (v?.role === 'police' && g.checks.some(([x, m]) => x === t && !m)) return { why: 'checked' };
  if (g.claims.some((c) => c.by === t && c.role === 'police')) return { why: 'claimed' };
  const mafiaDead = new Set(g.deaths.filter((d) => d.role === 'mafia').map((d) => d.who));
  const vm = g.votes.find((b) => b.by === t && b.t !== null && mafiaDead.has(b.t));
  if (vm && vm.t !== null) return { why: 'votedMafia', x: vm.t };
  return { why: 'gut' };
}

// ── 낮: 누가 무슨 뜻으로 말할지 ──────────────────────────

export type Trigger = { k: 'open' } | { k: 'more' } | { k: 'human'; by: number; acts: Act[]; ask: boolean; why: number | null; mentions?: number[] };

/** 한 번에 이어지는 AI 대사 수 */
const ROUND = 4;

/** 의심받았을 때: 경찰·의사는 역할을 밝히고, 아니면 해명하거나 되받아친다 */
function defendAct(g: Game, i: number): Act {
  const me = g.players[i] as Player;
  const acc = accusers(g, i);
  const x = acc[acc.length - 1];
  const claimed = g.claims.some((c) => c.by === i);
  if (me.role === 'police' && !claimed && (g.checks.length > 0 || acc.length >= 2)) return { k: 'claim', role: 'police', res: g.checks.map(([t, m]) => [t, m]) };
  if (me.role === 'doctor' && !claimed && (heat(g)[i] ?? 0) >= 2) return { k: 'claim', role: 'doctor' };
  if (x === undefined) return { k: 'defend' };
  const counter = me.role === 'mafia' ? !isMafia(g, x) && rand(g) < 0.6 : (opinion(g, i)[x] ?? 0) > base(g) * 1.2;
  return { k: 'defend', x, counter };
}

function mafiaAct(g: Game, i: number, asked: boolean): Act | null {
  const pub = suspicion(g, null);
  const mine = today(g).filter((s) => s.by === i);
  const said = (t: number): boolean => mine.some((s) => accusedBy(s.act) === t || vouchedBy(s.act) === t);
  // 진짜 경찰이 우리 편을 찍으면 한 명이 "내가 경찰"이라고 맞받아친다
  const threat = g.claims.find((c) => c.role === 'police' && !isMafia(g, c.by) && g.players[c.by]?.alive && c.res.some(([t, m]) => m && isMafia(g, t) && g.players[t]?.alive));
  if (threat && !g.claims.some((c) => c.role === 'police' && isMafia(g, c.by)) && rand(g) < 0.6) return { k: 'claim', role: 'police', res: [[threat.by, true]] };
  const h = heat(g);
  const cops = new Set(g.claims.filter((c) => c.role === 'police').map((c) => c.by));
  // 가끔은 먼저 경찰을 사칭해 시민 하나를 마피아로 몬다 (진짜 경찰이 나서면 진짜 가리기 싸움)
  if (!cops.size && !g.claims.some((c) => isMafia(g, c.by)) && rand(g) < 0.12) {
    const goat = best(
      living(g).filter((p) => p.role !== 'mafia'),
      (p) => (pub[p.id] ?? 0) + rand(g) * 0.2,
    );
    if (goat) return { k: 'claim', role: 'police', res: [[goat.id, true]] };
  }
  const t = best(
    living(g).filter((p) => p.role !== 'mafia' && !said(p.id)),
    (p) => (pub[p.id] ?? 0) + 0.12 * (h[p.id] ?? 0) + (cops.has(p.id) ? 0.2 : 0) + rand(g) * 0.15,
  );
  if (t && (asked || rand(g) < 0.85)) {
    const prior = today(g).find((s) => s.by !== i && !isMafia(g, s.by) && s.act.k === 'accuse' && s.act.t === t.id);
    if (prior && !asked && rand(g) < 0.5) return { k: 'agree', t: t.id, x: prior.by };
    return { k: 'accuse', t: t.id, ...accuseWhy(g, null, t.id) };
  }
  const mate = living(g).find((p) => p.role === 'mafia' && p.id !== i && (h[p.id] ?? 0) > 0);
  const acc = mate ? accusers(g, mate.id)[0] : undefined;
  if (mate && acc !== undefined && rand(g) < 0.4) return { k: 'doubt', t: mate.id, x: acc };
  return mine.length ? null : { k: 'idle' };
}

function townAct(g: Game, i: number, asked: boolean): Act | null {
  const per = PERSONA[(g.players[i] as Player).character];
  const op = opinion(g, i);
  const others = living(g).filter((p) => p.id !== i);
  const mine = today(g).filter((s) => s.by === i);
  const said = (t: number): boolean => mine.some((s) => accusedBy(s.act) === t || vouchedBy(s.act) === t);
  const b = base(g);
  const top = best(
    others.filter((p) => !said(p.id)),
    (p) => op[p.id] ?? 0,
  );
  if (top && (asked || (op[top.id] ?? 0) > b * 1.35 || rand(g) < per.bold * 0.5)) {
    const prior = today(g).find((s) => s.by !== i && s.act.k === 'accuse' && s.act.t === top.id);
    if (prior && !asked && rand(g) < per.follow + 0.25) return { k: 'agree', t: top.id, x: prior.by };
    return { k: 'accuse', t: top.id, ...accuseWhy(g, i, top.id) };
  }
  const cop = g.claims.find((c) => c.role === 'police' && c.by !== i && g.players[c.by]?.alive && (op[c.by] ?? 0) < b * 0.6 && !said(c.by));
  if (cop) return { k: 'trust', t: cop.by, why: 'claimed' };
  const wrong = today(g).find((s) => s.by !== i && s.act.k === 'accuse' && s.act.t !== i && g.players[s.act.t]?.alive && (op[s.act.t] ?? 0) < b * 0.7 && !said(s.act.t));
  if (wrong?.act.k === 'accuse') return { k: 'doubt', t: wrong.act.t, x: wrong.by };
  const quiet = others.filter((p) => !today(g).some((s) => s.by === p.id));
  if (quiet.length && rand(g) < 0.7) return { k: 'ask', t: pick(g, quiet).id };
  return mine.length ? null : { k: 'idle' };
}

function mainAct(g: Game, i: number, asked: boolean): Act | null {
  const me = g.players[i] as Player;
  const claimed = g.claims.some((c) => c.by === i);
  const mine = today(g).filter((s) => s.by === i);
  if (me.role === 'police') {
    const found = g.checks.filter(([t, m]) => m && g.players[t]?.alive);
    // 마피아를 찾았거나, 누가 경찰을 사칭하면 바로 나선다
    const rival = g.claims.some((c) => c.role === 'police' && c.by !== i);
    if (!claimed && (found.length > 0 || rival || (g.day >= 3 && g.checks.length >= 2 && rand(g) < 0.5))) return { k: 'claim', role: 'police', res: g.checks.map(([t, m]) => [t, m]) };
    const f = found.find(([t]) => !mine.some((s) => accusedBy(s.act) === t));
    if (claimed && f) return { k: 'accuse', t: f[0], why: 'checked' };
  }
  return me.role === 'mafia' ? mafiaAct(g, i, asked) : townAct(g, i, asked);
}

/** "왜?"라고 물으면 지금 가장 의심하는 친구와 그 이유를 말한다 */
function explainAct(g: Game, i: number): Act {
  const me = g.players[i] as Player;
  if (me.role === 'mafia') {
    const last = [...today(g)].reverse().find((s) => s.by === i && accusedBy(s.act) !== null);
    const t = last ? accusedBy(last.act) : null;
    if (t !== null) return { k: 'accuse', t, ...accuseWhy(g, null, t) };
    return mafiaAct(g, i, true) ?? { k: 'idle' };
  }
  const op = opinion(g, i);
  const t = best(
    living(g).filter((p) => p.id !== i),
    (p) => op[p.id] ?? 0,
  );
  return t ? { k: 'accuse', t: t.id, ...accuseWhy(g, i, t.id) } : { k: 'idle' };
}

/** j가 t를 마피아 쪽으로 보는지 (마피아는 동료를 감싼다) */
function leans(g: Game, j: number, t: number): boolean {
  return isMafia(g, j) ? !isMafia(g, t) : (opinion(g, j)[t] ?? 0) > base(g) * 1.15;
}

/**
 * 이번에 AI들이 할 말을 정해서 기록하고 돌려준다.
 * open: 낮이 밝았을 때 / more: 더 들어 보기 / human: 사람이 말한 뒤 (의심받은 친구가 해명하고 다른 친구가 거든다)
 */
export function plan(g: Game, tr: Trigger): Said[] {
  const out: Said[] = [];
  const used = new Set<number>();
  let idle = 0;
  const speak = (p: Player | undefined, act: Act | null): void => {
    if (!p || used.has(p.id) || !act || out.length >= ROUND) return;
    if (act.k === 'idle' && idle++ > 0) return;
    used.add(p.id);
    out.push(record(g, p.id, act));
  };
  const someone = (score: (p: Player) => number = (p) => PERSONA[p.character].bold): Player | undefined =>
    best(
      living(g).filter((p) => !p.human && !used.has(p.id)),
      (p) => score(p) + rand(g),
    );
  const h = tr.k === 'human' ? g.players[tr.by] : undefined;
  if (tr.k === 'human' && h) {
    for (const act of tr.acts) {
      if (act.k === 'accuse' && g.players[act.t]?.alive && !g.players[act.t]?.human) {
        speak(g.players[act.t], defendAct(g, act.t));
        const j = someone();
        if (j) speak(j, leans(g, j.id, act.t) ? { k: 'agree', t: act.t, x: h.id } : { k: 'doubt', t: act.t, x: h.id });
      } else if (act.k === 'trust' && g.players[act.t]?.alive && !g.players[act.t]?.human) {
        const j = someone();
        if (j) speak(j, leans(g, j.id, act.t) ? { k: 'accuse', t: act.t, ...accuseWhy(g, j.role === 'mafia' ? null : j.id, act.t) } : { k: 'trust', t: act.t, ...trustWhy(g, j.id, act.t) });
      } else if (act.k === 'claim' && act.role !== 'citizen') {
        if (act.role === 'police')
          for (const [t, m] of act.res ?? []) {
            const p = g.players[t];
            if (!m || !p?.alive || p.human) continue;
            const fight = p.role === 'mafia' && !g.claims.some((c) => c.role === 'police' && isMafia(g, c.by)) && rand(g) < 0.5;
            speak(p, fight ? { k: 'claim', role: 'police', res: [[h.id, true]] } : defendAct(g, t));
          }
        const j = someone((p) => (p.role === 'police' || p.role === act.role ? 3 : 0) + PERSONA[p.character].bold);
        if (j) speak(j, leans(g, j.id, h.id) ? { k: 'accuse', t: h.id, ...accuseWhy(g, j.role === 'mafia' ? null : j.id, h.id) } : { k: 'trust', t: h.id, why: act.role === 'police' ? 'claimed' : 'gut' });
      }
    }
    if (tr.why !== null) {
      const p = g.players[tr.why];
      if (p?.alive && !p.human) speak(p, explainAct(g, p.id));
    }
    if (tr.ask)
      for (let k = 0; k < 2; k++) {
        const p = someone();
        speak(p, p ? mainAct(g, p.id, true) : null);
      }
    if (!out.length) {
      // 게임 얘기가 아니면: 불린 친구(없으면 한 명)가 대꾸하고, 가끔 다른 친구가 게임 얘기로 이어 간다
      const named = (tr.mentions ?? []).map((i) => g.players[i]).filter((p): p is Player => !!p && p.alive && !p.human);
      for (const p of named.length ? named.slice(0, 2) : [someone()]) speak(p, { k: 'chat', to: h.id });
      if (rand(g) < 0.5) {
        const p = someone();
        speak(p, p ? mainAct(g, p.id, false) : null);
      }
    }
    return out;
  }
  if (tr.k === 'open') {
    const died = g.deaths.find((d) => d.day === g.day && d.cause === 'night');
    speak(someone(), died ? { k: 'react', ev: 'died', t: died.who } : { k: 'react', ev: quietNight(g) ? 'calm' : 'saved' });
  }
  for (const p of living(g).filter((q) => !q.human && accusers(g, q.id).length > 0).slice(0, 2)) speak(p, defendAct(g, p.id));
  for (let k = 0; k < 6 && out.length < ROUND; k++) {
    const p = someone((q) => PERSONA[q.character].bold * 0.8 - today(g).filter((s) => s.by === q.id).length * 0.4);
    if (!p) break;
    const act = mainAct(g, p.id, false);
    if (act) speak(p, act);
    else used.add(p.id);
  }
  return out;
}

// ── 투표 ────────────────────────────────────────────────

export function aiVote(g: Game, i: number): number | null {
  const me = g.players[i] as Player;
  const others = living(g).filter((p) => p.id !== i);
  const h = heat(g);
  const hmax = Math.max(1, ...h);
  if (me.role === 'mafia') {
    const pub = suspicion(g, null);
    // 동료가 어차피 몰리면 같이 찍어서 시민인 척한다
    const mate = others.find((p) => p.role === 'mafia');
    if (mate && (h[mate.id] ?? 0) >= Math.ceil(others.length / 2) && rand(g) < 0.45) return mate.id;
    return (
      best(
        others.filter((p) => p.role !== 'mafia'),
        (p) => (pub[p.id] ?? 0) + (0.35 * (h[p.id] ?? 0)) / hmax + rand(g) * 0.12,
      )?.id ?? null
    );
  }
  if (me.role === 'police') {
    const f = g.checks.find(([t, m]) => m && g.players[t]?.alive);
    if (f) return f[0];
  }
  const op = opinion(g, i);
  const per = PERSONA[me.character];
  const cleared = new Set(me.role === 'police' ? g.checks.filter(([, m]) => !m).map(([t]) => t) : []);
  return (
    best(
      others.filter((p) => !cleared.has(p.id)),
      (p) => (op[p.id] ?? 0) + ((0.15 + per.follow * 0.45) * (h[p.id] ?? 0)) / hmax + rand(g) * 0.04,
    )?.id ?? null
  );
}

/** 가장 많이 받은 한 명 (동점이거나 아무도 없으면 처형 없음) */
export function tally(g: Game, ballots: readonly Ballot[]): { out: number | null; counts: number[] } {
  const counts = g.players.map(() => 0);
  for (const b of ballots) if (b.t !== null) counts[b.t] = (counts[b.t] ?? 0) + 1;
  const max = Math.max(...counts);
  const top = counts.flatMap((c, i) => (c === max ? [i] : []));
  return { out: max > 0 && top.length === 1 ? (top[0] as number) : null, counts };
}

export function resolveVote(g: Game, ballots: readonly Ballot[]): number | null {
  g.votes.push(...ballots);
  const { out } = tally(g, ballots);
  const p = out === null ? undefined : g.players[out];
  if (p) {
    p.alive = false;
    g.deaths.push({ day: g.day, who: p.id, cause: 'vote', role: p.role });
  }
  g.winner = winnerOf(g);
  if (g.winner) g.phase = 'over';
  else {
    g.day += 1;
    g.phase = 'night';
  }
  return p ? p.id : null;
}

/** 처형당한 AI의 마지막 말 (시민이면 가장 의심하던 친구를 남긴다) */
export function lastAct(g: Game, i: number): Act {
  const me = g.players[i] as Player;
  if (me.role === 'mafia') return { k: 'last', role: 'mafia' };
  const op = opinion(g, i);
  const t = best(
    living(g).filter((p) => p.id !== i),
    (p) => op[p.id] ?? 0,
  );
  return { k: 'last', role: me.role, t: t?.id };
}

// ── 밤 ──────────────────────────────────────────────────

export interface NightPlan {
  kill: number | null;
  save: number | null;
  check: number | null;
}

/** 마피아가 노릴 친구: 경찰이라고 밝힌 친구, 우리를 의심하던 친구 */
export function killChoice(g: Game): number | null {
  const cops = new Set(g.claims.filter((c) => c.role === 'police').map((c) => c.by));
  const docs = new Set(g.claims.filter((c) => c.role === 'doctor').map((c) => c.by));
  const threat = (p: Player): number => {
    // 경찰은 의사가 지킬 수도 있어서 반반으로 노린다
    let s = rand(g) * 0.8 + (cops.has(p.id) ? (rand(g) < 0.5 ? 2.5 : 1.2) : 0) + (docs.has(p.id) ? 0.9 : 0);
    for (const x of g.said) {
      const t = accusedBy(x.act);
      if (x.by === p.id && t !== null && isMafia(g, t)) s += x.day >= g.day - 1 ? 0.6 : 0.3;
    }
    for (const v of g.votes) if (v.by === p.id && v.t !== null && isMafia(g, v.t)) s += 0.35;
    return s;
  };
  return (
    best(
      living(g).filter((p) => p.role !== 'mafia'),
      threat,
    )?.id ?? null
  );
}

function saveChoice(g: Game, d: number): number {
  const op = opinion(g, d);
  const cop = g.claims.filter((c) => c.role === 'police' && c.by !== d && g.players[c.by]?.alive).sort((a, b) => (op[a.by] ?? 0) - (op[b.by] ?? 0))[0];
  if (cop && (op[cop.by] ?? 0) < 0.4 && rand(g) < 0.75) return cop.by;
  if (rand(g) < 0.3) return d;
  return (
    best(
      living(g).filter((p) => p.id !== d),
      (p) => -(op[p.id] ?? 0) + rand(g) * 0.3,
    )?.id ?? d
  );
}

function checkChoice(g: Game, c: number): number | null {
  const op = opinion(g, c);
  return (
    best(
      living(g).filter((p) => p.id !== c && !g.checks.some(([t]) => t === p.id)),
      (p) => (op[p.id] ?? 0) + rand(g) * 0.15,
    )?.id ?? null
  );
}

/** AI들의 밤 행동 (사람이 맡은 자리는 비워 둔다 — 살아 있는 사람 마피아가 있으면 사람이 고른다) */
export function aiNight(g: Game): NightPlan {
  const ais = living(g).filter((p) => !p.human);
  const humanMafia = living(g).some((p) => p.human && p.role === 'mafia');
  const doc = ais.find((p) => p.role === 'doctor');
  const cop = ais.find((p) => p.role === 'police');
  return {
    kill: ais.some((p) => p.role === 'mafia') && !humanMafia ? killChoice(g) : null,
    save: doc ? saveChoice(g, doc.id) : null,
    check: cop ? checkChoice(g, cop.id) : null,
  };
}

export interface NightResult {
  died: number | null;
  saved: boolean;
  checked: [number, boolean] | null;
}

/** 8명 판(마피아 셋)은 첫날 밤에 마피아가 서로 얼굴만 익힌다 (안 그러면 마피아가 너무 쉽게 이긴다) */
export const quietNight = (g: Game): boolean => g.day === 1 && g.players.length === 8;

export function resolveNight(g: Game, n: NightPlan): NightResult {
  const victim = n.kill === null || quietNight(g) ? undefined : g.players[n.kill];
  const saved = !!victim && n.kill === n.save;
  let died: number | null = null;
  if (victim?.alive && !saved) {
    victim.alive = false;
    died = victim.id;
    g.deaths.push({ day: g.day, who: victim.id, cause: 'night', role: victim.role });
  }
  g.saved = n.save;
  let checked: [number, boolean] | null = null;
  if (n.check !== null && g.players[n.check]) {
    checked = [n.check, isMafia(g, n.check)];
    g.checks.push(checked);
  }
  g.winner = winnerOf(g);
  g.phase = g.winner ? 'over' : 'day';
  return { died, saved, checked };
}
