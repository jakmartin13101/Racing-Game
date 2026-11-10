"""Kai'ele sand set from ambientCG scans (CC0), 2K-JPG downloads unzipped side by side.
  sand_ar.webp  2K  RGB = Ground054 albedo (grain), A = Ground054 height (AO, and water fills the hollows first)
  sand_nn.webp  1K  RG = Ground054 grain normal XY, BA = Ground055S wind-ripple normal XY
The ground shader has no sampler to spare, so one texture carries both normals (sampled at their own scales).
usage: python3 kaiele_sand_tex.py <dir holding Ground054/ Ground055S/> <out dir>"""
import sys, os
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]


def m(a, part, size):
    im = Image.open(f'{src}/{a}/{a}_2K-JPG_{part}.jpg').convert('RGB' if part in ('Color', 'NormalGL') else 'L')
    return np.asarray(im.resize((size, size), Image.LANCZOS))


def stretch(h):
    h = h.astype(np.float32)
    lo, hi = np.percentile(h, 0.5), np.percentile(h, 99.5)
    return np.clip((h - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)


c, h = m('Ground054', 'Color', 2048), stretch(m('Ground054', 'Displacement', 2048))
Image.fromarray(np.dstack([c, h]), 'RGBA').save(f'{out}/sand_ar.webp', quality=78, alpha_quality=60, method=6)
g, r = m('Ground054', 'NormalGL', 1024), m('Ground055S', 'NormalGL', 1024)
Image.fromarray(np.dstack([g[..., 0], g[..., 1], r[..., 0], r[..., 1]]), 'RGBA').save(f'{out}/sand_nn.webp', quality=90, alpha_quality=85, method=6)
for f in ('sand_ar.webp', 'sand_nn.webp'):
    print(f, os.path.getsize(f'{out}/{f}') // 1024, 'KB')
