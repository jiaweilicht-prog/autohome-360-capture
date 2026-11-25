#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 EU pilot 对比打分 top24 拼成一张联络图供肉眼核验迁移性。"""
from PIL import Image, ImageDraw, ImageFont
import os

D = "output/pull_eu_pilot/cand"
top = [
 ("8105_0086","奥迪A6L e-tron"),("2951_0038","奥迪Q3"),("692_0134","奥迪A4L"),
 ("3170_0135","奥迪A3"),("7413_0000","奥迪Q6L e-tron"),("7413_0054","奥迪Q6L e-tron"),
 ("8105_0104","奥迪A6L e-tron"),("4871_0117","奥迪Q2L"),("7855_0057","奥迪A5L"),
 ("18_0085","奥迪A6L"),("8105_0000","奥迪A6L e-tron"),("5933_0113","奥迪Q3 Sportback"),
 ("18_0050","奥迪A6L"),("7855_0022","奥迪A5L"),("18_0002","奥迪A6L"),
 ("8105_0053","奥迪A6L e-tron"),("2951_0039","奥迪Q3"),("5933_0039","奥迪Q3 Sportback"),
 ("7413_0035","奥迪Q6L e-tron"),("692_0000","奥迪A4L"),("8105_0001","奥迪A6L e-tron"),
 ("4871_0118","奥迪Q2L"),("8105_0140","奥迪A6L e-tron"),("692_0044","奥迪A4L"),
]
COLS, CELL, PAD, LH = 6, 300, 6, 22
rows = (len(top)+COLS-1)//COLS
W = COLS*(CELL+PAD)+PAD
H = rows*(CELL+LH+PAD)+PAD
cv = Image.new("RGB",(W,H),(245,245,245)); dr = ImageDraw.Draw(cv)
try: font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc",15)
except Exception: font = ImageFont.load_default()
for i,(fn,lab) in enumerate(top):
    c,r = divmod(i,COLS)
    x,y = PAD+c*(CELL+PAD), PAD+r*(CELL+LH+PAD)
    p = os.path.join(D, fn+".jpg")
    im = Image.open(p).convert("RGB"); im.thumbnail((CELL,CELL),Image.LANCZOS)
    cell = Image.new("RGB",(CELL,CELL),(255,255,255))
    cell.paste(im,((CELL-im.width)//2,(CELL-im.height)//2)); cv.paste(cell,(x,y))
    dr.rectangle([x,y+CELL,x+CELL,y+CELL+LH],fill=(0,90,160))
    dr.text((x+4,y+CELL+3), f"{i+1}. {lab} {fn}", fill=(255,255,255), font=font)
cv.save("output/pull_eu_pilot/eu_transfer_top24.jpg", quality=88)
print("saved output/pull_eu_pilot/eu_transfer_top24.jpg", cv.size)
