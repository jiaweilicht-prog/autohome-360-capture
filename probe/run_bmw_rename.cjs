// 把目录里 5 台宝马旧命名文件对齐到 DDGS 8 段命名（X3/X5/iX3 用草稿码；7系/Z4 用已知码并标待确认）。
// 先校验+备份，再按同目录改名 png+json。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = 'output/images_by_view';
const DIRS = { F1: '主驾位前望', R1: '前舱正视' };
const VIEW = {
  '主驾正视前排IP': { vid: 'F1', code: 'IPDRV', sub: '0204' },
  '二排正视前排': { vid: 'R1', code: 'IPFRONT', sub: '0101' },
};
// 车系 -> DDGS 码（X3/X5/iX3 取自草稿；7系/Z4 已知码，待确认）
const MAP = {
  'X3':  { model: 'X3',  gen: 'G01', uncertain: false, note: '' },
  'X5':  { model: 'X5',  gen: 'G38', uncertain: false, note: '草稿G38(中国长轴),全球为G05,待确认' },
  'iX3': { model: 'IX3', gen: 'G08', uncertain: false, note: '' },
  '7系': { model: '7',   gen: 'G70', uncertain: true,  note: '草稿无码;捕获年代不明(2025/2027?),G70为当前代,待确认' },
  'Z4':  { model: 'Z4',  gen: 'G29', uncertain: false, note: '' },
};
const BRAND = 'BMW';

const plan = [];
for (const [vid, dir] of Object.entries(DIRS)) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.png')) continue;
    const m = f.match(/^宝马_宝马(.+?)_默认_(主驾正视前排IP|二排正视前排)_01\.png$/);
    if (!m) continue;
    const series = m[1]; // X3 / X5 / iX3 / 7系 / Z4
    const v = VIEW[m[2]];
    const code = MAP[series];
    if (!code) { console.log('⚠ 无码跳过:', f); continue; }
    const newName = `IMG_${BRAND}_${code.model}_${code.gen}_${v.code}_${v.sub}_AUTO360_01.png`;
    plan.push({ oldName: f, newName, dir, uncertain: code.uncertain, note: code.note, series });
  }
}

// 校验
let missing = 0, conflict = 0;
for (const p of plan) {
  const oldP = path.join(ROOT, p.dir, p.oldName);
  if (!fs.existsSync(oldP)) { console.log('⚠ 缺旧文件', oldP); missing++; }
  const newP = path.join(ROOT, p.dir, p.newName);
  if (fs.existsSync(newP)) { console.log('⚠ 新名冲突', newP); conflict++; }
}
console.log(`宝马对齐计划: ${plan.length} 张, 缺旧 ${missing}, 冲突 ${conflict}`);
if (missing || conflict) { console.log('异常，终止。'); process.exit(1); }
console.log(plan.map(p => `${p.series} ${p.dir}: ${p.oldName} -> ${p.newName}${p.uncertain ? '  ⚠待确认' + (p.note ? '(' + p.note + ')' : '') : ''}`).join('\n'));

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bak = `output/images_by_view_bak_${ts}`;
fs.mkdirSync(bak, { recursive: true });
for (const d of Object.values(DIRS)) { const s = path.join(ROOT, d); if (fs.existsSync(s)) cp.execSync(`cp -R "${s}" "${bak}/"`); }
console.log('已备份至', bak);

let ok = 0, fail = 0;
for (const p of plan) {
  const oldP = path.join(ROOT, p.dir, p.oldName);
  const newP = path.join(ROOT, p.dir, p.newName);
  try {
    fs.renameSync(oldP, newP);
    const oj = oldP.replace(/\.png$/, '.json'), nj = newP.replace(/\.png$/, '.json');
    if (fs.existsSync(oj)) fs.renameSync(oj, nj);
    ok++;
  } catch (e) { fail++; console.log('✗', p.oldName, e.message); }
}
console.log(`重命名完成: 成功 ${ok}, 失败 ${fail}`);
fs.writeFileSync('config/bmw_ddgs_rename_log.json', JSON.stringify(plan, null, 1));
