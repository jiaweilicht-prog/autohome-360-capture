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

  const info = await page.evaluate(() => {
    // 1. 找到包含"清屏"的节点
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node = null;
    while (walker.nextNode()) {
      if (/清屏/.test(walker.currentNode.textContent)) { node = walker.currentNode; break; }
    }
    const target = node ? node.parentElement : null;

    // 2. 父链
    const chain = [];
    let p = target;
    let depth = 0;
    while (p && depth < 6) {
      const r = p.getBoundingClientRect();
      const s = window.getComputedStyle(p);
      chain.push({
        tag: p.tagName,
        id: p.id || '',
        cls: (p.className || '').toString().slice(0, 80),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom),
        cursor: s.cursor,
        pointerEvents: s.pointerEvents,
        position: s.position,
        display: s.display,
        visibility: s.visibility,
        opacity: s.opacity
      });
      p = p.parentElement; depth++;
    }

    // 3. target 的兄弟/子元素
    const siblings = target ? Array.from(target.parentElement.children)
      .filter(c => c !== target)
      .map(el => {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          id: el.id,
          cls: (el.className || '').toString().slice(0, 80),
          text: (el.textContent || '').trim().slice(0, 40),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          cursor: s.cursor, pointerEvents: s.pointerEvents
        };
      }).sort((a,b) => (a.y-b.y)||(b.right-a.right)) : [];

    // 4. 所有 class 含 hide / clear / screen 的元素
    const clsMatches = [];
    document.querySelectorAll('*').forEach(el => {
      const c = (el.className || '').toString();
      if (/hide|clear|screen|clean/.test(c)) {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        if (r.width > 0 || r.height > 0 || s.cursor === 'pointer') {
          clsMatches.push({
            tag: el.tagName, id: el.id, cls: c.slice(0, 80),
            text: (el.textContent || '').trim().slice(0, 40),
            x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
            right: Math.round(r.right), bottom: Math.round(r.bottom),
            cursor: s.cursor, pointerEvents: s.pointerEvents
          });
        }
      }
    });
    clsMatches.sort((a,b) => (a.y-b.y)||(b.right-a.right));

    return { targetText: target ? target.textContent.trim() : null, chain, siblings, clsMatches: clsMatches.slice(0, 20) };
  });

  console.log('目标文本:', JSON.stringify(info.targetText));
  console.log('\n=== 父链（从"清屏"div 向上） ===');
  console.log(JSON.stringify(info.chain, null, 2));
  console.log('\n=== "清屏"div 的兄弟元素 ===');
  console.log(JSON.stringify(info.siblings, null, 2));
  console.log('\n=== class 含 hide/clear/screen 的元素 ===');
  console.log(JSON.stringify(info.clsMatches, null, 2));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
