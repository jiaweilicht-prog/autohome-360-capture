const { chromium } = require('playwright-core');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const pngDigest = async (path) => {
  const { PNG } = await import('pngjs');
  const buf = fs.readFileSync(path);
  return new Promise((res, rej) => {
    const p = new PNG();
    p.parse(buf, (err) => {
      if (err) return rej(err);
      // 对全图 md5 + 截几个关键区做简单统计
      const crypto = require('crypto');
      const full = crypto.createHash('md5').update(p.data).digest('hex');
      res({ full, w: p.width, h: p.height });
    });
  });
};

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
  const basePath = 'probe/shots/cleargrid_base.png';
  await page.screenshot({ path: basePath });
  const { PNG } = require('pngjs');
  const baseP = PNG.sync.read(fs.readFileSync(basePath));
  const baseRegs = {
    leftbar: regionHash(baseP.data, baseP.width, baseP.height, 0, 0, 160, 220),
    topRight: regionHash(baseP.data, baseP.width, baseP.height, 1150, 0, 290, 100),
    watermark: regionHash(baseP.data, baseP.width, baseP.height, 980, 120, 460, 140),
    bottom: regionHash(baseP.data, baseP.width, baseP.height, 300, 800, 840, 100)
  };
  console.log('base regions', baseRegs);

  // 网格点击：x 1380~1430, y 10~50，步长 10，从右往左扫，优先找到"清屏"而非"分享"
  const coords = [];
  for (let x = 1380; x <= 1430; x += 10) {
    for (let y = 10; y <= 50; y += 10) coords.push({ x, y });
  }
  coords.sort((a, b) => (b.x - a.x) || (a.y - b.y));

  for (const { x, y } of coords) {
    await page.mouse.click(x, y);
    await sleep(1000);
    const p = `probe/shots/cleargrid_${x}_${y}.png`;
    await page.screenshot({ path: p });
    const img = PNG.sync.read(fs.readFileSync(p));
    const changed = {
      leftbar: regionHash(img.data, img.width, img.height, 0, 0, 160, 220) !== baseRegs.leftbar,
      topRight: regionHash(img.data, img.width, img.height, 1150, 0, 290, 100) !== baseRegs.topRight,
      watermark: regionHash(img.data, img.width, img.height, 980, 120, 460, 140) !== baseRegs.watermark,
      bottom: regionHash(img.data, img.width, img.height, 300, 800, 840, 100) !== baseRegs.bottom
    };
    const nChanged = Object.values(changed).filter(Boolean).length;
    console.log(JSON.stringify({ x, y, nChanged, changed }));

    if (nChanged >= 2) {
      console.log('>>> candidate hit at', x, y);
      // 清屏 = 左/顶右/水印都变了，但底部没有分享弹窗
      const isClear = changed.leftbar && changed.topRight && changed.watermark && !changed.bottom;
      if (isClear) {
        fs.copyFileSync(p, 'probe/shots/cleargrid_clear.png');
        console.log('>>> FOUND 清屏 at', x, y);
        break;
      }
      // 否则大概率是"分享"弹窗：点"取消"关闭后继续扫
      if (changed.bottom) {
        console.log('>>> share overlay, dismiss and continue');
        await page.mouse.click(720, 860);
        await sleep(800);
      }
    }
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
