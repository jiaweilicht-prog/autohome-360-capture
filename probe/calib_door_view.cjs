// calib_door_view.cjs — 2026-09-17 新增视角「副驾侧门（门板与 IP 关系）」标定
//
// 目的：用户在汽车之家上看中一个新构图——坐主驾一侧、朝右看副驾门板，
//       画面里同时交代「副驾门板 + 它与 IP 的交接关系」。
//       需要定出：① 用哪个机位 scene ② h 相对车头方向的偏置 ③ v / fov。
//
// 方法（延续项目「直接用参考图比对」的原则）：
//   以用户给的参考图（特斯拉 Model 3，黑内）为基准，在 Model 3 全景(pano 75117)上
//   按候选网格逐个渲染，算与参考图的 MSE，并拼成一张「参考图同排对照」的网格 PNG，
//   便于人眼一次性判断（颜色差异会污染 MSE，故 MSE 只作排序参考，最终以目视定案）。
//
// 用法：
//   node calib_door_view.cjs --list --pano 75117
//   node calib_door_view.cjs --pano 75117 --role driver --offsets 30,45,60,75,90,105 --vs 15,25,35 --fovs 95
//
// 输出：probe/calib_door/<tag>/ 下的候选 PNG + grid_*.png + result.json + contact.html

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const ANCHORS = path.join(ROOT, 'config', 'p1-anchors.json');
const REF_JPG = process.env.REF_JPG || require('path').join(__dirname, 'refs', 'door_ref.jpg');

const VIEWPORT = { width: 1440, height: 714 };
const DPR = 1;
const WAIT_INIT = 3500;
const WAIT_LOADSCENE = 12000;
const WAIT_SET = 8000;      // 标定可略短（只判断构图）
const WAIT_CLEAR = 700;

const argv = process.argv.slice(2);
function arg(n) { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; }
const LIST_ONLY = argv.includes('--list');
const PANO = arg('--pano') || '75117';
const ROLE = arg('--role') || 'driver';
const OFFSETS = (arg('--offsets') || '30,45,60,75,90,105').split(',').map(Number);
const VS = (arg('--vs') || '15,25,35').split(',').map(Number);
const FOVS = (arg('--fovs') || '95').split(',').map(Number);
const TAG = arg('--tag') || 'pass1';
const SCENE_ARG = arg('--scene');   // 显式指定 scene（用于验证「黑内/浅内」等不同内饰场景）
const OUT = path.join(ROOT, 'probe', 'calib_door', TAG);
const BASE_OVERRIDE = arg('--base') != null ? Number(arg('--base')) : null;

fs.mkdirSync(OUT, { recursive: true });

const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

function frontHOf(panoId) {
  if (BASE_OVERRIDE != null) return BASE_OVERRIDE;
  try {
    const a = JSON.parse(fs.readFileSync(ANCHORS, 'utf8'));
    const rec = a[String(panoId)];
    if (rec && rec.rear && Number.isFinite(rec.rear.h)) return rec.rear.h;
    if (rec && rec.driver && Number.isFinite(rec.driver.h)) return rec.driver.h;
  } catch (e) {}
  return 0;   // 实测多数车型 0° 即车头方向
}

// ---------- 图像工具 ----------
function decodeRef() {
  const raw = jpeg.decode(fs.readFileSync(REF_JPG), { useTArray: true });
  return { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
}
function toPNG(img) {
  const p = new PNG({ width: img.width, height: img.height });
  img.data.copy(p.data);
  return p;
}
function scaleTo(img, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * img.height / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * img.width / w));
      const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
    }
  }
  return out;
}
// 中心裁剪后再比对：避开参考图左上角「汽车之家」水印与底部播放条对 MSE 的污染
function mseCenter(a, b, marginX = 0.10, marginTop = 0.12, marginBot = 0.10) {
  const W = 160, H = 80;
  const A = scaleTo(a, W, H), B = scaleTo(b, W, H);
  const x0 = Math.floor(W * marginX), x1 = Math.ceil(W * (1 - marginX));
  const y0 = Math.floor(H * marginTop), y1 = Math.ceil(H * (1 - marginBot));
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const dr = A.data[i] - B.data[i], dg = A.data[i + 1] - B.data[i + 1], db = A.data[i + 2] - B.data[i + 2];
    sum += dr * dr + dg * dg + db * db; n++;
  }
  return sum / (n * 3);
}

// ---------- 浏览器 / krpano ----------
let browser, ctx, page, cdp;
async function setup() {
  browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  page = await ctx.newPage();
  page.on('console', () => {});
  cdp = await ctx.newCDPSession(page);
}
async function shot() {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(data, 'base64');
}
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
    const k = document.getElementById('krpanoSWFObject');
    if (!k) return;
    const cnt = Number(k.get('hotspot.count'));
    for (let i = 0; i < cnt; i++) { const hs = k.get('hotspot[' + i + ']'); if (hs && hs.visible) k.set('hotspot[' + i + '].visible', false); }
  });
  await page.waitForTimeout(WAIT_CLEAR);
}
async function loadScenes() {
  return page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return k.get('scene').getArray().map((s, i) => ({
      i, name: s.name, title: s.title || '',
      hlookat: s.view && s.view.hlookat, vlookat: s.view && s.view.vlookat, fov: s.view && s.view.fov
    }));
  });
}
async function gotoScene(n) {
  await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), n);
}
async function setView(h, v, f) {
  await page.evaluate(({ hh, vv, ff }) => {
    const k = document.getElementById('krpanoSWFObject');
    k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
  }, { hh: Number(h), vv: Number(v), ff: Number(f) });
}
function matchRole(scenes, role) {
  const isPassenger = (t) => /副驾|乘客/.test(t);
  for (const s of scenes) {
    const t = s.title || '';
    if (role === 'driver' && /主驾|驾驶员|驾驶/.test(t) && !isPassenger(t)) return s;
    if (role === 'passenger' && isPassenger(t)) return s;
    if (role === 'rear' && /后排|后座|二排/.test(t)) return s;
  }
  return null;
}

