"""
Merge v10 round 8 user feedback (score suffix NEG) into few-shot pool.
"""
import csv, os, shutil
from datetime import datetime

BASE = '.'
PICKLIST = f'{BASE}/output/us_target_candidates_v10/picklist.csv'
POS_CSV = f'{BASE}/output/fewshot/positives.csv'
NEG_CSV = f'{BASE}/output/fewshot/negatives.csv'

# Confirmed NEG from user's round 8 feedback (matched by score suffix)
# Format: (sid, gid) - identity key
ROUND8_NEG_KEYS = {
    # s_0 confirmed
    ('364', '41'),      # 福特 福克斯 gid41 (3064)
    ('3049', '38'),     # 道奇 Charger SRT gid38 (3002)
    ('4235', '0'),      # 雪佛兰 探界者 (312)
    # s_1 confirmed
    ('166', '0'),       # 别克 GL8 (2989)
    # s_1 ambiguous 2976 → both marked NEG
    ('5757', '70'),     # 林肯 航海家 gid70 (2976)
    ('166', '141'),     # 别克 GL8 gid141 (2976)
}

def read_pool(path):
    if not os.path.exists(path):
        return []
    with open(path, 'r') as f:
        return list(csv.DictReader(f))

def write_pool(path, rows):
    if rows:
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader()
            w.writerows(rows)

def backup_pools():
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    bk_dir = f'{BASE}/output/fewshot/backup_r8_{ts}'
    os.makedirs(bk_dir, exist_ok=True)
    for name in ['positives.csv', 'negatives.csv']:
        src = f'{BASE}/output/fewshot/{name}'
        if os.path.exists(src):
            shutil.copy2(src, f'{bk_dir}/{name}')
    print(f'Backed up to {bk_dir}')

def main():
    backup_pools()

    pos_pool = read_pool(POS_CSV)
    neg_pool = read_pool(NEG_CSV)
    pos_keys = {(str(r['sid']), str(r['gid'])) for r in pos_pool}
    neg_keys = {(str(r['sid']), str(r['gid'])) for r in neg_pool}

    print(f'Current pool: POS={len(pos_pool)} NEG={len(neg_pool)}')

    new_neg = 0
    demoted = 0
    already_neg = 0

    for sid, gid in ROUND8_NEG_KEYS:
        key = (str(sid), str(gid))
        if key in pos_keys:
            pos_pool = [p for p in pos_pool if (str(p['sid']), str(p['gid'])) != key]
            pos_keys.discard(key)
            demoted += 1
            print(f'  ⬇️ DEMOTED: sid={sid} gid={gid}')
        if key not in neg_keys:
            neg_row = {
                'shot': 'round8', 'blk': 'user_suffix', 'row': '', 'col': '',
                'idx': '', 'brand': '', 'series': '',
                'sid': sid, 'gid': gid, 'score': '',
                'local': '', 'fullurl': ''
            }
            neg_pool.append(neg_row)
            neg_keys.add(key)
            new_neg += 1
            print(f'  ➕ NEW NEG: sid={sid} gid={gid}')
        else:
            already_neg += 1
            print(f'  ✓ ALREADY NEG: sid={sid} gid={gid}')

    write_pool(POS_CSV, pos_pool)
    write_pool(NEG_CSV, neg_pool)

    print(f'\n=== Result ===')
    print(f'New NEG: {new_neg} | Demoted: {demoted} | Already NEG: {already_neg}')
    print(f'Updated pool: POS={len(pos_pool)} NEG={len(neg_pool)}')

if __name__ == '__main__':
    main()
