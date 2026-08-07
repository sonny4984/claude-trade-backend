// 구글 Places(New) 검색 → 리뷰 50+ / 평점 4.5+ 필터 → 앱 스키마로 정규화
import {
  send, bad, preflight, cacheGet, cacheSet, placesFetch,
  PLACES_KEY, CATS, guessCat, PRICE_LABEL, MIN_RATING, MIN_REVIEWS, passes,
} from "./_lib.js";

const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.shortFormattedAddress",
  "places.location", "places.rating", "places.userRatingCount", "places.priceLevel",
  "places.photos", "places.types", "places.primaryTypeDisplayName",
  "places.currentOpeningHours.openNow", "places.googleMapsUri",
].join(",");

async function searchText(body) {
  return placesFetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
}

function normalize(p, catKey) {
  const photos = (p.photos || []).slice(0, 5).map((ph) => ph.name);
  return {
    id: p.id,
    n: (p.displayName && p.displayName.text) || "이름 없음",
    c: guessCat(p.types, catKey),
    r: p.rating || 0,
    rc: p.userRatingCount || 0,
    pr: PRICE_LABEL[p.priceLevel] || "",
    lat: p.location && p.location.latitude,
    lng: p.location && p.location.longitude,
    on: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : undefined,
    addr: p.shortFormattedAddress || p.formattedAddress || "",
    kind: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || "",
    photos,
    gmap: p.googleMapsUri || "",
  };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!PLACES_KEY) return bad(res, 503, "PLACES_KEY_MISSING", { hint: "Vercel 환경변수 GOOGLE_PLACES_KEY 를 설정하세요." });

  const q = req.query || {};
  const lat = parseFloat(q.lat), lng = parseFloat(q.lng);
  if (!isFinite(lat) || !isFinite(lng)) return bad(res, 400, "BAD_COORDS");
  const radius = Math.min(Math.max(parseInt(q.radius || "1800", 10), 200), 20000);
  const cat = q.cat && CATS[q.cat] ? q.cat : "all";
  const keyword = (q.q || "").trim().slice(0, 60);

  const ck = `s:${lat.toFixed(4)}:${lng.toFixed(4)}:${radius}:${cat}:${keyword}`;
  const hit = cacheGet(ck, 5 * 60 * 1000);
  if (hit) return send(res, 200, Object.assign({ cached: true }, hit), 300);

  // 카테고리 지정 시 해당 검색어만, 전체면 주요 카테고리를 병렬 검색해 합침
  const targets = keyword
    ? [{ key: cat === "all" ? null : cat, q: keyword }]
    : cat === "all"
      ? ["kr", "meat", "jp", "cn", "west", "cafe", "bs", "sea", "asia", "cb"].map((k) => ({ key: k, q: CATS[k].q }))
      : [{ key: cat, q: CATS[cat].q }];

  const locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius } };

  try {
    const results = await Promise.all(targets.map(async (t) => {
      try {
        const j = await searchText({
          textQuery: t.q,
          locationBias,
          minRating: MIN_RATING,          // 구글 단에서 1차 필터
          languageCode: "ko",
          regionCode: "KR",
          maxResultCount: keyword ? 20 : 12,
          rankPreference: "RELEVANCE",
        });
        return (j.places || []).map((p) => normalize(p, t.key));
      } catch (e) {
        return { __err: e.message };
      }
    }));

    const errs = results.filter((x) => x && x.__err).map((x) => x.__err);
    const flat = results.filter(Array.isArray).flat();
    if (!flat.length && errs.length) return bad(res, 502, "PLACES_API_ERROR", { detail: errs[0] });

    // 중복 제거 + 기준 재검증(리뷰 수는 구글 필터에 없으므로 여기서)
    const seen = new Set();
    const list = [];
    let dropped = 0;
    for (const p of flat) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (!passes({ rating: p.r, userRatingCount: p.rc })) { dropped++; continue; }
      list.push(p);
    }
    list.sort((a, b) => b.r - a.r || b.rc - a.rc);

    const payload = {
      ok: true,
      live: true,
      count: list.length,
      dropped,                       // 기준 미달로 걸러낸 수
      criteria: { minRating: MIN_RATING, minReviews: MIN_REVIEWS },
      center: { lat, lng, radius },
      places: list.slice(0, 60),
    };
    cacheSet(ck, payload);
    send(res, 200, payload, 300);
  } catch (e) {
    bad(res, 502, "PLACES_API_ERROR", { detail: String(e.message || e) });
  }
}
