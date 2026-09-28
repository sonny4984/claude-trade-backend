/**
 * 불과 얼음 진행 — 물리 세계(world.ts)를 돌리는 고리와 화면·온라인 사이의 다리.
 *  · 혼자 하기: 한 사람이 불과 얼음을 번갈아 (↓·S 또는 "바꾸기")
 *  · 둘이 한 기기: 불은 방향키, 얼음은 WASD (터치는 양손 두 묶음)
 *  · 온라인: 방장이 불, 친구가 얼음. 몸 위치는 빠른 순간 메시지(fp), 사탕·레버·넘어짐은 확실한 메시지(fe).
 *    단계·다시 하기·통과는 방장이 판(세션)으로 알린다.
 * 물리 세계는 초당 120번 바뀌므로 zustand 밖(runtime)에 두고, 화면에는 HUD에 필요한 것만 올린다.
 */
import { create } from 'zustand';
import { LEVELS } from './levels';
import { parseLevel, type Element, type Pool } from './level';
import { NO_INPUT, cleared, newWorld, setPuppet, step, type Input, type WorldEvent, type WorldState } from './world';
import { isCharacterId, type CharacterId } from '../characters/roster';
import { useGame } from '../store/game';
import { readJSON, writeJSON } from '../store/storage';
import { sfx } from '../audio/sfx';
import { buzz } from '../ui/haptics';
import { bridge, gameApis, onRealtime, type OnlineInfo, type TableDoc } from '../net/bridge';

export const DT = 1 / 120;
export type FireIceMode = 'solo' | 'local' | 'online';

export interface FireIceConfig {
  readonly mode: FireIceMode;
  /** [불, 얼음] */
  readonly names: readonly [string, string];
  readonly characters: readonly [CharacterId, CharacterId];
}

export interface FireIceResult {
  readonly time: number;
  readonly gems: number;
  readonly total: number;
  readonly stars: number;
  /** 이 기기의 기록을 넘었나 */
  readonly best: boolean;
}

export interface FireIceSession {
  readonly v: 1;
  readonly id: string;
  readonly mode: FireIceMode;
  readonly level: number;
  /** 다시 할 때마다 1씩 (온라인에서 둘이 같은 판인지 맞춰 보는 번호) */
  readonly attempt: number;
  readonly names: readonly [string, string];
  readonly characters: readonly [CharacterId, CharacterId];
  readonly status: 'playing' | 'cleared';
  readonly result: FireIceResult | null;
  readonly online?: OnlineInfo | null;
}

export interface LevelBest {
  readonly stars: number;
  readonly time: number;
  readonly gems: number;
}

type Progress = Readonly<Record<string, LevelBest>>;

interface FireIceStore {
  session: FireIceSession | null;
  overlay: null | 'menu' | 'clear';
  /** 혼자 하기: 지금 움직이는 쪽 */
  control: Element;
  gems: number;
  time: number;
  /** 넘어진 순간 (잠깐 보여 주고 다시 시작) */
  oops: { readonly el: Element; readonly cause: Pool } | null;
  atDoor: Readonly<Record<Element, boolean>>;
  progress: Progress;
  waiting: boolean;
  start: (cfg: FireIceConfig, level: number) => void;
  playLevel: (level: number) => void;
  restart: () => void;
  next: () => void;
  quit: () => void;
  swap: () => void;
  openMenu: () => void;
  closeOverlay: () => void;
  startOnline: (table: TableDoc, info: OnlineInfo) => void;
  applyRemote: (seat: number, payload: unknown) => boolean;
  adoptRemote: (payload: unknown, events: readonly unknown[], info: OnlineInfo) => void;
  seatToAi: (seat: number) => boolean;
  setWaiting: (v: boolean) => void;
  /** 화면 고리가 매 프레임 부른다 (실제 흐른 초) */
  frame: (dtReal: number) => void;
}

const PROGRESS_KEY = 'lumina.fireice.v1';
const SETUP_KEY = 'lumina.fireice-setup.v1';

