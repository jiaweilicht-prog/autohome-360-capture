const fs = require('fs');
const d = require('../config/eu_discovery_full.json');
const found = d.results.filter(x => x.status === 'pano_found');
const bySeries = {};
for (const r of found) bySeries[r.seriesName] = r;

// 解析 pano：以 autohome 车系名为准，从 discovery 取权威 panoId
function resolve(series, label) {
  const rec = bySeries[series];
  if (!rec) { console.error('❌ 未找到全景:', series, '(' + label + ')'); process.exit(1); }
  return rec.panoId;
}

// ===== 主流批次 49 对象（按压缩规则 + 你的 5 项决定）=====
const MAIN = [
  // Mercedes
  ['Mercedes','G-Class','W463 II','2018–至今(2024改款)','ICE','奔驰G级',''],
  ['Mercedes','S-Class (当前W223)','W223','2020–至今(2025改款)','ICE','奔驰S级','⚠️ autohome仅此1代；W222老款无全景，需外部源'],
  ['Mercedes','E-Class','W214','2023–至今','ICE/HEV','奔驰E级','上代W213未单列'],
  ['Mercedes','EQS','EVA','2021–至今(2024改款)','EV','奔驰EQS',''],
  ['Mercedes','EQE SUV','EVA','2022–至今','EV','奔驰EQE SUV',''],
  // Land Rover
  ['Land Rover','Defender','L663','2020–至今','ICE','路虎卫士','90/110/130内饰同取1'],
  ['Land Rover','Range Rover','L460','2022–至今','ICE','揽胜','上代L405未单列'],
  ['Land Rover','Range Rover Sport','L461','2022–至今','ICE','揽胜运动',''],
  ['Land Rover','Velar','L560','2017–至今(2023改款)','ICE','揽胜星脉',''],
  // BMW
  ['BMW','X3','G45','2024–至今','ICE','宝马X3','上代G01未单列'],
  ['BMW','X5','G05','2018–至今(2023改款)','ICE','宝马X5',''],
  ['BMW','7 Series','G70','2022–至今','ICE/PHEV','宝马7系',''],
  ['BMW','iX','I20','2021–至今(2025改款)','EV','宝马iX',''],
  ['BMW','i7','G70 EV','2022–至今','EV','宝马i7','内饰独立设计'],
  ['BMW','Z4','G29','2018–至今','ICE','宝马Z4',''],
  // Audi
  ['Audi','A8','D5','2017–至今(2021改款)','ICE/PHEV','奥迪A8',''],
  ['Audi','Q8','MLB EVO','2018–至今(2023改款)','ICE','奥迪Q8',''],
  ['Audi','Q6 e-tron','PPE','2024–至今(国产长轴Q6L e-tron)','EV','奥迪Q6L e-tron','取国产长轴'],
  ['Audi','e-tron GT','J1','2020–至今(2024改款)','EV','奥迪e-tron GT',''],
  // Volvo
  ['Volvo','XC90','SPA(近EX90风)','2014–至今(2024改款)','ICE/PHEV','沃尔沃XC90',''],
  ['Volvo','EX90','SPA2','2024–至今','EV','沃尔沃EX90',''],
  ['Volvo','EX30','SEA','2023–至今','EV','沃尔沃EX30',''],
  ['Volvo','ES90','SPA2','2025–至今','EV','沃尔沃ES90',''],
  // Porsche
  ['Porsche','911','992(992.2)','2018–至今(2024改款)','ICE','保时捷911',''],
  ['Porsche','Taycan','J1','2019–至今(2024改款)','EV','Taycan',''],
  ['Porsche','Cayenne','E3','2018–至今(2023改款)','ICE/PHEV','Cayenne',''],
  ['Porsche','Macan (ICE)','MLB','2014–至今','ICE','Macan',''],
  ['Porsche','Macan (EV)','PPE','2024–至今','EV','Macan新能源','按你决定+1对象'],
  // Ferrari
  ['Ferrari','296','中置V6','2021–至今','ICE(PHEV)','法拉利296',''],
  ['Ferrari','Purosangue','前中置V12','2022–至今','ICE','Purosangue',''],
  ['Ferrari','Roma','前置V8','2020–至今(2024改款)','ICE','Roma',''],
  ['Ferrari','12Cilindri','前置V12','2024–至今','ICE','法拉利12Cilindri',''],
  // Lamborghini
  ['Lamborghini','Revuelto','炭纤单体V12混动','2023–至今','ICE(PHEV)','Revuelto',''],
  ['Lamborghini','Urus','MLB EVO','2018–至今','ICE/PHEV','Urus','按你决定按1计，Urus SE未单列'],
  ['Lamborghini','Huracán','中置V10','2014–2024','ICE','Huracán',''],
  // Bentley
  ['Bentley','Continental GT','MSB','第三代2018–至今(2024 Speed新内饰)','ICE(PHEV)','欧陆',''],
  ['Bentley','Bentayga','MLB','2015–至今(2024改款)','ICE/PHEV','添越',''],
  // Rolls-Royce
  ['Rolls-Royce','Phantom','铝合金空间架构','第八代2017–至今','ICE','幻影',''],
  ['Rolls-Royce','Ghost','同Phantom架构','第二代Series II 2020–至今(2025改款)','ICE','古思特',''],
  ['Rolls-Royce','Cullinan','同架构','2018–至今(2024 Series II)','ICE','库里南',''],
  ['Rolls-Royce','Spectre','纯电架构','2023–至今','EV','闪灵',''],
  // Peugeot
  ['Peugeot','3008','EMP2(第三代)','2023–至今','ICE/PHEV','标致3008',''],
  ['Peugeot','408','EMP2','2022–至今','ICE/PHEV','标致408','408X未单列'],
  ['Peugeot','508','EMP2','2018–至今(2020改款)','ICE/PHEV','标致508',''],
  // DS
  ['DS','DS 7','EMP2','2017–至今(2022改款)','ICE/PHEV','DS 7',''],
  ['DS','DS 9','EMP2','2020–至今','ICE/PHEV','DS 9',''],
  // Polestar
  ['Polestar','3','SPA2','2024–至今','EV','Polestar 3',''],
  ['Polestar','4','SEA','2024–至今','EV','Polestar 4',''],
  // Ineos
  ['Ineos','Grenadier','非承载梯架','2022–至今','ICE','英力士掷弹兵',''],
];

