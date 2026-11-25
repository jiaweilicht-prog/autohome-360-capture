// run-p1.cjs  —  P1 批量截图流水线（2026-09-05 第四轮：跨车一致性）
//
// 一致性模型（关键改动）：
//   汽车之家每台车 360 全景的「0° 起点」随机，直接写死 h=0 在不同车上指向不同方位。
//   改为：每台车每个机位先用亮度扫描找到它「自己正对车头中心」的方向 frontAnchorH（缓存），
//   实际截图用 h = frontAnchorH + 视角相对偏置。这样所有车都落在「正对车头」的同一取景点，
//   v / fov 用用户确认的绝对值，跨车视角一致。
//
// 清屏修复：.hide-btn 是「切换」按钮，旧代码在 autoOrient 与截图前各点一次 → 二次点击把 UI 重新显示。
//   改为：每个 scene 载入后只调用一次 ensureUIHidden（带可见性校验，绝不会误切回显示）。
//
// 稳定性：锚定扫描用短等待（只需粗略亮度判据），正式截图用长等待（瓦片加载完）。
//   每 RESTART_EVERY 台车重启一次浏览器释放内存；单台车崩溃时重启后自动重试一次。
//
// 运行：NODE_PATH=.../node_modules node run-p1.cjs [--max N] [--views F1,R1] [--only-pano ID] [--no-skip]

const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// Chrome 路径：优先用环境变量 CHROME_PATH，否则按系统自动探测（换机/跨平台可直接用）
const CHROME = process.env.CHROME_PATH || (
  process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome'
);
// 项目根：由脚本自身位置推导，避免依赖「从哪个目录启动」
const ROOT = path.resolve(__dirname, '..');
const _discArg = (() => { const i = process.argv.indexOf('--discovery'); return i >= 0 ? process.argv[i + 1] : null; })();
const DISCOVERY = _discArg ? path.resolve(_discArg) : path.join(ROOT, 'probe', 'p1-discovery.json');
const CALIB = path.join(ROOT, 'config', 'p1-calibration.json');
// 并行分片时各进程需写各自的锚点/状态文件，避免互相覆盖；跑完再合并。
const ANCHOR_FILE = process.env.P1_ANCHORS || path.join(ROOT, 'config', 'p1-anchors.json');
const OUTPUT = path.join(ROOT, 'output');
// 目录组织：按「视角」统一归类，不再按品牌/车型分目录（Licht 要求）。
// 文件名仍保留 品牌_车型_视角 信息，保证每个文件仍可辨别具体车型。
const IMG_DIR = path.join(OUTPUT, 'images_by_view');
const STATE_FILE = process.env.P1_STATE || path.join(OUTPUT, 'manifest.json');
const FAIL_CSV = path.join(OUTPUT, 'failures.csv');
const NO360_CSV = path.join(OUTPUT, 'no360_log.csv');
const REPORT = path.join(OUTPUT, 'report.html');
const REF_FILE = path.join(ROOT, 'config', 'ref_profiles.json');

// 参考模板：以用户已确认的 A6L 正确视角（F1: h15/v25/f95，R1: h0/v15/f95）渲染得到的
// 灰度降采样轮廓，作为「车头正前方」的判定模板。每台车的锚点方向（锚点 vs 锚点+180°）
// 各快速渲染一次，与对应角色的模板比对 MSE，选更像「正对车头」的那个 → 彻底消除 180° 误判。
let REF = null;
const PROF_W = 32, PROF_H = 16;
function computeProfile(buf) {
  let png; try { png = PNG.sync.read(buf); } catch (e) { return null; }
  const { width: W, height: H, data } = png;
  const grid = new Array(PROF_W * PROF_H);   // 普通数组（Float64Array 经 JSON 序列化会丢失 .length）
  const cw = Math.floor(W / PROF_W), ch = Math.floor(H / PROF_H);
  for (let gy = 0; gy < PROF_H; gy++) for (let gx = 0; gx < PROF_W; gx++) {
    let s = 0, n = 0;
    for (let y = gy * ch; y < (gy + 1) * ch; y++) for (let x = gx * cw; x < (gx + 1) * cw; x++) {
      const i = (y * W + x) * 4; s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++;
    }
    grid[gy * PROF_W + gx] = s / n;
  }
  return grid;
}
function profileMSE(a, b) {
  if (!a || !b || a.length !== b.length) return 1e9;
  let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s / a.length;
}
function meanLum(prof) { if (!prof) return 0; let s = 0; for (const v of prof) s += v; return s / prof.length; }
// 上部亮带均值（挡风玻璃朝前时更亮，用于区分朝前/朝后）
function topBright(prof) { if (!prof) return 0; let s = 0, n = 0; for (let y = 0; y < 5; y++) for (let x = 0; x < PROF_W; x++) { s += prof[y * PROF_W + x]; n++; } return s / n; }
// 左右镜像对称度（上重下轻，避开方向盘对下部的非对称干扰）。0..1，越高越「正对前方、IP 居中」。
// 用于：(a) 在车头方向附近求「驾驶位 IP 居中」偏移；(b) 选色时做平手裁判，避免选到偏位相机。
function symmetry(prof) {
  if (!prof) return 0;
  let num = 0, den = 0;
  for (let y = 0; y < PROF_H; y++) {
    const w = y < 9 ? 1.0 : 0.35;   // 下部(含方向盘)权重降低
    for (let x = 0; x < PROF_W / 2; x++) {
      const a = prof[y * PROF_W + x], b = prof[y * PROF_W + (PROF_W - 1 - x)];
      num += w * Math.abs(a - b); den += w * (Math.abs(a) + Math.abs(b) + 1e-6);
    }
  }
  return 1 - num / den;
}
async function ensureRefProfiles() {
  if (fs.existsSync(REF_FILE)) { REF = readJSON(REF_FILE); console.log('参考模板已加载 (config/ref_profiles.json)'); return; }
  console.log('生成参考模板（依据 A6L 用户确认角 F1=h15/v25、R1=h0/v15）...');
  const pano = '76524';
  const t = (require(DISCOVERY).results || []).find(r => String(r.panoId) === pano) || { panoUrl: `https://pano.autohome.com.cn/car/pano/${pano}` };
  await page.goto(t.panoUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
  await page.waitForTimeout(WAIT_INIT);
  const scenes = await loadScenes(page);
  const driver = pickScene(scenes, 'driver', 0), rear = pickScene(scenes, 'rear', 0);
  if (!driver || !rear) throw new Error('A6L 参考场景缺失: driver=' + !!driver + ' rear=' + !!rear);
  REF = {};
  for (const [role, sc, ang] of [['driver', driver, { h: 15, v: 25 }], ['rear', rear, { h: 0, v: 15 }]]) {
    await gotoScene(sc.name); await page.waitForTimeout(WAIT_LOADSCENE); await ensureUIHidden(); await page.waitForTimeout(WAIT_CLEAR);
    await setView(ang.h, ang.v, 95); await page.waitForTimeout(WAIT_SET);
    await ensureUIHidden();
    REF[role] = computeProfile(await shotBuffer());
    console.log(`  参考模板 ${role} 已生成`);
  }
  fs.writeFileSync(REF_FILE, JSON.stringify(REF));
  console.log('参考模板已保存 -> config/ref_profiles.json');
}

const VIEWPORT = { width: 1440, height: 714 };
const DEVICE_SCALE_FACTOR = 2;

const WAIT_LOADSCENE = 12000;   // loadscene 后瓦片加载
const WAIT_SET = 10000;         // 正式截图前的设角等待（瓦片必须加载完，否则糊）
const WAIT_SCAN = 2500;         // 锚定扫描等待（只取粗略亮度判据，无需高清）
const WAIT_CLEAR = 800;
const WAIT_INIT = 3000;
const CAR_INTERVAL = 1200;
const RESTART_EVERY = 8;        // 每 8 台车重启浏览器，避免长时间运行内存累积崩溃
// 匹配模糊闸门：模板扫描「最优方向与次优方向的 MSE 间距」低于此值 = 匹配模糊，进 anchor_review.csv 供复核。
const SEP_MIN = 100;
// ---- 出图自动体检（2026-09-09 加）----
// 每张图落盘后立刻从成品图计算「左右对称度 / 上部亮带」，低于阈值即打标，
// 写进 sidecar 与 output/qc_flags.csv —— 让「可疑图」被机器先筛出来，而不是混在成品里。
// 阈值依据：后排正对前方实测 0.93~0.96；驾驶位因相机偏左，对称度天然更低，先取保守值，
// 本次 5 台样张跑完会用实测分布校准。
const QC_SYM_MIN_REAR = 0.88;
const QC_SYM_MIN_DRIVER = 0.75;
// 0°/180° 亮带差的最小可靠裕度：差太小说明「朝前/朝后」分不开（如 iX3 差 3、7系 差 2）
const QC_TOP_MARGIN_MIN = 8;

const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }
const MAX = arg('--max') ? parseInt(arg('--max'), 10) : Infinity;
const VIEWS_ARG = arg('--views') ? arg('--views').split(',') : ['F1', 'R1'];
const ONLY_PANO = arg('--only-pano');
const NO_SKIP = argv.includes('--no-skip');
// 分片并行：--shard i/N 表示「第 i 片 / 共 N 片」。同时起 N 个进程各跑一片即可把总耗时压到约 1/N。
const SHARD = arg('--shard');
// 极致提速（--fast-scene）：跳过「逐个候选 scene 渲染比对挑最浅色/居中」，
// 直接取第一个匹配机位的 scene，只省「挑站位」环节；找车头仍走 0° 快速通道。
const FAST_SCENE = argv.includes('--fast-scene');

