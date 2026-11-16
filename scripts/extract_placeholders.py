"""Crop 1x placeholder 3D icons from Figma screen renders.

Figma's MCP quota ran out before the original image fills could be exported, so these are
temporary 1x crops upscaled 3x. Replace them with real exports (see README) when available.
usage: python extract_placeholders.py <shots_dir> <out_dir>
"""
import sys
from PIL import Image, ImageDraw

shots, out = sys.argv[1], sys.argv[2]
SCALE = 3

def rounded_mask(size, box, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
    return m

def save(img, name):
    img = img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)
    img.save(f"{out}/{name}.png", optimize=True)
    print(name, img.size)

def crop(screen, x, y, w, h, tile=None):
    im = Image.open(f"{shots}/{screen}.png").convert('RGBA').crop((x, y, x + w, y + h))
    if tile:  # (tx, ty, tw, th) in screen coords -> keep only the rounded tile
        tx, ty, tw, th = tile
        box = (tx - x, ty - y, tx - x + tw - 1, ty - y + th - 1)
        im.putalpha(rounded_mask(im.size, box, round(tw * 0.248)))
    return im

# status icons (100x100 boxes on the gradient background)
save(crop('12_task-drugonly', 156, 146, 100, 100, (159, 151, 94, 94)), 'pill')
save(crop('08_err-barcode', 156, 322, 100, 100, (159, 327, 93, 94)), 'warning-yellow')
save(crop('16_voice-03', 156, 322, 100, 100, (159, 327, 93, 94)), 'check-blue')

# hub shortcuts (56px tiles on the gradient)
save(crop('04_hub-urgent', 130, 576, 56, 57, (130, 576, 56, 57)), 'syringe')
save(crop('04_hub-urgent', 226, 576, 56, 57, (226, 576, 56, 57)), 'vital')
save(crop('04_hub-urgent', 322, 576, 56, 57, (322, 576, 56, 57)), 'patient-check')

# menu tiles (45x45 on white cards), row-major order
menu = ['pill-45', 'syringe-45', 'blood', 'hourglass', 'blood-arrival', 'own-meds', 'vital-45', 'narcotic',
        'pre-op', 'body-measure', 'photo', 'nursing-care', 'messenger', 'mother-baby', 'transfer', 'chemo',
        'diet', 'consent', 'patient-check-45', 'second-order', 'supply-usage', 'pharmacy-delivery',
        'supply-info', 'asset-register']
rows = [0, 67, 134, 201, 268, 335, 402, 469, 536, 603, 670, 737]
for i, name in enumerate(menu):
    r, c = divmod(i, 2)
    x = 28 if c == 0 else 221
    save(crop('06_hub-menu', x, 148 + rows[r], 45, 45), name)

# MY환자 avatars (36x36 on white rows)
save(crop('05_hub-mypatients', 32, 273, 36, 36), 'avatar-male')
save(crop('05_hub-mypatients', 32, 406, 36, 36), 'avatar-female')
