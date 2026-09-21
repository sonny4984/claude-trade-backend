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
  {
    id: 'cz-05', kind: 'cloze', source: '빈칸', category: '준동사(-ing·-ed·동명사)',
    prefix: 'We recommend ___ in advance', answer: 'booking', meaning: 'recommend + V-ing',
    explanation: 'recommend 뒤 목적어는 V-ing',
    rule: 'recommend·suggest·consider 뒤는 to부정사 불가',
  },
  {
    id: 'cz-06', kind: 'cloze', source: '빈칸', category: '준동사(-ing·-ed·동명사)',
    prefix: 'praised the team ___ completing the project', answer: 'for', meaning: 'praise A for V-ing',
    explanation: 'praise A for V-ing = A를 ~한 것으로 칭찬하다',
    rule: 'praise·thank·blame 은 for와 짝',
  },
  {
    id: 'cz-07', kind: 'cloze', source: '빈칸', category: '준동사(-ing·-ed·동명사)',
    prefix: 'a ___ explanation', answer: 'detailed', meaning: '자세한',
    explanation: 'a detailed explanation = 자세한 설명',
    rule: '명사 앞에서 상태를 꾸미면 -ed',
  },
  {
    id: 'cz-08', kind: 'cloze', source: '빈칸', category: '준동사(-ing·-ed·동명사)',
    prefix: 'a ___ change (답답하게 만드는)', answer: 'frustrating', meaning: '-ing = 감정 유발',
    explanation: '감정을 일으키는 쪽이므로 -ing',
    rule: '-ing = 감정 유발 / -ed = 감정 느낌',
  },
  {
    id: 'cz-09', kind: 'cloze', source: '빈칸', category: '시간·장소 전치사',
    prefix: '___ the meeting (회의 동안)', answer: 'during', meaning: '사건·행사',
    explanation: 'during + 사건·행사 명사',
    rule: 'during 뒤에는 기간이 아니라 사건이 온다',
  },
  {
    id: 'cz-10', kind: 'cloze', source: '빈칸', category: '시간·장소 전치사',
    prefix: '___ July 15', answer: 'on', meaning: '날짜',
    explanation: 'on + 날짜',
    rule: '날짜가 붙으면 on',
  },
  {
    id: 'cz-11', kind: 'cloze', source: '빈칸', category: '시간·장소 전치사',
    prefix: '___ Monday morning', answer: 'on', meaning: '요일이 붙으면 on',
    explanation: 'on Monday morning',
    rule: 'morning이어도 요일이 붙으면 in이 아니라 on',
  },
  {
    id: 'cz-12', kind: 'cloze', source: '빈칸', category: '시간·장소 전치사',
    prefix: '___ the end of each month', answer: 'at', meaning: '시점',
    explanation: 'at + 특정 시점',
    rule: 'the end of ~ 는 시점이므로 at',
  },
  {
    id: 'cz-13', kind: 'cloze', source: '빈칸', category: '시간·장소 전치사',
    prefix: '___ the summer tourist season (내내)', answer: 'throughout', meaning: '~ 동안 내내',
    explanation: 'throughout = 처음부터 끝까지',
    rule: '내내를 뜻하면 during이 아니라 throughout',
  },
  {
    id: 'cz-14', kind: 'cloze', source: '빈칸', category: '관계사·대명사',
    prefix: 'The applicant ___ has experience', answer: 'who', meaning: '뒤에 동사 → who',
    explanation: '사람 선행사 + 뒤에 동사 → 주격 who',
    rule: '빈칸 뒤가 동사면 주격',
  },
  {
    id: 'cz-15', kind: 'cloze', source: '빈칸', category: '관계사·대명사',
    prefix: 'two managers, neither of ___ was available', answer: 'whom', meaning: '전치사·of 뒤 → whom',
    explanation: 'of 뒤는 목적격 whom',
    rule: '전치사·of 뒤에는 who를 쓸 수 없다',
  },
  {
    id: 'cz-16', kind: 'cloze', source: '빈칸', category: '명사절',
    prefix: 'considering ___ to approve the plan', answer: 'whether', meaning: 'whether + to V',
    explanation: 'whether + to V = ~할지 말지',
    rule: 'if는 to부정사와 결합 불가',
  },
  {
    id: 'cz-17', kind: 'cloze', source: '빈칸', category: '명사절',
    prefix: 'decided ___ the changes would be implemented', answer: 'how', meaning: 'how + S + V',
    explanation: 'how + 주어 + 동사 = 어떻게 ~할지',
    rule: '뒤에 완전한 절이 오면 how·that·whether',
  },
  {
    id: 'cz-18', kind: 'cloze', source: '빈칸', category: '조건·접속부사',
    prefix: 'You can use it ___ that you follow the rules', answer: 'provided', meaning: '조건',
    explanation: 'provided that = ~라는 조건이면',
    rule: '조건을 붙이는 that절 앞자리',
  },
  {
    id: 'cz-19', kind: 'cloze', source: '빈칸', category: '조건·접속부사',
    prefix: 'You can stay ___ long as you keep it clean', answer: 'as', meaning: '조건',
    explanation: 'as long as = ~하는 한',
    rule: 'so long as 와 같은 뜻',
  },
  {
    id: 'cz-20', kind: 'cloze', source: '빈칸', category: '고정 전치사',
    prefix: 'compatible ___ older systems', answer: 'with', meaning: '호환',
    explanation: 'be compatible with = ~와 호환되다',
    rule: 'compatible 은 with 고정',
  },
  {
    id: 'cz-21', kind: 'cloze', source: '빈칸', category: '고정 전치사',
    prefix: 'comply ___ regulations', answer: 'with', meaning: '준수',
    explanation: 'comply with = ~를 준수하다',
    rule: 'comply 는 with 고정',
  },
  {
    id: 'cz-22', kind: 'cloze', source: '빈칸', category: '고정 전치사',
    prefix: 'qualified ___ the position', answer: 'for', meaning: '자격',
    explanation: 'be qualified for = ~에 자격이 있다',
    rule: 'qualified 는 for 고정',
  },
  {
    id: 'cz-23', kind: 'cloze', source: '빈칸', category: '고정 전치사',
    prefix: 'regardless ___ the weather', answer: 'of', meaning: '관계없이',
    explanation: 'regardless of = ~와 관계없이',
    rule: 'regardless 는 of 고정',
  },
  {
    id: 'cz-24', kind: 'cloze', source: '빈칸', category: '도치',
    prefix: 'Only after the inspection ___ the equipment approved', answer: 'was', meaning: '도치',
    explanation: 'Only + 부사구가 문두 → 주어·동사 도치',
    rule: 'Only·Not only 가 앞에 나오면 도치',
  },
  {
    id: 'cz-25', kind: 'cloze', source: '빈칸', category: '품사',
    prefix: 'a ___ increase (상당한)', answer: 'considerable', meaning: '명사 앞 형용사',
    explanation: '명사 increase 를 꾸미므로 형용사',
    rule: '명사 앞 → 형용사',
  },
  {
    id: 'cz-26', kind: 'cloze', source: '빈칸', category: '품사',
    prefix: '___ different (상당히)', answer: 'considerably', meaning: '형용사 앞 부사',
    explanation: '형용사 different 를 꾸미므로 부사',
    rule: '형용사 앞 → 부사',
  },
  {
    id: 'cz-27', kind: 'cloze', source: '빈칸', category: '어휘·연어',
    prefix: '___ the discrepancies in the report', answer: 'rectify', meaning: '바로잡다',
    explanation: 'rectify = 잘못된 것을 바로잡다',
    rule: 'discrepancy·error 를 목적어로 받는 동사',
  },
  {
    id: 'cz-28', kind: 'cloze', source: '빈칸', category: '어휘·연어',
    prefix: 'a ___ between the invoice and the shipment', answer: 'discrepancy', meaning: '불일치',
    explanation: 'a discrepancy between A and B = A와 B의 불일치',
    rule: 'between 앞이면 discrepancy',
  },
  {
    id: 'cz-29', kind: 'cloze', source: '빈칸', category: '어휘·연어',
    prefix: 'We are on ___ to send them out Monday', answer: 'track', meaning: '예정대로 진행 중',
    explanation: 'be on track to V = 예정대로 ~할 것이다',
    rule: 'on 과 to 사이면 track',
  },
  {
    id: 'cz-30', kind: 'cloze', source: '빈칸', category: '어휘·연어',
    prefix: '___ a summary to us', answer: 'expedite', meaning: '신속히 처리하다',
    explanation: 'expedite = 신속히 처리해 보내다',
    rule: '빨리 보내달라는 맥락의 동사',
  },
  {
    id: 'cz-31', kind: 'cloze', source: '빈칸', category: '어휘·연어',
    prefix: 'propose additional ___', answer: 'measures', meaning: '조치 = procedures',
    explanation: 'measures = 조치',
    rule: 'measures 와 procedures 는 바꿔 써도 된다',
  },
  {
    id: 'cz-32', kind: 'cloze', source: '빈칸', category: 'LC 어휘',
    prefix: 'start my own ___ (개업)', answer: 'practice', meaning: '개인 사업',
    explanation: 'start one\'s own practice = 개업하다',
    rule: '변호사·의사의 개인 사업은 practice',
  },
  {
    id: 'cz-33', kind: 'cloze', source: '빈칸', category: 'LC 어휘',
    prefix: '___, power tools, and ladders (목재)', answer: 'lumber', meaning: '목재',
    explanation: 'lumber = 목재',
    rule: '공구·사다리와 나란히 나오면 목재',
  },
  {
    id: 'cz-34', kind: 'cloze', source: '빈칸', category: 'LC 어휘',
    prefix: 'Docking at Cairnryan — 이 교통수단은?', answer: 'ferry', meaning: '여객선',
    explanation: 'docking = 접안 → 배',
    rule: 'Docking·port·onboard 가 들리면 ferry',
  },
]

