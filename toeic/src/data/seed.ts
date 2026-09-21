import type { Card, ClozeCard, McqCard, PairCard } from '../types'

/* ────────────────────────────────────────────────────────────
   오답 카드는 전부 여기서 관리한다.
   앱에서 [오답 추가] 폼으로 넣은 카드는 localStorage 에 따로 쌓이고,
   이 파일은 "영구 보관용 원본"이다. 손으로 이어 적으면 된다.

   id 는 절대 바꾸지 말 것 — 복습 진행 상태가 id 로 붙어 있다.
   ──────────────────────────────────────────────────────────── */

/** 4지선다 — 실제 시험 문장 */
const mcq: McqCard[] = [
  {
    id: 'ets-t9-108', kind: 'mcq', source: 'ETS T9-108', category: '시간·장소 전치사',
    sentence: 'The company picnic at Floral Park will begin at noon on Saturday and end ___ 4:00 P.M.',
    choices: ['around', 'until', 'outside', 'within'], answer: 'around',
    explanation: 'end around 4 P.M. = 4시쯤 끝나다',
    rule: 'until은 "~까지 계속"이라 end와 결합 불가',
  },
  {
    id: 'ets-t9-112', kind: 'mcq', source: 'ETS T9-112', category: '시간·장소 전치사',
    sentence: 'Austina Gallery is located at the northern end of Arch Street, ___ the Verdigris Bistro.',
    choices: ['opposite', 'except', 'across', 'plus'], answer: 'opposite',
    explanation: 'opposite + 명사 = 맞은편',
    rule: 'across는 from이 있어야 함',
  },
  {
    id: 'ets-t9-114', kind: 'mcq', source: 'ETS T9-114', category: '어휘·연어',
    sentence: 'Once considered a specialty product, shoes made from recycled materials are now ___ available.',
    choices: ['upward', 'widely', 'enough', 'closely'], answer: 'widely',
    explanation: 'widely available = 널리 구할 수 있는',
    rule: 'closely는 related/monitor와 짝',
  },
  {
    id: 'ets-t9-121', kind: 'mcq', source: 'ETS T9-121', category: '수일치',
    sentence: 'Nonprofit groups ___ up to three applications for funding consideration during any given calendar year.',
    choices: ['be submitted', 'submitting', 'submits', 'may submit'], answer: 'may submit',
    explanation: '주어가 복수 groups',
    rule: '빈칸 앞 주어 단수·복수 먼저',
  },
  {
    id: 'ets-t9-124', kind: 'mcq', source: 'ETS T9-124', category: '어휘·연어',
    sentence: 'The ongoing shortage of hardwood has caused the price of certain furniture items to ___.',
    choices: ['drain', 'loop', 'soar', 'fling'], answer: 'soar',
    explanation: '가격이 치솟다',
    rule: 'shortage → soar 세트',
  },
  {
    id: 'ets-t9-126', kind: 'mcq', source: 'ETS T9-126', category: '어휘·연어',
    sentence: 'The customer ___ to buy an extended warranty, so it is not eligible for a free repair.',
    choices: ['rejected', 'neglected', 'omitted', 'dismissed'], answer: 'neglected',
    explanation: 'neglect to V = ~하지 않다',
    rule: 'reject는 to부정사 목적어 불가',
  },
  {
    id: 'ets-t9-127', kind: 'mcq', source: 'ETS T9-127', category: '준동사(-ing·-ed·동명사)',
    sentence: "Although much of the material was technical in nature, the audience appeared to remain ___ throughout Ms. Sharma's presentation.",
    choices: ['engage', 'engaged', 'engagingly', 'engagement'], answer: 'engaged',
    explanation: 'remain + 형용사',
    rule: 'remain·seem·become 뒤는 형용사',
  },
  {
    id: 'ets-t9-128', kind: 'mcq', source: 'ETS T9-128', category: '조건·접속부사',
    sentence: '___ fresh fruit and vegetables, vendors at the Wattville Farm Market also sell various handmade goods.',
    choices: ['Compared with', 'In addition to', 'Rather than', 'As a result of'], answer: 'In addition to',
    explanation: '뒤에 also가 있음',
    rule: 'also 보이면 Rather than 탈락',
  },
  {
    id: 'ets-t8-112', kind: 'mcq', source: 'ETS T8-112', category: '어휘·연어',
    sentence: 'The ___ of electric buses to our current fleet has made commuting much more pleasant.',
    choices: ['replacement', 'addition', 'substitution', 'building'], answer: 'addition',
    explanation: 'the addition of A to B',
    rule: 'substitution은 of A for B',
  },
  {
    id: 'ets-t8-114', kind: 'mcq', source: 'ETS T8-114', category: '어휘·연어',
    sentence: 'The Oak Hill Art Museum offers several ___ exhibits and a series of limited-time exhibits.',
    choices: ['previous', 'permanent', 'inevitable', 'entire'], answer: 'permanent',
    explanation: '상설 ↔ 한시 대조',
    rule: '문장 안의 대조 단어 먼저 찾기',
  },
  {
    id: 'ets-t8-116', kind: 'mcq', source: 'ETS T8-116', category: '품사',
    sentence: 'Customer loyalty programs are ___ for many retail businesses.',
    choices: ['profited', 'profitable', 'profitably', 'profitability'], answer: 'profitable',
    explanation: 'be동사 뒤 보어 = 형용사',
    rule: '해석 금지, 앞뒤 품사만',
  },
  {
    id: 'ets-t8-118', kind: 'mcq', source: 'ETS T8-118', category: '준동사(-ing·-ed·동명사)',
    sentence: 'After extensively ___ our hiring policies, the consultant recommended a simpler process.',
    choices: ['be reviewing', 'reviewed', 'reviewing', 'reviews'], answer: 'reviewing',
    explanation: 'After + V-ing',
    rule: '전치사 뒤 + 목적어 있으면 V-ing',
  },
  {
    id: 'ets-t8-120', kind: 'mcq', source: 'ETS T8-120', category: '품사',
    sentence: 'The company decided to proceed ___ with plans to expand into new sales territories.',
    choices: ['caution', 'cautionary', 'cautious', 'cautiously'], answer: 'cautiously',
    explanation: '동사 proceed 수식 = 부사',
    rule: '일반동사 뒤 빈칸은 부사',
  },
  {
    id: 'ets-t8-129', kind: 'mcq', source: 'ETS T8-129', category: '어휘·연어',
    sentence: 'Collaboration between multiple agencies is ___ challenging, but our project-based consulting can simplify the process for you.',
    choices: ['well', 'often', 'deliberately', 'finally'], answer: 'often',
    explanation: '흔히 어렵다',
    rule: 'well은 형용사 challenging 수식 불가',
  },
  {
    id: 'ets-t8-130', kind: 'mcq', source: 'ETS T8-130', category: '관계사·대명사',
    sentence: "The desserts we had at Giovanni's Bistro were not as delicious as ___ we enjoyed at Monteverdi's Taverna.",
    choices: ['whose', 'those', 'which', 'them'], answer: 'those',
    explanation: '복수 명사 desserts를 되받음',
    rule: '비교 대상 되받기: 단수 that / 복수 those',
  },
  {
    id: 'test5-107', kind: 'mcq', source: 'Test5-107', category: '어휘·연어',
    sentence: 'Last weekend, Terriville Community Center held a ___ game night for neighborhood children.',
    choices: ['removable', 'plentiful', 'lively', 'current'], answer: 'lively',
    explanation: '활기찬 행사',
    rule: 'plentiful은 양이 많은 것(supplies)',
  },
  {
    id: 'test5-111', kind: 'mcq', source: 'Test5-111', category: '어휘·연어',
    sentence: 'Many farmers markets operate on a seasonal ___, opening in spring and closing in late autumn.',
    choices: ['topic', 'basis', 'root', 'sum'], answer: 'basis',
    explanation: 'on a ~ basis = ~한 주기로',
    rule: 'on a + 형용사 + ___ 는 무조건 basis',
  },
  {
    id: 'test5-126', kind: 'mcq', source: 'Test5-126', category: '준동사(-ing·-ed·동명사)',
    sentence: "Mr. Sato will call into the meeting ___ the hotel's wireless network.",
    choices: ['used', 'using', 'use', 'had used'], answer: 'using',
    explanation: '분사구문, 능동',
    rule: '동사 이미 있음 + 접속사 없음 + 뒤에 목적어 → -ing',
  },
  {
    id: 'test5-127', kind: 'mcq', source: 'Test5-127', category: '어휘·연어',
    sentence: 'Not only has Mr. Ogbu ___ worked on the project, but he has also trained Ms. Jeong to continue the work.',
    choices: ['accessibly', 'diligently', 'eventfully', 'completely'], answer: 'diligently',
    explanation: 'work diligently',
    rule: 'completely는 finish/change와 짝',
  },
  {
    id: 'test2-131', kind: 'mcq', source: 'Test2-131', part: 'Part 6', category: '조건·접속부사',
    sentence: 'Everyone loved them! ___, Ms. Sweeney started sharing muffins with anyone who wanted one.',
    choices: ['Now that', 'After all', 'Otherwise', 'Before long'], answer: 'Before long',
    explanation: '머지않아',
    rule: 'Now that은 절이 필요해 콤마 앞 단독 불가',
  },
]

