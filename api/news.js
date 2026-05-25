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

const RX = {
  item: /<item[^>]*>([\s\S]*?)<\/item>/g,
  title: /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
  link: /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/,
  date: /<pubDate>([\s\S]*?)<\/pubDate>/,
  desc: /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/,
};
function parseRss(xml, src, max) {
  const out = [];
  let m, i = 0;
  RX.item.lastIndex = 0;
  while ((m = RX.item.exec(xml)) !== null && i < max) {
    const b = m[1];
    const t = RX.title.exec(b);
    if (!t) continue;
    const l = RX.link.exec(b);
    const d = RX.date.exec(b);
    const desc = RX.desc.exec(b);
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

// 한국경제 (한국어) — 번역 불필요
async function fetchHankyung() {
  const r = await fetch('https://www.hankyung.com/feed/economy', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!r.ok) throw new Error(`Hankyung ${r.status}`);
  const items = parseRss(await r.text(), '한국경제', 12);
  items.forEach(it => { it.titleKo = it.title; it.lang = 'ko'; });
  return items;
}

// 네이버 금융 주요뉴스 (한국어, JSON)
async function fetchNaver() {
  const r = await fetch('https://m.stock.naver.com/front-api/news/mainNews?pageSize=12&page=1', {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'Referer': 'https://m.stock.naver.com/' },
  });
  if (!r.ok) throw new Error(`Naver ${r.status}`);
  const d = await r.json();
  const list = d?.result?.list || d?.result?.newsList || d?.list || [];
  return list.slice(0, 12).map(n => ({
    title: (n.title || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
    titleKo: (n.title || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
    link: n.linkUrl || n.url || (n.officeId && n.articleId ? `https://n.news.naver.com/article/${n.officeId}/${n.articleId}` : ''),
    date: n.datetime || n.dateTime || '',
    summary: (n.body || n.summary || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
    src: '네이버', lang: 'ko',
  })).filter(x => x.title);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const settled = await Promise.allSettled([fetchHankyung(), fetchYahoo(), fetchNaver()]);
    let news = [];
    const sources = [];
    const srcNames = ['한국경제', 'Yahoo', '네이버'];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') { news.push(...s.value); sources.push(srcNames[i]); }
    });

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
      sources,
      news,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message, fetchedAt: new Date().toISOString() });
  }
}
