// calib_a6l_lower.cjs — 2026-09-05 垂直下探重扫
//
// 背景：用户反馈所有视角偏高（A 柱太多、中控台太少），需把相机再向下 3–10°。
// krpano 中 vlookat 正值 = 向下看，因此「再向下」= 增大 vlookat。
//
// 本脚本固定 h 与 fov（沿用已标定基角），只在「更低 v」的区间内扫描，
// 渲染 krpano 后用 pngjs + jpeg-js 算与参考 jpg 的 MSE，存 PNG 到 probe/calib_a6l/，
// 按任务要求在范围内选最优。
//
//   F1: h=15, fov=90, v ∈ {15,18,21,24,27}   (相对基线15再+0..+12；3–10°区间 v∈[18,25])
//   R1: h=-15, fov=95, v ∈ {-10,-7,-4,-1,2,5} (相对基线-10再+0..+15；3–10°区间 v∈[-7,5])
//
// 选角规则：
//   F1: 参考图很可能不是 A6L（历史 MSE 极高），MSE 是弱信号。若范围内 MSE 差异小，
//       取 v≈+8（约 v=23，3–10 的中间值）以明确回应「偏高」。
//   R1: MSE 可靠，取范围内最低 MSE。
//
// 复用 calib_a6l_views.cjs 的脚手架（CDP 截图、MSE、pickScene）。

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANORAMA_URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const REF_DIR = process.env.REF_DIR || require('path').join(__dirname, 'refs');
const OUT_DIR = 'probe/calib_a6l';
const VIEWPORT = { width: 1920, height: 953 };
const DPR = 1;

const REFS = {
  F1: { file: 'clipboard-2026-09-04T22-25-15-183Z-96897b39.jpg', sceneRole: 'driver', name: '主驾正视前排IP' },
  R1: { file: 'clipboard-2026-09-04T22-25-15-187Z-ddf2b00f.jpg', sceneRole: 'rear',   name: '二排正视前排' }
};

// 每个视角的固定 h / fov 与下探 v 区间
const SWEEP = {
  F1: { h: 15, fov: 90, vList: [15, 18, 21, 24, 27], vRange: [18, 25], mseWeak: true },
  R1: { h: -15, fov: 95, vList: [-10, -7, -4, -1, 2, 5], vRange: [-7, 5], mseWeak: false }
};

fs.mkdirSync(OUT_DIR, { recursive: true });

function readRef(file) {
  const buf = fs.readFileSync(path.join(REF_DIR, file));
  const raw = jpeg.decode(buf, { useTArray: true });
  return { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
}

function mse(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let sum = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const dr = a.data[ia] - b.data[ib];
      const dg = a.data[ia + 1] - b.data[ib + 1];
      const db = a.data[ia + 2] - b.data[ib + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
    }
  }
  return sum / (n * 3);
}

async function cdpShot(page) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(data, 'base64');
}

function pickScene(scenes, role) {
  const hints = role === 'driver'
    ? ['驾驶', '主驾', '驾驶员']
    : role === 'rear'
      ? ['后排', '后座', '二排']
      : ['副驾', '乘客'];
  for (const h of hints) {
    const s = scenes.find(x => x.title.includes(h));
    if (s) return s;
  }
  return null;
}

function pickBest(vid, candidates) {
  const cfg = SWEEP[vid];
  const inRange = candidates.filter(c => c.v >= cfg.vRange[0] && c.v <= cfg.vRange[1]);
  // 范围内按 MSE 升序
  const sorted = inRange.slice().sort((a, b) => a.mse - b.mse);
  if (cfg.mseWeak) {
    // MSE 弱信号：看范围内最低与最高差异，若小（<8% 相对差）则取中间 v≈+8（基线+8）
    const base = cfg.vList.includes(15) ? 15 : cfg.vList[0];
    const midV = base + 8;
    const nearest = sorted.reduce((p, c) =>
      Math.abs(c.v - midV) < Math.abs(p.v - midV) ? c : p, sorted[0]);
    const spread = sorted.length > 1 ? (sorted[sorted.length - 1].mse - sorted[0].mse) / sorted[0].mse : 0;
    const chosen = spread < 0.08 ? nearest : sorted[0];
    return { chosen, weakSignal: true, spread, candidateCount: inRange.length };
  }
  return { chosen: sorted[0], weakSignal: false, candidateCount: inRange.length };
}

