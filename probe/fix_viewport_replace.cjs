// 用重采的新图（旧命名，2880x1428）替换视口异常的 DDGS 旧件
// 旧件(2884x1414)移入 output/archived_bad_viewport/，不删除
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const F1 = path.join(ROOT, 'output/images_by_view/主驾位前望');
const R1 = path.join(ROOT, 'output/images_by_view/前舱正视');
const ARCH = path.join(ROOT, 'output/archived_bad_viewport');
fs.mkdirSync(path.join(ARCH, '主驾位前望'), { recursive: true });
fs.mkdirSync(path.join(ARCH, '前舱正视'), { recursive: true });

// [新图基名(含品牌前缀), DDGS前缀, viewCode, dir, archSub]
const tasks = [];
for (const [base, ddgs] of [['宝马_宝马i7', 'IMG_BMW_I7'], ['宝马_宝马iX', 'IMG_BMW_IX'], ['保时捷_Taycan', 'IMG_POR_TAYCAN'], ['保时捷_Macan', 'IMG_POR_MACAN'], ['保时捷_Macan新能源', 'IMG_POR_MACAN-PHEV']]) {
  tasks.push([base, ddgs, 'IPDRV', F1, '主驾位前望', '主驾正视前排IP']);
  tasks.push([base, ddgs, 'IPFRONT', R1, '前舱正视', '二排正视前排']);
}

let ok = 0, skip = 0;
for (const [base, ddgs, vcode, dir, archSub, vname] of tasks) {
  const newPng = path.join(dir, `${base}_默认_${vname}_01.png`);
  const newJson = path.join(dir, `${base}_默认_${vname}_01.json`);
  const dstBase = path.join(dir, `${ddgs}_NA_${vcode}_NA_AUTO360_01`);
  if (!fs.existsSync(newPng)) { console.log('SKIP 新图不存在:', path.basename(newPng)); skip++; continue; }
  // 旧件归档
  for (const ext of ['.png', '.json']) {
    if (fs.existsSync(dstBase + ext)) {
      fs.renameSync(dstBase + ext, path.join(ARCH, archSub, path.basename(dstBase + ext)));
    }
  }
  fs.renameSync(newPng, dstBase + '.png');
  if (fs.existsSync(newJson)) fs.renameSync(newJson, dstBase + '.json');
  console.log('OK', vcode, base, '->', path.basename(dstBase));
  ok++;
}
console.log(`\n替换完成: ${ok} 项, 跳过 ${skip}`);
