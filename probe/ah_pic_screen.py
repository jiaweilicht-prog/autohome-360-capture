#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汽车之家 · 座椅分类「副驾开门看 IP+console」流式筛选（磁盘友好，不落全量缩略图）
============================================================================
思路：
  - 逐张把缩略图下载到内存，算 pHash（DCT 低频指纹），
    与参考图（原图 + 水平镜像）做汉明距离。
  - 方向判据：只保留「更像原图(前右)而非镜像(前左)」的图，机械排除方向盘挡 console 的镜像构图。
  - 命中项才把缩略图存盘（cand/），其余立即丢弃 —— 全量 16 万张也只占几十 MB。
  - 输出 candidates.csv，供 ah_pic_clip.py 做 CLIP 语义精排。

依赖：numpy + Pillow（本机 /tmp/clipvenv 已装）。参考图：output/ah_pic_ref/*.jpg

用法：
  /tmp/clipvenv/bin/python probe/ah_pic_screen.py \
    --targets /tmp/us_part_0.json --classid 3 --pages 0 \
    --refs output/ah_pic_ref/ref_target.jpg output/ah_pic_ref/jeep_4072_gid57.jpg \
    --thresh 26 --prefix 160x0_ --threads 4 --outdir output/screen_part0
"""
import argparse, csv, io, json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import numpy as np

UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')


def fetch(url, ref, retries=3, timeout=30):
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': ref})
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception:
            time.sleep(1.0)
    return b''


def sized(url, prefix='160x0_'):
    if url.startswith('//'):
        url = 'https:' + url
    head, base = url.rsplit('/', 1)
    return f'{head}/{prefix}{base}'


_M, _S = 32, 8
_C = np.cos(np.pi * (2 * np.arange(_M) + 1)[:, None] * np.arange(_M)[None, :] / (2 * _M)).astype(np.float32)


def phash(img):
    """DCT-II 低频 pHash，返回 8x8=64bit（uint8 packed）。DC 分量参与但恒为 1，与原实现一致。"""
    im = img.convert('L').resize((_M, _M), Image.Resampling.LANCZOS)
    a = np.asarray(im, dtype=np.float32)
    d = _C @ a @ _C.T
    blk = d[:_S, :_S].flatten()
    th = blk[1:].mean()
    return np.packbits(blk > th)


def ham(a, b):
    return int(np.unpackbits(a ^ b).sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--targets', required=True)
    ap.add_argument('--classid', default='3')
    ap.add_argument('--pages', type=int, default=0, help='0=全部页')
    ap.add_argument('--refs', nargs='+', required=True)
    ap.add_argument('--thresh', type=int, default=26)
    ap.add_argument('--prefix', default='160x0_')
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--maxper', type=int, default=0, help='每车系最多保留候选(0=不限)')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()

    refs_o, refs_f = [], []
    for p in a.refs:
        im = Image.open(p)
        refs_o.append(phash(im))
        refs_f.append(phash(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)))
    print(f'参考图 {len(refs_o)} 张 | 阈值 {a.thresh} | 前缀 {a.prefix}', flush=True)

    targets = json.load(open(a.targets))
    if a.limit:
        targets = targets[:a.limit]
    cand_dir = f'{a.outdir}/cand'
    os.makedirs(cand_dir, exist_ok=True)
    rows = []

    for ti, t in enumerate(targets):
        sid = t['seriesId']
        brand = t.get('brandCn', '')
        name = t.get('seriesName', str(sid))
        ref = f'https://car.m.autohome.com.cn/pic/series/{sid}.html'
        items, p = [], 1
        while True:
            try:
                d = json.loads(fetch(
                    f'https://car.m.autohome.com.cn/pic/getpiclist?seriesid={sid}&specid=0'
                    f'&classid={a.classid}&pageindex={p}&pagesize=36', ref).decode('utf-8', 'ignore'))
                r = d['result']
            except Exception as e:
                print(f'  [warn] {name} page{p}: {e}', flush=True)
                break
            pl = r.get('piclist', [])
            if not pl:
                break
            items += pl
            pc = r.get('pagecount', 1)
            if a.pages > 0 and p >= a.pages:
                break
            if p >= pc:
                break
            p += 1

        def work(kv):
            idx, it = kv
            try:
                raw = fetch(sized(it['imgurl'], a.prefix), ref)
                if not raw or len(raw) < 500:
                    return None
                h = phash(Image.open(io.BytesIO(raw)))
                do = min(ham(h, r) for r in refs_o)
                df = min(ham(h, r) for r in refs_f)
                if do <= df and do <= a.thresh:
                    cp = f'{cand_dir}/{sid}_{idx}.jpg'
                    with open(cp, 'wb') as f:
                        f.write(raw)
                    return {'brand': brand, 'series': name, 'sid': sid, 'gid': idx,
                            'imgid': it.get('id'), 'specname': it.get('specname', ''),
                            'dist': do, 'dist_flip': df, 'width': it.get('width', ''),
                            'height': it.get('height', ''), 'imgurl': it['imgurl'], 'cand': cp}
            except Exception:
                return None
            return None

        got = []
        with ThreadPoolExecutor(a.threads) as ex:
            for res in ex.map(work, list(enumerate(items))):
                if res:
                    got.append(res)
        if a.maxper and len(got) > a.maxper:
            got = sorted(got, key=lambda x: x['dist'])[:a.maxper]
        rows += got
        print(f'[{ti+1}/{len(targets)}] {brand} {name} ({sid}) 图{len(items)} 候选{len(got)}', flush=True)

    outp = f'{a.outdir}/candidates.csv'
    with open(outp, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['brand', 'series', 'sid', 'gid', 'imgid', 'specname',
                                          'dist', 'dist_flip', 'width', 'height', 'imgurl', 'cand'])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f'总候选 {len(rows)} -> {outp}', flush=True)


if __name__ == '__main__':
    main()
