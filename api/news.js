export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch('https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^IXIC,^KS11&region=US&lang=en-US', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!r.ok) throw new Error(`RSS ${r.status}`);
    const xml = await r.text();

    // 간단한 RSS 파싱 (item 태그 추출)
    const items = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
    const linkRegex = /<link>([\s\S]*?)<\/link>/;
    const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
    const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/;

    let match;
    let idx = 0;
    while ((match = itemRegex.exec(xml)) !== null && idx < 15) {
      const block = match[1];
      const t = titleRegex.exec(block);
      const l = linkRegex.exec(block);
      const d = dateRegex.exec(block);
      const desc = descRegex.exec(block);
      if (t) {
        items.push({
          rank: idx + 1,
          title: t[1].trim().slice(0, 200),
          link: l ? l[1].trim() : '',
          date: d ? d[1].trim() : '',
          summary: desc ? desc[1].replace(/<[^>]+>/g, '').trim().slice(0, 250) : '',
          src: 'Yahoo Finance',
        });
        idx++;
      }
    }

    return res.status(200).json({
      success: true,
      fetchedAt: new Date().toISOString(),
      count: items.length,
      news: items,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
      fetchedAt: new Date().toISOString(),
    });
  }
}
