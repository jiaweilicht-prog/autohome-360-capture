// 生成《日系全景数据源》：从 kr_grade_cache（全品牌车系缓存）筛选日系品牌车系，
// 逐车系抓汽车之家 360 全景 panoId，按「同 panoId=同造型」去重，生成日系 discovery。
// 输出：probe/p1-discovery.json（run-p1.cjs 读取，覆盖前自动备份）+ config/jp_discovery_full.json（备份）
//      + config/jp_catalog.csv（完整每车系目录，含是否有全景）
//      + docs/日系可采集车型目录.md（按品牌分组的可采集造型清单）
// 断点续跑：config/jp_pano_cache.json 按 seriesId 缓存结果，被中断重跑会自动跳过已抓的。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const GRADE_CACHE = path.join(ROOT, 'config', 'kr_grade_cache.json');
const PANO_CACHE = path.join(ROOT, 'config', 'jp_pano_cache.json');
const DISC = path.join(ROOT, 'probe', 'p1-discovery.json');
const DISC_BAK = path.join(ROOT, 'config', 'jp_discovery_full.json');
const CATALOG_CSV = path.join(ROOT, 'config', 'jp_catalog.csv');
const CATALOG_MD = path.join(ROOT, 'docs', '日系可采集车型目录.md');

// 日系品牌（cn 名，须与 grade 缓存在键名一致）。含主流+豪华+商用车。
const JP_BRANDS = [
  { cn: '丰田', code: 'TOYOTA' },
  { cn: '本田', code: 'HONDA' },
  { cn: '日产', code: 'NISSAN' },
  { cn: '马自达', code: 'MAZDA' },
  { cn: '斯巴鲁', code: 'SUBARU' },
  { cn: '三菱', code: 'MITSU' },
  { cn: '铃木', code: 'SUZUKI' },
  { cn: '雷克萨斯', code: 'LEXUS' },
  { cn: '英菲尼迪', code: 'INFINITI' },
  { cn: '讴歌', code: 'ACURA' },
  { cn: '大发', code: 'DAIHATSU' },
  { cn: '五十铃', code: 'ISUZU' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      });
      if (res.status === 429) { await sleep(60000); continue; }
      if (!res.ok) throw new Error('HTTP' + res.status);
      const t = await res.text();
      if (!t || t.length < 1000) throw new Error('too short');
      return t;
    } catch (e) { if (i === retries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
  throw new Error('exhausted');
}
async function extractPano(seriesId, cache) {
  if (Object.prototype.hasOwnProperty.call(cache, seriesId)) return cache[seriesId];
  let pano = 'ERR';
  try {
    const h = await fetchText(`https://car.m.autohome.com.cn/pic/series/${seriesId}.html`);
    const mm = [...h.matchAll(/pano\.autohome\.com\.cn\/car\/pano\/(\d+)/g)];
    const ids = [...new Set(mm.map(x => +x[1]))];
    pano = ids.length ? ids[0] : 'NONE';
  } catch (e) { pano = 'ERR'; }
  cache[seriesId] = pano;
  return pano;
}
function mdEscape(s) { return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
(async () => {
  const brandSeries = JSON.parse(fs.readFileSync(GRADE_CACHE, 'utf8'));
  const allSeries = [];
  for (const [brand, items] of Object.entries(brandSeries)) for (const s of items) allSeries.push({ ...s, brand });
  const brandMap = Object.fromEntries(JP_BRANDS.map(b => [b.cn, b.code]));
  const jp = allSeries.filter(s => brandMap[s.brand]);
  console.log('日系品牌车系总数', jp.length, '（含子品牌如广汽丰田等已并入主品牌键）');

  const panoCache = fs.existsSync(PANO_CACHE) ? JSON.parse(fs.readFileSync(PANO_CACHE, 'utf8')) : {};
  const rows = [];
  let err = 0;
  const CONC = 4;
  for (let i = 0; i < jp.length; i += CONC) {
    const batch = jp.slice(i, i + CONC);
    const out = await Promise.all(batch.map(async s => {
      const p = await extractPano(s.id, panoCache);
      return { brandCn: s.brand, seriesName: s.name, seriesId: s.id, pano: p === 'ERR' ? null : (p === 'NONE' ? null : p), raw: p };
    }));
    for (const r of out) { if (r.raw === 'ERR') err++; rows.push(r); }
    const done = Math.min(i + CONC, jp.length);
    if (done % 40 < CONC) console.log(`  进度 ${done}/${jp.length} 已抓到全景 ${rows.filter(r => r.pano).length} ERR ${err}`);
    await sleep(250);
  }
  fs.writeFileSync(PANO_CACHE, JSON.stringify(panoCache));

  const withPano = rows.filter(r => r.pano);
  const seen = new Set(), groups = [];
  for (const r of withPano) { if (seen.has(r.pano)) continue; seen.add(r.pano); groups.push(r); }
  console.log(`有全景 ${withPano.length} / 车系 ${rows.length}；同pano去重后造型分组 ${groups.length}；ERR ${err}`);

  const results = groups.map((r, i) => ({
    status: 'pano_found',
    brandCn: r.brandCn, seriesName: r.seriesName, seriesId: r.seriesId,
    brandEn: brandMap[r.brandCn] || 'JP', modelEn: r.seriesName,
    panoId: +r.pano,
    panoUrl: `https://pano.autohome.com.cn/car/pano/${r.pano}?_ahrotate=1`,
    group: `JP${String(i + 1).padStart(4, '0')}`,
  }));
  const out = { generatedAt: new Date().toISOString(), total: results.length, found: results.length, noPano: rows.length - withPano.length, notFound: 0, errors: err, results };

  // 备份当前 p1-discovery.json（若不是日系），再写入日系 discovery
  if (fs.existsSync(DISC)) {
    try { const cur = JSON.parse(fs.readFileSync(DISC, 'utf8')); if (!String(cur.generatedAt || '').includes('日系') && !(cur.results || []).every(r => JP_BRANDS.some(b => b.cn === r.brandCn))) { fs.copyFileSync(DISC, DISC + '.prev.bak'); console.log('已备份旧 p1-discovery.json ->', DISC + '.prev.bak'); } } catch (e) {}
  }
  fs.writeFileSync(DISC, JSON.stringify(out, null, 1));
  fs.writeFileSync(DISC_BAK, JSON.stringify(out, null, 1));
  console.log('写 discovery ->', DISC, '共', results.length, '组');

  // 完整目录 CSV（含无全景的车系）
  const header = 'brandCn,seriesName,seriesId,pano,collectible\n';
  const csv = header + rows.map(r => `${r.brandCn},${r.seriesName},${r.seriesId},${r.pano || ''},${r.pano ? 'Y' : 'N'}`).join('\n');
  fs.writeFileSync(CATALOG_CSV, csv);

  // 品牌分布
  const dist = {}, distPano = {};
  for (const r of rows) { dist[r.brandCn] = (dist[r.brandCn] || 0) + 1; if (r.pano) distPano[r.brandCn] = (distPano[r.brandCn] || 0) + 1; }
  console.log('车系品牌分布:', JSON.stringify(dist));
  console.log('有全景造型分组品牌分布:', JSON.stringify(distPano));

  // 生成可读目录 MD（按品牌分组，仅列可采集造型）
  const byBrand = {};
  for (const g of groups) (byBrand[g.brandCn] = byBrand[g.brandCn] || []).push(g);
  const brandOrder = JP_BRANDS.map(b => b.cn).filter(c => byBrand[c]);
  let md = '# 日系可采集车型目录（360° 内饰全景）\n\n';
  md += `> 数据源：汽车之家 360° 内饰全景。生成时间 ${out.generatedAt}\n\n`;
  md += `## 总览\n\n`;
  md += `- 日系车系总数（缓存）：**${rows.length}**\n`;
  md += `- 有 360° 全景可采集：车系 ${withPano.length} 个，去重后造型分组 **${groups.length}** 个\n`;
  md += `- 无全景（源站缺失）：${rows.length - withPano.length} 个车系\n\n`;
  md += `| 品牌 | 车系数 | 有全景车系 | 去重造型分组 |\n|---|---|---|---|\n`;
  for (const c of brandOrder) md += `| ${c} | ${dist[c]} | ${distPano[c] || 0} | ${byBrand[c].length} |\n`;
  md += `\n## 按品牌可采集造型清单\n\n`;
  for (const c of brandOrder) {
    md += `### ${c}（${byBrand[c].length} 个可采集造型）\n\n`;
    md += `| # | 车型 | panoId |\n|---|---|---|\n`;
    byBrand[c].forEach((g, i) => { md += `| ${i + 1} | ${mdEscape(g.seriesName)} | ${g.panoId} |\n`; });
    md += `\n`;
  }
  fs.writeFileSync(CATALOG_MD, md);
  console.log('写目录文档 ->', CATALOG_MD);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
