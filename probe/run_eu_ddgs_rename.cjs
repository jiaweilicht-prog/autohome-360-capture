// 欧系 DDGS 8 段命名重命名（对齐美系收尾步骤）
// 格式: IMG_{BRAND}_{MODEL}_NA_{VIEW}_NA_AUTO360_01
//   BRAND = 欧系品牌码；MODEL = 拉丁车型码；GEN/SUBID = NA（欧系无年代/代际字段）
//   VIEW: 主驾位前望→IPDRV, 前舱正视→IPFRONT；SOURCE=AUTO360；SEQ=01
// 用法: node probe/run_eu_ddgs_rename.cjs [--dry]
const fs = require('fs');
const path = require('path');

const BASE = 'output/images_by_view';
const DRY = process.argv.includes('--dry');

function sanitize(s) { return String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 110); }

// 品牌中文 → 欧系 DDGS 码
const BRAND_MAP = {
  '奔驰': 'MER', '宝马': 'BMW', '奥迪': 'AUDI', '沃尔沃': 'VOLVO', '保时捷': 'POR',
  '路虎': 'LR', '法拉利': 'FER', '兰博基尼': 'LAM', '宾利': 'BEN', '劳斯莱斯': 'RR',
  '标致': 'PEU', 'DS': 'DS', 'Polestar极星': 'POLE', '英力士掷弹兵': 'INEOS',
  '阿斯顿·马丁': 'ASTON', '布加迪': 'BUGA', '科尼赛克': 'KONI', 'LEVC': 'LEVC',
  '迈凯伦': 'MCLAREN', '摩根': 'MORGAN', '莲花跑车': 'LOTUS',
};

// 车型（发现库 seriesName，按文件名实际出现形式=去空格/特殊符为连字符） → 拉丁车型码
// 注意 key 必须与文件第2段完全一致（空格/特殊符已被 sanitize 转成 -）
const MODEL_MAP = {
  '奔驰G级': 'G-CLASS', '奔驰S级': 'S-CLASS', '奔驰E级': 'E-CLASS', '奔驰EQS': 'EQS',
  '奔驰EQE-SUV': 'EQE-SUV', '路虎卫士': 'DEFENDER', '揽胜': 'RANGE-ROVER',
  '揽胜运动': 'RANGE-ROVER-SPORT', '揽胜星脉': 'VELAR', '宝马X3': 'X3', '宝马X5': 'X5',
  '宝马7系': '7', '宝马iX': 'IX', '宝马i7': 'I7', '宝马Z4': 'Z4', '奥迪A8': 'A8',
  '奥迪Q8': 'Q8', '奥迪Q6L-e-tron': 'Q6L-ETRON', '奥迪e-tron-GT': 'ETRON-GT',
  '沃尔沃XC90': 'XC90', '沃尔沃EX90': 'EX90', '沃尔沃EX30': 'EX30', '沃尔沃ES90': 'ES90',
  '保时捷911': '911', 'Taycan': 'TAYCAN', 'Cayenne': 'CAYENNE', 'Macan': 'MACAN',
  'Macan新能源': 'MACAN-PHEV', '法拉利296': '296', 'Purosangue': 'PUROSANGUE', 'Roma': 'ROMA',
  '法拉利12Cilindri': '12CILINDRI', 'Revuelto': 'REVELTO', 'Urus': 'URUS', 'Huracán': 'HURACAN',
  '欧陆': 'CONTINENTAL', '添越': 'BENTAYGA', '幻影': 'PHANTOM', '古思特': 'GHOST',
  '库里南': 'CULLINAN', '闪灵': 'SPECTRE', '标致3008': '3008', '标致408': '408', '标致508': '508',
  'DS-7': 'DS7', 'DS-9': 'DS9', 'Polestar-3': 'POLESTAR3', 'Polestar-4': 'POLESTAR4',
  '英力士掷弹兵': 'GRENADIER', '阿斯顿·马丁DBX': 'DBX', 'V8-Vantage': 'V8-VANTAGE',
  '阿斯顿·马丁DB12': 'DB12', 'Vanquish': 'VANQUISH', '阿斯顿·马丁DB11': 'DB11',
  '阿斯顿·马丁DBS': 'DBS', 'Divo': 'DIVO', 'Tourbillon': 'TOURBILLON', 'Agera': 'AGERA',
  'LEVC-LX': 'LX', 'LEVC-TX': 'TX', 'Artura': 'ARTURA', '迈凯伦GT': 'GT', '迈凯伦540C': '540C',
  '迈凯伦570': '570', '迈凯伦600LT': '600LT', '迈凯伦720S': '720S', '摩根Plus-6': 'PLUS6',
  'EMEYA': 'EMEYA', 'FOR-ME': 'FORME', 'ELETRE': 'ELETRE', 'EMIRA': 'EMIRA', 'Evora': 'EVORA',
  '奥迪TT': 'TT', '奥迪TTS': 'TTS', '奥迪R8': 'R8', '奥迪TT-RS': 'TT-RS',
  '奥迪RS-e-tron-GT': 'RS-ETRON-GT', 'AMG-GT': 'AMG-GT', 'AMG-GT新能源': 'AMG-GT-PHEV',
  '迈巴赫S级': 'MAYBACH-S', '迈巴赫S级新能源': 'MAYBACH-S-PHEV', '迈巴赫EQS-SUV': 'MAYBACH-EQS-SUV',
  '迈巴赫GLS': 'MAYBACH-GLS', '宝马i8': 'I8', '宝马XM': 'XM', '宝马M8': 'M8', '保时捷718': '718',
  '918-Spyder': '918-SPYDER', 'Bacalar': 'BACALAR', '慕尚': 'MULSANNE', '法拉利F80': 'F80',
  '法拉利849': '849', 'SF90': 'SF90', 'GTC4Lusso': 'GTC4LUSSO', 'Portofino': 'PORTOFINO',
  '法拉利812': '812', '法拉利F8': 'F8', 'Aventador': 'AVENTADOR',
};

