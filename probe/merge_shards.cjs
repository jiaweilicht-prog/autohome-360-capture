// 合并并行分片的锚点 / manifest 回主文件，并核对高合 HiPhi Y 修正结果
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const mainA = path.join(ROOT, 'config', 'p1-anchors.json');
const mainS = path.join(ROOT, 'output', 'manifest.json');
const merged = JSON.parse(fs.readFileSync(mainA, 'utf8'));
let n = 0;
for (let i = 0; i < 3; i++) {
  const f = path.join(ROOT, 'config', `p1-anchors_s${i}.json`);
  if (!fs.existsSync(f)) continue;
  const sh = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [k, v] of Object.entries(sh)) { merged[k] = v; n++; }
}
fs.writeFileSync(mainA, JSON.stringify(merged, null, 2));
const st = JSON.parse(fs.readFileSync(mainS, 'utf8'));
st.items = st.items || {};
for (let i = 0; i < 3; i++) {
  const f = path.join(ROOT, 'output', `manifest_s${i}.json`);
  if (!fs.existsSync(f)) continue;
  const sh = JSON.parse(fs.readFileSync(f, 'utf8'));
  Object.assign(st.items, sh.items || {});
}
fs.writeFileSync(mainS, JSON.stringify(st, null, 2));
console.log(`合并锚点 ${n} 车 -> config/p1-anchors.json；manifest items=${Object.keys(st.items).length}`);
console.log('\n高合 HiPhi Y (63837) 锚点：', JSON.stringify(merged['63837'], null, 1));
console.log('smart (78601) 锚点：', JSON.stringify(merged['78601'], null, 1));
// 核对 sidecar
const check = [
  ['output/images_by_view/前舱正视/高合汽车_高合HiPhi-Y_默认_二排正视前排_01.json'],
  ['output/images_by_view/主驾位前望/高合汽车_高合HiPhi-Y_默认_主驾正视前排IP_01.json'],
  ['output/images_by_view/主驾位前望/smart_smart精灵#1_默认_主驾正视前排IP_01.json'],
];
for (const [rel] of check) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('缺: ' + rel); continue; }
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log(`${s.brand}/${s.series} ${s.view_id}: h=${s.camera_state_actual.hlookat} v=${s.camera_state_actual.vlookat} final_h=${s.final_h} offset=${s.driver_center_offset} ui=${s.ui_hidden_at_capture}`);
}
// 清理分片临时文件
for (let i = 0; i < 3; i++) {
  fs.rmSync(path.join(ROOT, 'config', `p1-anchors_s${i}.json`), { force: true });
  fs.rmSync(path.join(ROOT, 'output', `manifest_s${i}.json`), { force: true });
}
console.log('分片临时文件已清理');
