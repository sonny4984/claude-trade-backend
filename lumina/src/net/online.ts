/**
 * 온라인 대전 — 방을 만들고 초대 링크(카카오톡 등)를 보내면, 친구가 누르자마자 같은 방에 앉는다.
 * 로그인·설치·공유 설정이 필요 없다. 연결은 공개 MQTT 중계 서버(relay.ts)로, 내용은 방 코드로 암호화한다.
 *
 * 구조 (방장 중심):
 *  · 방장이 판을 돌린다. 규칙 판정·AI 차례·점수는 모두 방장 기기의 커널이 한다.
 *  · 판 상태는 방 문서 하나(보관 메시지) — 늦게 들어오거나 새로고침해도 여기서 받는다.
 *  · 참가자는 자기 차례에 둔 수만 'act'로 보낸다. 방장이 커널로 검증해 적용하고 문서를 새로 쓴다(seq + 1).
 *    틀린 수는 reject로 알려 준다.
 *  · 누가 들어와 있는지는 presence(이름·캐릭터·기기 번호)로 본다. 로비에서 방장이 자리를 정한다.
 *  · 실시간 게임(불과 얼음)은 'rt' 순간 메시지로 위치를 주고받는다 (bridge.emit / onRealtime).
 *  · 한계: 방 코드를 아는 사람은 판 전체를 풀어 볼 수 있다 (친구끼리 전제).
 */
import { create } from 'zustand';
import { ALL_CHARACTERS, CHARACTER_ORDER, isCharacterId, type CharacterId } from '../characters/roster';
import type { AiLevel } from '../game/types';
import { readJSON, removeKey, writeJSON } from '../store/storage';
import { useGame } from '../store/game';
import { useCoda } from '../coda/store';
import { useSettings } from '../store/settings';
import { translate } from '../i18n';
import { sfx } from '../audio/sfx';
import { RelayRoom, relaySupported } from './relay';
import type { DocRef, NamedRoom, PeersChange, RoomMessage, RoomPeer } from './types';
import { GAME_SEATS, bridge, gameApis, isOnlineGame, type OnlineGame, type OnlineGameApi, type OnlineInfo, type TableDoc, type TableSeat } from './bridge';
import { clearInviteFromUrl } from './site';

export interface OnlineProfile {
  readonly name: string;
  readonly character: CharacterId;
}

export interface PeerInfo {
  readonly peer: string;
  readonly name: string;
  readonly character: CharacterId;
  readonly role: 'host' | 'guest' | 'other';
  readonly me: boolean;
}

type Status = 'idle' | 'working' | 'unavailable' | 'lobby' | 'playing' | 'closed';

interface OnlineStore {
  status: Status;
  /** online.err.* 키 */
  error: string | null;
  role: 'host' | 'guest' | null;
  code: string | null;
  /** 방이 열린 중계 서버 번호 (초대 링크에 적는다) */
  broker: number;
  game: OnlineGame;
  profile: OnlineProfile;
  myPeer: string | null;
  table: TableDoc | null;
  peers: readonly PeerInfo[];
  connected: boolean;
  /** 참가자: 방장에게 보낸 수의 답을 기다리는 중 */
  sending: boolean;
  /** 초대 링크로 들어왔을 때 (아직 입장 전) */
  invite: { code: string; broker?: number } | null;
  setProfile: (p: Partial<OnlineProfile>) => void;
  setGame: (g: OnlineGame) => void;
  setInvite: (inv: { code: string; broker?: number } | null) => void;
  check: () => Promise<boolean>;
  create: () => Promise<void>;
  join: (code: string, broker?: number) => Promise<void>;
  /** 새로고침·앱 전환 뒤 마지막 방에 다시 들어가기 (방장이면 판을 이어서 돌린다) */
  resume: () => Promise<void>;
  leave: () => Promise<void>;
  addAi: (level: AiLevel) => void;
  removeSeat: (i: number) => void;
  setLevel: (i: number, level: AiLevel) => void;
  setJokers: (on: boolean) => void;
  replaceWithAi: (i: number) => void;
  start: () => void;
  clearError: () => void;
}

