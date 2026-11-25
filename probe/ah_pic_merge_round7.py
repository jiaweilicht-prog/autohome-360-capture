#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Round 7 完整反馈合并：s_0~s_7(尾数映射) + s_8(子代理转录) + s_9(待定)
→ 备份旧池 → 合并正负样本 → 重跑 fewshot_rank + finalize 出 v8
"""
import csv, json, os, shutil
from datetime import datetime

POOL_DIR = 'output/fewshot'
POS_F = f'{POOL_DIR}/positives.csv'
NEG_F = f'{POOL_DIR}/negatives.csv'
BACKUP = f'{POOL_DIR}/backup_v3_round'

# ── 1. 备份 ──────────────────────────────────────────────
os.makedirs(BACKUP, exist_ok=True)
ts = datetime.now().strftime('%m%d_%H%M')
for src in [POS_F, NEG_F]:
    bn = os.path.basename(src)
    dst = f'{BACKUP}/{bn}.{ts}'
    shutil.copy2(src, dst)
    print(f'备份 {src} -> {dst}')

# ── 2. 读取现有池 ────────────────────────────────────────
pos_old = list(csv.DictReader(open(POS_F, encoding='utf-8')))
neg_old = list(csv.DictReader(open(NEG_F, encoding='utf-8')))
pos_keys = {(str(r['sid']), str(r['gid'])) for r in pos_old}
neg_keys = {(str(r['sid']), str(r['gid'])) for r in neg_old}
print(f'池现状: 正{len(pos_old)} 负{len(neg_old)}')

# ── 3. 读取今日 s_0~s_7 判定 ─────────────────────────────
today_rows = list(csv.DictReader(open('output/fewshot/round7_today.csv', encoding='utf-8')))

# ── 4. s_8 转录数据（子代理已验证）────────────────────────
# s_8 格式：用户报的是【命中】(POS)，其余为 NEG
s8_hits_suffix = {'2872','2878','2334','2035','261','3056','2367','2506','22','2743','2757'}
s8_cells = [
    # row0
    ('4106','31','0.2872'),('3491','17','0.3076'),('3491','88','0.3046'),('3491','39','0.2978'),
    ('4106','133','0.3076'),('4106','48','0.2334'),('2949','60','0.3062'),('2949','63','0.3062'),
    # row1
    ('2949','38','0.3033'),('342','152','0.3076'),('342','107','0.2878'),('342','50','0.2767'),
    ('95','62','0.3071'),('95','6','0.3037'),('2949','160','0.3066'),('2949','24','0.3008'),
    # row2
    ('2949','170','0.2035'),('4105','28','0.3065'),('4105','95','0.259'),('6477','3','0.3057'),
    ('6477','138','0.3024'),('6477','93','0.261'),('2949','26','0.3056'),('2949','39','0.3053'),
    # row3
    ('6774','88','0.3044'),('6774','45','0.2367'),('5184','51','0.304'),('5184','18','0.2506'),
    ('4716','63','0.3038'),('4716','67','0.22'),('3518','48','0.3034'),('3518','121','0.2985'),
    # row4
    ('3518','184','0.2743'),('4614','15','0.3013'),('4614','54','0.2959'),('4614','81','0.2757'),
    ('678','2','0.3009'),('678','30','0.2965'),('6774','32','0.3007'),('95','34','0.3001'),
]

# ── 5. 汇总所有变更 ───────────────────────────────────────
add_pos = []   # 新增正样本
add_neg = []   # 新增负样本
demote = []    # 从正→负降级

# s_0~s_7
for r in today_rows:
    key = (r['sid'], r['gid'])
    if r['label'] == 'POS':
        if key not in pos_keys and key not in neg_keys:
            add_pos.append(r)
        elif key in neg_keys:
            print(f'  ⚠ s_0~s_7 正负冲突(保持负): {r["brand"]} {r["series"]} gid{r["gid"]}')
    else:  # NEG
        if key in pos_keys and key not in neg_keys:
            demote.append(r)
        elif key not in neg_keys:
            add_neg.append(r)

# s_8 (用户报命中=POS，其余=NEG)
for sid, gid, score in s8_cells:
    sfx = score.split('.')[-1]
    label = 'POS' if sfx in s8_hits_suffix else 'NEG'
    key = (str(sid), str(gid))
    # 找 brand/series（从任意可用源）
    # 先从今日 picklist 找
    brand = series = local = fullurl = ''
    for rr in today_rows:
        if rr['sid'] == sid and rr['gid'] == gid:
            brand, series = rr['brand'], rr['series']
            break
    if not brand:
        # 从旧池找
        for rr in pos_old + neg_old:
            if rr['sid'] == str(sid) and rr['gid'] == str(gid):
                brand, series, local, fullurl = rr.get('brand',''), rr.get('series',''), rr.get('local',''), rr.get('fullurl','')
                break
    rec = {'sheet':'s_8', 'cell':0, 'brand':brand, 'series':series,
           'sid':str(sid), 'gid':str(gid), 'score':score, 'label':label,
           'local':local, 'fullurl':fullurl}

    if label == 'POS':
        if key not in pos_keys and key not in neg_keys:
            add_pos.append(rec)
    else:
        if key in pos_keys and key not in neg_keys:
            demote.append(rec)
        elif key not in neg_keys:
            add_neg.append(rec)

# ── 6. 执行合并 ──────────────────────────────────────────
# 6a. 降级：从正样本移到负样本
demote_keys = {(r['sid'], r['gid']) for r in demote}
if demote:
    pos_old = [r for r in pos_old if (str(r['sid']), str(r['gid'])) not in demote_keys]
    for r in demote:
        neg_old.append({'shot':'round7_demote','blk':'','row':'','col':'',
                        'idx':'','brand':r['brand'],'series':r['series'],
                        'sid':r['sid'],'gid':r['gid'],'score':r['score'],
                        'local':r.get('local',''),'fullurl':r.get('fullurl','')})
    print(f'降级 {len(demote)} 张(正→负)')

# 6b. 追加新正样本
new_pos_count = 0
for r in add_pos:
    key = (r['sid'], r['gid'])
    if key not in pos_keys and key not in {(rr['sid'], rr['gid']) for rr in pos_old}:
        pos_old.append({'shot':'round7','blk':r['sheet'],'row':'','col':'',
                        'idx':str(r['cell']),'brand':r['brand'],'series':r['series'],
                        'sid':r['sid'],'gid':r['gid'],'score':r['score'],
                        'local':r.get('local',''),'fullurl':r.get('fullurl','')})
        new_pos_count += 1

# 6c. 追加新负样本
new_neg_count = 0
for r in add_neg:
    key = (r['sid'], r['gid'])
    if key not in neg_keys and key not in {(rr['sid'], rr['gid']) for rr in neg_old}:
        neg_old.append({'shot':'round7','blk':r['sheet'],'row':'','col':'',
                        'idx':str(r['cell']),'brand':r['brand'],'series':r['series'],
                        'sid':r['sid'],'gid':r['gid'],'score':r['score'],
                        'local':r.get('local',''),'fullurl':r.get('fullurl','')})
        new_neg_count += 1

# ── 7. 写回池 ────────────────────────────────────────────
with open(POS_F, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['shot','blk','row','col','idx','brand','series','sid','gid','score','local','fullurl'])
    w.writeheader(); w.writerows(pos_old)
with open(NEG_F, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['shot','blk','row','col','idx','brand','series','sid','gid','score','local','fullurl'])
    w.writeheader(); w.writerows(neg_old)

print(f'\n✅ 池更新完成:')
print(f'  正样本: {len(pos_old)} (+{new_pos_count} 新增, -{len(demote)} 降级)')
print(f'  负样本: {len(neg_old)} (+{new_neg_count} 新增, +{len(demote)} 从正降级)')
print(f'  s_8: {len(s8_hits_suffix)} 命中 / {len(s8_cells)-len(s8_hits_suffix)} 负面')
print(f'\n⚠ s_9 未处理（转录质量不足，需后续单独处理或用户确认是否跳过）')
print(f'备份在: {BACKUP}')
