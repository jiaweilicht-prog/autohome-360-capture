// calib_a6l_v2.cjs — 2026-09-05 修正版标定（修复 3 项）
//
// 修复点（与 run-p1.cjs 同步）：
//   FIX1 瓦片加载等待：loadscene 后 12000ms、每次 set('view...') 后 10000ms、清屏后 800ms、初始 3000ms。
//   FIX2 R1 构图：从二排看前排，IP+方向盘须落在画面上 1/3，下方露门+中央通道。
//         => 一般要略微抬头/朝前（而非低头）。网格重扫 h∈{-30,-15,0,15,30} × v∈{-15..15} × fov=95。
//         评分：行亮度剖面找"亮→暗"过渡行（风挡顶→IP），良好 R1 该过渡位于 25–38% 高；
//               且上部(0–40%)与下部(40–100%)都有结构化内容（非纯黑）。
//   FIX3 F1 构图：用户嫌太近、门太少 => 推到最广 fov(95)，并让主驾门可见。
//         网格重扫 h∈{-15,0,15,30} × v∈{10,15,20,25} × fov∈{90,95}。
//         评分：完整 IP 居中 + 左右两侧(门)结构化内容最大；默认 fov=95。
//
// 评分只用亮度剖面（模型无法看图，且 MSE 参考图非 A6L 系弱信号）。
// 输出：probe/calib_a6l/F1_h.._v.._f..png、R1_..png（每个候选一帧）
//       probe/calib_a6l/result3.json = {F1:{h,v,fov,score,transitionRowPct?}, R1:{...}}
//       并复制选中候选为 F1_best.png / R1_best.png。

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const PANORAMA_URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const OUT_DIR = path.join(ROOT, 'probe', 'calib_a6l');
const VIEWPORT = { width: 1440, height: 714 };   // × dpr2 = 2880x1428，与 run-p1 一致
const DPR = 2;

const WAIT_LOADSCENE = 12000;
const WAIT_SET = 10000;
const WAIT_CLEAR = 800;
const WAIT_INIT = 3000;

// ---- 网格 ----
const F1_GRID = { role: 'driver', fovList: [90, 95], hList: [-15, 0, 15, 30], vList: [10, 15, 20, 25] };
const R1_GRID = { role: 'rear',   fovList: [95],      hList: [-30, -15, 0, 15, 30], vList: [-15, -10, -5, 0, 5, 10, 15] };

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- 亮度分析 ----
function loadPNG(buf) { return PNG.sync.read(buf); }

// 返回每行的平均亮度数组（长度 H），以及整图像素亮度方差。
function rowMeans(png) {
  const { width: W, height: H, data } = png;
  const means = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    means[y] = s / W;
  }
  return means;
}
function regionVar(png, y0f, y1f, x0f, x1f) {
  const { width: W, height: H, data } = png;
  const y0 = Math.floor(H * y0f), y1 = Math.floor(H * y1f);
  const x0 = Math.floor(W * x0f), x1 = Math.floor(W * x1f);
  if (y1 <= y0 || x1 <= x0) return 0;
  let s = 0, s2 = 0, n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      s += L; s2 += L * L; n++;
    }
  }
  if (n < 2) return 0;
  const mean = s / n;
  return Math.max(0, s2 / n - mean * mean);
}

// F1 评分：完整 IP 居中 + 左右两侧(门)结构化内容最大
function scoreF1(png) {
  const { width: W, height: H } = png;
  // 居中 IP 存在感：中段(纵向 25%–65%)全宽亮度方差（IP 是横向带，内容集中在中部）
  const center = regionVar(png, 0.25, 0.65, 0.10, 0.90);
  // 左右两侧门板：纵向全幅、左(0–25%)与右(75–100%)的亮度方差之和
  const side = regionVar(png, 0.0, 1.0, 0.0, 0.25) + regionVar(png, 0.0, 1.0, 0.75, 1.0);
  return { score: center + side, center, side };
}

// R1 评分：亮→暗过渡行位于 ~32% 高，且上/下部都有结构化内容
function scoreR1(png) {
  const { width: W, height: H } = png;
  const rm = rowMeans(png);
  // 亮→暗过渡：找最大下行梯度（上一行比下一行亮最多处）
  let bestY = Math.floor(H * 0.32), bestG = -Infinity;
  for (let y = 1; y < H - 1; y++) {
    const g = rm[y - 1] - rm[y + 1];
    if (g > bestG) { bestG = g; bestY = y; }
  }
  const transitionRowPct = bestY / H;
  const varUpper = regionVar(png, 0.0, 0.40, 0.0, 1.0);
  const varLower = regionVar(png, 0.40, 1.0, 0.0, 1.0);
  const score = -Math.abs(transitionRowPct - 0.32) + 0.5 * varUpper + 0.5 * varLower;
  return { score, transitionRowPct, varUpper, varLower };
}

