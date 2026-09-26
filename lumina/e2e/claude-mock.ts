/**
 * E2E용 가짜 claude.ai 런타임 — 방(room)과 공유 저장소(db)를 테스트 프로세스 안의 허브로 흉내 낸다.
 * 브라우저 컨텍스트를 따로 열어(기기 둘) 각 페이지에 붙이면, 두 페이지가 같은 방·같은 문서를 본다.
 * 계약은 claude.ai 런타임 0.2.60의 room.d.ts / db.d.ts 중 앱이 쓰는 부분:
 *  · emit은 보낸 쪽에도 되돌아온다(sameTab), onPeers의 첫 전달은 지금 방 전체를 joined로 준다.
 *  · presence는 병합, peers()는 나를 포함한 얼린 목록, 문서 set은 통째로 바꾸고 구독자에게 알린다.
 */
import type { Page } from '@playwright/test';

type Json = unknown;
interface PeerState {
  presence: Record<string, Json>;
  updatedAt: number;
}

export class ClaudeHub {
  private readonly pages = new Map<string, Page>();
  private readonly rooms = new Map<string, Map<string, PeerState>>();
  private readonly docs = new Map<string, Json>();
  private n = 0;

  /** 페이지(기기 하나)를 허브에 붙인다 — goto 전에 부를 것 */
  async attach(page: Page): Promise<string> {
    const peer = `p${++this.n}x${Math.random().toString(36).slice(2, 8)}`;
    this.pages.set(peer, page);
    await page.exposeFunction('__hubCall', (op: string, arg: Record<string, Json>) => this.call(peer, op, arg));
    await page.addInitScript(installMock, peer);
    return peer;
  }

  /** 테스트에서 문서를 들여다보기 */
  doc(path: string): Json {
    return this.docs.get(path) ?? null;
  }

  private snapshot(room: string): { peer: string; presence: Record<string, Json>; updatedAt: number }[] {
    return [...(this.rooms.get(room) ?? new Map()).entries()].map(([peer, s]) => ({ peer, presence: s.presence, updatedAt: s.updatedAt }));
  }

  private send(peer: string, event: Json): void {
    const page = this.pages.get(peer);
    if (!page || page.isClosed()) return;
    page.evaluate((e) => (window as unknown as { __hubRecv?: (x: unknown) => void }).__hubRecv?.(e), event).catch(() => undefined);
  }

  private broadcastPeers(room: string): void {
    const peers = this.snapshot(room);
    for (const p of this.rooms.get(room)?.keys() ?? []) this.send(p, { type: 'peers', room, peers });
  }

  private call(peer: string, op: string, arg: Record<string, Json>): Json {
    const room = String(arg.room ?? '');
    switch (op) {
      case 'join': {
        if (!this.rooms.has(room)) this.rooms.set(room, new Map());
        this.rooms.get(room)?.set(peer, { presence: {}, updatedAt: Date.now() });
        setTimeout(() => this.broadcastPeers(room), 0);
        return this.snapshot(room);
      }
      case 'leave': {
        this.rooms.get(room)?.delete(peer);
        setTimeout(() => this.broadcastPeers(room), 0);
        return null;
      }
      case 'presence': {
        const st = this.rooms.get(room)?.get(peer);
        if (!st) return null;
        const patch = (arg.patch ?? {}) as Record<string, Json>;
        const next = { ...st.presence };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        st.presence = next;
        st.updatedAt = Date.now();
        setTimeout(() => this.broadcastPeers(room), 0);
        return null;
      }
      case 'emit': {
        const members = [...(this.rooms.get(room)?.keys() ?? [])];
        if (!members.includes(peer)) return null;
        const data = JSON.parse(JSON.stringify(arg.data ?? null)) as Json;
        for (const p of members) this.send(p, { type: 'msg', room, topic: arg.topic, data, from: peer });
        return null;
      }
      case 'docGet':
        return this.docs.get(String(arg.path)) ?? null;
      case 'docSet': {
        const path = String(arg.path);
        const body = JSON.parse(JSON.stringify(arg.data)) as Json;
        if (JSON.stringify(body).length > 256 * 1024) throw Object.assign(new Error('too big'), { code: 'invalid_argument' });
        this.docs.set(path, body);
        // 실제 저장소처럼 조금 늦게 모두에게 알린다
        setTimeout(() => {
          for (const p of this.pages.keys()) this.send(p, { type: 'doc', path, data: body });
        }, 30);
        return null;
      }
      default:
        return null;
    }
  }
}

