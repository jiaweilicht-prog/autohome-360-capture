// 从 kr_shoot_list.csv + kr_pano_map.json 生成「韩系 35 组全量」p1-discovery（写入 config/kr_discovery_full.json）
// 注意：故意不写 probe/p1-discovery.json —— 那会覆盖正在运行的临时 discovery。
// 待 Licht 确认 35 组清单后，把本文件内容拷为 probe/p1-discovery.json 即可全量截图。
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const csvTxt = fs.readFileSync(path.join(ROOT, 'config', 'kr_shoot_list.csv'), 'utf8').trim().split('\n').slice(1);
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kr_pano_map.json'), 'utf8'));
// 每组取一个代表 ID（csv 第 9 字段 ids，空格分隔，取第一个在售/最新），带上 modelEn 等
const byId = {};
for (const r of map) byId[r.id] = r;
const results = [];
for (const line of csvTxt) {
  const m = line.match(/^(G\d+),(.*?),(\d+),(\d+),"(.*?)",(.*?),(.*?),(\d+),"(.*)"$/);
  if (!m) { console.log('skip', line.slice(0, 50)); continue; }
  const [, g, name, sid, pano, repModel, repYears, repStatus, nIds, idsTxt] = m;
  const ids = idsTxt.split(/\s+/).filter(Boolean);
  // 代表 = 组内第一个 On Sale/Production 的 ID，否则第一个
  const pick = ids.find(i => byId[i] && /On Sale|Production/.test(byId[i].status)) || ids[0];
  const rep = byId[pick] || { id: pick, brandCn: '?', brandEn: '?', model: name, model: repModel };
  const years = rep.y0 && rep.y1 ? `${rep.y0}-${rep.y1}` : repModel.replace(name, '').trim();
  results.push({
    group: g, brandEn: rep.brandEn, brandCn: rep.brandCn,
    modelEn: rep.id.split('_').slice(1, -2).join('_'), modelCn: repModel,
    years, searchNames: [name, repModel],
    status: 'pano_found', seriesId: +sid, seriesName: name, panoId: +pano,
    panoUrl: `https://pano.autohome.com.cn/car/pano/${pano}?_ahrotate=1`,
    nVehicleIds: +nIds, vehicleIds: ids,
  });
}
const out = { generatedAt: new Date().toISOString(), total: results.length, found: results.length, noPano: 0, notFound: 0, errors: 0, results };
fs.writeFileSync(path.join(ROOT, 'config', 'kr_discovery_full.json'), JSON.stringify(out, null, 1));
console.log(`全量 discovery 草稿 → config/kr_discovery_full.json  共 ${results.length} 组`);
results.forEach(r => console.log(`  ${r.group} ${r.brandCn}/${r.seriesName}(${r.seriesId}) pano=${r.panoId} 代表ID=${r.modelEn} ${r.years} 覆盖${r.nVehicleIds}ID`));
