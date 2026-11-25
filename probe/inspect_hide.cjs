// inspect_hide.cjs — 探测两件事：
//  1) .hide-btn 清屏机制：点击前后 DOM 变化，找出「已清屏」的可靠判据
//  2) 正前方锚定可行性：在驾驶位 / 后排 scene 扫描 h，看 brightRunRatio 是否能在 A6L 上稳定指到已知车头（h=0）
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const DISCOVERY = path.join(ROOT, 'probe', 'p1-discovery.json');
const d = JSON.parse(fs.readFileSync(DISCOVERY, 'utf8'));
const a6 = d.results.find(r => /A6L/.test(r.seriesName));

const WAIT_LOAD = 12000, WAIT_SET = 1500;

function brightRunRatio(buf) {
  let png; try { png = PNG.sync.read(buf); } catch (e) { return -1; }
  const { width: W, height: H, data } = png;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
  let bestRun = 0;
  for (let y = Math.floor(H*0.20); y < Math.floor(H*0.42); y += 8) {
    const row = [];
    for (let x = Math.floor(W*0.05); x < Math.floor(W*0.95); x += 4) row.push(L(x,y));
    if (!row.length) continue;
    const mx = Math.max(...row), mn = Math.min(...row), thr = mn + (mx-mn)*0.62;
    let run = 0, best = 0;
    for (const v of row) { if (v>thr){ run++; if(run>best) best=run; } else run=0; }
    bestRun = Math.max(bestRun, best/row.length);
  }
  let sum=0,m=0;
  for (let y = Math.floor(H*0.45); y < Math.floor(H*0.95); y += 4)
    for (let x = Math.floor(W*0.08); x < Math.floor(W*0.92); x += 4) {
      const ia=(y*W+x)*4, ib=(y*W+(W-1-x))*4;
      const dr=data[ia]-data[ib], dg=data[ia+1]-data[ib+1], db=data[ia+2]-data[ib+2];
      sum+=dr*dr+dg*dg+db*db; m++;
    }
  const mirror = m ? sum/(m*3) : 1e6;
  return bestRun/(1+mirror/2000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless:false,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-webgl','--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport:{width:1440,height:714}, deviceScaleFactor:2 })).newPage();
  const cdp = await page.context().newCDPSession(page);
  const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64');
  const setView = (h,v,f)=>page.evaluate(({h,v,f})=>{const k=document.getElementById('krpanoSWFObject');k.set('view.hlookat',h);k.set('view.vlookat',v);k.set('view.fov',f);},{h,v,f});
  const readDef = ()=>page.evaluate(()=>{const k=document.getElementById('krpanoSWFObject');return{h:+k.get('view.hlookat'),v:+k.get('view.vlookat'),f:+k.get('view.fov')};});
  const goto = (n)=>page.evaluate(n=>document.getElementById('krpanoSWFObject').call('loadscene('+n+')'),n);
  const scenes = async ()=>page.evaluate(()=>{const k=document.getElementById('krpanoSWFObject');const n=+k.get('scene.count');const o=[];for(let i=0;i<n;i++)o.push({name:k.get('scene['+i+'].name'),title:k.get('scene['+i+'].title')||''});return o;});

  await page.goto(a6.panoUrl, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('canvas'); await page.waitForFunction(()=>!!document.getElementById('krpanoSWFObject'));
  await page.waitForTimeout(3000);

  // ---- 1) hide-btn 探测 ----
  console.log('\n===== 1) .hide-btn 机制探测 =====');
  const before = await page.evaluate(()=>{
    const b=document.querySelector('.hide-btn');
    if(!b) return {found:false};
    const pick=(el)=>({tag:el.tagName,cls:el.className,html:el.outerHTML.slice(0,200),
      vis:getComputedStyle(el).visibility,disp:getComputedStyle(el).display});
    // 收集可能受清屏影响的 UI 容器
    const ui=[];
    document.querySelectorAll('[class*="toolbar"],[class*="menu"],[class*="control"],[class*="bar"],[class*="nav"],[class*="btn"]').forEach(e=>{
      ui.push({cls:e.className.toString().slice(0,40),vis:getComputedStyle(e).visibility,disp:getComputedStyle(e).display});
    });
    return {found:true, btn:pick(b), bodyCls:document.body.className, rootCls:(document.querySelector('.krpano-root')||{}).className, uiSample:ui.slice(0,15)};
  });
  console.log('click 前:', JSON.stringify(before,null,1).slice(0,1200));
  // 点击
  await page.evaluate(()=>{const b=document.querySelector('.hide-btn'); b&&b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));});
  await page.waitForTimeout(800);
  const after = await page.evaluate(()=>{
    const b=document.querySelector('.hide-btn');
    const pick=(el)=>({tag:el.tagName,cls:el.className,vis:getComputedStyle(el).visibility,disp:getComputedStyle(el).display});
    const ui=[];
    document.querySelectorAll('[class*="toolbar"],[class*="menu"],[class*="control"],[class*="bar"],[class*="nav"],[class*="btn"]').forEach(e=>{
      ui.push({cls:e.className.toString().slice(0,40),vis:getComputedStyle(e).visibility,disp:getComputedStyle(e).display});
    });
    return {found:!!b, btn:b?pick(b):null, bodyCls:document.body.className, rootCls:(document.querySelector('.krpano-root')||{}).className, uiSample:ui.slice(0,15)};
  });
  console.log('click 后:', JSON.stringify(after,null,1).slice(0,1200));
  // 第二次点击（验证 toggle）
  await page.evaluate(()=>{const b=document.querySelector('.hide-btn'); b&&b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));});
  await page.waitForTimeout(800);
  const after2 = await page.evaluate(()=>{const b=document.querySelector('.hide-btn');return b?{cls:b.className,vis:getComputedStyle(b).visibility}:{gone:true};});
  console.log('第二次点击后 btn:', JSON.stringify(after2));

  // ---- 2) 正前锚定扫描 ----
  console.log('\n===== 2) 正前方锚定扫描 (A6L) =====');
  const sc = await scenes();
  console.log('scenes:', JSON.stringify(sc));
  const driverScene = sc.find(s=>/驾驶|主驾|驾驶员/.test(s.title)) || sc[0];
  const rearScene = sc.find(s=>/后排|后座|二排/.test(s.title));

  async function scan(name, sceneName, centerH, half, step) {
    await goto(sceneName); await page.waitForTimeout(WAIT_LOAD);
    const def = await readDef();
    console.log(`\n[${name}] scene=${sceneName} def=`, def);
    const out=[];
    for (let dh=-half; dh<=half; dh+=step) {
      const h = ((def.h+dh+540)%360)-180;
      await setView(h,0,95); await page.waitForTimeout(WAIT_SET);
      const s = brightRunRatio(await shot());
      out.push({dh, h:+h.toFixed(1), score:+s.toFixed(3)});
    }
    out.sort((a,b)=>b.score-a.score);
    console.log(`[${name}] 打分(降序):`, JSON.stringify(out.slice(0,6)));
    return out;
  }

  await scan('DRIVER', driverScene.name, 0, 90, 15);
  if (rearScene) await scan('REAR', rearScene.name, 180, 90, 15);
  else console.log('REAR 场景缺失，跳过');

  await browser.close();
  console.log('\nDONE');
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
