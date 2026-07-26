# -*- coding: utf-8 -*-
"""Part 6 — Text Completion (Q131-146). 4 passages x 4 blanks."""

part6 = [
    # ---------------- Passage 1 : E-mail (131-134) ----------------
    {
     "intro":"Questions 131-134 refer to the following e-mail.",
     "doc":"e-mail",
     "passage":
        '<div class="hd">'
        '<div class="row"><span class="k">To:</span> All Staff &lt;staff@meridian-corp.com&gt;</div>'
        '<div class="row"><span class="k">From:</span> Daniel Cho, Facilities Manager</div>'
        '<div class="row"><span class="k">Date:</span> July 3</div>'
        '<div class="row"><span class="k">Subject:</span> Upcoming Office Relocation</div>'
        '</div>'
        '<p>Dear Colleagues,</p>'
        '<p>As many of you already know, our company [[131]] to a new headquarters at '
        '400 Riverside Plaza next month. The new building offers considerably more space '
        'and up-to-date facilities.</p>'
        '<p>Over the coming weeks, the facilities team will deliver moving boxes and detailed '
        'instructions to each department. [[132]] Please label every box clearly with your '
        'name and floor number.</p>'
        '<p>We recognize that a move of this scale can be [[133]], and we truly appreciate your '
        'cooperation. If you have any questions about the transition, please [[134]] the '
        'relocation help desk at extension 250.</p>'
        '<p class="sig">Best regards,<br>Daniel Cho, Facilities Manager</p>',
     "trans":
        "수신: 전 직원 / 발신: 시설관리팀장 Daniel Cho / 날짜: 7월 3일 / 제목: 사무실 이전 안내<br>"
        "동료 여러분께, 이미 많은 분들이 아시다시피 우리 회사는 다음 달 400 Riverside Plaza의 새 본사로 "
        "<b>이전할 예정</b>입니다. 새 건물은 훨씬 넓은 공간과 최신 시설을 갖추고 있습니다. "
        "앞으로 몇 주간 시설팀이 각 부서에 이사용 상자와 상세 안내문을 전달할 것입니다. "
        "<b>각 직원은 본인의 업무 공간을 직접 포장할 책임이 있습니다.</b> 모든 상자에는 이름과 층수를 "
        "분명히 적어 주십시오. 이 정도 규모의 이사가 <b>지장을 줄 수 있음</b>을 알고 있으며, 협조에 진심으로 "
        "감사드립니다. 이전 관련 문의는 내선 250번 이전 헬프데스크로 <b>연락해</b> 주십시오. — 시설관리팀장 Daniel Cho",
     "questions":[
        {"no":131,"insert":False,"opts":["relocated","will be relocating","had relocated","relocates"],
         "ans":1,"type":"동사·시제",
         "expl":"뒤에 미래 표지 ‘next month’가 있으므로 미래를 나타내는 <b>will be relocating</b>이 정답. 과거·과거완료·현재시제는 미래 시점과 맞지 않는다."},
        {"no":132,"insert":True,"opts":[
            "The cafeteria will stay open during the renovation.",
            "We have decided to postpone the annual company picnic.",
            "Parking permits are available at the security office.",
            "Each employee is responsible for packing his or her own workspace."],
         "ans":3,"type":"문장삽입",
         "expl":"앞뒤로 ‘상자 전달 → 상자에 이름·층수 기재’ 흐름이므로, 개인이 직접 짐을 싼다는 <b>(D)</b>가 자연스럽게 연결된다. 나머지는 이사 맥락과 무관하다."},
        {"no":133,"insert":False,"opts":["disruptive","affordable","profitable","optional"],
         "ans":0,"type":"어휘·형용사",
         "expl":"‘협조에 감사한다’는 뒷문장과 이어지려면 이사가 ‘지장을 줄 수 있다’는 의미가 되어야 하므로 <b>disruptive</b>가 정답.",
         "opt_why":["‘지장을 주는’ — 정답","‘가격이 알맞은’","‘수익성 있는’","‘선택적인’"]},
        {"no":134,"insert":False,"opts":["contacting","to contact","contact","contacted"],
         "ans":2,"type":"동사·명령문",
         "expl":"‘please + 동사원형’의 명령문 구조이므로 원형 <b>contact</b>가 정답."},
     ],
    },

    # ---------------- Passage 2 : Memo (135-138) ----------------
    {
     "intro":"Questions 135-138 refer to the following memo.",
     "doc":"memo",
     "passage":
        '<div class="hd">'
        '<div class="row"><span class="k">To:</span> All Department Heads</div>'
        '<div class="row"><span class="k">From:</span> Finance Office</div>'
        '<div class="row"><span class="k">Re:</span> New Online Expense System</div>'
        '</div>'
        '<p>Beginning August 1, all expense reports must be submitted through our new online '
        'portal, ExpenseTrack. This platform [[135]] the paper-based process we have relied on '
        'for years.</p>'
        '<p>The system lets employees upload receipts directly from their phones and track '
        'reimbursement status in real time. [[136]], approvals that once took a week can now be '
        'completed in as little as two days.</p>'
        '<p>A series of training sessions [[137]] throughout July to help staff become comfortable '
        'with the portal. Attendance is strongly encouraged. [[138]]</p>',
     "trans":
        "수신: 전 부서장 / 발신: 재무팀 / 제목: 새 온라인 경비 시스템<br>"
        "8월 1일부터 모든 경비 보고서는 새 온라인 포털 ExpenseTrack을 통해 제출해야 합니다. 이 플랫폼은 "
        "수년간 사용해 온 종이 기반 절차를 <b>대체합니다</b>. 이 시스템으로 직원들은 휴대폰에서 바로 영수증을 "
        "올리고 환급 상태를 실시간으로 확인할 수 있습니다. <b>그 결과</b>, 예전에는 일주일이 걸리던 승인이 "
        "이제는 이틀 만에도 완료됩니다. 직원들이 포털에 익숙해지도록 7월 내내 일련의 교육이 <b>열릴 예정입니다</b>. "
        "참석을 적극 권장합니다. <b>아래 링크로 교육 세션을 신청해 주십시오.</b>",
     "questions":[
        {"no":135,"insert":False,"opts":["replaces","replaced","is replaced","replacing"],
         "ans":0,"type":"동사·시제·태",
         "expl":"플랫폼이 종이 절차를 ‘대체한다’는 일반적 사실(능동)이므로 현재시제 <b>replaces</b>가 정답. 주어가 대체를 ‘하는’ 쪽이므로 수동태 is replaced는 부적절."},
        {"no":136,"insert":False,"opts":["However","As a result","Otherwise","In contrast"],
         "ans":1,"type":"연결어",
         "expl":"실시간 처리 → 승인 시간 단축이라는 <b>인과 관계</b>이므로 <b>As a result</b>(그 결과)가 정답. 대조·역접 연결어는 흐름에 맞지 않는다.",
         "opt_why":["역접 ‘그러나’","‘그 결과’ — 정답","‘그렇지 않으면’","‘그에 반해’(대조)"]},
        {"no":137,"insert":False,"opts":["were held","has held","will be held","holding"],
         "ans":2,"type":"동사·시제·태",
         "expl":"교육은 7월에 ‘열릴 예정’인 미래 사건이고 세션은 ‘개최되는’ 대상이므로 미래 수동태 <b>will be held</b>가 정답."},
        {"no":138,"insert":True,"opts":[
            "The cafeteria menu will change next month.",
            "Please register for a session using the link below.",
            "Paper forms are still preferred for large purchases.",
            "The finance office will be closed for all of July."],
         "ans":1,"type":"문장삽입",
         "expl":"바로 앞에서 ‘참석을 권장한다’고 했으므로 신청을 안내하는 <b>(B)</b>가 자연스럽다. (C)는 새 시스템 도입 취지와 모순, (D)는 7월 교육 일정과 모순된다."},
     ],
    },

    # ---------------- Passage 3 : Article (139-142) ----------------
    {
     "intro":"Questions 139-142 refer to the following article.",
     "doc":"article",
     "passage":
        '<p class="center big">Riverside Bakery to Add Three Locations</p>'
        '<p>HARTWELL (July 8) — Riverside Bakery, a beloved local institution, announced '
        'yesterday that it will open three new locations across the region by the end of the '
        'year. Founded in 1998, the bakery has built a [[139]] reputation for its artisan '
        'breads and pastries.</p>'
        '<p>Owner Marta Delgado credits the expansion to steady growth in online orders. '
        '&ldquo;Demand has [[140]] far beyond what we can handle at a single shop,&rdquo; she '
        'said. [[141]] The new branches will each employ about fifteen people, creating dozens '
        'of jobs in the community.</p>'
        '<p>Construction on the first location, in the Fairview district, is [[142]] to begin '
        'next month.</p>',
     "trans":
        "<b>Riverside 제과, 지점 3곳 추가</b><br>"
        "HARTWELL (7월 8일) — 사랑받는 지역 명소 Riverside 제과가 연말까지 지역 내에 새 지점 3곳을 열겠다고 "
        "어제 발표했다. 1998년 설립된 이 제과점은 수제 빵과 페이스트리로 <b>탄탄한</b> 명성을 쌓아 왔다. "
        "주인 Marta Delgado는 확장의 공을 온라인 주문의 꾸준한 성장에 돌렸다. “수요가 단일 매장에서 감당할 수 "
        "있는 수준을 훨씬 넘어 <b>증가했다</b>”고 그는 말했다. <b>이에 발맞춰 제과점은 더 큰 중앙 주방에도 "
        "투자했다.</b> 새 지점들은 각각 약 15명을 고용해 지역에 수십 개의 일자리를 만든다. Fairview 지구의 "
        "첫 번째 지점 공사는 다음 달 시작될 <b>예정</b>이다.",
     "questions":[
        {"no":139,"insert":False,"opts":["strongly","strength","strengthen","strong"],
         "ans":3,"type":"품사·형용사",
         "expl":"명사 reputation을 앞에서 수식하는 <b>형용사</b> 자리이므로 <b>strong</b>(탄탄한)이 정답."},
        {"no":140,"insert":False,"opts":["grew","growing","grow","grown"],
         "ans":3,"type":"동사·시제",
         "expl":"조동사 has 뒤 <b>현재완료</b>를 완성하는 과거분사 <b>grown</b>이 정답. ‘지금까지 증가해 왔다’."},
        {"no":141,"insert":True,"opts":[
            "To keep up, the bakery has also invested in a larger central kitchen.",
            "The original location will close at the end of the month.",
            "Most customers prefer to pay with cash.",
            "The recipe has remained a closely guarded secret."],
         "ans":0,"type":"문장삽입",
         "expl":"‘수요 급증’(앞) → ‘일자리 창출·확장’(뒤)으로 이어지므로, 수요에 대응해 투자했다는 <b>(A)</b>가 논리적 다리 역할을 한다. (B)는 확장 기사와 모순."},
        {"no":142,"insert":False,"opts":["scheduling","schedules","scheduled","schedule"],
         "ans":2,"type":"품사·분사",
         "expl":"‘be scheduled to + 동사원형’(~할 예정이다) 구문. be동사 is 뒤 과거분사 <b>scheduled</b>가 정답."},
     ],
    },

    # ---------------- Passage 4 : Letter (143-146) ----------------
    {
     "intro":"Questions 143-146 refer to the following letter.",
     "doc":"letter",
     "passage":
        '<p>Dear Ms. Bennett,</p>'
        '<p>Thank you for being a valued member of Summit Fitness for the past three years. '
        'Your current membership is [[143]] to expire on September 30.</p>'
        '<p>We would love for you to continue your fitness journey with us. If you renew before '
        'the expiration date, you will [[144]] a ten-percent discount on the annual rate. In '
        'addition, renewing members receive two complimentary personal-training sessions.</p>'
        '<p>[[145]] To renew, simply stop by the front desk or log in to your account online. '
        'Our staff is always [[146]] to answer any questions you may have.</p>'
        '<p class="sig">Sincerely,<br>The Summit Fitness Team</p>',
     "trans":
        "Bennett 님께, 지난 3년간 Summit Fitness의 소중한 회원이 되어 주셔서 감사합니다. 현재 회원권은 "
        "9월 30일에 만료될 <b>예정</b>입니다. 저희와 함께 운동을 계속 이어가시길 바랍니다. 만료일 전에 "
        "갱신하시면 연회비의 10% 할인을 <b>받으시게 됩니다</b>. 또한 갱신 회원께는 무료 개인 트레이닝 2회를 "
        "제공합니다. <b>이 혜택들은 회원님의 성원에 감사드리는 저희의 마음입니다.</b> 갱신은 프런트 데스크에 "
        "들르시거나 온라인 계정에 로그인하시면 됩니다. 저희 직원은 언제든 <b>기꺼이</b> 질문에 답해 드립니다. "
        "— Summit Fitness 팀 드림",
     "questions":[
        {"no":143,"insert":False,"opts":["able","due","willing","eager"],
         "ans":1,"type":"어휘·관용",
         "expl":"‘be <b>due</b> to + 동사원형’(~할 예정이다) 표현으로, 만료 예정일을 나타낸다. able/willing/eager는 사람의 성향을 나타내 부적절.",
         "opt_why":["‘~할 수 있는’(사람 주어)","‘~할 예정인’(be due to) — 정답","‘기꺼이 하는’","‘열망하는’"]},
        {"no":144,"insert":False,"opts":["receiving","received","receive","to receive"],
         "ans":2,"type":"동사·형태",
         "expl":"조동사 will 뒤에는 동사원형이 오므로 <b>receive</b>가 정답."},
        {"no":145,"insert":True,"opts":[
            "These offers are our way of thanking you for your loyalty.",
            "Unfortunately, we are unable to process any refunds.",
            "The gym will be closed for renovations in October.",
            "New members must sign a two-year contract."],
         "ans":0,"type":"문장삽입",
         "expl":"앞에서 할인·무료 세션 등 ‘혜택’을 열거했으므로, 그 혜택을 요약해 감사 인사로 잇는 <b>(A)</b>가 적절하다. 나머지는 갱신 권유 맥락과 어긋난다."},
        {"no":146,"insert":False,"opts":["happily","happiness","happier","happy"],
         "ans":3,"type":"품사·형용사",
         "expl":"be동사 is 뒤 주격보어로 형용사가 필요하고 ‘be happy to + 동사원형’(기꺼이 ~하다) 구조이므로 <b>happy</b>가 정답."},
     ],
    },
]
