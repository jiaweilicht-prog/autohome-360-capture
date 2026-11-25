// fov_probe.cjs — 确认 krpano 的 view.fov 语义（VFOV/HFOV）、站点的可视范围与钳制
// 直接读 krpano 计算属性 view.fovtype / view.hfov / view.vfov（只读），并试探设置上下限。
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANO = process.argv[2] || '75117';
const VIEWPORT = { width: 1440, height: 714 };

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', () => {});
  await page.goto(`https://pano.autohome.com.cn/car/pano/${PANO}?_ahrotate=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); k.call('stopautorotate()'); });

  const info = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    const read = () => ({
      fovtype: k.get('view.fovtype'),
      fov: k.get('view.fov'),
      hfov: k.get('view.hfov'),
      vfov: k.get('view.vfov'),
      hlookat: k.get('view.hlookat'),
      vlookat: k.get('view.vlookat'),
      screenW: window.innerWidth, screenH: window.innerHeight,
      // krpano 视口真实分辨率（含 devicePixelRatio 影响）
      stageW: k.get('stagewidth'), stageH: k.get('stageheight')
    });
    const out = { initial: read(), trials: [] };
    for (const f of [95, 80, 65, 50, 40, 30, 20, 10]) {
      k.set('view.fov', f);
      out.trials.push({ set: f, ...read() });
    }
    return out;
  });

  console.log('屏幕 %dx%d  舞台 %sx%s', info.initial.screenW, info.initial.screenH, info.initial.stageW, info.initial.stageH);
  console.log('\n初始: fovtype=%s fov=%s hfov=%s vfov=%s', info.initial.fovtype, info.initial.fov, info.initial.hfov, info.initial.vfov);
  console.log('\n设 fov -> 实际(fov / hfov / vfov):');
  for (const t of info.trials) console.log(`  set ${String(t.set).padStart(3)} -> fov=${t.fov} hfov=${t.hfov} vfov=${t.vfov}  (fovtype=${t.fovtype})`);

  // 校验：hfov 是水平视场角、vfov 是垂直视场角 —— 用宽高比反推，判断哪个与「按宽高比缩放」自洽
  const t = info.trials[0];
  const aspect = info.initial.stageW / info.initial.stageH;
  console.log(`\n舞台宽高比 = ${aspect.toFixed(4)}`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
