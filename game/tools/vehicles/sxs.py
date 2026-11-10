"""Side-by-side (UTV) builder: ROPS cage over two or four seats, arched hood with integrated
fenders, half doors, long-travel arms, rear engine cover or cargo bed.
Spec keys: seats (2, 4), wheelbase, track, rear ('sport', 'bed'), roof, spare, snorkel, rack, lightbar,
tyres, rims, rf, wf, lift, frame_paint."""
import math
import bmesh
from mathutils import Vector
import kit
from kit import box, cyl, lathe, tube_path, merge, transform, Parts
from jeep import mirror_obj


def arched_deck(name, yc, wz, R, y0, y1, hw, deck0, deck1, mat, inner=0.42, lip=0.05):
    """Deck panel sloping from deck0 (at y0) to deck1 (at y1) with wheel arches outboard."""
    clear = R + 0.08

    def f(u, v):
        x = (u * 2 - 1) * hw
        y = y0 + (y1 - y0) * v
        ax = abs(x)
        deck = deck0 + (deck1 - deck0) * v
        dy = min(abs(y - yc), clear * 0.999)
        arc = wz + math.sqrt(clear ** 2 - dy ** 2) if abs(y - yc) < clear else wz
        arc = max(arc, wz + 0.04)
        t = min(1.0, max(0.0, (ax - inner) / 0.12))
        t = t * t * (3 - 2 * t)
        z = deck * (1 - t) + min(arc + 0.02, max(deck, arc)) * t
        ev = max(0.0, (0.06 - min(v, 1 - v)) / 0.06)
        z -= (1 - t) * 0.06 * ev ** 1.5
        e = max(0.0, (ax - hw * 0.95) / (hw * 0.05))
        z -= lip * e ** 2
        return Vector((x * (1 - 0.03 * ev), y, z))
    return kit.surface(f, 44, 40, 0.01, 2, mat, name)