const DIRS = [
  { dir: '主驾位前望', view: 'IPDRV' },
  { dir: '前舱正视', view: 'IPFRONT' },
];

// 构建查找表：sanitized(brandCn)|sanitized(seriesName) -> {brandCode, modelCode}
const d = require('config/eu_run_panos.json');
const full = require('config/eu_discovery_full.json').results;
const meta = {};
for (const r of full) {
  const key = sanitize(r.brandCn) + '|' + sanitize(r.seriesName);
  meta[key] = { brandCn: r.brandCn, seriesName: r.seriesName };
}
const lookup = {};
for (const r of full) {
  const bk = sanitize(r.brandCn), sk = sanitize(r.seriesName);
  const key = bk + '|' + sk;
  const bc = BRAND_MAP[r.brandCn];
  const mc = MODEL_MAP[sk];
  if (bc && mc) lookup[key] = { brandCode: bc, modelCode: mc };
}

const log = [];
const nameToSrc = {};
let unmapped = 0, skipped = 0;

for (const { dir, view } of DIRS) {
  const full2 = path.join(BASE, dir);
  for (const f of fs.readdirSync(full2)) {
    if (f.startsWith('IMG_') || f.startsWith('.')) continue;
    const ext = path.extname(f);
    if (!['.png', '.json'].includes(ext)) continue;
    const base = f.replace(/\.png$/, '').replace(/\.json$/, '');
    const p = base.split('_');
    const brand = p[0], series = p[1];
    const key = brand + '|' + series;
    const m = lookup[key];
    if (!m) { console.log('UNMAPPED', dir, f); unmapped++; continue; }
    const nn = `IMG_${m.brandCode}_${m.modelCode}_NA_${view}_NA_AUTO360_01`;
    const fkey = dir + '/' + nn + ext;
    if (nameToSrc[fkey]) { console.log('COLLISION', fkey, '<-', f, 'VS', nameToSrc[fkey]); }
    nameToSrc[fkey] = f;
    log.push({ dir, view, old: f, new: nn + ext, brand: m.brandCode, model: m.modelCode });
  }
}

if (unmapped > 0) { console.log(`\n⚠ 有 ${unmapped} 个文件未映射，请补全 BRAND_MAP/MODEL_MAP 后再执行`); process.exit(1); }
console.log('映射校验通过：无未映射、无碰撞。待重命名文件数(两视角合计):', log.length);

if (DRY) { console.log('[DRY-RUN] 未执行实际重命名'); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${BASE}_bak_${ts}`;
fs.cpSync(BASE, bak, { recursive: true });
console.log('已备份 ->', bak);

for (const { dir, view, old, new: nn } of log) {
  const full2 = path.join(BASE, dir);
  fs.renameSync(path.join(full2, old), path.join(full2, nn));
}
fs.writeFileSync('config/eu_ddgs_rename_log.json', JSON.stringify(log, null, 2));
console.log('Done. renamed', log.length, 'files');
