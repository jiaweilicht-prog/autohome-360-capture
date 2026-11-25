#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汽车之家 · 按「参考图」精准匹配目标构图（副驾开门看 IP+console）
============================================================================
思路（与 360° 模板 MSE 同构，但用于平面照片）：
  - 用户确认若干张「目标构图」参考图（如墙里的 gid 31/32）。
  - 对每台车系的座椅分类缩略图，算 pHash（DCT 低频指纹），
    与参考图 pHash 做汉明距离，距离越小越像。
  - 输出 matches.csv（按距离排序）+ 可选匹配墙，供人眼确认。
  - confirm 阶段按选中的 gid 下原图。

为什么用 pHash：
  - 汽车之家接口无构图标签，纯靠人眼翻 147 车系不现实；
  - pHash 抓「整体结构/频率」，对「开门宽景内饰」vs「单座椅特写」有区分度；
  - 纯 PIL 实现，无需 torch/clip，快且离线可用。
  - 低命中率下， matcher 只负责把候选从几千张压到几十张，最终由人眼拍板。

依赖：Pillow（见 requirements.txt）

用法：
  # 1) 先确保有 survey 缩略图（800x0_ 更稳），没有就补抓
  python3 ah_pic_batch.py --targets /tmp/us_targets.json --classid 3 --pages 3 --survey --outdir output/ah_pic_us_survey

  # 2) 匹配：参考图用某台车墙里的 31/32（或用户指定的其它参考图）
  python3 ah_pic_match.py --refs output/ah_pic_us_survey/别克_别克至境E7_8510/thumbs/31.jpg output/.../thumbs/32.jpg \
      --targets /tmp/us_pilot.json --classid 3 --outdir output/ah_pic_us_survey --thresh 14 --sheet

  # 3) 看 matches.csv / match_sheet，挑中后下原图
  python3 ah_pic_match.py --refs ... --targets ... --confirm /tmp/confirm_ids.txt --outdir output/ah_pic_us_full
