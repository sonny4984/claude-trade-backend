/**
 * 게임 저장소 ↔ 온라인 저장소 사이의 얇은 다리 (서로 import하지 않게).
 * 온라인 저장소가 함수를 끼워 넣고, 게임 저장소는 있으면 부른다.
 */
export type OnlineGame = 'lumina' | 'coda' | 'gomoku' | 'fireice' | 'mafia';

/** 게임마다 자리 수와 AI 허용 */
export const GAME_SEATS: Readonly<Record<OnlineGame, { readonly min: number; readonly max: number; readonly ai: boolean }>> = {
  lumina: { min: 2, max: 4, ai: true },
  coda: { min: 2, max: 4, ai: true },
  gomoku: { min: 2, max: 2, ai: true },
  fireice: { min: 2, max: 3, ai: false },
  // 5명보다 적으면 판을 열 때 AI 친구가 채운다
  mafia: { min: 2, max: 8, ai: true },
};

export function isOnlineGame(x: unknown): x is OnlineGame {
  return x === 'lumina' || x === 'coda' || x === 'gomoku' || x === 'fireice' || x === 'mafia';
}

export interface OnlineInfo {
  readonly code: string;
  readonly role: 'host' | 'guest';
  /** 이 기기가 맡은 자리 */
  readonly mySeat: number;
}

type RealtimeListener = (seat: number, data: unknown) => void;

export const bridge: {
  /** 방장: 바뀐 판을 모두에게 */
  publish: ((game: OnlineGame, payload: unknown, events: readonly unknown[]) => void) | null;
  /** 참가자: 내 수를 방장에게 */
  send: ((game: OnlineGame, payload: unknown) => void) | null;
  /** 방을 나감 (게임 화면의 "그만두기") */
  leave: (() => void) | null;
  /** 실시간 순간 메시지 (불과 얼음의 위치·스위치 등) — fast면 도착 보장 없이 빠르게 */
  emit: ((kind: string, data: unknown, fast?: boolean) => void) | null;
  /** 받은 실시간 메시지를 나눠 줄 곳 (kind별) */
  readonly listeners: Map<string, Set<RealtimeListener>>;
} = { publish: null, send: null, leave: null, emit: null, listeners: new Map() };

/** 실시간 메시지 듣기 (그 메시지를 보낸 자리 번호와 함께) */
export function onRealtime(kind: string, fn: RealtimeListener): () => void {
  if (!bridge.listeners.has(kind)) bridge.listeners.set(kind, new Set());
  bridge.listeners.get(kind)?.add(fn);
  return () => bridge.listeners.get(kind)?.delete(fn);
}

/** 온라인 방의 한 자리 (방장이 정하고 문서에 적는다) */
export interface TableSeat {
  readonly kind: 'human' | 'ai';
  /** 사람 자리: 그 기기의 peer (나가 있으면 옛 값) */
  readonly peer: string | null;
  /** 기기에 저장된 플레이어 번호 — 새로고침해도 같은 자리를 되찾는다 */
  readonly pid?: string;
  readonly name: string;
  readonly character: import('../characters/roster').CharacterId;
  readonly level?: import('../game/types').AiLevel;
  /** 연결이 끊긴 사람 */
  readonly away?: boolean;
}

/** 방 문서 — 늦게 들어와도 여기서 판을 받는다 */
export interface TableDoc {
  readonly v: 1;
  readonly code: string;
  readonly game: OnlineGame;
  readonly hostPeer: string;
  readonly hostName: string;
  readonly status: 'lobby' | 'playing' | 'closed';
  readonly seats: readonly TableSeat[];
  readonly jokers: boolean;
  /** 다빈치 코드: 틀렸을 때 공개하는 타일 — choose(내가 고르기, 기본) / drawn(공식: 뽑은 타일). 없으면 choose */
  readonly penalty?: 'choose' | 'drawn';
  /** 판이 바뀔 때마다 1씩 */
  readonly seq: number;
  /** 게임 저장소의 세션 — JSON 문자열 하나로 */
  readonly payload: string | null;
  /** 이번 변화의 이벤트 (소리·반응용) — JSON 배열 문자열 */
  readonly events: string;
  /** 방장이 거절한 참가자 수 (그 참가자에게 알리기) */
  readonly reject: { readonly peer: string; readonly nonce: string } | null;
  readonly at: number;
}

/** 온라인 대전에 참여하는 게임 저장소가 온라인 저장소에 내주는 손잡이 */
export interface OnlineGameApi {
  /** 방장: 로비의 자리로 판 시작 */
  startOnline(table: TableDoc, info: OnlineInfo): void;
  /** 방장: 참가자가 보낸 수 (틀리면 false) */
  applyRemote(seat: number, payload: unknown): boolean;
  /** 참가자(또는 다시 들어온 방장): 방에 올라온 판을 받는다 */
  adoptRemote(payload: unknown, events: readonly unknown[], info: OnlineInfo): void;
  /** 방장: 나간 친구 자리를 AI가 이어 둔다 (못 하면 false) */
  seatToAi(seat: number): boolean;
  /** 참가자: 방장에게 보낸 수의 답을 기다리는 동안 조작 잠금 */
  setWaiting?(v: boolean): void;
}

/** 게임별 손잡이 — 각 게임 저장소가 불러올 때 스스로 등록한다 */
export const gameApis: Partial<Record<OnlineGame, () => OnlineGameApi>> = {};
