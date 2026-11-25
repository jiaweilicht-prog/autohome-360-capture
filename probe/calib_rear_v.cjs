// calib_rear_v.cjs — 固定正对车头的 h，扫俯仰 v × 视野 fov，找「完整 IP + 部分门板」的取景
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'probe/calib_rear_v';
const PANO = Number(process.argv[2] || 76524);
const V_LIST = (process.argv[3] || '0,6,12,18,24,30').split(',').map(Number);
const FOV_LIST = (process.argv[4] || '95,105,115').split(',').map(Number);
const DH = Number(process.argv[5] || 0);   // 相对后排默认视角的水平偏移

fs.mkdirSync(OUT, { recursive: true });
const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

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
    const n = Number(k.get('scene.count'));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ name: String(k.get(`scene[${i}].name`)), title: String(k.get(`scene[${i}].title`) || '') });
    return out;
  });
  const rear = scenes.find(s => s.title.includes('后排'));
  if (!rear) { console.log('无后排机位'); await browser.close(); return; }
  await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), rear.name);
  await page.waitForTimeout(12000);
  const def = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')), f: Number(k.get('view.fov')) };
  });
  const h = normH(def.h + DH);
  console.log(`后排机位 ${rear.name} 默认 h=${def.h.toFixed(1)} → 采用 h=${h.toFixed(1)} (dh=${DH})`);

  for (const fov of FOV_LIST) {
    for (const v of V_LIST) {
      await page.evaluate(({ hh, vv, ff }) => {
        const k = document.getElementById('krpanoSWFObject');
        k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
      }, { hh: h, vv: v, ff: fov });
      await page.waitForTimeout(1700);
      await page.evaluate(() => {
        const b = document.querySelector('.hide-btn');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(350);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `v${v}_f${fov}.png`), Buffer.from(data, 'base64'));
      process.stdout.write(`  v${v}_f${fov} `);
    }
    console.log('');
  }
  await browser.close();
  console.log(`\n共 ${V_LIST.length * FOV_LIST.length} 张 -> ${OUT}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
