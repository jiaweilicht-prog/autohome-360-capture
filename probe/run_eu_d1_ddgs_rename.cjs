// 欧系 D1 视角（主驾看副驾门）DDGS 命名：对齐日系 panoId 匹配方式
// 格式: IMG_{BRAND}_{MODEL}_NA_IPdoor_NA_AUTO360_01
//   VIEW['D1'] = 'IPdoor'（驾驶位拍摄、看向副驾门板，与 IPDRV/IPFRONT 对称，按规范为 IPdoor）
// 只扫 images_by_view/主驾看副驾门，按 panoId 匹配 98 台筛选欧系；排除 _raw.png 备份。
// 用法: node probe/run_eu_d1_ddgs_rename.cjs [--dry]
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const CSV = path.join(ROOT, 'config/ddgs_vehicle_map_eu.csv');
const D1DIR = path.join(ROOT, 'output/images_by_view', '主驾看副驾门');
const DRY = process.argv.includes('--dry');

const VIEW = { D1: 'IPdoor' };
function viewOf(p) {
  if (p.includes('主驾看副驾门')) return 'D1';
  return null;
}
function genClean(g) { return (g || 'NA').replace(/[⚠?]/g, '').trim() || 'NA'; }

function findPngByPano(panoId) {
  const hits = [];
  if (!fs.existsSync(D1DIR)) return hits;
  for (const e of fs.readdirSync(D1DIR, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.png')) continue;
    if (e.name.includes('_raw')) continue;            // 跳过整幅备份
    const p = path.join(D1DIR, e.name);
    const j = p.replace(/\.png$/, '.json');
    let ok = false;
    if (fs.existsSync(j)) { try { const s = JSON.parse(fs.readFileSync(j, 'utf8')); ok = s.source_url && s.source_url.includes('pano/' + panoId); } catch (e2) {} }
    if (!ok) ok = e.name.includes(String(panoId));
    if (ok) hits.push(p);
  }
  return hits;
}

const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1);
const plan = [];
let noImg = 0, unnamed = 0, alreadyImg = 0;
for (const ln of lines) {
  const c = ln.split(',');
  const [series, seriesName, brandCn, brandCode, modelCode, genCode, years, panoId] = c;
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
    plan.push({ pano: panoId, brandCode, modelCode, gen, v, oldPath: h, newName: nn, isImg });
  }
  if (anyUnnamed) unnamed++;
}

const toName = plan.filter(p => !p.err && !p.isImg);
const toConvert = plan.filter(p => !p.err && p.isImg);
const errs = plan.filter(p => p.err);

console.log(`=== 欧系 D1 命名 dry-run (${DRY ? 'DRY' : 'EXECUTE'}) ===`);
console.log(`总行: ${lines.length} | 无图(豁免/未抓): ${noImg} | 含未命名图车系: ${unnamed} | 已IMG需转码: ${toConvert.length} | 映射错误: ${errs.length}`);
console.log(`\n--- 未命名 → 改名 (${toName.length} 张) ---`);
for (const p of toName) console.log(`  ${path.basename(p.oldPath)}  →  ${p.newName}`);
console.log(`\n--- 已 IMG_ → 转 D1 口径 (${toConvert.length} 张) ---`);
for (const p of toConvert) console.log(`  ${path.basename(p.oldPath)}  →  ${p.newName}`);
if (errs.length) { console.log(`\n--- 错误/缺图 ---`); for (const e of errs) console.log('  ' + e.err); }

// 碰撞检测（同目录同名）
const seen = {};
let collision = 0;
const target = plan.filter(p => !p.err);
for (const p of target) {
  const key = D1DIR + '/' + p.newName;
  if (seen[key]) { console.log('⚠ 碰撞:', key, '<-', path.basename(p.oldPath), 'VS', path.basename(seen[key])); collision++; }
  seen[key] = p.oldPath;
}
console.log(`\n碰撞: ${collision}`);

if (DRY) { fs.writeFileSync(path.join(ROOT, 'config/eu_d1_ddgs_rename_plan.json'), JSON.stringify(plan, null, 1)); console.log('\n[DRY] 未执行。plan 已写 config/eu_d1_ddgs_rename_plan.json'); process.exit(0); }

const items0 = plan.filter(p => !p.err);
const items = items0.filter(p => path.basename(p.oldPath) !== p.newName);
const skippedNoop = items0.length - items.length;
if (skippedNoop) console.log(`跳过同名空转(无变化): ${skippedNoop} 张`);
if (!items.length) { console.log('无可执行项'); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bak = path.join(ROOT, `output/images_eu_d1_bak_${ts}`);
fs.mkdirSync(bak, { recursive: true });
fs.cpSync(D1DIR, path.join(bak, '主驾看副驾门'), { recursive: true });
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
    ok++; log.push({ old: path.basename(oldP), new: p.newName });
  } catch (e) { fail++; console.log('✗', path.basename(oldP), e.message); }
}
fs.writeFileSync(path.join(ROOT, 'config/eu_d1_ddgs_rename_log.json'), JSON.stringify(log, null, 1));
console.log(`完成: 成功 ${ok}, 失败 ${fail}. 明细 config/eu_d1_ddgs_rename_log.json`);
