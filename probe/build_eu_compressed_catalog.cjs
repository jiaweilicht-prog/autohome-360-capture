const fs = require('fs');
const d = require('../config/eu_discovery_full.json');
const found = d.results.filter(x => x.status === 'pano_found');
const bySeries = {};
for (const r of found) bySeries[r.seriesName] = r;

// 用户压缩清单（49 项） -> 代际/年代 + autohome 对应车系 + panoId
// collectible: 实际可采集对象数（W222/W223 因源站仅1全景合并为1）
const rows = [
  // Mercedes
  ['Mercedes','G-Class','W463 II','2018–至今(2024 改款)','ICE(含AMG)','奔驰G级','75965',''],
  ['Mercedes','W222 S-Class','W222','2013–2020(2017 中期改款)','ICE','奔驰S级','75445','与W223合并：源站仅1个S级全景，无法区分代际'],
  ['Mercedes','W223 S-Class','W223','2020–至今(2025 改款)','ICE','奔驰S级','75445','同上，合并为1个可采集对象'],
  ['Mercedes','E-Class','W214','2023–至今','ICE/HEV','奔驰E级','77140','当前代；上代W213(2016-2023)未单列'],
  ['Mercedes','EQS','EVA','2021–至今(2024 改款)','EV','奔驰EQS','74778',''],
  ['Mercedes','EQE SUV','EVA','2022–至今','EV','奔驰EQE SUV','75755',''],
  // Land Rover
  ['Land Rover','Defender','L663','2020–至今','ICE','路虎卫士','68954','90/110/130 内饰同，取1'],
  ['Land Rover','Range Rover','L460','2022–至今','ICE','揽胜','76565','上代L405(2012-2021)未单列'],
  ['Land Rover','Range Rover Sport','L461','2022–至今','ICE','揽胜运动','77014',''],
  ['Land Rover','Velar','L560','2017–至今(2023 改款)','ICE','揽胜星脉','73253',''],
  // BMW
  ['BMW','X3','G45','2024–至今','ICE','宝马X3','76409','上代G01(2017-2024)未单列'],
  ['BMW','X5','G05','2018–至今(2023 改款)','ICE','宝马X5','76453',''],
  ['BMW','7 Series','G70','2022–至今','ICE/PHEV','宝马7系','77455',''],
  ['BMW','iX','I20','2021–至今(2025 改款)','EV','宝马iX','63896',''],
  ['BMW','i7','G70 EV','2022–至今','EV','宝马i7','56703','内饰独立设计，保留'],
  ['BMW','Z4','G29','2018–至今','ICE','宝马Z4','61598',''],
  // Audi
  ['Audi','A8','D5','2017–至今(2021 改款)','ICE/PHEV','奥迪A8','73042',''],
  ['Audi','Q8','MLB EVO','2018–至今(2023 改款)','ICE','奥迪Q8','64630',''],
  ['Audi','Q6 e-tron','PPE','2024–至今(国产Q6L e-tron长轴)','EV','奥迪Q6L e-tron','77072','海外标轴Q6 e-tron(52176)未单列'],
  ['Audi','e-tron GT','J1','2020–至今(2024 改款)','EV','奥迪e-tron GT','63692',''],
  // Volvo
  ['Volvo','XC90','SPA(现款近EX90风)','2014–至今(2024 改款)','ICE/PHEV','沃尔沃XC90','75641',''],
  ['Volvo','EX90','SPA2','2024–至今','EV','沃尔沃EX90','70636',''],
  ['Volvo','EX30','SEA','2023–至今','EV','沃尔沃EX30','71736',''],
  ['Volvo','ES90','SPA2','2025–至今','EV','沃尔沃ES90','72073',''],
  // Porsche
  ['Porsche','911','992(992.2)','2018–至今(2024 改款)','ICE','保时捷911','75250',''],
  ['Porsche','Taycan','J1','2019–至今(2024 改款)','EV','Taycan','75241',''],
  ['Porsche','Cayenne','E3','2018–至今(2023 改款)','ICE/PHEV','Cayenne','75326',''],
  ['Porsche','Macan','MLB/新PPE EV','2014–至今(新EV 2024)','ICE/EV','Macan','73918','ICE与EV未单列，取1'],
  // Ferrari
  ['Ferrari','296','中置V6','2021–至今','ICE(PHEV)','法拉利296','72904',''],
  ['Ferrari','Purosangue','前中置V12','2022–至今','ICE','Purosangue','55680',''],
  ['Ferrari','Roma','前置V8','2020–至今(2024 改款)','ICE','Roma','61983',''],
  ['Ferrari','12Cilindri','前置V12','2024–至今','ICE','法拉利12Cilindri','68166','接替812'],
  // Lamborghini
  ['Lamborghini','Revuelto','炭纤单体V12混动','2023–至今','ICE(PHEV)','Revuelto','71829',''],
  ['Lamborghini','Urus','MLB EVO','2018–至今(2024 Urus SE改款)','ICE/PHEV','Urus','59871','Urus SE(77580)未单列'],
  ['Lamborghini','Huracán','中置V10','2014–2024(被Temerario接替)','ICE','Huracán','43460',''],
  // Bentley
  ['Bentley','Continental GT','MSB','第三代2018–至今(2024 Speed新内饰)','ICE(PHEV)','欧陆','64378',''],
  ['Bentley','Bentayga','MLB','2015–至今(2024 改款)','ICE/PHEV','添越','75088',''],
  // Rolls-Royce
  ['Rolls-Royce','Phantom','铝合金空间架构','第八代2017–至今','ICE','幻影','57074',''],
  ['Rolls-Royce','Ghost','同Phantom架构','第二代Series II 2020–至今(2025 改款)','ICE','古思特','70216',''],
  ['Rolls-Royce','Cullinan','同架构','2018–至今(2024 Series II)','ICE','库里南','61629',''],
  ['Rolls-Royce','Spectre','纯电架构','2023–至今','EV','闪灵','53557',''],
  // Peugeot
  ['Peugeot','3008','EMP2(第三代)','2023–至今','ICE/PHEV','标致3008','36493',''],
  ['Peugeot','408','EMP2','2022–至今','ICE/PHEV','标致408','73629','408X(69013)未单列'],
  ['Peugeot','508','EMP2','2018–至今(2020 改款)','ICE/PHEV','标致508','75900',''],
  // DS
  ['DS','DS 7','EMP2','2017–至今(2022 改款)','ICE/PHEV','DS 7','57732',''],
  ['DS','DS 9','EMP2','2020–至今','ICE/PHEV','DS 9','47030',''],
  // Polestar
  ['Polestar','3','SPA2','2024–至今','EV','Polestar 3','53318',''],
  ['Polestar','4','SEA','2024–至今','EV','Polestar 4','65829',''],
  // Ineos
  ['Ineos','Grenadier','非承载梯架','2022–至今','ICE','英力士掷弹兵','74665',''],
];

