"""Texture atlases for Kai'ele's plants (src/kaiele/plants.js maps the cells), built from photographed CC0 leaves.

The leaves are ambientCG leaf and grass atlases (scanned leaves with opacity): each one is cut out, recoloured to
the plant's palette (the photo keeps its veins, gloss and blemishes) and stamped into the plant's card, back to
front, with the inner leaves shaded. The sources download into a cache on first run (KAIELE_LEAF_SRC, default
/tmp/kaiele_leafsrc); nothing from it is committed except the finished atlases.

foliage.webp (2048, RGBA; foliage_1k.webp for low settings): alpha-cut cards, base of each leaf at the bottom of its cell
  x0    y0    w    h     cell
  0     0     512  1024  palm frond, fresh                 0     1024  512  1024  palm frond, old / drying
  512   0     512  1024  tree fern frond (hapu'u)           512   1024  512  1024  banana leaf, torn along the veins
  1024  0     512  512   canopy leaf spray, dark           1536  0     512  512   canopy leaf spray, pale (kukui)
  1024  512   512  512   monstera leaf                     1536  512   512  512   ti plant fan
  1024  1024  512  512   grass tuft                        1536  1024  512  512   naupaka rosette cluster
  1024  1536  512  512   bamboo leaf spray                 1536  1536  256  512   hanging vine (pothos)
  1792  1536  256  512   red ginger
bark.jpg + bark_n.jpg (1024): eight 128 px strips that tile both ways round a trunk:
  palm (grey, ringed), rainforest bark (photo), tree fern trunk, bamboo, banana stem, coconut husk, root / branch
  (photo), dry sheath

    python tools/kaiele_plants.py
"""
import os
import glob
import subprocess
import zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures', 'kaiele', 'plants')
SRC = os.environ.get('KAIELE_LEAF_SRC', '/tmp/kaiele_leafsrc')
os.makedirs(OUT, exist_ok=True)
SS = 2  # supersampling

# ambientCG sets: (id, resolution, how the leaves lie in the atlas: 'up' base at the bottom, 'right' base at the left)
SETS = {
    'LeafSet001': 'up', 'LeafSet004': 'up', 'LeafSet013': 'up', 'LeafSet014': 'up', 'LeafSet018': 'up',
    'LeafSet022': 'up', 'LeafSet023': 'right', 'LeafSet024': 'up', 'Foliage001': 'up', 'Foliage002': 'up',
    'Foliage006': 'up', 'Foliage007': 'up', 'Foliage008': 'right',
}
BARKS = ['Bark007', 'Bark001']


def fetch(name, res):
    d = f'{SRC}/{name}'
    if not glob.glob(f'{d}/*_Color.*'):
        os.makedirs(d, exist_ok=True)
        z = f'{SRC}/{name}_{res}.zip'
        if not os.path.exists(z):
            subprocess.run(['curl', '-sS', '-L', '-m', '600', '-o', z, f'https://ambientcg.com/get?file={name}_{res}.zip'], check=True)
        zipfile.ZipFile(z).extractall(d)
    return d


def fnoise(h, w, beta=2.0, seed=0, lo=1.0):
    """periodic fractal noise 0..1"""
    r = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1
    amp = 1 / f ** (beta / 2 + 0.5)
    amp[f < lo] = 0
    n = np.real(np.fft.ifft2(amp * np.exp(1j * r.uniform(0, 6.283, (h, w)))))
    n -= n.min()
    return n / n.max()


