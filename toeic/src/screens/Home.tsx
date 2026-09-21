import { useMemo } from 'react'
import type { AppState, Card, Category } from '../types'
import { CATEGORIES } from '../types'
import { activeCount, dueCards, isNew, MAX_ACTIVE, today } from '../lib/srs'
import { Bar, Button, Screen, Stat } from '../components/ui'

export default function Home({
  cards,
  state,
  onStart,
}: {
  cards: Card[]
  state: AppState
  onStart: (list: Card[]) => void
}) {
  const day = today()

  const due = useMemo(() => dueCards(cards, state.progress, day), [cards, state.progress, day])

  const newCount = due.filter((c) => {
    const p = state.progress[c.id]
    return !p || isNew(p)
  }).length

  const active = activeCount(cards, state.progress)
  const graduated = cards.length - active

  /** 유형별 누적 정답률 */
  const byCategory = useMemo(() => {
    const acc: Record<string, { c: number; t: number }> = {}
    for (const card of cards) {
      const p = state.progress[card.id]
      if (!p || p.history.length === 0) continue
      const k = card.category
      acc[k] ??= { c: 0, t: 0 }
      for (const h of p.history) {
        acc[k].t += 1
        if (h.correct) acc[k].c += 1
      }
    }
    return CATEGORIES.filter((k) => acc[k]).map((k) => ({
      key: k as Category,
      ...acc[k],
    }))
  }, [cards, state.progress])

  return (
    <Screen title="오늘의 복습">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="오늘 복습" value={String(due.length)} accent={due.length > 0} />
        <Stat label="새 카드" value={String(newCount)} />
        <Stat label="졸업" value={String(graduated)} />
      </div>

      <div className="mt-3 flex items-baseline justify-between border border-black/15 px-3 py-3 text-[14px]">
        <span className="text-black/55">활성 카드</span>
        <span className="tabular-nums">
          <b className={active >= MAX_ACTIVE ? 'text-accent' : ''}>{active}</b>
          <span className="text-black/40"> / {MAX_ACTIVE}</span>
        </span>
      </div>

      <div className="mt-5">
        {due.length > 0 ? (
          <Button variant="accent" onClick={() => onStart(due)}>
            시작 · {due.length}장
          </Button>
        ) : (
          <div className="border border-black/15 px-4 py-8 text-center text-[15px] text-black/55">
            오늘 복습할 카드가 없습니다.
          </div>
        )}
      </div>

      <h2 className="mb-1 mt-8 text-[15px] font-bold">유형별 정답률</h2>
      {byCategory.length === 0 ? (
        <p className="text-[14px] text-black/50">아직 기록이 없습니다.</p>
      ) : (
        <div className="divide-y divide-black/10 border border-black/15 px-3">
          {byCategory.map((r) => (
            <Bar key={r.key} label={r.key} correct={r.c} total={r.t} />
          ))}
        </div>
      )}
    </Screen>
  )
}