// ---- 浏览器辅助 ----
async function clearUI(page) {
  await page.evaluate(() => {
    const b = document.querySelector('.hide-btn');
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
}
async function setView(page, h, v, f) {
  await page.evaluate(({ hh, vv, ff }) => {
    const k = document.getElementById('krpanoSWFObject');
    k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
  }, { hh: Number(h), vv: Number(v), ff: Number(f) });
}
async function cdpShot(page) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(data, 'base64');
}
function pickScene(scenes, role) {
  const hints = role === 'driver' ? ['驾驶', '主驾', '驾驶员']
    : role === 'rear' ? ['后排', '后座', '二排']
    : ['副驾', '乘客'];
  for (const h of hints) {
    const s = scenes.find(x => x.title.includes(h));
    if (s) return s;
  }
  return null;
}

// 渲染某视角的整个网格，返回候选数组（含文件与评分）
async function renderGrid(page, scene, grid, scorer, prefix) {
  // 加载 scene 一次（首次瓦片最久）
  await page.evaluate((sn) => {
    const k = document.getElementById('krpanoSWFObject');
    k.call(`loadscene('${sn}', null, MERGE, BLEND(0.5))`);
  }, scene.name);
  // 等自动旋转停 + 首次瓦片
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    try { k.call('stopautorotate()'); } catch (e) {}
    try { k.set('autorotate.enabled', false); } catch (e) {}
  });
  await page.waitForTimeout(WAIT_LOADSCENE);

  const candidates = [];
  for (const f of grid.fovList) {
    for (const h of grid.hList) {
      for (const v of grid.vList) {
        await setView(page, h, v, f);
        await page.waitForTimeout(WAIT_SET);
        await clearUI(page);
        await page.waitForTimeout(WAIT_CLEAR);
        const buf = await cdpShot(page);
        const png = loadPNG(buf);
        const sc = scorer(png);
        const file = `${prefix}_h${h}_v${v}_f${f}.png`;
        const fpath = path.join(OUT_DIR, file);
        fs.writeFileSync(fpath, buf);
        candidates.push({ h, v, f, file, fpath, score: sc.score, detail: sc });
        console.log(`  ${prefix} h=${h} v=${v} f=${f} score=${sc.score.toFixed(2)}` +
          (sc.transitionRowPct != null ? ` transRow=${(sc.transitionRowPct * 100).toFixed(1)}%` : ''));
      }
    }
  }
  return candidates;
}

function pickBestF1(cands) {
  // 先按 score 降序；同分时优先 fov=95
  const sorted = cands.slice().sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
    return b.f - a.f;
  });
  return sorted[0];
}
function pickBestR1(cands) {
  // 过滤掉上下任一区域近乎纯黑（缺内容）的候选，再取最高分
  const ok = cands.filter(c => c.detail.varUpper > 50 && c.detail.varLower > 50);
  const pool = ok.length ? ok : cands;
  return pool.slice().sort((a, b) => b.score - a.score)[0];
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.goto(PANORAMA_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(WAIT_INIT);
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    try { k.call('stopautorotate()'); } catch (e) {}
    try { k.set('autorotate.enabled', false); } catch (e) {}
  });
  await clearUI(page);
  await page.waitForTimeout(WAIT_CLEAR);

  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return k.get('scene').getArray().map(s => ({ name: s.name, title: s.title || '' }));
  });
  console.log('scenes:', scenes.map(s => `${s.name}:${s.title}`).join(' | '));

  const result = {};

  // ---- F1 ----
  const f1scene = pickScene(scenes, F1_GRID.role);
  if (f1scene) {
    console.log(`\n=== F1 ${F1_GRID.role} scene=${f1scene.name} ===`);
    const cands = await renderGrid(page, f1scene, F1_GRID, scoreF1, 'F1');
    const best = pickBestF1(cands);
    fs.copyFileSync(best.fpath, path.join(OUT_DIR, 'F1_best.png'));
    result.F1 = { h: best.h, v: best.v, fov: best.f, score: +best.score.toFixed(3), file: best.file,
      centerVar: +best.detail.center.toFixed(1), sideVar: +best.detail.side.toFixed(1) };
    console.log(`\nF1 选角: h=${best.h} v=${best.v} fov=${best.f} score=${best.score.toFixed(2)}`);
  } else {
    console.log('F1: 找不到 driver scene');
  }

  // ---- R1 ----
  const r1scene = pickScene(scenes, R1_GRID.role);
  if (r1scene) {
    console.log(`\n=== R1 ${R1_GRID.role} scene=${r1scene.name} ===`);
    const cands = await renderGrid(page, r1scene, R1_GRID, scoreR1, 'R1');
    const best = pickBestR1(cands);
    fs.copyFileSync(best.fpath, path.join(OUT_DIR, 'R1_best.png'));
    result.R1 = { h: best.h, v: best.v, fov: best.f, score: +best.score.toFixed(3), file: best.file,
      transitionRowPct: +(best.detail.transitionRowPct * 100).toFixed(1),
      varUpper: +best.detail.varUpper.toFixed(1), varLower: +best.detail.varLower.toFixed(1) };
    console.log(`\nR1 选角: h=${best.h} v=${best.v} fov=${best.f} transRow=${result.R1.transitionRowPct}% score=${best.score.toFixed(2)}`);
  } else {
    console.log('R1: 找不到 rear scene');
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'result3.json'), JSON.stringify(result, null, 2));
  console.log('\n=== done === result3.json ->', JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