// ===== Special Case 批次 49 对象（规则-4：概念车/特殊车型/ exotic 品牌，单列）=====
const SPECIAL = [
  // 纯 exotic 品牌
  ['Aston Martin','DBX','EMP2-based','2020–至今','ICE','阿斯顿·马丁DBX','exotic'],
  ['Aston Martin','V8 Vantage','VH/新架构','2018–至今','ICE','V8 Vantage','exotic'],
  ['Aston Martin','DB12','新架构','2023–至今','ICE','阿斯顿·马丁DB12','exotic'],
  ['Aston Martin','Vanquish','新架构','2024–至今','ICE','Vanquish','exotic'],
  ['Aston Martin','DB11','VH','2016–至今','ICE','阿斯顿·马丁DB11','exotic'],
  ['Aston Martin','DBS','VH','2018–至今','ICE','阿斯顿·马丁DBS','exotic'],
  ['Bugatti','Divo','','2019(限量)','ICE','Divo','exotic'],
  ['Bugatti','Tourbillon','','2024–至今','ICE(PHEV)','Tourbillon','exotic'],
  ['Koenigsegg','Agera','','2010–2018','ICE','Agera','exotic'],
  ['LEVC','LX','','2023–至今','EV','LEVC LX','exotic'],
  ['LEVC','TX','','2018–至今','EV','LEVC TX','exotic'],
  ['McLaren','Artura',' McLaren Carbon','2021–至今','ICE(PHEV)','Artura','exotic'],
  ['McLaren','GT','','2019–至今','ICE','迈凯伦GT','exotic'],
  ['McLaren','540C','','2015–2019','ICE','迈凯伦540C','exotic'],
  ['McLaren','570','','2015–2021','ICE','迈凯伦570','exotic'],
  ['McLaren','600LT','','2018–2019','ICE','迈凯伦600LT','exotic'],
  ['McLaren','720S','','2017–2023','ICE','迈凯伦720S','exotic'],
  ['Morgan','Plus 6','','2019–至今','ICE','摩根Plus 6','exotic'],
  ['Lotus','EMEYA','EPA','2024–至今','EV','EMEYA','exotic'],
  ['Lotus','FOR ME','概念','2023(概念)','EV','FOR ME','exotic'],
  ['Lotus','ELETRE','EPA','2023–至今','EV','ELETRE','exotic'],
  ['Lotus','EMIRA','','2021–至今','ICE','EMIRA','exotic'],
  ['Lotus','Evora','','2008–2021','ICE','Evora','exotic'],
  // 主流品牌旗舰/限量 one-off
  ['Audi','TT','MQB','2014–2023','ICE','奥迪TT','flagship'],
  ['Audi','TTS','MQB','2014–2023','ICE','奥迪TTS','flagship'],
  ['Audi','R8','MSS','2015–2023','ICE','奥迪R8','flagship'],
  ['Audi','TT RS','MQB','2017–2023','ICE','奥迪TT RS','flagship'],
  ['Audi','RS e-tron GT','J1','2020–至今','EV','奥迪RS e-tron GT','flagship'],
  ['Mercedes','AMG GT','M178','2014–至今(2023换代)','ICE','AMG GT','flagship'],
  ['Mercedes','AMG GT (EV)','EVA','2023–至今','EV','AMG GT新能源','flagship'],
  ['Mercedes','Maybach S-Class','W223','2021–至今','ICE','迈巴赫S级','flagship'],
  ['Mercedes','Maybach S-Class PHEV','W223','2021–至今','ICE(PHEV)','迈巴赫S级新能源','flagship'],
  ['Mercedes','Maybach EQS SUV','EVA','2023–至今','EV','迈巴赫EQS SUV','flagship'],
  ['Mercedes','Maybach GLS','MHA','2020–至今','ICE','迈巴赫GLS','flagship'],
  ['BMW','i8','i8平台','2014–2020','ICE(PHEV)','宝马i8','flagship'],
  ['BMW','XM','CLAR','2022–至今','ICE(PHEV)','宝马XM','flagship'],
  ['BMW','M8','CLAR','2019–至今','ICE','宝马M8','flagship'],
  ['Porsche','718','982','2016–至今','ICE','保时捷718','flagship'],
  ['Porsche','918 Spyder','918平台','2013–2015','ICE(PHEV)','918 Spyder','flagship'],
  ['Bentley','Bacalar','','2020(限量12台)','ICE','Bacalar','flagship'],
  ['Bentley','Mulsanne','','2010–2020','ICE','慕尚','flagship'],
  ['Ferrari','F80','','2024–至今(限量)','ICE(PHEV)','法拉利F80','flagship'],
  ['Ferrari','849','','2024–至今','ICE','法拉利849','flagship'],
  ['Ferrari','SF90','','2019–至今','ICE(PHEV)','SF90','flagship'],
  ['Ferrari','GTC4Lusso','','2016–2020','ICE','GTC4Lusso','flagship'],
  ['Ferrari','Portofino','','2017–至今','ICE','Portofino','flagship'],
  ['Ferrari','812','','2017–2023','ICE','法拉利812','flagship'],
  ['Ferrari','F8','','2019–2023','ICE','法拉利F8','flagship'],
  ['Lamborghini','Aventador','','2011–2022','ICE','Aventador','flagship'],
];

