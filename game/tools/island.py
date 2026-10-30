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


# ------------------------------------------------------------- track control points
# The tracks are built further down; their rough centrelines come first so the coast and the landforms can keep
# clear of the roads.
# Round 1: Kahakai ʻEleʻele, the black-sand beach circuit (2.4 km, 3 laps)
KAHAKAI_CP = [
    (-1140, 1300), (-1000, 1286), (-850, 1280), (-700, 1284), (-560, 1292), (-440, 1300),        # harbour road
    (-360, 1322), (-318, 1366), (-352, 1410), (-312, 1450), (-250, 1474),                          # palm esses
    (-238, 1494), (-300, 1506), (-450, 1508), (-620, 1505), (-800, 1509), (-980, 1506), (-1120, 1510),  # surf line
    (-1205, 1540), (-1262, 1530), (-1285, 1480), (-1258, 1430),                                    # lava-rock point
    (-1230, 1390), (-1200, 1340),                                                                  # boat ramp jump
]
# Round 2: Wailele Nahele, the rainforest waterfall circuit (3.0 km, 3 laps)
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
# Round 3: Pali Kai, the north-shore sea-cliff sprint (4.2 km). Seven legs stacked down the steep grass face at the
# east end of the cliffs, joined by six hairpins
desc = []
legs_z = [-1475, -1503, -1531, -1559, -1587, -1615, -1643]   # the last leg runs back east to the reef
for k_, zz in enumerate(legs_z):
    xa, xb = (110, 300) if k_ % 2 == 0 else (300, 110)
    for t_ in np.linspace(0, 1, 9):
        desc.append((xa + (xb - xa) * t_, zz))
    if k_ + 1 < len(legs_z):
        cx_, cz_, r_ = xb, (zz + legs_z[k_ + 1]) / 2, abs(legs_z[k_ + 1] - zz) / 2
        sgn = 1 if xb > xa else -1
        for th_ in np.linspace(0, math.pi, 9)[1:-1]:
            desc.append((cx_ + sgn * r_ * math.sin(th_), cz_ + r_ * math.cos(th_)))   # a semicircle tangent to both legs
PALI_CP = [(-1660, -1395), (-1560, -1418), (-1450, -1452), (-1330, -1488), (-1200, -1512), (-1060, -1520),
           (-920, -1534), (-780, -1526), (-640, -1542), (-500, -1556), (-360, -1544), (-220, -1556), (-90, -1552),
           (20, -1520), (70, -1490)] + desc + [
           (420, -1655), (560, -1676), (700, -1690), (840, -1690), (950, -1700),         # reef flats
           (1000, -1702), (1040, -1700),                                                 # sea arch launch
           (1110, -1688), (1200, -1668), (1290, -1640), (1360, -1600), (1420, -1555), (1470, -1520)]
guides = dict(kahakai=catmull(KAHAKAI_CP, True, step=4.0)[0], wailele=catmull(WAILELE_CP, True, step=4.0)[0],
              palikai=catmull(PALI_CP, False, step=4.0)[0])
guide_tree = cKDTree(np.vstack(list(guides.values())))


def smax(a, b, k=30.0):
    m = np.maximum(a, b)
    return m + k * np.log(np.exp((a - m) / k) + np.exp((b - m) / k))


def softplus(q, k):
    return k * np.logaddexp(0, q / k)


def noise1(n, sig, rng, wrap=True):
    """Smooth unit noise along a curve (or a lookup table)."""
    v = gaussian_filter1d(rng.standard_normal(n), sig, mode='wrap' if wrap else 'nearest')
    return v / v.std()


def near_path(path, reach):
    """Window of the grid around a polyline: (slices, X, Z, distance, nearest index, ok)."""
    x0, x1 = path[:, 0].min() - reach, path[:, 0].max() + reach
    z0, z1 = path[:, 1].min() - reach, path[:, 1].max() + reach
    j0, j1 = max(0, int((x0 + HALF) / RES)), min(GRID, int((x1 + HALF) / RES) + 2)
    i0, i1 = max(0, int((z0 + HALF) / RES)), min(GRID, int((z1 + HALF) / RES) + 2)
    sl = (slice(i0, i1), slice(j0, j1))
    Xs, Zs = X[sl], Z[sl]
    d, ii = cKDTree(path).query(np.stack([Xs.ravel(), Zs.ravel()], 1), distance_upper_bound=reach)
    ok = np.isfinite(d).reshape(Xs.shape)
    d = np.where(np.isfinite(d), d, reach).reshape(Xs.shape)
    ii = np.minimum(ii, len(path) - 1).reshape(Xs.shape)
    return sl, Xs, Zs, d, ii, ok


# flute profile for valley walls: a ridged 1-D noise read along the wall, so the grooves run straight up it
_frng = np.random.default_rng(77)
FLUTE = 1 - 2 * np.abs(0.75 * noise1(40000, 7, _frng) + 0.4 * noise1(40000, 2.5, _frng)).clip(0, 1.5) / 1.5


def flute_at(u):
    return np.interp(np.mod(u, 39999.0), np.arange(40000.0), FLUTE)


def carve(H, path, fy, hw, K, famp, fade=None, reach=None, kround=6.0):
    """Cut a valley along path (mouth first): a floor at fy (per point) hw wide, walls of slope K fluted by famp
    metres, and an amphitheatre round the head (the far end) where the distance turns radial."""
    path = np.asarray(path, float)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    T, Nn, _ = frames(path, False)
    reach = reach or float(hw.max() + 240)
    sl, Xs, Zs, d, ii, ok = near_path(path, reach)
    vx, vz = Xs - path[ii, 0], Zs - path[ii, 1]
    a = vx * T[ii, 0] + vz * T[ii, 1]
    b = vx * Nn[ii, 0] + vz * Nn[ii, 1]
    th = np.arctan2(b, a)            # +-pi/2 beside the valley, 0 straight on beyond the head
    u = s[ii] + (np.pi / 2 - th) * hw[ii] + path[0, 0] * 3      # runs on round the amphitheatre without a seam
    q = d - hw[ii]
    q = q - famp * flute_at(u / 5.0) * ss(0, 40, q)
    cap = fy[ii] + 0.025 * np.minimum(d, hw[ii]) + K * softplus(q, kround)
    w = fade[ii] if fade is not None else 1.0
    Hs = H[sl]
    H[sl] = np.where(ok, Hs - w * np.clip(Hs - cap, 0, None), Hs)


