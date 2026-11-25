#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 output/images_by_view 的所有 sidecar 提取结构化字段，
导出为数据库导入就绪的 CSV（utf-8-sig，Excel/MySQL 均可直接读）。

字段来源：
  - sidecar(.json)        -> pano_id / brand / series / view / 相机 / QC / 裁剪 / 分辨率 等
  - 各区域 discovery 文件  -> panoId -> region(US/EU/JP/KR/CN) 映射
  - 文件命名规则          -> IMG_ 前缀兜底是欧系(EU)
"""
import os, json, csv, re
from collections import Counter

BASE = "output/images_by_view"
VIEWS = ["前舱正视", "主驾位前望", "主驾看副驾门"]
VIEW_ID = {"前舱正视": "R1", "主驾位前望": "F1", "主驾看副驾门": "D1"}


def build_region_map():
    """从各区域 discovery results 建立 panoId -> region 映射。"""
    m = {}
    files = {
        "config/us_discovery_full.json": "US",
        "config/eu_discovery_full.json": "EU",
        "config/jp_discovery_full.json": "JP",
        "config/kr_discovery_full.json": "KR",
        "config/cn_discovery_full.json": "CN",
        "config/row_d1_targets.json": None,  # 用其显式 region 字段
    }
    grp = {"US": "US", "EU": "EU", "JP": "JP", "KR": "KR", "CN": "CN"}
    for f, defreg in files.items():
        if not os.path.exists(f):
            continue
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for r in d.get("results", []):
            pid = r.get("panoId")
            if pid is None:
                continue
            reg = r.get("region") or defreg
            if reg is None:
                g = r.get("group", "")
                reg = grp.get(g[:2])
            if reg:
                m[int(pid)] = reg
    return m


def pano_from_url(u):
    mm = re.search(r"/pano/(\d+)", u or "")
    return int(mm.group(1)) if mm else None


def main():
    rmap = build_region_map()
    rows = []
    missing = 0
    for vd in VIEWS:
        d = os.path.join(BASE, vd)
        vid = VIEW_ID[vd]
        for fn in sorted(os.listdir(d)):
            if not fn.lower().endswith(".png") or fn.endswith("_raw.png"):
                continue
            sp = os.path.join(d, fn[:-4] + ".json")
            rec = {"file_name": fn, "view_dir": vd, "view_id": vid}
            if os.path.exists(sp):
                try:
                    m = json.load(open(sp, encoding="utf-8"))
                except Exception:
                    m = {}
                pid = pano_from_url(m.get("source_url"))
                rec["pano_id"] = pid
                rec["brand"] = m.get("brand", "")
                rec["series"] = m.get("series", "")
                rec["view_name"] = m.get("view_name", "")
                rec["interior_color"] = m.get("interior_color", "")
                rec["scene"] = m.get("scene", "")
                rec["scene_title"] = m.get("scene_title", "")
                cs = m.get("camera_state_actual") or m.get("camera_state") or {}
                rec["hlookat"] = cs.get("hlookat", "")
                rec["vlookat"] = cs.get("vlookat", "")
                rec["fov"] = cs.get("fov", "")
                rec["qc_sym"] = m.get("qc_sym", "")
                rec["qc_top"] = m.get("qc_top", "")
                rec["qc_suspicious"] = m.get("qc_suspicious", "")
                rec["crop_applied"] = m.get("crop_applied", "")
                rec["aspect"] = m.get("aspect", "")
                rec["resolution"] = m.get("resolution", "")
                rec["captured_at"] = m.get("captured_at", "")
                rec["source_url"] = m.get("source_url", "")
                rec["raw_file"] = m.get("raw_backup", "")
                rec["has_raw"] = bool(m.get("raw_backup"))
                reg = rmap.get(pid) if pid else None
                if reg is None and fn.startswith("IMG_"):
                    reg = "EU"
                rec["region"] = reg or "Unknown"
                if reg in (None, "Unknown"):
                    missing += 1
            rows.append(rec)

    cols = ["pano_id", "brand", "series", "view_id", "view_name", "region",
            "interior_color", "scene", "scene_title", "hlookat", "vlookat",
            "fov", "qc_sym", "qc_top", "qc_suspicious", "crop_applied",
            "aspect", "resolution", "captured_at", "has_raw", "raw_file",
            "source_url", "view_dir", "file_name"]

    out = "output/db_import_images_by_view.csv"
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})

    print(f"导出完成: {len(rows)} 行 -> {out}")
    print(f"region 缺失(Unknown): {missing}")
    print("region 分布:", dict(Counter(r["region"] for r in rows)))
    print("view 分布:  ", dict(Counter(r["view_id"] for r in rows)))


if __name__ == "__main__":
    main()
