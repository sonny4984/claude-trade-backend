import { useMemo, useState } from 'react'
import type { AppState, Card, McqCard } from '../types'
import { POS_RULES, matchPosRule, sharesRoot, shuffle, today } from '../lib/srs'
import { addDrill } from '../lib/storage'
import { Button, Screen } from '../components/ui'

const SET_SIZE = 20
const PASS = 18

type Run = {
  queue: McqCard[]
  i: number
  score: number
  wrongRules: number[]
  /** 방금 틀린 규칙 줄. null 이면 문제 푸는 중 */
  showRule: number | null
  done: boolean
}

export default function Drill({
  cards,
  state,
  setState,
}: {
  cards: Card[]
  state: AppState
  setState: (fn: (s: AppState) => AppState) => void
}) {
  const pool = useMemo(
    () => cards.filter((c): c is McqCard => c.kind === 'mcq' && sharesRoot(c.choices)),
    [cards],
  )

  const [run, setRun] = useState<Run | null>(null)

  const lastDrill = state.drills.length ? state.drills[state.drills.length - 1] : null

  function start() {
    if (pool.length === 0) return
    // 대상 문제가 20개보다 적으면 섞어서 반복 출제한다
    const out: McqCard[] = []
    while (out.length < SET_SIZE) out.push(...shuffle(pool))
    setRun({ queue: out.slice(0, SET_SIZE), i: 0, score: 0, wrongRules: [], showRule: null, done: false })
  }

  function finish(score: number, wrongRules: number[]) {
    const missed = [...new Set(wrongRules)].map((r) => POS_RULES[r].when)
    setState((s) => addDrill(s, { date: today(), total: SET_SIZE, correct: score, missedRules: missed }))
  }

  function pick(choice: string) {
    if (!run || run.showRule !== null) return
    const card = run.queue[run.i]
    if (choice === card.answer) {
      advance({ ...run, score: run.score + 1 })
    } else {
      const r = matchPosRule(card.sentence, card.answer)
      setRun({ ...run, wrongRules: r >= 0 ? [...run.wrongRules, r] : run.wrongRules, showRule: r })
    }
  }

  /** 오답 확인 후 다음 문제로 */
  function advance(from: Run) {
    const nextI = from.i + 1
    if (nextI >= SET_SIZE) {
      finish(from.score, from.wrongRules)
      setRun({ ...from, i: nextI, showRule: null, done: true })
    } else {
      setRun({ ...from, i: nextI, showRule: null })
    }
  }

  /* ── 시작 화면 ── */
  if (!run) {
    return (
      <Screen title="품사 드릴">
        <Banner />
        <div className="mt-4 border border-black/15 px-3 py-3 text-[14px]">
          <div className="flex justify-between">
            <span className="text-black/55">대상 문제</span>
            <span className="tabular-nums">{pool.length}개</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-black/50">
            선택지가 같은 어근인 문제만 모읍니다. {SET_SIZE}문제가 안 되면 섞어서 반복합니다.
          </p>
        </div>

        {lastDrill && lastDrill.correct < PASS && (
          <p className="mt-3 border-2 border-accent px-3 py-3 text-[15px] font-semibold text-accent">
            지난 세트 {lastDrill.correct}/{lastDrill.total} — 오늘 다시 한 번
          </p>
        )}

        <div className="mt-5">
          <Button variant="accent" disabled={pool.length === 0} onClick={start}>
            {SET_SIZE}문제 시작
          </Button>
        </div>

        <h2 className="mb-1 mt-8 text-[15px] font-bold">규칙표</h2>
        <RuleTable />
      </Screen>
    )
  }

  /* ── 결과 화면 ── */
  if (run.done) {
    const missed = [...new Set(run.wrongRules)]
    return (
      <Screen title="드릴 결과">
        <div className="border border-black/15 px-4 py-8 text-center">
          <div className={`text-[38px] font-bold tabular-nums ${run.score < PASS ? 'text-accent' : ''}`}>
            {run.score} / {SET_SIZE}
          </div>
          {run.score < PASS && (
            <div className="mt-2 text-[16px] font-semibold text-accent">내일 반복</div>
          )}
        </div>

        <h2 className="mb-1 mt-6 text-[15px] font-bold">틀린 유형</h2>
        {missed.length === 0 ? (
          <p className="text-[14px] text-black/50">없습니다.</p>
        ) : (
          <ul className="border border-black/15">
            {missed.map((r) => (
              <li key={r} className="border-b border-black/10 px-3 py-3 text-[15px] last:border-b-0">
                <span className="font-semibold text-accent">{POS_RULES[r].when}</span>
                <span className="text-black/40"> → </span>
                <b>{POS_RULES[r].then}</b>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid gap-2">
          <Button variant="solid" onClick={start}>한 세트 더</Button>
          <Button onClick={() => setRun(null)}>끝내기</Button>
        </div>
      </Screen>
    )
  }

  /* ── 문제 화면 ── */
  const card = run.queue[run.i]
  return (
    <Screen title={`품사 드릴 ${run.i + 1} / ${SET_SIZE}`}>
      <Banner />
      <p className="mt-4 text-[19px] leading-relaxed">{card.sentence}</p>

      <div className="mt-5 grid gap-2">
        {card.choices.map((c) => (
          <Button key={c} onClick={() => pick(c)} disabled={run.showRule !== null}>
            {c}
          </Button>
        ))}
      </div>

      {run.showRule !== null && (
        <div className="mt-6">
          <p className="text-[16px] font-bold text-accent">오답</p>
          <p className="mt-1 text-[15px]">
            정답 <b>{card.answer}</b>
            <span className="text-black/40"> · </span>
            {card.rule}
          </p>
          <RuleTable highlight={run.showRule} />
          <div className="mt-4">
            <Button variant="solid" onClick={() => advance(run)}>다음</Button>
          </div>
        </div>
      )}
    </Screen>
  )
}

function Banner() {
  return (
    <div className="border-2 border-black px-3 py-3 text-[16px] font-bold">
      해석하지 말고 빈칸 앞뒤 품사만 보기
    </div>
  )
}

function RuleTable({ highlight }: { highlight?: number }) {
  return (
    <table className="mt-3 w-full border-collapse border border-black/15 text-[14px]">
      <tbody>
        {POS_RULES.map((r, idx) => {
          const on = highlight === idx
          return (
            <tr key={r.when} className={on ? 'text-accent' : ''}>
              <td className={`border border-black/10 px-3 py-3 ${on ? 'font-bold' : ''}`}>
                {r.when}
              </td>
              <td className={`w-24 border border-black/10 px-3 py-3 text-right ${on ? 'font-bold' : 'font-semibold'}`}>
                {r.then}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
