/**
 * 방(실시간 모임)과 방 문서의 계약 — 온라인 저장소(online.ts)는 이 모양만 안다.
 * 구현은 relay.ts (공개 MQTT 중계 + 암호화). 처음에는 claude.ai 런타임의 room/db 계약을 본떠 만들었다.
 */

export interface RoomSender {
  /** 열린 페이지 하나의 꼬리표 (새로고침하면 바뀐다) */
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

export type OnRoomError = (e: { code: string; message: string }) => void;

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

export interface DocSnapshot {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
