// calibrate_select.cjs
// 自动标定 V1（主驾眼点看完整前排 IP）：
//   1) 加载 A6L pano 76524，定位首个「驾驶位」scene
//   2) 在该 scene 内按 h/v 网格扫拍（瓦片已缓存，逐个很快）
//   3) 用 pngjs 把每张候选与参考图做中心裁剪 MSE 比对
//   4) 输出最接近的最佳 h/v/fov 与排序（不依赖模型看图）
//
// 运行：NODE_PATH=node_modules \
//       node calibrate_select.cjs

const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANORAMA_URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const REF = 'probe/shots/截屏2026-09-03 下午11.28.07.png';
const OUT_DIR = 'probe/calib_sel';
const DRIVER_HINT = '驾驶';

const VIEW_W = 2880, VIEW_H = 1428; // 与参考图同尺寸，保证像素可比

// 网格：h 大范围，v 小范围（IP 通常在水平偏上），fov 小范围搜索
const H_LIST = [-30, 0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60];
const V_LIST = [-5, 0, 5, 10, 15, 20];
const FOV_LIST = [85, 90, 95];

fs.mkdirSync(OUT_DIR, { recursive: true });

function mseCenterCrop(a, b) {
  // 按中心 70% 区域比较，规避边缘 UI 差异；尺寸不一致时按最小尺寸取中心
  const cw = Math.floor(Math.min(a.width, b.width) * 0.70);
  const ch = Math.floor(Math.min(a.height, b.height) * 0.70);
  const x0 = Math.floor((a.width - cw) / 2);
  const y0 = Math.floor((a.height - ch) / 2);
  let sum = 0, n = 0;
  for (let y = y0; y < y0 + ch; y++) {
    for (let x = x0; x < x0 + cw; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const dr = a.data[ia] - b.data[ib];
      const dg = a.data[ia + 1] - b.data[ib + 1];
      const db = a.data[ia + 2] - b.data[ib + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
    }
  }
  return sum / (n * 3); // 0..(255^2)
}

(async () => {
  const refPng = PNG.sync.read(fs.readFileSync(REF));
  console.log(`参考图: ${REF}  ${refPng.width}x${refPng.height}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  async function cdpShot(fpath) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(fpath, Buffer.from(data, 'base64'));
  }

  console.log('打开全景页...');
  await page.goto(PANORAMA_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(3000);

  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    k.call('stopautorotate()');
    try { k.set('autorotate.enabled', false); } catch (e) {}
    return k.get('scene').getArray().map(s => ({ name: s.name, title: s.title }));
  });
  console.log('scenes:', JSON.stringify(scenes.map(s => s.title)));

  const driverScene = scenes.find(s => s.title && s.title.includes(DRIVER_HINT)) || scenes[0];
  console.log('选用驾驶位 scene:', driverScene.name, driverScene.title);

  // 加载目标 scene 并等待瓦片
  await page.evaluate((name) => {
    const k = document.getElementById('krpanoSWFObject');
    k.call('loadscene(' + name + ')');
  }, driverScene.name);
  await page.waitForTimeout(11000); // 首次瓦片加载

  const def = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return { h: k.get('view.hlookat'), v: k.get('view.vlookat'), f: k.get('view.fov'),
             ath: k.get('view.maxpixelzoom') };
  });
  console.log('该 scene 默认视角 h/v/fov =', def.h.toFixed(2), def.v.toFixed(2), def.f.toFixed(2));

  const candidates = [];
  for (const h of H_LIST) {
    for (const v of V_LIST) {
      for (const fov of FOV_LIST) {
        await page.evaluate(({ hh, vv, fv }) => {
          const k = document.getElementById('krpanoSWFObject');
          k.set('view.hlookat', hh);
          k.set('view.vlookat', vv);
          k.set('view.fov', fv);
        }, { hh: h, vv: v, fv: fov });
        await page.waitForTimeout(1500);
        // 清屏：让候选图与最终产出一致（隐藏 UI 控件；水印是烘焙的，去不掉）
        await page.evaluate(() => {
          const b = document.querySelector('.hide-btn');
          if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        });
        await page.waitForTimeout(400);
        const fname = `V1_h${h}_v${v}_f${fov}.png`;
        const fpath = path.join(OUT_DIR, fname);
        await cdpShot(fpath);
        candidates.push({ h, v, fov, fpath });
      }
    }
  }
  await browser.close();

  // 离线比对
  const scored = candidates.map(c => {
    const p = PNG.sync.read(fs.readFileSync(c.fpath));
    const mse = mseCenterCrop(p, refPng);
    return { ...c, mse };
  }).sort((a, b) => a.mse - b.mse);

  console.log('\n=== V1 候选排序（MSE 越小越接近参考图）===');
  scored.slice(0, 12).forEach((c, i) => {
    console.log(`#${i + 1}  h=${c.h} v=${c.v} fov=${c.fov}  MSE=${c.mse.toFixed(1)}  ${path.basename(c.fpath)}`);
  });

  const best = scored[0];
  const result = {
    panoId: 76524,
    driverScene: driverScene,
    driverSceneDefault: { h: def.h, v: def.v, fov: def.f },
    best: { h: best.h, v: best.v, fov: best.fov, mse: best.mse },
    offsetFromDefault: {
      dh: +(best.h - def.h).toFixed(2),
      dv: +(best.v - def.v).toFixed(2),
      dfov: +(best.fov - def.f).toFixed(2)
    },
    top: scored.slice(0, 12)
  };
  fs.writeFileSync(path.join(OUT_DIR, 'v1_result.json'), JSON.stringify(result, null, 2));
  console.log('\n最佳 V1:', JSON.stringify(result.best), '偏移:', JSON.stringify(result.offsetFromDefault));
  console.log('结果已写入', path.join(OUT_DIR, 'v1_result.json'));
})().catch(e => { console.error('ERROR', e); process.exit(1); });
