// 生成六车型 F1/R1 测试反馈报告 output/report_6car_test.html
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const IMG = path.join(ROOT, 'output', 'images');

// 每台车期望：F1+R1
const CARS = [
  { brand: 'iCAR', folder: 'iCAR', series: 'iCAR V27', seriesDir: 'iCAR-V27', pano: 74039, frontH: 0, sep: 1392.13 },
  { brand: '日产', folder: '日产', series: '轩逸', seriesDir: '轩逸', pano: 74682, frontH: 0, sep: 1668.52 },
  { brand: 'smart', folder: 'smart', series: 'smart精灵#1', seriesDir: 'smart精灵#1', pano: 78601, frontH: 5, sep: 255.03 },
  { brand: '高合汽车', folder: '高合汽车', series: '高合HiPhi Y', seriesDir: '高合HiPhi-Y', pano: 63837, frontH: 30, sep: 348.85 },
  { brand: '法拉利', folder: '法拉利', series: 'Purosangue', seriesDir: 'Purosangue', pano: 55680, frontH: 0, sep: 1479.28 },
  { brand: '宝马', folder: '宝马', series: '宝马Z4', seriesDir: '宝马Z4', pano: 61598, frontH: null, sep: 90.73 },
];
const VIEWS = [
  { id: 'F1', tag: '主驾正视前排IP' },
  { id: 'R1', tag: '二排正视前排' },
];

function loadSidecar(car, v) {
  const dir = path.join(IMG, car.folder, car.seriesDir, '默认');
  const base = `${car.brand}_${car.seriesDir}_默认_${v.tag}_01`;
  const png = path.join(dir, base + '.png');
  const js = path.join(dir, base + '.json');
  if (!fs.existsSync(png)) return null;
  const s = fs.existsSync(js) ? JSON.parse(fs.readFileSync(js, 'utf8')) : null;
  return { png, rel: path.relative(ROOT, png).split(path.sep).join('/'), s };
}

