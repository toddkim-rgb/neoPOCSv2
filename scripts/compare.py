"""Side-by-side comparison of Figma renders and prototype screenshots.

usage: python compare.py <design_dir> <app_dir> <out_dir> [name-filter]
Writes <name>.png = [design | app | difference heat-map] and prints a mismatch score per screen.
"""
import sys
import os
import numpy as np
from PIL import Image, ImageDraw

design_dir, app_dir, out_dir = sys.argv[1:4]
flt = sys.argv[4] if len(sys.argv) > 4 else ''
os.makedirs(out_dir, exist_ok=True)

for f in sorted(os.listdir(app_dir)):
    if not f.endswith('.png') or flt not in f:
        continue
    d = Image.open(os.path.join(design_dir, f)).convert('RGB')
    a = Image.open(os.path.join(app_dir, f)).convert('RGB')
    h = min(d.height, a.height)
    d, a = d.crop((0, 0, 412, h)), a.crop((0, 0, 412, h))
    da, aa = np.asarray(d, np.int16), np.asarray(a, np.int16)
    diff = np.abs(da - aa).max(axis=2)
    # ignore status bar / gesture handle rows
    diff[:52] = 0
    diff[h - 24:] = 0
    score = float((diff > 40).mean() * 100)
    heat = np.zeros((h, 412, 3), np.uint8)
    heat[..., 0] = np.clip(diff * 3, 0, 255)
    heat[..., 1] = (np.asarray(d.convert('L')) * 0.25).astype(np.uint8)
    heat[..., 2] = (np.asarray(d.convert('L')) * 0.25).astype(np.uint8)
    sheet = Image.new('RGB', (412 * 3 + 16, h), (40, 40, 40))
    sheet.paste(d, (0, 0))
    sheet.paste(a, (420, 0))
    sheet.paste(Image.fromarray(heat), (840, 0))
    dr = ImageDraw.Draw(sheet)
    for y in range(0, h, 100):
        dr.line([(412, y), (419, y)], fill=(255, 255, 0))
        dr.line([(832, y), (839, y)], fill=(255, 255, 0))
    sheet.save(os.path.join(out_dir, f))
    print(f"{f:28s} mismatch {score:5.2f}%")
