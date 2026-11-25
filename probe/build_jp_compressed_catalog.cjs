// 生成《日系压缩车型目录》：在 218 个可采集造型基础上，套用欧系压缩规则
// （同动力形式只留代表 / 同平台同代际合并 / 性能版沿用则不单列 / 概念车·跑车·皮卡·停产老款单列 Special / 进口国产合并），
// 输出：config/jp_run_panos.json（main[]+special[]，run-p1 按 panoId 采集）
//       + docs/日系压缩车型目录.md + config/jp_compressed_catalog.csv
// 解析方式：条目以「车型中文名」从 jp_discovery_full.json 反查 panoId，避免手写错。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const DISC = path.join(ROOT, 'config', 'jp_discovery_full.json');
const OUT_JSON = path.join(ROOT, 'config', 'jp_run_panos.json');
const OUT_CSV = path.join(ROOT, 'config', 'jp_compressed_catalog.csv');
const OUT_MD = path.join(ROOT, 'docs', '日系压缩车型目录.md');

const disc = JSON.parse(fs.readFileSync(DISC, 'utf8'));
const byName = {};
for (const r of disc.results) byName[r.seriesName] = r;
function panoOf(name) {
  if (byName[name]) return byName[name].panoId;
  return null;
}
// 合并来源：返回 [{name, panoId}]
function merged(name, arr) {
  const list = [{ name, panoId: panoOf(name) }];
  for (const m of (arr || [])) list.push({ name: m, panoId: panoOf(m) });
  return list.filter(x => x.panoId !== null);
}

// ===== 主流量产（当前在售、设计语言独立） =====
const MAIN = [
  // 丰田
  { rep: '威驰', merge: ['威驰FS', 'YARiS L 致享', 'YARiS L 致炫'] },
  { rep: '卡罗拉', merge: ['雷凌', '卡罗拉双擎E+', '卡罗拉(进口)'] },
  { rep: '亚洲狮' },
  { rep: '卡罗拉锐放', merge: ['锋兰达'] },
  { rep: 'RAV4荣放', merge: ['威兰达', 'RAV4荣放双擎E+', '丰田RAV4(进口)'] },
  { rep: '丰田C-HR', merge: ['奕泽IZOA', '丰田C-HR EV', '奕泽E进擎'] },
  { rep: '铂智3X' },
  { rep: '铂智4X' },
  { rep: '广汽丰田bZ4X', merge: ['一汽丰田bZ4X', '丰田bZ(海外)'] },
  { rep: '凌放HARRIER', merge: ['威飒'] },
  { rep: '汉兰达', merge: ['皇冠陆放', '汉兰达(进口)'] },
  { rep: 'Grand Highlander' },
  { rep: '凯美瑞' },
  { rep: '亚洲龙' },
  { rep: '皇冠SportCross', merge: ['皇冠(进口)'] },
  { rep: '赛那SIENNA', merge: ['格瑞维亚'] },
  { rep: '埃尔法', merge: ['威尔法', '威尔法新能源'] },
  { rep: '普拉多', merge: ['普拉多(进口)'] },
  { rep: '兰德酷路泽(进口)' },
  { rep: '铂智7' },
  { rep: '丰田bZ5' },
  // 本田
  { rep: '飞度', merge: ['飞度(进口)', 'LIFE'] },
  { rep: '凌派', merge: ['享域'] },
  { rep: '思域', merge: ['思域(进口)', '型格'] },
  { rep: '英仕派', merge: ['英仕派新能源'] },
  { rep: '雅阁', merge: ['雅阁新能源'] },
  { rep: '缤智', merge: ['本田HR-V', '本田HR-V(海外)', '本田XR-V'] },
  { rep: 'ZR-V 致在' },
  { rep: '本田CR-V', merge: ['本田CR-V新能源', '皓影', '皓影新能源'] },
  { rep: '冠道', merge: ['本田UR-V'] },
  { rep: '奥德赛', merge: ['艾力绅'] },
  { rep: '猎光e:NS2' },
  { rep: '广汽本田P7' },
  { rep: '东风本田S7' },
  { rep: '东风本田GT' },
  { rep: '本田e:NS1', merge: ['e:NP1 极湃1', 'e:NP2 极湃2'] },
  // 日产
  { rep: '轩逸', merge: ['轩逸·纯电', 'Sentra'] },
  { rep: '骐达TIIDA' },
  { rep: '天籁', merge: ['Altima', '西玛', '西玛(海外)'] },
  { rep: '日产N6' },
  { rep: '日产N7' },
  { rep: '劲客', merge: ['劲客(海外)'] },
  { rep: '逍客' },
  { rep: '奇骏', merge: ['奇骏(进口)'] },
  { rep: '楼兰', merge: ['楼兰(海外)'] },
  { rep: '探陆', merge: ['探陆(海外)'] },
  { rep: '途达' },
  { rep: 'ARIYA艾睿雅' },
  { rep: '途乐' },
  { rep: '日产NX8' },
  // 马自达
  { rep: '马自达3 昂克赛拉' },
  { rep: '马自达CX-30', merge: ['马自达CX-30 EV'] },
  { rep: '马自达CX-5' },
  { rep: '马自达CX-50行也' },
  { rep: '马自达CX-90' },
  { rep: '马自达CX-8', merge: ['马自达CX-8(海外)'] },
  { rep: '马自达CX-3' },
  { rep: '马自达EZ-6' },
  { rep: '马自达EZ-60' },
  // 雷克萨斯
  { rep: '雷克萨斯ES' },
  { rep: '雷克萨斯LS' },
  { rep: '雷克萨斯NX', merge: ['雷克萨斯NX新能源'] },
  { rep: '雷克萨斯RZ' },
  { rep: '雷克萨斯GX' },
  { rep: '雷克萨斯RX', merge: ['雷克萨斯RX新能源'] },
  { rep: '雷克萨斯LX' },
  { rep: '雷克萨斯LM' },
  { rep: '雷克萨斯UX', merge: ['雷克萨斯UX新能源'] },
  { rep: '雷克萨斯LC' },
  // 英菲尼迪
  { rep: '英菲尼迪Q50', merge: ['英菲尼迪Q50L'] },
  { rep: '英菲尼迪QX50' },
  { rep: '英菲尼迪QX60', merge: ['英菲尼迪QX60(进口)'] },
  { rep: '英菲尼迪QX80' },
  { rep: '英菲尼迪QX55' },
  // 斯巴鲁
  { rep: '森林人' },
  { rep: '旭豹', merge: ['斯巴鲁XV'] },
  { rep: '傲虎' },
  { rep: 'SOLTERRA' },
  // 三菱
  { rep: '劲炫ASX' },
  { rep: '奕歌' },
  { rep: '欧蓝德' },
  { rep: '阿图柯AIRTREK' },
  { rep: '帕杰罗(进口)' },
  { rep: '帕杰罗·劲畅(进口)' },
  // 铃木
  { rep: '雨燕' },
  { rep: '奥拓' },
  { rep: '启悦' },
  { rep: '维特拉', merge: ['骁途'] },
  { rep: '吉姆尼(进口)' },
  { rep: '英格尼斯' },
  { rep: '北斗星' },
  // 五十铃（仅乘用SUV，商用车进 special）
  { rep: 'mu-X牧游侠' },
  // 讴歌
  { rep: '讴歌RDX', merge: ['讴歌RDX(进口)'] },
  { rep: '讴歌MDX' },
];

