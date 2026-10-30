"""Bakes Kai'ele, the Hawaiian island: terrain heightmap, surface masks and track data.

Outputs to public/world/kaiele/:
  height.u16   heights (hmin..hmax in track.json), GRID x GRID, row-major (z rows, x columns)
  masks.png    R = lava glow proximity, G = track/road influence, B = burn (same layout as the volcano world)
  biome.png    R = sand, G = sand whiteness (0 black, 1 white), B = vegetation density, A = bare lava rock
  track.json   the tracks (centrelines, start, laps, per-row surface), water, set-piece anchors, buildings

Frame: x east, +z south, y up, sea level at y = 0, origin at the island centre.
An active shield volcano fills the east half (summit near SUMMIT_XZ), the older green west hills are fluted
by erosion, a rainforest valley with a river and a 60 m waterfall runs south between them to a bay, a black
sand beach lines the south coast, and sea cliffs, a reef shelf and a white-sand cove line the north shore.

The lava rounds (Kula Pele, Ahi i ke Kai) live in tools/kaiele_lava.py: its shape(ctx) runs after the base
relief and owns the volcano's south-east flank and summit lake; its tracks(ctx) adds their track dicts; its
optional masks(ctx) may adjust the biome and glow layers before they are written.

    python tools/island.py
"""
import importlib.util
import json
import math
import os
from types import SimpleNamespace

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, gaussian_filter1d, uniform_filter1d, distance_transform_edt
from scipy.spatial import cKDTree

HERE = os.path.dirname(__file__)
OUT = os.environ.get('WORLD_OUT') or os.path.join(HERE, '..', 'public', 'world', 'kaiele')
PREV = os.environ.get('PREVIEW_OUT') or '/tmp/claude-0'
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREV, exist_ok=True)

EXTENT = 4096.0          # metres across
GRID = 2049              # samples per side (2 m spacing)
RES = EXTENT / (GRID - 1)
HALF = EXTENT / 2

xs = np.linspace(-HALF, HALF, GRID)
X, Z = np.meshgrid(xs, xs)
pts_all = np.stack([X.ravel(), Z.ravel()], 1)

# surface ids per track row (the game maps these to grip, drag, dust and sound)
SURF = dict(gravel=0, sand=1, wet_sand=2, lava_rock=3, red_dirt=4, mud=5, wet_rock=6, timber=7, grass=8,
            reef=9, white_sand=10, asphalt=11)


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
    fx = (np.asarray(x, float) + HALF) / RES
    fz = (np.asarray(z, float) + HALF) / RES
    ix = np.clip(np.floor(fx).astype(int), 0, GRID - 2)
    iz = np.clip(np.floor(fz).astype(int), 0, GRID - 2)
    tx, tz = fx - ix, fz - iz
    a = H[iz, ix] * (1 - tx) + H[iz, ix + 1] * tx
    b = H[iz + 1, ix] * (1 - tx) + H[iz + 1, ix + 1] * tx
    return a * (1 - tz) + b * tz


def polyline(pts, step=3.0):
    pts = np.asarray(pts, float)
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for t in np.linspace(0, 1, n + 1)[1:]:
            out.append(a + (b - a) * t)
    return np.array(out)


