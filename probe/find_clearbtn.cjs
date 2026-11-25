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
  await page.evaluate(() => {
    try { document.getElementById('krpanoSWFObject').call('stopautorotate()'); } catch (e) {}
  });
  await sleep(2000);

  // 1) 全文搜索"清屏"所在的元素
  const qingping = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const out = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (/清屏/.test(n.textContent)) {
        const p = n.parentElement;
        const r = p.getBoundingClientRect();
        out.push({
          text: n.textContent.trim().slice(0, 60),
          tag: p.tagName,
          id: p.id,
          cls: (p.className || '').toString().slice(0, 80),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          title: p.getAttribute('title'),
          aria: p.getAttribute('aria-label'),
          href: p.getAttribute('href'),
          onclick: p.getAttribute('onclick')
        });
      }
    }
    return out;
  });
  console.log('=== 文本包含"清屏"的元素 ===');
  console.log(JSON.stringify(qingping, null, 2));

  // 2) 列出所有 iframes
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe, frame')).map(f => ({
      src: f.src,
      id: f.id,
      cls: (f.className || '').toString(),
      name: f.name,
      width: f.width,
      height: f.height,
      r: (() => { const r = f.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()
    }));
  });
  console.log('=== iframes ===');
  console.log(JSON.stringify(iframes, null, 2));

  // 3) 全页面扫描所有元素（包括样式里带cursor:pointer / role=button / onclick），按右上角排序
  const all = await page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      if (el.nodeType !== 1) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const text = (el.textContent || '').trim().slice(0, 40);
      const title = el.getAttribute('title') || '';
      const aria = el.getAttribute('aria-label') || '';
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      const clickable = !!(
        el.onclick ||
        role === 'button' ||
        el.tagName === 'BUTTON' ||
        el.tagName === 'A' ||
        style.cursor === 'pointer' ||
        /清屏|隐藏|全屏|分享|反馈/.test(text + title + aria + (el.className || ''))
      );
      if (clickable || /清屏|隐藏|全屏/.test(text + title + aria)) {
        out.push({
          tag: el.tagName,
          id: el.id || '',
          cls: (el.className || '').toString().slice(0, 80),
          text,
          title,
          aria,
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          cursor: style.cursor,
          clickable
        });
      }
    });
    // 右上优先
    return out
      .filter(x => x.y < 200 && x.right > 1000)
      .sort((a, b) => (a.y - b.y) || (b.right - a.right));
  });
  console.log('=== 右上角可点击元素 ===');
  console.log(JSON.stringify(all.slice(0, 40), null, 2));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
