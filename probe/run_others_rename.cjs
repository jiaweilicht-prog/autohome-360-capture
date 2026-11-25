const fs = require('fs');
const path = require('path');

const BASE = 'output/images_by_view';
const DIRS = [
  { dir: '主驾位前望', view: 'IPDRV' },
  { dir: '前舱正视', view: 'IPFRONT' },
];

// 体系外 6 车：BRAND/GEN/SUBID 缺失 -> NA；MODEL 用可识别标识。
// IONIQ V 属现代，已知韩系码 HYD，予以保留；其余 5 台不在 DDGS 体系 -> BRAND=NA。
const GROUPS = [
  { old: '现代_IONIQ(艾尼氪)V_默认_主驾正视前排IP_01', model: 'IONIQV', brand: 'HYD' },
  { old: 'iCAR_iCAR-V27_默认_主驾正视前排IP_01', model: 'ICARV27', brand: 'NA' },
  { old: '日产_轩逸_默认_主驾正视前排IP_01', model: 'SYLPHY', brand: 'NA' },
  { old: 'smart_smart精灵#1_默认_主驾正视前排IP_01', model: 'SMART1', brand: 'NA' },
  { old: '法拉利_Purosangue_默认_主驾正视前排IP_01', model: 'PUROSANGUE', brand: 'NA' },
  { old: '高合汽车_高合HiPhi-Y_默认_主驾正视前排IP_01', model: 'HIPHIY', brand: 'NA' },
];

function oldBaseFor(dir, g) {
  if (dir === '主驾位前望') return g.old;
  return g.old.replace('主驾正视前排IP_01', '二排正视前排_01');
}

const log = [];
let missing = 0;
for (const { dir, view } of DIRS) {
  const full = path.join(BASE, dir);
  for (const g of GROUPS) {
    const oldBase = oldBaseFor(dir, g);
    for (const ext of ['.png', '.json']) {
      const oldPath = path.join(full, oldBase + ext);
      if (!fs.existsSync(oldPath)) { console.log('MISSING', oldPath); missing++; continue; }
      const newName = `IMG_${g.brand}_${g.model}_NA_${view}_NA_AUTO360_01${ext}`;
      const newPath = path.join(full, newName);
      fs.renameSync(oldPath, newPath);
      log.push({ dir, view, old: oldBase + ext, new: newName, brand: g.brand, model: g.model, gen: 'NA', subid: 'NA' });
    }
  }
}
fs.writeFileSync('config/others_ddgs_rename_log.json', JSON.stringify(log, null, 2));
console.log('Done. renamed', log.length, 'files; missing', missing);