def catmull(P, closed, step=1.0):
    P = np.asarray(P, float)
    n = len(P)
    out = []
    segs = range(n) if closed else range(n - 1)
    for i in segs:
        if closed:
            p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        else:
            p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, n - 1)]
        m = max(2, int(np.linalg.norm(p2 - p1) / 0.5))
        for t in np.linspace(0, 1, m, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    out = np.array(out)
    ring = np.vstack([out, out[:1]]) if closed else out
    seg = np.linalg.norm(np.diff(ring, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    ts = np.arange(0, L, step)
    ox = np.interp(ts, s, ring[:, 0])
    oz = np.interp(ts, s, ring[:, 1])
    return np.stack([ox, oz], 1), L


def smooth(v, k, closed):
    if closed:
        pad = np.concatenate([v[-k:], v, v[:k]])
        return uniform_filter1d(pad, k, mode='nearest')[k:-k]
    return uniform_filter1d(v, k, mode='nearest')


def grade_limit(th, g, closed):
    """Closest g-Lipschitz profile: mean of the upper and lower envelopes (each is g-Lipschitz)."""
    n = len(th)
    v = np.concatenate([th, th, th]) if closed else th.copy()
    up, lo = v.copy(), v.copy()
    for i in range(1, len(v)):
        up[i] = min(up[i], up[i - 1] + g)
        lo[i] = max(lo[i], lo[i - 1] - g)
    for i in range(len(v) - 2, -1, -1):
        up[i] = min(up[i], up[i + 1] + g)
        lo[i] = max(lo[i], lo[i + 1] - g)
    return ((up + lo) / 2)[n:2 * n] if closed else (up + lo) / 2


def grade_limit_pinned(v, g, pin, P, closed=False):
    """Closest profile within grade g per metre that passes through the pinned heights P[pin]."""
    n = len(v)
    reps = 3 if closed else 1
    vv, pp, PP = np.tile(v, reps), np.tile(pin, reps), np.tile(P, reps)
    U = np.where(pp, PP, np.inf)
    L = np.where(pp, PP, -np.inf)
    for _ in range(2):
        for i in range(1, len(vv)):
            if not pp[i]:
                U[i] = min(U[i], U[i - 1] + g)
                L[i] = max(L[i], L[i - 1] - g)
        for i in range(len(vv) - 2, -1, -1):
            if not pp[i]:
                U[i] = min(U[i], U[i + 1] + g)
                L[i] = max(L[i], L[i + 1] - g)
    f = np.clip(vv, L, U)
    up_, lo_ = f.copy(), f.copy()
    for i in range(1, len(f)):
        up_[i] = min(up_[i], up_[i - 1] + g)
        lo_[i] = max(lo_[i], lo_[i - 1] - g)
    for i in range(len(f) - 2, -1, -1):
        up_[i] = min(up_[i], up_[i + 1] + g)
        lo_[i] = max(lo_[i], lo_[i + 1] - g)
    f = np.clip((up_ + lo_) / 2, L, U)
    f[pp] = PP[pp]
    return f[n:2 * n] if closed else f


def frames(C, closed):
    ext = np.vstack([C[-2:], C, C[:2]]) if closed else np.vstack([C[:1], C[:1], C, C[-1:], C[-1:]])
    T = np.gradient(ext, axis=0)[2:-2]
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    Nrm = np.stack([-T[:, 1], T[:, 0]], 1)
    ang = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
    curv = np.gradient(ang)
    curv = smooth(curv, 41, closed)
    return T, Nrm, curv


def dist_to(path, max_d=400.0):
    """Distance from every grid sample to a polyline, and the index of the nearest path point."""
    d, idx = cKDTree(path).query(pts_all, distance_upper_bound=max_d)
    d = np.where(np.isfinite(d), d, max_d).reshape(X.shape)
    idx = np.minimum(idx, len(path) - 1).reshape(X.shape)
    return d, idx


def rasterize(poly):
    """Inside mask of a closed polygon in world coords."""
    img = Image.new('L', (GRID, GRID), 0)
    pix = [((x + HALF) / RES, (z + HALF) / RES) for x, z in poly]
    ImageDraw.Draw(img).polygon(pix, fill=1)
    return np.array(img, bool)


# ------------------------------------------------------------- coastline
print('coast')
SUMMIT_XZ = (850.0, -200.0)
CRATER_R = 140.0
# Coast control points, clockwise from the west (x, z). South coast: the black-sand beach (x -1300..-250, z ~1520)
# with the lava-rock point at its west end, the river bay at x ~150. North shore: cliffs from x -1800 to 100,
# the reef shelf x 300..950, the white-sand cove x 1000..1400. East: the volcano runs into the sea.
COAST_CP = [
    (-1800, 150), (-1730, -250), (-1790, -620), (-1700, -980), (-1790, -1260), (-1760, -1430), (-1650, -1520),
    (-1480, -1580), (-1300, -1640), (-1000, -1655), (-700, -1665), (-400, -1652), (-150, -1645), (60, -1650),
    (250, -1640), (450, -1628), (700, -1632), (900, -1640), (980, -1690), (1060, -1730), (1180, -1745),
    (1320, -1730), (1430, -1690), (1530, -1600), (1640, -1380), (1760, -1120), (1850, -750), (1890, -300),
    (1860, 150), (1800, 600), (1690, 1000), (1520, 1330), (1300, 1590), (1060, 1720), (800, 1730), (520, 1680),
    (330, 1690), (220, 1760), (120, 1790), (40, 1740), (-100, 1600), (-250, 1545), (-500, 1530), (-800, 1532),
    (-1100, 1530), (-1180, 1560), (-1250, 1615), (-1330, 1590), (-1380, 1500), (-1500, 1380), (-1620, 1150),
    (-1700, 800), (-1760, 480),
]
coast, _ = catmull(COAST_CP, True, step=2.0)
# fine wobble along the coast so it isn't a smooth curve, weaker on the beaches
cT, cN, _ = frames(coast, True)
cs = np.arange(len(coast)) * 2.0
wob = (np.sin(cs / 37.0) * 6 + np.sin(cs / 13.0 + 1.3) * 2.5 + np.sin(cs / 91.0 + 2.1) * 12)
beachy = np.array([1.0 if (z > 1450 and -1150 < x < -150) or (z < -1600 and 1000 < x < 1450) else 0.0 for x, z in coast])
beachy = smooth(beachy, 61, True)
coast = coast + cN * (wob * (1 - 0.85 * beachy))[:, None]
land = rasterize(coast)
sd = distance_transform_edt(land) * RES - distance_transform_edt(~land) * RES   # + inland, - at sea
coast_d, coast_i = dist_to(coast, 600)

n_big = spectral(2.8, 1.5, seed=1)
n_mid = spectral(2.2, 8, seed=2)
n_fine = spectral(1.8, 60, seed=3)
# coast types (weights by place): north cliffs, the reef shelf in front of the north-east shore, and beaches
w_cliff = ss(-600, -1150, Z + n_big * 60) * (1 - ss(-100, 500, X + n_big * 80)) * ss(-1950, -1850, X)
w_reef = ss(-1200, -1450, Z) * ss(230, 330, X) * (1 - ss(940, 1010, X))
w_south_beach = ss(1300, 1420, Z) * ss(-1220, -1150, X) * (1 - ss(-200, -80, X))
w_cove = ss(-1300, -1500, Z) * ss(990, 1060, X) * (1 - ss(1420, 1520, X))
w_bay = ss(1500, 1600, Z) * ss(-60, 20, X) * (1 - ss(420, 520, X))
w_beach = np.maximum.reduce([w_south_beach, w_cove, w_bay])
w_point = np.exp(-(((X + 1270) / 110) ** 2 + ((Z - 1540) / 90) ** 2))     # the lava-rock point

# ------------------------------------------------------------- base relief
print('relief')
# coastal lowland: rises gently from the shore; dunes behind the beaches; cliffs jump straight up
low = 0.045 * np.clip(sd, 0, None) + 3 * np.tanh(np.clip(sd, 0, None) / 40)
dunes = (0.5 + 0.5 * np.sin((X * 0.8 + Z * 0.2) / 23 + n_mid * 1.5)) * 2.2 * ss(15, 60, sd) * (1 - ss(120, 220, sd))
low = low + dunes * w_beach
beach_h = np.where(sd > 0, np.minimum(0.022 * sd, 2.6) + ss(70, 160, sd) * 2, 0)
low = low * (1 - w_beach) + (beach_h + dunes) * w_beach
CLIFF_H = 82.0
cliff_prof = CLIFF_H * ss(0, 14, sd + n_mid * 3) + 0.02 * np.clip(sd, 0, None)
low = low * (1 - w_cliff) + cliff_prof * w_cliff

# the volcano: a broad shield, gentler than the volcano world's cone, with radial flow ridges
dv = np.hypot(X - SUMMIT_XZ[0], Z - SUMMIT_XZ[1])
Av = np.arctan2(Z - SUMMIT_XZ[1], X - SUMMIT_XZ[0])
dvw = dv * (1 + n_big * 0.05)
SHIELD = 760.0
shield = SHIELD * np.clip(1 - dvw / 2150, 0, 1) ** 1.75
flutes = 0
for k, (freq, amp) in enumerate([(23, 1.0), (47, 0.5), (89, 0.3)]):
    ph = spectral(2.6, 1, seed=10 + k) * 1.0
    flutes = flutes + amp * (1 - np.abs(np.sin(Av * freq / 2 + ph + np.log1p(dv / 300) * 0.6))) ** 4
shield += flutes * 9 * ss(200, 500, dv) * (1 - ss(1500, 2000, dv))
# summit caldera: a flat-floored pit (the lava lake belongs to kaiele_lava.py)
SUMMIT_Y = float(SHIELD) - 30
shield = np.minimum(shield, SUMMIT_Y + 0.02 * dv)
pit = 75 * np.clip(1 - (dv / CRATER_R) ** 6, 0, 1)
shield = shield - pit + 4 * np.exp(-((dv - CRATER_R - 6) / 8) ** 2)

# the west hills: an old eroded volcano, cut into knife ridges and amphitheatre valleys. Ridged noise, warped
# and stretched down the fall line, so the ridges radiate loosely from two old summits instead of a star
dw = np.minimum(np.hypot((X + 1080) / 1.15, (Z + 420) / 0.95), np.hypot((X + 700) / 1.0, (Z + 900) / 1.1) + 120)
hills = 480 * np.clip(1 - dw / 1150, 0, 1) ** 1.3
wx, wz = spectral(2.6, 2, seed=24) * 90, spectral(2.6, 2, seed=25) * 90
gx_, gz_ = np.gradient(gaussian_filter(hills, 30))
gl = np.hypot(gx_, gz_) + 1e-6
fx_, fz_ = gx_ / gl, gz_ / gl                       # fall-line direction
rid = np.zeros_like(X)
for k, (sc_, amp) in enumerate([(9, 1.0), (17, 0.55), (33, 0.3)]):
    base = spectral(2.3, sc_, seed=20 + k)
    # stretch along the fall line by sampling a smoothed copy: ridges run downhill
    v = gaussian_filter(base, (4 + 3 * k))
    v = sample(v, X + wx + fz_ * 0, Z + wz)
    rid += amp * (1 - np.abs(v / (np.abs(v).max() + 1e-6) * 2.2)).clip(0, 1) ** 2
rid /= 1.85
ang = np.arctan2(Z + 420 + wz, X + 1080 + wx)
flute = (1 - np.abs(np.sin(ang * 13 + spectral(2.4, 1, seed=23) * 2.0 + dw / 180))) ** 3
hills = hills * (0.4 + 0.45 * rid + 0.35 * flute * ss(150, 500, dw)) * (1 + n_mid * 0.06)
# a low saddle of rolling uplands between the hills and the shield
uplands = 120 * np.exp(-((X - 0) / 900) ** 2 - ((Z + 200) / 1300) ** 2) * (1 + n_big * 0.3)

def smax(a, b, k=30.0):
    m = np.maximum(a, b)
    return m + k * np.log(np.exp((a - m) / k) + np.exp((b - m) / k))


mtn = smax(smax(shield, hills), uplands)
fade = np.where(w_cliff > 0.5, ss(-20, 120, sd), ss(60, 600, sd))
fade = np.maximum(fade * (1 - w_beach) + ss(220, 700, sd) * w_beach, 0)
H = low + np.clip(mtn - low, 0, None) * fade
H += n_big * 14 * ss(0, 300, sd) + n_mid * 3 * ss(0, 60, sd) + n_fine * 0.5
# the lava-rock point: a hump of old black lava pushed out into the sea, with tide pools carved later
H = H + w_point * 6 * (0.6 + 0.4 * n_mid)

# ------------------------------------------------------------- the sea floor
sea = sd < 0
depth = 1.0 + 38 * ss(0, 500, -sd) + n_mid * 1.2 * ss(0, 50, -sd)
floor = -depth
# beaches shelve gently; the reef is a wide flat shelf just awash at low tide; the cliffs drop into deep water
floor = floor * (1 - w_beach) + (-0.5 - 0.012 * np.clip(-sd, 0, None) - 30 * ss(250, 700, -sd)) * w_beach
reef = -0.25 + n_mid * 0.18 + n_fine * 0.05 - 25 * ss(110, 220, -sd)
floor = floor * (1 - w_reef) + reef * w_reef
floor = floor - w_cliff * 14 * ss(0, 30, -sd)
# deep enough for later water races out in the bay and off the beach
H = np.where(sea, floor, H)
H = np.where(np.abs(sd) < 8, gaussian_filter(H, 2), H)

# ------------------------------------------------------------- the river valley and waterfall
print('valley')
# Wailele: rises on the uplands north of the falls, drops 60 m over the falls into a plunge pool, runs south
# down a gorge and then a broad valley floor to the bay
RIVER_CP = [(160, -1050), (140, -850), (120, -620), (110, -420), (100, -320), (100, -290), (95, -200), (110, -60),
            (85, 120), (110, 320), (125, 520), (100, 700), (130, 900), (115, 1100), (150, 1300), (170, 1500),
            (180, 1700), (190, 1900)]
river, _ = catmull(RIVER_CP, False, step=2.0)
rs = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(river, axis=0), axis=1))])
FALL_S = float(rs[np.argmin(np.linalg.norm(river - [100, -305], axis=1))])
POOL_Y = 168.0
FALL_H = 60.0
river_y = np.where(rs < FALL_S, POOL_Y + FALL_H + (FALL_S - rs) * 0.035,
                   POOL_Y * (1 - ss(FALL_S, rs[-1] - 200, rs) ** 0.85))
