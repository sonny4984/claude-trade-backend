import { send, preflight, PLACES_KEY, GEMINI_KEY, MIN_RATING, MIN_REVIEWS } from "./_lib.js";

export default function handler(req, res) {
  if (preflight(req, res)) return;
  send(res, 200, {
    ok: true,
    places: !!PLACES_KEY,
    gemini: !!GEMINI_KEY,
    criteria: { minRating: MIN_RATING, minReviews: MIN_REVIEWS },
    ts: Date.now(),
  }, 30);
}