function sanitize(s) { return String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 110); }
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function loadState() { try { return readJSON(STATE_FILE); } catch (e) { return { items: {} }; } }
function saveState(st) { fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2)); }
const normH = (x) => ((x + 180) % 360 + 360) % 360 - 180;

function loadAnchors() { try { return readJSON(ANCHOR_FILE); } catch (e) { return {}; } }
function saveAnchors(a) { fs.writeFileSync(ANCHOR_FILE, JSON.stringify(a, null, 2)); }
let anchors = loadAnchors();

// ---- 浏览器句柄（模块级，支持重启）----
let browser = null, ctx = null, page = null, cdp = null;
async function setupBrowser() {
  browser = await chromium.launch({ executablePath: CHROME, headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'] });
  ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  page = await ctx.newPage();
  cdp = await ctx.newCDPSession(page);
  page.on('console', () => {});
}
async function closeBrowser() { try { if (browser) await browser.close(); } catch (e) {} browser = ctx = page = cdp = null; }
async function cdpShot(fpath) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(fpath, Buffer.from(data, 'base64'));
}

async function loadScenes(page) {
  return page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (!k) return [];
    try { k.call('stopautorotate()'); } catch (e) {}
    try { k.set('autorotate.enabled', false); } catch (e) {}
    const n = Number(k.get('scene.count'));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ name: String(k.get('scene[' + i + '].name')), title: String(k.get('scene[' + i + '].title') || '') });
    return out;
  });
}
async function readInteriorColor(page) {
  try {
    return await page.evaluate(() => {
      const sels = ['.color-current', '.interior-color .on', '.car-color .on', '.color-list .cur', '.colorBox .on', '[class*=color] .on', '[class*=color] .cur'];
      for (const s of sels) { const el = document.querySelector(s); if (el && el.textContent && el.textContent.trim()) return el.textContent.trim().slice(0, 20); }
      return '';
    });
  } catch (e) { return ''; }
}
// 角色匹配（关键修正）：「副驾驶位」包含「驾驶」二字，旧的 ROLE_KEYS.driver=['驾驶',...]
// 会把「副驾驶位」(乘客位)也误判为驾驶位，导致 F1 抓到乘客相机。这里用更精确的规则，
// 且 driver 显式排除「副」，passenger 只认「副驾/乘客」。
function matchRole(title, role) {
  const t = String(title);
  if (role === 'driver') return t.includes('主驾') || t.includes('驾驶员') || (t.includes('驾驶') && !t.includes('副'));
  if (role === 'passenger') return t.includes('副驾') || t.includes('乘客');
  if (role === 'rear') return t.includes('后排') || t.includes('后座') || t.includes('第二排') || t.includes('二排');
  return false;
}
function pickScene(scenes, role, idx) {
  const matched = scenes.filter(s => matchRole(s.title, role));
  if (!matched.length) return null;
  return matched[Math.min(idx, matched.length - 1)];
}
// 挑选机位（每个角色只取一个 scene，满足「一个颜色配置就行」）：
// 优先级：① 排除明显黑色内饰（除非该车只有黑色）—— 用户要求「选最浅颜色，避免黑色除非只有黑色」；
//         ② 在合格候选里优先「最浅色」(平均亮度最大)；
//         ③ 亮度接近时用「左右对称度(sym)」做平手裁判，保证相机位居中（避免选到偏位相机而非单纯颜色差异）。
async function pickBestScene(scenes, role, v, refProfile) {
  const matched = scenes.filter(s => matchRole(s.title, role));
  if (!matched.length) return null;
  if (FAST_SCENE) return matched[0];   // 极致提速：不逐个渲染比对，直接取第一个匹配机位
  if (matched.length === 1 || !refProfile) return matched[0];
  const refH = role === 'rear' ? 0 : 15;  // driver≈15, rear≈0（对应 A6L 参考图的角度）
  const cand = [];
  for (const s of matched) {
    try {
      // 选场景只需比较「亮度/对称度」这类粗指标 → 缩短等待 + 低分辨率截图（不影响判定，显著提速）
      await gotoScene(s.name); await page.waitForTimeout(4000);
      await setView(refH, v, 95); await page.waitForTimeout(1500);
      await ensureUIHidden();
      const buf = await shotBuffer(0.5);
      const prof = computeProfile(buf);
      cand.push({ scene: s, lum: Math.round(meanLum(prof)), sym: +symmetry(prof).toFixed(4), mse: Math.round(profileMSE(prof, refProfile)) });
    } catch (e) { cand.push({ scene: s, lum: 0, sym: 0, mse: 1e9 }); }
  }
  const NONBLACK = 28;  // 0-255 平均亮度阈值，低于算黑内
  const nonBlack = cand.filter(c => c.lum >= NONBLACK);
  const pool = nonBlack.length ? nonBlack : cand;   // 仅当全部为黑内时才退而求其次
  const maxSym = Math.max(...pool.map(c => c.sym));
  pool.sort((a, b) => (b.lum - a.lum) || (b.sym - a.sym) || (a.mse - b.mse));
  let chosen = pool[0];
  // 若「最浅色」方案的对称度明显低于池内最佳（说明它可能是偏位相机而非单纯颜色浅），改选次浅且相机居中的方案
  if (chosen.sym < maxSym - 0.12 && pool.length > 1) {
    const rest = pool.slice(1).sort((a, b) => (b.lum - a.lum) || (b.sym - a.sym));
    console.log(`  [选色] 最浅色方案对称度偏低(${chosen.sym} vs 最佳 ${maxSym.toFixed(3)})，改选次浅且相机居中的配置`);
    chosen = rest[0];
  }
  return chosen.scene;
}
async function gotoScene(n) { await page.evaluate((n) => { document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'); }, n); }
async function readDefault() {
  const d = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    return { h: k.get('view.hlookat'), v: k.get('view.vlookat'), f: k.get('view.fov') };
  });
  const h = Number(d.h), v = Number(d.v), f = Number(d.f);
  if (![h, v, f].every(Number.isFinite)) throw new Error('view_read_nonnumeric:' + JSON.stringify(d));
  return { h, v, f };
}
async function setView(h, v, f) {
  await page.evaluate(({ hh, vv, ff }) => {
    const k = document.getElementById('krpanoSWFObject');
    k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
  }, { hh: Number(h), vv: Number(v), ff: Number(f) });
}
async function waitViewSettled(maxMs = 20000) {
  const t0 = Date.now(); let last = null, stable = 0;
  while (Date.now() - t0 < maxMs) {
    let cur; try { cur = await readDefault(); } catch (e) { await page.waitForTimeout(600); continue; }
    if (last && Math.abs(cur.h - last.h) < 0.05 && Math.abs(cur.v - last.v) < 0.05 && Math.abs(cur.f - last.f) < 0.05) { if (++stable >= 2) return cur; } else stable = 0;
    last = cur; await page.waitForTimeout(700);
  }
  return last || { h: 0, v: 0, f: 90 };
}

// ---- 清屏 ----
// 不再依赖 .hide-btn（它是 toggle，重复点击会把 UI 切回来），改为直接枚举并强制隐藏所有浮层。
// 这样同时解决两个问题：
//   1) 无 toggle 风险（display:none 设多少次都一样）；
//   2) 站点即便"已清屏"也会保留右上角 .group 小按钮（实测 48x20@1372,16），
//      用户视为「没清屏」——强制隐藏可一并清掉。
// 必须跳过全景容器本身（含 #krpanoSWFObject 或 canvas 的祖先/自身），否则会把全景一起隐藏。
// krpano 导航热点（如「进入前排」的蓝色小箭头 arrow-blue.png）是 #krpanoSWFObject 容器内部的
// DOM 子元素；用「跳过 krpano 容器后代」的浮层扫描会漏掉它们。必须用 krpano API 隐藏。
// 注意：F1(驾驶位) 与 R1(后排) 场景各有 2 个此类热点，都要清。
async function hideKrpanoHotspots() {
  return page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (!k) return 0;
    let n = 0;
    const cnt = Number(k.get('hotspot.count'));
    for (let i = 0; i < cnt; i++) {
      const hs = k.get('hotspot[' + i + ']');
      if (hs && hs.visible) { k.set('hotspot[' + i + '].visible', false); n++; }
    }
    return n;
  });
}
async function uiCurrentlyHidden() {
  const domOk = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (k && (el === k || el.contains(k) || k.contains(el))) continue;
      if (el.querySelector && el.querySelector('canvas')) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      return false;
    }
    return true;
  });
  const hsOk = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    if (!k) return true;
    const cnt = Number(k.get('hotspot.count'));
    for (let i = 0; i < cnt; i++) { const hs = k.get('hotspot[' + i + ']'); if (hs && hs.visible) return false; }
    return true;
  });
  return domOk && hsOk;
}
async function ensureUIHidden() {
  const removed = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    let n = 0;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (k && (el === k || el.contains(k) || k.contains(el))) continue;   // 全景容器本体，绝不能隐藏
      if (el.querySelector && el.querySelector('canvas')) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      el.style.setProperty('display', 'none', 'important');
      n++;
    }
    return n;
  });
  const hsRemoved = await hideKrpanoHotspots();
  await page.waitForTimeout(WAIT_CLEAR);
  const ok = await uiCurrentlyHidden();
  if (!ok) console.log(`  ⚠ 强制隐藏 ${removed} 个浮层 / ${hsRemoved} 个 krpano 热点后仍有残留`);
  return ok;
}

