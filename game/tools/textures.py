"""Procedural, tileable PBR texture synthesis for the volcano track.

Every map is built on a torus (FFT noise + periodic Worley cells), so all
outputs tile seamlessly. Writes <name>_albedo.jpg, <name>_normal.jpg and
<name>_orm.jpg (R = ambient occlusion, G = roughness, B = metalness) to
public/textures/.

    python tools/textures.py [size]
"""
import sys
import os
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


# ------------------------------------------------------------------ noise
def spectral(beta=2.0, lo=1.0, hi=None, seed=None):
    """Tileable fractal noise with power spectrum 1/f^beta, normalised 0..1."""
    r = np.random.default_rng(seed)
    fx = np.fft.fftfreq(N) * N
    f = np.sqrt(fx[None, :] ** 2 + fx[:, None] ** 2)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2 + 0.5)
    amp[f < lo] = 0
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    ph = r.uniform(0, 2 * np.pi, (N, N))
    n = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    n -= n.min()
    return n / n.max()


def worley(count, seed=None, jitter_scale=None):
    """Periodic Worley noise. Returns F1, F2 distances (in cell units) and cell id."""
    r = np.random.default_rng(seed)
    pts = r.uniform(0, N, (count, 2))
    tree = cKDTree(pts, boxsize=N)
    yy, xx = np.mgrid[0:N, 0:N]
    q = np.stack([yy.ravel() + 0.5, xx.ravel() + 0.5], 1) % N
    d, i = tree.query(q, k=2)
    cell = N / np.sqrt(count)
    f1 = (d[:, 0] / cell).reshape(N, N)
    f2 = (d[:, 1] / cell).reshape(N, N)
    return f1, f2, i[:, 0].reshape(N, N)


