// diag_clear2.cjs — 验证修复后的清屏判据：单次点击后必须判定为「已隐藏」（否则会二次点击 toggle 回来）
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';

const SENTINEL = () => {
  const gone = (el) => {
    if (!el) return true;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true;
    if (r.top >= window.innerHeight - 1) return true;
    return false;
  };
  const sels = ['.left-btns', '.right-btns', '.show-control', '.toolbar', '.autohome-bar', '.pano-control', '.top-bar'];
  const detail = sels.map(s => {
    const el = document.querySelector(s);
    if (!el) return `${s}:不存在`;
    const r = el.getBoundingClientRect();
    return `${s}:${gone(el) ? 'hidden' : 'VISIBLE'}(${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)})`;
  });
  for (const sel of sels) if (!gone(document.querySelector(sel))) return { hidden: false, detail };
  return { hidden: true, detail };
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-webgl','--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 714 } })).newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'));
  await page.waitForTimeout(4000);
  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject'); const n = +k.get('scene.count'); const o = [];
    for (let i = 0; i < n; i++) o.push({ name: k.get('scene['+i+'].name'), title: k.get('scene['+i+'].title') || '' });
    return o;
  });
  for (const [tag, sc] of [['驾驶位', scenes.find(s => /驾驶/.test(s.title)) || scenes[0]],
                            ['后排',   scenes.find(s => /后排/.test(s.title))]]) {
    if (!sc) { console.log(`${tag}: 无此机位`); continue; }
    await page.evaluate(n => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), sc.name);
    await page.waitForTimeout(12000);
    const before = await page.evaluate(SENTINEL);
    console.log(`\n=== ${tag} 机位 ===`);
    console.log(`  点击前判定: ${before.hidden ? '已隐藏' : '未隐藏(需点击)'}`);
    console.log(`    ${before.detail.join('\n    ')}`);
    await page.evaluate(() => { const b = document.querySelector('.hide-btn'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); });
    await page.waitForTimeout(900);
    const after = await page.evaluate(SENTINEL);
    console.log(`  单次点击后判定: ${after.hidden ? '✅ 已隐藏（不会二次点击）' : '❌ 仍判未隐藏（会误二次点击）'}`);
    console.log(`    ${after.detail.join('\n    ')}`);
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
