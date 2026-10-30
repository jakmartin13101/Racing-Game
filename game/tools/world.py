"""Bakes the volcano world: terrain heightmap, surface masks and track data.

Outputs to public/world/:
  height.u16   heights (hmin..hmax in track.json), GRID x GRID, row-major (z rows, x columns)
  masks.png    R = lava glow proximity, G = track/road influence, B = channel/burn
  track.json   the three tracks (centrelines, start, laps), lava rivers, lake, village buildings

    python tools/world.py
"""
import json
import math
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, uniform_filter1d
from scipy.spatial import cKDTree

OUT = os.environ.get('WORLD_OUT') or os.path.join(os.path.dirname(__file__), '..', 'public', 'world')
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
# the summit blew off long ago: a plateau ring round a deep crater bowl with a lava lake (Eruption jumps it)
SUMMIT = 560.0
CRATER_R = 88.0
cone = np.minimum(cone, SUMMIT)
crater = 128 * np.clip(1 - (R / CRATER_R) ** 4, 0, 1) ** 0.8
cone -= crater
cone += 5 * np.exp(-((R - CRATER_R - 4) / 6) ** 2)  # raised rim
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
ridges = gaussian_filter(np.clip(1 - np.abs(spectral(2.6, 2, seed=32)) * 0.6, 0, 1) ** 3, 14) * 130 * ss(1050, 1500, R)
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
    # east flow, crosses the Caldera Loop: it wells up from a flank fissure just above the loop (the Eruption
    # climbs the cone above it)
    dict(path=meander(18, 150, 760, 5), w=26, from_r=360),
    dict(path=meander(165, 150, 355, 6), w=20),   # south-west flow, beside the Ash Ridge
    dict(path=meander(262, 150, 172, 7), w=15),   # north-west spill under the rim
]
lake_c = np.array([219.0, 601.0])
lake_r = 70.0

lava_dist = np.full(H.shape, 1e9)
pts_all = np.stack([X.ravel(), Z.ravel()], 1)
for rv in rivers:
    p = rv['path']
    w = rv['w'] * (0.7 + 0.6 * np.linspace(0, 1, len(p)))  # widens downhill
    if 'from_r' in rv:
        keep = np.hypot(p[:, 0], p[:, 1]) >= rv['from_r']
        p, w = p[keep], w[keep]
        rv['path'] = p
    tree = cKDTree(p)
    d, idx = tree.query(pts_all, distance_upper_bound=120)
    d = d.reshape(H.shape)
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

# ------------------------------------------------------------- track splines
print('tracks')
# Three tracks share the one volcano map. Angles in degrees from +x towards +z (z is south in three.js).