# ------------------------------------------------------------- coastline
print('coast')
SUMMIT_XZ = (850.0, -200.0)
CRATER_R = 140.0
OLD_A, OLD_B = (-1150.0, -330.0), (-760.0, -820.0)     # the west hills' two old summits
# Coast control points, clockwise from the south-west (x, z). An oval island: the old west hills end in sea cliffs
# cut by valley bays (cut later where the valleys reach the sea), the north shore is sheer cliff from the
# lighthouse headland to the grass face, then the reef shelf and the white-sand cove; the volcano rounds off the
# east; the river opens into a deep bay; the black-sand beach and the lava-rock point face south.
COAST_CP = [
    (-1720, 700), (-1800, 450), (-1860, 150), (-1890, -150), (-1880, -450), (-1840, -750), (-1770, -1000),
    (-1730, -1150), (-1800, -1290),                                                         # west: hills to the sea
    (-1850, -1380), (-1830, -1460), (-1760, -1515),                                         # lighthouse headland
    (-1640, -1512), (-1530, -1515), (-1420, -1545), (-1340, -1590), (-1290, -1650), (-1230, -1680), (-1170, -1662),
    (-1120, -1615), (-1040, -1600), (-960, -1610), (-900, -1645), (-850, -1690), (-790, -1705), (-735, -1672),
    (-690, -1628), (-620, -1620), (-540, -1640), (-460, -1628), (-380, -1625), (-310, -1645), (-260, -1690),
    (-200, -1712), (-140, -1682), (-90, -1640), (10, -1615),                               # north sea cliffs
    (120, -1652), (240, -1660), (340, -1650), (450, -1636), (600, -1632), (760, -1636), (880, -1644),  # face, reef shore
    (980, -1695), (1060, -1730), (1180, -1745), (1320, -1730), (1430, -1690),             # arch, white-sand cove
    (1520, -1620), (1610, -1520), (1700, -1380), (1790, -1180), (1860, -940), (1905, -680), (1920, -440), (1890, -300),
    (1860, 150), (1800, 600), (1690, 1000), (1520, 1330), (1300, 1590), (1060, 1720), (800, 1730), (520, 1680),
    (430, 1590), (370, 1480), (290, 1400), (180, 1362), (60, 1388), (-40, 1458), (-120, 1538), (-190, 1574),  # river bay
    (-262, 1550), (-400, 1531), (-600, 1525), (-800, 1527), (-1000, 1527), (-1110, 1530),  # black-sand beach
    (-1170, 1556), (-1215, 1600), (-1285, 1616), (-1345, 1576), (-1368, 1505), (-1352, 1442),  # lava-rock point
    (-1430, 1360), (-1530, 1240), (-1610, 1060), (-1660, 900),
]
coast, _ = catmull(COAST_CP, True, step=2.0)
_, cN, _ = frames(coast, True)
cn = len(coast)
crng = np.random.default_rng(5)
# headlands and coves at every scale, except right beside a road, on the beaches, and (broadly) on the lava coast
wob = 45 * noise1(cn, 100, crng) + 10 * noise1(cn, 18, crng) + 3.5 * noise1(cn, 5, crng) + 1.2 * noise1(cn, 1.5, crng)
cx, cz = coast[:, 0], coast[:, 1]
gdist, _ = guide_tree.query(coast)
beach_c = ((cz > 1450) & (cx > -1160) & (cx < -150)) | ((cz < -1550) & (cx > 985) & (cx < 1470)) \
    | ((cz > 1300) & (cx > -200) & (cx < 470))
beachy = smooth((beach_c & ~((cz > 1300) & (cx > -150) & (cx < 470))).astype(float) + 0.5 * ((cz > 1300) & (cx > -150) & (cx < 470)), 61, True)
lavac = ss(400, 500, cx) * ss(-300, -200, cz)
coast = coast + cN * (wob * ss(25, 130, gdist) * (1 - 0.85 * beachy) * (1 - 0.5 * lavac))[:, None]
cx, cz = coast[:, 0], coast[:, 1]
land0 = rasterize(coast)
sd0 = distance_transform_edt(land0) * RES - distance_transform_edt(~land0) * RES


def coast_pt(x=None, z=None, side=None):
    """Nearest shore point to a target x on the north (side='n') or z on the west (side='w') coast."""
    if side == 'n':
        m = (cz < -1300) & (gdist > 95)            # (clear of the cliff-top road)
        i = np.where(m)[0][np.argmin(np.abs(cx[m] - x))]
    else:
        m = cx < -1500
        i = np.where(m)[0][np.argmin(np.abs(cz[m] - z))]
    p = coast[i]
    out = cN[i] if not land0[int((p[1] + cN[i][1] * 12 + HALF) / RES), int((p[0] + cN[i][0] * 12 + HALF) / RES)] else -cN[i]
    return p, out


# the old west hills: two smooth domes, warped so their outline isn't a circle
print('relief')
wx, wz = spectral(2.6, 2, seed=24) * 90, spectral(2.6, 2, seed=25) * 90
dA = np.hypot((X + wx - OLD_A[0]) / 1.1, (Z + wz - OLD_A[1]) / 0.95)
dB = np.hypot((X + wx - OLD_B[0]) / 1.0, (Z + wz - OLD_B[1]) / 1.1)
dome = smax(560 * np.clip(1 - dA / 1450, 0, 1) ** 1.6, 470 * np.clip(1 - dB / 1200, 0, 1) ** 1.6, 40)
hills_w = ss(20, 120, dome)

# their valleys: traced downhill from below the summits; the big ones are amphitheatre-headed and reach the sea
# as broad floors (each cuts a bay), the small ones flute the outer slopes between them
dsm = gaussian_filter(dome, 25)
gdz, gdx = np.gradient(dsm, RES)
vrng = np.random.default_rng(41)


