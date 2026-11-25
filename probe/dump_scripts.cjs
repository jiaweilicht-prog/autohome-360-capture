const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let scripts = [];
  page.on('response', r => { if (r.url().includes('.js')) scripts.push(r.url()); });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(2000);
  console.log('=== script urls ===');
  console.log(scripts.join('\n'));
  // for each script, search for 清屏 / hide / skin
  for (const u of scripts) {
    try {
      const r = await page.evaluate(async (url) => {
        const res = await fetch(url, { method: 'GET' });
        return res.text();
      }, u);
      if (/清屏|hide-btn|AHbrowserHide|skin_show|skin_hide|清屏/.test(r)) {
        console.log('\n>>> HIT', u);
        const idx1 = r.indexOf('清屏');
        const idx2 = r.indexOf('hide-btn');
        const idx = idx1 >= 0 ? idx1 : idx2;
        console.log(r.slice(Math.max(0, idx - 200), idx + 200));
      }
    } catch (e) {}
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
