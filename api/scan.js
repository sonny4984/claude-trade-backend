// 종목 스캐너 — 네이버 시총 랭킹 API로 코스피/코스닥 상위 종목 일괄 조회
// 개별 polling 대신 랭킹 API 한 번에 수십~수백 개. 30분 캐시.
import { getCached, setCache } from './_lib.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CACHE_TTL_MS = 30 * 60 * 1000;

// 섹터 추정 (시총 API엔 섹터가 없어서 주요 종목만 매핑, 나머지는 빈값)
const SEC = {
  "005930":"반도체","000660":"반도체","042700":"반도체","011070":"전자부품","009150":"전자부품",
  "373220":"2차전지","006400":"2차전지","003670":"2차전지","051910":"화학","009830":"화학",
  "207940":"바이오","068270":"바이오","005380":"자동차","000270":"자동차","012330":"자동차부품",
  "329180":"조선","010140":"조선","009540":"조선","012450":"방산","064350":"방산","272210":"방산","047810":"방산",
  "034020":"원전","015760":"전력","035420":"인터넷","035720":"인터넷","259960":"게임","036570":"게임",
  "105560":"금융","055550":"금융","086790":"금융","316140":"금융","323410":"금융","024110":"금융",
  "066570":"전자","005490":"철강","010130":"비철금속","352820":"엔터","033780":"필수소비","090430":"화장품",
};

async function fetchRanking(market, pageSize) {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=1&pageSize=${pageSize}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Naver ${market} ${r.status}`);
  const data = await r.json();
  const list = data?.stocks || data?.datas || [];
  const toNum = (v) => v == null ? null : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return list.map(d => {
    const dir = d.compareToPreviousPrice?.code;
    const falling = dir === '5' || dir === '4';
    const pctAbs = toNum(d.fluctuationsRatio);
    const code = d.itemCode || d.cd;
    return {
      code, name: d.stockName || d.nm, sec: SEC[code] || "",
      market: market === 'KOSDAQ' ? 'KQ' : 'KR',
      price: toNum(d.closePrice ?? d.nv),
      changePct: pctAbs == null ? null : (falling ? -Math.abs(pctAbs) : Math.abs(pctAbs)),
      volume: toNum(d.accumulatedTradingVolume ?? d.aq),
      high: toNum(d.highPrice), low: toNum(d.lowPrice),
    };
  }).filter(x => x.code && x.price != null);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const debug = req.query.debug === '1';
  const cacheKey = 'scan:rank:v2';

  // 디버그: 시총 API raw 구조 확인
  if (debug) {
    try {
      const r = await fetch('https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=3', {
        headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' },
      });
      return res.status(200).json({ debug: true, status: r.status, body: (await r.text()).slice(0, 1500) });
    } catch (e) { return res.status(200).json({ debug: true, error: e.message }); }
  }

  try {
    let quotes = getCached(cacheKey, CACHE_TTL_MS);
    let cached = !!quotes;
    const errors = [];
    if (!quotes) {
      const [kospi, kosdaq] = await Promise.allSettled([
        fetchRanking('KOSPI', 100),
        fetchRanking('KOSDAQ', 80),
      ]);
      quotes = [];
      if (kospi.status === 'fulfilled') quotes.push(...kospi.value);
      else errors.push({ market:'KOSPI', error: kospi.reason?.message || String(kospi.reason) });
      if (kosdaq.status === 'fulfilled') quotes.push(...kosdaq.value);
      else errors.push({ market:'KOSDAQ', error: kosdaq.reason?.message || String(kosdaq.reason) });
      if (quotes.length) setCache(cacheKey, quotes);
    }
    return res.status(200).json({
      success: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      cached,
      quotes,
      ...(errors.length ? { errors } : {}),
      source: 'naver-ranking',
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e), fetchedAt: new Date().toISOString() });
  }
}
