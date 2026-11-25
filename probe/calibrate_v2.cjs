const fs = require('fs');
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('https://pano.autohome.com.cn/car/pano/76524?_ahrotate=1', { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  await page.evaluate(() => { const K=window.__KR||document.getElementById('krpanoSWFObject'); if(K&&K.call){K.call('stopautorotate');K.set('autorotate.enabled',false);} });
  await sleep(2000);
  await page.evaluate(() => { const btn=document.querySelector('.hide-btn'); if(btn) btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); });
  await sleep(800);

  const scenes = await page.evaluate(() => {
    const K=window.__KR||document.getElementById('krpanoSWFObject');
    const list=[]; const cnt=K.get('scene.count'); for(let i=0;i<cnt;i++) list.push({i,name:K.get('scene['+i+'].name'),title:K.get('scene['+i+'].title')}); return list;
  });
  const driver = scenes.find(s => s.title.includes('驾驶位'));

  const OUT = 'probe/calib';
  fs.mkdirSync(OUT, {recursive:true});
  for (const h of [-30, -15, 0]) {
    for (const v of [5, 10, 15]) {
      await page.evaluate(({name,h,v}) => {
        const K=window.__KR||document.getElementById('krpanoSWFObject');
        K.call("loadscene('"+name+"', null, MERGE, BLEND(0.01))");
        K.set('view.hlookat', h); K.set('view.vlookat', v); K.set('view.fov', 95);
      }, {name: driver.name, h, v});
      await sleep(11000);
      await page.screenshot({ path: `${OUT}/V2_driver_doorIP_${h}_${v}.png` });
    }
  }
  await browser.close();
  console.log('V2 candidates done');
})().catch(e=>{console.error(e);process.exit(1)});
