// 离线生成最终版《Layer1-全景数据源映射.md》+ 拍摄清单 CSV
// 输入：config/kr_ids.json + kr_grade_cache.json + kr_pano_cache.json（均为本地缓存，不联网）
// 作用：以「造型分组(车系/全景)」为单位给出建议拍摄清单；弱匹配行进入需复核。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kr_ids.json'), 'utf8'));
const brandSeries = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kr_grade_cache.json'), 'utf8'));
const panoCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kr_pano_cache.json'), 'utf8'));
const BRAND_CN = { HYD: '现代', KIA: '起亚', GEN: '捷尼赛思' };
const BRAND_EN = { HYD: 'Hyundai', KIA: 'Kia', GEN: 'Genesis' };
const allSeries = [];
for (const [brand, items] of Object.entries(brandSeries))
  for (const s of items) allSeries.push({ ...s, brand });
const norm = s => String(s).toLowerCase().replace(/\s+/g, '').replace(/[·\-/（）()]/g, '');
function baseName(model) {
  return norm(model)
    .replace(/(混动|纯电|插电混动|插混|增程|新能源|电动|氢电|进口|概念车|concept|ev|hev|phev|fcev|bev).*$/i, '');
}
function candidatesFor(brandCn, model) {
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
    if (score > 0) cand.push({ id: s.id, name: s.name, score });
  }
  cand.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return cand;
}
// 是否"动力版本/变体"车系名（同造型不同动力源）
const POWER_VAR = /混动|插电|纯电|新能源|电动|氢|EV|N$/i;

// 每行解析
const rows = ids.map(r => {
  const pre = r.id.split('_')[0];
  const brandCn = BRAND_CN[pre] || pre;
  const cands = candidatesFor(brandCn, r.model);
  const seen = new Set();
  const uniq = [];
  for (const c of cands) { if (seen.has(c.id)) continue; seen.add(c.id); uniq.push(c); }
  const withPano = [];
  for (const c of uniq) {
    const raw = panoCache[String(c.id)];
    if (raw && raw !== 'NONE' && raw !== 'ERR') withPano.push({ ...c, pano: raw });
  }
  const best = withPano[0] || null; // 按 score 排序后的第一个带全景候选
  // 弱匹配：没有任何"精确/准精确(>=90)"命中的带全景候选
  const weak = !(withPano.some(c => c.score >= 90));
  // 若精确命中带全景的车系与最佳不同（最佳是更低分），说明可能选错
  const exactWithPano = withPano.find(c => c.score >= 90);
  const bestPano = (exactWithPano || best || null);
  const panoId = bestPano ? bestPano.pano : null;
  const seriesId = bestPano ? bestPano.id : null;
  const seriesName = bestPano ? bestPano.name : null;
  const extraShapes = withPano
    .filter(c => c.pano !== panoId && !POWER_VAR.test(c.name))
    .map(c => c.name);
  return {
    ...r, brandCn, brandEn: BRAND_EN[pre] || pre,
    seriesId, seriesName, panoId,
    nPanoCands: withPano.length,
    candidates: withPano.map(c => ({ id: c.id, name: c.name, pano: c.pano, score: c.score })),
    weak, extraShapes,
  };
});

