// Gemini 1.5 Flash 무료 — 종목 한 줄 분석
// POST /api/ai  body: {sym,name,sec,price,changePct,high52w,low52w,newsTopics?}
// 응답: {analysis, cached, model}
import { getCached, setCache } from './_lib.js';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30분: 같은 종목 반복 호출 절약
const MODEL = 'gemini-1.5-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY env var not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { sym, name, sec, price, changePct, high52w, low52w, newsTopics } = body;
  if (!sym) return res.status(400).json({ success: false, error: 'sym required' });

  const cacheKey = `ai:${sym}`;
  const cached = getCached(cacheKey, CACHE_TTL_MS);
  if (cached) return res.status(200).json({ success: true, analysis: cached, cached: true, model: MODEL });

  // 52주 위치 사전 계산
  let pos = null;
  if (price != null && high52w && low52w) pos = Math.round(((price - low52w) / (high52w - low52w)) * 100);

  const prompt = `다음 미국 주식을 객관적으로 2~3문장으로 분석해줘. 매수·매도 추천은 절대 하지 말고, 현재 상태만 서술. 마지막에 [강세/양호/관망/약세] 한 단어로 끝내.

종목: ${name || sym} (${sym})
섹터: ${sec || '-'}
현재가: $${price ?? '-'}
오늘 등락: ${changePct != null ? (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%' : '-'}
52주 범위: $${low52w ?? '-'} ~ $${high52w ?? '-'}${pos != null ? ` (현재 ${pos}% 지점)` : ''}
${newsTopics ? `최근 뉴스 키워드: ${newsTopics}` : ''}

한국어, 간결하게.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!text) throw new Error('Empty response from Gemini');

    setCache(cacheKey, text);
    return res.status(200).json({ success: true, analysis: text, cached: false, model: MODEL });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
}
