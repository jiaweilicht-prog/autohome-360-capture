// 只读分析：用 ddgs_vehicle_map_draft.csv 的 panoId，去 images_by_view 与 output/images 找每台车当前文件
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const CSV = path.join(ROOT, 'config/ddgs_vehicle_map_draft.csv');
const VIEWS = { F1: '主驾位前望', R1: '前舱正视' };
const SUBDIRS = [
  path.join(ROOT, 'output/images_by_view'),
  path.join(ROOT, 'output/images'),
];

function findPngByPano(panoId) {
  const hits = [];
  for (const base of SUBDIRS) {
    // 递归搜 png，读同目录 json sidecar 的 source_url
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.png')) continue;
        const j = p.replace(/\.png$/, '.json');
        let ok = false;
        if (fs.existsSync(j)) {
          try { const s = JSON.parse(fs.readFileSync(j, 'utf8')); ok = s.source_url && s.source_url.includes('pano/' + panoId); } catch (e2) {}
        }
        // 退路：文件名若含 panoId
        if (!ok) ok = e.name.includes(String(panoId));
        if (ok) hits.push(p);
      }
    }
    walk(base);
  }
  return hits;
}

const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1);
let total = 0, withFiles = 0, alreadyIMG = 0, unmatched = 0;
const report = [];
for (const ln of lines) {
  const [series, seriesName, brandCn, brandCode, modelCode, genCode, years, panoId] = ln.split(',');
  total++;
  const hits = findPngByPano(panoId);
  const rel = hits.map(h => path.relative(ROOT, h));
  const imgCount = hits.filter(h => path.basename(h).startsWith('IMG_')).length;
  if (hits.length) { withFiles++; if (imgCount) alreadyIMG += (imgCount ? 1 : 0); } else unmatched++;
  report.push({ series, brandCode, modelCode, genCode, panoId, found: hits.length, img: imgCount, paths: rel });
}

console.log(`draft 表共 ${total} 行`);
console.log(`  有图文件(任一视角): ${withFiles}`);
console.log(`  完全无图(可能未抓/在别处): ${unmatched}`);
console.log('\n=== 逐行 ===');
for (const r of report) {
  const tag = r.found === 0 ? '✗无图' : (r.img > 0 ? '•已IMG' : '○未命名');
  console.log(`${tag} ${r.brandCode}/${r.modelCode} gen=${r.genCode} pano=${r.panoId} found=${r.found}`);
  for (const p of r.paths) console.log('      ' + p);
}
fs.writeFileSync(path.join(ROOT, 'config/_draft_analyze.json'), JSON.stringify(report, null, 1));
