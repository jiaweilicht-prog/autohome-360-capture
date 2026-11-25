// render_door_full.cjs — 渲染副驾门视角「整幅 raw」并产出候选裁切对照
// 目的：把 Licht 的设计语言（座椅1/3 + 副驾IP + B柱小段 + A柱IP上约10cm）
//       翻译成固定像素矩形，先出图给用户指认，再固化到批量流程。
// 用法：node render_door_full.cjs

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const ANCHORS = path.join(ROOT, 'config', 'p1-anchors.json');
const OUT = path.join(ROOT, 'probe', 'calib_door', 'crop_candidates');

const VIEWPORT = { width: 1440, height: 714 };
const PANO = '75117';
const SCENE = 'svrcn44445';     // 参考图真实机位（已识别）
const OFF = 55, V = 34, FOV = 95;  // 已标定视角

// 候选裁切矩形（占整幅比例：l/t/r/b）
const CANDS = [
  { id: 'C1 宽(多IP+座椅)', l: 0.15, t: 0.05, r: 1.00, b: 0.97 },
  { id: 'C2 中(副驾IP+座椅1/3)', l: 0.27, t: 0.09, r: 1.00, b: 0.93 },
  { id: 'C3 窄(门为主+IP小条)', l: 0.40, t: 0.13, r: 1.00, b: 0.89 },
];

const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  await page.goto(`https://pano.autohome.com.cn/car/pano/${PANO}?_ahrotate=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); if (k) { k.call('stopautorotate()'); k.set('autorotate.enabled', false); } });

  // 清屏（沿用 run-p1 的强制隐藏逻辑）
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (k && (el === k || el.contains(k) || k.contains(el))) continue;
      if (el.querySelector && el.querySelector('canvas')) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      el.style.setProperty('display', 'none', 'important');
    }
  });
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (!k) return;
    const cnt = Number(k.get('hotspot.count'));
    for (let i = 0; i < cnt; i++) { const hs = k.get('hotspot[' + i + ']'); if (hs && hs.visible) k.set('hotspot[' + i + '].visible', false); }
  });
  await page.waitForTimeout(700);

  // 加载参考机位
  await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), SCENE);
  await page.waitForTimeout(12000);
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (k && (el === k || el.contains(k) || k.contains(el))) continue;
      if (el.querySelector && el.querySelector('canvas')) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      el.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForTimeout(700);

  const h = normH(OFF);
  await page.evaluate(({ hh, vv, ff }) => {
    const k = document.getElementById('krpanoSWFObject');
    k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
  }, { hh: h, vv: V, ff: FOV });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (k && (el === k || el.contains(k) || k.contains(el))) continue;
      if (el.querySelector && el.querySelector('canvas')) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      el.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForTimeout(700);

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const full = PNG.sync.read(Buffer.from(data, 'base64'));
  const W = full.width, H = full.height;
  fs.writeFileSync(path.join(OUT, 'full_raw.png'), PNG.sync.write(full));
  console.log('整幅 raw ->', path.join(OUT, 'full_raw.png'), W + 'x' + H);

  // ---- 1) 带裁切框的整幅图 ----
  const overlay = PNG.sync.read(Buffer.from(data, 'base64'));
  const colors = [[255, 80, 80], [80, 160, 255], [80, 200, 120]];
  CANDS.forEach((c, idx) => {
    const x0 = Math.round(c.l * W), y0 = Math.round(c.t * H);
    const x1 = Math.round(c.r * W), y1 = Math.round(c.b * H);
    const [R, G, B] = colors[idx];
    // 半透明填充
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
      const i = (y * W + x) * 4;
      overlay.data[i] = (overlay.data[i] + R) >> 1;
      overlay.data[i + 1] = (overlay.data[i + 1] + G) >> 1;
      overlay.data[i + 2] = (overlay.data[i + 2] + B) >> 1;
    }
    // 边框
    const draw = (x, y) => { const i = (y * W + x) * 4; overlay.data[i] = R; overlay.data[i + 1] = G; overlay.data[i + 2] = B; overlay.data[i + 3] = 255; };
    for (let x = x0; x <= x1; x++) { draw(x, y0); draw(x, y1); }
    for (let y = y0; y <= y1; y++) { draw(x0, y); draw(x1, y); }
    // 标签（左上角色块 + 文字位置标记）
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 60; x++) { const i = (y * W + x) * 4; overlay.data[i] = R; overlay.data[i + 1] = G; overlay.data[i + 2] = B; overlay.data[i + 3] = 255; }
    console.log(`  ${c.id}: 像素框 x[${x0}-${x1}] y[${y0}-${y1}]  尺寸 ${x1 - x0}x${y1 - y0}  比例 ${((x1 - x0) / (y1 - y0)).toFixed(2)}:1`);
  });
  fs.writeFileSync(path.join(OUT, 'full_with_boxes.png'), PNG.sync.write(overlay));
  console.log('带框整幅 ->', path.join(OUT, 'full_with_boxes.png'));

  // ---- 2) 三档裁切实品对照 ----
  const CW = 460, GAP = 10;
  const chs = CANDS.map(c => {
    const x0 = Math.round(c.l * W), y0 = Math.round(c.t * H), x1 = Math.round(c.r * W), y1 = Math.round(c.b * H);
    const w = x1 - x0, hgt = y1 - y0;
    const out = new PNG({ width: w, height: hgt });
    for (let y = 0; y < hgt; y++) full.data.copy(out.data, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4);
    return { id: c.id, img: out };
  });
  const CH = Math.round(CW / (chs[0].img.width / chs[0].img.height));
  const gridW = CANDS.length * CW + (CANDS.length + 1) * GAP;
  const gridH = CH + GAP * 2 + 24;
  const grid = new PNG({ width: gridW, height: gridH });
  grid.data.fill(245);
  for (let i = 0; i < grid.data.length; i += 4) grid.data[i + 3] = 255;
  chs.forEach((c, idx) => {
    const x0 = GAP + idx * (CW + GAP);
    const y0 = GAP + 24;
    const sw = CW, sh = CH;
    const sc = new PNG({ width: sw, height: sh });
    for (let y = 0; y < sh; y++) { const sy = Math.min(c.img.height - 1, Math.floor(y * c.img.height / sh)); for (let x = 0; x < sw; x++) { const sx = Math.min(c.img.width - 1, Math.floor(x * c.img.width / sw)); const si = (sy * c.img.width + sx) * 4, di = (y * sw + x) * 4; sc.data[di] = c.img.data[si]; sc.data[di + 1] = c.img.data[si + 1]; sc.data[di + 2] = c.img.data[si + 2]; sc.data[di + 3] = 255; } }
    for (let y = 0; y < sh; y++) sc.data.copy(grid.data, ((y0 + y) * gridW + x0) * 4, y * sw * 4, (y * sw + sw) * 4);
    // 标签条
    for (let y = GAP; y < GAP + 20; y++) for (let x = x0; x < x0 + CW; x++) { const i = (y * gridW + x) * 4; grid.data[i] = 60; grid.data[i + 1] = 60; grid.data[i + 2] = 60; grid.data[i + 3] = 255; }
  });
  fs.writeFileSync(path.join(OUT, 'crops_grid.png'), PNG.sync.write(grid));
  console.log('裁切对照 ->', path.join(OUT, 'crops_grid.png'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
