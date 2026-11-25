// verify_final.cjs — 校验定稿角复现结果是否等于用户指定的梯度页参考格子
const { PNG } = require('pngjs');
const fs = require('fs');

const GW = 200, GH = 100;   // 统一降采样网格，兼容尺寸差异
function grid(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  const { width: W, height: H, data } = png;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
  const out = new Float64Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = Math.min(W - 1, Math.floor((gx + 0.5) * W / GW));
    const y = Math.min(H - 1, Math.floor((gy + 0.5) * H / GH));
    out[gy * GW + gx] = L(x, y);
  }
  return out;
}
function mse(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; }

const OUT = 'output/images/奥迪/奥迪A6L/默认';
const REF = 'probe/calib_a6l';
const pairs = [
  ['图1 F1', `${OUT}/奥迪_奥迪A6L_默认_主驾正视前排IP_01.png`, `${REF}/F1_h15_v25_f95.png`],
  ['图2 R1', `${OUT}/奥迪_奥迪A6L_默认_二排正视前排_01.png`, `${REF}/R1_h0_v15_f95.png`],
];
console.log('定稿角复现校验（与用户指定的梯度页参考格子比对）\n');
for (const [tag, mine, ref] of pairs) {
  if (!fs.existsSync(mine)) { console.log(`${tag}: 缺新图 ${mine}`); continue; }
  if (!fs.existsSync(ref)) { console.log(`${tag}: 缺参考图 ${ref}`); continue; }
  const a = grid(mine), b = grid(ref);
  const m = mse(a, b);
  // 对照组：与本视角之外的参考图比，确认不是「随便一张都像」
  const cross = grid(tag.includes('F1') ? `${REF}/R1_h0_v15_f95.png` : `${REF}/F1_h15_v25_f95.png`);
  const mc = mse(a, cross);
  const verdict = m < 900 ? '✅ 高度一致（复现成功）' : (m < 2500 ? '⚠ 有偏差，需人工看样' : '❌ 不一致');
  console.log(`${tag}`);
  console.log(`  与指定参考格 MSE = ${m.toFixed(1)}   ${verdict}`);
  console.log(`  （对照：与另一视角参考 MSE = ${mc.toFixed(1)}）`);
  console.log('');
}
