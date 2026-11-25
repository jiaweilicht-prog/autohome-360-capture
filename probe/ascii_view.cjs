// 把 PNG 降采样成字符灰度图 + 分块主色，用于在无法直接看图时判断构图
// 用法: node ascii_view.cjs <图片路径> [列数] [行数]
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const RAMP = ' .:-=+*#%@'; // 暗 -> 亮

function load(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

function lerp(a, b, t) { return a + (b - a) * t; }

// 双线性降采样到 cols x rows，返回亮度矩阵和平均 RGB 矩阵
function downsample(png, cols, rows) {
  const { width: W, height: H, data } = png;
  const lum = [], rgb = [];
  for (let ry = 0; ry < rows; ry++) {
    const lrow = [], crow = [];
    for (let rx = 0; rx < cols; rx++) {
      // 源区域
      const x0 = Math.floor((rx / cols) * W), x1 = Math.max(x0 + 1, Math.floor(((rx + 1) / cols) * W));
      const y0 = Math.floor((ry / rows) * H), y1 = Math.max(y0 + 1, Math.floor(((ry + 1) / rows) * H));
      let sr = 0, sg = 0, sb = 0, n = 0;
      const stepX = Math.max(1, Math.floor((x1 - x0) / 6));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 6));
      for (let y = y0; y < y1; y += stepY) {
        for (let x = x0; x < x1; x += stepX) {
          const i = (y * W + x) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
        }
      }
      const r = sr / n, g = sg / n, b = sb / n;
      lrow.push(0.299 * r + 0.587 * g + 0.114 * b);
      crow.push([Math.round(r), Math.round(g), Math.round(b)]);
    }
    lum.push(lrow); rgb.push(crow);
  }
  return { lum, rgb };
}

function render(lum, rgb) {
  // 归一化亮度以增强对比
  let min = 255, max = 0;
  for (const row of lum) for (const v of row) { if (v < min) min = v; if (v > max) max = v; }
  const span = Math.max(1, max - min);
  const lines = [];
  for (let y = 0; y < lum.length; y++) {
    let s = '';
    for (let x = 0; x < lum[y].length; x++) {
      const t = (lum[y][x] - min) / span;
      s += RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
    }
    lines.push(s);
  }
  return lines.join('\n');
}

// 3x3 分区主色，用于快速判断材质/明暗分布
function blocks(rgb) {
  const rows = rgb.length, cols = rgb[0].length;
  const out = [];
  for (let by = 0; by < 3; by++) {
    const line = [];
    for (let bx = 0; bx < 3; bx++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = Math.floor(by * rows / 3); y < Math.floor((by + 1) * rows / 3); y++) {
        for (let x = Math.floor(bx * cols / 3); x < Math.floor((bx + 1) * cols / 3); x++) {
          const c = rgb[y][x]; sr += c[0]; sg += c[1]; sb += c[2]; n++;
        }
      }
      line.push(`${Math.round(sr / n)},${Math.round(sg / n)},${Math.round(sb / n)}`);
    }
    out.push('  [' + line.join(' | ') + ']');
  }
  return out.join('\n');
}

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const colsArg = (process.argv.find(a => a.startsWith('--cols=')) || '--cols=78').split('=')[1];
const rowsArg = (process.argv.find(a => a.startsWith('--rows=')) || '--rows=30').split('=')[1];
const COLS = parseInt(colsArg, 10), ROWS = parseInt(rowsArg, 10);

for (const f of files) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) { console.log(`\n### ${f}  [不存在]`); continue; }
  const png = load(p);
  const { lum, rgb } = downsample(png, COLS, ROWS);
  console.log(`\n### ${path.basename(p)}  ${png.width}x${png.height}`);
  console.log(render(lum, rgb));
  console.log('分区主色 RGB (3x3):');
  console.log(blocks(rgb));
}
