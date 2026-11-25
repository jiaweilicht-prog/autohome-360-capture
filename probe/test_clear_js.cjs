const { chromium } = require('playwright-core');
const fs = require('fs');
const { PNG } = require('pngjs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const regionHash = (data, w, h, x, y, rw, rh) => {
  const crypto = require('crypto');
  const hsh = crypto.createHash('md5');
  for (let j = y; j < y + rh && j < h; j++) {
    const row = data.slice((j * w + x) * 4, (j * w + x + rw) * 4);
    hsh.update(row);
  }
  return hsh.digest('hex');
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => {
      const el = document.getElementById('krpanoSWFObject');
      return el && el.get ? el.get('view.hlookat') : null;
    });
    if (state !== null && !Number.isNaN(state)) break;
    await sleep(500);
  }
  await page.evaluate(() => { try { document.getElementById('krpanoSWFObject').call('stopautorotate()'); } catch (e) {} });
  await sleep(2500);

  // 基线
  const basePath = 'probe/shots/clearjs_base.png';
  await page.screenshot({ path: basePath });
  const baseP = PNG.sync.read(fs.readFileSync(basePath));
  const baseRegs = {
    leftbar: regionHash(baseP.data, baseP.width, baseP.height, 0, 0, 160, 220),
    topRight: regionHash(baseP.data, baseP.width, baseP.height, 1150, 0, 290, 100),
    watermark: regionHash(baseP.data, baseP.width, baseP.height, 980, 120, 460, 140),
    bottom: regionHash(baseP.data, baseP.width, baseP.height, 300, 800, 840, 100)
  };
  console.log('base', baseRegs);

  // 检查全局对象
  const globals = await page.evaluate(() => {
    return {
      hasXmlCall: typeof window.xmlCall === 'object' && window.xmlCall !== null,
      hasEnterVR: typeof window.xmlCall?.enterVR === 'function',
      hasExitVR: typeof window.xmlCall?.exitVR === 'function',
      hasIntPage: typeof window.intPage === 'object',
      methods: window.xmlCall ? Object.keys(window.xmlCall).filter(k => typeof window.xmlCall[k] === 'function') : []
    };
  });
  console.log('globals', JSON.stringify(globals));

  // 尝试调用 enterVR
  const before = await page.evaluate(() => {
    if (window.xmlCall && window.xmlCall.enterVR) {
      try { window.xmlCall.enterVR(); return 'called enterVR'; } catch (e) { return 'err: ' + e.message; }
    }
    return 'not available';
  });
  console.log('invoke result:', before);
  await sleep(1500);

  const afterPath = 'probe/shots/clearjs_after.png';
  await page.screenshot({ path: afterPath });
  const img = PNG.sync.read(fs.readFileSync(afterPath));
  const changed = {
    leftbar: regionHash(img.data, img.width, img.height, 0, 0, 160, 220) !== baseRegs.leftbar,
    topRight: regionHash(img.data, img.width, img.height, 1150, 0, 290, 100) !== baseRegs.topRight,
    watermark: regionHash(img.data, img.width, img.height, 980, 120, 460, 140) !== baseRegs.watermark,
    bottom: regionHash(img.data, img.width, img.height, 300, 800, 840, 100) !== baseRegs.bottom
  };
  console.log('changed', JSON.stringify(changed));

  // 尝试恢复
  await page.evaluate(() => { try { window.xmlCall && window.xmlCall.exitVR && window.xmlCall.exitVR(); } catch (e) {} });
  await sleep(800);
  await page.screenshot({ path: 'probe/shots/clearjs_recover.png' });

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
