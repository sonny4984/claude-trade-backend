# -*- coding: utf-8 -*-
"""Part 7 — Triple Passages (Q186-200, 15 questions, 3 sets)."""

p7_triple = [
    # ---------- 186-190 : Web page + E-mail + E-mail ----------
    {
     "intro":"Questions 186-190 refer to the following web page and e-mails.",
     "passages":[
        {"doc":"web page","html":'''
        <p class="center big">Lakeside Conference Center</p>
        <p class="center">Meeting &amp; Event Spaces</p>
        <table class="tbl">
          <tr><th>Room</th><th>Capacity</th><th>Half-day</th><th>Full-day</th></tr>
          <tr><td>Willow Room</td><td>up to 20</td><td>$200</td><td>$350</td></tr>
          <tr><td>Cedar Room</td><td>up to 50</td><td>$400</td><td>$700</td></tr>
          <tr><td>Lakeview Hall</td><td>up to 120</td><td>$800</td><td>$1,400</td></tr>
        </table>
        <p>All bookings include Wi-Fi, a projector, and complimentary coffee service.
        <b>Nonprofit organizations receive a 20% discount on room rates.</b> To reserve, contact
        our events team.</p>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> events@lakesidecc.com</div>
        <div class="row"><span class="k">From:</span> g.owusu@bridgehope.org</div>
        <div class="row"><span class="k">Subject:</span> Room Booking for June 12</div>
        </div>
        <p>Hello,</p>
        <p>We are planning a full-day training session on June 12 for approximately 45 participants.
        Bridge Hope is a registered nonprofit organization. Could you recommend a suitable room and
        let us know the cost? We would also need lunch catering for the group, if that is available.</p>
        <p>Best,<br>Gabriel Owusu</p>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> g.owusu@bridgehope.org</div>
        <div class="row"><span class="k">From:</span> events@lakesidecc.com</div>
        <div class="row"><span class="k">Subject:</span> RE: Room Booking for June 12</div>
        </div>
        <p>Dear Mr. Owusu,</p>
        <p>Thank you for your interest. For a group of 45, the <b>Cedar Room</b> would be the best
        fit. For a full day, and with your discount applied, your room rate comes to <b>$560</b>.</p>
        <p>We also offer lunch catering at $18 per person, which can be arranged separately. Please
        confirm by May 20 to secure your date.</p>
        <p>Best regards,<br>Lakeside Events Team</p>'''},
     ],
     "trans":'''<b>[웹페이지]</b> Lakeside 컨퍼런스 센터 — 회의·행사 공간. Willow Room(최대 20명, 반일
        $200/종일 $350), Cedar Room(최대 50명, 반일 $400/종일 $700), Lakeview Hall(최대 120명, 반일
        $800/종일 $1,400). 모든 예약에 Wi-Fi, 프로젝터, 무료 커피 제공. <b>비영리 단체는 대실료 20% 할인.</b><br><br>
        <b>[이메일 1]</b> Gabriel Owusu 발신. 6월 12일 약 45명 대상 종일 교육을 계획 중입니다. Bridge Hope는
        등록된 비영리 단체입니다. 적합한 방과 비용을 추천해 주시겠어요? 가능하다면 단체 점심 케이터링도 필요합니다.<br><br>
        <b>[이메일 2]</b> Lakeside 행사팀 발신. 45명 규모라면 <b>Cedar Room</b>이 가장 적합합니다. 종일
        기준, 할인 적용 시 대실료는 <b>$560</b>입니다. 점심 케이터링은 1인당 $18로 별도 준비 가능합니다.
        날짜 확정을 위해 5월 20일까지 확인 부탁드립니다.''',
     "questions":[
        {"no":186,"stem":"According to the web page, what is included with all room bookings?",
         "opts":["Lunch catering","A discount for members","Wi-Fi and a projector","Overnight parking"],
         "ans":2,"type":"세부사항",
         "expl":"‘All bookings include Wi-Fi, a projector, and complimentary coffee service’에서 <b>Wi-Fi와 프로젝터</b>가 포함된다."},
        {"no":187,"stem":"Why most likely does the events team recommend the Cedar Room?",
         "opts":["It is the least expensive option","It offers a view of the lake","It is available on short notice","It can hold the expected number of people"],
         "ans":3,"type":"연계추론",
         "expl":"[연계] 이메일에서 참가자가 약 45명인데 웹페이지상 Cedar Room의 수용 인원은 최대 50명이다. 따라서 <b>예상 인원을 수용할 수 있어</b> 추천된다."},
        {"no":188,"stem":"What is suggested about the $560 room rate?",
         "opts":["It reflects a nonprofit discount","It includes lunch catering","It is a half-day rate","It does not include Wi-Fi"],
         "ans":0,"type":"연계추론·계산",
         "expl":"[연계] 웹페이지의 Cedar Room 종일 요금은 $700이고 비영리 20% 할인을 적용하면 $700 × 0.8 = $560. 따라서 이 금액은 <b>비영리 할인이 반영된 것</b>이다.",
         "opt_why":["$700의 20% 할인가 — 정답","점심은 별도 $18/인","$560은 종일 요금","Wi-Fi는 모든 예약에 포함"]},
        {"no":189,"stem":"What is available for an additional fee?",
         "opts":["A larger room","Lunch catering","Audiovisual equipment","Extended hours"],
         "ans":1,"type":"세부사항",
         "expl":"‘lunch catering at $18 per person, which can be arranged separately’에서 <b>점심 케이터링</b>이 별도 비용으로 제공된다."},
        {"no":190,"stem":"What is Mr. Owusu asked to do by May 20?",
         "opts":["Pay the full balance","Reduce the group size","Confirm the reservation","Choose a lunch menu"],
         "ans":2,"type":"세부사항",
         "expl":"‘Please confirm by May 20 to secure your date’에서 5월 20일까지 <b>예약을 확정</b>하라고 한다."},
     ],
    },

    # ---------- 191-195 : Advertisement + Order confirmation + E-mail ----------
    {
     "intro":"Questions 191-195 refer to the following advertisement, order confirmation, and e-mail.",
     "passages":[
        {"doc":"advertisement","html":'''
        <p class="center big">Summit Outdoor Gear &mdash; Anniversary Sale</p>
        <p class="center">Online only, May 1&ndash;15. Use code <b>ANNIV</b> at checkout.</p>
        <table class="tbl">
          <tr><th>Order subtotal</th><th>Discount</th></tr>
          <tr><td>$50 &ndash; $99</td><td>10% off</td></tr>
          <tr><td>$100 &ndash; $199</td><td>15% off</td></tr>
          <tr><td>$200 or more</td><td>20% off + free shipping</td></tr>
        </table>
        <p>Plus, rewards members earn <b>double points</b> on every purchase during the sale!</p>'''},
        {"doc":"order confirmation","html":'''
        <p class="center big">Order Confirmation</p>
        <p class="center">Summit Outdoor Gear &nbsp;|&nbsp; Order #SG-7793 &nbsp;|&nbsp; May 6</p>
        <p>Customer: Nadia Feldman</p>
        <table class="tbl">
          <tr><th>Item</th><th>Price</th></tr>
          <tr><td>Trailblazer Backpack</td><td>$120</td></tr>
          <tr><td>Insulated Water Bottle</td><td>$25</td></tr>
          <tr><td>Hiking Socks (3-pack)</td><td>$15</td></tr>
          <tr><td>Subtotal</td><td>$160</td></tr>
          <tr><td>Discount (code ANNIV)</td><td>&ndash;$24</td></tr>
          <tr><td>Shipping</td><td>$8</td></tr>
          <tr><td><b>Total</b></td><td><b>$144</b></td></tr>
        </table>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> support@summitgear.com</div>
        <div class="row"><span class="k">From:</span> n.feldman@webmail.com</div>
        <div class="row"><span class="k">Subject:</span> Question about order #SG-7793</div>
        <div class="row"><span class="k">Date:</span> May 7</div>
        </div>
        <p>Hello,</p>
        <p>I received my order confirmation and noticed I was charged $8 for shipping. Based on your
        anniversary sale, I expected free shipping. Could you look into this?</p>
        <p>Also, I am a rewards member &mdash; will I still earn double points on this purchase?</p>
        <p>Thank you,<br>Nadia Feldman</p>'''},
     ],
     "trans":'''<b>[광고]</b> Summit Outdoor Gear 창립 기념 세일 — 온라인 한정, 5월 1~15일, 결제 시 코드
        ANNIV. 소계 $50~99: 10% 할인 / $100~199: 15% 할인 / $200 이상: 20% 할인 + 무료 배송. 또한 리워드
        회원은 세일 기간 모든 구매에 <b>포인트 2배</b> 적립!<br><br>
        <b>[주문 확인서]</b> Summit Outdoor Gear, 주문 #SG-7793, 5월 6일. 고객: Nadia Feldman. Trailblazer
        배낭 $120, 보온 물병 $25, 등산 양말(3켤레) $15, 소계 $160, 할인(ANNIV) −$24, 배송비 $8, 합계 $144.<br><br>
        <b>[이메일]</b> 5월 7일, Nadia Feldman 발신. 주문 확인서를 받았는데 배송비 $8이 청구됐네요. 창립
        기념 세일을 보고 무료 배송을 기대했어요. 확인해 주시겠어요? 그리고 저는 리워드 회원인데, 이번 구매에도
        포인트 2배 적립이 되나요?''',
     "questions":[
        {"no":191,"stem":"When does the anniversary sale end?",
         "opts":["May 1","May 6","May 7","May 15"],
         "ans":3,"type":"세부사항",
         "expl":"‘Online only, May 1&ndash;15’에서 세일은 <b>5월 15일</b>에 끝난다."},
        {"no":192,"stem":"What discount rate did Ms. Feldman's order receive?",
         "opts":["15%","10%","20%","25%"],
         "ans":0,"type":"연계추론",
         "expl":"[연계] 주문 소계가 $160이므로 광고의 ‘$100~199: 15% 할인’ 구간에 해당한다. 실제로 할인액 $24는 $160의 <b>15%</b>다."},
        {"no":193,"stem":"What will customer support most likely explain about the shipping charge?",
         "opts":["It was applied by mistake","Her order did not qualify for free shipping","Free shipping ended on May 1","It will be fully refunded"],
         "ans":1,"type":"연계추론·추론",
         "expl":"[연계] 무료 배송은 소계 ‘$200 이상’ 구간의 혜택인데 Feldman의 소계는 $160이다. 따라서 <b>무료 배송 대상이 아니어서</b> 배송비가 정상 청구된 것이다.",
         "opt_why":["실수가 아니라 규정대로 청구됨","소계 $160은 $200 미만이라 무료 배송 대상 아님 — 정답","무료 배송은 금액 조건이지 날짜 문제 아님","오청구가 아니므로 전액 환불 아님"]},
        {"no":194,"stem":"What does Ms. Feldman ask about in addition to shipping?",
         "opts":["A missing item","A return policy","Earning reward points","A gift receipt"],
         "ans":2,"type":"세부사항",
         "expl":"‘will I still earn double points on this purchase?’에서 <b>리워드 포인트 적립</b>에 대해 묻는다."},
        {"no":195,"stem":"What is most likely true about Ms. Feldman's reward points?",
         "opts":["They have expired","They cannot be used online","They were already redeemed","She will earn them at double the usual rate"],
         "ans":3,"type":"연계추론",
         "expl":"[연계] 광고에 따르면 세일 기간 리워드 회원은 포인트 2배 적립을 받고, Feldman은 회원이며 세일 기간(5월 6일)에 구매했으므로 <b>포인트를 2배로 적립</b>받을 것이다."},
     ],
    },

    # ---------- 196-200 : Job posting + E-mail + E-mail ----------
    {
     "intro":"Questions 196-200 refer to the following job posting and e-mails.",
     "passages":[
        {"doc":"job posting","html":'''
        <p class="center big">Assistant Editor &mdash; Meridian Publishing</p>
        <p>Meridian Publishing seeks an Assistant Editor to join our editorial team.</p>
        <p><b>Requirements</b><br>
        &bull; Bachelor&rsquo;s degree in English, journalism, or a related field<br>
        &bull; At least three years of professional editing experience<br>
        &bull; Familiarity with standard style guides</p>
        <p>Please send your r&eacute;sum&eacute; to hr@meridianpub.com by <b>July 10</b>. Note that
        the selected candidate must be available to begin work in <b>September</b>.</p>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> hr@meridianpub.com</div>
        <div class="row"><span class="k">From:</span> l.castellano@mail.com</div>
        <div class="row"><span class="k">Subject:</span> Assistant Editor Application</div>
        <div class="row"><span class="k">Date:</span> July 2</div>
        </div>
        <p>Dear Hiring Manager,</p>
        <p>I am writing to apply for the Assistant Editor position. I hold a bachelor&rsquo;s degree
        in journalism and have spent the past <b>four years</b> as a copy editor at a regional
        magazine, where I regularly worked with the Chicago Manual of Style. I am available to begin
        work in early <b>September</b>. My r&eacute;sum&eacute; is attached.</p>
        <p>Sincerely,<br>Luis Castellano</p>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> l.castellano@mail.com</div>
        <div class="row"><span class="k">From:</span> hr@meridianpub.com</div>
        <div class="row"><span class="k">Subject:</span> Interview Invitation</div>
        <div class="row"><span class="k">Date:</span> July 14</div>
        </div>
        <p>Dear Mr. Castellano,</p>
        <p>Thank you for applying. We were impressed by your editing background and would like to
        invite you to an interview. We have two openings: Tuesday, July 22 at 10:00 A.M. or Thursday,
        July 24 at 2:00 P.M. Please reply with your preferred time. The interview will take place at
        our downtown office and last about an hour.</p>
        <p>Best regards,<br>Priya Shah, HR Manager</p>'''},
     ],
     "trans":'''<b>[채용 공고]</b> Meridian 출판 — 부편집자 모집. [자격] 영어·저널리즘 등 관련 전공 학사,
        전문 편집 경력 <b>3년 이상</b>, 표준 스타일 가이드에 익숙할 것. 이력서를 <b>7월 10일</b>까지 이메일로
        보낼 것. 선발자는 <b>9월</b>에 근무를 시작할 수 있어야 함.<br><br>
        <b>[이메일 1]</b> 7월 2일, Luis Castellano 발신. 부편집자직에 지원합니다. 저널리즘 학사 학위가 있고,
        지난 <b>4년간</b> 지역 잡지에서 카피 에디터로 일하며 시카고 스타일 매뉴얼을 자주 사용했습니다. <b>9월</b>
        초 근무 시작이 가능합니다. 이력서를 첨부합니다.<br><br>
        <b>[이메일 2]</b> 7월 14일, HR 매니저 Priya Shah 발신. 지원 감사합니다. 편집 경력에 깊은 인상을
        받아 면접에 초대합니다. 7월 22일(화) 오전 10시 또는 7월 24일(목) 오후 2시 중 선호 시간을 회신해
        주세요. 면접은 시내 사무실에서 약 1시간 진행됩니다.''',
     "questions":[
        {"no":196,"stem":"What is one requirement listed in the job posting?",
         "opts":["At least three years of editing experience","A master's degree","Fluency in two languages","Willingness to travel abroad"],
         "ans":0,"type":"세부사항",
         "expl":"‘At least three years of professional editing experience’에서 <b>편집 경력 3년 이상</b>이 요건이다."},
        {"no":197,"stem":"What is suggested about Mr. Castellano's editing experience?",
         "opts":["It was gained overseas","It exceeds the stated minimum","It is unrelated to publishing","It is limited to books"],
         "ans":1,"type":"연계추론",
         "expl":"[연계] 공고는 편집 경력 3년 이상을 요구하는데 Castellano는 4년 경력이 있으므로 <b>최소 요건을 초과</b>한다."},
        {"no":198,"stem":"Why is Mr. Castellano able to meet the company's timing requirement?",
         "opts":["He can work remotely","He has flexible hours","He is available to start in September","He has already given notice"],
         "ans":2,"type":"연계추론",
         "expl":"[연계] 공고는 ‘9월 근무 시작 가능자’를 요구하고, Castellano는 ‘9월 초 시작 가능’하다고 밝혔으므로 <b>9월에 시작할 수 있어</b> 조건을 충족한다."},
        {"no":199,"stem":"What is Mr. Castellano asked to do in the third e-mail?",
         "opts":["Submit a writing sample","Provide references","Complete an online form","Indicate his preferred interview time"],
         "ans":3,"type":"세부사항",
         "expl":"‘Please reply with your preferred time’에서 <b>선호하는 면접 시간을 회신</b>하라고 요청한다."},
        {"no":200,"stem":"What is stated about the interview?",
         "opts":["It will be held at the downtown office","It will be conducted by phone","It will last two hours","It will include a written test"],
         "ans":0,"type":"세부사항",
         "expl":"‘The interview will take place at our downtown office’에서 면접은 <b>시내 사무실에서</b> 진행된다."},
     ],
    },
]
