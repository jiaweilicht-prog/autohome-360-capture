// 定位 5 台宝马测试车；重点确认「7系 2025款」与「7系 2027款」是否为不同车系（避免同一 pano 拍两遍）
const GRADE_BASE = 'https://www.autohome.com.cn/grade/carhtml';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const t = await res.text();
      if (!t || t.length < 1000) throw new Error('short');
      return t;
    } catch (e) { if (i === retries - 1) throw e; await sleep(1000 * (i + 1)); }
  }
}
function parseGradePage(html) {
  const out = {};
  for (const b of html.split('<dl ').slice(1)) {
    const bm = b.match(/<dt>\s*<a[^>]*>.*?<\/a>.*?<div>\s*<a[^>]*>([^<]+)<\/a>\s*<\/div>\s*<\/dt>/s);
    if (!bm) continue;
    const brand = bm[1].trim();
    const items = [];
    const re = /<li\s+id="s(\d+)"[^>]*>.*?<h4[^>]*>.*?<a[^>]*>([^<]+)<\/a>.*?<\/li>/gs;
    let m; while ((m = re.exec(b)) !== null) items.push({ id: parseInt(m[1], 10), name: m[2].trim() });
    if (items.length) out[brand] = items;
  }
  return out;
}
function norm(s) { return String(s).toLowerCase().replace(/\s+/g, '').replace(/[·\-\/（）()]/g, ''); }
const Q = [
  { label: '宝马iX3 2027', q: ['ix3'] },
  { label: '宝马X3 2026', q: ['x3', '宝马x3'] },
  { label: '宝马X5 2026', q: ['x5', '宝马x5'] },
  { label: '宝马7系 2027 / 2025', q: ['7系', '宝马7系'] },
];
(async () => {
  const byBrand = {};
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    try { Object.assign(byBrand, parseGradePage(await fetchText(`${GRADE_BASE}/${L}.html`))); } catch (e) {}
    await sleep(150);
  }
  const all = [];
  for (const [brand, items] of Object.entries(byBrand)) for (const s of items) all.push({ ...s, brand });
  console.log('总车系数:', all.length);
  for (const t of Q) {
    console.log(`\n==== ${t.label} ====`);
    const hits = all.filter(s => {
      const sn = norm(s.name);
      return t.q.some(q => { const qn = norm(q); return sn === qn || sn.includes(qn); });
    });
    // 只保留品牌名含「宝马」的，避免误配（如 长安X5）
    const bmw = hits.filter(s => s.brand.includes('宝马'));
    for (const s of bmw) console.log(`  brand=${s.brand} id=${s.id} ${s.name}`);
    if (!bmw.length) for (const s of hits.slice(0, 6)) console.log(`  (非宝马,仅供参考) brand=${s.brand} id=${s.id} ${s.name}`);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
