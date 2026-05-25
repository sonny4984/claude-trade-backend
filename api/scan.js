// 종목 스캐너 — 미국(나스닥+NYSE) 80% + 한국(코스피+코스닥) 20%
// 네이버 시총 랭킹 API (국내/해외 모두). 무료, Vercel 통과. 30분 캐시.
import { getCached, setCache } from './_lib.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CACHE_TTL_MS = 30 * 60 * 1000;
const toNum = (v) => v == null ? null : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));

const KR_SEC = {
  "005930":"반도체","000660":"반도체","042700":"반도체","011070":"전자부품","373220":"2차전지",
  "006400":"2차전지","051910":"화학","207940":"바이오","068270":"바이오","005380":"자동차","000270":"자동차",
  "329180":"조선","012450":"방산","064350":"방산","034020":"원전","035420":"인터넷","035720":"인터넷",
};

// 국내 시총 랭킹 (KOSPI / KOSDAQ)
async function fetchKR(market, pageSize) {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=1&pageSize=${pageSize}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } });
  if (!r.ok) throw new Error(`${market} ${r.status}`);
  const data = await r.json();
  return (data?.stocks || []).map(d => {
    const dir = d.compareToPreviousPrice?.code;
    const falling = dir === '5' || dir === '4';
    const pct = toNum(d.fluctuationsRatio);
    const code = d.itemCode;
    return {
      code, name: d.stockName, sec: KR_SEC[code] || "", market: market === 'KOSDAQ' ? 'KQ' : 'KR',
      price: toNum(d.closePrice), changePct: pct == null ? null : (falling ? -Math.abs(pct) : Math.abs(pct)),
      high: toNum(d.highPrice), low: toNum(d.lowPrice), volume: toNum(d.accumulatedTradingVolume),
    };
  }).filter(x => x.code && x.price != null);
}

// 해외 시총 랭킹 (NASDAQ / NYSE)
async function fetchUS(exchange, pageSize, page = 1) {
  const url = `https://api.stock.naver.com/stock/exchange/${exchange}/marketValue?page=${page}&pageSize=${pageSize}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } });
  if (!r.ok) throw new Error(`${exchange} ${r.status}`);
  const data = await r.json();
  return (data?.stocks || []).map(d => {
    const dir = d.compareToPreviousPrice?.code;
    const falling = dir === '5' || dir === '4';
    const pct = toNum(d.fluctuationsRatio);
    return {
      code: d.symbolCode, name: d.stockName || d.symbolCode, nameEng: d.stockNameEng || "", sec: "", market: 'US',
      price: toNum(d.closePrice), changePct: pct == null ? null : (falling ? -Math.abs(pct) : Math.abs(pct)),
      high: toNum(d.highPrice), low: toNum(d.lowPrice), volume: toNum(d.accumulatedTradingVolume),
    };
  }).filter(x => x.code && x.price != null);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const nocache = req.query.nocache === '1';
  const cacheKey = 'scan:mix:v1';

  try {
    let quotes = nocache ? null : getCached(cacheKey, CACHE_TTL_MS);
    let cached = !!quotes;
    const errors = [];
    if (!quotes) {
      // 미국 80% (나스닥 110 + NYSE 40 = 150), 한국 20% (코스피 30 + 코스닥 10 = 40)
      const tasks = [
        ['NASDAQ1', () => fetchUS('NASDAQ', 50, 1)],
        ['NASDAQ2', () => fetchUS('NASDAQ', 50, 2)],
        ['NYSE', () => fetchUS('NYSE', 50, 1)],
        ['KOSPI', () => fetchKR('KOSPI', 30)],
        ['KOSDAQ', () => fetchKR('KOSDAQ', 8)],
      ];
      const settled = await Promise.allSettled(tasks.map(t => t[1]()));
      quotes = [];
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') quotes.push(...s.value);
        else errors.push({ market: tasks[i][0], error: s.reason?.message || String(s.reason) });
      });
      if (quotes.length) setCache(cacheKey, quotes);
    }
    const us = quotes.filter(q => q.market === 'US').length;
    return res.status(200).json({
      success: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      usCount: us, krCount: quotes.length - us,
      cached, quotes,
      ...(errors.length ? { errors } : {}),
      source: 'naver-ranking',
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e), fetchedAt: new Date().toISOString() });
  }
}
