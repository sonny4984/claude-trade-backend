// 구글 사진 프록시 — API 키를 노출하지 않고 이미지 URL로 리다이렉트
import { bad, preflight, cacheGet, cacheSet, placesFetch, PLACES_KEY } from "./_lib.js";

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!PLACES_KEY) return bad(res, 503, "PLACES_KEY_MISSING");
  const name = (req.query && req.query.name || "").trim();
  const h = Math.min(Math.max(parseInt((req.query && req.query.h) || "600", 10), 100), 1600);
  if (!name || !name.startsWith("places/")) return bad(res, 400, "BAD_PHOTO_NAME");

  const ck = `ph:${name}:${h}`;
  const hit = cacheGet(ck, 60 * 60 * 1000);
  if (hit) { res.writeHead(302, { Location: hit, "Cache-Control": "public, max-age=86400" }); return res.end(); }

  try {
    const j = await placesFetch(
      `https://places.googleapis.com/v1/${name}/media?maxHeightPx=${h}&skipHttpRedirect=true&key=${PLACES_KEY}`
    );
    if (!j.photoUri) return bad(res, 502, "NO_PHOTO_URI");
    cacheSet(ck, j.photoUri);
    res.writeHead(302, { Location: j.photoUri, "Cache-Control": "public, max-age=86400" });
    res.end();
  } catch (e) {
    bad(res, 502, "PHOTO_ERROR", { detail: String(e.message || e) });
  }
}
