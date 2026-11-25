// diag_2series_scenes.cjs — 渲染宝马2系全部后排场景在 h=0/v=15，比较哪个是中央机位
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'diag_2series');
fs.mkdirSync(OUT_DIR, { recursive: true });

const REF_FILE = path.join(ROOT, 'config', 'ref_profiles.json');
const { PNG } = require('pngjs');
const PROF_W = 32, PROF_H = 16;
function computeProfile(buf) {
  let png; try { png = PNG.sync.read(buf); } catch (e) { return null; }
  const { width: W, height: H, data } = png;
  const grid = new Array(PROF_W * PROF_H);
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

(async () => {
  const REF = JSON.parse(fs.readFileSync(REF_FILE, 'utf8'));
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  page.on('console', () => {});
  const panoId = 76465;
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
  const rears = scenes.filter(s => s.title.includes('后排'));
  console.log('后排场景:');
  rears.forEach((s, i) => console.log(`  ${i}: ${s.title} (${s.name})`));

  const gotoScene = (n) => page.evaluate((n) => { document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'); }, n);
  const setView = (h, v, f) => page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: h, vv: v, ff: f });
  const shot = async () => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); };

  const results = [];
  for (const s of rears) {
    await gotoScene(s.name); await page.waitForTimeout(10000);
    await setView(0, 15, 95); await page.waitForTimeout(4000);
    const buf = await shot();
    const prof = computeProfile(buf);
    const mse = profileMSE(prof, REF.rear);
    const fname = path.join(OUT_DIR, `rear_${s.name}.png`);
    fs.writeFileSync(fname, buf);
    results.push({ scene: s.name, title: s.title, mse: Math.round(mse), file: fname });
    console.log(`  ${s.title} (${s.name}): MSE=${Math.round(mse)} -> ${fname}`);
  }
  results.sort((a, b) => a.mse - b.mse);
  console.log('\n按 MSE 升序（越像 A6L R1 中央视角越好的）：');
  results.forEach(r => console.log(`  MSE ${r.mse.toString().padStart(5)}  ${r.title} (${r.scene})`));
  console.log(`\n推荐场景：${results[0].scene}（MSE=${results[0].mse}），已保存到 ${results[0].file}`);
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });