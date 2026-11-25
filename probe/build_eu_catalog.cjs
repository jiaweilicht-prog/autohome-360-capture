// 由欧系 discovery 生成可读车型目录 docs/欧系可采集车型目录.md
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const DISC = path.join(ROOT, 'config', 'eu_discovery_full.json');
const OUT = path.join(ROOT, 'docs', '欧系可采集车型目录.md');

const COUNTRY = {
  '德国': ['奥迪','奥迪AUDI','大众','奔驰','宝马','保时捷','迈巴赫','smart','欧宝','沃克斯豪尔'],
  '英国': ['捷豹','路虎','MINI','阿斯顿·马丁','宾利','劳斯莱斯','路特斯','莲花跑车','迈凯伦','Caterham','摩根','拉共达','LEVC','英力士掷弹兵'],
  '法国': ['标致','雪铁龙','雷诺','DS','布加迪'],
  '意大利': ['菲亚特','法拉利','兰博基尼','玛莎拉蒂','阿尔法·罗密欧','蓝旗亚','帕加尼','Abarth','De Tomaso'],
  '瑞典': ['沃尔沃','萨博','科尼赛克','Polestar极星'],
  '捷克': ['斯柯达'],
  '西班牙': ['西雅特','Cupra'],
  '荷兰': ['世爵'],
  '罗马尼亚': ['达契亚'],
  '俄罗斯': ['拉达','GAZ'],
  '克罗地亚': ['锐马克'],
};
const cn2country = {};
for (const [c, bs] of Object.entries(COUNTRY)) for (const b of bs) cn2country[b] = c;

const d = JSON.parse(fs.readFileSync(DISC, 'utf8'));
const groups = d.results;
const byBrand = {};
for (const g of groups) (byBrand[g.brandCn] = byBrand[g.brandCn] || []).push(g);

const lines = [];
lines.push('# 欧系可采集车型目录（汽车之家 360° 内饰 F1/R1）\n');
lines.push(`> 生成时间：${d.generatedAt}　|　数据来源：汽车之家车系索引 + 360° 全景页`);
lines.push(`> 采集视角：主驾位前望（F1 / 主驾正视前排IP）+ 二排正视前排（R1 / 前舱正视）`);
lines.push(`> 筛选规则：欧系品牌车系共 1569 个 → 含 360° 全景 **${groups.length}** 个造型分组（按同全景去重）。\n`);

// 合计
const total = groups.length;
lines.push(`## 合计\n`);
lines.push(`- 可采集造型分组总数：**${total}**`);
const brandCnt = {};
for (const g of groups) brandCnt[g.brandCn] = (brandCnt[g.brandCn] || 0) + 1;
const countryCnt = {};
for (const [b, n] of Object.entries(brandCnt)) { const c = cn2country[b] || '其他'; countryCnt[c] = (countryCnt[c] || 0) + n; }
lines.push(`- 按国家：`, Object.entries(countryCnt).map(([c, n]) => `${c} ${n}`).join('　|　'));
lines.push(`- 按品牌数最多的几类：${Object.entries(brandCnt).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([b,n])=>`${b} ${n}`).join('　|　')} …\n`);

lines.push(`## 已采集情况（前序）\n`);
lines.push(`- **宝马**：前序「体系外对齐」已采集 5 台（7系/X3/X5/Z4/iX3），本轮目录含全量宝马 ${brandCnt['宝马']||0} 组，可对未覆盖的补齐。`);
lines.push(`- **smart**：前序已采集 1 台（精灵#1），本轮目录含 ${brandCnt['smart']||0} 组。`);
lines.push(`- 其余品牌均为首次纳入采集范围。\n`);

// 分国家列出
for (const [country, brands] of Object.entries(COUNTRY)) {
  const present = brands.filter(b => byBrand[b] && byBrand[b].length);
  if (!present.length) continue;
  let cSum = 0; for (const b of present) cSum += byBrand[b].length;
  lines.push(`## ${country}（${present.length} 品牌 / ${cSum} 组）\n`);
  for (const b of present) {
    const arr = byBrand[b];
    lines.push(`### ${b}　${arr.length} 组\n`);
    const names = arr.map(g => g.seriesName).sort();
    lines.push(names.join('、'));
    lines.push('');
  }
}
// 兜底：未在 COUNTRY 映射里的品牌
const orphan = Object.keys(byBrand).filter(b => !cn2country[b]);
if (orphan.length) {
  lines.push(`## 其他/未归类\n`);
  for (const b of orphan) { lines.push(`### ${b}　${byBrand[b].length} 组\n`); lines.push(byBrand[b].map(g=>g.seriesName).sort().join('、') + '\n'); }
}
fs.writeFileSync(OUT, lines.join('\n'));
console.log('写目录 ->', OUT, '字符数', fs.statSync(OUT).size);
