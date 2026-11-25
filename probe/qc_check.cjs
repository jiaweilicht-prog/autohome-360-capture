// qc_check.cjs — 批量构图体检：不看图，用分区亮度分布筛出「角度跑偏」的车
//
// 原理：三个视角各有稳定的明暗结构，偏离即异常。
//   V1 主驾前排IP：上部亮（挡风玻璃透光） > 中部（IP 通常最暗）
//   V2 主驾门IP交接：上部亮（门窗） > 下部
//   V3 副驾门板：上部亮（车窗） > 中部（门板）
// 另外检测「纯色/空白」（瓦片没加载完）与「过曝/过暗」。
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const IMG_DIR = 'output/images';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.png')) out.push(p);
  }
  return out;
}

// 返回 3x3 分区的平均亮度与平均 RGB
function analyze(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  const { width: W, height: H, data } = png;
  const grid = [];
  for (let by = 0; by < 3; by++) {
    const row = [];
    for (let bx = 0; bx < 3; bx++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      const y0 = Math.floor(by * H / 3), y1 = Math.floor((by + 1) * H / 3);
      const x0 = Math.floor(bx * W / 3), x1 = Math.floor((bx + 1) * W / 3);
      for (let y = y0; y < y1; y += 4) {
        for (let x = x0; x < x1; x += 4) {
          const i = (y * W + x) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
        }
      }
      row.push({ r: sr / n, g: sg / n, b: sb / n, lum: 0.299 * sr / n + 0.587 * sg / n + 0.114 * sb / n });
    }
    grid.push(row);
  }
  const rowLum = grid.map(r => r.reduce((a, c) => a + c.lum, 0) / 3);
  // 全图方差（检测纯色空白）
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    const i = (y * W + x) * 4;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += l; sum2 += l * l; n++;
  }
  const mean = sum / n, varr = sum2 / n - mean * mean;
  return { rowLum, std: Math.sqrt(Math.max(0, varr)), mean, grid, W, H };
}

const files = walk(IMG_DIR);
const rows = [];
for (const f of files) {
  const base = path.basename(f);
  let a;
  try { a = analyze(f); } catch (e) { rows.push({ file: f, flag: 'READ_FAIL', note: e.message }); continue; }
  const [top, mid, bot] = a.rowLum;
  const vid = /主驾前排IP/.test(base) ? 'V1' : /主驾门IP交接/.test(base) ? 'V2' : /副驾门板/.test(base) ? 'V3' : '?';
  const flags = [];
  if (a.std < 12) flags.push('疑似空白/瓦片未加载');
  if (a.mean < 28) flags.push('整体过暗');
  if (a.mean > 215) flags.push('整体过曝');
  if (vid === 'V1' && top - mid < 8) flags.push('V1结构异常:挡风玻璃未在上部');
  if (vid === 'V2' && top - bot < 8) flags.push('V2结构异常:门窗未在上部');
  if (vid === 'V3' && top - mid < 5) flags.push('V3结构异常:车窗未在上部');
  const parts = base.replace('.png', '').split('_');
  rows.push({
    brand: parts[0] || '', series: parts[1] || '', vid,
    degraded: /降级/.test(base),
    top: +top.toFixed(1), mid: +mid.toFixed(1), bot: +bot.toFixed(1),
    mean: +a.mean.toFixed(1), std: +a.std.toFixed(1),
    flag: flags.join('; '), file: f
  });
}

rows.sort((x, y) => (x.brand + x.series).localeCompare(y.brand + y.series, 'zh') || x.vid.localeCompare(y.vid));
const bad = rows.filter(r => r.flag);
console.log(`总计 ${rows.length} 张，异常 ${bad.length} 张\n`);
if (bad.length) {
  console.log('=== 异常明细 ===');
  for (const r of bad) console.log(`  [${r.vid}] ${r.brand}/${r.series}${r.degraded ? '(降级)' : ''}  上${r.top} 中${r.mid} 下${r.bot}  std${r.std}  → ${r.flag}`);
}
const byView = {};
for (const r of rows) (byView[r.vid] = byView[r.vid] || []).push(r);
console.log('\n=== 各视角亮度结构（上/中/下 均值）===');
for (const v of Object.keys(byView).sort()) {
  const g = byView[v];
  const t = g.reduce((a, c) => a + c.top, 0) / g.length;
  const m = g.reduce((a, c) => a + c.mid, 0) / g.length;
  const b = g.reduce((a, c) => a + c.bot, 0) / g.length;
  console.log(`  ${v}: 共 ${g.length} 张  上 ${t.toFixed(1)} / 中 ${m.toFixed(1)} / 下 ${b.toFixed(1)}`);
}
fs.writeFileSync('output/qc.json', JSON.stringify(rows, null, 2));
console.log('\n明细已写入 output/qc.json');