const KEY = 'lumina.online.v1';
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
/** 방 코드 길이 — 손으로 칠 수 있게 짧게, 남이 우연히 맞히기는 어렵게 */
export const CODE_LENGTH = 6;

export function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let s = '';
  for (const b of bytes) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
}

/** 이름에 섞인 제어·방향 문자 (문자열로 만들어 파일에 날 문자가 들어가지 않게) */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f]', 'g');
const cleanName = (v: unknown): string =>
  (typeof v === 'string' ? v : '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, 12) || '?';
const cleanChar = (v: unknown): CharacterId => (isCharacterId(v) ? v : 'hwigi');
const cleanPid = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z0-9]{6,24}$/.test(v) ? v : undefined);
const tr = (path: string, params?: Record<string, string | number>): string => translate(useSettings.getState().lang, path, params);
/** 문서의 JSON 문자열 칸 풀기 (깨졌으면 기본값) */
function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
/** 중계 서버 메시지 하나에 넉넉히 들어갈 크기 */
const MAX_DOC_BYTES = 200 * 1024;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 루미큐브·다빈치 코드는 여기서 등록 (오목·불과 얼음은 각자 저장소에서)
gameApis.lumina = () => useGame.getState();
gameApis.coda = () => useCoda.getState();

function api(g: OnlineGame): OnlineGameApi | null {
  return gameApis[g]?.() ?? null;
}

/** 이 기기의 플레이어 번호 (새로고침해도 같은 자리를 되찾는 데 쓴다) */
function playerId(): string {
  const raw = readJSON<{ pid?: string }>(KEY);
  const ok = cleanPid(raw?.pid);
  if (ok) return ok;
  const pid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  writeJSON(KEY, { ...(raw ?? {}), pid });
  return pid;
}

// ─────────────────────────────── 실행 중 연결 ───────────────────────────────

const rt: {
  relay: RelayRoom | null;
  room: NamedRoom | null;
  ref: DocRef | null;
  unsubs: (() => void)[];
  pending: TableDoc | null;
  writing: boolean;
  lastSeq: number;
  lastSeat: number;
  seen: Map<string, string>;
  sending: { nonce: string; payload: unknown; game: OnlineGame; seq: number; tries: number } | null;
  retry: ReturnType<typeof setTimeout> | null;
} = { relay: null, room: null, ref: null, unsubs: [], pending: null, writing: false, lastSeq: -1, lastSeat: -2, seen: new Map(), sending: null, retry: null };

function loadProfile(): OnlineProfile {
  const raw = readJSON<{ profile?: Partial<OnlineProfile> }>(KEY);
  const lang = useSettings.getState().lang;
  return {
    name: cleanName(raw?.profile?.name ?? (lang === 'ko' ? '나' : 'Me')),
    character: cleanChar(raw?.profile?.character ?? 'moka'),
  };
}

export function savedRoom(): { code: string; role: 'host' | 'guest'; game: OnlineGame; broker?: number } | null {
  const raw = readJSON<{ code?: string; role?: string; game?: string; broker?: number }>(KEY);
  if (!raw?.code || (raw.role !== 'host' && raw.role !== 'guest')) return null;
  const game = isOnlineGame(raw.game) ? raw.game : 'lumina';
  return { code: normalizeCode(raw.code), role: raw.role, game, ...(Number.isInteger(raw.broker) ? { broker: raw.broker } : {}) };
}

async function waitMyPeer(room: NamedRoom): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const me = room.peers().find((p) => p.sameTab);
    if (me) return me.peer;
    await sleep(100);
  }
  return null;
}

function peerInfo(p: RoomPeer): PeerInfo {
  const pr = p.presence ?? {};
  const role = pr.role === 'host' || pr.role === 'guest' ? pr.role : 'other';
  return { peer: p.peer, name: cleanName(pr.name), character: cleanChar(pr.character), role, me: p.sameTab };
}

