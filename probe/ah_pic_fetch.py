#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汽车之家 · 图片库按分类抓取（用于「座椅」里的副驾开门 / console-IP 搭接图）
=========================================================================
背景：本次目标图不在 360° 全景里，而在 汽车之家 → 汽车图片 → 品牌 → 车系 → 型号 → 座椅
      该路径对应移动版图片库的「车厢座椅」分类（classid=3）。

接口（实测 2026-09-21 可用）：
  分类频道: https://car.m.autohome.com.cn/pic/getpicchannel?seriesid={sid}&specid=0&classid=0
  图片列表: https://car.m.autohome.com.cn/pic/getpiclist?seriesid={sid}&specid=0&classid={cid}&pageindex={p}&pagesize=36
  图片直链: piclist[].imgurl  （可加尺寸前缀：原图 car2.autoimg.cn/cardfs/... ；缩略图 400x0_ / 800x0_ / 1024x0_）

常用 classid：
  1=车身外观(外观)  10=中控方向盘(内饰)  3=车厢座椅(座椅)  12=其它细节(细节)
  53=官图  55=车展  14=重要特点(特点)

用法：
  python3 ah_pic_fetch.py --series 164 --classid 3 --pages 8 --outdir output/ah_pic/164
  python3 ah_pic_fetch.py --series 164 --pages 8 --outdir ... --sheet     # 顺手生成缩略图墙
"""
import argparse, json, math, os, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')


def fetch(url, ref):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': ref})
    return urllib.request.urlopen(req, timeout=30).read()


def sized(url, prefix='400x0_'):
    """给 autoimg 图片 URL 加尺寸前缀，得到缩略图/中图。"""
    if url.startswith('//'):
        url = 'https:' + url
    head, base = url.rsplit('/', 1)
    return f'{head}/{prefix}{base}'


def build_sheet(items, thumbdir, outpfx, cols=10, cell=176):
    from PIL import Image, ImageDraw
    per = 70
    for blk in range(math.ceil(len(items) / per)):
        sub = items[blk * per:(blk + 1) * per]
        rows = math.ceil(len(sub) / cols)
        cv = Image.new('RGB', (cols * (cell + 4) + 4, rows * (cell + 18) + 4), (25, 25, 28))
        dr = ImageDraw.Draw(cv)
        for k, it in enumerate(sub):
            idx = blk * per + k
            fn = f'{thumbdir}/{idx:03d}.jpg'
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
            dr.text((x + 2, y + cell + 2), str(idx), fill=(255, 220, 0))
        out = f'{outpfx}_{blk}.jpg'
        cv.save(out, quality=82)
        print('sheet:', out, cv.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--series', required=True, help='汽车之家车系 seriesId')
    ap.add_argument('--classid', default='3', help='图片分类 id，默认 3=车厢座椅')
    ap.add_argument('--pages', type=int, default=8, help='抓取页数，每页 36 张')
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--sheet', action='store_true', help='生成缩略图墙')
    a = ap.parse_args()

    ref = f'https://car.m.autohome.com.cn/pic/series/{a.series}.html'
    os.makedirs(a.outdir, exist_ok=True)

    # 1) 分类频道
    ch = json.loads(fetch(
        f'https://car.m.autohome.com.cn/pic/getpicchannel?seriesid={a.series}&specid=0&classid=0', ref))
    info = ch['result']['seriesinfo']
    cats = {c['id']: (c['name'], c['short_name'], c['piccount']) for c in ch['result']['categorylist']}
    print('车系:', info.get('brandname'), info.get('seriesname'), '| 目标分类:',
          cats.get(int(a.classid)))
    json.dump(ch, open(f'{a.outdir}/channel.json', 'w'), ensure_ascii=False, indent=1)

    # 2) 图片列表
    items = []
    for p in range(1, a.pages + 1):
        d = json.loads(fetch(
            f'https://car.m.autohome.com.cn/pic/getpiclist?seriesid={a.series}&specid=0'
            f'&classid={a.classid}&pageindex={p}&pagesize=36', ref))
        r = d['result']
        if p == 1:
            print(f"分类共 {r['rowcount']} 张 / {r['pagecount']} 页（本次抓 {a.pages} 页）")
        items += r['piclist']
    json.dump(items, open(f'{a.outdir}/list.json', 'w'), ensure_ascii=False, indent=1)
    print('列表条目:', len(items))

    # 3) 缩略图（可选）
    if a.sheet:
        td = f'{a.outdir}/thumbs'
        os.makedirs(td, exist_ok=True)
        def dl(x):
            i, it = x
            fn = f'{td}/{i:03d}.jpg'
            if os.path.exists(fn) and os.path.getsize(fn) > 1000:
                return
            try:
                open(fn, 'wb').write(fetch(sized(it['imgurl']), ref))
            except Exception:
                pass
        with ThreadPoolExecutor(10) as ex:
            list(ex.map(dl, list(enumerate(items))))
        print('缩略图完成')
        build_sheet(items, td, f'{a.outdir}/sheet')


if __name__ == '__main__':
    main()
