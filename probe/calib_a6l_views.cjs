const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANORAMA_URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const REF_DIR = process.env.REF_DIR || require('path').join(__dirname, 'refs');
const OUT_DIR = 'probe/calib_a6l';
const VIEWPORT = { width: 1920, height: 953 };
const DPR = 1;

const REFS = {
  F1: { file: 'clipboard-2026-09-04T22-25-15-183Z-96897b39.jpg', sceneRole: 'driver', name: '主驾正视前排IP' },
  R1: { file: 'clipboard-2026-09-04T22-25-15-187Z-ddf2b00f.jpg', sceneRole: 'rear',   name: '二排正视前排' }
};

fs.mkdirSync(OUT_DIR, { recursive: true });

function readRef(file) {
  const buf = fs.readFileSync(path.join(REF_DIR, file));
  const raw = jpeg.decode(buf, { useTArray: true });
  return { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
}

function mse(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let sum = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const dr = a.data[ia] - b.data[ib];
      const dg = a.data[ia + 1] - b.data[ib + 1];
      const db = a.data[ia + 2] - b.data[ib + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
    }
  }
  return sum / (n * 3);
}

async function cdpShot(page) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(data, 'base64');
}

function pickScene(scenes, role) {
  const hints = role === 'driver'
    ? ['驾驶', '主驾', '驾驶员']
    : role === 'rear'
      ? ['后排', '后座', '二排']
      : ['副驾', '乘客'];
  for (const h of hints) {
    const s = scenes.find(x => x.title.includes(h));
    if (s) return s;
  }
  return null;
}

(async () => {
  const refs = Object.fromEntries(Object.entries(REFS).map(([k, v]) => [k, readRef(v.file)]));

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.goto(PANORAMA_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (k) { k.call('stopautorotate()'); k.set('autorotate.enabled', false); }
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const b = document.querySelector('.hide-btn');
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await page.waitForTimeout(500);

  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return k.get('scene').getArray().map(s => ({ name: s.name, title: s.title || '' }));
  });
  console.log('scenes:', scenes.map(s => `${s.name}:${s.title}`).join(' | '));

  async function shotScene(sceneName, h, v, fov) {
    await page.evaluate((sn) => {
      const k = document.getElementById('krpanoSWFObject');
      k.call(`loadscene('${sn}', null, MERGE, BLEND(0.5))`);
    }, sceneName);
    await page.waitForTimeout(2500);
    await page.evaluate(({ h, v, f }) => {
      const k = document.getElementById('krpanoSWFObject');
      k.set('view.hlookat', h);
      k.set('view.vlookat', v);
      k.set('view.fov', f);
    }, { h, v, f: fov });
    await page.waitForTimeout(2500);
    return await cdpShot(page);
  }

  const grids = {
    F1: {
      scene: pickScene(scenes, 'driver').name,
      hList: [-30, -15, 0, 15, 30],
      vList: [-5, 0, 5, 10, 15],
      fList: [90, 95, 100, 105],
      ref: 'F1'
    },
    R1: {
      scene: pickScene(scenes, 'rear').name,
      hList: [-30, -15, 0, 15, 30],
      vList: [-15, -10, -5, 0, 5, 10],
      fList: [90, 95, 100, 105],
      ref: 'R1'
    }
  };

  const results = {};
  for (const [vid, g] of Object.entries(grids)) {
    console.log(`\n=== ${vid} ${REFS[vid].name} ===`);
    const candidates = [];
    let n = 0;
    for (const h of g.hList) {
      for (const v of g.vList) {
        for (const f of g.fList) {
          n++;
          process.stdout.write(`${n}/${g.hList.length * g.vList.length * g.fList.length} h=${h} v=${v} f=${f} ... `);
          const buf = await shotScene(g.scene, h, v, f);
          const png = PNG.sync.read(buf);
          const img = { width: png.width, height: png.height, data: png.data };
          const err = mse(img, refs[g.ref]);
          const fname = `${vid}_h${h}_v${v}_f${f}.png`;
          const fpath = path.join(OUT_DIR, fname);
          fs.writeFileSync(fpath, buf);
          candidates.push({ h, v, f, mse: err, fpath });
          console.log('MSE', Math.round(err));
        }
      }
    }
    candidates.sort((a, b) => a.mse - b.mse);
    results[vid] = candidates.slice(0, 5);
    const best = candidates[0];
    console.log(`\n最佳 ${vid}: h=${best.h} v=${best.v} f=${best.f} MSE=${Math.round(best.mse)}`);
    fs.writeFileSync(path.join(OUT_DIR, `${vid}_top5.json`), JSON.stringify(results[vid].map(c => ({ h: c.h, v: c.v, f: c.f, mse: c.mse, file: path.basename(c.fpath) })), null, 2));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({
    viewport: VIEWPORT, dpr: DPR,
    best: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v[0]]))
  }, null, 2));
  console.log('\n=== done ===');
})().catch(e => { console.error(e); process.exit(1); });