/** 빈칸 입력 */
const cloze: ClozeCard[] = [
  {
    id: 'cz-that-be-1', kind: 'cloze', source: '빈칸', category: 'that절 동사원형',
    prefix: 'suggested that the proposal ___ revised', answer: 'be', meaning: '동사원형',
    explanation: 'suggest that + 주어 + 동사원형',
    rule: '제안·요구·주장 동사의 that절은 (should) 생략 → 동사원형',
  },
  {
    id: 'cz-that-be-2', kind: 'cloze', source: '빈칸', category: 'that절 동사원형',
    prefix: 'recommend that the forms ___ submitted', answer: 'be', meaning: '동사원형',
    explanation: 'recommend that + 주어 + 동사원형',
    rule: '제안·요구·주장 동사의 that절은 (should) 생략 → 동사원형',
  },
  {
    id: 'cz-following', kind: 'cloze', source: '빈칸', category: '준동사(-ing·-ed·동명사)',
    prefix: 'The reception was held ___ the ceremony', answer: 'following', meaning: '~ 후에',
    explanation: 'following = 전치사, 뒤에 명사가 바로 온다',
    rule: '빈칸 뒤에 명사만 있으면 following',
  },
  {
    id: 'cz-followed', kind: 'cloze', source: '빈칸', category: '준동사(-ing·-ed·동명사)',
    prefix: 'The presentation was ___ by a Q&A session', answer: 'followed', meaning: '뒤따르다',
    explanation: 'be followed by = ~가 뒤따르다',
    rule: '빈칸 뒤에 by가 있으면 followed',
  },
]

