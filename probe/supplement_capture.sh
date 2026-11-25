#!/bin/bash
set -u
cd .
export NODE_PATH=node_modules
NODE=node
DISC=config/eu_discovery_full.json
LOG=probe/supplement.log
echo "START $(date)" > "$LOG"
run_one() {
  echo "===== [$(date)] pano=$1 views=$2 =====" >> "$LOG"
  "$NODE" probe/run-p1.cjs --discovery "$DISC" --only-pano "$1" --views "$2" --no-skip >> "$LOG" 2>&1
  echo "exit=$? pano=$1" >> "$LOG"
}
run_one 76392 D1
run_one 75758 F1,R1,D1
run_one 75953 F1,R1,D1
run_one 72707 F1,R1,D1
echo "DONE $(date)" >> "$LOG"
