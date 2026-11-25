// 生成《欧系全景数据源》：从 kr_grade_cache（全品牌车系缓存）筛选欧系品牌车系，
// 逐车系抓汽车之家 360 全景 panoId，按「同 panoId=同造型」去重，生成欧系 discovery。
// 输出：probe/p1-discovery.json（run-p1.cjs 读取）+ config/eu_discovery_full.json（备份）
//      + config/eu_catalog.csv（完整每车系目录，含是否有全景）
// 断点续跑：config/eu_pano_cache.json 按 seriesId 缓存结果，被中断重跑会自动跳过已抓的。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const GRADE_CACHE = path.join(ROOT, 'config', 'kr_grade_cache.json');
const PANO_CACHE = path.join(ROOT, 'config', 'eu_pano_cache.json');
const DISC = path.join(ROOT, 'probe', 'p1-discovery.json');
const DISC_BAK = path.join(ROOT, 'config', 'eu_discovery_full.json');
const CATALOG_CSV = path.join(ROOT, 'config', 'eu_catalog.csv');

// 欧系品牌（cn 名，须与 grade 缓存在键名一致）。含德/英/法/意/瑞典/捷克/西/荷/罗/俄/克罗地亚。
// 未含纯改装厂牌（博速/罗伦士/卡尔森/迈莎锐/ABT/AC Schnitzer 等）——其全景与底盘车同源，目录里会去重归并。
const EU_BRANDS = [
  // 德国
  { cn: '奥迪', code: 'AUDI' }, { cn: '奥迪AUDI', code: 'AUDI' }, { cn: '大众', code: 'VW' },
  { cn: '奔驰', code: 'MB' }, { cn: '宝马', code: 'BMW' }, { cn: '保时捷', code: 'POR' },
  { cn: '迈巴赫', code: 'MAY' }, { cn: 'smart', code: 'SMA' }, { cn: '欧宝', code: 'OPEL' },
  { cn: '沃克斯豪尔', code: 'VAUX' },
  // 英国
  { cn: '捷豹', code: 'JAG' }, { cn: '路虎', code: 'LR' }, { cn: 'MINI', code: 'MINI' },
  { cn: '阿斯顿·马丁', code: 'AM' }, { cn: '宾利', code: 'BENT' }, { cn: '劳斯莱斯', code: 'ROLL' },
  { cn: '路特斯', code: 'LOTUS' }, { cn: '莲花跑车', code: 'LOTUS' }, { cn: '迈凯伦', code: 'MCL' },
  { cn: 'Caterham', code: 'CAT' }, { cn: '摩根', code: 'MOR' }, { cn: '拉共达', code: 'LAG' },
  { cn: 'LEVC', code: 'LEVC' }, { cn: '英力士掷弹兵', code: 'INEOS' },
  // 法国
  { cn: '标致', code: 'PEU' }, { cn: '雪铁龙', code: 'CIT' }, { cn: '雷诺', code: 'REN' },
  { cn: 'DS', code: 'DS' }, { cn: '布加迪', code: 'BUG' },
  // 意大利
  { cn: '菲亚特', code: 'FIAT' }, { cn: '法拉利', code: 'FER' }, { cn: '兰博基尼', code: 'LAM' },
  { cn: '玛莎拉蒂', code: 'MAS' }, { cn: '阿尔法·罗密欧', code: 'ALFA' }, { cn: '蓝旗亚', code: 'LANC' },
  { cn: '帕加尼', code: 'PAG' }, { cn: 'Abarth', code: 'ABAR' }, { cn: 'De Tomaso', code: 'DT' },
  // 瑞典
  { cn: '沃尔沃', code: 'VOLVO' }, { cn: '萨博', code: 'SAAB' }, { cn: '科尼赛克', code: 'KOEN' },
  { cn: 'Polestar极星', code: 'POLE' },
  // 捷克
  { cn: '斯柯达', code: 'SKOD' },
  // 西班牙
  { cn: '西雅特', code: 'SEAT' }, { cn: 'Cupra', code: 'CUPRA' },
  // 荷兰
  { cn: '世爵', code: 'SPYK' },
  // 罗马尼亚
  { cn: '达契亚', code: 'DAC' },
  // 俄罗斯
  { cn: '拉达', code: 'LADA' }, { cn: 'GAZ', code: 'GAZ' },
  // 克罗地亚
  { cn: '锐马克', code: 'RIM' },
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
  const brandMap = Object.fromEntries(EU_BRANDS.map(b => [b.cn, b.code]));
  const eu = allSeries.filter(s => brandMap[s.brand]);
  console.log('欧系品牌车系总数', eu.length);
  const panoCache = fs.existsSync(PANO_CACHE) ? JSON.parse(fs.readFileSync(PANO_CACHE, 'utf8')) : {};
  const rows = [];
  let err = 0, hit = 0;
  const CONC = 4; // 轻度并发加速；429 由 fetchText 退避处理
  for (let i = 0; i < eu.length; i += CONC) {
    const batch = eu.slice(i, i + CONC);
    const out = await Promise.all(batch.map(async s => {
      const p = await extractPano(s.id, panoCache);
      return { brandCn: s.brand, seriesName: s.name, seriesId: s.id, pano: p === 'ERR' ? null : (p === 'NONE' ? null : p), raw: p };
    }));
    for (const r of out) {
      if (r.raw === 'ERR') err++;
      if (r.raw && panoCache[r.seriesId] && panoCache[r.seriesId] !== 'ERR') hit++;
      rows.push(r);
    }
    const done = Math.min(i + CONC, eu.length);
    if (done % 40 < CONC) console.log(`  进度 ${done}/${eu.length} 已抓到全景 ${rows.filter(r => r.pano).length} ERR ${err}`);
    await sleep(300);
  }
  fs.writeFileSync(PANO_CACHE, JSON.stringify(panoCache));
  const withPano = rows.filter(r => r.pano);
  const seen = new Set(), groups = [];
  for (const r of withPano) { if (seen.has(r.pano)) continue; seen.add(r.pano); groups.push(r); }
  console.log(`有全景 ${withPano.length} / 车系 ${rows.length}；同pano去重后造型分组 ${groups.length}；ERR ${err}`);
  const results = groups.map((r, i) => ({
    status: 'pano_found',
    brandCn: r.brandCn, seriesName: r.seriesName, seriesId: r.seriesId,
    brandEn: brandMap[r.brandCn] || 'EU', modelEn: r.seriesName,
    panoId: +r.pano,
    panoUrl: `https://pano.autohome.com.cn/car/pano/${r.pano}?_ahrotate=1`,
    group: `EU${String(i + 1).padStart(4, '0')}`,
  }));
  const out = { generatedAt: new Date().toISOString(), total: results.length, found: results.length, noPano: rows.length - withPano.length, notFound: 0, errors: err, results };
  fs.writeFileSync(DISC, JSON.stringify(out, null, 1));
  fs.writeFileSync(DISC_BAK, JSON.stringify(out, null, 1));
  console.log('写 discovery ->', DISC, '共', results.length, '组');
  // 完整目录 CSV（含无全景的车系，便于用户审阅范围）
  const header = 'brandCn,seriesName,seriesId,pano,collectible\n';
  const csv = header + rows.map(r => `${r.brandCn},${r.seriesName},${r.seriesId},${r.pano || ''},${r.pano ? 'Y' : 'N'}`).join('\n');
  fs.writeFileSync(CATALOG_CSV, csv);
  // 品牌分布速览
  const dist = {}, distPano = {};
  for (const r of rows) { dist[r.brandCn] = (dist[r.brandCn] || 0) + 1; if (r.pano) distPano[r.brandCn] = (distPano[r.brandCn] || 0) + 1; }
  console.log('车系品牌分布:', JSON.stringify(dist));
  console.log('有全景造型分组品牌分布:', JSON.stringify(distPano));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
