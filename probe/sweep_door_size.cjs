// sweep_door_size.cjs — 副驾门视角「近景尺寸」扫描
// 用户已认可视角（朝右看副驾门），但成品要更"近"：中控屏切在左缘、
// 门板占主体、座椅露一角、A柱+外后视镜在顶。核心变量 = fov（拉近程度）。
// h 与 fov 配对，使画面左缘始终切在中控屏上、右缘含完整门板。
// 用法：node sweep_door_size.cjs

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const REF = process.env.REF_IMG || require('path').join(__dirname, 'refs', 'door_size_ref.png');
const OUT = path.join(ROOT, 'probe', 'calib_door', 'size_sweep');

const VIEWPORT = { width: 1440, height: 714 };
const PANO = '75117';
const SCENE = 'svrcn44445';

// (h, fov) 配对：fov 越小越"近"
const COMBOS = [
  { h: 43, f: 60 },
  { h: 46, f: 68 },
  { h: 50, f: 78 },
  { h: 54, f: 88 },
  { h: 57, f: 95 },   // 当前标定值
];
const VS = [30, 34, 38];

const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;
fs.mkdirSync(OUT, { recursive: true });

function decodeRef() { const p = PNG.sync.read(fs.readFileSync(REF)); return { width: p.width, height: p.height, data: p.data }; }
function scaleTo(img, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) { const sy = Math.min(img.height - 1, Math.floor(y * img.height / h)); for (let x = 0; x < w; x++) { const sx = Math.min(img.width - 1, Math.floor(x * img.width / w)); const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4; out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255; } }
  return out;
}
function mseCenter(a, b, mX = 0.08, mT = 0.14, mB = 0.10) {
  const W = 160, H = 80; const A = scaleTo(a, W, H), B = scaleTo(b, W, H);
  const x0 = Math.floor(W * mX), x1 = Math.ceil(W * (1 - mX)), y0 = Math.floor(H * mT), y1 = Math.ceil(H * (1 - mB));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; const dr = A.data[i] - B.data[i], dg = A.data[i + 1] - B.data[i + 1], db = A.data[i + 2] - B.data[i + 2]; s += dr * dr + dg * dg + db * db; n++; }
  return s / (n * 3);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const hide = async () => {
    await page.evaluate(() => {
      const k = document.getElementById('krpanoSWFObject');
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
        if (k && (el === k || el.contains(k) || k.contains(el))) continue;
        if (el.querySelector && el.querySelector('canvas')) continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
        el.style.setProperty('display', 'none', 'important');
      }
    });
    await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); if (!k) return; const c = Number(k.get('hotspot.count')); for (let i = 0; i < c; i++) { const hs = k.get('hotspot[' + i + ']'); if (hs && hs.visible) k.set('hotspot[' + i + '].visible', false); } });
    await page.waitForTimeout(700);
  };

  await page.goto(`https://pano.autohome.com.cn/car/pano/${PANO}?_ahrotate=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); if (k) { k.call('stopautorotate()'); k.set('autorotate.enabled', false); } });
  await hide();
  await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), SCENE);
  await page.waitForTimeout(12000);
  await hide();

  const ref = decodeRef();
  const cands = [];
  for (const v of VS) {
    for (const c of COMBOS) {
      const h = normH(c.h);
      process.stdout.write(`  h=${h} v=${v} f=${c.f} ... `);
      await page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: h, vv: v, ff: c.f });
      await page.waitForTimeout(7500);
      await hide();
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const png = PNG.sync.read(Buffer.from(data, 'base64'));
      const img = { width: png.width, height: png.height, data: png.data };
      const err = mseCenter(img, ref);
      const fn = `h${h}_v${v}_f${c.f}.png`;
      fs.writeFileSync(path.join(OUT, fn), Buffer.from(data, 'base64'));
      cands.push({ h, v, f: c.f, mse: Math.round(err), file: fn });
      console.log('MSE', Math.round(err));
    }
  }

  // 网格：行=各 v，列=参考图 + 各 (h,fov)
  const CW = 380, CH = Math.round(CW / 2.063), GAP = 8;
  const cols = 1 + COMBOS.length, rows = VS.length;
  const W = cols * CW + (cols + 1) * GAP, H = rows * CH + (rows + 1) * GAP;
  const grid = new PNG({ width: W, height: H }); grid.data.fill(240);
  for (let i = 0; i < grid.data.length; i += 4) grid.data[i + 3] = 255;
  const refS = scaleTo(ref, CW, CH);
  for (let r = 0; r < rows; r++) {
    const y = GAP + r * (CH + GAP);
    for (let yy = 0; yy < CH; yy++) refS.data.copy(grid.data, ((y + yy) * W + GAP) * 4, (yy * CW) * 4, (yy * CW + CW) * 4);
    for (let c = 0; c < COMBOS.length; c++) {
      const cd = cands.find(x => x.v === VS[r] && x.f === COMBOS[c].f); if (!cd) continue;
      const p = PNG.sync.read(fs.readFileSync(path.join(OUT, cd.file)));
      const sc = scaleTo(p, CW, CH);
      const x = GAP + (c + 1) * (CW + GAP);
      for (let yy = 0; yy < CH; yy++) sc.data.copy(grid.data, ((y + yy) * W + x) * 4, (yy * CW) * 4, (yy * CW + CW) * 4);
    }
  }
  fs.writeFileSync(path.join(OUT, 'size_grid.png'), PNG.sync.write(grid));
  cands.sort((a, b) => a.mse - b.mse);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ ref: REF, cols: ['参考图', ...COMBOS.map(c => `h${c.h}/f${c.f}`)], rows: VS.map(v => 'v' + v), ranked: cands }, null, 2));
  console.log('\n=== MSE 排序 ===');
  cands.forEach((c, i) => console.log(`  ${i + 1}. h=${c.h} v=${c.v} f=${c.f}  MSE=${c.mse}`));
  console.log('网格 -> ' + path.join(OUT, 'size_grid.png'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
