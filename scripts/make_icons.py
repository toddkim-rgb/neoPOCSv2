"""Generates the launcher icons (adaptive + legacy), the native splash image and the web favicon.

The mark mirrors the splash logo: blue-gradient "neo" with the four-point sparkles on white.
usage: python make_icons.py <project_root>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageChops

root = sys.argv[1]
FONT = os.path.join(root, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2', 'Pretendard-Bold.woff2')
RES = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
C1, C2 = (101, 198, 233), (24, 120, 188)  # #65C6E9 → #1878BC


def gradient(size):
    w, h = size
    g = Image.new('RGB', size)
    px = g.load()
    for x in range(w):
        t = x / max(1, w - 1)
        c = tuple(round(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))
        for y in range(h):
            px[x, y] = c
    return g


def star(draw, cx, cy, rx, ry, k=0.18):
    # four-point star with concave sides (same shape as the SVG sparkle)
    pts = []
    import math
    for i in range(64):
        a = 2 * math.pi * i / 64
        ca, sa = math.cos(a), math.sin(a)
        r = (abs(ca) ** (2 / 1.0) + abs(sa) ** (2 / 1.0))
        # astroid-like curve: |x|^(2/3)+|y|^(2/3)=1
        x = (abs(ca) ** 3) * (1 if ca >= 0 else -1)
        y = (abs(sa) ** 3) * (1 if sa >= 0 else -1)
        pts.append((cx + x * rx, cy + y * ry))
    draw.polygon(pts, fill=255)


def mark(size, scale=1.0):
    """White square with the gradient logo, size×size."""
    s = size
    mask = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(mask)
    font = ImageFont.truetype(FONT, round(s * 0.36 * scale))
    text = 'neo'
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (s - tw) / 2 - bbox[0]
    y = (s - th) / 2 - bbox[1] + s * 0.05 * scale
    d.text((x, y), text, font=font, fill=255)
    # sparkles above-left of the word
    star(d, s / 2 - tw * 0.30, s / 2 - th * 0.95 - s * 0.02, s * 0.075 * scale, s * 0.095 * scale)
    star(d, s / 2 - tw * 0.30 + s * 0.11 * scale, s / 2 - th * 1.25 - s * 0.02, s * 0.037 * scale, s * 0.045 * scale)
    img = Image.new('RGBA', (s, s), (255, 255, 255, 0))
    img.paste(gradient((s, s)), (0, 0), mask)
    return img


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in densities.items():
    # adaptive foreground: 108dp canvas, artwork inside the 66dp safe zone
    fg_size = round(108 * f)
    fg = mark(fg_size, scale=0.62)
    save(fg, os.path.join(RES, f'mipmap-{name}', 'ic_launcher_foreground.png'))
    # legacy square + round icons: 48dp
    ls = round(48 * f)
    base = Image.new('RGBA', (ls, ls), (0, 0, 0, 0))
    tile = Image.new('L', (ls, ls), 0)
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, ls - 1, ls - 1), radius=round(ls * 0.22), fill=255)
    white = Image.new('RGBA', (ls, ls), (255, 255, 255, 255))
    base.paste(white, (0, 0), tile)
    base.alpha_composite(mark(ls, scale=0.9))
    save(base, os.path.join(RES, f'mipmap-{name}', 'ic_launcher.png'))
    round_base = Image.new('RGBA', (ls, ls), (0, 0, 0, 0))
    circle = Image.new('L', (ls, ls), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, ls - 1, ls - 1), fill=255)
    round_base.paste(white, (0, 0), circle)
    round_base.alpha_composite(mark(ls, scale=0.9))
    save(round_base, os.path.join(RES, f'mipmap-{name}', 'ic_launcher_round.png'))

# favicon / store-size preview
fav = Image.new('RGBA', (256, 256), (255, 255, 255, 255))
fav.alpha_composite(mark(256, scale=0.9))
save(fav, os.path.join(root, 'public', 'favicon.png'))
big = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
big.alpha_composite(mark(512, scale=0.9))
save(big, os.path.join(root, 'resources', 'icon-512.png'))
print('icons written')