/** 조작 상태 — 키보드와 터치가 여기에 적고, 고리가 읽는다 */
export const pad = {
  keys: new Set<string>(),
  touch: { fire: { left: false, right: false, jump: false }, ice: { left: false, right: false, jump: false } } as Record<Element, { left: boolean; right: boolean; jump: boolean }>,
};

interface PuppetTrack {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  ground: boolean;
  alive: boolean;
  door: boolean;
  /** 친구가 타고 있는 발판 번호(-1 없음)와 그 발판에서의 자리 — 발판은 내 화면의 것에 붙여 그린다 */
  pl: number;
  rx: number;
  ry: number;
  at: number;
}

export type FxType = 'gem' | 'jump' | 'dead' | 'land' | 'bounce' | 'key' | 'unlock' | 'warp';
/** 물리 세계와 고리 상태 (zustand 밖) */
export const runtime: {
  world: WorldState | null;
  acc: number;
  hudAt: number;
  sendAt: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  puppet: PuppetTrack | null;
  /** 마지막으로 보낸 내 몸 (가만히 있으면 덜 보내려고) */
  lastSent: string;
  /** 화면 효과 대기열 (사탕 톡, 점프 먼지 …) — 화면이 매 프레임 비운다 */
  fx: { readonly type: FxType; readonly x: number; readonly y: number; readonly el: Element }[];
} = { world: null, acc: 0, hudAt: 0, sendAt: 0, restartTimer: null, puppet: null, lastSent: '', fx: [] };

export const levelCount = LEVELS.length;
export const levelDef = (i: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))] as (typeof LEVELS)[number];

export function starsFor(level: number, time: number, gems: number, total: number): number {
  return 1 + (gems >= total ? 1 : 0) + (time <= levelDef(level).par ? 1 : 0);
}

function loadProgress(): Progress {
  const raw = readJSON<Record<string, LevelBest>>(PROGRESS_KEY);
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, LevelBest> = {};
  for (const def of LEVELS) {
    const b = raw[def.id];
    if (b && typeof b.stars === 'number' && typeof b.time === 'number') out[def.id] = { stars: Math.max(1, Math.min(3, b.stars | 0)), time: b.time, gems: typeof b.gems === 'number' ? b.gems : 0 };
  }
  return out;
}

/** 그 단계를 열었나 (첫 단계, 또는 앞 단계를 통과) */
export function unlocked(progress: Progress, level: number): boolean {
  if (level <= 0) return true;
  const prev = LEVELS[level - 1];
  return !!prev && !!progress[prev.id];
}

/** 처음 할 단계: 아직 못 깬 첫 단계 */
export function firstOpenLevel(progress: Progress): number {
  const k = LEVELS.findIndex((d) => !progress[d.id]);
  return k < 0 ? 0 : k;
}

export function loadFireIceSetup(): FireIceConfig | null {
  const raw = readJSON<FireIceConfig>(SETUP_KEY);
  if (!raw || !Array.isArray(raw.names) || !Array.isArray(raw.characters)) return null;
  const name = (x: unknown, d: string): string => (typeof x === 'string' && x.trim() ? x.slice(0, 12) : d);
  const ch = (x: unknown, d: CharacterId): CharacterId => (isCharacterId(x) ? x : d);
  return {
    mode: raw.mode === 'local' ? 'local' : 'solo',
    names: [name(raw.names[0], 'Fire'), name(raw.names[1], 'Ice')],
    characters: [ch(raw.characters[0], 'hwigi'), ch(raw.characters[1], 'ginini')],
  };
}

/** 이 기기가 움직이는 쪽 (온라인: 방장 불, 친구 얼음) */
export function myElement(s: FireIceSession | null): Element | null {
  if (!s?.online) return null;
  return s.online.mySeat === 0 ? 'fire' : 'ice';
}

function keyInput(left: string[], right: string[], jump: string[]): Input {
  const k = pad.keys;
  return { left: left.some((c) => k.has(c)), right: right.some((c) => k.has(c)), jump: jump.some((c) => k.has(c)) };
}

