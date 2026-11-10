"""Pack the terrain material sets into two textures each, to save sampler units.

Many GPUs (and Chrome on Windows through ANGLE) allow only 16 textures per shader, and the terrain blends
four material sets. Each set becomes:
  <key>_ar.webp  RGB = albedo (sRGB), A = roughness (alpha is stored lossless)
  <key>_nao.jpg  R,G = tangent normal XY (Z is rebuilt in the shader), B = AO; 4:4:4 so channels don't bleed
Run after import_assets.py; the unpacked source maps are removed afterwards so they don't ship.
"""
import os
import numpy as np
from PIL import Image

TX = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures', 'ext')
for key in ('track', 'gravel', 'burnt', 'cliff'):
    a = Image.open(f'{TX}/{key}_albedo.jpg').convert('RGB')
    size = a.size
    n = np.asarray(Image.open(f'{TX}/{key}_normal.jpg').convert('RGB').resize(size))
    o = np.asarray(Image.open(f'{TX}/{key}_orm.jpg').convert('RGB').resize(size))
    Image.fromarray(np.dstack([np.asarray(a), o[..., 1]]), 'RGBA').save(f'{TX}/{key}_ar.webp', quality=90, method=4)
    Image.fromarray(np.dstack([n[..., 0], n[..., 1], o[..., 0]])).save(f'{TX}/{key}_nao.jpg', quality=92, subsampling=0)
    for part in ('albedo', 'normal', 'orm'):
        os.remove(f'{TX}/{key}_{part}.jpg')
    print(key, size)
