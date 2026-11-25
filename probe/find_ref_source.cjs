// 定位参考截图来源：对 P0 的 7 个 pano，各选首个「驾驶位」scene，用其默认视角截图，
// 再用 pngjs 与参考图算中心裁剪 MSE，找出最接近的车。
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REF = 'probe/shots/截屏2026-09-03 下午11.28.07.png';
const OUT = 'probe/calib_src';
const PANOS = [76524, 73534, 72934, 74238, 75193, 65047, 75906];
const WAIT = 12000;

fs.mkdirSync(OUT, { recursive: true });

function mseCenterCrop(a, b) {
  const cw = Math.floor(Math.min(a.width, b.width) * 0.70);
  const ch = Math.floor(Math.min(a.height, b.height) * 0.70);
  const x0 = Math.floor((a.width - cw) / 2);
  const y0 = Math.floor((a.height - ch) / 2);
  let sum = 0, n = 0;
  for (let y = y0; y < y0 + ch; y += 2) {
    for (let x = x0; x < x0 + cw; x += 2) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const dr = a.data[ia] - b.data[ib];
      const dg = a.data[ia + 1] - b.data[ib + 1];
      const db = a.data[ia + 2] - b.data[ib + 2];
      sum += dr * dr + dg * dg + db * db; n++;
    }
  }
  return sum / (n * 3);
}

(async () => {
  const refPng = PNG.sync.read(fs.readFileSync(REF));
  console.log(`参考图 ${refPng.width}x${refPng.height}`);

  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--disable-gpu', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  const rows = [];
  for (const pid of PANOS) {
    try {
      console.log(`\n--- pano ${pid} ---`);
      await page.goto(`https://pano.autohome.com.cn/car/pano/${pid}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(WAIT);

      const info = await page.evaluate(() => {
        const k = document.getElementById('krpanoSWFObject');
        if (!k) return { ok: false, reason: 'no_krpano' };
        try { k.call('stopautorotate()'); } catch (e) {}
        try { k.set('autorotate.enabled', false); } catch (e) {}
        const n = Number(k.get('scene.count'));
        const scenes = [];
        for (let i = 0; i < n; i++) {
          scenes.push({ name: k.get(`scene[${i}].name`), title: k.get(`scene[${i}].title`) });
        }
        return { ok: true, scenes, cur: k.get('scene.name') };
      });
      if (!info.ok) { console.log('  krpano 未就绪:', info.reason); rows.push({ pid, err: info.reason }); continue; }

      // 清屏
      await page.evaluate(() => {
        const b = document.querySelector('.hide-btn');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });

      const titleList = info.scenes.map(s => s.title).join(',');
      console.log(`  scenes: ${titleList}`);
      const drv = info.scenes.find(s => /驾驶/.test(s.title)) || info.scenes[0];

      await page.evaluate((nm) => {
        const k = document.getElementById('krpanoSWFObject');
        k.call(`loadscene(${nm})`);
      }, drv.name);
      await page.waitForTimeout(WAIT);
      await page.evaluate(() => {
        const b = document.querySelector('.hide-btn');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(600);

      const view = await page.evaluate(() => {
        const k = document.getElementById('krpanoSWFObject');
        return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')), f: Number(k.get('view.fov')), scene: k.get('scene.name') };
      });
      console.log(`  驾驶位 scene=${view.scene} name=${drv.name} 默认 h=${view.h.toFixed(2)} v=${view.v.toFixed(2)} fov=${view.f.toFixed(1)}`);

      const fpath = path.join(OUT, `pano${pid}_${drv.name}.png`);
      const buf = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(fpath, Buffer.from(buf.data, 'base64'));

      const png = PNG.sync.read(fs.readFileSync(fpath));
      const m = mseCenterCrop(refPng, png);
      console.log(`  ${png.width}x${png.height}  MSE=${m.toFixed(0)}`);
      rows.push({ pid, scene: drv.name, sceneTitle: drv.title, h: view.h, v: view.v, fov: view.f, mse: Math.round(m), file: fpath });
    } catch (e) {
      console.log(`  ERROR ${e.message}`);
      rows.push({ pid, err: e.message });
    }
  }

  await browser.close();

  rows.filter(r => !r.err).sort((a, b) => a.mse - b.mse);
  const ok = rows.filter(r => typeof r.mse === 'number').sort((a, b) => a.mse - b.mse);
  console.log('\n=== 按 MSE 排序（越小越像参考图）===');
  ok.forEach(r => console.log(`  pano ${r.pid}  ${r.sceneTitle}(${r.scene})  h=${r.h.toFixed(1)} v=${r.v.toFixed(1)} fov=${r.fov.toFixed(0)}  MSE=${r.mse}`));
  fs.writeFileSync(path.join(OUT, 'ref_source.json'), JSON.stringify({ ref: REF, results: rows, ranked: ok }, null, 2));
  console.log('\n已写入 calib_src/ref_source.json');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
