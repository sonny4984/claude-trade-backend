import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

const MACRO_SYMBOLS = ['^KS11','^IXIC','^GSPC','^DJI','^VIX','KRW=X','DX-Y.NYB','GC=F','CL=F','BZ=F','BTC-USD','^TNX'];
const MACRO_MAP = {
  '^KS11':'kospi','^IXIC':'nasdaq','^GSPC':'sp500','^DJI':'dow','^VIX':'vix',
  'KRW=X':'usdkrw','DX-Y.NYB':'dxy','GC=F':'gold','CL=F':'wti','BZ=F':'brent',
  'BTC-USD':'btc','^TNX':'us10y',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const quotes = await yf.quote(MACRO_SYMBOLS, {}, { validateResult: false });
    const list = Array.isArray(quotes) ? quotes : [quotes];

    const result = {};
    list.forEach(q => {
      const key = MACRO_MAP[q.symbol];
      if (key) {
        result[key] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePct: q.regularMarketChangePercent,
          prevClose: q.regularMarketPreviousClose,
        };
      }
    });

    return res.status(200).json({
      success: true,
      fetchedAt: new Date().toISOString(),
      macro: result,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message || String(e),
      fetchedAt: new Date().toISOString(),
    });
  }
}
