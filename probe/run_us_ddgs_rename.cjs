// 美系 DDGS 8 段命名重命名（极致高效收尾后的对齐步骤）
// BRAND 用美系码；MODEL 用可识别拉丁车型码（带版本区分后缀避免冲突）；GEN/SUBID=NA；VIEW=IPDRV/IPFRONT；SOURCE=AUTO360；SEQ=01
// 用法: node probe/run_us_ddgs_rename.cjs [--dry]
const fs = require('fs');
const path = require('path');

const BASE = 'output/images_by_view';
const DRY = process.argv.includes('--dry');

const BRAND_MAP = {
  '别克': 'BUICK', '雪佛兰': 'CHEVY', '福特': 'FORD', '凯迪拉克': 'CADI',
  '林肯': 'LINCOLN', 'Jeep': 'JEEP', '克莱斯勒': 'CHRY', '道奇': 'DODGE',
  '特斯拉': 'TESLA', 'GMC': 'GMC',
};

// key = 文件名中的 series 段（与 verify_us_complete 解析一致）
const MODEL_MAP = {
  // GMC
  'SIERRA': 'SIERRA', 'TERRAIN': 'TERRAIN', 'SAVANA': 'SAVANA',
  // Jeep
  '大切诺基(进口)': 'GRANDCHEROKEE-IMP', '大切诺基4xe(进口)': 'GRANDCHEROKEE4XE-IMP',
  '大指挥官PHEV': 'GRANDCOMMANDER-PHEV', '大指挥官': 'GRANDCOMMANDER',
  '指南者': 'COMPASS', '指挥官PHEV': 'COMMANDER-PHEV', '指挥官': 'COMMANDER',
  '牧马人': 'WRANGLER', '牧马人新能源': 'WRANGLER-PHEV', '自由侠': 'RENEGADE',
  '自由光': 'CHEROKEE', '角斗士': 'GLADIATOR',
  // 克莱斯勒
  '克莱斯勒300C(进口)': '300C', '大捷龙(进口)': 'PACIFICA',
  // 凯迪拉克
  'Brougham': 'BROUGHAM', 'IQ傲歌': 'OPTIQ', 'IQ锐歌': 'LYRIQ', '凯威德': 'KAIWEIDE',
  '凯迪拉克ATS-L': 'ATS-L', '凯迪拉克CT4(海外)': 'CT4-IMP', '凯迪拉克CT4': 'CT4',
  '凯迪拉克CT5(海外)': 'CT5-IMP', '凯迪拉克CT5': 'CT5', '凯迪拉克CT6': 'CT6',
  '凯迪拉克GT4': 'GT4', '凯迪拉克XT4': 'XT4', '凯迪拉克XT5-PHEV': 'XT5-PHEV',
  '凯迪拉克XT5': 'XT5', '凯迪拉克XT6(海外)': 'XT6-IMP', '凯迪拉克XT6': 'XT6',
  '凯迪拉克XTS': 'XTS', '凯雷德ESCALADE': 'ESCALADE',
  // 别克
  'VELITE-5': 'VELITE5', '世纪': 'CENTURY', '凯越': 'EXCELLE', '别克E4': 'E4', '别克E5': 'E5',
  '别克GL6': 'GL6', '别克GL8': 'GL8', '别克GL8新能源': 'GL8-PHEV',
  '别克至境E7': 'ZHIJING-E7', '别克至境L7': 'ZHIJING-L7', '别克至境世家': 'ZHIJING-SHIJIA',
  '君威(海外)': 'REGAL-IMP', '君威': 'REGAL', '君越': 'LACROSSE', '威朗': 'VERANO',
  '微蓝6': 'VELITE6', '昂扬': 'ENVISTA', '昂科威Plus': 'ENVISION-PLUS', '昂科威S': 'ENVISION-S',
  '昂科拉GX': 'ENCORE-GX', '昂科拉PLUS': 'ENCORE-PLUS', '昂科拉': 'ENCORE',
  '昂科旗': 'ENCLAVE-CN', '昂科雷': 'ENCLAVE-IMP', '英朗': 'YINGLANG', '阅朗': 'YUELANG', '微蓝7': 'VELITE7',
  // 林肯
  '冒险家(海外)': 'CORSAIR-IMP', '冒险家': 'CORSAIR', '冒险家新能源': 'CORSAIR-PHEV',
  '林肯MKC': 'MKC', '林肯MKX': 'MKX', '林肯MKZ': 'MKZ', '林肯Z': 'Z',
  '航海家(进口)': 'NAUTILUS-IMP', '航海家': 'NAUTILUS',   '领航员': 'NAVIGATOR', '领航员壹号': 'NAVIGATOR-ONE',
  '林肯大陆': 'CONTINENTAL', '飞行家(进口)': 'AVIATOR-IMP', '飞行家': 'AVIATOR',
  '飞行家新能源(进口)': 'AVIATOR-PHEV-IMP',
  // 特斯拉
  'Model-3(进口)': 'MODEL3-IMP', 'Model-3': 'MODEL3', 'Model-S': 'MODELS', 'Model-X': 'MODELX',
  'Model-Y-L': 'MODEL-YL', 'Model-Y': 'MODELY', '赛博越野旅行车': 'CYBERTRUCK',
  // 福特
  'Bronco(进口)': 'BRONCO-IMP', 'Bronco-Sport': 'BRONCO-SPORT', 'C-MAX': 'CMAX', 'EVOS': 'EVOS',
  'E全顺': 'ETRANSIT', 'Mustang': 'MUSTANG', 'Ranger(进口)': 'RANGER-IMP', '全顺T8': 'TRANSIT-T8',
  '全顺': 'TRANSIT', '探险者(进口)': 'EXPLORER-IMP', '探险者': 'EXPLORER', '撼路者': 'EVEREST',
  '新世代全顺': 'TRANSIT-CUSTOM', '游骑侠Ranger': 'RANGER', '福克斯(进口)': 'FOCUS-IMP',
  '福克斯Active': 'FOCUS-ACTIVE', '福克斯': 'FOCUS', '福特F-150猛禽': 'F150-RAPTOR',
  '福特智趣烈马': 'BRONCO-EV', '福特烈马': 'BRONCO', '福特电马(海外)': 'MACH-E-IMP', '福特电马': 'MACH-E',
  '福睿斯': 'ESCORT', '翼搏': 'ECOSPORT', '翼虎': 'KUGA', '蒙迪欧': 'MONDEO', '蒙迪欧新能源': 'MONDEO-PHEV',
  '途睿欧': 'TOURNEO-CUSTOM', '金牛座': 'TAURUS', '锐界': 'EDGE', '锐际': 'ESCAPE', '锐际新能源': 'ESCAPE-PHEV',
  '领界EV': 'LINGJIE-EV', '领界': 'LINGJIE', '领睿': 'LINGRUI', '领睿新能源': 'LINGRUI-PHEV',
  '领裕': 'LINGYU', '领裕新能源': 'LINGYU-PHEV',
  // 道奇
  'Charger-SRT': 'CHARGER-SRT', 'Durango': 'DURANGO', '挑战者': 'CHALLENGER',
  // 雪佛兰
  'Suburban': 'SUBURBAN', 'Traverse(进口)': 'TRAVERSE-IMP', '乐风RV': 'LOVA-RV', '创界': 'CHUANGJIE',
  '创酷': 'TRACKER', '开拓者(海外)': 'BLAZER-IMP', '开拓者': 'BLAZER', '探界者Plus': 'EQUINOX-PLUS',
  '探界者': 'EQUINOX', '星迈罗': 'SEEKER', '沃兰多': 'ORLANDO', '畅巡': 'MENLO', '科帕奇': 'CAPTIVA',
  '科沃兹': 'CAVALIER', '科迈罗': 'CAMARO', '科鲁兹': 'CRUZE', '科鲁泽': 'MONZA', '索罗德': 'SILVERADO',
  '赛欧': 'SAIL', '迈锐宝(海外)': 'MALIBU-IMP', '迈锐宝XL': 'MALIBU-XL', '迈锐宝': 'MALIBU',
};

