import { tdQuote, normalizeQuote, getCached, setCache } from './_lib.js';

const CACHE_TTL_MS = 5 * 60 * 1000;  // 5분 캐시

// Twelve Data 무료 플랜은 인덱스(SPX/IXIC/DJI/VIX/DXY) 미지원
// → 추종 ETF로 우회 (변동률은 거의 동일, 가격 단위만 다름)
// 무료 한도 8 calls/min 안에 맞춰 7심볼만 배치
const BATCH = ['SPY', 'QQQ', 'DIA', 'UUP', 'USO', 'USD/KRW', 'XAU/USD'];
const META = {
  'SPY':     { key: 'sp500',  tracks: 'S&P 500',  etf: true  },
  'QQQ':     { key: 'nasdaq', tracks: 'NASDAQ',   etf: true  },
  'DIA':     { key: 'dow',    tracks: 'Dow Jones',etf: true  },
  'UUP':     { key: 'dxy',    tracks: 'DXY',      etf: true  },
  'USO':     { key: 'wti',    tracks: 'WTI Oil',  etf: true  },
  'USD/KRW': { key: 'usdkrw', tracks: 'USD/KRW',  etf: false },
  'XAU/USD': { key: 'gold',   tracks: 'Gold',     etf: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cacheKey = 'macro:v3';
  try {
    let macro = getCached(cacheKey, CACHE_TTL_MS);
    let errors = [];

    if (!macro) {
      const data = await tdQuote(BATCH);
      macro = {};
      BATCH.forEach(sym => {
        const row = data?.[sym];
        if (!row || row.code) {
          errors.push({ symbol: sym, error: row?.message || 'No data' });
          return;
        }
        const meta = META[sym];
        const norm = normalizeQuote(row, sym);
        macro[meta.key] = {
          price: norm.price,
          change: norm.change,
          changePct: norm.changePct,
          prevClose: norm.prevClose,
          tracker: sym,        // 실제 데이터 출처 심볼
          tracks: meta.tracks, // 대표하는 지표 이름
          isEtf: meta.etf,
        };
      });
      // 미지원 항목은 null
      macro.kospi  = null;   // 한국 인덱스 (Pro 필요)
      macro.kosdaq = null;
      macro.vix    = null;   // 인덱스 (Pro 필요)
      macro.brent  = null;   // 브렌트유 (Pro 필요)
      macro.us10y  = null;   // 10년물 (Pro 필요)
      macro.btc    = null;   // BTC/USD는 잘 됐는데 무료 한도 절약 위해 batch에서 뺌. 필요시 다시 추가
      setCache(cacheKey, macro);
    }

    return res.status(200).json({
      success: Object.values(macro).some(v => v && v.price != null),
      fetchedAt: new Date().toISOString(),
      macro,
      ...(errors.length ? { errors } : {}),
      source: 'twelvedata',
      note: '인덱스는 ETF로 추적(SPY/QQQ/DIA/UUP/USO). KOSPI/VIX/Brent/10Y는 무료 플랜 미지원.',
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message || String(e),
      fetchedAt: new Date().toISOString(),
    });
  }
}