// ===== Special（性能/跑车/皮卡/商用车/已停产老款/经典） =====
const SPECIAL = [
  // 丰田
  { rep: 'SUPRA' }, { rep: '丰田86' }, { rep: 'GR YARIS' },
  { rep: '皇冠SPORT' }, { rep: '皇冠' }, { rep: 'Mirai' },
  { rep: '普锐斯新能源(海外)' }, { rep: '普瑞维亚' },
  { rep: 'Tacoma' }, { rep: '坦途' },
  // 本田
  { rep: '杰德' }, { rep: '思铂睿' }, { rep: 'Passport' }, { rep: 'Pilot' }, { rep: '锋范', merge: ['哥瑞', '竞瑞'] },
  // 日产
  { rep: '日产370Z' }, { rep: 'Titan' }, { rep: '纳瓦拉' },
  { rep: '锋坦Frontier Pro', merge: ['锋坦Frontier Pro PHEV'] },
  { rep: '日产NV200' }, { rep: '蓝鸟' }, { rep: '阳光', merge: ['阳光(海外)'] },
  { rep: '聆风' },
  // 马自达
  { rep: '马自达MX-5' }, { rep: '马自达RX-7' }, { rep: '马自达CX-4' }, { rep: '阿特兹' },
  // 雷克萨斯
  { rep: '雷克萨斯IS' }, { rep: '雷克萨斯RC' }, { rep: '雷克萨斯RC F' }, { rep: '雷克萨斯CT' }, { rep: '雷克萨斯GS' },
  // 英菲尼迪
  { rep: '英菲尼迪Q60' }, { rep: '英菲尼迪Q70' }, { rep: '英菲尼迪ESQ' }, { rep: '英菲尼迪QX30' }, { rep: '英菲尼迪QX70' },
  // 斯巴鲁
  { rep: '斯巴鲁WRX' }, { rep: '斯巴鲁BRZ' }, { rep: '翼豹' }, { rep: '力狮' },
  // 三菱
  { rep: '三菱L200' }, { rep: '翼神' },
  // 五十铃（商用车）
  { rep: 'D-MAX' }, { rep: '庆铃五十铃T30' }, { rep: 'TAGA达咖H' }, { rep: '庆铃五十铃T17' }, { rep: '翼放' }, { rep: 'RE-MAX 瑞迈' }, { rep: '铃拓' },
  // 讴歌
  { rep: '讴歌NSX' }, { rep: '讴歌TLX-L' }, { rep: '讴歌CDX' }, { rep: '讴歌ILX' }, { rep: '讴歌RLX' },
];

