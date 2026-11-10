"""Village texture sets from the Poly Haven pack -> public/textures/ext/v_<key>_{albedo,normal,orm}.jpg (1K).

    ASSETS=/path/to/assets /opt/bpyenv/bin/python tools/import_village.py
"""
import os
import numpy as np
from PIL import Image

A = os.environ.get('ASSETS', '/tmp/assets')
PH = f'{A}/polyhaven/textures'
TX = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures', 'ext')
SETS = {'plaster': 'plastered_wall_02', 'paint': 'painted_plaster_wall', 'brick': 'whitewashed_brick',
        'roof': 'roof_tiles_14', 'roof2': 'roof_09', 'tin': 'corrugated_iron', 'wood': 'weathered_planks',
        'cobble': 'cobblestone_floor_08', 'concrete': 'concrete_wall_008'}
SIZE = 1024
for key, src in SETS.items():
    p = f'{PH}/{src}/{src}'
    ld = lambda s, m='RGB': Image.open(f'{p}_{s}_2k.jpg').convert(m).resize((SIZE, SIZE), Image.LANCZOS)
    ld('diff').save(f'{TX}/v_{key}_albedo.jpg', quality=86)
    ld('nor_gl').save(f'{TX}/v_{key}_normal.jpg', quality=88)
    r = np.asarray(ld('rough', 'L'))
    o = np.asarray(ld('ao', 'L')) if os.path.exists(f'{p}_ao_2k.jpg') else np.full_like(r, 255)
    m = np.full_like(r, 150 if key == 'tin' else 0)
    Image.fromarray(np.stack([o, r, m], -1)).save(f'{TX}/v_{key}_orm.jpg', quality=88)
    print(key)
