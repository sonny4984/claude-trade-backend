// 멀티소스 뉴스 — Yahoo Finance(영어→번역) + 한국경제(한국어) + 네이버 금융
// 무료 소스를 통합해 유료급 커버리지. 한국어 우선.

async function translateKo(text) {
  if (!text) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return text;
    const d = await r.json();
    return (d?.[0] || []).map(seg => seg[0]).join('') || text;
  } catch { return text; }
}

function parseRss(xml, src, max) {
  // 정규식은 함수 내 지역 생성 (병렬 호출 시 lastIndex 충돌 방지)
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/g;
  const titleRx = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
  const linkRx = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/;
  const dateRx = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const descRx = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/;
  const out = [];
  let m, i = 0;
  while ((m = itemRx.exec(xml)) !== null && i < max) {
    const b = m[1];
    const t = titleRx.exec(b);
    if (!t) continue;
    const l = linkRx.exec(b);
    const d = dateRx.exec(b);
    const desc = descRx.exec(b);
    out.push({
      title: t[1].trim().slice(0, 200),
      link: l ? l[1].trim() : '',
      date: d ? d[1].trim() : '',
      summary: desc ? desc[1].replace(/<[^>]+>/g, '').trim().slice(0, 200) : '',
      src,
    });
    i++;
  }
  return out;
}

// Yahoo (영어) — 번역 필요
async function fetchYahoo() {
  const r = await fetch('https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^IXIC,^KS11&region=US&lang=en-US', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const items = parseRss(await r.text(), 'Yahoo Finance', 10);
  await Promise.all(items.map(async it => { it.titleKo = await translateKo(it.title); it.lang = 'en'; }));
  return items;
}

// 구글 뉴스 한국어 RSS (여러 언론사 집계, 번역 불필요)
async function fetchGoogleKo(query, max) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`GoogleNews ${r.status}`);
  const items = parseRss(await r.text(), '구글뉴스', max);
  items.forEach(it => {
    // 구글뉴스 title은 "제목 - 언론사" 형식 → 언론사 분리
    const m = it.title.match(/^(.*?)\s*-\s*([^-]+)$/);
    if (m) { it.title = m[1].trim(); it.src = m[2].trim(); }
    it.titleKo = it.title;
    it.lang = 'ko';
  });
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const settled = await Promise.allSettled([
      fetchGoogleKo('증시 주식', 10),
      fetchGoogleKo('코스피 코스닥', 8),
      fetchGoogleKo('미국증시 나스닥', 6),
      fetchYahoo(),
    ]);
    let news = [];
    const sources = new Set();
    const errors = [];
    const srcNames = ['구글뉴스(증시)', '구글뉴스(코스피)', '구글뉴스(미국)', 'Yahoo'];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') { news.push(...s.value); sources.add(srcNames[i]); }
      else errors.push({ src: srcNames[i], error: s.reason?.message || String(s.reason) });
    });
    // 제목 중복 제거
    const seen = new Set();
    news = news.filter(n => { const k = n.title.slice(0, 30); if (seen.has(k)) return false; seen.add(k); return true; });

    // 날짜 내림차순 정렬 (파싱 실패 시 원순서 유지)
    news.sort((a, b) => {
      const ta = Date.parse(a.date) || 0, tb = Date.parse(b.date) || 0;
      return tb - ta;
    });
    news = news.slice(0, 25).map((n, i) => ({ rank: i + 1, ...n }));

    return res.status(200).json({
      success: news.length > 0,
      fetchedAt: new Date().toISOString(),
      count: news.length,
      sources: [...sources],
      ...(errors.length ? { errors } : {}),
      news,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message, fetchedAt: new Date().toISOString() });
  }
}
