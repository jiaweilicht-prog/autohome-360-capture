/**
 * P1 视角标定脚本
 * 在已知车型（奥迪 A6L, pano 76524）上枚举 scene + hlookat/vlookat/fov 组合，
 * 输出候选截图到 probe/calib/，供人工/自动挑选最接近参考截图的角度。
 */
const fs = require('fs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PANO_URL = 'https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1';
const OUT_DIR = 'probe/calib';
const VW = 1600, VH = 900;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitStable(page) {
  // 等 3 帧差异足够小，或最长 25 秒
  let stableFrames = 0;
  let prev = null;
  const start = Date.now();
  while (Date.now() - start < 25000) {
    const buf = await page.screenshot({ type: 'png' });
    if (prev && buf.equals(prev)) {
      stableFrames++;
      if (stableFrames >= 3) return;
    } else {
      stableFrames = 0;
    }
    prev = buf;
    await sleep(400);
  }
}

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

  // 停转
  await page.evaluate(() => {
    const K = window.__KR || document.getElementById('krpanoSWFObject');
    if (K && K.call) {
      try { K.call('stopautorotate'); } catch (e) {}
      try { K.set('autorotate.enabled', false); } catch (e) {}
    }
  });
  await sleep(2000);
  await clearUI(page);

  // 读取 scene 列表
  const scenes = await page.evaluate(() => {
    const K = window.__KR || document.getElementById('krpanoSWFObject');
    const list = [];
    if (K && K.get) {
      const xml = K.get('xml.scene');
      // 通过 krpano API 枚举 scene
      const cnt = K.get('scene.count');
      for (let i = 0; i < cnt; i++) {
        const name = K.get('scene[' + i + '].name');
        const title = K.get('scene[' + i + '].title');
        list.push({ i, name, title });
      }
    }
    return list;
  });
  console.log('scenes:', scenes.map(s => `${s.i}:${s.name}(${s.title})`).join(', '));

  const driverScenes = scenes.filter(s => s.title.includes('驾驶位'));
  const passengerScenes = scenes.filter(s => s.title.includes('副驾驶位'));
  console.log(`驾驶位 scene 数: ${driverScenes.length}, 副驾驶位 scene 数: ${passengerScenes.length}`);

  // 标定任务
  const tasks = [];

  // V1: 驾驶位，看完整前排 IP
  for (const s of driverScenes.slice(0, 1)) { // 先只用第一个驾驶位 scene
    for (const h of [-135, -120, -105, -90, -75, -60, -45]) {
      for (const v of [-5, 5, 15, 25]) {
        tasks.push({ view: 'V1_driver_frontIP', sceneIdx: s.i, sceneName: s.name, h, v, fov: 90 });
      }
    }
  }

  // V2: 驾驶位，看 IP-门交界（在 V1 基础上再左转、略低头）
  for (const s of driverScenes.slice(0, 1)) {
    for (const h of [-180, -165, -150, -135]) {
      for (const v of [-10, 0, 10]) {
        tasks.push({ view: 'V2_driver_doorIP', sceneIdx: s.i, sceneName: s.name, h, v, fov: 95 });
      }
    }
  }

  // V3: 副驾驶位，看门板
  for (const s of passengerScenes.slice(0, 1)) {
    for (const h of [-120, -90, -60, -30, 0, 30, 60, 90]) {
      for (const v of [-5, 5, 15, 25]) {
        tasks.push({ view: 'V3_passenger_door', sceneIdx: s.i, sceneName: s.name, h, v, fov: 90 });
      }
    }
  }

  // 执行任务
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const fname = `${OUT_DIR}/${t.view}_s${t.sceneIdx}_h${t.h}_v${t.v}_f${t.fov}.png`;
    console.log(`[${i + 1}/${tasks.length}] ${fname}`);

    await page.evaluate(({ sceneName, h, v, fov }) => {
      const K = window.__KR || document.getElementById('krpanoSWFObject');
      if (K && K.call) {
        // 切 scene 并立即设置目标角度
        K.call("loadscene('" + sceneName + "', null, MERGE, BLEND(0.01))");
        K.set('view.hlookat', h);
        K.set('view.vlookat', v);
        K.set('view.fov', fov);
      }
    }, { sceneName: t.sceneName, h: t.h, v: t.v, fov: t.fov });

    await waitStable(page);
    await page.screenshot({ path: fname });
  }

  await browser.close();
  console.log(`标定完成，共 ${tasks.length} 张图，输出到 ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
