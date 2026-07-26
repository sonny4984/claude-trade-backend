# -*- coding: utf-8 -*-
"""Part 7 — Single Passages (Q147-175, 29문항). 100% 신규 창작."""

p7_single = [
 # ---------- 147-148 : Advertisement ----------
 {"intro":"Questions 147-148 refer to the following advertisement.",
  "passages":[{"doc":"advertisement","html":'''
     <p class="center big">Cloudmark Storage Solutions</p>
     <p class="center">Declutter Your Life — Affordable Self-Storage in Riverton</p>
     <p>Whether you&rsquo;re moving, renovating, or simply running out of space, Cloudmark has a
     unit to fit your needs. Choose from compact lockers to large drive-up units, all in a clean,
     climate-controlled facility with 24-hour security.</p>
     <p>New customers receive 50% off their first two months when they sign a six-month lease.
     Reserve online today — no deposit required. Our friendly staff is available seven days a week
     to help you find the perfect fit.</p>
     <p>Visit www.cloudmarkstorage.com or call 555-0164.</p>'''}],
  "trans":"Cloudmark 보관 솔루션 — Riverton의 합리적인 셀프 스토리지. 이사·수리 중이거나 공간이 부족하든, "
    "Cloudmark에는 딱 맞는 창고가 있습니다. 소형 사물함부터 대형 드라이브업 유닛까지, 24시간 보안의 깨끗한 "
    "냉난방 시설에서 선택하세요. 신규 고객은 6개월 계약 시 첫 두 달 50% 할인. 보증금 없이 온라인 예약 "
    "가능하며, 주 7일 직원이 상담해 드립니다.",
  "questions":[
    {"no":147,"stem":"What is being advertised?",
     "opts":["A self-storage facility","A moving company","A home renovation service","A security firm"],
     "ans":0,"type":"주제","expl":"제목의 ‘Affordable Self-Storage’와 ‘a unit to fit your needs’ 등에서 <b>셀프 스토리지 시설</b>을 광고함을 알 수 있다."},
    {"no":148,"stem":"What must customers do to receive the discount?",
     "opts":["Pay a deposit","Reserve by phone","Sign a six-month lease","Refer a friend"],
     "ans":2,"type":"세부사항","expl":"‘50% off ... when they <b>sign a six-month lease</b>’에서 6개월 계약이 할인 조건이다. 보증금은 필요 없다(no deposit required)."},
  ]},

 # ---------- 149-150 : Text-message chain ----------
 {"intro":"Questions 149-150 refer to the following text-message chain.",
  "passages":[{"doc":"text messages","html":'''
     <div class="chat">
     <div class="line"><span class="who">Dana Whitfield</span><span class="time">9:02 A.M.</span><br>
     Morning, Raj. The projector in Conference Room B isn&rsquo;t turning on. I have a client
     presentation at 10.</div>
     <div class="line"><span class="who">Raj Patel</span><span class="time">9:04 A.M.</span><br>
     Oh no. Did you try the backup remote in the drawer?</div>
     <div class="line"><span class="who">Dana Whitfield</span><span class="time">9:05 A.M.</span><br>
     Just did — still nothing. The bulb might be dead.</div>
     <div class="line"><span class="who">Raj Patel</span><span class="time">9:06 A.M.</span><br>
     Conference Room C is free until noon. I&rsquo;ll move your booking there now.</div>
     <div class="line"><span class="who">Dana Whitfield</span><span class="time">9:07 A.M.</span><br>
     You&rsquo;re a lifesaver. Can you also let the front desk know so they direct my client?</div>
     <div class="line"><span class="who">Raj Patel</span><span class="time">9:08 A.M.</span><br>
     Already on it.</div>
     </div>'''}],
  "trans":"Dana(9:02): 라지, B 회의실 프로젝터가 안 켜져요. 10시에 고객 프레젠테이션이 있어요. / "
    "Raj(9:04): 이런. 서랍의 예비 리모컨은 써 봤어요? / Dana(9:05): 방금 했는데 여전히 안 돼요. 전구가 "
    "나갔나 봐요. / Raj(9:06): C 회의실이 정오까지 비어요. 지금 예약을 그리로 옮길게요. / Dana(9:07): "
    "정말 고마워요. 프런트에도 알려서 고객을 안내하게 해 줄 수 있어요? / Raj(9:08): 이미 하고 있어요.",
  "questions":[
    {"no":149,"stem":"Why did Ms. Whitfield contact Mr. Patel?",
     "opts":["To cancel a client meeting","To order a new remote","To book a room herself","To report a malfunctioning projector"],
     "ans":3,"type":"주제·목적","expl":"‘The projector ... isn&rsquo;t turning on’에서 <b>고장 난 프로젝터를 알리려</b> 연락했음을 알 수 있다."},
    {"no":150,"stem":"At 9:08 A.M., what does Mr. Patel most likely mean when he writes, \"Already on it\"?",
     "opts":["He has found a new projector","He is already informing the front desk","He has arrived at the meeting","He will repair the bulb"],
     "ans":1,"type":"의도파악","expl":"바로 앞에서 Dana가 ‘프런트에 알려 달라’고 요청했고, 이에 ‘Already on it(이미 하고 있다)’이라 답했으므로 <b>이미 프런트에 알리는 중</b>이라는 뜻이다."},
  ]},

 # ---------- 151-152 : Notice ----------
 {"intro":"Questions 151-152 refer to the following notice.",
  "passages":[{"doc":"notice","html":'''
     <p class="center big">Parking Lot Resurfacing</p>
     <p class="center">Notice to All Tenants — Brookhaven Apartments</p>
     <p>The main parking lot will be resurfaced on Tuesday, July 8, weather permitting. Work will
     begin at 7:00 A.M. and is expected to finish by 5:00 P.M. During this time, the lot will be
     completely closed to vehicles.</p>
     <p>Tenants may use the temporary parking area on Cedar Street at no charge. Please remove all
     vehicles from the main lot by 10:00 P.M. on Monday, July 7. Any vehicles remaining will be
     towed at the owner&rsquo;s expense.</p>
     <p>We apologize for the inconvenience and appreciate your cooperation.</p>'''}],
  "trans":"주차장 재포장 안내 — Brookhaven 아파트 입주민 여러분께. 본 주차장이 날씨가 허락하면 7월 8일 "
    "화요일에 재포장됩니다. 작업은 오전 7시에 시작해 오후 5시까지 완료될 예정이며, 그동안 주차장은 차량 "
    "출입이 전면 통제됩니다. 입주민은 Cedar가(街)의 임시 주차 구역을 무료로 이용할 수 있습니다. 7월 7일 "
    "월요일 오후 10시까지 본 주차장에서 모든 차량을 <b>빼 주십시오</b>. 남은 차량은 소유주 비용으로 견인됩니다.",
  "questions":[
    {"no":151,"stem":"What is the purpose of the notice?",
     "opts":["To inform tenants of a parking lot closure","To announce a rent change","To advertise new parking spaces","To request payment for towing"],
     "ans":0,"type":"주제·목적","expl":"재포장으로 인한 <b>주차장 폐쇄</b>를 알리는 것이 목적이다."},
    {"no":152,"stem":"What are tenants asked to do by Monday night?",
     "opts":["Register for temporary parking","Pay a resurfacing fee","Report to the front office","Move their vehicles from the main lot"],
     "ans":3,"type":"세부사항","expl":"‘remove all vehicles from the main lot by 10:00 P.M. on Monday’에서 월요일 밤까지 <b>차량을 빼라</b>고 요청한다."},
  ]},

 # ---------- 153-154 : E-mail ----------
 {"intro":"Questions 153-154 refer to the following e-mail.",
  "passages":[{"doc":"e-mail","html":'''
     <div class="hd">
     <div class="row"><span class="k">To:</span> m.delacruz@brightmail.com</div>
     <div class="row"><span class="k">From:</span> support@lumitech.com</div>
     <div class="row"><span class="k">Subject:</span> Your Support Ticket #55831</div>
     <div class="row"><span class="k">Date:</span> September 12</div>
     </div>
     <p>Dear Ms. Dela Cruz,</p>
     <p>Thank you for contacting Lumitech Support regarding the flickering screen on your Model X7
     monitor. Based on your description, this issue is most likely caused by a loose display cable
     rather than a hardware defect.</p>
     <p>We recommend first reseating the cable at both ends, as described in the attached guide. If
     the problem persists, your monitor is still under warranty, and we will arrange a free
     replacement. Simply reply to this message with a photo of the issue, and we will process the
     exchange within three business days.</p>
     <p class="sig">Best regards,<br>Lumitech Customer Support</p>'''}],
  "trans":"수신: Dela Cruz 님 / 발신: Lumitech 지원팀 / 제목: 지원 티켓 #55831 / 9월 12일. Dela Cruz 님께, "
    "Model X7 모니터의 화면 깜빡임 문제로 Lumitech 지원팀에 문의해 주셔서 감사합니다. 설명하신 내용으로 "
    "보아 하드웨어 결함보다는 <b>디스플레이 케이블이 느슨해</b> 생긴 문제일 가능성이 높습니다. 첨부한 안내에 "
    "따라 먼저 케이블 양쪽 끝을 다시 꽂아 보시길 권합니다. 그래도 문제가 계속되면 모니터가 아직 보증 기간이므로 "
    "무료 교체를 진행해 드립니다. 이 메일에 <b>문제 사진을 첨부해 회신</b>해 주시면 3영업일 내 교환을 처리하겠습니다.",
  "questions":[
    {"no":153,"stem":"Why was the e-mail sent?",
     "opts":["To confirm a purchase","To advertise a new monitor","To respond to a technical support request","To request payment"],
     "ans":2,"type":"주제·목적","expl":"‘Thank you for contacting Lumitech Support regarding the flickering screen’에서 <b>기술 지원 문의에 답</b>하는 메일임을 알 수 있다."},
    {"no":154,"stem":"What is Ms. Dela Cruz asked to do if the problem continues?",
     "opts":["Purchase a new cable","Reply with a photo of the issue","Visit a service center","Wait three business days"],
     "ans":1,"type":"세부사항","expl":"‘If the problem persists ... reply to this message with a <b>photo</b> of the issue’에서 문제 지속 시 사진을 첨부해 회신하라고 한다."},
  ]},

 # ---------- 155-157 : Web page (class schedule) ----------
 {"intro":"Questions 155-157 refer to the following Web page.",
  "passages":[{"doc":"web page","html":'''
     <p class="center big">Riverside Community Center — Fall Class Schedule</p>
     <p>Registration for fall classes is now open! All classes run for eight weeks, beginning the
     week of September 15. Space is limited, so early registration is encouraged.</p>
     <table class="tbl">
       <tr><th>Class</th><th>Time</th><th>Fee</th></tr>
       <tr><td>Beginner Pottery</td><td>Mondays, 6:00–8:00 P.M.</td><td>$120</td></tr>
       <tr><td>Watercolor Painting</td><td>Tuesdays, 10:00 A.M.–noon</td><td>$95</td></tr>
       <tr><td>Conversational Spanish</td><td>Wednesdays, 7:00–8:30 P.M.</td><td>$110</td></tr>
       <tr><td>Yoga for All Levels</td><td>Saturdays, 9:00–10:00 A.M.</td><td>$80</td></tr>
     </table>
     <p>Members of the community center receive a 15% discount on all class fees. Materials are
     included in the pottery and painting classes. To register, stop by the front desk or visit our
     Web site.</p>'''}],
  "trans":"Riverside 커뮤니티 센터 — 가을 강좌 일정. 가을 강좌 등록이 시작됐습니다! 모든 강좌는 9월 15일 "
    "주(週)부터 8주간 진행됩니다. 자리가 한정되어 조기 등록을 권합니다. [초급 도자기(월 18~20시, $120) / "
    "수채화(화 10~12시, $95) / 회화 스페인어(수 19~20:30, $110) / 모든 수준 요가(토 9~10시, $80)]. 센터 "
    "회원은 모든 수강료 15% 할인. <b>도자기·회화 강좌는 재료 포함</b>. 등록은 프런트 데스크나 웹사이트에서.",
  "questions":[
    {"no":155,"stem":"What is indicated about the classes?",
     "opts":["They each last eight weeks","They are free for members","They are held every day","They require prior experience"],
     "ans":0,"type":"세부사항","expl":"‘All classes run for <b>eight weeks</b>’에서 각 강좌가 8주간 진행됨을 알 수 있다."},
    {"no":156,"stem":"Which class includes materials?",
     "opts":["Conversational Spanish","Yoga for All Levels","All classes","Watercolor Painting"],
     "ans":3,"type":"세부사항","expl":"‘Materials are included in the pottery and <b>painting</b> classes’에서 회화(Watercolor Painting) 강좌가 재료를 포함한다."},
    {"no":157,"stem":"What do community center members receive?",
     "opts":["Free materials","Priority parking","A 15% discount on fees","An extra class"],
     "ans":2,"type":"세부사항","expl":"‘Members ... receive a <b>15% discount</b> on all class fees’."},
  ]},

 # ---------- 158-160 : Article (sentence insertion) ----------
 {"intro":"Questions 158-160 refer to the following article.",
  "passages":[{"doc":"article","html":'''
     <p class="center big">Weston Launches Farmers&rsquo; Market Downtown</p>
     <p>WESTON (May 2) — The city of Weston opened its first downtown farmers&rsquo; market last
     Saturday, drawing hundreds of visitors to Central Plaza. <b>— [1] —</b> The market features
     more than forty local vendors selling fresh produce, baked goods, and handmade crafts.</p>
     <p>Organizers say the market will run every Saturday from May through October. <b>— [2] —</b>
     &ldquo;We wanted to give local farmers a place to sell directly to the community,&rdquo; said
     market coordinator Helen Cho.</p>
     <p>The city hopes the market will also boost nearby businesses. <b>— [3] —</b> Several downtown
     caf&eacute;s reported their busiest morning of the year. <b>— [4] —</b></p>'''}],
  "trans":"Weston, 도심 파머스 마켓 개장 / WESTON(5월 2일) — Weston시가 지난 토요일 도심 첫 파머스 마켓을 "
    "열어 수백 명의 방문객을 Central Plaza로 불러 모았다. <b>(삽입) 참여 인원은 주최 측의 예상을 훨씬 웃돌았다.</b> "
    "마켓에는 신선한 농산물·구운 음식·수공예품을 파는 40여 개의 지역 상인이 참여한다. 주최 측은 마켓이 5월부터 "
    "10월까지 매주 토요일 열린다고 밝혔다. ‘지역 농민에게 지역사회에 직접 판매할 공간을 주고 싶었다'고 코디네이터 "
    "Helen Cho가 말했다. 시는 마켓이 인근 상권도 활성화하길 기대한다. 실제로 도심 카페 몇 곳은 올해 가장 바쁜 "
    "오전을 보냈다고 전했다.",
  "questions":[
    {"no":158,"stem":"What is the article mainly about?",
     "opts":["A new city park","The opening of a farmers' market","A downtown café","A craft fair"],
     "ans":1,"type":"주제","expl":"제목과 첫 문단에서 도심 <b>파머스 마켓 개장</b>을 다룬다."},
    {"no":159,"stem":"How often will the market operate?",
     "opts":["Every day","Once a month","Only in summer","Every Saturday"],
     "ans":3,"type":"세부사항","expl":"‘the market will run <b>every Saturday</b> from May through October’."},
    {"no":160,"stem":"In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?  \"The turnout far exceeded the organizers' expectations.\"",
     "opts":["[1]","[2]","[3]","[4]"],
     "ans":0,"type":"문장삽입","expl":"‘수백 명이 몰렸다’는 개장 인파를 언급한 첫 문장 바로 뒤 <b>[1]</b>에, ‘참여 인원이 예상을 웃돌았다’가 자연스럽게 이어진다."},
  ]},

 # ---------- 161-163 : Letter (synonym) ----------
 {"intro":"Questions 161-163 refer to the following letter.",
  "passages":[{"doc":"letter","html":'''
     <p class="center big">Fenwick &amp; Associates</p>
     <p class="center">120 Marlow Street, Kingsport</p>
     <p>October 5</p>
     <p>Dear Mr. Abernathy,</p>
     <p>On behalf of everyone at Fenwick &amp; Associates, I would like to thank you for your fifteen
     years of dedicated service. Your contributions to the firm have been invaluable, and your
     leadership on the Hartwell account set a standard for the entire team.</p>
     <p>As you prepare for retirement at the end of this month, we would like to honor your career
     at a farewell luncheon on October 27 at the Grand Overlook Restaurant. Colleagues both current
     and former will be in attendance.</p>
     <p>Please let my assistant know if you have any dietary preferences. We look forward to
     celebrating with you.</p>
     <p class="sig">Warm regards,<br>Diane Fenwick, Managing Partner</p>'''}],
  "trans":"Fenwick & Associates / 10월 5일. Abernathy 님께, Fenwick & Associates 모두를 대신해 지난 "
    "15년간의 헌신적인 근무에 감사드립니다. 회사에 대한 귀하의 기여는 <b>매우 귀중했으며(invaluable)</b>, "
    "Hartwell 건에서 보여주신 리더십은 팀 전체의 기준이 되었습니다. 이달 말 은퇴를 앞두신 만큼, 10월 27일 "
    "Grand Overlook 레스토랑에서 열리는 송별 오찬으로 귀하의 경력을 기리고자 합니다. 현직·전직 동료들이 "
    "참석합니다. 식이 선호가 있으시면 제 비서에게 알려 주십시오.",
  "questions":[
    {"no":161,"stem":"Why was the letter written?",
     "opts":["To offer a promotion","To announce a new account","To honor a retiring employee","To request a reference"],
     "ans":2,"type":"주제·목적","expl":"‘As you prepare for retirement ... honor your career at a farewell luncheon’에서 <b>은퇴하는 직원을 기리기</b> 위한 편지임을 알 수 있다."},
    {"no":162,"stem":"What is suggested about Mr. Abernathy?",
     "opts":["He recently joined the firm","He will lead a new team","He owns the restaurant","He worked on the Hartwell account"],
     "ans":3,"type":"추론","expl":"‘your leadership on the <b>Hartwell account</b>’에서 그가 Hartwell 건을 담당했음을 알 수 있다. 15년 근속이므로 최근 입사는 아니다."},
    {"no":163,"stem":"The word \"invaluable\" in paragraph 1, line 3, is closest in meaning to",
     "opts":["extremely valuable","inexpensive","uncertain","temporary"],
     "ans":0,"type":"동의어","expl":"invaluable은 ‘매우 귀중한’이라는 뜻이므로 <b>extremely valuable</b>이 가장 가깝다. ‘값싼(inexpensive)’은 반대 의미의 함정."},
  ]},

 # ---------- 164-167 : Online chat (multi-person, intention) ----------
 {"intro":"Questions 164-167 refer to the following online chat discussion.",
  "passages":[{"doc":"online chat","html":'''
     <div class="chat">
     <div class="line"><span class="who">Owen Brennan</span><span class="time">1:12 P.M.</span><br>
     Team, marketing needs the final product photos by Thursday for the launch page. Where are we on
     those?</div>
     <div class="line"><span class="who">Sofia Reyes</span><span class="time">1:14 P.M.</span><br>
     The studio shoot is done. I&rsquo;m editing now — about half finished.</div>
     <div class="line"><span class="who">Owen Brennan</span><span class="time">1:15 P.M.</span><br>
     Great. Will you have all twenty images ready by Wednesday?</div>
     <div class="line"><span class="who">Sofia Reyes</span><span class="time">1:16 P.M.</span><br>
     Twenty is tight. I could do fifteen for sure by Wednesday.</div>
     <div class="line"><span class="who">Liam Foster</span><span class="time">1:18 P.M.</span><br>
     Marketing said they only need twelve for the main page. The rest are for the catalog, which
     isn&rsquo;t due until next month.</div>
     <div class="line"><span class="who">Owen Brennan</span><span class="time">1:19 P.M.</span><br>
     That changes things. Sofia, just prioritize the twelve launch images then.</div>
     <div class="line"><span class="who">Sofia Reyes</span><span class="time">1:20 P.M.</span><br>
     Perfect. That I can definitely finish by tomorrow.</div>
     </div>'''}],
  "trans":"Owen(1:12): 팀 여러분, 마케팅이 목요일까지 출시 페이지용 최종 제품 사진이 필요하대요. 진행 상황은요? / "
    "Sofia(1:14): 스튜디오 촬영은 끝났고 지금 편집 중 — 절반쯤 됐어요. / Owen(1:15): 좋아요. 수요일까지 20장 "
    "다 준비될까요? / Sofia(1:16): 20장은 빠듯해요. 수요일까지 15장은 확실히 가능해요. / Liam(1:18): 마케팅은 "
    "메인 페이지에 12장만 필요하대요. 나머지는 카탈로그용인데 다음 달까지예요. / Owen(1:19): 상황이 달라지네요. "
    "Sofia, 그럼 출시용 12장만 우선 처리해요. / Sofia(1:20): 완벽해요. 그건 내일까지 확실히 끝낼 수 있어요.",
  "questions":[
    {"no":164,"stem":"What is the main topic of the discussion?",
     "opts":["Scheduling a photo shoot","Preparing product photos for a launch","Designing a catalog","Hiring a photographer"],
     "ans":1,"type":"주제","expl":"출시 페이지에 쓸 <b>제품 사진 준비</b> 진행 상황을 논의하고 있다."},
    {"no":165,"stem":"What does Mr. Foster clarify?",
     "opts":["The launch has been delayed","The photo shoot must be redone","Marketing needs all twenty images","The catalog is due next month, and only twelve images are needed now"],
     "ans":3,"type":"세부사항","expl":"‘they only need twelve for the main page. The rest are for the catalog, which isn&rsquo;t due until next month’에서 <b>지금은 12장만, 카탈로그는 다음 달</b>임을 확인해 준다."},
    {"no":166,"stem":"At 1:20 P.M., what does Ms. Reyes most likely mean when she writes, \"That I can definitely finish by tomorrow\"?",
     "opts":["She will redo the shoot","She needs more time for all images","She can finish the twelve priority images by tomorrow","She will send the catalog images first"],
     "ans":2,"type":"의도파악","expl":"바로 앞에서 ‘12장만 우선 처리하라’고 했고 이에 동의하며 한 말이므로, <b>우선순위 12장을 내일까지 끝낼 수 있다</b>는 뜻이다."},
    {"no":167,"stem":"What will Ms. Reyes most likely do next?",
     "opts":["Edit the twelve launch images","Photograph twenty products","Design the catalog","Contact the marketing team"],
     "ans":0,"type":"추론","expl":"‘prioritize the twelve launch images’에 동의했으므로 이어서 <b>출시용 12장을 편집</b>할 것이다. (촬영은 이미 끝남)"},
  ]},

 # ---------- 168-171 : Press release (synonym + insertion) ----------
 {"intro":"Questions 168-171 refer to the following press release.",
  "passages":[{"doc":"press release","html":'''
     <p class="center">FOR IMMEDIATE RELEASE</p>
     <p class="center big">Trellis Software Acquires DataNest to Expand Analytics Offerings</p>
     <p>AUSTIN (November 8) — Trellis Software announced today that it has acquired DataNest, a
     fast-growing data analytics startup, for an undisclosed sum. <b>— [1] —</b> The acquisition
     will allow Trellis to integrate advanced analytics tools directly into its existing
     project-management platform.</p>
     <p>&ldquo;DataNest&rsquo;s technology complements our mission of helping teams make smarter
     decisions,&rdquo; said Trellis CEO Marcus Feld. <b>— [2] —</b> All thirty DataNest employees
     will join Trellis and continue working from the Austin office.</p>
     <p>Trellis expects the new features to become available to customers by the second quarter of
     next year. <b>— [3] —</b> Existing subscribers will receive access at no additional cost.
     <b>— [4] —</b></p>
     <p>Founded in 2012, Trellis Software serves more than 5,000 businesses worldwide.</p>'''}],
  "trans":"보도자료 / Trellis 소프트웨어, 분석 역량 확대 위해 DataNest 인수 / AUSTIN(11월 8일) — Trellis "
    "소프트웨어는 빠르게 성장하는 데이터 분석 스타트업 DataNest를 비공개 금액에 인수했다고 오늘 발표했다. "
    "<b>(삽입) 이번 거래는 Trellis 역사상 최대 규모 인수다.</b> 이 인수로 Trellis는 고급 분석 도구를 기존 "
    "프로젝트 관리 플랫폼에 직접 통합할 수 있게 된다. ‘DataNest의 기술은 팀이 더 현명한 결정을 내리도록 돕는 "
    "우리의 사명을 <b>보완한다</b>'고 CEO Marcus Feld가 말했다. <b>(삽입) Feld는 이번 거래로 인한 해고 계획은 "
    "없다고 확인했다.</b> DataNest 직원 30명 전원은 Trellis에 합류해 Austin 사무실에서 계속 근무한다. Trellis는 "
    "새 기능이 내년 2분기까지 고객에게 제공될 것으로 예상한다. 기존 구독자는 추가 비용 없이 이용할 수 있다. "
    "2012년 설립된 Trellis 소프트웨어는 전 세계 5,000개 이상의 기업에 서비스를 제공한다.",
  "questions":[
    {"no":168,"stem":"What did Trellis Software announce?",
     "opts":["A new office in Austin","A price reduction","A partnership with a university","The acquisition of DataNest"],
     "ans":3,"type":"주제","expl":"제목과 첫 문장에서 <b>DataNest 인수</b>를 발표했다."},
    {"no":169,"stem":"What is indicated about DataNest's employees?",
     "opts":["They will be laid off","They will join Trellis and remain in Austin","They will relocate to another city","They will work remotely"],
     "ans":1,"type":"세부사항","expl":"‘All thirty DataNest employees will <b>join Trellis and continue working from the Austin office</b>’."},
    {"no":170,"stem":"The word \"complements\" in paragraph 2, line 1, is closest in meaning to",
     "opts":["completes","replaces","enhances","delays"],
     "ans":2,"type":"동의어","expl":"‘사명을 complement한다’는 ‘더 좋게 보완·강화한다’는 뜻이므로 <b>enhances</b>가 가장 가깝다. 철자가 비슷한 completes(완성하다)는 함정."},
    {"no":171,"stem":"In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?  \"Mr. Feld confirmed that no layoffs are planned as part of the deal.\"",
     "opts":["[1]","[2]","[3]","[4]"],
     "ans":1,"type":"문장삽입","expl":"Feld의 발언 직후이자 ‘직원 30명 전원이 합류한다’는 문장 앞인 <b>[2]</b>에, ‘해고 계획이 없다’가 자연스럽게 이어진다."},
  ]},

 # ---------- 172-175 : Memo (NOT question) ----------
 {"intro":"Questions 172-175 refer to the following memo.",
  "passages":[{"doc":"memo","html":'''
     <div class="hd">
     <div class="row"><span class="k">To:</span> All Staff</div>
     <div class="row"><span class="k">From:</span> Facilities Management</div>
     <div class="row"><span class="k">Subject:</span> Office Move — Action Required</div>
     <div class="row"><span class="k">Date:</span> February 3</div>
     </div>
     <p>As you know, our company will relocate to the new Elm Street office over the weekend of
     March 8–9. To ensure a smooth transition, please review the following:</p>
     <p>&bull; Pack all personal belongings and desk items into the labeled boxes provided by
     Wednesday, March 5. Label each box with your name and department.<br>
     &bull; Back up your computer files to the shared drive. IT will transport all computers and
     monitors; do not attempt to move them yourself.<br>
     &bull; The new office offers free covered parking, a larger cafeteria, and a wellness room.
     Note that the current gym membership benefit will not continue at the new location.</p>
     <p>If you have questions, contact Facilities at extension 300. Boxes can be picked up from the
     supply room starting Monday.</p>'''}],
  "trans":"수신: 전 직원 / 발신: 시설관리팀 / 제목: 사무실 이전 — 조치 필요 / 2월 3일. 아시다시피 회사가 "
    "3월 8~9일 주말에 새 Elm가(街) 사무실로 이전합니다. 원활한 전환을 위해 다음을 확인해 주세요. • 3월 5일 "
    "수요일까지 개인 물품과 책상 물건을 제공된 라벨 상자에 <b>포장</b>하고, 각 상자에 이름과 부서를 표기하세요. "
    "• 컴퓨터 파일을 공유 드라이브에 백업하세요. <b>IT가 모든 컴퓨터·모니터를 옮기니 직접 옮기지 마세요.</b> "
    "• 새 사무실은 무료 지붕 주차장, 더 넓은 구내식당, 웰니스룸을 갖추고 있습니다. 단, 현재의 헬스장 회원 혜택은 "
    "새 장소에서 유지되지 않습니다. 문의는 내선 300, 상자는 월요일부터 비품실에서 가져갈 수 있습니다.",
  "questions":[
    {"no":172,"stem":"What is the purpose of the memo?",
     "opts":["To provide instructions for an office move","To announce a new hire","To reserve parking","To cancel a gym membership"],
     "ans":0,"type":"주제·목적","expl":"사무실 이전을 앞두고 <b>직원이 해야 할 조치를 안내</b>하는 것이 목적이다."},
    {"no":173,"stem":"What are employees asked to do by March 5?",
     "opts":["Move their computers","Visit the new office","Sign up for the wellness room","Pack their belongings into boxes"],
     "ans":3,"type":"세부사항","expl":"‘Pack all personal belongings ... by Wednesday, March 5’에서 3월 5일까지 <b>물품을 상자에 포장</b>하라고 한다."},
    {"no":174,"stem":"What is NOT mentioned as a feature of the new office?",
     "opts":["Covered parking","A fitness gym","A larger cafeteria","A wellness room"],
     "ans":1,"type":"NOT/사실확인","expl":"지붕 주차장·넓은 구내식당·웰니스룸은 새 사무실의 특징으로 언급되지만, <b>헬스장은 오히려 혜택이 중단</b>된다고 했으므로 특징이 아니다.",
     "opt_why":["‘free covered parking’ — 언급됨","헬스장 혜택은 중단됨 — 정답(NOT)","‘a larger cafeteria’ — 언급됨","‘a wellness room’ — 언급됨"]},
    {"no":175,"stem":"What does the memo indicate about computers?",
     "opts":["Employees must move them","They will be replaced","IT will transport them","They should be left at home"],
     "ans":2,"type":"세부사항","expl":"‘IT will transport all computers and monitors; do not attempt to move them yourself’에서 <b>IT가 옮긴다</b>."},
  ]},
]