/** 페이지 안에서 돌아가는 부분 (addInitScript) — 바깥 변수를 쓰면 안 된다 */
function installMock(me: string): void {
  type Json = unknown;
  type PeerRaw = { peer: string; presence: Record<string, Json>; updatedAt: number };
  type Peer = PeerRaw & { by: null; isMe: boolean; sameTab: boolean; kind: 'viewer'; guest: boolean };
  type Change = { peers: readonly Peer[]; joined: readonly Peer[]; left: readonly Peer[]; updated: readonly Peer[] };
  const call = (op: string, arg: Record<string, Json>): Promise<Json> =>
    (window as unknown as { __hubCall: (o: string, a: Record<string, Json>) => Promise<Json> }).__hubCall(op, arg);

  interface RoomState {
    name: string;
    peers: readonly Peer[];
    topics: Map<string, Set<(m: Json) => void>>;
    peerHandlers: Set<(c: Change) => void>;
  }
  const rooms = new Map<string, RoomState>();
  const docSubs = new Map<string, Set<(s: Json) => void>>();

  const toPeer = (p: PeerRaw): Peer => Object.freeze({ ...p, presence: Object.freeze({ ...p.presence }), by: null, isMe: p.peer === me, sameTab: p.peer === me, kind: 'viewer' as const, guest: false });
  const applyPeers = (r: RoomState, raw: PeerRaw[]): Change => {
    const before = new Map(r.peers.map((p) => [p.peer, p]));
    const next = Object.freeze(raw.map(toPeer));
    const joined = next.filter((p) => !before.has(p.peer));
    const left = r.peers.filter((p) => !raw.some((x) => x.peer === p.peer));
    const updated = next.filter((p) => before.has(p.peer) && JSON.stringify(before.get(p.peer)?.presence) !== JSON.stringify(p.presence));
    r.peers = next;
    return { peers: next, joined, left, updated };
  };
  const snap = (path: string, data: Json): Json => {
    const body = data === null || data === undefined ? undefined : Object.freeze(JSON.parse(JSON.stringify(data)));
    return Object.freeze({ id: path.split('/').pop(), exists: body !== undefined, data: () => body, metadata: { fromCache: false, hasPendingWrites: false } });
  };

  (window as unknown as { __hubRecv: (e: Record<string, Json>) => void }).__hubRecv = (e) => {
    if (e.type === 'msg') {
      const r = rooms.get(String(e.room));
      const from = String(e.from);
      const msg = Object.freeze({ topic: e.topic, data: e.data, peer: from, by: null, isMe: from === me, sameTab: from === me, kind: 'viewer', guest: false });
      r?.topics.get(String(e.topic))?.forEach((h) => h(msg));
    } else if (e.type === 'peers') {
      const r = rooms.get(String(e.room));
      if (!r) return;
      const change = applyPeers(r, e.peers as PeerRaw[]);
      if (change.joined.length || change.left.length || change.updated.length) r.peerHandlers.forEach((h) => h(change));
    } else if (e.type === 'doc') {
      const path = String(e.path);
      docSubs.get(path)?.forEach((fn) => fn(snap(path, e.data)));
    }
  };

  const room = Object.freeze({
    join: async (name: string) => {
      const r: RoomState = { name, peers: Object.freeze([]), topics: new Map(), peerHandlers: new Set() };
      rooms.set(name, r);
      applyPeers(r, (await call('join', { room: name })) as PeerRaw[]);
      return Object.freeze({
        name,
        emit: async (topic: string, data?: Json) => {
          await call('emit', { room: name, topic, data: data ?? null });
        },
        on: (topic: string, h: (m: Json) => void) => {
          if (!r.topics.has(topic)) r.topics.set(topic, new Set());
          const fn = (m: Json): void => h(m);
          r.topics.get(topic)?.add(fn);
          return () => r.topics.get(topic)?.delete(fn);
        },
        presence: async (patch: Record<string, Json>) => {
          await call('presence', { room: name, patch });
        },
        peers: () => r.peers,
        onPeers: (h: (c: Change) => void) => {
          const fn = (c: Change): void => h(c);
          r.peerHandlers.add(fn);
          queueMicrotask(() => fn({ peers: r.peers, joined: r.peers, left: [], updated: [] }));
          return () => r.peerHandlers.delete(fn);
        },
        connected: () => true,
        onConnection: (h: (c: boolean) => void) => {
          queueMicrotask(() => h(true));
          return () => undefined;
        },
        leave: async () => {
          rooms.delete(name);
          await call('leave', { room: name });
        },
      });
    },
  });

  const db = Object.freeze({
    doc: (path: string) =>
      Object.freeze({
        id: path.split('/').pop(),
        path,
        get: async () => snap(path, await call('docGet', { path })),
        set: async (data: Record<string, Json>) => {
          await call('docSet', { path, data });
        },
        update: async (data: Record<string, Json>) => {
          const cur = (await call('docGet', { path })) as Record<string, Json> | null;
          if (!cur) throw Object.assign(new Error('missing'), { code: 'invalid_argument' });
          await call('docSet', { path, data: { ...cur, ...data } });
        },
        delete: async () => {
          await call('docSet', { path, data: null });
        },
        onSnapshot: (next: (s: Json) => void) => {
          if (!docSubs.has(path)) docSubs.set(path, new Set());
          const fn = (s: Json): void => next(s);
          docSubs.get(path)?.add(fn);
          void call('docGet', { path }).then((d) => fn(snap(path, d)));
          return () => docSubs.get(path)?.delete(fn);
        },
      }),
  });

  Object.defineProperty(window, 'claude', {
    value: Object.freeze({ use: async (name: string) => (name === 'room' ? room : name === 'db' ? db : null) }),
    configurable: false,
  });
}
