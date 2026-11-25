// 生成最终反馈报告：output/report_6car_test_v2.html
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const BV = path.join(ROOT, 'output', 'images_by_view');
const FOLDER_LABEL = { '主驾位前望': 'F1 主驾位前望', '前舱正视': 'R1 前舱正视' };
const ORDER = ['iCAR/iCAR V27', '日产/轩逸', 'smart/smart精灵#1', '高合汽车/高合HiPhi Y', '法拉利/Purosangue', '宝马/宝马Z4'];

const items = [];
for (const folder of Object.keys(FOLDER_LABEL)) {
  const dir = path.join(BV, folder);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const png = f.replace(/\.json$/, '.png');
    items.push({
      key: `${s.brand}/${s.series}`, folder, view: s.view_id,
      h: s.camera_state_actual.hlookat, v: s.camera_state_actual.vlookat, fov: s.camera_state_actual.fov,
      offset: s.driver_center_offset, sep: s.match_separation, ui: s.ui_hidden_at_capture,
      src: 'images_by_view/' + folder + '/' + png,
      kb: fs.existsSync(path.join(dir, png)) ? Math.round(fs.statSync(path.join(dir, png)).size / 1024) : 0,
      scene: s.scene_title,
    });
  }
}
let trs = '';
for (const key of ORDER) {
  const f1 = items.find(i => i.key === key && i.view === 'F1');
  const r1 = items.find(i => i.key === key && i.view === 'R1');
  const cell = (it) => it
    ? `h=${it.h} / v=${it.v} / f=${it.fov}<br><span class=dim>偏移+${it.offset}° ${it.sep == null ? '· 0°快速通道定车头' : '· 模板间距 ' + it.sep} · ${it.kb}KB</span>`
    : '<span class=bad>不可用（无后排机位）</span>';
  trs += `<tr><td><b>${key.split('/')[0]}</b> ${key.split('/')[1]}</td><td>${cell(f1)}</td><td>${cell(r1)}</td></tr>`;
}
let gal = '';
for (const key of ORDER) for (const it of items.filter(i => i.key === key)) {
  gal += `<figure><img src="${it.src}"><figcaption>${key} · ${FOLDER_LABEL[it.folder]}<br><span class=dim>h=${it.h} v=${it.v} 机位=${it.scene} ${it.ui ? '· UI已清' : '· ⚠UI未清'}</span></figcaption></figure>`;
}
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>六车型测试 · 修正与提速反馈报告</title>
<style>body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:28px;background:#0f1115;color:#e6e6e6;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;border-left:3px solid #f5a623;padding-left:10px;margin:26px 0 10px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{border:1px solid #2a2f3a;padding:8px 10px;text-align:left;vertical-align:top}th{background:#1a1f29}
.ok{color:#4cd964}.warn{color:#f5a623}.bad{color:#ff5f56;font-weight:600}.dim{color:#8b93a3;font-size:12px}
.note{background:#1a1f29;border-left:3px solid #6cb4ff;padding:12px 16px;margin:12px 0;font-size:13px}
.metric{display:flex;gap:20px;flex-wrap:wrap;margin:10px 0}.metric div{background:#1a1f29;padding:10px 18px;border-radius:8px;font-size:13px}.metric b{font-size:20px;display:block}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;margin-top:10px}
figure{margin:0;background:#1a1f29;border-radius:8px;padding:8px}img{width:100%;border-radius:4px;display:block}figcaption{font-size:12px;padding:8px 2px 2px;color:#cfd6e0}
</style></head><body>
<h1>六车型 F1/R1 测试 · 修正 + 归档 + 提速 反馈报告</h1>
<div class=dim>2026-09-08~09 · 汽车之家 360° 内饰 · 模型：后排定车头（0°快速通道 + 对称/亮带交叉校验），F1 = 车头 + 15°</div>

<div class=metric>
  <div><b>362s → 175s</b>单台耗时（提速 <b>2.1×</b>）</div>
  <div><b>2.1×</b>6 车：36分12秒 → 约 17.5 分（单机推算）</div>
  <div><b>11 / 12</b>张产出（Z4 无后排机位）</div>
  <div><b>3</b>处角度修正（含你报的 HiPhi Y）</div>
</div>

<h2>① HiPhi Y 二排「视角歪」——已修正（根因与证据）</h2>
<div class=note>
你反馈的 <code>高合汽车_高合HiPhi-Y_默认_二排正视前排_01.png</code> 确实是错的。<b>根因不是机位选错，而是车头方向被判错</b>：<br>
• 场景选择是对的（swgih28959 在 3 个后排候选中既最浅、对称度也最高）；<br>
• 但 A6L 模板把车头锁到了 <b>30°</b>，而实测对称度在 <b>0° 达 0.9525</b>、30° 仅 0.7639（差 0.19，明显偏轴）；<br>
• 用「上部亮带」破解对称度固有的 180° 歧义：0° 亮带 131、180° 仅 106（朝挡风玻璃才更亮）→ 真车头 = <b>0°</b>。<br>
<b>修正结果：R1 由 h30 → h0；F1 由 h45 → h15（F1 同样偏了 30°，一并修正）。</b><br>
管线性修复：扫描时<b>同一次渲染同时算「模板相似度 + 对称度 + 上部亮带」</b>（零额外渲染），当模板判决明显偏离对称峰值时自动改用「对称 + 亮带」定车头。该机制顺带发现并修正了 <b>smart 精灵#1</b>（车头 5°→0°，F1 h20→h15）。
</div>

<h2>② 目录已按视角统一归档</h2>
<div class=note>
新结构：<code>output/images_by_view/主驾位前望/</code> 与 <code>output/images_by_view/前舱正视/</code>（视角名按你的命名：主驾正视前排IP→主驾位前望，二排正视前排→前舱正视）。<br>
已迁移 <b>13 张</b>（6 台测试车 + IONIQ），文件名保留「品牌_车型」故仍可辨别具体车型；映射表 <code>output/migration_map.csv</code>。<br>
未迁移 19 张：它们是<b>旧锚定逻辑产物</b>（如奥迪Q7 F1 曾拍在 h142、宝马5系 h151，方向明显错误），混入新结构会污染资产库，故保留在 <code>output/images/</code> 原位，<b>建议全量重跑时直接覆盖替换</b>。<br>
<span class=warn>待你定</span>：文件名是否要改成 DDGS 八段式（<code>IMG_品牌_车型_代际_视角_子ID_来源_序号</code>）——代际码仍需你确认那份 GEN 映射表，改名前我不会自行动手。
</div>

<h2>③ 提速：实测与结论</h2>
<div class=note>
<b>有效手段（全部来自减少渲染/等待，不牺牲出图质量）：</b><br>
• <b>0° 快速通道</b>：实测 7/7 台车头都在 0°，先渲染 0° 与 180° 各一次，若 0° 对称度高且亮带更亮即采纳，<b>跳过整圈 360° 扫描（省 ~20 次渲染）</b>——6 台全部命中；<br>
• 驾驶位不再做任何扫描（F1 = 车头 +15° 确定性合成）；<br>
• 预览/扫描改用半分辨率截图 + 缩短等待（<b>最终出图仍是全分辨率 + 完整等待，清晰度不变</b>）。<br><br>
<b>无效手段（如实反馈）：并行分片。</b>3 分片实测 1900s vs 单机 2172s，仅快 12%，系统负载冲到 <b>56</b>，说明瓶颈是本机 CPU/渲染争抢；2 分片同样无增益。<b>结论：本机不适合靠并行提速，收益全部来自算法优化。</b><br>
<b>54 车全量推算：约 2 小时 40 分（原约 5 小时 26 分）。</b>
</div>

<h2>逐车最终结果</h2>
<table><tr><th>车型</th><th>F1 主驾位前望</th><th>R1 前舱正视</th></tr>${trs}</table>

<h2>仍需你目检 / 已知问题</h2>
<div class=note>
1. <b>宝马 Z4 无「后排」机位 → R1 拍不到</b>（双座跑车的数据现实）。其 F1 因无后排参考走驾驶位模板兜底，本次已修正为 h20（间距 110.7，已脱离低置信），仍建议目检。<br>
2. <b>HiPhi Y 两张都是新拍的</b>，请重点确认二排是否已正对前方、左右门是否平衡。<br>
3. 全部 11 张 <code>ui_hidden=true</code>；画面上的"汽车之家"字样是瓦片内嵌水印，不是没清屏。
</div>

<h2>样张</h2><div class=gal>${gal}</div>
</body></html>`;
fs.writeFileSync(path.join(ROOT, 'output', 'report_6car_test_v2.html'), html);
console.log('报告已生成: output/report_6car_test_v2.html，图片 ' + (gal.match(/<figure>/g) || []).length + ' 张');