/* 혼동 짝 — 위 카드들의 판단 규칙에서 뽑아낸 확장분.
   시험에서 실제로 헷갈린 짝이 생기면 같은 형식으로 이어 적으면 된다. */
const pair: PairCard[] = [
  {
    id: 'pr-following-followed', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    sentence: 'The presentation was ___ by a Q&A session.',
    left: 'following', right: 'followed', answer: 'right',
    explanation: 'by가 있으니 be followed by',
    rule: '뒤에 by → followed / 뒤에 명사 → following',
  },
  {
    id: 'pr-that-those', kind: 'pair', source: '혼동 짝', category: '관계사·대명사',
    sentence: 'The desserts here were not as delicious as ___ we had yesterday.',
    left: 'that', right: 'those', answer: 'right',
    explanation: '되받는 명사 desserts가 복수',
    rule: '비교 대상 되받기: 단수 that / 복수 those',
  },
  {
    id: 'pr-opposite-across', kind: 'pair', source: '혼동 짝', category: '시간·장소 전치사',
    sentence: 'The gallery is located ___ the bistro.',
    left: 'opposite', right: 'across', answer: 'left',
    explanation: 'opposite는 바로 명사를 받는다',
    rule: 'across는 from이 있어야 함',
  },
]

export const SEED_CARDS: Card[] = [...mcq, ...cloze, ...pair]
