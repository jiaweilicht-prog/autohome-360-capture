// ident_scene.cjs — 2026-09-17 副驾门视角标定·前导步骤
//
// 目的：汽车之家同一 pano 常把「不同内饰配色」存成多个同角色 scene
//       （如 Model 3 有 9 个「驾驶位」scene）。用户参考图是「黑内」，
//       而现有 F1 用的是浅内 scene，导致 MSE 被颜色噪声淹没。
//
// 本脚本：对某一角色的全部 scene，在固定角度渲染，按「暗像素占比」排序，
//       自动定位黑内 scene，并拼一张带亮度的网格图供人眼确认。
//
// 用法：
//   node ident_scene.cjs --pano 75117 --role driver --angle 15,25,95
//   node ident_scene.cjs --pano 75117 --role driver --angle 60,25,95

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const OUT = path.join(ROOT, 'probe', 'calib_door', 'ident');

const VIEWPORT = { width: 1440, height: 714 };
const DPR = 1;
const WAIT_INIT = 3500;
const WAIT_LOADSCENE = 12000;
const WAIT_SET = 8000;
const WAIT_CLEAR = 700;

const argv = process.argv.slice(2);
function arg(n) { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; }
const PANO = arg('--pano') || '75117';
const ROLE = arg('--role') || 'driver';
const ANGLE = (arg('--angle') || '15,25,95').split(',').map(Number);
const AH = ANGLE[0], AV = ANGLE[1], AF = ANGLE[2];

fs.mkdirSync(OUT, { recursive: true });

function luminanceStats(buf) {
  const png = PNG.sync.read(buf);
  const { width: W, height: H, data } = png;
  // 中心带（排除顶部天空 / 底部 UI），且只看画面中部 15%~85%
  const y0 = Math.floor(H * 0.30), y1 = Math.floor(H * 0.85);
  const x0 = Math.floor(W * 0.15), x1 = Math.floor(W * 0.85);
  let sum = 0, n = 0, dark = 0, bright = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum; n++;
    if (lum < 45) dark++;
    if (lum > 180) bright++;
  }
  return { meanLum: Math.round(sum / n), darkFrac: +(dark / n).toFixed(3), brightFrac: +(bright / n).toFixed(3) };
}

let browser, ctx, page, cdp;
async function setup() {
  browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  page = await ctx.newPage();
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
    return k.get('scene').getArray().map((s, i) => ({ i, name: s.name, title: s.title || '' }));
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
  return scenes.filter(s => {
    const t = s.title || '';
    if (role === 'driver') return /主驾|驾驶员|驾驶/.test(t) && !isPassenger(t);
    if (role === 'passenger') return isPassenger(t);
    if (role === 'rear') return /后排|后座|二排/.test(t);
    return false;
  });
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
  const targets = matchRole(scenes, ROLE);
  console.log(`\n角色=${ROLE} 命中 ${targets.length} 个 scene：`, targets.map(s => s.name).join(', '));

  const results = [];
  for (const s of targets) {
    console.log(`\n--- scene ${s.name} (${s.title}) ---`);
    await gotoScene(s.name);
    await page.waitForTimeout(WAIT_LOADSCENE);
    await ensureUIHidden();
    await setView(AH, AV, AF);
    await page.waitForTimeout(WAIT_SET);
    await ensureUIHidden();
    const buf = await shot();
    const stats = luminanceStats(Buffer.from(buf, 'base64'));
    const fname = `scene_${s.name}.png`;
    fs.writeFileSync(path.join(OUT, fname), Buffer.from(buf, 'base64'));
    results.push({ name: s.name, title: s.title, ...stats, file: fname });
    console.log(`  meanLum=${stats.meanLum}  darkFrac=${stats.darkFrac}  brightFrac=${stats.brightFrac}`);
  }

  // 排序：暗像素占比高 → 黑内可能性大
  results.sort((a, b) => b.darkFrac - a.darkFrac);
  console.log('\n=== 暗像素占比排序（高=疑似黑内）===');
  results.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}  darkFrac=${r.darkFrac}  meanLum=${r.meanLum}  (${r.file})`));

  // 拼网格图（每行一个 scene，标注暗像素占比）
  const CW = 300, CH = Math.round(CW / (VIEWPORT.width / VIEWPORT.height));
  const GAP = 8, LBL = 26;
  const cols = 3, rowsN = Math.ceil(results.length / cols);
  const W = cols * CW + (cols + 1) * GAP;
  const H = rowsN * (CH + LBL) + (rowsN + 1) * GAP;
  const grid = new PNG({ width: W, height: H });
  grid.data.fill(240);
  for (let i = 0; i < grid.data.length; i += 4) grid.data[i + 3] = 255;

  const font = (g, x, y, txt, color) => {
    // 极简像素字：用 PNG 写中文不便，这里改用编号 + 数值标注（用户看网格对照）
    const label = txt;
    for (let c = 0; c < label.length; c++) {
      const ch = label.charCodeAt(c);
      // 画一个灰块代表有文字（真实文字靠 result.json / 控制台输出）
      const px = x + c * 7;
      for (let yy = 0; yy < 12; yy++) for (let xx = 0; xx < 6; xx++) {
        const idx = ((y + yy) * W + px + xx) * 4;
        if ((ch + yy + xx) % 3 === 0) { g.data[idx] = color[0]; g.data[idx + 1] = color[1]; g.data[idx + 2] = color[2]; }
      }
    }
  };

  results.forEach((r, idx) => {
    const col = idx % cols, row = Math.floor(idx / cols);
    const x = GAP + col * (CW + GAP);
    const yTop = GAP + row * (CH + LBL + GAP);
    const png = PNG.sync.read(fs.readFileSync(path.join(OUT, r.file)));
    const sc = new PNG({ width: CW, height: CH });
    for (let y = 0; y < CH; y++) for (let x2 = 0; x2 < CW; x2++) {
      const sx = Math.min(png.width - 1, Math.floor(x2 * png.width / CW));
      const sy = Math.min(png.height - 1, Math.floor(y * png.height / CH));
      const si = (sy * png.width + sx) * 4, di = (y * CW + x2) * 4;
      sc.data[di] = png.data[si]; sc.data[di + 1] = png.data[si + 1]; sc.data[di + 2] = png.data[si + 2]; sc.data[di + 3] = 255;
    }
    sc.data.copy(grid.data, (yTop * W + x) * 4);
    // 标注行：暗像素占比（高=黑内），用红块高亮 top1
    const isTop = idx === 0;
    font(grid, x + 4, yTop + CH + 6, (idx + 1) + '#' + r.name + ' d' + r.darkFrac, isTop ? [200, 0, 0] : [60, 60, 60]);
  });

  const gridPath = path.join(OUT, `ident_${ROLE}_h${AH}.png`);
  fs.writeFileSync(gridPath, PNG.sync.write(grid));
  fs.writeFileSync(path.join(OUT, 'ident_result.json'), JSON.stringify({ pano: PANO, role: ROLE, angle: { h: AH, v: AV, f: AF }, ranked: results }, null, 2));
  console.log(`\n网格图 -> ${gridPath}`);
  console.log('疑似黑内 scene =', results[0].name, `(darkFrac=${results[0].darkFrac})`);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
