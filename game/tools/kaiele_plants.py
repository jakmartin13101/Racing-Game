"""Painted texture atlases for Kai'ele's plants (src/kaiele/plants.js maps the cells).

foliage.webp (2048, RGBA; foliage_1k.webp for low settings): alpha-cut cards, base of each leaf at the bottom of its cell
  x0    y0    w    h     cell
  0     0     512  1024  palm frond, fresh                 0     1024  512  1024  palm frond, old / drying
  512   0     512  1024  tree fern frond (hapu'u)           512   1024  512  1024  banana leaf, torn along the veins
  1024  0     512  512   canopy leaf spray, dark           1536  0     512  512   canopy leaf spray, pale (kukui)
  1024  512   512  512   monstera leaf                     1536  512   512  512   ti plant fan
  1024  1024  512  512   grass tuft                        1536  1024  512  512   naupaka shrub
  1024  1536  512  512   bamboo leaf spray                 1536  1536  256  512   hanging vine
  1792  1536  256  512   red ginger
bark.jpg + bark_n.jpg (1024): eight 128 px strips that tile both ways round a trunk:
  palm, rainforest bark, tree fern trunk, bamboo, banana stem, coconut husk, root / branch, dry sheath

    python tools/kaiele_plants.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures', 'kaiele', 'plants')
os.makedirs(OUT, exist_ok=True)
R = np.random.default_rng(11)
SS = 2  # supersampling


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


def jit(c, k=12):
    return tuple(int(np.clip(v + R.uniform(-k, k), 0, 255)) for v in c[:3]) + (255,)


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def leaf_poly(p, ang, L, W, shape='lance', n=10):
    """outline of a leaf from base p along angle ang (radians, 0 = up the image), half-width profile by shape"""
    d = np.array([np.sin(ang), -np.cos(ang)])
    s = np.array([-d[1], d[0]])
    left, right = [], []
    for k in range(n + 1):
        t = k / n
        if shape == 'lance':
            w = np.sin(np.pi * min(1, t ** 0.75)) ** 0.8
        elif shape == 'ellipse':
            w = np.sin(np.pi * t) ** 0.7
        elif shape == 'obovate':
            w = np.sin(np.pi * t ** 1.6) ** 0.6
        elif shape == 'heart':
            w = (np.sin(np.pi * t ** 0.6) ** 0.7) * (1 + 0.3 * (1 - t))
        else:
            w = 1 - t
        c = np.array(p) + d * L * t
        left.append(tuple(c + s * W * w))
        right.append(tuple(c - s * W * w))
    return left, right[::-1], d, s


def leaf(dr, p, ang, L, W, col, shape='lance', fold=0.12, rib=True):
    """a leaf with two differently lit halves (the fold along the midrib) and a pale midrib"""
    left, right, d, s = leaf_poly(p, ang, L, W, shape)
    mid = [tuple(np.array(p) + d * L * k / 10) for k in range(11)]
    dr.polygon(left + mid[::-1], fill=jit(col, 4))
    dark = tuple(c * (1 - fold) for c in col)
    dr.polygon(mid + right, fill=jit(dark, 4))
    if rib and L > 18:
        dr.line(mid, fill=jit(mix(col, (200, 210, 140), 0.35), 3), width=max(1, int(W * 0.12)))


def finish(img, noise_amt=0.18, seed=1):
    """noise in the colour, then push colour out under the transparent texels so mipmaps don't fringe"""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    n = fnoise(h, w, 1.6, seed)
    a[..., :3] *= (1 - noise_amt / 2 + noise_amt * n)[..., None]
    alpha = a[..., 3:4] / 255
    rgb = a[..., :3]
    # pyramid fill: average colour of nearby leaves bleeds into the empty space
    fill = rgb * alpha
    wsum = alpha.copy()
    acc_c, acc_w = np.zeros_like(rgb), np.zeros_like(alpha)
    for r in (2, 6, 16, 40, 100):
        bc = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))).astype(np.float32)
        bw = np.asarray(Image.fromarray((wsum[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))).astype(np.float32)[..., None] / 255
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


# ------------------------------------------------------------------ cells
def palm_frond(old=False, seed=0):
    W, H = 512 * SS, 1024 * SS
    img, dr = canvas(512, 1024)
    r = np.random.default_rng(seed)
    cx = W / 2
    base_g = (78, 112, 34) if not old else (112, 118, 46)
    # leaflets both sides, angled towards the tip, longest past the middle
    for side in (-1, 1):
        t = 0.05
        while t < 0.985:
            y = H * (1 - t)
            gap = r.random() < (0.05 if not old else 0.12)
            Lr = np.sin(np.pi * (0.12 + 0.88 * t)) ** 0.55 * (1 - 0.35 * t ** 3)
            ang_dev = np.radians(r.uniform(48, 62) - 20 * t)
            L = Lr * (W / 2 * 0.96) / np.sin(ang_dev) * r.uniform(0.85, 1.0)
            if old and r.random() < 0.2:
                L *= r.uniform(0.35, 0.7)
            if not gap:
                col = mix(base_g, (150, 160, 70), r.uniform(0, 0.4))
                if old and r.random() < 0.35:
                    col = mix(col, (150, 112, 52), r.uniform(0.4, 0.9))
                ang = side * ang_dev
                leaf(dr, (cx + side * 6 * SS * (1 - t), y), ang, L, L * 0.026 + 2 * SS, col, 'lance', fold=0.3)
                # brown dry tip
                tip = np.array((cx, y)) + np.array([np.sin(ang), -np.cos(ang)]) * L
                if r.random() < (0.3 if not old else 0.7):
                    dr.line([tuple(tip - np.array([np.sin(ang), -np.cos(ang)]) * L * 0.12), tuple(tip)], fill=jit((120, 96, 50), 10), width=3 * SS)
            t += r.uniform(0.013, 0.019)
    # rachis
    pts = [(cx, H * (1 - k / 40) + 0) for k in range(41)]
    for k in range(40):
        wdt = int((16 - 13 * k / 40) * SS)
        dr.line([pts[k], pts[k + 1]], fill=jit((170, 160, 82) if not old else (176, 150, 80), 3), width=wdt)
    return finish(down(img, 512, 1024), 0.22, seed + 3)


def fern_frond(seed=0):
    W, H = 512 * SS, 1024 * SS
    img, dr = canvas(512, 1024)
    r = np.random.default_rng(seed)
    cx = W / 2
    g = (72, 122, 30)
    t = 0.04
    while t < 0.97:
        y = H * (1 - t)
        Lr = np.sin(np.pi * (0.1 + 0.9 * t) ** 0.9) * (1 - 0.6 * t ** 2.5)
        for side in (-1, 1):
            ang = side * np.radians(r.uniform(62, 74) - 15 * t)
            L = Lr * W / 2 * 0.94 / np.sin(abs(ang))
            d = np.array([np.sin(ang), -np.cos(ang)])
            p0 = np.array((cx, y))
            # pinnules along the pinna, alternating, shrinking to its tip
            k = 0.06
            col = mix(g, (140, 175, 60), r.uniform(0, 0.35) + 0.25 * t)
            while k < 0.97:
                q = p0 + d * L * k
                pl = L * 0.16 * (1 - k) ** 0.6 + 2 * SS
                for s2 in (-1, 1):
                    leaf(dr, tuple(q), ang + s2 * np.radians(70 - 20 * k), pl, pl * 0.32, col, 'ellipse', fold=0.18, rib=False)
                k += 0.055
            dr.line([tuple(p0), tuple(p0 + d * L * 0.97)], fill=jit((96, 120, 40), 4), width=2 * SS)
        t += r.uniform(0.034, 0.042)
    dr.line([(cx, H), (cx, H * 0.03)], fill=(92, 78, 40, 255), width=5 * SS)
    return finish(down(img, 512, 1024), 0.2, seed + 5)


def banana_leaf(seed=0):
    W, H = 512 * SS, 1024 * SS
    img, dr = canvas(512, 1024)
    r = np.random.default_rng(seed)
    cx = W / 2
    top, bot = H * 0.02, H * 0.97
    col = (96, 148, 40)
    # blade: oblong with a rounded tip, each half lit differently
    for side in (-1, 1):
        pts = [(cx, bot)]
        for k in range(41):
            t = k / 40
            w = min(1, (t / 0.06) ** 0.5) * (1 - t ** 9) ** 0.5 * W * 0.46
            pts.append((cx + side * w, bot - (bot - top) * t))
        pts.append((cx, top))
        dr.polygon(pts, fill=(col if side < 0 else tuple(int(c * 0.86) for c in col)) + (255,))
    a = np.asarray(img).copy()
    # parallel veins and tears along them
    yy, xx = np.mgrid[0:H, 0:W]
    dx = np.abs(xx - cx)
    vein_phase = (yy + dx * 0.55) / (9 * SS)
    vein = (np.abs(np.sin(vein_phase * np.pi)) < 0.18)
    a[..., :3] = np.where(vein[..., None], np.clip(a[..., :3] * 1.12, 0, 255), a[..., :3])
    cuts = np.zeros((H, W), bool)
    for side in (-1, 1):
        for _ in range(r.integers(6, 11)):
            y0 = r.uniform(top + 60, bot - 80)
            reach = r.uniform(0.25, 0.98)
            # a tear follows a vein from the edge in towards the midrib
            m = (np.abs((yy + dx * 0.55) - (y0 + W * 0.46 * 0.55)) < r.uniform(2.5, 5.0) * SS) & (dx > W * 0.46 * (1 - reach)) & (np.sign(xx - cx) == side)
            cuts |= m
    a[..., 3] = np.where(cuts, 0, a[..., 3])
    # dry brown edge
    edge = np.asarray(Image.fromarray(a[..., 3]).filter(ImageFilter.MinFilter(9))) < 128
    br = edge & (a[..., 3] > 0)
    a[..., :3] = np.where(br[..., None], (a[..., :3] * 0.5 + np.array([70, 55, 25])).astype(np.uint8), a[..., :3])
    img = Image.fromarray(a, 'RGBA')
    dr = ImageDraw.Draw(img)
    dr.line([(cx, H), (cx, top + 10)], fill=(176, 186, 110, 255), width=10 * SS)
    return finish(down(img, 512, 1024), 0.18, seed + 7)


def canopy_spray(pale=False, seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    c = np.array([W / 2, W / 2])
    greens = [(34, 68, 22), (48, 86, 28), (64, 102, 36)] if not pale else [(98, 124, 70), (120, 142, 86), (84, 110, 58)]
    # back to front: inner (shaded) leaves first, outer lit leaves over them
    for layer in range(4):
        for _ in range(110):
            a = r.uniform(0, 6.283)
            rad = W * 0.42 * np.sqrt(r.random()) * (0.55 + 0.45 * layer / 3)
            p = c + np.array([np.cos(a), np.sin(a)]) * rad * 0.8
            ang = np.arctan2(p[0] - c[0], -(p[1] - c[1])) + r.uniform(-0.6, 0.6)
            L = r.uniform(0.09, 0.15) * W * (1.25 if pale else 1)
            g = greens[r.integers(len(greens))]
            g = tuple(v * (0.6 + 0.4 * layer / 3) for v in g)
            leaf(dr, tuple(p), ang, L, L * (0.3 if not pale else 0.42), g, 'ellipse' if not pale else 'heart', fold=0.2)
    # twigs
    for _ in range(8):
        a = r.uniform(0, 6.283)
        dr.line([tuple(c), tuple(c + np.array([np.cos(a), np.sin(a)]) * W * 0.3)], fill=(70, 58, 40, 255), width=3 * SS)
    return finish(down(img, 512, 512), 0.25, seed + 11)


def monstera(seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    cx, cy = W / 2, W * 0.52
    pts = []
    for k in range(80):
        a = k / 80 * 6.283
        rad = W * 0.45 * (1 - 0.18 * np.cos(a) ** 2) * (1 - 0.25 * max(0, np.cos(a - np.pi / 2)) ** 8)
        pts.append((cx + np.cos(a) * rad * 0.92, cy + np.sin(a) * rad))
    dr.polygon(pts, fill=(28, 74, 26, 255))
    dr.polygon([(cx, cy), *pts[:40]], fill=(24, 64, 22, 255))
    a = np.asarray(img).copy()
    yy, xx = np.mgrid[0:W, 0:W]
    ang = np.arctan2(yy - cy, xx - cx)
    rr = np.hypot(xx - cx, yy - cy) / (W * 0.45)
    # splits from the edge towards the midrib and two rows of holes between them
    sp = np.abs(np.sin(ang * 9)) < 0.05 + 0.09 * rr
    a[..., 3] = np.where(sp & (rr > 0.55), 0, a[..., 3])
    holes = (np.abs(np.sin(ang * 9 + np.pi / 2)) < 0.25) & (np.abs(rr - 0.38) < 0.05)
    a[..., 3] = np.where(holes, 0, a[..., 3])
    vein = np.abs(np.sin(ang * 9 + np.pi / 2)) < 0.05
    a[..., :3] = np.where((vein & (a[..., 3] > 0))[..., None], np.clip(a[..., :3] * 1.35, 0, 255).astype(np.uint8), a[..., :3])
    img = Image.fromarray(a, 'RGBA')
    ImageDraw.Draw(img).line([(cx, W), (cx, cy - W * 0.4)], fill=(70, 110, 44, 255), width=6 * SS)
    return finish(down(img, 512, 512), 0.15, seed + 13)


def fan(seed, n, col, spread, Lr=(0.75, 0.97), Wf=0.075, shape='lance', red=0.0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    p = (W / 2, W * 0.99)
    order = sorted(range(n), key=lambda _: r.random())
    for k in order:
        ang = np.radians(r.uniform(-spread, spread))
        L = W * r.uniform(*Lr)
        g = mix(col, (150, 60, 70), red * r.random()) if red else mix(col, (150, 170, 70), r.uniform(0, 0.3))
        leaf(dr, p, ang, L, L * Wf, g, shape, fold=0.25)
    return img, dr


def ti_plant(seed=0):
    img, _ = fan(seed, 26, (52, 110, 36), 70, (0.55, 0.95), 0.09, red=0.5)
    return finish(down(img, 512, 512), 0.15, seed + 17)


def grass(seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    for k in range(120):
        x0 = W * (0.15 + 0.7 * r.random())
        h = W * r.uniform(0.45, 0.98)
        lean = W * r.uniform(-0.25, 0.25)
        w = r.uniform(2, 5) * SS
        c = mix((60, 98, 30), (170, 168, 90), r.random() ** 2)
        pts_l, pts_r = [], []
        for i in range(13):
            t = i / 12
            x = x0 + lean * t * t
            y = W - h * t
            ww = w * (1 - t)
            pts_l.append((x - ww, y))
            pts_r.append((x + ww, y))
        dr.polygon(pts_l + pts_r[::-1], fill=jit(tuple(v * (0.6 + 0.4 * (1 - abs(lean) / W * 2)) for v in c), 8))
    return finish(down(img, 512, 512), 0.2, seed + 19)


def naupaka(seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    # a low dome of fleshy rosettes
    for layer in range(3):
        for _ in range(28):
            x = W * (0.12 + 0.76 * r.random())
            top = W * (0.98 - 0.62 * np.sin(np.pi * (x / W - 0.12) / 0.76) ** 0.6)
            y = r.uniform(top, W * 0.95) if layer < 2 else top + r.uniform(0, W * 0.12)
            for k in range(9):
                ang = k / 9 * 6.283 + r.uniform(-0.3, 0.3)
                L = W * r.uniform(0.07, 0.1)
                g = mix((70, 124, 40), (150, 180, 80), r.uniform(0, 0.5)) if layer else (44, 82, 28)
                leaf(dr, (x, y), ang, L, L * 0.42, g, 'obovate', fold=0.15, rib=False)
            if layer == 2 and r.random() < 0.5:
                for k in range(3):
                    q = (x + r.uniform(-15, 15) * SS, y + r.uniform(-15, 15) * SS)
                    leaf(dr, q, r.uniform(-1.2, 1.2), 9 * SS, 6 * SS, (240, 238, 228), 'obovate', fold=0.05, rib=False)
    return finish(down(img, 512, 512), 0.15, seed + 23)


def bamboo_spray(seed=0):
    W = 512 * SS
    img, dr = canvas(512, 512)
    r = np.random.default_rng(seed)
    for _ in range(26):
        p0 = np.array([W * r.uniform(0.25, 0.75), W * r.uniform(0.3, 0.9)])
        a0 = r.uniform(-1.4, 1.4)
        d = np.array([np.sin(a0), -np.cos(a0) * 0.6])
        p1 = p0 + d * W * r.uniform(0.1, 0.22)
        dr.line([tuple(p0), tuple(p1)], fill=(110, 120, 60, 255), width=2 * SS)
        for k in range(6):
            q = p0 + (p1 - p0) * (k / 6 + 0.1)
            ang = a0 + np.pi / 2 * (1 if k % 2 else -1) * r.uniform(0.6, 1.3) + 0.6
            L = W * r.uniform(0.09, 0.16)
            leaf(dr, tuple(q), ang, L, L * 0.09, mix((80, 128, 40), (160, 170, 80), r.uniform(0, 0.4)), 'lance', fold=0.2)
    return finish(down(img, 512, 512), 0.2, seed + 29)


def vine(seed=0):
    W, H = 256 * SS, 512 * SS
    img, dr = canvas(256, 512)
    r = np.random.default_rng(seed)
    pts = [(W / 2 + np.sin(k * 0.21) * W * 0.12 + r.uniform(-2, 2), H * k / 60) for k in range(61)]
    dr.line(pts, fill=(80, 74, 44, 255), width=3 * SS)
    for k in range(3, 60, 2):
        side = 1 if (k // 2) % 2 else -1
        L = W * r.uniform(0.18, 0.3) * (0.6 + 0.4 * (1 - k / 60))
        leaf(dr, pts[k], side * np.radians(r.uniform(100, 150)), L, L * 0.45, mix((44, 96, 30), (110, 150, 50), r.random() * 0.5), 'heart', 0.2)
    return finish(down(img, 256, 512), 0.15, seed + 31)


def ginger(seed=0):
    W, H = 256 * SS, 512 * SS
    img, dr = canvas(256, 512)
    r = np.random.default_rng(seed)
    for s in range(3):
        x = W * (0.3 + 0.2 * s)
        top = H * r.uniform(0.15, 0.3)
        dr.line([(x, H), (x, top)], fill=(70, 100, 40, 255), width=3 * SS)
        for k in range(8):
            y = H - (H - top) * (0.15 + 0.8 * k / 8)
            side = 1 if k % 2 else -1
            L = W * r.uniform(0.35, 0.5)
            leaf(dr, (x, y), side * np.radians(r.uniform(35, 60)), L, L * 0.13, mix((46, 104, 34), (110, 150, 50), r.random() * 0.4), 'lance', 0.25)
        # red bract cone on top
        for k in range(14):
            y = top - k * 4.5 * SS
            ww = (14 - k) * 1.3 * SS
            dr.ellipse([x - ww, y - 6 * SS, x + ww, y + 6 * SS], fill=jit((200, 26, 36), 18))
    return finish(down(img, 256, 512), 0.15, seed + 37)


# ------------------------------------------------------------------ bark strips (each tiles both ways)
def bark_strips():
    H, Wd = 1024, 128
    alb = np.zeros((H, Wd * 8, 3), np.float32)
    hgt = np.zeros((H, Wd * 8), np.float32)
    yy, xx = np.mgrid[0:H, 0:Wd]
    for k in range(8):
        n1 = fnoise(H, Wd, 2.0, 100 + k)
        n2 = fnoise(H, Wd, 1.2, 200 + k)
        fib = fnoise(H, Wd // 1, 1.0, 300 + k)
        # vertical fibre noise: stretched
        vf = np.repeat(fnoise(H // 16, Wd, 1.4, 400 + k), 16, 0)
        if k == 0:    # coconut palm: grey-brown with leaf scar rings
            ring = np.abs(np.sin((yy + n1 * 30) / 34 * np.pi)) ** 6
            h = 0.5 + 0.3 * vf - 0.35 * ring + 0.15 * n2
            c = np.array([118, 106, 90]) * (0.75 + 0.35 * h[..., None]) + np.array([20, 18, 10]) * n2[..., None]
        elif k == 1:  # smooth rainforest bark with lichen
            lich = (fnoise(H, Wd, 2.2, 500) > 0.7).astype(np.float32) * 0.5
            h = 0.55 + 0.25 * n1 + 0.2 * vf
            c = np.array([96, 88, 72]) * (0.7 + 0.4 * h[..., None])
            c = c * (1 - lich[..., None] * 0.6) + np.array([170, 175, 150]) * lich[..., None] * 0.6
            moss = np.clip(fnoise(H, Wd, 2.0, 501) * 2 - 1.1, 0, 1)
            c = c * (1 - moss[..., None]) + np.array([60, 90, 30]) * moss[..., None]
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
        elif k == 6:  # root / branch: rougher grey-brown
            h = 0.4 + 0.4 * vf + 0.2 * n1
            c = np.array([88, 76, 60]) * (0.65 + 0.5 * h[..., None])
        else:         # dry sheath / dead frond base: tan fibres
            h = 0.4 + 0.6 * vf
            c = np.array([150, 124, 84]) * (0.7 + 0.4 * vf[..., None])
        alb[:, k * Wd:(k + 1) * Wd] = c
        hgt[:, k * Wd:(k + 1) * Wd] = h
    # normal map from the height, wrapping within each strip
    nrm = np.zeros((H, Wd * 8, 3), np.float32)
    for k in range(8):
        hs = hgt[:, k * Wd:(k + 1) * Wd]
        gx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) * 3
        gy = (np.roll(hs, -1, 0) - np.roll(hs, 1, 0)) * 3
        n = np.stack([-gx, gy, np.ones_like(gx)], -1)
        nrm[:, k * Wd:(k + 1) * Wd] = n / np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8)).save(f'{OUT}/bark.jpg', quality=88)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save(f'{OUT}/bark_n.jpg', quality=90)


def main():
    atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
    cells = [
        (palm_frond(False, 1), 0, 0), (palm_frond(True, 2), 0, 1024),
        (fern_frond(3), 512, 0), (banana_leaf(4), 512, 1024),
        (canopy_spray(False, 5), 1024, 0), (canopy_spray(True, 6), 1536, 0),
        (monstera(7), 1024, 512), (ti_plant(8), 1536, 512),
        (grass(9), 1024, 1024), (naupaka(10), 1536, 1024),
        (bamboo_spray(12), 1024, 1536), (vine(13), 1536, 1536), (ginger(14), 1792, 1536),
    ]
    for img, x, y in cells:
        atlas.paste(img, (x, y))
        print('cell', x, y)
    atlas.save(f'{OUT}/foliage.webp', quality=80, method=6, exact=True)
    atlas.resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/foliage_1k.webp', quality=88, method=6, exact=True)
    bark_strips()
    for f in os.listdir(OUT):
        print(f, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')


if __name__ == '__main__':
    main()