def blur(a, px):
    fx = np.fft.fftfreq(N)
    g = np.exp(-2 * (np.pi * px) ** 2 * (fx[None, :] ** 2 + fx[:, None] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)  # OpenGL convention (+Y up)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def ao_from_height(h, radius=6, strength=1.6):
    cavity = blur(h, radius) - h
    return np.clip(1 - np.maximum(cavity, 0) * strength, 0.25, 1)


def srgb(c):
    return np.clip(c, 0, 1) ** (1 / 2.2)


def save(name, albedo, height, rough, nstrength, metal=None, ao_r=6, ao_s=1.6):
    n = normal_from_height(height, nstrength)
    ao = ao_from_height(height, ao_r, ao_s)
    if metal is None:
        metal = np.zeros_like(height)
    Image.fromarray((srgb(albedo) * 255).astype(np.uint8)).save(
        f'{OUT}/{name}_albedo.jpg', quality=90)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(
        f'{OUT}/{name}_normal.jpg', quality=92)
    orm = np.stack([ao, np.clip(rough, 0.04, 1), metal], -1)
    Image.fromarray((orm * 255).astype(np.uint8)).save(f'{OUT}/{name}_orm.jpg', quality=90)
    print('wrote', name)


def lin(hexstr):
    c = np.array([int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return c ** 2.2


def mix(a, b, t):
    t = t[..., None]
    return a * (1 - t) + b * t


def pebbles(count, size_jitter, seed, sharp=0.55):
    """Rounded stones: height bumps from Worley F1 with random per-stone size."""
    f1, f2, cid = worley(count, seed)
    r = np.random.default_rng(seed + 1)
    rad = r.uniform(1 - size_jitter, 1, count)[cid] * sharp
    bump = np.clip(1 - (f1 / rad) ** 2, 0, None) ** 0.6
    tone = r.uniform(0, 1, count)[cid]
    return bump, tone, (f1 < rad)


# ------------------------------------------------------------- materials
def ash_track():
    """Compacted volcanic ash / cinder dirt racing surface."""
    base = spectral(2.2, 2, seed=1)
    mid = spectral(1.6, 8, seed=2)
    fine = spectral(1.0, 64, seed=3)
    grit = rng.random((N, N))
    p1, t1, m1 = pebbles(2600, 0.7, 11, 0.42)
    p2, t2, m2 = pebbles(14000, 0.6, 12, 0.40)
    clump = ss(0.45, 0.7, spectral(2.0, 3, seed=4))
    # dried crack network in compacted areas
    f1, f2, _ = worley(260, 21)
    crack = 1 - ss(0.0, 0.05, f2 - f1)
    crack *= ss(0.55, 0.75, spectral(2.0, 2, seed=5))
    h = (0.35 * base + 0.25 * mid + 0.06 * fine + 0.03 * grit
         + 0.55 * p1 * (0.4 + clump * 0.6) + 0.22 * p2 - 0.18 * crack)
    dark = lin('3a3330')
    warm = lin('6b5546')
    grey = lin('5b5753')
    alb = mix(dark, warm, ss(0.3, 0.8, base))
    alb = mix(alb, grey, ss(0.4, 0.9, mid) * 0.6)
    rock_col = mix(np.broadcast_to(lin('2a2624'), alb.shape), np.broadcast_to(lin('7d6656'), alb.shape), t1)
    alb = mix(alb, rock_col, (m1 * p1 > 0.15) * (0.4 + clump * 0.6))
    peb_col = mix(np.broadcast_to(lin('1f1c1b'), alb.shape), np.broadcast_to(lin('8a7362'), alb.shape), t2)
    alb = mix(alb, peb_col, (m2 * p2 > 0.2) * 0.85)
    alb *= (0.82 + 0.3 * fine[..., None]) * (0.9 + 0.2 * grit[..., None])
    alb *= (1 - 0.45 * crack[..., None])
    rough = 0.86 + 0.1 * fine - 0.12 * (m1 * p1 > 0.15)
    save('ash_track', alb, h, rough, 9.0 * N / 1024)


def scoria():
    """Loose red-brown cinder gravel and ash for off-track ground."""
    base = spectral(2.3, 1.5, seed=31)
    mid = spectral(1.4, 10, seed=32)
    fine = spectral(0.8, 90, seed=33)
    p1, t1, m1 = pebbles(5000, 0.75, 41, 0.5)
    p2, t2, m2 = pebbles(26000, 0.7, 42, 0.45)
    h = 0.35 * base + 0.2 * mid + 0.08 * fine + 0.55 * p1 + 0.3 * p2
    red = lin('5c3324')
    rust = lin('7a4a33')
    black = lin('231d1c')
    alb = mix(black, red, ss(0.25, 0.75, base))
    alb = mix(alb, rust, ss(0.5, 0.9, mid) * 0.7)
    c1 = mix(np.broadcast_to(black, alb.shape), np.broadcast_to(lin('8c4f36'), alb.shape), t1 ** 1.5)
    alb = mix(alb, c1, (m1 * p1 > 0.1) * 0.9)
    c2 = mix(np.broadcast_to(lin('1a1514'), alb.shape), np.broadcast_to(lin('6d3a28'), alb.shape), t2)
    alb = mix(alb, c2, (m2 * p2 > 0.15) * 0.8)
    alb *= (0.8 + 0.35 * fine[..., None])
    rough = 0.9 + 0.08 * fine
    save('scoria', alb, h, rough, 12.0 * N / 1024)


def basalt():
    """Fractured dark basalt cliff rock with vesicles and weathered patina."""
    base = spectral(2.4, 1, seed=51)
    mid = spectral(1.8, 6, seed=52)
    fine = spectral(1.1, 40, seed=53)
    f1, f2, cid = worley(90, 61)
    edge = ss(0.0, 0.12, f2 - f1)  # 0 on fractures
    r = np.random.default_rng(62)
    slab = r.uniform(0, 1, 90)[cid]
    tilt = blur(slab, 2)
    g1, g2, _ = worley(1400, 63)
    chips = ss(0.0, 0.08, g2 - g1)
    v1, _, _ = worley(9000, 64)
    ves = np.clip(1 - v1 / 0.28, 0, 1) ** 2 * ss(0.4, 0.7, spectral(2, 3, seed=65))
    h = (0.45 * base + 0.3 * mid + 0.1 * fine + 0.25 * tilt) * (0.55 + 0.45 * edge) \
        * (0.85 + 0.15 * chips) - 0.25 * ves
    c0 = lin('1e1c1c')
    c1 = lin('4a4542')
    rustc = lin('6e4330')
    alb = mix(c0, c1, ss(0.2, 0.9, base * 0.6 + mid * 0.4))
    alb = mix(alb, rustc, ss(0.6, 0.85, spectral(2.0, 4, seed=66)) * 0.55)
    alb *= (0.75 + 0.4 * fine[..., None]) * (0.6 + 0.4 * edge[..., None])
    alb *= (1 - 0.6 * ves[..., None])
    # dust settled in crevices
    dust = ss(0.05, 0.2, blur(h, 5) - h)
    alb = mix(alb, np.broadcast_to(lin('6a5a4e'), alb.shape), dust * 0.6)
    rough = 0.78 + 0.18 * fine - 0.1 * (1 - edge)
    save('basalt', alb, h, rough, 14.0 * N / 1024, ao_r=8, ao_s=2.2)


def lava():
    """Cooling lava crust. Albedo = crust, emissive mask in normal.alpha-free
    separate file lava_emissive.jpg (hot cracks)."""
    base = spectral(2.2, 2, seed=71)
    f1, f2, cid = worley(160, 72)
    gap = f2 - f1
    g1, g2, _ = worley(1200, 73)
    gap2 = g2 - g1
    warp = spectral(1.8, 3, seed=74)
    crack = 1 - ss(0.0, 0.16 + 0.12 * warp, gap)
    crack2 = 1 - ss(0.0, 0.08, gap2)
    heat = np.clip(crack + 0.55 * crack2 * ss(0.3, 0.6, warp), 0, 1)
    plate = np.random.default_rng(75).uniform(0, 1, 160)[cid]
    h = (0.6 + 0.4 * base) * (1 - 0.8 * heat) + 0.1 * plate + 0.05 * spectral(1, 60, seed=76)
    crust = mix(lin('121010'), lin('3a2f2c'), ss(0.3, 0.9, base * 0.5 + plate * 0.5))
    crust = mix(crust, np.broadcast_to(lin('2a0f08'), crust.shape), heat)
    rough = 0.7 + 0.25 * base
    save('lava', crust, h, rough, 10.0 * N / 1024)
    e = ss(0.15, 1.0, heat) ** 1.4
    Image.fromarray((np.clip(e, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/lava_heat.jpg', quality=92)
    print('wrote lava_heat')


def detail():
    """Grey high-frequency detail normal used to break up close-range blur."""
    h = 0.6 * spectral(1.2, 30, seed=91) + 0.4 * rng.random((N, N))
    h = blur(h, 0.7)
    n = normal_from_height(h, 6.0)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).resize((1024, 1024)).save(
        f'{OUT}/detail_normal.jpg', quality=92)
    print('wrote detail_normal')


def sprites():
    """Smoke puff (RGBA, alpha = density, RGB = fake sphere normal for lighting)
    and a tileable low-frequency noise used for anti-tiling."""
    global N
    keep = N
    N = 256
    yy, xx = np.mgrid[0:N, 0:N] / (N - 1) * 2 - 1
    r = np.hypot(xx, yy)
    n = 0.6 * spectral(2.0, 2, seed=101) + 0.4 * spectral(1.4, 6, seed=102)
    dens = np.clip((1 - r ** 1.6) * 1.4 - 0.2, 0, 1) * (0.35 + 0.9 * n)
    dens = np.clip(dens - 0.12, 0, 1) ** 1.2
    nz = np.sqrt(np.clip(1 - r ** 2, 0, 1))
    rgb = np.stack([xx * 0.5 + 0.5, -yy * 0.5 + 0.5, nz * 0.5 + 0.5], -1)
    img = np.concatenate([rgb, dens[..., None]], -1)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA').save(f'{OUT}/smoke.png')
    N = 512
    a = spectral(2.0, 2, seed=111)
    b = spectral(2.0, 4, seed=112)
    c = spectral(1.5, 12, seed=113)
    Image.fromarray((np.stack([a, b, c], -1) * 255).astype(np.uint8)).save(f'{OUT}/noise.png')
    N = keep
    print('wrote sprites')


if __name__ == '__main__':
    which = sys.argv[2:] or ['ash_track', 'scoria', 'basalt', 'lava', 'detail', 'sprites']
    for w in which:
        globals()[w]()