river_y = np.where(rs > rs[-1] - 300, np.minimum(river_y, 0.4 - (rs - (rs[-1] - 300)) * 0.01), river_y)
river_y[river_y < 0.3] = np.minimum(river_y[river_y < 0.3], 0.3)
rd, ri = dist_to(river, 900)
r_s = rs[ri]
ry = river_y[ri]
# the uplands around the head of the valley sit a little above the top of the falls
head = (Z + 300) - 0.0016 * (X - 100) ** 2          # amphitheatre: the headwall curves round the pool
dfall = np.hypot(X - 100, Z + 305)
plateau = POOL_Y + FALL_H + 4 + n_mid * 2 + np.clip(-head, 0, None) * 0.03
H = np.where(dfall < 700, H + (np.maximum(H, plateau) - H) * (1 - ss(350, 700, dfall)), H)
# below the falls: a deep valley whose walls start at the headwall; channel width grows downstream
zf = Z + 290                                         # metres south of the plunge pool (the river runs south)
cw = 8 + 10 * ss(0, 1800, zf)
gorge = np.exp(-((zf - 160) / 240) ** 2)
wall_w = 520 - 360 * gorge
floor_y = POOL_Y * (1 - ss(-100, 2100, Z + n_big * 40) ** 0.85)
floor_y = floor_y + (ry + 0.5 - floor_y) * (1 - ss(cw, cw + 60, rd))
valley_h = floor_y + 1.5 + 22 * ss(cw, cw + 16, rd) * gorge + (rd - cw).clip(0) * (0.04 + 0.12 * ss(0, wall_w, rd))
valley_h = valley_h + (H - valley_h) * ss(wall_w * 0.3, wall_w, rd) ** 2
wv = ss(-12, 40, head)                                   # steep headwall, then the full valley
H = np.where(rd < wall_w, H + (np.minimum(H, valley_h) - H) * wv, H)
# the channel itself, and the plunge pool under the falls
chan = ry - 1.6 * (1 - ss(cw * 0.3, cw, rd))
H = np.where((rd < cw) & (r_s > FALL_S), np.minimum(H, chan), H)
dpool = np.hypot(X - 100, Z + 290)
H = np.where(dpool < 34, np.minimum(H, POOL_Y - 3.5 + ss(10, 34, dpool) * 4), H)
# above the lip the river runs in a shallow notch across the uplands
above = (r_s < FALL_S) & (rd < 70)
H = np.where(above, np.minimum(H, ry + 0.8 + ss(cw * 0.5, 70, rd) ** 1.5 * (8 + 6 * n_mid) + np.clip(H - ry, 0, None) * ss(25, 70, rd)), H)
# a tributary creek from the west joins the river below the mill (the ford on Wailele Nahele crosses it)
CREEK_CP = [(-420, 330), (-300, 420), (-200, 470), (-110, 500), (-20, 530), (90, 555)]
creek, _ = catmull(CREEK_CP, False, step=2.0)
cs_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(creek, axis=0), axis=1))])
creek_join = float(sample(H, [creek[-1, 0]], [creek[-1, 1]])[0])
creek_y = creek_join + (cs_[-1] - cs_) * 0.035
cd, ci = dist_to(creek, 200)
cy = creek_y[ci]
H = np.where(cd < 45, np.minimum(H, cy + 0.3 + ss(6, 45, cd) ** 1.5 * 9 + (cd > 6) * 0.4 + np.clip(H - cy, 0, None) * ss(10, 45, cd)), H)
H = np.where(cd < 7, np.minimum(H, cy - 0.5 * (1 - cd / 7)), H)

