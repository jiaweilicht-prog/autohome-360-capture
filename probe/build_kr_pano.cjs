// 重建《Layer1 全景数据源映射》：Vehicle_ID(代际级) -> 汽车之家车系 -> 360°全景
// 关键修正：用 kr_ids.json 的 model 字段（= 汽车之家车系名/代际名，如 索纳塔九/索纳塔十）
// 直接按「车系名」精确匹配汽车之家车系，而不是按 base 名把一代代际全压到一个车系。
// 再按「全景 ID」去重归并：同全景=同造型(拍一次，取最浅色)；不同全景=不同造型(各拍)。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const GRADE = 'https://www.autohome.com.cn/grade/carhtml';
const PIC = 'https://car.m.autohome.com.cn/pic/series';
const OUT_JSON = path.join(ROOT, 'config', 'kr_pano_map.json');
const OUT_MD = path.join(ROOT, 'docs', 'Layer1-全景数据源映射.md');
const GRADE_CACHE = path.join(ROOT, 'config', 'kr_grade_cache.json');
const PANO_CACHE = path.join(ROOT, 'config', 'kr_pano_cache.json');
const BRAND_CN = { HYD: '现代', KIA: '起亚', GEN: '捷尼赛思' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });
      if (res.status === 429) { await sleep(60000); continue; }   // 频率限制：退避后重试
      if (!res.ok) throw new Error('HTTP' + res.status);
      const t = await res.text();
      if (!t || t.length < 1000) throw new Error('too short');
      return t;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error('exhausted retries');
}
function parseGrade(html) {
  const out = {};
  for (const b of html.split('<dl ').slice(1)) {
    const bm = b.match(/<dt>\s*<a[^>]*>.*?<\/a>.*?<div>\s*<a[^>]*>([^<]+)<\/a>\s*<\/div>\s*<\/dt>/s);
    if (!bm) continue;
    const brand = bm[1].trim();
    const items = [];
    const re = /<li\s+id="s(\d+)"[^>]*>.*?<h4[^>]*>.*?<a[^>]*>([^<]+)<\/a>.*?<\/li>/gs;
    let m; while ((m = re.exec(b)) !== null) items.push({ id: +m[1], name: m[2].trim() });
    if (items.length) out[brand] = items;
  }
  return out;
}
const norm = s => String(s).toLowerCase().replace(/\s+/g, '').replace(/[·\-/（）()]/g, '');
// 去掉动力/特殊后缀，得到 base 名
function baseName(model) {
  return norm(model)
    .replace(/(混动|纯电|插电混动|插混|增程|新能源|电动|氢电|进口|概念车|concept|ev|hev|phev|fcev|bev).*$/i, '');
}
function candidatesFor(brandCn, model, allSeries) {
  const mN = norm(model), bN = baseName(model);
  const cand = [];
  for (const s of allSeries) {
    if (s.brand !== brandCn) continue;
    const n = norm(s.name);
    let score = 0;
    if (n === mN) score = 100;
    else if (n === bN) score = 90;
    else if (mN && n.includes(mN)) score = 60 + mN.length;
    else if (mN && bN && n.includes(bN)) score = 50 + bN.length;
    else if (mN && n.length >= 2 && mN.includes(n)) score = 30 + n.length;
    if (score > 0) cand.push({ ...s, _score: score });
  }
  cand.sort((a, b) => b._score - a._score || a.name.length - b.name.length);
  return cand;
}
async function extractPano(seriesId, cache) {
  if (Object.prototype.hasOwnProperty.call(cache, seriesId)) return cache[seriesId];
  let pano = 'ERR';
  try {
    const h = await fetchText(`${PIC}/${seriesId}.html`);
    const mm = [...h.matchAll(/pano\.autohome\.com\.cn\/car\/pano\/(\d+)/g)];
    const ids = [...new Set(mm.map(x => +x[1]))];
    pano = ids.length ? ids[0] : 'NONE';
  } catch (e) {
    pano = 'ERR';
  }
  cache[seriesId] = pano;
  return pano;
}
(async () => {
  const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kr_ids.json'), 'utf8'));

  // 1) 解析 grade（带缓存）
  let brandSeries = {};
  if (fs.existsSync(GRADE_CACHE)) {
    brandSeries = JSON.parse(fs.readFileSync(GRADE_CACHE, 'utf8'));
    console.log(`[grade] 复用缓存，品牌数=${Object.keys(brandSeries).length}`);
  } else {
    for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
      try {
        const h = await fetchText(`${GRADE}/${L}.html`);
        Object.assign(brandSeries, parseGrade(h));
        console.log(`[grade ${L}] 品牌+${Object.keys(parseGrade(h)).length}`);
      } catch (e) { console.log(`[grade ${L}] 失败 ${e.message}`); }
      await sleep(400);
    }
    fs.writeFileSync(GRADE_CACHE, JSON.stringify(brandSeries));
  }
  const allSeries = [];
  for (const [brand, items] of Object.entries(brandSeries))
    for (const s of items) allSeries.push({ ...s, brand });
  console.log(`[grade] 全量车系=${allSeries.length}`);

  // 2) pano 缓存
  const panoCache = fs.existsSync(PANO_CACHE) ? JSON.parse(fs.readFileSync(PANO_CACHE, 'utf8')) : {};

  // 3) 逐 Vehicle_ID 解析候选车系 + 抓全景
  const rows = [];
  for (const r of ids) {
    const pre = r.id.split('_')[0];
    const brandCn = BRAND_CN[pre] || pre;
    const cands = candidatesFor(brandCn, r.model, allSeries);
    const seen = new Set();
    const candedup = [];
    for (const c of cands) { if (seen.has(c.id)) continue; seen.add(c.id); candedup.push(c); }
    // 抓每个候选车系的全景
    const candsWith = [];
    for (const c of candedup.slice(0, 6)) {
      const p = await extractPano(c.id, panoCache);
      candsWith.push({ id: c.id, name: c.name, score: c._score, pano: p === 'ERR' ? null : (p === 'NONE' ? null : p), raw: p });
      await sleep(900);
    }
    const withPano = candsWith.filter(c => c.pano);
    const best = withPano[0] || candsWith[0] || null;
    rows.push({
      ...r, brandCn,
      seriesId: best ? best.id : (candedup[0] ? candedup[0].id : null),
      seriesName: best ? best.name : (candedup[0] ? candedup[0].name : ''),
      panoId: best && best.pano ? best.pano : null,
      candidates: candsWith.map(c => ({ id: c.id, name: c.name, pano: c.pano })),
      ambiguous: candsWith.length > 1 && withPano.length > 1,
    });
  }
  fs.writeFileSync(PANO_CACHE, JSON.stringify(panoCache));
  fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 1));

  // 4) 归并造型分组
  const has = rows.filter(r => r.panoId);
  const no = rows.filter(r => !r.panoId);
  const groups = {};
  for (const r of has) { const k = `${r.seriesId}/${r.panoId}`; (groups[k] = groups[k] || []).push(r); }

  // 5) 生成 md
  const now = new Date().toISOString();
  const needReview = rows.filter(r => r.ambiguous);
  let md = `# Layer 1 全景数据源映射（韩系 · Vehicle_ID → 汽车之家车系 → 全景）

> 配套：\`docs/全球主要汽车品牌 Layer 1 车型数据库（合并版).md\`
> 生成时间：${now}
> 作用：把 Layer 1 的 **代际级 Vehicle_ID** 绑定到汽车之家可用的 **360° 内饰全景源**，作为截图任务的唯一输入。

## 规则（Licht 定，勿擅自改）
1. **不同造型的代际 = 汽车之家不同车系 / 不同全景 → 各自独立拍摄。**
2. **同一全景内的多个机位只是配色差异 → 只取最浅那一台，不重复拍。**
3. **无全景的车型直接忽略**，记为「无全景」，不进截图任务。
4. **代际→车系匹配**：以 \`kr_ids.json\` 的 \`model\` 字段（即汽车之家车系/代际名，如 索纳塔九/索纳塔十）精确匹配车系；同车型线多代际若指向不同车系/全景，自动拆成不同造型分组各拍。

## 统计
- Vehicle_ID 总数：**${rows.length}**
- 有全景：**${has.length}**（归并为 **${Object.keys(groups).length}** 个造型分组）
- 无全景（忽略）：**${no.length}**
- 需人工复核（同一代际匹配到多个带全景车系）：**${needReview.length}**

---

## 一、造型分组（有全景，按分组拍摄，组内取最浅色）

| 造型分组 | 车系ID | 车系名 | 全景ID | 覆盖的 Vehicle_ID（同造型，拍一次） |
|---|---|---|---|---|
`;
  let gi = 0;
  for (const [k, list] of Object.entries(groups)) {
    gi++;
    const [sid, pano] = k.split('/');
    const idsTxt = list.map(r => r.id).join('<br>');
    md += `| G${String(gi).padStart(2, '0')} | ${sid} | ${list[0].seriesName} | ${pano} | ${idsTxt} |\n`;
  }
  md += `
> 同一分组内的多个 Vehicle_ID 在汽车之家共用同一全景（同一造型），按规则 2 只产出一组图（取最浅配色）。

## 二、无全景（忽略，不截图）

| Vehicle_ID | 车型(model) | 状态 |
|---|---|---|
`;
  for (const r of no) md += `| ${r.id} | ${r.model} | 无全景 |\n`;

  if (needReview.length) {
    md += `
## 三、需人工复核（同代际匹配到多个带全景车系，请指定对应）

| Vehicle_ID | 车型 | 候选车系(带全景) |
|---|---|---|
`;
    for (const r of needReview) {
      const cs = r.candidates.filter(c => c.pano).map(c => `${c.name}(${c.id},pano=${c.pano})`).join(' / ');
      md += `| ${r.id} | ${r.model} | ${cs} |\n`;
    }
  }
  md += `
---
*本文件由 \`probe/build_kr_pano.cjs\` 生成，可重复运行（grade/pano 均已缓存）。*
`;
  fs.writeFileSync(OUT_MD, md);

  console.log(`\n完成：rows=${rows.length} 有全景=${has.length} 造型分组=${Object.keys(groups).length} 无全景=${no.length} 需复核=${needReview.length}`);
  Object.entries(groups).forEach(([k, list], i) => console.log(`  G${String(i + 1).padStart(2, '0')} ${list[0].seriesName}(${list[0].seriesId}) pano=${list[0].panoId}  覆盖${list.length}个ID`));
  if (needReview.length) console.log('需复核:', needReview.map(r => r.id).join(', '));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
