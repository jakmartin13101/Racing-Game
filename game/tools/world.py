"""Bakes the volcano world: terrain heightmap, surface masks and track data.

Outputs to public/world/:
  height.bin   Float32 heights, GRID x GRID, row-major (z rows, x columns)
  masks.png    R = lava glow proximity, G = track/road influence, B = channel/burn
  track.json   track centreline, lava rivers, lake, start grid, checkpoints

    python tools/world.py
"""
import json
import math
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, uniform_filter1d
from scipy.spatial import cKDTree

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'world')
os.makedirs(OUT, exist_ok=True)

EXTENT = 3072.0          # metres across
GRID = 2049              # samples per side (1.5 m spacing)
RES = EXTENT / (GRID - 1)
HALF = EXTENT / 2
TRACK_W = 17.0           # driveable width

xs = np.linspace(-HALF, HALF, GRID)
X, Z = np.meshgrid(xs, xs)
R = np.hypot(X, Z)
A = np.arctan2(Z, X)
rng = np.random.default_rng(3)


def spectral(beta, lo, hi=None, seed=0, n=GRID):
    r = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n) * n
    f = np.sqrt(fx[None, :] ** 2 + fx[:, None] ** 2)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2 + 0.5)
    amp[f < lo] = 0
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    v = np.real(np.fft.ifft2(amp * np.exp(1j * r.uniform(0, 6.283, (n, n)))))
    return (v - v.mean()) / v.std()


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def sample(H, x, z):
    """Bilinear sample of a grid at world coords (arrays)."""
    fx = (np.asarray(x) + HALF) / RES
    fz = (np.asarray(z) + HALF) / RES
    ix = np.clip(np.floor(fx).astype(int), 0, GRID - 2)
    iz = np.clip(np.floor(fz).astype(int), 0, GRID - 2)
    tx, tz = fx - ix, fz - iz
    a = H[iz, ix] * (1 - tx) + H[iz, ix + 1] * tx
    b = H[iz + 1, ix] * (1 - tx) + H[iz + 1, ix + 1] * tx
    return a * (1 - tz) + b * tz


# ------------------------------------------------------------- base relief
print('relief')
PEAK = 900.0
# stratovolcano: concave exponential flank, slightly elliptical, summit crater
warp = spectral(2.6, 1.5, seed=1) * 0.08
Rw = R * (1 + warp) * (1 + 0.06 * np.cos(A - 0.6))
cone = 640.0 * np.exp(-Rw / 330.0) + 300.0 * np.exp(-Rw / 120.0) + 40 * np.exp(-(Rw / 900.0) ** 2)
# flatten summit and cut a crater bowl
cone = np.minimum(cone, PEAK * 0.84)
crater = 170 * np.clip(1 - (R / 135.0) ** 2, 0, 1) ** 1.2
cone -= crater
# radial erosion gullies, stronger high up the flank
gul = np.zeros_like(R)
for k, (freq, amp) in enumerate([(31, 1.0), (57, 0.6), (97, 0.4), (161, 0.25)]):
    ph = spectral(2.6, 1, seed=10 + k) * 1.2
    g = 1 - np.abs(np.sin(A * freq / 2 + ph + np.log1p(R / 200) * 0.7))
    gul += amp * g ** 6
gul = gaussian_filter(gul, 1.2)
flank = ss(140, 240, R) * (1 - ss(650, 1100, R))
cone -= gul * flank * (cone * 0.03 + 2.5)
# old lava lobes (bulges)
lobes = np.maximum(spectral(2.4, 3, seed=20), 0) ** 1.5 * 9 * (1 - ss(300, 1100, R))
# rolling plain and distant ridges
plain = spectral(2.8, 1, seed=30) * 22 + spectral(2.0, 6, seed=31) * 4
ridges = gaussian_filter(np.clip(1 - np.abs(spectral(2.6, 2, seed=32)) * 0.6, 0, 1) ** 3, 5) * 180 * ss(1050, 1500, R)
fine = spectral(1.8, 40, seed=33) * 0.9
H = cone + lobes + plain + ridges + fine
H -= sample(H, np.array([0.0]), np.array([900.0]))[0] * 0  # keep absolute

# ------------------------------------------------------------- lava rivers
print('lava')
def polyline(pts, step=3.0):
    pts = np.asarray(pts, float)
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for t in np.linspace(0, 1, n + 1)[1:]:
            out.append(a + (b - a) * t)
    return np.array(out)


