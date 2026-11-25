// 迁移：output/images/{品牌}/{车型}/默认/*.png  ->  output/images_by_view/{视角文件夹}/
// 规则：
//   1. 按 sidecar 的 view_id 归类：F1→主驾位前望，R1→前舱正视（含 -降级 后缀的一并归入对应视角）。
//   2. 只迁移「新模型产出」的文件（sidecar 有 final_h 字段）；旧锚定逻辑产物（角度已知有误，如 Q7 h142）保留原位不迁移，
//      避免把坏资产混入新结构——它们会在全量重跑时被新结构产物覆盖。
//   3. 同时移动 .png 与 .json sidecar，并输出映射 CSV 便于追溯。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const SRC = path.join(ROOT, 'output', 'images');
const DST = path.join(ROOT, 'output', 'images_by_view');
const MAP_CSV = path.join(ROOT, 'output', 'migration_map.csv');
const FOLDER = { F1: '主驾位前望', R1: '前舱正视' };

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.png')) acc.push(p);
  }
  return acc;
}
const rows = [['from', 'to', 'brand', 'series', 'view_id', 'view_folder', 'reason']];
let moved = 0, skipped = [];
for (const png of walk(SRC)) {
  const js = png.replace(/\.png$/, '.json');
  const s = fs.existsSync(js) ? JSON.parse(fs.readFileSync(js, 'utf8')) : null;
  const vid = s && s.view_id ? String(s.view_id).replace(/-降级.*$/, '') : null;
  const isNew = s && s.final_h !== undefined;
  if (!s || !vid || !FOLDER[vid] || !isNew) {
    skipped.push({ png: path.relative(ROOT, png), why: !isNew ? '旧锚定逻辑产物(无 final_h)，待全量重拍覆盖' : '无法识别视角' });
    continue;
  }
  const folder = FOLDER[vid];
  const dir = path.join(DST, folder);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(png);
  const to = path.join(dir, base);
  fs.renameSync(png, to);
  const toJs = to.replace(/\.png$/, '.json');
  if (fs.existsSync(js)) fs.renameSync(js, toJs);
  rows.push([path.relative(ROOT, png), path.relative(ROOT, to), s.brand, s.series, s.view_id, folder, '']);
  moved++;
}
fs.writeFileSync(MAP_CSV, rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
console.log(`迁移完成: ${moved} 张 -> ${path.relative(ROOT, DST)}`);
console.log(`映射表: ${path.relative(ROOT, MAP_CSV)}`);
if (skipped.length) {
  console.log(`\n未迁移 ${skipped.length} 张（保留原位）:`);
  for (const s of skipped.slice(0, 30)) console.log('  - ' + s.png + '  [' + s.why + ']');
}
