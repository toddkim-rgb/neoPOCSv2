"""Rebuild the splash/login gradient background (without text/buttons) from the three Figma renders.

Each render hides different parts of the background, so pixels are averaged from the renders where
they are visible; areas covered in all three are filled by normalized convolution, then film grain
matching the original is added back.
usage: python build_splash_bg.py <shots_dir> <out_png>
"""
import sys
import numpy as np
from PIL import Image

shots, out = sys.argv[1], sys.argv[2]
W, H = 412, 892

def load(name):
    return np.asarray(Image.open(f"{shots}/{name}.png").convert('RGB'), dtype=np.float32)

common = [(0, 0, 412, 54), (318, 68, 397, 94), (33, 118, 258, 312), (148, 870, 264, 888),
          (0, 870, 22, 892), (390, 870, 412, 892)]  # last two: rounded frame corners
masks = {
    '01_splash': common + [(30, 344, 340, 426), (8, 710, 404, 854)],
    '02_auth-input': common + [(34, 340, 402, 480), (80, 486, 335, 518), (8, 736, 404, 810), (125, 816, 288, 852)],
    '03_auth-bio': common + [(72, 455, 342, 566), (8, 736, 404, 810), (125, 816, 288, 852)],
}

acc = np.zeros((H, W, 3), np.float32)
cnt = np.zeros((H, W), np.float32)
for name, boxes in masks.items():
    img = load(name)
    valid = np.ones((H, W), np.float32)
    for x0, y0, x1, y1 in boxes:
        valid[y0:y1, x0:x1] = 0
    acc += img * valid[..., None]
    cnt += valid

known = cnt > 0
mean = np.where(known[..., None], acc / np.maximum(cnt, 1)[..., None], 0)

def blur(a, r):
    """Separable Gaussian blur of a 2-D float array (edge-padded)."""
    k = np.arange(-3 * r, 3 * r + 1, dtype=np.float32)
    k = np.exp(-(k * k) / (2 * r * r)); k /= k.sum()
    p = len(k) // 2
    a = np.pad(a, p, mode='edge')
    a = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, a)

# normalized convolution fill for the holes
filled = mean.copy()
m = known.astype(np.float32)
for r in (6, 14, 28, 56):
    num = np.stack([blur(filled[..., c] * m, r) for c in range(3)], -1)
    den = blur(m, r)[..., None]
    est = num / np.maximum(den, 1e-4)
    hole = (m == 0)
    filled[hole] = est[hole]
    m = np.where(den[..., 0] > 0.02, 1.0, m)

# harmonic (Laplace) relaxation inside the holes so fills meet their borders without seams
hole = ~known
for _ in range(3000):
    p = np.pad(filled, ((1, 1), (1, 1), (0, 0)), mode='edge')
    avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
    filled[hole] = avg[hole]

# grain: measure it on known pixels, synthesize it on filled ones
smooth = np.stack([blur(filled[..., c], 3) for c in range(3)], -1)
resid = (mean - smooth)[known]
sigma = float(np.std(resid))
rng = np.random.default_rng(7)
noise = rng.normal(0, sigma, (H, W, 1)).astype(np.float32)
result = np.where(known[..., None], mean, smooth + noise)
Image.fromarray(np.clip(result, 0, 255).astype(np.uint8)).save(out, optimize=True)
print('grain sigma', round(sigma, 2), 'filled px', int((~known).sum()), '->', out)
