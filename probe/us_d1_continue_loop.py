#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
美系 (US) D1 视角（主驾看副驾门）后台自动续采循环驱动器
===================================================
复用 jp_continue_loop.py 的成熟机制：每批 3 台调 run-p1.cjs（已验证 3 台/批不触发 OOM），
遇 SIGKILL(137) 降级单台重试；完成判定基于磁盘现状（幂等、可随时被杀重启）。

目标：config/us_discovery_full.json 中全部 pano_found 车（147 台），只跑 D1 视角。
完成 = 主驾看副驾门 目录存在该 pano 的 D1 成品 png；或该 pano 在 failures.csv 记为
view_not_available（源站无 driver 机位）。
"""
import json, os, re, subprocess, sys, argparse, time
from datetime import datetime

WORK = "."
NODE = "node"
ENV = dict(os.environ, NODE_PATH="node_modules")
SCRIPT = os.path.join(WORK, "probe", "run-p1.cjs")
DISCOVERY = os.path.join(WORK, "config", "us_discovery_full.json")
VIEW = "D1"
DIR = os.path.join(WORK, "output", "images_by_view", "主驾看副驾门")
FAIL_CSV = os.path.join(WORK, "output", "failures.csv")
LOG = os.path.join(WORK, "probe", "us_d1_loop.log")
STATUS = os.path.join(WORK, "probe", "us_d1_status.json")
UNA_FILE = os.path.join(WORK, "probe", "us_d1_unavailable.json")
DEFAULT_BATCH = 3
CAR_INTERVAL = 1.0

def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)

def write_status(d):
    d["updated_at"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(STATUS, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

def disk_map():
    """返回 {panoId: {'D1':bool}} —— 来自 DIR 下 sidecar 的 source_url"""
    done = {}
    if not os.path.isdir(DIR):
        return done
    for fn in os.listdir(DIR):
        if not fn.endswith(".json"):
            continue
        try:
            j = json.load(open(os.path.join(DIR, fn), encoding="utf-8"))
        except Exception:
            continue
        m = re.search(r"pano/(\d+)", j.get("source_url", ""))
        if not m:
            continue
        if (j.get("view_id") == VIEW) or (VIEW in (j.get("view_name") or "")):
            done.setdefault(m.group(1), {"D1": False})["D1"] = True
    return done

def load_persist_unavailable():
    if not os.path.exists(UNA_FILE):
        return set()
    try:
        d = json.load(open(UNA_FILE, encoding="utf-8"))
        return set((k.split("|")[0], k.split("|")[1]) for k in d)
    except Exception:
        return set()

def save_persist_unavailable(u):
    d = {f"{p}|{v}": True for (p, v) in u}
    with open(UNA_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

def unavailable_map():
    u = load_persist_unavailable()
    if os.path.exists(FAIL_CSV):
        with open(FAIL_CSV, encoding="utf-8") as f:
            f.readline()
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = [p.strip().strip('"') for p in line.split(",")]
                if len(parts) < 6:
                    continue
                panoId, view, step, reason = parts[2], parts[3], parts[4], parts[5]
                if reason == "view_not_available" and view == VIEW:
                    u.add((panoId, view))
    if u:
        save_persist_unavailable(u)
    return u

def target_panos():
    d = json.load(open(DISCOVERY, encoding="utf-8"))
    out = []
    seen = set()
    for x in (d.get("results") or []):
        if x.get("status") != "pano_found":
            continue
        p = str(x["panoId"])
        if p not in seen:
            seen.add(p); out.append(p)
    return out

def remaining(target):
    disk = disk_map()
    una = unavailable_map()
    rem = []
    for p in target:
        hasD1 = disk.get(p, {}).get("D1") or ((p, VIEW) in una)
        if not hasD1:
            rem.append(p)
    return rem

def run_batch(panos):
    cmd = [NODE, SCRIPT, "--discovery", DISCOVERY, "--views", VIEW,
           "--only-pano", ",".join(panos), "--no-skip"]
    log(f"  执行: node run-p1.cjs --views {VIEW} --only-pano {','.join(panos)}")
    r = subprocess.run(cmd, env=ENV, cwd=WORK, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    tail = "\n".join([l for l in out.strip().splitlines() if l.strip()][-18:])
    return r.returncode, tail

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--batch", type=int, default=DEFAULT_BATCH)
    ap.add_argument("--max-batches", type=int, default=0, help="0=无限循环")
    args = ap.parse_args()

    target = target_panos()
    rem = remaining(target)
    total = len(target)
    done = total - len(rem)
    log(f"循环启动 | 视角={VIEW} 目标总数={total} 已完成={done} 待续={len(rem)}")

    if args.dry_run:
        log(f"[dry-run] 待续清单(前20): {rem[:20]}")
        return

    write_status({"total": total, "done": done, "remaining": len(rem),
                  "finished": False, "rounds": 0})

    rounds = 0
    no_progress_streak = 0
    while True:
        rem = remaining(target)
        if not rem:
            log("全部完成（含源站限制车），退出循环。")
            write_status({"total": total, "done": total, "remaining": 0,
                          "finished": True, "rounds": rounds})
            break

        rounds += 1
        if args.max_batches and rounds > args.max_batches:
            log(f"已达 --max-batches={args.max_batches} 上限，停止。剩余 {len(rem)} 台。")
            write_status({"total": total, "done": total - len(rem), "remaining": len(rem),
                          "finished": False, "stopped_by_max": True})
            break

        batch = rem[:args.batch]
        before = len(rem)
        ec, tail = run_batch(batch)
        log(f"第{rounds}批完成 exit={ec} 本批={batch}\n{tail}")

        rem_after = remaining(target)
        progressed = len(rem_after) < before

        if ec is not None and ec < 0:
            log(f"  本批疑似被杀(ec={ec})，降级单台重试: {batch}")
            for p in batch:
                ec2, t2 = run_batch([p])
                log(f"    单台 {p} exit={ec2}\n{t2}")
            rem_after = remaining(target)
            progressed = len(rem_after) < before

        if not progressed:
            no_progress_streak += 1
            log(f"  本批无进展（可能全为瞬态失败），单台重试剩余本批。streak={no_progress_streak}")
            for p in batch:
                run_batch([p])
            rem_after = remaining(target)
            if len(rem_after) < before:
                no_progress_streak = 0
            elif no_progress_streak >= 3:
                log(f"连续 {no_progress_streak} 轮无进展，疑似死循环/持续故障，停止。剩余 {len(rem_after)} 台。")
                write_status({"total": total, "done": total - len(rem_after),
                              "remaining": len(rem_after), "finished": False,
                              "stopped_no_progress": True})
                break
        else:
            no_progress_streak = 0

        done_now = total - len(rem_after)
        write_status({"total": total, "done": done_now, "remaining": len(rem_after),
                      "finished": False, "rounds": rounds, "last_batch": ",".join(batch),
                      "last_exit": ec})
        log(f"进度: {done_now}/{total}  剩余 {len(rem_after)}")
        time.sleep(CAR_INTERVAL)

    log("循环结束。")

if __name__ == "__main__":
    main()
