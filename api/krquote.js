// 네이버 증권 실시간 시세 (한국주 전용)
// Vercel egress에서 네이버 접근 가능한지 확인 + 한국주 실시간 시세
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function fetchNaver(code) {
  const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`Naver HTTP ${r.status}`);
  const data = await r.json();
  const d = data?.datas?.[0];
  if (!d) throw new Error('No datas in response');

  const toNum = (v) => v == null ? null : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  // compareToPreviousPrice.code: "2"/"1"=상승, "5"/"4"=하락
  const dir = d.compareToPreviousPrice?.code;
  const falling = dir === '5' || dir === '4';

  const price     = toNum(d.closePrice);
  const changeAbs = toNum(d.compareToPreviousClosePrice);
  const pctAbs    = toNum(d.fluctuationsRatio);
  const change    = changeAbs == null ? null : (falling ? -Math.abs(changeAbs) : Math.abs(changeAbs));
  const changePct = pctAbs == null ? null : (falling ? -Math.abs(pctAbs) : Math.abs(pctAbs));
  const prevClose = (price != null && change != null) ? price - change : null;

  return {
    symbol: code,
    name: d.stockName || code,
    price,
    prevClose,
    change,
    changePct,
    open: toNum(d.openPrice),
    high: toNum(d.highPrice),
    low: toNum(d.lowPrice),
    volume: toNum(d.accumulatedTradingVolume),
    currency: 'KRW',
    marketState: d.marketStatus || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = req.query.codes || '000660,005930,329180,034020,042700,064350,012450,005380';
  const codes = raw.split(',').map(s => s.trim().replace(/\.(KS|KQ)$/i, '')).filter(Boolean);
  const debug = req.query.debug === '1';

  try {
    const settled = await Promise.allSettled(codes.map(fetchNaver));
    const quotes = [];
    const errors = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') quotes.push(r.value);
      else errors.push({ code: codes[i], error: r.reason?.message || String(r.reason) });
    });

    // 디버그 모드: 첫 종목 raw 응답도 반환
    let rawSample = null;
    if (debug) {
      try {
        const r = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${codes[0]}`, {
          headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' },
        });
        rawSample = { status: r.status, body: (await r.text()).slice(0, 800) };
      } catch (e) { rawSample = { error: e.message }; }
    }

    return res.status(200).json({
      success: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      quotes,
      ...(errors.length ? { errors } : {}),
      ...(debug ? { rawSample } : {}),
      source: 'naver',
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e), fetchedAt: new Date().toISOString() });
  }
}
