# -*- coding: utf-8 -*-
"""Part 6 — Text Completion (Q131-146). 100% 신규 창작. 지문별 문장삽입 1개."""

part6 = [
 # ---------- Passage 1 : E-mail (131-134) ----------
 {"intro":"Questions 131-134 refer to the following e-mail.","doc":"e-mail",
  "passage":
    '<div class="hd">'
    '<div class="row"><span class="k">From:</span> events@brightpathconsulting.com</div>'
    '<div class="row"><span class="k">To:</span> t.okonkwo@mailworks.com</div>'
    '<div class="row"><span class="k">Date:</span> April 2</div>'
    '<div class="row"><span class="k">Subject:</span> Your Registration — Leadership Workshop</div>'
    '</div>'
    '<p>Dear Mr. Okonkwo,</p>'
    '<p>Thank you for registering for our two-day Leadership Workshop on May 14–15. We are '
    'pleased to [[131]] your place in the session.</p>'
    '<p>The workshop will be held at the Riverside Conference Center. Because seating is limited, '
    'we recommend arriving at least fifteen minutes early. [[132]]</p>'
    '<p>A light breakfast and lunch will be [[133]] on both days. If you have any dietary '
    'restrictions, please let us know by May 7 so that we can make appropriate arrangements.</p>'
    '<p>We look forward to [[134]] you at the event.</p>'
    '<p class="sig">Best regards,<br>Brightpath Consulting</p>',
  "trans":"수신: Okonkwo 님 / 발신: Brightpath 컨설팅 / 4월 2일 / 제목: 등록 확인 — 리더십 워크숍.<br>"
    "Okonkwo 님께, 5월 14~15일 이틀간의 리더십 워크숍에 등록해 주셔서 감사합니다. 세션의 자리를 "
    "<b>확정해</b> 드리게 되어 기쁩니다. 워크숍은 Riverside 컨퍼런스 센터에서 열립니다. 좌석이 한정되어 "
    "있으니 최소 15분 일찍 도착하시길 권합니다. <b>그러면 체크인하고 자리를 찾을 시간이 됩니다.</b> 양일 "
    "모두 가벼운 아침과 점심이 <b>제공됩니다</b>. 식이 제한이 있으시면 5월 7일까지 알려주시면 적절히 "
    "준비하겠습니다. 행사에서 <b>뵙기를</b> 고대합니다.",
  "questions":[
    {"no":131,"opts":["confirm","confirmed","confirming","confirmation"],"ans":0,"type":"동사·형태",
     "expl":"‘be pleased to + 동사원형’ 구조이므로 원형 <b>confirm</b>(확정하다)."},
    {"no":132,"insert":True,"opts":[
       "The parking garage closes at 6:00 P.M.",
       "Registration for next year is now open.",
       "This will give you time to check in and find your seat.",
       "The keynote speaker has been rescheduled."],
     "ans":2,"type":"문장삽입",
     "expl":"앞 문장 ‘15분 일찍 도착’과 자연스럽게 이어지는 <b>(C)</b>(체크인·착석 시간)가 정답. 나머지는 문맥과 무관하다."},
    {"no":133,"opts":["provide","provided","providing","provides"],"ans":1,"type":"동사·태",
     "expl":"조식·중식이 ‘제공되는’ 대상이므로 ‘will be + 과거분사’ 수동 → <b>provided</b>."},
    {"no":134,"opts":["see","saw","seen","seeing"],"ans":3,"type":"동명사",
     "expl":"‘look forward to + 동명사(~하기를 고대하다)’ → <b>seeing</b>."},
  ]},

 # ---------- Passage 2 : Notice (135-138) ----------
 {"intro":"Questions 135-138 refer to the following notice.","doc":"notice",
  "passage":
    '<p class="center big">New Digital Lending Service</p>'
    '<p class="center">Maple Ridge Public Library</p>'
    '<p>We are excited to announce that Maple Ridge Public Library now offers a digital lending '
    'service. Members can borrow e-books and audiobooks directly from our Web site [[135]] a valid '
    'library card.</p>'
    '<p>The service is available at no cost. [[136]], there are no late fees, as borrowed titles '
    'are automatically returned at the end of the lending period.</p>'
    '<p>To get started, visit our Web site and log in with your membership number. A step-by-step '
    'guide is available on the &ldquo;Help&rdquo; page if you need [[137]]. [[138]]</p>',
  "trans":"공지: 새 디지털 대출 서비스 — Maple Ridge 공공도서관.<br>"
    "Maple Ridge 공공도서관이 이제 디지털 대출 서비스를 제공합니다. 회원은 유효한 도서관 카드를 "
    "<b>이용해</b> 웹사이트에서 전자책과 오디오북을 바로 빌릴 수 있습니다. 이 서비스는 무료입니다. "
    "<b>게다가</b>, 대출한 자료는 대출 기간이 끝나면 자동 반납되므로 연체료가 없습니다. 시작하려면 "
    "웹사이트에 회원 번호로 로그인하세요. <b>도움</b>이 필요하면 ‘도움말' 페이지에 단계별 안내가 있습니다. "
    "<b>이 서비스가 모두에게 독서를 더 편리하게 해 줄 것이라 확신합니다.</b>",
  "questions":[
    {"no":135,"opts":["use","using","uses","used"],"ans":1,"type":"준동사·형태",
     "expl":"‘~을 이용하여’라는 능동의 분사구를 이끄는 <b>using</b>(a valid library card)."},
    {"no":136,"opts":["However","Otherwise","For example","In addition"],"ans":3,"type":"연결어",
     "expl":"‘무료’에 더해 ‘연체료 없음’이라는 추가 혜택을 잇는 <b>In addition</b>(게다가). 역접·예시는 문맥에 안 맞는다."},
    {"no":137,"opts":["assistance","assist","assisting","assists"],"ans":0,"type":"품사·명사",
     "expl":"타동사 need의 목적어 명사 자리 → <b>assistance</b>(도움)."},
    {"no":138,"insert":True,"opts":[
       "The library will be closed for renovations next week.",
       "Printed books must be returned within two weeks.",
       "We are confident it will make reading more convenient for everyone.",
       "Applications for a library card are no longer accepted."],
     "ans":2,"type":"문장삽입",
     "expl":"새 디지털 서비스 안내를 긍정적으로 마무리하는 <b>(C)</b>가 정답. 나머지는 서비스 취지와 모순되거나 무관하다."},
  ]},

 # ---------- Passage 3 : Article (139-142) ----------
 {"intro":"Questions 139-142 refer to the following article.","doc":"article",
  "passage":
    '<p class="center big">Ashcroft Bakery Celebrates Grand Reopening</p>'
    '<p>WESTON (June 3) — After a three-month renovation, Ashcroft Bakery reopened its doors on '
    'Saturday to an enthusiastic crowd. The beloved bakery, which first opened in 1995, has [[139]] '
    'a loyal following over the decades.</p>'
    '<p>Owner Priya Menon said the renovation [[140]] the seating area and added a new outdoor '
    'patio. &ldquo;We wanted to create a more comfortable space for our customers,&rdquo; she '
    'explained. [[141]]</p>'
    '<p>The bakery is also introducing an expanded menu that includes gluten-free and vegan '
    'options. Ms. Menon expects the new offerings to attract a [[142]] range of customers.</p>',
  "trans":"Ashcroft 제과, 재개장 기념<br>"
    "WESTON(6월 3일) — 3개월간의 보수 공사를 마치고 Ashcroft 제과가 토요일 열띤 인파 속에 다시 문을 "
    "열었다. 1995년 처음 문을 연 이 사랑받는 제과점은 수십 년에 걸쳐 충성 고객층을 <b>쌓아 왔다</b>. "
    "주인 Priya Menon은 보수 공사로 좌석 공간을 <b>넓히고</b> 새 야외 테라스를 추가했다고 말했다. "
    "‘고객을 위한 더 편안한 공간을 만들고 싶었다'고 그는 설명했다. <b>재단장으로 이용 가능한 테이블 수가 "
    "거의 두 배가 되었다.</b> 제과점은 글루텐프리·비건 메뉴를 포함한 확장된 메뉴도 선보인다. Menon은 새 "
    "메뉴가 <b>더 폭넓은</b> 고객층을 끌어들일 것으로 기대한다.",
  "questions":[
    {"no":139,"opts":["build","builds","building","built"],"ans":3,"type":"동사·시제",
     "expl":"조동사 has 뒤 현재완료를 완성하는 과거분사 <b>built</b>(‘쌓아 왔다’)."},
    {"no":140,"opts":["expanded","expand","expands","expanding"],"ans":0,"type":"동사·시제",
     "expl":"뒤의 added와 병렬을 이루는 과거시제 <b>expanded</b>(넓혔다)."},
    {"no":141,"insert":True,"opts":[
       "The bakery has decided to reduce its operating hours.",
       "Most of the original recipes have been discontinued.",
       "The redesign nearly doubled the number of available tables.",
       "The building will be sold at the end of the year."],
     "ans":2,"type":"문장삽입",
     "expl":"‘좌석 확장·편안한 공간’ 맥락과 이어지는 <b>(C)</b>(테이블 수 증가)가 정답. 나머지는 재개장·확장 기사와 모순."},
    {"no":142,"opts":["widely","wider","width","widen"],"ans":1,"type":"품사·비교",
     "expl":"명사 range를 수식하는 비교급 형용사 <b>wider</b>(‘a wider range of customers’)."},
  ]},

 # ---------- Passage 4 : Letter (143-146) ----------
 {"intro":"Questions 143-146 refer to the following letter.","doc":"letter",
  "passage":
    '<p>Dear Ms. Fairbanks,</p>'
    '<p>Thank you for being a subscriber to <i>Horizon Monthly</i> for the past two years. We are '
    'writing to inform you that your subscription is [[143]] to expire on August 31.</p>'
    '<p>To ensure uninterrupted delivery, we encourage you to renew before that date. Subscribers '
    'who renew early will receive a complimentary tote bag [[144]] a special discount on the annual '
    'rate.</p>'
    '<p>[[145]] You can renew online in just a few minutes or by calling our customer service line.</p>'
    '<p>We value your [[146]] and hope you will continue to enjoy <i>Horizon Monthly</i>.</p>'
    '<p class="sig">Sincerely,<br>The Horizon Monthly Team</p>',
  "trans":"Fairbanks 님께, 지난 2년간 <i>Horizon Monthly</i>의 구독자가 되어 주셔서 감사합니다. 귀하의 "
    "구독이 8월 31일에 만료될 <b>예정</b>임을 알려드립니다. 중단 없는 배송을 위해 그 전에 갱신하시길 "
    "권합니다. 일찍 갱신하는 구독자에게는 무료 토트백<b>과 함께</b> 연간 요금 특별 할인을 드립니다. "
    "<b>구독 갱신은 아주 간단합니다.</b> 온라인에서 몇 분이면 갱신하거나 고객 서비스로 전화하시면 됩니다. "
    "귀하의 <b>성원(loyalty)</b>에 감사드리며 <i>Horizon Monthly</i>를 계속 즐겨 주시길 바랍니다.",
  "questions":[
    {"no":143,"opts":["able","willing","due","eager"],"ans":2,"type":"어휘·관용",
     "expl":"‘be <b>due</b> to + 동사원형(~할 예정이다)’으로 만료 예정을 나타낸다. able/willing/eager는 사람의 성향을 나타내 부적합.",
     "opt_why":["‘~할 수 있는’(사람 주어)","‘기꺼이 ~하는’","‘~할 예정인’(be due to) — 정답","‘~을 열망하는’"]},
    {"no":144,"opts":["as well as","instead of","rather than","in case of"],"ans":0,"type":"어휘·구",
     "expl":"토트백과 할인 ‘둘 다’ 받으므로 ‘~뿐만 아니라·게다가’의 <b>as well as</b>. instead of·rather than은 대체를 뜻해 부적합."},
    {"no":145,"insert":True,"opts":[
       "We apologize for the recent delivery delays.",
       "Print subscriptions are no longer available.",
       "Your feedback will be shared with our editorial team.",
       "Renewing your subscription could not be easier."],
     "ans":3,"type":"문장삽입",
     "expl":"뒤 문장 ‘온라인에서 몇 분이면 갱신 가능’으로 이어지는 <b>(D)</b>(갱신이 아주 쉽다)가 정답."},
    {"no":146,"opts":["loyal","loyalty","loyally","loyalties"],"ans":1,"type":"품사·명사",
     "expl":"타동사 value의 목적어이자 소유격 your 뒤 명사 → <b>loyalty</b>(성원·충성). 불가산으로 쓴다."},
  ]},
]
