// 干跑 v2：韩系 35 组 / 70 张图 按 DDGS 8 段命名对齐，仅产对照表，不改动文件。
// GEN 选取规则：取与被拍车系(seriesName)同名、且为基型(非 Facelift/EV/Hybrid 等后缀)平台的最新一条；
// 若匹配项本身就是纯电/混动变体(无基型平台)，则把该动力后缀作为 GEN，并在 uncertain 中标注。
const fs = require('fs');
const path = require('path');

const DISC = JSON.parse(fs.readFileSync('config/kr_discovery_full.json', 'utf8'));
const IDS = JSON.parse(fs.readFileSync('config/kr_ids.json', 'utf8'));
const idMap = {}; for (const r of IDS) idMap[r.id] = r;
const ROOT = 'output/images_by_view';
const VIEWS = {
  F1: { dir: '主驾位前望', code: 'IPDRV', sub: '0204' },
  R1: { dir: '前舱正视', code: 'IPFRONT', sub: '0101' },
};
const BRAND = { '现代': 'HYD', '起亚': 'KIA', '捷尼赛思': 'GEN' }; // ⚠ 提议值，待确认
const SUFFIX = new Set(['FACELIFT', 'EV', 'HYBRID', 'HEV', 'BEV', 'PHEV', 'DM', 'N', 'PLUGIN']);

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9一-龥]/g, ''); }
function matchModel(vidModel, seriesName) {
  const a = norm(vidModel), b = norm(seriesName);
  return a && (a.includes(b) || b.includes(a));
}
function extractPlatform(vid) {
  const seg = vid.split('_');
  for (let i = 2; i < seg.length; i++) {
    const s = seg[i];
    if (/^[A-Z]{2,4}[0-9]?$/.test(s) && !SUFFIX.has(s.toUpperCase())) return s.toUpperCase();
  }
  return null;
}
function isEvSeries(name) { return /电动|纯电|ev|bev/i.test(name); }
function pickGen(g) {
  let cands = (g.vehicleIds || []).filter(v => idMap[v] && matchModel(idMap[v].model, g.seriesName));
  if (!cands.length) cands = (g.vehicleIds || []);
  if (!cands.length) return { gen: 'NA', uncertain: true, note: '无 vehicleId' };
  if (isEvSeries(g.seriesName)) {
    const ev = cands.filter(v => { const p = idMap[v] && idMap[v].power; return p === 'BEV' || p === 'HEV'; });
    if (ev.length) cands = ev;
  }
  const ranked = cands.map(v => ({ v, r: idMap[v] })).sort((x, y) => (y.r.y1 || 0) - (x.r.y1 || 0));
  const chosen = ranked[0];
  let gen = extractPlatform(chosen.v);
  let uncertain = false, note = '';
  if (!gen && /facelift/i.test(chosen.v)) {
    // 小改款无平台码 → 向同车系基型条目借平台码（facelift 通常沿用基型平台）
    const base = cands.filter(v => !/facelift|ev|hybrid|heb/i.test(v.split('_').slice(2).join('_')) && extractPlatform(v))
                      .sort((a, b) => (idMap[a].y0 || 0) - (idMap[b].y0 || 0))[0];
    if (base) gen = extractPlatform(base);
  }
  if (!gen) {
    const p = chosen.r.power;
    if (p === 'BEV') gen = 'EV'; else if (p === 'HEV') gen = 'HEV'; else gen = 'NA';
    uncertain = true;
    note = `GEN=${gen} 为占位，Layer1 ID 缺当前代平台码(属全新代际，请补)`;
  }
  if ((g.vehicleIds || []).length > 1) { note = (note ? note + '；' : '') + `同形状折叠${(g.vehicleIds || []).length}个代际`; uncertain = true; }
  return { gen, uncertain, note, chosen: chosen.v };
}

function findPng(panoId, viewDir) {
  const dir = path.join(ROOT, viewDir);
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const j = path.join(dir, f.replace(/\.png$/, '.json'));
    if (fs.existsSync(j)) {
      try { const s = JSON.parse(fs.readFileSync(j, 'utf8')); if (s.source_url && s.source_url.includes('pano/' + panoId)) return f; } catch (e) {}
    }
  }
  return null;
}

const plan = [];
let uncertainCount = 0;
for (const g of DISC.results) {
  if (g.status !== 'pano_found') continue;
  const brand = BRAND[g.brandCn] || '??';
  const { gen, uncertain, note } = pickGen(g);
  let model = (g.modelEn || g.seriesName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (gen && model.endsWith(gen)) model = model.slice(0, model.length - gen.length); // 清掉拼在尾巴的平台码
  const locNote = { OPTIMA: 'modelEn=Optima，中国市场称K5', K9: 'modelEn=K9，中国市场称K900', ENCINO: '电动版(昂希诺纯电)' }[model] || '';
  if (uncertain) uncertainCount++;
  for (const [vid, v] of Object.entries(VIEWS)) {
    const oldName = findPng(g.panoId, v.dir);
    if (!oldName) { plan.push({ group: g.group, err: `找不到 ${g.seriesName} ${vid}` }); continue; }
    const newName = `IMG_${brand}_${model}_${gen}_${v.code}_${v.sub}_AUTO360_01.png`;
    plan.push({ group: g.group, series: g.seriesName, vid, pano: g.panoId, oldName, newName, gen, uncertain, note });
  }
}

console.log(`=== 韩系 DDGS 重命名对照 v2（干跑，未改动文件；共 ${plan.filter(p=>!p.err).length} 张，不确定 GEN ${uncertainCount} 组）===\n`);
for (const p of plan) {
  if (p.err) { console.log(`⚠ ${p.err}`); continue; }
  const flag = p.uncertain ? `  ⚠待你确认GEN=${p.gen} (${p.note})` : '';
  console.log(`${p.group} ${p.series} ${p.vid}: ${p.oldName}\n     → ${p.newName}${flag}`);
}

// 写 plan + 一并生成扩展后的 DDGS 映射表(追加韩系35组到草稿)
fs.writeFileSync('config/kr_ddgs_rename_plan.json', JSON.stringify(plan, null, 1));
const ext = [];
for (const g of DISC.results.filter(r => r.status === 'pano_found')) {
  const brand = BRAND[g.brandCn] || '??';
  const { gen, uncertain, note } = pickGen(g);
  let model = (g.modelEn || g.seriesName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (gen && model.endsWith(gen)) model = model.slice(0, model.length - gen.length);
  const locNote = { OPTIMA: 'modelEn=Optima，中国市场称K5', K9: 'modelEn=K9，中国市场称K900', ENCINO: '电动版(昂希诺纯电)' }[model] || '';
  const csvNote = (uncertain ? note : '') + (locNote ? (uncertain ? '；' : '') + locNote : '');
  ext.push([g.seriesName, g.seriesName, g.brandCn, brand, model, gen + (uncertain ? '?' : ''), g.years || '', g.panoId, csvNote]);
}
const header = 'series,seriesName,brandCn,brandCode,modelCode,genCode,years,panoId,note\n';
fs.writeFileSync('config/ddgs_vehicle_map_kr.csv', header + ext.map(r => r.join(',')).join('\n') + '\n');
console.log('\n已写 config/kr_ddgs_rename_plan.json 与 config/ddgs_vehicle_map_kr.csv（韩系35组 DDGS 映射扩展）');
console.log('品牌码仍为提议值 HYD/KIA/GEN，待你与 DDGS 系统确认。');
