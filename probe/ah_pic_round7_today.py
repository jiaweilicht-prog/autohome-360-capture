#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Round 7 反馈解析（分数尾数版）：s_0~s_7 里用户报的尾数=负面，未提及=命中。
旧墙 s_8/s_9 由子代理转录后另行处理（make_pool_rows.py --stale）。
输出：output/fewshot/round7_today.csv（sheet,sid,gid,label 判定明细）
"""
import csv, json

PICK = 'output/us_target_candidates_v7/picklist.csv'
OUT = 'output/fewshot/round7_today.csv'

# 用户报的尾数（按墙）
NEG = {
 's_0': "3818 3245 3393 3186 3201 356 3103 3143 3122 3254 3195 3168 3169 3152 3367 3134 349 3223 3007 3002".split(),
 's_1': "3113 3308 3208 3165 3116 3095 3304 3457 3109 3184 315 3164 311".split(),
 's_2': "3204 3386 2867 3383 3238 3371 3134 3126 312 32 3126 3121 3203 3013".split(),
 's_3': "3065 3231 3025 3094 3168 2998 3076 3095".split(),
 's_4': "3103 3187 3158 3118 3173 3159 3261 3026 3199 3067 3244 3076 3074 3052".split(),
 's_5': "3209 3087 3091 3038 2992 2939 3229 3202 3103 3049 3026 3005 3169 3169 3079".split(),
 's_6': "3071 3147 314 2957 3126 3119 3068 3115 3046 2959 3102 3054 3098 2984".split(),
 's_7': "3084 3077 3022 3014 3053 3045 2933 3037 3029 3012 3016 3001 2988 2982 2597 2964".split(),
}

rows = list(csv.DictReader(open(PICK, encoding='utf-8')))
print('picklist rows:', len(rows))
PER = 40
sheets = {f's_{i}': rows[i*PER:(i+1)*PER] for i in range((len(rows)+PER-1)//PER)}

out = []
for sn, srows in sheets.items():
    negset = set(NEG.get(sn, []))
    hitnums = set()
    for k, r in enumerate(srows):
        sfx = str(r['score']).split('.')[-1]
        lab = 'NEG' if sfx in negset else 'POS'
        if sfx in negset:
            hitnums.add(sfx)
        out.append({'sheet': sn, 'cell': k, 'brand': r['brand'], 'series': r['series'],
                    'sid': r['sid'], 'gid': r['gid'], 'score': r['score'], 'label': lab})
    miss = negset - hitnums
    if miss:
        print(f'⚠ {sn} 有尾数未匹配到任何行: {sorted(miss)}')

with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['sheet','cell','brand','series','sid','gid','score','label'])
    w.writeheader(); w.writerows(out)

npos = sum(1 for o in out if o['label'] == 'POS')
nneg = sum(1 for o in out if o['label'] == 'NEG')
print(f'今日墙判定: POS {npos} | NEG {nneg} -> {OUT}')

# 与现有池对照
pool_p = {(str(r['sid']), str(r['gid'])) for r in csv.DictReader(open('output/fewshot/positives.csv', encoding='utf-8'))}
pool_n = {(str(r['sid']), str(r['gid'])) for r in csv.DictReader(open('output/fewshot/negatives.csv', encoding='utf-8'))}
new_pos = [o for o in out if o['label'] == 'POS' and (o['sid'], o['gid']) not in pool_p]
already_neg_pos = [o for o in new_pos if (o['sid'], o['gid']) in pool_n]
demote = [o for o in out if o['label'] == 'NEG' and (o['sid'], o['gid']) in pool_p]
new_neg = [o for o in out if o['label'] == 'NEG' and (o['sid'], o['gid']) not in pool_n]
print(f'新增正样本(不在池): {len(new_pos)} | 其中原为负样本(冲突,保持负): {len(already_neg_pos)}')
print(f'新增负样本(不在池): {len(new_neg)} | 原正样本被打负(降级): {len(demote)}')
for o in demote:
    print('  降级:', o['sheet'], o['brand'], o['series'], 'gid'+o['gid'], o['score'])
for o in already_neg_pos:
    print('  正负冲突(保持负):', o['sheet'], o['brand'], o['series'], 'gid'+o['gid'], o['score'])
json.dump({'new_pos': new_pos, 'new_neg': new_neg, 'demote': demote,
           'conflict_keep_neg': already_neg_pos},
          open('output/fewshot/round7_today.json', 'w'), ensure_ascii=False, indent=1)
