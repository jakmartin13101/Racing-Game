# usage: python3 tools/kaiele_coast_tex.py public/textures/kaiele/coast   (reads the CC0 pack under /mnt/project-files/assets/)
"""Kai'ele coast set-piece textures -> game/public/textures/kaiele/coast/<key>_{albedo,normal,orm}.jpg
ORM = (ambient occlusion, roughness, metalness). Rusted tin = corrugated sheet relief with rust colour mixed in."""
import os, sys
import numpy as np
from PIL import Image
A = '/mnt/project-files/assets/'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def ld(p, size, mode='RGB'):
    return Image.open(p).convert(mode).resize((size, size), Image.LANCZOS)


def save(key, alb, nor, ao, rough, metal, q=84):
    alb.save(f'{OUT}/{key}_albedo.jpg', quality=q)
    nor.save(f'{OUT}/{key}_normal.jpg', quality=q)
    Image.fromarray(np.stack([np.asarray(ao), np.asarray(rough), np.asarray(metal)], -1).astype(np.uint8)).save(f'{OUT}/{key}_orm.jpg', quality=q)


# corrugated steel (painted, worn) and a rusted version of the same sheet
cs = A + 'ambientcg/CorrugatedSteel007A/CorrugatedSteel007A_2K-JPG_'
S = 1024
alb = ld(cs + 'Color.jpg', S)
# neutral paint: keep the sheet's shading but drop the blue so vertex colours pick each roof's paint
g = np.asarray(alb.convert('L')).astype(float)
alb = Image.fromarray(np.clip(np.stack([g, g, g], -1) * 1.25, 0, 255).astype(np.uint8))
nor = ld(cs + 'NormalGL.jpg', S)
ao = ld(cs + 'AmbientOcclusion.jpg', S, 'L'); ro = ld(cs + 'Roughness.jpg', S, 'L'); me = ld(cs + 'Metalness.jpg', S, 'L')
save('tin', alb, nor, ao, ro, me)
rm = A + 'polyhaven/textures/rust_coarse_01/rust_coarse_01_'
rust = np.asarray(ld(rm + 'diff_2k.jpg', S)).astype(float)
rro = np.asarray(ld(rm + 'rough_2k.jpg', S, 'L')).astype(float)
# rust streaks run down the sheet: blend by a vertical-streak noise so patches of paint remain
rng = np.random.default_rng(3)
from scipy.ndimage import gaussian_filter
# tileable: wrap-filtered noise, stretched down the sheet like water-run rust, plus fine pitting
st = gaussian_filter(rng.random((S, S)), (60, 18), mode='wrap')
st = (st - st.min()) / (st.max() - st.min())
st = np.clip(st + (gaussian_filter(rng.random((S, S)), 3, mode='wrap') - 0.5) * 0.8, 0, 1)
k = np.clip((st - 0.5) * 3.0, 0, 1)[..., None]
a0 = np.asarray(alb).astype(float)
ralb = a0 * (1 - k) * 0.85 + rust * k
save('rtin', Image.fromarray(ralb.astype(np.uint8)), nor, ao,
     Image.fromarray((np.asarray(ro) * (1 - k[..., 0]) + rro * k[..., 0]).astype(np.uint8)),
     Image.fromarray((np.asarray(me) * (1 - k[..., 0]) * 0.8).astype(np.uint8)))
# painted metal for water tanks, sign boards
pm = A + 'ambientcg/PaintedMetal006/PaintedMetal006_2K-JPG_'
S2 = 512
save('pmetal', ld(pm + 'Color.jpg', S2), ld(pm + 'NormalGL.jpg', S2), ld(pm + 'AmbientOcclusion.jpg', S2, 'L'),
     ld(pm + 'Roughness.jpg', S2, 'L'), ld(pm + 'Metalness.jpg', S2, 'L'))
# dark basalt for the arch, sea stacks, ledges and dry-stone walls
dr = A + 'polyhaven/textures/dark_rock_02/dark_rock_02_'
save('basalt', ld(dr + 'diff_2k.jpg', S), ld(dr + 'nor_gl_2k.jpg', S), ld(dr + 'ao_2k.jpg', S, 'L'),
     ld(dr + 'rough_2k.jpg', S, 'L'), Image.new('L', (S, S), 0))
# painted weatherboards for the shack walls: the plank relief of weathered_planks under a pale, flaking coat
# (vertex colours give each shack its faded paint); raw timber decks use ext/v_wood
wp = A + 'polyhaven/textures/weathered_planks/weathered_planks_'
L = np.asarray(ld(wp + 'diff_2k.jpg', S, 'L')).astype(float)
L = L / L.mean()
paint = np.clip(0.82 + 0.22 * (L - 1), 0, 1)
bare = gaussian_filter(rng.random((S, S)), (30, 4), mode="wrap")
bare = np.clip((bare - np.percentile(bare, 88)) * 40, 0, 1) # flaked patches showing grey wood
g = paint * (1 - bare) + (0.45 * L) * bare
alb = np.stack([g * 236, g * 232, g * 224], -1)
save('boards', Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8)), ld(wp + 'nor_gl_2k.jpg', S), ld(wp + 'ao_2k.jpg', S, 'L'),
     ld(wp + 'rough_2k.jpg', S, 'L'), Image.new('L', (S, S), 0))
with open(f'{OUT}/LICENSE.txt', 'w') as f:
    f.write('All textures here are CC0 1.0 (public domain), resized and repacked (ORM = AO, roughness, metalness).\n'
            'tin, rtin: ambientCG CorrugatedSteel007A (https://ambientcg.com/view?id=CorrugatedSteel007A), rtin mixed with Poly Haven rust_coarse_01\n'
            'pmetal: ambientCG PaintedMetal006 (https://ambientcg.com/view?id=PaintedMetal006)\n'
            'basalt: Poly Haven dark_rock_02 (https://polyhaven.com/a/dark_rock_02)\n'
            'boards: Poly Haven weathered_planks (https://polyhaven.com/a/weathered_planks), repainted\n')
print(sorted(os.listdir(OUT)))
