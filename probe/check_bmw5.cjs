// 5 台宝马样张：核对结果 + 恢复 73 车 discovery
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const BV = path.join(ROOT, 'output', 'images_by_view');
const CARS = [
  ['宝马iX3', '76392'], ['宝马X3', '76409'], ['宝马X5', '76453'], ['宝马7系', '77455'],
];
const anchors = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'p1-anchors.json'), 'utf8'));
const rows = [];
for (const [series, pano] of CARS) {
  for (const [folder, vid] of [['主驾位前望', 'F1'], ['前舱正视', 'R1']]) {
    const base = `宝马_${series}_默认_${vid === 'F1' ? '主驾正视前排IP' : '二排正视前排'}_01`;
    const p = path.join(BV, folder, base + '.json');
    if (!fs.existsSync(p)) { rows.push({ 车型: series + (pano === '77455' ? '(2025/2027同款)' : ''), 视角: folder, 状态: '缺' }); continue; }
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    const png = p.replace(/\.json$/, '.png');
    const a = anchors[pano] || {};
    const rear = a.rear || {};
    rows.push({
      车型: series + (pano === '77455' ? '(2025/2027同款)' : ''), 视角: folder,
      h: s.camera_state_actual.hlookat, v: s.camera_state_actual.vlookat,
      车头: s.scan_best_h, 偏移: s.driver_center_offset,
      定车头: rear.method || '-', 对称度: s.qc_sym, 阈值: s.qc_threshold, 可疑: s.qc_suspicious,
      前后亮带差: (rear.fastTop != null ? rear.fastTop - rear.revTop : null),
      UI清屏: s.ui_hidden_at_capture, KB: Math.round(fs.statSync(png).size / 1024),
    });
  }
}
console.table(rows);
// 恢复 73 车 discovery
const bak = path.join(ROOT, 'probe', 'p1-discovery.json.preBMW');
if (fs.existsSync(bak)) {
  fs.copyFileSync(bak, path.join(ROOT, 'probe', 'p1-discovery.json'));
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'probe', 'p1-discovery.json'), 'utf8'));
  console.log(`已恢复 discovery: total=${d.total} pano_found=${d.results.filter(r => r.status === 'pano_found').length}`);
  fs.rmSync(bak, { force: true });
}
for (const f of fs.readdirSync(path.join(ROOT, 'output'))) {
  if (f.endsWith('.preBMW')) fs.rmSync(path.join(ROOT, 'output', f), { force: true });
}
console.log('临时备份已清理（锚点/输出）；73 车清单完好');
fs.writeFileSync(path.join(ROOT, 'output', 'bmw5_check.json'), JSON.stringify(rows, null, 2));
