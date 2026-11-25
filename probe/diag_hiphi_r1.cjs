// 诊断：高合 HiPhi Y (pano 63837) R1 二排视角为何歪。
// 两种可能：① 场景(相机位置)选错/偏位；② 车头方向 frontH 判错（模板弱匹配）。
// 做法：列出全部 scene；对每个「后排」候选在 h=30(当前判定的车头)渲染，算对称度 sym 与亮度 lum；
//       再对当前选中场景在 0~90 扫一圈，看对称峰值是否落在 30。
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
function meanLum(prof) { let s = 0; for (const v of prof) s += v; return Math.round(s / prof.length); }
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(PANOUR, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3000);
  const scenes = await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); try { k.call('stopautorotate()'); } catch (e) {} const n = Number(k.get('scene.count')); const o = []; for (let i = 0; i < n; i++) o.push({ name: String(k.get('scene[' + i + '].name')), title: String(k.get('scene[' + i + '].title') || '') }); return o; });
  console.log('全部 scenes:'); scenes.forEach(s => console.log('  ' + s.name + '  ' + s.title));
  const setView = async (h, v, f) => page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: h, vv: v, ff: f });
  const goto = async (n) => page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), n);
  const hidden = async () => page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); for (const el of Array.from(document.querySelectorAll('*'))) { const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'absolute') continue; if (k && (el === k || el.contains(k) || k.contains(el))) continue; if (el.querySelector && el.querySelector('canvas')) continue; if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue; const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue; el.style.setProperty('display', 'none', 'important'); } const c = Number(k.get('hotspot.count')); for (let i = 0; i < c; i++) { const h = k.get('hotspot[' + i + ']'); if (h && h.visible) k.set('hotspot[' + i + '].visible', false); } });
  const shot = async () => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); };
  const rear = scenes.filter(s => /后排|后座|第二排|二排/.test(s.title));
  console.log('\n后排候选: ' + rear.length);
  const rows = [];
  for (const s of rear) {
    await goto(s.name); await page.waitForTimeout(9000);
    await setView(30, 15, 95); await page.waitForTimeout(3500); await hidden();
    const g = computeProfile(await shot());
    rows.push({ scene: s.name, title: s.title, sym: symmetry(g), lum: meanLum(g) });
  }
  console.table(rows);
  const chosen = scenes.find(s => s.name === 'swgih28959') || rear[0];
  console.log('\n当前选中场景: ' + chosen.name + ' ' + chosen.title);
  await goto(chosen.name); await page.waitForTimeout(9000);
  const scan = [];
  for (const h of [0, 15, 30, 45, 60, 75, 90, -15, -30]) {
    await setView(h, 15, 95); await page.waitForTimeout(3000); await hidden();
    const g = computeProfile(await shot());
    scan.push({ h, sym: symmetry(g), lum: meanLum(g) });
  }
  console.log('\n选中场景角度扫描(对称度越高越正对前方):');
  console.table(scan);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
