// 扫描截图里的"蓝色箭头"像素（箭头的 arrow-blue.png 是偏蓝图像素）
const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;

const targets = process.argv.slice(2);
function scan(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: W, height: H, data } = png;
  let blue = 0; const samples = [];
  let maxB = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 蓝箭头：蓝高、红低、绿中等（非纯白/纯青/纯黑）
      if (b > 140 && r < 120 && g > 70 && g < 230 && (b - r) > 60) {
        blue++;
        if (blue <= 8) samples.push(`${x},${y}(rgb ${r},${g},${b})`);
        if (b > maxB) maxB = b;
      }
    }
  }
  console.log(`\n${path.basename(file)}  (${W}x${H})`);
  console.log(`  蓝箭头候选像素: ${blue}  最大蓝值: ${maxB}`);
  if (blue > 0) console.log('  样例:', samples.join('  '));
  return blue;
}
let total = 0;
for (const t of targets) total += scan(t);
console.log(`\n合计蓝箭头候选像素: ${total}  ${total === 0 ? '✅ 已无蓝箭头' : '⚠ 仍有蓝色像素，需检查'}`);