def meander(angle_deg, r0, r1, seed, wiggle=0.12):
    r = np.random.default_rng(seed)
    ph = r.uniform(0, 6.3, 2)
    rr = np.linspace(r0, r1, int((r1 - r0) / 2))
    a = math.radians(angle_deg) + wiggle * (np.sin(rr / 70 + ph[0]) + 0.5 * np.sin(rr / 31 + ph[1])) * ss(r0, r0 + 80, rr)
    return np.stack([rr * np.cos(a), rr * np.sin(a)], 1)


rivers = [
    dict(path=meander(18, 150, 760, 5), w=16),    # east flow, crosses track
    dict(path=meander(147, 150, 390, 6), w=12),   # west flow
    dict(path=meander(262, 150, 300, 7), w=9),    # north-west thin flow
]
lake_c = np.array([219.0, 601.0])
lake_r = 70.0

lava_dist = np.full(H.shape, 1e9)
pts_all = np.stack([X.ravel(), Z.ravel()], 1)
for rv in rivers:
    p = rv['path']
    tree = cKDTree(p)
    d, idx = tree.query(pts_all, distance_upper_bound=120)
    d = d.reshape(H.shape)
    w = rv['w'] * (0.7 + 0.6 * np.linspace(0, 1, len(p)))  # widens downhill
    wi = np.where(np.isfinite(d), w[np.minimum(idx, len(p) - 1)].reshape(H.shape), 1)
    depth = 7 * (1 - ss(0.0, 1.0, d / (wi * 0.5 + 6)))
    H -= np.where(np.isfinite(d), depth, 0)
    # levees either side
    lev = np.exp(-((d - wi * 0.5 - 9) / 6) ** 2) * 3.5
    H += np.where(np.isfinite(d), lev, 0)
    lava_dist = np.minimum(lava_dist, np.where(np.isfinite(d), d - wi * 0.5, 1e9))
    rv['width'] = w.tolist()

dl = np.hypot(X - lake_c[0], Z - lake_c[1])
lake_level = float(sample(H, lake_c[:1], lake_c[1:])[0]) - 6
H = np.where(dl < lake_r + 40, np.minimum(H, lake_level - 3 + ss(lake_r - 10, lake_r + 40, dl) * 14
                                      + (H - lake_level) * ss(lake_r, lake_r + 40, dl)), H)
lava_dist = np.minimum(lava_dist, dl - lake_r)

