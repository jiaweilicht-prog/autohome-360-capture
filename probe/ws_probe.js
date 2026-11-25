const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const target = process.argv[2] || 'https://zh.wheelsage.org/mercedes-benz/s-klasse';
  console.log('TARGET:', target);
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, userAgent: UA });
  const page = await ctx.newPage();

  const apis = [];
  const imgs = [];
  const s3 = [];
  page.on('request', r => {
    const u = r.url();
    if (/\/api\/|grpc|_ah\/|strapi|graphql|item|picture|vehicle|car/i.test(u) && !u.includes('google') && !u.includes('gstatic')) apis.push(u);
  });
  page.on('response', async (res) => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if (u.includes('s3.wheelsage') || u.includes('wheelsage.org/format')) s3.push(u);
    if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(u) && (u.includes('wheelsage') || u.includes('cloudfront') || u.includes('s3'))) imgs.push(u);
  });

  try {
    await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) {
    console.log('goto warn:', e.message);
  }
  // give SPA extra time
  await page.waitForTimeout(6000);

  const domInfo = await page.evaluate(() => {
    const out = { title: document.title, bodyLen: document.body ? document.body.innerText.length : 0,
      h1: document.querySelector('h1') ? document.querySelector('h1').innerText.slice(0,120) : null,
      imgs: [], links: [], text: document.body ? document.body.innerText.slice(0, 400) : '' };
    document.querySelectorAll('img').forEach(i => { if (i.src) out.imgs.push(i.src); });
    document.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href');
      if (h && /s-klasse|w223|br223|picture|interior|salon/i.test(h)) out.links.push(h);
    });
    return out;
  });

  console.log('\n=== DOM ===');
  console.log('title:', domInfo.title);
  console.log('bodyLen:', domInfo.bodyLen);
  console.log('h1:', domInfo.h1);
  console.log('text:', JSON.stringify(domInfo.text));
  console.log('\nimg count in DOM:', domInfo.imgs.length);
  domInfo.imgs.slice(0, 10).forEach(u => console.log('  IMG:', u));
  console.log('\nmatching links:', domInfo.links.length);
  domInfo.links.slice(0, 20).forEach(l => console.log('  LNK:', l));

  console.log('\n=== API/JSON requests ===', apis.length);
  apis.slice(0, 40).forEach(u => console.log('  API:', u));

  console.log('\n=== s3/format images ===', s3.length);
  s3.slice(0, 15).forEach(u => console.log('  S3:', u));

  console.log('\n=== all image urls ===', imgs.length);
  imgs.slice(0, 15).forEach(u => console.log('  IMG:', u));

  await page.screenshot({ path: '/tmp/ws_probe_shot.png', fullPage: false });
  await browser.close();
  console.log('\nDONE');
})();