/* 혼동 짝 — 두 표현을 나란히 놓고 단서에 맞는 쪽을 고른다.
   같은 짝이라도 방향을 바꿔 두 장으로 만들어 양쪽 다 물어본다. */
const pair: PairCard[] = [
  {
    id: 'pr-following-followed', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '~ 후에 — 빈칸 뒤에 명사가 바로 온다', left: 'following', right: 'followed', answer: 'left',
    explanation: 'following + 명사 = ~ 후에',
    rule: '뒤에 명사 → following / 뒤에 by → followed',
  },
  {
    id: 'pr-followed-by', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '~가 뒤따르다 — 빈칸 뒤에 by가 온다', left: 'following', right: 'followed', answer: 'right',
    explanation: 'be followed by = ~가 뒤따르다',
    rule: '뒤에 명사 → following / 뒤에 by → followed',
  },
  {
    id: 'pr-frustrating', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '답답하게 만드는 (감정을 일으킴)', left: 'frustrating', right: 'frustrated', answer: 'left',
    explanation: '감정을 일으키는 쪽',
    rule: '-ing = 감정 유발 / -ed = 감정 느낌',
  },
  {
    id: 'pr-engaged', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '몰입한 (감정을 느낌)', left: 'engaging', right: 'engaged', answer: 'right',
    explanation: '감정을 느끼는 쪽',
    rule: '-ing = 감정 유발 / -ed = 감정 느낌',
  },
  {
    id: 'pr-interested', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '흥미를 느끼는 (감정을 느낌)', left: 'interesting', right: 'interested', answer: 'right',
    explanation: '감정을 느끼는 쪽',
    rule: '-ing = 감정 유발 / -ed = 감정 느낌',
  },
  {
    id: 'pr-considering', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '~를 고려하면', left: 'considering', right: 'considered', answer: 'left',
    explanation: 'considering = 고려하면',
    rule: 'considering 고려하면 / considered 고려된',
  },
  {
    id: 'pr-considered', kind: 'pair', source: '혼동 짝', category: '준동사(-ing·-ed·동명사)',
    prompt: '고려된', left: 'considering', right: 'considered', answer: 'right',
    explanation: 'considered = 고려된',
    rule: 'considering 고려하면 / considered 고려된',
  },
  {
    id: 'pr-opposite-across', kind: 'pair', source: '혼동 짝', category: '시간·장소 전치사',
    prompt: '전치사 없이 바로 명사를 받는다', left: 'opposite', right: 'across', answer: 'left',
    explanation: 'opposite + 명사 = 맞은편',
    rule: 'across는 from이 있어야 함',
  },
  {
    id: 'pr-around-until', kind: 'pair', source: '혼동 짝', category: '시간·장소 전치사',
    prompt: '4시쯤 끝나다', left: 'until', right: 'around', answer: 'right',
    explanation: 'end around 4 = 4시쯤 끝나다',
    rule: 'until은 ~까지 계속이라 end와 결합 불가',
  },
  {
    id: 'pr-neglect', kind: 'pair', source: '혼동 짝', category: '어휘·연어',
    prompt: '빈칸 뒤에 to부정사가 온다', left: 'reject', right: 'neglect', answer: 'right',
    explanation: 'neglect to V = ~하지 않다',
    rule: 'reject + 명사 / neglect + to V',
  },
  {
    id: 'pr-widely', kind: 'pair', source: '혼동 짝', category: '어휘·연어',
    prompt: '널리 구할 수 있는', left: 'widely', right: 'closely', answer: 'left',
    explanation: 'widely available',
    rule: 'widely available / closely related',
  },
  {
    id: 'pr-closely', kind: 'pair', source: '혼동 짝', category: '어휘·연어',
    prompt: '밀접하게 관련된', left: 'widely', right: 'closely', answer: 'right',
    explanation: 'closely related',
    rule: 'widely available / closely related',
  },
  {
    id: 'pr-however', kind: 'pair', source: '혼동 짝', category: '조건·접속부사',
    prompt: '콤마 앞에 단독으로 올 수 있다', left: 'However', right: 'Although', answer: 'left',
    explanation: 'However는 A그룹 접속부사',
    rule: 'A그룹은 단독 가능 / B그룹은 절이 필요',
  },
  {
    id: 'pr-instead', kind: 'pair', source: '혼동 짝', category: '조건·접속부사',
    prompt: '앞 내용을 취소하고 대신', left: 'Otherwise', right: 'Instead', answer: 'right',
    explanation: 'Instead = 그 대신',
    rule: 'Otherwise는 앞에 조건이 있어야 한다',
  },
  {
    id: 'pr-throughout', kind: 'pair', source: '혼동 짝', category: '시간·장소 전치사',
    prompt: '처음부터 끝까지 내내', left: 'during', right: 'throughout', answer: 'right',
    explanation: 'throughout = 내내',
    rule: 'during 사건 동안 / throughout 처음부터 끝까지',
  },
  {
    id: 'pr-during', kind: 'pair', source: '혼동 짝', category: '시간·장소 전치사',
    prompt: '회의 동안', left: 'during', right: 'throughout', answer: 'left',
    explanation: 'during + 사건',
    rule: 'during 사건 동안 / throughout 처음부터 끝까지',
  },
  {
    id: 'pr-those', kind: 'pair', source: '혼동 짝', category: '관계사·대명사',
    prompt: '복수 명사를 되받는다', left: 'that', right: 'those', answer: 'right',
    explanation: '복수는 those',
    rule: '비교 대상 되받기: 단수 that / 복수 those',
  },
  {
    id: 'pr-that', kind: 'pair', source: '혼동 짝', category: '관계사·대명사',
    prompt: '단수 명사를 되받는다', left: 'that', right: 'those', answer: 'left',
    explanation: '단수는 that',
    rule: '비교 대상 되받기: 단수 that / 복수 those',
  },
]

export const SEED_CARDS: Card[] = [...mcq, ...cloze, ...pair]
