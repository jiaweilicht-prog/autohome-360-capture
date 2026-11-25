// 生成《美系全景数据源》：从 kr_grade_cache（全品牌车系缓存）筛选美系品牌车系，
// 逐车系抓汽车之家 360 全景 panoId，按「同 panoId=同造型」去重，生成美系 discovery。
// 输出：probe/p1-discovery.json（run-p1.cjs 读取）+ config/us_discovery_full.json（备份）。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const GRADE_CACHE = path.join(ROOT, 'config', 'kr_grade_cache.json');
const PANO_CACHE = path.join(ROOT, 'config', 'us_pano_cache.json');
const DISC = path.join(ROOT, 'probe', 'p1-discovery.json');
const DISC_BAK = path.join(ROOT, 'config', 'us_discovery_full.json');
const US_BRANDS = [
  { cn: '福特', code: 'FORD' },
  { cn: '雪佛兰', code: 'CHEVY' },
  { cn: '别克', code: 'BUICK' },
  { cn: '凯迪拉克', code: 'CADI' },
  { cn: '林肯', code: 'LINCOLN' },
  { cn: 'Jeep', code: 'JEEP' },
  { cn: '克莱斯勒', code: 'CHRY' },
  { cn: '道奇', code: 'DODGE' },
  { cn: '特斯拉', code: 'TESLA' },
  { cn: 'GMC', code: 'GMC' },
  { cn: '悍马', code: 'HUMMER' },
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
(async () => {
  const brandSeries = JSON.parse(fs.readFileSync(GRADE_CACHE, 'utf8'));
  const allSeries = [];
  for (const [brand, items] of Object.entries(brandSeries)) for (const s of items) allSeries.push({ ...s, brand });
  const brandMap = Object.fromEntries(US_BRANDS.map(b => [b.cn, b.code]));
  const us = allSeries.filter(s => brandMap[s.brand]);
  console.log('美系品牌车系总数', us.length);
  const panoCache = fs.existsSync(PANO_CACHE) ? JSON.parse(fs.readFileSync(PANO_CACHE, 'utf8')) : {};
  const rows = [];
  let err = 0;
  for (let i = 0; i < us.length; i++) {
    const s = us[i];
    const p = await extractPano(s.id, panoCache);
    if (p === 'ERR') err++;
    rows.push({ brandCn: s.brand, seriesName: s.name, seriesId: s.id, pano: p === 'ERR' ? null : (p === 'NONE' ? null : p) });
    if ((i + 1) % 20 === 0) console.log(`  进度 ${i + 1}/${us.length} 已抓到全景 ${rows.filter(r => r.pano).length}`);
    await sleep(800);
  }
  fs.writeFileSync(PANO_CACHE, JSON.stringify(panoCache));
  const withPano = rows.filter(r => r.pano);
  const seen = new Set(), groups = [];
  for (const r of withPano) { if (seen.has(r.pano)) continue; seen.add(r.pano); groups.push(r); }
  console.log(`有全景 ${withPano.length} / 车系 ${rows.length}；同pano去重后造型分组 ${groups.length}；ERR ${err}`);
  const results = groups.map((r, i) => ({
    status: 'pano_found',
    brandCn: r.brandCn, seriesName: r.seriesName, seriesId: r.seriesId,
    brandEn: brandMap[r.brandCn], modelEn: r.seriesName,
    panoId: +r.pano,
    panoUrl: `https://pano.autohome.com.cn/car/pano/${r.pano}?_ahrotate=1`,
    group: `US${String(i + 1).padStart(3, '0')}`,
  }));
  const out = { generatedAt: new Date().toISOString(), total: results.length, found: results.length, noPano: rows.length - withPano.length, notFound: 0, errors: err, results };
  fs.writeFileSync(DISC, JSON.stringify(out, null, 1));
  fs.writeFileSync(DISC_BAK, JSON.stringify(out, null, 1));
  console.log('写 discovery ->', DISC, '共', results.length, '组');
  const noPano = rows.filter(r => !r.pano);
  fs.writeFileSync(path.join(ROOT, 'config', 'us_no_pano.csv'), 'brandCn,seriesName,seriesId,pano\n' + noPano.map(r => `${r.brandCn},${r.seriesName},${r.seriesId},${r.pano || 'NONE/ERR'}`).join('\n'));
  // 品牌分布速览
  const dist = {};
  for (const r of results) dist[r.brandCn] = (dist[r.brandCn] || 0) + 1;
  console.log('造型分组品牌分布:', JSON.stringify(dist));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
