#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JP 批次后台自动续采循环驱动器
================================
问题背景：9/13 日系(JP)批次被沙箱 45-60min 上限回收，约 78 台完全未采。
本脚本作为"外层循环"，每次动态计算"还差哪些 JP 车没采齐"，
每批 3 台调 run-p1.cjs（已验证 3 台/批不触发 OOM），遇 SIGKILL(137) 降级单台重试。

关键设计：
- 完成判定 = 硬盘有 F1 且 有 R1；或对应视角在 failures.csv 记为 view_not_available（源站无此机位）。
  这样"源站无后排"的车会被正确视为已完成，不会死循环。
- 幂等：随时被杀/重启都安全，remaining() 永远基于磁盘现状重新计算。
- 防死循环：连续两轮无进展（既非 OOM 也非源站限制）则停止并报错。
"""
import json, os, re, subprocess, sys, argparse, time
from datetime import datetime

WORK = "."
NODE = "node"
ENV = dict(os.environ, NODE_PATH="node_modules")
SCRIPT = os.path.join(WORK, "probe", "run-p1.cjs")
JP_PANOS = os.path.join(WORK, "config", "jp_run_panos.json")  # 默认批次
FAIL_CSV = os.path.join(WORK, "output", "failures.csv")
DIRS = [os.path.join(WORK, "output", "images_by_view", "主驾位前望"),
        os.path.join(WORK, "output", "images_by_view", "前舱正视")]
LOG = os.path.join(WORK, "probe", "jp_continue_loop.log")
STATUS = os.path.join(WORK, "probe", "jp_continue_status.json")
# 持久豁免集：run-p1.cjs 每次 writeFileSync 覆盖 failures.csv（只保留当批失败项），
# 会导致历史"源站无机位"记录丢失、循环在 done 数间振荡。改为以本持久集为准。
UNA_FILE = os.path.join(WORK, "probe", "jp_unavailable.json")
# 上述三个路径在 main() 中按 --panos-file .basename 重新派生，做到多批次互不干扰。

DEFAULT_BATCH = 3
CAR_INTERVAL = 1.0  # 批间小憩，让系统回收

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
    """返回 {panoId: {'F1':bool,'R1':bool}} —— 来自 sidecar 的 source_url"""
    done = {}
    for d in DIRS:
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            try:
                j = json.load(open(os.path.join(d, fn), encoding="utf-8"))
            except Exception:
                continue
            m = re.search(r"pano/(\d+)", j.get("source_url", ""))
            if not m:
                continue
            isF1 = (j.get("view_id") == "F1") or ("主驾" in (j.get("view_name") or ""))
            done.setdefault(m.group(1), {"F1": False, "R1": False})["F1" if isF1 else "R1"] = True
    return done

def load_persist_unavailable():
    """从持久豁免集读取已确认的源站无机位 {(panoId, view)}"""
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
    """返回 {(panoId, view): True} —— 合并【持久豁免集】+【本次 failures.csv 的 view_not_available】。
    修复：run-p1.cjs 每批覆盖写 failures.csv，历史豁免会被冲掉导致 done 数振荡；
    现以持久集为真相源、并吸收每次新发现的源站缺口，永不丢失。"""
    u = load_persist_unavailable()
    if os.path.exists(FAIL_CSV):
        with open(FAIL_CSV, encoding="utf-8") as f:
            f.readline()  # 跳过表头
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = [p.strip().strip('"') for p in line.split(",")]
                if len(parts) < 6:
                    continue
                panoId, view, step, reason = parts[2], parts[3], parts[4], parts[5]
                if reason == "view_not_available":
                    u.add((panoId, view))
    if u:
        save_persist_unavailable(u)
    return u

def target_panos(panos_file):
    """目标 pano 全集（main + special），去重。panos_file 形如 jp_run_panos.json"""
    jp = json.load(open(panos_file, encoding="utf-8"))
    ids = []
    for key in ("main", "special"):
        for x in jp.get(key, []):
            pid = str(x["panoId"] if isinstance(x, dict) else x)
            ids.append(pid)
    # 去重保序
    seen, out = set(), []
    for p in ids:
        if p not in seen:
            seen.add(p); out.append(p)
    return out

def remaining(target):
    """target 中尚未采齐（且源站允许采）的 pano 列表"""
    disk = disk_map()
    una = unavailable_map()
    rem = []
    for p in target:
        hasF1 = disk.get(p, {}).get("F1") or ((p, "F1") in una)
        hasR1 = disk.get(p, {}).get("R1") or ((p, "R1") in una)
        if not (hasF1 and hasR1):
            rem.append(p)
    return rem

def run_batch(panos):
    """panos: list[str]。返回 (returncode, tail_text)"""
    cmd = [NODE, SCRIPT, "--views", "F1,R1",
           "--only-pano", ",".join(panos), "--fast-scene", "--no-skip"]
    log(f"  执行: node run-p1.cjs --only-pano {','.join(panos)} --fast-scene")
    r = subprocess.run(cmd, env=ENV, cwd=WORK, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    tail = "\n".join([l for l in out.strip().splitlines() if l.strip()][-18:])
    return r.returncode, tail

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只打印待续数量，不采集")
    ap.add_argument("--batch", type=int, default=DEFAULT_BATCH)
    ap.add_argument("--max-batches", type=int, default=0, help="0=无限循环")
    ap.add_argument("--panos-file", default=JP_PANOS,
                    help="批次 pano 清单 json（含 main/special 数组），默认 JP")
    args = ap.parse_args()

    # 按 panos-file .basename 派生独立日志/状态/豁免文件，避免不同批次互相覆盖
    global LOG, STATUS, UNA_FILE
    base = os.path.splitext(os.path.basename(args.panos_file))[0]
    LOG = os.path.join(WORK, "probe", f"{base}_loop.log")
    STATUS = os.path.join(WORK, "probe", f"{base}_status.json")
    UNA_FILE = os.path.join(WORK, "probe", f"{base}_unavailable.json")

    target = target_panos(args.panos_file)
    rem = remaining(target)
    total = len(target)
    done = total - len(rem)
    log(f"循环启动 | 批次={base} 目标总数={total} 已完成={done} 待续={len(rem)}")

    if args.dry_run:
        log(f"[dry-run] 待续清单(前20): {rem[:20]}")
        log("[dry-run] 退出，未采集")
        return

    write_status({"total": total, "done": done, "remaining": len(rem),
                  "finished": False, "last_batch": "", "last_exit": None,
                  "rounds": 0})

    rounds = 0
    no_progress_streak = 0
    while True:
        rem = remaining(target)
        if not rem:
            log("全部完成（含源站限制车），退出循环。")
            write_status({"total": total, "done": total, "remaining": 0,
                          "finished": True, "rounds": rounds, "last_batch": "", "last_exit": 0})
            break

        rounds += 1
        if args.max_batches and rounds > args.max_batches:
            log(f"已达 --max-batches={args.max_batches} 上限，停止。剩余 {len(rem)} 台。")
            write_status({"total": total, "done": total - len(rem), "remaining": len(rem),
                          "finished": False, "rounds": rounds, "stopped_by_max": True})
            break

        batch = rem[:args.batch]
        before = len(rem)
        ec, tail = run_batch(batch)
        log(f"第{rounds}批完成 exit={ec} 本批={batch}\n{tail}")

        rem_after = remaining(target)
        progressed = len(rem_after) < before

        if ec is not None and ec < 0:
            # 被信号杀（OOM/137）→ 降级单台重试本批
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
                              "rounds": rounds, "stopped_no_progress": True})
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
