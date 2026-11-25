// calib_rear.cjs — 标定「从后排看前排的正视图」机位
//
// 思路：正视图的判据是「左右镜像对称」——中控台居中、两侧座椅对称。
// 在后排 scene 上扫一圈 hlookat，逐帧计算左右翻转后的相似度，最对称的即正对车头方向。
// 相比靠像素匹配参考图，这个方法与具体车型无关，更客观。
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'probe/calib_rear';
const PANO = Number(process.argv[2] || 76524);     // 默认 A6L
const SCENE_HINT = process.argv[3] || '后排';
const FOV = Number(process.argv[4] || 100);
const H_STEP = 15;

fs.mkdirSync(OUT, { recursive: true });

// 左右镜像相似度：翻转后与原图比 MSE，越小越对称
function mirrorMSE(png) {
  const { width: W, height: H, data } = png;
  // 只取中间 80% 高度、中间 90% 宽度，避开边缘畸变与 UI 残留
  const x0 = Math.floor(W * 0.05), x1 = Math.floor(W * 0.95);
  const y0 = Math.floor(H * 0.10), y1 = Math.floor(H * 0.90);
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const ia = (y * W + x) * 4;
      const mx = W - 1 - x;
      const ib = (y * W + mx) * 4;
      const dr = data[ia] - data[ib];
      const dg = data[ia + 1] - data[ib + 1];
      const db = data[ia + 2] - data[ib + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
    }
  }
  return sum / (n * 3);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  console.log(`打开 pano ${PANO}...`);
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
  console.log('机位: ' + scenes.map(s => s.title).join(','));

  const rear = scenes.find(s => s.title.includes(SCENE_HINT));
  if (!rear) { console.log(`未找到「${SCENE_HINT}」机位`); await browser.close(); return; }

  await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), rear.name);
  await page.waitForTimeout(12000);
  const def = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')), f: Number(k.get('view.fov')) };
  });
  console.log(`后排机位 ${rear.name} 默认 h=${def.h.toFixed(1)} v=${def.v.toFixed(1)} fov=${def.f.toFixed(0)}`);

  const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;
  const results = [];
  console.log(`\n扫描 h（-180..180，步进 ${H_STEP}），fov=${FOV}，v=${def.v.toFixed(0)}`);

  for (let dh = -180; dh < 180; dh += H_STEP) {
    const h = normH(def.h + dh);
    await page.evaluate(({ hh, vv, ff }) => {
      const k = document.getElementById('krpanoSWFObject');
      k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
    }, { hh: h, vv: def.v, ff: FOV });
    await page.waitForTimeout(1700);
    await page.evaluate(() => {
      const b = document.querySelector('.hide-btn');
      if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(350);

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    const fname = `h${dh >= 0 ? '+' : ''}${dh}_v${Math.round(def.v)}.png`;
    const fpath = path.join(OUT, fname);
    fs.writeFileSync(fpath, buf);
    const mse = mirrorMSE(PNG.sync.read(buf));
    results.push({ dh, h: +h.toFixed(1), mse: +mse.toFixed(0), file: fname });
    process.stdout.write(`  dh=${dh} 对称度=${mse.toFixed(0)}\n`);
  }
  await browser.close();

  results.sort((a, b) => a.mse - b.mse);
  console.log('\n=== 最对称的 8 个方向（MSE 越小越正对车头）===');
  results.slice(0, 8).forEach(r => console.log(`  dh=${r.dh}  h=${r.h}  对称度=${r.mse}  ${r.file}`));
  fs.writeFileSync(path.join(OUT, 'symmetry.json'), JSON.stringify({ pano: PANO, scene: rear.name, sceneTitle: rear.title, def, fov: FOV, step: H_STEP, results }, null, 2));
  console.log(`\n已写入 ${path.join(OUT, 'symmetry.json')}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
