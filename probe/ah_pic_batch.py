#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汽车之家 · 图片库批量「副驾开门看 IP+console」采集（美系 / 通用）
============================================================================
用途：对一批车系，批量抓某个分类（默认 座椅 classid=3）的图片，
      先跑「轻量测绘（survey）」：只下缩略图 + 生成缩略图墙 + 写 manifest.csv，
      不下原图。用户用缩略图墙肉眼挑出目标构图后，再用 --confirm 下原图。

为什么分两步：
  - 汽车之家图片接口没有「构图」标签字段，无法用关键词过滤。
  - 本模型不能读图，目标构图必须靠人眼确认。
  - 所以先批量出「缩略图墙」让人挑，挑中的 imgid 再下原图，省带宽、省误抓。

接口（实测 2026-09-21 可用，免登录、不反爬）：
  分类频道: https://car.m.autohome.com.cn/pic/getpicchannel?seriesid={sid}&specid=0&classid=0
  图片列表: https://car.m.autohome.com.cn/pic/getpiclist?seriesid={sid}&specid=0&classid={cid}&pageindex={p}&pagesize=36
  图片直链: piclist[].imgurl  （尺寸前缀：400x0_ / 800x0_ / 1024x0_ / 原图无前缀）

常用 classid：1=外观 10=中控 3=座椅 12=细节 53=官图 55=车展 14=特点

用法：
  # 1) 轻量测绘：每个车系下前 3 页缩略图 + 墙 + manifest
  python3 ah_pic_batch.py --targets /tmp/us_targets.json --classid 3 --pages 3 --survey --outdir output/ah_pic_us_survey

  # 2) 只跑某几个品牌（逗号分隔中文品牌名）
  python3 ah_pic_batch.py --targets ... --brand 别克,福特,凯迪拉克 --survey

  # 3) 只跑前 N 个车系
  python3 ah_pic_batch.py --targets ... --limit 6 --survey

  # 4) 下原图（需先有 survey 的 manifest.csv，并准备 confirm 列表）
  python3 ah_pic_batch.py --targets ... --classid 3 --confirm /tmp/confirm_ids.txt --outdir output/ah_pic_us_full
