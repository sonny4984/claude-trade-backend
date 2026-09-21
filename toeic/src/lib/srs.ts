import type { Card, Progress, ReviewLog } from '../types'

/** 활성 카드 상한 */
export const MAX_ACTIVE = 150

/** 정답 시 다음 복습까지의 간격(일). 등록 당일 → 1일 → 3일 → 7일 */
const INTERVALS = [1, 3, 7]

/** 졸업 조건 */
const GRADUATE_STREAK = 3
const GRADUATE_WINDOW_DAYS = 7

export function today(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return toISODate(dt)
}

export function daysBetween(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.split('-').map(Number)
  const [y2, m2, d2] = toISO.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1).getTime()
  const b = new Date(y2, m2 - 1, d2).getTime()
  return Math.round((b - a) / 86400000)
}

/** 새 카드를 처음 등록할 때의 상태 — 등록 당일이 곧 첫 복습일 */
export function newProgress(cardId: string, day = today()): Progress {
  return {
    cardId,
    stage: 0,
    due: day,
    streak: 0,
    firstSeen: day,
    graduated: false,
    wrongCount: 0,
    history: [],
  }
}

/**
 * 한 번 풀고 난 뒤의 상태를 계산한다.
 * picked   = 선택 자체가 정답이었는지
 * explained= 근거를 말할 수 있었는지 (아니오면 맞혀도 오답 처리)
 */
export function applyReview(
  prev: Progress,
  picked: boolean,
  explained: boolean,
  day = today(),
): Progress {
  const correct = picked && explained
  const log: ReviewLog = { date: day, picked, explained, correct }
  const history = [...prev.history, log]

  if (!correct) {
    // 틀리면 1일 후로 리셋
    return {
      ...prev,
      stage: 1,
      due: addDays(day, 1),
      streak: 0,
      wrongCount: prev.wrongCount + 1,
      history,
    }
  }

  const streak = prev.streak + 1
  const withinWindow = daysBetween(prev.firstSeen, day) <= GRADUATE_WINDOW_DAYS

  if (streak >= GRADUATE_STREAK && withinWindow) {
    return { ...prev, streak, graduated: true, graduatedAt: day, history, due: day }
  }

  const stage = Math.min(prev.stage + 1, INTERVALS.length)
  const gap = INTERVALS[Math.min(stage - 1, INTERVALS.length - 1)]
  return { ...prev, stage, streak, due: addDays(day, gap), history }
}

export function isDue(p: Progress, day = today()): boolean {
  return !p.graduated && p.due <= day
}

export function isNew(p: Progress): boolean {
  return p.history.length === 0
}

/** 오늘 복습할 카드 — 섞어서 돌려준다 */
export function dueCards(cards: Card[], progress: Record<string, Progress>, day = today()): Card[] {
  const list = cards.filter((c) => {
    const p = progress[c.id]
    return p ? isDue(p, day) : true
  })
  return shuffle(list)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function activeCount(cards: Card[], progress: Record<string, Progress>): number {
  return cards.filter((c) => !progress[c.id]?.graduated).length
}

/**
 * 선택지가 같은 어근인지 — 품사 드릴 대상 판별.
 * "be reviewing" 같은 보기가 섞여 있어 마지막 단어끼리 비교한다.
 * 공통 앞부분이 가장 짧은 보기의 60% 이상이면 같은 어근으로 본다.
 *   profited/profitable/profitably/profitability → profit  (75%)
 *   used/using/use/had used                      → us      (67%)
 *   around/until/outside/within                  → 없음    (제외)
 */
export function sharesRoot(choices: string[]): boolean {
  if (choices.length < 2) return false
  const words = choices.map((c) => {
    const parts = c.toLowerCase().trim().split(/\s+/)
    return parts[parts.length - 1]
  })
  let i = 0
  while (i < words[0].length && words.every((w) => w[i] === words[0][i])) i++
  if (i < 2) return false
  const shortest = Math.min(...words.map((w) => w.length))
  return i / shortest >= 0.6
}

/** 품사 규칙표 — 드릴에서 틀린 줄을 빨간색으로 강조한다 */
export const POS_RULES: { when: string; then: string }[] = [
  { when: 'be동사·remain·seem·become 뒤', then: '형용사' },
  { when: '일반동사 뒤 (proceed ___)', then: '부사' },
  { when: 'a/the + ___ + 명사', then: '형용사' },
  { when: 'a/the + ___ + of', then: '명사' },
  { when: '전치사 + ___ + 목적어', then: 'V-ing' },
]

const LINKING =
  /\b(?:is|are|was|were|be|been|being|remain|remains|remained|seem|seems|seemed|become|becomes|became|appear|appears|appeared|look|looks)\s*$/i

/**
 * 빈칸 앞뒤 + 정답의 어미를 보고 규칙표 몇 번째 줄인지 고른다.
 * 어느 줄에도 확실히 걸리지 않으면 -1 — 틀린 줄을 강조하느니 아무것도 강조하지 않는다.
 * (예: "Nonprofit groups ___ up to three applications" 는 빈칸이 본동사라 표에 해당 줄이 없다)
 */
export function matchPosRule(sentence: string, answer = ''): number {
  const idx = sentence.indexOf('___')
  if (idx < 0) return -1
  const before = sentence.slice(0, idx).trim()
  const after = sentence.slice(idx + 3).trim()
  const prevWord = before.split(/\s+/).pop()?.toLowerCase() ?? ''
  const nextWord = after.split(/\s+/)[0]?.toLowerCase().replace(/[.,]/g, '') ?? ''
  const a = answer.trim().toLowerCase()

  // be동사·remain·seem·become 뒤 → 형용사
  if (LINKING.test(before)) return 0
  // a/the + ___ + of → 명사 / a/the + ___ + 명사 → 형용사
  if (prevWord === 'a' || prevWord === 'an' || prevWord === 'the') {
    return nextWord === 'of' ? 3 : 2
  }
  // 전치사 + ___ + 목적어 → V-ing
  if (a.endsWith('ing')) return 4
  // 일반동사 뒤 → 부사
  if (a.endsWith('ly')) return 1
  return -1
}
