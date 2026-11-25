// 生成《Layer1 全景数据源映射》md：把 Vehicle_ID（代际级）绑定到汽车之家「车系 → 全景」源。
// 规则（Licht 定）：
//   1. 不同造型的代际 = 汽车之家不同车系/不同全景 → 各自独立拍摄；
//   2. 同一全景内的多个机位只是配色差异 → 只保留最浅那一台，不重复拍；
//   3. 没有全景的车型直接忽略（记录为「无全景」）。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const GRADE = 'https://www.autohome.com.cn/grade/carhtml';
const PIC = 'https://car.m.autohome.com.cn/pic/series';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ft(u, n = 2) {
  for (let i = 0; i < n; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' } });
      if (!r.ok) throw new Error('HTTP' + r.status);
      const t = await r.text();
      if (t && t.length > 1000) return t;
    } catch (e) { if (i === n - 1) throw e; await sleep(900); }
  }
}
function parse(h) {
  const out = {};
  for (const b of h.split('<dl ').slice(1)) {
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
const BRAND_CN = { HYD: '现代', KIA: '起亚', GEN: '捷尼赛思' };
(async () => {
  const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kr_ids.json'), 'utf8'));
  const byBrand = {};
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    try { Object.assign(byBrand, parse(await ft(`${GRADE}/${L}.html`))); } catch (e) {}
    await sleep(110);
  }
  const all = [];
  for (const [brand, items] of Object.entries(byBrand)) for (const s of items) all.push({ ...s, brand });

  // 车型线 -> 汽车之家车系（按中文车型名在对应品牌下匹配）
  const cache = {};
  async function resolve(brandCn, modelCn) {
    const key = brandCn + '|' + modelCn;
    if (cache[key] !== undefined) return cache[key];
    const base = String(modelCn).replace(/[\s]/g, '').replace(/(混动|纯电|插混|新能源|EV|HEV|PHEV).*$/i, '');
    const cands = all.filter(s => s.brand.includes(brandCn) &&
      (s.name.includes(base) || base.includes(s.name.replace(/[（(].*?[)）]/g, ''))));
    // 取名字最贴近的
    cands.sort((a, b) => Math.abs(a.name.length - base.length) - Math.abs(b.name.length - base.length));
    const pick = cands[0] || null;
    if (!pick) { cache[key] = null; return null; }
    let pano = null;
    try {
      const h = await ft(`${PIC}/${pick.id}.html`);
      const m = [...h.matchAll(/pano\.autohome\.com\.cn\/car\/pano\/(\d+)/g)];
      pano = m.length ? +m[1] : null;
    } catch (e) {}
    cache[key] = { ...pick, pano };
    return cache[key];
  }

  const rows = [];
  for (const r of ids) {
    const pre = r.id.split('_')[0];
    const brandCn = BRAND_CN[pre] || pre;
    const res = await resolve(brandCn, r.model);
    rows.push({ ...r, brandCn, seriesId: res ? res.id : '', seriesName: res ? res.name : '', panoId: res ? res.pano : null });
  }
  fs.writeFileSync(path.join(ROOT, 'config', 'kr_pano_map.json'), JSON.stringify(rows, null, 1));

  // 生成 md
  const has = rows.filter(r => r.panoId);
  const no = rows.filter(r => !r.panoId);
  // 按「车系+全景」聚合，标出哪些 Vehicle_ID 共享同一全景（= 同造型，只拍一次）
  const groups = {};
  for (const r of has) { const k = r.seriesId + '/' + r.panoId; (groups[k] = groups[k] || []).push(r); }
  let md = `# Layer 1 全景数据源映射（Vehicle_ID → 汽车之家车系 → 全景）

> 配套文件：\`docs/全球主要汽车品牌 Layer 1 车型数据库（合并版).md\`
> 生成时间：${new Date().toISOString()}
> 作用：把 Layer 1 的 **Vehicle_ID（代际级）** 绑定到汽车之家可用的 **360° 内饰全景源**，作为截图任务的唯一输入。

## 规则（Licht 定，勿擅自改）

1. **不同造型的代际 = 不同车系 / 不同全景 → 各自独立拍摄。**
   例：宝马7系家族在汽车之家拆成 5 个车系，各有独立全景（7系 77455 / i7 56703 / i7 M70L 62588 / M760Le 62587 / 7系新能源 56702），因此不同造型各出一组图。
2. **同一全景内的多个机位只是配色差异 → 只保留最浅那一台，不重复拍摄。**
   例：iCAR V27 全景有 12 个机位（4 套配置 × 3 角色），4 套仅为颜色不同 → 只取最浅色一组。
3. **无全景的车型直接忽略**，记录为「无全景」，不进入截图任务。

## 字段

| 字段 | 说明 |
|---|---|
| Vehicle_ID | Layer 1 编号（品牌_车型_代际_年款） |
| AH_Series_ID / AH_Series_Name | 汽车之家车系 ID 与名称 |
| AH_Pano_ID | 360° 内饰全景 ID（空=无全景） |
| 造型分组 | 同一「车系/全景」即同一造型；不同分组=不同造型，需各拍 |
| Status | 有全景 / 无全景 |

---

## 一、韩系（现代 / 起亚 / 捷尼赛思）

- Vehicle_ID 总数：**${rows.length}**
- 有全景：**${has.length}**（归并为 **${Object.keys(groups).length}** 个造型分组）
- 无全景（忽略）：**${no.length}**

### 1.1 有全景 · 按造型分组

| 造型分组 | 车系ID | 车系名 | 全景ID | 覆盖的 Vehicle_ID（同造型，只拍一次，取最浅色） |
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
> 说明：同一分组内的多个 Vehicle_ID 在汽车之家共用同一个全景（即同一造型），
> 按规则 2 只产出一组图（取最浅配色），其余 ID 在资产索引中标注「同造型复用」。

### 1.2 无全景（忽略，不截图）

| Vehicle_ID | 车型 | 状态 |
|---|---|---|
`;
  for (const r of no) md += `| ${r.id} | ${r.model} | 无全景 |\n`;

  md += `
---

## 二、示例：宝马 7 系家族（不同造型 = 不同车系 = 各拍）

| Vehicle_ID(示例) | 车系ID | 车系名 | 全景ID | 造型分组 |
|---|---|---|---|---|
| BMW_7Series_G70_LCI_2027 | 153 | 宝马7系 | 77455 | 造型A |
| BMW_i7_G70_BEV_2022 | 6427 | 宝马i7 | 56703 | 造型B |
| BMW_i7_M70L_2023 | 7949 | 宝马i7 M70L | 62588 | 造型C |
| BMW_M760Le_2023 | 7950 | 宝马M760Le | 62587 | 造型D |
| BMW_7Series_PHEV_2022 | 4345 | 宝马7系新能源 | 56702 | 造型E |
`;
  const out = path.join(ROOT, 'docs', 'Layer1-全景数据源映射.md');
  fs.writeFileSync(out, md);
  console.log(`映射已生成: ${out}`);
  console.log(`Vehicle_ID ${rows.length} | 有全景 ${has.length} | 造型分组 ${Object.keys(groups).length} | 无全景 ${no.length}`);
  console.log('\n造型分组明细:');
  Object.entries(groups).forEach(([k, list], i) => console.log(`  G${String(i + 1).padStart(2, '0')} ${list[0].seriesName}(${list[0].seriesId}) pano=${list[0].panoId}  覆盖${list.length}个ID`));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
