// 인메모리 캐시 — Vercel serverless instance 재사용 동안 유지
// cold start 마다 비워지지만, 같은 instance 내에서는 TTL 동안 캐시 hit
const cache = new Map();

export function getCached(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCache(key, value) {
  cache.set(key, { at: Date.now(), value });
}

const KEY = process.env.TWELVE_DATA_KEY;

// Twelve Data quote — 콤마로 여러 심볼 가능 (각 심볼이 1 credit, 무료 8/min)
export async function tdQuote(symbols) {
  if (!KEY) throw new Error('TWELVE_DATA_KEY env var not set');
  const param = Array.isArray(symbols) ? symbols.join(',') : symbols;
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(param)}&apikey=${KEY}`;
  const r = await fetch(url);
  const data = await r.json();
  // 단일 심볼 응답: object, 다중 심볼 응답: { 'AAPL': {...}, 'MSFT': {...} }
  if (data?.code && data?.status === 'error') {
    throw new Error(data.message || `Twelve Data error ${data.code}`);
  }
  return data;
}

// 정규화: Twelve Data 응답을 우리 포맷으로
export function normalizeQuote(td, fallbackSymbol) {
  const price       = parseFloat(td.close);
  const prevClose   = parseFloat(td.previous_close);
  const change      = parseFloat(td.change);
  const changePct   = parseFloat(td.percent_change);
  const volume      = td.volume ? parseInt(td.volume, 10) : null;
  return {
    symbol: td.symbol || fallbackSymbol,
    name: td.name || td.symbol || fallbackSymbol,
    price: isNaN(price) ? null : price,
    prevClose: isNaN(prevClose) ? null : prevClose,
    change: isNaN(change) ? null : change,
    changePct: isNaN(changePct) ? null : changePct,
    volume,
    high52w: td.fifty_two_week?.high ? parseFloat(td.fifty_two_week.high) : null,
    low52w:  td.fifty_two_week?.low  ? parseFloat(td.fifty_two_week.low)  : null,
    currency: td.currency || null,
    marketState: td.is_market_open === false ? 'CLOSED' : (td.is_market_open === true ? 'OPEN' : null),
    lastUpdated: td.last_quote_at ? new Date(td.last_quote_at * 1000).toISOString() : null,
  };
}
