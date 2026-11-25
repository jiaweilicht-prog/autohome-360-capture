// calib_facing.cjs — 测试「如何自动判定后排机位的正前方向」
// 对同一后排机位拍 4 个朝向（前/后/左/右），比较多个判据，找出能区分正前与正后的特征。
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'probe/calib_facing';
const PANO = Number(process.argv[2] || 76524);
const V = Number(process.argv[3] || 2);
const FOV = Number(process.argv[4] || 95);

fs.mkdirSync(OUT, { recursive: true });
const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

function metrics(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  const { width: W, height: H, data } = png;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  // 1) 上部（20%~40% 高度）中最亮的一条水平线里，亮于阈值的连续段最大宽度占比
  let bestRun = 0;
  for (let y = Math.floor(H * 0.20); y < Math.floor(H * 0.42); y += 6) {
    const row = [];
    for (let x = 0; x < W; x += 4) row.push(L(x, y));
    const mx = Math.max(...row), mn = Math.min(...row);
    const thr = mn + (mx - mn) * 0.62;
    let run = 0, best = 0;
    for (const v of row) { if (v > thr) { run++; if (run > best) best = run; } else run = 0; }
    bestRun = Math.max(bestRun, best / row.length);
  }
  // 2) 上部 28% 平均亮度
  let s = 0, n = 0;
  for (let y = 0; y < Math.floor(H * 0.28); y += 3) for (let x = Math.floor(W * 0.1); x < Math.floor(W * 0.9); x += 3) { s += L(x, y); n++; }
  const topLum = s / n;
  // 3) 下部（45%~95%）镜像对称度
  let sum = 0, m = 0;
  for (let y = Math.floor(H * 0.45); y < Math.floor(H * 0.95); y += 3) for (let x = Math.floor(W * 0.08); x < Math.floor(W * 0.92); x += 3) {
    const dr = data[(y * W + x) * 4] - data[(y * W + (W - 1 - x)) * 4];
    const dg = data[(y * W + x) * 4 + 1] - data[(y * W + (W - 1 - x)) * 4 + 1];
    const db = data[(y * W + x) * 4 + 2] - data[(y * W + (W - 1 - x)) * 4 + 2];
    sum += dr * dr + dg * dg + db * db; m++;
  }
  return { brightRun: +bestRun.toFixed(3), topLum: +topLum.toFixed(1), mirror: +(sum / (m * 3)).toFixed(0) };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`https://pano.autohome.com.cn/car/pano/${PANO}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(11000);
  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    try { k.call('stopautorotate()'); } catch (e) {}
    try { k.set('autorotate.enabled', false); } catch (e) {}
    const n = Number(k.get('scene.count')); const out = [];
    for (let i = 0; i < n; i++) out.push({ name: String(k.get(`scene[${i}].name`)), title: String(k.get(`scene[${i}].title`) || '') });
    return out;
  });
  const rear = scenes.find(s => s.title.includes('后排'));
  await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), rear.name);
  await page.waitForTimeout(12000);
  const def = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')), f: Number(k.get('view.fov')) };
  });
  console.log(`后排 ${rear.name} 默认 h=${def.h.toFixed(1)}  v=${V} fov=${FOV}`);

  const out = [];
  for (const dh of [0, 90, 180, -90]) {
    const h = normH(def.h + dh);
    await page.evaluate(({ hh, vv, ff }) => {
      const k = document.getElementById('krpanoSWFObject');
      k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
    }, { hh: h, vv: V, ff: FOV });
    await page.waitForTimeout(1700);
    await page.evaluate(() => { const b = document.querySelector('.hide-btn'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); });
    await page.waitForTimeout(350);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fp = path.join(OUT, `dh${dh}.png`);
    fs.writeFileSync(fp, Buffer.from(data, 'base64'));
    const m = metrics(fp);
    out.push({ dh, ...m });
    console.log(`  dh=${dh}\t亮区宽度比=${m.brightRun}\t上部亮度=${m.topLum}\t对称度=${m.mirror}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'facing.json'), JSON.stringify({ pano: PANO, v: V, fov: FOV, def, out }, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
