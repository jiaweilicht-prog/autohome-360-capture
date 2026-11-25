/* smoke2.cjs · 根因验证：停转+长等待后，同机位连拍是否一致？并记录相机数值是否稳定 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const PNG = require('pngjs').PNG;
const URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function probeFn() {
  const cands = [];
  function push(s, o) { if (!o || typeof o !== 'object') return; for (const c of cands) if (c.o === o) return; cands.push({ s, o }); }
  try { push("krpanoSWFObject", document.getElementById('krpanoSWFObject')); } catch (e) {}
  try { push('window.krpano', window.krpano); } catch (e) {}
  try { push('window.tour', window.tour); } catch (e) {}
  function pk(o) { try { const h = o.get('view.hlookat'); if (h == null || isNaN(parseFloat(h))) return null; return { hlookat: parseFloat(h), vlookat: parseFloat(o.get('view.vlookat')) }; } catch (e) { return null; } }
  for (const c of cands) { const r = pk(c.o); if (r) { window.__KR = c.o; return r; } }
  // 退化扫描
  try { Object.getOwnPropertyNames(window).forEach(n => { if (/krpano|tour|pano/i.test(n)) { try { const v = window[n]; if (v && typeof v.get === 'function') { const r = pk(v); if (r) { window.__KR = v; } } } catch (e) {} } }); } catch (e) {}
  return window.__KR ? { hlookat: parseFloat(window.__KR.get('view.hlookat')), vlookat: parseFloat(window.__KR.get('view.vlookat')) } : null;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => { const c = document.querySelector('canvas'); return c && c.width > 0; }, { timeout: 30000 });
  await page.evaluate(probeFn); // 设置 window.__KR
  console.log('--- 长等待 12s 让 tiles 加载 ---');
  await page.waitForTimeout(12000);
  const stop = await page.evaluate(() => {
    if (!window.__KR) return 'noKR';
    const m = [];
    try { window.__KR.call('stopautorotate'); m.push('stopautorotate'); } catch (e) { m.push('stopERR'); }
    try { window.__KR.set('autorotate.enabled', false); m.push('setFalse'); } catch (e) { m.push('setERR'); }
    return m.join('|');
  });
  console.log('停转指令结果 =', stop);
  await page.waitForTimeout(2000);

  const readCam = () => page.evaluate(() => ({ h: +window.__KR.get('view.hlookat').toFixed(3), v: +window.__KR.get('view.vlookat').toFixed(3) }));
  const cams = [];
  const shots = [];
  for (let k = 0; k < 3; k++) {
    const p = '/tmp/v2_' + k + '.png';
    await page.screenshot({ path: p });
    shots.push(PNG.sync.read(fs.readFileSync(p)));
    cams.push(await readCam());
    await page.waitForTimeout(800);
  }
  console.log('相机数值连读 =', JSON.stringify(cams));
  function diff(a, b) { const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height); let dp = 0, sum = 0; for (let i = 0; i < w * h; i++) { const ia = i * 4, ib = i * 4; for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[ia + c] - b.data[ib + c]); sum += d; if (d > 30) dp++; } } const t = w * h; return { mad: +(sum / (t * 3)).toFixed(2), pct: +(100 * dp / t).toFixed(3) }; }
  const d01 = diff(shots[0], shots[1]), d12 = diff(shots[1], shots[2]), d02 = diff(shots[0], shots[2]);
  const max = Math.max(d01.pct, d12.pct, d02.pct);
  console.log('停转+长等待后 连拍差异: maxDiff=' + max + '%  pairs=' + JSON.stringify({ d01, d12, d02 }));
  console.log(max < 0.5 ? '=> 画面已稳定，复现可靠（差异来自加载/旋转，已通过停转+等待消除）' : '=> 仍明显差异，需进一步排查（可能含动态 UI/水印动画）');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
