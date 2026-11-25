// draft 表 54 行命名完成度核验：按 panoId 查 F1/R1 双视角是否都落地 + 尺寸 2880×1428
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const CSV = path.join(ROOT, 'config/ddgs_vehicle_map_draft.csv');
const SUBDIRS = [path.join(ROOT, 'output/images_by_view'), path.join(ROOT, 'output/images')];
const VIEW = { F1: 'IPDRV', R1: 'IPFRONT' };
const EXPECT_W = 2880, EXPECT_H = 1428;

function findPngByPano(panoId) {
  const hits = {};
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.png')) continue;
      let ok = false;
      const j = p.replace(/\.png$/, '.json');
      if (fs.existsSync(j)) { try { const s = JSON.parse(fs.readFileSync(j, 'utf8')); ok = s.source_url && s.source_url.includes('pano/' + panoId); } catch (e2) {} }
      if (!ok) ok = e.name.includes(String(panoId));
      if (ok) { const v = e.name.includes('IPDRV') ? 'F1' : e.name.includes('IPFRONT') ? 'R1' : null; if (v) hits[v] = p; }
    }
  }
  for (const b of SUBDIRS) walk(b);
  return hits;
}

const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1);
let both = 0, onlyF1 = 0, onlyR1 = 0, missing = 0, sizeBad = 0;
const rows = [];
for (const ln of lines) {
  const [series, seriesName, brandCn, brandCode, modelCode, genCode, years, panoId] = ln.split(',');
  const h = findPngByPano(panoId);
  const hasF = !!h.F1, hasR = !!h.R1;
  let status;
  if (hasF && hasR) { status = '双视角✓'; both++; }
  else if (hasF) { status = '仅F1'; onlyF1++; }
  else if (hasR) { status = '仅R1'; onlyR1++; }
  else { status = '缺图'; missing++; }
  let sz = '';
  if (hasF) { const b = h.F1.replace(/\.png$/, '.json'); try { const s = JSON.parse(fs.readFileSync(b, 'utf8')); if (s.width && s.height && (s.width !== EXPECT_W || s.height !== EXPECT_H)) { sz = `F1尺寸异常 ${s.width}x${s.height}`; sizeBad++; } } catch (e) {} }
  if (hasR && !sz) { const b = h.R1.replace(/\.png$/, '.json'); try { const s = JSON.parse(fs.readFileSync(b, 'utf8')); if (s.width && s.height && (s.width !== EXPECT_W || s.height !== EXPECT_H)) { sz = `R1尺寸异常 ${s.width}x${s.height}`; sizeBad++; } } catch (e) {} }
  rows.push({ line: `${brandCode}/${modelCode}`, status, sz: sz || '-' });
}
console.log('=== draft 表命名完成度核验 (54 行) ===');
console.log(`双视角✓: ${both} | 仅F1: ${onlyF1} | 仅R1: ${onlyR1} | 缺图: ${missing}`);
console.log(`尺寸异常(非2880×1428): ${sizeBad}`);
console.log('\n--- 非双视角明细 ---');
rows.filter(r => r.status !== '双视角✓').forEach(r => console.log(`  ${r.line.padEnd(16)} ${r.status.padEnd(8)} ${r.sz}`));
console.log('\n--- 双视角但尺寸异常 ---');
rows.filter(r => r.sz !== '-').forEach(r => console.log(`  ${r.line.padEnd(16)} ${r.status.padEnd(8)} ${r.sz}`));
// 统计
const total = lines.length;
const complete = both;
console.log(`\n完成度: ${complete}/${total} = ${(complete/total*100).toFixed(1)}%`);
