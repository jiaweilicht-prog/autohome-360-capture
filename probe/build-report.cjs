// build-report.cjs — 读取 output/manifest.json，生成带缩略图联系表的 HTML 报告
// 用法: node build-report.cjs [--thumb-w 380] [--no-thumb]
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = require('path').resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'output');
const IMG_DIR = path.join(OUTPUT, 'images');
const THUMB_DIR = path.join(OUTPUT, 'thumbs');
const REPORT = path.join(OUTPUT, 'report.html');
const MANIFEST = path.join(OUTPUT, 'manifest.json');
const DISCOVERY = path.join(ROOT, 'probe', 'p1-discovery.json');
const CALIB = path.join(ROOT, 'config', 'p1-calibration.json');
const FAIL_CSV = path.join(OUTPUT, 'failures.csv');

const argv = process.argv.slice(2);
const THUMB_W = (argv.find(a => a.startsWith('--thumb-w=')) || '--thumb-w=380').split('=')[1] | 0;
const NO_THUMB = argv.includes('--no-thumb');

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// 最近邻缩放生成缩略图
function makeThumb(srcPath, destPath, targetW) {
  const png = PNG.sync.read(fs.readFileSync(srcPath));
  const scale = targetW / png.width;
  const w = targetW, h = Math.max(1, Math.round(png.height * scale));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(png.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / scale));
      const si = (sy * png.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, PNG.sync.write(out));
  return { w, h };
}

// ---- 载入 ----
const disc = JSON.parse(fs.readFileSync(DISCOVERY, 'utf8'));
const calib = JSON.parse(fs.readFileSync(CALIB, 'utf8'));
let manifest = { items: {} };
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { console.log('(无 manifest)'); }

const items = Object.values(manifest.items || {}).filter(it => it && it.path && fs.existsSync(it.path));
console.log(`已完成截图: ${items.length}`);