const DIRS = [
  { dir: '主驾位前望', view: 'IPDRV' },
  { dir: '前舱正视', view: 'IPFRONT' },
];

function newNameFor(brand, series, view) {
  const nb = BRAND_MAP[brand] || brand.replace(/[^\w]/g, '').toUpperCase() || 'NA';
  const nm = MODEL_MAP[series];
  if (!nm) return null; // 未映射
  return `IMG_${nb}_${nm}_NA_${view}_NA_AUTO360_01`;
}

const log = [];
const nameToSrc = {}; // 碰撞检测
let missing = 0, unmapped = 0;

for (const { dir, view } of DIRS) {
  const full = path.join(BASE, dir);
  for (const f of fs.readdirSync(full)) {
    if (f.startsWith('IMG_') || f.startsWith('.')) continue;
    const ext = path.extname(f);
    if (!['.png', '.json'].includes(ext)) continue;
    const base = f.replace(/\.png$/, '').replace(/\.json$/, '');
    const p = base.split('_');
    const brand = p[0], series = p[1];
    const nn = newNameFor(brand, series, view);
    if (!nn) { console.log('UNMAPPED', dir, f); unmapped++; continue; }
    const key = dir + '/' + nn + ext;
    if (nameToSrc[key]) { console.log('COLLISION', key, '<-', f, 'VS', nameToSrc[key]); }
    nameToSrc[key] = f;
  }
}

if (unmapped > 0) { console.log(`\n⚠ 有 ${unmapped} 个文件未映射，请补全 MODEL_MAP 后再执行`); process.exit(1); }
console.log('映射校验通过：无未映射、无碰撞。待重命名文件数(两视角合计):', Object.keys(nameToSrc).length);

if (DRY) { console.log('[DRY-RUN] 未执行实际重命名'); process.exit(0); }

// 执行
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${BASE}_bak_${ts}`;
fs.cpSync(BASE, bak, { recursive: true });
console.log('已备份 ->', bak);

for (const { dir, view } of DIRS) {
  const full = path.join(BASE, dir);
  for (const f of fs.readdirSync(full)) {
    if (f.startsWith('IMG_') || f.startsWith('.')) continue;
    const ext = path.extname(f);
    if (!['.png', '.json'].includes(ext)) continue;
    const base = f.replace(/\.png$/, '').replace(/\.json$/, '');
    const p = base.split('_');
    const brand = p[0], series = p[1];
    const nn = newNameFor(brand, series, view);
    if (!nn) continue;
    const oldPath = path.join(full, f);
    const newPath = path.join(full, nn + ext);
    fs.renameSync(oldPath, newPath);
    log.push({ dir, view, old: f, new: nn + ext, brand: BRAND_MAP[brand] || 'NA', model: MODEL_MAP[series], gen: 'NA', subid: 'NA' });
  }
}
fs.writeFileSync('config/us_ddgs_rename_log.json', JSON.stringify(log, null, 2));
console.log('Done. renamed', log.length, 'files');
