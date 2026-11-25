// render_door_v30f95.cjs — 渲染 V30/f95（h=57）整幅，并产出"右缘左移"候选裁切
// 目的：用户在尺寸网格里选了 V30/f95（门更正侧视、变形少），
//       但希望把右侧多余椅背切掉、只留座椅约1/3。裁剪是四边矩形，右缘可任意左移。
// 用法：node render_door_v30f95.cjs

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const OUT = path.join(ROOT, 'probe', 'calib_door', 'v30f95');
const PANO = '75117';
const SCENE = 'svrcn44445';
const H = 57, V = 30, FOV = 95;

// 四边裁剪（占整幅比例）。左/上/下固定，右缘变档（越小=椅背切越多）。
const FIX = { l: 0.08, t: 0.06, b: 0.96 };
const RIGHTS = [1.00, 0.90, 0.84, 0.78];
const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 1 });
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
  await page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: normH(H), vv: V, ff: FOV });
  await page.waitForTimeout(8000);
  await hide();
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const full = PNG.sync.read(Buffer.from(data, 'base64'));
  const W = full.width, Hh = full.height;
  fs.writeFileSync(path.join(OUT, 'full_v30f95.png'), PNG.sync.write(full));
  console.log('整幅 ->', W + 'x' + Hh);

  const crops = RIGHTS.map((r, idx) => {
    const x0 = Math.round(FIX.l * W), y0 = Math.round(FIX.t * Hh), x1 = Math.round(r * W), y1 = Math.round(FIX.b * Hh);
    const w = x1 - x0, hgt = y1 - y0;
    const out = new PNG({ width: w, height: hgt });
    for (let y = 0; y < hgt; y++) full.data.copy(out.data, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4);
    const label = `R${idx} 右缘${Math.round(r * 100)}% 尺寸${w}x${hgt} 比例${(w / hgt).toFixed(2)}:1`;
    console.log('  ' + label);
    fs.writeFileSync(path.join(OUT, `crop_R${idx}_r${Math.round(r * 100)}.png`), PNG.sync.write(out));
    return { r, img: out, label };
  });

  // 对照网格：4 个候选并排，上方标注各自右缘比例
  const CW = 480, GAP = 10;
  const CH = Math.round(CW / (crops[0].img.width / crops[0].img.height));
  const gridW = RIGHTS.length * CW + (RIGHTS.length + 1) * GAP;
  const gridH = CH + GAP * 2 + 26;
  const grid = new PNG({ width: gridW, height: gridH }); grid.data.fill(245);
  for (let i = 0; i < grid.data.length; i += 4) grid.data[i + 3] = 255;
  crops.forEach((c, idx) => {
    const x0 = GAP + idx * (CW + GAP), y0 = GAP + 26;
    const sc = new PNG({ width: CW, height: CH });
    for (let y = 0; y < CH; y++) { const sy = Math.min(c.img.height - 1, Math.floor(y * c.img.height / CH)); for (let x = 0; x < CW; x++) { const sx = Math.min(c.img.width - 1, Math.floor(x * c.img.width / CW)); const si = (sy * c.img.width + sx) * 4, di = (y * CW + x) * 4; sc.data[di] = c.img.data[si]; sc.data[di + 1] = c.img.data[si + 1]; sc.data[di + 2] = c.img.data[si + 2]; sc.data[di + 3] = 255; } }
    for (let y = 0; y < CH; y++) sc.data.copy(grid.data, ((y0 + y) * gridW + x0) * 4, y * CW * 4, (y * CW + CW) * 4);
    for (let y = GAP; y < GAP + 22; y++) for (let x = x0; x < x0 + CW; x++) { const i = (y * gridW + x) * 4; grid.data[i] = 50; grid.data[i + 1] = 50; grid.data[i + 2] = 50; grid.data[i + 3] = 255; }
  });
  fs.writeFileSync(path.join(OUT, 'right_edge_grid.png'), PNG.sync.write(grid));
  console.log('右缘对照 -> ' + path.join(OUT, 'right_edge_grid.png'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
