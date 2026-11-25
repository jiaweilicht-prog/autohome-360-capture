// tune_samples.cjs — 为暂定视角（V2/V3）生成角度梯度样张，供人工挑选后写回标定配置
//
// 输出：output/tune-samples/{车型}/{视角}_dh{偏移}_v{俯仰}.png + tune.html 比对页
// 用法: node tune_samples.cjs
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = require('path').resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'tune-samples');
const CALIB = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'p1-calibration.json'), 'utf8'));

// 代表车：一台有真副驾机位、一台只有主驾机位（降级路线）
const SAMPLES = [
  { brand: '奥迪', series: '奥迪A6L', panoId: 76524, note: '有真「副驾驶位」机位' },
  { brand: '大众', series: '高尔夫', panoId: 75017, note: '无副驾机位，走降级路线' }
];

// 梯度：dh 水平偏转档位 × v 俯仰档位
const GRID = {
  V2: { dh: [-36, -48, -60, -72], v: [20, 28] },
  V3: { dh: [55, 70, 85], v: [24, 34] }
};

function normH(x) { return ((x + 180) % 360 + 360) % 360 - 180; }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 714 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  const results = [];

  for (const car of SAMPLES) {
    console.log(`\n=== ${car.brand}/${car.series} (pano ${car.panoId}) ${car.note} ===`);
    await page.goto(`https://pano.autohome.com.cn/car/pano/${car.panoId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !!document.getElementById('krpanoSWFObject'), { timeout: 30000 });
    await page.waitForTimeout(11000);

    const scenes = await page.evaluate(() => {
      const k = document.getElementById('krpanoSWFObject');
      try { k.call('stopautorotate()'); } catch (e) {}
      try { k.set('autorotate.enabled', false); } catch (e) {}
      const n = Number(k.get('scene.count'));
      const out = [];
      for (let i = 0; i < n; i++) out.push({ name: String(k.get(`scene[${i}].name`)), title: String(k.get(`scene[${i}].title`) || '') });
      return out;
    });
    const titles = [...new Set(scenes.map(s => s.title))].join(' / ');
    console.log(`  机位: ${titles}`);

    const sceneFor = (role) => {
      const keys = role === 'passenger' ? ['副驾', '乘客'] : ['驾驶', '主驾'];
      return scenes.find(s => keys.some(k => s.title.includes(k))) || null;
    };

    const sceneDefaults = {};
    async function defaultOf(sceneName) {
      if (sceneDefaults[sceneName]) return sceneDefaults[sceneName];
      await page.evaluate((n) => document.getElementById('krpanoSWFObject').call('loadscene(' + n + ')'), sceneName);
      await page.waitForTimeout(12000);
      const d = await page.evaluate(() => {
        const k = document.getElementById('krpanoSWFObject');
        return { h: Number(k.get('view.hlookat')), v: Number(k.get('view.vlookat')), f: Number(k.get('view.fov')) };
      });
      sceneDefaults[sceneName] = d;
      return d;
    }
    async function clearUI() {
      await page.evaluate(() => {
        const b = document.querySelector('.hide-btn');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
    }

    for (const vid of ['V2', 'V3']) {
      const cfg = CALIB.views[vid];
      const primary = sceneFor(cfg.role);
      const scene = primary || sceneFor(cfg.roleFallback);
      if (!scene) { console.log(`  [${vid}] 无机位`); continue; }
      const usedFallback = !primary;
      const def = await defaultOf(scene.name);
      const baseDh = usedFallback ? cfg.dhFallback : cfg.dh;
      console.log(`  [${vid}] 机位=${scene.title}${usedFallback ? '(降级)' : ''} 默认h=${def.h.toFixed(1)}`);

      for (const dh of GRID[vid].dh) {
        for (const v of GRID[vid].v) {
          const h = normH(def.h + dh);
          const f = cfg.fov;
          await page.evaluate(({ hh, vv, ff }) => {
            const k = document.getElementById('krpanoSWFObject');
            k.set('view.hlookat', hh); k.set('view.vlookat', vv); k.set('view.fov', ff);
          }, { hh: h, vv: v, ff: f });
          await page.waitForTimeout(1800);
          await clearUI();
          await page.waitForTimeout(400);

          const dir = path.join(OUT, `${car.brand}-${car.series}`);
          fs.mkdirSync(dir, { recursive: true });
          const fname = `${vid}_dh${dh}_v${v}.png`;
          const fpath = path.join(dir, fname);
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(fpath, Buffer.from(data, 'base64'));
          results.push({ car: `${car.brand}/${car.series}`, vid, dh, v, fov: f, file: fpath, rel: path.relative(OUT, fpath), fallback: usedFallback, sceneTitle: scene.title });
          process.stdout.write(`    ${fname} `);
        }
      }
      console.log('');
    }
  }
  await browser.close();

  // ---- 缩略图 + 比对页 ----
  const THUMB_DIR = path.join(OUT, 'thumbs');
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  function thumb(src, dest, w) {
    const png = PNG.sync.read(fs.readFileSync(src));
    const scale = w / png.width, h = Math.max(1, Math.round(png.height * scale));
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      const sy = Math.min(png.height - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(png.width - 1, Math.floor(x / scale));
        const si = (sy * png.width + sx) * 4, di = (y * w + x) * 4;
        out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1]; out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = 255;
      }
    }
    fs.writeFileSync(dest, PNG.sync.write(out));
  }
  for (const r of results) {
    r.thumbRel = path.join('thumbs', r.rel);
    const tp = path.join(THUMB_DIR, r.rel);
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    try { thumb(r.file, tp, 360); } catch (e) { console.log('缩略图失败', r.file, e.message); }
  }

  const cars = [...new Set(results.map(r => r.car))];
  let body = '';
  for (const car of cars) {
    body += `<h2>${car}</h2>`;
    for (const vid of ['V2', 'V3']) {
      const cfg = CALIB.views[vid];
      const vs = [...new Set(GRID[vid].v)];
      const dhList = GRID[vid].dh;
      const cur = cfg.roleFallback && results.find(r => r.car === car && r.vid === vid)?.fallback ? cfg.dhFallback : cfg.dh;
      body += `<h3>${vid} ${cfg.name}　<span class="hint">当前值 dh=${cur} v=${cfg.v} fov=${cfg.fov}　（加粗为当前档）</span></h3>`;
      body += '<table class="g"><tr><th>dh ＼ v</th>' + vs.map(v => `<th>v=${v}</th>`).join('') + '</tr>';
      for (const dh of dhList) {
        body += `<tr><th>dh=${dh}</th>`;
        for (const v of vs) {
          const r = results.find(x => x.car === car && x.vid === vid && x.dh === dh && x.v === v);
          const isCur = (dh === cur && v === cfg.v);
          body += r
            ? `<td class="${isCur ? 'cur' : ''}"><a href="${encodeURI(r.rel)}" target="_blank"><img src="${encodeURI(r.thumbRel)}" loading="lazy"></a><div class="cap">${r.sceneTitle}${r.fallback ? ' · 降级' : ''}</div></td>`
            : '<td>—</td>';
        }
        body += '</tr>';
      }
      body += '</table>';
    }
  }

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>角度梯度样张 · 用于确定 V2/V3</title>
<style>body{font-family:-apple-system,"PingFang SC",sans-serif;margin:24px;background:#0f1115;color:#e6e6e6}
h1{font-size:20px}h2{font-size:17px;margin:26px 0 6px;border-bottom:1px solid #2a2f3a;padding-bottom:6px}
h3{font-size:14px;margin:16px 0 6px;font-weight:600}
.hint{font-weight:400;font-size:12px;color:#8b93a1}
table.g{border-collapse:collapse;margin:6px 0 14px}table.g th,table.g td{border:1px solid #262c38;padding:6px;vertical-align:top}
table.g th{background:#1a1f29;font-size:12px;font-weight:600}
table.g img{width:360px;display:block;border-radius:4px;background:#000}
td.cur{background:#1d2a1f;outline:2px solid #4caf50}
.cap{font-size:11px;color:#8b93a1;margin-top:4px}
.note{background:#161a22;border-left:3px solid #f5a623;padding:10px 14px;margin:14px 0;font-size:13px;border-radius:0 6px 6px 0}
code{color:#8fd0ff;font-family:ui-monospace,Menlo,monospace;font-size:12px}</style></head><body>
<h1>角度梯度样张 · 用于敲定 V2 / V3</h1>
<div class="note">
左列为水平偏转 <b>dh</b>（负=向左转、正=向右转），表头为俯仰 <b>v</b>（<b>正值向下</b>、0=水平）。绿框为当前采用值。
<br>看完直接告诉我「V2 用 dh=xx、v=xx」即可，我会写回 <code>config/p1-calibration.json</code> 并重跑这两个视角：
<code>node probe/run-p1.cjs --views V2,V3 --no-skip</code>。
</div>
${body}
</body></html>`;
  fs.writeFileSync(path.join(OUT, 'tune.html'), html);
  console.log(`\n梯度样张 ${results.length} 张，比对页: ${path.join(OUT, 'tune.html')}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
