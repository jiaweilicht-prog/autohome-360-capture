// 探测：给定 pano 列表，列出每个车的全部机位(scene title)，并判断是否含「副驾驶位/乘客」机位。
// 用法: node probe/probe_passenger_coverage.cjs --panos "id1,id2,..." [--out path.json]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1440, height: 714 };

const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }
const PANOS = (arg('--panos') || '').split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('--out');

function matchRole(title, role) {
  const t = String(title);
  if (role === 'driver') return t.includes('主驾') || t.includes('驾驶员') || (t.includes('驾驶') && !t.includes('副'));
  if (role === 'passenger') return t.includes('副驾') || t.includes('乘客');
  if (role === 'rear') return t.includes('后排') || t.includes('后座') || t.includes('第二排') || t.includes('二排');
  return false;
}

(async () => {
  if (!PANOS.length) { console.error('需要 --panos'); process.exit(1); }
  const browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  console.log('浏览器已启动');
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const results = [];
  for (const pano of PANOS) {
    const url = `https://pano.autohome.com.cn/car/pano/${pano}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('canvas', { timeout: 30000 });
      await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
      await page.waitForTimeout(3000);
      const scenes = await page.evaluate(() => {
        const k = document.getElementById('krpanoSWFObject');
        if (!k) return [];
        try { k.call('stopautorotate()'); } catch (e) {}
        const n = Number(k.get('scene.count'));
        const out = [];
        for (let i = 0; i < n; i++) out.push(String(k.get('scene[' + i + '].title') || k.get('scene[' + i + '].name') || ''));
        return out;
      });
      const passScenes = scenes.filter(t => matchRole(t, 'passenger'));
      results.push({ panoId: String(pano), sceneCount: scenes.length, hasPassenger: passScenes.length > 0, passengerScenes: passScenes, allTitles: scenes });
      console.log(`${pano}: 机位${scenes.length}个, 副驾机位=${passScenes.length ? '有(' + passScenes.join('/') + ')' : '无'}`);
    } catch (e) {
      results.push({ panoId: String(pano), error: String(e.message || e).slice(0, 120) });
      console.log(`${pano}: 失败 ${String(e.message || e).slice(0, 80)}`);
    }
  }
  await browser.close();
  const summary = results.filter(r => r.hasPassenger).length;
  console.log(`\n合计 ${results.length} 台，其中具备副驾驶位机位: ${summary} 台`);
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(results, null, 2)); console.log('已写入 ' + OUT); }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
