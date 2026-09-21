import { Screen } from '../components/ui'

const TRAPS = [
  {
    tag: 'A',
    title: '목록 항목 바꿔치기',
    action: '목록 옆에 한 글자 메모',
    memo: '받음 / 요청 · 신규 / 기존',
  },
  {
    tag: 'B',
    title: '인물 역할 바꿔치기',
    action: '여백에 이름과 직책을 붙여 적기',
    memo: '이름 = 직책',
  },
  {
    tag: 'C',
    title: '수식어 무시',
    action: '질문의 한정어에 동그라미',
    memo: 'NOT · new · most · first · latest',
  },
]

export default function Part7() {
  return (
    <Screen title="Part 7 체크">
      <section>
        <h2 className="text-[15px] font-bold">마킹 전 확인 문장</h2>
        <div className="mt-2 border-2 border-black px-4 py-5">
          <p className="text-[19px] font-bold leading-relaxed">
            지문 <Blank />에 <Blank />가 <Blank />했다고 했으니까 맞다
          </p>
        </div>
        <ul className="mt-3 grid gap-2 text-[15px] leading-relaxed">
          <li className="border border-black/15 px-3 py-3">
            세 칸이 <b>지문 표현</b>으로 채워지면 마킹
          </li>
          <li className="border-2 border-accent px-3 py-3 text-accent">
            <b>아마 · ~일 테니까</b>가 끼면 재검토
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-bold">함정 3유형</h2>
        <div className="mt-2 grid gap-2">
          {TRAPS.map((t) => (
            <div key={t.tag} className="border border-black/15">
              <div className="flex items-baseline gap-3 border-b border-black/10 px-3 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-accent text-[14px] font-bold text-accent">
                  {t.tag}
                </span>
                <span className="text-[16px] font-bold">{t.title}</span>
              </div>
              <div className="px-3 py-3">
                <p className="text-[15px]">{t.action}</p>
                <p className="mt-1 text-[15px] font-semibold text-accent">{t.memo}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-bold">그 밖에</h2>
        <ul className="mt-2 grid gap-2 text-[15px] leading-relaxed">
          <li className="border border-black/15 px-3 py-3">
            지문 표현과 <b>가장 똑같이 생긴 선택지</b>는 함정 의심
          </li>
          <li className="border border-black/15 px-3 py-3">
            여정 문제는 <b>출발지 - 도착지</b> 먼저 짚기
          </li>
        </ul>
      </section>
    </Screen>
  )
}

function Blank() {
  return <span className="mx-1 inline-block w-16 border-b-2 border-accent align-baseline" />
}
