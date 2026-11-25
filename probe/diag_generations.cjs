// 诊断：同一全景内的多个「驾驶位/后排」机位，究竟是「同造型换配色」还是「不同造型（不同代际）」？
// 方法：对同角色的每个机位，在标准角渲染，取 32x16 灰度轮廓；
//   ① 原始亮度 lum（配色深浅）
//   ② 结构指纹 = 轮廓做 z-score 归一（减均值除标准差）→ 消掉明暗/配色差异，只留造型结构
//   ③ 两两比较结构指纹的 MSE：小 = 同造型（只是配色不同）；大 = 不同造型（不同代际/大改款）
// 这套「结构指纹 + 阈值聚类」就是要找的算法机制：大换代→各拍；小改款/换色→只拍最浅那台。
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
function lum(g) { let s = 0; for (const v of g) s += v; return s / g.length; }
function fingerprint(g) {                    // 结构指纹：消掉明暗，只留造型
  const m = lum(g);
  let sd = 0; for (const v of g) sd += (v - m) * (v - m);
  sd = Math.sqrt(sd / g.length) || 1e-6;
  return g.map(v => (v - m) / sd);
}
function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; }
const matchRole = (t, role) => {
  if (role === 'driver') return t.includes('主驾') || t.includes('驾驶员') || (t.includes('驾驶') && !t.includes('副'));
  if (role === 'rear') return t.includes('后排') || t.includes('后座') || t.includes('第二排') || t.includes('二排');
  return false;
};
const PANOS = [
  { id: 77455, name: '宝马7系' },
  { id: 74039, name: 'iCAR V27（已知有3个驾驶位机位）' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const setView = async (h, v, f) => page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: h, vv: v, ff: f });
  const goto = async (n) => page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), n);
  const hidden = async () => page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); for (const el of Array.from(document.querySelectorAll('*'))) { const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'absolute') continue; if (k && (el === k || el.contains(k) || k.contains(el))) continue; if (el.querySelector && el.querySelector('canvas')) continue; if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue; const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue; el.style.setProperty('display', 'none', 'important'); } const c = Number(k.get('hotspot.count')); for (let i = 0; i < c; i++) { const h = k.get('hotspot[' + i + ']'); if (h && h.visible) k.set('hotspot[' + i + '].visible', false); } });
  const shot = async () => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 714, scale: 0.5 } }); return Buffer.from(data, 'base64'); };

  for (const p of PANOS) {
    const url = `https://pano.autohome.com.cn/car/pano/${p.id}?_ahrotate=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
    await page.waitForTimeout(3000);
    const scenes = await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); try { k.call('stopautorotate()'); } catch (e) {} const n = Number(k.get('scene.count')); const o = []; for (let i = 0; i < n; i++) o.push({ name: String(k.get('scene[' + i + '].name')), title: String(k.get('scene[' + i + '].title') || '') }); return o; });
    console.log(`\n########## ${p.name} (pano ${p.id})  共 ${scenes.length} 个机位 ##########`);
    scenes.forEach(s => console.log('   ' + s.name + '  ' + s.title));
    for (const role of ['driver', 'rear']) {
      const list = scenes.filter(s => matchRole(s.title, role));
      console.log(`\n-- ${role} 机位 ${list.length} 个 --`);
      if (list.length < 1) continue;
      const data = [];
      for (const s of list) {
        await goto(s.name); await page.waitForTimeout(11000);
        const h = role === 'driver' ? 15 : 0;     // 标准角（车头 0 + 驾驶位偏移 15）
        await setView(h, role === 'driver' ? 25 : 15, 95);
        await page.waitForTimeout(4000); await hidden();
        const g = computeProfile(await shot());
        data.push({ name: s.name, title: s.title, g, fp: fingerprint(g), lum: Math.round(lum(g)) });
      }
      console.log('各机位亮度(配色深浅):');
      data.forEach(d => console.log(`   ${d.name} ${d.title}  lum=${d.lum}`));
      console.log('两两「结构指纹」距离（越大=造型差异越大）:');
      for (let i = 0; i < data.length; i++) for (let j = i + 1; j < data.length; j++) {
        const d = dist(data[i].fp, data[j].fp);
        console.log(`   ${data[i].name} vs ${data[j].name}: ${d.toFixed(3)}`);
      }
    }
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
