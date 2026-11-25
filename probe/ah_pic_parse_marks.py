#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析人工打点截屏 v2：绿星=正样本锚点，同墙未标注=易混负面样本。
v2 修正：截屏可能是带白边的窗口截图（比例≠墙比例1.497），
先自动检测截屏中墙图的暗色区域 bbox → 得到 scale/offset，再做几何映射；
用全部无星格子的图像指纹投票确定截屏对应哪张候选墙(块号 blk)；按 (blk,星位) 去重。
输出 output/fewshot/positives.csv, negatives.csv, marks_summary.json
"""
import csv, json, os
import numpy as np
from PIL import Image

SHEET_DIR = 'output/us_target_candidates_v2/sheets/人工打点'
PICKLIST = 'output/us_target_candidates_v2/picklist.csv'
OUTDIR = 'output/fewshot'
COLS, CELL, GAP, ROWH, SHEET_W, SHEET_H = 8, 260, 6, 284, 2134, 1426
PER = COLS * 5
GREEN_MIN = 150
DARK_TH = 34          # 墙背景 RGB(22,22,25) 亮度≈24，Preview 深灰背景更亮


def detect_wall_bbox(im):
    """墙内容区 = 四边纯黑边(均值<30)以内。窗口截图左右有~93px黑边；
    墙自身背景是22的深灰、内容列均值56+，不会被误当黑边。
    边缘扫描会多吞掉墙自身6px边框，误差<10px，可忽略。"""
    g = np.asarray(im.convert('L'), dtype=np.float32)
    H, W = g.shape
    cm, rm = g.mean(axis=0), g.mean(axis=1)
    TH = 30.0
    x0 = 0
    while x0 < W - 1 and cm[x0] < TH:
        x0 += 1
    x1 = W
    while x1 > 1 and cm[x1 - 1] < TH:
        x1 -= 1
    y0 = 0
    while y0 < H - 1 and rm[y0] < TH:
        y0 += 1
    y1 = H
    while y1 > 1 and rm[y1 - 1] < TH:
        y1 -= 1
    w, h = x1 - x0, y1 - y0
    if w < 300 or h < 200:
        return 0, 0, W, H, 'full'
    ar = w / h
    if 1.42 <= ar <= 1.58:      # 墙比例 1.4966
        return x0, y0, w, h, 'black-margin'
    return 0, 0, W, H, 'full-fallback'


def fp_sheet_cell(crop):
    v = np.asarray(crop.convert('L').resize((24, 24)), dtype=np.float32).ravel()
    return (v - v.mean()) / (v.std() + 1e-6)


def fp_library(p):
    t = Image.new('L', (260, 260), 0)
    try:
        im = Image.open(p).convert('L')
        im.thumbnail((260, 260))
        t.paste(im, (0, 0))
        v = np.asarray(t.resize((24, 24)), dtype=np.float32).ravel()
    except Exception:
        return None
    return (v - v.mean()) / (v.std() + 1e-6)


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    rows = list(csv.DictReader(open(PICKLIST, encoding='utf-8')))
    thumbs = [fp_library(r['local']) for r in rows]
    T = np.stack([t for t in thumbs if t is not None])
    t_ok = [i for i, t in enumerate(thumbs) if t is not None]

    shots = sorted([f for f in os.listdir(SHEET_DIR) if f.lower().endswith('.png')],
                   key=lambda f: os.path.getmtime(os.path.join(SHEET_DIR, f)))
    print('截屏数', len(shots), flush=True)

    pos_map, neg_map, summary = {}, {}, []
    for f in shots:
        p = os.path.join(SHEET_DIR, f)
        im = Image.open(p).convert('RGB')
        x0, y0, w, h, how = detect_wall_bbox(im)
        sx, sy = w / SHEET_W, h / SHEET_H
        a = np.asarray(im, dtype=np.int16)
        R, G, B = a[..., 0], a[..., 1], a[..., 2]
        green = (G > 100) & (G - np.maximum(R, B) > 40)
        cnt = np.zeros((5, COLS), dtype=int)
        ys, xs = np.nonzero(green)
        for y, x in zip(ys, xs):
            c = int(((x - x0) / sx - GAP) // (CELL + GAP))
            r = int(((y - y0) / sy - GAP) // ROWH)
            if 0 <= r < 5 and 0 <= c < COLS:
                cnt[r, c] += 1
        starred = {(r, c) for r in range(5) for c in range(COLS) if cnt[r, c] >= GREEN_MIN}

        # 全部无星格指纹匹配投票定 blk
        vts = {}
        match_detail = []
        for r in range(5):
            for c in range(COLS):
                if (r, c) in starred:
                    continue
                cx = x0 + (GAP + c * (CELL + GAP)) * sx
                cy = y0 + (GAP + r * ROWH) * sy
                crop = im.crop((int(cx), int(cy), int(cx + CELL * sx), int(cy + CELL * sy)))
                v = fp_sheet_cell(crop)
                s = T @ v
                bi = t_ok[int(np.argmax(s))]
                b = bi // PER
                vts[b] = vts.get(b, 0) + 1
                match_detail.append(((r, c), bi, round(float(s.max()), 1)))
        blk = max(vts, key=vts.get) if vts else -1
        agree = (vts.get(blk, 0) / max(1, sum(vts.values())))
        summary.append({'shot': f, 'bbox': [x0, y0, w, h], 'how': how,
                        'blk': blk, 'agree': round(agree, 2), 'stars': len(starred),
                        'star_cells': sorted(starred), 'blk_votes': vts})
        print(f'{f}: {how} bbox={x0},{y0},{w}x{h} blk={blk} agree={agree:.0%} '
              f'星={len(starred)} {sorted(starred)}', flush=True)
        if blk < 0 or agree < 0.5:
            print('  !! 匹配置信度不足，跳过该截屏，请人工检查', flush=True)
            continue

        for r in range(5):
            for c in range(COLS):
                idx = blk * PER + r * COLS + c
                if idx >= len(rows):
                    continue
                rec = rows[idx]
                item = {'shot': f, 'blk': blk, 'row': r, 'col': c, 'idx': idx,
                        'brand': rec['brand'], 'series': rec['series'], 'sid': rec['sid'],
                        'gid': rec['gid'], 'score': rec['score'], 'local': rec['local'],
                        'fullurl': rec['fullurl']}
                if (r, c) in starred:
                    pos_map[idx] = item
                else:
                    neg_map[idx] = item

    positives = [pos_map[k] for k in sorted(pos_map)]
    negatives = [neg_map[k] for k in sorted(neg_map) if k not in pos_map]
    with open(f'{OUTDIR}/positives.csv', 'w', newline='', encoding='utf-8') as fo:
        w = csv.DictWriter(fo, fieldnames=list(positives[0].keys()))
        w.writeheader()
        w.writerows(positives)
    with open(f'{OUTDIR}/negatives.csv', 'w', newline='', encoding='utf-8') as fo:
        w = csv.DictWriter(fo, fieldnames=list(negatives[0].keys()))
        w.writeheader()
        w.writerows(negatives)
    json.dump(summary, open(f'{OUTDIR}/marks_summary.json', 'w'), ensure_ascii=False, indent=1)
    print(f'正样本 {len(positives)} | 负样本 {len(negatives)} -> {OUTDIR}', flush=True)


if __name__ == '__main__':
    main()
