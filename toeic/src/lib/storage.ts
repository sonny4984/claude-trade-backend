import { SEED_CARDS } from '../data/seed'
import type { AppState, Card, DrillResult, Progress } from '../types'
import { newProgress } from './srs'

const KEY = 'toeic.review.v1'

const EMPTY: AppState = { progress: {}, userCards: [], drills: [] }

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      progress: parsed.progress ?? {},
      userCards: parsed.userCards ?? [],
      drills: parsed.drills ?? [],
    }
  } catch {
    return EMPTY
  }
}

export function save(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // 저장 공간이 꽉 찬 경우 — 화면은 그대로 두고 조용히 넘어간다
  }
}

/** 시드 + 내가 추가한 카드 */
export function allCards(state: AppState): Card[] {
  return [...SEED_CARDS, ...state.userCards]
}

/** 아직 진행 상태가 없는 카드에 초기 상태를 만들어 준다 */
export function ensureProgress(state: AppState): AppState {
  const progress = { ...state.progress }
  let changed = false
  for (const c of allCards(state)) {
    if (!progress[c.id]) {
      progress[c.id] = newProgress(c.id)
      changed = true
    }
  }
  return changed ? { ...state, progress } : state
}

export function putProgress(state: AppState, p: Progress): AppState {
  return { ...state, progress: { ...state.progress, [p.cardId]: p } }
}

export function addCard(state: AppState, card: Card): AppState {
  return {
    ...state,
    userCards: [...state.userCards, card],
    progress: { ...state.progress, [card.id]: newProgress(card.id) },
  }
}

export function addDrill(state: AppState, r: DrillResult): AppState {
  return { ...state, drills: [...state.drills, r] }
}

export function makeId(prefix = 'my'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2)
}