"""
import argparse, csv, json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')


def fetch(url, ref, retries=3):
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': ref})
            return urllib.request.urlopen(req, timeout=30).read()
        except Exception:
            time.sleep(1.2)
    return b''


def sized(url, prefix='800x0_'):
    if url.startswith('//'):
        url = 'https:' + url
    head, base = url.rsplit('/', 1)
    return f'{head}/{prefix}{base}'


def phash(img, m=32, size=8):
    """DCT 低频 pHash，返回 64-bit 位的 list(0/1)。纯 PIL+math，无 numpy。"""
    im = img.convert('L').resize((m, m), Image.Resampling.LANCZOS)
    px = list(im.getdata())
    N = m

    def dct1(x):
        return [sum(x[n] * math.cos(math.pi * (2 * n + 1) * k / (2 * N)) for n in range(N)) for k in range(N)]

    rows = [dct1(px[r * N:(r + 1) * N]) for r in range(N)]
    cols = [[rows[r][c] for r in range(N)] for c in range(N)]
    dct = [[0] * N for _ in range(N)]
    for c in range(N):
        col = dct1(cols[c])
        for r in range(N):
            dct[r][c] = col[r]
    flat = [dct[r][c] for r in range(size) for c in range(size)]
    mean = sum(flat[1:]) / (len(flat) - 1)  # 去掉 DC
    return [1 if v > mean else 0 for v in flat]


def hamming(a, b):
    return sum(1 for x, y in zip(a, b) if x != y)


def ref_hashes(ref_paths):
    """返回 (原图指纹列表, 水平镜像指纹列表)。
    镜像指纹用于「方向判据」：只认比镜像更靠近原图(前右)的图，排除前左(方向盘挡console)的镜像构图。"""
    orig, flip = [], []
    for p in ref_paths:
        try:
            im = Image.open(p)
            orig.append(phash(im))
            flip.append(phash(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)))
        except Exception as e:
            print(f'  [warn] 参考图读取失败 {p}: {e}')
    return orig, flip


def best_dist(h, refs_orig, refs_flip):
    d_o = min(hamming(h, r) for r in refs_orig) if refs_orig else 999
    d_f = min(hamming(h, r) for r in refs_flip) if refs_flip else 999
    # 只接受「更像原图(前右)而非镜像(前左)」的；镜像方向直接判 999 排除
    return (d_o, d_f) if d_o <= d_f else (999, d_f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refs', nargs='+', required=True, help='参考图路径（本地文件）')
    ap.add_argument('--targets', required=True, help='车系 json 列表')
    ap.add_argument('--classid', default='3')
    ap.add_argument('--pages', type=int, default=3)
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--thresh', type=int, default=14, help='汉明距离阈值，越小越严')
    ap.add_argument('--survey', action='store_true', help='若缺缩略图则补抓(800x0_)')
    ap.add_argument('--sheet', action='store_true', help='生成匹配墙')
    ap.add_argument('--confirm', default='', help='确认 gid 列表(每行 brand|seriesId|gid)')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--thumbprefix', default='160x0_', help='缺缩略图时补抓用的尺寸前缀(160x0_/240x0_/400x0_)')
    ap.add_argument('--maxper', type=int, default=0, help='每个车系最多保留多少候选(0=不限)')
    a = ap.parse_args()

    refs_orig, refs_flip = ref_hashes(a.refs)
    print(f'参考图指纹: 原图{len(refs_orig)} / 镜像{len(refs_flip)} | 阈值 {a.thresh}')

    if a.confirm:
        do_confirm(a, refs)
        return

    targets = json.load(open(a.targets))
    print(f'匹配目标车系: {len(targets)}')
    allmatches = []
    for t in targets:
        sid = t['seriesId']; brand = t.get('brandCn', ''); name = t.get('seriesName', str(sid))
        mdir = f"{a.outdir}/{brand}_{name}_{sid}"
        list_path = f'{mdir}/list.json'
        if not os.path.exists(list_path):
            print(f'  [skip] {name} 无 list.json，先跑 ah_pic_batch --survey')
            continue
        items = json.load(open(list_path))
        for i, it in enumerate(items):
            if '_gid' not in it:
                it['_gid'] = i
        td = f'{mdir}/thumbs'  # 复用 survey 已下的 400x0_ 缩略图
        os.makedirs(td, exist_ok=True)
        ref0 = f'https://car.m.autohome.com.cn/pic/series/{sid}.html'
        # 确保有 800x0_ 缩略图
        if a.survey or a.force:
            miss = [it for it in items if not (os.path.exists(f'{td}/{it["_gid"]}.jpg') and os.path.getsize(f'{td}/{it["_gid"]}.jpg') > 1500)]
            if miss:
                def dl(it):
                    fn = f'{td}/{it["_gid"]}.jpg'
                    if os.path.exists(fn) and os.path.getsize(fn) > 1500:
                        return
                    try:
                        open(fn, 'wb').write(fetch(sized(it['imgurl'], a.thumbprefix), ref0))
                    except Exception:
                        pass
                with ThreadPoolExecutor(8) as ex:
                    list(ex.map(dl, miss))
        # 计算距离
        for it in items:
            fn = f'{td}/{it["_gid"]}.jpg'
            if not os.path.exists(fn):
                continue
            try:
                h = phash(Image.open(fn))
            except Exception:
                continue
            d, d_flip = best_dist(h, refs_orig, refs_flip)
            if d <= a.thresh:
                allmatches.append({'brand': brand, 'series': name, 'sid': sid, 'gid': it['_gid'],
                                    'dist': d, 'dist_flip': d_flip, 'imgid': it.get('id'), 'specname': it.get('specname', ''),
                                    'thumburl': sized(it['imgurl']), 'fullurl': it['imgurl']})
        print(f'  {brand} {name}: 候选 {sum(1 for m in allmatches if m["sid"]==sid)}')
    allmatches.sort(key=lambda m: m['dist'])
    out = f'{a.outdir}/../matches.csv' if False else f'{a.outdir}/matches.csv'
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['brand', 'series', 'sid', 'gid', 'dist', 'dist_flip', 'imgid', 'specname', 'thumburl', 'fullurl'])
        for m in allmatches:
            w.writerow([m['brand'], m['series'], m['sid'], m['gid'], m['dist'], m['dist_flip'], m['imgid'], m['specname'], m['thumburl'], m['fullurl']])
    print(f'总候选: {len(allmatches)} | 写入 {out}')
    if a.sheet and allmatches:
        build_match_sheet(allmatches, a.outdir)


def build_match_sheet(matches, outdir, cols=10, cell=176):
    from PIL import Image
    per = 70
    for blk in range(math.ceil(len(matches) / per)):
        sub = matches[blk * per:(blk + 1) * per]
        rows = math.ceil(len(sub) / cols)
        cv = Image.new('RGB', (cols * (cell + 4) + 4, rows * (cell + 18) + 4), (25, 25, 28))
        dr = ImageDraw.Draw(cv)
        for k, m in enumerate(sub):
            fn = f"{outdir}/{m['brand']}_{m['series']}_{m['sid']}/thumbs/{m['gid']}.jpg"
            if not os.path.exists(fn):
                continue
            try:
                im = Image.open(fn).convert('RGB')
            except Exception:
                continue
            im.thumbnail((cell, cell))
            r, c = divmod(k, cols)
            x, y = 4 + c * (cell + 4), 4 + r * (cell + 18)
            cv.paste(im, (x, y))
            dr.text((x + 2, y + cell + 2), f"{m['gid']}·d{m['dist']}/f{m['dist_flip']}", fill=(120, 255, 160))
        out = f'{outdir}/match_sheet_{blk}.jpg'
        cv.save(out, quality=82)
        print('match sheet:', out, cv.size)


def do_confirm(a, refs):
    """按 confirm 列表（每行 brand|series|gid）从 matches.csv 取 fullurl 下原图。"""
    mc = f'{a.outdir}/matches.csv'
    if not os.path.exists(mc):
        print('  无 matches.csv，无法确认；请先跑匹配步'); return
    want = set()
    for line in open(a.confirm):
        line = line.strip()
        if line and not line.startswith('#'):
            want.add(line)
    out = f'{a.outdir}/full'
    os.makedirs(out, exist_ok=True)
    n = 0
    with open(mc, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            tag = f"{row['brand']}|{row['series']}|{row['gid']}"
            if tag in want:
                fn = f"{out}/{row['brand']}_{row['series']}_{row['sid']}_{int(row['gid']):04d}.jpg"
                if os.path.exists(fn) and os.path.getsize(fn) > 5000:
                    continue
                try:
                    open(fn, 'wb').write(fetch(row['fullurl'],
                        f"https://car.m.autohome.com.cn/pic/series/{row['sid']}.html"))
                    n += 1
                except Exception as e:
                    print(f"  [warn] {tag} 原图失败: {e}")
    print(f'原图下载: {n} 张 -> {out}')


if __name__ == '__main__':
    main()
