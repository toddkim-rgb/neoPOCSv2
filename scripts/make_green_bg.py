"""Rebuild the green 측정(활력징후) screen background from the SSol design render.

The UI (header, icon, texts, button) is masked out and filled in by diffusion, then smoothed,
leaving only the background gradient.
usage: python make_green_bg.py <design_dir> <out_png>   (design_dir = ../figma-ssol/design-p2)
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

design, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(f'{design}/v1_scan.png').convert('RGB'), np.float64)
H, W, _ = im.shape

mask = np.zeros((H, W), bool)  # True = UI, to be filled
mask[0:52, :] = True            # status bar
mask[60:110, 10:62] = True      # back button
mask[60:110, 350:402] = True    # menu button
mask[70:100, 150:262] = True    # title
mask[310:540, 60:352] = True    # scan icon + title + description
mask[775:860, 8:404] = True     # 스캔하기 button + shadow
mask[868:892, :] = True         # gesture bar

# work on a 1/4 grid, fill masked cells by repeated neighbour averaging
s = 4
small = im.reshape(H // s, s, W // s, s, 3).mean(axis=(1, 3))
m = mask.reshape(H // s, s, W // s, s).any(axis=(1, 3))
known = ~m
fill = small.copy()
fill[m] = small[known].mean(axis=0)
for _ in range(3000):
    p = np.pad(fill, ((1, 1), (1, 1), (0, 0)), mode='edge')
    avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
    fill[m] = avg[m]
img = Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
img = img.filter(ImageFilter.GaussianBlur(6))
img.save(out, optimize=True)
print(out, img.size)
