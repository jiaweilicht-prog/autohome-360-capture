#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汽车之家 · 美系「副驾开门看IP+console」精排 v3（近/中/远 深度带）
============================================================================
按用户确认的 LHD 副驾侧车外 3/4 视角规范：
  唯一判据 = 空间纵深：副驾座椅(近景) → 中央通道console(中景) → 方向盘/主驾(远景)。
  不以画面左右判断，不做镜像测试。

编码方式：把画面按高度切成 远景(上)/中景(中)/近景(下) 三段深度带，
分别与两张已确认参考图(ref_target + Jeep自由侠 gid57)的同名深度带做余弦相似。
- 近景带 ≈ 副驾座椅（大、前景）
- 中景带 ≈ 中央通道 console（纵深斜向）
- 远景带 ≈ 方向盘 + IP/仪表台（小、远处）→ 同时压低「后排(远景无IP)」「驾驶位(近景为方向盘)」
  「乘客POV/正前视角(近景无座椅)」等错误构图。
打分：score = 0.20*整图 + 0.27*近景 + 0.27*中景 + 0.26*远景
复用 output/clip_rank3/emb_cache.npz 的整图嵌入；深度带分区重嵌（批量，可断点续跑）。
输出：output/clip_rank5/clip_ranked_filtered.csv + top_per_car.json
"""
import argparse, csv, json, os
import numpy as np
import torch
import open_clip
from PIL import Image

REF_POS = ['output/ah_pic_ref/ref_target.jpg',
           'output/ah_pic_ref/jeep_4072_gid57.jpg']
BANDS = {'far': (0.00, 0.45), 'mid': (0.30, 0.72), 'near': (0.55, 1.00)}  # 高度比例
CH = 64
EMB_DIM = 512


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cachedir', default='output/clip_rank3')
    ap.add_argument('--ranked', default='output/clip_rank3/clip_ranked.csv')
    ap.add_argument('--outdir', default='output/clip_rank5')
    ap.add_argument('--topk', type=int, default=3)
    ap.add_argument('--model', default='ViT-B-32')
    ap.add_argument('--pretrained', default='laion2b_s34b_b79k')
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    model, _, pre = open_clip.create_model_and_transforms(
        a.model, pretrained=a.pretrained, device='cpu')
    model.eval()

    def emb_imgs(ims):
        with torch.no_grad():
            t = torch.stack([pre(im) for im in ims])
            e = model.encode_image(t)
            e = e / e.norm(dim=-1, keepdim=True)
        return e.cpu().numpy().astype(np.float32)

    def crop_band(im, band):
        W, H = im.size
        return im.crop((0, int(band[0] * H), W, int(band[1] * H)))

    # 参考：整图 + 三段深度带（两参考平均）
    pos_emb = [emb_imgs([Image.open(p).convert('RGB')])[0] for p in REF_POS]
    ref_bands = {}
    for name, band in BANDS.items():
        v = np.mean([emb_imgs([crop_band(Image.open(p).convert('RGB'), band)])[0]
                     for p in REF_POS], axis=0)
        v /= np.linalg.norm(v)
        ref_bands[name] = v
    print('参考嵌入完成', flush=True)

    z = np.load(f'{a.cachedir}/emb_cache.npz', allow_pickle=True)
    cache = {k: v for k, v in zip(z['paths'].tolist(), z['embs'])}
    rows = list(csv.DictReader(open(a.ranked, encoding='utf-8')))
    print('候选行', len(rows), flush=True)

    todo = [r for r in rows if r['cand'] in cache]
    b_cache = {}  # cand -> {name: emb}
    bcp = f'{a.outdir}/reg_depth.npz'
    if os.path.exists(bcp):
        z2 = np.load(bcp, allow_pickle=True)
        for k in range(len(z2['paths'])):
            p = z2['paths'][k]
            b_cache[p] = {n: z2[n][k] for n in BANDS}
        print('深度带缓存命中', len(b_cache), flush=True)

    done = 0
    for i in range(0, len(todo), CH):
        chunk = todo[i:i + CH]
        batch = {n: [] for n in BANDS}
        keys = []
        for r in chunk:
            if r['cand'] in b_cache:
                continue
            try:
                im = Image.open(r['cand']).convert('RGB')
                for n, b in BANDS.items():
                    batch[n].append(crop_band(im, b))
                keys.append(r['cand'])
            except Exception:
                pass
        if keys:
            for n in BANDS:
                es = emb_imgs(batch[n])
                for k, e in zip(keys, es):
                    b_cache.setdefault(k, {})[n] = e
        done += len(chunk)
        if done % (CH * 4) == 0:
            _save_bands(b_cache, bcp)
            print(f'  深度带 {done}/{len(todo)}', flush=True)
    _save_bands(b_cache, bcp)
    print('深度带嵌入完成', flush=True)

    finals = []
    for r in todo:
        e = cache[r['cand']]
        s_img = max(float(e @ p) for p in pos_emb)
        bc = b_cache.get(r['cand'])
        if bc is None:
            s_near = s_mid = s_far = 0.0
        else:
            s_far = float(bc['far'] @ ref_bands['far'])
            s_mid = float(bc['mid'] @ ref_bands['mid'])
            s_near = float(bc['near'] @ ref_bands['near'])
        score = 0.20 * s_img + 0.27 * s_near + 0.27 * s_mid + 0.26 * s_far
        r['s_img'] = round(s_img, 4)
        r['s_near'] = round(s_near, 4)
        r['s_mid'] = round(s_mid, 4)
        r['s_far'] = round(s_far, 4)
        r['score'] = round(score, 4)
        finals.append(r)

    finals.sort(key=lambda r: -r['score'])
    bycar = {}
    for r in finals:
        bycar.setdefault(r['sid'], []).append(r)
    top = []
    for sid, rs in bycar.items():
        rs.sort(key=lambda r: -r['score'])
        top += rs[:a.topk]
    top.sort(key=lambda r: -r['score'])
    print(f'覆盖车系 {len(bycar)} | top{a.topk} 合计 {len(top)}', flush=True)
    print('Top12 by score:')
    for r in finals[:12]:
        print(f"  {r['brand']}{r['series']} gid{r['gid']} "
              f"near={r['s_near']} mid={r['s_mid']} far={r['s_far']} score={r['score']}", flush=True)

    cols = ['brand', 'series', 'sid', 'gid', 'imgid', 'specname', 'imgurl', 'cand',
            's_img', 's_near', 's_mid', 's_far', 'score']
    with open(f'{a.outdir}/clip_ranked_filtered.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        w.writerows(finals)
    json.dump(top, open(f'{a.outdir}/top_per_car.json', 'w'), ensure_ascii=False, indent=1)
    print('done ->', a.outdir, flush=True)


def _save_bands(b_cache, path):
    paths = list(b_cache.keys())
    data = {'paths': np.array(paths, dtype=object)}
    for n in BANDS:
        data[n] = np.stack([b_cache[p][n] for p in paths])
    np.savez_compressed(path, **data)


if __name__ == '__main__':
    main()
