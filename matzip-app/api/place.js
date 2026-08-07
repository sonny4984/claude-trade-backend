// 매장 상세 + 구글 리뷰(최대 5개, 공식 API 상한)
import { send, bad, preflight, cacheGet, cacheSet, placesFetch, PLACES_KEY, PRICE_LABEL, guessCat } from "./_lib.js";

const MASK = [
  "id", "displayName", "formattedAddress", "shortFormattedAddress", "location", "rating",
  "userRatingCount", "priceLevel", "photos", "types", "primaryTypeDisplayName",
  "nationalPhoneNumber", "websiteUri", "googleMapsUri",
  "currentOpeningHours.openNow", "regularOpeningHours.weekdayDescriptions",
  "reviews", "editorialSummary",
].join(",");

function ago(iso) {
  if (!iso) return "";
  const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  if (d <= 1) return "어제";
  if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.round(d / 7)}주 전`;
  if (d < 365) return `${Math.round(d / 30)}개월 전`;
  return `${Math.round(d / 365)}년 전`;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!PLACES_KEY) return bad(res, 503, "PLACES_KEY_MISSING");
  const id = (req.query && req.query.id || "").trim();
  if (!id) return bad(res, 400, "MISSING_ID");

  const hit = cacheGet("p:" + id, 10 * 60 * 1000);
  if (hit) return send(res, 200, Object.assign({ cached: true }, hit), 600);

  try {
    const p = await placesFetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=ko&regionCode=KR`,
      { headers: { "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": MASK } }
    );
    const reviews = (p.reviews || []).map((r) => ({
      w: (r.authorAttribution && r.authorAttribution.displayName) || "구글 이용자",
      av: (r.authorAttribution && r.authorAttribution.photoUri) || "",
      s: r.rating || 5,
      dl: (r.relativePublishTimeDescription || ago(r.publishTime)),
      t: (r.originalText && r.originalText.text) || (r.text && r.text.text) || "",
      uri: r.googleMapsUri || "",
    })).filter((r) => r.t);

    const payload = {
      ok: true, live: true,
      place: {
        id: p.id,
        n: (p.displayName && p.displayName.text) || "",
        c: guessCat(p.types),
        r: p.rating || 0,
        rc: p.userRatingCount || 0,
        pr: PRICE_LABEL[p.priceLevel] || "",
        lat: p.location && p.location.latitude,
        lng: p.location && p.location.longitude,
        on: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : undefined,
        addr: p.shortFormattedAddress || p.formattedAddress || "",
        tel: p.nationalPhoneNumber || "",
        site: p.websiteUri || "",
        gmap: p.googleMapsUri || "",
        kind: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || "",
        summary: (p.editorialSummary && p.editorialSummary.text) || "",
        hours: (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions) || [],
        photos: (p.photos || []).slice(0, 10).map((x) => x.name),
        reviews,
      },
    };
    cacheSet("p:" + id, payload);
    send(res, 200, payload, 600);
  } catch (e) {
    bad(res, 502, "PLACES_API_ERROR", { detail: String(e.message || e) });
  }
}
