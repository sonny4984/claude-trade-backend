/**
 * 게임 저장소 ↔ 온라인 저장소 사이의 얇은 다리 (서로 import하지 않게).
 * 온라인 저장소가 함수를 끼워 넣고, 게임 저장소는 있으면 부른다.
 */
export type OnlineGame = 'lumina' | 'coda';

export interface OnlineInfo {
  readonly code: string;
  readonly role: 'host' | 'guest';
  /** 이 기기가 맡은 자리 */
  readonly mySeat: number;
}

export const bridge: {
  /** 방장: 바뀐 판을 모두에게 */
  publish: ((game: OnlineGame, payload: unknown, events: readonly unknown[]) => void) | null;
  /** 참가자: 내 수를 방장에게 */
  send: ((game: OnlineGame, payload: unknown) => void) | null;
  /** 방을 나감 (게임 화면의 "그만두기") */
  leave: (() => void) | null;
} = { publish: null, send: null, leave: null };

/** 온라인 방의 한 자리 (방장이 정하고 db 문서에 적는다) */
export interface TableSeat {
  readonly kind: 'human' | 'ai';
  /** 사람 자리: 그 기기의 peer (나가 있으면 null 또는 옛 값) */
  readonly peer: string | null;
  readonly name: string;
  readonly character: import('../characters/roster').CharacterId;
  readonly level?: import('../game/types').AiLevel;
  /** 연결이 끊긴 사람 */
  readonly away?: boolean;
}

/** db의 tables/<code> 문서 — 늦게 들어와도 여기서 판을 받는다 */
export interface TableDoc {
  readonly v: 1;
  readonly code: string;
  readonly game: OnlineGame;
  readonly hostPeer: string;
  readonly hostName: string;
  readonly status: 'lobby' | 'playing' | 'closed';
  readonly seats: readonly TableSeat[];
  readonly jokers: boolean;
  /** 판이 바뀔 때마다 1씩 */
  readonly seq: number;
  /** 게임 저장소의 세션 — JSON 문자열 하나로 (중첩 배열·깊이 제한과 무관하게) */
  readonly payload: string | null;
  /** 이번 변화의 이벤트 (소리·반응용) — JSON 배열 문자열 */
  readonly events: string;
  /** 방장이 거절한 참가자 수 (그 참가자에게 알리기) */
  readonly reject: { readonly peer: string; readonly nonce: string } | null;
  readonly at: number;
}
