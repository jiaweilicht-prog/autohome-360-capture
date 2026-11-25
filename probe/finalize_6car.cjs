// 收尾：合并分片锚点（仅取 HiPhi Y/Purosangue 的快速通道结果，Z4 以刚重算的正确值为准）→ 恢复 73 车 discovery → 逐车核对
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const mainA = path.join(ROOT, 'config', 'p1-anchors.json');
const anchors = JSON.parse(fs.readFileSync(mainA, 'utf8'));
const TAKE = ['63837', '55680'];   // 高合HiPhi Y / 法拉利Purosangue：2 分片跑出的快速通道结果
for (let i = 0; i < 2; i++) {
  const f = path.join(ROOT, 'config', `p1-anchors_s${i}.json`);
  if (!fs.existsSync(f)) continue;
  const sh = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const k of TAKE) if (sh[k]) { anchors[k] = sh[k]; console.log(`合并 ${k} <- shard${i}`); }
}
fs.writeFileSync(mainA, JSON.stringify(anchors, null, 2));
for (let i = 0; i < 3; i++) {
  fs.rmSync(path.join(ROOT, 'config', `p1-anchors_s${i}.json`), { force: true });
  fs.rmSync(path.join(ROOT, 'output', `manifest_s${i}.json`), { force: true });
}
// 恢复 73 车 discovery
const bak = path.join(ROOT, 'probe', 'p1-discovery.json.pre6car2');
if (fs.existsSync(bak)) {
  fs.copyFileSync(bak, path.join(ROOT, 'probe', 'p1-discovery.json'));
  console.log('已恢复 73 车 discovery');
}
fs.rmSync(bak, { force: true });
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'probe', 'p1-discovery.json'), 'utf8'));
console.log(`discovery: total=${d.total} pano_found=${d.results.filter(r => r.status === 'pano_found').length}`);

// 逐车核对最终 sidecar（按视角归档后的新结构）
const CARS = [
  ['主驾位前望', 'iCAR_iCAR-V27_默认_主驾正视前排IP_01'],
  ['前舱正视', 'iCAR_iCAR-V27_默认_二排正视前排_01'],
  ['主驾位前望', '日产_轩逸_默认_主驾正视前排IP_01'],
  ['前舱正视', '日产_轩逸_默认_二排正视前排_01'],
  ['主驾位前望', 'smart_smart精灵#1_默认_主驾正视前排IP_01'],
  ['前舱正视', 'smart_smart精灵#1_默认_二排正视前排_01'],
  ['主驾位前望', '高合汽车_高合HiPhi-Y_默认_主驾正视前排IP_01'],
  ['前舱正视', '高合汽车_高合HiPhi-Y_默认_二排正视前排_01'],
  ['主驾位前望', '法拉利_Purosangue_默认_主驾正视前排IP_01'],
  ['前舱正视', '法拉利_Purosangue_默认_二排正视前排_01'],
  ['主驾位前望', '宝马_宝马Z4_默认_主驾正视前排IP_01'],
];
console.log('\n=== 最终结果（按视角归档）===');
const rows = [];
for (const [folder, base] of CARS) {
  const p = path.join(ROOT, 'output/images_by_view', folder, base + '.json');
  if (!fs.existsSync(p)) { console.log(`缺: ${folder}/${base}`); continue; }
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  const png = p.replace(/\.json$/, '.png');
  const size = fs.existsSync(png) ? Math.round(fs.statSync(png).size / 1024) : 0;
  rows.push({ 车型: `${s.brand}/${s.series}`, 视角: folder, h: s.camera_state_actual.hlookat, v: s.camera_state_actual.vlookat, offset: s.driver_center_offset, sep: s.match_separation, UI清屏: s.ui_hidden_at_capture, KB: size });
}
console.table(rows);
fs.writeFileSync(path.join(ROOT, 'output', 'final_6car_check.json'), JSON.stringify(rows, null, 2));
console.log('核对表 -> output/final_6car_check.json');
