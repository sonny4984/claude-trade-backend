# -*- coding: utf-8 -*-
"""Part 7 — Single Passages (Q147-175, 29 questions)."""

p7_single = [
    # ---------- 147-148 : Advertisement ----------
    {
     "intro":"Questions 147-148 refer to the following advertisement.",
     "passages":[{"doc":"advertisement","html":'''
        <p class="center big">Brightline Co-Working Spaces</p>
        <p class="center">Now Open in the Millbrook District</p>
        <p>Whether you are a freelancer, a startup, or a growing team, Brightline offers
        flexible workspace to fit your needs. Choose from open desks, private offices, and
        fully equipped meeting rooms &mdash; all with high-speed internet, unlimited coffee,
        and 24-hour access.</p>
        <p>Membership starts at just $180 per month. Sign up for a one-year plan and receive
        your first month free.</p>
        <p>Tour our space any weekday between 9:00 A.M. and 6:00 P.M. &mdash; no appointment
        necessary. Visit www.brightlinework.com or call 555-0173 to learn more.</p>'''}],
     "trans":'''Brightline 코워킹 스페이스 — Millbrook 지구에 새로 오픈. 프리랜서, 스타트업,
        성장하는 팀 등 누구에게나 맞는 유연한 업무 공간을 제공합니다. 오픈 데스크, 개인 사무실, 완비된
        회의실 중 선택하세요 — 모두 초고속 인터넷, 무제한 커피, 24시간 출입이 포함됩니다. 멤버십은 월
        180달러부터. 1년 플랜에 가입하면 첫 달은 무료입니다. 평일 오전 9시~오후 6시 예약 없이 언제든
        둘러보실 수 있습니다. 자세한 내용은 웹사이트나 555-0173으로 문의하세요.''',
     "questions":[
        {"no":147,"stem":"What is being advertised?",
         "opts":["A shared workspace","A coffee-shop franchise","An internet service provider","A real estate agency"],
         "ans":0,"type":"주제·목적",
         "expl":"‘co-working spaces’, ‘open desks, private offices, meeting rooms’ 등에서 <b>공유 업무 공간</b>을 광고함을 알 수 있다.",
         "vocab":[("co-working","공유 사무"),("flexible","유연한")]},
        {"no":148,"stem":"What is offered to those who sign up for a one-year plan?",
         "opts":["A free private office","One month at no charge","A discount on coffee","Free parking"],
         "ans":1,"type":"세부사항",
         "expl":"‘Sign up for a one-year plan and receive your first month free’에서 1년 플랜 가입 시 <b>첫 달 무료</b> 혜택을 준다."},
     ],
    },

    # ---------- 149-150 : Text-message chain ----------
    {
     "intro":"Questions 149-150 refer to the following text-message chain.",
     "passages":[{"doc":"text messages","html":'''
        <div class="chat">
        <div class="line"><span class="who">Rachel Kim</span><span class="time">10:12 A.M.</span><br>
        Hi Tom, the client just moved our meeting up to 1:00 P.M. today. Can you have the revised
        budget ready by then?</div>
        <div class="line"><span class="who">Tom Vasquez</span><span class="time">10:14 A.M.</span><br>
        That&rsquo;s cutting it close. I still need the updated figures from the vendor.</div>
        <div class="line"><span class="who">Rachel Kim</span><span class="time">10:15 A.M.</span><br>
        I just forwarded them to you two minutes ago. Check your inbox.</div>
        <div class="line"><span class="who">Tom Vasquez</span><span class="time">10:16 A.M.</span><br>
        Got it. In that case, I can make it work.</div>
        <div class="line"><span class="who">Rachel Kim</span><span class="time">10:17 A.M.</span><br>
        Great. I&rsquo;ll book the large conference room.</div>
        </div>'''}],
     "trans":'''Rachel(10:12): 톰, 고객이 방금 회의를 오늘 오후 1시로 앞당겼어요. 그때까지 수정 예산안
        준비할 수 있어요? / Tom(10:14): 빠듯하네요. 아직 업체에서 갱신된 수치를 받아야 해요. /
        Rachel(10:15): 2분 전에 방금 전달했어요. 받은편지함 확인해 보세요. / Tom(10:16): 받았어요.
        그렇다면 해낼 수 있겠어요. / Rachel(10:17): 좋아요. 큰 회의실을 예약할게요.''',
     "questions":[
        {"no":149,"stem":"Why did Ms. Kim contact Mr. Vasquez?",
         "opts":["To cancel a client meeting","To reschedule a vendor visit","To ask him to prepare a document sooner","To request the client's phone number"],
         "ans":2,"type":"주제·목적",
         "expl":"Rachel은 회의가 앞당겨졌으니 ‘수정 예산안을 그 시각까지 준비해 달라’고 요청했다. 즉 <b>문서를 더 일찍 준비</b>해 달라는 것."},
        {"no":150,"stem":"At 10:16 A.M., what does Mr. Vasquez most likely mean when he writes, \"I can make it work\"?",
         "opts":["He will repair some equipment","He will attend in Ms. Kim's place","He will contact the vendor himself","He will be able to finish the task on time"],
         "ans":3,"type":"의도파악",
         "expl":"필요했던 업체 수치를 방금 받았으므로, 앞당겨진 마감(오후 1시)에 맞춰 ‘예산안을 <b>제때 끝낼 수 있다</b>’는 뜻이다.",
         "opt_why":["장비 수리와 무관","대신 참석한다는 말 아님","업체 수치는 이미 Rachel이 전달함","앞당겨진 시간에 맞춰 완료 가능 — 정답"]},
     ],
    },

    # ---------- 151-152 : Notice ----------
    {
     "intro":"Questions 151-152 refer to the following notice.",
     "passages":[{"doc":"notice","html":'''
        <p class="center big">Notice to Residents &mdash; Fairview Apartments</p>
        <p class="center">Water Service Interruption</p>
        <p>Please be advised that the water supply to Buildings C and D will be temporarily
        shut off on Wednesday, May 14, from 9:00 A.M. to approximately 2:00 P.M. so that our
        maintenance crew can replace an aging main valve.</p>
        <p>We recommend storing enough water for drinking and basic needs before the shutoff
        begins. Residents of Buildings A and B will not be affected.</p>
        <p>We apologize for any inconvenience. For urgent concerns during the shutoff, please
        contact the building office at 555-0190.</p>'''}],
     "trans":'''입주민 안내 — Fairview 아파트 / 단수 안내. C동과 D동의 급수가 5월 14일 수요일 오전
        9시부터 오후 2시경까지 일시 중단됩니다. 노후된 주밸브 교체 작업을 위한 것입니다. 단수 시작 전
        음용 및 기본 생활에 필요한 물을 충분히 받아 두시길 권장합니다. A동과 B동은 영향을 받지 않습니다.
        불편을 드려 죄송합니다. 단수 중 긴급 문의는 관리 사무소(555-0190)로 연락 주십시오.''',
     "questions":[
        {"no":151,"stem":"What is the purpose of the notice?",
         "opts":["To inform residents of a water shutoff","To announce a rent increase","To recruit maintenance volunteers","To advertise available apartments"],
         "ans":0,"type":"주제·목적",
         "expl":"제목과 본문 모두 밸브 교체를 위한 <b>일시 단수</b>를 알리고 있다."},
        {"no":152,"stem":"What are residents advised to do?",
         "opts":["Move to another building","Store water before the shutoff","Pay a maintenance fee","Attend a residents' meeting"],
         "ans":1,"type":"세부사항",
         "expl":"‘storing enough water ... before the shutoff begins’에서 <b>미리 물을 받아 둘 것</b>을 권한다."},
     ],
    },

    # ---------- 153-154 : E-mail ----------
    {
     "intro":"Questions 153-154 refer to the following e-mail.",
     "passages":[{"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> j.porter@mailhub.com</div>
        <div class="row"><span class="k">From:</span> orders@lumina-home.com</div>
        <div class="row"><span class="k">Subject:</span> Your Recent Order #LH-48291</div>
        <div class="row"><span class="k">Date:</span> June 2</div>
        </div>
        <p>Dear Mr. Porter,</p>
        <p>Thank you for your order. We are writing to let you know that one item &mdash; the
        Aurora Table Lamp (Item #TL-22) &mdash; is currently out of stock and will not ship with
        the rest of your order. The remaining items shipped this morning and should arrive within
        three to five business days.</p>
        <p>The lamp is expected to be back in stock by June 12, at which point we will ship it to
        you at no additional charge. If you would prefer to cancel the lamp and receive a refund
        instead, simply reply to this e-mail by June 9.</p>
        <p>We apologize for the delay and appreciate your patience.</p>
        <p class="sig">Lumina Home Customer Care</p>'''}],
     "trans":'''수신: Porter 님 / 발신: Lumina Home 주문팀 / 제목: 최근 주문 #LH-48291 / 6월 2일.
        주문 감사합니다. 한 품목(Aurora 테이블 램프, #TL-22)이 현재 <b>품절</b>이라 나머지 주문과 함께
        발송되지 않음을 알려드립니다. 나머지 품목은 오늘 아침 발송되어 영업일 기준 3~5일 내 도착 예정입니다.
        램프는 6월 12일경 재입고 예정이며, 그때 <b>추가 비용 없이</b> 발송해 드립니다. 램프를 취소하고
        환불받길 원하시면 <b>6월 9일까지</b> 본 이메일에 회신해 주십시오. 지연을 사과드리며 양해에 감사드립니다.''',
     "questions":[
        {"no":153,"stem":"Why was the e-mail sent?",
         "opts":["To confirm that a refund was issued","To request payment for an order","To notify a customer that an item is unavailable","To announce a seasonal sale"],
         "ans":2,"type":"주제·목적",
         "expl":"한 품목이 품절되어 함께 배송되지 않는다는 사실을 고객에게 알리는 것이 목적이다. 즉 <b>품목의 재고 없음(지연) 통지</b>."},
        {"no":154,"stem":"What should Mr. Porter do if he wants a refund for the lamp?",
         "opts":["Call customer service","Return the lamp by mail","Wait until June 12","Reply to the e-mail by June 9"],
         "ans":3,"type":"세부사항",
         "expl":"‘receive a refund instead, simply reply to this e-mail by June 9’에서 환불을 원하면 <b>6월 9일까지 회신</b>하면 된다."},
     ],
    },

    # ---------- 155-157 : Job posting ----------
    {
     "intro":"Questions 155-157 refer to the following job advertisement.",
     "passages":[{"doc":"job posting","html":'''
        <p class="center big">Marketing Coordinator &mdash; Northgate Media</p>
        <p class="center">Location: Riverton (Hybrid)</p>
        <p>Northgate Media is seeking a detail-oriented Marketing Coordinator to support our
        growing communications team. This is a full-time position with the option to work from
        home up to three days per week.</p>
        <p><b>Responsibilities</b></p>
        <p>&bull; Schedule and publish content across social-media platforms<br>
        &bull; Track campaign performance and prepare monthly reports<br>
        &bull; Coordinate with designers and outside vendors</p>
        <p><b>Requirements</b></p>
        <p>&bull; Bachelor&rsquo;s degree in marketing, communications, or a related field<br>
        &bull; At least two years of relevant experience<br>
        &bull; Strong written-communication skills</p>
        <p>To apply, send your r&eacute;sum&eacute; and a brief cover letter to
        careers@northgatemedia.com by August 15. Applicants selected for an interview will be
        contacted within two weeks of the closing date.</p>'''}],
     "trans":'''마케팅 코디네이터 — Northgate Media / 근무지: Riverton(하이브리드). Northgate Media는
        성장하는 홍보팀을 지원할 꼼꼼한 마케팅 코디네이터를 찾습니다. 정규직이며 주 최대 3일 재택근무가
        가능합니다. [업무] 소셜미디어 콘텐츠 일정 관리·게시, 캠페인 성과 추적 및 월간 보고서 작성, 디자이너·
        외부 업체와 협업. [자격] 마케팅·커뮤니케이션 등 관련 전공 학사, 관련 경력 2년 이상, 뛰어난 문서
        작성 능력. 지원은 8월 15일까지 이력서와 간단한 자기소개서를 이메일로 보내면 되며, 면접 대상자는
        마감 후 2주 이내 연락을 받습니다.''',
     "questions":[
        {"no":155,"stem":"For whom is the advertisement most likely intended?",
         "opts":["Candidates with marketing experience","Recent high-school graduates","Experienced graphic designers","Current Northgate managers"],
         "ans":0,"type":"추론",
         "expl":"‘At least two years of relevant experience’, 마케팅 전공 요구 등에서 <b>마케팅 경력이 있는 지원자</b>를 대상으로 함을 알 수 있다."},
        {"no":156,"stem":"What is indicated about the position?",
         "opts":["It is a temporary role","It permits working from home part of the week","It requires frequent travel","It is an entry-level position"],
         "ans":1,"type":"세부사항",
         "expl":"‘the option to work from home up to three days per week’에서 <b>주중 일부 재택근무</b>가 가능함을 알 수 있다. full-time이므로 임시직·신입 전용은 아니다."},
        {"no":157,"stem":"What are applicants asked to submit?",
         "opts":["A list of references","A design portfolio","A résumé and cover letter","A completed application form"],
         "ans":2,"type":"세부사항",
         "expl":"‘send your résumé and a brief cover letter’에서 <b>이력서와 자기소개서</b>를 제출하라고 한다."},
     ],
    },

    # ---------- 158-160 : Article (with sentence insertion) ----------
    {
     "intro":"Questions 158-160 refer to the following article.",
     "passages":[{"doc":"article","html":'''
        <p class="center big">City Launches Bike-Share Program</p>
        <p>MAPLETON (September 3) &mdash; The city of Mapleton unveiled its long-awaited bike-share
        program on Monday, placing 300 bicycles at 40 stations throughout the downtown area.
        <b>&mdash; [1] &mdash;</b> Riders can unlock a bike using a smartphone app and return it to
        any station.</p>
        <p>Mayor Lena Ortiz said the program is part of a broader effort to reduce traffic
        congestion and encourage healthier commuting. <b>&mdash; [2] &mdash;</b> During the first
        month, rides under 30 minutes will be free of charge to encourage residents to try the
        service.</p>
        <p>City officials say they will monitor usage closely before deciding whether to expand
        the program. <b>&mdash; [3] &mdash;</b> If demand is strong, an additional 200 bikes could
        be added by next spring. <b>&mdash; [4] &mdash;</b></p>'''}],
     "trans":'''도시, 자전거 공유 프로그램 시작 / MAPLETON(9월 3일) — Mapleton시가 오랫동안 기다려 온
        자전거 공유 프로그램을 월요일에 선보이며, 도심 곳곳 40개 정류장에 자전거 300대를 배치했다. 이용자는
        스마트폰 앱으로 자전거 잠금을 해제하고 아무 정류장에나 반납할 수 있다. Lena Ortiz 시장은 이 프로그램이
        교통 혼잡을 줄이고 더 건강한 통근을 장려하려는 폭넓은 노력의 일부라고 말했다. <b>(삽입) 다른 도시의
        비슷한 프로그램들은 단거리 자동차 이용을 크게 줄였다.</b> 첫 달 동안 30분 미만 이용은 시민들의 이용을
        유도하기 위해 무료다. 시 당국은 확대 여부를 결정하기 전 이용 현황을 면밀히 관찰할 예정이다. 수요가 많으면
        내년 봄까지 200대를 추가할 수 있다.''',
     "questions":[
        {"no":158,"stem":"What is the article mainly about?",
         "opts":["A new subway line","A downtown parking garage","A road-repair project","The launch of a bike-sharing program"],
         "ans":3,"type":"주제",
         "expl":"제목과 첫 문단에서 도시의 <b>자전거 공유 프로그램 출범</b>을 다루고 있다."},
        {"no":159,"stem":"What is indicated about rides during the first month?",
         "opts":["Rides under 30 minutes are free","They require a monthly pass","They are limited to residents","They are available only on weekends"],
         "ans":0,"type":"세부사항",
         "expl":"‘rides under 30 minutes will be free of charge’에서 <b>30분 미만은 무료</b>임을 알 수 있다."},
        {"no":160,"stem":"In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?  \"Similar programs in other cities have significantly reduced short car trips.\"",
         "opts":["[1]","[2]","[3]","[4]"],
         "ans":1,"type":"문장삽입",
         "expl":"삽입 문장은 ‘교통 혼잡 감소·건강한 통근’이라는 시장의 발언을 뒷받침하는 근거다. 따라서 그 발언 바로 뒤인 <b>[2]</b>에 들어가는 것이 자연스럽다. [1]은 운영 방식 설명 자리라 어색하다."},
     ],
    },

    # ---------- 161-163 : Letter ----------
    {
     "intro":"Questions 161-163 refer to the following letter.",
     "passages":[{"doc":"letter","html":'''
        <p class="center big">Golden Fork Catering</p>
        <p class="center">88 Harvest Lane, Brookfield</p>
        <p>May 20</p>
        <p>Dear Ms. Whitfield,</p>
        <p>Thank you for choosing Golden Fork Catering for your company&rsquo;s annual awards dinner
        on June 15. This letter confirms the details we discussed.</p>
        <p>Your event will be held in our Garden Hall, which comfortably accommodates up to 120
        guests. Based on your estimate of 95 attendees, we have arranged the buffet-style dinner
        you selected, including two vegetarian entr&eacute;e options.</p>
        <p>Please note that the final headcount is due no later than June 8. Any changes after that
        date may not be reflected in the final arrangements. A deposit of 30 percent is required to
        secure the booking; the balance is payable on the day of the event.</p>
        <p>We are confident your evening will be memorable. Should you have any questions, please do
        not hesitate to call me directly at 555-0148.</p>
        <p class="sig">Warm regards,<br>Andre Faulkner, Events Manager</p>'''}],
     "trans":'''Golden Fork 케이터링 / 5월 20일. Whitfield 님께, 6월 15일 귀사의 연례 시상식 만찬에
        Golden Fork를 선택해 주셔서 감사합니다. 본 서한으로 논의한 사항을 확정합니다. 행사는 최대 120명을
        여유 있게 수용하는 Garden Hall에서 열립니다. 참석 예상 인원 95명을 기준으로, 선택하신 뷔페식 만찬을
        준비했으며 채식 메인 요리 2종을 포함합니다. 최종 인원은 <b>6월 8일까지</b> 확정해 주셔야 하며, 이후
        변경은 최종 준비에 반영되지 않을 수 있습니다. 예약 확정을 위해 30% 보증금이 필요하고, 잔금은 행사
        당일 지불합니다. 멋진 저녁이 되리라 확신합니다. 문의는 555-0148로 연락 주십시오. — 행사 담당 Andre Faulkner.''',
     "questions":[
        {"no":161,"stem":"What is the purpose of the letter?",
         "opts":["To request a deposit refund","To advertise a new catering menu","To confirm arrangements for an event","To apologize for a scheduling error"],
         "ans":2,"type":"주제·목적",
         "expl":"‘This letter confirms the details we discussed’에서 행사 준비 사항을 <b>확정·안내</b>하는 편지임을 알 수 있다."},
        {"no":162,"stem":"What is Ms. Whitfield asked to do by June 8?",
         "opts":["Pay the full balance","Select vegetarian options","Reserve the Garden Hall","Confirm the final number of guests"],
         "ans":3,"type":"세부사항",
         "expl":"‘the final headcount is due no later than June 8’에서 <b>최종 참석 인원 확정</b>을 6월 8일까지 하라고 요청한다."},
        {"no":163,"stem":"The word \"accommodates\" in paragraph 2, line 1, is closest in meaning to",
         "opts":["holds","adjusts","assists","postpones"],
         "ans":0,"type":"동의어",
         "expl":"‘accommodates up to 120 guests’는 ‘120명을 <b>수용한다</b>’는 뜻이므로 ‘holds(수용하다)’가 가장 가깝다."},
     ],
    },

    # ---------- 164-167 : Online chat (multi-person) ----------
    {
     "intro":"Questions 164-167 refer to the following online chat discussion.",
     "passages":[{"doc":"online chat","html":'''
        <div class="chat">
        <div class="line"><span class="who">Priya Nandal</span><span class="time">2:03 P.M.</span><br>
        Team, the venue for Friday&rsquo;s product demo just canceled on us. We need a backup fast.</div>
        <div class="line"><span class="who">Marcus Lee</span><span class="time">2:04 P.M.</span><br>
        You&rsquo;re kidding. Did they say why?</div>
        <div class="line"><span class="who">Priya Nandal</span><span class="time">2:05 P.M.</span><br>
        A plumbing issue. They&rsquo;re closed all week.</div>
        <div class="line"><span class="who">Elena Ruiz</span><span class="time">2:06 P.M.</span><br>
        What about the Cedar Room at our own office? It seats 40.</div>
        <div class="line"><span class="who">Marcus Lee</span><span class="time">2:07 P.M.</span><br>
        We&rsquo;re expecting close to 60 people, though.</div>
        <div class="line"><span class="who">Elena Ruiz</span><span class="time">2:08 P.M.</span><br>
        The Hillside Conference Center has a hall that holds 80. I can call them now.</div>
        <div class="line"><span class="who">Priya Nandal</span><span class="time">2:09 P.M.</span><br>
        Please do. Budget isn&rsquo;t a concern here &mdash; we just can&rsquo;t cancel.</div>
        <div class="line"><span class="who">Marcus Lee</span><span class="time">2:10 P.M.</span><br>
        I&rsquo;ll start e-mailing attendees the moment we confirm a new location.</div>
        <div class="line"><span class="who">Priya Nandal</span><span class="time">2:11 P.M.</span><br>
        Perfect. Elena, keep us posted.</div>
        </div>'''}],
     "trans":'''Priya(2:03): 팀 여러분, 금요일 제품 시연 장소가 방금 취소됐어요. 빨리 대안이 필요해요. /
        Marcus(2:04): 설마요. 이유는요? / Priya(2:05): 배관 문제래요. 이번 주 내내 닫는대요. /
        Elena(2:06): 우리 사무실 Cedar Room은 어때요? 40명 수용돼요. / Marcus(2:07): 그런데 60명
        가까이 올 예정이에요. / Elena(2:08): Hillside 컨퍼런스 센터에 80명 수용 홀이 있어요. 지금
        전화해 볼게요. / Priya(2:09): 그렇게 해요. 여기서 예산은 문제가 안 돼요 — 취소만은 안 됩니다. /
        Marcus(2:10): 새 장소가 확정되는 즉시 참석자들에게 이메일을 보낼게요. / Priya(2:11): 완벽해요.
        Elena, 계속 알려줘요.''',
     "questions":[
        {"no":164,"stem":"What problem are the writers discussing?",
         "opts":["A product was found to be defective","Their event venue is no longer available","An attendee list was misplaced","Their project budget was reduced"],
         "ans":1,"type":"주제",
         "expl":"‘the venue ... just canceled on us’에서 <b>행사 장소가 취소</b>되어 대안을 찾는 상황이다."},
        {"no":165,"stem":"Why is the Cedar Room ruled out?",
         "opts":["It is being renovated","It is too expensive","It cannot hold enough people","It is already reserved"],
         "ans":2,"type":"세부사항",
         "expl":"Cedar Room은 40명 수용인데 약 60명이 올 예정이므로 <b>인원 수용이 부족</b>해 제외된다."},
        {"no":166,"stem":"At 2:09 P.M., what does Ms. Nandal most likely mean when she writes, \"Budget isn't a concern here\"?",
         "opts":["The event has been canceled","The team has exceeded its budget","Attendees will pay for their own tickets","Cost should not prevent booking a venue"],
         "ans":3,"type":"의도파악",
         "expl":"‘취소만은 안 된다’는 말과 함께 쓰였으므로, 장소를 잡는 데 드는 <b>비용은 문제 삼지 말고 예약하라</b>는 뜻이다.",
         "opt_why":["행사는 취소하지 않음","예산 초과 언급 없음","참석자 비용 부담 얘기 아님","비용은 걸림돌이 아니다 — 정답"]},
        {"no":167,"stem":"What does Mr. Lee say he will do?",
         "opts":["Notify attendees once a venue is confirmed","Call the Hillside Conference Center","Cancel the product demo","Inspect the Cedar Room"],
         "ans":0,"type":"세부사항",
         "expl":"Marcus는 ‘새 장소가 확정되는 즉시 참석자들에게 이메일을 보내겠다’고 했다. 즉 <b>확정 후 참석자에게 알린다</b>. (전화는 Elena가 함)"},
     ],
    },

    # ---------- 168-171 : Press release (with sentence insertion + synonym) ----------
    {
     "intro":"Questions 168-171 refer to the following press release.",
     "passages":[{"doc":"press release","html":'''
        <p class="center">FOR IMMEDIATE RELEASE</p>
        <p class="center big">Verdant Foods Introduces Compostable Packaging</p>
        <p>PORTLAND (October 5) &mdash; Verdant Foods announced today that it will transition all of
        its snack products to fully compostable packaging by the end of next year.
        <b>&mdash; [1] &mdash;</b> The move is part of the company&rsquo;s five-year sustainability
        plan.</p>
        <p>&ldquo;Our customers have told us again and again that they want packaging that
        doesn&rsquo;t end up in a landfill,&rdquo; said CEO Harold Nguyen. <b>&mdash; [2] &mdash;</b>
        The new wrappers are made from plant-based materials that break down within 90 days in
        commercial composting facilities.</p>
        <p>The rollout will begin with the company&rsquo;s best-selling line of fruit bars in
        January. <b>&mdash; [3] &mdash;</b> Remaining products will follow in phases over the next
        twelve months. The company acknowledged that the compostable materials cost more to produce
        but said it does not plan to raise prices. <b>&mdash; [4] &mdash;</b></p>
        <p>Verdant Foods, founded in 2009, distributes its products to more than 2,000 grocery
        stores nationwide.</p>'''}],
     "trans":'''보도자료 / Verdant Foods, 퇴비화 가능 포장재 도입 / PORTLAND(10월 5일) — Verdant
        Foods는 내년 말까지 모든 스낵 제품을 완전 퇴비화 가능한 포장재로 <b>전환</b>하겠다고 오늘 발표했다.
        <b>(삽입) 이는 회사 역사상 가장 중대한 포장 변화다.</b> 이번 조치는 5개년 지속가능성 계획의 일부다.
        “고객들이 매립지로 가지 않는 포장을 원한다고 거듭 말해 왔다”고 CEO Harold Nguyen이 말했다. 새 포장재는
        식물성 소재로, 상업용 퇴비화 시설에서 90일 이내에 분해된다. 도입은 1월 베스트셀러 과일바 제품군부터
        시작된다. 나머지 제품은 이후 12개월에 걸쳐 단계적으로 전환된다. 회사는 퇴비화 소재의 생산 비용이 더
        들지만 가격 인상 계획은 없다고 밝혔다. Verdant Foods는 2009년 설립되어 전국 2,000개 이상 식료품점에
        제품을 공급한다.''',
     "questions":[
        {"no":168,"stem":"What did Verdant Foods announce?",
         "opts":["A new line of fruit bars","A change to compostable packaging","A merger with another company","The opening of a new factory"],
         "ans":1,"type":"주제",
         "expl":"제목과 첫 문장에서 모든 스낵 제품을 <b>퇴비화 가능 포장재로 전환</b>한다고 발표했다."},
        {"no":169,"stem":"According to the press release, what is true about the new packaging?",
         "opts":["It is already used on all products","It lowers the product's price","It costs more to produce","It takes a year to decompose"],
         "ans":2,"type":"세부사항",
         "expl":"‘the compostable materials cost more to produce’에서 <b>생산 비용이 더 든다</b>는 것이 사실이다. 90일 내 분해되고 가격 인상 계획은 없다."},
        {"no":170,"stem":"The word \"transition\" in paragraph 1, line 1, is closest in meaning to",
         "opts":["delay","return","reduce","switch"],
         "ans":3,"type":"동의어",
         "expl":"‘transition all products to compostable packaging’은 포장재를 ‘바꾸다’는 의미이므로 ‘switch(전환하다)’가 가장 가깝다."},
        {"no":171,"stem":"In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?  \"It is the most significant packaging change in the company's history.\"",
         "opts":["[1]","[2]","[3]","[4]"],
         "ans":0,"type":"문장삽입",
         "expl":"삽입 문장은 방금 발표한 ‘포장 전환’을 ‘회사 역사상 가장 중대한 변화’라고 평가하는 내용이다. 따라서 발표 문장 바로 뒤 <b>[1]</b>이 가장 자연스럽다."},
     ],
    },

    # ---------- 172-175 : E-mail (with NOT question) ----------
    {
     "intro":"Questions 172-175 refer to the following e-mail.",
     "passages":[{"doc":"e-mail","html":'''
        <div class="hd">
        <div class="row"><span class="k">To:</span> All Employees</div>
        <div class="row"><span class="k">From:</span> Human Resources</div>
        <div class="row"><span class="k">Subject:</span> Annual Volunteer Day &mdash; Sign Up Now</div>
        <div class="row"><span class="k">Date:</span> April 4</div>
        </div>
        <p>Dear Team,</p>
        <p>We are excited to announce that our company&rsquo;s fifth annual Volunteer Day will take
        place on Saturday, May 17. Once again, employees will have the chance to give back to our
        community while spending a fun day with colleagues.</p>
        <p>This year we are partnering with four local organizations, and you may choose the project
        that interests you most:</p>
        <p>&bull; <b>Riverbank Cleanup</b> &mdash; help remove litter along the Green River trail<br>
        &bull; <b>Community Garden</b> &mdash; plant vegetables at the Eastside food bank<br>
        &bull; <b>Book Drive</b> &mdash; sort and pack donated books for area schools<br>
        &bull; <b>Senior Center</b> &mdash; assist with a morning of games and crafts</p>
        <p>All projects run from 9:00 A.M. to 1:00 P.M., and lunch will be provided at each site.
        Transportation is available from the main office for those who need it. Family members are
        welcome to join the Riverbank Cleanup and Community Garden projects.</p>
        <p>Spots fill up quickly, so please sign up through the HR portal by May 2. If you have
        questions, contact Dana in HR.</p>
        <p class="sig">Warm regards,<br>Human Resources</p>'''}],
     "trans":'''수신: 전 직원 / 발신: 인사팀 / 제목: 연례 자원봉사의 날 — 지금 신청하세요 / 4월 4일.
        팀 여러분, 회사의 다섯 번째 연례 자원봉사의 날이 5월 17일 토요일에 열립니다. 동료들과 즐거운 하루를
        보내며 지역사회에 기여할 기회입니다. 올해는 지역 단체 4곳과 협력하며, 가장 관심 있는 프로젝트를
        고를 수 있습니다: (1) Riverbank 청소 — Green River 산책로 쓰레기 수거, (2) 커뮤니티 정원 —
        Eastside 푸드뱅크에 채소 심기, (3) 도서 기부 — 기증 도서 분류·포장, (4) 노인 센터 — 오전 게임·
        공예 돕기. 모든 프로젝트는 오전 9시~오후 1시 진행되며 각 장소에서 점심이 제공됩니다. 필요한 분에게는
        본사에서 교통편도 제공됩니다. Riverbank 청소와 커뮤니티 정원에는 가족도 참여할 수 있습니다. 자리가
        빨리 차니 5월 2일까지 HR 포털로 신청해 주세요. 문의는 인사팀 Dana에게.''',
     "questions":[
        {"no":172,"stem":"What is the purpose of the e-mail?",
         "opts":["To report on a past event","To invite employees to a volunteer day","To request donations of books","To announce a new HR policy"],
         "ans":1,"type":"주제·목적",
         "expl":"다섯 번째 연례 자원봉사의 날을 알리고 <b>참여 신청을 독려</b>하는 것이 목적이다."},
        {"no":173,"stem":"What is NOT indicated as being provided on Volunteer Day?",
         "opts":["Lunch","Transportation","Payment","A choice of projects"],
         "ans":2,"type":"NOT/사실확인",
         "expl":"점심 제공, 교통편 제공, 4개 프로젝트 중 선택은 언급되나 <b>금전적 보수(Payment)</b>는 언급되지 않는다.",
         "opt_why":["‘lunch will be provided’ — 제공됨","‘Transportation is available’ — 제공됨","보수 언급 없음 — 정답(NOT)","4개 중 선택 가능 — 제공됨"]},
        {"no":174,"stem":"For which projects are family members welcome?",
         "opts":["All four projects","The Book Drive and Senior Center","None of the projects","The Riverbank Cleanup and Community Garden"],
         "ans":3,"type":"세부사항",
         "expl":"‘Family members are welcome to join the Riverbank Cleanup and Community Garden’에서 <b>이 두 프로젝트</b>만 가족 참여가 가능하다."},
        {"no":175,"stem":"What are employees asked to do by May 2?",
         "opts":["Register through the HR portal","Contact four organizations","Confirm a lunch preference","Arrange their own transportation"],
         "ans":0,"type":"세부사항",
         "expl":"‘please sign up through the HR portal by May 2’에서 <b>HR 포털로 신청</b>하라고 한다."},
     ],
    },
]