// scale<1 时按低分辨率截图：扫描/选场景只需要「亮度与对称度」这类粗指标，
// 全分辨率(2880x1428)PNG 的解码成本是主要耗时之一，降采样可显著提速且不影响指标。
// 最终出图仍用 scale=1 保证清晰度。
async function shotBuffer(scale) {
  const opts = { format: 'png' };
  if (scale && scale < 1) opts.clip = { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale };
  const { data } = await cdp.send('Page.captureScreenshot', opts);
  return Buffer.from(data, 'base64');
}

// ---- 视角标定（2026-09-07 终版：确定性 + 高效）----
// 教训（IONIQ V 暴露）：驾驶位独立做「A6L 模板 360° 扫描」既慢又不可靠——
//   A6L 模板对与 A6L 内饰差异大的车（EV/MPV）是噪声：IONIQ 驾驶位被误锁到 h=50；
//   「对称度取居中」同样会画蛇添足（把用户认可的 h=15 预览拉回 h=0）。
// 可靠事实：① 同一台车全景 0° 固定，车头绝对方向在驾驶位/后排机位完全一致；
//          ② 后排机位用 A6L-后排模板扫描很可靠（IONIQ 间距 988、A6L 568，均强峰）；
//          ③ F1 构图 = 车头方向 + 固定居中偏移：A6L 定稿 F1=h15/R1=h0 → 偏移 +15，
//             所有已验证车（A8/A3/2系/3系/IONIQ）F1 均在 h15~20 且 rear=0，+15 全部复现。
// 终版方案：
//   后排(R1)：只扫一次 360° 模板 → frontH（车头绝对方向），R1 = frontH。
//   驾驶位(F1)：【不扫描】直接 F1 = frontH + driverFrontOffset（默认 +15，可在标定里配）。
//   结果：扫描耗时减半、结果确定可复现、且与 A6L 构图逐车对齐 → 一次性通过。
const SCAN_COARSE_STEP = 30;   // 粗扫步长
const SCAN_FINE_STEPS = [-15, -10, -5, 5, 10, 15];  // 粗扫最优后的精修（5° 分辨率）
const SCAN_WAIT = 2000;        // 每次扫描渲染等待（只需粗略结构判据，无需高清；已配合 0.5 倍低分辨率截图）
const DRIVER_FRONT_OFFSET_DEFAULT = 15;  // F1 相对车头方向的固定居中偏移（物理常量，跨车一致）
const FASTPATH_SYM = 0.90;               // 0° 快速通道的对称度门槛（实测正对前方约 0.95，偏轴约 0.76）
const PRIOR0_SYM = 0.80;                 // 0° 软先验门槛：汽车之家全景 0° 基本对齐车头（实测 7/7），
                                         // 0° 对称度达标即认定车头=0°，消除车身对称导致的 ±180° 镜像歧义。
