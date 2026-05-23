const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MACRO_SYMBOLS = ['^KS11','^IXIC','^GSPC','^DJI','^VIX','KRW=X','DX-Y.NYB','GC=F','CL=F','BZ=F','BTC-USD','^TNX'];
const MACRO_MAP = {
  '^KS11':'kospi','^IXIC':'nasdaq','^GSPC':'sp500','^DJI':'dow','^VIX':'vix',
  'KRW=X':'usdkrw','DX-Y.NYB':'dxy','GC=F':'gold','CL=F':'wti','BZ=F':'brent',
  'BTC-USD':'btc','^TNX':'us10y',
};

async function fetchMacro(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart data');
  const meta = result.meta || {};

  let prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const closes = result.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter(c => c != null);
  if (prevClose == null && validCloses.length >= 2) prevClose = validCloses[validCloses.length - 2];

  const price = meta.regularMarketPrice;
  const change = (price != null && prevClose != null) ? price - prevClose : null;
  const changePct = (change != null && prevClose) ? (change / prevClose) * 100 : null;

  return { symbol: meta.symbol || symbol, price, change, changePct, prevClose };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const settled = await Promise.allSettled(MACRO_SYMBOLS.map(fetchMacro));
    const macro = {};
    const errors = [];
    settled.forEach((r, i) => {
      const sym = MACRO_SYMBOLS[i];
      if (r.status === 'fulfilled') {
        const key = MACRO_MAP[r.value.symbol] || MACRO_MAP[sym];
        if (key) {
          const { symbol, ...rest } = r.value;
          macro[key] = rest;
        }
      } else {
        errors.push({ symbol: sym, error: r.reason?.message || String(r.reason) });
      }
    });

    return res.status(200).json({
      success: Object.keys(macro).length > 0,
      fetchedAt: new Date().toISOString(),
      macro,
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
