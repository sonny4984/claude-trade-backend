export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = req.query.symbols || '000660.KS,005930.KS,329180.KS,034020.KS,042700.KS,064350.KS,012450.KS,RKLB';
  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList.join(','))}`;
    const yahooRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (!yahooRes.ok) throw new Error(`Yahoo API ${yahooRes.status}`);
    const data = await yahooRes.json();
    const quotes = data?.quoteResponse?.result || [];
    const formatted = quotes.map(q => ({
      symbol: q.symbol,
      name: q.longName || q.shortName || q.symbol,
      price: q.regularMarketPrice,
      prevClose: q.regularMarketPreviousClose,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      volume: q.regularMarketVolume,
      high52w: q.fiftyTwoWeekHigh,
      low52w: q.fiftyTwoWeekLow,
      currency: q.currency,
      marketState: q.marketState,
      lastUpdated: q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null,
    }));
    return res.status(200).json({
      success: true,
      fetchedAt: new Date().toISOString(),
      count: formatted.length,
      quotes: formatted,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
      fetchedAt: new Date().toISOString(),
    });
  }
}
