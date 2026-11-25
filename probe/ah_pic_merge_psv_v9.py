"""
Merge passenger-side-view Skill v9 screening results into few-shot pool.
NEG = A-pillar on LEFT side / steering wheel in foreground / door panel close-up etc.
"""
import csv, os, shutil
from datetime import datetime

BASE = '.'
PICKLIST = f'{BASE}/output/us_target_candidates_v9/picklist.csv'
POS_CSV = f'{BASE}/output/fewshot/positives.csv'
NEG_CSV = f'{BASE}/output/fewshot/negatives.csv'

# NEG coordinates from passenger-side-view Skill screening of v9 walls
PSV_NEG_COORDS = {
    # s_0: 15 NEG
    (0, 0, 0), (0, 0, 1), (0, 0, 2), (0, 0, 3), (0, 0, 4), (0, 0, 5), (0, 0, 6), (0, 0, 7),
    (0, 1, 7),
    (0, 2, 3),
    (0, 3, 0), (0, 3, 1), (0, 3, 2), (0, 3, 3),
    (0, 3, 7),
    # s_1: 6 NEG
    (1, 0, 4),
    (1, 1, 3),
    (1, 2, 3),
    (1, 3, 1), (1, 3, 2), (1, 3, 3),
    # s_2: 9 NEG
    (2, 0, 5),
    (2, 2, 6), (2, 2, 7),
    (2, 3, 0), (2, 3, 2), (2, 3, 3), (2, 3, 5),
    (2, 4, 1), (2, 4, 2),
}

def read_picklist():
    rows = []
    with open(PICKLIST, 'r') as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            rows.append(r)
    COLS = 8
    for i, r in enumerate(rows):
        r['_idx'] = i
        r['_sheet'] = i // (COLS * 5)
        r['_pos_in_sheet'] = i % (COLS * 5)
        r['_row'] = r['_pos_in_sheet'] // COLS
        r['_col'] = r['_pos_in_sheet'] % COLS
    return rows

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
    bk_dir = f'{BASE}/output/fewshot/backup_psv_v9_{ts}'
    os.makedirs(bk_dir, exist_ok=True)
    for name in ['positives.csv', 'negatives.csv']:
        src = f'{BASE}/output/fewshot/{name}'
        if os.path.exists(src):
            shutil.copy2(src, f'{bk_dir}/{name}')
    print(f'Backed up to {bk_dir}')

def main():
    picklist = read_picklist()
    print(f'Picklist: {len(picklist)} rows')

    coord_map = {}
    for r in picklist:
        key = (r['_sheet'], r['_row'], r['_col'])
        coord_map[key] = r

    neg_matches = []
    missing = []
    for coord in PSV_NEG_COORDS:
        if coord in coord_map:
            neg_matches.append(coord_map[coord])
        else:
            missing.append(coord)

    print(f'\nPSV NEG matches: {len(neg_matches)} / {len(PSV_NEG_COORDS)}')
    if missing:
        print(f'Missing coords (may be beyond wall end): {missing}')

    print('\n=== PSV NEG items (v9 Skill screening) ===')
    for r in neg_matches:
        print(f"  s{r['_sheet']} r{r['_row']}c{r['_col']} | sid={r['sid']} gid={r['gid']} | {r['brand']} {r['series']}")

    backup_pools()

    pos_pool = read_pool(POS_CSV)
    neg_pool = read_pool(NEG_CSV)
    pos_keys = {(r['sid'], r['gid']) for r in pos_pool}
    neg_keys = {(r['sid'], r['gid']) for r in neg_pool}

    print(f'\nCurrent pool: POS={len(pos_pool)} NEG={len(neg_pool)}')

    new_neg = 0
    demoted = 0
    for r in neg_matches:
        key = (str(r['sid']), str(r['gid']))
        if key in pos_keys:
            pos_pool = [p for p in pos_pool if (str(p['sid']), str(p['gid'])) != key]
            pos_keys.discard(key)
            demoted += 1
        if key not in neg_keys:
            neg_row = {
                'shot': 'psv_v9', 'blk': f"s{r['_sheet']}", 'row': r['_row'], 'col': r['_col'],
                'idx': r['_idx'], 'brand': r['brand'], 'series': r['series'],
                'sid': r['sid'], 'gid': r['gid'], 'score': r.get('score', ''),
                'local': r.get('local', ''), 'fullurl': r.get('fullurl', '')
            }
            neg_pool.append(neg_row)
            neg_keys.add(key)
            new_neg += 1

    write_pool(POS_CSV, pos_pool)
    write_pool(NEG_CSV, neg_pool)

    print(f'\n=== Result ===')
    print(f'New NEG added: {new_neg}')
    print(f'Demoted from POS: {demoted}')
    print(f'Updated pool: POS={len(pos_pool)} NEG={len(neg_pool)}')

if __name__ == '__main__':
    main()
