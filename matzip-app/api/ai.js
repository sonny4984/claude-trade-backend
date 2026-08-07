// Gemini 추천 — 후보 목록을 주고 3곳을 고르게 한 뒤 이유까지 받아옴
import { send, bad, preflight, GEMINI_KEY, GEMINI_MODELS } from "./_lib.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    message: { type: "STRING", description: "사용자에게 건네는 한 문장 코멘트(한국어, 40자 이내)" },
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "후보 목록의 id를 그대로" },
          match: { type: "INTEGER", description: "매칭률 60~99" },
          reasons: { type: "ARRAY", items: { type: "STRING" }, description: "짧은 근거 2~3개, 각 12자 이내" },
          comment: { type: "STRING", description: "왜 이 집인지 한 문장(한국어, 60자 이내)" },
        },
        required: ["id", "match", "reasons", "comment"],
      },
    },
  },
  required: ["message", "picks"],
};

const WHO = { solo: "혼자", duo: "둘이서(데이트)", friends: "친구들과", family: "가족·단체" };
const MOOD = { hearty: "든든하게", light: "가볍게", spicy: "매콤하게", sweet: "달달하게", vibe: "분위기 좋은 곳" };
const BUDGET = { b1: "1만원 이하", b2: "1~3만원", b3: "3만원 이상", b0: "예산 상관없음" };

function buildPrompt({ who, mood, budget, text, hour, places }) {
  const lines = places.map((p) =>
    `- id:${p.id} | ${p.n} | ${p.cat} | 평점 ${p.r}(리뷰 ${p.rc}) | ${p.dist}m | ${p.pr || "가격정보없음"} | ${p.open ? "영업중" : "영업종료"} | 태그:${(p.tag || []).join(",") || "-"}`
  ).join("\n");
  const cond = [
    who ? `동행: ${WHO[who] || who}` : null,
    mood ? `기분: ${MOOD[mood] || mood}` : null,
    budget ? `예산: ${BUDGET[budget] || budget}` : null,
    text ? `요청: "${text}"` : null,
    `현재 시각: ${hour}시`,
  ].filter(Boolean).join(" / ");

  return `너는 한국 맛집 추천 앱 '찐맛'의 추천 도우미야.
아래 후보는 모두 구글 리뷰 50개 이상, 평점 4.5 이상을 통과한 검증된 맛집이야.

[사용자 조건] ${cond}

[후보 목록]
${lines}

규칙:
1. 반드시 후보 목록에 있는 id 중에서만 정확히 3곳을 고를 것.
2. 조건(동행/기분/예산/시간)에 얼마나 맞는지를 최우선으로 판단하고, 그다음 평점·거리·영업 여부를 고려할 것.
3. 지금 영업이 끝난 곳은 되도록 피하되, 조건에 아주 잘 맞으면 골라도 되고 그 사실을 comment에 언급할 것.
4. reasons는 "도보 5분", "혼밥 편함", "매콤한 맛" 처럼 짧은 근거 2~3개.
5. 존댓말로 자연스럽게, 광고 문구처럼 과장하지 말 것.`;
}

async function callGemini(model, prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    }
  );
  const txt = await r.text();
  if (!r.ok) { const e = new Error(txt.slice(0, 300)); e.status = r.status; throw e; }
  const j = JSON.parse(txt);
  const out = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("EMPTY_RESPONSE");
  return JSON.parse(out);
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!GEMINI_KEY) return bad(res, 503, "GEMINI_KEY_MISSING", { hint: "Vercel 환경변수 GEMINI_KEY 를 설정하세요." });
  if (req.method !== "POST") return bad(res, 405, "POST_ONLY");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const places = Array.isArray(body.places) ? body.places.slice(0, 40) : [];
  if (!places.length) return bad(res, 400, "NO_CANDIDATES");

  const prompt = buildPrompt({
    who: body.who, mood: body.mood, budget: body.budget,
    text: (body.text || "").slice(0, 200),
    hour: new Date(Date.now() + 9 * 3600 * 1000).getUTCHours(), // KST
    places,
  });

  const errors = [];
  for (const model of GEMINI_MODELS) {
    try {
      const out = await callGemini(model, prompt);
      const valid = new Set(places.map((p) => String(p.id)));
      const picks = (out.picks || []).filter((p) => valid.has(String(p.id))).slice(0, 3);
      if (!picks.length) throw new Error("NO_VALID_PICKS");
      return send(res, 200, { ok: true, model, message: out.message || "", picks });
    } catch (e) {
      errors.push(`${model}: ${String(e.message || e).slice(0, 160)}`);
    }
  }
  bad(res, 502, "GEMINI_ERROR", { detail: errors });
}