(async () => {
  const refs = Object.fromEntries(Object.entries(REFS).map(([k, v]) => [k, readRef(v.file)]));

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.goto(PANORAMA_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (k) { k.call('stopautorotate()'); k.set('autorotate.enabled', false); }
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const b = document.querySelector('.hide-btn');
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await page.waitForTimeout(500);

  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return k.get('scene').getArray().map(s => ({ name: s.name, title: s.title || '' }));
  });
  console.log('scenes:', scenes.map(s => `${s.name}:${s.title}`).join(' | '));

  const result2 = {};
  const allCandidates = {};

  for (const [vid, cfg] of Object.entries(SWEEP)) {
    console.log(`\n=== ${vid} ${REFS[vid].name} (h=${cfg.h} fov=${cfg.fov}) ===`);
    const scene = pickScene(scenes, REFS[vid].sceneRole);
    if (!scene) { console.log(`  找不到 ${REFS[vid].sceneRole} scene，跳过`); continue; }
    console.log(`  scene=${scene.name} (${scene.title})`);

    // 加载 scene 一次（首次加载瓦片更久），之后只改 v
    await page.evaluate((sn) => {
      const k = document.getElementById('krpanoSWFObject');
      k.call(`loadscene('${sn}', null, MERGE, BLEND(0.5))`);
    }, scene.name);
    await page.waitForTimeout(2500);

    const candidates = [];
    for (const v of cfg.vList) {
      process.stdout.write(`  v=${v} ... `);
      await page.evaluate(({ h, v, f }) => {
        const k = document.getElementById('krpanoSWFObject');
        k.set('view.hlookat', h);
        k.set('view.vlookat', v);
        k.set('view.fov', f);
      }, { h: cfg.h, v, f: cfg.fov });
      await page.waitForTimeout(2500);
      const buf = await cdpShot(page);
      const png = PNG.sync.read(buf);
      const img = { width: png.width, height: png.height, data: png.data };
      const err = mse(img, refs[vid]);
      const fname = `${vid}_h${cfg.h}_v${v}_f${cfg.fov}.png`;
      const fpath = path.join(OUT_DIR, fname);
      fs.writeFileSync(fpath, buf);
      candidates.push({ h: cfg.h, v, f: cfg.fov, mse: err, fpath, file: fname });
      console.log('MSE', Math.round(err));
    }
    candidates.sort((a, b) => a.mse - b.mse);
    allCandidates[vid] = candidates;

    const { chosen, weakSignal, spread, candidateCount } = pickBest(vid, candidates);
    result2[vid] = { h: chosen.h, v: chosen.v, fov: chosen.f, mse: chosen.mse, weakSignal, spread, candidateCount };
    console.log(`\n  ${vid} 选角: h=${chosen.h} v=${chosen.v} fov=${chosen.f} MSE=${Math.round(chosen.mse)}` +
      (weakSignal ? ` (MSE弱信号${spread != null ? ' 区间相对差=' + (spread * 100).toFixed(1) + '%' : ''})` : ''));

    fs.writeFileSync(path.join(OUT_DIR, `${vid}_lower_candidates.json`),
      JSON.stringify(candidates.map(c => ({ h: c.h, v: c.v, f: c.f, mse: c.mse, file: c.file })), null, 2));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'result2.json'), JSON.stringify(result2, null, 2));
  console.log('\n=== done === result2.json ->', JSON.stringify(result2, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
