/* ============================================================================
 * run-p0.cjs · P0 可行性探测（程序化版）
 * 用途：用 Playwright 自动打开 7 个车型 360 全景页，注入探测器，
 *       读取相机通道 / 场景 / 机位按钮，验证「视角可写」，连拍三张做像素比对。
 * 依赖：playwright-core（随 agent-browser 安装），pngjs（像素比对）
 * 运行：node run-p0.cjs
 * ========================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'probe';
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const URLS = [
  'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/73534?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/72934?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/74238?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/75193?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/65047?_ahrotate=1',
  'https://pano.autohome.com.cn/car/pano/75906?_ahrotate=1',
];

// ---- 浏览器内执行的探测函数（不引用外部变量，纯页面上下文）----------------
function probeFn() {
  const R = { env: {}, engine: { type: 'unknown' }, camera: null, scenes: [], buttons: [], canvas: [], access: {} };
  R.env = { url: location.href, vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio, ua: navigator.userAgent };

  function probeKrpano(o) {
    if (!o || typeof o.get !== 'function') return null;
    try {
      const h = o.get('view.hlookat');
      if (h == null || h === '' || isNaN(parseFloat(h))) return null;
      return { hlookat: parseFloat(h), vlookat: parseFloat(o.get('view.vlookat')), fov: parseFloat(o.get('view.fov')) };
    } catch (e) { return null; }
  }
  function probeThree(o) {
    let cam = null;
    try { if (o.isCamera) cam = o; } catch (e) {}
    try { if (!cam && o.camera && o.camera.isCamera) cam = o.camera; } catch (e) {}
    try { if (!cam && typeof o.getCamera === 'function') { const c = o.getCamera(); if (c && c.isCamera) cam = c; } } catch (e) {}
    if (!cam) return null;
    return { yaw: cam.rotation ? +(cam.rotation.y * 180 / Math.PI).toFixed(2) : null,
             pitch: cam.rotation ? +(cam.rotation.x * 180 / Math.PI).toFixed(2) : null, fov: cam.fov || null };
  }

  const cands = [];
  function push(src, o) { if (!o || typeof o !== 'object') return; for (const c of cands) if (c.o === o) return; cands.push({ src, o }); }
  try { push("getElementById('krpanoSWFObject')", document.getElementById('krpanoSWFObject')); } catch (e) {}
  try { push('window.krpano', window.krpano); } catch (e) {}
  try { push('window.krpanoJS', window.krpanoJS); } catch (e) {}
  try { push('window.tour', window.tour); } catch (e) {}
  try {
    document.querySelectorAll('div[id],div[class],object[id],embed[id]').forEach(el => {
      const sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
      if (/krpano|pano|panorama|vrscene|viewer|360|tour/i.test(sig)) push('DOM#' + (el.id || ('' + el.className).slice(0, 30)), el);
    });
  } catch (e) {}
  try {
    Object.getOwnPropertyNames(window).forEach(n => {
      if (/krpano|pano|viewer|camera|scene|spritespin|threesixty|photosphere|tour|embedpano/i.test(n)) {
        try { const v = window[n]; if (v && typeof v === 'object') push('window.' + n, v); } catch (e) {}
      }
    });
  } catch (e) {}

  let kr = null, th = null;
  for (const c of cands) {
    const r = probeKrpano(c.o); if (r && !kr) kr = { r, src: c.src, o: c.o };
    const t = probeThree(c.o); if (t && !th) th = { t, src: c.src, o: c.o };
  }
  if (kr) { R.engine.type = 'krpano'; R.engine.src = kr.src; R.camera = kr.r; window.__KR = kr.o; }
  else if (th) { R.engine.type = 'three'; R.engine.src = th.src; R.camera = th.t; window.__KR = th.o; }
  window.__CANDS = cands.map(c => c.src);

  if (R.engine.type === 'krpano' && window.__KR) {
    try { R.engine.currentScene = window.__KR.get('xml.scene'); } catch (e) {}
    try {
      const n = parseInt(window.__KR.get('scene.count'), 10) || 0;
      for (let i = 0; i < n; i++) R.scenes.push({ i, name: window.__KR.get('scene[' + i + '].name'), title: window.__KR.get('scene[' + i + '].title') });
    } catch (e) {}
  }

  const KEY = /主驾|副驾|中控|后排|前排|门板|顶棚|全景|内饰|外观|座椅|仪表|方向盘|后备箱|视角|机位|前视|后视/;
  const hits = [];
  try {
    document.querySelectorAll('button,a,li,span,div[onclick],[role="button"],[class*=tab],[class*=btn]').forEach(el => {
      if (!el.offsetParent && el.tagName !== 'BODY') return;
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt || txt.length > 12) return;
      if (!KEY.test(txt)) return;
      hits.push({ text: txt, tag: el.tagName.toLowerCase(), id: el.id || '', cls: ('' + el.className).slice(0, 40) });
    });
  } catch (e) {}
  R.buttons = hits.slice(0, 40);

  try {
    document.querySelectorAll('canvas').forEach(c => {
      let gl = null, ct = null;
      try { gl = c.getContext('webgl2'); if (gl) ct = 'webgl2'; } catch (e) {}
      try { if (!gl) { gl = c.getContext('webgl'); if (gl) ct = 'webgl'; } } catch (e) {}
      let attr = null; try { if (gl) attr = gl.getContextAttributes(); } catch (e) {}
      R.canvas.push({ id: c.id || '(无)', css: c.clientWidth + 'x' + c.clientHeight, buf: c.width + 'x' + c.height, ctx: ct || '2d/无', pdb: attr ? String(attr.preserveDrawingBuffer) : '未知' });
    });
  } catch (e) {}

  function hasText(re) {
    try {
      const all = document.body.querySelectorAll('div,span,a,button,p');
      for (const e of all) { const t = (e.innerText || '').trim(); if (t && t.length < 60 && re.test(t)) return t.slice(0, 30); }
    } catch (e) {}
    return null;
  }
  R.access.login = hasText(/登录|注册|请先登录|登录后查看/);
  R.access.captcha = hasText(/验证码|滑动验证|请完成安全验证/);
  let loading = null; try { loading = document.querySelector('.loading,.pano-loading,.progress,.spinner,[class*=load]'); } catch (e) {}
  R.access.loading = loading ? ('' + loading.className).slice(0, 40) : null;
  let ov = 0; try { ov = document.querySelectorAll('[class*=modal],[class*=popup],[class*=dialog],[class*=mask],[class*=float],[class*=guide],[class*=download]').length; } catch (e) {}
  R.access.overlays = ov;
  return R;
}

async function runOne(browser, url, idx) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const out = { idx, url, ok: false };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const canvasReady = await page.waitForFunction(
      () => { const c = document.querySelector('canvas'); return c && c.width > 0 && c.height > 0; },
      { timeout: 30000 }
    ).then(() => true).catch(() => false);
    out.canvasReady = canvasReady;
    await page.waitForTimeout(4000); // 让全景切片加载一会儿

    const report = await page.evaluate(probeFn);
    out.report = report;

    // 可写验证：把水平角 set 到新值，看是否变化
    if (report.engine.type === 'krpano' && report.camera) {
      try {
        const before = await page.evaluate(() => window.__KR.get('view.hlookat'));
        const target = (before == null) ? 90 : ((before + 90) % 360);
        await page.evaluate((t) => { try { window.__KR.set('view.hlookat', t); } catch (e) {} }, target);
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => window.__KR.get('view.hlookat'));
        out.writable = Math.abs((after || 0) - (before || 0)) > 0.5;
        out.testSet = { before, target, after };
      } catch (e) { out.writable = 'error:' + e.message; }
    }

    // 连拍三张
    const shots = [];
    for (let k = 0; k < 3; k++) {
      const p = path.join(SHOTS, `car${idx}_${k}.png`);
      await page.screenshot({ path: p });
      shots.push(p);
      await page.waitForTimeout(800);
    }
    out.shots = shots;
    out.ok = true;
  } catch (e) {
    out.error = e.message;
  } finally {
    await page.close();
  }
  return out;
}

// 像素比对：优先 pngjs 算差异像素比例，回退 md5
function compareThree(paths) {
  let PNG = null;
  try { PNG = require('pngjs').PNG; } catch (e) { PNG = null; }
  const bufs = paths.map(p => fs.readFileSync(p));
  if (!PNG) {
    const md5 = bufs.map(b => crypto.createHash('md5').update(b).digest('hex'));
    const identical = md5[0] === md5[1] && md5[1] === md5[2];
    return { method: 'md5', identical, md5 };
  }
  const imgs = bufs.map(b => PNG.sync.read(b));
  const w = Math.min(...imgs.map(i => i.width)), h = Math.min(...imgs.map(i => i.height));
  function diff(a, b) {
    let diffPix = 0, sum = 0;
    for (let i = 0; i < w * h; i++) {
      const ia = i * 4, ib = i * 4;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a.data[ia + c] - b.data[ib + c]);
        sum += d; if (d > 30) diffPix++;
      }
    }
    const total = w * h;
    return { mad: +(sum / (total * 3)).toFixed(2), diffPixelPct: +(100 * diffPix / total).toFixed(3) };
  }
  const p01 = diff(imgs[0], imgs[1]);
  const p12 = diff(imgs[1], imgs[2]);
  const p02 = diff(imgs[0], imgs[2]);
  const maxDiff = Math.max(p01.diffPixelPct, p12.diffPixelPct, p02.diffPixelPct);
  return { method: 'pngjs', maxDiffPixelPct: maxDiff, pairs: { '0-1': p01, '1-2': p12, '0-2': p02 },
           verdict: maxDiff < 0.05 ? '稳定(可设高阈值)' : maxDiff < 1 ? '基本稳定(阈值需放宽)' : '抖动明显(需连拍取中位或降级)' };
}

(async () => {
  const exe = process.env.P0_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    headless: true,
    executablePath: exe,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const results = [];
  for (let i = 0; i < URLS.length; i++) {
    console.log(`\n[${i + 1}/${URLS.length}] 探测 ${URLS[i]}`);
    const r = await runOne(browser, URLS[i], i);
    if (r.report) {
      const e = r.report.engine;
      console.log(`  engine=${e.type} camera=${e.type !== 'unknown' ? JSON.stringify(e.camera) : '-'} scenes=${r.report.scenes.length} buttons=${r.report.buttons.length} canvas=${r.report.canvas.length}`);
      console.log(`  login=${r.report.access.login || '无'} captcha=${r.report.access.captcha || '无'} overlays=${r.report.access.overlays}`);
      if (r.writable !== undefined) console.log(`  writable=${r.writable} testSet=${JSON.stringify(r.testSet)}`);
    } else {
      console.log(`  !! 探测失败: ${r.error || 'canvas 未就绪'}`);
    }
    if (r.shots) {
      try { r.pixel = compareThree(r.shots); console.log(`  像素比对(${r.pixel.method}): ${JSON.stringify(r.pixel.verdict || r.pixel.identical)}`); }
      catch (e) { r.pixel = { error: e.message }; }
    }
    results.push(r);
    await new Promise(res => setTimeout(res, 1500));
  }
  await browser.close();
  const jsonPath = path.join(ROOT, 'p0-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log('\n==== 探测完成，结果已写入 ' + jsonPath + ' ====');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