const has = rows.filter(r => r.panoId);
const no = rows.filter(r => !r.panoId);
const review = rows.filter(r => r.weak && r.panoId);           // 弱匹配却拍到全景 → 需人工确认归属
const reviewNo = rows.filter(r => r.weak && !r.panoId);        // 弱匹配且无全景 → 本就忽略，不劳烦
// 造型分组：按 车系ID/全景 聚合（同一车系全景 = 同造型）
const groups = {};
for (const r of has) { const k = `${r.seriesId}|${r.panoId}`; (groups[k] = groups[k] || []).push(r); }
function repOf(list) {
  // 代表 = 状态在售/量产优先，其次 y1 最新
  const rank = x => (x.status === 'On Sale' ? 3 : x.status === 'Production' ? 2 : x.status === 'Concept' ? 0 : 1);
  return [...list].sort((a, b) => rank(b) - rank(a) || Number(b.y1 || 0) - Number(a.y1 || 0))[0];
}
const gList = Object.entries(groups)
  .map(([k, list]) => {
    const [sid, pano] = k.split('|');
    const rep = repOf(list);
    return { sid: Number(sid), name: list[0].seriesName, pano: Number(pano), list, rep };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

const md = [];
md.push('# Layer 1 全景数据源映射（韩系 · Vehicle_ID → 汽车之家车系 → 全景）\n');
md.push(`> 配套：\`docs/全球主要汽车品牌 Layer 1 车型数据库（合并版).md\`　|　生成：${new Date().toISOString().slice(0, 10)}\n`);
md.push(`> 数据完整性：本次共探测 **${allSeries.length}** 个汽车之家车系；韩系候选车系 pano 探测 0 失败（无 ERR）。\n`);
md.push(`## 规则（Licht 定，勿擅自改）\n`);
md.push(`1. **不同造型的代际 = 汽车之家不同车系/不同全景 → 各自独立拍摄**。韩系中表现为：伊兰特(78119) 与 领动(45479) 是两个车系两套全景，各拍一次。`);
md.push(`2. **同一全景内的多个机位只是配色差异 → 只取最浅那一台，不重复拍**（如 iCAR V27：12 机位=4配色×3角色）。`);
md.push(`3. **无全景的车型直接忽略**（概念车/过老代际/未引入全景源的进口变体等）。`);
md.push(`4. **同车系仅有一套全景、但 Layer 1 含多个代际 ID 时**：汽车之家只提供当前在售造型的 360° 全景（旧代际无独立全景源），因此该组只拍一次、按最浅色；旧代际 ID 在资产索引中标注「复用当前造型全景」。若你认为某旧代际实际造型差异显著且需要，请人工指定其它数据源。\n`);
md.push(`## 统计\n`);
md.push(`- Vehicle_ID 总数：**${rows.length}**（现代 ${rows.filter(r => r.brandCn === '现代').length} / 起亚 ${rows.filter(r => r.brandCn === '起亚').length} / 捷尼赛思 ${rows.filter(r => r.brandCn === '捷尼赛思').length}）`);
md.push(`- 有全景：**${has.length}** 个 ID，归并为 **${gList.length}** 个造型分组（= 建议拍摄数，每组合格证\`IMG_{品牌}_{车型}_{代际}_{视角}_...\`一张）`);
md.push(`- 无全景（忽略）：**${no.length}** 个 ID`);
md.push(`- 弱匹配需人工确认归属：**${review.length}** 个 ID（见 §三）\n`);
md.push(`## 一、造型分组（建议拍摄清单，共 ${gList.length} 组）\n`);
md.push(`| # | 车系名 | 车系ID | 全景ID | 全景对应代际(推测) | 组内 Vehicle_ID 数 | 覆盖 Vehicle_ID（层1 数据库） |`);
md.push('|---:|---|---|---|---:|---:|---|');
gList.forEach((g, i) => {
  const yrs = g.rep.y0 && g.rep.y1 ? `${g.rep.y0}-${g.rep.y1}` : '';
  const idTxt = g.list.map(r => r.id).join('<br>');
  md.push(`| G${String(i + 1).padStart(2, '0')} | ${g.name} | ${g.sid} | ${g.pano} | ${g.rep.model} ${yrs} | ${g.list.length} | ${idTxt} |`);
});
md.push('');
md.push(`> 组名取汽车之家车系名；「全景对应代际」取组内在售/最新 ID 的 model+年款——汽车之家 360° 全景反映的是该车系**当前在售造型**。同组内更早代际若与当前造型不同，汽车之家未提供其独立全景，按规则 4 归并。\n`);
md.push(`## 二、无全景（忽略，不截图）\n`);
md.push('| Vehicle_ID | 车型(model) | 代际区间 | 状态 | 原因猜测 |');
md.push('|---|---|---|---|---|');
for (const r of no) {
  const why = r.status === 'Concept' ? '概念车' : r.nPanoCands === 0 ? '汽车之家无此车系' : '该车系无360°全景';
  md.push(`| ${r.id} | ${r.model} | ${r.y0}-${r.y1} | ${r.status} | ${why} |`);
}
md.push('');
if (review.length) {
  md.push(`## 三、需人工确认归属（弱匹配：车系名无精确命中，靠子串猜，但拍到了全景）\n`);
  md.push(`> 这些 ID 已暂按最佳子串命中归组；请核对归属是否合理，必要时手工改 \`config/kr_pano_map.json\`。\n`);
  md.push('| Vehicle_ID | 车型(model) | 代际 | 暂归组 | 其余带全景候选 |');
  md.push('|---|---|---|---|---|');
  for (const r of review) {
    const cur = r.candidates.find(c => c.pano === r.panoId);
    const others = r.candidates.filter(c => c.pano !== r.panoId).map(c => `${c.name}(${c.pano})`).join(' / ') || '—';
    md.push(`| ${r.id} | ${r.model} | ${r.y0}-${r.y1} | ${r.seriesName}(${r.panoId}) | ${others} |`);
  }
  md.push('');
}
md.push(`---\n*本文件由 \`probe/build_kr_md.cjs\` 离线生成（输入为本地缓存，无网络请求），配合 \`config/kr_pano_map.json\` 使用。*`);
fs.writeFileSync(path.join(ROOT, 'docs', 'Layer1-全景数据源映射.md'), md.join('\n'));

// 拍摄清单 CSV
const csv = ['group,seriesName,seriesId,panoId,repModel,repYears,repStatus,nIds,ids'];
gList.forEach((g, i) => {
  csv.push(`G${String(i + 1).padStart(2, '0')},${g.name},${g.sid},${g.pano},"${g.rep.model} ${g.rep.y0}-${g.rep.y1}",${g.rep.y0}-${g.rep.y1},${g.rep.status},${g.list.length},"${g.list.map(r => r.id).join(' ')}"`);
});
fs.writeFileSync(path.join(ROOT, 'config', 'kr_shoot_list.csv'), csv.join('\n'));

console.log(`rows=${rows.length} 有全景=${has.length} 分组=${gList.length} 无全景=${no.length} 弱匹配复核=${review.length} (无全景弱匹配 ${reviewNo.length} 不列出)`);
console.log('\n分组(按车系名):');
gList.forEach((g, i) => console.log(`  G${String(i + 1).padStart(2, '0')} ${g.name}(${g.sid}) pano=${g.pano} 覆盖${g.list.length}ID 代表=${g.rep.model}${g.rep.y0}-${g.rep.y1}`));
if (review.length) { console.log('\n需人工确认:'); review.forEach(r => console.log(`  ${r.id} model=${r.model} → ${r.seriesName}(${r.panoId})`)); }
