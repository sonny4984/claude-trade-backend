import { useState } from 'react'
import type { AppState, Card } from '../types'
import { applyReview, newProgress } from '../lib/srs'
import { putProgress } from '../lib/storage'
import { Button, Screen, inputCls } from '../components/ui'

type Phase = 'ask' | 'result'

export default function Review({
  queue,
  state,
  setState,
  onDone,
}: {
  queue: Card[]
  state: AppState
  setState: (fn: (s: AppState) => AppState) => void
  onDone: () => void
}) {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<Phase>('ask')
  const [picked, setPicked] = useState(false)
  const [choice, setChoice] = useState('')
  const [typed, setTyped] = useState('')
  const [tally, setTally] = useState({ correct: 0, total: 0 })

  const card = queue[i]

  if (!card) {
    return (
      <Screen title="복습 끝">
        <div className="border border-black/15 px-4 py-8 text-center">
          <div className="text-[15px] text-black/55">오늘 분량</div>
          <div className="mt-2 text-[34px] font-bold tabular-nums">
            {tally.correct} / {tally.total}
          </div>
        </div>
        <div className="mt-5">
          <Button variant="solid" onClick={onDone}>
            홈으로
          </Button>
        </div>
      </Screen>
    )
  }

  function answer(ok: boolean, shown: string) {
    setPicked(ok)
    setChoice(shown)
    setPhase('result')
  }

  /** 근거를 말할 수 있었는지까지 받고 나서 확정한다 */
  function commit(explained: boolean) {
    const prev = state.progress[card.id] ?? newProgress(card.id)
    const next = applyReview(prev, picked, explained)
    setState((s) => putProgress(s, next))
    setTally((t) => ({ correct: t.correct + (picked && explained ? 1 : 0), total: t.total + 1 }))
    setI((n) => n + 1)
    setPhase('ask')
    setChoice('')
    setTyped('')
  }

  const correctText =
    card.kind === 'mcq' ? card.answer
      : card.kind === 'cloze' ? card.answer
      : card.answer === 'left' ? card.left : card.right

  return (
    <Screen title={`복습 ${i + 1} / ${queue.length}`}>
      <div className="mb-3 flex items-baseline justify-between text-[13px] text-black/50">
        <span>{card.source}{card.part ? ` · ${card.part}` : ''}</span>
        <span>{card.category}</span>
      </div>

      {/* 문제 */}
      {card.kind === 'mcq' && (
        <p className="text-[19px] leading-relaxed">{card.sentence}</p>
      )}
      {card.kind === 'cloze' && (
        <div>
          <p className="text-[19px] leading-relaxed">{card.prefix}</p>
          <p className="mt-1 text-[15px] text-black/55">({card.meaning})</p>
        </div>
      )}
      {card.kind === 'pair' && (
        <p className="text-[19px] leading-relaxed">{card.sentence}</p>
      )}

      {phase === 'ask' ? (
        <div className="mt-5 grid gap-2">
          {card.kind === 'mcq' &&
            card.choices.map((c) => (
              <Button key={c} onClick={() => answer(c === card.answer, c)}>
                {c}
              </Button>
            ))}

          {card.kind === 'cloze' && (
            <>
              <input
                id="cloze-input"
                className={inputCls}
                value={typed}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="답 입력"
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typed.trim())
                    answer(norm(typed) === norm(card.answer), typed.trim())
                }}
              />
              <Button
                variant="solid"
                disabled={!typed.trim()}
                onClick={() => answer(norm(typed) === norm(card.answer), typed.trim())}
              >
                확인
              </Button>
            </>
          )}

          {card.kind === 'pair' && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => answer(card.answer === 'left', card.left)}>{card.left}</Button>
              <Button onClick={() => answer(card.answer === 'right', card.right)}>{card.right}</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <div className={`border-2 px-4 py-3 ${picked ? 'border-black' : 'border-accent'}`}>
            <div className={`text-[17px] font-bold ${picked ? '' : 'text-accent'}`}>
              {picked ? '정답' : '오답'}
            </div>
            {!picked && (
              <div className="mt-1 text-[15px]">
                내 답 <span className="line-through">{choice || '—'}</span> · 정답{' '}
                <b>{correctText}</b>
              </div>
            )}
            {picked && <div className="mt-1 text-[15px]">{correctText}</div>}
          </div>

          <dl className="mt-3 border border-black/15">
            <div className="flex gap-3 border-b border-black/10 px-3 py-3">
              <dt className="w-12 shrink-0 text-[13px] text-black/50">해설</dt>
              <dd className="text-[15px]">{card.explanation}</dd>
            </div>
            <div className="flex gap-3 px-3 py-3">
              <dt className="w-12 shrink-0 text-[13px] text-black/50">규칙</dt>
              <dd className="text-[15px] font-semibold">{card.rule}</dd>
            </div>
          </dl>

          <div className="mt-5">
            <p className="mb-2 text-[16px] font-bold">근거를 말할 수 있었나?</p>
            <p className="mb-3 text-[13px] text-black/55">
              아니오를 고르면 맞혔어도 오답으로 처리합니다.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="solid" onClick={() => commit(true)}>
                예
              </Button>
              <Button variant="accent" onClick={() => commit(false)}>
                아니오
              </Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  )
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
