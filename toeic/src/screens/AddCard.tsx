import { useState } from 'react'
import type { AppState, Card, Category } from '../types'
import { CATEGORIES } from '../types'
import { MAX_ACTIVE, activeCount } from '../lib/srs'
import { addCard, makeId } from '../lib/storage'
import { Button, Field, Screen, inputCls } from '../components/ui'

type Mode = 'mcq' | 'cloze' | 'pair'

export default function AddCard({
  state,
  setState,
  cards,
}: {
  state: AppState
  setState: (fn: (s: AppState) => AppState) => void
  cards: Card[]
}) {
  const [mode, setMode] = useState<Mode>('mcq')
  const [saved, setSaved] = useState<string | null>(null)

  const active = activeCount(cards, state.progress)
  const overCap = active >= MAX_ACTIVE

  // 공통
  const [source, setSource] = useState('')
  const [part, setPart] = useState('')
  const [num, setNum] = useState('')
  const [category, setCategory] = useState<Category>(CATEGORIES[0])
  const [explanation, setExplanation] = useState('')
  const [rule, setRule] = useState('')

  // 4지선다
  const [sentence, setSentence] = useState('')
  const [choices, setChoices] = useState(['', '', '', ''])
  const [answer, setAnswer] = useState('')
  const [myAnswer, setMyAnswer] = useState('')

  // 빈칸
  const [prefix, setPrefix] = useState('')
  const [clozeAnswer, setClozeAnswer] = useState('')
  const [meaning, setMeaning] = useState('')

  // 혼동 짝
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [pairAnswer, setPairAnswer] = useState<'left' | 'right'>('left')

  function reset() {
    setSentence(''); setChoices(['', '', '', '']); setAnswer(''); setMyAnswer('')
    setPrefix(''); setClozeAnswer(''); setMeaning('')
    setLeft(''); setRight(''); setPairAnswer('left')
    setExplanation(''); setRule(''); setNum('')
  }

  function submit() {
    const base = {
      id: makeId(),
      category,
      source: source.trim() || '직접 추가',
      explanation: explanation.trim(),
      rule: rule.trim(),
      ...(part.trim() ? { part: part.trim() } : {}),
      ...(num.trim() ? { number: num.trim() } : {}),
    }

    let card: Card
    if (mode === 'mcq') {
      const cs = choices.map((c) => c.trim()).filter(Boolean)
      if (!sentence.trim() || cs.length < 2 || !answer.trim()) return
      card = {
        ...base, kind: 'mcq', sentence: sentence.trim(), choices: cs, answer: answer.trim(),
        ...(myAnswer.trim() ? { myAnswer: myAnswer.trim() } : {}),
      }
    } else if (mode === 'cloze') {
      if (!prefix.trim() || !clozeAnswer.trim()) return
      card = {
        ...base, kind: 'cloze', prefix: prefix.trim(),
        answer: clozeAnswer.trim(), meaning: meaning.trim(),
      }
    } else {
      if (!sentence.trim() || !left.trim() || !right.trim()) return
      card = {
        ...base, kind: 'pair', prompt: sentence.trim(),
        left: left.trim(), right: right.trim(), answer: pairAnswer,
      }
    }

    setState((s) => addCard(s, card))
    setSaved(mode === 'cloze' ? clozeAnswer.trim() : answer.trim() || left.trim())
    reset()
  }

  return (
    <Screen title="오답 추가">
      {overCap && (
        <p className="mb-4 border-2 border-accent px-3 py-3 text-[15px] font-semibold text-accent">
          활성 카드가 {active}장입니다. {MAX_ACTIVE}장을 넘었으니 먼저 졸업시키는 게 좋습니다.
        </p>
      )}
      {saved && (
        <p className="mb-4 border border-black px-3 py-3 text-[15px]">
          저장했습니다 — {saved}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {([['mcq', '4지선다'], ['cloze', '빈칸'], ['pair', '혼동 짝']] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => { setMode(m); setSaved(null) }}
            className={`min-h-[52px] border text-[15px] font-semibold ${
              mode === m ? 'border-black bg-black text-white' : 'border-black/30 bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Field label="교재·회차">
            <input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="ETS T9" />
          </Field>
          <Field label="파트">
            <input className={inputCls} value={part} onChange={(e) => setPart(e.target.value)} placeholder="Part 5" />
          </Field>
          <Field label="번호">
            <input className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} placeholder="108" inputMode="numeric" />
          </Field>
        </div>

        {mode === 'cloze' ? (
          <>
            <Field label="앞부분 (빈칸은 ___ 로)">
              <input className={inputCls} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="widely ___" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="정답">
                <input className={inputCls} value={clozeAnswer} onChange={(e) => setClozeAnswer(e.target.value)} autoCapitalize="none" />
              </Field>
              <Field label="뜻">
                <input className={inputCls} value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="널리 구할 수 있는" />
              </Field>
            </div>
          </>
        ) : (
          <Field label={mode === 'pair' ? '단서 (뜻이나 조건)' : '문장 (빈칸은 ___ 로)'}>
            <textarea
              className={`${inputCls} min-h-[104px]`}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
            />
          </Field>
        )}

        {mode === 'mcq' && (
          <>
            <div className="grid gap-2">
              <span className="text-[14px] font-semibold">선택지 4개</span>
              {choices.map((c, idx) => (
                <input
                  key={idx}
                  className={inputCls}
                  value={c}
                  autoCapitalize="none"
                  placeholder={`보기 ${idx + 1}`}
                  onChange={(e) => {
                    const next = [...choices]
                    next[idx] = e.target.value
                    setChoices(next)
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="정답">
                <input className={inputCls} value={answer} onChange={(e) => setAnswer(e.target.value)} autoCapitalize="none" />
              </Field>
              <Field label="내가 고른 답">
                <input className={inputCls} value={myAnswer} onChange={(e) => setMyAnswer(e.target.value)} autoCapitalize="none" />
              </Field>
            </div>
          </>
        )}

        {mode === 'pair' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="왼쪽">
                <input className={inputCls} value={left} onChange={(e) => setLeft(e.target.value)} autoCapitalize="none" />
              </Field>
              <Field label="오른쪽">
                <input className={inputCls} value={right} onChange={(e) => setRight(e.target.value)} autoCapitalize="none" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setPairAnswer(side)}
                  className={`min-h-[52px] border text-[15px] font-semibold ${
                    pairAnswer === side ? 'border-accent bg-accent text-white' : 'border-black/30'
                  }`}
                >
                  정답은 {side === 'left' ? '왼쪽' : '오른쪽'}
                </button>
              ))}
            </div>
          </>
        )}

        <Field label="유형">
          <select
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="해설 한 줄">
          <input className={inputCls} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </Field>
        <Field label="판단 규칙 한 줄">
          <input className={inputCls} value={rule} onChange={(e) => setRule(e.target.value)} />
        </Field>

        <Button variant="accent" onClick={submit}>저장</Button>
      </div>
    </Screen>
  )
}