async function scanViewAngle(v, role) {
  const ref = REF && REF[role === 'driver' ? 'driver' : 'rear'];
  if (!ref) return { h: 0, m: 1e9, sep: 1e9 };
  // 一次渲染同时取三个判据（不额外渲染）：
  //   m   = 与 A6L 参考的 MSE（构图相似度，主导）
  //   sym = 左右对称度（车身无关；正对前方时最高）
  //   top = 上部亮带均值（挡风玻璃朝前更亮 → 用于破解对称度的 180° 歧义）
  const score = async (h) => {
    await setView(h, v, 95); await page.waitForTimeout(SCAN_WAIT); await ensureUIHidden();
    const prof = computeProfile(await shotBuffer(0.5));
    let top = 0, n = 0;
    for (let y = 0; y < 5; y++) for (let x = 0; x < PROF_W; x++) { top += prof[y * PROF_W + x]; n++; }
    return { m: profileMSE(prof, ref), sym: symmetry(prof), top: top / n };
  };
  // ---- 快速通道：先试 0°（与 180° 对照）----
  // 实测 7/7 台车的最终车头方向都是 0°（autohome 全景 0° 基本对齐车头），
  // 因此先渲染 0° 与 180°：若 0° 对称度足够高且上部亮带比 180° 亮（=朝挡风玻璃而非尾门），
  // 直接认定车头=0，跳过整圈扫描（省下约 20 次渲染 ≈ 60-70 秒/台）。
  // 判定不成立（说明该车 0° 不朝前）时自动退回完整扫描，不改变正确性。
  const p0 = await score(0);
  const p180 = await score(180);
  if (p0.sym >= FASTPATH_SYM && p0.top > p180.top) {
    return { h: 0, m: p0.m, sep: null, method: 'fastpath0', tplH: 0, tplSym: +p0.sym.toFixed(4), symPeak: +p0.sym.toFixed(4), fastTop: Math.round(p0.top), revTop: Math.round(p180.top) };
  }
  // 0° 软先验：汽车之家全景 0° 基本对齐车头（实测 7/7）。车身左右对称使 0° 与 180° 对称度都高，
  // 无法靠对称区分前后，因此只要 0° 视角对称度达标就直接认定车头=0°，跳过载圈扫描、杜绝误锁 -180°。
  if (p0.sym >= PRIOR0_SYM) {
    return { h: 0, m: p0.m, sep: null, method: 'prior0', tplH: 0, tplSym: +p0.sym.toFixed(4), symPeak: +p0.sym.toFixed(4), fastTop: Math.round(p0.top), revTop: Math.round(p180.top) };
  }
  const angles = [];
  for (let a = 0; a < 360; a += SCAN_COARSE_STEP) angles.push(a);
  let best = null;
  // 复用快速通道已渲染的 0°/180° 结果，避免重复渲染
  const all = [
    { h: 0, m: p0.m, sym: p0.sym, top: p0.top },
    { h: 180, m: p180.m, sym: p180.sym, top: p180.top },
  ];
  for (const a of angles) {
    if (a === 0 || a === 180) { if (!best || p0.m < best.m) best = { h: 0, m: p0.m }; if (p180.m < best.m) best = { h: 180, m: p180.m }; continue; }
    const r = await score(a); all.push({ h: a, m: r.m, sym: r.sym, top: r.top }); if (!best || r.m < best.m) best = { h: a, m: r.m };
  }
  // 精修结果也必须并入 all：否则「模板判决处的对称度」会查不到而变 0，
  // 误触发对称覆盖（Z4 曾因此把 h20 改成 h0，且 15° 从未参与比较）。
  for (const d of SCAN_FINE_STEPS) { const a = normH(best.h + d); const r = await score(a); all.push({ h: a, m: r.m, sym: r.sym, top: r.top }); if (r.m < best.m) best = { h: a, m: r.m }; }
  // 同一角度可能被重复采样（0/180 复用 + 精修），去重后再做峰值比较
  const uniq = [];
  for (const r of all) { const i = uniq.findIndex(u => u.h === r.h); if (i >= 0) uniq[i] = r; else uniq.push(r); }
  all.length = 0; all.push(...uniq);
  const byMse = [...all].sort((x, y) => x.m - y.m);
  const sep = byMse.length > 1 ? byMse[1].m - byMse[0].m : 1e9;  // 与次优的间距（越大越可信）
  // ---- 车头方向定案：模板判决 vs 车身无关对称度 ----
  const tplH = normH(best.h);
  const tplSym = (all.find(r => r.h === best.h) || {}).sym || 0;
  const bestSymRow = [...all].sort((x, y) => y.sym - x.sym)[0];
  // 定案策略（强先验：汽车之家全景 0° 基本对齐车头，实测 7/7、32 台已验证）：
  //   ① 0° 与全局对称峰值几乎一样对称 → 车头=0°（消除 ±180° 镜像歧义）。
  //   ② 模板匹配高置信(sep≥100)且与对称一致 → 用模板方向（正常车即 0°）。
  //   ③ 其余（对称/模板都不可靠，含 K4 类 0° 对称性不足、或高对称角只在 ±180° 看车尾）→
  //      一律回退到车头=0° 并标记低置信，绝不选 ±180° 镜像（那是看车尾，比偏轴更糟）。
  let frontH, method, lowConf = false;
  if (bestSymRow && (bestSymRow.sym - p0.sym) <= 0.05) {
    frontH = 0; method = 'prior0';
  } else if (sep != null && sep >= SEP_MIN) {
    frontH = tplH; method = 'template';
    if (Math.abs(normH(frontH)) > 90) { frontH = 0; method = 'prior0_lowconf'; lowConf = true; }
  } else {
    frontH = 0; method = 'prior0_lowconf'; lowConf = true;
  }
  return { h: frontH, m: best.m, sep, method, tplH, tplSym: +tplSym.toFixed(4), symPeak: +bestSymRow.sym.toFixed(4), lowConf };
}
// 锚点缓存结构版本：车头判定逻辑变更（新增对称度/亮带交叉校验）后必须让旧缓存失效，
// 否则会继续复用错误结论（如高合HiPhi Y 曾被模板锁到 30°）。
const CACHE_VERSION = 3;   // v3：新增 0° 快速通道（扫描路径变更，旧锚点失效重算）
async function computeAnchor(role, panoId, view, baseFront) {
  // 驾驶位锚点依赖具体视角的 driverFrontOffset（F1=+15 与 D1=+57 不同），缓存键须带上偏移，
  // 否则 D1 会复用 F1 已缓存的 driver 锚点（hFinal=15），导致副驾门视角被拍成朝前看 IP。
  const ck = (role === 'driver' && view && view.driverFrontOffset != null) ? `driver_off${view.driverFrontOffset}` : role;
  const cached = anchors[panoId] && anchors[panoId][ck];
  if (cached && cached.hFinal !== undefined && cached.v === CACHE_VERSION) return cached;
  anchors[panoId] = anchors[panoId] || {};
  // 驾驶位且已知共享车头（来自后排）：不扫描，直接 hFinal = 车头 + 固定居中偏移。
  if (role === 'driver' && baseFront != null) {
    const off = (view && view.driverFrontOffset != null) ? view.driverFrontOffset : DRIVER_FRONT_OFFSET_DEFAULT;
    const rec = { v: CACHE_VERSION, h: normH(baseFront), offset: off, hFinal: normH(baseFront + off), score: null, sep: null, lowConfidence: false, source: 'rearFront+fixedOffset' };
    anchors[panoId][ck] = rec; saveAnchors(anchors);
    return rec;
  }
  // 后排（或驾驶位无后排可用时的兜底）：真实 360° 扫描 + 交叉校验。
  const vv = (view && view.v != null) ? view.v : (role === 'driver' ? 25 : 15);
  const res = await scanViewAngle(vv, role);
  const rec = {
    v: CACHE_VERSION, h: res.h, score: res.m == null ? null : +res.m.toFixed(2),
    sep: res.sep == null ? null : +res.sep.toFixed(2),   // 快速通道无「次优间距」，保持 null
    offset: 0, hFinal: normH(res.h),
    method: res.method, tplH: res.tplH !== undefined ? res.tplH : null, tplSym: res.tplSym, symPeak: res.symPeak,
    fastTop: res.fastTop, revTop: res.revTop,
    // 快速通道没有 sep，不能拿 null 参与比较（null<100 会被误判为「模糊」）
    lowConfidence: (res.sep != null && res.sep < SEP_MIN) || !!res.lowConf,
  };
  anchors[panoId][role] = rec; saveAnchors(anchors);
  return rec;
}

