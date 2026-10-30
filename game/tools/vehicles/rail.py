"""Sand rail builder: full tube chassis, mid/rear engine, long-travel arms.
Spec keys: wheelbase, track, seats (1, 2 or 4), roof, spare, stacks, wing, tyres, rims, lights."""
import math
import bmesh
from mathutils import Vector
import kit
from kit import box, cyl, lathe, tube_path, merge, transform, Parts


def build(spec):
    P = Parts()
    seats = spec.get('seats', 2)
    WB = spec.get('wheelbase', 2.9 if seats < 4 else 3.3)
    TF, TR = spec.get('track', (1.72, 1.78))
    TF, TR = TF / 2, TR / 2
    RF, RR = spec.get('rf', 0.36), spec.get('rr', 0.42)
    WF, WR = spec.get('wf', 0.2), spec.get('wr', 0.36)
    RRIM = spec.get('rrim', 0.2)
    YF, YR = WB * 0.5, -WB * 0.5
    ZF, ZR = RF, RR
    ts_f, ts_r = spec.get('tyres', ('rib', 'paddle'))
    rs = spec.get('rims', 'beadlock')
    HW = 0.62 if seats > 1 else 0.42           # cockpit half width
    ZFL = 0.42                                 # floor
    ZRF = spec.get('roof_z', 1.55)
    cock = 0.75 if seats < 4 else 1.25         # cockpit length (front hoop to main hoop)
    YA = YF - 0.75                             # cowl (front hoop base)
    YM = YA - cock - 0.35                      # main hoop
    T = spec.get('tube', 0.024)

    P.wheel_kind('F', kit.tyre(RF, WF, RRIM, ts_f), kit.rim(RF, WF, RRIM, rs))
    P.wheel_kind('R', kit.tyre(RR, WR, RRIM, ts_r), kit.rim(RR, WR, RRIM, rs))
    for n, x, y, z, k, r in (('wheel_FL', -TF, YF, ZF, 'F', RF), ('wheel_FR', TF, YF, ZF, 'F', RF),
                             ('wheel_RL', -TR, YR, ZR, 'R', RR), ('wheel_RR', TR, YR, ZR, 'R', RR)):
        P.spot(n, (x, y, z), k, r)

    # ---------------- chassis tubes (mirrored pairs + cross tubes)
    side = []
    cross = []
    for sx in (1, -1):
        def p(x, y, z):
            return (sx * x, y, z)
        # floor rail
        side.append(tube_path([p(0.38, YF + 0.45, ZFL + 0.12), p(HW - 0.08, YA + 0.1, ZFL), p(HW, YA - 0.2, ZFL), p(HW, YM - 0.05, ZFL),
                               p(0.48, YM - 0.5, ZFL + 0.05), p(0.42, YR - 0.55, ZFL + 0.12)], T, 10, 0.12))
        # upper nose rail -> front hoop base
        side.append(tube_path([p(0.28, YF + 0.5, ZFL + 0.35), p(0.42, YF - 0.1, 0.78), p(HW - 0.02, YA, 0.86)], T, 10, 0.12))
        # nose uprights
        side.append(tube_path([p(0.38, YF + 0.45, ZFL + 0.12), p(0.28, YF + 0.5, ZFL + 0.35)], T * 0.9, 8))
        # front hoop: cowl up to roof
        side.append(tube_path([p(HW - 0.04, YA + 0.04, ZFL), p(HW - 0.02, YA, 0.86), p(HW - 0.08, YA - 0.42, ZRF)], T, 10, 0.1))
        # roof side
        side.append(tube_path([p(HW - 0.08, YA - 0.42, ZRF), p(HW - 0.02, YM, ZRF - 0.02)], T, 10))
        # main hoop
        side.append(tube_path([p(HW - 0.02, YM, ZRF - 0.02), p(HW, YM - 0.02, 0.9), p(HW, YM - 0.05, ZFL)], T, 10, 0.1))
        # door bar
        side.append(tube_path([p(HW - 0.02, YA, 0.86), p(HW + 0.04, (YA + YM) / 2, 0.8), p(HW, YM - 0.02, 0.9)], T * 0.85, 8, 0.2))
        side.append(tube_path([p(HW, YA - 0.2, ZFL), p(HW + 0.03, (YA + YM) / 2, 0.8)], T * 0.75, 8))
        # rear engine cage: roof back to shock towers and down to the bumper
        side.append(tube_path([p(HW - 0.02, YM, ZRF - 0.02), p(0.5, YR + 0.05, 1.12), p(0.46, YR - 0.55, 0.62), p(0.42, YR - 0.55, ZFL + 0.12)],
                              T, 10, 0.14))
        side.append(tube_path([p(HW, YM - 0.02, 0.9), p(0.5, YR + 0.05, 0.9), p(0.48, YR - 0.45, 0.8)], T * 0.85, 8, 0.1))
        side.append(tube_path([p(0.48, YM - 0.5, ZFL + 0.05), p(0.5, YR + 0.05, 1.12)], T * 0.8, 8))
        # roof diagonal
        side.append(tube_path([p(HW - 0.08, YA - 0.42, ZRF), p(-HW + 0.08, YM, ZRF - 0.02)], T * 0.75, 8) if sx > 0 else
                    tube_path([p(HW - 0.08, YA - 0.42, ZRF), p(-HW + 0.08, YM, ZRF - 0.02)], T * 0.75, 8))
    for y, z, x in ((YF + 0.5, ZFL + 0.35, 0.28), (YF + 0.45, ZFL + 0.12, 0.38), (YA, 0.86, HW - 0.02), (YA - 0.42, ZRF, HW - 0.08),
                    (YM, ZRF - 0.02, HW - 0.02), (YM - 0.05, ZFL, HW), (YM - 0.02, 0.9, HW), (YR + 0.05, 1.12, 0.5),
                    (YR - 0.55, 0.62, 0.46), (YR - 0.55, ZFL + 0.12, 0.42), (YA + 0.1, ZFL, HW - 0.08)):
        cross.append(tube_path([(x, y, z), (-x, y, z)], T * 0.9, 8))
    # bumpers
    cross.append(tube_path([(0.5, YF + 0.42, ZFL + 0.05), (0.42, YF + 0.62, ZFL + 0.2), (-0.42, YF + 0.62, ZFL + 0.2), (-0.5, YF + 0.42, ZFL + 0.05)],
                           T, 10, 0.08))
    cross.append(tube_path([(0.62, YR - 0.4, 0.66), (0.5, YR - 0.68, 0.6), (-0.5, YR - 0.68, 0.6), (-0.62, YR - 0.4, 0.66)], T, 10, 0.1))
    P.add('cage', merge(side + cross), 'frame')
    # floor pan + seat back plate
    P.add('floor', box((HW * 2 - 0.04, YA - YM + 0.2, 0.006), (0, (YA + YM) / 2, ZFL - 0.02)), 'alloy', 0.003)
    P.add('firewall', box((HW * 2 - 0.06, 0.006, 0.45), (0, YM - 0.03, ZFL + 0.25)), 'alloy', 0.003)

    # ---------------- suspension
    sus, shocks = [], []
    for sx in (1, -1):
        xk = sx * (TF - WF * 0.5 - 0.06)
        for zz, d in ((ZF - 0.08, 0.0), (ZF + 0.1, 0.04)):
            sus.append(kit.a_arm((sx * 0.3, YF + 0.22, zz + 0.12), (sx * 0.3, YF - 0.25, zz + 0.12), (xk - sx * d, YF, zz), 0.022))
        sus.append(kit.knuckle(xk + sx * 0.04, YF, ZF, sx, RRIM))
        shocks.append(kit.coilover((xk - sx * 0.1, YF + 0.03, ZF - 0.05), (sx * 0.32, YF - 0.05, 0.9), 0.034, reservoir=True))
        shocks.append(kit.coilover((xk - sx * 0.16, YF - 0.06, ZF - 0.04), (sx * 0.36, YF - 0.18, 0.86), 0.026, spring=False))
        sus.append(tube_path([(sx * 0.12, YF - 0.12, ZF + 0.06), (xk, YF - 0.12, ZF + 0.03)], 0.012, 8))
        # rear trailing arm (boxed, alloy) + radius rods
        xr = sx * (TR - WR * 0.5 - 0.06)
        ta = kit.loft([[Vector((sx * (0.5 + (abs(xr) - 0.5) * t) + dx, YM - 0.15 + (YR - YM + 0.15) * t, ZFL + 0.08 + (ZR - ZFL - 0.08) * t + dz))
                        for dx, dz in ((-0.03, -0.05), (0.03, -0.05), (0.03, 0.06 - 0.03 * t), (-0.03, 0.06 - 0.03 * t))] for t in (0, 0.5, 1.0)])
        P.add('trailing_arm', ta, 'alloy', 0.008)
        sus.append(kit.knuckle(xr + sx * 0.05, YR, ZR, sx, RRIM))
        sus.append(tube_path([(sx * 0.42, YR + 0.25, 0.8), (xr, YR + 0.02, ZR + 0.08)], 0.016, 8))
        sus.append(tube_path([(0, YR + 0.05, 0.72), (xr, YR, ZR)], 0.018, 8))                 # CV axle
        shocks.append(kit.coilover((xr - sx * 0.08, YR + 0.12, ZR + 0.02), (sx * 0.5, YR + 0.05, 1.1), 0.04, reservoir=True))
        shocks.append(kit.coilover((xr - sx * 0.1, YR + 0.32, ZR - 0.02), (sx * 0.5, YR + 0.3, 1.08), 0.03, spring=False))
    P.add('arms', merge(sus), 'chassis')
    P.add('shocks', merge(shocks), 'metal')

    # ---------------- engine bay
    ey = YR + 0.35
    eng = [box((0.42, 0.62, 0.32), (0, ey, 0.66)), box((0.3, 0.3, 0.24), (0, ey - 0.55, 0.62))]
    for sx in (1, -1):   # V cylinder banks
        b = box((0.18, 0.5, 0.2))
        transform(b, rot=[('Y', sx * 0.6)], loc=(sx * 0.16, ey + 0.02, 0.88))
        eng.append(b)
    P.add('engine', merge(eng), 'engine', 0.01)
    P.add('intake', merge([box((0.18, 0.46, 0.08), (0, ey + 0.02, 1.0)), cyl(0.09, 0.12, 20, loc=(0, ey + 0.05, 1.1))]), 'alloy', 0.006)
    hdr = []
    for sx in (1, -1):
        for k in range(4):
            y = ey + 0.2 - k * 0.13
            if spec.get('stacks'):
                hdr.append(tube_path([(sx * 0.27, y, 0.88), (sx * 0.36, y, 0.92), (sx * 0.38, y - 0.05, 1.32)], 0.02, 8, 0.05))
            else:
                hdr.append(tube_path([(sx * 0.27, y, 0.88), (sx * 0.36, y, 0.85), (sx * 0.36, ey - 0.3, 0.75), (sx * 0.2, YR - 0.45, 0.72)], 0.018, 8, 0.05))
    P.add('headers', merge(hdr), 'chrome' if spec.get('stacks') else 'metal')
    if not spec.get('stacks'):
        for sx in (1, -1):
            m = lathe([(0, 0), (0.06, 0), (0.065, 0.03), (0.065, 0.3), (0.04, 0.32), (0, 0.32)], 18, axis='Y')
            transform(m, rot=[('Z', 3.14159)], loc=(sx * 0.2, YR - 0.4, 0.72))
            P.add('muffler', m, 'alloy', 0.004)
    # radiator on top behind the cage
    P.add('radiator', box((0.6, 0.06, 0.32), (0, YM - 0.35, 1.12)), 'chassis', 0.006)
    P.add('fan', cyl(0.12, 0.05, 20, loc=(0, YM - 0.4, 1.12), axis='Y'), 'plastic')

    # ---------------- panels (painted fibreglass)
    def nose(u, v):
        x = (u * 2 - 1)
        y = YA + 0.05 + (YF + 0.48 - YA - 0.05) * v
        hw = (HW - 0.06) * (1 - v) + 0.3 * v
        z = 0.86 + (ZFL + 0.37 - 0.86) * v + 0.06 * (1 - x * x) * (1 - v * 0.5)
        return Vector((x * hw, y, z + 0.02))
    P.add_obj(kit.surface(nose, 16, 14, 0.008, 2, 'paint', 'hood'))
    if spec.get('roof', True):
        def roof(u, v):
            x = (u * 2 - 1)
            y = YA - 0.42 + (YM - YA + 0.42) * v
            return Vector((x * (HW - 0.06), y, ZRF + 0.03 + 0.03 * (1 - x * x)))
        P.add_obj(kit.surface(roof, 12, 10, 0.008, 2, 'paint', 'roof'))
    for sx in (1, -1):
        def kick(u, v, sx=sx):
            y = YA - 0.1 + (YM - YA + 0.15) * u
            return Vector((sx * (HW + 0.025), y, ZFL + 0.02 + 0.36 * v - 0.08 * v * u))
        P.add_obj(kit.surface(kick, 12, 6, 0.006, 2, 'paint', 'kick'))
    # rear deck fins over the engine
    if spec.get('wing', True):
        def deck(u, v):
            x = (u * 2 - 1)
            y = YM - 0.55 + (YR - 0.5 - YM + 0.55) * v
            return Vector((x * 0.5, y, 1.2 - 0.12 * v + 0.02 * (1 - x * x)))
        P.add_obj(kit.surface(deck, 10, 10, 0.008, 2, 'paint', 'deck'))
        for sx in (1, -1):
            P.add('fin', box((0.012, 0.5, 0.18), (sx * 0.5, YR - 0.25, 1.25)), 'paint', 0.004)

    # ---------------- cockpit
    rows = [YA - 0.55] if seats < 4 else [YA - 0.5, YA - 1.05]
    for yy in rows:
        xs = (0.0,) if seats == 1 else (0.3, -0.3)
        for x in xs:
            P.add_obj(kit.bucket_seat((x, yy, ZFL + 0.08), 0.48, 0.46, 0.78, 14, mat='seat'))
            # harness straps
            P.add('harness', merge([box((0.05, 0.01, 0.6), (x + sx * 0.1, yy - 0.28, ZFL + 0.6)) for sx in (1, -1)]), 'seat')
    dx = 0.3 if seats > 1 else 0.0
    P.add('column', tube_path([(dx, YA - 0.2, 0.86), (dx, YA + 0.15, 0.7)], 0.018, 8), 'chassis')
    P.add('wheel', kit.steering_wheel((dx, YA - 0.22, 0.9), 0.15, -30, 3), 'plastic')
    P.add('dash', box((HW * 2 - 0.12, 0.08, 0.14), (0, YA - 0.02, 0.84)), 'plastic', 0.01)
    if spec.get('nets', True):
        for sx in (1, -1):
            P.add('net', box((0.008, 0.6, 0.3), (sx * (HW + 0.01), YA - 0.55, 1.05)), 'canvas')

    # ---------------- lights
    for sx in (1, -1):
        P.lamp(kit.round_light((sx * 0.22, YF + 0.62, ZFL + 0.38), 0.07, 0.08))
        P.lamp(kit.rect_light((sx * 0.4, YR - 0.68, 0.72), 0.06, 0.1, 0.03, -1), 'tail')
    if spec.get('lightbar', True):
        hb, ln, lp = kit.light_bar(0, YA - 0.36, ZRF + 0.11, HW * 1.8, 0.075)
        P.lamp((hb, ln, lp))
    # spare paddle wheel on the rear deck, whip flag
    if spec.get('spare'):
        t = kit.tyre(RR, WR, RRIM, ts_r)
        r = kit.rim(RR, WR, RRIM, rs)
        for bm in (t, r):
            transform(bm, rot=[('Y', 1.5708)], loc=(0, YR - 0.15, 1.26 + WR * 0.5 + 0.02))
        P.add('spare_t', t, 'rubber')
        P.add('spare_r', r, 'metal', 0.003)
    if spec.get('flag', True):
        P.add('whip', tube_path([(-0.48, YR - 0.4, 0.8), (-0.5, YR - 0.45, 2.6)], 0.006, 6), 'chassis')
        fl = bmesh.new()
        vs = [fl.verts.new(v) for v in ((-0.5, YR - 0.45, 2.6), (-0.5, YR - 0.9, 2.5), (-0.5, YR - 0.45, 2.35))]
        fl.faces.new(vs)
        P.add('flag', fl, 'flag')

    P.meta['decals'] = [
        {'img': 'disc', 'axis': 'side', 'c': ((YA + YM) / 2, ZFL + 0.22), 'size': (0.3, 0.3), 'xmin': HW},
        {'img': 'sponsor', 'axis': 'side', 'c': (YR - 0.25, 1.25), 'size': (0.46, 0.115), 'xmin': 0.49},
        {'img': 'disc', 'axis': 'top', 'c': (0.0, (YA - 0.42 + YM) / 2), 'size': (0.42, 0.42), 'zmin': ZRF - 0.1},
        {'img': 'sponsor', 'axis': 'top', 'c': (0.0, YF), 'size': (0.5, 0.125), 'zmin': 0.5},
    ]
    P.meta.update(height=ZRF + 0.2, half_width=TR + WR * 0.5, ymin=YR - 0.7, ymax=YF + 0.65, origin_z=0.75,
                  zsplit=ZFL + 0.2, rocker=ZFL + 0.04, band=(ZFL + 0.15, ZFL + 0.24))
    return P
