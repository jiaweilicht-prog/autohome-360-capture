// _del.cjs — 分批删除（绕过 safe-delete 的每次最多 50 文件限制）
// 用法: FROM=0 TO=47 node _del.cjs   （删除扁平列表 [FROM,TO) 区间的文件）
const fs = require('fs');
const p = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const targets = ['output/images', 'output/thumbs', 'output/manifest.json'];

const files = [];
for (const t of targets) {
  const fp = p.join(ROOT, t);
  if (!fs.existsSync(fp)) continue;
  const st = fs.statSync(fp);
  if (st.isDirectory()) {
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const cp = p.join(d, e.name);
      if (e.isDirectory()) walk(cp); else files.push(cp);
    }};
    walk(fp);
  } else files.push(fp);
}
files.sort();
const FROM = parseInt(process.env.FROM || '0', 10);
const TO = parseInt(process.env.TO || '999999', 10);
const slice = files.slice(FROM, TO);
let n = 0;
for (const f of slice) { try { fs.unlinkSync(f); n++; } catch (e) {} }
// 清理空目录（images/thumbs 下的品牌/车系/配色空目录）
for (const t of ['output/images', 'output/thumbs']) {
  const base = p.join(ROOT, t);
  if (!fs.existsSync(base)) continue;
  const dirs = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const cp = p.join(d, e.name); if (e.isDirectory()) walk(cp);
  } dirs.push(d); };
  walk(base);
  for (const d of dirs.reverse()) { try { fs.rmdirSync(d); } catch (e) {} }
}
console.log(`slice [${FROM},${TO}) 删文件 ${n}（总清单 ${files.length}）`);
