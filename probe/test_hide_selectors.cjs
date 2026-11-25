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

  const basePath = 'probe/shots/hidesel_base.png';
  await page.screenshot({ path: basePath });
  const baseP = PNG.sync.read(fs.readFileSync(basePath));
  const baseRegs = {
    full: regionHash(baseP.data, baseP.width, baseP.height, 0, 0, baseP.width, baseP.height),
    leftbar: regionHash(baseP.data, baseP.width, baseP.height, 0, 0, 160, 220),
    topRight: regionHash(baseP.data, baseP.width, baseP.height, 1150, 0, 290, 100),
    watermark: regionHash(baseP.data, baseP.width, baseP.height, 980, 120, 460, 140),
    bottom: regionHash(baseP.data, baseP.width, baseP.height, 300, 800, 840, 100)
  };
  console.log('base', baseRegs);

  // 检查 int 实例方法
  const intInfo = await page.evaluate(() => {
    const int = window.intPage && window.intPage.int;
    if (!int) return { err: 'no intPage.int' };
    return {
      methods: Object.keys(int).filter(k => typeof int[k] === 'function'),
      hasHideAllHotspots: typeof int.hideAllHotspots === 'function',
      hasGetHotspots: typeof int.getHotspots === 'function',
      hasSetHotspotAttr: typeof int.setHotspotAttr === 'function',
      hasShowScenespot: typeof int.showScenespot === 'function'
    };
  });
  console.log('intInfo', JSON.stringify(intInfo));

  // 执行 HideBtn 的等效逻辑
  const result = await page.evaluate(() => {
    try {
      // 直接触发 .hide-btn 的点击（即使 display:none 也可能有效）
      const hb = document.querySelector('.hide-btn');
      if (hb) {
        // 构造一个点击事件
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        hb.dispatchEvent(ev);
        return 'dispatched click on .hide-btn';
      }
      return 'no .hide-btn';
    } catch (e) {
      return 'err: ' + e.message;
    }
  });
  console.log('result:', result);
  await sleep(1500);

  const afterPath = 'probe/shots/hidesel_after_dispatch.png';
  await page.screenshot({ path: afterPath });
  const img = PNG.sync.read(fs.readFileSync(afterPath));
  const changed = {
    full: regionHash(img.data, img.width, img.height, 0, 0, img.width, img.height) !== baseRegs.full,
    leftbar: regionHash(img.data, img.width, img.height, 0, 0, 160, 220) !== baseRegs.leftbar,
    topRight: regionHash(img.data, img.width, img.height, 1150, 0, 290, 100) !== baseRegs.topRight,
    watermark: regionHash(img.data, img.width, img.height, 980, 120, 460, 140) !== baseRegs.watermark,
    bottom: regionHash(img.data, img.width, img.height, 300, 800, 840, 100) !== baseRegs.bottom
  };
  console.log('changed dispatch', JSON.stringify(changed));

  // 如果 dispatch 无效，手动执行隐藏
  if (!changed.watermark && !changed.leftbar) {
    console.log('dispatch 未生效，尝试手动隐藏');
    await page.evaluate(() => {
      const int = window.intPage && window.intPage.int;
      try {
        document.querySelector('#title-div') && (document.querySelector('#title-div').style.display = 'none');
        document.querySelector('#banner') && (document.querySelector('#banner').style.display = 'none');
        document.querySelectorAll('.right-btns').forEach(e => e.style.display = 'none');
        document.querySelectorAll('.otherBox').forEach(e => e.style.display = 'none');
        document.querySelector('#guide') && (document.querySelector('#guide').style.display = 'none');
        document.querySelector('#switchBtn') && (document.querySelector('#switchBtn').style.display = 'none');
        document.querySelectorAll('.askprice-btn').forEach(e => e.style.display = 'none');
        document.querySelectorAll('.tipsDiv').forEach(e => e.style.display = 'none');
        document.querySelector('#machineBtn') && (document.querySelector('#machineBtn').style.display = 'none');
        if (int && int.hideAllHotspots) int.hideAllHotspots();
      } catch (e) {}
    });
    await sleep(1500);
    const manualPath = 'probe/shots/hidesel_after_manual.png';
    await page.screenshot({ path: manualPath });
    const img2 = PNG.sync.read(fs.readFileSync(manualPath));
    const changed2 = {
      full: regionHash(img2.data, img2.width, img2.height, 0, 0, img2.width, img2.height) !== baseRegs.full,
      leftbar: regionHash(img2.data, img2.width, img2.height, 0, 0, 160, 220) !== baseRegs.leftbar,
      topRight: regionHash(img2.data, img2.width, img2.height, 1150, 0, 290, 100) !== baseRegs.topRight,
      watermark: regionHash(img2.data, img2.width, img2.height, 980, 120, 460, 140) !== baseRegs.watermark,
      bottom: regionHash(img2.data, img2.width, img2.height, 300, 800, 840, 100) !== baseRegs.bottom
    };
    console.log('changed manual', JSON.stringify(changed2));
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
