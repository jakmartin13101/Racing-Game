"""Kai'ele's active south flank: the summit crater and its lava lake, the lava river down to the ocean entry and its
new delta, the fresh lava field (smooth pahoehoe lobes and rough 'a'a rubble), and the two lava tracks that run on it:

  Kula Pele    (kulapele) circuit on the lower flank east of the river: the old highway that breaks up into slabs,
               three live lava streams crossed by a rock-ramp jump, a steel road-crew bridge and a crust-ridge jump,
               a lava tube, the steam-vent flats.
  Ahi i ke Kai (ahikekai) the finale, a sprint from the crater rim down the flank west of the river to the sea:
               two breakouts across the road (a heaved-slab jump and a sagging bridge), cracked switchbacks, the
               burning forest, and a jump over the lava delta at the ocean entry onto the beach.

tools/island.py owns the island and calls in three times:
  shape(ctx)            right after the base relief; edits ctx.H on the volcano's south-east and returns
                        {rivers, extra, lava_dist, fresh, aa}: lava_dist is metres to the nearest lava (negative inside),
                        fresh the 0..1 fresh-lava-field cover and aa the 0..1 share of it that is 'a'a rubble
  tracks(ctx)           after the island's own tracks; returns the two track dicts (extra JSON under 'json')
  after_carve(ctx, res) after the shared road carve; cuts the channels back out under bridges and returns
                        {rivers: [...]} with the lava surfaces in track.json's format (points [x, y, z], width)
Frame: x east, +z south, y up, sea level 0. Angles in degrees from +x towards +z.
"""
import math
import os
import numpy as np
from scipy.ndimage import gaussian_filter, gaussian_filter1d
from scipy.spatial import cKDTree

# ------------------------------------------------------------------------------------------- layout
OCEAN_ENTRY = np.array([1262.0, 1745.0])

# the lava river: out of a breach in the crater's south rim, down the flank to the ocean entry
RIVER_CTRL = [(872, -58), (884, 60), (905, 190), (938, 330), (975, 470), (1010, 610), (1046, 760), (1080, 910),
              (1110, 1060), (1140, 1210), (1175, 1370), (1212, 1520), (1240, 1640), (1262, 1745)]

# Kula Pele: a loop on the lower flank east of the river, driven clockwise seen from above (+z south): east up the
# old highway, west across the top through the three streams, down the west side through the lava tube and the
# steam-vent flats, east along the bottom past the ranger station to the line
KP_CTRL = [
    (1330, 1335), (1420, 1345), (1510, 1338), (1590, 1310), (1638, 1250),        # ranger straight, the line
    (1660, 1150), (1620, 1060), (1668, 960), (1610, 860), (1650, 760), (1600, 670), # old highway, climbing north
    (1648, 570), (1600, 470), (1545, 390),
    (1470, 345), (1400, 328), (1330, 330), (1260, 330), (1212, 352),              # across the top: the streams
    (1185, 430), (1225, 520), (1192, 610), (1238, 700), (1196, 790), (1225, 880),  # down the west side: the tube
    (1236, 975), (1300, 1020), (1400, 1050), (1470, 1110), (1440, 1185),          # steam-vent flats, out into
    (1340, 1190), (1262, 1215), (1240, 1275), (1270, 1318),                        # the open and back
]
# the three streams: from vents above the top leg, down across it, into skylights inside the loop
KP_STREAMS = [
    dict(src=(1495, 150), end=(1520, 520), w=11.0, kind='ramp'),
    dict(src=(1385, 140), end=(1410, 500), w=10.0, kind='bridge'),
    dict(src=(1272, 150), end=(1300, 470), w=11.0, kind='ridge'),
]

# Ahi i ke Kai: control points in driving order
RIM_R = 192.0


def _polar(c, a, r):
    return np.array([c[0] + r * math.cos(math.radians(a)), c[1] + r * math.sin(math.radians(a))])


AHI_DESCENT = [(760, 60), (600, 90), (480, 130), (500, 175), (700, 200), (860, 240), (870, 290)]
# the two breakouts well up between the zigzag legs below and spill across the next leg down
AHI_SPILLS = [
    dict(src=(690, 236), end=(700, 405), w=12.0, kind='slab'),
    dict(src=(640, 352), end=(645, 565), w=10.0, kind='bridge'),
]
AHI_TRAVERSE = [(700, 315), (520, 350), (480, 400), (560, 440), (760, 470), (880, 510), (880, 560), (700, 590),
                (540, 620), (470, 668)]


def _serpentine(legs):
    """Hairpin legs (x_from, z_from, x_to, z_to) down a slope, each slanting downhill; a leg's end swings round a
    semicircle into the start of the next one."""
    pts = []
    for k, (xa, za, xb, zb) in enumerate(legs):
        for t in np.linspace(0, 1, 6):
            pts.append((xa + (xb - xa) * t, za + (zb - za) * t))
        if k + 1 < len(legs):
            nx, nz = legs[k + 1][0], legs[k + 1][1]
            c = np.array([(xb + nx) / 2, (zb + nz) / 2])
            hr = math.hypot(nx - xb, nz - zb) / 2
            d = np.array([xb - xa, zb - za], float); d /= np.linalg.norm(d)
            r0 = np.array([xb, zb]) - c
            for t in np.linspace(0, math.pi, 7)[1:-1]:
                # half a turn from this leg's end to the next leg's start, bulging on in the direction of travel
                pts.append(tuple(c + r0 * math.cos(t) + d * hr * 1.15 * math.sin(t)))
    return pts


