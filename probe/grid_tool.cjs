// grid_tool.cjs — 标定辅助：参考图裁剪放大 + 候选网格拼接（修正逐行 stride）
//   crop:    node grid_tool.cjs crop --in a.jpg --out b.png --x 0 --y 0 --w 540 --h 545 --scale 1.6
//   compose: node grid_tool.cjs compose --dir probe/calib_door/pass2 --spec grid_spec.json --out grid.png
//
// spec.json: { "ref": "<jpg path>", "cols": [{"label":"v15","file":"..."}], "rows": [{"label":"off30"}] }
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

function arg(n) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; }
function readAny(p) {
  const buf = fs.readFileSync(p);
  if (/\.jpe?g$/i.test(p)) { const r = jpeg.decode(buf, { useTArray: true }); return { width: r.width, height: r.height, data: Buffer.from(r.data) }; }
  const r = PNG.sync.read(buf); return { width: r.width, height: r.height, data: r.data };
}
function scaleNN(img, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * img.height / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * img.width / w));
      const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
    }
  }
  return out;
}
function crop(img, x, y, w, h) {
  w = Math.min(w, img.width - x); h = Math.min(h, img.height - y);
  const out = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy++) {
    const srcStart = ((y + yy) * img.width + x) * 4;
    img.data.copy(out.data, (yy * w) * 4, srcStart, srcStart + w * 4);
  }
  return out;
}

const mode = process.argv[2];
if (mode === 'crop') {
  const img = readAny(arg('--in'));
  const c = crop(img, +arg('--x') || 0, +arg('--y') || 0, +arg('--w') || img.width, +arg('--h') || img.height);
  const s = +arg('--scale') || 1;
  const out = s !== 1 ? scaleNN(c, Math.round(c.width * s), Math.round(c.height * s)) : c;
  fs.writeFileSync(arg('--out'), PNG.sync.write(out));
  console.log(`裁剪 -> ${arg('--out')}  ${out.width}x${out.height}`);
} else if (mode === 'compose') {
  const dir = arg('--dir');
  const spec = JSON.parse(fs.readFileSync(arg('--spec'), 'utf8'));
  const ref = readAny(spec.ref);
  const CW = +arg('--cw') || 300;
  const CH = Math.round(CW / 2.017);
  const GAP = 8;
  const cols = spec.cols, rows = spec.rows;   // rows: [{label, files:[...]}]
  const W = GAP + (1 + cols.length) * (CW + GAP);
  const H = GAP + rows.length * (CH + GAP);
  const grid = new PNG({ width: W, height: H });
  for (let i = 0; i < grid.data.length; i += 4) { grid.data[i] = 250; grid.data[i + 1] = 250; grid.data[i + 2] = 250; grid.data[i + 3] = 255; }
  function blit(sc, x, y) {
    for (let yy = 0; yy < CH; yy++) sc.data.copy(grid.data, ((y + yy) * W + x) * 4, (yy * CW) * 4, (yy * CW + CW) * 4);
  }
  const refS = scaleNN(ref, CW, CH);
  rows.forEach((row, r) => {
    const y = GAP + r * (CH + GAP);
    blit(refS, GAP, y);                                   // 第一列恒为参考图，便于逐行对照
    (row.files || []).forEach((f, c) => {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) return;
      blit(scaleNN(readAny(p), CW, CH), GAP + (c + 1) * (CW + GAP), y);
    });
  });
  fs.writeFileSync(arg('--out'), PNG.sync.write(grid));
  console.log(`网格 -> ${arg('--out')} 列=参考图|${cols.join('|')}  行=${rows.map(r => r.label).join('/')}`);
} else if (mode === 'ab') {
  // 高清 A/B：参考图在上，候选在下，同宽并排，便于目视比对细节
  const ref = readAny(arg('--ref'));
  const cand = readAny(arg('--in'));
  const CW = +arg('--cw') || 1000;
  const refH = Math.round(CW * ref.height / ref.width);
  const candH = Math.round(CW * cand.height / cand.width);
  const GAP = 10;
  const H = GAP + refH + GAP + candH + GAP;
  const out = new PNG({ width: CW + GAP * 2, height: H });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255; }
  const rs = scaleNN(ref, CW, refH), cs = scaleNN(cand, CW, candH);
  for (let y = 0; y < refH; y++) rs.data.copy(out.data, ((GAP + y) * out.width + GAP) * 4, (y * CW) * 4, (y * CW + CW) * 4);
  for (let y = 0; y < candH; y++) cs.data.copy(out.data, ((GAP + refH + GAP + y) * out.width + GAP) * 4, (y * CW) * 4, (y * CW + CW) * 4);
  fs.writeFileSync(arg('--out'), PNG.sync.write(out));
  console.log(`A/B -> ${arg('--out')}  上=参考图 ${ref.width}x${ref.height}  下=候选`);
} else { console.error('用法: crop | compose | ab'); process.exit(1); }