def wrapa(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def trace(c, ang, r_head, lmax, step=16.0):
    th = math.radians(ang)
    p = np.array([c[0] + r_head * math.cos(th), c[1] + r_head * math.sin(th)])
    pts, end = [p.copy()], 'plain'
    for _ in range(int(lmax / step)):
        gx, gz = float(sample(gdx, [p[0]], [p[1]])[0]), float(sample(gdz, [p[0]], [p[1]])[0])
        if math.hypot(gx, gz) > 0.02:
            th += 0.1 * wrapa(math.atan2(-gz, -gx) - th)
        th += vrng.normal(0, 0.06)
        p = p + step * np.array([math.cos(th), math.sin(th)])
        if sample(sd0, [p[0]], [p[1]])[0] < 0:
            pts.append(p.copy())
            end = 'sea'
            break
        if p[1] < -1320 or (p[0] > -430 and -430 < p[1] < 900) or guide_tree.query(p)[0] < 80:
            break
        if VTREE and len(pts) > 4 and min(t_.query(p)[0] for t_ in VTREE) < 50:
            pts.append(p.copy())
            end = 'join'                            # runs into a bigger valley: a tributary
            break
        pts.append(p.copy())
    return np.array(pts[::-1]), end                 # mouth first


VALLEYS = []          # (path, end, kind, hw_mouth, hw_head)
VTREE = []
for c, angs in ((OLD_A, (180, 161, 199, 142, 218, 122, 238, 100, 78, 56, 32, 8, -18, -44)), (OLD_B, (-150, -122, -12, 14, 40, 66, 92, -40, -70, -96))):
    for a_ in angs:
        pth, end = trace(c, a_ + vrng.uniform(-4, 4), vrng.uniform(220, 380), 1300)
        if len(pth) > 8:
            VALLEYS.append((pth, end, 'major', vrng.uniform(42, 60), vrng.uniform(55, 85)))
            VTREE.append(cKDTree(polyline(pth, 8.0)))
for c, angs in ((OLD_A, (-44, 238)), (OLD_B, (-165, 30))):
    for a_ in np.arange(min(angs) - 5, max(angs) + 6, 5.5):
        pth, end = trace(c, a_ + vrng.uniform(-2, 2), vrng.uniform(430, 760), 520, step=12.0)
        if len(pth) > 6:
            VALLEYS.append((pth, end, 'minor', vrng.uniform(4, 8), 0))
print(f"  {sum(v[2] == 'major' for v in VALLEYS)} valleys, {sum(v[2] == 'minor' for v in VALLEYS)} gullies")

# cut the coast: bays at the valley mouths, small coves at the foot of the north cliffs, and the tidal channel the
# Kahakai boat-ramp jump flies over
cuts = np.zeros_like(land0)
for pth, end, kind, hwm, _ in VALLEYS:
    if end == 'sea' and kind == 'major':
        m = (X - pth[0, 0]) ** 2 + (Z - pth[0, 1]) ** 2 < (hwm * 1.1) ** 2
        cuts |= m
N_COVES = []
for x_ in (-1150, -728, -118):
    p_, o_ = coast_pt(x=x_, side='n')
    N_COVES.append((float(p_[0]), float(p_[1])))
    cuts |= (X - p_[0] + o_[0] * 6) ** 2 + (Z - p_[1] + o_[1] * 6) ** 2 < 36.0 ** 2
INLET_CP = [(-1440, 1388), (-1360, 1398), (-1300, 1394), (-1255, 1388), (-1224, 1385), (-1194, 1376)]
inlet, _ = catmull(INLET_CP, False, step=2.0)
inlet_d, _ = dist_to(inlet, 60)
cuts |= inlet_d < 6.5 + 2 * ss(-1300, -1420, X)
land = land0 & ~cuts
sd = distance_transform_edt(land) * RES - distance_transform_edt(~land) * RES   # + inland, - at sea
coast_d, coast_i = dist_to(coast, 900)
dcove = np.min([np.hypot(X - a, Z - b) for a, b in N_COVES], axis=0)

n_big = spectral(2.8, 1.5, seed=1)
n_mid = spectral(2.2, 8, seed=2)
n_fine = spectral(1.8, 60, seed=3)

# coast types along the shore, carried inland and out to sea by the nearest shore point
far = 1 - ss(700, 900, coast_d)
ctypes = dict(
    cliff=((cz < -1350) & (cx < 40)) | ((cx < -1690) & (cz < -1150)),   # the north sea cliffs
    face=(cz < -1450) & (cx >= 40) & (cx < 400),                        # Pali Kai's steep grass face
    wcliff=(cx < -1540) & (cz >= -1150) & (cz < 950),                   # west: hills cut off by the sea
    beach=beach_c,                                                      # Kahakai, the cove, the bay head
    point=(cx < -1150) & (cx > -1420) & (cz > 1400),                    # the black lava-rock point
    lcliff=((cx < -1380) & (cz >= 950) & (cz <= 1400)) | ((cx > 1450) & (cz < -300) & (cz > -1580)),  # low lava cliffs
)
# (blurred: the nearest shore point jumps along medial lines, which would leave creases inland)
G_ = {k: gaussian_filter(smooth(v.astype(float), 31, True)[coast_i] * far, 20) for k, v in ctypes.items()}
wsum = sum(G_.values())
w_def = np.clip(1 - wsum, 0, 1)
tot = w_def + wsum
tw = gaussian_filter((4 + 15 * ss(-0.5, 1.0, noise1(cn, 10, crng)))[coast_i], 6) + 20 * np.exp(-(dcove / 38) ** 2)   # talus / cove beach
hl = gaussian_filter((7 + 4 * noise1(cn, 25, crng))[coast_i], 20)

x_ = np.clip(sd, 0, None)
low = 0.035 * x_ + 3 * np.tanh(x_ / 40)
CLIFF_H = 85.0
plat = CLIFF_H + 5 * n_big + 1.5 * n_mid + 0.012 * np.minimum(x_, 800)    # the north plateau, gently rolling
talus = 1.5 + 16 * np.clip(x_ / tw, 0, 1) ** 1.5 * (1 - 0.8 * np.exp(-(dcove / 38) ** 2))
P_cliff = talus + (plat - talus) * ss(tw, tw + 10, x_ + 2.5 * n_mid)
P_face = 2 + (plat - 2) * (0.7 * np.clip((x_ - 8) / 180, 0, 1) + 0.3 * ss(8, 188, x_))   # an even slope for the hairpins
P_wcliff = 1 + 5 * np.clip(x_ / tw, 0, 1)
# beach profile: wet foreshore, berm crest, backshore, then dunes and the coastal plain
dune = (0.5 + 0.5 * np.sin(x_ / 15 + 2.4 * n_mid + 1.3 * n_fine)) ** 2 * (0.7 + 0.3 * n_big)
dune = dune * 5.5 * ss(48, 80, x_) * (1 - ss(150, 230, x_))
P_beach = np.interp(x_, [0, 10, 22, 28, 36, 48, 75, 160, 400, 900], [0, 0.75, 1.55, 2.25, 2.15, 2.0, 2.6, 4.0, 7.0, 14.0]) + dune
P_point = 0.8 + 2.4 * ss(10, 90, x_) + 0.6 * n_mid
P_lcliff = low + hl * ss(tw * 0.4, tw * 0.4 + 5, x_)
P = (w_def * low + G_['cliff'] * P_cliff + G_['face'] * P_face + G_['wcliff'] * P_wcliff + G_['beach'] * P_beach
     + G_['point'] * P_point + G_['lcliff'] * P_lcliff) / tot
fade = (w_def * ss(60, 600, x_) + G_['cliff'] * ss(150, 380, x_) + G_['face'] * ss(170, 450, x_)
        + G_['wcliff'] * ss(tw, tw + 14, x_) + G_['beach'] * ss(200, 650, x_) + G_['point'] * ss(250, 600, x_)
        + G_['lcliff'] * ss(40, 500, x_)) / tot

# the volcano: a broad shield. Its south-east flank and summit are the lava rounds' (kept exactly as first baked);
# the north and west flanks are gentler, with lava-flow ridges and cinder cones on two rift lines
dv = np.hypot(X - SUMMIT_XZ[0], Z - SUMMIT_XZ[1])
Av = np.arctan2(Z - SUMMIT_XZ[1], X - SUMMIT_XZ[0])
dvw = dv * (1 + n_big * 0.05)
SHIELD = 760.0
SUMMIT_Y = float(SHIELD) - 30
flutes = 0
for k, (freq, amp) in enumerate([(23, 1.0), (47, 0.5), (89, 0.3)]):
    ph = spectral(2.6, 1, seed=10 + k) * 1.0
    flutes = flutes + amp * (1 - np.abs(np.sin(Av * freq / 2 + ph + np.log1p(dv / 300) * 0.6))) ** 4
flutes = flutes * ss(200, 500, dv) * (1 - ss(1500, 2000, dv))
pit = 75 * np.clip(1 - (dv / CRATER_R) ** 6, 0, 1)


def shield_of(p, famp):
    s_ = SHIELD * np.clip(1 - dvw / 2150, 0, 1) ** p + flutes * famp
    s_ = np.minimum(s_, SUMMIT_Y + 0.02 * dv)            # summit caldera: a flat-floored pit (lake: kaiele_lava.py)
    return s_ - pit + 4 * np.exp(-((dv - CRATER_R - 6) / 8) ** 2)


keep = np.maximum(ss(-330, -170, Z) * ss(330, 570, X), 1 - ss(260, 420, dv))
print('  flank flows and cones')
frng = np.random.default_rng(31)
flows = np.zeros_like(X)
fresh_flow = np.zeros_like(X)
for k in range(28):
    th0 = math.radians(frng.uniform(-172, -12))
    r0, L_, wf, hf = frng.uniform(250, 650), frng.uniform(350, 1100), frng.uniform(9, 30), frng.uniform(2.0, 5.5)
    p = np.array([SUMMIT_XZ[0] + r0 * math.cos(th0), SUMMIT_XZ[1] + r0 * math.sin(th0)])
    th, pts = th0, [p.copy()]
    for _ in range(int(L_ / 10)):
        th += frng.normal(0, 0.13) + 0.08 * wrapa(math.atan2(p[1] - SUMMIT_XZ[1], p[0] - SUMMIT_XZ[0]) - th)
        p = p + 10 * np.array([math.cos(th), math.sin(th)])
        if (p[0] < 450 and p[1] > -950) or guide_tree.query(p)[0] < wf + 60 or sample(sd0, [p[0]], [p[1]])[0] < 40:
            break
        pts.append(p.copy())
    if len(pts) < 25:
        continue
    path = polyline(pts, 3.0)
    s_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    sl, Xs, Zs, d, ii, ok = near_path(path, 2.2 * wf + 10)
    # flat-topped lobe with steep margins and a low levee at each edge, widening downhill into a toe; the far end
    # rounds off as the flow front
    t_ = s_[ii] / s_[-1]
    wl = wf * (0.5 + 0.9 * t_ + 0.35 * flute_at(s_[ii] / 3 + k * 1000)) * (1 + 0.25 * ss(0.85, 1, t_))
    pr = hf * np.clip(1 - (d / wl) ** 4, 0, 1) ** 0.35 * ss(0, 0.1, t_) * ok
    pr = pr + 0.3 * hf * np.exp(-((d - 0.8 * wl) / (0.12 * wl)) ** 2) * ok * ss(0, 0.1, t_)
    flows[sl] = np.maximum(flows[sl], pr)
    if k % 4 == 0:
        fresh_flow[sl] = np.maximum(fresh_flow[sl], ss(0.2, 1.0, pr))
CONES = [(1150, -700, 55, 40, 18), (1270, -900, 70, 50, 22), (1370, -1110, 45, 34, 14), (1010, -560, 30, 24, 9),
         (560, -660, 40, 30, 12), (430, -930, 62, 46, 20), (720, -1080, 34, 26, 10)]
cones = np.zeros_like(X)
for cx_, cz_, ch, rt, cd_ in CONES:
    rb = rt + ch / 0.6
    dc = np.hypot(X - cx_, Z - cz_) * (1 + 0.06 * n_mid)
    c_ = ch * np.clip((rb - dc) / (rb - rt), 0, 1) ** 1.15
    c_ = c_ - cd_ * np.clip(1 - (dc / (0.92 * rt)) ** 2, 0, 1) ** 0.6
    cones = np.maximum(cones, c_)
shield = shield_of(1.75, 9) * keep + (shield_of(1.62, 2.5) + flows + cones) * (1 - keep)
fresh_flow *= 1 - keep
cinder = ss(2, 15, cones) * (1 - keep)

# a low saddle of rolling uplands between the hills and the shield
uplands = 120 * np.exp(-((X - 0) / 900) ** 2 - ((Z + 200) / 1300) ** 2) * (1 + n_big * 0.3)
mtn = smax(smax(shield, dome), uplands)
H = P + np.clip(mtn - P, 0, None) * fade
lavag = ss(400, 500, X) * ss(-300, -200, Z)
H += n_big * (7 + 7 * lavag) * ss(0, 300, sd) * (1 - 0.6 * G_['cliff']) + n_mid * (2 - hills_w) * ss(0, 60, sd) + n_fine * 0.35

# carve the west hills' valleys and gullies
print('  carve valleys')
for pth, end, kind, hwm, hwh in VALLEYS:
    path = polyline(pth, 2.0)
    s_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    L_ = s_[-1]
    t_ = s_ / L_
    hh = float(sample(H, [path[-1, 0]], [path[-1, 1]])[0])
    if end == 'sea':
        ym = 0.8
        fd_ = None
    elif end == 'join':
        ym = float(sample(H, [path[0, 0]], [path[0, 1]])[0]) + 0.5
        fd_ = None
    else:
        ym = max(1.0, float(sample(H, [path[0, 0]], [path[0, 1]])[0]) - 1.0)
        fd_ = ss(0, 0.35, t_)
    if kind == 'major':
        yh = ym + 0.36 * max(hh - ym, 0)
        if end == 'plain':            # a valley that dies out on the lowland: shallower, smaller head
            yh = ym + 0.5 * max(hh - ym, 0)
            hwm, hwh = hwm * 0.7, 26
        hw_ = 22 + (hwm - 22) * (1 - ss(0, 0.5, t_)) + (hwh - 22) * ss(0.72, 1, t_)
        fy = ym + (yh - ym) * t_ ** 1.3
        carve(H, path, fy, hw_, 2.1, 9, fd_, reach=float(hw_.max() + 280), kround=14.0)
    else:
        yh = ym + 0.6 * max(hh - ym, 0)
        fy = ym + (yh - ym) * t_ ** 1.2
        carve(H, path, fy, np.full(len(path), hwm), 1.15, 3.0, fd_, reach=hwm + 210, kround=5.0)

# the lava-rock point: stepped shelves of old pahoehoe just above and below the tide line, with tide pools
g_pt = G_['point'] * (1 - ss(150, 260, coast_d))
lv = np.clip((sd0 + 14 * n_mid + 30) / 70, 0, 1)   # (from the open coast: the tidal channel keeps its banks)
shelf = -0.55 + 0.45 * np.floor(lv * 4 + 0.15 * n_fine) + 0.25 * n_fine + 2.2 * ss(0.8, 1.0, lv)
n_pool = spectral(1.6, 380, 1100, seed=7)
pools = (n_pool > 1.15) & (shelf > -0.2) & (sd0 > -25) & (sd0 < 50)
shelf = np.where(pools, -0.4, shelf)
kd_, _ = dist_to(guides['kahakai'], 60)
wpt = g_pt * ss(-60, -35, sd0) * (1 - ss(55, 85, sd0)) * ss(8, 16, inlet_d) * ss(16, 30, kd_)   # (smooth by the road)
H = H * (1 - wpt) + shelf * wpt

# ------------------------------------------------------------- the sea floor
sea = sd < 0
xs_ = np.clip(-sd, 0, None)
bayg = ss(1250, 1400, Z) * ss(-250, -150, X) * (1 - ss(430, 520, X))
F_def = -(1.0 + 38 * ss(0, 500, xs_) + n_mid * 1.2 * ss(0, 50, xs_))
F_cl = -(5 + 30 * ss(0, 140, xs_) + 15 * ss(100, 500, xs_))
F_be = -0.4 - 0.035 * xs_ - 25 * ss(150, 600, xs_)
F_be = F_be * (1 - bayg) + (-0.6 - 0.06 * xs_ - 20 * ss(100, 450, xs_)) * bayg     # the bay: deep enough for boats
F_pt = -0.35 - 0.05 * xs_ - 20 * ss(80, 400, xs_)
F_wc = -(3 + 25 * ss(0, 200, xs_) + 12 * ss(150, 500, xs_))
F_lc = -(1.5 + 30 * ss(0, 350, xs_))
floor = (w_def * F_def + G_['cliff'] * F_cl + G_['face'] * F_def + G_['wcliff'] * F_wc + G_['beach'] * F_be
         + G_['point'] * F_pt + G_['lcliff'] * F_lc) / tot
# the reef is a wide flat shelf just awash at low tide in front of the north-east shore
w_reef = ss(-1200, -1450, Z) * ss(230, 330, X) * (1 - ss(940, 1010, X))
reef = -0.25 + n_mid * 0.18 + n_fine * 0.05 - 25 * ss(110, 220, xs_)
floor = floor * (1 - w_reef) + reef * w_reef
floor = np.where(inlet_d < 12, np.maximum(floor, -1.4), floor)          # the tidal channel stays shallow
H = np.where(sea, floor, H)
H = np.where(np.abs(sd) < 8, gaussian_filter(H, 1.5), H)
# sea stacks off the north cliffs: sheer columns standing in deep water, a ring of fallen blocks round each
STACKS = [(-1600, 55, 16, 46), (-1250, 70, 22, 64), (-1215, 105, 11, 34), (-835, 70, 15, 52), (-765, 95, 19, 70),
          (-555, 52, 10, 30), (-225, 80, 18, 58), (-150, 115, 9, 26)]
for x_s, off, r_, h_ in STACKS:
    p_, o_ = coast_pt(x=x_s, side='n')
    sx, sz = p_ + o_ * off
    m = (np.abs(X - sx) < r_ + 30) & (np.abs(Z - sz) < r_ + 30)
    de = np.hypot(X[m] - sx, Z[m] - sz) * (1 + 0.12 * n_mid[m]) + 2.5 * n_fine[m]
    col = h_ * (1 - 0.15 * ss(0, r_, de)) * ss(r_ + 2, r_ - 3, de) + 1.5 * n_fine[m]
    H[m] = np.maximum(H[m], np.where(de < r_ + 14, np.maximum(col, -6 + 7 * ss(r_ + 14, r_, de)), -1e3))

# ------------------------------------------------------------- the river valley and waterfall
print('valley')
# Wailele: rises on the uplands north of the falls, drops 60 m over the falls into a plunge pool at the back of a
# fluted headwall amphitheatre, runs south through a slot gorge cut into the amphitheatre floor, then down a broad
# valley floor that swings about the river between interlocking spurs to the bay
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
# above the falls the river follows the uplands down (never rising downstream), at least a gentle fall to the lip
up_ = rs < FALL_S
gnd_r = gaussian_filter1d(sample(gaussian_filter(H, 3), river[:, 0], river[:, 1]), 10) - 1.5
river_y[up_] = np.maximum(np.minimum.accumulate(np.minimum(river_y, gnd_r)[up_]), POOL_Y + FALL_H + (FALL_S - rs[up_]) * 0.004)
rd, ri = dist_to(river, 900)
r_s = rs[ri]
ry = river_y[ri]
rT, rN, _ = frames(river, False)
rlat = (X - river[ri, 0]) * rN[ri, 0] + (Z - river[ri, 1]) * rN[ri, 1]     # + west of the river, - east
alat = np.abs(rlat)
# the uplands around the head of the valley sit a little above the top of the falls
dfall = np.hypot(X - 100, Z + 305)
plateau = POOL_Y + FALL_H + 4 + n_mid * 2 + np.clip(-(Z + 300), 0, None) * 0.01
# (only behind the headwall: to the south-west the red-dirt climb comes up the old hills' flank)
H = np.where(dfall < 700, H + (np.maximum(H, plateau) - H) * (1 - ss(350, 700, dfall)) * (1 - ss(-250, -170, Z)), H)
zf = Z + 290                                         # metres south of the plunge pool (the river runs south)
cw = 8 + 10 * ss(0, 1800, zf)
sp = r_s - FALL_S                                    # metres downstream of the falls
# valley half-widths each side of the river: the valley swings about the river, spurs interlock below the tracks,
# and the floor always holds the Wailele road (except the red-dirt climb, which is meant to be on the wall)
spv = np.linspace(-100, rs[-1] - FALL_S + 100, 1200)
wb = 150 + 50 * ss(0, 500, spv) + 90 * ss(1100, 1750, spv)
mea = 55 * np.sin(spv / 310 + 0.6) + 25 * np.sin(spv / 140 + 2.0)
spur = 80 * ss(950, 1150, spv) * np.sin(spv / 105)
Ww, We = wb - mea - np.clip(spur, 0, None), wb + mea - np.clip(-spur, 0, None)
gw = guides['wailele']
gd_, gi_ = cKDTree(river).query(gw)
glat = (gw[:, 0] - river[gi_, 0]) * rN[gi_, 0] + (gw[:, 1] - river[gi_, 1]) * rN[gi_, 1]
gsp = rs[gi_] - FALL_S
for sgn, Wv in ((1, Ww), (-1, We)):
    need = np.zeros_like(spv)
    sel = (np.sign(glat) == sgn) & (np.abs(glat) < 270)
    for a_, l_ in zip(gsp[sel], np.abs(glat[sel])):
        need = np.maximum(need, (l_ + 26) * np.exp(-((spv - a_) / 60) ** 2))
    Wv[:] = np.maximum(Wv, need)
W_side = np.where(rlat > 0, np.interp(sp, spv, gaussian_filter1d(Ww, 6)), np.interp(sp, spv, gaussian_filter1d(We, 6)))
gdep = 22 * (1 - ss(0, 520, sp))                     # the slot gorge: deepest under the falls
sw = 17 + 6 * ss(0, 400, sp)
# the floor: a meandering flood plain by the river, a terrace scarp, then terraces rising to the walls (the roads
# run on the terraces)
fpw = 30 + 16 * np.sin(sp / 170 + 1.0) + 8 * np.sin(sp / 61)
scarp = 7 * ss(150, 450, sp) * (1 - ss(1500, 1800, sp))
vfloor = ry + 1.2 + gdep * ss(sw, sw + 5, alat) + scarp * ss(fpw, fpw + 9, alat + 4 * n_mid) + 0.05 * alat + 1.2 * n_mid
q_side = alat - W_side
q_side = q_side - 14 * flute_at(sp / 9 + (rlat > 0) * 900) * ss(0, 40, q_side)
q_side = gaussian_filter(q_side, 4)          # the nearest river point jumps on the inside of bends
# the headwall amphitheatre: a fluted arc of near-vertical wall from the west wall round behind the falls
dch = np.hypot(X - 85, Z + 120)
ach = np.arctan2(Z + 120, X - 85)
q_head = dch - 185 - 16 * np.sin(ach * 3 + 0.8) - 7 * np.sin(ach * 7 + 2.0) - 9 * flute_at(ach * 185 / 5 + 3000)
hb = ss(-150, -90, Z)
q = q_head * (1 - hb) + q_side * hb
cap = gaussian_filter(vfloor + (1.5 + 1.3 * (1 - hb)) * softplus(q, 10), 3)   # (ry jumps on the inside of bends)
inval = (r_s > FALL_S - 2) & (rd < 900)
H = np.where(inval, np.minimum(H, cap), H)
# the channel itself, and the plunge pool under the falls
chan = ry - 1.6 * (1 - ss(cw * 0.3, cw, rd))
H = np.where((rd < cw) & (r_s > FALL_S), np.minimum(H, chan), H)
dpool = np.hypot(X - 100, Z + 290)
dpool_r = dpool * (1 + 0.12 * np.sin(np.arctan2(Z + 290, X - 100) * 3 + 1.0) + 0.06 * n_mid)   # not a perfect circle
# (the pool stops at the foot of the falls: the lip stands at z -305, the pool is D-shaped against it)
H = np.where((dpool_r < 34) & (Z > -305), np.minimum(H, POOL_Y - 3.5 + ss(10, 34, dpool_r) * 4), H)
# above the lip the river runs in a shallow notch across the uplands
# above the lip the river runs down a V-shaped upland valley between the old hills and the volcano
above = (r_s < FALL_S) & (rd < 600)
H = np.where(above, np.minimum(H, ry - 1.2 + 2.8 * ss(cw * 0.35, cw, rd) + 0.35 * np.clip(rd - cw, 0, None) + 0.0025 * rd ** 2
                              + 1.5 * n_mid * ss(4, 20, rd)), H)
# side valleys from the volcano and the west wall below the tracks
for pth in ([(330, 960), (470, 1010), (600, 1000), (720, 1060)], [(-90, 1150), (-230, 1110), (-360, 1150)],
            [(360, 1330), (500, 1290), (640, 1330)], [(-120, 820), (-260, 800), (-380, 840)]):
    path = polyline(pth, 2.0)
    y0 = float(sample(H, [path[0, 0]], [path[0, 1]])[0])
    yh = y0 + 0.4 * max(float(sample(H, [path[-1, 0]], [path[-1, 1]])[0]) - y0, 0)
    s_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    carve(H, path, y0 + (yh - y0) * (s_ / s_[-1]) ** 1.3, 26 + 18 * ss(0.6, 1, s_ / s_[-1]), 1.7, 8, reach=300, kround=12.0)
# a tributary creek from the west joins the river below the mill (the ford on Wailele Nahele crosses it); it runs
# in its own small valley cut into the west wall
CREEK_CP = [(-420, 330), (-300, 420), (-200, 470), (-110, 500), (-20, 530), (90, 555)]
creek, _ = catmull(CREEK_CP, False, step=2.0)
cs_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(creek, axis=0), axis=1))])
creek_join = float(sample(H, [creek[-1, 0]], [creek[-1, 1]])[0])
creek_y = creek_join + (cs_[-1] - cs_) * 0.035
cpath = creek[::-1]
carve(H, cpath, creek_y[::-1] + 1.4, 15 + 7 * flute_at(np.arange(len(cpath)) * 0.4 + 5000), 1.1, 6, reach=260, kround=10.0)
cd, ci = dist_to(creek, 200)
cy = creek_y[ci]
H = np.where(cd < 8, np.minimum(H, cy - 0.7 + 2.1 * ss(3, 8, cd)), H)        # a real channel, banks ~1.4 m up