def polar(pts):
    return np.array([(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a, r in pts])


def catmull(P, closed, step=1.0):
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
    out = ((up + lo) / 2)[n:2 * n] if closed else (up + lo) / 2
    return out


def frames(C, closed):
    ext = np.vstack([C[-2:], C, C[:2]]) if closed else np.vstack([C[:1], C[:1], C, C[-1:], C[-1:]])
    T = np.gradient(ext, axis=0)[2:-2]
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    Nrm = np.stack([-T[:, 1], T[:, 0]], 1)
    ang = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
    curv = np.gradient(ang)
    curv = smooth(curv, 41, closed)
    return T, Nrm, curv


TRACKS = []

# --- Caldera Loop: the main circuit round the volcano, with the lava jump
CP_LOOP = polar([
    (100, 560), (80, 556), (62, 520), (45, 440), (30, 382), (15, 372), (0, 400),
    (-15, 440), (-30, 420), (-45, 372), (-60, 334), (-78, 322), (-95, 350),
    (-112, 400), (-130, 450), (-148, 470), (-165, 440), (-180, 404), (-195, 384),
    (-210, 420), (-225, 480), (-240, 540), (-251, 560),
])
C, LEN = catmull(CP_LOOP, True)
th = smooth(smooth(sample(H, C[:, 0], C[:, 1]), 151, True), 61, True)
th = smooth(grade_limit(th, 0.11, True), 31, True)
east = rivers[0]['path']
dd, _ = cKDTree(east).query(C)
cross = int(np.argmin(dd))
NC = len(C)
rel = ((np.arange(NC) - cross + NC // 2) % NC) - NC // 2
th = th + np.where((rel > -60) & (rel <= -8), ss(-60, -10, rel) * 3.2, 0)
gap = (rel > -8) & (rel < 12)
th = th + np.where((rel >= 12) & (rel < 50), (1 - ss(12, 50, rel)) * 1.6, 0)
TRACKS.append(dict(id='caldera', name='Caldera Loop', kind='circuit', closed=True, C=C, th=th, gap=gap,
                   width=17.0, start=30, laps=2, jump=cross, bankK=18))

# --- Summit Sprint: point to point, serpentine up the north-west flank to a lookout below the crater
def serpentine(legs, start, step_deg=1.0):
    """Polar switchback road: legs are (radius, from_deg, to_deg); consecutive legs are joined by a
    semicircular hairpin beyond the end angle, so hairpin radius = half the radial gap."""
    pts = [np.array(start)]
    for k, (r, a0, a1) in enumerate(legs):
        n = max(2, int(abs(a1 - a0) / step_deg))
        for a in np.linspace(a0, a1, n + 1)[1:] if k else np.linspace(a0, a1, n + 1):
            pts.append(np.array([r * math.cos(math.radians(a)), r * math.sin(math.radians(a))]))
        if k + 1 < len(legs):
            r2 = legs[k + 1][0]
            rc, hr = (r + r2) / 2, abs(r - r2) / 2
            c = np.array([rc * math.cos(math.radians(a1)), rc * math.sin(math.radians(a1))])
            radial = c / np.linalg.norm(c)
            tang = np.array([-radial[1], radial[0]]) * (1 if a1 > a0 else -1)
            sgn = 1 if r2 < r else -1
            for th in np.linspace(0, math.pi, 15)[1:-1]:
                pts.append(c + radial * sgn * hr * math.cos(th) + tang * hr * math.sin(th))
    return np.array(pts)


# legs: (radius m, from deg, to deg). Wide hairpins on the lower flank, tighter ones above the Caldera Loop.
CP_SPRINT = np.vstack([
    serpentine([(860, -118, -147), (790, -147, -116), (720, -116, -147), (650, -147, -116), (580, -116, -128)],
               start=(860 * math.cos(math.radians(-112)), 860 * math.sin(math.radians(-112)))),
    polar([(-131, 548), (-132, 500), (-132, 450), (-132, 400), (-132, 378)]),
    serpentine([(364, -134, -145), (322, -145, -118), (280, -118, -145), (238, -145, -120), (200, -120, -136)],
               start=(364 * math.cos(math.radians(-133)), 364 * math.sin(math.radians(-133))))[1:],
])
C, LEN = catmull(CP_SPRINT, False)
# round off the joins between legs, hairpins and the straight connector, then resample at 1 m
from scipy.ndimage import gaussian_filter1d  # noqa: E402
C = gaussian_filter1d(C, 7, axis=0, mode='nearest')
C, LEN = catmull(C[::4], False)
ground = sample(H, C[:, 0], C[:, 1])
th = smooth(smooth(ground, 61, False), 31, False)
# pin the height where the sprint crosses the Caldera Loop so the junction is flush
loop = TRACKS[0]
dl, il = cKDTree(loop['C']).query(C)
xi = int(np.argmin(dl))
th = smooth(grade_limit(th, 0.15, False), 21, False)
# meet in the middle at the junction: each road takes half the height difference over a long raised-cosine
jl = int(il[xi])
delta = float(th[xi] - loop['th'][jl])


def bump(n, i, half, closed):
    dist = np.abs(np.arange(n) - i)
    if closed:
        dist = np.minimum(dist, n - dist)
    return np.where(dist < half, 0.5 + 0.5 * np.cos(np.pi * dist / half), 0)


th = th - delta / 2 * bump(len(th), xi, 300, False)
loop['th'] = loop['th'] + delta / 2 * bump(len(loop['th']), jl, 300, True)
print(f'  junction delta {delta:.1f} m')
TRACKS.append(dict(id='summit', name='Summit Sprint', kind='sprint', closed=False, C=C, th=th, gap=np.zeros(len(C), bool),
                   width=13.0, start=20, laps=1, bankK=10, crossing=xi))

# --- Ashfall Village circuit: on the ash plain south-west, through the village streets and out round the fields
VC = np.array([-705.0, 591.0])          # village square
VU = -VC / np.linalg.norm(VC)            # unit vector towards the volcano
VV = np.array([-VU[1], VU[0]])


def vil(uv):
    return np.array([VC + VU * u + VV * v for u, v in uv])


CP_VIL = vil([
    (-10, -150), (20, -95), (40, -40), (45, 20), (30, 75), (-5, 110), (-55, 120), (-95, 95), (-115, 45),
    (-150, 10), (-215, 0), (-275, 30), (-300, 100), (-280, 175), (-215, 225), (-120, 245), (-20, 235), (70, 205),
    (140, 160), (185, 85), (190, 0), (160, -80), (100, -150), (40, -205), (-20, -230), (-70, -205), (-62, -160),
])
# soften the plain the village sits on
vd = np.hypot(X - VC[0], Z - VC[1])
H = H * (1 - (1 - ss(180, 330, vd)) * 0.85) + gaussian_filter(H, 18) * (1 - ss(180, 330, vd)) * 0.85
C, LEN = catmull(CP_VIL, True)
C = gaussian_filter1d(C, 9, axis=0, mode='wrap')
C, LEN = catmull(C[::4], True)
th = smooth(smooth(sample(gaussian_filter(H, 6), C[:, 0], C[:, 1]), 121, True), 61, True)
th = smooth(grade_limit(th, 0.08, True), 31, True)
TRACKS.append(dict(id='village', name='Ashfall Village', kind='circuit', closed=True, C=C, th=th, gap=np.zeros(len(C), bool),
                   width=13.0, start=20, laps=3, bankK=8, centre=VC.tolist()))

# --- Eruption: the finale, a hill climb. Up from the southern plain onto the Caldera Loop and over its lava jump,
# off the loop in a wide U and up three long sweeping legs of the eastern cone to the Ash Ridge, a shoulder of the
# summit. Out along the ridge, round the teardrop at its nose and down the in-run straight to a kicker in a notch of
# the crater rim: a ballistic jump across the lava lake onto a landing hill cut into the far rim. Then down three
# fast legs of the north-east cone onto the loop at its high point, round the loop downhill and out to the plain.
loop = TRACKS[0]
LC, LT = loop['C'], loop['th']
NL = len(LC)


def polar1(a, r):
    return np.array([r * math.cos(math.radians(a)), r * math.sin(math.radians(a))])


def piece(ctrl):
    C, _ = catmull(np.array(ctrl, float), False)
    return C


def fan(legs, step=2.0):
    """Switchback legs whose radius changes along the leg, (from_deg, to_deg, r_from, r_to), so a climbing leg can
    spiral in with the cone. Consecutive legs join with a semicircular hairpin beyond the end angle."""
    pts = []
    for k, (a0, a1, r0, r1) in enumerate(legs):
        n = max(2, int(abs(a1 - a0) / step))
        for t in np.linspace(0, 1, n + 1)[(1 if k else 0):]:
            pts.append(polar1(a0 + (a1 - a0) * t, r0 + (r1 - r0) * t))
        if k + 1 < len(legs):
            r2 = legs[k + 1][2]
            rc, hr = (r1 + r2) / 2, abs(r1 - r2) / 2
            c = polar1(a1, rc)
            radial = c / np.linalg.norm(c)
            tang = np.array([-radial[1], radial[0]]) * (1 if a1 > a0 else -1)
            sgn = 1 if r2 < r1 else -1
            for th_ in np.linspace(0, math.pi, 15)[1:-1]:
                pts.append(c + radial * sgn * hr * math.cos(th_) + tang * hr * math.sin(th_))
    return np.array(pts)


# the jump: from a kicker in the rim notch at LIP_A across the lava lake (off-centre, so the climb and the descent
# each get a half of the cone) to the landing hill in the far rim at LAND_A
RIM = CRATER_R + 6
LIP_A, LAND_A = 125.0, -10.0
P_LIP, P_LAND = polar1(LIP_A, RIM), polar1(LAND_A, RIM)
CHORD = float(np.linalg.norm(P_LAND - P_LIP))
UJ = (P_LAND - P_LIP) / CHORD           # flight direction
NJ = np.array([-UJ[1], UJ[0]])          # across it, towards the climb side


def ridge(s, lat):
    """Point on the Ash Ridge: s metres back from the lip along the run-up, lat metres across it."""
    return P_LIP - UJ * s + NJ * lat


# design jump: launch speed and kicker angle, touchdown on a landing hill tangent to the arc
V_JUMP, KICK_DEG, KICK_LEN = 45.0, 22.0, 44.0
IN_TOP, IN_LOW = 559.0, 546.0           # in-run: from the teardrop at the ridge nose down to the kicker
KICK_R = KICK_LEN / math.tan(math.radians(KICK_DEG))
LIP_H = IN_LOW + KICK_LEN ** 2 / (2 * KICK_R)
VX, VY = V_JUMP * math.cos(math.radians(KICK_DEG)), V_JUMP * math.sin(math.radians(KICK_DEG))


def arc_h(x):
    return LIP_H + VY * x / VX - 9.81 * x * x / (2 * VX * VX)


X_TD = CHORD + 31.0                     # touchdown, past the far rim
SLOPE_TD = VY / VX - 9.81 * X_TD / (VX * VX)

# the Ash Ridge: raise a flat-topped shoulder under the out-leg, the teardrop and the in-run
RIDGE_NOSE, RIDGE_LAT, RIDGE_W = 222.0, 18.0, 38.0
sx, sz = X - P_LIP[0], Z - P_LIP[1]
r_s = -(sx * UJ[0] + sz * UJ[1])
r_l = sx * NJ[0] + sz * NJ[1]
r_top = IN_LOW + (IN_TOP - IN_LOW) * ss(40, 200, r_s)
r_edge = np.hypot(np.maximum(np.abs(r_l - RIDGE_LAT) - RIDGE_W, 0), np.maximum(r_s - RIDGE_NOSE, 0) * 1.4)
rough = spectral(2.2, 8, seed=41) * 6 + spectral(2.0, 30, seed=42) * 1.5
r_h = r_top - r_edge * (1.9 + 0.35 * spectral(2.4, 4, seed=43)) + rough * ss(0, 30, r_edge)
r_h = np.where(r_s > 20, r_h, -1e9)
H = np.where(r_h > H, H + (r_h - H) * ss(0, 25, r_h - H + 8), H)
# notch the far rim for the landing hill
f_s = sx * UJ[0] + sz * UJ[1] - CHORD
f_l = sx * NJ[0] + sz * NJ[1]
f_x = np.clip(CHORD + f_s, CHORD, X_TD + 40)
f_floor = np.where(f_x < X_TD, arc_h(f_x) - 0.003 * (X_TD - f_x) ** 2, arc_h(X_TD) + SLOPE_TD * (f_x - X_TD) * 0.8)
notch = f_floor - 4 + np.maximum(np.abs(f_l) - 14, 0) * 0.8 + np.maximum(-f_s - 4, 0) * 2.5
H = np.where((f_s > -30) & (f_s < 80) & (np.abs(f_l) < 90), np.minimum(H, notch), H)

I_MERGE, I_DIVERGE = 175, 920           # climb runs on the loop between these (incl. its lava jump)
I_MERGE2, I_EXIT = 1380, 2765           # descent joins the loop near its high point and leaves it for the plain
approach = piece([polar1(103, 1010), polar1(101, 900), polar1(98, 780), polar1(95, 680), polar1(92, 600), polar1(89, 568),
                  LC[I_MERGE - 40], LC[I_MERGE]])
# off the loop inwards in a wide U, then three long legs spiralling up the eastern cone
U_C = LC[I_DIVERGE + 14] + np.array([-38.5, -11.0])
up = piece(np.vstack([LC[I_DIVERGE:I_DIVERGE + 15:5],
    [U_C + 38.5 * np.array([math.cos(math.radians(f)), math.sin(math.radians(f))]) for f in range(-4, -165, -20)],
    fan([(-10, 92, 342, 288), (92, 6, 244, 194), (6, 104, 170, 168)]),
    [ridge(60, 38), ridge(90, 36), ridge(130, 36), ridge(165, 38), ridge(186, 43), ridge(204, 39), ridge(215, 26),
     ridge(214, 10), ridge(204, -2), ridge(184, -6), ridge(160, -3), ridge(130, 0), ridge(90, 0), ridge(45, 0),
     ridge(0, 0)]]))
gapC = piece([P_LIP, P_LIP + UJ * CHORD * 0.5, P_LAND])
# the landing hill runs on down the line of flight, then a 50 m radius right-hander into the first descending leg
BEND_S, BEND_R = P_LAND + UJ * 50, 50.0
BEND_H = math.atan2(UJ[1], UJ[0])
BEND_C = BEND_S + BEND_R * np.array([math.cos(BEND_H - math.pi / 2), math.sin(BEND_H - math.pi / 2)])
bend = [BEND_C + BEND_R * np.array([math.cos(BEND_H + math.pi / 2 - f), math.sin(BEND_H + math.pi / 2 - f)])
        for f in np.radians(np.arange(10, 97, 10))]
down = piece(np.vstack([[P_LAND], [P_LAND + UJ * 31], [BEND_S], bend,
    fan([(-39.5, -95, 189, 204), (-95, -28, 238, 280), (-28, -64, 318, 321)]),
    LC[I_MERGE2 - 24:I_MERGE2 + 1:12]]))
out = piece([LC[I_EXIT], LC[I_EXIT + 30], polar1(104, 610), polar1(106, 680), polar1(109, 760), polar1(111, 840), polar1(113, 930), polar1(114.5, 1020), polar1(115.5, 1110)])
segs = [('approach', approach[:-1]), ('loopA', LC[I_MERGE:I_DIVERGE]), ('up', up[:-1]), ('gap', gapC[:-1]),
        ('down', down[:-1]), ('loopB', LC[I_MERGE2:I_EXIT]), ('out', out)]
C = np.vstack([c for _, c in segs])
kind = np.concatenate([np.full(len(c), k) for k, (_, c) in enumerate(segs)])
# round off the joins between pieces, then hold the shared loop sections, the in-run and the jump line exactly
Cs = gaussian_filter1d(C, 3, axis=0, mode='nearest')
gi = np.where(kind == 3)[0]
lip, land = int(gi[0]), int(gi[-1] + 1)
exact = (kind == 1) | (kind == 5)
exact[lip - 150:land + 60] = True
Cs[exact] = C[exact]
C = Cs
ground = sample(H, C[:, 0], C[:, 1])
th = smooth(smooth(ground, 61, False), 31, False)
# pinned heights: the shared loop sections, the in-run and its kicker, the flight line and the landing hill
pin = np.zeros(len(C), bool)
P = np.zeros(len(C))
for k in (1, 5):
    idx = np.where(kind == k)[0]
    lo_i = [I_MERGE, I_MERGE2][k == 5]
    pin[idx] = True
    P[idx] = LT[lo_i:lo_i + len(idx)]
# in-run: from the teardrop (top of the ridge) down to the kicker, then the kicker's circular lip
i_run = lip - 170
xr = np.arange(i_run, lip) - lip + KICK_LEN    # metres from the start of the kicker (negative before it)
pin[i_run:lip] = True
P[i_run:lip] = np.where(xr < 0, IN_LOW + (IN_TOP - IN_LOW) * ss(0, 1, -xr / (170 - KICK_LEN)), IN_LOW + np.maximum(xr, 0) ** 2 / (2 * KICK_R))
pin[gi] = True
P[gi] = arc_h(np.arange(len(gi)) * CHORD / len(gi))
# landing hill: just under the arc before touchdown, tangent to it there, then easing out to the descent grade
n_land = 90
xl = CHORD + np.arange(n_land)
land_h = np.where(xl < X_TD, arc_h(xl) - 0.003 * (X_TD - xl) ** 2, 0)
after = xl >= X_TD
slope = SLOPE_TD + (-0.3 - SLOPE_TD) * ss(0, 1, (xl - X_TD) / 60)
land_h[after] = arc_h(X_TD) + np.cumsum(slope[after]) - slope[after][0]
pin[land:land + n_land] = True
P[land:land + n_land] = land_h


def grade_limit_pinned(v, g, pin, P, gu=None, raw=None):
    """Closest profile within the per-row grade limits that passes through the pinned heights: each row may
    fall by at most g and climb by at most gu (g when not given) from the one before."""
    n = len(v)
    g = np.broadcast_to(g, (n,))
    gu = g if gu is None else np.broadcast_to(gu, (n,))
    U = np.where(pin, P, np.inf)
    L = np.where(pin, P, -np.inf)
    for i in range(1, n):
        if not pin[i]:
            U[i] = min(U[i], U[i - 1] + gu[i])
            L[i] = max(L[i], L[i - 1] - g[i])
    for i in range(n - 2, -1, -1):
        if not pin[i]:
            U[i] = min(U[i], U[i + 1] + g[i + 1])
            L[i] = max(L[i], L[i + 1] - gu[i + 1])
    f = np.clip(v, L, U)
    f0 = f.copy()
    # then the closest profile inside the grade limits: mean of the upper and lower envelopes
    up_, lo_ = f.copy(), f.copy()
    for i in range(1, n):
        up_[i] = min(up_[i], up_[i - 1] + gu[i])
        lo_[i] = max(lo_[i], lo_[i - 1] - g[i])
    for i in range(n - 2, -1, -1):
        up_[i] = min(up_[i], up_[i + 1] + g[i + 1])
        lo_[i] = max(lo_[i], lo_[i + 1] - gu[i + 1])
    f = np.clip((up_ + lo_) / 2, L, U)
    # (where the limits leave next to no slack the mean steps flat and then drops; there the clipped ground is kept)
    if raw is not None:
        # the descent drops at its limit from the landing hill, never levelling on the rim
        f0 = np.where(raw, np.minimum(f0, L), f0)
        for i in range(1, n):
            if raw[i] and not pin[i]:
                f0[i] = min(max(f0[i], f0[i - 1] - g[i]), f0[i - 1] + gu[i])
        f = np.where(raw, np.clip(f0, L, U), f)
    f[pin] = P[pin]
    return f


# where the free road runs within a road's width of the loop (merging, leaving, the U-turn off it), it takes
# the loop's height, so the two carves agree and no wall is left between them
loop_tree = cKDTree(LC)
dl, jl = loop_tree.query(C)
close = (dl < 26) & ~pin & np.isin(kind, [0, 2, 4, 6])
pin[close] = True
P[close] = LT[jl[close]]
# the climb is held to the usual road grade; the descent may run steeper (it is downhill, and the lava is coming)
# and runs downhill all the way, with no crest to throw a truck off between the bends
gmax = np.where(np.arange(len(C)) > land, 0.29, 0.195)
gup = np.where(kind == 4, 0.01, gmax)
th = grade_limit_pinned(th, gmax, pin, P, gup, kind == 4)
# smooth the free road, fading the smoothing out towards the pinned stretches so the joins stay exact
near = np.convolve(pin.astype(float), np.ones(31) / 31, mode='same')
th = th + (smooth(th, 21, False) - th) * np.clip(1 - near * 3, 0, 1) * ~pin
gapE = np.zeros(len(C), bool)
gapE[gi] = True
# copy the loop's own lava-river gap on the shared section
lg = np.where(loop['gap'])[0]
for j in lg:
    if I_MERGE <= j < I_DIVERGE:
        gapE[np.where(kind == 1)[0][0] + (j - I_MERGE)] = True
skip = np.zeros(len(C), bool)
skip[gi] = True
segstart = {name: int(np.where(kind == k)[0][0]) for k, (name, _) in enumerate(segs)}
leap = dict(v=V_JUMP, angle=KICK_DEG, td=int(land + X_TD - CHORD), lipH=round(LIP_H, 3))
TRACKS.append(dict(id='eruption', name='Eruption', kind='sprint', closed=False, C=C, th=th, gap=gapE, skip=skip,
                   width=13.0, start=20, laps=1, bankK=10, runout=180, segs=segstart, lip=lip, land=land, leap=leap,
                   runup=int(i_run), loopJump=int(segstart['loopA'] + loop['jump'] - I_MERGE),
                   shared=[[segstart['loopA'], segstart['up']], [segstart['loopB'], segstart['out']]]))
print('  eruption pieces', segstart, 'lip', lip, 'land', land, 'leap', leap)

for t in TRACKS:
    t['T'], t['N'], curv = frames(t['C'], t['closed'])
    t['bank'] = np.clip(curv * t['bankK'], -0.09, 0.09)
    t['len'] = float(len(t['C']))
    print(f"  {t['id']}: {len(t['C'])} m, height {t['th'].min():.0f}..{t['th'].max():.0f}")

# ------------------------------------------------------------- village plots
print('village')
# the crater gap carves nothing and paints no road
keep = np.concatenate([~t.get('skip', np.zeros(len(t['C']), bool)) for t in TRACKS])
allC = np.vstack([t['C'] for t in TRACKS])[keep]
allW = np.concatenate([np.full(len(t['C']), t['width']) for t in TRACKS])[keep]
allH = np.concatenate([t['th'] for t in TRACKS])[keep]
road_tree = cKDTree(allC)
vt = TRACKS[2]
brng = np.random.default_rng(11)
buildings = []
foot_tree_pts = []


def clear_of(pts, r):
    d, i = road_tree.query(pts)
    return np.all(d > allW[i] / 2 + r)


def footprint(x, z, yaw, w, dpt):
    c, s = math.cos(yaw), math.sin(yaw)
    pts = []
    for a in np.linspace(-w / 2, w / 2, 5):
        for b in np.linspace(-dpt / 2, dpt / 2, 5):
            pts.append((x + c * a + s * b, z - s * a + c * b))
    return np.array(pts)


Cv, Tv, Nv = vt['C'], vt['T'], vt['N']
for i in range(0, len(Cv), 1):
    if np.hypot(*(Cv[i] - VC)) > 175:
        continue
    for side in (-1, 1):
        if brng.random() < 0.12:
            continue
        w = brng.uniform(7, 12)
        dpt = brng.uniform(7, 10)
        set_back = vt['width'] / 2 + brng.uniform(2.0, 4.5) + dpt / 2
        x, z = Cv[i] + Nv[i] * side * set_back
        # facing the road: building local +z points at the street
        yaw = math.atan2(-Nv[i][0] * side, -Nv[i][1] * side)
        fp = footprint(x, z, yaw, w + 1.5, dpt + 1.5)
        if not clear_of(fp, 1.5):
            continue
        if foot_tree_pts and np.min(np.hypot(*(np.array([b['x'] for b in buildings]) - x,
                                               np.array([b['z'] for b in buildings]) - z))) < 1:
            pass
        ok = True
        for b in buildings:
            if abs(b['x'] - x) < 18 and abs(b['z'] - z) < 18:
                bp = footprint(b['x'], b['z'], b['yaw'], b['w'] + 1.5, b['d'] + 1.5)
                if np.min(np.hypot(bp[:, None, 0] - fp[None, :, 0], bp[:, None, 1] - fp[None, :, 1])) < 2.2:
                    ok = False
                    break
        if not ok:
            continue
        di, ii = road_tree.query([x, z])
        buildings.append(dict(x=float(x), z=float(z), yaw=float(yaw), w=float(w), d=float(dpt),
                              floors=int(brng.choice([1, 1, 2, 2, 2, 3])), kind=int(brng.integers(0, 6)),
                              y=float(allH[ii])))
# outlying farm buildings and ruins on the plain
for k in range(400):
    if len(buildings) > 150:
        break
    a, r = brng.uniform(0, 6.283), brng.uniform(190, 420)
    x, z = VC + np.array([math.cos(a), math.sin(a)]) * r
    yaw = brng.uniform(0, 6.283)
    w, dpt = brng.uniform(6, 14), brng.uniform(6, 10)
    fp = footprint(x, z, yaw, w + 2, dpt + 2)
    if not clear_of(fp, 6):
        continue
    if any(abs(b['x'] - x) < 30 and abs(b['z'] - z) < 30 for b in buildings):
        continue
    if brng.random() < 0.6:
        buildings.append(dict(x=float(x), z=float(z), yaw=float(yaw), w=float(w), d=float(dpt), floors=1,
                              kind=int(brng.integers(0, 6)), y=float(sample(H, [x], [z])[0]), farm=1))
print(f'  {len(buildings)} buildings')
# level each plot: blend the ground to the plot height with a short apron
for b in buildings:
    m = (np.abs(X - b['x']) < 30) & (np.abs(Z - b['z']) < 30)
    lx = (X[m] - b['x']) * math.cos(b['yaw']) - (Z[m] - b['z']) * math.sin(b['yaw'])
    lz = (X[m] - b['x']) * math.sin(b['yaw']) + (Z[m] - b['z']) * math.cos(b['yaw'])
    ex = np.maximum(np.abs(lx) - b['w'] / 2 - 0.5, 0)
    ez = np.maximum(np.abs(lz) - b['d'] / 2 - 0.5, 0)
    e = np.hypot(ex, ez)
    if b.get('farm'):
        b['y'] = float(np.median(H[m][e == 0])) if np.any(e == 0) else b['y']
    wgt = 1 - ss(0, 6, e)
    H[m] = H[m] * (1 - wgt) + (b['y'] - 0.05) * wgt

# ------------------------------------------------------------- carve terrain
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
shoulder = np.where(cut, 4 + np.clip(diff, 0, 40) * 0.45, 8 + np.clip(-diff, 0, 30) * 1.5)
half = hw + 2.5
wgt = 1 - ss(half, half + shoulder, d)
berm = np.exp(-((d - half - 1.5) / 1.6) ** 2) * 0.9 * (d < 90)
Hc = nat * (1 - wgt) + road_h * wgt + berm * (1 - wgt * 0.5)
gapmask = allGap[idx] & (d < half + 6)
Hc = np.where(gapmask, np.minimum(Hc, allH[idx] - 9), Hc)
H = np.where(d < 1e8, Hc, H)
H = gaussian_filter(H, 0.6)
np.save(f'{OUT}/../er_nat.npy' if os.environ.get('WORLD_OUT') else '/tmp/claude-0/er_nat.npy', sample(nat, TRACKS[3]['C'][:, 0], TRACKS[3]['C'][:, 1]))

# ------------------------------------------------------------- lava surfaces
riv_out = []
for rv in rivers:
    p = rv['path']
    bottom = sample(H, p[:, 0], p[:, 1])
    surf = np.minimum.accumulate(gaussian_filter(bottom, 4)) + 1.8
    riv_out.append(dict(points=[[round(float(a), 2), round(float(h), 2), round(float(b), 2)]
                                for (a, b), h in zip(p[::2], surf[::2])],
                        width=[round(float(w) + 4, 2) for w in np.array(rv['width'])[::2]]))

# ------------------------------------------------------------- masks
print('masks')
glow = np.clip(1 - lava_dist / 60.0, 0, 1)
road = 1 - ss(hw - 1, hw + 7, d)
burn = np.clip(1 - lava_dist / 25.0, 0, 1)
m = np.stack([glow, road, burn], -1)
Image.fromarray((m * 255).astype(np.uint8)).resize((2048, 2048), Image.BILINEAR).save(f'{OUT}/masks.png')

hmin, hmax = float(H.min()), float(H.max())
np.round((H - hmin) / (hmax - hmin) * 65535).astype('<u2').tofile(f'{OUT}/height.u16')


def track_json(t):
    C, th = t['C'], t['th']
    out = dict(id=t['id'], name=t['name'], kind=t['kind'], closed=t['closed'], width=t['width'], length=t['len'],
               start=t['start'], laps=t['laps'],
               centre=[[round(float(C[i, 0]), 2), round(float(th[i]), 3), round(float(C[i, 1]), 2),
                        round(float(t['bank'][i]), 4), int(t['gap'][i])] for i in range(len(C))])
    for k in ('jump', 'crossing', 'centre'):
        if k in t and k != 'centre':
            out[k] = int(t[k])
    if 'centre' in t:
        out['villageCentre'] = t['centre']
    for k in ('segs', 'lip', 'land', 'loopJump', 'shared', 'runout', 'leap', 'runup'):
        if k in t:
            out[k] = t[k]
    return out


world = dict(
    extent=EXTENT, grid=GRID, hmin=hmin, hmax=hmax, peak=PEAK,
    rivers=riv_out, lake=dict(x=float(lake_c[0]), z=float(lake_c[1]), r=lake_r, y=lake_level),
    crater=dict(x=0.0, z=0.0, r=CRATER_R, y=float(sample(H, [0.0], [0.0])[0]) + 40),
    tracks=[track_json(t) for t in TRACKS], buildings=buildings,
)
json.dump(world, open(f'{OUT}/track.json', 'w'))

prev = (H - H.min()) / (H.max() - H.min())
img = np.stack([prev] * 3, -1)
img[road > 0.5] = [1, 0.8, 0.2]
img[lava_dist < 0] = [1, 0.2, 0]
for b in buildings:
    ix, iz = int((b['x'] + HALF) / RES), int((b['z'] + HALF) / RES)
    img[iz - 3:iz + 4, ix - 3:ix + 4] = [0.2, 0.4, 1]
Image.fromarray((img * 255).astype(np.uint8)).save('/tmp/claude-0/world_preview_full.png')
Image.fromarray((img * 255).astype(np.uint8)).resize((1024, 1024)).save('/tmp/claude-0/world_preview.png')
print('done', H.min(), H.max())
