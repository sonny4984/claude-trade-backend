# -*- coding: utf-8 -*-
"""Part 7 — Double Passages (Q176-185, 10 questions, 2 sets)."""

p7_double = [
    # ---------- 176-180 : Advertisement + E-mail ----------
    {
     "intro":"Questions 176-180 refer to the following advertisement and e-mail.",
     "passages":[
        {"doc":"advertisement","html":'''
        <p class="center big">Northside Learning Center &mdash; Fall Workshop Series</p>
        <p class="center">Enhance your professional skills this autumn! Each workshop runs
        6:00&ndash;8:00 P.M.</p>
        <table class="tbl">
          <tr><th>Workshop</th><th>Date</th><th>Fee</th></tr>
          <tr><td>Effective Business Writing</td><td>October 7</td><td>$45</td></tr>
          <tr><td>Public Speaking Essentials</td><td>October 14</td><td>$50</td></tr>
          <tr><td>Data Visualization Basics</td><td>October 21</td><td>$55</td></tr>
          <tr><td>Time Management Strategies</td><td>October 28</td><td>$40</td></tr>
        </table>
        <p>Register for two or more workshops and receive <b>15% off</b> your total. All sessions
        are held at our Downtown campus, Room 210. To register, visit northsidelearning.org.</p>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> register@northsidelearning.org</div>
        <div class="row"><span class="k">From:</span> b.harper@quickmail.com</div>
        <div class="row"><span class="k">Subject:</span> Workshop Registration</div>
        <div class="row"><span class="k">Date:</span> September 25</div>
        </div>
        <p>Hello,</p>
        <p>I would like to sign up for two of your fall workshops: <b>Public Speaking Essentials</b>
        and <b>Time Management Strategies</b>. I understand this qualifies me for the multi-workshop
        discount.</p>
        <p>Could you also tell me whether materials will be provided, or if I should bring my own
        laptop? I plan to attend both sessions in person.</p>
        <p>Thank you,<br>Brian Harper</p>'''},
     ],
     "trans":'''<b>[광고]</b> Northside 러닝 센터 — 가을 워크숍 시리즈. 각 워크숍은 오후 6~8시. 효과적인
        비즈니스 글쓰기(10월 7일, $45), 대중 연설 핵심(10월 14일, $50), 데이터 시각화 기초(10월 21일, $55),
        시간 관리 전략(10월 28일, $40). 두 개 이상 등록 시 총액에서 15% 할인. 모든 세션은 Downtown 캠퍼스
        210호에서 진행.<br><br>
        <b>[이메일]</b> 9월 25일, Brian Harper 발신. 가을 워크숍 중 ‘대중 연설 핵심’과 ‘시간 관리 전략’ 두
        개를 신청하고 싶습니다. 다중 워크숍 할인 대상이 되는 것으로 압니다. 자료가 제공되는지, 아니면 노트북을
        가져가야 하는지 알려주실 수 있나요? 두 세션 모두 직접 참석할 예정입니다.''',
     "questions":[
        {"no":176,"stem":"Why did Mr. Harper send the e-mail?",
         "opts":["To sign up for two workshops","To ask for a refund","To change a workshop date","To apply for a teaching position"],
         "ans":0,"type":"주제·목적",
         "expl":"이메일에서 두 개의 워크숍을 신청하고 싶다고 밝히고 있으므로 <b>두 워크숍 등록</b>이 목적이다."},
        {"no":177,"stem":"According to the advertisement, what do participants who register for multiple workshops receive?",
         "opts":["A free workshop","A 15% discount","A completion certificate","Priority seating"],
         "ans":1,"type":"세부사항",
         "expl":"‘Register for two or more workshops and receive 15% off’에서 <b>15% 할인</b>을 받는다."},
        {"no":178,"stem":"How much will Mr. Harper most likely pay for the workshops?",
         "opts":["$85.00","$90.00","$76.50","$80.75"],
         "ans":2,"type":"연계추론·계산",
         "expl":"[연계] 이메일의 두 워크숍은 대중 연설($50)과 시간 관리($40)로 합계 $90. 다중 등록 15% 할인 적용 시 $90 × 0.85 = <b>$76.50</b>.",
         "opt_why":["할인 미적용 및 계산 오류","할인 전 금액 $90","$90의 15% 할인가 — 정답","계산 근거 없음"]},
        {"no":179,"stem":"What does Mr. Harper ask about?",
         "opts":["The location of the campus","The names of the instructors","The deadline to register","Whether he should bring a laptop"],
         "ans":3,"type":"세부사항",
         "expl":"‘if I should bring my own laptop’에서 <b>노트북 지참 여부</b>를 묻는다."},
        {"no":180,"stem":"On which dates will Mr. Harper attend workshops?",
         "opts":["October 14 and October 28","October 7 and October 21","October 21 and October 28","October 7 and October 14"],
         "ans":0,"type":"연계추론",
         "expl":"[연계] 이메일에서 신청한 ‘대중 연설(10월 14일)’과 ‘시간 관리(10월 28일)’의 날짜를 광고 표에서 확인하면 <b>10월 14일과 28일</b>이다."},
     ],
    },

    # ---------- 181-185 : E-mail + E-mail (order adjustment) ----------
    {
     "intro":"Questions 181-185 refer to the following e-mails.",
     "passages":[
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> orders@brightsupply.com</div>
        <div class="row"><span class="k">From:</span> m.tan@corner-cafe.com</div>
        <div class="row"><span class="k">Subject:</span> Order Adjustment</div>
        <div class="row"><span class="k">Date:</span> March 3</div>
        </div>
        <p>Hi,</p>
        <p>I&rsquo;d like to adjust our monthly order (#4471). Please increase the coffee beans from
        20 to 30 kg and add 5 boxes of paper cups. We are hosting an event on March 20 and need
        everything delivered by March 18 at the latest.</p>
        <p>Also, is the oat milk back in stock yet? We&rsquo;d like 12 cartons if so.</p>
        <p>Thanks,<br>Maria Tan, Corner Caf&eacute;</p>'''},
        {"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> m.tan@corner-cafe.com</div>
        <div class="row"><span class="k">From:</span> orders@brightsupply.com</div>
        <div class="row"><span class="k">Subject:</span> RE: Order Adjustment</div>
        <div class="row"><span class="k">Date:</span> March 4</div>
        </div>
        <p>Dear Ms. Tan,</p>
        <p>Thank you for your message. We&rsquo;ve updated order #4471 with 30 kg of coffee beans and
        5 boxes of paper cups. Both are in stock and will ship to arrive by <b>March 17</b> &mdash;
        a day ahead of your deadline.</p>
        <p>Unfortunately, oat milk is still on backorder and will not be available until early April.
        If you&rsquo;d like, we can substitute our almond milk at the same price. Just let us know.</p>
        <p>Best regards,<br>Devon Price, Bright Supply Co.</p>'''},
     ],
     "trans":'''<b>[이메일 1]</b> 3월 3일, Maria Tan(Corner Café) 발신. 월간 주문(#4471)을 조정하고
        싶습니다. 원두를 20→30kg으로 늘리고 종이컵 5박스를 추가해 주세요. 3월 20일에 행사가 있어 늦어도
        3월 18일까지는 모두 배송돼야 합니다. 그리고 오트밀크는 재입고됐나요? 됐다면 12팩 주문할게요.<br><br>
        <b>[이메일 2]</b> 3월 4일, Devon Price(Bright Supply) 발신. 주문 #4471을 원두 30kg과 종이컵
        5박스로 업데이트했습니다. 둘 다 재고가 있어 마감보다 하루 이른 <b>3월 17일</b>까지 도착하도록 발송합니다.
        아쉽게도 오트밀크는 여전히 입고 대기 상태로 4월 초에야 가능합니다. 원하시면 같은 가격에 아몬드밀크로
        대체해 드릴 수 있으니 알려주세요.''',
     "questions":[
        {"no":181,"stem":"Why did Ms. Tan send the first e-mail?",
         "opts":["To complain about a late delivery","To adjust an existing order","To request a price quote","To cancel a subscription"],
         "ans":1,"type":"주제·목적",
         "expl":"‘I&rsquo;d like to adjust our monthly order’에서 <b>기존 주문 변경</b>이 목적임을 알 수 있다."},
        {"no":182,"stem":"What does Ms. Tan say about March 20?",
         "opts":["It is a public holiday","Her café will be closed","Her café is hosting an event","A payment is due that day"],
         "ans":2,"type":"세부사항",
         "expl":"‘We are hosting an event on March 20’에서 그날 <b>행사를 연다</b>고 했다."},
        {"no":183,"stem":"What problem does Mr. Price mention?",
         "opts":["A price has increased","An address is incorrect","A delivery will be late","One item is currently unavailable"],
         "ans":3,"type":"연계추론",
         "expl":"[연계] Tan이 문의한 오트밀크에 대해 Price는 ‘still on backorder’라고 답한다. 즉 <b>한 품목(오트밀크)이 현재 품절</b>이라는 문제다."},
        {"no":184,"stem":"When will the coffee beans arrive?",
         "opts":["By March 17","By March 18","By March 20","In early April"],
         "ans":0,"type":"세부사항",
         "expl":"‘will ship to arrive by March 17’에서 원두는 <b>3월 17일까지</b> 도착한다."},
        {"no":185,"stem":"What does Mr. Price offer as a substitute?",
         "opts":["A partial refund","Almond milk","Free delivery","Extra paper cups"],
         "ans":1,"type":"세부사항",
         "expl":"‘we can substitute our almond milk at the same price’에서 <b>아몬드밀크</b>를 대체품으로 제안한다."},
     ],
    },
]
