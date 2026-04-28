export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const macroSymbols = ['^KS11','^IXIC','^GSPC','^DJI','^VIX','KRW=X','DX-Y.NYB','GC=F','CL=F','BZ=F','BTC-USD','^TNX'];

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(macroSymbols.join(','))}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    if (!r.ok) throw new Error(`Yahoo API ${r.status}`);
    const data = await r.json();
    const quotes = data?.quoteResponse?.result || [];
    const macroMap = {'^KS11':'kospi','^IXIC':'nasdaq','^GSPC':'sp500','^DJI':'dow','^VIX':'vix','KRW=X':'usdkrw','DX-Y.NYB':'dxy','GC=F':'gold','CL=F':'wti','BZ=F':'brent','BTC-USD':'btc','^TNX':'us10y'};
    const result = {};
    quotes.forEach(q => {
      const key = macroMap[q.symbol];
      if (key) result[key] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePct: q.regularMarketChangePercent,
        prevClose: q.regularMarketPreviousClose,
      };
    });
    return res.status(200).json({success:true, fetchedAt:new Date().toISOString(), macro:result});
  } catch (e) {
    return res.status(500).json({success:false, error:e.message});
  }
}
