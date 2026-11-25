#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 db_import_images_by_view.csv 聚合出"已抓取车型总名单"。
每台车以 pano_id 唯一标识，列出 品牌/车型/区域/已采集视角。
输出 output/captured_cars.csv (utf-8-sig)。
"""
import csv
from collections import defaultdict, Counter

SRC = "output/db_import_images_by_view.csv"
OUT = "output/captured_cars.csv"

rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
agg = {}
for r in rows:
    pid = r["pano_id"]
    a = agg.setdefault(pid, {"brand": "", "series": "", "region": "", "views": set()})
    a["brand"] = r["brand"]
    a["series"] = r["series"]
    a["region"] = r["region"]
    a["views"].add(r["view_id"])

with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["pano_id", "brand", "series", "region", "views", "view_count"])
    for pid, a in sorted(agg.items(), key=lambda kv: (kv[1]["brand"], kv[1]["series"])):
        vs = ",".join(sorted(a["views"]))
        w.writerow([pid, a["brand"], a["series"], a["region"], vs, len(a["views"])])

print(f"唯一车辆(pano_id): {len(agg)}")
print("区域分布:", dict(Counter(a["region"] for a in agg.values())))
print("视角组合分布:", dict(Counter(",".join(sorted(a["views"])) for a in agg.values())))
# 品牌数量
brands = Counter(a["brand"] for a in agg.values())
print(f"覆盖品牌数: {len(brands)}")
print("品牌 Top10:", brands.most_common(10))
