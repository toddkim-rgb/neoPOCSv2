"""Crop the 3D icons that are new in the SSol design (Figma 11zTP3cEcnnQsCNchWnVei) from its 1x renders.

Same approach as extract_placeholders.py: 1x crops with the rounded tile kept, upscaled 3x.
usage: python extract_ssol_icons.py <figma_ssol_dir> <out_dir>   (figma_ssol_dir = ../figma-ssol, holds design-p1/ and design-p2/)
"""
import sys
from PIL import Image, ImageDraw

design, out = sys.argv[1], sys.argv[2]
SCALE = 3


def rounded_mask(size, box, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
    return m


def save(img, name):
    img = img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)
    img.save(f'{out}/{name}.png', optimize=True)
    print(name, img.size)


def crop(screen, x, y, w, h, tile=None):
    im = Image.open(f'{design}/{screen}.png').convert('RGBA').crop((x, y, x + w, y + h))  # screen = 'design-pN/<name>'
    if tile:  # (tx, ty, tw, th) in screen coords -> keep only the rounded tile
        tx, ty, tw, th = tile
        box = (tx - x, ty - y, tx - x + tw - 1, ty - y + th - 1)
        im.putalpha(rounded_mask(im.size, box, round(tw * 0.248)))
    return im


# 바코드 스캔 status icon (100x100 box, same slot as the old pill icon)
save(crop('design-p1/m01_scan', 156, 322, 100, 100, (159, 326, 94, 94)), 'scan')

# hub shortcuts (56px tiles on the gradient)
for name, x in (('sc-pill', 30), ('sc-syringe', 128), ('sc-vital', 227), ('sc-mother', 326)):
    save(crop('design-p1/h1_hub-urgent', x, 551, 57, 59, (x, 551, 57, 57)), name)

# urgent-work card icons (38px tiles on white cards)
for name, y in (('uc-pill', 272), ('uc-blood', 368), ('uc-vital', 464)):
    save(crop('design-p1/h1_hub-urgent', 29, y, 38, 38, (29, y, 38, 38)), name)

# MY환자 avatars (38px tiles on white rows)
save(crop('design-p1/h4_hub-my', 29, 302, 38, 38, (29, 302, 38, 38)), 'avatar-male')
save(crop('design-p1/h4_hub-my', 29, 454, 38, 38, (29, 454, 38, 38)), 'avatar-female')

# 측정(활력징후) 계열: green scan + done icons
save(crop('design-p2/v1_scan', 156, 322, 100, 100, (159, 326, 94, 94)), 'scan-green')
save(crop('design-p2/v5_done', 156, 317, 100, 100, (159, 320, 94, 94)), 'check-green')

# 햄버거메뉴 tiles: 홈(환자 허브) · 주사실 설정 (38px tiles on white cards)
save(crop('design-p3/n1_menu', 29, 124, 38, 38, (29, 124, 38, 38)), 'nav-home')
save(crop('design-p3/n1_menu', 223, 124, 38, 38, (223, 124, 38, 38)), 'nav-room')