H = np.where(sd > 0, np.maximum(H, 0.25 + np.minimum(sd, 60) * 0.012), H)

# ------------------------------------------------------------- lava rounds hook (volcano flank, summit lake)
ctx = SimpleNamespace(H=H, X=X, Z=Z, EXTENT=EXTENT, GRID=GRID, RES=RES, HALF=HALF, spectral=spectral, ss=ss,
                      sample=sample, catmull=catmull, smooth=smooth, grade_limit=grade_limit,
                      grade_limit_pinned=grade_limit_pinned, frames=frames, polyline=polyline,
                      SUMMIT_XZ=SUMMIT_XZ, CRATER_R=CRATER_R, SUMMIT_Y=SUMMIT_Y, sd=sd, SURF=SURF,
                      LAKE=dict(x=SUMMIT_XZ[0], z=SUMMIT_XZ[1], r=CRATER_R - 25, y=SUMMIT_Y - 70), TRACKS=[])
lava_mod = None
lp = os.path.join(HERE, 'kaiele_lava.py')
if os.path.exists(lp):
    spec = importlib.util.spec_from_file_location('kaiele_lava', lp)
    lava_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lava_mod)
lava_out = {}
if lava_mod and hasattr(lava_mod, 'shape'):
    print('lava shape (kaiele_lava.py)')
    lava_out = lava_mod.shape(ctx) or {}
    H = ctx.H
lava_rivers = []
extra = dict(lava_out.get('extra', {}))

# ------------------------------------------------------------- tracks
print('tracks')
TRACKS = ctx.TRACKS


def make_track(tid, name, cp, closed, width, laps, grade, smooth_k=(121, 61), pre_smooth=0, **kw):
    C, L = catmull(cp, closed)
    if pre_smooth:
        C = gaussian_filter1d(C, pre_smooth, axis=0, mode='wrap' if closed else 'nearest')
        C, L = catmull(C[::4], closed)
    ground = sample(gaussian_filter(H, 3), C[:, 0], C[:, 1])
    th = smooth(smooth(ground, smooth_k[0], closed), smooth_k[1], closed)
    t = dict(id=tid, name=name, region='kaiele', kind='circuit' if closed else 'sprint', closed=closed, C=C, th=th,
             ground=ground, gap=np.zeros(len(C), bool), width=width, start=20, laps=laps, bankK=10, grade=grade,
             surf=np.zeros(len(C), int), json={})
    t.update(kw)
    return t


def rows_near(C, p, r):
    return np.where(np.linalg.norm(C - np.asarray(p, float), axis=1) < r)[0]


