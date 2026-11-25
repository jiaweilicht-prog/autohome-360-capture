/* smoke.cjs · 单 URL 冒烟测试：验证 Chrome 启动 / 页面可加载 / 相机通道可读 */
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function probeFn() {
  const R = { env: {}, engine: { type: 'unknown' }, camera: null, scenes: [], buttons: [], canvas: [], access: {} };
  R.env = { url: location.href, vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio, ua: navigator.userAgent };
  function probeKrpano(o) {
    if (!o || typeof o.get !== 'function') return null;
    try { const h = o.get('view.hlookat'); if (h == null || h === '' || isNaN(parseFloat(h))) return null;
      return { hlookat: parseFloat(h), vlookat: parseFloat(o.get('view.vlookat')), fov: parseFloat(o.get('view.fov')) }; } catch (e) { return null; }
  }
  function probeThree(o) {
    let cam = null;
    try { if (o.isCamera) cam = o; } catch (e) {}
    try { if (!cam && o.camera && o.camera.isCamera) cam = o.camera; } catch (e) {}
    try { if (!cam && typeof o.getCamera === 'function') { const c = o.getCamera(); if (c && c.isCamera) cam = c; } } catch (e) {}
    if (!cam) return null;
    return { yaw: cam.rotation ? +(cam.rotation.y * 180 / Math.PI).toFixed(2) : null, pitch: cam.rotation ? +(cam.rotation.x * 180 / Math.PI).toFixed(2) : null, fov: cam.fov || null };
  }
  const cands = [];
  function push(src, o) { if (!o || typeof o !== 'object') return; for (const c of cands) if (c.o === o) return; cands.push({ src, o }); }
  try { push("getElementById('krpanoSWFObject')", document.getElementById('krpanoSWFObject')); } catch (e) {}
  try { push('window.krpano', window.krpano); } catch (e) {}
  try { push('window.krpanoJS', window.krpanoJS); } catch (e) {}
  try { push('window.tour', window.tour); } catch (e) {}
  try { document.querySelectorAll('div[id],div[class],object[id],embed[id]').forEach(el => { const sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : ''); if (/krpano|pano|panorama|vrscene|viewer|360|tour/i.test(sig)) push('DOM#' + (el.id || ('' + el.className).slice(0, 30)), el); }); } catch (e) {}
  try { Object.getOwnPropertyNames(window).forEach(n => { if (/krpano|pano|viewer|camera|scene|spritespin|threesixty|photosphere|tour|embedpano/i.test(n)) { try { const v = window[n]; if (v && typeof v === 'object') push('window.' + n, v); } catch (e) {} } }); } catch (e) {}
  let kr = null, th = null;
  for (const c of cands) { const r = probeKrpano(c.o); if (r && !kr) kr = { r, src: c.src, o: c.o }; const t = probeThree(c.o); if (t && !th) th = { t, src: c.src, o: c.o }; }
  if (kr) { R.engine.type = 'krpano'; R.engine.src = kr.src; R.camera = kr.r; window.__KR = kr.o; }
  else if (th) { R.engine.type = 'three'; R.engine.src = th.src; R.camera = th.t; window.__KR = th.o; }
  window.__CANDS = cands.map(c => c.src);
  if (R.engine.type === 'krpano' && window.__KR) {
    try { R.engine.currentScene = window.__KR.get('xml.scene'); } catch (e) {}
    try { const n = parseInt(window.__KR.get('scene.count'), 10) || 0; for (let i = 0; i < n; i++) R.scenes.push({ i, name: window.__KR.get('scene[' + i + '].name'), title: window.__KR.get('scene[' + i + '].title') }); } catch (e) {}
  }
  const KEY = /主驾|副驾|中控|后排|前排|门板|顶棚|全景|内饰|外观|座椅|仪表|方向盘|后备箱|视角|机位|前视|后视/;
  const hits = [];
  try { document.querySelectorAll('button,a,li,span,div[onclick],[role="button"],[class*=tab],[class*=btn]').forEach(el => { if (!el.offsetParent && el.tagName !== 'BODY') return; const txt = (el.innerText || el.textContent || '').trim(); if (!txt || txt.length > 12) return; if (!KEY.test(txt)) return; hits.push({ text: txt, tag: el.tagName.toLowerCase(), id: el.id || '', cls: ('' + el.className).slice(0, 40) }); }); } catch (e) {}
  R.buttons = hits.slice(0, 40);
  try { document.querySelectorAll('canvas').forEach(c => { let gl = null, ct = null; try { gl = c.getContext('webgl2'); if (gl) ct = 'webgl2'; } catch (e) {} try { if (!gl) { gl = c.getContext('webgl'); if (gl) ct = 'webgl'; } } catch (e) {} let attr = null; try { if (gl) attr = gl.getContextAttributes(); } catch (e) {} R.canvas.push({ id: c.id || '(无)', css: c.clientWidth + 'x' + c.clientHeight, buf: c.width + 'x' + c.height, ctx: ct || '2d/无', pdb: attr ? String(attr.preserveDrawingBuffer) : '未知' }); }); } catch (e) {}
  function hasText(re) { try { const all = document.body.querySelectorAll('div,span,a,button,p'); for (const e of all) { const t = (e.innerText || '').trim(); if (t && t.length < 60 && re.test(t)) return t.slice(0, 30); } } catch (e) {} return null; }
  R.access.login = hasText(/登录|注册|请先登录|登录后查看/);
  R.access.captcha = hasText(/验证码|滑动验证|请完成安全验证/);
  let loading = null; try { loading = document.querySelector('.loading,.pano-loading,.progress,.spinner,[class*=load]'); } catch (e) {}
  R.access.loading = loading ? ('' + loading.className).slice(0, 40) : null;
  let ov = 0; try { ov = document.querySelectorAll('[class*=modal],[class*=popup],[class*=dialog],[class*=mask],[class*=float],[class*=guide],[class*=download]').length; } catch (e) {}
  R.access.overlays = ov;
  return R;
}

(async () => {
  console.log('launching chrome...');
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  console.log('goto', URL);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  const ready = await page.waitForFunction(() => { const c = document.querySelector('canvas'); return c && c.width > 0 && c.height > 0; }, { timeout: 30000 }).then(() => true).catch(() => false);
  console.log('canvasReady =', ready);
  await page.waitForTimeout(4000);
  const r = await page.evaluate(probeFn);
  console.log('PROBE =', JSON.stringify({ engine: r.engine, camera: r.camera, scenes: r.scenes.length, buttons: r.buttons.slice(0, 10), canvas: r.canvas, access: r.access }, null, 2));
  if (r.engine.type === 'krpano') {
    try {
      const before = await page.evaluate(() => window.__KR.get('view.hlookat'));
      const target = (before == null) ? 90 : ((before + 90) % 360);
      await page.evaluate((t) => { try { window.__KR.set('view.hlookat', t); } catch (e) {} }, target);
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => window.__KR.get('view.hlookat'));
      console.log('WRITABLE TEST before/after/target =', before, after, target, '=> writable:', Math.abs((after || 0) - (before || 0)) > 0.5);
    } catch (e) { console.log('writable test error:', e.message); }
  }
  await page.screenshot({ path: '/tmp/smoke.png' });
  console.log('screenshot saved /tmp/smoke.png');
  await browser.close();
  console.log('SMOKE DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
