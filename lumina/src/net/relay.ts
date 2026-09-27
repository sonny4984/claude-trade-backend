/**
 * 공개 MQTT 중계 서버로 잇는 방 — 로그인·공유 설정 없이 "링크 누르면 바로 입장".
 *
 *  · 방 코드 하나에서 토픽 이름과 암호 키를 만든다(PBKDF2). 중계 서버와 구경꾼은 내용을 못 읽는다(AES-GCM).
 *  · 토픽: <기준>/doc (판 문서, 보관 retain) · <기준>/p/<peer> (누가 있는지, 보관 + 끊기면 윌 메시지로 지움)
 *          · <기준>/e/<주제> (순간 메시지: 참가자의 수 'act', 방장의 'sync' 등)
 *  · 방장이 판을 돌리는 구조는 그대로 — 여기서는 online.ts가 쓰는 NamedRoom / DocRef 모양만 맞춘다.
 *  · 공개 서버는 무료 시험용이라 가끔 느리거나 막힐 수 있다: 여러 곳을 차례로 시도하고, 끊기면 다시 붙는다.
 */
import { MqttClient } from './mqtt';
import type { DocRef, DocSnapshot, NamedRoom, OnRoomError, PeersChange, RoomMessage, RoomPeer } from './types';

export interface Broker {
  readonly name: string;
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
}

/** 무료 공개 MQTT 서버 (WebSocket). 앞에서부터 시도한다 */
export const BROKERS: readonly Broker[] = [
  { name: 'shiftr', url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { name: 'emqx', url: 'wss://broker.emqx.io:8084/mqtt' },
  { name: 'hivemq', url: 'wss://broker.hivemq.com:8884/mqtt' },
];

const enc = new TextEncoder();
const dec = new TextDecoder();
const EMPTY = new Uint8Array(0);
const PRESENCE_REFRESH_MS = 25_000;
/** 이만큼 새 소식이 없으면 나간 것으로 본다 (이 기기 시계 기준) */
const PRESENCE_STALE_MS = 80_000;
/** 보관된 presence가 이보다 오래됐으면(보낸 쪽 시계) 예전에 사라진 사람 — 시계가 조금 달라도 괜찮게 넉넉히 */
const PRESENCE_ANCIENT_MS = 10 * 60_000;

function randomId(n = 12): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const b of bytes) s += abc[b % abc.length];
  return s;
}

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 로컬 시험용 서버 (?broker=ws://127.0.0.1:1884) — 이 컴퓨터에서 띄운 페이지에서만 받아들인다 */
export function brokerOverride(): Broker | null {
  try {
    if (typeof location === 'undefined' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    const url = new URLSearchParams(location.search).get('broker');
    return url && /^wss?:\/\//.test(url) ? { name: 'test', url } : null;
  } catch {
    return null;
  }
}

/** 이 기기에서 온라인을 쓸 수 있는지 (WebSocket과 암호화) */
export function relaySupported(): boolean {
  return typeof WebSocket !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

interface RoomKeys {
  readonly base: string;
  readonly key: CryptoKey;
}

export async function deriveRoom(code: string): Promise<RoomKeys> {
  const material = await crypto.subtle.importKey('raw', enc.encode(`lumina:${code}`), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('lumina-room-v1'), iterations: 60_000, hash: 'SHA-256' }, material, 320));
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { base: `lumina/v1/${hex(bits.slice(32, 40))}`, key };
}

async function seal(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

async function unseal<T>(key: CryptoKey, payload: Uint8Array): Promise<T | null> {
  if (payload.length < 13) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: payload.slice(0, 12) }, key, payload.slice(12));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    return null;
  }
}

interface PeerEntry {
  presence: Readonly<Record<string, unknown>>;
  updatedAt: number;
  at: number;
}

export interface OpenOptions {
  readonly mode: 'create' | 'join';
  /** 초대 링크에 적힌 서버 번호 */
  readonly broker?: number;
  /** 테스트(Node)용 */
  readonly WebSocketImpl?: new (url: string, protocols?: string | string[]) => WebSocket;
  readonly brokers?: readonly Broker[];
  readonly timeoutMs?: number;
}