H = np.where((sd > 0) & (wpt < 0.3), np.maximum(H, 0.25 + np.minimum(sd, 60) * 0.012), H)

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
k['json'].update(climate='tropical', surfLine=[int(beach_rows.min()), int(beach_rows.max())], rampRow=int(ramp_i))
TRACKS.append(k)

# --- Round 2: Wailele Nahele, the rainforest waterfall circuit (3.0 km, 3 laps)
w = make_track('wailele', 'Wailele Nahele', WAILELE_CP, True, 12.0, 3, 0.14, smooth_k=(41, 21), pre_smooth=4)
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
cdr, cir = cKDTree(creek).query(C)
fd = int(np.argmin(np.where(np.linalg.norm(C - [-111, 515], axis=1) < 80, cdr, 1e9)))   # where the road crosses it
fd_y = float(creek_y[cir[fd]])
FORD_XZ = (float(C[fd, 0]), float(C[fd, 1]))
pins.append((ring(C, fd - 6, fd + 6), np.full(13, fd_y - 0.3)))         # dips into the water, ~0.3 m deep
finish_heights(w, pins)
surf = np.full(n, SURF['red_dirt'])
surf[ring(C, nearest_row(C, (-25, 430)), nearest_row(C, (-70, 60)))] = SURF['gravel']
surf[ring(C, lip - 30, lip)] = SURF['wet_rock']
surf[ring(C, tr_mid - 32, tr_mid + 32)] = SURF['timber']
surf[ring(C, fd - 30, fd + 30)] = SURF['mud']
w['surf'] = surf
w['json'].update(climate='tropical', lipRow=int(lip), landRow=int(land), trestle=[int(tr_mid - 32), int(tr_mid + 32)], fordRow=int(fd),
                 gorge=dict(lip=int(lip), land=int(land), lipY=round(LIP_Y, 2)))