# ------------------------------------------------------------- track spline
print('track')
# (angle deg, radius) control points, clockwise round the volcano, starting
# on the southern ash plain. z is south in three.js.
CP = [
    (100, 560), (80, 556), (62, 520), (45, 440), (30, 382), (15, 372), (0, 400),
    (-15, 440), (-30, 420), (-45, 372), (-60, 334), (-78, 322), (-95, 350),
    (-112, 400), (-130, 450), (-148, 470), (-165, 440), (-180, 404), (-195, 384),
    (-210, 420), (-225, 480), (-240, 540), (-251, 560),
]
cp = np.array([(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a, r in CP])


def catmull_closed(P, step=1.0):
    n = len(P)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        seg = np.linalg.norm(p2 - p1)
        m = max(2, int(seg / 0.5))
        for t in np.linspace(0, 1, m, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out = np.array(out)
    # resample at uniform arc length
    seg = np.linalg.norm(np.diff(np.vstack([out, out[:1]]), axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    ts = np.arange(0, L, step)
    ox = np.interp(ts, s, np.append(out[:, 0], out[0, 0]))
    oz = np.interp(ts, s, np.append(out[:, 1], out[0, 1]))
    return np.stack([ox, oz], 1), L


C, LEN = catmull_closed(cp, 1.0)
NC = len(C)
print(f'  length {LEN:.0f} m, {NC} samples')
ground = sample(H, C[:, 0], C[:, 1])


def circ_smooth(v, k):
    pad = np.concatenate([v[-k:], v, v[:k]])
    return uniform_filter1d(pad, k, mode='nearest')[k:-k]


th = circ_smooth(ground, 151)
th = circ_smooth(th, 61)
# limit grade to ~11% via iterative relaxation
for _ in range(400):
    d = np.roll(th, -1) - th
    ex = np.clip(np.abs(d) - 0.11, 0, None) * np.sign(d)
    th += ex * 0.5
    th -= np.roll(ex, 1) * 0.5
th = circ_smooth(th, 31)

# jump over the east lava river: find where the track crosses it
east = rivers[0]['path']
tr = cKDTree(east)
dd, _ = tr.query(C)
cross = int(np.argmin(dd))
s_idx = np.arange(NC)
rel = ((s_idx - cross + NC // 2) % NC) - NC // 2  # signed metres from crossing
ramp = np.where((rel > -60) & (rel <= -8), ss(-60, -10, rel) * 3.2, 0)
th_jump = th + ramp
gap = (rel > -8) & (rel < 12)       # no road over the lava gap
landing = np.where((rel >= 12) & (rel < 50), (1 - ss(12, 50, rel)) * 1.6, 0)
th_jump += landing
th = th_jump

# tangents / normals
T = np.gradient(np.vstack([C[-2:], C, C[:2]]), axis=0)[2:-2]
T /= np.linalg.norm(T, axis=1, keepdims=True)
Nrm = np.stack([-T[:, 1], T[:, 0]], 1)
# banking: proportional to curvature
ang = np.arctan2(T[:, 1], T[:, 0])
curv = np.diff(np.unwrap(np.append(ang, ang[0] + 0)))
curv = circ_smooth(np.append(curv[:-1], curv[-2]) if len(curv) == NC else curv, 41)
bank = np.clip(curv * 18, -0.09, 0.09)

# ------------------------------------------------------------- carve terrain
print('carve')
tree = cKDTree(C)
d, idx = tree.query(pts_all, distance_upper_bound=90)
fin = np.isfinite(d)
idx = np.where(fin, idx, 0)
d = np.where(fin, d, 1e9).reshape(H.shape)
idx = idx.reshape(H.shape)
lat = (X - C[idx, 0]) * Nrm[idx, 0] + (Z - C[idx, 1]) * Nrm[idx, 1]
road_h = th[idx] + lat * bank[idx] - 0.05 * (lat / (TRACK_W / 2)) ** 2 * 1.0
nat = H.copy()
diff = nat - road_h
# cuttings get steep basalt walls, fills get gentler embankments
cut = diff > 0
shoulder = np.where(cut, 4 + np.clip(diff, 0, 40) * 0.45, 8 + np.clip(-diff, 0, 30) * 1.5)
half = TRACK_W / 2 + 2.5
wgt = 1 - ss(half, half + shoulder, d)
# berms on the outside of the edge
berm = np.exp(-((d - half - 1.5) / 1.6) ** 2) * 0.9 * (d < 90)
Hc = nat * (1 - wgt) + road_h * wgt + berm * (1 - wgt * 0.5)
# punch the lava gap below the jump
gapmask = gap[idx] & (d < half + 6)
Hc = np.where(gapmask, np.minimum(Hc, th[idx] - 9), Hc)
H = np.where(d < 1e8, Hc, H)

# soften the very top of the spectrum to avoid aliasing
H = gaussian_filter(H, 0.6)

# ------------------------------------------------------------- lava surfaces
riv_out = []
for rv in rivers:
    p = rv['path']
    # lava surface follows channel bottom, monotonically descending
    bottom = sample(H, p[:, 0], p[:, 1])
    surf = np.minimum.accumulate(gaussian_filter(bottom, 4)) + 1.8
    riv_out.append(dict(points=[[round(float(a), 2), round(float(h), 2), round(float(b), 2)]
                                for (a, b), h in zip(p[::2], surf[::2])],
                        width=[round(float(w) + 4, 2) for w in np.array(rv['width'])[::2]]))

# ------------------------------------------------------------- masks
print('masks')
glow = np.clip(1 - lava_dist / 60.0, 0, 1)
road = 1 - ss(TRACK_W / 2 - 1, TRACK_W / 2 + 7, d)
burn = np.clip(1 - lava_dist / 25.0, 0, 1)
m = np.stack([glow, road, burn], -1)
Image.fromarray((m * 255).astype(np.uint8)).resize((2048, 2048), Image.BILINEAR).save(f'{OUT}/masks.png')

H.astype(np.float32).tofile(f'{OUT}/height.bin')

# start grid: 40 m after index 0 heading along +s
start_i = 30
track = dict(
    extent=EXTENT, grid=GRID, width=TRACK_W, length=LEN,
    centre=[[round(float(C[i, 0]), 2), round(float(th[i]), 3), round(float(C[i, 1]), 2),
             round(float(bank[i]), 4), int(gap[i])] for i in range(NC)],
    start=start_i, jump=cross,
    rivers=riv_out,
    lake=dict(x=float(lake_c[0]), z=float(lake_c[1]), r=lake_r, y=lake_level),
    peak=PEAK,
)
json.dump(track, open(f'{OUT}/track.json', 'w'))

# preview
prev = (H - H.min()) / (H.max() - H.min())
img = np.stack([prev] * 3, -1)
img[road > 0.5] = [1, 0.8, 0.2]
img[lava_dist < 0] = [1, 0.2, 0]
Image.fromarray((img * 255).astype(np.uint8)).resize((1024, 1024)).save('/tmp/claude-0/world_preview.png')
print('done', H.min(), H.max())
