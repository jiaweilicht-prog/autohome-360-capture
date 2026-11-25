const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URLS = [
  'https://pano.autohome.com.cn/car/pano/73534?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/72934?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/74238?_ahrotate=1'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox']
  });

  for (const url of URLS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 40; i++) {
      const state = await page.evaluate(() => {
        const el = document.getElementById('krpanoSWFObject');
        return el && el.get ? el.get('view.hlookat') : null;
      });
      if (state !== null && !Number.isNaN(state)) break;
      await sleep(500);
    }
    await page.evaluate(() => { try { document.getElementById('krpanoSWFObject').call('stopautorotate()'); } catch (e) {} });
    await sleep(2000);

    const result = await page.evaluate(() => {
      const el = document.querySelector('.hide-btn');
      if (!el) return { hasBtn: false };
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return { hasBtn: true, textBefore: el.textContent.trim().slice(0, 10), stateBefore: el.getAttribute('data-state') };
    });
    await sleep(1000);

    const after = await page.evaluate(() => {
      const el = document.querySelector('.hide-btn');
      return {
        textAfter: el ? el.textContent.trim().slice(0, 10) : null,
        stateAfter: el ? el.getAttribute('data-state') : null,
        titleVisible: !!document.querySelector('#title-div') && document.querySelector('#title-div').style.display !== 'none',
        bannerVisible: !!document.querySelector('#banner') && document.querySelector('#banner').style.display !== 'none'
      };
    });
    console.log(JSON.stringify({ url, ...result, ...after }));
    await page.close();
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
