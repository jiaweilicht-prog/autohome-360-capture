#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在所有 discovery / targets 文件里搜目标车型的 panoId（可能已发现过但没采）。"""
import json, glob, os

queries = {
    "保时捷Cayenne新能源": ["cayenne"],
    "传祺越7(含传祺相关)": ["越7", "越 "],
    "奥迪E7X": ["e7x"],
    "奥迪E5 Sportback": ["e5 sportback", "e5 "],
}

files = glob.glob("config/*discovery*.json") + ["config/row_d1_targets.json", "config/p1-targets.json"]
data = []
for f in files:
    if not os.path.exists(f):
        continue
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    for r in d.get("results", []):
        data.append((os.path.basename(f), r))

for label, kws in queries.items():
    print(f"\n### {label}")
    found = False
    for f, r in data:
        brand = (r.get("brandCn") or r.get("brand") or "").lower()
        series = (r.get("seriesName") or r.get("series") or "").lower()
        blob = brand + " " + series
        if any(k.lower() in blob for k in kws):
            print(f"   pano={r.get('panoId')} | {r.get('brandCn')} {r.get('seriesName')} | {f}")
            found = True
    if not found:
        print("   *** 所有 discovery 中均无匹配（需去汽车之家现场发现）***")
