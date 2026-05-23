import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = req.query.symbols || '000660.KS,005930.KS,329180.KS,034020.KS,042700.KS,064350.KS,012450.KS,RKLB';
  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const quotes = await yf.quote(symbolList, {}, { validateResult: false });
    const list = Array.isArray(quotes) ? quotes : [quotes];

    const formatted = list.map(q => ({
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
      lastUpdated: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : null,
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
      error: e.message || String(e),
      fetchedAt: new Date().toISOString(),
    });
  }
}
