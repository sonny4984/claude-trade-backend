import { useEffect, useMemo, useState } from 'react'
import type { AppState, Card } from './types'
import { allCards, ensureProgress, load, save } from './lib/storage'
import Home from './screens/Home'
import Review from './screens/Review'
import Drill from './screens/Drill'
import AddCard from './screens/AddCard'
import Stats from './screens/Stats'
import Reference from './screens/Reference'

export type Tab = 'home' | 'review' | 'drill' | 'add' | 'stats' | 'ref'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: '복습' },
  { id: 'drill', label: '품사' },
  { id: 'add', label: '추가' },
  { id: 'stats', label: '통계' },
  { id: 'ref', label: '참고' },
]

export default function App() {
  const [state, setState] = useState<AppState>(() => ensureProgress(load()))
  const [tab, setTab] = useState<Tab>('home')
  /** 복습 세션에 들어갈 카드 목록 — 홈에서 [시작]을 누를 때 확정된다 */
  const [session, setSession] = useState<Card[] | null>(null)

  useEffect(() => {
    save(state)
  }, [state])

  const cards = useMemo(() => allCards(state), [state])

  function go(t: Tab) {
    setSession(null)
    setTab(t)
  }

  return (
    <div className="min-h-dvh bg-white text-black">
      {tab === 'home' && !session && (
        <Home
          cards={cards}
          state={state}
          onStart={(list) => {
            setSession(list)
            setTab('review')
          }}
        />
      )}

      {tab === 'review' && (
        <Review
          queue={session ?? []}
          state={state}
          setState={setState}
          onDone={() => go('home')}
        />
      )}

      {tab === 'drill' && <Drill cards={cards} state={state} setState={setState} />}
      {tab === 'add' && <AddCard state={state} setState={setState} cards={cards} />}
      {tab === 'stats' && <Stats cards={cards} state={state} />}
      {tab === 'ref' && <Reference />}

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-black/15 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-[720px] grid-cols-5">
          {TABS.map((t) => {
            const on = tab === t.id || (t.id === 'home' && tab === 'review')
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`min-h-[58px] text-[14px] font-semibold ${
                  on ? 'text-accent' : 'text-black/50'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