export class RelayRoom implements NamedRoom {
  readonly name: string;
  readonly peer = randomId();
  private client: MqttClient | null = null;
  private readonly peersMap = new Map<string, PeerEntry>();
  private snap: readonly RoomPeer[] = Object.freeze([]);
  private readonly topicHandlers = new Map<string, Set<(m: RoomMessage) => void>>();
  private readonly peerHandlers = new Set<(c: PeersChange) => void>();
  private readonly connHandlers = new Set<(c: boolean) => void>();
  private readonly errorHandlers = new Set<OnRoomError>();
  private readonly docHandlers = new Set<(s: DocSnapshot) => void>();
  private doc: Record<string, unknown> | null | undefined = undefined;
  private docWaiters: (() => void)[] = [];
  private myPresence: Record<string, unknown> = {};
  private myPresenceAt = 0;
  private live = false;
  private leaving = false;
  private attempt = 0;
  private queue: Promise<void> = Promise.resolve();
  private timers: ReturnType<typeof setInterval>[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    readonly code: string,
    readonly brokerIndex: number,
    private readonly broker: Broker,
    private readonly keys: RoomKeys,
    private readonly o: OpenOptions,
  ) {
    this.name = `t-${code}`;
    this.rebuild();
  }

  /**
   * 방 열기. create: 붙는 첫 서버에 연다. join: 초대 링크의 서버(없으면 차례로)에서 판 문서를 찾는다.
   * 문서를 못 찾으면 붙은 첫 서버의 방을 돌려준다(doc()이 비어 있음 → "그런 방 없음").
   */
  static async open(code: string, o: OpenOptions): Promise<RelayRoom> {
    const keys = await deriveRoom(code);
    const override = brokerOverride();
    const list: { broker: Broker; index: number }[] = override
      ? [{ broker: override, index: -1 }]
      : (o.brokers ?? BROKERS).map((broker, index) => ({ broker, index }));
    const hinted = o.broker !== undefined ? list.filter((x) => x.index === o.broker) : [];
    const order = [...hinted, ...list.filter((x) => !hinted.includes(x))];
    let fallback: RelayRoom | null = null;
    let lastError: unknown = null;
    for (const { broker, index } of order) {
      const room = new RelayRoom(code, index, broker, keys, o);
      try {
        await room.start();
      } catch (e) {
        lastError = e;
        continue;
      }
      if (o.mode === 'create') return room;
      const found = await room.waitDoc(index === o.broker ? 4000 : 2500);
      if (found) {
        await fallback?.leave();
        return room;
      }
      if (!fallback) fallback = room;
      else await room.leave();
    }
    if (fallback) return fallback;
    throw lastError instanceof Error ? lastError : new Error('unreachable');
  }

  private topic(kind: 'doc' | 'p' | 'e', rest = ''): string {
    return kind === 'doc' ? `${this.keys.base}/doc` : `${this.keys.base}/${kind}/${rest}`;
  }

  private async start(): Promise<void> {
    const client = new MqttClient({
      url: this.broker.url,
      // MQTT 3.1.1은 23자까지만 보장
      clientId: `lm${this.peer}${randomId(4)}`,
      keepalive: 20,
      ...(this.broker.username !== undefined ? { username: this.broker.username } : {}),
      ...(this.broker.password !== undefined ? { password: this.broker.password } : {}),
      will: { topic: this.topic('p', this.peer), payload: EMPTY, retain: true, qos: 1 },
      timeoutMs: this.o.timeoutMs ?? 7000,
      ...(this.o.WebSocketImpl ? { WebSocketImpl: this.o.WebSocketImpl } : {}),
    });
    client.onMessage((topic, payload) => {
      this.queue = this.queue.then(() => this.receive(topic, payload)).catch(() => undefined);
    });
    await client.connect();
    client.onClose(() => this.dropped());
    this.client = client;
    await client.subscribe(`${this.keys.base}/#`, 1);
    this.live = true;
    this.attempt = 0;
    if (this.myPresenceAt) await this.publishPresence();
    this.connHandlers.forEach((h) => h(true));
    if (!this.timers.length) {
      this.timers.push(
        setInterval(() => {
          if (this.live && this.myPresenceAt) void this.publishPresence();
        }, PRESENCE_REFRESH_MS),
        setInterval(() => this.sweep(), 15_000),
      );
    }
  }

