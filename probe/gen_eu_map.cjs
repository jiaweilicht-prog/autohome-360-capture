// 生成 config/ddgs_vehicle_map_eu.csv（对齐日系格式）
// 复用 run_eu_ddgs_rename.cjs 已验证的 BRAND_MAP / MODEL_MAP，按 panoId 圈定 98 台筛选欧系
// 列: series, seriesName, brandCn, brandCode, modelCode, genCode, years, panoId
const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '..');
const EU_SCRIPT = ROOT + '/probe/run_eu_ddgs_rename.cjs';
const DISC = ROOT + '/config/eu_discovery_full.json';
const RUN = ROOT + '/config/eu_run_panos.json';
const CAT = ROOT + '/config/eu_compressed_catalog.csv';
const OUT = ROOT + '/config/ddgs_vehicle_map_eu.csv';

function sanitize(s) { return String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 110); }

// 从 EU 脚本提取已验证的两个映射表
const src = fs.readFileSync(EU_SCRIPT, 'utf8');
const bm = src.match(/const BRAND_MAP\s*=\s*(\{[\s\S]*?\n\});/)[1];
const mm = src.match(/const MODEL_MAP\s*=\s*(\{[\s\S]*?\n\});/)[1];
const BRAND_MAP = eval('(' + bm + ')');
const MODEL_MAP = eval('(' + mm + ')');

const full = require(DISC).results;
const run = require(RUN);
const panos = new Set();
for (const k in run) for (const p of run[k]) panos.add(String(p));

// years 来自 catalog（pano_id -> years）
const yearsMap = {};
for (const ln of fs.readFileSync(CAT, 'utf8').trim().split('\n').slice(1)) {
  const a = ln.split(',').map(x => x.trim().replace(/^"|"$/g, ''));
  // 表头: batch,idx,brand,model,generation,years,powertrain,autohome_series,pano_id,note
  yearsMap[a[8]] = a[5];
}

const rows = [];
let missing = 0;
for (const r of full) {
  const pano = String(r.panoId);
  if (!panos.has(pano)) continue;
  const bc = BRAND_MAP[r.brandCn];
  const mc = MODEL_MAP[sanitize(r.seriesName)];
  if (!bc || !mc) { missing++; console.log('⚠ 无映射:', r.brandCn, r.seriesName, 'pano=' + pano); continue; }
  rows.push([r.seriesName, r.seriesName, r.brandCn, bc, mc, 'NA', yearsMap[pano] || '', pano]);
}

if (missing) { console.log(`\n有 ${missing} 台无映射，请补全后重试`); process.exit(1); }
console.log('覆盖欧系筛选台数:', rows.length, '/', panos.size);

const lines = [['series', 'seriesName', 'brandCn', 'brandCode', 'modelCode', 'genCode', 'years', 'panoId'].join(',')];
for (const r of rows) lines.push(r.join(','));
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log('已写', OUT);
