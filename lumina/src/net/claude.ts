/**
 * claude.ai 아티팩트 런타임(window.claude)의 실시간 방(room)과 공유 저장소(db) 중 우리가 쓰는 부분만.
 * 아티팩트 밖(로컬 파일, 일반 웹 배포)에서는 window.claude가 없거나 use()가 null을 준다 — 그때는 온라인을 끈다.
 * 정확한 계약은 claude.ai 런타임 0.2.60의 room.d.ts / db.d.ts.
 */

export interface RoomSender {
  readonly peer: string;
  readonly isMe: boolean;
  readonly sameTab: boolean;
  readonly kind: 'viewer' | 'agent';
  readonly guest: boolean;
}

export interface RoomMessage extends RoomSender {
  readonly topic: string;
  readonly data?: unknown;
}

export interface RoomPeer extends RoomSender {
  readonly presence: Readonly<Record<string, unknown>>;
  readonly updatedAt: number;
}

export interface PeersChange {
  readonly peers: readonly RoomPeer[];
  readonly joined: readonly RoomPeer[];
  readonly left: readonly RoomPeer[];
  readonly updated: readonly RoomPeer[];
}

export type RoomErrorCode =
  | 'invalid_argument'
  | 'not_permitted'
  | 'limit_reached'
  | 'upstream_error'
  | 'revoked'
  | 'not_granted'
  | 'capability_disabled'
  | 'capability_removed'
  | 'transform_error'
  | string;

export type OnRoomError = (e: { code: RoomErrorCode; message: string }) => void;

export interface NamedRoom {
  readonly name: string;
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, handler: (msg: RoomMessage) => void, onError?: OnRoomError): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(handler: (change: PeersChange) => void, onError?: OnRoomError): () => void;
  connected(): boolean;
  onConnection(handler: (connected: boolean) => void, onError?: OnRoomError): () => void;
  leave(): Promise<void>;
}

export interface RoomApi {
  join(name: string): Promise<NamedRoom>;
}

export interface DocSnapshot {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: { code: string; message: string }) => void): () => void;
}

export interface DbApi {
  doc(path: string): DocRef;
}

interface ClaudeLike {
  use?: (name: string) => Promise<unknown>;
}

/** 이 화면에서 쓸 수 있는 기능인지. 없으면 null (아티팩트 밖이거나 권한 없음) */
export async function capability<T>(name: 'room' | 'db'): Promise<T | null> {
  try {
    const c = (window as unknown as { claude?: ClaudeLike }).claude;
    if (!c || typeof c.use !== 'function') return null;
    return ((await c.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

/** 아티팩트 안인지 대충 알기 (use가 있는지) — 첫 화면 안내용 */
export function insideClaude(): boolean {
  try {
    const c = (window as unknown as { claude?: ClaudeLike }).claude;
    return !!c && typeof c.use === 'function';
  } catch {
    return false;
  }
}
