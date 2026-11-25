// gen_gradient.cjs — 根据 probe/calib_a6l/ 下已渲染的候选 PNG 生成渐变联系表 HTML
// 用法: node probe/gen_gradient.cjs
// 读取 result3.json 标记最佳候选，并把每个候选以相对 <img> 嵌入网格，供用户肉眼挑图。
const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..');
const DIR = path.join(ROOT, 'probe', 'calib_a6l');
const OUT_F1 = path.join(DIR, 'f1_gradient.html');
const OUT_R1 = path.join(DIR, 'r1_gradient.html');

const F1SET = new Set(); for (const f of [90,95]) for (const h of [-15,0,15,30]) for (const v of [10,15,20,25]) F1SET.add(`${h}_${v}_${f}`);
const R1SET = new Set(); for (const h of [-30,-15,0,15,30]) for (const v of [-15,-10,-5,0,5,10,15]) R1SET.add(`${h}_${v}_95`);
function listPngs(prefix) {
  const set = prefix === 'F1' ? F1SET : R1SET;
  return fs.readdirSync(DIR)
    .filter(f => f.startsWith(prefix + '_h') && f.endsWith('.png') && f !== prefix + '_best.png')
    .filter(f => { const p = parseName(f); return p && set.has(`${p.h}_${p.v}_${p.f}`); })
    .sort();
}

function parseName(f) {
  // F1_h15_v20_f95.png
  const m = f.match(/_h(-?\d+)_v(-?\d+)_f(\d+)\.png$/);
  return m ? { h: +m[1], v: +m[2], f: +m[3] } : null;
}

function buildHtml(title, prefix, best) {
  const files = listPngs(prefix);
  const cells = files.map(f => {
    const p = parseName(f);
    const sel = best && best.file === f ? ' style="outline:3px solid #f5a623;border-radius:6px"' : '';
    const bestTag = best && best.file === f ? '<div class="best">★ 选中</div>' : '';
    return `<div class="cell"${sel}>
      <img src="${f}" loading="lazy">
      <div class="lbl">h=${p.h} v=${p.v} f=${p.f}</div>
      ${bestTag}
    </div>`;
  }).join('\n');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:-apple-system,"PingFang SC",Segoe UI,sans-serif;margin:20px;background:#0f1115;color:#e6e6e6}
h1{font-size:18px}
.note{background:#161a22;border-left:3px solid #4a9eff;padding:10px 14px;margin:10px 0;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px}
.cell{background:#141821;border:1px solid #262c38;border-radius:8px;overflow:hidden}
.cell img{width:100%;display:block;background:#000}
.lbl{font-size:12px;padding:6px 8px;color:#9aa3b2;font-family:ui-monospace,Menlo,monospace}
.best{font-size:12px;padding:4px 8px;background:#5a4410;color:#f0b429}
</style></head><body>
<h1>${title}</h1>
<div class="note">每个格子是一组 (h, v, fov) 候选，由 <code>probe/calib_a6l_v2.cjs</code> 在 A6L(pano 76524) 上以长等待渲染。
<b>橙色描边 = 脚本按亮度剖面评分自动选中的候选</b>。请在浏览器中打开本页，挑出你认为构图最好的那个，告诉我其 h/v/fov，我再写回 <code>config/p1-calibration.json</code>。
<br>F1：目标是「推远 + 主驾门可见」——画面下方/两侧应能见到门板，IP 居中完整。
<br>R1：目标是从二排看前排——IP+方向盘应落在画面上 1/3，下方露出门+中央通道。</div>
<div class="grid">${cells}</div>
</body></html>`;
}

const result = JSON.parse(fs.readFileSync(path.join(DIR, 'result3.json'), 'utf8'));
fs.writeFileSync(OUT_F1, buildHtml('F1 候选渐变联系表（主驾正视前排 IP）', 'F1', result.F1));
fs.writeFileSync(OUT_R1, buildHtml('R1 候选渐变联系表（二排正视前排）', 'R1', result.R1));
console.log('生成:', OUT_F1);
console.log('生成:', OUT_R1);
console.log('F1 选中:', JSON.stringify(result.F1));
console.log('R1 选中:', JSON.stringify(result.R1));
