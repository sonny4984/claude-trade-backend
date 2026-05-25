// 종목 스캐너 — 한국 주요 종목을 네이버로 일괄 시세 조회
// 프론트에서 스코어카드 점수 매겨 랭킹. 인메모리 캐시로 부하 완화.
import { getCached, setCache } from './_lib.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

// 코스피/코스닥 주요 종목 유니버스 (시총 상위 + 인기 테마주)
const UNIVERSE = [
  {code:"005930",name:"삼성전자",sec:"반도체"},        {code:"000660",name:"SK하이닉스",sec:"반도체"},
  {code:"373220",name:"LG에너지솔루션",sec:"2차전지"}, {code:"207940",name:"삼성바이오로직스",sec:"바이오"},
  {code:"005380",name:"현대차",sec:"자동차"},          {code:"000270",name:"기아",sec:"자동차"},
  {code:"068270",name:"셀트리온",sec:"바이오"},        {code:"105560",name:"KB금융",sec:"금융"},
  {code:"005490",name:"POSCO홀딩스",sec:"철강"},       {code:"035420",name:"NAVER",sec:"인터넷"},
  {code:"006400",name:"삼성SDI",sec:"2차전지"},        {code:"051910",name:"LG화학",sec:"화학"},
  {code:"055550",name:"신한지주",sec:"금융"},          {code:"012330",name:"현대모비스",sec:"자동차부품"},
  {code:"035720",name:"카카오",sec:"인터넷"},          {code:"028260",name:"삼성물산",sec:"지주"},
  {code:"086790",name:"하나금융지주",sec:"금융"},      {code:"329180",name:"HD현대중공업",sec:"조선"},
  {code:"012450",name:"한화에어로스페이스",sec:"방산"},{code:"034020",name:"두산에너빌리티",sec:"원전"},
  {code:"042700",name:"한미반도체",sec:"반도체"},      {code:"064350",name:"현대로템",sec:"방산"},
  {code:"015760",name:"한국전력",sec:"전력"},          {code:"032830",name:"삼성생명",sec:"보험"},
  {code:"003670",name:"포스코퓨처엠",sec:"2차전지"},   {code:"066570",name:"LG전자",sec:"전자"},
  {code:"003550",name:"LG",sec:"지주"},               {code:"017670",name:"SK텔레콤",sec:"통신"},
  {code:"030200",name:"KT",sec:"통신"},               {code:"009150",name:"삼성전기",sec:"전자부품"},
  {code:"011200",name:"HMM",sec:"해운"},              {code:"259960",name:"크래프톤",sec:"게임"},
  {code:"352820",name:"하이브",sec:"엔터"},            {code:"036570",name:"엔씨소프트",sec:"게임"},
  {code:"000810",name:"삼성화재",sec:"보험"},          {code:"316140",name:"우리금융지주",sec:"금융"},
  {code:"138040",name:"메리츠금융지주",sec:"금융"},    {code:"323410",name:"카카오뱅크",sec:"금융"},
  {code:"018260",name:"삼성에스디에스",sec:"IT서비스"},{code:"010130",name:"고려아연",sec:"비철금속"},
  {code:"009830",name:"한화솔루션",sec:"화학"},        {code:"047810",name:"한국항공우주",sec:"방산"},
  {code:"272210",name:"한화시스템",sec:"방산"},        {code:"010140",name:"삼성중공업",sec:"조선"},
  {code:"009540",name:"HD한국조선해양",sec:"조선"},    {code:"267250",name:"HD현대",sec:"지주"},
  {code:"011070",name:"LG이노텍",sec:"전자부품"},      {code:"096770",name:"SK이노베이션",sec:"정유"},
  {code:"033780",name:"KT&G",sec:"필수소비"},          {code:"090430",name:"아모레퍼시픽",sec:"화장품"},
];

async function fetchNaver(item) {
  const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${item.code}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Naver ${r.status}`);
  const data = await r.json();
  const d = data?.datas?.[0];
  if (!d) throw new Error('no data');
  const toNum = (v) => v == null ? null : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  const dir = d.compareToPreviousPrice?.code;
  const falling = dir === '5' || dir === '4';
  const price = toNum(d.closePrice);
  const pctAbs = toNum(d.fluctuationsRatio);
  const changePct = pctAbs == null ? null : (falling ? -Math.abs(pctAbs) : Math.abs(pctAbs));
  return {
    code: item.code, name: item.name, sec: item.sec, market: 'KR',
    price, changePct,
    high: toNum(d.highPrice), low: toNum(d.lowPrice),
    volume: toNum(d.accumulatedTradingVolume),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cacheKey = 'scan:kr:v1';
  try {
    let quotes = getCached(cacheKey, CACHE_TTL_MS);
    let cached = !!quotes;
    if (!quotes) {
      const settled = await Promise.allSettled(UNIVERSE.map(fetchNaver));
      quotes = settled.filter(s => s.status === 'fulfilled' && s.value.price != null).map(s => s.value);
      if (quotes.length) setCache(cacheKey, quotes);
    }
    return res.status(200).json({
      success: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
      count: quotes.length,
      universe: UNIVERSE.length,
      cached,
      quotes,
      source: 'naver',
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e), fetchedAt: new Date().toISOString() });
  }
}
