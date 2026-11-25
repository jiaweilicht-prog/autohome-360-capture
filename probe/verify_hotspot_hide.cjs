// 决定性验证：差分法。隐藏前 vs 隐藏后，只统计「前蓝、后不蓝」的像素 = 被箭头占用的像素。
const { chromium } = require('playwright-core');
const fs = require('fs');
const PNG = require('pngjs').PNG;

const PANO_URL = 'https://pano.autohome.com.cn/car/pano/76524';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WAIT_LOADSCENE = 12000;

function blueOf(buf) {
  const png = PNG.sync.read(buf);
  const { width: W, height: H, data } = png;
  const mask = new Uint8Array(W * H);
  let n = 0;
  for (let p = 0, q = 0; p < data.length; p += 4, q++) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (b > 140 && r < 120 && g > 70 && g < 230 && (b - r) > 60) { mask[q] = 1; n++; }
  }
  return { W, H, mask, n };
}
async function shot(page) { const c = await page.context().newCDPSession(page); const { data } = await c.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--disable-dev-shm-usage', '--window-size=2880,1620'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 2880, height: 1620 });
  page.setDefaultTimeout(60000);
  await page.goto(PANO_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'));
  await page.waitForTimeout(3000);
  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    const n = Number(k.get('scene.count')), out = [];
    for (let i = 0; i < n; i++) out.push({ name: k.get('scene[' + i + '].name'), title: k.get('scene[' + i + '].title') });
    return out;
  });
  const rear = scenes.find(s => /后排|二排|后座/.test(s.title)) || scenes[0];
  await page.evaluate((nm) => document.getElementById('krpanoSWFObject').call('loadscene(' + nm + ')'), rear.name);
  await page.waitForTimeout(WAIT_LOADSCENE);

  const before = await shot(page);
  const b = blueOf(before);

  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    const cnt = Number(k.get('hotspot.count'));
    for (let i = 0; i < cnt; i++) { const hs = k.get('hotspot[' + i + ']'); if (hs && hs.visible) k.set('hotspot[' + i + '].visible', false); }
  });
  await page.waitForTimeout(1500);
  const after = await shot(page);
  const a = blueOf(after);

  // 差分：前蓝、后不蓝
  let diff = 0; const xs = [];
  for (let p = 0; p < b.mask.length; p++) { if (b.mask[p] && !a.mask[p]) { diff++; if (xs.length < 6) xs.push(p % b.W + ',' + Math.floor(p / b.W)); } }
  console.log(`隐藏前蓝像素: ${b.n}   隐藏后蓝像素: ${a.n}`);
  console.log(`差分(前蓝后不蓝, 即被箭头占用的像素): ${diff}`);
  if (diff > 0) console.log('  这些像素坐标样例:', xs.join('  '));
  console.log(`\n结论: ${diff > 50 ? '✅ 箭头像素已被移除（隐藏生效）' : '⚠ 几乎无变化，隐藏可能无效'}`);
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
