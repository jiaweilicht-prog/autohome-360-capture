"""
Merge A-pillar position (NEW standard) NEG results from v8 wall screening into few-shot pool.
NEG = A-pillar on LEFT side of image (counter-clockwise from top) = nose pointing left = wrong view.
"""
import csv, os, shutil
from datetime import datetime

BASE = '.'
PICKLIST = f'{BASE}/output/us_target_candidates_v8/picklist.csv'
POS_CSV = f'{BASE}/output/fewshot/positives.csv'
NEG_CSV = f'{BASE}/output/fewshot/negatives.csv'

# NEG coordinates from new A-pillar position screening (s_0~s_7)
# Format: (sheet_idx, row, col) — 0-based
APILLAR_NEG_COORDS = {
    # s_1: 11 NEG
    (1, 0, 6), (1, 0, 7),
    (1, 1, 5), (1, 1, 6), (1, 1, 7),
    (1, 2, 4), (1, 2, 5), (1, 2, 6), (1, 2, 7),
    (1, 3, 0), (1, 3, 1), (1, 3, 2), (1, 3, 3),
    # s_2: 10 NEG
    (2, 2, 5), (2, 2, 6), (2, 2, 7),
    (2, 3, 3), (2, 3, 4),
    (2, 4, 4), (2, 4, 5), (2, 4, 6), (2, 4, 7),
    # s_3: 13 NEG
    (3, 2, 4), (3, 2, 5), (3, 2, 6), (3, 2, 7),
    (3, 3, 3),
    (3, 3, 5), (3, 3, 6), (3, 3, 7),
    (3, 4, 3),
    (3, 4, 5), (3, 4, 6), (3, 4, 7),
    # s_5: 2 NEG
    (5, 1, 1),
    (5, 2, 2),
    # s_6: 8 NEG
    (6, 0, 3),
    (6, 1, 1), (6, 1, 6),
    (6, 2, 5),
    (6, 3, 0), (6, 3, 1), (6, 3, 5),
    (6, 4, 3),
    # s_7: 2 NEG
    (7, 0, 4), (7, 0, 5),
}

def read_picklist():
    """Read picklist, return list of dicts with sheet/row/col info."""
    rows = []
    with open(PICKLIST, 'r') as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            rows.append(r)
    # Assign sheet/row/col based on position (8 cols per sheet)
    COLS = 8
    for i, r in enumerate(rows):
        r['_idx'] = i
        r['_sheet'] = i // (COLS * 5)
        r['_pos_in_sheet'] = i % (COLS * 5)
        r['_row'] = r['_pos_in_sheet'] // COLS
        r['_col'] = r['_pos_in_sheet'] % COLS
    return rows

def read_pool(path):
    """Read pool CSV, return list of dicts."""
    if not os.path.exists(path):
        return []
    with open(path, 'r') as f:
        return list(csv.DictReader(f))

def write_pool(path, rows):
    """Write pool CSV."""
    if rows:
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader()
            w.writerows(rows)

def backup_pools():
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    bk_dir = f'{BASE}/output/fewshot/backup_apillar_v2_{ts}'
    os.makedirs(bk_dir, exist_ok=True)
    for name in ['positives.csv', 'negatives.csv']:
        src = f'{BASE}/output/fewshot/{name}'
        if os.path.exists(src):
            shutil.copy2(src, f'{bk_dir}/{name}')
    print(f'Backed up to {bk_dir}')
    return bk_dir

def main():
    # Read picklist with coordinates
    picklist = read_picklist()
    print(f'Picklist: {len(picklist)} rows')

    # Build coordinate -> row mapping
    coord_map = {}
    for r in picklist:
        key = (r['_sheet'], r['_row'], r['_col'])
        coord_map[key] = r

    # Find NEG matches
    neg_matches = []
    missing = []
    for coord in APILLAR_NEG_COORDS:
        if coord in coord_map:
            neg_matches.append(coord_map[coord])
        else:
            missing.append(coord)

    print(f'\nA-pillar NEG matches: {len(neg_matches)} / {len(APILLAR_NEG_COORDS)}')
    if missing:
        print(f'Missing coords: {missing}')

    # Show matched NEG items
    print('\n=== A-pillar NEG items (new standard) ===')
    for r in neg_matches:
        print(f"  s{r['_sheet']} r{r['_row']}c{r['_col']} | sid={r['sid']} gid={r['gid']} | {r['brand']} {r['series']} | score={r.get('score','?')}")

    # Backup
    backup_pools()

    # Read current pools
    pos_pool = read_pool(POS_CSV)
    neg_pool = read_pool(NEG_CSV)
    pos_keys = {(r['sid'], r['gid']) for r in pos_pool}
    neg_keys = {(r['sid'], r['gid']) for r in neg_pool}

    print(f'\nCurrent pool: POS={len(pos_pool)} NEG={len(neg_pool)}')

    # Process NEG matches
    new_neg = 0
    demoted = 0
    for r in neg_matches:
        key = (str(r['sid']), str(r['gid']))
        if key in pos_keys:
            # Demote from positive to negative
            pos_pool = [p for p in pos_pool if (str(p['sid']), str(p['gid'])) != key]
            pos_keys.discard(key)
            demoted += 1
        if key not in neg_keys:
            neg_row = {
                'shot': 'apillar_v2', 'blk': f"s{r['_sheet']}", 'row': r['_row'], 'col': r['_col'],
                'idx': r['_idx'], 'brand': r['brand'], 'series': r['series'],
                'sid': r['sid'], 'gid': r['gid'], 'score': r.get('score', ''),
                'local': r.get('local', ''), 'fullurl': r.get('fullurl', '')
            }
            neg_pool.append(neg_row)
            neg_keys.add(key)
            new_neg += 1

    # Write updated pools
    write_pool(POS_CSV, pos_pool)
    write_pool(NEG_CSV, neg_pool)

    print(f'\n=== Result ===')
    print(f'New NEG added: {new_neg}')
    print(f'Demoted from POS: {demoted}')
    print(f'Updated pool: POS={len(pos_pool)} NEG={len(neg_pool)}')

if __name__ == '__main__':
    main()
