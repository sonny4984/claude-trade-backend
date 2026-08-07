// 공통 유틸 — CORS, 응답, 캐시, 카테고리 매핑
export const PLACES_KEY = process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_MAPS_KEY || "";
export const GEMINI_KEY = process.env.GEMINI_KEY || process.env.GOOGLE_AI_KEY || "";
export const GEMINI_MODELS = (process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]);

export function send(res, code, body, cacheSec) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", cacheSec ? `public, max-age=${cacheSec}, s-maxage=${cacheSec}` : "no-store");
  res.status(code).end(JSON.stringify(body));
}
export function bad(res, code, msg, extra) {
  send(res, code, Object.assign({ error: msg }, extra || {}));
}
export function preflight(req, res) {
  if (req.method !== "OPTIONS") return false;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
  return true;
}

// 아주 단순한 인스턴스 캐시 (웜 람다 한정)
const mem = new Map();
export function cacheGet(k, ttlMs) {
  const v = mem.get(k);
  if (v && Date.now() - v.t < ttlMs) return v.d;
  return null;
}
export function cacheSet(k, d) {
  mem.set(k, { t: Date.now(), d });
  if (mem.size > 200) mem.delete(mem.keys().next().value);
}

// 앱 카테고리 → 구글 검색어 / 타입
export const CATS = {
  kr:   { q: "한식 맛집",        types: ["korean_restaurant"] },
  meat: { q: "고기집 삼겹살 갈비", types: ["barbecue_restaurant", "korean_restaurant"] },
  jp:   { q: "일식 초밥 라멘",    types: ["japanese_restaurant", "sushi_restaurant", "ramen_restaurant"] },
  cn:   { q: "중식 중국집",      types: ["chinese_restaurant"] },
  west: { q: "양식 파스타 스테이크", types: ["italian_restaurant", "american_restaurant", "restaurant"] },
  cafe: { q: "카페 디저트",      types: ["cafe", "bakery", "dessert_shop"] },
  bs:   { q: "분식 떡볶이 김밥",  types: ["restaurant"] },
  sea:  { q: "회 해산물 조개",    types: ["seafood_restaurant"] },
  asia: { q: "쌀국수 태국음식 아시안", types: ["vietnamese_restaurant", "thai_restaurant", "asian_restaurant"] },
  cb:   { q: "치킨 버거",        types: ["hamburger_restaurant", "fast_food_restaurant"] },
  spot: { q: "명소 가볼만한 곳",   types: ["tourist_attraction", "park", "museum", "art_gallery"] },
};
// 구글 primary type → 앱 카테고리 역매핑
const TYPE2CAT = [
  ["tourist_attraction", "spot"], ["park", "spot"], ["museum", "spot"],
  ["art_gallery", "spot"], ["national_park", "spot"], ["botanical_garden", "spot"],
  ["historical_landmark", "spot"], ["cultural_landmark", "spot"],
  ["sushi_restaurant", "jp"], ["ramen_restaurant", "jp"], ["japanese_restaurant", "jp"],
  ["barbecue_restaurant", "meat"], ["korean_restaurant", "kr"],
  ["chinese_restaurant", "cn"], ["dim_sum_restaurant", "cn"],
  ["seafood_restaurant", "sea"],
  ["vietnamese_restaurant", "asia"], ["thai_restaurant", "asia"], ["indian_restaurant", "asia"], ["asian_restaurant", "asia"],
  ["hamburger_restaurant", "cb"], ["fast_food_restaurant", "cb"], ["chicken_restaurant", "cb"],
  ["cafe", "cafe"], ["bakery", "cafe"], ["dessert_shop", "cafe"], ["coffee_shop", "cafe"], ["ice_cream_shop", "cafe"],
  ["italian_restaurant", "west"], ["french_restaurant", "west"], ["american_restaurant", "west"],
  ["pizza_restaurant", "west"], ["steak_house", "west"],
];
export function guessCat(types, fallback) {
  const t = types || [];
  for (const [gt, ck] of TYPE2CAT) if (t.includes(gt)) return ck;
  return fallback || "kr";
}
export const PRICE_LABEL = {
  PRICE_LEVEL_INEXPENSIVE: "1만원 이하",
  PRICE_LEVEL_MODERATE: "1~2만원",
  PRICE_LEVEL_EXPENSIVE: "3~4만원",
  PRICE_LEVEL_VERY_EXPENSIVE: "5만원 이상",
};

// 선정 기준 — 앱의 핵심 규칙
export const MIN_RATING = 4.5;
export const MIN_REVIEWS = 50;
export function passes(p) {
  return (p.rating || 0) >= MIN_RATING && (p.userRatingCount || 0) >= MIN_REVIEWS;
}

export async function placesFetch(url, opts) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch (e) { /* ignore */ }
  if (!r.ok) {
    const msg = (j && j.error && j.error.message) || txt.slice(0, 300) || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return j || {};
}