// ---- 缩略图 ----
fs.mkdirSync(THUMB_DIR, { recursive: true });
const t0 = Date.now();
let nThumb = 0;
for (const it of items) {
  const rel = path.relative(IMG_DIR, it.path);
  const tpath = path.join(THUMB_DIR, rel);
  it.thumb = tpath;
  it.thumbRel = path.relative(OUTPUT, tpath);
  if (NO_THUMB) continue;
  if (fs.existsSync(tpath)) { nThumb++; continue; }
  try { makeThumb(it.path, tpath, THUMB_W); nThumb++; }
  catch (e) { console.log('  缩略图失败', it.path, e.message); }
}
console.log(`缩略图 ${nThumb} 张，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---- sidecar 信息 ----
for (const it of items) {
  const scPath = it.path.replace(/\.png$/, '.json');
  if (fs.existsSync(scPath)) {
    try {
      const sc = JSON.parse(fs.readFileSync(scPath, 'utf8'));
      it.cam = sc.camera_state; it.sceneTitle = sc.scene_title; it.viewName = sc.view_name;
      it.url = sc.source_url; it.at = sc.captured_at; it.provisional = sc.provisional;
      it.fallback = sc.fallback; it.fallbackNote = sc.fallback_note;
    } catch (e) {}
  }
}

// ---- 失败项 ----
let failRows = [];
if (fs.existsSync(FAIL_CSV)) {
  const lines = fs.readFileSync(FAIL_CSV, 'utf8').trim().split('\n');
  if (lines.length > 1) {
    const parse = (l) => (l.match(/"((?:[^"]|"")*)"/g) || []).map(s => s.slice(1, -1).replace(/""/g, '"'));
    failRows = lines.slice(1).map(parse);
  }
}

// ---- 无 360 / 未找到 ----
const no360 = disc.results.filter(r => r.status !== 'pano_found');
const found = disc.results.filter(r => r.status === 'pano_found');

// ---- 按品牌分组 ----
const VIEW_ORDER = ['F1', 'R1-A', 'R1-B', 'V1', 'V2', 'V3'];
const byBrand = {};
for (const it of items) {
  const b = it.brand || '未分类';
  (byBrand[b] = byBrand[b] || {});
  const s = it.series || '';
  (byBrand[b][s] = byBrand[b][s] || {});
  byBrand[b][s][it.view + (it.tag || '')] = it;
}

const viewLabels = Object.assign(
  { 'R1-A': '二排正视 A', 'R1-B': '二排正视 B' },
  Object.fromEntries(Object.entries(calib.views).map(([k, v]) => [k, v.name]))
);

let brandHtml = '';
for (const brand of Object.keys(byBrand).sort((a, b) => a.localeCompare(b, 'zh'))) {
  let seriesHtml = '';
  for (const series of Object.keys(byBrand[brand]).sort((a, b) => a.localeCompare(b, 'zh'))) {
    const vs = byBrand[brand][series];
    const cells = VIEW_ORDER.map(vid => {
      const it = vs[vid];
      if (!it) return `<td class="miss">—</td>`;
      const c = it.cam ? `h${(+it.cam.hlookat).toFixed(0)} v${(+it.cam.vlookat).toFixed(0)} f${(+it.cam.fov).toFixed(0)}` : '';
      const prov = it.provisional ? '<span class="prov">暂定</span>' : '';
      const fb = it.fallback ? `<span class="fb" title="${esc(it.fallbackNote || '')}">降级</span>` : '';
      const badge = (prov || fb) ? `<br>${[prov, fb].filter(Boolean).join(' ')}` : '';
      return `<td${it.fallback ? ' class="degraded"' : ''}><a href="${encodeURI(it.thumbRel)}" target="_blank"><img src="${encodeURI(it.thumbRel)}" loading="lazy"></a>
        <div class="meta">${esc(it.viewName || viewLabels[vid] || vid)}${badge}<br><span class="cam">${c}</span></div></td>`;
    }).join('');
    seriesHtml += `<tr><th>${esc(series)}</th>${cells}</tr>`;
  }
  const cnt = Object.values(byBrand[brand]).reduce((a, s) => a + Object.keys(s).length, 0);
  brandHtml += `<h2>${esc(brand)} <span class="cnt">${Object.keys(byBrand[brand]).length} 车系 / ${cnt} 张</span></h2>
    <table class="grid"><tr><th>车系</th>${VIEW_ORDER.map(v => `<th>${esc(viewLabels[v] || v)}<br><span class="vid">${v}</span></th>`).join('')}</tr>${seriesHtml}</table>`;
}

// ---- 统计 ----
const byView = {};
for (const it of items) byView[it.view] = (byView[it.view] || 0) + 1;
const missView = {};
for (const r of failRows) { if (r[3]) missView[r[3]] = (missView[r[3]] || 0) + 1; }

const provList = Object.entries(calib.views).filter(([, v]) => v.provisional).map(([k, v]) => `${k} ${v.name}`).join('、');

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>P1 内饰全景截图报告</title>
<style>
body{font-family:-apple-system,"PingFang SC",Segoe UI,Roboto,sans-serif;margin:24px;background:#0f1115;color:#e6e6e6;line-height:1.6}
h1{font-size:21px;margin:0 0 4px}
h2{font-size:16px;margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid #2a2f3a}
.cnt{font-weight:400;font-size:12px;color:#8b93a1;margin-left:8px}
.summary{display:flex;gap:22px;flex-wrap:wrap;background:#161a22;border:1px solid #232936;border-radius:8px;padding:14px 18px;margin:14px 0}
.summary div{font-size:13px}.summary b{display:block;font-size:22px;font-weight:600;color:#fff}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}
th,td{border:1px solid #262c38;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#1a1f29;font-weight:600}
table.grid td{width:31%;text-align:center;padding:8px}
table.grid td.miss{color:#5a616e;background:#141821;text-align:center}
table.grid img{width:100%;max-width:380px;border-radius:4px;display:block;background:#000}
.meta{font-size:11px;color:#9aa3b2;margin-top:5px}
.cam{color:#6b7382;font-family:ui-monospace,Menlo,monospace;font-size:10px}
.prov{background:#5a4410;color:#f0b429;padding:1px 5px;border-radius:3px;font-size:10px}
.fb{background:#5a2410;color:#ff8f6b;padding:1px 5px;border-radius:3px;font-size:10px;cursor:help}
td.degraded{background:#1a1415}
.vid{font-weight:400;color:#6b7382;font-size:10px}
a{color:#6cb4ff;text-decoration:none}
.note{background:#161a22;border-left:3px solid #f5a623;padding:10px 14px;margin:14px 0;font-size:13px;border-radius:0 6px 6px 0}
code{background:#22283400;color:#8fd0ff;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.tbl-scroll{overflow-x:auto}
</style></head><body>
<h1>P1 内饰全景截图报告</h1>
<div style="color:#8b93a1;font-size:12px">生成时间 ${new Date().toLocaleString('zh-CN')} ｜ 分辨率 2880×1428 ｜ 引擎 krpano</div>

<div class="summary">
  <div><b>${disc.results.length}</b>目标车型</div>
  <div><b>${found.length}</b>有 360° 全景</div>
  <div><b>${items.length}</b>已截图</div>
  <div><b>${failRows.length}</b>失败/缺机位</div>
  <div><b>${no360.length}</b>无全景（已记录）</div>
  <div style="color:#ff8f6b"><b style="color:#ff8f6b">${items.filter(i => i.fallback).length}</b>降级产出</div>
</div>

<div class="note">
<b>本批为 F1（主驾正视前排 IP）+ R1（二排正视前排）两个机位</b>。F1 进入主驾机位正前方看 IP；R1 进入第二排从二排向前看——上部前风挡、中部完整 IP 横向条带与中控屏、下部前排座椅与中央通道、两侧门窗与门板。
<br><b>R1 的 A / B 两个方向</b>：自动定向能锁定车辆纵轴，但在约 1/3 车型上分不清「朝前」还是「朝后」。
因此每台车同时输出 <b>A（判据判定的正前方）</b> 与 <b>B（A 旋转 180°）</b>，
<b>其中必有一个是正确的正视图</b>。请扫一眼告诉我哪些车该用 B，我把 B 定稿为正式文件、删掉 A。F1 视角方向明确（主驾正前），仅输出单张。
<br><b>${esc(provList)}</b> 为暂定角度，请翻到下面看样张，告诉我调整方向即可一键重跑。
<br><b>重跑命令</b>：<code>node probe/run-p1.cjs --views F1,R1 --no-skip</code>（改完 config/p1-calibration.json 里的 h / v / fov 后执行）
<br><b>参数含义</b>：h = 绝对水平角（增大=向右转）；v = 俯仰（<b>正值向下</b>，0=水平）；fov = 视野角（越大越广、畸变越大，站点上限 95）。
<br><br><b>2026-09-05 下调</b>：用户反馈上一版视角整体偏高（A柱偏多、中控台偏少），本次把相机再向下 3–10°（增大 vlookat）。F1 v 15→24（+9°，h15/f90 不变），R1 v -10→-7（+3°，h-15/f95 不变）。
<br><br><b>关于「降级」标记</b>：${esc(calib.views.V3 && calib.views.V3.fallbackDesc || '')} 橙色底纹即为降级产出，画质/构图不如真机位，请按需取舍。
</div>

${brandHtml}

<h2>失败 / 缺少机位（${failRows.length}）</h2>
<div class="tbl-scroll"><table><tr><th>品牌</th><th>车系</th><th>车型/ID</th><th>视角</th><th>环节</th><th>原因</th></tr>
${failRows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3] || '')}</td><td>${esc(r[4] || '')}</td><td>${esc(r[5] || '')}</td></tr>`).join('') || '<tr><td colspan="6">无</td></tr>'}
</table></div>
<div style="font-size:12px;color:#8b93a1">常见原因：<b>view_not_available</b> = 该车全景里没有「副驾驶位」机位，属于源数据缺失，不是程序错误。</div>

<h2>无 360° 全景 / 未找到（${no360.length} 条，按要求不截图但已记录）</h2>
<div class="tbl-scroll"><table><tr><th>品牌</th><th>车型</th><th>年款</th><th>状态</th><th>匹配到的车系</th><th>备注</th></tr>
${no360.map(r => `<tr><td>${esc(r.brandCn)}</td><td>${esc(r.modelCn)}</td><td>${esc(r.years)}</td><td>${esc(r.status)}</td><td>${esc(r.seriesName || '—')}</td><td>${esc(r.note || '')}</td></tr>`).join('')}
</table></div>

<h2>标定依据</h2>
<div class="note" style="border-left-color:#4a9eff">
${esc(calib.method || '')}
<br><br><b>方向约定</b>：${esc(calib.directionConvention || '')}
<br><br><b>参考图来源核查</b>：${esc(calib.refSourceCheck || '')}
</div>
</body></html>`;

fs.writeFileSync(REPORT, html);
console.log(`报告已生成: ${REPORT}`);
console.log(`  已截图 ${items.length} 张 | 失败 ${failRows.length} | 无全景 ${no360.length}`);
console.log(`  分视角: ${JSON.stringify(byView)}`);
