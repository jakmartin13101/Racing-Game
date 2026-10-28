"""Converts the CC0 Poly Haven / ambientCG downloads into web-ready maps.

Writes public/textures/ext/<key>_{albedo,normal,orm}.jpg (ORM = AO, rough, metal),
public/textures/ext/lava_heat.jpg, public/env/sky.hdr (2k) and copies the
rock / prop glTF models to public/models/env/.

    /opt/bpyenv/bin/python tools/import_assets.py   (ASSETS=/path/to/assets)
"""
import json
import os
import shutil
import numpy as np
from PIL import Image

A = os.environ.get('ASSETS', '/tmp/assets')
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
TX = os.path.join(ROOT, 'textures', 'ext')
os.makedirs(TX, exist_ok=True)

PH = f'{A}/polyhaven/textures'
CG = f'{A}/ambientcg'

SETS = {
    # key: (albedo, normal_gl, rough, ao, size)
    'track': (f'{PH}/aerial_mud_1/aerial_mud_1_diff_2k.jpg', f'{PH}/aerial_mud_1/aerial_mud_1_nor_gl_2k.jpg',
              f'{PH}/aerial_mud_1/aerial_mud_1_rough_2k.jpg', f'{PH}/aerial_mud_1/aerial_mud_1_ao_2k.jpg', 2048),
    'gravel': (f'{CG}/Gravel024/Gravel024_2K-JPG_Color.jpg', f'{CG}/Gravel024/Gravel024_2K-JPG_NormalGL.jpg',
               f'{CG}/Gravel024/Gravel024_2K-JPG_Roughness.jpg', f'{CG}/Gravel024/Gravel024_2K-JPG_AmbientOcclusion.jpg', 2048),
    'burnt': (f'{PH}/burned_ground_01/burned_ground_01_diff_2k.jpg', f'{PH}/burned_ground_01/burned_ground_01_nor_gl_2k.jpg',
              f'{PH}/burned_ground_01/burned_ground_01_rough_2k.jpg', f'{PH}/burned_ground_01/burned_ground_01_ao_2k.jpg', 1024),
    'cliff': (f'{CG}/Rock031/Rock031_2K-JPG_Color.jpg', f'{CG}/Rock031/Rock031_2K-JPG_NormalGL.jpg',
              f'{CG}/Rock031/Rock031_2K-JPG_Roughness.jpg', f'{CG}/Rock031/Rock031_2K-JPG_AmbientOcclusion.jpg', 2048),
    'lava': (f'{CG}/Lava002/Lava002_2K-JPG_Color.jpg', f'{CG}/Lava002/Lava002_2K-JPG_NormalGL.jpg',
             f'{CG}/Lava002/Lava002_2K-JPG_Roughness.jpg', None, 1024),
    'rust': (f'{PH}/rusty_metal_02/rusty_metal_02_diff_2k.jpg', f'{PH}/rusty_metal_02/rusty_metal_02_nor_gl_2k.jpg',
             f'{PH}/rusty_metal_02/rusty_metal_02_rough_2k.jpg', None, 1024),
    'shed': (f'{CG}/CorrugatedSteel007A/CorrugatedSteel007A_2K-JPG_Color.jpg',
             f'{CG}/CorrugatedSteel007A/CorrugatedSteel007A_2K-JPG_NormalGL.jpg',
             f'{CG}/CorrugatedSteel007A/CorrugatedSteel007A_2K-JPG_Roughness.jpg', None, 1024),
}


def load(p, size, mode='RGB'):
    return Image.open(p).convert(mode).resize((size, size), Image.LANCZOS)


for key, (al, nm, ro, ao, size) in SETS.items():
    load(al, size).save(f'{TX}/{key}_albedo.jpg', quality=88)
    load(nm, size).save(f'{TX}/{key}_normal.jpg', quality=90)
    r = np.asarray(load(ro, size, 'L'))
    o = np.asarray(load(ao, size, 'L')) if ao else np.full_like(r, 255)
    m = np.zeros_like(r)
    if key in ('rust', 'shed'):
        m[:] = 160
    Image.fromarray(np.stack([o, r, m], -1)).save(f'{TX}/{key}_orm.jpg', quality=90)
    print('set', key)

e = load(f'{CG}/Lava002/Lava002_2K-JPG_Emission.jpg', 1024, 'L')
e.save(f'{TX}/lava_heat.jpg', quality=92)
e2 = load(f'{CG}/Lava004/Lava004_2K-JPG_Color.jpg', 1024)
e2.save(f'{TX}/lava_molten.jpg', quality=90)

# --- HDRI -> 2k radiance HDR + sun direction
import bpy  # noqa: E402
img = bpy.data.images.load(f'{A}/polyhaven/hdri/clarens_midday/clarens_midday_4k.hdr')
w, h = img.size
px = np.empty(w * h * 4, np.float32)
img.pixels.foreach_get(px)
px = px.reshape(h, w, 4)
lum = px[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
y, x = np.unravel_index(np.argmax(lum), lum.shape)
# blender pixels are bottom-up: row 0 = bottom of the panorama
v = 1 - (y + 0.5) / h
u = (x + 0.5) / w
elev = (0.5 - v) * 180.0
azim = u * 360.0
print('sun pixel', x, y, 'elev', elev, 'u', u)
img.scale(2048, 1024)
os.makedirs(f'{ROOT}/env', exist_ok=True)
img.filepath_raw = f'{ROOT}/env/sky.hdr'
img.file_format = 'HDR'
img.save()
json.dump({'u': float(u), 'v': float(v), 'elev': float(elev)}, open(f'{ROOT}/env/sky.json', 'w'))

# models: see tools/decimate_props.py (reads the downloaded glTFs, writes *_lod.glb)