TRACKS.append(w)

# --- Round 3: Pali Kai, the north-shore sea-cliff sprint (4.2 km)
p = make_track('palikai', 'Pali Kai', PALI_CP, False, 13.0, 1, 0.13, smooth_k=(41, 21))
C = p['C']
n = len(C)
gnd = sample(H, C[:, 0], C[:, 1])
pins = []
# the cliff-top road runs on the plateau; the descent drops down the face; the reef road sits just awash
top_rows = np.where(C[:, 0] < 60)[0]
# a smooth profile over the plateau (pinning single rows left a bump at each)
top_y = smooth(np.maximum(sample(gaussian_filter(H, 4), C[top_rows, 0], C[top_rows, 1]), CLIFF_H - 4), 121, False)
pins.append((top_rows[20:-20], smooth(grade_limit(top_y, 0.08, False), 61, False)[20:-20]))
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
p['json'].update(climate='tropical', archRow=int(arch_i), reef=[int(reef_rows.min()), int(reef_rows.max())],
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

# a level yard for the old sugar mill on the west side of Wailele Nahele's start straight
wt = TRACKS[1]
mr = np.arange(0, 220)
sl, Xs, Zs, d_, ii_, ok_ = near_path(wt['C'][mr], 90)
lt = (Xs - wt['C'][mr][ii_, 0]) * wt['N'][mr][ii_, 0] + (Zs - wt['C'][mr][ii_, 1]) * wt['N'][mr][ii_, 1]
wpad = ss(-90, -62, lt) * (1 - ss(-11, -6, lt)) * ss(0, 15, ii_) * (1 - ss(200, 219, ii_)) * ok_
H[sl] = H[sl] * (1 - wpad) + (wt['th'][mr][ii_] + 0.2) * wpad
# shape the valley sides round Wailele Nahele so the road runs on a shelf: within reach of the road the ground may
# rise or fall away from the road edge no steeper than 0.8 (cut and fill faces), so no deep trench or tall bank
sl, Xs, Zs, d_, ii_, ok_ = near_path(wt['C'], 140)
skip_ = wt['gap'][ii_] | (np.abs(ii_ - fd) < 14)
th_ = wt['th'][ii_]
Hs_ = H[sl]
# first ease the whole hillside towards the road (a broad bench rather than a slot), never filling over the river
ease = (1 - ss(15, 130, d_)) * np.where(Hs_ > th_, 0.85, 0.6 * ss(40, 70, rd[sl]))
Hs_ = Hs_ - ease * (Hs_ - th_)
lim = 1.5 + 0.8 * np.clip(d_ - wt['width'] / 2 - 1, 0, None)
Hs_ = np.clip(Hs_, th_ - lim, th_ + lim)
H[sl] = np.where(ok_ & ~skip_, Hs_, H[sl])

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
for t in TRACKS:          # how far the ground beside each road sits above (+, a cutting) or below (-, a bank) it
    off = np.array([sample(nat, t['C'][:, 0] + t['N'][:, 0] * s_ * 15, t['C'][:, 1] + t['N'][:, 1] * s_ * 15) - t['th']
                    for s_ in (-1, 1)])
    off = np.where(np.repeat(t['gap'][None], 2, 0), 0, off)
    print(f"  {t['id']}: ground at 15 m: cut>6 m {np.mean(np.max(off, 0) > 6) * 100:.0f}%  bank>6 m "
          f"{np.mean(np.min(off, 0) < -6) * 100:.0f}%  worst {off.max():.0f}/{off.min():.0f}")
    if os.environ.get('CUTS'):
        print('   rows/100 max cut:', ' '.join(f'{v:.0f}' for v in off.max(0).reshape(-1)[:len(off[0]) // 100 * 100].reshape(-1, 100).max(1)))
        print('   rows/100 min    :', ' '.join(f'{v:.0f}' for v in off.min(0).reshape(-1)[:len(off[0]) // 100 * 100].reshape(-1, 100).min(1)))
diff = nat - road_h
cut = diff > 0
shoulder = np.where(cut, 3 + np.clip(diff, 0, 40) * 0.4, 6 + np.clip(-diff, 0, 30) * 1.4)
half = hw + 2.0
wgt = 1 - ss(half, half + shoulder, d)
berm = np.exp(-((d - half - 1.2) / 1.4) ** 2) * 0.5 * (d < 90)
Hc = nat * (1 - wgt) + road_h * wgt + berm * (1 - wgt * 0.5)
gapmask = allGap[idx] & (d < half + 5)
Hc = np.where(gapmask, np.minimum(nat, allH[idx] - 8), Hc)        # no fill under a jump or a bridge
H = np.where(d < 1e8, Hc, H)
# the reef road and the surf line stay at the waterline (no berms out into the sea)
H = gaussian_filter(H, 0.5)
# keep the plunge pool and the river channel open after the carve
H = np.where((dpool_r < 30) & (Z > -305), np.minimum(H, POOL_Y - 3.0 + ss(10, 30, dpool_r) * 3), H)
# the road never fords the river (it jumps the gorge and bridges it), so the gorge and the channel are re-cut
# through any fill; the creek likewise, except where Wailele Nahele fords it
H = np.where(inval & (alat < sw) & (gdep > 1), np.minimum(H, ry + 1.2 + 0.05 * alat + 25 * ss(sw - 2, sw, alat)), H)
H = np.where((rd < cw) & (r_s > FALL_S), np.minimum(H, chan), H)
ford_d = np.hypot(X - FORD_XZ[0], Z - FORD_XZ[1])
H = np.where((cd < 8) & (ford_d > 16), np.minimum(H, cy - 0.7 + 2.1 * ss(3, 8, cd)), H)
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
slope = np.hypot(*np.gradient(gaussian_filter(H, 3), RES))     # smoothed: the 2 m grid's roughness isn't slope
# moisture: the trade wind comes from the north-north-east, so windward slopes, the cloud belt (150-550 m), the old
# west hills and the valley bottoms are wet; the lee and the volcano's summit are dry
gz_, gx_ = np.gradient(gaussian_filter(H, 12), RES)
gl_ = np.hypot(gx_, gz_) + 1e-6
windward = (-0.6 * gx_ + 0.8 * gz_) / gl_ * ss(0.03, 0.2, gl_)
concave = gaussian_filter(H, 20) - H
moist = (0.42 + 0.28 * windward + 0.35 * ss(0, 20, concave) + 0.25 * ss(120, 350, H) * (1 - ss(560, 700, H))
         - 0.6 * ss(560, 700, H) + 0.45 * hills_w + 0.12 * n_big
         + 0.55 * (1 - ss(150, 450, rd)) * ss(FALL_S - 450, FALL_S - 200, r_s) + 0.35 * ss(20, 200, -(Z + 1250)) * (1 - G_['face']))
veg = ss(0.2, 0.9, moist)
wet = ss(0.6, 1.0, moist)
# salt spray keeps the shore bare; naupaka scrub on the dunes, palms and grass behind them
veg = veg * np.maximum(ss(5, 40, sd), ss(8, 25, H)) * ss(0, 4, sd)   # spray zone, not up the cliff faces
gb = G_['beach'] * (1 - ss(140, 240, sd))
veg = veg * (1 - gb) + gb * ss(65, 120, sd) * 0.4
# bare rock: sea cliffs and talus, the lava point and tide pools, fresh flows, cinder cones, the summit, sea stacks
rock = ss(1.4, 2.6, slope) * (1 - 0.75 * wet)
rock = np.maximum(rock, G_['cliff'] * (1 - ss(tw, tw + 4, sd)) * ss(-12, -2, sd) * (1 - np.exp(-(dcove / 34) ** 2)))
rock = np.maximum(rock, g_pt * (1 - ss(60, 95, sd)) * ss(-50, -30, sd))
rock = np.maximum(rock, (1 - ss(10, 18, inlet_d)) * 0.8)
rock = np.maximum(rock, fresh_flow * 0.75)
rock = np.maximum(rock, cinder * 0.45)
rock = np.maximum(rock, 0.55 * ss(620, 720, H))
rock = np.maximum(rock, w_reef * (1 - ss(-30, 5, sd)))
rock = np.maximum(rock, (sd < 0) * ss(1, 4, H))
rock = np.maximum(rock, G_['wcliff'] * (1 - ss(tw, tw + 6, sd)) * ss(-10, 0, sd) * 0.8)
rock = np.maximum(rock, G_['cliff'] * (1 - ss(tw + 8, tw + 14, sd)) * ss(-12, -2, sd) * 0.85)   # the sea-cliff faces
rock = np.clip(rock, 0, 1)
veg = np.maximum(veg, 0.3 * ss(5, 60, sd) * (1 - gb))         # at least grass on the dry lowland
veg = veg * (1 - rock * 0.85) * (1 - road) * (1 - 0.6 * cinder) * (1 - ss(0, 2, cw - rd))
# sand: the beaches from below the waterline to the dunes, the cove beaches under the cliffs, the valley-mouth bays
sand = G_['beach'] * (1 - ss(95 - 45 * bayg, 150 - 60 * bayg, sd + n_mid * 25)) * ss(-90, -60, sd)
sand = np.maximum(sand, np.exp(-(dcove / 40) ** 2) * (1 - ss(18, 28, sd)) * ss(-30, -15, sd))
vbay = np.zeros_like(H)
for pth, end, kind, hwm, _ in VALLEYS:
    if end == 'sea' and kind == 'major':
        vbay = np.maximum(vbay, 1 - ss(hwm * 0.9, hwm * 1.4, np.hypot(X - pth[0, 0], Z - pth[0, 1])))
sand = np.maximum(sand, vbay * (1 - ss(25, 45, sd)) * ss(-40, -20, sd) * 0.9)
sand = np.maximum(sand, (1 - ss(1, 6, sd)) * ss(-12, -4, sd) * (1 - G_['cliff']) * (1 - G_['wcliff']) * (1 - g_pt) * 0.45)
sand = np.clip(sand * (1 - ss(0.35, 0.7, slope)) * (1 - g_pt * 0.9), 0, 1)
w_cove = ss(-1300, -1500, Z) * ss(990, 1060, X) * (1 - ss(1420, 1520, X))
white = np.clip(w_cove + w_reef * 0.8 + bayg * 0.35 + np.exp(-(dcove / 40) ** 2) * 0.25 + vbay * 0.1, 0, 1)
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
# each channel resized on its own: Pillow premultiplies alpha when resizing RGBA, which wiped R/G/B wherever A = 0
chans = [Image.fromarray((np.clip(biome[k_], 0, 1) * 255).astype(np.uint8)).resize((2048, 2048), Image.BILINEAR)
         for k_ in ('sand', 'white', 'veg', 'rock')]
Image.merge('RGBA', chans).save(f'{OUT}/biome.png')

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
