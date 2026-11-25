// 执行：按 kr_ddgs_rename_plan.json 把韩系 70 张图（png+json 侧车）重命名为 DDGS 8 段格式。
// 同目录内只改名，不动图内容、不改目录结构。执行前先备份 output/images_by_view。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = 'output/images_by_view';
const VIEW_DIR = { F1: '主驾位前望', R1: '前舱正视' };
const plan = JSON.parse(fs.readFileSync('config/kr_ddgs_rename_plan.json', 'utf8'));
const items = plan.filter(p => !p.err && p.oldName && p.newName);

// 1) 校验：旧文件齐全？新名是否冲突？
let missing = 0, conflict = 0;
for (const p of items) {
  const dir = VIEW_DIR[p.vid];
  const oldP = path.join(ROOT, dir, p.oldName);
  if (!fs.existsSync(oldP)) { console.log('⚠ 缺旧文件:', oldP); missing++; }
  const newP = path.join(ROOT, dir, p.newName);
  if (fs.existsSync(newP)) { console.log('⚠ 新名已存在(冲突):', newP); conflict++; }
}
console.log(`校验: 计划 ${items.length} 张, 缺旧文件 ${missing}, 新名冲突 ${conflict}`);
if (missing || conflict) { console.log('存在异常，终止执行。'); process.exit(1); }

// 2) 备份
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bak = `output/images_by_view_bak_${ts}`;
fs.mkdirSync(bak, { recursive: true });
for (const d of Object.values(VIEW_DIR)) {
  const src = path.join(ROOT, d);
  if (fs.existsSync(src)) cp.execSync(`cp -R "${src}" "${bak}/"`);
}
console.log('已备份至', bak);

// 3) 执行改名
let ok = 0, fail = 0;
const log = [];
for (const p of items) {
  const dir = VIEW_DIR[p.vid];
  const oldP = path.join(ROOT, dir, p.oldName);
  const newP = path.join(ROOT, dir, p.newName);
  try {
    fs.renameSync(oldP, newP);
    const oldJ = oldP.replace(/\.png$/, '.json');
    const newJ = newP.replace(/\.png$/, '.json');
    if (fs.existsSync(oldJ)) fs.renameSync(oldJ, newJ);
    ok++; log.push(`${p.oldName} -> ${p.newName}`);
  } catch (e) { fail++; console.log('✗ 失败', p.oldName, e.message); }
}
console.log(`重命名完成: 成功 ${ok}, 失败 ${fail}`);
fs.writeFileSync('config/kr_ddgs_rename_log.json', JSON.stringify(log, null, 1));
console.log('明细写入 config/kr_ddgs_rename_log.json');