function build(list, type) {
  const out = [];
  const unresolved = [];
  list.forEach((e) => {
    if (EXCLUDE.has(e.rep)) return; // 用户范围剔除
    if (!byName[e.rep]) { unresolved.push(e.rep + ' (rep 未匹配)'); return; }
    const m = merged(e.rep, e.merge);
    if (!m.length) { unresolved.push(e.rep); return; }
    if (m.length !== 1 + (e.merge ? e.merge.length : 0)) {
      const got = m.map(x => x.name).join(',');
      unresolved.push(e.rep + ' (部分未匹配: ' + got + ')');
    }
    out.push({
      brandCn: byName[e.rep].brandCn,
      seriesName: e.rep,
      panoId: byName[e.rep].panoId,
      group: type === 'main' ? 'JP-MAIN' : 'JP-SPECIAL',
      mergedFrom: m.map(x => x.panoId),
    });
  });
  return { out, unresolved };
}
// 用户范围剔除：五十铃全部 / 铃木仅留吉姆尼 / 三菱仅留阿图柯AIRTREK（帕杰罗等随压缩结果去除）
const EXCLUDE = new Set([
  // 五十铃（全部商用车/SUV）
  'mu-X牧游侠', 'D-MAX', '庆铃五十铃T30', 'TAGA达咖H', '庆铃五十铃T17', '翼放', 'RE-MAX 瑞迈', '铃拓',
  // 铃木（仅留 吉姆尼(进口)）
  '雨燕', '奥拓', '启悦', '维特拉', '英格尼斯', '北斗星',
  // 三菱（仅留 阿图柯AIRTREK）
  '劲炫ASX', '奕歌', '欧蓝德', '帕杰罗(进口)', '帕杰罗·劲畅(进口)', '三菱L200', '翼神',
]);
const mainB = build(MAIN, 'main');
const specB = build(SPECIAL, 'special');
const allUnres = [...mainB.unresolved, ...specB.unresolved];
if (allUnres.length) { console.log('⚠ 未匹配车型：', allUnres.join(' | ')); }
console.log('MAIN 条目:', mainB.out.length, '| SPECIAL 条目:', specB.out.length);

const run = { main: mainB.out, special: specB.out };
fs.writeFileSync(OUT_JSON, JSON.stringify(run, null, 1));
console.log('写 ->', OUT_JSON);

// CSV
const csvHeader = 'type,brandCn,seriesName,panoId,mergedFrom\n';
const csvRows = [...mainB.out, ...specB.out].map(r => `${r.group},${r.brandCn},${r.seriesName},${r.panoId},"${r.mergedFrom.join('|')}"`).join('\n');
fs.writeFileSync(OUT_CSV, csvHeader + csvRows + '\n');

// MD 文档
function mdSection(title, list) {
  const byBrand = {};
  for (const r of list) (byBrand[r.brandCn] = byBrand[r.brandCn] || []).push(r);
  let s = `## ${title}（${list.length} 个对象）\n\n`;
  s += `| 品牌 | 车型（代表） | panoId | 合并来源 |\n|---|---|---|---|\n`;
  for (const [b, arr] of Object.entries(byBrand)) {
    for (const r of arr) s += `| ${b} | ${r.seriesName} | ${r.panoId} | ${r.mergedFrom.length > 1 ? r.mergedFrom.length + ' 个同源' : '—'} |\n`;
  }
  s += `\n`;
  return s;
}
let md = `# 日系压缩车型目录（360° 内饰 Benchmark）\n\n`;
md += `> 在 218 个可采集造型基础上，套用欧系压缩规则生成。当前在售主流 + 性能/跑车/皮卡/商用车/停产老款单列 Special。\n\n`;
md += `## 总览\n\n`;
md += `- 原始可采集造型：**218**\n`;
md += `- 压缩后对象：**MAIN ${mainB.out.length} + SPECIAL ${specB.out.length} = ${mainB.out.length + specB.out.length}**（含合并去重）\n`;
md += `- 采集视角：F1 主驾位前望 + R1 前舱正视（跑车/无后排机型仅 F1）\n\n`;
md += mdSection('MAIN 主流量产', mainB.out);
md += mdSection('SPECIAL 性能/跑车/皮卡/商用车/老款', specB.out);
fs.writeFileSync(OUT_MD, md);
console.log('写 ->', OUT_MD);
