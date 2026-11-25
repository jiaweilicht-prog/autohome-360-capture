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
  const logs = [];
  page.on('console', m => logs.push(m.text()));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 等全景
  let ok = false;
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => {
      const el = document.getElementById('krpanoSWFObject');
      if (!el || !el.get) return null;
      return { h: el.get('view.hlookat'), v: el.get('view.vlookat'), fov: el.get('view.fov') };
    });
    if (state && state.h !== undefined && !Number.isNaN(state.h)) { ok = true; break; }
    await sleep(500);
  }
  console.log('pano ready:', ok);

  // 停转
  await page.evaluate(() => {
    try {
      const el = document.getElementById('krpanoSWFObject');
      el.call && el.call('stopautorotate()');
    } catch (e) {}
  });
  await sleep(2500);

  // 扫描所有可点击元素 + 它们的屏幕位置
  const candidates = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll('div, button, a, span, img, canvas');
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const txt = (el.innerText || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('aria-label') || '').trim();
      const cls = (el.className || '').toString();
      // 关注右上角（x 偏右、y 偏上）或含“清/屏/隐/藏/全屏”等字样
      const inTopRight = r.right > window.innerWidth * 0.6 && r.top < window.innerHeight * 0.35;
      const kw = /清|屏|隐|藏|全屏|fullscreen|clear|hide/i.test(txt + ' ' + cls);
      if (inTopRight || kw) {
        out.push({
          tag: el.tagName,
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          text: txt.slice(0, 30), cls: cls.slice(0, 60), kw
        });
      }
    });
    return out.sort((a, b) => (b.right + b.kw) - (a.right + a.kw));
  });
  console.log('=== candidate clickable elements (top-right / kw) ===');
  console.log(JSON.stringify(candidates.slice(0, 25), null, 1));

  // 基线截图（带 UI）
  await sleep(800);
  await page.screenshot({ path: 'probe/shots/clearbtn_baseline.png' });

  // 尝试点击最像清屏的按钮：优先 kw 命中且靠近右上角
  let clicked = null;
  for (const c of candidates) {
    if (c.kw && c.right > window.innerWidth * 0.5) {
      try {
        await page.mouse.click(c.x + c.w / 2, c.y + c.h / 2);
        clicked = c;
        break;
      } catch (e) {}
    }
  }
  if (!clicked) {
    // 兜底：点右上角绝对位置附近 (innerWidth-40, 40)
    await page.mouse.click(1440 - 40, 40);
    clicked = { text: 'fallback top-right', x: 1400, y: 40 };
  }
  console.log('clicked:', JSON.stringify(clicked));
  await sleep(1500);

  // 清屏后截图
  await page.screenshot({ path: 'probe/shots/clearbtn_after.png' });

  // 读清屏后相机状态（确认没被改变）
  const after = await page.evaluate(() => {
    const el = document.getElementById('krpanoSWFObject');
    return { h: el.get('view.hlookat'), v: el.get('view.vlookat'), fov: el.get('view.fov') };
  });
  console.log('camera after clear-click:', JSON.stringify(after));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