function or(a: Input, b: Input): Input {
  return { left: a.left || b.left, right: a.right || b.right, jump: a.jump || b.jump };
}

const ARROWS = keyInput.bind(null, ['ArrowLeft'], ['ArrowRight'], ['ArrowUp']);
const WASD = keyInput.bind(null, ['KeyA'], ['KeyD'], ['KeyW']);
const ANY = keyInput.bind(null, ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'], ['ArrowUp', 'KeyW', 'Space']);

function currentInputs(s: FireIceSession, control: Element): Record<Element, Input> {
  if (s.mode === 'local') return { fire: or(ARROWS(), pad.touch.fire), ice: or(WASD(), pad.touch.ice) };
  const mine = s.mode === 'online' ? (myElement(s) ?? 'fire') : control;
  // 혼자·온라인: 터치는 한 묶음(fire 칸)만 쓴다
  const inp = or(ANY(), pad.touch.fire);
  return mine === 'fire' ? { fire: inp, ice: NO_INPUT } : { fire: NO_INPUT, ice: inp };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

export const useFireIce = create<FireIceStore>((set, get) => {
  const resetWorld = (s: FireIceSession): void => {
    const w = newWorld(parseLevel(levelDef(s.level)));
    const mine = myElement(s);
    if (mine) w.puppets.add(mine === 'fire' ? 'ice' : 'fire');
    runtime.world = w;
    runtime.acc = 0;
    runtime.hudAt = 0;
    runtime.sendAt = 0;
    runtime.puppet = null;
    runtime.lastSent = '';
    runtime.fx = [];
    if (runtime.restartTimer) clearTimeout(runtime.restartTimer);
    runtime.restartTimer = null;
    set({ gems: 0, time: 0, oops: null, atDoor: { fire: false, ice: false } });
  };

  const publish = (s: FireIceSession): void => {
    if (s.online?.role === 'host') bridge.publish?.('fireice', { ...s, online: null }, []);
  };

  const begin = (s: FireIceSession): void => {
    set({ session: s, overlay: s.status === 'cleared' ? 'clear' : null, waiting: false });
    resetWorld(s);
    if (useGame.getState().screen !== 'fireice') useGame.getState().go('fireice');
    sfx('shuffle');
  };

  const fresh = (cfg: FireIceConfig, level: number, online: OnlineInfo | null = null): FireIceSession => ({
    v: 1,
    id: `f${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`,
    mode: cfg.mode,
    level: Math.max(0, Math.min(LEVELS.length - 1, level)),
    attempt: 1,
    names: cfg.names,
    characters: cfg.characters,
    status: 'playing',
    result: null,
    online,
  });

  /** 기록 남기기 — 결과(별)를 돌려준다 */
  const record = (s: FireIceSession, time: number, gems: number, total: number): FireIceResult => {
    const def = levelDef(s.level);
    const stars = starsFor(s.level, time, gems, total);
    const prev = get().progress[def.id];
    const best = !prev || stars > prev.stars || time < prev.time;
    const merged: LevelBest = prev ? { stars: Math.max(prev.stars, stars), time: Math.min(prev.time, time), gems: Math.max(prev.gems, gems) } : { stars, time, gems };
    const progress = { ...get().progress, [def.id]: merged };
    set({ progress });
    writeJSON(PROGRESS_KEY, progress);
    return { time, gems, total, stars, best };
  };

  const finish = (): void => {
    const s = get().session;
    const w = runtime.world;
    if (!s || !w || s.status !== 'playing') return;
    if (s.online?.role === 'guest') return;
    const gems = w.gems.filter(Boolean).length;
    const result = record(s, round(w.time), gems, w.gems.length);
    const next: FireIceSession = { ...s, status: 'cleared', result };
    set({ session: next });
    publish(next);
    sfx('win', { delay: 120 });
    buzz('success');
    setTimeout(() => {
      if (get().session?.id === next.id && get().session?.status === 'cleared') set({ overlay: 'clear' });
    }, 700);
  };

  /** 넘어짐 → 잠깐 뒤 다시 (온라인은 방장이 정한다) */
  const fallen = (el: Element, cause: Pool): void => {
    const s = get().session;
    if (!s || s.status !== 'playing') return;
    set({ oops: { el, cause } });
    sfx('sadsqueak', { pitch: el === 'fire' ? 0.9 : 1.1 });
    buzz('error');
    if (runtime.restartTimer) return;
    const attempt = s.attempt;
    runtime.restartTimer = setTimeout(
      () => {
        runtime.restartTimer = null;
        const cur = get().session;
        if (!cur || cur.id !== s.id || cur.attempt !== attempt || cur.status !== 'playing') return;
        if (cur.online?.role === 'guest') {
          // 방장이 다시 시작을 안 알려 오면 부탁한다
          bridge.send?.('fireice', { type: 'restart', attempt });
          return;
        }
        get().restart();
      },
      s.online?.role === 'guest' ? 2600 : 1300,
    );
  };

  const onEvents = (s: FireIceSession, events: readonly WorldEvent[]): void => {
    const online = !!s.online;
    const w = runtime.world;
    const fx = (type: FxType, el: Element, x: number, y: number): void => {
      if (runtime.fx.length < 40) runtime.fx.push({ type, el, x, y });
    };
    const feet = (el: Element): [number, number] => {
      const b = w?.bodies[el];
      return b ? [b.x + 0.34, b.y + 0.86] : [0, 0];
    };
    for (const e of events) {
      if (e.type === 'gem') {
        const g = w?.level.gems[e.id];
        if (g) fx('gem', e.el, g.x + 0.5, g.y + 0.5);
      } else if (e.type === 'jump' || e.type === 'land' || e.type === 'dead') fx(e.type, e.el, ...feet(e.el));
      else if (e.type === 'bounce') fx('bounce', e.el, e.x, e.y);
      else if (e.type === 'teleport') fx('warp', e.el, e.x + 0.5, e.y + 0.5);
      else if (e.type === 'key' || e.type === 'unlock') {
        const c = e.type === 'key' ? w?.level.keys[e.id] : w?.level.locks[e.id];
        if (c) fx(e.type, e.el, c.x + 0.5, c.y + 0.5);
      }
      switch (e.type) {
        case 'gem':
          sfx('pop', { pitch: e.el === 'fire' ? 1.15 : 1.35 });
          buzz('tap');
          if (online) bridge.emit?.('fe', { a: s.attempt, k: 'gem', id: e.id });
          break;
        case 'lever':
          sfx('slide');
          if (online) bridge.emit?.('fe', { a: s.attempt, k: 'lever', id: e.id, on: e.on });
          break;
        case 'button':
          if (e.on) sfx('tick');
          break;
        case 'jump':
          sfx('squeak', { pitch: e.el === 'fire' ? 0.92 : 1.08 });
          break;
        case 'bounce':
          sfx('wheek', { pitch: e.el === 'fire' ? 0.92 : 1.08 });
          buzz('tap');
          break;
        case 'key':
        case 'unlock':
          sfx(e.type === 'key' ? 'meld' : 'commit', { pitch: 1.2 });
          buzz('tap');
          if (online) bridge.emit?.('fe', { a: s.attempt, k: e.type, id: e.id });
          break;
        case 'teleport':
          sfx('wheek', { pitch: e.el === 'fire' ? 1.25 : 1.4 });
          break;
        case 'gate':
          sfx('slide', { pitch: e.open ? 1.3 : 0.8 });
          break;
        case 'door':
          if (e.in) sfx('hint');
          break;
        case 'dead':
          if (online) bridge.emit?.('fe', { a: s.attempt, k: 'dead', el: e.el, cause: e.cause });
          fallen(e.el, e.cause);
          break;
        default:
          break;
      }
    }
  };

  const sendBody = (s: FireIceSession, w: WorldState): void => {
    const mine = myElement(s);
    if (!mine) return;
    const b = w.bodies[mine];
    const plat = b.ground >= 0 ? w.plats[b.ground] : undefined;
    const msg = { a: s.attempt, x: round(b.x), y: round(b.y), vx: round(b.vx), vy: round(b.vy), f: b.face, g: b.ground !== -2 ? 1 : 0, al: b.alive ? 1 : 0, d: b.atDoor ? 1 : 0, pl: plat ? b.ground : -1, rx: plat ? round(b.x - plat.x) : 0, ry: plat ? round(b.y - plat.y) : 0 };
    const sig = `${msg.x},${msg.y},${msg.f},${msg.g},${msg.al},${msg.d}`;
    // 공개 중계 서버에 무리 없게 초당 12번까지, 가만히 있으면 1초에 한 번만
    const since = w.time - runtime.sendAt;
    if (since < 1 / 12 && runtime.lastSent !== '') return;
    if (sig === runtime.lastSent && since < 1) return;
    runtime.lastSent = sig;
    runtime.sendAt = w.time;
    bridge.emit?.('fp', msg, true);
  };

  /** 받은 상대 몸을 부드럽게 따라가게 (조금 앞질러 예측) */
  const drivePuppet = (s: FireIceSession, w: WorldState, dt: number): void => {
    const mine = myElement(s);
    const p = runtime.puppet;
    if (!mine || !p) return;
    const el: Element = mine === 'fire' ? 'ice' : 'fire';
    const b = w.bodies[el];
    const ahead = Math.min(0.15, (performance.now() - p.at) / 1000);
    // 발판에 탔으면 내 화면의 발판 위치에 붙인다 (늦게 온 위치 때문에 발판에 파묻히거나 떠 보이지 않게)
    const plat = p.pl >= 0 ? w.plats[p.pl] : undefined;
    const tx = (plat ? plat.x + p.rx : p.x) + p.vx * ahead;
    const ty = plat ? plat.y + p.ry : p.y + (p.ground ? 0 : p.vy * ahead);
    const k = Math.min(1, dt * 18);
    const far = Math.abs(tx - b.x) + Math.abs(ty - b.y) > 2.5;
    setPuppet(w, el, { x: far ? tx : b.x + (tx - b.x) * k, y: far || plat ? ty : b.y + (ty - b.y) * k, vx: p.vx, vy: p.vy, face: p.face, ground: p.ground, alive: p.alive, door: p.door });
    if (plat) b.ground = p.pl;
  };

  // 온라인: 친구 몸 위치(빠름)와 사탕·레버·넘어짐(확실)
  onRealtime('fp', (seat, data) => {
    const s = get().session;
    const d = data as Record<string, unknown> | null;
    if (!s?.online || !d || seat === s.online.mySeat || d.a !== s.attempt) return;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const pl = typeof d.pl === 'number' && Number.isInteger(d.pl) && d.pl >= 0 && d.pl < (runtime.world?.plats.length ?? 0) ? d.pl : -1;
    runtime.puppet = { x: num(d.x), y: num(d.y), vx: num(d.vx), vy: num(d.vy), face: d.f === -1 ? -1 : 1, ground: d.g === 1, alive: d.al !== 0, door: d.d === 1, pl, rx: num(d.rx), ry: num(d.ry), at: performance.now() };
  });
  onRealtime('fe', (seat, data) => {
    const s = get().session;
    const w = runtime.world;
    const d = data as Record<string, unknown> | null;
    if (!s?.online || !w || !d || seat === s.online.mySeat || d.a !== s.attempt || s.status !== 'playing') return;
    const id = typeof d.id === 'number' ? d.id : -1;
    if (d.k === 'gem' && id >= 0 && id < w.gems.length && !w.gems[id]) {
      w.gems[id] = true;
      sfx('pop', { pitch: 1.25 });
      set({ gems: w.gems.filter(Boolean).length });
    } else if (d.k === 'lever' && id >= 0 && id < w.levers.length && typeof d.on === 'boolean') {
      if (w.levers[id] !== d.on) sfx('slide');
      w.levers[id] = d.on;
    } else if (d.k === 'key' && id >= 0 && id < w.keysGot.length && !w.keysGot[id]) {
      w.keysGot[id] = true;
      w.keyCount++;
      sfx('meld', { pitch: 1.2 });
    } else if (d.k === 'unlock' && id >= 0 && id < w.lockOpen.length && !w.lockOpen[id]) {
      w.lockOpen[id] = true;
      w.keyCount = Math.max(0, w.keyCount - 1);
      sfx('commit', { pitch: 1.2 });
    } else if (d.k === 'dead' && (d.el === 'fire' || d.el === 'ice') && (d.cause === 'L' || d.cause === 'W' || d.cause === 'G')) {
      const p = runtime.puppet;
      if (p) p.alive = false;
      fallen(d.el, d.cause);
    }
  });

  const frame = (dtReal: number): void => {
    const st = get();
    const s = st.session;
    const w = runtime.world;
    if (!s || !w) return;
    // 혼자·한 기기에선 메뉴를 열면 멈춘다 (온라인은 멈추지 않음)
    if (!s.online && st.overlay !== null) return;
    // 느린 기기에서도 실제 시간만큼 (한 프레임에 0.25초까지 따라잡기) — 온라인에서 둘의 시간이 맞게
    runtime.acc = Math.min(runtime.acc + Math.min(dtReal, 0.25), 0.3);
    const playing = s.status === 'playing';
    while (runtime.acc >= DT) {
      runtime.acc -= DT;
      if (s.online) drivePuppet(s, w, DT);
      const inputs = playing && !get().oops ? currentInputs(s, st.control) : { fire: NO_INPUT, ice: NO_INPUT };
      const t0 = w.time;
      const events = step(w, inputs, DT);
      // 통과한 뒤나 넘어진 동안에는 시계를 멈춘다
      if (!playing || get().oops) w.time = t0;
      if (events.length) onEvents(s, events);
      if (playing && !get().oops && s.online?.role !== 'guest' && cleared(w)) {
        finish();
        break;
      }
    }
    if (s.online && playing) sendBody(s, w);
    if (w.time - runtime.hudAt >= 0.2 || runtime.hudAt === 0) {
      runtime.hudAt = w.time || 0.001;
      const gems = w.gems.filter(Boolean).length;
      const atDoor = { fire: w.bodies.fire.atDoor, ice: w.bodies.ice.atDoor };
      const cur = get();
      if (cur.gems !== gems || Math.floor(cur.time) !== Math.floor(w.time) || cur.atDoor.fire !== atDoor.fire || cur.atDoor.ice !== atDoor.ice) set({ gems, time: w.time, atDoor });
    }
  };

  return {
    session: null,
    overlay: null,
    control: 'fire',
    gems: 0,
    time: 0,
    oops: null,
    atDoor: { fire: false, ice: false },
    progress: loadProgress(),
    waiting: false,

    start: (cfg, level) => {
      writeJSON(SETUP_KEY, cfg);
      set({ control: 'fire' });
      begin(fresh(cfg, level));
    },

    playLevel: (level) => {
      const s = get().session;
      if (!s) return;
      if (s.online?.role === 'guest') {
        bridge.send?.('fireice', { type: 'level', level });
        return;
      }
      const next: FireIceSession = { ...s, id: `f${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`, level: Math.max(0, Math.min(LEVELS.length - 1, level)), attempt: 1, status: 'playing', result: null };
      begin(next);
      publish(next);
    },

    restart: () => {
      const s = get().session;
      if (!s) return;
      if (s.online?.role === 'guest') {
        bridge.send?.('fireice', { type: 'restart', attempt: s.attempt });
        set({ overlay: null });
        return;
      }
      const next: FireIceSession = { ...s, attempt: s.attempt + 1, status: 'playing', result: null };
      set({ session: next, overlay: null });
      resetWorld(next);
      publish(next);
    },

    next: () => {
      const s = get().session;
      if (!s) return;
      if (s.level + 1 >= LEVELS.length) {
        get().quit();
        return;
      }
      get().playLevel(s.level + 1);
    },

    quit: () => {
      const s = get().session;
      if (runtime.restartTimer) clearTimeout(runtime.restartTimer);
      runtime.restartTimer = null;
      runtime.world = null;
      if (s?.online) bridge.leave?.();
      set({ session: null, overlay: null, oops: null, waiting: false });
      useGame.getState().go('home');
    },

    swap: () => {
      const s = get().session;
      if (!s || s.mode !== 'solo') return;
      set({ control: get().control === 'fire' ? 'ice' : 'fire' });
      sfx('button');
      buzz('tap');
    },

    openMenu: () => set({ overlay: 'menu' }),
    closeOverlay: () => set({ overlay: get().session?.status === 'cleared' ? 'clear' : null }),

    startOnline: (table, info) => {
      const seat = (i: number): { name: string; character: CharacterId } => ({ name: table.seats[i]?.name ?? `P${i + 1}`, character: table.seats[i]?.character ?? (i === 0 ? 'hwigi' : 'ginini') });
      const cfg: FireIceConfig = { mode: 'online', names: [seat(0).name, seat(1).name], characters: [seat(0).character, seat(1).character] };
      const s = fresh(cfg, firstOpenLevel(get().progress), info);
      begin(s);
      publish(s);
    },

    applyRemote: (seat, payload) => {
      const s = get().session;
      if (!s?.online || s.online.role !== 'host' || seat === s.online.mySeat || !payload || typeof payload !== 'object') return false;
      const p = payload as { type?: unknown; attempt?: unknown; level?: unknown };
      if (p.type === 'restart') {
        // 이미 다시 시작했으면 지금 판을 한 번 더 알린다
        if (typeof p.attempt === 'number' && p.attempt < s.attempt) publish(s);
        else get().restart();
        return true;
      }
      if (p.type === 'level' && typeof p.level === 'number' && Number.isInteger(p.level) && p.level >= 0 && p.level < LEVELS.length) {
        get().playLevel(p.level);
        return true;
      }
      return false;
    },

    adoptRemote: (payload, _events, info) => {
      const x = payload as Partial<FireIceSession> | null;
      if (!x || x.v !== 1 || typeof x.id !== 'string' || typeof x.level !== 'number' || typeof x.attempt !== 'number' || !Array.isArray(x.names) || !Array.isArray(x.characters)) return;
      if (!x.characters.every(isCharacterId)) return;
      const incoming: FireIceSession = {
        v: 1,
        id: x.id,
        mode: 'online',
        level: Math.max(0, Math.min(LEVELS.length - 1, x.level | 0)),
        attempt: x.attempt,
        names: [String(x.names[0] ?? ''), String(x.names[1] ?? '')],
        characters: [x.characters[0] as CharacterId, x.characters[1] as CharacterId],
        status: x.status === 'cleared' ? 'cleared' : 'playing',
        result: x.result ?? null,
        online: info,
      };
      const prev = get().session;
      const sameRun = prev?.id === incoming.id && prev.attempt === incoming.attempt && !!runtime.world;
      if (!sameRun) {
        begin(incoming);
        return;
      }
      if (incoming.status === 'cleared' && prev.status !== 'cleared') {
        // 방장이 통과를 알림 — 이 기기에도 기록
        const w = runtime.world;
        const r = incoming.result;
        const result = r ? record(incoming, r.time, w ? w.gems.filter(Boolean).length : r.gems, r.total) : null;
        set({ session: { ...incoming, result: result ?? incoming.result } });
        sfx('win', { delay: 120 });
        buzz('success');
        setTimeout(() => {
          if (get().session?.id === incoming.id && get().session?.status === 'cleared') set({ overlay: 'clear' });
        }, 700);
        return;
      }
      set({ session: incoming });
    },

    // 불과 얼음은 사람 둘이 해야 하는 게임 — AI로 바꿀 수 없다
    seatToAi: () => false,

    setWaiting: (v) => set({ waiting: v }),
    frame,
  };
});

gameApis.fireice = () => useFireIce.getState();

// 시험용 손잡이 — 내 컴퓨터(localhost)에서 열었을 때만 (e2e가 캔버스 속 위치를 읽는다)
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  (window as unknown as { __fireice?: unknown }).__fireice = { runtime, store: useFireIce };
}
