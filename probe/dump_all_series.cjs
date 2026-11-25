/**
 * 一次性 dump 汽车之家全量车系 (brandCn, id, name) -> config/all_series.json
 * 供中系 notFound 项反查真实品牌名用，不依赖采集目标。
 */
const fs = require('fs');
const GRADE_BASE = 'https://www.autohome.com.cn/grade/carhtml';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 1000) throw new Error('empty or too short');
      return text;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function parseGradePage(html) {
  const seriesByBrand = {};
  const dlBlocks = html.split('<dl ').slice(1);
  for (const block of dlBlocks) {
    const brandMatch = block.match(/<dt>\s*<a[^>]*>.*?<\/a>.*?<div>\s*<a[^>]*>([^<]+)<\/a>\s*<\/div>\s*<\/dt>/s);
    if (!brandMatch) continue;
    const brand = brandMatch[1].trim();
    const items = [];
    const liRe = /<li\s+id="s(\d+)"[^>]*>.*?<h4[^>]*>.*?<a[^>]*>([^<]+)<\/a>.*?<\/li>/gs;
    let m;
    while ((m = liRe.exec(block)) !== null) {
      items.push({ id: parseInt(m[1], 10), name: m[2].trim() });
    }
    if (items.length) seriesByBrand[brand] = items;
  }
  return seriesByBrand;
}

async function main() {
  const seriesByBrand = {};
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    try {
      const html = await fetchText(`${GRADE_BASE}/${letter}.html`);
      Object.assign(seriesByBrand, parseGradePage(html));
      process.stdout.write(letter + ' ');
    } catch (e) {
      process.stdout.write(`[${letter}失败:${e.message}] `);
    }
    await sleep(200);
  }
  const all = [];
  for (const [brand, items] of Object.entries(seriesByBrand)) {
    for (const s of items) all.push({ brandCn: brand, id: s.id, name: s.name });
  }
  fs.writeFileSync('config/all_series.json', JSON.stringify(all, null, 1));
  console.log('\n总车系数:', all.length, '| 品牌数:', Object.keys(seriesByBrand).length);
  console.log('写出: config/all_series.json');
}

main().catch(e => { console.error(e); process.exit(1); });