export const useOnline = create<OnlineStore>((set, get) => {
  /** 방장: 문서 쓰기는 한 번에 하나, 밀린 건 마지막 것만 */
  const write = (doc: TableDoc): void => {
    rt.pending = doc;
    if (!rt.writing) void flush();
  };
  const flush = async (): Promise<void> => {
    rt.writing = true;
    while (rt.pending && rt.ref) {
      const d = rt.pending;
      rt.pending = null;
      try {
        await rt.ref.set(d as unknown as Record<string, unknown>);
      } catch {
        // 끊겨 있으면 다시 붙을 때 최신 문서를 다시 쓴다 (watchConnection)
        set({ error: 'online.err.write' });
      }
    }
    rt.writing = false;
  };

  const cleanup = async (): Promise<void> => {
    rt.unsubs.forEach((u) => {
      try {
        u();
      } catch {
        /* noop */
      }
    });
    rt.unsubs = [];
    if (rt.retry !== null) clearTimeout(rt.retry);
    rt.retry = null;
    rt.sending = null;
    const room = rt.room;
    rt.room = null;
    rt.relay = null;
    rt.ref = null;
    rt.lastSeq = -1;
    rt.lastSeat = -2;
    rt.seen.clear();
    bridge.publish = null;
    bridge.send = null;
    bridge.leave = null;
    bridge.emit = null;
    if (room) await room.leave().catch(() => undefined);
  };

  const remember = (): void => {
    const { code, role, game, profile, broker } = get();
    writeJSON(KEY, { ...(readJSON<Record<string, unknown>>(KEY) ?? {}), code, role, game, profile, broker });
  };

  const forget = (): void => {
    const raw = readJSON<Record<string, unknown>>(KEY) ?? {};
    removeKey(KEY);
    writeJSON(KEY, { profile: get().profile, ...(raw.pid ? { pid: raw.pid } : {}) });
  };

  // ─────────── 방장 ───────────

  const hostSeatOf = (t: TableDoc): number => t.seats.findIndex((s) => s.peer === get().myPeer && s.kind === 'human');

  const onPeersHost = (change: PeersChange): void => {
    const viewers = change.peers.filter((p) => p.kind === 'viewer');
    set({ peers: viewers.map(peerInfo) });
    let t = get().table;
    if (!t || t.status === 'closed') return;
    const present = new Set(viewers.map((p) => p.peer));
    let seats: TableSeat[] = t.seats.map((s) => ({ ...s }));
    let changed = false;
    const me = get().myPeer;
    const max = GAME_SEATS[t.game].max;
    if (t.status === 'lobby') {
      const before = seats.length;
      seats = seats.filter((s) => s.kind === 'ai' || s.peer === me || (s.peer !== null && present.has(s.peer)));
      if (seats.length !== before) changed = true;
      for (const p of viewers) {
        const pr = p.presence ?? {};
        if (p.sameTab || pr.role !== 'guest' || pr.code !== t.code) continue;
        const name = cleanName(pr.name);
        const pid = cleanPid(pr.pid);
        let character = cleanChar(pr.character);
        const i = seats.findIndex((s) => s.peer === p.peer);
        const used = new Set(seats.filter((_, k) => k !== i).map((x) => x.character));
        if (used.has(character)) character = CHARACTER_ORDER.find((c) => !used.has(c)) ?? character;
        if (i >= 0) {
          const s = seats[i] as TableSeat;
          if (s.name !== name || s.character !== character) {
            seats[i] = { ...s, name, character };
            changed = true;
          }
        } else if (seats.length < max) {
          seats.push({ kind: 'human', peer: p.peer, name, character, ...(pid ? { pid } : {}) });
          changed = true;
          sfx('pop');
        } else if (GAME_SEATS[t.game].ai) {
          // 자리가 꽉 찼으면 AI 자리 하나를 사람에게 내준다
          const ai = seats.findIndex((s) => s.kind === 'ai');
          if (ai >= 0) {
            seats[ai] = { kind: 'human', peer: p.peer, name, character, ...(pid ? { pid } : {}) };
            changed = true;
            sfx('pop');
          }
        }
      }
    } else {
      seats = seats.map((s) => {
        if (s.kind !== 'human' || s.peer === me) return s;
        const away = !s.peer || !present.has(s.peer);
        if (!!s.away === away) return s;
        changed = true;
        return { ...s, away };
      });
      // 새로고침한 친구: 같은 기기 번호(없으면 같은 이름)의 빈 자리를 되찾는다
      for (const p of viewers) {
        const pr = p.presence ?? {};
        if (p.sameTab || pr.role !== 'guest' || pr.code !== t.code || seats.some((s) => s.peer === p.peer)) continue;
        const name = cleanName(pr.name);
        const pid = cleanPid(pr.pid);
        let i = pid ? seats.findIndex((s) => s.kind === 'human' && s.pid === pid && s.peer !== me) : -1;
        if (i < 0) i = seats.findIndex((s) => s.kind === 'human' && s.away && s.name === name);
        if (i >= 0) {
          seats[i] = { ...(seats[i] as TableSeat), peer: p.peer, away: false };
          changed = true;
        }
      }
    }
    if (changed) {
      t = { ...t, seats, at: Date.now() };
      set({ table: t });
      write(t);
    }
  };

  const onActHost = (msg: RoomMessage): void => {
    const t = get().table;
    if (!t || t.status !== 'playing' || msg.sameTab) return;
    const seat = t.seats.findIndex((s) => s.kind === 'human' && s.peer === msg.peer);
    if (seat < 0 || seat === hostSeatOf(t)) return;
    const d = msg.data as { nonce?: unknown; payload?: unknown } | undefined;
    if (!d || typeof d.nonce !== 'string' || d.nonce.length > 20) return;
    if (rt.seen.get(msg.peer) === d.nonce) {
      // 같은 수를 다시 보냄(응답을 못 받음) — 지금 문서를 다시 써서 알려 준다
      write({ ...t, at: Date.now() });
      return;
    }
    rt.seen.set(msg.peer, d.nonce);
    const ok = api(t.game)?.applyRemote(seat, d.payload) ?? false;
    if (!ok) {
      const nt: TableDoc = { ...t, reject: { peer: msg.peer, nonce: d.nonce }, at: Date.now() };
      set({ table: nt });
      write(nt);
    }
  };

  const hostPublish = (game: OnlineGame, payload: unknown, events: readonly unknown[]): void => {
    const t = get().table;
    if (!t || get().role !== 'host' || t.game !== game) return;
    const body = JSON.stringify(payload);
    let evs = JSON.stringify(events.slice(-40));
    if (body.length + evs.length > MAX_DOC_BYTES) evs = '[]';
    if (body.length > MAX_DOC_BYTES) {
      set({ error: 'online.err.write' });
      return;
    }
    const nt: TableDoc = { ...t, status: 'playing', seq: t.seq + 1, payload: body, events: evs, reject: null, at: Date.now() };
    set({ table: nt, status: 'playing' });
    write(nt);
    rt.room?.emit('sync', { seq: nt.seq }).catch(() => undefined);
  };

  // ─────────── 참가자 ───────────

  const adopt = (doc: TableDoc): void => {
    const me = get().myPeer;
    const mySeat = doc.seats.findIndex((s) => s.kind === 'human' && s.peer === me);
    if (doc.status !== 'playing' || !doc.payload || mySeat < 0) return;
    if (doc.seq <= rt.lastSeq && mySeat === rt.lastSeat) return;
    const fresh = doc.seq > rt.lastSeq;
    rt.lastSeq = doc.seq;
    rt.lastSeat = mySeat;
    if (rt.sending && fresh) {
      rt.sending = null;
      set({ sending: false });
    }
    const info: OnlineInfo = { code: doc.code, role: 'guest', mySeat };
    const payload = parse<unknown>(doc.payload, null);
    if (!payload) return;
    const events = fresh ? parse<unknown[]>(doc.events, []) : [];
    api(doc.game)?.adoptRemote(payload, events, info);
  };

  const onDocGuest = (doc: TableDoc | null): void => {
    if (!doc || doc.v !== 1 || !isOnlineGame(doc.game)) return;
    set({ table: doc, game: doc.game });
    if (doc.status === 'closed') {
      set({ status: 'closed' });
      return;
    }
    if (doc.reject && rt.sending && doc.reject.peer === get().myPeer && doc.reject.nonce === rt.sending.nonce) {
      rt.sending = null;
      set({ sending: false });
      useCoda.setState({ pending: null });
      useGame.getState().toastMsg(tr('online.err.rejected'), 'bad');
    }
    if (doc.status === 'playing') {
      if (get().status !== 'playing') set({ status: 'playing' });
      adopt(doc);
    } else if (get().status !== 'lobby') set({ status: 'lobby' });
  };

  const emitAct = (): void => {
    const s = rt.sending;
    if (!s || !rt.room) return;
    rt.room.emit('act', { nonce: s.nonce, payload: s.payload }).catch(() => undefined);
  };

  const guestSend = (game: OnlineGame, payload: unknown): void => {
    const t = get().table;
    if (!t || get().role !== 'guest' || t.game !== game) return;
    rt.sending = { nonce: Math.random().toString(36).slice(2, 12), payload, game, seq: t.seq, tries: 1 };
    set({ sending: true });
    emitAct();
    const retry = (): void => {
      const s = rt.sending;
      if (!s) return;
      if ((get().table?.seq ?? 0) > s.seq) {
        rt.sending = null;
        set({ sending: false });
        return;
      }
      if (s.tries >= 5) {
        rt.sending = null;
        set({ sending: false });
        useCoda.setState({ pending: null });
        useGame.getState().toastMsg(tr('online.err.slow'), 'warn');
        return;
      }
      s.tries++;
      emitAct();
      rt.retry = setTimeout(retry, 3000);
    };
    if (rt.retry !== null) clearTimeout(rt.retry);
    rt.retry = setTimeout(retry, 3000);
  };

  // ─────────── 실시간 순간 메시지 (불과 얼음) ───────────

  const onRealtimeMsg = (msg: RoomMessage): void => {
    if (msg.sameTab) return;
    const d = msg.data as { k?: unknown; d?: unknown } | undefined;
    if (!d || typeof d.k !== 'string') return;
    const t = get().table;
    const seat = t ? t.seats.findIndex((s) => s.kind === 'human' && s.peer === msg.peer) : -1;
    if (seat < 0) return;
    bridge.listeners.get(d.k)?.forEach((fn) => {
      try {
        fn(seat, d.d);
      } catch {
        /* 게임 쪽 오류는 연결과 무관 */
      }
    });
  };

  const emitRealtime = (kind: string, data: unknown, fast?: boolean): void => {
    if (fast) void rt.relay?.emitFast('rt', { k: kind, d: data });
    else rt.room?.emit('rt', { k: kind, d: data }).catch(() => undefined);
  };

  // ─────────── 연결 ───────────

  /** 방이 끝났다는 알림(재접속 실패 등): 끊김으로 표시하고 "다시 연결"을 띄운다 */
  const onRoomError = (): void => {
    set({ connected: false, error: 'online.err.lost' });
  };

  /** 연결 상태 — 잠깐 끊겼다 붙는 건 흔하므로 2초 넘게 끊겨 있을 때만 알린다. 다시 붙으면 방장은 최신 문서를 다시 쓴다 */
  const watchConnection = (room: NamedRoom): (() => void) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasDown = false;
    set({ connected: true });
    const off = room.onConnection((c) => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (c) {
        set({ connected: true, ...(get().error === 'online.err.lost' || get().error === 'online.err.write' ? { error: null } : {}) });
        if (wasDown && get().role === 'host' && get().table) write({ ...(get().table as TableDoc), at: Date.now() });
        wasDown = false;
      } else {
        wasDown = true;
        timer = setTimeout(() => set({ connected: false }), 2000);
      }
    }, onRoomError);
    return () => {
      if (timer !== null) clearTimeout(timer);
      off();
    };
  };

  const presence = async (room: NamedRoom, code: string, role: 'host' | 'guest'): Promise<void> => {
    const { profile, game } = get();
    await room.presence({ v: 1, code, role, game, name: profile.name, character: profile.character, pid: playerId() }).catch(() => undefined);
  };

  const openRoom = async (code: string, mode: 'create' | 'join', broker?: number): Promise<RelayRoom | null> => {
    if (!relaySupported()) {
      set({ status: 'unavailable', error: 'online.err.unavailable' });
      return null;
    }
    try {
      return await RelayRoom.open(code, { mode, ...(broker !== undefined ? { broker } : {}) });
    } catch {
      set({ status: 'idle', error: 'online.err.join' });
      return null;
    }
  };

  const hostWire = (relay: RelayRoom): void => {
    rt.unsubs.push(relay.onPeers(onPeersHost, onRoomError));
    rt.unsubs.push(relay.on('act', onActHost, onRoomError));
    rt.unsubs.push(relay.on('rt', onRealtimeMsg));
    rt.unsubs.push(watchConnection(relay));
    bridge.publish = hostPublish;
    bridge.emit = emitRealtime;
    bridge.leave = () => void get().leave();
  };

  const guestWire = (relay: RelayRoom, ref: DocRef): void => {
    rt.unsubs.push(
      ref.onSnapshot(
        (snap) => onDocGuest(snap.exists ? (snap.data() as unknown as TableDoc) : null),
        () => set({ error: 'online.err.lost' }),
      ),
    );
    rt.unsubs.push(relay.onPeers((c) => set({ peers: c.peers.filter((p) => p.kind === 'viewer').map(peerInfo) }), onRoomError));
    rt.unsubs.push(relay.on('rt', onRealtimeMsg));
    rt.unsubs.push(watchConnection(relay));
    // 문서 알림이 늦으면 직접 읽는다
    rt.unsubs.push(
      relay.on('sync', (msg) => {
        const seq = (msg.data as { seq?: unknown } | undefined)?.seq;
        if (typeof seq !== 'number' || seq <= rt.lastSeq) return;
        setTimeout(() => {
          if (seq <= rt.lastSeq || !rt.ref) return;
          rt.ref
            .get()
            .then((snap) => onDocGuest(snap.exists ? (snap.data() as unknown as TableDoc) : null))
            .catch(() => undefined);
        }, 1500);
      }),
    );
    bridge.send = guestSend;
    bridge.emit = emitRealtime;
    bridge.leave = () => void get().leave();
  };

  return {
    status: 'idle',
    error: null,
    role: null,
    code: null,
    broker: 0,
    game: 'lumina',
    profile: loadProfile(),
    myPeer: null,
    table: null,
    peers: [],
    connected: false,
    sending: false,
    invite: null,

    setProfile: (p) => {
      const profile = { ...get().profile, ...p, ...(p.name !== undefined ? { name: p.name.slice(0, 12) } : {}) };
      set({ profile });
      writeJSON(KEY, { ...(readJSON<Record<string, unknown>>(KEY) ?? {}), profile });
      const { room, code, role } = { room: rt.room, code: get().code, role: get().role };
      if (room && code && role) void presence(room, code, role);
      // 방장은 로비의 자기 자리도 바로 고친다 (겹치는 캐릭터의 다른 자리는 비어 있는 캐릭터로)
      const t = get().table;
      if (role === 'host' && t && t.status === 'lobby') {
        const me = get().myPeer;
        const name = cleanName(profile.name);
        const mine = t.seats.map((s) => (s.peer === me ? { ...s, name, character: profile.character } : s));
        const used = new Set(mine.map((s) => s.character));
        const seats = mine.map((s) => {
          if (s.peer === me || s.character !== profile.character) return s;
          const free = CHARACTER_ORDER.find((c) => !used.has(c)) ?? s.character;
          used.add(free);
          return s.kind === 'ai' ? { ...s, character: free, name: tr(`character.${free}`) } : { ...s, character: free };
        });
        const nt: TableDoc = { ...t, seats, hostName: name, at: Date.now() };
        set({ table: nt });
        write(nt);
      }
    },

    setGame: (g) => set({ game: g }),

    setInvite: (inv) => set({ invite: inv }),

    check: async () => {
      const ok = relaySupported();
      if (!ok && get().status === 'idle') set({ status: 'unavailable', error: 'online.err.unavailable' });
      return ok;
    },

    create: async () => {
      if (get().status === 'working') return;
      set({ status: 'working', error: null });
      await cleanup();
      const code = makeCode();
      const relay = await openRoom(code, 'create');
      if (!relay) return;
      rt.relay = relay;
      rt.room = relay;
      rt.ref = relay.docRef();
      await presence(relay, code, 'host');
      const myPeer = await waitMyPeer(relay);
      if (!myPeer) {
        await cleanup();
        set({ status: 'idle', error: 'online.err.join' });
        return;
      }
      const { profile, game } = get();
      const table: TableDoc = {
        v: 1,
        code,
        game,
        hostPeer: myPeer,
        hostName: profile.name,
        status: 'lobby',
        seats: [{ kind: 'human', peer: myPeer, pid: playerId(), name: profile.name, character: profile.character }],
        jokers: true,
        seq: 0,
        payload: null,
        events: '[]',
        reject: null,
        at: Date.now(),
      };
      try {
        await rt.ref.set(table as unknown as Record<string, unknown>);
      } catch {
        await cleanup();
        set({ status: 'idle', error: 'online.err.join' });
        return;
      }
      set({ status: 'lobby', role: 'host', code, broker: relay.brokerIndex, table, myPeer, peers: [], invite: null });
      hostWire(relay);
      remember();
      sfx('pop');
    },

    join: async (raw, broker) => {
      const code = normalizeCode(raw);
      if (code.length < 4) {
        set({ error: 'online.err.code' });
        return;
      }
      if (get().status === 'working') return;
      set({ status: 'working', error: null });
      await cleanup();
      const relay = await openRoom(code, 'join', broker);
      if (!relay) return;
      const ref = relay.docRef();
      const snap = await ref.get().catch(() => null);
      const doc = snap?.exists ? (snap.data() as unknown as TableDoc) : null;
      if (!doc || doc.v !== 1 || !isOnlineGame(doc.game)) {
        await relay.leave();
        set({ status: 'idle', error: 'online.err.notFound' });
        return;
      }
      if (doc.status === 'closed') {
        await relay.leave();
        set({ status: 'idle', error: 'online.err.closed' });
        return;
      }
      rt.relay = relay;
      rt.room = relay;
      rt.ref = ref;
      set({ game: doc.game });
      await presence(relay, code, 'guest');
      const myPeer = await waitMyPeer(relay);
      set({ status: doc.status === 'playing' ? 'playing' : 'lobby', role: 'guest', code, broker: relay.brokerIndex, table: doc, myPeer, invite: null });
      guestWire(relay, ref);
      remember();
      clearInviteFromUrl();
      onDocGuest(doc);
      sfx('pop');
    },

    resume: async () => {
      const saved = savedRoom();
      if (!saved) return;
      if (saved.role === 'guest') {
        await get().join(saved.code, saved.broker);
        return;
      }
      if (get().status === 'working') return;
      set({ status: 'working', error: null });
      await cleanup();
      const relay = await openRoom(saved.code, 'join', saved.broker);
      if (!relay) return;
      const ref = relay.docRef();
      const snap = await ref.get().catch(() => null);
      const doc = snap?.exists ? (snap.data() as unknown as TableDoc) : null;
      if (!doc || doc.v !== 1 || doc.status === 'closed' || !isOnlineGame(doc.game)) {
        await relay.leave();
        forget();
        set({ status: 'idle', error: doc?.status === 'closed' ? 'online.err.closed' : 'online.err.notFound' });
        return;
      }
      rt.relay = relay;
      rt.room = relay;
      rt.ref = ref;
      set({ game: doc.game });
      await presence(relay, saved.code, 'host');
      const myPeer = await waitMyPeer(relay);
      const pid = playerId();
      let hostSeat = doc.seats.findIndex((s) => s.kind === 'human' && s.pid === pid);
      if (hostSeat < 0) hostSeat = doc.seats.findIndex((s) => s.kind === 'human' && s.peer === doc.hostPeer);
      if (!myPeer || hostSeat < 0) {
        await cleanup();
        set({ status: 'idle', error: 'online.err.join' });
        return;
      }
      const table: TableDoc = { ...doc, hostPeer: myPeer, seats: doc.seats.map((s, i) => (i === hostSeat ? { ...s, peer: myPeer, pid, away: false } : s)), reject: null, at: Date.now() };
      set({ status: doc.status === 'playing' ? 'playing' : 'lobby', role: 'host', code: saved.code, broker: relay.brokerIndex, table, myPeer, peers: [] });
      write(table);
      hostWire(relay);
      remember();
      const payload = parse<unknown>(table.payload, null);
      if (table.status === 'playing' && payload) api(table.game)?.adoptRemote(payload, [], { code: table.code, role: 'host', mySeat: hostSeat });
      sfx('pop');
    },

    leave: async () => {
      const { role, table } = get();
      if (role === 'host' && table && rt.ref) {
        const nt: TableDoc = { ...table, status: 'closed', at: Date.now() };
        write(nt);
        for (let i = 0; i < 30 && (rt.writing || rt.pending); i++) await sleep(100);
        // 닫힌 걸 친구들이 받을 틈을 주고, 중계 서버에 남은 방 문서를 지운다
        await sleep(600);
        await rt.relay?.clearDoc();
      }
      await cleanup();
      forget();
      set({ status: 'idle', role: null, code: null, table: null, peers: [], myPeer: null, sending: false, connected: false });
    },

    addAi: (level) => {
      const t = get().table;
      if (!t || get().role !== 'host' || t.status !== 'lobby' || !GAME_SEATS[t.game].ai || t.seats.length >= GAME_SEATS[t.game].max) return;
      const used = new Set(t.seats.map((s) => s.character));
      const character = ALL_CHARACTERS.find((c) => !used.has(c)) ?? 'hwigi';
      const nt: TableDoc = { ...t, seats: [...t.seats, { kind: 'ai', peer: null, name: tr(`character.${character}`), character, level }], at: Date.now() };
      set({ table: nt });
      write(nt);
    },

    removeSeat: (i) => {
      const t = get().table;
      if (!t || get().role !== 'host' || t.status !== 'lobby') return;
      const s = t.seats[i];
      if (!s || s.peer === get().myPeer) return;
      const nt: TableDoc = { ...t, seats: t.seats.filter((_, k) => k !== i), at: Date.now() };
      set({ table: nt });
      write(nt);
    },

    setLevel: (i, level) => {
      const t = get().table;
      if (!t || get().role !== 'host' || t.status !== 'lobby' || t.seats[i]?.kind !== 'ai') return;
      const nt: TableDoc = { ...t, seats: t.seats.map((s, k) => (k === i ? { ...s, level } : s)), at: Date.now() };
      set({ table: nt });
      write(nt);
    },

    setJokers: (on) => {
      const t = get().table;
      if (!t || get().role !== 'host' || t.status !== 'lobby') return;
      const nt: TableDoc = { ...t, jokers: on, at: Date.now() };
      set({ table: nt });
      write(nt);
    },

    replaceWithAi: (i) => {
      const t = get().table;
      if (!t || get().role !== 'host' || t.status !== 'playing' || !GAME_SEATS[t.game].ai) return;
      const s = t.seats[i];
      if (!s || s.kind !== 'human' || s.peer === get().myPeer) return;
      // 자리를 먼저 바꿔 두면 게임 저장소가 올리는 새 판에 같이 실린다
      const nt: TableDoc = { ...t, seats: t.seats.map((x, k) => (k === i ? { ...x, kind: 'ai' as const, peer: null, level: 'casual' as const, away: false } : x)), at: Date.now() };
      set({ table: nt });
      const ok = api(t.game)?.seatToAi(i) ?? false;
      if (!ok) set({ table: t });
    },

    start: () => {
      const t = get().table;
      if (!t || get().role !== 'host' || t.status !== 'lobby' || t.seats.length < GAME_SEATS[t.game].min) return;
      const me = get().myPeer;
      const mySeat = t.seats.findIndex((s) => s.peer === me);
      if (mySeat < 0) return;
      api(t.game)?.startOnline(t, { code: t.code, role: 'host', mySeat });
    },

    clearError: () => set({ error: null }),
  };
});

// 참가자가 수를 보내고 답을 기다리는 동안 두 게임 화면의 조작을 잠근다
useOnline.subscribe((st, prev) => {
  if (st.sending === prev.sending) return;
  useGame.setState({ waiting: st.sending });
  useCoda.setState({ waiting: st.sending });
  for (const g of Object.values(gameApis)) g?.().setWaiting?.(st.sending);
});