def nearest_row(C, p):
    return int(np.argmin(np.linalg.norm(C - np.asarray(p, float), axis=1)))


def ring(C, a, b):
    """Row indices from a to b going forwards round a closed track."""
    n = len(C)
    return np.arange(a, b + (n if b < a else 0) + 1) % n


def finish_heights(t, pins=()):
    """Grade-limit the road profile, holding pinned (rows, heights) exactly."""
    n = len(t['C'])
    pin = np.zeros(n, bool)
    P = np.zeros(n)
    for rows, hs in pins:
        pin[rows] = True
        P[rows] = hs
    th = t['th']
    if pin.any():
        th = grade_limit_pinned(th, t['grade'], pin, P, t['closed'])
    else:
        th = grade_limit(th, t['grade'], t['closed'])
    near = np.convolve(np.tile(pin.astype(float), 3), np.ones(41) / 41, mode='same')[n:2 * n]
    sm = smooth(th, 31, t['closed'])
    th = th + (sm - th) * np.clip(1 - near * 3, 0, 1) * ~pin
    t['th'] = th
    t['pin'] = pin


# --- Round 1: Kahakai ʻEleʻele, the black-sand beach circuit (2.4 km, 3 laps)
KAHAKAI_CP = [
    (-1140, 1300), (-1000, 1286), (-850, 1280), (-700, 1284), (-560, 1292), (-440, 1300),        # harbour road
    (-360, 1322), (-318, 1366), (-352, 1410), (-312, 1450), (-250, 1474),                          # palm esses
    (-238, 1494), (-300, 1506), (-450, 1508), (-620, 1505), (-800, 1509), (-980, 1506), (-1120, 1510),  # surf line
    (-1205, 1540), (-1262, 1530), (-1285, 1480), (-1258, 1430),                                    # lava-rock point
    (-1230, 1390), (-1200, 1340),                                                                  # boat ramp jump
]
k = make_track('kahakai', 'Kahakai ʻEleʻele', KAHAKAI_CP, True, 16.0, 3, 0.06, pre_smooth=5)
C = k['C']
# the beach run hugs the waterline: hold the road on the sand just above the swash
beach_rows = np.where((C[:, 1] > 1495) & (C[:, 0] > -1150) & (C[:, 0] < -280))[0]
gnd = sample(H, C[:, 0], C[:, 1])
k['th'] = np.where(np.isin(np.arange(len(C)), beach_rows), np.maximum(gnd, 0.9), k['th'])
# boat-ramp jump: a kicker up the old timber slipway, over the tidal channel, landing on the harbour road
ramp_i = nearest_row(C, (-1228, 1392))
JUMP_GAP = 16
rel = np.arange(len(C)) - ramp_i
k['gap'] = (rel > 0) & (rel < JUMP_GAP)
kick = (rel > -36) & (rel <= 0)
k['jump'] = ramp_i
surf = np.full(len(C), SURF['gravel'])
surf[(C[:, 0] > -440) & (C[:, 1] > 1320)] = SURF['sand']
surf[beach_rows] = SURF['wet_sand']
surf[(C[:, 0] < -1150) & (C[:, 1] > 1400)] = SURF['lava_rock']
surf[kick] = SURF['timber']
k['surf'] = surf
pins = []
base_y = float(np.mean(gnd[(rel > -60) & (rel < 40)]))
pins.append((np.where(kick)[0], base_y + 0.6 + ss(-36, 0, rel[kick]) * 2.6))
land_rows = np.where((rel >= JUMP_GAP) & (rel < JUMP_GAP + 30))[0]
pins.append((land_rows, base_y + 1.6 - ss(JUMP_GAP, JUMP_GAP + 30, rel[land_rows]) * 0.8))
pins.append((beach_rows, np.maximum(gnd[beach_rows], 0.9)))
finish_heights(k, pins)
k['json'].update(surfLine=[int(beach_rows.min()), int(beach_rows.max())], rampRow=int(ramp_i))
TRACKS.append(k)

# --- Round 2: Wailele Nahele, the rainforest waterfall circuit (3.0 km, 3 laps)
LIP_X, LAND_X, JUMP_Z = 80.0, 122.0, -236.0
WAILELE_CP = [
    (-25, 430), (-38, 300), (-52, 170), (-70, 60),                                   # mill straight, heading north
    (-130, -10), (-230, -50), (-300, -48), (-322, -80), (-290, -118),                  # red-dirt climb, hairpin
    (-200, -150), (-110, -190), (-30, -222), (30, -234), (LIP_X, JUMP_Z),              # up to the gorge lip
    (LAND_X, JUMP_Z), (170, -232), (225, -205), (262, -130),                           # over the gorge in front of the falls
    (268, -20), (290, 100), (282, 230), (258, 360), (240, 480), (215, 590),            # canopy tunnel, downhill
    (170, 640), (110, 650), (50, 646),                                                 # rail trestle over the river
    (-20, 625), (-80, 590), (-112, 540), (-105, 490), (-70, 455),                      # river ford (creek) and back
]
w = make_track('wailele', 'Wailele Nahele', WAILELE_CP, True, 12.0, 3, 0.11, smooth_k=(61, 31), pre_smooth=4)
C = w['C']
n = len(C)
lip = nearest_row(C, (LIP_X, JUMP_Z))
land = nearest_row(C, (LAND_X, JUMP_Z))
gap_rows = ring(C, lip + 1, land - 1)
w['gap'][gap_rows] = True
w['jump'] = lip
gnd = sample(H, C[:, 0], C[:, 1])
LIP_Y = POOL_Y + 24.0
pins = [(ring(C, lip - 30, lip), LIP_Y - 1.8 + ss(-30, 0, np.arange(-30, 1)) * 1.8),
        (gap_rows, np.linspace(LIP_Y, LIP_Y - 2.5, len(gap_rows))),
        (ring(C, land, land + 25), LIP_Y - 2.8 - np.arange(26) * 0.03)]