async function verifyView(h, v, f) {
  return page.evaluate(({ hh, vv, ff }) => {
    const k = document.getElementById('krpanoSWFObject');
    return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')), f: Number(k.get('view.fov')),
      dh: Math.abs(Number(k.get('view.hlookat')) - hh), dv: Math.abs(Number(k.get('view.vlookat')) - vv), df: Math.abs(Number(k.get('view.fov')) - ff) };
  }, { hh: Number(h), vv: Number(v), ff: Number(f) });
}

// ---- 主流程 ----
(async () => {
  const calib = readJSON(CALIB);
  const disc = readJSON(DISCOVERY);
  const state = loadState();
  state.items = state.items || {};
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const failures = [], captured = [], viewUnavailable = [], anchorReview = [], qcFlags = [];

  const targets = disc.results.filter(r => r.status === 'pano_found');
  let runTargets = ONLY_PANO
    ? (ONLY_PANO.includes(',')
        ? targets.filter(t => ONLY_PANO.split(',').map(s => String(s.trim())).includes(String(t.panoId)))
        : targets.filter(t => String(t.panoId) === String(ONLY_PANO)))
    : targets;
  runTargets = runTargets.slice(0, MAX);
  if (SHARD) {
    const [si, sn] = SHARD.split('/').map(Number);
    if (Number.isFinite(si) && Number.isFinite(sn) && sn > 1) {
      runTargets = runTargets.filter((_, idx) => idx % sn === si);
      console.log(`分片 ${si + 1}/${sn}：本进程负责 ${runTargets.length} 台`);
    }
  }
  console.log(`待截图车型（有 360）: ${runTargets.length}  视角: ${VIEWS_ARG.join(',')}`);

  await setupBrowser();
  await ensureRefProfiles();

  async function processCar(t) {
    const brand = t.brandCn, series = t.seriesName;
    console.log(`\n=== ${brand}/${series} (pano ${t.panoId}) ===`);
    let scenes;
    try {
      await page.goto(t.panoUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('canvas', { timeout: 30000 });
      await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
      await page.waitForTimeout(WAIT_INIT);
      scenes = await loadScenes(page);
      if (!scenes.length) throw new Error('no_scenes');
    } catch (e) {
      failures.push({ brand, series, panoId: t.panoId, step: 'open', reason: 'pano_open_failed:' + e.message, view: '' });
      console.log(`  打开/初始化失败: ${e.message}`); return;
    }

    const loadedScenes = new Set();
    const anchorCache = {};

    // 后排机位先处理：它的对称峰值即「共享车头方向」，驾驶位求 IP 居中偏移要以它为基准。
    const orderedViews = [...VIEWS_ARG].sort((a, b) => {
      const ra = (calib.views[a] && calib.views[a].role === 'rear') ? 0 : 1;
      const rb = (calib.views[b] && calib.views[b].role === 'rear') ? 0 : 1;
      return ra - rb;
    });
    for (const vid of orderedViews) {
      const v = calib.views[vid];
      if (!v) { console.log(`  跳过未知视角 ${vid}`); continue; }
      const refKey = (v.role === 'driver' || v.role === 'rear') ? v.role : 'driver';
      let scene = await pickBestScene(scenes, v.role, v.v, REF[refKey]);
      let fallbackNote = '';
      if (!scene && v.roleFallback) {
        scene = await pickBestScene(scenes, v.roleFallback, v.v, REF[refKey]);
        if (scene) { fallbackNote = `无「${v.role}」机位，回落至「${v.roleFallback}」`; console.log(`  [${vid}] ${fallbackNote}`); }
      }
      if (!scene) {
        viewUnavailable.push({ brand, series, panoId: t.panoId, view: vid, reason: 'scene_missing', role: v.role });
        failures.push({ brand, series, panoId: t.panoId, view: vid, step: 'scene', reason: 'view_not_available', suggestion: `该车型无 ${v.role} 机位 scene` });
        console.log(`  [${vid}] 无 ${v.role} scene，跳过`); continue;
      }
      if (!loadedScenes.has(scene.name)) {
        // pickBestScene 会遍历候选 scene 并在最后一次 gotoScene，最终停留在「最后一个候选」而非「选中」的 scene。
        // 这里显式载入选中 scene 后再做锚定扫描，避免锚点算在错误相机位上。
        await gotoScene(scene.name); await page.waitForTimeout(WAIT_LOADSCENE); await ensureUIHidden();
        await page.waitForTimeout(WAIT_CLEAR);
        loadedScenes.add(scene.name);
        const roleKey = v.role + (fallbackNote ? '_fb' : '');
        // 后排先用模板扫描定出「共享车头方向」(baseFront=null)；驾驶位以「后排已测出的车头方向」为基准，
        // 在其右侧 [0,35] 内取对称度最高角度，即 IP 居中所需的偏移（避免驾驶位自身模板扫描失灵漂移）。
        // （同车全景 0° 固定，车头方向在驾驶位/后排机位上绝对 h 一致。）
        let baseFront = null;
        if (v.role === 'driver' && !fallbackNote) {
          const r = anchors[String(t.panoId)] && anchors[String(t.panoId)].rear;
          // rear 锚点缺失（极少数车旧批次未缓存）时，默认车头=0°（汽车之家绝大多数车型即 0°，
          // D1/F1 标定也基于 0°）。避免退化为「360°扫描找IP居中」而产生错误角度。
          baseFront = (r != null) ? r.h : 0;
        }
        anchorCache[roleKey] = await computeAnchor(v.role, String(t.panoId), v, baseFront);
        const a = anchorCache[roleKey];
        if (a.source === 'rearFront+fixedOffset') {
          // 驾驶位：由「后排车头 + 固定居中偏移」确定性合成（无 360 扫描，无 MSE/间距）
          console.log(`  [${vid}] 驾驶位角度 = 后排车头 h=${a.h.toFixed(1)}° + 固定居中偏移 +${a.offset}° → hFinal=${a.hFinal.toFixed(1)}°（确定性合成，未扫描）`);
        } else {
          const aMse = a.score, aSep = a.sep;
          if (a.lowConfidence) {
            anchorReview.push({ brand, series, panoId: t.panoId, role: v.role, scene: scene.name,
              anchor_h: +a.h.toFixed(2), mse: aMse, separation: aSep });
            console.log(`  [${vid}] ⚠ 匹配模糊 (separation ${aSep} < 100)，该车 ${v.role} 方向需人工复核`);
          }
          // 前后判据裕度：0° 与 180° 的亮带差过小，说明「朝前/朝后」区分不可靠（即便对称度很高）
          if (a.method === 'fastpath0' && a.fastTop != null && a.revTop != null && (a.fastTop - a.revTop) < QC_TOP_MARGIN_MIN) {
            anchorReview.push({ brand, series, panoId: t.panoId, role: v.role, scene: scene.name,
              anchor_h: a.h, mse: a.score, separation: `topMargin=${a.fastTop - a.revTop}` });
            console.log(`  [${vid}] ⚠ 前后判据裕度小（亮带差 ${a.fastTop - a.revTop} < ${QC_TOP_MARGIN_MIN}），建议目检是否朝前`);
          }
          const mNote = a.method === 'fastpath0'
            ? `0°快速通道(sym ${a.symPeak}, 亮带 ${a.fastTop}>${a.revTop})`
            : (a.method === 'symmetry+brightness'
              ? `对称+亮带(模板曾判 ${a.tplH}° sym ${a.tplSym}, 峰值 ${a.symPeak})`
              : `模板(MSE ${aMse}, 间距 ${aSep})`);
          console.log(`  [${vid}] 扫描 ${v.role}: 车头 h=${a.h.toFixed(1)}° ← ${mNote}`);
        }
      }
      const roleKey = v.role + (fallbackNote ? '_fb' : '');
      const anchor = anchorCache[roleKey];
      // 最终视角 = hFinal：驾驶位含「IP 居中」偏移(+offset)，后排即车头方向。
      const h = normH(anchor.hFinal);
      const vv = v.v, f = v.fov;
      const shots = v.captureBoth ? [{ off: 0, tag: '' }, { off: 180, tag: '-B' }] : [{ off: 0, tag: '' }];

      for (const shot of shots) {
        const hShot = normH(h + shot.off);
        const key = `${t.panoId}_${vid}${shot.tag}`;
        if (!NO_SKIP && state.items[key] && state.items[key].status === 'done' && fs.existsSync(state.items[key].path) && fs.statSync(state.items[key].path).size > 10000) {
          console.log(`  [${vid}${shot.tag}] 已完成，跳过`); captured.push(state.items[key]); continue;
        }
        try {
          await setView(hShot, vv, f);
          await page.waitForTimeout(WAIT_SET);
          const chk = await verifyView(hShot, vv, f);
          const clamped = (chk.dh > 1.5 || chk.dv > 1.5 || chk.df > 2);
          if (clamped) console.log(`  [${vid}${shot.tag}] 角度被夹紧: 实际(${chk.h.toFixed(1)},${chk.v.toFixed(1)},${chk.f.toFixed(1)})`);
          const color = (await readInteriorColor(page)) || '默认';
          const viewName = v.name + (fallbackNote ? '-降级' : '') + shot.tag;
          const fname = `${sanitize(brand)}_${sanitize(series)}_${sanitize(color)}_${sanitize(viewName)}_01.png`;
          const fdir = path.join(IMG_DIR, sanitize(v.folder || v.name));
          fs.mkdirSync(fdir, { recursive: true });
          const fpath = path.join(fdir, fname);
          let cropRawName = null;
          await ensureUIHidden();   // 截图前最后一道保险（幂等；若扫描期间 krpano 重新注入浮层也能清掉）
          await cdpShot(fpath);
          // ---- 固定矩形裁切（如 D1 副驾门视角）：保留 fov=95 整幅 raw 作备份，另出 16:10 成品 ----
          if (v.crop && v.crop.l != null) {
            cropRawName = fpath.replace(/\.png$/, '_raw.png');
            fs.copyFileSync(fpath, cropRawName);
            const fullPng = PNG.sync.read(fs.readFileSync(cropRawName));
            const FW = fullPng.width, FH = fullPng.height;
            const cL = Math.round((v.crop.l ?? 0) * FW), cT = Math.round((v.crop.t ?? 0) * FH);
            const cR = Math.round((v.crop.r ?? 1) * FW), cB = Math.round((v.crop.b ?? 1) * FH);
            const cw = cR - cL, chh = cB - cT;
            const cropPng = new PNG({ width: cw, height: chh });
            for (let y = 0; y < chh; y++) fullPng.data.copy(cropPng.data, y * cw * 4, ((cT + y) * FW + cL) * 4, ((cT + y) * FW + cL + cw) * 4);
            fs.writeFileSync(fpath, PNG.sync.write(cropPng));  // 覆盖为裁切成品
            console.log(`  [${vid}${shot.tag}] 已裁切 -> ${cw}x${chh} (${v.aspect || '自定义'}), raw 备份 ${path.basename(cropRawName)}`);
          }
          // 截图后再校验一次 UI 是否仍处于隐藏态，写进 sidecar —— 每张图都可审计，不靠假设
          const uiHiddenAtCapture = await uiCurrentlyHidden();
          if (!uiHiddenAtCapture) console.log(`  [${vid}${shot.tag}] ⚠ 截图时 UI 未清屏`);
          if (fs.statSync(fpath).size < 10000) throw new Error('image_blank');
          // ---- 自动体检：直接读成品图计算，保证「检的就是交付的那张」 ----
          const qcProf = computeProfile(fs.readFileSync(fpath));
          const qcSym = +symmetry(qcProf).toFixed(4);
          const qcTop = Math.round(topBright(qcProf));
          const qcMin = v.role === 'driver' ? QC_SYM_MIN_DRIVER : QC_SYM_MIN_REAR;
          const qcSuspicious = !!(qcProf && !v.crop && qcSym < qcMin);  // 裁切视角（如门板）天然不对称，跳过对称度体检
          if (qcSuspicious) {
            console.log(`  [${vid}${shot.tag}] ⚠ 体检可疑：对称度 ${qcSym} < ${qcMin}（构图可能偏轴，建议目检）`);
            qcFlags.push({ brand, series, panoId: t.panoId, view: vid, role: v.role, file: path.basename(fpath), sym: qcSym, top: qcTop, threshold: qcMin, reason: 'symmetry_below_threshold' });
          }
          const sidecar = {
            source_url: t.panoUrl, captured_at: new Date().toISOString(),
            view_id: vid, view_name: viewName, brand, series, interior_color: color,
            camera_state: { hlookat: +hShot.toFixed(2), vlookat: +vv.toFixed(2), fov: +f.toFixed(2) },
            camera_state_actual: { hlookat: +chk.h.toFixed(2), vlookat: +chk.v.toFixed(2), fov: +chk.f.toFixed(2) },
            clamped, scan_best_h: +anchor.h.toFixed(2), driver_center_offset: (v.role === 'driver' ? anchor.offset : 0), final_h: +anchor.hFinal.toFixed(2), match_mse: anchor.score, match_separation: anchor.sep,
            qc_sym: qcSym, qc_top: qcTop, qc_threshold: qcMin, qc_suspicious: qcSuspicious,
            anchor_low_confidence: !!anchor.lowConfidence,
            ui_hidden_at_capture: uiHiddenAtCapture,
            flip_candidate: shot.tag || null,
            scene: scene.name, scene_title: scene.title, fallback: !!fallbackNote, fallback_note: fallbackNote || null,
            provisional: !!v.provisional, viewport: `${VIEWPORT.width}x${VIEWPORT.height}`, dpr: DEVICE_SCALE_FACTOR,
            crop_applied: !!cropRawName, crop_rect: v.crop || null, raw_backup: cropRawName ? path.basename(cropRawName) : null, aspect: v.aspect || null,
            resolution: `${VIEWPORT.width * DEVICE_SCALE_FACTOR}x${VIEWPORT.height * DEVICE_SCALE_FACTOR}`
          };
          fs.writeFileSync(fpath.replace(/\.png$/, '.json'), JSON.stringify(sidecar, null, 2));
          state.items[key] = { status: 'done', path: fpath, view: vid, tag: shot.tag, brand, series };
          saveState(state); captured.push(state.items[key]);
          console.log(`  [${vid}${shot.tag}] ✓ ${fname}  (h=${hShot.toFixed(1)} v=${vv.toFixed(1)} f=${f.toFixed(1)})${v.provisional ? ' [暂定]' : ''}`);
        } catch (e) {
          failures.push({ brand, series, panoId: t.panoId, view: vid + shot.tag, step: 'capture', reason: e.message, suggestion: '检查 scene 默认视角或调整偏移' });
          console.log(`  [${vid}${shot.tag}] ✗ 失败: ${e.message}`);
        }
      }
    }
    await page.waitForTimeout(CAR_INTERVAL);
  }

  for (let i = 0; i < runTargets.length; i++) {
    const t = runTargets[i];
    let attempt = 0, ok = false;
    while (!ok && attempt < 2) {
      attempt++;
      try { await processCar(t); ok = true; }
      catch (e) {
        if (/closed|Target page|crash/i.test(e.message) && attempt < 2) {
          console.log(`  浏览器异常（${e.message.split('\n')[0]}），重启后重试该车`);
          await closeBrowser(); await setupBrowser();
        } else {
          failures.push({ brand: t.brandCn, series: t.seriesName, panoId: t.panoId, step: 'fatal', reason: e.message, view: '' });
          console.log(`  ✗ 该车处理失败: ${e.message}`);
        }
      }
    }
    if ((i + 1) % RESTART_EVERY === 0 && i + 1 < runTargets.length) {
      console.log(`\n--- 已处理 ${i + 1} 台，重启浏览器释放内存 ---`);
      await closeBrowser(); await setupBrowser();
    }
  }

  await closeBrowser();

  const no360 = disc.results.filter(r => r.status !== 'pano_found');
  const no360Rows = [['brandCn', 'brandEn', 'modelCn', 'modelEn', 'years', 'status', 'seriesName', 'note']];
  for (const r of no360) no360Rows.push([r.brandCn, r.brandEn, r.modelCn, r.modelEn, r.years, r.status, r.seriesName || '', r.note || '']);
  fs.writeFileSync(NO360_CSV, no360Rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`\n无 360 / 未找到车型已记录: ${no360.length} 条 -> ${NO360_CSV}`);

  const fcols = ['brand', 'series', 'panoId', 'view', 'step', 'reason', 'suggestion'];
  const frows = [fcols].concat(failures.map(f => fcols.map(c => f[c] !== undefined ? f[c] : '')));
  fs.writeFileSync(FAIL_CSV, frows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`失败项: ${failures.length} -> ${FAIL_CSV}`);
  if (viewUnavailable.length) console.log(`视角不可用（无机位）: ${viewUnavailable.length} -> 见 failures.csv`);
  // 锚点置信度复核清单（不静默信任低分锚点）
  const acols = ['brand', 'series', 'panoId', 'role', 'scene', 'anchor_h', 'score'];
  const arows = [acols].concat(anchorReview.map(a => acols.map(c => a[c] !== undefined ? a[c] : '')));
  fs.writeFileSync(path.join(OUTPUT, 'anchor_review.csv'), arows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`锚点低置信待复核: ${anchorReview.length} -> ${path.join(OUTPUT, 'anchor_review.csv')}`);
  // 出图体检清单：可疑图交人工目检，不放过任何静默错误
  const qcols = ['brand', 'series', 'panoId', 'view', 'role', 'file', 'sym', 'top', 'threshold', 'reason'];
  const qrows = [qcols].concat(qcFlags.map(q => qcols.map(c => q[c] !== undefined ? q[c] : '')));
  fs.writeFileSync(path.join(OUTPUT, 'qc_flags.csv'), qrows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`出图体检可疑: ${qcFlags.length} 张 -> ${path.join(OUTPUT, 'qc_flags.csv')}`);

  const reportHtml = buildReport({ disc, captured, failures, no360, calib, VIEWS_ARG });
  fs.writeFileSync(REPORT, reportHtml);
  console.log(`\n完成。截图 ${captured.length} 张，报告: ${REPORT}`);
})().catch(async (e) => { console.error('FATAL', e); try { await closeBrowser(); } catch (_) {} process.exit(1); });

function buildReport({ disc, captured, failures, no360, calib, VIEWS_ARG }) {
  const total = disc.results.length;
  const found = disc.results.filter(r => r.status === 'pano_found').length;
  const rows = captured.map(c => `<tr><td>${c.brand}</td><td>${c.series}</td><td>${c.view}</td><td><a href="file://${c.path}">${path.basename(c.path)}</a></td></tr>`).join('');
  const frows = failures.map(f => `<tr><td>${f.brand}</td><td>${f.series}</td><td>${f.view || ''}</td><td>${f.reason}</td></tr>`).join('');
  const nrows = no360.map(r => `<tr><td>${r.brandCn}</td><td>${r.modelCn}</td><td>${r.years}</td><td>${r.status}</td><td>${r.seriesName || ''}</td><td>${r.note || ''}</td></tr>`).join('');
  const provViews = Object.entries(calib.views).filter(([k, v]) => v.provisional).map(([k]) => k).join(', ');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>P1 截图报告</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;background:#0f1115;color:#e6e6e6}
h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 24px}
th,td{border:1px solid #2a2f3a;padding:6px 8px;text-align:left}th{background:#1a1f29}a{color:#6cb4ff}
.note{background:#1a1f29;border-left:3px solid #f5a623;padding:10px 14px;margin:12px 0}</style></head>
<body>
<h1>P1 内饰全景截图报告（跨车一致性版）</h1>
<div>总车型 ${total} ｜ 有 360：${found} ｜ 本次截图 ${captured.length} ｜ 失败 ${failures.length} ｜ 无 360/未找到 ${no360.length}</div>
<div class="note">一致性：每台车每个机位已用亮度扫描锚定到「车头正前方」(frontAnchorH)，所有车都落在同一取景点。F1=h=锚+0 / v=15 / fov=95（已确认）；R1=h=锚-15 / v=-5 / fov=95（暂定，带 -B 翻转候选供确认）。清屏改为每 scene 仅一次（解决之前 v=15 未清屏问题）。暂定视角：${provViews}。</div>
<h2>本次截图</h2><table><tr><th>品牌</th><th>车系</th><th>视角</th><th>文件</th></tr>${rows}</table>
<h2>失败项</h2><table><tr><th>品牌</th><th>车系</th><th>视角</th><th>原因</th></tr>${frows || '<tr><td colspan=4>无</td></tr>'}</table>
<h2>无 360 / 未找到（已记录，不截图）</h2><table><tr><th>品牌</th><th>车型</th><th>年款</th><th>状态</th><th>车系名</th><th>备注</th></tr>${nrows}</table>
</body></html>`;
}