function build(arr, batch) {
  return arr.map(([brand, model, gen, years, pow, series, note]) => ({
    brand, model, gen, years, powertrain: pow, autohomeSeries: series,
    panoId: resolve(series, model), note, batch
  }));
}
const main = build(MAIN, 'main');
const special = build(SPECIAL, 'special');
const all = [...main, ...special];

// 校验 pano 唯一性
const seen = new Set();
let dup = 0;
for (const r of all) { if (seen.has(r.panoId)) dup++; else seen.add(r.panoId); }

// 输出 CSV
let csv = 'batch,idx,brand,model,generation,years,powertrain,autohome_series,pano_id,note\n';
all.forEach((r, i) => { csv += [r.batch, i + 1, r.brand, r.model, r.gen, r.years, r.powertrain, r.autohomeSeries, r.panoId, r.note].map(x => `"${x}"`).join(',') + '\n'; });
fs.writeFileSync('config/eu_compressed_catalog.csv', csv);

// 输出运行清单（按 batch）
const runPano = { main: main.map(r => r.panoId), special: special.map(r => r.panoId) };
fs.writeFileSync('config/eu_run_panos.json', JSON.stringify(runPano, null, 2));

// 输出 Markdown
let md = '# 欧系压缩车型目录 · 定稿（年代版 v2）\n\n';
md += `> 在 v1 基础上应用你的 5 项决定：①S级补数据源（结果见下）②Q6 e-tron 取国产长轴 ③Macan +EV ④Urus 按1计 ⑤Special Case 单列一批。\n\n`;
md += '## 数据量定稿\n\n';
md += `| 批次 | 对象数 | 视角 | 出图 |\n|---|---|---|---|\n`;
md += `| 主流 Main | ${main.length} | F1+R1 | ${main.length * 2} |\n`;
md += `| 特殊 Special | ${special.length} | F1+R1 | ${special.length * 2} |\n`;
md += `| **合计** | **${all.length}** | — | **${all.length * 2}** |\n\n`;
md += `> 对比欧系全量 478 组，压缩至约 ${((all.length / 478) * 100).toFixed(1)}%。\n`;
md += `> ⚠️ **S级两代偏差**：autohome 仅 1 个 S级 全景（当前 W223 代，pano=75445），W222 老款在源站已下架、无法补。**主流实际 49 而非 50**；若后续接入外部 360 源补齐 W222，则 +1 对象/+2 图。\n\n`;
md += '## 逐车型映射\n\n';
for (const [title, list] of [['主流 Main', main], ['特殊 Special', special]]) {
  md += `### ${title}（${list.length}）\n\n`;
  md += `| # | 品牌 | 车型 | 代际/平台 | 年代 | 动力 | 汽车之家车系 | panoId | 备注 |\n|---|---|---|---|---|---|---|---|---|\n`;
  list.forEach((r, i) => { md += `| ${i + 1} | ${r.brand} | ${r.model} | ${r.gen} | ${r.years} | ${r.powertrain} | ${r.autohomeSeries} | ${r.panoId} | ${r.note || ''} |\n`; });
  md += '\n';
}
fs.writeFileSync('docs/欧系压缩车型目录_年代版.md', md);

console.log('主流对象:', main.length, '| 特殊对象:', special.length, '| 合计:', all.length, '| 出图:', all.length * 2);
console.log('pano 重复数:', dup, '(应为0)');
console.log('CSV: config/eu_compressed_catalog.csv');
console.log('运行清单: config/eu_run_panos.json');
console.log('文档: docs/欧系压缩车型目录_年代版.md');