(async () => {
  await setup();
  const url = `https://pano.autohome.com.cn/car/pano/${PANO}?_ahrotate=1`;
  console.log('打开', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(WAIT_INIT);
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (k) { k.call('stopautorotate()'); k.set('autorotate.enabled', false); }
  });
  await ensureUIHidden();

  const scenes = await loadScenes();
  console.log('\n=== 场景列表 ===');
  for (const s of scenes) console.log(`  [${s.i}] ${s.name}  标题="${s.title}"  默认 h=${s.hlookat} v=${s.vlookat} f=${s.fov}`);

  if (LIST_ONLY) { await browser.close(); return; }

  const frontH = frontHOf(PANO);
  console.log(`\n车头方向 frontH = ${frontH}°（来自锚点缓存/实测）`);

  const scene = SCENE_ARG ? (scenes.find(s => s.name === SCENE_ARG) || null) : matchRole(scenes, ROLE);
  if (!scene) { console.error(`找不到场景（role=${ROLE}, scene=${SCENE_ARG}）`); await browser.close(); process.exit(2); }
  console.log(`使用机位 scene=${scene.name} (${scene.title})`);

  await gotoScene(scene.name);
  await page.waitForTimeout(WAIT_LOADSCENE);
  await ensureUIHidden();

  const ref = decodeRef();
  const cands = [];
  for (const fov of FOVS) {
    for (const off of OFFSETS) {
      for (const v of VS) {
        const h = normH(frontH + off);
        process.stdout.write(`  h=${h.toFixed(0)}(off${off}) v=${v} f=${fov} ... `);
        await setView(h, v, fov);
        await page.waitForTimeout(WAIT_SET);
        await ensureUIHidden();
        const buf = await shot();
        const png = PNG.sync.read(buf);
        const img = { width: png.width, height: png.height, data: png.data };
        const err = mseCenter(img, ref);
        const fname = `off${off}_v${v}_f${fov}.png`;
        fs.writeFileSync(path.join(OUT, fname), buf);
        cands.push({ off, h: +h.toFixed(2), v, fov, mse: Math.round(err), file: fname });
        console.log('MSE', Math.round(err));
      }
    }
  }

  // ---- 网格对照 PNG：列 = 参考图 + 各 v；行 = 各 off ----
  const CW = 340, CH = Math.round(CW / 2.017);
  const GAP = 6, LABEL = 0;
  const cols = 1 + VS.length;
  const rows = OFFSETS.length;
  const W = cols * CW + (cols + 1) * GAP;
  const H = rows * CH + (rows + 1) * GAP + LABEL;
  const grid = new PNG({ width: W, height: H });
  grid.data.fill(245);
  for (let i = 0; i < grid.data.length; i += 4) grid.data[i + 3] = 255;
  const refScaled = scaleTo(ref, CW, CH);
  for (let r = 0; r < rows; r++) {
    const y = GAP + r * (CH + GAP) + LABEL;
    // 第一列：参考图（每行重复，便于逐行对照）
    refScaled.data.copy(grid.data, 0, 0, refScaled.data.length, ((y) * W + GAP) * 4);
    for (let c = 0; c < VS.length; c++) {
      const off = OFFSETS[r], v = VS[c];
      const cand = cands.find(x => x.off === off && x.v === v && x.fov === FOVS[0]);
      if (!cand) continue;
      const p = PNG.sync.read(fs.readFileSync(path.join(OUT, cand.file)));
      const sc = scaleTo(p, CW, CH);
      const x = GAP + (c + 1) * (CW + GAP);
      // 逐行 copy（PNG.data.copy 无法跨行宽直接搬）
      for (let yy = 0; yy < CH; yy++) {
        sc.data.copy(grid.data, ((y + yy) * W + x) * 4, (yy * CW) * 4, (yy * CW + CW) * 4);
      }
    }
  }
  const gridPath = path.join(OUT, `grid_f${FOVS[0]}.png`);
  fs.writeFileSync(gridPath, PNG.sync.write(grid));

  cands.sort((a, b) => a.mse - b.mse);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({
    pano: PANO, role: ROLE, frontH, scene: scene.name, sceneTitle: scene.title,
    cols: `参考图 | ${VS.map(v => 'v=' + v).join(' | ')}`,
    rows: OFFSETS.map(o => `off=${o}`),
    ranked: cands
  }, null, 2));

  console.log('\n=== MSE 排序（前 8）===');
  cands.slice(0, 8).forEach((c, i) => console.log(`  ${i + 1}. off=${c.off} h=${c.h} v=${c.v} f=${c.fov}  MSE=${c.mse}`));
  console.log(`\n网格图 -> ${gridPath}`);
  console.log('行=偏置 ' + OFFSETS.join('/') + '，列=参考图|' + VS.map(v => 'v' + v).join('|'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
