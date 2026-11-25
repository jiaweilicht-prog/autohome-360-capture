// 诊断：R1（后排）场景里"进入前排的蓝色小箭头"到底是什么元素
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const PANO_URL = 'https://pano.autohome.com.cn/car/pano/76524';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WAIT_INIT = 3000, WAIT_LOADSCENE = 12000, WAIT_ANCHOR = 3000;

const VIEWPORT = { width: 2880, height: 1620 };
const DEVICE_SCALE_FACTOR = 1;

function pickScene(scenes, role) {
  const kw = role === 'driver' ? ['驾驶', '主驾', '驾驶员', '前排'] : ['后排', '二排', '后座', '后'];
  let s = scenes.find(x => kw.some(k => (x.title || '').includes(k)));
  if (!s) s = scenes.find(x => /(前排|驾驶)/.test(x.title || '')) || scenes[0];
  return s || scenes[0];
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--disable-dev-shm-usage', '--window-size=2880,1620'] });
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.context().newCDPSession(page);
  page.setDefaultTimeout(60000);
  await page.goto(PANO_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'));
  await page.waitForTimeout(WAIT_INIT);

  const scenes = await page.evaluate(() => {
    const k = document.getElementById('krpanoSWFObject');
    const n = Number(k.get('scene.count'));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ i, name: k.get('scene[' + i + '].name'), title: k.get('scene[' + i + '].title') });
    return out;
  });
  console.log('场景列表:'); scenes.forEach(s => console.log('  ', s.i, s.name, '|', s.title));

  for (const role of ['driver', 'rear']) {
    const sc = pickScene(scenes, role);
    console.log(`\n===== 载入 ${role} 机位: ${sc.name} (${sc.title}) =====`);
    await page.evaluate((nm) => { document.getElementById('krpanoSWFObject').call('loadscene(' + nm + ')'); }, sc.name);
    await page.waitForTimeout(WAIT_LOADSCENE);

    // 1) krpano 热点（hotspot）枚举
    const hotspots = await page.evaluate(() => {
      const k = document.getElementById('krpanoSWFObject');
      const n = Number(k.get('hotspot.count'));
      const out = [];
      for (let i = 0; i < n; i++) {
        const hs = k.get('hotspot[' + i + ']');
        if (!hs) continue;
        out.push({ i, name: hs.name, type: hs.type, visible: hs.visible,
          style: hs.style, cssclass: hs.cssclass, url: hs.url, keep: hs.keep });
      }
      return out;
    });
    console.log(`krpano 热点数: ${hotspots.length}`);
    hotspots.forEach(h => console.log('   ', JSON.stringify(h)));

    // 2) krpano 容器内、非 canvas 的后代浮层（class/id 摘要）
    const krpanoChildren = await page.evaluate(() => {
      const k = document.getElementById('krpanoSWFObject');
      const out = [];
      for (const el of Array.from(k.querySelectorAll('*'))) {
        if (el.tagName === 'CANVAS') continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.position === 'absolute' || el.tagName === 'DIV' || el.tagName === 'A') {
          out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), id: el.id || '',
            pos: cs.position, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) });
        }
      }
      return out.slice(0, 30);
    });
    console.log('krpano 容器内后代（前30）:');
    krpanoChildren.forEach(c => console.log('   ', JSON.stringify(c)));

    // 3) 全文档里"蓝色小箭头"候选：蓝色系 + 小尺寸 + 可点
    const blue = await page.evaluate(() => {
      const out = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor, bc = cs.borderColor, color = cs.color;
        const isBlue = (c) => { const m = c.match(/\d+/g); if (!m) return false; const [r, g, b] = m.map(Number); return b > 120 && r < 120 && g < 180; };
        const r = el.getBoundingClientRect();
        if ((isBlue(bg) || isBlue(bc) || isBlue(color)) && r.width > 0 && r.width < 200 && r.height < 200) {
          out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 50), id: el.id || '', text: (el.textContent || '').trim().slice(0, 12),
            w: Math.round(r.width), h: Math.round(r.height), bg, bc, color });
        }
      }
      return out.slice(0, 20);
    });
    console.log('蓝色小元素候选（前20）:');
    blue.forEach(b => console.log('   ', JSON.stringify(b)));
  }

  await browser.close();
  console.log('\n诊断结束');
})().catch(e => { console.error('DIAG ERROR', e); process.exit(1); });
