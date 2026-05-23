import { tdQuote, normalizeQuote, getCached, setCache } from './_lib.js';

const CACHE_TTL_MS = 3 * 60 * 1000;       // 3분 캐시
const KR_SUFFIX = /\.(KS|KQ|KRX)$/i;       // 한국주 감지

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = req.query.symbols || 'RKLB';
  const requested = raw.split(',').map(s => s.trim()).filter(Boolean);

  // 한국주는 무료 플랜에서 지원 안 함 — 분리
  const krSymbols  = requested.filter(s => KR_SUFFIX.test(s));
  const usSymbols  = requested.filter(s => !KR_SUFFIX.test(s));

  try {
    let quotes = [];
    const errors = [];

    if (usSymbols.length > 0) {
      const cacheKey = `q:${usSymbols.sort().join(',')}`;
      let cached = getCached(cacheKey, CACHE_TTL_MS);

      if (!cached) {
        const data = await tdQuote(usSymbols);
        // 단일 vs 다중 응답 정규화
        const arr = (usSymbols.length === 1)
          ? [normalizeQuote(data, usSymbols[0])]
          : usSymbols.map(sym => {
              const row = data?.[sym];
              if (!row || row.code) {
                errors.push({ symbol: sym, error: row?.message || 'No data' });
                return null;
              }
              return normalizeQuote(row, sym);
            }).filter(Boolean);
        cached = arr;
        setCache(cacheKey, arr);
      }
      quotes = quotes.concat(cached);
    }

    // 한국주는 별도 안내
    krSymbols.forEach(sym => {
      errors.push({
        symbol: sym,
        error: '한국주 자동 갱신 미지원 (무료 플랜). 직접 입력하거나 외부 사이트 참고.',
      });
    });

    return res.status(200).json({
      success: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      quotes,
      ...(errors.length ? { errors } : {}),
      source: 'twelvedata',
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message || String(e),
      fetchedAt: new Date().toISOString(),
    });
  }
}