# the trestle: level deck over the river, the ground cut away beneath it
tr_mid = nearest_row(C, (110, 650))
tr_rows = ring(C, tr_mid - 32, tr_mid + 32)
tr_y = float(river_y[np.argmin(np.linalg.norm(river - C[tr_mid], axis=1))]) + 11.0
pins.append((tr_rows, np.full(len(tr_rows), tr_y)))
w['bridge'] = [int(tr_mid - 26), int(tr_mid + 26)]
w['gap'][ring(C, tr_mid - 26, tr_mid + 26)] = True
# the ford: dip the road to the creek bed
fd = nearest_row(C, (-111, 515))
fd_y = float(creek_y[np.argmin(np.linalg.norm(creek - C[fd], axis=1))])
pins.append((ring(C, fd - 6, fd + 6), np.full(13, fd_y - 0.35)))
finish_heights(w, pins)
surf = np.full(n, SURF['red_dirt'])
surf[ring(C, nearest_row(C, (-25, 430)), nearest_row(C, (-70, 60)))] = SURF['gravel']
surf[ring(C, lip - 30, lip)] = SURF['wet_rock']
surf[ring(C, tr_mid - 32, tr_mid + 32)] = SURF['timber']
surf[ring(C, fd - 30, fd + 30)] = SURF['mud']
w['surf'] = surf
w['json'].update(lipRow=int(lip), landRow=int(land), trestle=[int(tr_mid - 32), int(tr_mid + 32)], fordRow=int(fd),
                 gorge=dict(lip=int(lip), land=int(land), lipY=round(LIP_Y, 2)))
TRACKS.append(w)

# --- Round 3: Pali Kai, the north-shore sea-cliff sprint (4.2 km)
# Six legs stacked down the steep grass face at the east end of the cliffs, joined by five hairpins
desc = []
legs_z = [-1475, -1503, -1531, -1559, -1587, -1615]
for k_, zz in enumerate(legs_z):
    xa, xb = (110, 300) if k_ % 2 == 0 else (300, 110)
    for t_ in np.linspace(0, 1, 9)[(1 if k_ else 0):]:
        desc.append((xa + (xb - xa) * t_, zz))
    if k_ + 1 < len(legs_z):
        cx, cz, r_ = xb, (zz + legs_z[k_ + 1]) / 2, abs(legs_z[k_ + 1] - zz) / 2
        sgn = 1 if xb > xa else -1
        for th_ in np.linspace(0, math.pi, 9)[1:-1]:
            desc.append((cx + sgn * r_ * math.sin(th_) + sgn * 6, cz - r_ * math.cos(th_)))
PALI_CP = [(-1660, -1395), (-1560, -1418), (-1450, -1452), (-1330, -1488), (-1200, -1512), (-1060, -1520),
           (-920, -1534), (-780, -1526), (-640, -1542), (-500, -1556), (-360, -1544), (-220, -1556), (-90, -1552),
           (20, -1520), (70, -1490)] + desc + [
           (420, -1655), (560, -1676), (700, -1690), (840, -1690), (950, -1700),         # reef flats
           (1000, -1702), (1040, -1700),                                                 # sea arch launch
           (1110, -1688), (1200, -1668), (1290, -1640), (1360, -1600), (1420, -1555), (1470, -1520)]
p = make_track('palikai', 'Pali Kai', PALI_CP, False, 13.0, 1, 0.13, smooth_k=(41, 21))
C = p['C']
n = len(C)
gnd = sample(H, C[:, 0], C[:, 1])
pins = []
# the cliff-top road runs on the plateau; the descent drops down the face; the reef road sits just awash
top_rows = np.where(C[:, 0] < 60)[0]
pins.append((top_rows[::40], np.maximum(sample(gaussian_filter(H, 4), C[top_rows[::40], 0], C[top_rows[::40], 1]), CLIFF_H - 4)))
reef_rows = np.where((C[:, 0] > 340) & (C[:, 0] < 975))[0]
pins.append((reef_rows, np.full(len(reef_rows), 0.55)))
arch_i = nearest_row(C, (995, -1702))
ARCH_GAP = 14
rel = np.arange(n) - arch_i
kick = (rel > -28) & (rel <= 0)
pins.append((np.where(kick)[0], 0.55 + ss(-28, 0, rel[kick]) * 3.4))
p['gap'] = (rel > 0) & (rel < ARCH_GAP)
p['jump'] = arch_i
cove_rows = np.where(rel >= ARCH_GAP)[0]
pins.append((cove_rows[:20], np.linspace(2.4, 1.4, 20)))
finish_heights(p, pins)
surf = np.full(n, SURF['grass'])
surf[(C[:, 0] > -1450) & (C[:, 0] < 80)] = SURF['gravel']
desc_rows = np.where((C[:, 0] >= 80) & (C[:, 0] <= 340) & (rel < 0))[0]
surf[desc_rows] = SURF['gravel']
surf[reef_rows] = SURF['reef']
surf[kick] = SURF['wet_rock']
surf[cove_rows] = SURF['white_sand']
p['surf'] = surf
p['runout'] = 60
p['json'].update(archRow=int(arch_i), reef=[int(reef_rows.min()), int(reef_rows.max())],
                 descent=[int(desc_rows.min()), int(desc_rows.max())])
TRACKS.append(p)

if lava_mod and hasattr(lava_mod, 'tracks'):
    print('lava tracks (kaiele_lava.py)')
    for t in lava_mod.tracks(ctx) or []:
        t.setdefault('region', 'kaiele')
        t.setdefault('surf', np.zeros(len(t['C']), int))
        t.setdefault('json', {})
        TRACKS.append(t)
    H = ctx.H

for t in TRACKS:
    t['T'], t['N'], curv = frames(t['C'], t['closed'])
    t['bank'] = np.clip(curv * t['bankK'], -0.08, 0.08)
    t['len'] = float(len(t['C']))
    print(f"  {t['id']}: {len(t['C'])} m, height {t['th'].min():.1f}..{t['th'].max():.1f}")