const rows = [];
for (const car of CARS) {
  const cells = [];
  for (const v of VIEWS) {
    const im = loadSidecar(car, v);
    if (!im) { cells.push({ view: v.id, miss: true, note: car.series === '宝马Z4' && v.id === 'R1' ? '无「后排」机位' : '缺失' }); continue; }
    const s = im.s;
    cells.push({
      view: v.id, miss: false,
      h: s.camera_state_actual.hlookat, vv: s.camera_state_actual.vlookat,
      scene: `${s.scene}(${s.scene_title})`, ui: s.ui_hidden_at_capture,
      sep: s.match_separation, offset: s.driver_center_offset, rel: im.rel, src: im.rel.replace(/^output\//, ''),
    });
  }
  rows.push({ car, cells });
}

let trs = '';
for (const r of rows) {
  const c = r.car;
  const f1 = r.cells.find(x => x.view === 'F1'), r1 = r.cells.find(x => x.view === 'R1');
  const f1Txt = f1.miss ? `<span class=bad>不可用</span>` : `h=${f1.h} / v=${f1.vv} / f95`;
  const r1Txt = r1.miss ? `<span class=bad>${r1.note}</span>` : `h=${r1.h} / v=${r1.vv} / f95`;
  const f1Sep = f1.miss ? '' : (f1.sep == null ? `<span class=ok>固定偏移 +15°（无扫描）</span>` : `<span class=warn>模板扫描 h=${f1.h} 间距 ${f1.sep}</span>`);
  const r1Sep = r1.miss ? '' : `间距 ${r1.sep}`;
  trs += `<tr>
    <td><b>${c.brand}</b><br>${c.series}<br><span class=dim>pano ${c.pano}</span></td>
    <td>${f1Txt}<br>${f1Sep}</td>
    <td>${r1Txt}<br>${r1Sep}</td>
  </tr>`;
}

// gallery
let gal = '';
for (const r of rows) {
  for (const cell of r.cells) {
    if (cell.miss) continue;
    gal += `<figure><img src="${cell.src}"><figcaption>${r.car.series} · ${cell.view}（${cell.view === 'F1' ? '主驾位前望' : '前舱正视'}）<br><span class=dim>h=${cell.h} v=${cell.vv} ${cell.ui ? 'UI已清' : '⚠UI'}</span></figcaption></figure>`;
  }
}

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>六车型 F1/R1 抓取测试反馈报告</title>
<style>
body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:28px;background:#0f1115;color:#e6e6e6;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;border-left:3px solid #f5a623;padding-left:10px;margin:28px 0 12px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:10px 0}th,td{border:1px solid #2a2f3a;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#1a1f29}.ok{color:#4cd964}.warn{color:#f5a623}.bad{color:#ff5f56;font-weight:600}
.dim{color:#8b93a3;font-size:12px}.note{background:#1a1f29;border-left:3px solid #6cb4ff;padding:12px 16px;margin:12px 0;font-size:13px}
.metric{display:flex;gap:24px;flex-wrap:wrap;margin:8px 0 4px}.metric div{background:#1a1f29;padding:10px 18px;border-radius:8px;font-size:14px}
.metric b{font-size:22px;display:block}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;margin-top:10px}
figure{margin:0;background:#1a1f29;border-radius:8px;padding:8px}
img{width:100%;border-radius:4px;display:block}figcaption{font-size:12px;padding:8px 2px 2px;color:#cfd6e0}
</style></head><body>
<h1>六车型 F1/R1 内饰全景抓取 · 测试反馈报告</h1>
<div class=dim>生成时间 2026-09-08 00:38 · 目标站点：汽车之家 360° 看车内饰 · 新标定模型：R1=后排扫描定车头，F1=车头+15° 确定性合成</div>
<div class=metric>
  <div><b>36 分 12 秒</b>总耗时（23:59:34 → 00:35:46，6 车）</div>
  <div><b>11 / 12</b>张产出（期望 6车×F1+R1）</div>
  <div><b>1</b>项视角不可用（宝马Z4 无后排机位）</div>
  <div><b>1</b>项低置信待复核（宝马Z4 F1）</div>
</div>

<h2>测试车定位（可辨别具体车型）</h2>
<div class=note>从汽车之家 7131 个车系中按名称精确匹配：<b>iCAR V27(2026)</b> · <b>日产 轩逸(2026)</b> · <b>smart 精灵#1(2025)</b> · <b>高合 HiPhi Y(2023)</b> · <b>法拉利 Purosangue</b> · <b>宝马 Z4(2023)</b>。全部有 360° 内饰全景。</div>

<h2>逐车结果</h2>
<table>
<tr><th>车型</th><th>F1 主驾位前望</th><th>R1 前舱正视</th></tr>
${trs}
</table>

<h2>问题与反馈</h2>
<div class=note>
<b>① 宝马 Z4：双座跑车，360° 全景没有「后排」机位 → R1 无法拍摄。</b>这是车型数据现实（非代码问题）。若你仍想要 Z4 的"二排前望"等效视角，可考虑：用 F1 之外的「后备厢」机位或其他机位降级，或放弃 R1。<br><br>
<b>② 宝马 Z4 F1：因无后排参考，走了驾驶位模板扫描兜底（h=20，间距 90.7 &lt; 100 → 低置信待复核）。</b>Z4 内饰与 A6L 较像（MSE 2265 为 6 车最低），h=20 大概率正确，但按规矩已记入 anchor_review 待你目检。<br><br>
<b>③ smart 精灵#1：后排间距 255（&gt;100 合格但弱于其他车）</b>，车头方向 h=5°，F1=h20。若目检发现偏差可单查。<br><br>
<b>④ 各车 0° 起点确实不同</b>：iCAR/轩逸/法拉利车头在 h=0，smart 在 h=5，高合HiPhi Y 在 h=30（F1=h45）→ 证明"每车扫一次后排定车头"不可省，新模型工作正常。<br><br>
<b>⑤ 全部 11 张 ui_hidden_at_capture=true</b>，画面中的"汽车之家"字样为瓦片内嵌水印，非未清屏。
</div>

<h2>样张</h2>
<div class=gal>${gal}</div>
</body></html>`;

fs.writeFileSync(path.join(ROOT, 'output', 'report_6car_test.html'), html);
console.log('报告已生成: output/report_6car_test.html  (图片 ' + 0 + ')');
// count images embedded
console.log('图片格数: ' + (gal.match(/<figure>/g) || []).length);
