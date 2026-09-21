/** 유형 목록 — 드롭다운과 통계가 공유한다. */
export const CATEGORIES = [
  '어휘·연어',
  '시간·장소 전치사',
  '준동사(-ing·-ed·동명사)',
  'that절 동사원형',
  '조건·접속부사',
  '관계사·대명사',
  '명사절',
  '품사',
  '수일치',
  '도치',
  '고정 전치사',
  'Part6 문장삽입',
  'LC 어휘',
] as const

export type Category = (typeof CATEGORIES)[number]

export type CardKind = 'mcq' | 'cloze' | 'pair'

interface CardBase {
  id: string
  kind: CardKind
  category: Category
  /** 교재·회차 (예: ETS T9-108) */
  source: string
  /** 한 줄 해설 */
  explanation: string
  /** 한 줄 판단 규칙 */
  rule: string
  part?: string
  number?: string
  /** 시험에서 내가 골랐던 답 — 없으면 생략 */
  myAnswer?: string
}

/** 4지선다 */
export interface McqCard extends CardBase {
  kind: 'mcq'
  sentence: string
  choices: string[]
  answer: string
}

/** 빈칸 입력 */
export interface ClozeCard extends CardBase {
  kind: 'cloze'
  /** 빈칸 앞부분 */
  prefix: string
  answer: string
  /** 한글 뜻 */
  meaning: string
}

/** 혼동 짝 */
export interface PairCard extends CardBase {
  kind: 'pair'
  /** 어느 쪽인지 묻는 단서 — 문장이거나 뜻·조건 */
  prompt: string
  left: string
  right: string
  answer: 'left' | 'right'
}

export type Card = McqCard | ClozeCard | PairCard

/** 카드별 복습 진행 상태. 카드 내용과 분리해 저장한다. */
export interface Progress {
  cardId: string
  /** 0=등록일, 1=1일 후, 2=3일 후, 3=7일 후 */
  stage: number
  /** 다음 복습일 YYYY-MM-DD */
  due: string
  /** 연속 정답 횟수 */
  streak: number
  /** 등록일 YYYY-MM-DD — 7일 졸업 판정 기준 */
  firstSeen: string
  graduated: boolean
  /** 졸업일 */
  graduatedAt?: string
  wrongCount: number
  history: ReviewLog[]
}

export interface ReviewLog {
  date: string
  /** 선택 자체가 정답이었는지 */
  picked: boolean
  /** 근거를 말할 수 있었는지 */
  explained: boolean
  /** 최종 정답 처리 여부 = picked && explained */
  correct: boolean
}

/** 품사 드릴 1세트 결과 */
export interface DrillResult {
  date: string
  total: number
  correct: number
  /** 틀린 문제의 판단 규칙 키 */
  missedRules: string[]
}

export interface AppState {
  progress: Record<string, Progress>
  userCards: Card[]
  drills: DrillResult[]
}
