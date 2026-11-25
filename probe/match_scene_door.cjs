// match_scene_door.cjs — 2026-09-17 副驾门视角标定·定位参考图真实 scene
//
// 背景：Model 3 有 9 个「驾驶位」scene（2 浅内 + 7 黑内）。用户参考图是黑内，
//       但不知是哪一个 scene（不同 scene = 不同相机机位，角度不能简单互通）。
//       本脚本对每个 driver scene 做小范围门视角扫描，记录其「最佳 MSE」，
//       全局最佳 MSE 最低的那个 scene 即参考图真实机位；同时给出该 scene 的最佳角度。

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const REF_JPG = process.env.REF_JPG || require('path').join(__dirname, 'refs', 'door_ref.jpg');
const OUT = path.join(ROOT, 'probe', 'calib_door', 'match');

const VIEWPORT = { width: 1440, height: 714 };
const DPR = 1;
const WAIT_INIT = 3500, WAIT_LOADSCENE = 12000, WAIT_SET = 8000, WAIT_CLEAR = 700;

const argv = process.argv.slice(2);
function arg(n) { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; }
const PANO = arg('--pano') || '75117';
const OFFSETS = (arg('--offsets') || '40,55,70').split(',').map(Number);
const VS = (arg('--vs') || '24,32').split(',').map(Number);
const FOV = Number(arg('--fov') || '95');

fs.mkdirSync(OUT, { recursive: true });
const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

function decodeRef() {
  const raw = jpeg.decode(fs.readFileSync(REF_JPG), { useTArray: true });
  return { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
}
function mseCenter(a, b) {
  const W = 160, H = 80;
  const sa = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(a.width - 1, Math.floor(x * a.width / W));
    const sy = Math.min(a.height - 1, Math.floor(y * a.height / H));
    const si = (sy * a.width + sx) * 4, di = (y * W + x) * 4;
    sa.data[di] = a.data[si]; sa.data[di + 1] = a.data[si + 1]; sa.data[di + 2] = a.data[si + 2]; sa.data[di + 3] = 255;
  }
  const sb = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(b.width - 1, Math.floor(x * b.width / W));
    const sy = Math.min(b.height - 1, Math.floor(y * b.height / H));
    const si = (sy * b.width + sx) * 4, di = (y * W + x) * 4;
    sb.data[di] = b.data[si]; sb.data[di + 1] = b.data[si + 1]; sb.data[di + 2] = b.data[si + 2]; sb.data[di + 3] = 255;
  }
  const x0 = Math.floor(W * 0.10), x1 = Math.ceil(W * 0.90);
  const y0 = Math.floor(H * 0.12), y1 = Math.ceil(H * 0.90);
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const dr = sa.data[i] - sb.data[i], dg = sa.data[i + 1] - sb.data[i + 1], db = sa.data[i + 2] - sb.data[i + 2];
    sum += dr * dr + dg * dg + db * db; n++;
  }
  return sum / (n * 3);
}

let browser, ctx, page, cdp;
async function setup() {
  browser = await chromium.launch({ executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  page = await ctx.newPage(); cdp = await ctx.newCDPSession(page);
}
async function shot() { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(data, 'base64'); }
async function ensureUIHidden() {
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (k && (el === k || el.contains(k) || k.contains(el))) continue;
      if (el.querySelector && el.querySelector('canvas')) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      el.style.setProperty('display', 'none', 'important');
    }
  });
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject'); if (!k) return;
    const cnt = Number(k.get('hotspot.count'));
    for (let i = 0; i < cnt; i++) { const hs = k.get('hotspot[' + i + ']'); if (hs && hs.visible) k.set('hotspot[' + i + '].visible', false); }
  });
  await page.waitForTimeout(WAIT_CLEAR);
}
async function loadScenes() { return page.evaluate(() => document.getElementById('krpanoSWFObject').get('scene').getArray().map((s, i) => ({ i, name: s.name, title: s.title || '' }))); }
async function gotoScene(n) { await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), n); }
async function setView(h, v, f) { await page.evaluate(({ hh, vv, ff }) => { const k = document.getElementById('krpanoSWFObject'); k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff); }, { hh: Number(h), vv: Number(v), ff: Number(f) }); }
function matchRole(scenes, role) { const isP = (t) => /副驾|乘客/.test(t); return scenes.filter(s => { const t = s.title || ''; return role === 'driver' ? (/主驾|驾驶员|驾驶/.test(t) && !isP(t)) : role === 'passenger' ? isP(t) : /后排|后座|二排/.test(t); }); }

(async () => {
  await setup();
  await page.goto(`https://pano.autohome.com.cn/car/pano/${PANO}?_ahrotate=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(WAIT_INIT);
  await page.evaluate(() => { const k = document.getElementById('krpanoSWFObject'); if (k) { k.call('stopautorotate()'); k.set('autorotate.enabled', false); } });
  await ensureUIHidden();
  const scenes = await loadScenes();
  const targets = matchRole(scenes, 'driver');
  const ref = decodeRef();

  const perScene = [];
  for (const s of targets) {
    await gotoScene(s.name); await page.waitForTimeout(WAIT_LOADSCENE); await ensureUIHidden();
    let best = null;
    for (const off of OFFSETS) for (const v of VS) {
      const h = normH(off);   // pano 75117 frontH=0
      await setView(h, v, FOV); await page.waitForTimeout(WAIT_SET); await ensureUIHidden();
      const buf = Buffer.from(await shot(), 'base64');
      const png = PNG.sync.read(buf);
      const mse = mseCenter({ width: png.width, height: png.height, data: png.data }, ref);
      if (!best || mse < best.mse) { best = { off, h, v, fov: FOV, mse: Math.round(mse), buf }; }
    }
    fs.writeFileSync(path.join(OUT, `best_${s.name}.png`), best.buf);
    perScene.push({ name: s.name, title: s.title, bestOff: best.off, bestV: best.v, bestMse: best.mse });
    console.log(`scene ${s.name}: best off=${best.off} v=${best.v} MSE=${best.mse}`);
  }
  perScene.sort((a, b) => a.bestMse - b.bestMse);
  console.log('\n=== scene 排序（最佳 MSE 升序，越低越接近参考图机位）===');
  perScene.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}  off=${r.bestOff} v=${r.bestV}  MSE=${r.bestMse}`));
  fs.writeFileSync(path.join(OUT, 'match_result.json'), JSON.stringify({ pano: PANO, offsets: OFFSETS, vs: VS, fov: FOV, ranked: perScene }, null, 2));
  console.log('\n最佳匹配 scene =', perScene[0].name, `(MSE=${perScene[0].bestMse})`);
  console.log('每 scene 最佳图已存于', OUT, '（best_<scene>.png）');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
