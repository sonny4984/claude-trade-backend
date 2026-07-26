# -*- coding: utf-8 -*-
"""Part 7 — Triple Passages (Q186-200, 3세트 15문항). 100% 신규 창작."""

p7_triple = [
 # ---------- 186-190 : Web page + E-mail + E-mail ----------
 {"intro":"Questions 186-190 refer to the following Web page and e-mails.",
  "passages":[
    {"doc":"web page","html":'''
      <p class="center big">Harbor View Event Spaces</p>
      <table class="tbl">
        <tr><th>Room</th><th>Capacity</th><th>Half-day</th><th>Full-day</th></tr>
        <tr><td>Sunset Room</td><td>up to 30</td><td>$250</td><td>$450</td></tr>
        <tr><td>Marina Hall</td><td>up to 80</td><td>$500</td><td>$900</td></tr>
        <tr><td>Grand Ballroom</td><td>up to 200</td><td>$1,200</td><td>$2,000</td></tr>
      </table>
      <p>All rentals include tables, chairs, and basic sound equipment. A 15% discount applies to
      bookings made at least two months in advance. Contact our events team to reserve.</p>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> events@harborview.com</div>
      <div class="row"><span class="k">From:</span> p.nunez@zenithcorp.com</div>
      <div class="row"><span class="k">Subject:</span> Company Anniversary Event</div>
      </div>
      <p>Hello,</p>
      <p>Zenith Corp is planning a full-day event on October 10 to celebrate our anniversary. We
      expect about 70 attendees and will need space for a seated lunch and a presentation. Could you
      recommend a suitable room? We are booking well in advance and would like to know if we qualify
      for any discount. We will also need a projector — is that included?</p>
      <p>Regards,<br>Paula Nunez</p>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> p.nunez@zenithcorp.com</div>
      <div class="row"><span class="k">From:</span> events@harborview.com</div>
      <div class="row"><span class="k">Subject:</span> RE: Company Anniversary Event</div>
      </div>
      <p>Dear Ms. Nunez,</p>
      <p>Thank you for your interest. For 70 guests and a full-day event, the <b>Marina Hall</b>
      would be ideal. Since you are booking more than two months ahead, the early-booking discount
      applies, bringing your rental to <b>$765</b>.</p>
      <p>Tables, chairs, and a sound system are included. A projector is available for a flat fee of
      $50. Please let us know if you would like to proceed, and we will send a contract.</p>
      <p class="sig">Best,<br>Harbor View Events</p>'''},
  ],
  "trans":"<b>[웹페이지]</b> Harbor View 행사 공간. Sunset Room(최대 30명, 반일 $250/종일 $450) / Marina "
    "Hall(최대 80명, 반일 $500/종일 $900) / Grand Ballroom(최대 200명, 반일 $1,200/종일 $2,000). 모든 대여에 "
    "테이블·의자·기본 음향 장비 포함. <b>2개월 이상 전 예약 시 15% 할인</b>.<br><br>"
    "<b>[이메일 1]</b> Paula Nunez 발신. 10월 10일 종일 창립 기념 행사를 계획 중이며 약 <b>70명</b> 참석, "
    "착석 오찬과 발표 공간이 필요합니다. 적합한 방을 추천해 주시겠어요? 충분히 미리 예약하는데 할인 대상인지, "
    "프로젝터가 포함되는지 궁금합니다.<br><br>"
    "<b>[이메일 2]</b> Harbor View 발신. 70명·종일 행사에는 <b>Marina Hall</b>이 이상적입니다. 2개월 이상 전 "
    "예약이므로 조기 예약 할인이 적용되어 대여료는 <b>$765</b>입니다. 테이블·의자·음향 시스템 포함. 프로젝터는 "
    "정액 $50에 이용 가능합니다.",
  "questions":[
    {"no":186,"stem":"According to the Web page, what is included with all rentals?",
     "opts":["Catering","A projector","Parking","Tables, chairs, and sound equipment"],
     "ans":3,"type":"세부사항","expl":"‘All rentals include <b>tables, chairs, and basic sound equipment</b>’."},
    {"no":187,"stem":"Why most likely is the Marina Hall recommended?",
     "opts":["It is the least expensive","It can hold the expected number of guests","It has a projector","It is available only in October"],
     "ans":1,"type":"연계추론","expl":"[연계] 이메일에서 참석자 약 70명인데 웹페이지상 Marina Hall 수용 인원은 최대 80명이다. 따라서 <b>예상 인원을 수용</b>할 수 있어 추천된다."},
    {"no":188,"stem":"What does the $765 rental fee reflect?",
     "opts":["A 15% discount","A half-day rate","An added projector fee","A member rate"],
     "ans":0,"type":"연계추론·계산","expl":"[연계] Marina Hall 종일 요금 $900에 2개월 전 예약 15% 할인을 적용하면 $900 × 0.85 = $765. 즉 <b>15% 할인</b>이 반영된 것이다."},
    {"no":189,"stem":"How much does the projector cost?",
     "opts":["It is free","Included in the discount","$50","$15"],
     "ans":2,"type":"세부사항","expl":"‘A projector is available for a flat fee of <b>$50</b>’."},
    {"no":190,"stem":"What does Ms. Nunez ask about?",
     "opts":["Parking availability","The catering menu","The cancellation policy","Whether they qualify for a discount"],
     "ans":3,"type":"세부사항","expl":"‘would like to know if we <b>qualify for any discount</b>’(및 프로젝터 포함 여부)을 묻는다."},
  ]},

 # ---------- 191-195 : Flyer + E-mail + E-mail ----------
 {"intro":"Questions 191-195 refer to the following flyer and e-mails.",
  "passages":[
    {"doc":"flyer","html":'''
      <p class="center big">Professional Development Series — Spring</p>
      <table class="tbl">
        <tr><th>Session</th><th>Date</th></tr>
        <tr><td>Time Management</td><td>April 5</td></tr>
        <tr><td>Effective Presentations</td><td>April 12</td></tr>
        <tr><td>Negotiation Skills</td><td>April 19</td></tr>
        <tr><td>Financial Literacy</td><td>April 26</td></tr>
      </table>
      <p>Each session runs from 2:00 to 4:00 P.M. in Room 210. Sessions are free for employees, but
      registration is required, as seats are limited to 25 per session. To register, e-mail
      training@company.com with the session name.</p>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> training@company.com</div>
      <div class="row"><span class="k">From:</span> d.osei@company.com</div>
      <div class="row"><span class="k">Subject:</span> Registration</div>
      </div>
      <p>Hi,</p>
      <p>I&rsquo;d like to register for the Negotiation Skills session. I attended the Time
      Management session last year and found it excellent. Also, a colleague mentioned the sessions
      sometimes fill up quickly — if Negotiation Skills is already full, please put me on the
      waitlist and register me for Effective Presentations instead.</p>
      <p>Thanks,<br>Daniel Osei</p>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> d.osei@company.com</div>
      <div class="row"><span class="k">From:</span> training@company.com</div>
      <div class="row"><span class="k">Subject:</span> RE: Registration</div>
      </div>
      <p>Dear Mr. Osei,</p>
      <p>Thank you for registering. Unfortunately, the Negotiation Skills session has reached its
      capacity, so I have added you to the waitlist and confirmed your seat for Effective
      Presentations, as you requested. You will receive a reminder the day before. Please note that
      this session, like all others, takes place in Room 210.</p>
      <p class="sig">Best,<br>Training Team</p>'''},
  ],
  "trans":"<b>[안내문]</b> 봄 직무 개발 시리즈. [시간 관리 — 4월 5일 / 효과적인 발표 — 4월 12일 / 협상 기술 "
    "— 4월 19일 / 금융 이해력 — 4월 26일]. 각 세션은 오후 2~4시 <b>210호</b>에서 진행. 직원은 무료지만 좌석이 "
    "세션당 25석으로 제한되어 등록이 필요. training@company.com으로 세션명을 적어 신청.<br><br>"
    "<b>[이메일 1]</b> Daniel Osei 발신. <b>협상 기술</b> 세션에 등록하고 싶습니다. 작년 시간 관리 세션에 "
    "참석했는데 아주 좋았어요. 동료가 세션이 금방 찬다고 하던데, 협상 기술이 이미 찼다면 대기자 명단에 올리고 "
    "대신 <b>효과적인 발표</b>로 등록해 주세요.<br><br>"
    "<b>[이메일 2]</b> 교육팀 발신. 아쉽게도 협상 기술 세션은 정원이 찼습니다. 그래서 대기자 명단에 올리고, "
    "요청대로 <b>효과적인 발표</b> 좌석을 확정했습니다. 전날 알림을 받으실 겁니다. 이 세션도 다른 세션과 마찬가지로 "
    "210호에서 진행됩니다.",
  "questions":[
    {"no":191,"stem":"Where are the sessions held?",
     "opts":["Room 210","The main auditorium","Online","Room 105"],
     "ans":0,"type":"세부사항","expl":"‘Each session runs ... in <b>Room 210</b>’."},
    {"no":192,"stem":"Which session will Mr. Osei attend?",
     "opts":["Time Management","Negotiation Skills","Effective Presentations","Financial Literacy"],
     "ans":2,"type":"연계추론","expl":"[연계] Osei는 협상 기술을 원했으나 정원이 차서(3번째 이메일), 요청한 대비책인 <b>Effective Presentations</b> 좌석이 확정됐다."},
    {"no":193,"stem":"On what date will Mr. Osei's confirmed session take place?",
     "opts":["April 5","April 19","April 26","April 12"],
     "ans":3,"type":"연계추론","expl":"[연계] 확정된 세션은 Effective Presentations이고, 안내문 표에서 그 날짜는 <b>4월 12일</b>이다."},
    {"no":194,"stem":"What does Mr. Osei mention about a previous session?",
     "opts":["He found it too difficult","He attended it last year and thought it was excellent","He was unable to attend","He taught it"],
     "ans":1,"type":"세부사항","expl":"‘I attended the Time Management session last year and found it <b>excellent</b>’."},
    {"no":195,"stem":"What is Mr. Osei told he will receive?",
     "opts":["A certificate","A reminder the day before","A refund","Course materials"],
     "ans":1,"type":"세부사항","expl":"‘You will receive a <b>reminder the day before</b>’."},
  ]},

 # ---------- 196-200 : Promo + Order confirmation + E-mail ----------
 {"intro":"Questions 196-200 refer to the following advertisement, order confirmation, and e-mail.",
  "passages":[
    {"doc":"advertisement","html":'''
      <p class="center big">Pageturner Books — Summer Reading Sale</p>
      <p class="center">Online only, June 1–30. Use code <b>SUMMER</b> at checkout.</p>
      <table class="tbl">
        <tr><th>Order subtotal</th><th>Reward</th></tr>
        <tr><td>$30 – $49</td><td>Free bookmark set</td></tr>
        <tr><td>$50 – $79</td><td>10% off</td></tr>
        <tr><td>$80 or more</td><td>15% off + free shipping</td></tr>
      </table>
      <p>Loyalty members earn <b>2 points per dollar</b> spent during the sale.</p>'''},
    {"doc":"order confirmation","html":'''
      <p class="center big">Order Confirmation</p>
      <p class="center">Pageturner Books &nbsp;|&nbsp; Order #PB-3092 &nbsp;|&nbsp; June 12</p>
      <p>Customer: Grace Lam</p>
      <table class="tbl">
        <tr><th>Item</th><th>Price</th></tr>
        <tr><td>The Long Horizon (hardcover)</td><td>$32</td></tr>
        <tr><td>Wild Coast (paperback)</td><td>$18</td></tr>
        <tr><td>Cooking Simply</td><td>$28</td></tr>
        <tr><td>Subtotal</td><td>$78</td></tr>
        <tr><td>Discount (SUMMER)</td><td>&ndash;$7.80</td></tr>
        <tr><td>Shipping</td><td>$5.00</td></tr>
        <tr><td><b>Total</b></td><td><b>$75.20</b></td></tr>
      </table>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> help@pageturnerbooks.com</div>
      <div class="row"><span class="k">From:</span> g.lam@webmail.com</div>
      <div class="row"><span class="k">Subject:</span> Order #PB-3092</div>
      </div>
      <p>Hello,</p>
      <p>I just placed my order and noticed I was charged for shipping. I thought the sale included
      free shipping. Also, I&rsquo;m a loyalty member — will I earn points on this purchase?</p>
      <p>Thank you,<br>Grace Lam</p>'''},
  ],
  "trans":"<b>[광고]</b> Pageturner Books 여름 독서 세일 — 온라인 한정, 6월 1~30일, 코드 SUMMER. 소계 $30~49: "
    "무료 책갈피 세트 / $50~79: 10% 할인 / <b>$80 이상: 15% 할인 + 무료 배송</b>. 로열티 회원은 세일 기간 "
    "<b>1달러당 2포인트</b> 적립.<br><br>"
    "<b>[주문 확인서]</b> Pageturner Books, 주문 #PB-3092, 6월 12일. 고객: Grace Lam. The Long Horizon(양장) "
    "$32, Wild Coast(문고) $18, Cooking Simply $28, <b>소계 $78</b>, 할인(SUMMER) −$7.80, 배송비 $5.00, 합계 "
    "$75.20.<br><br>"
    "<b>[이메일]</b> Grace Lam 발신. 방금 주문했는데 배송비가 청구됐네요. 세일에 무료 배송이 포함된 줄 알았어요. "
    "그리고 저는 로열티 회원인데 이번 구매로 포인트를 적립받나요?",
  "questions":[
    {"no":196,"stem":"When does the sale end?",
     "opts":["June 1","June 12","June 30","July 1"],
     "ans":2,"type":"세부사항","expl":"‘Online only, June 1–30’에서 세일은 <b>6월 30일</b>에 끝난다."},
    {"no":197,"stem":"What discount did Ms. Lam's order receive?",
     "opts":["15%","10%","A free bookmark set","No discount"],
     "ans":1,"type":"연계추론","expl":"[연계] 주문 소계가 $78이므로 광고의 ‘$50~79: 10% 할인’ 구간에 해당한다. 실제로 할인액 $7.80은 $78의 <b>10%</b>다."},
    {"no":198,"stem":"Why most likely was Ms. Lam charged for shipping?",
     "opts":["The sale had ended","Shipping is never free","She used the wrong code","Free shipping requires $80 or more, which her order did not reach"],
     "ans":3,"type":"연계추론·추론","expl":"[연계] 무료 배송은 소계 ‘$80 이상’ 구간의 혜택인데 Lam의 소계는 $78이다. 따라서 <b>$80에 못 미쳐</b> 배송비가 정상 청구된 것이다."},
    {"no":199,"stem":"What does Ms. Lam ask about in addition to shipping?",
     "opts":["Earning loyalty points","A missing book","A gift receipt","A return"],
     "ans":0,"type":"세부사항","expl":"‘will I earn <b>points</b> on this purchase?’에서 로열티 포인트 적립을 묻는다."},
    {"no":200,"stem":"What is most likely true about Ms. Lam's points?",
     "opts":["She is not eligible","Points have expired","She will earn 2 points per dollar spent","She must re-enter the code"],
     "ans":2,"type":"연계추론","expl":"[연계] 광고에 따르면 세일 기간 로열티 회원은 1달러당 2포인트를 적립하고, Lam은 회원이며 세일 기간(6월 12일)에 구매했으므로 <b>1달러당 2포인트</b>를 적립받는다."},
  ]},
]
