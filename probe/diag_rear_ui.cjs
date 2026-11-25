// diag_rear_ui.cjs — 枚举各机位上所有「可见浮层」元素，找出后排机位特有的 UI
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';

const LIST_OVERLAYS = () => {
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.tagName === 'CANVAS' || el.id === 'krpanoSWFObject' || el.closest('#krpanoSWFObject')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.top >= window.innerHeight || r.bottom <= 0) return;
    const pos = cs.position;
    if (pos !== 'fixed' && pos !== 'absolute') return;   // 只关心浮层
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && el.className.toString ? el.className.toString() : '').slice(0, 40);
    out.push(`${el.tagName.toLowerCase()}${id}.${cls} [${pos}] rect=${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} z=${cs.zIndex}`);
  });
  return out.slice(0, 25);
};
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
  for (const sel of sels) if (!gone(document.querySelector(sel))) return false;
  return true;
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
  const drv = scenes.find(s => /驾驶/.test(s.title)) || scenes[0];
  const rear = scenes.find(s => /后排/.test(s.title));

  for (const [tag, sc] of [['驾驶位', drv], ['后排', rear]]) {
    if (!sc) { console.log(`\n${tag}: 无此机位`); continue; }
    await page.evaluate(n => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), sc.name);
    await page.waitForTimeout(12000);
    console.log(`\n########## ${tag}（刚 loadscene，未点击） ##########`);
    console.log(`  哨兵判定: ${await page.evaluate(SENTINEL) ? '已隐藏' : '未隐藏(有UI)'}`);
    const list = await page.evaluate(LIST_OVERLAYS);
    console.log(`  可见浮层 ${list.length} 个:`);
    list.forEach(l => console.log('    ' + l));
    await page.evaluate(() => { const b = document.querySelector('.hide-btn'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); });
    await page.waitForTimeout(1000);
    console.log(`  --- 点击 .hide-btn 之后 ---`);
    console.log(`  哨兵判定: ${await page.evaluate(SENTINEL) ? '已隐藏' : '未隐藏(有UI)'}`);
    const list2 = await page.evaluate(LIST_OVERLAYS);
    console.log(`  可见浮层 ${list2.length} 个:`);
    list2.forEach(l => console.log('    ' + l));
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
