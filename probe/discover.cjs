/**
 * P1 车型 -> 汽车之家全景 URL 发现脚本
 * 流程：
 * 1. 拉取汽车之家 grade/carhtml/{A-Z}.html，解析品牌-车系 ID 映射
 * 2. 用 searchNames 模糊匹配目标车系 ID
 * 3. 对每个匹配车系，拉取 mobile 图库页，提取 pano.autohome.com.cn/car/pano/{id}
 * 4. 输出 p1-discovery.json（found / no_pano / series_not_found）
 */
const fs = require('fs');
const path = require('path');

const TARGETS_PATH = process.env.TARGETS_PATH || 'config/p1-targets.json';
const OUT_PATH = process.env.OUT_PATH || 'probe/p1-discovery.json';
const LOG_PATH = process.env.LOG_PATH || 'probe/p1-discovery.log';
const GRADE_BASE = 'https://www.autohome.com.cn/grade/carhtml';
const PIC_BASE = 'https://car.m.autohome.com.cn/pic/series';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...args) => {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
};

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
  const seriesByBrand = {}; // brandCn -> [{id, name}]
  // 按 <dl> 块拆分
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

function normalize(str) {
  return str.toLowerCase().replace(/\s+/g, '').replace(/[·\-\/（）()]/g, '');
}

function matchSeries(target, allSeries) {
  // allSeries: [{id, name, brandCn}]
  let best = null;
  let bestScore = -1;
  for (const s of allSeries) {
    // 必须同属目标品牌，避免跨品牌低质量子串匹配（如 大众探歌 -> V8 Vantage）
    if (s.brandCn !== target.brandCn) continue;
    for (const q of target.searchNames) {
      const sn = normalize(s.name);
      const qn = normalize(q);
      if (!qn || !sn) continue;
      let score = 0;
      if (sn === qn) score = 1000;
      else if (sn.includes(qn)) score = 500 + qn.length;
      else if (qn.includes(sn)) score = 200 + sn.length;
      else {
        // 简单公共子串奖励
        let common = 0;
        for (let i = 0; i < Math.min(sn.length, qn.length); i++) {
          if (sn[i] === qn[i]) common++;
        }
        if (common >= 4) score = common;
      }
      if (score <= 0) continue;
      // 惩罚项
      if (/进口|新能源| Sportback| e-tron|新能源/i.test(s.name) && !/进口|新能源/i.test(q)) score -= 50;
      if (score > bestScore) {
        bestScore = score;
        best = { ...s, matchedBy: q, score };
      }
    }
  }
  return best;
}

async function extractPanoId(seriesId) {
  const url = `${PIC_BASE}/${seriesId}.html`;
  const html = await fetchText(url, 2);
  const matches = [...html.matchAll(/pano\.autohome\.com\.cn\/car\/pano\/(\d+)/g)];
  const ids = [...new Set(matches.map(m => parseInt(m[1], 10)))];
  return ids.length ? ids[0] : null;
}

async function main() {
  fs.writeFileSync(LOG_PATH, '');
  const targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8')).targets;
  log(`开始发现 ${targets.length} 个目标车型的车系与全景 ID`);

  // 1. 拉取 A-Z 等级页
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const seriesByBrand = {};
  for (const letter of letters) {
    try {
      const html = await fetchText(`${GRADE_BASE}/${letter}.html`);
      const parsed = parseGradePage(html);
      Object.assign(seriesByBrand, parsed);
      log(`  [${letter}] 解析到 ${Object.keys(parsed).length} 个品牌`);
    } catch (e) {
      log(`  [${letter}] 拉取失败: ${e.message}`);
    }
    await sleep(300);
  }

  // 展平成 [{id, name, brandCn}]
  const allSeries = [];
  for (const [brand, items] of Object.entries(seriesByBrand)) {
    for (const s of items) allSeries.push({ ...s, brandCn: brand });
  }
  log(`全量车系数: ${allSeries.length}`);

  // 2. 匹配目标
  const results = [];
  for (const t of targets) {
    const match = matchSeries(t, allSeries);
    if (!match) {
      results.push({ ...t, status: 'series_not_found', seriesId: null, seriesName: null, panoId: null, panoUrl: null });
      log(`❌ 未找到车系: ${t.brandCn} ${t.modelCn}`);
      continue;
    }
    log(`✅ 匹配车系: ${t.brandCn} ${t.modelCn} -> ${match.name} (ID ${match.id}, score ${match.score})`);
    try {
      const panoId = await extractPanoId(match.id);
      if (panoId) {
        results.push({
          ...t,
          status: 'pano_found',
          seriesId: match.id,
          seriesName: match.name,
          panoId,
          panoUrl: `https://pano.autohome.com.cn/car/pano/${panoId}?_ahrotate=1`,
        });
        log(`   🌐 pano ID: ${panoId}`);
      } else {
        results.push({
          ...t,
          status: 'no_pano',
          seriesId: match.id,
          seriesName: match.name,
          panoId: null,
          panoUrl: null,
        });
        log(`   ⚪ 无全景`);
      }
    } catch (e) {
      results.push({
        ...t,
        status: 'fetch_pano_error',
        seriesId: match.id,
        seriesName: match.name,
        panoId: null,
        panoUrl: null,
        error: e.message,
      });
      log(`   ❌ 拉取全景失败: ${e.message}`);
    }
    await sleep(500);
  }

  // 3. 输出
  const out = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    found: results.filter(r => r.status === 'pano_found').length,
    noPano: results.filter(r => r.status === 'no_pano').length,
    notFound: results.filter(r => r.status === 'series_not_found').length,
    errors: results.filter(r => r.status === 'fetch_pano_error').length,
    results,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  log(`\n发现完成: found=${out.found}, no_pano=${out.noPano}, not_found=${out.notFound}, errors=${out.errors}`);
  log(`结果写入: ${OUT_PATH}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