# ------------------------------------------------------------- Kahakai fishing village plots
print('village')
keep = np.concatenate([~t.get('skip', np.zeros(len(t['C']), bool)) for t in TRACKS])
allC = np.vstack([t['C'] for t in TRACKS])[keep]
allW = np.concatenate([np.full(len(t['C']), t['width']) for t in TRACKS])[keep]
allH = np.concatenate([t['th'] for t in TRACKS])[keep]
road_tree = cKDTree(allC)
brng = np.random.default_rng(11)
buildings = []


def footprint(x, z, yaw, w_, d_):
    c, s = math.cos(yaw), math.sin(yaw)
    return np.array([(x + c * a + s * b, z - s * a + c * b) for a in np.linspace(-w_ / 2, w_ / 2, 5)
                     for b in np.linspace(-d_ / 2, d_ / 2, 5)])


def clear_of(fp, r):
    d, i = road_tree.query(fp)
    return np.all(d > allW[i] / 2 + r)


kt = TRACKS[0]
Ck, Nk = kt['C'], kt['N']
for i in range(0, len(Ck), 3):
    x0, z0 = Ck[i]
    if not (-1100 < x0 < -450 and z0 < 1310):
        continue
    for side in (-1, 1):
        if brng.random() < 0.35:
            continue
        w_, d_ = brng.uniform(6, 10), brng.uniform(5, 8)
        sb = kt['width'] / 2 + brng.uniform(3.0, 7.0) + d_ / 2
        x, z = Ck[i] + Nk[i] * side * sb
        yaw = math.atan2(-Nk[i][0] * side, -Nk[i][1] * side) + brng.uniform(-0.08, 0.08)
        fp = footprint(x, z, yaw, w_ + 2, d_ + 2)
        if not clear_of(fp, 1.5) or sample(sd, [x], [z])[0] < 25:
            continue
        if any(abs(b['x'] - x) < 16 and abs(b['z'] - z) < 16 and
               np.min(np.hypot(*(footprint(b['x'], b['z'], b['yaw'], b['w'] + 2, b['d'] + 2)[:, None, :] - fp[None]).transpose(2, 0, 1))) < 2.5
               for b in buildings):
            continue
        _, ii = road_tree.query([x, z])
        buildings.append(dict(x=float(x), z=float(z), yaw=float(yaw), w=float(w_), d=float(d_), floors=1,
                              kind=int(brng.integers(0, 6)), y=float(allH[ii]) + 0.3, style='shack'))
print(f'  {len(buildings)} shacks')
for b in buildings:
    m = (np.abs(X - b['x']) < 26) & (np.abs(Z - b['z']) < 26)
    lx = (X[m] - b['x']) * math.cos(b['yaw']) - (Z[m] - b['z']) * math.sin(b['yaw'])
    lz = (X[m] - b['x']) * math.sin(b['yaw']) + (Z[m] - b['z']) * math.cos(b['yaw'])
    e = np.hypot(np.maximum(np.abs(lx) - b['w'] / 2 - 0.5, 0), np.maximum(np.abs(lz) - b['d'] / 2 - 0.5, 0))
    wgt = 1 - ss(0, 5, e)
    H[m] = H[m] * (1 - wgt) + (b['y'] - 0.05) * wgt

# ------------------------------------------------------------- carve the roads
print('carve')
allN = np.vstack([t['N'] for t in TRACKS])[keep]
allB = np.concatenate([t['bank'] for t in TRACKS])[keep]
allGap = np.concatenate([t['gap'] for t in TRACKS])[keep]
d, idx = road_tree.query(pts_all, distance_upper_bound=90)
fin = np.isfinite(d)
idx = np.where(fin, idx, 0)
d = np.where(fin, d, 1e9).reshape(H.shape)
idx = idx.reshape(H.shape)
lat = (X - allC[idx, 0]) * allN[idx, 0] + (Z - allC[idx, 1]) * allN[idx, 1]
hw = allW[idx] / 2
road_h = allH[idx] + lat * allB[idx] - 0.05 * (lat / hw) ** 2
nat = H.copy()
diff = nat - road_h
cut = diff > 0
shoulder = np.where(cut, 3 + np.clip(diff, 0, 40) * 0.4, 6 + np.clip(-diff, 0, 30) * 1.4)
half = hw + 2.0
wgt = 1 - ss(half, half + shoulder, d)
berm = np.exp(-((d - half - 1.2) / 1.4) ** 2) * 0.5 * (d < 90)
Hc = nat * (1 - wgt) + road_h * wgt + berm * (1 - wgt * 0.5)
gapmask = allGap[idx] & (d < half + 5)
Hc = np.where(gapmask, np.minimum(Hc, allH[idx] - 8), Hc)
H = np.where(d < 1e8, Hc, H)
# the reef road and the surf line stay at the waterline (no berms out into the sea)
H = gaussian_filter(H, 0.5)
# keep the plunge pool and the river channel open after the carve
H = np.where(dpool < 30, np.minimum(H, POOL_Y - 3.0 + ss(10, 30, dpool) * 3), H)
road = 1 - ss(hw - 1, hw + 6, d)
if lava_mod and hasattr(lava_mod, 'after_carve'):
    # the lava rounds re-cut their channels under bridges and hand back rivers already in track.json format
    ctx.H = H
    res = lava_mod.after_carve(ctx, lava_out) or {}
    H = ctx.H
    lava_rivers += res.get('rivers', [])

# ------------------------------------------------------------- water
water = dict(
    sea=0.0,
    river=dict(points=[[round(float(a), 2), round(float(h), 2), round(float(b), 2)]
                       for (a, b), h in zip(river[::3], river_y[::3])],
               width=[round(float(8 + 10 * ss(FALL_S, FALL_S + 1800, s_)), 2) for s_ in rs[::3]]),
    creek=dict(points=[[round(float(a), 2), round(float(h), 2), round(float(b), 2)]
                       for (a, b), h in zip(creek[::3], creek_y[::3])], width=[7.0] * len(creek[::3])),
    falls=dict(x=100.0, z=-305.0, top=POOL_Y + FALL_H, bottom=POOL_Y - 0.5, width=22.0,
               dir=[0.0, 1.0], pool=dict(x=100.0, z=-290.0, r=30.0, y=POOL_Y - 0.4)),
)

