/**
 * 규칙 설정. 기본값은 공식 Rummikub Classic 규칙서(2019, 영문·국제판)를 그대로 따른다.
 * 하우스 룰은 여기서만 바꾸고, 커널의 모든 판정은 이 값을 읽는다.
 */
export interface RuleSet {
  /** 첫 등록 최소 점수. 공식 30 */
  readonly initialMeldPoints: number;
  /**
   * 첫 등록한 그 차례에 바로 테이블을 조작할 수 있는가.
   * 공식 규칙서: "On turns after a player has made his/her initial meld, that player can build onto other sets"
   * → 공식 = false (다음 차례부터). 하우스 룰로 true 허용.
   */
  readonly initialMeldContinuesTurn: boolean;
  /**
   * 조커 회수 방식.
   * 'any-legal'  — 테이블이 합법으로 남으면 어떤 재배열로든 조커를 빼낼 수 있다 (공식 2019 영문판 문구 + 공식 예시 4가지)
   * 'exact-tile' — 조커가 나타내던 바로 그 타일(그룹 3장이면 빠진 두 색 중 하나)로 교체해야만 뺄 수 있다 (구판 문구)
   */
  readonly jokerReplace: 'any-legal' | 'exact-tile';
  /** 조커가 든 세트는 쪼개거나 타일을 뺄 수 없다 (구판 하우스 룰). 공식 false */
  readonly jokerSetLocked: boolean;
  /** 판이 끝났을 때 랙에 남은 조커 벌점. 공식 30 */
  readonly jokerPenalty: number;
  /** 한 번도 등록하지 못한 채 끝난 플레이어 추가 벌점. 공식 0 */
  readonly unmeldedPenalty: number;
  /** 시간 안에 수를 완성하지 못했을 때 벌칙으로 뽑는 장수. 공식 3 */
  readonly timeoutPenaltyDraw: number;
  /** 한 차례 제한 시간(초). 공식 60, null = 끔 */
  readonly turnSeconds: number | null;
  /** 처음 나눠 받는 장수. 공식 14 */
  readonly tilesPerPlayer: number;
}

export const CLASSIC_RULES: RuleSet = Object.freeze({
  initialMeldPoints: 30,
  initialMeldContinuesTurn: false,
  jokerReplace: 'any-legal',
  jokerSetLocked: false,
  jokerPenalty: 30,
  unmeldedPenalty: 0,
  timeoutPenaltyDraw: 3,
  turnSeconds: 60,
  tilesPerPlayer: 14,
});

/** 카페에서 흔히 쓰는 느슨한 규칙 */
export const CAFE_HOUSE_RULES: RuleSet = Object.freeze({
  ...CLASSIC_RULES,
  initialMeldContinuesTurn: true,
  timeoutPenaltyDraw: 1,
  turnSeconds: null,
});

export const RULE_PRESETS = { classic: CLASSIC_RULES, cafe: CAFE_HOUSE_RULES } as const;
export type RulePresetId = keyof typeof RULE_PRESETS;

/** 저장된 값이 깨져 있어도 안전하게 복구 */
export function sanitizeRules(input: Partial<RuleSet> | null | undefined): RuleSet {
  const r = { ...CLASSIC_RULES, ...(input ?? {}) };
  const pick = <T>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  return {
    initialMeldPoints: pick(r.initialMeldPoints, [30, 40, 50], 30),
    initialMeldContinuesTurn: !!r.initialMeldContinuesTurn,
    jokerReplace: pick(r.jokerReplace, ['any-legal', 'exact-tile'] as const, 'any-legal'),
    jokerSetLocked: !!r.jokerSetLocked,
    jokerPenalty: pick(r.jokerPenalty, [30, 50], 30),
    unmeldedPenalty: pick(r.unmeldedPenalty, [0, 100], 0),
    timeoutPenaltyDraw: pick(r.timeoutPenaltyDraw, [3, 1, 0], 3),
    turnSeconds: pick(r.turnSeconds, [null, 30, 45, 60, 90, 120], 60),
    tilesPerPlayer: 14,
  };
}