  private dropped(): void {
    this.live = false;
    this.client = null;
    if (this.leaving) return;
    this.connHandlers.forEach((h) => h(false));
    const wait = Math.min(10_000, 1000 * 2 ** this.attempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.leaving) return;
      this.start().catch(() => this.dropped());
    }, wait);
  }

  private async receive(topic: string, payload: Uint8Array): Promise<void> {
    const base = this.keys.base;
    if (topic === `${base}/doc`) {
      const body = payload.length ? await unseal<Record<string, unknown>>(this.keys.key, payload) : null;
      if (payload.length && !body) return;
      this.doc = body;
      this.docWaiters.splice(0).forEach((w) => w());
      const s = this.docSnap();
      this.docHandlers.forEach((h) => h(s));
      return;
    }
    if (topic.startsWith(`${base}/p/`)) {
      const peer = topic.slice(base.length + 3);
      if (peer === this.peer) return;
      if (!payload.length) {
        if (this.peersMap.delete(peer)) this.changed([], [peer], []);
        return;
      }
      const body = await unseal<{ p?: Record<string, unknown>; at?: number }>(this.keys.key, payload);
      if (!body || typeof body.p !== 'object' || !body.p) return;
      if (typeof body.at === 'number' && Date.now() - body.at > PRESENCE_ANCIENT_MS) return;
      const prev = this.peersMap.get(peer);
      const presence = Object.freeze({ ...body.p });
      const same = prev && JSON.stringify(prev.presence) === JSON.stringify(presence);
      this.peersMap.set(peer, { presence: same && prev ? prev.presence : presence, updatedAt: same && prev ? prev.updatedAt : Date.now(), at: Date.now() });
      if (!prev) this.changed([peer], [], []);
      else if (!same) this.changed([], [], [peer]);
      return;
    }
    if (topic.startsWith(`${base}/e/`)) {
      const name = topic.slice(base.length + 3);
      const body = await unseal<{ f?: string; d?: unknown }>(this.keys.key, payload);
      if (!body || typeof body.f !== 'string') return;
      const me = body.f === this.peer;
      const msg: RoomMessage = Object.freeze({ topic: name, data: body.d, peer: body.f, isMe: me, sameTab: me, kind: 'viewer' as const, guest: false });
      this.topicHandlers.get(name)?.forEach((h) => h(msg));
    }
  }

  /** 오래 소식 없는 사람은 나간 것으로 (윌 메시지가 안 온 경우 대비) */
  private sweep(): void {
    const now = Date.now();
    const gone: string[] = [];
    this.peersMap.forEach((v, k) => {
      if (now - v.at > PRESENCE_STALE_MS) gone.push(k);
    });
    if (!gone.length) return;
    gone.forEach((k) => this.peersMap.delete(k));
    this.changed([], gone, []);
  }

  private selfPeer(): RoomPeer {
    return Object.freeze({ peer: this.peer, isMe: true, sameTab: true, kind: 'viewer' as const, guest: false, presence: Object.freeze({ ...this.myPresence }), updatedAt: this.myPresenceAt || Date.now() });
  }

  private rebuild(): void {
    const others = [...this.peersMap.entries()].map(([peer, v]) =>
      Object.freeze({ peer, isMe: false, sameTab: false, kind: 'viewer' as const, guest: false, presence: v.presence, updatedAt: v.updatedAt }),
    );
    this.snap = Object.freeze([this.selfPeer(), ...others]);
  }

  private changed(joined: string[], left: string[], updated: string[]): void {
    const before = this.snap;
    this.rebuild();
    const pick = (ids: string[]): RoomPeer[] => this.snap.filter((p) => ids.includes(p.peer));
    const change: PeersChange = {
      peers: this.snap,
      joined: pick(joined),
      left: before.filter((p) => left.includes(p.peer)),
      updated: pick(updated),
    };
    this.peerHandlers.forEach((h) => h(change));
  }

  private async publishPresence(): Promise<void> {
    const c = this.client;
    if (!c || !this.live) return;
    const body = await seal(this.keys.key, { p: this.myPresence, at: Date.now() });
    await c.publish(this.topic('p', this.peer), body, { qos: 1, retain: true }).catch(() => undefined);
  }

  private docSnap(): DocSnapshot {
    const body = this.doc ?? undefined;
    return Object.freeze({ exists: !!body, data: () => (body ? (JSON.parse(JSON.stringify(body)) as Record<string, unknown>) : undefined) });
  }

  /** 보관된 판 문서가 오기를 잠깐 기다린다 (있으면 true) */
  waitDoc(ms: number): Promise<boolean> {
    if (this.doc !== undefined) return Promise.resolve(!!this.doc);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.docWaiters = this.docWaiters.filter((w) => w !== done);
        if (this.doc === undefined) this.doc = null;
        resolve(!!this.doc);
      }, ms);
      const done = (): void => {
        clearTimeout(timer);
        resolve(!!this.doc);
      };
      this.docWaiters.push(done);
    });
  }

  // ─────────── NamedRoom ───────────

  async emit(topic: string, data?: unknown): Promise<void> {
    const c = this.client;
    if (!c || !this.live) return;
    const body = await seal(this.keys.key, { f: this.peer, d: data ?? null });
    await c.publish(this.topic('e', topic), body, { qos: 1 });
  }

  /** 도착 보장 없이 빠르게 (실시간 위치처럼 곧 새 값이 오는 것) */
  async emitFast(topic: string, data?: unknown): Promise<void> {
    const c = this.client;
    if (!c || !this.live) return;
    const body = await seal(this.keys.key, { f: this.peer, d: data ?? null });
    await c.publish(this.topic('e', topic), body, { qos: 0 }).catch(() => undefined);
  }

  on(topic: string, handler: (msg: RoomMessage) => void, onError?: OnRoomError): () => void {
    if (!this.topicHandlers.has(topic)) this.topicHandlers.set(topic, new Set());
    const fn = (m: RoomMessage): void => handler(m);
    this.topicHandlers.get(topic)?.add(fn);
    if (onError) this.errorHandlers.add(onError);
    return () => {
      this.topicHandlers.get(topic)?.delete(fn);
      if (onError) this.errorHandlers.delete(onError);
    };
  }

  async presence(patch: Record<string, unknown>): Promise<void> {
    const next = { ...this.myPresence };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    this.myPresence = next;
    this.myPresenceAt = Date.now();
    this.rebuild();
    await this.publishPresence();
  }

  peers(): readonly RoomPeer[] {
    return this.snap;
  }

  onPeers(handler: (change: PeersChange) => void, onError?: OnRoomError): () => void {
    const fn = (c: PeersChange): void => handler(c);
    this.peerHandlers.add(fn);
    if (onError) this.errorHandlers.add(onError);
    queueMicrotask(() => {
      if (this.peerHandlers.has(fn)) fn({ peers: this.snap, joined: this.snap, left: [], updated: [] });
    });
    return () => {
      this.peerHandlers.delete(fn);
      if (onError) this.errorHandlers.delete(onError);
    };
  }

  connected(): boolean {
    return this.live;
  }

  onConnection(handler: (connected: boolean) => void, onError?: OnRoomError): () => void {
    const fn = (c: boolean): void => handler(c);
    this.connHandlers.add(fn);
    if (onError) this.errorHandlers.add(onError);
    queueMicrotask(() => {
      if (this.connHandlers.has(fn)) fn(this.live);
    });
    return () => {
      this.connHandlers.delete(fn);
      if (onError) this.errorHandlers.delete(onError);
    };
  }

  async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const c = this.client;
    if (c && this.live) {
      await c.publish(this.topic('p', this.peer), EMPTY, { qos: 1, retain: true }).catch(() => undefined);
      c.end();
    }
    this.live = false;
    this.client = null;
    this.topicHandlers.clear();
    this.peerHandlers.clear();
    this.connHandlers.clear();
    this.docHandlers.clear();
  }

  // ─────────── DocRef (방 문서 하나) ───────────

  docRef(): DocRef {
    return {
      get: async () => {
        await this.waitDoc(2500);
        return this.docSnap();
      },
      set: async (data: Record<string, unknown>) => {
        const c = this.client;
        if (!c || !this.live) throw Object.assign(new Error('offline'), { code: 'unavailable' });
        this.doc = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
        const s = this.docSnap();
        queueMicrotask(() => this.docHandlers.forEach((h) => h(s)));
        await c.publish(this.topic('doc'), await seal(this.keys.key, data), { qos: 1, retain: true });
      },
      onSnapshot: (next: (snap: DocSnapshot) => void) => {
        const fn = (s: DocSnapshot): void => next(s);
        this.docHandlers.add(fn);
        void this.waitDoc(2500).then(() => {
          if (this.docHandlers.has(fn)) fn(this.docSnap());
        });
        return () => this.docHandlers.delete(fn);
      },
    };
  }

  /** 보관된 판 문서를 지운다 (방을 닫고 조금 뒤) */
  async clearDoc(): Promise<void> {
    const c = this.client;
    if (!c || !this.live) return;
    await c.publish(this.topic('doc'), EMPTY, { qos: 1, retain: true }).catch(() => undefined);
  }
}
