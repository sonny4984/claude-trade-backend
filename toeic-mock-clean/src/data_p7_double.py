# -*- coding: utf-8 -*-
"""Part 7 — Double Passages (Q176-185, 2세트 10문항). 100% 신규 창작."""

p7_double = [
 # ---------- 176-180 : Advertisement + E-mail ----------
 {"intro":"Questions 176-180 refer to the following advertisement and e-mail.",
  "passages":[
    {"doc":"advertisement","html":'''
      <p class="center big">Verdant Gardens — Seasonal Lawn Care</p>
      <table class="tbl">
        <tr><th>Package</th><th>Includes</th><th>Price</th></tr>
        <tr><td>Basic</td><td>Mowing and edging</td><td>$60 / visit</td></tr>
        <tr><td>Standard</td><td>Mowing, edging, and weeding</td><td>$85 / visit</td></tr>
        <tr><td>Premium</td><td>Mowing, edging, weeding, and fertilizing</td><td>$110 / visit</td></tr>
      </table>
      <p>All packages include cleanup. Sign up for a full season (12 visits) and save 10% off the
      total. Serving the Maple County area since 2008.</p>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> info@verdantgardens.com</div>
      <div class="row"><span class="k">From:</span> c.holloway@quickmail.com</div>
      <div class="row"><span class="k">Subject:</span> Lawn Care for the Season</div>
      </div>
      <p>Hello,</p>
      <p>I&rsquo;d like to sign up for weekly lawn care for the upcoming season. My main concern is
      weeds, which took over my yard last year, but I do not need fertilizing. Please sign me up for
      the appropriate package for the full 12-visit season. My address is 47 Birchwood Lane. Could
      you also confirm the total after the seasonal discount?</p>
      <p>Thanks,<br>Craig Holloway</p>'''},
  ],
  "trans":"<b>[광고]</b> Verdant Gardens — 시즌 잔디 관리. Basic(깎기·가장자리 정리, $60/회) / "
    "Standard(깎기·가장자리·잡초 제거, $85/회) / Premium(깎기·가장자리·잡초·비료, $110/회). 모든 패키지에 "
    "뒷정리 포함. 한 시즌(12회) 등록 시 총액 10% 할인.<br><br>"
    "<b>[이메일]</b> Craig Holloway 발신. 다가오는 시즌 주간 잔디 관리를 신청하고 싶습니다. 주 관심사는 "
    "작년에 마당을 뒤덮은 <b>잡초</b>이고, <b>비료는 필요 없습니다</b>. 12회 시즌 전체로 적절한 패키지에 "
    "등록해 주세요. 주소는 47 Birchwood Lane입니다. 시즌 할인 적용 후 총액도 확인해 주시겠어요?",
  "questions":[
    {"no":176,"stem":"Why did Mr. Holloway send the e-mail?",
     "opts":["To sign up for a seasonal service","To request a refund","To complain about weeds","To change an appointment"],
     "ans":0,"type":"주제·목적","expl":"‘I&rsquo;d like to sign up for weekly lawn care for the upcoming season’에서 <b>시즌 서비스 신청</b>이 목적이다."},
    {"no":177,"stem":"Which package will Mr. Holloway most likely choose?",
     "opts":["Basic","Premium","Standard","A custom package"],
     "ans":2,"type":"연계추론","expl":"[연계] 이메일에서 ‘잡초 제거는 필요하지만 비료는 불필요’라고 했다. 광고상 잡초 제거를 포함하되 비료가 없는 패키지는 <b>Standard</b>이다."},
    {"no":178,"stem":"What total will Mr. Holloway most likely pay for the season?",
     "opts":["$1,020","$1,188","$648","$918"],
     "ans":3,"type":"연계추론·계산","expl":"[연계] Standard는 회당 $85, 12회면 $1,020. 시즌 10% 할인 적용 시 $1,020 × 0.9 = <b>$918</b>.",
     "opt_why":["$1,020은 할인 전 금액","$1,188은 Premium 할인가","$648은 Basic 할인가","$1,020의 10% 할인가 — 정답"]},
    {"no":179,"stem":"According to the advertisement, what is included in all packages?",
     "opts":["Fertilizing","Cleanup","A free consultation","Weeding"],
     "ans":1,"type":"세부사항","expl":"‘All packages include <b>cleanup</b>’."},
    {"no":180,"stem":"What does Mr. Holloway ask the company to confirm?",
     "opts":["The total after the seasonal discount","The service date","His address","The staff's availability"],
     "ans":0,"type":"세부사항","expl":"‘confirm the <b>total after the seasonal discount</b>’."},
  ]},

 # ---------- 181-185 : E-mail + E-mail ----------
 {"intro":"Questions 181-185 refer to the following e-mails.",
  "passages":[
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> bookings@saffronkitchen.com</div>
      <div class="row"><span class="k">From:</span> n.abara@brightstart.org</div>
      <div class="row"><span class="k">Subject:</span> Catering for Charity Gala</div>
      </div>
      <p>Dear Saffron Kitchen,</p>
      <p>Brightstart Foundation is hosting its annual charity gala on Saturday, June 21, and we
      would like to request catering for approximately 150 guests. We are especially interested in
      your buffet-style service. About a quarter of our guests have indicated a preference for
      vegetarian meals, so we would need a substantial vegetarian selection. Could you send us a
      quote and let us know if June 21 is available?</p>
      <p>Best,<br>Nadia Abara</p>'''},
    {"doc":"e-mail","html":'''
      <div class="hd">
      <div class="row"><span class="k">To:</span> n.abara@brightstart.org</div>
      <div class="row"><span class="k">From:</span> bookings@saffronkitchen.com</div>
      <div class="row"><span class="k">Subject:</span> RE: Catering for Charity Gala</div>
      </div>
      <p>Dear Ms. Abara,</p>
      <p>Thank you for considering Saffron Kitchen. I&rsquo;m pleased to confirm that June 21 is
      available. For 150 guests, our buffet service is $42 per person, which includes a full
      vegetarian station with six dishes.</p>
      <p>Please note that we require a signed contract and a 25% deposit no later than three weeks
      before the event to secure the date. We can also provide staff to serve drinks for an
      additional fee. I&rsquo;ve attached our full menu for your review.</p>
      <p class="sig">Warm regards,<br>Theo Marsh, Saffron Kitchen</p>'''},
  ],
  "trans":"<b>[이메일 1]</b> Nadia Abara(Brightstart 재단) 발신. 6월 21일 토요일 연례 자선 갈라를 열며 약 "
    "<b>150명</b> 대상 케이터링을 요청합니다. 뷔페식 서비스에 특히 관심이 있습니다. 참석자의 <b>약 1/4</b>이 "
    "채식을 선호한다고 밝혀 상당한 채식 메뉴가 필요합니다. 견적과 6월 21일 가능 여부를 알려주세요.<br><br>"
    "<b>[이메일 2]</b> Theo Marsh(Saffron Kitchen) 발신. 6월 21일 가능함을 확인해 드립니다. 150명 기준 뷔페는 "
    "<b>1인당 $42</b>이며 6가지 요리의 채식 코너가 포함됩니다. 날짜 확정을 위해 행사 <b>3주 전</b>까지 계약서와 "
    "25% 보증금이 필요합니다. 음료 서빙 직원은 추가 비용으로 제공 가능합니다. 전체 메뉴를 첨부합니다.",
  "questions":[
    {"no":181,"stem":"Why did Ms. Abara write the first e-mail?",
     "opts":["To confirm a menu","To cancel a booking","To request catering for an event","To apply for a job"],
     "ans":2,"type":"주제·목적","expl":"‘we would like to request catering for approximately 150 guests’에서 <b>행사 케이터링 요청</b>이 목적이다."},
    {"no":182,"stem":"What does Ms. Abara request regarding the menu?",
     "opts":["A gluten-free menu","A children's menu","A plated dinner service","A large vegetarian selection"],
     "ans":3,"type":"세부사항","expl":"‘we would need a <b>substantial vegetarian selection</b>’."},
    {"no":183,"stem":"About how many gala guests are expected to prefer vegetarian meals?",
     "opts":["About 15","About 38","About 75","About 150"],
     "ans":1,"type":"연계추론","expl":"[연계] 첫 이메일에서 참석자 약 150명 중 ‘약 1/4’이 채식을 선호한다고 했으므로 150 ÷ 4 ≈ <b>약 38명</b>이다."},
    {"no":184,"stem":"What is available for an additional fee?",
     "opts":["Staff to serve drinks","A vegetarian station","A larger venue","Dessert"],
     "ans":0,"type":"세부사항","expl":"‘provide <b>staff to serve drinks</b> for an additional fee’."},
    {"no":185,"stem":"What is the estimated cost of the buffet for 150 guests?",
     "opts":["$4,200","$6,000","$6,300","$3,150"],
     "ans":2,"type":"연계추론·계산","expl":"[연계] 답신의 1인당 $42와 첫 이메일의 150명을 곱하면 $42 × 150 = <b>$6,300</b>."},
  ]},
]
