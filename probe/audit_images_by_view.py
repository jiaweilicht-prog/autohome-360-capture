#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""审计 output/images_by_view：样本数量、命名合规、sidecar 配对、坏图、同车重复、跨视角覆盖。
命名约定（实测）：
  R1 前舱正视  : 非欧系 token=二排正视前排 ; 欧系 IMG_..._IPFRONT_..._01
  F1 主驾位前望: 非欧系 token=主驾正视前排IP ; 欧系 IMG_..._IPDRV_..._01
  D1 主驾看副驾门: 非欧系 token=主驾看副驾门 ; 欧系 IMG_..._IPdoor_..._01
目录名(front/rear/driver)与文件名 token 是两套词，不算错误。
"""
import os, re, json, csv
from collections import defaultdict, Counter

BASE = "output/images_by_view"
VIEWS = {"前舱正视": "R1", "主驾位前望": "F1", "主驾看副驾门": "D1"}
TOKEN = {"R1": "二排正视前排", "F1": "主驾正视前排IP", "D1": "主驾看副驾门"}
EU_SUB = {"R1": "IPFRONT", "F1": "IPDRV", "D1": "IPdoor"}  # 欧系 IMG_ 子标记(实测)
SMALL_PNG = 8 * 1024
D1_EXEMPT = {56291, 71311, 35193, 37054, 54270, 73263}  # D1 已知豁免
PANO_RE = re.compile(r"pano/(\d+)")

issues = []
def flag(vdir, fn, cat, detail=""):
    issues.append((vdir, fn, cat, detail))

stats = {}
pano_raw = {}

for vdir, vid in VIEWS.items():
    d = os.path.join(BASE, vdir)
    if not os.path.isdir(d):
        flag(vdir, "", "DIR_MISSING", "目录不存在"); continue
    entries = sorted(os.listdir(d))
    samples, raws, sidecars = [], [], []
    for fn in entries:
        full = os.path.join(d, fn)
        if os.path.isdir(full): continue
        low = fn.lower()
        if low.endswith(".png"):
            (raws if fn.endswith("_raw.png") else samples).append(fn)
        elif low.endswith(".json"):
            sidecars.append(fn)
        else:
            flag(vdir, fn, "STRAY_FILE", "未知文件类型")

    sidecar_set = set(sidecars)
    naming_bad = tiny = no_sidecar = with_sidecar = 0
    raw_pano = []

    for fn in samples:
        full = os.path.join(d, fn)
        size = os.path.getsize(full)
        if size < SMALL_PNG:
            tiny += 1; flag(vdir, fn, "TINY_PNG", f"{size}B")
        ok = True
        if fn.startswith("IMG_"):
            if not fn[:-4].endswith("_01"):
                ok = False; naming_bad += 1
                flag(vdir, fn, "EU_NO_01", "欧系文件名不以 _01 结尾")
            elif EU_SUB[vid] not in fn:
                ok = False; naming_bad += 1
                flag(vdir, fn, "EU_SUBTOKEN_BAD", f"欧系{vid}应含 {EU_SUB[vid]}")
            elif re.search(r'_IP(FRONT|DRV|door)_\d{4}_', fn):
                flag(vdir, fn, "EU_EXTRA_CODE", "子标记后多余4位码(0101/0204)命名瑕疵")
        else:
            parts = fn[:-4].split("_")
            if len(parts) != 5 or parts[-1] != "01":
                ok = False; naming_bad += 1
                flag(vdir, fn, "NAMING_UNPARSEABLE", "结构不符 品牌_车型_默认_视角_01")
            else:
                interior, tok = parts[-3], parts[-2]
                if interior != "默认":
                    flag(vdir, fn, "INTERIOR_NOT_DEFAULT", interior)
                if tok != TOKEN[vid]:
                    ok = False; naming_bad += 1
                    flag(vdir, fn, "VIEW_TOKEN_BAD", f"应为 {TOKEN[vid]} 实为 {tok}")
        sc = fn[:-4] + ".json"
        if sc in sidecar_set:
            with_sidecar += 1
            try:
                sd = json.load(open(os.path.join(d, sc), encoding="utf-8"))
                m = PANO_RE.search(sd.get("source_url", ""))
                if m:
                    raw_pano.append(int(m.group(1)))
                if sd.get("view_id") != vid:
                    flag(vdir, fn, "SIDECAR_VIEW_MISMATCH", str(sd.get("view_id")))
            except Exception as e:
                flag(vdir, fn, "SIDECAR_READ_ERR", str(e))
        else:
            no_sidecar += 1; flag(vdir, fn, "NO_SIDECAR", "缺 .json")

    dup_pano = [p for p, c in Counter(raw_pano).items() if c > 1]
    for p in dup_pano:
        flag(vdir, f"panoId={p}", "DUP_PANO_IN_VIEW", "同一视角同一 pano 出现多次")

    stems = {s[:-4] for s in samples}
    for sc in sidecars:
        if sc[:-5] not in stems:
            flag(vdir, sc, "SIDECAR_ORPHAN", "无对应 png")

    stats[vdir] = dict(view=vid, samples=len(samples), raw=len(raws),
                       sidecar=len(sidecars), with_sidecar=with_sidecar,
                       no_sidecar=no_sidecar, tiny=tiny, naming_bad=naming_bad,
                       dup_pano=len(dup_pano))
    pano_raw[vid] = raw_pano

F1, R1, D1 = (set(pano_raw["F1"]), set(pano_raw["R1"]), set(pano_raw["D1"]))
allp = F1 | R1 | D1
in3 = F1 & R1 & D1
only_r1 = R1 - F1 - D1
only_d1 = D1 - F1 - D1
f1r1_notd1 = (F1 & R1) - D1
f1d1_notr1 = (F1 & D1) - R1
r1d1_notf1 = (R1 & D1) - F1
d1_missing_real = {p for p in f1r1_notd1 if p not in D1_EXEMPT}
d1_missing_exempt = {p for p in f1r1_notd1 if p in D1_EXEMPT}

print("=" * 72)
print("AUDIT · output/images_by_view  (最终版)")
print("=" * 72)
print("\n[1] 每视角计数")
print(f"{'目录':<12}{'view':<5}{'样本':>6}{'raw':>6}{'sidecar':>9}{'有sc':>7}{'无sc':>7}{'坏图':>6}{'命名异常':>9}{'同车重复':>9}")
for vdir in VIEWS:
    s = stats[vdir]
    print(f"{vdir:<12}{s['view']:<5}{s['samples']:>6}{s['raw']:>6}{s['sidecar']:>9}"
          f"{s['with_sidecar']:>7}{s['no_sidecar']:>7}{s['tiny']:>6}{s['naming_bad']:>9}{s['dup_pano']:>9}")
print("\n[2] 命名约定(每视角唯一 token)")
for vdir, vid in VIEWS.items():
    print(f"  {vdir:<12} 非欧系={TOKEN[vid]:<10} 欧系子标记={EU_SUB[vid]}")

print("\n[3] 跨视角 panoId 覆盖")
print(f"  全集: {len(allp)} | 三视角齐全: {len(in3)}")
print(f"  仅 R1: {len(only_r1)} {sorted(only_r1)}")
print(f"  仅 D1: {len(only_d1)} {sorted(only_d1)}")
print(f"  F1&R1 有 / D1 缺失: {len(f1r1_notd1)}  (豁免{len(d1_missing_exempt)}{sorted(d1_missing_exempt)} | 疑似{len(d1_missing_real)})")
print(f"  F1&D1 有 / R1 缺失: {len(f1d1_notr1)}")
print(f"  R1&D1 有 / F1 缺失: {len(r1d1_notf1)}")

print("\n[4] 问题按类别")
for cat, n in Counter(i[2] for i in issues).most_common():
    print(f"  {cat:<22}{n:>5}")

out = "output/audit_images_by_view_issues.csv"
with open(out, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f); w.writerow(["view_dir","filename","category","detail"])
    for row in sorted(issues, key=lambda r:(r[0],r[2],r[1])):
        w.writerow(row)
print(f"\n问题清单: {out}  (共 {len(issues)} 条)")
print("DONE")