"""
import argparse, csv, json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')

PY = 'python3'


def fetch(url, ref, retries=3):
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': ref})
            return urllib.request.urlopen(req, timeout=30).read()
        except Exception as e:
            last = e
            time.sleep(1.5)
    raise last


def sized(url, prefix='400x0_'):
    if url.startswith('//'):
        url = 'https:' + url
    head, base = url.rsplit('/', 1)
    return f'{head}/{prefix}{base}'


def safe_name(s):
    return ''.join(c if (c.isalnum() or c in ' _-') else '_' for c in s).strip()


def build_sheet(thumbs_dir, items, outpfx, cols=12, cell=150):
    from PIL import Image, ImageDraw
    per = cols * 6
    for blk in range(math.ceil(len(items) / per)):
        sub = items[blk * per:(blk + 1) * per]
        rows = math.ceil(len(sub) / cols)
        cv = Image.new('RGB', (cols * (cell + 4) + 4, rows * (cell + 16) + 4), (25, 25, 28))
        dr = ImageDraw.Draw(cv)
        for k, it in enumerate(sub):
            gid = it['_gid']
            fn = f'{thumbs_dir}/{gid}.jpg'
            if not os.path.exists(fn):
                continue
            try:
                im = Image.open(fn).convert('RGB')
            except Exception:
                continue
            im.thumbnail((cell, cell))
            r, c = divmod(k, cols)
            x, y = 4 + c * (cell + 4), 4 + r * (cell + 16)
            cv.paste(im, (x, y))
            dr.text((x + 2, y + cell + 2), str(gid), fill=(255, 220, 0))
        out = f'{outpfx}_{blk}.jpg'
        cv.save(out, quality=82)
        print('  sheet:', out, cv.size)


def survey_one(t, args, classid):
    sid = t['seriesId']
    brand = t.get('brandCn', '')
    name = t.get('seriesName', str(sid))
    ref = f'https://car.m.autohome.com.cn/pic/series/{sid}.html'
    mdir = f"{args.outdir}/{safe_name(brand)}_{safe_name(name)}_{sid}"
    os.makedirs(mdir, exist_ok=True)
    list_path = f'{mdir}/list.json'
    man_path = f'{mdir}/manifest.csv'

    # 分类频道：拿分类名 + 该分类总张数
    cat_name, cat_total = '', 0
    try:
        ch = json.loads(fetch(
            f'https://car.m.autohome.com.cn/pic/getpicchannel?seriesid={sid}&specid=0&classid=0', ref))
        for c in ch['result']['categorylist']:
            if int(c['id']) == int(classid):
                cat_name, cat_total = c['name'], c.get('piccount', 0)
    except Exception as e:
        print(f'  [warn] {name} channel 失败: {e}')

    if os.path.exists(list_path) and not args.force:
        items = json.load(open(list_path))
        print(f'  [skip-list] {brand} {name} ({sid}) 已有 {len(items)} 条')
    else:
        items = []
        pages = args.pages if args.pages and args.pages > 0 else 9999
        p = 1
        while True:
            if args.pages and args.pages > 0 and p > pages:
                break
            try:
                d = json.loads(fetch(
                    f'https://car.m.autohome.com.cn/pic/getpiclist?seriesid={sid}&specid=0'
                    f'&classid={classid}&pageindex={p}&pagesize=36', ref))
                r = d['result']
            except Exception as e:
                print(f'  [warn] {name} page{p} 失败: {e}')
                break
            pl = r.get('piclist', [])
            if not pl:
                break
            items += pl
            total_pages = r.get('pagecount', 1)
            if args.pages and args.pages > 0:
                if p >= pages:
                    break
            else:
                if p >= total_pages:
                    break
            p += 1
        json.dump(items, open(list_path, 'w'), ensure_ascii=False, indent=1)
        print(f'  列表 {brand} {name} ({sid}) 分类[{classid}:{cat_name}] 总量{cat_total} 本次{len(items)}')

    # 全局序号 gid（跨页稳定），写 manifest
    for i, it in enumerate(items):
        it['_gid'] = i
        it['_brand'] = brand
        it['_series'] = name
        it['_sid'] = sid
    json.dump(items, open(list_path, 'w'), ensure_ascii=False, indent=1)  # 把 _gid 写回 list.json
    with open(man_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['gid', 'imgid', 'brandCn', 'seriesName', 'seriesId', 'specname',
                    'width', 'height', 'thumburl', 'fullurl'])
        for it in items:
            w.writerow([it['_gid'], it.get('id'), brand, name, sid, it.get('specname', ''),
                        it.get('width', ''), it.get('height', ''),
                        sized(it['imgurl']), it['imgurl']])

    if args.survey:
        td = f'{mdir}/thumbs'
        os.makedirs(td, exist_ok=True)
        def dl(x):
            it = x
            gid = it['_gid']
            fn = f'{td}/{gid}.jpg'
            if os.path.exists(fn) and os.path.getsize(fn) > 800:
                return
            try:
                open(fn, 'wb').write(fetch(sized(it['imgurl'], args.thumbprefix), ref))
            except Exception:
                pass
        with ThreadPoolExecutor(8) as ex:
            list(ex.map(dl, items))
        if not args.nosheet:
            build_sheet(td, items, f'{mdir}/sheet')
    return mdir, len(items)


def confirm_download(t, args, classid, confirm_ids):
    sid = t['seriesId']
    brand = t.get('brandCn', '')
    name = t.get('seriesName', str(sid))
    mdir = f"{args.outdir}/{safe_name(brand)}_{safe_name(name)}_{sid}"
    list_path = f'{mdir}/list.json'
    if not os.path.exists(list_path):
        print(f'  [skip] {name} 无 survey list，先跑 survey')
        return
    items = json.load(open(list_path))
    out = f'{mdir}/full'
    os.makedirs(out, exist_ok=True)
    ref = f'https://car.m.autohome.com.cn/pic/series/{sid}.html'
    n = 0
    for it in items:
        gid = it.get('_gid', items.index(it))
        if gid not in confirm_ids:
            continue
        fn = f'{out}/{gid:04d}.jpg'
        if os.path.exists(fn) and os.path.getsize(fn) > 5000:
            continue
        try:
            open(fn, 'wb').write(fetch(it['imgurl'], ref))
            n += 1
        except Exception as e:
            print(f'  [warn] {name} gid{gid} 原图失败: {e}')
    print(f'  原图 {brand} {name}: 下 {n} 张到 {out}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--targets', required=True, help='目标车系 json 列表 [{seriesId,brandCn,seriesName}]')
    ap.add_argument('--classid', default='3')
    ap.add_argument('--pages', type=int, default=3, help='survey 抓几页(每页36)；0=全部')
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--survey', action='store_true', help='下缩略图+墙+manifest')
    ap.add_argument('--brand', default='', help='只跑这些品牌(逗号分隔中文名)')
    ap.add_argument('--limit', type=int, default=0, help='只跑前 N 个车系')
    ap.add_argument('--force', action='store_true', help='忽略已有 list 重新抓')
    ap.add_argument('--confirm', default='', help='确认要下原图的 gid 列表文件(每行 gid)')
    ap.add_argument('--thumbprefix', default='400x0_', help='缩略图尺寸前缀(160x0_/200x0_/240x0_/400x0_)，越小越省空间')
    ap.add_argument('--nosheet', action='store_true', help='survey 不生成缩略图墙(省磁盘/时间)')
    a = ap.parse_args()

    targets = json.load(open(a.targets))
    if a.brand:
        bs = [b.strip() for b in a.brand.split(',') if b.strip()]
        targets = [t for t in targets if t.get('brandCn') in bs]
    if a.limit:
        targets = targets[:a.limit]
    print(f'目标车系: {len(targets)} | classid={a.classid} | pages={a.pages} | survey={a.survey}')

    if a.confirm:
        ids = set()
        for line in open(a.confirm):
            line = line.strip()
            if line.isdigit():
                ids.add(int(line))
        for t in targets:
            confirm_download(t, a, a.classid, ids)
        return

    ok = 0
    for t in targets:
        try:
            survey_one(t, a, a.classid)
            ok += 1
        except Exception as e:
            print(f'  [ERROR] {t.get("seriesName")} ({t.get("seriesId")}): {e}')
    print(f'完成 {ok}/{len(targets)} 车系')


if __name__ == '__main__':
    main()
