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

  const found = await page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      if (el.nodeType !== 1) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const s = window.getComputedStyle(el);
      // 排除位置不在顶部的
      if (r.top > 150) return;
      const text = (el.textContent || '').trim();
      const before = window.getComputedStyle(el, '::before').content.replace(/"/g, '');
      const after = window.getComputedStyle(el, '::after').content.replace(/"/g, '');
      const hasQing = /清屏/.test(text + before + after + (el.getAttribute('aria-label') || '') + (el.getAttribute('title') || ''));
      if (hasQing) {
        out.push({
          tag: el.tagName,
          id: el.id,
          cls: (el.className || '').toString().slice(0, 80),
          text,
          before, after,
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          cursor: s.cursor,
          pointerEvents: s.pointerEvents,
          display: s.display
        });
      }
    });
    return out;
  });
  console.log('=== elements with 清屏 (text/pseudo/title/aria) in top 150px ===');
  console.log(JSON.stringify(found, null, 2));

  // 也找出所有右上角小尺寸元素（可能是伪元素按钮的实际热区）
  const topRight = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right < window.innerWidth - 120) return; // 最右 120px 内
      if (r.top > 120) return;
      if (r.width < 1 || r.height < 1) return;
      const s = window.getComputedStyle(el);
      const text = (el.textContent || '').trim().slice(0, 40);
      const before = window.getComputedStyle(el, '::before').content.replace(/"/g, '').slice(0, 40);
      const after = window.getComputedStyle(el, '::after').content.replace(/"/g, '').slice(0, 40);
      if (s.cursor === 'pointer' || /反馈|分享|清屏|hide|share/.test(text + before + after + (el.className || ''))) {
        out.push({
          tag: el.tagName,
          id: el.id,
          cls: (el.className || '').toString().slice(0, 80),
          text, before, after,
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          cursor: s.cursor, pointerEvents: s.pointerEvents
        });
      }
    });
    return out.sort((a, b) => (a.y - b.y) || (b.right - a.right));
  });
  console.log('\n=== top-right small elements (cursor pointer / keywords) ===');
  console.log(JSON.stringify(topRight, null, 2));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