def build(spec):
    P = Parts()
    seats = spec.get('seats', 2)
    lift = spec.get('lift', 0.0)
    WB = spec.get('wheelbase', 2.36 if seats == 2 else 3.1)
    TRK = spec.get('track', 1.64) / 2
    R = spec.get('rf', 0.385)
    W = spec.get('wf', 0.25)
    RRIM = spec.get('rrim', 0.19)
    YF, YR = WB * 0.5, -WB * 0.5
    ZW = R
    ZFL = 0.38 + lift + (R - 0.385) * 0.5
    ZD = ZFL + 0.55            # deck / hood height at the cowl
    YC = YF - 0.55             # cowl
    rows = [YC - 0.7] if seats == 2 else [YC - 0.7, YC - 1.42]
    YB = rows[-1] - 0.45       # rear of the cab (B or C hoop)
    ZRF = ZFL + 1.5            # roof
    HW = 0.72                  # cab half width
    ts = spec.get('tyres', ('knobby',))[0]
    rs = spec.get('rims', 'beadlock')
    fpaint = 'frame' if spec.get('frame_paint', True) else 'chassis'

    P.wheel_kind('A', kit.tyre(R, W, RRIM, ts), kit.rim(R, W, RRIM, rs))
    for n, x, y in (('wheel_FL', -TRK, YF), ('wheel_FR', TRK, YF), ('wheel_RL', -TRK, YR), ('wheel_RR', TRK, YR)):
        P.spot(n, (x, y, ZW), 'A', R)

    # ---------------- hood with integrated front fenders
    hwf = TRK + W * 0.5 + 0.04
    P.add_obj(arched_deck('hood', YF, ZW, R, YC - 0.05, YF + 0.62, hwf, ZD + 0.04, ZFL + 0.32, 'paint', inner=0.45))
    # nose / front fascia plastic
    P.add('fascia', box((0.9, 0.06, 0.22), (0, YF + 0.62, ZFL + 0.2)), 'plastic', 0.02)
    P.add('grille', merge([box((0.6, 0.02, 0.012), (0, YF + 0.65, ZFL + 0.13 + k * 0.03)) for k in range(5)]), 'chassis')
    for sx in (1, -1):
        # slanted LED headlight strips
        hb, ln, lp = kit.rect_light((0, 0, 0), 0.2, 0.05, 0.04, 1)
        for bm in (hb, ln, lp):
            transform(bm, rot=[('Y', sx * 0.25), ('X', -0.5)], loc=(sx * 0.32, YF + 0.55, ZFL + 0.38))
        P.lamp((hb, ln, lp))
    # ---------------- rear: sport engine cover or cargo bed
    hwr = TRK + W * 0.5 + 0.03
    if spec.get('rear', 'sport') == 'sport':
        P.add_obj(arched_deck('rear', YR, ZW, R, YR - 0.6, YB + 0.05, hwr, ZFL + 0.52, ZD - 0.02, 'paint', inner=0.48))
        P.add('vents', merge([box((0.5, 0.05, 0.012), (0, YR + 0.05 - k * 0.08, ZFL + 0.6 - 0.02 * k)) for k in range(4)]), 'chassis')
        for sx in (1, -1):
            P.add('intake', box((0.14, 0.3, 0.1), (sx * 0.28, YB - 0.2, ZD + 0.02)), 'plastic', 0.02)
    else:
        P.add_obj(arched_deck('rear', YR, ZW, R, YR - 0.55, YB + 0.05, hwr, ZFL + 0.42, ZFL + 0.42, 'plastic', inner=0.5))
        bed = [box((1.2, 1.0, 0.02), (0, YR - 0.03, ZD - 0.02))]
        for sx in (1, -1):
            bed.append(box((0.03, 1.0, 0.3), (sx * 0.6, YR - 0.03, ZD + 0.13)))
        bed.append(box((1.2, 0.03, 0.3), (0, YB + 0.0, ZD + 0.13)))
        bed.append(box((1.2, 0.03, 0.3), (0, YR - 0.52, ZD + 0.13)))
        bo = kit.obj('bed', merge(bed), 'paint')
        kit.geo.hard_surface(bo, 0.008, 2)
        P.add_obj(bo)
    # ---------------- half doors + rocker sills
    for sx in (1, -1):
        for k, yy in enumerate(rows):
            def door(u, v, yy=yy):
                y0, y1 = yy + 0.42, yy - 0.42
                y = y0 + (y1 - y0) * u
                top = ZD - 0.02 + 0.06 * math.sin(math.pi * u) - (0.08 if u > 0.7 else 0.0) * ((u - 0.7) / 0.3)
                z = ZFL + 0.08 + (top - ZFL - 0.08) * v
                return Vector((sx * (HW + 0.04 + 0.03 * math.sin(math.pi * v)), y, z))
            o = kit.surface(door, 14, 8, 0.012, 2, 'paint', 'door')
            P.add_obj(o)
        P.add('rocker', box((0.08, YC - YB, 0.1), (sx * (HW + 0.02), (YC + YB) / 2, ZFL + 0.02)), 'plastic', 0.02)

    # ---------------- ROPS cage
    T = 0.028
    cg = []
    hoops = [YB + 0.03] + ([rows[0] - 0.4] if seats == 4 else [])
    for sx in (1, -1):
        # A pillar: cowl up and back to the roof
        cg.append(tube_path([(sx * (HW - 0.02), YC + 0.05, ZD - 0.02), (sx * (HW - 0.08), YC - 0.45, ZRF), (sx * (HW - 0.08), YB + 0.08, ZRF + 0.02)],
                            T, 10, 0.15))
        for hy in hoops:
            cg.append(tube_path([(sx * (HW - 0.08), hy, ZRF), (sx * (HW - 0.03), hy - 0.02, ZD), (sx * (HW - 0.02), hy, ZFL)], T, 10, 0.12))
        # harness bar / grab handle
        cg.append(tube_path([(sx * (HW - 0.05), YC - 0.15, ZD + 0.2), (sx * (HW - 0.05), rows[0] + 0.15, ZD + 0.25)], 0.018, 8))
        # floor rails
        cg.append(tube_path([(sx * (HW - 0.02), YC + 0.05, ZFL), (sx * (HW - 0.02), YB, ZFL)], T, 10))
        # rear braces to the shock towers
        cg.append(tube_path([(sx * (HW - 0.08), YB + 0.08, ZRF), (sx * 0.5, YR + 0.1, ZFL + 0.75)], T * 0.85, 10))
    for hy in hoops:
        cg.append(tube_path([(HW - 0.08, hy, ZRF), (-(HW - 0.08), hy, ZRF)], T, 10))
        cg.append(tube_path([(HW - 0.03, hy - 0.02, ZD), (-(HW - 0.03), hy - 0.02, ZD)], T * 0.85, 8))
    cg.append(tube_path([(HW - 0.08, YC - 0.45, ZRF), (-(HW - 0.08), YC - 0.45, ZRF)], T, 10))
    cg.append(tube_path([(HW - 0.05, YC + 0.0, ZD + 0.02), (-(HW - 0.05), YC + 0.0, ZD + 0.02)], T, 10))   # dash bar
    # front bumper + rear bumper
    cg.append(tube_path([(0.45, YF + 0.55, ZFL + 0.1), (0.42, YF + 0.75, ZFL + 0.14), (0.38, YF + 0.76, ZFL + 0.35), (-0.38, YF + 0.76, ZFL + 0.35),
                         (-0.42, YF + 0.75, ZFL + 0.14), (-0.45, YF + 0.55, ZFL + 0.1)], T, 10, 0.06))
    cg.append(tube_path([(0.5, YR - 0.45, ZFL + 0.15), (0.48, YR - 0.68, ZFL + 0.2), (-0.48, YR - 0.68, ZFL + 0.2), (-0.5, YR - 0.45, ZFL + 0.15)],
                        T, 10, 0.08))
    P.add('cage', merge(cg), fpaint)
    if spec.get('roof', True):
        def roof(u, v):
            x = (u * 2 - 1) * (HW - 0.04)
            y = YC - 0.5 + (YB + 0.0 - YC + 0.5) * v
            return Vector((x, y, ZRF + 0.035 + 0.025 * (1 - (u * 2 - 1) ** 2)))
        P.add_obj(kit.surface(roof, 12, 12, 0.01, 2, 'plastic2' if spec.get('roof_paint') else 'plastic', 'roof'))
    P.add('floor', box((HW * 2 - 0.06, YC - YB, 0.01), (0, (YC + YB) / 2, ZFL - 0.01)), 'alloy', 0.003)
    P.add('skid', box((0.9, WB + 0.6, 0.008), (0, 0.15, ZFL - 0.08)), 'alloy', 0.004)

    # ---------------- suspension
    sus, shocks = [], []
    for y, sgn in ((YF, 1), (YR, -1)):
        for sx in (1, -1):
            xk = sx * (TRK - W * 0.5 - 0.05)
            if sgn > 0 or spec.get('rear_arms', True):
                for zz, d in ((ZW - 0.08, 0.0), (ZW + 0.1, 0.04)):
                    sus.append(kit.a_arm((sx * 0.3, y + 0.2, zz + 0.12 + lift * 0.5), (sx * 0.3, y - 0.22, zz + 0.12 + lift * 0.5),
                                         (xk - sx * d, y, zz), 0.022))
            sus.append(kit.knuckle(xk + sx * 0.04, y, ZW, sx, RRIM))
            shocks.append(kit.coilover((xk - sx * 0.1, y + 0.02 * sgn, ZW - 0.04), (sx * 0.34, y - 0.06 * sgn, ZD - 0.02), 0.034, reservoir=True))
            sus.append(tube_path([(0, y, ZW + 0.05), (xk, y, ZW)], 0.018, 8))     # CV axles
    P.add('arms', merge(sus), fpaint)
    P.add('shocks', merge(shocks), 'metal')
    P.add('engine', merge([box((0.5, 0.5, 0.35), (0, YB - 0.3, ZFL + 0.25)), cyl(0.12, 0.3, 20, loc=(0.2, YB - 0.3, ZFL + 0.2), axis='Y')]),
          'engine', 0.01)

    # ---------------- cockpit
    for yy in rows:
        for x in (0.33, -0.33):
            P.add_obj(kit.bucket_seat((x, yy, ZFL + 0.1), 0.5, 0.46, 0.75, 14))
            P.add('harness', merge([box((0.05, 0.01, 0.55), (x + s * 0.1, yy - 0.3, ZFL + 0.6)) for s in (1, -1)]), 'flag')
    P.add('dash', box((HW * 2 - 0.12, 0.25, 0.22), (0, YC - 0.08, ZD - 0.08)), 'plastic', 0.03)
    P.add('wheel', kit.steering_wheel((0.33, YC - 0.3, ZD + 0.12), 0.17, -30, 3), 'plastic')
    P.add('column', tube_path([(0.33, YC - 0.28, ZD + 0.1), (0.33, YC - 0.08, ZD - 0.02)], 0.02, 8), 'chassis')
    P.add('nets', merge([box((0.006, 0.5, 0.35), (sx * (HW + 0.0), rows[0], ZD + 0.3)) for sx in (1, -1)]), 'canvas')

    # ---------------- lights + extras
    for sx in (1, -1):
        P.lamp(kit.rect_light((sx * 0.4, YR - 0.62, ZFL + 0.45), 0.12, 0.04, 0.03, -1), 'tail')
    if spec.get('lightbar', True):
        P.lamp(kit.light_bar(0, YC - 0.42, ZRF + 0.1, HW * 1.6, 0.08))
        P.add('lb_mount', merge([tube_path([(sx * 0.5, YC - 0.45, ZRF + 0.03), (sx * 0.5, YC - 0.45, ZRF + 0.08)], 0.012, 6) for sx in (1, -1)]),
              'chassis')
    if spec.get('spare'):
        t = kit.tyre(R, W, RRIM, ts)
        r = kit.rim(R, W, RRIM, rs)
        for bm in (t, r):
            transform(bm, rot=[('Y', 1.5708)], loc=(0, YR - 0.05, ZD + 0.05 + W * 0.5))
        P.add('spare_t', t, 'rubber')
        P.add('spare_r', r, 'metal', 0.003)
    if spec.get('snorkel'):
        for sx in (1, -1):
            P.add('snorkel', tube_path([(sx * 0.3, YB - 0.2, ZD), (sx * 0.4, YB + 0.05, ZRF + 0.15), (sx * 0.4, YB + 0.15, ZRF + 0.2)], 0.035, 10, 0.08),
                  'plastic')
    if spec.get('rack'):
        rk = [tube_path([(0.55, YC - 0.5, ZRF + 0.12), (0.55, YB + 0.05, ZRF + 0.12), (-0.55, YB + 0.05, ZRF + 0.12), (-0.55, YC - 0.5, ZRF + 0.12),
                         (0.55, YC - 0.5, ZRF + 0.12)], 0.015, 8, 0.04)]
        rk += [tube_path([(0.55, y, ZRF + 0.12), (-0.55, y, ZRF + 0.12)], 0.01, 6) for y in [YC - 0.5 + (YB - YC + 0.55) * k / 5 for k in range(1, 5)]]
        P.add('rack', merge(rk), 'chassis')
    if spec.get('winch'):
        P.add('winch', cyl(0.06, 0.34, 18, loc=(0, YF + 0.7, ZFL + 0.1), axis='X'), 'chassis', 0.005)
    if spec.get('flag'):
        P.add('whip', tube_path([(-0.48, YR - 0.6, ZFL + 0.25), (-0.5, YR - 0.65, ZRF + 1.0)], 0.006, 6), 'chassis')
        fl = bmesh.new()
        vs = [fl.verts.new(v) for v in ((-0.5, YR - 0.65, ZRF + 1.0), (-0.5, YR - 1.05, ZRF + 0.92), (-0.5, YR - 0.65, ZRF + 0.76))]
        fl.faces.new(vs)
        P.add('flag', fl, 'flag')

    P.meta['decals'] = [
        {'img': 'disc', 'axis': 'side', 'c': (rows[0] + 0.05, (ZFL + ZD) / 2 + 0.03), 'size': (0.3, 0.3), 'xmin': HW},
        {'img': 'sponsor', 'axis': 'side', 'c': (YF - 0.15, ZD - 0.12), 'size': (0.5, 0.125), 'xmin': TRK},
        {'img': 'disc', 'axis': 'top', 'c': (0.0, YF + 0.2), 'size': (0.36, 0.36), 'zmin': ZFL + 0.2},
    ]
    P.meta.update(height=ZRF + 0.2, half_width=TRK + W * 0.5 + 0.05, ymin=YR - 0.75, ymax=YF + 0.8, origin_z=round(ZFL + 0.35, 3),
                  zsplit=ZFL + 0.25, rocker=ZFL + 0.1, band=(ZD - 0.2, ZD - 0.13))
    return P
