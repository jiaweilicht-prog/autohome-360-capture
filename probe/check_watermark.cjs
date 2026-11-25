const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => { const el = document.getElementById('krpanoSWFObject'); return el && el.get ? el.get('view.hlookat') : null; });
    if (state !== null && !Number.isNaN(state)) break;
    await sleep(500);
  }
  await page.evaluate(() => { try { document.getElementById('krpanoSWFObject').call('stopautorotate()'); } catch (e) {} });
  await sleep(2500);

  // 点击清屏
  await page.evaluate(() => {
    const hb = document.querySelector('.hide-btn');
    if (hb) hb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(1000);

  // 用 elementFromPoint 检查水印位置（右中偏上）
  const pts = [
    {x:1100,y:180, name:'水印左上'},
    {x:1200,y:220, name:'水印中心'},
    {x:1300,y:260, name:'水印右下'},
    {x:1000,y:150, name:'水印左侧'},
    {x:700,y:450, name:'画面中心'}
  ];
  const els = await page.evaluate((points) => {
    return points.map(p => {
      const el = document.elementFromPoint(p.x, p.y);
      const r = el ? el.getBoundingClientRect() : null;
      return {
        pt: p.name, x: p.x, y: p.y,
        tag: el ? el.tagName : null,
        id: el ? el.id : null,
        cls: el ? (el.className || '').toString().slice(0, 80) : null,
        text: el ? (el.textContent || '').trim().slice(0, 40) : null,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
      };
    });
  }, pts);
  console.log(JSON.stringify(els, null, 2));

  // 也扫描整个 krpano 中名字/内容带 汽车之家 的 layer / hotspot
  const krpanoInfo = await page.evaluate(() => {
    try {
      const k = document.getElementById('krpanoSWFObject');
      const out = [];
      const check = (type) => {
        const obj = k.get(type);
        if (!obj || !obj.getArray) return;
        obj.getArray().forEach(it => {
          const html = (it.html || '').toString();
          const url = (it.url || '').toString();
          const name = (it.name || '').toString();
          if (/汽车之家|autohome|logo|watermark/i.test(html + url + name)) {
            out.push({ type, name, html: html.slice(0, 80), url: url.slice(0, 80), visible: it.visible, x: it.x, y: it.y });
          }
        });
      };
      check('layer');
      check('plugin');
      check('hotspot');
      return out;
    } catch (e) { return { error: e.message }; }
  });
  console.log('krpano watermark-ish items:', JSON.stringify(krpanoInfo, null, 2));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
