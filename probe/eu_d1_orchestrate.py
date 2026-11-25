#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
欧系 D1 全量抓取编排器
=====================
背景：美系(US) D1 后台循环仍在收尾（~147 台），两个浏览器抓取进程同时跑会抢内存 OOM。
本编排器先**轮询等待美系 D1 跑完**（不抢内存），再启动欧系 D1 续采循环。

- 等待：轮询 probe/us_d1_status.json，finished=True 或 remaining==0 即视为美系结束。
- 启动：调用 probe/eu_d1_continue_loop.py（幂等、可随时被杀重启）。
- 全部在后台运行，跑完自动退出；进度见 probe/eu_d1_loop.log。
"""
import json, os, subprocess, time
from datetime import datetime

WORK = "."
US_STATUS = os.path.join(WORK, "probe", "us_d1_status.json")
EU_LOOP = os.path.join(WORK, "probe", "eu_d1_continue_loop.py")
LOG = os.path.join(WORK, "probe", "eu_d1_orchestrate.log")
NODE = "node"
ENV = dict(os.environ, NODE_PATH="node_modules")
PY = "/usr/bin/env python3"

def log(m):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {m}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)

def us_done():
    try:
        d = json.load(open(US_STATUS, encoding="utf-8"))
    except Exception:
        return False, "?"
    fin = d.get("finished") or d.get("stopped_by_max") or d.get("stopped_no_progress")
    rem = d.get("remaining")
    return (bool(fin) or rem == 0), f"done={d.get('done')} remaining={rem} finished={fin}"

def main():
    log("编排器启动：等待美系 D1 后台循环结束，避免内存争用 OOM。")
    # 等待美系结束（最多 ~40 分钟）
    waited = 0
    while waited < 40 * 60:
        ok, info = us_done()
        log(f"  美系状态: {info} (已等 {waited//60} 分钟)")
        if ok:
            log("美系 D1 已完成，开始启动欧系 D1 全量抓取。")
            break
        time.sleep(60)
        waited += 60
    else:
        log("⚠ 等待超时（40min），美系仍未结束；仍尝试启动欧系（可能短暂抢内存）。")

    # 启动欧系 D1 续采循环（前台跑到完，整个编排器在后台，跑完退出即通知）
    log("启动: python3 probe/eu_d1_continue_loop.py")
    r = subprocess.run([PY, EU_LOOP], env=os.environ, cwd=WORK)
    log(f"欧系 D1 续采循环结束 exit={r.returncode}")

if __name__ == "__main__":
    main()
