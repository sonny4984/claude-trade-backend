// Yahoo Finance chart endpoint (no crumb required)
// 여러 심볼은 Promise.allSettled로 병렬 호출
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchQuote(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart data');
  const meta = result.meta || {};

  // prevClose: meta에 chartPreviousClose가 있거나, quotes 배열의 마지막에서 두 번째 close
  let prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const closes = result.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter(c => c != null);
  if (prevClose == null && validCloses.length >= 2) {
    prevClose = validCloses[validCloses.length - 2];
  }

  const price = meta.regularMarketPrice;
  const change = (price != null && prevClose != null) ? price - prevClose : null;
  const changePct = (change != null && prevClose) ? (change / prevClose) * 100 : null;

  return {
    symbol: meta.symbol || symbol,
    name: meta.shortName || meta.longName || meta.symbol || symbol,
    price,
    prevClose,
    change,
    changePct,
    volume: meta.regularMarketVolume ?? null,
    high52w: meta.fiftyTwoWeekHigh ?? null,
    low52w: meta.fiftyTwoWeekLow ?? null,
    currency: meta.currency || null,
    marketState: null,
    lastUpdated: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = req.query.symbols || '000660.KS,005930.KS,329180.KS,034020.KS,042700.KS,064350.KS,012450.KS,RKLB';
  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const settled = await Promise.allSettled(symbolList.map(fetchQuote));
    const quotes = [];
    const errors = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') quotes.push(r.value);
      else errors.push({ symbol: symbolList[i], error: r.reason?.message || String(r.reason) });
    });

    return res.status(200).json({
      success: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      quotes,
      ...(errors.length ? { errors } : {}),
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message || String(e),
      fetchedAt: new Date().toISOString(),
    });
  }
}
