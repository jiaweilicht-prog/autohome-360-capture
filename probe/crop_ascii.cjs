// crop_ascii.cjs <png> <x> <y> <w> <h> [cols] —— 按图像像素裁剪并转 ASCII，用于确认局部是否有 UI 残留
const { PNG } = require('pngjs');
const fs = require('fs');
const [file, X, Y, W, H, COLS] = process.argv.slice(2);
const x0 = +X, y0 = +Y, w = +W, h = +H, cols = +(COLS || 60);
const png = PNG.sync.read(fs.readFileSync(file));
const { width: IW, height: IH, data } = png;
const L = (x, y) => { const i = (y * IW + x) * 4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
const cw = w / cols, rows = Math.max(1, Math.round(h / (cw * 2.1)));
const ch = h / rows;
const ramp = ' .:-=+*#%@';
let min = 255, max = 0;
const lines = [];
for (let r = 0; r < rows; r++) {
  let s = '';
  for (let c = 0; c < cols; c++) {
    let sum = 0, n = 0;
    for (let yy = Math.floor(y0 + r*ch); yy < Math.min(IH, y0 + (r+1)*ch); yy += 2)
      for (let xx = Math.floor(x0 + c*cw); xx < Math.min(IW, x0 + (c+1)*cw); xx += 2) { sum += L(xx, yy); n++; }
    const v = n ? sum / n : 0;
    min = Math.min(min, v); max = Math.max(max, v);
    s += ramp[Math.max(0, Math.min(9, Math.round(v / 255 * 9)))];
  }
  lines.push(s);
}
console.log(`区域 (${x0},${y0}) ${w}x${h}  亮度范围 ${min.toFixed(0)}~${max.toFixed(0)}  对比度 ${(max-min).toFixed(0)}`);
lines.forEach(l => console.log(l));
