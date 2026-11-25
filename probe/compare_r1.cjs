// compare_r1.cjs — 判定 R1 两个候选（锚定 / -B 翻转）哪个才是「朝向车头」。
// 方法：与已确认的 F1（主驾看前排）做「行亮度剖面」比对。
// 两者都是看车厢前部 → 剖面应更相似（上亮下暗）；若某候选是看后窗，则剖面差异更大。
const { PNG } = require('pngjs');
const fs = require('fs');

const ROWS = 24;
function profile(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  const { width: W, height: H, data } = png;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
  const out = [];
  for (let b = 0; b < ROWS; b++) {
    const y0 = Math.floor(H * b / ROWS), y1 = Math.floor(H * (b + 1) / ROWS);
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 3) for (let x = 0; x < W; x += 6) { s += L(x, y); n++; }
    out.push(s / n);
  }
  return out;
}
function mse(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; }
function bar(v) { const n = Math.max(0, Math.min(20, Math.round(v / 12))); return '#'.repeat(n).padEnd(20, '.'); }

const base = 'output/images/奥迪/奥迪A6L/默认';
const files = {
  'F1(已确认前排)': `${base}/奥迪_奥迪A6L_默认_主驾正视前排IP_01.png`,
  'R1主(锚定)': `${base}/奥迪_奥迪A6L_默认_二排正视前排_01.png`,
  'R1-B(翻转)': `${base}/奥迪_奥迪A6L_默认_二排正视前排-B_01.png`,
};
const prof = {};
for (const [k, p] of Object.entries(files)) {
  if (!fs.existsSync(p)) { console.log(`缺失: ${p}`); continue; }
  prof[k] = profile(p);
}
const f1 = prof['F1(已确认前排)'];
console.log('行亮度剖面（上→下，# 越密越亮）\n');
const keys = Object.keys(prof);
console.log('band'.padEnd(6) + keys.map(k => k.padEnd(12)).join(''));
for (let i = 0; i < ROWS; i++) {
  console.log(String(i).padEnd(6) + keys.map(k => (bar(prof[k][i])).padEnd(12)).join(''));
}
console.log('\n与 F1 的行亮度剖面 MSE（越小=越像「看车头」）:');
for (const k of keys) if (k !== 'F1(已确认前排)') console.log(`  ${k}: ${mse(f1, prof[k]).toFixed(1)}`);
