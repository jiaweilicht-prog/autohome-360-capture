// finalize_door_view.cjs — 基于已渲染的 V30/f95 整幅，产出"最终状态"样张
// 右缘采用用户选定的 R3 = 0.78（椅垫切掉约2/3），左缘给 3 档 IP 切位候选。
// 不再开浏览器，纯 pngjs 像素操作。

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = require('path').resolve(__dirname, '..');
const OUT = path.join(ROOT, 'probe', 'calib_door', 'v30f95');
const full = PNG.sync.read(fs.readFileSync(path.join(OUT, 'full_v30f95.png')));
const W = full.width, H = full.height;

// 四边比例：上/下固定，右缘固定 R3=0.78，左缘给候选
const T = 0.166, B = 0.645, R = 0.78;
const LEFTS = [
  { l: 0.34, label: 'L1 左缘34%  中控刚出、留屏-IP衔接段' },
  { l: 0.40, label: 'L2 左缘40%  中控已出、仅留IP衔接+副驾IP' },
  { l: 0.46, label: 'L3 左缘46%  更紧、IP留得少、门更多' },
];

// 画矩形描边
function stroke(img, x0, y0, x1, y1, rgb, thick = 3) {
  for (let t = 0; t < thick; t++) {
    for (let x = x0; x <= x1; x++) { setpx(img, x, y0 + t, rgb); setpx(img, x, y1 - t, rgb); }
    for (let y = y0; y <= y1; y++) { setpx(img, x0 + t, y, rgb); setpx(img, x1 - t, y, rgb); }
  }
}
function setpx(img, x, y, rgb) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
}
function vline(img, x, y0, y1, rgb, thick = 2) {
  for (let t = 0; t < thick; t++) for (let y = y0; y <= y1; y++) setpx(img, x + t, y, rgb);
}
function crop(img, l, t, r, b) {
  const x0 = Math.round(l * W), y0 = Math.round(t * H), x1 = Math.round(r * W), y1 = Math.round(b * H);
  const w = x1 - x0, h = y1 - y0;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) img.data.copy(out.data, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4);
  return out;
}
function scaleTo(img, CW) {
  const CH = Math.round(CW * img.height / img.width);
  const out = new PNG({ width: CW, height: CH });
  for (let y = 0; y < CH; y++) { const sy = Math.min(img.height - 1, Math.floor(y * img.height / CH)); for (let x = 0; x < CW; x++) { const sx = Math.min(img.width - 1, Math.floor(x * img.width / CW)); const si = (sy * img.width + sx) * 4, di = (y * CW + x) * 4; out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255; } }
  return out;
}

// 1) 整幅 + 最终框 + 左缘候选参考线
const boxFull = PNG.sync.read(fs.readFileSync(path.join(OUT, 'full_v30f95.png')));
const xR = Math.round(R * W), yT = Math.round(T * H), yB = Math.round(B * H);
stroke(boxFull, Math.round(0.40 * W), yT, xR, yB, [230, 50, 50], 4); // 红=最终框(默认L2)
vline(boxFull, Math.round(0.34 * W), yT, yB, [60, 120, 230], 2);      // 蓝=左缘候选L1
vline(boxFull, Math.round(0.46 * W), yT, yB, [60, 180, 90], 2);       // 绿=左缘候选L3
fs.writeFileSync(path.join(OUT, 'final_box_full.png'), PNG.sync.write(boxFull));

// 2) 三档左缘的最终裁切对照
const CW = 460, GAP = 10, LBLH = 30;
const cellH = Math.round(CW / (W * (R - 0.04) / (B - T) / H)); // 近似
const crops = LEFTS.map(o => ({ ...o, img: scaleTo(crop(full, o.l, T, R, B), CW) }));
const CH = crops[0].img.height;
const gridW = LEFTS.length * CW + (LEFTS.length + 1) * GAP;
const gridH = CH + LBLH + GAP * 2;
const grid = new PNG({ width: gridW, height: gridH }); grid.data.fill(245);
for (let i = 0; i < grid.data.length; i += 4) grid.data[i + 3] = 255;
crops.forEach((c, i) => {
  const x0 = GAP + i * (CW + GAP), y0 = GAP + LBLH;
  for (let y = 0; y < CH; y++) c.img.data.copy(grid.data, ((y0 + y) * gridW + x0) * 4, y * CW * 4, (y * CW + CW) * 4);
  for (let y = GAP; y < GAP + LBLH - 6; y++) for (let x = x0; x < x0 + CW; x++) { const k = (y * gridW + x) * 4; grid.data[k] = 40; grid.data[k + 1] = 40; grid.data[k + 2] = 40; grid.data[k + 3] = 255; }
});
fs.writeFileSync(path.join(OUT, 'final_ip_left_grid.png'), PNG.sync.write(grid));

// 3) 最终确认稿（默认 L2=0.08，R3=0.78）全分辨率
const final = crop(full, 0.40, T, R, B);
fs.writeFileSync(path.join(OUT, 'final_D1.png'), PNG.sync.write(final));
console.log('final_D1 size:', final.width + 'x' + final.height, '比例', (final.width / final.height).toFixed(2) + ':1');
console.log('输出:', path.join(OUT, 'final_box_full.png'), '| final_ip_left_grid.png | final_D1.png');
