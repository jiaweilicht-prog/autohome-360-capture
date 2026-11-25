/**
 * 快速视角标定：先用少量候选找出 V1 大致方向，再在该方向附近做 V2/V3
 */
const fs = require('fs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANO_URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const OUT_DIR = 'probe/calib';
const VW = 1600, VH = 900;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clearUI(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.hide-btn');
    if (btn) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      btn.dispatchEvent(ev);
    }
  });
  await sleep(800);
}

async function setView(page, sceneName, h, v, fov) {
  await page.evaluate(({ sceneName, h, v, fov }) => {
    const K = window.__KR || document.getElementById('krpanoSWFObject');
    if (K && K.call) {
      K.call("loadscene('" + sceneName + "', null, MERGE, BLEND(0.01))");
      K.set('view.hlookat', h);
      K.set('view.vlookat', v);
      K.set('view.fov', fov);
    }
  }, { sceneName, h, v, fov });
  // 等待 tiles 加载 + 停转稳定
  await sleep(11000);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });

  console.log('加载 pano...');
  await page.goto(PANO_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  await page.evaluate(() => {
    const K = window.__KR || document.getElementById('krpanoSWFObject');
    if (K && K.call) { K.call('stopautorotate'); K.set('autorotate.enabled', false); }
  });
  await sleep(2000);
  await clearUI(page);

  const scenes = await page.evaluate(() => {
    const K = window.__KR || document.getElementById('krpanoSWFObject');
    const list = [];
    if (K && K.get) {
      const cnt = K.get('scene.count');
      for (let i = 0; i < cnt; i++) {
        list.push({ i, name: K.get('scene[' + i + '].name'), title: K.get('scene[' + i + '].title') });
      }
    }
    return list;
  });
  console.log('scenes:', scenes.map(s => `${s.i}:${s.title}`).join(', '));

  const driverScene = scenes.find(s => s.title.includes('驾驶位'));
  const passengerScene = scenes.find(s => s.title.includes('副驾驶位'));

  const tasks = [];

  // V1: 找“主驾驶眼点看完整前排 IP”方向
  // 先大范围扫：h 0~180（默认 h≈0 看副驾，所以 forward 可能在 +60~+120 之间）
  for (const h of [30, 60, 90, 120, 150]) {
    for (const v of [5, 15, 25]) {
      tasks.push({ view: 'V1_driver_frontIP', sceneName: driverScene.name, h, v, fov: 90 });
    }
  }

  // V2: 在 V1 基础上再朝驾驶员方向转（h 更大）
  for (const h of [120, 150, 180, -150]) {
    for (const v of [-5, 5, 15]) {
      tasks.push({ view: 'V2_driver_doorIP', sceneName: driverScene.name, h, v, fov: 95 });
    }
  }

  // V3: 副驾驶位看门板
  for (const h of [-120, -90, -60, -30, 0, 30]) {
    for (const v of [0, 10, 20]) {
      tasks.push({ view: 'V3_passenger_door', sceneName: passengerScene.name, h, v, fov: 90 });
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const fname = `${OUT_DIR}/${t.view}_s${t.sceneName}_h${t.h}_v${t.v}_f${t.fov}.png`;
    console.log(`[${i + 1}/${tasks.length}] ${fname}`);
    await setView(page, t.sceneName, t.h, t.v, t.fov);
    await page.screenshot({ path: fname });
  }

  await browser.close();
  console.log(`快速标定完成：${tasks.length} 张图，输出到 ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
