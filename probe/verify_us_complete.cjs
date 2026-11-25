// 只读核验：逐组核对 images_by_view 下两视角文件是否真实存在（用 run-p1 的 sanitize 规则）
const fs = require('fs');
const path = require('path');
const d = require('./p1-discovery.json');
const ROOT = path.join(__dirname, '..', 'output', 'images_by_view');

function sanitize(s) {
  return String(s)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 110);
}
const MAP = {
  F1: { folder: '主驾位前望', name: '主驾正视前排IP' },
  R1: { folder: '前舱正视', name: '二排正视前排' },
};

const disc = d.results.filter(x => x.status === 'pano_found');
const rows = [];
let both = 0, partial = 0, none = 0;
const missingF1 = [], missingR1 = [];

for (const r of disc) {
  const b = sanitize(r.brandCn), s = sanitize(r.seriesName);
  const rec = { pano: r.panoId, brand: r.brandCn, series: r.seriesName, f1: false, r1: false, f1sz: 0, r1sz: 0 };
  for (const [vid, m] of Object.entries(MAP)) {
    const fp = path.join(ROOT, m.folder, `${b}_${s}_默认_${m.name}_01.png`);
    if (fs.existsSync(fp)) {
      const sz = fs.statSync(fp).size;
      if (sz > 10000) { if (vid === 'F1') { rec.f1 = true; rec.f1sz = sz; } else { rec.r1 = true; rec.r1sz = sz; } }
    }
  }
  if (rec.f1 && rec.r1) both++;
  else if (rec.f1 || rec.r1) { partial++; if (!rec.f1) missingF1.push(rec); if (!rec.r1) missingR1.push(rec); }
  else none++;
  rows.push(rec);
}

console.log('=== 美系 147 分组核验 ===');
console.log('两视角齐全:', both);
console.log('仅缺一个视角:', partial);
console.log('两视角皆无:', none);
console.log('');
console.log('--- 仅缺 F1 的分组 ---');
missingF1.forEach(x => console.log('  ', x.pano, x.brand, x.series));
console.log('--- 仅缺 R1 的分组 ---');
missingR1.forEach(x => console.log('  ', x.pano, x.brand, x.series));
console.log('--- 两视角皆无的分组 ---');
rows.filter(r => !r.f1 && !r.r1).forEach(x => console.log('  ', x.pano, x.brand, x.series));

// 输出待补拍 pano 列表（用于 --only-pano）
const need = rows.filter(r => !r.f1 || !r.r1).map(r => r.pano);
console.log('');
console.log('待补拍 pano 数:', need.length);
console.log('PANO_LIST=' + need.join(','));

// 存档
fs.writeFileSync(path.join(__dirname, 'us_verify_result.json'), JSON.stringify(rows, null, 2));