# ------------------------------------------------------------- biome masks
print('masks')
slope = np.hypot(*np.gradient(H, RES))
sand = (1 - ss(0.25, 0.45, slope)) * np.where(sd > -40, 1 - ss(60, 140, sd + n_mid * 25), 0)
sand = sand * np.maximum(w_beach, ss(-20, 0, -sd) * 0.0) + (1 - ss(2, 10, sd)) * (1 - w_cliff) * (1 - w_reef) * 0.7
sand = np.clip(sand * (1 - w_point), 0, 1)
white = np.clip(w_cove + ss(-1200, -1400, Z) * 0.6, 0, 1)
veg = ss(20, 140, sd) * (1 - ss(0.65, 1.0, slope)) * (1 - ss(520, 640, H + n_big * 40))
veg = veg * (0.55 + 0.45 * ss(-0.3, 0.6, n_big)) * (1 - 0.6 * w_beach * (1 - ss(150, 260, sd)))
veg = np.maximum(veg, (1 - ss(0, 420, rd)) * ss(5, 30, sd) * 0.95)          # the rainforest valley is lush
rock = np.clip(w_point + w_reef * (1 - ss(-30, 5, sd)) + ss(0.9, 1.3, slope) * 0.6, 0, 1)
veg = veg * (1 - road) * (1 - rock * 0.8)
lava_dist = lava_out.get('lava_dist')
glow = np.clip(1 - lava_dist / 60.0, 0, 1) if lava_dist is not None else np.zeros_like(H)
burn = np.clip(1 - lava_dist / 25.0, 0, 1) if lava_dist is not None else np.zeros_like(H)
if lava_out.get('fresh') is not None:
    # fresh lava fields carry no plants or sand
    veg = veg * (1 - np.clip(lava_out['fresh'], 0, 1))
    sand = sand * (1 - np.clip(lava_out['fresh'], 0, 1))
biome = dict(sand=sand, white=white, veg=veg, rock=rock)
ctx.H = H
ctx.biome = biome
ctx.glow = glow
ctx.burn = burn
ctx.road = road
if lava_mod and hasattr(lava_mod, 'masks'):
    lava_mod.masks(ctx)
    H, glow, burn = ctx.H, ctx.glow, ctx.burn
m = np.stack([glow, road, burn], -1)
Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).resize((2048, 2048), Image.BILINEAR).save(f'{OUT}/masks.png')
b = np.stack([biome['sand'], biome['white'], biome['veg'], biome['rock']], -1)
Image.fromarray((np.clip(b, 0, 1) * 255).astype(np.uint8), 'RGBA').resize((2048, 2048), Image.BILINEAR).save(f'{OUT}/biome.png')

hmin, hmax = float(H.min()), float(H.max())
np.round((H - hmin) / (hmax - hmin) * 65535).astype('<u2').tofile(f'{OUT}/height.u16')


def track_json(t):
    C, th = t['C'], t['th']
    out = dict(id=t['id'], name=t['name'], region=t.get('region', 'kaiele'), kind=t['kind'], closed=t['closed'],
               width=t['width'], length=t['len'], start=t['start'], laps=t['laps'],
               centre=[[round(float(C[i, 0]), 2), round(float(th[i]), 3), round(float(C[i, 1]), 2),
                        round(float(t['bank'][i]), 4), int(t['gap'][i])] for i in range(len(C))],
               surf=[int(s) for s in t['surf']])
    for k_ in ('jump', 'crossing'):
        if k_ in t:
            out[k_] = int(t[k_])
    for k_ in ('segs', 'lip', 'land', 'loopJump', 'shared', 'runout', 'leap', 'runup', 'bridge'):
        if k_ in t:
            out[k_] = t[k_]
    out.update(t.get('json', {}))
    return out


lake = extra.pop('lake', ctx.LAKE)
crater = extra.pop('crater', dict(x=SUMMIT_XZ[0], z=SUMMIT_XZ[1], r=CRATER_R, y=float(sample(H, [SUMMIT_XZ[0]], [SUMMIT_XZ[1]])[0]) + 30))
world = dict(
    region='kaiele', name="Kai'ele", extent=EXTENT, grid=GRID, hmin=hmin, hmax=hmax, peak=SUMMIT_Y,
    rivers=lava_rivers, lake=lake, crater=crater, water=water, surfaces=SURF, summit=list(SUMMIT_XZ),
    tracks=[track_json(t) for t in TRACKS], buildings=buildings,
)
world.update(extra)
json.dump(world, open(f'{OUT}/track.json', 'w'))

# previews
prev = np.clip(H / 800, -0.1, 1)
img = np.stack([0.45 + prev * 0.5] * 3, -1)
img[H < 0] = np.stack([0.05 + 0.0 * H, 0.2 + 0.004 * np.clip(H, -40, 0), 0.45 + 0.006 * np.clip(H, -40, 0)], -1)[H < 0]
img[..., 1] += veg * 0.25
img[..., 0] -= veg * 0.15
img[sand > 0.4] = np.stack([0.25 + 0.6 * white, 0.22 + 0.55 * white, 0.2 + 0.4 * white], -1)[sand > 0.4]
img[road > 0.5] = [1, 0.8, 0.2]
img[rd < cw] = [0.2, 0.5, 1]
for b_ in buildings:
    ix, iz = int((b_['x'] + HALF) / RES), int((b_['z'] + HALF) / RES)
    img[iz - 2:iz + 3, ix - 2:ix + 3] = [1, 0.2, 0.6]
img = np.clip(img, 0, 1)
Image.fromarray((img * 255).astype(np.uint8)).save(f'{PREV}/kaiele_preview_full.png')
Image.fromarray((img * 255).astype(np.uint8)).resize((1024, 1024)).save(f'{PREV}/kaiele_preview.png')
print('done', hmin, hmax)
