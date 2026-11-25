// choose_final.cjs — 从已保存的候选 PNG 重新评分，按用户明确目标挑角（不重渲染）。
//   F1：默认 fov=95；在该 fov 下取 center+side 总分最高。
//   R1：要求 亮→暗过渡行 transRow ∈ [25%,38%]（IP+方向盘落在画面上 1/3），
//       且上/下部都有内容(varUpper>50 && varLower>50)；在满足者中取最靠近 32% 且内容总和最大者。
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join('.', 'probe', 'calib_a6l');

function rowMeans(png) {
  const { width: W, height: H, data } = png; const m = new Array(H).fill(0);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s += 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; } m[y] = s / W; }
  return m;
}
function regionVar(png, y0f, y1f, x0f, x1f) {
  const { width: W, height: H, data } = png;
  const y0 = Math.floor(H*y0f), y1 = Math.floor(H*y1f), x0 = Math.floor(W*x0f), x1 = Math.floor(W*x1f);
  if (y1 <= y0 || x1 <= x0) return 0; let s=0,s2=0,n=0;
  for (let y=y0;y<y1;y+=2) for (let x=x0;x<x1;x+=2){ const i=(y*W+x)*4; const L=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; s+=L;s2+=L*L;n++; }
  if (n<2) return 0; const m=s/n; return Math.max(0, s2/n - m*m);
}
function scoreF1(png){ return regionVar(png,0.25,0.65,0.10,0.90) + regionVar(png,0,1,0,0.25) + regionVar(png,0,1,0.75,1); }
function transRow(png){ const {height:H}=png; const rm=rowMeans(png); let by=Math.floor(H*0.32),bg=-Infinity; for(let y=1;y<H-1;y++){const g=rm[y-1]-rm[y+1]; if(g>bg){bg=g;by=y;}} return by/H; }
function scoreR1(png){ const tr=transRow(png); return -Math.abs(tr-0.32)+0.5*regionVar(png,0,0.4,0,1)+0.5*regionVar(png,0.4,1,0,1); }

function parse(f){ const m=f.match(/^(F1|R1)_h(-?\d+)_v(-?\d+)_f(\d+)\.png$/); return m?{p:path.join(DIR,f),h:+m[2],v:+m[3],f:+m[4],file:f}:null; }

// 仅纳入本次 v2 网格的参数组合（避免读到旧标定残留 PNG）
const F1SET = new Set(); for (const f of [90,95]) for (const h of [-15,0,15,30]) for (const v of [10,15,20,25]) F1SET.add(`${h}_${v}_${f}`);
const R1SET = new Set(); for (const h of [-30,-15,0,15,30]) for (const v of [-15,-10,-5,0,5,10,15]) R1SET.add(`${h}_${v}_95`);
function inGrid(prefix, c){ return (prefix==='F1'?F1SET:R1SET).has(`${c.h}_${c.v}_${c.f}`); }

const files = fs.readdirSync(DIR).filter(f=>/^(F1|R1)_h/.test(f)&&f.endsWith('.png')&&!f.endsWith('_best.png'));
const F1 = [], R1 = [];
for (const f of files){ const c=parse(f); if(!c) continue; if(!inGrid(c.file.startsWith('F1')?'F1':'R1', c)) continue; const png=PNG.sync.read(fs.readFileSync(c.p));
  if(c.file.startsWith('F1')){ c.score=scoreF1(png); c.centerVar=regionVar(png,0.25,0.65,0.1,0.9); c.sideVar=regionVar(png,0,1,0,0.25)+regionVar(png,0,1,0.75,1); F1.push(c); }
  else { c.tr=transRow(png); c.varU=regionVar(png,0,0.4,0,1); c.varL=regionVar(png,0.4,1,0,1); c.score=scoreR1(png); R1.push(c); }
}

// F1：默认 fov=95
const f95 = F1.filter(c=>c.f===95).sort((a,b)=>b.score-a.score);
const f1best = f95[0];
console.log('F1 (fov=95 only) top3:');
for (const c of f95.slice(0,3)) console.log(`  h=${c.h} v=${c.v} f=${c.f} score=${c.score.toFixed(0)} center=${c.centerVar.toFixed(0)} side=${c.sideVar.toFixed(0)}`);

// R1：transRow ∈ [0.25,0.38] 且上下都有内容
const inRange = R1.filter(c=>c.tr>=0.25&&c.tr<=0.38&&c.varU>50&&c.varL>50)
  .sort((a,b)=> (Math.abs(a.tr-0.32)-Math.abs(b.tr-0.32)) || (b.varU+b.varL)-(a.varU+a.varL));
console.log('\nR1 候选 transRow∈[25%,38%] 且上下均有内容:');
for (const c of inRange) console.log(`  h=${c.h} v=${c.v} f=${c.f} transRow=${(c.tr*100).toFixed(1)}% varU=${c.varU.toFixed(0)} varL=${c.varL.toFixed(0)} score=${c.score.toFixed(2)}`);
const r1best = inRange[0] || R1.slice().sort((a,b)=>b.score-a.score)[0];
if (!inRange.length) console.log('  (无严格命中，回退到综合分最高)');

console.log(`\n==> F1 选定: h=${f1best.h} v=${f1best.v} fov=${f1best.f}  (center=${f1best.centerVar.toFixed(0)} side=${f1best.sideVar.toFixed(0)})`);
console.log(`==> R1 选定: h=${r1best.h} v=${r1best.v} fov=${r1best.f}  transRow=${(r1best.tr*100).toFixed(1)}%  (varU=${r1best.varU?r1best.varU.toFixed(0):'?'} varL=${r1best.varL?r1best.varL.toFixed(0):'?'})`);

fs.writeFileSync(path.join(DIR,'result3.json'), JSON.stringify({
  F1:{h:f1best.h,v:f1best.v,fov:f1best.f,score:+f1best.score.toFixed(2),file:f1best.file,centerVar:+f1best.centerVar.toFixed(1),sideVar:+f1best.sideVar.toFixed(1)},
  R1:{h:r1best.h,v:r1best.v,fov:r1best.f,score:+r1best.score.toFixed(2),file:r1best.file,transitionRowPct:+(r1best.tr*100).toFixed(1),varUpper:+(r1best.varU||0).toFixed(1),varLower:+(r1best.varL||0).toFixed(1)}
},null,2));
// 复制选中
fs.copyFileSync(f1best.p, path.join(DIR,'F1_best.png'));
fs.copyFileSync(r1best.p, path.join(DIR,'R1_best.png'));
console.log('\n已写 result3.json + 复制 F1_best.png / R1_best.png');
// 也存全量供核查
const allR1 = R1.map(c => ({ h:c.h, v:c.v, f:c.f, tr:+(c.tr*100).toFixed(1), varU:+c.varU.toFixed(0), varL:+c.varL.toFixed(0), score:+c.score.toFixed(2), file:c.file }));
fs.writeFileSync(path.join(DIR, 'candidates_all.json'), JSON.stringify({ F1, R1: allR1 }, null, 2));
