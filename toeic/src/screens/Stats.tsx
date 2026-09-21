import { useMemo } from 'react'
import type { AppState, Card } from '../types'
import { CATEGORIES } from '../types'
import { addDays, today } from '../lib/srs'
import { Bar, Screen } from '../components/ui'

export default function Stats({ cards, state }: { cards: Card[]; state: AppState }) {
  const day = today()

  /** 유형별 누적 정답률 */
  const byCategory = useMemo(() => {
    const acc: Record<string, { c: number; t: number }> = {}
    for (const card of cards) {
      const p = state.progress[card.id]
      if (!p) continue
      for (const h of p.history) {
        acc[card.category] ??= { c: 0, t: 0 }
        acc[card.category].t += 1
        if (h.correct) acc[card.category].c += 1
      }
    }
    return CATEGORIES.filter((k) => acc[k]).map((k) => ({ key: k, ...acc[k] }))
  }, [cards, state.progress])

  /** 최근 7일 복습 수 */
  const last7 = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, n) => addDays(day, n - 6))
    const count: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]))
    for (const p of Object.values(state.progress)) {
      for (const h of p.history) {
        if (h.date in count) count[h.date] += 1
      }
    }
    return days.map((d) => ({ date: d, n: count[d] }))
  }, [state.progress, day])

  const maxDay = Math.max(1, ...last7.map((d) => d.n))
  const weekTotal = last7.reduce((s, d) => s + d.n, 0)

  /** 가장 많이 틀린 카드 TOP 10 */
  const worst = useMemo(() => {
    return cards
      .map((c) => ({ card: c, wrong: state.progress[c.id]?.wrongCount ?? 0 }))
      .filter((r) => r.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, 10)
  }, [cards, state.progress])

  return (
    <Screen title="통계">
      <h2 className="mb-1 text-[15px] font-bold">유형별 누적 정답률</h2>
      {byCategory.length === 0 ? (
        <p className="text-[14px] text-black/50">아직 기록이 없습니다.</p>
      ) : (
        <div className="divide-y divide-black/10 border border-black/15 px-3">
          {byCategory.map((r) => (
            <Bar key={r.key} label={r.key} correct={r.c} total={r.t} />
          ))}
        </div>
      )}

      <h2 className="mb-1 mt-8 text-[15px] font-bold">
        최근 7일 복습 <span className="font-normal text-black/50">합계 {weekTotal}회</span>
      </h2>
      <div className="border border-black/15 px-3 py-4">
        <div className="flex h-28 items-end justify-between gap-2">
          {last7.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[12px] tabular-nums text-black/55">{d.n || ''}</span>
              <div
                className={`w-full ${d.n > 0 ? 'bg-black' : 'bg-black/10'}`}
                style={{ height: `${Math.max(4, (d.n / maxDay) * 80)}px` }}
              />
              <span className="text-[11px] tabular-nums text-black/45">
                {d.date.slice(5).replace('-', '/')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-1 mt-8 text-[15px] font-bold">가장 많이 틀린 카드 TOP 10</h2>
      {worst.length === 0 ? (
        <p className="text-[14px] text-black/50">아직 틀린 카드가 없습니다.</p>
      ) : (
        <ol className="border border-black/15">
          {worst.map((r, idx) => (
            <li key={r.card.id} className="border-b border-black/10 px-3 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-black/50">
                  {idx + 1}. {r.card.source} · {r.card.category}
                </span>
                <span className="shrink-0 text-[14px] font-bold tabular-nums text-accent">
                  {r.wrong}회
                </span>
              </div>
              <p className="mt-1 text-[15px] leading-snug">
                {r.card.kind === 'cloze' ? r.card.prefix : r.card.kind === 'pair' ? r.card.prompt : r.card.sentence}
              </p>
              <p className="mt-1 text-[13px] text-black/55">{r.card.rule}</p>
            </li>
          ))}
        </ol>
      )}
    </Screen>
  )
}
