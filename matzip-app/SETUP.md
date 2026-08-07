# 찐맛 — API 연결 가이드 (노트북에서 10분)

앱은 **키가 없으면 데모 데이터**, **키가 있으면 실시간 구글 데이터**로 자동 전환됩니다.
코드는 이미 다 되어 있고, 아래는 키를 발급받아 꽂는 절차입니다.

---

## 1) Google Places API 키 (필수 · 맛집 실데이터)

1. https://console.cloud.google.com 접속 → 로그인
2. 상단 프로젝트 선택 → **새 프로젝트** (이름: `jjinmat`) → 만들기
3. 왼쪽 메뉴 **API 및 서비스 → 라이브러리** → `Places API (New)` 검색 → **사용 설정**
   - ⚠️ 반드시 이름에 **(New)** 가 붙은 것 (구버전 Places API 아님)
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**
5. 만들어진 키 복사 → **키 수정**에서 제한 걸기 (권장)
   - 애플리케이션 제한: **없음** (서버에서 호출하므로 HTTP 리퍼러 제한 걸면 안 됨)
   - API 제한: **Places API (New)** 만 선택
6. **결제 계정 연결 필요** (무료 크레딧 있음). 청구 → 결제 계정 연결
   - 안전장치: 청구 → **예산 및 알림**에서 월 $10 알림 설정 권장

> 비용 감각: Text Search는 1,000건당 약 $32이지만 매월 $200 무료 크레딧이 있어
> 개인 사용(하루 수십~수백 건)은 사실상 무료입니다. 앱은 5분 캐시를 걸어 호출을 줄입니다.

## 2) Gemini API 키 (선택 · AI 추천)

1. https://aistudio.google.com/apikey 접속 → 로그인
2. **Create API key** → 위에서 만든 `jjinmat` 프로젝트 선택 → 키 복사
3. 무료 등급으로 충분합니다.

---

## 3) 배포 + 키 등록 (Vercel)

```bash
npm i -g vercel          # 최초 1회
cd matzip-app
vercel                   # 로그인 후 프로젝트 생성 (기본값 엔터로 진행)

vercel env add GOOGLE_PLACES_KEY production   # ← 1)에서 만든 키 붙여넣기
vercel env add GEMINI_KEY production          # ← 2)에서 만든 키 (선택)

vercel --prod            # 실제 배포
```

배포 후 나온 주소를 폰에서 열면 끝입니다.
- 헤더에 초록색 **실시간 구글 데이터** 배지가 뜨면 성공
- 회색 **데모 데이터** 배지면 키가 안 붙은 것 → `vercel env ls` 로 확인

### 로컬에서 먼저 테스트하려면
```bash
cd matzip-app
echo "GOOGLE_PLACES_KEY=붙여넣기" > .env.local
echo "GEMINI_KEY=붙여넣기" >> .env.local
vercel dev               # http://localhost:3000
```

---

## 4) 동작 확인 체크리스트

| 확인 | 방법 |
|---|---|
| 키 인식 | `/api/health` → `{"places":true,"gemini":true}` |
| 맛집 검색 | `/api/search?lat=37.4979&lng=127.0276` → places 배열 |
| 상세+리뷰 | `/api/place?id=<place_id>` → reviews 5개 |
| AI 추천 | 앱에서 ✨ 탭 → 조건 선택 → 추천 받기 |

## 5) API 상세

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/health` | 키 설정 여부 |
| `GET /api/search?lat&lng&radius&cat&q` | 리뷰 50+/평점 4.5+ 필터된 목록. `cat=spot`이면 명소 |
| `GET /api/place?id=` | 상세 + 구글 리뷰(최대 5개) + 영업시간 |
| `GET /api/photo?name=&h=` | 사진 프록시 (키 노출 없음) |
| `POST /api/ai` | Gemini 추천 (조건 + 후보 → 3곳 선정) |

## 알아둘 제한

- **구글 리뷰는 매장당 최대 5개**까지만 공식 API로 제공됩니다. 앱은 5개를 보여주고
  "구글 지도에서 전체 리뷰 보기" 링크를 답니다. (데모 모드에서는 30개 합성 리뷰)
- 사진은 구글 정책상 **프록시를 통해서만** 제공해야 키가 안전합니다 → `/api/photo` 사용 중.
- 명소(`cat=spot`)도 동일하게 **리뷰 50+/평점 4.5+** 기준을 통과한 곳만 노출됩니다.