# ------------------------------------------------------------------ the leaves
def load_sprites():
    """every leaf of every set, cut out, base at the bottom, as float RGBA arrays (0..1)"""
    out = {}
    for name, lie in SETS.items():
        d = fetch(name, '1K-PNG')
        col = np.asarray(Image.open(glob.glob(f'{d}/*_Color.png')[0]).convert('RGB')).astype(np.float32) / 255
        op = np.asarray(Image.open(glob.glob(f'{d}/*_Opacity.png')[0]).convert('L')).astype(np.float32) / 255
        lab, _ = ndimage.label(ndimage.binary_dilation(op > 0.25, iterations=3))
        sp = []
        for s in ndimage.find_objects(lab):
            if (lab[s] > 0).sum() < 800:
                continue
            a = np.concatenate([col[s], op[s][..., None]], -1)
            if lie == 'right':
                a = np.rot90(a, 1)
            sp.append(Image.fromarray((a * 255).astype(np.uint8), 'RGBA'))
        out[name] = sp
        print('leaves', name, len(sp))
    return out


def recolor(img, target, k=1.0):
    """scale the photo's colour so its mean over the leaf is target (0..255); the veins and gloss stay"""
    a = np.asarray(img).astype(np.float32)
    m = a[..., 3] > 128
    if not m.any():
        return img
    mean = a[..., :3][m].mean(0)
    lum = a[..., :3].mean(-1, keepdims=True) / max(1, mean.mean())
    # luminance detail times the target colour, blended with a straight channel rescale
    rgb = lum * np.array(target) * k
    rgb = rgb * 0.75 + a[..., :3] * (np.array(target) / np.maximum(mean, 1)) * k * 0.25
    a[..., :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def stamp(dst, spr, base, ang, L, W, tint=None, k=1.0):
    """spr scaled to W x L, base (bottom centre) at base, turned clockwise by ang (0 = up), tinted"""
    L, W = max(2, int(L)), max(2, int(W))
    s = spr.resize((W, L), Image.LANCZOS)
    if tint is not None:
        s = recolor(s, tint, k)
    s = s.rotate(-np.degrees(ang), resample=Image.BICUBIC, expand=True)
    off = np.array([-L / 2 * np.sin(ang), L / 2 * np.cos(ang)])
    p = np.array(base) - (np.array(s.size) / 2 + off)
    x, y = int(round(p[0])), int(round(p[1]))
    # clip to the canvas
    x0, y0 = max(0, -x), max(0, -y)
    x1, y1 = min(s.size[0], dst.size[0] - x), min(s.size[1], dst.size[1] - y)
    if x1 <= x0 or y1 <= y0:
        return
    dst.alpha_composite(s.crop((x0, y0, x1, y1)), (x + x0, y + y0))


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def shade(c, k):
    return tuple(v * k for v in c)


def finish(img, noise_amt=0.06, seed=1):
    """a little colour noise, then push colour out under the transparent texels so mipmaps don't fringe"""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    n = fnoise(h, w, 1.6, seed)
    a[..., :3] *= (1 - noise_amt / 2 + noise_amt * n)[..., None]
    alpha = a[..., 3:4] / 255
    rgb = a[..., :3]
    fill = rgb * alpha
    acc_c, acc_w = np.zeros_like(rgb), np.zeros_like(alpha)
    for r in (2, 6, 16, 40, 100):
        bc = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))).astype(np.float32)
        bw = np.asarray(Image.fromarray((alpha[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))).astype(np.float32)[..., None] / 255
        m = (acc_w < 1e-3) & (bw > 1e-3)
        acc_c = np.where(m, bc / np.maximum(bw, 1e-3), acc_c)
        acc_w = np.where(m, 1, acc_w)
    out = np.where(alpha > 0.5, rgb, acc_c)
    out = np.concatenate([np.clip(out, 0, 255), a[..., 3:4]], -1).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def canvas(w, h):
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def down(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def photo_fill(spr, w, h, target):
    """the inside of a big photographed leaf stretched over w x h: the surface for a leaf shape cut by hand"""
    a = np.asarray(spr)
    m = a[..., 3] > 250
    ys, xs = np.nonzero(m)
    cy, cx = int(ys.mean()), int(xs.mean())
    hh, hw = int((ys.max() - ys.min()) * 0.3), int((xs.max() - xs.min()) * 0.18)
    crop = spr.crop((cx - hw, cy - hh, cx + hw, cy + hh)).convert('RGBA')
    crop.putalpha(255)
    return recolor(crop.resize((w, h), Image.LANCZOS), target)


# ------------------------------------------------------------------ cells
def palm_frond(S, old=False, seed=0):
    """a coconut frond: about seventy narrow leaflets a side off a stout rachis, angled towards the tip"""
    W, H = 512 * SS, 1024 * SS
    img, dr = canvas(512, 1024)
    r = np.random.default_rng(seed)
    cx = W / 2
    blades = S['Foliage008'] + S['Foliage001'][:6]
    base_g = (96, 128, 40) if not old else (128, 124, 52)
    for side in (-1, 1):
        t = 0.04
        while t < 0.985:
            y = H * (1 - t)
            Lr = np.sin(np.pi * (0.12 + 0.88 * t)) ** 0.55 * (1 - 0.35 * t ** 3)
            dev = np.radians(r.uniform(46, 60) - 18 * t)
            L = Lr * (W / 2 * 0.97) / np.sin(dev) * r.uniform(0.85, 1.0)
            if old and r.random() < 0.2:
                L *= r.uniform(0.35, 0.7)
            if r.random() > (0.04 if not old else 0.12):
                col = mix(base_g, (150, 158, 70), r.uniform(0, 0.35))
                if old and r.random() < 0.4:
                    col = mix(col, (150, 112, 52), r.uniform(0.4, 0.9))
                # leaflets nearer the back of the stack (drawn first) a shade darker
                col = shade(col, r.uniform(0.8, 1.05))
                stamp(img, blades[r.integers(len(blades))], (cx + side * 5 * SS * (1 - t), y), side * dev, L, L * r.uniform(0.045, 0.06) + 3 * SS, col)
            t += r.uniform(0.012, 0.017)
    # rachis: pale, stout at the base
    pts = [(cx, H * (1 - k / 40)) for k in range(41)]
    for k in range(40):
        wdt = int((15 - 12 * k / 40) * SS)
        c = (176, 166, 96) if not old else (178, 150, 84)
        dr.line([pts[k], pts[k + 1]], fill=tuple(int(v * (0.9 + 0.1 * np.sin(k))) for v in c) + (255,), width=wdt)
    return finish(down(img, 512, 1024), 0.08, seed + 3)


def fern_frond(S, seed=0):
    """hapu'u: twice-cut frond, pinnae of small photographed leaflets"""
    W, H = 512 * SS, 1024 * SS
    img, dr = canvas(512, 1024)
    r = np.random.default_rng(seed)
    cx = W / 2
    small = [s.resize((s.size[0] // 4, s.size[1] // 4), Image.LANCZOS) for s in S['LeafSet013'] + S['LeafSet018']]
    t = 0.04
    while t < 0.97:
        y = H * (1 - t)
        Lr = np.sin(np.pi * (0.1 + 0.9 * t) ** 0.9) * (1 - 0.6 * t ** 2.5)
        for side in (-1, 1):
            ang = side * np.radians(r.uniform(62, 74) - 15 * t)
            L = Lr * W / 2 * 0.95 / np.sin(abs(ang))
            d = np.array([np.sin(ang), -np.cos(ang)])
            p0 = np.array((cx, y))
            col = mix((70, 118, 34), (128, 166, 58), r.uniform(0, 0.3) + 0.25 * t)
            dr.line([tuple(p0), tuple(p0 + d * L * 0.97)], fill=(92, 112, 44, 255), width=2 * SS)
            k = 0.05
            while k < 0.97:
                q = p0 + d * L * k
                pl = L * 0.17 * (1 - k) ** 0.6 + 3 * SS
                for s2 in (-1, 1):
                    stamp(img, small[r.integers(len(small))], tuple(q), ang + s2 * np.radians(72 - 20 * k), pl, pl * 0.38, shade(col, r.uniform(0.85, 1.1)))
                k += 0.05
        t += r.uniform(0.032, 0.04)
    dr.line([(cx, H), (cx, H * 0.03)], fill=(96, 80, 44, 255), width=5 * SS)
    return finish(down(img, 512, 1024), 0.06, seed + 5)


def banana_leaf(S, seed=0):
    """an oblong blade, the photo leaf's surface stretched over it, torn along the side veins"""
    W, H = 512 * SS, 1024 * SS
    r = np.random.default_rng(seed)
    cx = W / 2
    top, bot = H * 0.02, H * 0.97
    surf = np.asarray(photo_fill(S['LeafSet018'][0], W, H, (104, 150, 48))).astype(np.float32)
    mask = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mask)
    for side in (-1, 1):
        pts = [(cx, bot)]
        for k in range(41):
            t = k / 40
            w = min(1, (t / 0.06) ** 0.5) * (1 - t ** 9) ** 0.5 * W * 0.46
            pts.append((cx + side * w, bot - (bot - top) * t))
        pts.append((cx, top))
        md.polygon(pts, fill=255)
    yy, xx = np.mgrid[0:H, 0:W]
    dx = np.abs(xx - cx)
    # the right half a little darker (the blade folds along the midrib), fine parallel side veins
    surf[..., :3] *= np.where(xx > cx, 0.88, 1.0)[..., None]
    vein = np.abs(np.sin((yy + dx * 0.55) / (8 * SS) * np.pi)) < 0.15
    surf[..., :3] *= np.where(vein, 1.1, 1.0)[..., None]
    a = np.asarray(mask).copy()
    for side in (-1, 1):
        for _ in range(r.integers(6, 11)):
            y0 = r.uniform(top + 60, bot - 80)
            reach = r.uniform(0.25, 0.98)
            m = (np.abs((yy + dx * 0.55) - (y0 + W * 0.46 * 0.55)) < r.uniform(2.5, 5.0) * SS) & (dx > W * 0.46 * (1 - reach)) & (np.sign(xx - cx) == side)
            a[m] = 0
    edge = (np.asarray(Image.fromarray(a).filter(ImageFilter.MinFilter(9))) < 128) & (a > 0)
    surf[..., :3] = np.where(edge[..., None], surf[..., :3] * 0.5 + np.array([72, 56, 26]), surf[..., :3])
    surf[..., 3] = a
    img = Image.fromarray(np.clip(surf, 0, 255).astype(np.uint8), 'RGBA')
    ImageDraw.Draw(img).line([(cx, H), (cx, top + 10)], fill=(178, 188, 112, 255), width=9 * SS)
    return finish(down(img, 512, 1024), 0.05, seed + 7)


def spray(S, sets, greens, seed, n_twigs=15, per=9, Lk=(0.1, 0.16), Wk=0.5, pale=False):
    """a leaf spray seen from anywhere: twigs out from the middle, leaves alternating along them; the inner and
    back leaves drawn first and darker, so the card has depth and a ragged outline"""
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    c = np.array([W / 2, W / 2])
    pool = [s for k in sets for s in S[k]]
    leaves = []
    for tw in range(n_twigs):
        a0 = tw / n_twigs * 6.283 + r.uniform(-0.3, 0.3)
        Lt = W * r.uniform(0.18, 0.42)
        d = np.array([np.cos(a0), np.sin(a0)])
        p1 = c + d * Lt
        dr.line([tuple(c), tuple(p1)], fill=(78, 64, 44, 255), width=3 * SS)
        for k in range(per):
            t = 0.15 + 0.85 * k / per
            q = c + d * Lt * t
            side = 1 if k % 2 else -1
            ang = np.arctan2(d[0], -d[1]) + side * r.uniform(0.5, 1.3) * (1 - 0.5 * t)
            L = W * r.uniform(*Lk) * (0.75 + 0.35 * t)
            depth = t * 0.6 + r.random() * 0.4
            leaves.append((depth, q, ang, L))
        # a leaf at the tip
        leaves.append((1.0, p1, np.arctan2(d[0], -d[1]), W * Lk[1]))
    leaves.sort(key=lambda e: e[0])
    for depth, q, ang, L in leaves:
        spr = pool[r.integers(len(pool))]
        asp = spr.size[0] / spr.size[1]
        g = greens[r.integers(len(greens))]
        stamp(img, spr, tuple(q), ang, L, L * asp * Wk / 0.5, shade(g, 0.62 + 0.45 * depth))
    return finish(down(img, 512, 512), 0.06, seed + 11)


def monstera(S, seed=0):
    W = 512 * SS
    r = np.random.default_rng(seed)
    cx, cy = W / 2, W * 0.52
    surf = np.asarray(photo_fill(S['LeafSet004'][1], W, W, (40, 92, 32))).astype(np.float32)
    mask = Image.new('L', (W, W), 0)
    pts = []
    for k in range(80):
        a = k / 80 * 6.283
        rad = W * 0.45 * (1 - 0.18 * np.cos(a) ** 2) * (1 - 0.25 * max(0, np.cos(a - np.pi / 2)) ** 8)
        pts.append((cx + np.cos(a) * rad * 0.92, cy + np.sin(a) * rad))
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    a = np.asarray(mask).copy()
    yy, xx = np.mgrid[0:W, 0:W]
    ang = np.arctan2(yy - cy, xx - cx)
    rr = np.hypot(xx - cx, yy - cy) / (W * 0.45)
    surf[..., :3] *= np.where(xx > cx, 0.85, 1.0)[..., None]
    # splits from the edge towards the midrib and two rows of holes between them
    sp = np.abs(np.sin(ang * 9 + r.uniform(-0.1, 0.1))) < 0.05 + 0.09 * rr
    a[sp & (rr > 0.55)] = 0
    a[(np.abs(np.sin(ang * 9 + np.pi / 2)) < 0.25) & (np.abs(rr - 0.38) < 0.05)] = 0
    vein = (np.abs(np.sin(ang * 9 + np.pi / 2)) < 0.04) & (a > 0)
    surf[..., :3] = np.where(vein[..., None], surf[..., :3] * 1.3, surf[..., :3])
    surf[..., 3] = a
    img = Image.fromarray(np.clip(surf, 0, 255).astype(np.uint8), 'RGBA')
    ImageDraw.Draw(img).line([(cx, W), (cx, cy - W * 0.4)], fill=(76, 116, 48, 255), width=6 * SS)
    return finish(down(img, 512, 512), 0.05, seed + 13)


def ti_plant(S, seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    p = (W / 2, W * 0.99)
    pool = S['LeafSet018'] + S['LeafSet013']
    for k in range(24):
        ang = np.radians(r.uniform(-68, 68))
        L = W * r.uniform(0.55, 0.95) * (1 - 0.3 * abs(ang))
        g = mix((56, 112, 38), (120, 60, 64), 0.55 * r.random()) if r.random() < 0.4 else mix((56, 112, 38), (140, 168, 70), r.uniform(0, 0.3))
        stamp(img, pool[r.integers(len(pool))], p, ang, L, L * 0.17, shade(g, r.uniform(0.75, 1.05)))
    return finish(down(img, 512, 512), 0.05, seed + 17)


def grass(S, seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    blades = S['Foliage001'] + S['Foliage006'] + S['Foliage007']
    heads = S['Foliage002']
    for k in range(110):
        x0 = W * (0.12 + 0.76 * r.random())
        h = W * r.uniform(0.45, 0.98)
        lean = r.uniform(-0.45, 0.45) * (abs(x0 - W / 2) / (W / 2) + 0.4)
        c = mix((70, 108, 34), (170, 166, 84), r.random() ** 2)
        spr = (heads if k % 23 == 0 else blades)[r.integers(len(heads) if k % 23 == 0 else len(blades))]
        asp = spr.size[0] / spr.size[1]
        stamp(img, spr, (x0, W * 0.995), lean, h, max(6 * SS, h * asp), shade(c, 0.65 + 0.4 * k / 110))
    return finish(down(img, 512, 512), 0.06, seed + 19)


def naupaka(S, seed=0):
    """a round cluster of fleshy rosettes (glossy obovate leaves with a pale midrib) and white half-flowers"""
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    pool = S['LeafSet022']
    for layer in range(3):
        for _ in range(30):
            # rosettes over a disc (the card is used all round a mound), outer ones on top
            a, rad = r.uniform(0, 6.283), W * 0.4 * np.sqrt(r.uniform(0.0 if layer < 2 else 0.3, 1))
            x, y = W / 2 + np.cos(a) * rad, W / 2 + np.sin(a) * rad
            for k in range(8):
                ang = k / 8 * 6.283 + r.uniform(-0.3, 0.3)
                L = W * r.uniform(0.08, 0.12)
                g = mix((80, 132, 44), (150, 176, 80), r.uniform(0, 0.4))
                stamp(img, pool[r.integers(len(pool))], (x, y), ang, L, L * 0.45, shade(g, 0.6 + 0.2 * layer))
            if layer == 2 and r.random() < 0.5:
                for k in range(3):
                    q = (x + r.uniform(-15, 15) * SS, y + r.uniform(-15, 15) * SS)
                    stamp(img, pool[r.integers(len(pool))], q, r.uniform(-1.2, 1.2), 10 * SS, 7 * SS, (236, 234, 224))
    return finish(down(img, 512, 512), 0.05, seed + 23)


def bamboo_spray(S, seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    pool = S['LeafSet013']
    for _ in range(24):
        p0 = np.array([W * r.uniform(0.25, 0.75), W * r.uniform(0.3, 0.9)])
        a0 = r.uniform(-1.4, 1.4)
        d = np.array([np.sin(a0), -np.cos(a0) * 0.6])
        p1 = p0 + d * W * r.uniform(0.1, 0.22)
        dr.line([tuple(p0), tuple(p1)], fill=(112, 120, 62, 255), width=2 * SS)
        for k in range(6):
            q = p0 + (p1 - p0) * (k / 6 + 0.1)
            ang = a0 + np.pi / 2 * (1 if k % 2 else -1) * r.uniform(0.6, 1.3) + 0.6
            L = W * r.uniform(0.1, 0.17)
            stamp(img, pool[r.integers(len(pool))], tuple(q), ang, L, L * 0.16, mix((88, 132, 44), (150, 166, 76), r.uniform(0, 0.4)))
    return finish(down(img, 512, 512), 0.05, seed + 29)


def vine(S, seed=0):
    W, H = 256 * SS, 512 * SS
    img, dr = canvas(256, 512)
    r = np.random.default_rng(seed)
    pts = [(W / 2 + np.sin(k * 0.21) * W * 0.12 + r.uniform(-2, 2), H * k / 60) for k in range(61)]
    dr.line(pts, fill=(84, 78, 46, 255), width=3 * SS)
    pool = S['LeafSet004']
    for k in range(3, 60, 2):
        side = 1 if (k // 2) % 2 else -1
        L = W * r.uniform(0.2, 0.32) * (0.6 + 0.4 * (1 - k / 60))
        stamp(img, pool[r.integers(len(pool))], pts[k], side * np.radians(r.uniform(100, 150)), L, L * 0.6, mix((48, 100, 32), (110, 150, 52), r.random() * 0.5))
    return finish(down(img, 256, 512), 0.05, seed + 31)


def ginger(S, seed=0):
    W, H = 256 * SS, 512 * SS
    img, dr = canvas(256, 512)
    r = np.random.default_rng(seed)
    pool = S['LeafSet018']
    for s in range(3):
        x = W * (0.3 + 0.2 * s)
        top = H * r.uniform(0.08, 0.3)
        dr.line([(x, H), (x, top)], fill=(70, 100, 40, 255), width=3 * SS)
        for k in range(9):
            y = top + (H - top) * (0.15 + 0.08 * k)
            side = 1 if k % 2 else -1
            L = W * r.uniform(0.35, 0.5)
            stamp(img, pool[r.integers(len(pool))], (x, y), side * np.radians(r.uniform(35, 60)), L, L * 0.22, mix((50, 106, 36), (112, 148, 52), r.random() * 0.4))
        # red bract cone on top
        for k in range(14):
            y = top - k * 4.5 * SS
            ww = (14 - k) * 1.3 * SS
            c = tuple(int(np.clip(v + r.uniform(-18, 18), 0, 255)) for v in (200, 26, 36))
            dr.ellipse([x - ww, y - 6 * SS, x + ww, y + 6 * SS], fill=c + (255,))
    return finish(down(img, 256, 512), 0.08, seed + 37)


# ------------------------------------------------------------------ bark strips (each tiles both ways)
def photo_strip(name, k_bright=1.0, sat=1.0):
    """a tiling photographed bark squeezed into a 128 x 1024 strip (twice down its length, so it still tiles)"""
    d = fetch(name, '1K-JPG')
    c = Image.open(glob.glob(f'{d}/*_Color.jpg')[0]).convert('RGB').resize((128, 512), Image.LANCZOS)
    n = Image.open(glob.glob(f'{d}/*_NormalGL.jpg')[0]).convert('RGB').resize((128, 512), Image.LANCZOS)
    c = np.asarray(c).astype(np.float32)
    g = c.mean(-1, keepdims=True)
    c = (g + (c - g) * sat) * k_bright
    n = np.asarray(n).astype(np.float32) / 127.5 - 1
    # the strip is squeezed across: steepen the normals that way to keep the relief
    n[..., 0] *= 2.0
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.concatenate([c, c]), np.concatenate([n, n])


def bark_strips():
    H, Wd = 1024, 128
    alb = np.zeros((H, Wd * 8, 3), np.float32)
    nrm = np.zeros((H, Wd * 8, 3), np.float32)
    yy, xx = np.mgrid[0:H, 0:Wd]
    for k in range(8):
        n1 = fnoise(H, Wd, 2.0, 100 + k)
        n2 = fnoise(H, Wd, 1.2, 200 + k)
        fib = fnoise(H, Wd, 1.0, 300 + k)
        vf = np.repeat(fnoise(H // 16, Wd, 1.4, 400 + k), 16, 0)
        h = None
        if k == 0:    # coconut palm: smooth pale grey, close leaf-scar rings, fine vertical cracks
            pc, pn = photo_strip('Bark007', 1.05, 0.15)
            ph = (fnoise(H, 1, 1.0, 900)[:, 0] * 40 + yy[:, 0] * 0)[:, None]
            per = 13 + 5 * fnoise(H, 1, 1.5, 901)[:, :1]
            ring = np.abs(np.sin((yy + n1 * 6 + ph) / per * np.pi)) ** 10 * (0.35 + 0.65 * fnoise(H, Wd, 1.8, 903)) * (0.5 + 0.5 * n2)
            crack = (fnoise(H // 8, Wd, 1.2, 902).repeat(8, 0) > 0.78).astype(np.float32) * 0.5
            c = pc * 0.5 + np.array([158, 152, 140]) * 0.5
            c = c * (1 - 0.38 * ring[..., None] - 0.25 * crack[..., None]) + np.array([10, 8, 4]) * n2[..., None]
            h = 0.6 - 0.45 * ring - 0.2 * crack + 0.1 * n2
            alb[:, k * Wd:(k + 1) * Wd] = c
        elif k == 1:  # smooth rainforest bark mottled with lichen (photo)
            c, n = photo_strip('Bark007', 0.62, 0.75)
            # warmer and darker than the lichen-grey photo, with damp moss patches
            moss = np.clip(fnoise(H, Wd, 2.0, 501) * 2.2 - 1.2, 0, 1)[..., None]
            c = c * np.array([1.0, 0.9, 0.78]) * (1 - moss) + np.array([52, 72, 30]) * moss
            alb[:, k * Wd:(k + 1) * Wd] = c
            nrm[:, k * Wd:(k + 1) * Wd] = n
            continue
        elif k == 2:  # hapu'u trunk: dark matted fibres
            h = 0.3 + 0.7 * fib ** 0.8
            c = np.array([62, 42, 28]) * (0.6 + 0.6 * h[..., None]) + np.array([60, 40, 10]) * (fib > 0.8)[..., None]
        elif k == 3:  # bamboo culm with nodes
            node = np.exp(-((yy % 256) - 6) ** 2 / 10.0)
            h = 0.6 + 0.1 * vf - 0.5 * node
            c = np.array([138, 150, 62]) * (0.8 + 0.25 * vf[..., None]) + np.array([60, 40, 0]) * node[..., None] * 0.6
            c *= (1 - 0.35 * np.exp(-((yy % 256) - 2) ** 2 / 2.0))[..., None]
        elif k == 4:  # banana pseudostem: green with brown sheath streaks
            st = np.repeat(fnoise(H // 32, Wd, 1.2, 600), 32, 0)
            h = 0.5 + 0.3 * vf
            c = np.array([96, 132, 56]) * (0.8 + 0.3 * vf[..., None])
            c = np.where((st > 0.55)[..., None], np.array([110, 84, 50]) * (0.8 + 0.4 * n2[..., None]), c)
        elif k == 5:  # coconut husk
            h = 0.5 + 0.2 * n1
            c = np.array([112, 120, 38]) * (0.8 + 0.3 * n2[..., None])
        elif k == 6:  # root / branch: rough grey-brown (photo)
            c, n = photo_strip('Bark001', 0.8, 0.7)
            alb[:, k * Wd:(k + 1) * Wd] = c
            nrm[:, k * Wd:(k + 1) * Wd] = n
            continue
        else:         # dry sheath / dead frond base: tan fibres
            h = 0.4 + 0.6 * vf
            c = np.array([150, 124, 84]) * (0.7 + 0.4 * vf[..., None])
        if k:
            alb[:, k * Wd:(k + 1) * Wd] = c
        gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 3
        gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 3
        n = np.stack([-gx, gy, np.ones_like(gx)], -1)
        nrm[:, k * Wd:(k + 1) * Wd] = n / np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8)).save(f'{OUT}/bark.jpg', quality=86)
    Image.fromarray(np.clip((nrm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)).save(f'{OUT}/bark_n.jpg', quality=88)


def main():
    S = load_sprites()
    for b in BARKS:
        fetch(b, '1K-JPG')
    atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
    dark = [(40, 78, 26), (50, 92, 30), (62, 104, 36), (46, 86, 34)]
    pale = [(112, 136, 84), (128, 148, 94), (100, 124, 72)]
    cells = [
        (palm_frond(S, False, 1), 0, 0), (palm_frond(S, True, 2), 0, 1024),
        (fern_frond(S, 3), 512, 0), (banana_leaf(S, 4), 512, 1024),
        (spray(S, ['LeafSet022', 'LeafSet024', 'LeafSet001', 'LeafSet014'], dark, 5), 1024, 0),
        (spray(S, ['LeafSet023'], pale, 6, n_twigs=8, per=7, Lk=(0.14, 0.2), Wk=0.5, pale=True), 1536, 0),
        (monstera(S, 7), 1024, 512), (ti_plant(S, 8), 1536, 512),
        (grass(S, 9), 1024, 1024), (naupaka(S, 10), 1536, 1024),
        (bamboo_spray(S, 12), 1024, 1536), (vine(S, 13), 1536, 1536), (ginger(S, 14), 1792, 1536),
    ]
    for img, x, y in cells:
        atlas.paste(img, (x, y))
    atlas.save(f'{OUT}/foliage.webp', quality=82, method=6, exact=True)
    atlas.resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/foliage_1k.webp', quality=86, method=6, exact=True)
    bark_strips()
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')


if __name__ == '__main__':
    main()
