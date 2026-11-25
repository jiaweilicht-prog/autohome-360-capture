// JP 日系 DDGS 命名：用 config/ddgs_vehicle_map_jp.csv 的 brandCode/modelCode/genCode，
// 按 panoId 在 images_by_view 与 output/images 找图，改名成 IMG_{BRAND}_{MODEL}_{GEN}_{VIEW}_{SUBID=NA}_{AUTO360}_01
// 两目录各留一份（同名不同路径 = 各存一份）；碰撞检测按目录隔离，跨目录同名不误报。
// 用法: node probe/run_jp_ddgs_rename.cjs [--dry]
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const CSV = path.join(ROOT, 'config/ddgs_vehicle_map_jp.csv');
const SUBDIRS = [path.join(ROOT, 'output/images_by_view'), path.join(ROOT, 'output/images')];
const DRY = process.argv.includes('--dry');

const VIEW = { F1: 'IPDRV', R1: 'IPFRONT' };
function viewOf(p) {
  if (p.includes('主驾位前望') || p.includes('主驾正视前排IP')) return 'F1';
  if (p.includes('前舱正视') || p.includes('二排正视前排')) return 'R1';
  return null;
}
function genClean(g) { return (g || 'NA').replace(/[⚠?]/g, '').trim() || 'NA'; }

function findPngByPano(panoId) {
  const hits = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.png')) continue;
      const j = p.replace(/\.png$/, '.json');
      let ok = false;
      if (fs.existsSync(j)) { try { const s = JSON.parse(fs.readFileSync(j, 'utf8')); ok = s.source_url && s.source_url.includes('pano/' + panoId); } catch (e2) {} }
      if (!ok) ok = e.name.includes(String(panoId));
      if (ok) hits.push(p);
    }
  }
  for (const b of SUBDIRS) walk(b);
  return hits;
}

const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1);
const plan = [];
let noImg = 0, unnamed = 0, alreadyImg = 0;
for (const ln of lines) {
  const [series, seriesName, brandCn, brandCode, modelCode, genCode, years, panoId] = ln.split(',');
  const hits = findPngByPano(panoId);
  if (!hits.length) { noImg++; plan.push({ err: `无图 pano=${panoId} ${brandCode}/${modelCode}` }); continue; }
  let anyUnnamed = false, anyImg = false;
  for (const h of hits) {
    const isImg = path.basename(h).startsWith('IMG_');
    isImg ? anyImg = true : anyUnnamed = true;
    const v = viewOf(h);
    if (!v) { plan.push({ err: `视角未知 ${h}` }); continue; }
    const gen = genClean(genCode);
    const nn = `IMG_${brandCode}_${modelCode}_${gen}_${VIEW[v]}_NA_AUTO360_01.png`;
    plan.push({ pano: panoId, brandCode, modelCode, gen, v, oldPath: h, newName: nn, isImg, inByView: h.includes('images_by_view') });
  }
  if (anyUnnamed) unnamed++;
}

const toName = plan.filter(p => !p.err && !p.isImg);
const toConvert = plan.filter(p => !p.err && p.isImg);
const errs = plan.filter(p => p.err);

console.log(`=== JP 命名 dry-run (${DRY ? 'DRY' : 'EXECUTE'}) ===`);
console.log(`总行: ${lines.length} | 无图: ${noImg} | 含未命名图车系: ${unnamed} | 已IMG需转码: ${toConvert.length} | 映射错误: ${errs.length}`);
console.log(`\n--- 未命名 → 改名 (${toName.length} 张) ---`);
for (const p of toName) console.log(`  ${path.basename(p.oldPath)}  →  ${p.newName}   [${path.relative(ROOT, path.dirname(p.oldPath))}]`);
console.log(`\n--- 已 IMG_(NA口径) → 转 JP 口径 (${toConvert.length} 张) ---`);
for (const p of toConvert) console.log(`  ${path.basename(p.oldPath)}  →  ${p.newName}`);
if (errs.length) { console.log(`\n--- 错误/缺图 ---`); for (const e of errs) console.log('  ' + e.err); }

// 碰撞检测（同目录同名）
const seen = {};
let collision = 0;
const target = plan.filter(p => !p.err);
for (const p of target) {
  const dir = path.dirname(p.oldPath);
  const key = dir + '/' + p.newName;
  if (seen[key]) { console.log('⚠ 碰撞:', key, '<-', path.basename(p.oldPath), 'VS', path.basename(seen[key])); collision++; }
  seen[key] = p.oldPath;
}
console.log(`\n碰撞: ${collision}`);

if (DRY) { fs.writeFileSync(path.join(ROOT, 'config/jp_ddgs_rename_plan.json'), JSON.stringify(plan, null, 1)); console.log('\n[DRY] 未执行。plan 已写 config/jp_ddgs_rename_plan.json'); process.exit(0); }

const items0 = plan.filter(p => !p.err);
const items = items0.filter(p => path.basename(p.oldPath) !== p.newName);
const skippedNoop = items0.length - items.length;
if (skippedNoop) console.log(`跳过同名空转(无变化): ${skippedNoop} 张`);
if (!items.length) { console.log('无可执行项'); process.exit(0); }
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bak = path.join(ROOT, `output/images_jp_bak_${ts}`);
fs.mkdirSync(bak, { recursive: true });
for (const b of new Set(items.map(p => path.dirname(p.oldPath)))) {
  if (fs.existsSync(b)) fs.cpSync(b, path.join(bak, path.basename(b)), { recursive: true });
}
console.log('已备份至', bak);
let ok = 0, fail = 0;
const log = [];
for (const p of items) {
  const oldP = p.oldPath;
  const newP = path.join(path.dirname(oldP), p.newName);
  try {
    fs.renameSync(oldP, newP);
    const oj = oldP.replace(/\.png$/, '.json'), nj = newP.replace(/\.png$/, '.json');
    if (fs.existsSync(oj)) fs.renameSync(oj, nj);
    ok++; log.push({ old: path.relative(ROOT, oldP), new: p.newName });
  } catch (e) { fail++; console.log('✗', path.basename(oldP), e.message); }
}
fs.writeFileSync(path.join(ROOT, 'config/jp_ddgs_rename_log.json'), JSON.stringify(log, null, 1));
console.log(`完成: 成功 ${ok}, 失败 ${fail}. 明细 config/jp_ddgs_rename_log.json`);
