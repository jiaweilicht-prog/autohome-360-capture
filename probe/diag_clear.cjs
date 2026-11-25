// diag_clear.cjs — 诊断清屏：dispatchEvent(合成事件) vs page.click(真实事件) 哪个真的能隐藏 UI
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';

function lum(p, y0, y1) {   // 返回指定纵向区间的平均亮度
  const png = PNG.sync.read(fs.readFileSync(p));
  const { width: W, height: H, data } = png;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
  let s = 0, n = 0;
  for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y += 3)
    for (let x = 0; x < W; x += 6) { s += L(x, y); n++; }
  return s / n;
}
function diff(a, b, y0, y1) {
  const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b));
  const { width: W, height: H } = A, da = A.data, db = B.data;
  const L = (d, x, y) => { const i = (y * W + x) * 4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; };
  let s = 0, n = 0;
  for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y += 3)
    for (let x = 0; x < W; x += 6) { s += Math.abs(L(da, x, y) - L(db, x, y)); n++; }
  return s / n;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-webgl','--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 })).newPage();
  const cdp = await page.context().newCDPSession(page);
  const shot = async (f) => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(f, Buffer.from(data, 'base64')); };

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'));
  await page.waitForTimeout(4000);

  // 载入驾驶位机位
  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    const n = +k.get('scene.count'); const o = [];
    for (let i = 0; i < n; i++) o.push({ name: k.get('scene['+i+'].name'), title: k.get('scene['+i+'].title') || '' });
    return o;
  });
  const drv = scenes.find(s => /驾驶/.test(s.title)) || scenes[0];
  await page.evaluate(n => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), drv.name);
  await page.waitForTimeout(12000);

  const domState = () => page.evaluate(() => {
    const info = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return sel + ': 不存在';
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return `${sel}: display=${cs.display} visibility=${cs.visibility} opacity=${cs.opacity} rect=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`;
    };
    return ['.hide-btn', '.show-control', '.left-btns', '.right-btns', '.toolbar'].map(info).join('\n    ');
  });

  console.log('=== 点击前 UI 状态 ===');
  console.log('    ' + await domState());
  await shot('/tmp/clear_before.png');
  console.log(`    底部15%亮度 = ${lum('/tmp/clear_before.png', 0.85, 1.0).toFixed(1)}`);

  // --- 方案1：dispatchEvent（当前代码用的方式，合成事件 isTrusted=false）---
  await page.evaluate(() => { const b = document.querySelector('.hide-btn'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); });
  await page.waitForTimeout(1200);
  await shot('/tmp/clear_after_dispatch.png');
  console.log('\n=== 方案1 dispatchEvent（当前实现）===');
  console.log('    ' + await domState());
  console.log(`    与点击前差异: 全图 ${diff('/tmp/clear_before.png','/tmp/clear_after_dispatch.png',0,1).toFixed(2)} | 底部15% ${diff('/tmp/clear_before.png','/tmp/clear_after_dispatch.png',0.85,1).toFixed(2)}`);

  // 复位：再 dispatch 一次（toggle 回来）
  await page.evaluate(() => { const b = document.querySelector('.hide-btn'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); });
  await page.waitForTimeout(1200);

  // --- 方案2：真实点击 page.click（isTrusted=true）---
  let realOk = true, err = '';
  try { await page.click('.hide-btn', { timeout: 5000 }); }
  catch (e) { realOk = false; err = e.message.split('\n')[0]; }
  await page.waitForTimeout(1200);
  await shot('/tmp/clear_after_realclick.png');
  console.log('\n=== 方案2 page.click 真实点击 ===');
  console.log(`    点击结果: ${realOk ? '成功' : '失败 -> ' + err}`);
  console.log('    ' + await domState());
  console.log(`    与点击前差异: 全图 ${diff('/tmp/clear_before.png','/tmp/clear_after_realclick.png',0,1).toFixed(2)} | 底部15% ${diff('/tmp/clear_before.png','/tmp/clear_after_realclick.png',0.85,1).toFixed(2)}`);
  console.log(`    底部15%亮度 = ${lum('/tmp/clear_after_realclick.png', 0.85, 1.0).toFixed(1)}`);

  console.log('\n判定：底部15%差异 > 3 且 UI 元素变为 display:none/visibility:hidden，即为该方案有效');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