# the cracked switchbacks: slanting legs down the steep lower flank, uneven like a road cut into old flows
AHI_SWITCHBACKS = _serpentine([(470, 728, 820, 762), (832, 822, 468, 852), (468, 912, 818, 946),
                               (822, 1006, 520, 1036)])
AHI_FOREST = [(440, 1090), (470, 1165), (560, 1225), (680, 1258), (780, 1320), (860, 1400), (945, 1470), (1030, 1550),
              (1110, 1630)]
# the old coastal road, cut by the delta: the kicker at its end, the flight over the delta onto the black sand
DELTA_LIP = np.array([1196.0, 1676.0])
DELTA_DIR = np.array([0.96, 0.28]) / np.hypot(0.96, 0.28)
BEACH = [(1350, 1662), (1396, 1604), (1452, 1566), (1525, 1548)]

V_DELTA, KICK_DELTA, KICK_LEN_DELTA, CHORD_DELTA = 34.0, 15.0, 30.0, 66.0

_state = {}


# ------------------------------------------------------------------------------------------- helpers
def _wiggle(P, amp, seed, step=3.0, polyline=None):
    """Densify a control polyline and push it about sideways with smooth noise (lava never runs straight)."""
    p = polyline(P, step)
    r = np.random.default_rng(seed)
    s = np.arange(len(p)) * step
    ph = r.uniform(0, 6.3, 3)
    off = amp * (np.sin(s / 55 + ph[0]) * 0.6 + np.sin(s / 23 + ph[1]) * 0.3 + np.sin(s / 9 + ph[2]) * 0.1)
    off *= np.clip(s / 40, 0, 1) * np.clip((s[-1] - s) / 40, 0, 1)
    T = np.gradient(p, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    return gaussian_filter1d(p + N * off[:, None], 2, axis=0, mode='nearest')


def _dist_field(ctx, p, w, reach=140):
    """Distance from every grid point to a path, the path index it is nearest, and the half width there.
    Only points within reach of the path's bounding box are queried."""
    X, Z = ctx.X, ctx.Z
    lo, hi = p.min(0) - reach, p.max(0) + reach
    i0 = max(0, int((lo[0] + ctx.HALF) / ctx.RES)); i1 = min(ctx.GRID, int((hi[0] + ctx.HALF) / ctx.RES) + 2)
    j0 = max(0, int((lo[1] + ctx.HALF) / ctx.RES)); j1 = min(ctx.GRID, int((hi[1] + ctx.HALF) / ctx.RES) + 2)
    sub = (slice(j0, j1), slice(i0, i1))
    pts = np.stack([X[sub].ravel(), Z[sub].ravel()], 1)
    d, idx = cKDTree(p).query(pts, distance_upper_bound=reach)
    shp = X[sub].shape
    d = d.reshape(shp)
    idx = np.minimum(idx, len(p) - 1).reshape(shp)
    hw = np.broadcast_to(np.asarray(w, float), (len(p),))[idx] * 0.5
    return sub, d, idx, hw


def _carve_channel(ctx, p, w, depth, levee, lava_dist, seed):
    """Cut a lava channel along p (per-point widths w) with levees of cooled crust either side; record the distance."""
    sub, d, idx, hw = _dist_field(ctx, p, w)
    fin = np.isfinite(d)
    dd = np.where(fin, d, 1e9)
    H = ctx.H
    # the bed follows the ground down the path, never climbing (the lava has to run downhill)
    bed = ctx.sample(H, p[:, 0], p[:, 1])
    bed = np.minimum.accumulate(gaussian_filter1d(bed, 6, mode='nearest')) - depth
    # never cut below the sea short of the mouth, or the sea would run up the channel
    bed = np.maximum(bed, np.where(np.arange(len(p)) > len(p) - 12, -2.0, 1.0))
    bh = bed[idx]
    inner = 1 - ctx.ss(0.0, 1.0, dd / (hw + 4))
    Hs = H[sub]
    Hs = np.where(fin, Hs * (1 - inner) + np.minimum(Hs, bh) * inner, Hs)
    # levees: ropy ridges of cooled lava along both banks, lumpy along their length
    lump = 0.75 + 0.5 * np.sin(idx * 0.21 + seed) * np.sin(idx * 0.057 + seed * 2)
    lev = np.exp(-((dd - hw - 6) / 4.5) ** 2) * levee * lump
    Hs = Hs + np.where(fin, lev, 0)
    H[sub] = Hs
    lava_dist[sub] = np.minimum(lava_dist[sub], np.where(fin, dd - hw, 1e9))


def _grade_limit_pinned(v, g, pin, P, gu=None):
    """Closest profile through the pinned heights where each row may fall by at most g and climb by at most gu
    (per-row arrays) from the one before (as tools/world.py's, with separate up and down grades)."""
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
    up_, lo_ = f.copy(), f.copy()
    for i in range(1, n):
        up_[i] = min(up_[i], up_[i - 1] + gu[i])
        lo_[i] = max(lo_[i], lo_[i - 1] - g[i])
    for i in range(n - 2, -1, -1):
        up_[i] = min(up_[i], up_[i + 1] + g[i + 1])
        lo_[i] = max(lo_[i], lo_[i + 1] - gu[i + 1])
    f = np.clip((up_ + lo_) / 2, L, U)
    f[pin] = P[pin]
    return f


def _bump(n, i, half):
    dist = np.abs(np.arange(n) - i)
    return np.where(dist < half, 0.5 + 0.5 * np.cos(np.pi * dist / half), 0)


# ------------------------------------------------------------------------------------------- shape
def shape(ctx):
    H, X, Z, ss = ctx.H, ctx.X, ctx.Z, ctx.ss
    S = np.array(ctx.SUMMIT_XZ, float)
    rivers = []
    lava_dist = np.full(H.shape, 1e9, np.float32)
    _state.clear()

    # ---- the crater: a flat-floored bowl holding a lava lake, with a breach in the south rim where the river leaves
    ds = np.hypot(X - S[0], Z - S[1])
    cr = float(ctx.CRATER_R)
    rim = float(np.percentile(ctx.sample(H, S[0] + (cr + 25) * np.cos(np.linspace(0, 6.28, 64)),
                                         S[1] + (cr + 25) * np.sin(np.linspace(0, 6.28, 64))), 50))
    lake_y = rim - 46.0
    lake_r = cr - 18.0
    bowl = lake_y - 4 + ss(lake_r - 30, cr + 10, ds) * (rim - lake_y + 6) ** 1.0
    H[:] = np.where(ds < cr + 10, np.minimum(H, bowl + (H - bowl) * ss(cr - 5, cr + 10, ds)), H)
    # ash and spatter cones on the rim
    rough = ctx.spectral(2.2, 12, seed=701) * 2.5
    H += rough * np.exp(-((ds - cr - 12) / 18) ** 2)
    lava_dist[:] = np.minimum(lava_dist, ds - lake_r)

    # ---- the river
    rp = _wiggle(RIVER_CTRL, 9.0, 11, polyline=ctx.polyline)
    s = np.linspace(0, 1, len(rp))
    rw = 15 + 15 * s ** 0.8
    # the breach: notch the rim down to just above the lake where the river spills out
    br = rp[0]
    db = np.hypot(X - br[0], Z - br[1])
    H[:] = np.where(db < 70, np.minimum(H, lake_y + 2 + db * 0.45 + 30 * ss(30, 70, db)), H)
    _carve_channel(ctx, rp, rw, 6.0, 4.0, lava_dist, 1.3)
    rivers.append(dict(path=rp, w=rw.tolist(), id='ahi'))

    # ---- Kula Pele's streams and Ahi i ke Kai's breakouts: short flows from vents, ending in skylights
    for k, st in enumerate(KP_STREAMS + AHI_SPILLS):
        p = _wiggle([st['src'], ((st['src'][0] * 2 + st['end'][0]) / 3 + 6, (st['src'][1] * 2 + st['end'][1]) / 3),
                     ((st['src'][0] + st['end'][0] * 2) / 3 - 6, (st['src'][1] + st['end'][1] * 2) / 3), st['end']],
                    4.0, 30 + k, polyline=ctx.polyline)
        ws = st['w'] * (0.75 + 0.35 * np.linspace(0, 1, len(p)))
        _carve_channel(ctx, p, ws, 4.0, 2.5, lava_dist, k * 1.7)
        # the vent: a low spatter cone round where it wells up; the skylight: a pit it pours into
        for (cx, cz), kind in ((p[0], 'vent'), (p[-1], 'sky')):
            dc = np.hypot(X - cx, Z - cz)
            if kind == 'vent':
                H += 5.5 * np.exp(-((dc - 9) / 6) ** 2) - 3 * np.exp(-(dc / 6) ** 2)
            else:
                H -= 14 * (1 - ss(5, 16, dc))
        st['path'] = p
        rivers.append(dict(path=p, w=ws.tolist(), id=f'stream{k}', end='skylight'))
    _state['streams'] = KP_STREAMS
    _state['spills'] = AHI_SPILLS

    # ---- the new lava delta at the ocean entry: a fan of fresh black rock built out into the sea
    od = np.hypot(X - OCEAN_ENTRY[0], Z - OCEAN_ENTRY[1])
    v = (OCEAN_ENTRY - rp[-40]) / np.linalg.norm(OCEAN_ENTRY - rp[-40])
    along = (X - OCEAN_ENTRY[0]) * v[0] + (Z - OCEAN_ENTRY[1]) * v[1]
    across = (X - OCEAN_ENTRY[0]) * -v[1] + (Z - OCEAN_ENTRY[1]) * v[0]
    fan = (1 - ss(40, 95, np.hypot(np.maximum(along, 0) * 1.6, across))) * (along > -60)
    delta_h = 2.6 + 1.2 * np.exp(-(across / 25) ** 2) + ctx.spectral(2.2, 20, seed=702) * 0.4
    H[:] = np.where(fan > 0, np.maximum(H, delta_h * fan + H * (1 - fan) - 6 * (1 - fan)), H)
    # a sea cliff of fresh rock at the delta's front where waves keep breaking it off
    lava_dist[:] = np.minimum(lava_dist, np.where(od < 120, od - 20, 1e9))
    # black sand washed along the shore from the entry: a beach at the foot of the old sea cliff for the finish
    landP = DELTA_LIP + DELTA_DIR * CHORD_DELTA
    bl = ctx.catmull(np.array([landP - DELTA_DIR * 20, landP + DELTA_DIR * 40, *BEACH,
                               np.array(BEACH[-1]) + (np.array(BEACH[-1]) - np.array(BEACH[-2])) * 0.8]), False)[0]
    sub, dbl, _, _ = _dist_field(ctx, bl, 0.0, 90)
    dbl = np.where(np.isfinite(dbl), dbl, 1e9)
    shelf = 2.5 - 0.11 * np.maximum(dbl - 18, 0) + ctx.spectral(2.0, 30, seed=704)[sub] * 0.25
    H[sub] = np.where(dbl < 90, np.maximum(H[sub], shelf), H[sub])

    # ---- the fresh lava field: everything from the summit down the south flank between the two tracks' outer edges
    # smooth ropy pahoehoe lobes, with 'a'a rubble (rough, blocky) in long tongues down the fall line
    fall_a = np.arctan2(Z - S[1], X - S[0])
    sector = ss(-0.15, 0.25, fall_a - math.radians(35)) * (1 - ss(math.radians(118), math.radians(140), fall_a))
    reach = ss(cr + 20, cr + 140, ds) * (1 - ss(2150, 2250, ds))
    # and the whole summit round the crater: cinder and spatter, nothing grows (or settles: no snow up here)
    summit = ss(cr - 5, cr + 10, ds) * (1 - ss(cr + 260, cr + 420, ds))
    fresh = np.maximum(sector * reach, summit).astype(np.float32)
    lobes = np.maximum(ctx.spectral(2.3, 6, 60, seed=703), 0) ** 1.4 * 3.2
    tongues = ctx.spectral(2.6, 2, seed=704)
    aa = ss(0.2, 0.7, tongues + 0.3 * ctx.spectral(2.2, 8, seed=705)).astype(np.float32)
    rubble = np.abs(ctx.spectral(1.6, 60, seed=706)) * 0.55 + np.abs(ctx.spectral(1.8, 25, seed=707)) * 0.4
    # pressure ridges (tumuli) on the pahoehoe
    tumuli = np.maximum(ctx.spectral(2.0, 25, 90, seed=708) - 1.6, 0) * 3.0
    H += fresh * ((1 - aa) * (lobes + tumuli) + aa * (rubble + 1.5))
    # the crater's inner walls are bare scorched rock too (left smooth above, so nothing pokes through the lake)
    fresh = np.maximum(fresh, 1 - ss(cr + 260, cr + 420, ds)).astype(np.float32)

    # ---- Kula Pele's plain: the lower flank levels out into a broad lava plain (a bench of old flows, its slope
    # eased to about a sixth), stepping up to the steep flank behind it in a low scarp the streams pour down
    kp = _kp_centre(ctx)
    _state['kp_C'] = kp
    from PIL import Image, ImageDraw
    from scipy.ndimage import distance_transform_edt
    poly = Image.new('L', (ctx.GRID, ctx.GRID), 0)
    ImageDraw.Draw(poly).polygon([((x + ctx.HALF) / ctx.RES, (z + ctx.HALF) / ctx.RES) for x, z in kp[::4]], fill=1)
    inside = np.asarray(poly, bool)
    out_d = distance_transform_edt(~inside) * ctx.RES
    m = 1 - ss(30, 190, out_d)
    fresh = np.maximum(fresh, 1 - ss(60, 200, out_d)).astype(np.float32)
    sel = m > 0.5
    A = np.stack([X[sel], Z[sel], np.ones(sel.sum())], 1)
    coef, *_ = np.linalg.lstsq(A, H[sel], rcond=None)
    plane = coef[0] * X + coef[1] * Z + coef[2]
    mean = float(H[inside].mean())
    local = H - gaussian_filter(H, 20)
    target = mean + 0.16 * (plane - mean) + 0.5 * local
    H[:] = H * (1 - m) + target * m
    a, b = _kp_rows(kp)['tube']
    tube = kp[a:b]
    sub, d, idx, hw = _dist_field(ctx, tube, 1.0, 90)
    rel = idx / max(1, len(tube) - 1)
    ends = np.clip(np.minimum(rel, 1 - rel) / 0.12, 0, 1)
    ridge = 15.5 * np.exp(-(np.maximum(d - 9, 0) / 22) ** 2) * ends * np.isfinite(d)
    H[sub] = H[sub] + np.where(np.isfinite(d), ridge, 0)
    _state['tube'] = (a, b)

    ctx.H = H
    _state['rivers'] = rivers
    _state['lava_dist'] = lava_dist
    extra = dict(lake=dict(x=float(S[0]), z=float(S[1]), r=lake_r, y=lake_y),
                 crater=dict(x=float(S[0]), z=float(S[1]), r=lake_r, y=lake_y),
                 oceanEntry=dict(x=float(OCEAN_ENTRY[0]), z=float(OCEAN_ENTRY[1])))
    _state['fresh'], _state['aa'] = fresh, (aa * fresh).astype(np.float32)
    return dict(rivers=[dict(path=r['path'], w=r['w']) for r in rivers], extra=extra, lava_dist=lava_dist,
                fresh=fresh, aa=aa * fresh)


# ------------------------------------------------------------------------------------------- Kula Pele
def _kp_centre(ctx):
    C, _ = ctx.catmull(np.array(KP_CTRL, float), True)
    C = gaussian_filter1d(C, 6, axis=0, mode='wrap')
    C, _ = ctx.catmull(C[::5], True)
    return C


def _kp_rows(C):
    """Section boundaries along the loop (rows from the first control point), found from where they fall."""
    n = len(C)
    def near(pt):
        return int(np.argmin(np.hypot(C[:, 0] - pt[0], C[:, 1] - pt[1])))
    return dict(highway=(near((1645, 1150)), near((1600, 470))), top=(near((1545, 390)), near((1215, 348))),
                tube=(near((1196, 470)), near((1214, 950))), flats=(near((1225, 1000)), near((1260, 1300))), n=n)


def _crossing_rows(C, path):
    d, j = cKDTree(path).query(C)
    i = int(np.argmin(d))
    return i, float(d[i])


def tracks(ctx):
    out = [_kulapele(ctx), _ahikekai(ctx)]
    _state['tracks_out'] = out
    return out


def _kulapele(ctx):
    C = _state['kp_C']
    n = len(C)
    H = ctx.H
    th = ctx.smooth(ctx.smooth(ctx.sample(gaussian_filter(H, 3), C[:, 0], C[:, 1]), 121, True), 61, True)
    th = ctx.smooth(ctx.grade_limit(th, 0.10, True), 31, True)
    gap = np.zeros(n, bool)
    rel = lambda i: ((np.arange(n) - i + n // 2) % n) - n // 2  # noqa: E731
    crossings = []
    for st in KP_STREAMS:
        i, dd = _crossing_rows(C, st['path'])
        r = rel(i)
        if st['kind'] == 'ramp':
            # a natural rock ramp: the road climbs onto a lip of old flow, flies the stream, lands on a downslope
            th = th + np.where((r > -55) & (r <= -9), ctx.ss(-55, -10, r) * 3.4, 0)
            g = (r > -9) & (r < 13)
            # the landing drops away below the road's own line, so a truck comes down on a downslope
            th = th - np.where((r >= 13) & (r < 52), (1 - ctx.ss(13, 52, r)) * 1.6, 0)
            crossings.append(dict(kind='ramp', at=int((i - 9) % n), gap=[int((i - 8) % n), int((i + 12) % n)], speed=36))
        elif st['kind'] == 'ridge':
            # a crust ridge: a hump of cooled crust shoves the road up into a crest right at the stream's edge
            th = th + np.where((r > -38) & (r <= -7), np.sin(np.clip((r + 38) / 31, 0, 1) * math.pi * 0.62) * 4.2, 0)
            g = (r > -7) & (r < 14)
            th = th - np.where((r >= 14) & (r < 46), (1 - ctx.ss(14, 46, r)) * 1.4, 0)
            crossings.append(dict(kind='ridge', at=int((i - 7) % n), gap=[int((i - 6) % n), int((i + 13) % n)], speed=34))
        else:
            # the road crew's bridge: the road keeps its line and grade, the game builds the steel deck
            g = (r >= -12) & (r <= 12)
            crossings.append(dict(kind='bridge', bridge=[int((i - 12) % n), int((i + 12) % n)]))
        gap |= g
        st['row'] = i
    # the ranger station sits beside the line on the bottom straight
    line = int(np.argmin(np.hypot(C[:, 0] - 1420, C[:, 1] - 1345)))
    start = (line - 20) % n
    rows = _kp_rows(C)
    # roll the loop so row 0 is the start, as the game expects the line at start + 20
    roll = start
    C = np.roll(C, -roll, axis=0)
    th = np.roll(th, -roll)
    gap = np.roll(gap, -roll)
    fix = lambda i: int((i - roll) % n)  # noqa: E731
    for c in crossings:
        for k in ('at',):
            if k in c:
                c[k] = fix(c[k])
        for k in ('gap', 'bridge'):
            if k in c:
                c[k] = [fix(c[k][0]), fix(c[k][1])]
    secs = {k: [fix(v[0]), fix(v[1])] for k, v in rows.items() if k != 'n'}
    # breaking road: from lap 2 slabs pop up along the old highway, spread over it
    ha, hb = secs['highway']
    slabs = [int(ha + (hb - ha) * f) for f in (0.12, 0.3, 0.47, 0.63, 0.8)]
    vents = []
    fa, fb = secs['flats']
    rng = np.random.default_rng(91)
    for k in range(9):
        i = int(fa + (fb - fa) * (k + 0.5) / 9)
        vents.append(dict(i=i, lat=float(rng.choice([-1, 1]) * rng.uniform(11, 26))))
    tube = secs['tube']
    _state['kp'] = dict(C=C, th=th)
    return dict(surf=np.full(len(C), ctx.SURF['asphalt']), id='kulapele', name='Kula Pele', kind='circuit', closed=True, C=C, th=th, gap=gap, width=15.0, start=20,
                laps=3, bankK=14, region='kaiele',
                json=dict(region='kaiele', climate='tropical', sections=secs, crossings=crossings, slabs=slabs, vents=vents,
                          tube=dict(a=tube[0], b=tube[1], roof=9.0), station=dict(i=20 + 18, side=-1)))


# ------------------------------------------------------------------------------------------- Ahi i ke Kai
def _ahikekai(ctx):
    H, ss = ctx.H, ctx.ss
    S = np.array(ctx.SUMMIT_XZ, float)
    # the rim run: anticlockwise seen from above, from the north-east round the north and west rim to the south
    rim = [_polar(S, a, RIM_R + 6 * math.sin(math.radians(a) * 3)) for a in np.arange(338, 101, -12)]
    start_pts = [_polar(S, 352, RIM_R + 10), _polar(S, 345, RIM_R + 4)]
    ctrl = np.vstack([start_pts, rim, AHI_DESCENT, AHI_TRAVERSE, AHI_SWITCHBACKS, AHI_FOREST])
    C1, _ = ctx.catmull(ctrl, False)
    C1 = gaussian_filter1d(C1, 5, axis=0, mode='nearest')
    C1, _ = ctx.catmull(C1[::4], False)
    # coastal road to the kicker, the gap over the delta, the beach
    lipC = DELTA_LIP
    landP = lipC + DELTA_DIR * CHORD_DELTA
    run_in = ctx.catmull(np.array([C1[-1], C1[-1] * 0.5 + (lipC - DELTA_DIR * 60) * 0.5, lipC - DELTA_DIR * 60, lipC]), False)[0]
    gapC = ctx.catmull(np.array([lipC, lipC + DELTA_DIR * CHORD_DELTA * 0.5, landP]), False)[0]
    after = ctx.catmull(np.array([landP, landP + DELTA_DIR * 40, *BEACH]), False)[0]
    C = np.vstack([C1[:-1], run_in[:-1], gapC[:-1], after])
    kind = np.concatenate([np.zeros(len(C1) - 1), np.ones(len(run_in) - 1), np.full(len(gapC) - 1, 2), np.full(len(after), 3)])
    n = len(C)
    lip = int(np.where(kind == 2)[0][0])
    land = int(np.where(kind == 3)[0][0])
    ground = ctx.sample(gaussian_filter(H, 3), C[:, 0], C[:, 1])
    th = ctx.smooth(ctx.smooth(ground, 61, False), 31, False)
    pin = np.zeros(n, bool)
    P = np.zeros(n)
    # the kicker at the end of the coastal road and the flight over the delta: a real ballistic arc, the landing on
    # the beach cut to it (as Eruption's crater leap)
    kick_r = KICK_LEN_DELTA / math.tan(math.radians(KICK_DELTA))
    road_y = 9.0
    lip_h = road_y + KICK_LEN_DELTA ** 2 / (2 * kick_r)
    VX, VY = V_DELTA * math.cos(math.radians(KICK_DELTA)), V_DELTA * math.sin(math.radians(KICK_DELTA))
    arc = lambda x: lip_h + VY * x / VX - 9.81 * x * x / (2 * VX * VX)  # noqa: E731
    X_TD = CHORD_DELTA + 22.0
    slope_td = VY / VX - 9.81 * X_TD / (VX * VX)
    i_run = lip - 140
    xr = np.arange(i_run, lip) - lip + KICK_LEN_DELTA
    pin[i_run:lip] = True
    P[i_run:lip] = np.where(xr < 0, road_y + np.maximum(-xr - 20, 0) * 0.0, road_y + np.maximum(xr, 0) ** 2 / (2 * kick_r))
    gi = np.arange(lip, land)
    pin[gi] = True
    P[gi] = arc(np.arange(len(gi)) * CHORD_DELTA / len(gi))
    n_land = 80
    xl = CHORD_DELTA + np.arange(n_land)
    land_h = np.where(xl < X_TD, arc(xl) - 0.004 * (X_TD - xl) ** 2, 0)
    aft = xl >= X_TD
    sl = slope_td + (0 - slope_td) * ss(0, 1, (xl - X_TD) / 45)
    land_h[aft] = arc(X_TD) + np.cumsum(sl[aft]) - sl[aft][0]
    land_h = np.maximum(land_h, 2.2)
    pin[land:land + n_land] = True
    P[land:land + n_land] = land_h
    # the beach run holds just above the sand
    beach = np.arange(land + n_land, n)
    pin[beach] = True
    P[beach] = np.maximum(ground[beach], 2.0) * 0 + np.maximum(np.minimum(ground[beach], 3.5), 2.0)
    P[beach] = ctx.smooth(P[beach], 31, False)
    # the start: on the rim, held level for the grid
    # the start and the rim run: on the rim, level for the grid, then following the rim round to the descent
    d0 = int(np.argmin(np.hypot(C[:, 0] - AHI_DESCENT[0][0], C[:, 1] - AHI_DESCENT[0][1])))
    pin[:d0] = True
    P[:d0] = ctx.smooth(np.maximum(ground[:d0], float(np.median(ground[:60]))), 121, False)
    P[:60] = P[60]
    gmax = np.full(n, 0.2)
    th = _grade_limit_pinned(th, gmax, pin, P, np.full(n, 0.12))
    near = np.convolve(pin.astype(float), np.ones(31) / 31, mode='same')
    th = th + (ctx.smooth(th, 21, False) - th) * np.clip(1 - near * 3, 0, 1) * ~pin

    gap = np.zeros(n, bool)
    gap[gi] = True
    skip = np.zeros(n, bool)
    skip[gi] = True
    crossings = []
    for sp in AHI_SPILLS:
        d, _ = cKDTree(sp['path']).query(C)
        i = int(np.argmin(d))
        r = np.arange(n) - i
        if sp['kind'] == 'slab':
            # a slab of road heaved up by the breakout into a ramp; the lava runs through the gap it tore
            ramp = np.where((r > -26) & (r <= -7), ss(-26, -8, r) * 2.4, 0)
            th = th + ramp
            gap |= (r > -7) & (r < 13)
            th = th + np.where((r >= 13) & (r < 40), (1 - ss(13, 40, r)) * 1.3, 0)
            crossings.append(dict(kind='slab', at=int(i - 7), gap=[int(i - 6), int(i + 12)], speed=33, slab=[int(i - 24), int(i - 7)]))
        else:
            gap |= (r >= -11) & (r <= 11)
            crossings.append(dict(kind='bridge', bridge=[int(i - 11), int(i + 11)], sag=0.55))
        sp['row'] = i
    segrow = lambda pt: int(np.argmin(np.hypot(C[:, 0] - pt[0], C[:, 1] - pt[1])))  # noqa: E731
    secs = dict(rim=[0, segrow(AHI_DESCENT[0])], descent=[segrow(AHI_DESCENT[0]), segrow(AHI_TRAVERSE[0])],
                breakouts=[segrow(AHI_TRAVERSE[0]), segrow(AHI_SWITCHBACKS[0])],
                switchbacks=[segrow(AHI_SWITCHBACKS[0]), segrow(AHI_FOREST[0])],
                forest=[segrow(AHI_FOREST[0]), i_run], delta=[i_run, land + n_land], beach=[land + n_land, n - 1])
    lip_row, land_row = lip, land
    # quakes break the road into slabs on the switchbacks, bigger than Kula Pele's
    sa, sb = secs['switchbacks']
    slabs = [int(sa + (sb - sa) * f) for f in (0.15, 0.38, 0.6, 0.82)]
    # burning trees that fall across the road in the forest
    fa, fb = secs['forest']
    rng = np.random.default_rng(55)
    falls = [dict(i=int(fa + (fb - fa) * f), side=int(rng.choice([-1, 1]))) for f in (0.18, 0.42, 0.63, 0.85)]
    leap = dict(v=V_DELTA, angle=KICK_DELTA, td=int(land + X_TD - CHORD_DELTA), lipH=round(lip_h, 3))
    print(f'  ahikekai lip {lip_row} land {land_row} leap {leap}')
    if os.environ.get('AHIDBG'):
        for k in range(0, n, 100):
            print(f'   {k} ground {ground[k]:.0f} th {th[k]:.0f}')
    _bench(ctx, C, th, 7.0, 0, i_run, S)
    # the rim track is loose cinder; the old highway down the flank and along the coast is asphalt; past the delta
    # the finish runs on the black sand
    surf = np.full(n, ctx.SURF['asphalt'])
    surf[:secs['rim'][1]] = ctx.SURF['lava_rock']
    surf[land:] = ctx.SURF['lava_rock']
    return dict(surf=surf, id='ahikekai', name='Ahi i ke Kai', kind='sprint', closed=False, C=C, th=th, gap=gap, skip=skip, width=14.0,
                start=20, laps=1, bankK=10, region='kaiele', runout=120,
                json=dict(region='kaiele', climate='tropical', lip=lip_row, land=land_row, leap=leap, runup=int(i_run), runout=120,
                          sections=secs, crossings=crossings, slabs=slabs, falls=falls, river='ahi'))


def _bench(ctx, C, th, hw, r0, r1, S):
    """Cut the steep cone into benches under Ahi i ke Kai's descent and switchbacks: within reach of the road the
    ground is drawn to a smooth field through the road heights (so stacked switchback legs sit on terraces with
    steep faces between them), the faces no steeper than 0.5 from the road edge; the crater, the river and the
    breakout channels are left alone."""
    H, ss = ctx.H, ctx.ss
    rows = np.arange(r0, r1, 2)
    Cs, ts = C[rows], th[rows]
    reach = 110.0
    sub, dmin, _, _ = _dist_field(ctx, Cs, 0.0, reach)
    X, Z = ctx.X[sub], ctx.Z[sub]
    pts = np.stack([X.ravel(), Z.ravel()], 1)
    d, idx = cKDTree(Cs).query(pts, k=24, distance_upper_bound=reach)
    ok = np.isfinite(d)
    w = np.where(ok, 1.0 / (np.where(ok, d, 1e9) + 3.0) ** 3, 0.0)
    idx = np.minimum(idx, len(Cs) - 1)
    field = (w * ts[idx]).sum(1) / np.maximum(w.sum(1), 1e-12)
    field = field.reshape(X.shape)
    dmin = np.where(np.isfinite(dmin), dmin, 1e9)
    Hs = H[sub]
    smooth_ = gaussian_filter(Hs, 6)
    detail = Hs - smooth_
    lim = 0.8 + 0.5 * np.maximum(dmin - hw - 2.0, 0)
    target = field + np.clip(smooth_ - field, -lim, lim) + detail * 0.35
    wb = 1 - ss(reach - 40, reach, dmin)
    # keep off the crater, the river and the breakout channels (the carve opens them under the jumps and bridges)
    wb = wb * ss(ctx.CRATER_R + 15, ctx.CRATER_R + 45, np.hypot(X - S[0], Z - S[1]))
    for rv in _state['rivers']:
        if rv['id'].startswith('stream') and int(rv['id'][6:]) < len(KP_STREAMS):
            continue
        p = np.asarray(rv['path'])
        dr, ir = cKDTree(p).query(np.stack([X.ravel(), Z.ravel()], 1), distance_upper_bound=200)
        hwr = np.asarray(rv['w'])[np.minimum(ir, len(p) - 1)] * 0.5
        dr = np.where(np.isfinite(dr), dr, 1e9) - hwr
        wb = wb * ss(6, 26, dr).reshape(X.shape)
    Hn = Hs * (1 - wb) + target * wb
    Hn = Hn + (gaussian_filter(Hn, 1.5) - Hn) * wb
    H[sub] = Hn
    ctx.H = H


# ------------------------------------------------------------------------------------------- after the carve
def after_carve(ctx, res):
    """Lava surfaces from the carved beds; channels re-cut under the bridges and jump gaps the road embankments dam."""
    H = ctx.H
    out = []
    for rv in _state['rivers']:
        p = np.asarray(rv['path'])
        w = np.asarray(rv['w'])
        bottom = ctx.sample(H, p[:, 0], p[:, 1])
        surf = np.minimum.accumulate(gaussian_filter1d(bottom, 4, mode='nearest')) + 1.6
        # where a road jumps or bridges the flow, the lava runs well below the road line, easing down to it upstream
        for t in _state.get('tracks_out', []):
            gr = np.where(t['gap'])[0]
            if not len(gr):
                continue
            dg, jg = cKDTree(t['C'][gr]).query(p)
            for k in np.where(dg < 14)[0]:
                cap = t['th'][gr[jg[k]]] - 4.5
                dist_up = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p[:k + 1], axis=0), axis=1))])
                dist_up = dist_up[-1] - dist_up
                # over the last 40 m only; above that the flow pours down to it as a lava fall
                surf[:k + 1] = np.minimum(surf[:k + 1], np.where(dist_up < 40, cap + dist_up * 0.12, 1e9))
        surf = np.minimum.accumulate(surf)
        # wherever a road crosses, make sure the channel runs clear under it (embankments would dam it)
        sub, d, idx, hw = _dist_field(ctx, p, w, 40)
        wch = hw + 2.5
        Hs = H[sub]
        H[sub] = np.where(np.isfinite(d) & (d < wch), np.minimum(Hs, surf[idx] - 2.2 + ctx.ss(0, 1, d / wch) * 1.4), Hs)
        if rv['id'] == 'ahi':
            surf = np.maximum(surf, 0.6)
        out.append(dict(id=rv['id'], points=[[round(float(a), 2), round(float(h), 2), round(float(b), 2)]
                                              for (a, b), h in zip(p[::2], surf[::2])],
                        width=[round(float(x) + 3, 2) for x in w[::2]], **({'end': rv['end']} if 'end' in rv else {})))
    ctx.H = H
    return dict(rivers=out)


# ------------------------------------------------------------------------------------------- masks
def masks(ctx):
    """Write lava_masks.png beside masks.png (R fresh lava field cover, G its 'a'a share), for the ground shading and
    the lava-field dressing; fresh lava carries no plants, and glows only near live lava."""
    import __main__
    from PIL import Image
    out = getattr(__main__, 'OUT', None)
    fresh, aa = _state.get('fresh'), _state.get('aa')
    if out is None or fresh is None:
        return
    m = np.stack([fresh, aa, np.zeros_like(fresh)], -1)
    Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).resize((2048, 2048), Image.BILINEAR).save(f'{out}/lava_masks.png')
    if hasattr(ctx, 'biome'):
        ctx.biome['veg'] = ctx.biome['veg'] * (1 - np.clip(fresh * 1.5, 0, 1))
