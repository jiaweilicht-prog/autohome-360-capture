// 定案：高合 HiPhi Y (pano 63837) 真车头方向到底是 0° 还是 180°（对称度有 180° 歧义）。
// 物理交叉验证：驾驶位相机在车身中心线左侧，其对称峰值应落在「真车头 +15°」。
// 因此：后排对称峰值候选 P（如 0 或 180）→ 驾驶位峰值应≈ P+15。吻合者即为真车头。
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANOID = 63837;
const PANOUR = `https://pano.autohome.com.cn/car/pano/${PANOID}?_ahrotate=1`;
const PROF_W = 32, PROF_H = 16;
function computeProfile(buf) {
  const png = PNG.sync.read(buf); const { width: W, height: H, data } = png;
  const g = new Array(PROF_W * PROF_H);
  const cw = Math.floor(W / PROF_W), ch = Math.floor(H / PROF_H);
  for (let gy = 0; gy < PROF_H; gy++) for (let gx = 0; gx < PROF_W; gx++) {
    let s = 0, n = 0;
    for (let y = gy * ch; y < (gy + 1) * ch; y++) for (let x = gx * cw; x < (gx + 1) * cw; x++) {
      const i = (y * W + x) * 4; s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++;
    }
    g[gy * PROF_W + gx] = s / n;
  }
  return g;
}
function symmetry(prof) {
  let num = 0, den = 0;
  for (let y = 0; y < PROF_H; y++) {
    const w = y < 9 ? 1.0 : 0.35;
    for (let x = 0; x < PROF_W / 2; x++) {
      const a = prof[y * PROF_W + x], b = prof[y * PROF_W + (PROF_W - 1 - x)];
      num += w * Math.abs(a - b); den += w * (Math.abs(a) + Math.abs(b) + 1e-6);
    }
  }
  return +(1 - num / den).toFixed(4);
}
// 上部亮带（挡风玻璃朝前时更亮）
function topBright(prof) { let s = 0, n = 0; for (let y = 0; y < 5; y++) for (let x = 0; x < PROF_W; x++) { s += prof[y * PROF_W + x]; n++; } return Math.round(s / n); }
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(PANOUR, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3000);
  const setView = async (h, v, f) => page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: h, vv: v, ff: f });
  const goto = async (n) => page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), n);
  const hidden = async () => page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); for (const el of Array.from(document.querySelectorAll('*'))) { const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'absolute') continue; if (k && (el === k || el.contains(k) || k.contains(el))) continue; if (el.querySelector && el.querySelector('canvas')) continue; if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue; const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue; el.style.setProperty('display', 'none', 'important'); } const c = Number(k.get('hotspot.count')); for (let i = 0; i < c; i++) { const h = k.get('hotspot[' + i + ']'); if (h && h.visible) k.set('hotspot[' + i + '].visible', false); } });
  const shot = async () => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); };
  const scan = async (sceneName, v, angles) => {
    await goto(sceneName); await page.waitForTimeout(10000);
    const rows = [];
    for (const h of angles) {
      await setView(h, v, 95); await page.waitForTimeout(3000); await hidden();
      const g = computeProfile(await shot());
      rows.push({ h, sym: symmetry(g), top: topBright(g) });
    }
    return rows;
  };
  const angles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];
  console.log('=== 后排场景 swgih28959 全 360 对称度扫描 (v=15) ===');
  const r1 = await scan('swgih28959', 15, angles);
  r1.sort((a, b) => b.sym - a.sym);
  console.table(r1.slice(0, 6));
  console.log('=== 驾驶位场景 swgih28958 全 360 对称度扫描 (v=25) ===');
  const f1 = await scan('swgih28958', 25, angles);
  f1.sort((a, b) => b.sym - a.sym);
  console.table(f1.slice(0, 6));
  console.log('\n判定：驾驶位峰值应 ≈ 真车头 +15°');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
