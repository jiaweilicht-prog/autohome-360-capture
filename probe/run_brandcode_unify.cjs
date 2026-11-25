// 品牌码统一：把 EU/US 里仍用 AUDI_/VOLVO_/FORD_ 前缀的 IMG 文件翻成 AUD_/VOL_/FOR_
// 只改文件名第1段（品牌码），其余不变。仅作用于 IMG_ 开头文件。带备份。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const BASES = [path.join(ROOT, 'output/images_by_view'), path.join(ROOT, 'output/images')];
const MAP = { 'AUDI': 'AUD', 'VOLVO': 'VOL', 'FORD': 'FOR' };
const DRY = process.argv.includes('--dry');

const plan = [];
for (const base of BASES) {
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.startsWith('IMG_')) continue;
      const seg = e.name.split('_');
      const old = seg[1];
      if (MAP[old]) {
        seg[1] = MAP[old];
        const nn = seg.join('_');
        plan.push({ dir, old: e.name, new: nn });
      }
    }
  }
  walk(base);
}

console.log(`=== 品牌码统一 ${DRY ? 'DRY' : 'EXECUTE'} ===`);
const byBrand = {};
for (const p of plan) (byBrand[p.old.split('_')[1]] = byBrand[p.old.split('_')[1]] || []).push(p);
for (const b of Object.keys(MAP)) {
  const n = plan.filter(p => p.old.startsWith('IMG_' + b + '_')).length;
  console.log(`  ${b} -> ${MAP[b]}: ${n} 张`);
}
console.log(`合计待翻: ${plan.length}`);
if (DRY) { console.log('[DRY] 未执行'); process.exit(0); }
if (!plan.length) { console.log('无需翻'); process.exit(0); }

// 碰撞检测
const seen = {};
let collision = 0;
for (const p of plan) { const k = p.dir + '/' + p.new; if (seen[k]) { console.log('⚠碰撞', k); collision++; } seen[k] = p.old; }
if (collision) { console.log('存在碰撞，终止'); process.exit(1); }

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bak = path.join(ROOT, `output/images_branduni_bak_${ts}`);
fs.mkdirSync(bak, { recursive: true });
for (const b of new Set(plan.map(p => p.dir))) {
  if (fs.existsSync(b)) fs.cpSync(b, path.join(bak, path.relative(ROOT, b).replace(/\//g, '_')), { recursive: true });
}
console.log('已备份 ->', bak);
let ok = 0, fail = 0; const log = [];
for (const p of plan) {
  const oldP = path.join(p.dir, p.old), newP = path.join(p.dir, p.new);
  try {
    fs.renameSync(oldP, newP);
    const oj = oldP.replace(/\.png$/, '.json'), nj = newP.replace(/\.png$/, '.json');
    if (fs.existsSync(oj)) fs.renameSync(oj, nj);
    ok++; log.push({ old: p.old, new: p.new });
  } catch (e) { fail++; console.log('✗', p.old, e.message); }
}
fs.writeFileSync(path.join(ROOT, 'config/brand_unify_log.json'), JSON.stringify(log, null, 1));
console.log(`完成: 成功 ${ok}, 失败 ${fail}`);
