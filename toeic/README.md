# TOEIC 오답 복습

새 문제를 푸는 앱이 아니라, **내가 틀린 것만 반복해서 자동화하는** 개인용 웹앱.

## 실행

```bash
cd toeic
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 검사 + 빌드
```

## Vercel 배포

이 저장소 루트는 별개의 API 프로젝트이므로, Vercel 프로젝트를 새로 만들고
**Root Directory 를 `toeic` 으로** 지정한다. 나머지는 기본값(Vite 자동 감지)으로 둔다.

## 저장

전부 브라우저 `localStorage` (키 `toeic.review.v1`). 서버 없음.
기기 간 동기화는 되지 않는다 — 아이패드와 아이폰은 각각 따로 쌓인다.

## 간격 반복 규칙

| | |
|---|---|
| 스케줄 | 등록 당일 → 1일 후 → 3일 후 → 7일 후 |
| 졸업 | 등록 후 7일 안에 3회 연속 정답 → 보관함으로 빠지고 복습 대상에서 제외 |
| 오답 | 연속 정답 0으로, 다음 복습은 1일 후 |
| 활성 상한 | 150장. 넘으면 오답 추가 화면에서 경고 |

**"근거를 말할 수 있었나?"에서 아니오를 고르면 맞혀도 오답으로 처리**한다.
감으로 맞힌 것을 걸러내기 위한 장치다.

## 품사 드릴

선택지가 **같은 어근**인 문제만 모아 20문제 1세트로 낸다
(`profited / profitable / profitably / profitability` 같은 형태).
대상 문제가 20개보다 적으면 섞어서 반복한다.

틀리면 규칙표에서 해당 줄을 빨간색으로 강조한다. 매칭은 빈칸 앞뒤와 정답의 어미로 판단하며,
표의 어느 줄에도 확실히 해당하지 않으면 **아무 줄도 강조하지 않는다**
(틀린 줄을 강조하느니 안 하는 쪽이 낫다).

18개 미만이면 "내일 반복"이 뜨고, 다음에 드릴 화면을 열 때 안내가 남는다.

## 오답 추가

앱의 **[추가]** 탭에서 넣으면 `localStorage` 에 쌓인다.
영구 보관용 원본은 `src/data/seed.ts` 이며, 형식에 맞춰 직접 이어 적어도 된다.

```ts
{
  id: 'ets-t9-108',            // 절대 바꾸지 말 것 — 복습 진행 상태가 id로 붙는다
  kind: 'mcq',                 // 'mcq' | 'cloze' | 'pair'
  source: 'ETS T9-108',
  category: '시간·장소 전치사', // src/types.ts 의 CATEGORIES 중 하나
  sentence: '... end ___ 4:00 P.M.',
  choices: ['around', 'until', 'outside', 'within'],
  answer: 'around',
  explanation: 'end around 4 P.M. = 4시쯤 끝나다',
  rule: 'until은 "~까지 계속"이라 end와 결합 불가',
}
```

카드 종류별 필드

- `mcq` — `sentence` / `choices` / `answer`
- `cloze` — `prefix` / `answer` / `meaning`
- `pair` — `sentence` / `left` / `right` / `answer: 'left' | 'right'`

## 구조

```
src/
  data/seed.ts      오답 원본 (27장)
  lib/srs.ts        간격 반복·졸업·품사 규칙 매칭
  lib/storage.ts    localStorage 입출력
  screens/          Home · Review · Drill · AddCard · Stats · Part7
  components/ui.tsx 버튼·카드·막대 등 공용 조각
```
