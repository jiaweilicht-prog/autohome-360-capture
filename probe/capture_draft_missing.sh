#!/bin/bash
# 补抓 draft 表 26 张无图车系，分批(≤5/进程)顺序跑，防 OOM。无 360(VR)图的车 view_not_available 自动跳过。
cd "."
B=node
N=node_modules
LOG=probe/capture_draft_missing.log
echo "开始补抓 $(date)" > "$LOG"
# 26 个 panoId，分 6 组
groups=(
  "69295,76420,68076,63550,41825"
  "74509,59842,73657,77733,77922"
  "72405,75810,53883,37361,72121"
  "64588,37635,62295,39236,72248"
  "75017,77555,72952,70863,73358"
  "78741"
)
i=0
for g in "${groups[@]}"; do
  i=$((i+1))
  echo "===== 批次 $i: $g =====" >> "$LOG"
  NODE_PATH=$N $B probe/run-p1.cjs --only-pano "$g" --fast-scene --no-skip --views F1,R1 >> "$LOG" 2>&1
  rc=$?
  echo "批次 $i 退出码: $rc ($(date))" >> "$LOG"
  if [ $rc -lt 0 ]; then echo "批次 $i 被信号杀(SIGKILL/OOM)，停止后续" >> "$LOG"; break; fi
done
echo "补抓结束 $(date)" >> "$LOG"
