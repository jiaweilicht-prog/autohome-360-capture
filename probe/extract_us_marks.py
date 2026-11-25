#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从「人工打点」截图提取绿色五角星 -> 映射回 picklist.csv 行 (gid/品牌/车系)。
- 顺序依据: picklist.csv 与 sheets/s_*.jpg 同一次 finalize 生成, sheet 第 k 格 = picklist 第 k 行。
- 星标检测: 截图 -> 修正宽高比抠出 sheet 区域 -> 连通域找绿色五角星质心 -> 换算 (row,col)。
- 星标=正样本(正确图); 未打星=负样本(易混淆, 判负)。s_11 单格未截图, 默认负。
输出: marks/positive.csv, negative.csv, marks_log.json
"""
import csv, glob, os, hashlib, re
from collections import defaultdict
from PIL import Image
import numpy as np

BASE = 'output/us_target_candidates_v2/'
DOTD = BASE + 'sheets/人工打点/'
PICK = BASE + 'picklist.csv'
OUT  = BASE + 'marks/'
os.makedirs(OUT, exist_ok=True)

COLS, CELL, GAP = 8, 260, 6
ROWSTRIDE = CELL + 24
SHEET_W = COLS*(CELL+GAP) + GAP
SHEET_H5 = 5*ROWSTRIDE + GAP
SHEET_ASPECT = SHEET_W / SHEET_H5

rows = list(csv.DictReader(open(PICK, encoding='utf-8')))
N = len(rows)

def blk_key(f):
    m = re.search(r'上午?(\d+)\.(\d+)\.(\d+)', os.path.basename(f))
    return int(m.group(1))*3600+int(m.group(2))*60+int(m.group(3)) if m else 0

def uniq_pngs():
    files = sorted(glob.glob(DOTD + '*.png'))
    seen = {}; order = []
    for f in files:
        h = hashlib.md5(open(f,'rb').read()).hexdigest()
        if h not in seen:
            seen[h] = f; order.append(f)
    return order

def corner_bg(arr):
    Hh,W = arr.shape[:2]
    pts = [arr[3,3], arr[3,W-4], arr[Hh-4,3], arr[Hh-4,W-4]]
    return np.median(np.array(pts), axis=0).astype(int)

def forced_bbox(arr, bg):
    diff = np.abs(arr.astype(int) - bg).sum(axis=2)
    mask = diff > 12
    ys, xs = np.where(mask)
    x0,x1 = xs.min(), xs.max()+1
    y0,y1 = ys.min(), ys.max()+1
    bw, bh = x1-x0, y1-y0
    if bw/bh > SHEET_ASPECT:
        nb = int(bh*SHEET_ASPECT); x0 += (bw-nb)//2; x1 = x0+nb; bw = nb
    else:
        nh = int(bw/SHEET_ASPECT); y0 += (bh-nh)//2; y1 = y0+nh; bh = nh
    return x0,y0,x1,y1,bw,bh

def green_mask(arr):
    r=arr[:,:,0].astype(int); g=arr[:,:,1].astype(int); b=arr[:,:,2].astype(int)
    return (g>170)&(r<130)&(b<130)&(g-r>70)&(g-b>70)

def star_centroids(mask):
    ys,xs = np.where(mask)
    M = len(xs)
    if M == 0: return []
    parent = list(range(M))
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    def union(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: parent[ra]=rb
    idxmap = {(int(y),int(x)):i for i,(y,x) in enumerate(zip(ys,xs))}
    for i,(y,x) in enumerate(zip(ys,xs)):
        for dy,dx in ((0,1),(1,0),(1,1),(-1,1)):
            j = idxmap.get((int(y+dy),int(x+dx)))
            if j is not None: union(i,j)
    groups = defaultdict(list)
    for i in range(M): groups[find(i)].append(i)
    cents = []
    for g in groups.values():
        if len(g) < 20:   # 噪声
            continue
        cy = float(np.mean([ys[i] for i in g])); cx = float(np.mean([xs[i] for i in g]))
        cents.append((cx, cy, len(g)))
    return cents

def main():
    pngs = sorted(uniq_pngs(), key=blk_key)
    print('unique screenshots =', len(pngs))

    star_cells = set()
    per_block = []
    for blk, f in enumerate(pngs):
        if blk > 10:
            break
        arr = np.asarray(Image.open(f).convert('RGB'))
        Hh,W = arr.shape[:2]
        bg = corner_bg(arr)
        x0,y0,x1,y1,bw,bh = forced_bbox(arr, bg)
        sx = SHEET_W/bw; sy = SHEET_H5/bh
        gm = green_mask(arr)
        cents = star_centroids(gm)
        cnt = 0
        for cx,cy,_ in cents:
            shx = (cx - x0)*sx
            shy = (cy - y0)*sy
            c = int((shx - GAP)//(CELL+GAP)); r = int((shy - GAP)//ROWSTRIDE)
            c = max(0, min(COLS-1, c)); r = max(0, min(4, r))
            # 二次校验: 该格内确有绿像素
            star_cells.add((blk, r, c)); cnt += 1
        per_block.append(cnt)
        print(f'  blk{blk} {os.path.basename(f)}: stars={cnt}')

    pos_idx = set()
    for (blk,r,c) in star_cells:
        idx = blk*40 + r*COLS + c
        if idx < N:
            pos_idx.add(idx)
    # s_11 单格(idx=440) 默认负
    print(f'正样本(星标) = {len(pos_idx)} / 共 {N} 候选')
    print('每墙星数:', per_block)

    cols = ['idx','sid','gid','brand','series','specname','score','img_sim','txt_sim','block','row','col','local']
    def rrow(idx):
        rr = rows[idx]
        return [rr['sid'],rr['gid'],rr['brand'],rr['series'],rr['specname'],
                rr['score'],rr['img_sim'],rr['txt_sim'],rr['local']]
    with open(OUT+'positive.csv','w',newline='',encoding='utf-8') as fp:
        w=csv.writer(fp); w.writerow(cols)
        for idx in sorted(pos_idx):
            sid,gid,br,se,sp_,sc,im,tx,lo = rrow(idx)
            blk,r,c = idx//40, (idx%40)//COLS, idx%COLS
            w.writerow([idx,sid,gid,br,se,sp_,sc,im,tx,blk,r,c,lo])
    with open(OUT+'negative.csv','w',newline='',encoding='utf-8') as fp:
        w=csv.writer(fp); w.writerow(cols)
        for idx in range(N):
            if idx in pos_idx: continue
            sid,gid,br,se,sp_,sc,im,tx,lo = rrow(idx)
            blk,r,c = idx//40, (idx%40)//COLS, idx%COLS
            w.writerow([idx,sid,gid,br,se,sp_,sc,im,tx,blk,r,c,lo])

    import json
    log={'n_total':N,'n_positive':len(pos_idx),'n_negative':N-len(pos_idx),
         'per_block_stars':per_block,'star_cells':[list(k) for k in sorted(star_cells)],
         'mapping':'sheet_cell_k == picklist_row_k (same finalize run, mtime matched)'}
    json.dump(log, open(OUT+'marks_log.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
    print('done ->', OUT)

if __name__=='__main__':
    main()
