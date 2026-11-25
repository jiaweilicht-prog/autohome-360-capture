const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  await sleep(2000);

  // 枚举 krpano 所有 layer / plugin / hotspot 名称与位置
  const layers = await page.evaluate(() => {
    try {
      const krpano = document.getElementById('krpanoSWFObject');
      const out = [];
      const collect = (type) => {
        const obj = krpano.get(type);
        if (!obj) return;
        const arr = obj.getArray ? obj.getArray() : (Array.isArray(obj) ? obj : []);
        arr.forEach && arr.forEach((it, i) => {
          try {
            out.push({
              type,
              index: i,
              name: it.name,
              visible: it.visible,
              enabled: it.enabled,
              alpha: it.alpha,
              x: it.x,
              y: it.y,
              width: it.width,
              height: it.height,
              align: it.align,
              edge: it.edge,
              scale: it.scale,
              ox: it.ox,
              oy: it.oy,
              url: it.url,
              html: (it.html || '').slice(0, 80),
              parent: it.parent ? it.parent.name : null
            });
          } catch (e) {}
        });
      };
      collect('layer');
      collect('plugin');
      collect('hotspot');
      return out;
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('layers count:', layers.length || layers.error);
  console.log(JSON.stringify(layers.slice(0, 80), null, 2));

  // 也 dump 所有 scene 名，看看机位对应关系
  const scenes = await page.evaluate(() => {
    try {
      const krpano = document.getElementById('krpanoSWFObject');
      const arr = krpano.get('scene').getArray();
      return arr.map(s => ({ name: s.name, title: s.title }));
    } catch (e) { return { error: e.message }; }
  });
  console.log('\nscenes:', JSON.stringify(scenes, null, 2));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
