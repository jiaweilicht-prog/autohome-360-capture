#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 A 柱角度筛选的 NEG 结果映射到 picklist 并合并到负样本池。
只处理 s_0~s_3（子代理标准较严格且有自审），s_4~s_7 暂跳过。
"""
import csv, json, os, shutil
from datetime import datetime

PICK = 'output/us_target_candidates_v8/picklist.csv'
POOL_DIR = 'output/fewshot'
POS_F = f'{POOL_DIR}/positives.csv'
NEG_F = f'{POOL_DIR}/negatives.csv'
BACKUP = f'{POOL_DIR}/backup_v3_round'

# ── s_0~s_3 的 A 柱筛选结果（来自校准版子代理）──
# 格式：POS 坐标列表（其余为 NEG）
a_pillar_pos = {
    's_0': [(2,0),(2,6),(3,0),(3,1),(3,7)],       # 5 POS / 35 NEG
    's_1': [(1,0),(1,6),(2,0),(2,1),(3,1)],       # 5 POS / 35 NEG
    's_2': [(0,0),(0,1),(0,3),(1,0),(1,1),(1,3), # 12 POS / 28 NEG
            (2,0),(2,1),(2,2),(4,0),(4,1),(4,2)],
    's_3': [(0,0),(0,1),(0,2),(1,0),(1,1),(1,3),(1,4), # 17 POS / 23 NEG
            (2,0),(2,1),(2,2),(2,3),(2,4),
            (4,0),(4,1),(4,2),(4,3),(4,4)],
}

# ── 读取 picklist ─────────────────────────────────────
rows = list(csv.DictReader(open(PICK, encoding='utf-8')))
PER = 40
sheets = {f's_{i}': rows[i*PER:(i+1)*PER] for i in range((len(rows)+PER-1)//PER)}

# ── 提取 NEG ─────────────────────────────────────────
neg_by_a_pillar = []
for sn, pos_coords in a_pillar_pos.items():
    pos_set = set(pos_coords)
    if sn not in sheets:
        print(f'⚠ {sn} 不在 picklist 中，跳过')
        continue
    srows = sheets[sn]
    for k, r in enumerate(srows):
        row, col = divmod(k, 8)
        if (row, col) not in pos_set:
            neg_by_a_pillar.append({
                'sheet': sn, 'cell': k, 'brand': r['brand'], 'series': r['series'],
                'sid': r['sid'], 'gid': r['gid'], 'score': r['score'],
                'local': r.get('local', ''), 'fullurl': r.get('fullurl', '')
            })

print(f'A柱筛选 NEG: {len(neg_by_a_pillar)} 张 (s_0~s_3)')

# ── 备份 ──────────────────────────────────────────────
ts = datetime.now().strftime('%m%d_%H%M')
for src in [POS_F, NEG_F]:
    bn = os.path.basename(src)
    shutil.copy2(src, f'{BACKUP}/{bn}.{ts}_pre_apillar')
print(f'备份完成 -> {BACKUP}')

# ── 读取现有池 ───────────────────────────────────────
pos_old = list(csv.DictReader(open(POS_F, encoding='utf-8')))
neg_old = list(csv.DictReader(open(NEG_F, encoding='utf-8')))
pos_keys = {(str(r['sid']), str(r['gid'])) for r in pos_old}
neg_keys = {(str(r['sid']), str(r['gid'])) for r in neg_old}
print(f'池现状: 正{len(pos_old)} 负{len(neg_old)}')

# ── 合并：A柱NEG → 负样本池 ──────────────────────────
new_neg = 0
demote = 0
for r in neg_by_a_pillar:
    key = (r['sid'], r['gid'])
    if key in pos_keys and key not in neg_keys:
        # 从正样本降级
        pos_old = [x for x in pos_old if (str(x['sid']), str(x['gid'])) != key]
        neg_old.append({'shot':'apillar_demote','blk':r['sheet'],'row':'','col':'',
                        'idx':str(r['cell']),'brand':r['brand'],'series':r['series'],
                        'sid':r['sid'],'gid':r['gid'],'score':r['score'],
                        'local':r['local'],'fullurl':r['fullurl']})
        demote += 1
    elif key not in neg_keys:
        # 新增负样本
        neg_old.append({'shot':'apillar','blk':r['sheet'],'row':'','col':'',
                        'idx':str(r['cell']),'brand':r['brand'],'series':r['series'],
                        'sid':r['sid'],'gid':r['gid'],'score':r['score'],
                        'local':r['local'],'fullurl':r['fullurl']})
        new_neg += 1

# ── 写回 ────────────────────────────────────────────
with open(POS_F, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['shot','blk','row','col','idx','brand','series','sid','gid','score','local','fullurl'])
    w.writeheader(); w.writerows(pos_old)
with open(NEG_F, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['shot','blk','row','col','idx','brand','series','sid','gid','score','local','fullurl'])
    w.writeheader(); w.writerows(neg_old)

print(f'\n✅ A柱筛选合并完成:')
print(f'  正样本: {len(pos_old)} (-{demote} 降级)')
print(f'  负样本: {len(neg_old)} (+{new_neg} 新增, +{demote} 降级)')
print(f'  备份: {BACKUP}')
