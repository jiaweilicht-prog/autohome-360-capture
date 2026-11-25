/* pixel_compare.cjs · 对 7 车型各连拍 3 张做像素级比对，量化同机位一致性 */
const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;

const SHOTS = 'probe/shots';
const N = 7;

function diff(a, b) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let diffPix = 0, sum = 0;
  for (let i = 0; i < w * h; i++) {
    const ia = i * 4, ib = i * 4;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[ia + c] - b.data[ib + c]); sum += d; if (d > 30) diffPix++; }
  }
  const total = w * h;
  return { mad: +(sum / (total * 3)).toFixed(2), diffPixelPct: +(100 * diffPix / total).toFixed(3) };
}

const report = [];
for (let i = 0; i < N; i++) {
  const ps = [0, 1, 2].map(k => PNG.sync.read(fs.readFileSync(path.join(SHOTS, `car${i}_${k}.png`))));
  const p01 = diff(ps[0], ps[1]), p12 = diff(ps[1], ps[2]), p02 = diff(ps[0], ps[2]);
  const max = Math.max(p01.diffPixelPct, p12.diffPixelPct, p02.diffPixelPct);
  const verdict = max < 0.05 ? '稳定(可设高阈值)' : max < 1 ? '基本稳定(阈值需放宽)' : '抖动明显(需连拍取中位或降级)';
  report.push({ car: i, maxDiffPixelPct: max, pairs: { p01, p12, p02 }, verdict });
  console.log(`[car${i}] maxDiff=${max}%  MAD=${Math.max(p01.mad,p12.mad,p02.mad)}  -> ${verdict}`);
}
fs.writeFileSync('probe/pixel-results.json', JSON.stringify(report, null, 2));
console.log('done -> probe/pixel-results.json');