// 校验 + 去重统计
let missing = [], distinctPano = new Set(), warn = [];
for (const r of rows) {
  const [brand, model, gen, years, pow, series, pano, note] = r;
  const rec = bySeries[series];
  if (!rec) { missing.push(series); continue; }
  if (String(rec.panoId) !== String(pano)) warn.push(`${series}: 清单pano=${pano} vs discovery=${rec.panoId}`);
  distinctPano.add(pano);
}

const totalListed = rows.length;          // 用户清单 49
const collectible = distinctPano.size;     // 实际可采集 48（S级合并）
const images = collectible * 2;            // F1+R1

// ---- 输出 Markdown ----
let md = '# 欧系压缩车型目录 · 年代版（基于汽车之家 360° 全景）\n\n';
md += `> 依据用户压缩规则（动力形式/同平台/代际/进口国产/性能版）生成的第一版检索池，\n`;
md += `> 并与汽车之家真实 360° 全景数据源（config/eu_discovery_full.json，478 组有全景）做交叉核对。\n\n`;

md += '## 一、数据量重算\n\n';
md += `| 指标 | 数值 |\n|---|---|\n`;
md += `| 用户压缩清单条目 | **${totalListed}** |\n`;
md += `| 实际可采集对象（去重后 pano 数） | **${collectible}** |\n`;
md += `| 采集视角 | F1 主驾位前望 + R1 二排正视前排（每对象 2 张） |\n`;
md += `| **预计出图总量** | **${images} 张** |\n`;
md += `| 对比欧系全量 478 组 | 压缩至约 ${((collectible/478)*100).toFixed(1)}% |\n\n`;
md += `> ⚠️ 合并说明：用户清单中「W222 S-Class」与「W223 S-Class」在汽车之家仅对应 **1 个全景（奔驰S级 pano=75445）**，\n`;
md += `> 源站无法区分两代，按压缩规则只能取 1 个代表性对象，故 49 条 → 48 个可采集对象。\n\n`;

