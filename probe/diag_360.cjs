// diag_360.cjs — 对指定 pano 的 driver/rear 场景做 360° 模板扫描，
// 打印每个方向的「模板 MSE + 亮度 frontScore」，帮助判定每台车「车头正前方」真实方位。
// 用法：node diag_360.cjs <panoId>
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs'), path = require('path');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const REF_FILE = path.join(ROOT, 'config', 'ref_profiles.json');
const PROF_W = 32, PROF_H = 16;

function computeProfile(buf) {
  let png; try { png = PNG.sync.read(buf); } catch (e) { return null; }
  const { width: W, height: H, data } = png;
  const grid = new Float64Array(PROF_W * PROF_H);
  const cw = Math.floor(W / PROF_W), ch = Math.floor(H / PROF_H);
  for (let gy = 0; gy < PROF_H; gy++) for (let gx = 0; gx < PROF_W; gx++) {
    let s = 0, n = 0;
    for (let y = gy * ch; y < (gy + 1) * ch; y++) for (let x = gx * cw; x < (gx + 1) * cw; x++) {
      const i = (y * W + x) * 4; s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++;
    }
    grid[gy * PROF_W + gx] = s / n;
  }
  return grid;
}
function profileMSE(a, b) { if (!a || !b) return 1e9; let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; }
function frontScore(buf) {
  let png; try { png = PNG.sync.read(buf); } catch (e) { return -1; }
  const { width: W, height: H, data } = png;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  let top = 0, tn = 0;
  for (let y = Math.floor(H * 0.10); y < Math.floor(H * 0.18); y += 2) for (let x = Math.floor(W * 0.25); x < Math.floor(W * 0.75); x += 3) { top += L(x, y); tn++; }
  let low = 0, ln = 0;
  for (let y = Math.floor(H * 0.55); y < Math.floor(H * 0.78); y += 2) for (let x = Math.floor(W * 0.30); x < Math.floor(W * 0.70); x += 3) { low += L(x, y); ln++; }
  return (top / tn) - (low / ln);
}
const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

(async () => {
  const panoId = process.argv[2];
  const REF = JSON.parse(fs.readFileSync(REF_FILE, 'utf8'));
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  page.on('console', () => {});
  await page.goto(`https://pano.autohome.com.cn/car/pano/${panoId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3000);

  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    const n = Number(k.get('scene.count')); const out = [];
    for (let i = 0; i < n; i++) out.push({ name: String(k.get('scene[' + i + '].name')), title: String(k.get('scene[' + i + '].title') || '') });
    return out;
  });
  const pick = (keys) => scenes.filter(s => keys.some(k => s.title.includes(k)));
  const driver = pick(['驾驶', '主驾', '驾驶员'])[0];
  const rear = pick(['后排', '后座', '第二排', '二排'])[0];
  console.log('pano', panoId, 'scenes:', scenes.map(s => s.title + '(' + s.name + ')').join(', '));

  const setView = (h, v, f) => page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: h, vv: v, ff: f });
  const gotoScene = (n) => page.evaluate((n) => { document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'); }, n);
  const shot = async () => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); };

  async function scan(scene, role, v) {
    if (!scene) { console.log(`  [${role}] 无 scene`); return; }
    await gotoScene(scene.name); await page.waitForTimeout(12000);
    const def = await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')) }; });
    console.log(`\n=== ${role} scene「${scene.title}」 default h=${def.h.toFixed(1)} v=${def.v.toFixed(1)} ===`);
    const ref = REF[role === 'driver' ? 'driver' : 'rear'];
    const rows = [];
    for (let a = 0; a < 360; a += 30) {
      await setView(a, v, 95); await page.waitForTimeout(3000);
      const buf = await shot();
      const mse = profileMSE(computeProfile(buf), ref);
      const fs_ = frontScore(buf);
      rows.push({ a, mse: Math.round(mse), fs: Math.round(fs_ * 10) / 10 });
    }
    rows.sort((x, y) => x.mse - y.mse);
    console.log('  按模板 MSE 升序（越小越像车头）：');
    console.log('  ' + rows.map(r => `${r.a}°(MSE${r.mse}/fs${r.fs})`).join('  '));
    console.log('  ★ 最优 3 方向:', rows.slice(0, 3).map(r => `${r.a}°`).join(' / '));
  }

  await scan(driver, 'driver', 25);
  await scan(rear, 'rear', 15);
  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('ERR', e); process.exit(1); });
