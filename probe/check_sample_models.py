#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抽查若干目标车型在 captured_cars.csv 中的覆盖情况。"""
import csv

rows = list(csv.DictReader(open("output/captured_cars.csv", encoding="utf-8-sig")))

def find(brand_kw, series_kws):
    res = []
    for r in rows:
        if brand_kw.lower() in r["brand"].lower():
            if any(s.lower() in r["series"].lower() for s in series_kws):
                res.append(r)
    return res

queries = [
    ("宝马iX3 2027款",            "宝马",  ["ix3"]),
    ("宝马7系 2027款",            "宝马",  ["7系", "i7"]),
    ("广汽传祺越7 2027款",        "传祺",  ["越7"]),
    ("保时捷Cayenne新能源 2027款","保时捷",["cayenne"]),
    ("上汽奥迪E7X 2026款",        "奥迪",  ["e7x"]),
    ("上汽奥迪E5 Sportback",      "奥迪",  ["e5 sportback", "e5"]),
]

for label, bk, sw in queries:
    m = find(bk, sw)
    print(f"\n### {label}   (brand~'{bk}', series~{sw})")
    if m:
        for r in m:
            print(f"   pano={r['pano_id']} | {r['brand']} {r['series']} | {r['region']} | views={r['views']}")
    else:
        print("   *** 库内无匹配 ***")