md += '## 二、逐车型映射表（含年代/代际）\n\n';
md += `| # | 品牌 | 车型(清单) | 代际/平台 | 年代 | 动力 | 汽车之家车系 | panoId | 备注 |\n`;
md += `|---|---|---|---|---|---|---|---|---|\n`;
rows.forEach((r, i) => {
  const [brand, model, gen, years, pow, series, pano, note] = r;
  md += `| ${i+1} | ${brand} | ${model} | ${gen} | ${years} | ${pow} | ${series} | ${pano} | ${note||''} |\n`;
});

md += '\n## 三、需你确认的歧义点（影响最终计数）\n\n';
md += '1. **奔驰 S级**：源站仅 1 个全景，W222/W223 无法区分。若坚持两代各采 1 张，需另补数据源（如已知某代 MY 的专属车系），否则按 1 个计（当前 48）。\n';
md += '2. **奥迪 Q6 e-tron**：取国产长轴 Q6L e-tron(77072)；若想要海外标轴版(52176)，需加 1 个对象（+2 图）。\n';
md += '3. **保时捷 Macan**：取 Macan(73918)，未区分 ICE/新 EV；若要 EV 版独立(75260)，+1 对象。\n';
md += '4. **兰博基尼 Urus**：取 Urus(59871)；Urus SE(77580, 插混改款) 内饰基本一致，按 1 个计。\n';
md += '5. **BMW X3 / 奔驰 E级**：取当前代（G45 / W214），上代未单列。\n';
md += '6. **Special Case（规则 -4）**：概念车/特殊车型未纳入本池。若需要可单列，源站可采集的候选含：迈巴赫系列(76960/74463/74923)、AMG GT(75658)、918 Spyder(17815)、Bacalar(43894)、法拉利F80(69226)/849(74649) 等。\n';

md += '\n## 四、校验结果\n\n';
md += missing.length ? `❌ 未匹配到全景的车系：${missing.join(', ')}\n` : '✅ 全部 49 条均匹配到汽车之家 360° 全景。\n';
md += warn.length ? `⚠️ panoId 不一致：${warn.join('; ')}\n` : '✅ panoId 与 discovery 完全一致。\n';

fs.writeFileSync('docs/欧系压缩车型目录_年代版.md', md);

// ---- 输出 CSV ----
let csv = 'idx,brand,model,generation,years,powertrain,autohome_series,pano_id,note\n';
rows.forEach((r, i) => { csv += [i+1, ...r].map(x=>`"${x}"`).join(',') + '\n'; });
fs.writeFileSync('config/eu_compressed_catalog.csv', csv);

console.log('用户清单:', totalListed, '| 可采集对象:', collectible, '| 预计出图:', images);
console.log('未匹配:', missing.length ? missing.join(',') : '无');
console.log('panoId 不一致:', warn.length ? warn.join('; ') : '无');
console.log('文档: docs/欧系压缩车型目录_年代版.md');
console.log('CSV: config/eu_compressed_catalog.csv');
