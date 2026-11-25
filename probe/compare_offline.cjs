// compare_offline.cjs —— 离线比对 calib_sel 中已有的 V1 候选与参考图
// 不依赖浏览器：直接读 PNG，中心裁剪 MSE 排序，输出最佳 h/v/fov。
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const REF = 'probe/shots/截屏2026-09-03 下午11.28.07.png';
const DIR = 'probe/calib_sel';
// 与标定脚本打印一致：该 scene 默认视角
const DEF = { h: -1.77, v: 23.72, f: 95.00 };

const ref = PNG.sync.read(fs.readFileSync(REF));

function mseCenterCrop(a, b) {
  const cw = Math.floor(Math.min(a.width, b.width) * 0.70);
  const ch = Math.floor(Math.min(a.height, b.height) * 0.70);
  const x0 = Math.floor((a.width - cw) / 2), y0 = Math.floor((a.height - ch) / 2);
  let sum = 0, n = 0;
  for (let y = y0; y < y0 + ch; y++) {
    for (let x = x0; x < x0 + cw; x++) {
      const ia = (y * a.width + x) * 4, ib = (y * b.width + x) * 4;
      const dr = a.data[ia] - b.data[ib], dg = a.data[ia + 1] - b.data[ib + 1], db = a.data[ia + 2] - b.data[ib + 2];
      sum += dr * dr + dg * dg + db * db; n++;
    }
  }
  return sum / (n * 3);
}

const files = fs.readdirSync(DIR).filter(f => /^V1_h.*\.png$/.test(f));
const scored = [];
for (const f of files) {
  const m = f.match(/V1_h(-?\d+)_v(-?\d+)_f(\d+)/);
  if (!m) continue;
  const p = PNG.sync.read(fs.readFileSync(path.join(DIR, f)));
  scored.push({ h: +m[1], v: +m[2], fov: +m[3], file: f, mse: mseCenterCrop(p, ref) });
}
scored.sort((a, b) => a.mse - b.mse);

console.log(`候选数: ${scored.length}`);
console.log('=== V1 候选排序（MSE 越小越接近参考图）===');
scored.slice(0, 15).forEach((c, i) => console.log(`#${i + 1} h=${c.h} v=${c.v} fov=${c.fov} MSE=${c.mse.toFixed(1)}  ${c.file}`));

const best = scored[0];
const result = {
  panoId: 76524,
  driverSceneDefault: DEF,
  best: { h: best.h, v: best.v, fov: best.fov, mse: best.mse },
  offsetFromDefault: { dh: +(best.h - DEF.h).toFixed(2), dv: +(best.v - DEF.v).toFixed(2), dfov: +(best.fov - DEF.f).toFixed(2) },
  top: scored.slice(0, 15)
};
fs.writeFileSync(path.join(DIR, 'v1_result.json'), JSON.stringify(result, null, 2));
console.log('\n最佳 V1:', JSON.stringify(result.best), '偏移:', JSON.stringify(result.offsetFromDefault));
console.log('已写入', path.join(DIR, 'v1_result.json'));
