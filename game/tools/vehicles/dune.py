"""Dune buggy builder: fibreglass bathtub body with separate fender pods, rear air-cooled
flat-four hanging out the back, roll bar or cage.
Spec keys: wheelbase, track, cage ('bar', 'cage'), screen, spare_hood, surfboard, lightbar,
front ('beam', 'arms'), bumpers ('chrome', 'tube'), tyres, rims, lift, exhaust ('quad', 'stinger')."""
import math
import bmesh
from mathutils import Vector
import kit
from kit import box, cyl, lathe, tube_path, merge, transform, Parts


def build(spec):
    P = Parts()
    lift = spec.get('lift', 0.0)
    WB = spec.get('wheelbase', 2.06)
    TF, TR = spec.get('track', (1.5, 1.56))
    TF, TR = TF / 2, TR / 2
    RF, RR = spec.get('rf', 0.33), spec.get('rr', 0.37)
    WF, WR = spec.get('wf', 0.2), spec.get('wr', 0.3)
    RRIM = spec.get('rrim', 0.19)
    YF, YR = WB * 0.5, -WB * 0.5
    ZF, ZR = RF, RR
    Z0 = 0.4 + lift                 # tub floor
    ZT = 0.82 + lift                # tub top (sill)
    HW = 0.6
    YA, YM = YF - 0.42, YR + 0.62   # cockpit front / rear
    ts_f, ts_r = spec.get('tyres', ('at', 'at'))
    rs = spec.get('rims', 'spoke5')

    P.wheel_kind('F', kit.tyre(RF, WF, RRIM, ts_f), kit.rim(RF, WF, RRIM, rs))
    P.wheel_kind('R', kit.tyre(RR, WR, RRIM, ts_r), kit.rim(RR, WR, RRIM, rs))
    for n, x, y, z, k, r in (('wheel_FL', -TF, YF, ZF, 'F', RF), ('wheel_FR', TF, YF, ZF, 'F', RF),
                             ('wheel_RL', -TR, YR, ZR, 'R', RR), ('wheel_RR', TR, YR, ZR, 'R', RR)):
        P.spot(n, (x, y, z), k, r)

    # ---------------- tub
    nose_y = YF + 0.5

    def half(y):
        hood = max(0.0, (y - (YA - 0.05)) / (nose_y - YA + 0.05))
        tail = max(0.0, ((YR + 0.25) - y) / 0.2)
        zt = ZT + 0.02 - 0.2 * hood ** 1.3 + 0.03 * tail
        hw = HW * (1 - 0.18 * hood ** 2)
        zb = Z0 + 0.12 * hood ** 2 + 0.06 * tail
        crown = 0.035 * (1 if hood > 0 else 0.3)
        return [(0.0, zb), (hw * 0.7, zb), (hw - 0.04, zb + 0.01), (hw, zb + 0.06), (hw + 0.015, (zb + zt) / 2), (hw, zt - 0.05),
                (hw - 0.03, zt - 0.005), (hw - 0.08, zt + crown * 0.6), (0.0, zt + crown)]
    stations = [YR + 0.08, YR + 0.12, YR + 0.2, YR + 0.35, YR + 0.6, YM, (YM + YA) / 2, YA, YA + 0.2, YF - 0.1, YF + 0.15, YF + 0.35,
                nose_y - 0.08, nose_y]
    tub = kit.shell('tub', stations, half, 'paint', ends=((0.012, 0.025), (0.01, 0.018), (0.94, 0.75)))
    kit.cut(tub, [box((HW * 2 - 0.1, YA - YM, 0.6), (0, (YA + YM) / 2, ZT + 0.2)),
                  box((HW * 2 - 0.16, 0.5, 0.5), (0, YR + 0.45, ZT + 0.22))])      # cockpit + rear seat well
    kit.finish(tub)
    P.add_obj(tub)

    # ---------------- fender pods
    def pod(yc, R, x_in, x_out, wz, front):
        rr = R + 0.07 + lift * 0.4
        a0, a1 = (-75, 95) if front else (-100, 70)
        def f(u, v):
            a = math.radians(a0 + (a1 - a0) * v)
            x = x_in + (x_out - x_in) * u
            t = u * 2 - 1
            r = rr + 0.04 * (1 - t * t) - 0.05 * max(0.0, t) ** 4
            dz = -0.04 * max(0.0, abs(t) - 0.8) / 0.2
            return Vector((x, yc + math.sin(a) * r, wz + math.cos(a) * r + dz))
        return kit.surface(f, 14, 30, 0.01, 2, 'paint', 'fender')
    for sx in (1, -1):
        for yc, R, T, W, wz, fr_ in ((YF, RF, TF, WF, ZF, True), (YR, RR, TR, WR, ZR, False)):
            xi, xo = HW - 0.04, T + W * 0.5 + 0.04
            o = pod(yc, R, xi, xo, wz, fr_)
            if sx < 0:
                o.scale.x = -1
                kit.apply_all(o)
                import bpy
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                o.data.flip_normals()
            P.add_obj(o)

    # ---------------- chassis: floor pan, front beam or arms, rear trailing arms
    sus, shocks = [], []
    P.add('pan', box((HW * 2 - 0.1, YF - YR + 0.4, 0.012), (0, (YF + YR) / 2 + 0.1, Z0 - 0.02)), 'chassis', 0.004)
    P.add('tunnel', box((0.16, YA - YM + 0.3, 0.12), (0, (YA + YM) / 2, Z0 + 0.05)), 'chassis', 0.01)
    if spec.get('front', 'beam') == 'beam':
        # twin-tube beam with leading links
        for dz in (0.0, 0.11):
            sus.append(cyl(0.035, 0.9, 14, loc=(0, YF - 0.2, ZF + 0.08 + dz + lift), axis='X'))
        for sx in (1, -1):
            xk = sx * (TF - WF * 0.5 - 0.05)
            for dz in (0.0, 0.11):
                sus.append(tube_path([(sx * 0.42, YF - 0.2, ZF + 0.08 + dz + lift), (xk, YF - 0.02, ZF - 0.02 + dz * 0.7)], 0.018, 8))
            sus.append(kit.knuckle(xk + sx * 0.04, YF, ZF, sx, RRIM))
            shocks.append(kit.coilover((xk - sx * 0.08, YF - 0.05, ZF), (sx * 0.38, YF - 0.25, ZT - 0.02), 0.028))
    else:
        for sx in (1, -1):
            xk = sx * (TF - WF * 0.5 - 0.05)
            for zz, d in ((ZF - 0.08, 0.0), (ZF + 0.1, 0.04)):
                sus.append(kit.a_arm((sx * 0.25, YF + 0.18, zz + 0.12 + lift * 0.5), (sx * 0.25, YF - 0.22, zz + 0.12 + lift * 0.5),
                                     (xk - sx * d, YF, zz), 0.02))
            sus.append(kit.knuckle(xk + sx * 0.04, YF, ZF, sx, RRIM))
            shocks.append(kit.coilover((xk - sx * 0.1, YF + 0.02, ZF - 0.04), (sx * 0.3, YF - 0.08, ZT + 0.05), 0.032, reservoir=True))
    for sx in (1, -1):
        xr = sx * (TR - WR * 0.5 - 0.05)
        ta = kit.loft([[Vector((sx * (0.45 + (abs(xr) - 0.45) * t) + dx, YM - 0.05 + (YR - YM + 0.05) * t,
                                Z0 + 0.05 + (ZR - Z0 - 0.05) * t + dz)) for dx, dz in ((-0.03, -0.04), (0.03, -0.04), (0.03, 0.05), (-0.03, 0.05))]
                       for t in (0, 0.6, 1.0)])
        P.add('trailing_arm', ta, 'chassis', 0.008)
        sus.append(kit.knuckle(xr + sx * 0.04, YR, ZR, sx, RRIM))
        sus.append(tube_path([(sx * 0.18, YR - 0.05, ZR + 0.02), (xr, YR, ZR)], 0.02, 8))
        shocks.append(kit.coilover((xr - sx * 0.07, YR + 0.1, ZR + 0.02), (sx * 0.45, YR + 0.2, ZT + 0.12), 0.03, reservoir=bool(lift)))
    P.add('arms', merge(sus), 'chassis')
    P.add('shocks', merge(shocks), 'metal')

    # ---------------- engine (air-cooled flat four) out the back
    ey = YR - 0.18
    eng = [box((0.36, 0.42, 0.3), (0, ey, ZR + 0.08))]
    for sx in (1, -1):
        cylb = cyl(0.07, 0.18, 16, loc=(sx * 0.26, ey - 0.02, ZR + 0.06), axis='X')
        eng.append(cylb)
        for k in range(6):
            eng.append(cyl(0.09, 0.006, 16, loc=(sx * (0.2 + k * 0.022), ey - 0.02, ZR + 0.06), axis='X'))
        eng.append(box((0.07, 0.36, 0.12), (sx * 0.37, ey - 0.02, ZR + 0.06)))
    P.add('engine', merge(eng), 'engine', 0.008)
    P.add('fanshroud', merge([box((0.5, 0.3, 0.16), (0, ey - 0.05, ZR + 0.3)), cyl(0.14, 0.06, 24, loc=(0, ey - 0.22, ZR + 0.3), axis='Y')]),
          'frame', 0.03)
    for sx in (1, -1):
        P.add('aircleaner', cyl(0.08, 0.09, 18, loc=(sx * 0.18, ey + 0.08, ZR + 0.48)), 'chrome', 0.004)
    if spec.get('exhaust', 'quad') == 'stinger':
        ex = tube_path([(0.26, ey - 0.02, ZR - 0.05), (0.15, ey - 0.25, ZR - 0.1), (0, ey - 0.3, ZR - 0.12), (0, ey - 0.38, ZR + 0.35),
                        (0, ey - 0.52, ZR + 0.62)], 0.032, 12, 0.08)
        P.add('stinger', ex, 'chrome')
    else:
        exs = []
        for sx in (1, -1):
            for dx in (0.0, 0.06):
                exs.append(tube_path([(sx * 0.26, ey - 0.02, ZR - 0.05), (sx * (0.2 + dx), ey - 0.3, ZR - 0.08), (sx * (0.2 + dx), ey - 0.45, ZR - 0.06)],
                                     0.022, 10, 0.06))
        P.add('tips', merge(exs), 'chrome')

    # ---------------- roll bar / cage
    T = 0.026
    tb = []
    zr = ZT + 0.75
    if spec.get('cage', 'bar') == 'bar':
        for sx in (1, -1):
            tb.append(tube_path([(sx * (HW - 0.06), YM + 0.02, ZT - 0.02), (sx * (HW - 0.1), YM, zr - 0.05), (sx * 0.4, YM - 0.02, zr)], T, 10, 0.12))
            tb.append(tube_path([(sx * (HW - 0.1), YM, zr - 0.08), (sx * 0.4, YR + 0.1, ZT + 0.08)], T * 0.85, 10))
        tb.append(tube_path([(0.4, YM - 0.02, zr), (-0.4, YM - 0.02, zr)], T, 10))
        tb.append(tube_path([(0.4, YR + 0.1, ZT + 0.08), (-0.4, YR + 0.1, ZT + 0.08)], T * 0.85, 8))
    else:
        for sx in (1, -1):
            tb.append(tube_path([(sx * (HW - 0.06), YA + 0.1, ZT - 0.03), (sx * (HW - 0.1), YA - 0.15, zr), (sx * (HW - 0.1), YM, zr),
                                 (sx * (HW - 0.06), YM + 0.02, ZT - 0.02)], T, 10, 0.12))
            tb.append(tube_path([(sx * (HW - 0.1), YM, zr), (sx * 0.4, YR + 0.05, ZT + 0.1), (sx * 0.4, YR - 0.4, ZR + 0.15)], T * 0.85, 10, 0.1))
            tb.append(tube_path([(sx * (HW - 0.06), YA + 0.12, ZT - 0.02), (sx * 0.4, YF + 0.2, ZT - 0.06), (sx * 0.35, nose_y + 0.12, Z0 + 0.25)],
                                T * 0.85, 10, 0.12))
        for y, z in ((YA - 0.15, zr), (YM, zr), (YR + 0.05, ZT + 0.1)):
            tb.append(tube_path([(HW - 0.1 if z == zr else 0.4, y, z), (-(HW - 0.1) if z == zr else -0.4, y, z)], T * 0.9, 8))
        tb.append(tube_path([(HW - 0.1, YA - 0.15, zr), (-(HW - 0.1), YM, zr)], T * 0.75, 8))
    P.add('rollbar', merge(tb), 'frame')
    # bumpers
    if spec.get('bumpers', 'chrome') == 'chrome':
        P.add('bumper_f', tube_path([(0.5, nose_y - 0.12, Z0 + 0.18), (0.45, nose_y + 0.1, Z0 + 0.18), (-0.45, nose_y + 0.1, Z0 + 0.18),
                                     (-0.5, nose_y - 0.12, Z0 + 0.18)], 0.024, 10, 0.08), 'chrome')
        P.add('bumper_r', tube_path([(0.45, YR - 0.05, ZR - 0.12), (0.4, YR - 0.48, ZR - 0.1), (-0.4, YR - 0.48, ZR - 0.1),
                                     (-0.45, YR - 0.05, ZR - 0.12)], 0.024, 10, 0.08), 'chrome')
    else:
        P.add('bumper_f', tube_path([(0.45, nose_y - 0.15, Z0 + 0.1), (0.55, nose_y + 0.12, Z0 + 0.12), (0.5, nose_y + 0.14, Z0 + 0.35),
                                     (-0.5, nose_y + 0.14, Z0 + 0.35), (-0.55, nose_y + 0.12, Z0 + 0.12), (-0.45, nose_y - 0.15, Z0 + 0.1)],
                                    0.026, 10, 0.06), 'frame')
        P.add('bumper_r', tube_path([(0.45, YR - 0.05, ZR - 0.1), (0.5, YR - 0.5, ZR - 0.08), (0.42, YR - 0.52, ZR + 0.42),
                                     (-0.42, YR - 0.52, ZR + 0.42), (-0.5, YR - 0.5, ZR - 0.08), (-0.45, YR - 0.05, ZR - 0.1)], 0.026, 10, 0.06), 'frame')
    for sx in (1, -1):   # nerf bars between the fenders
        P.add('nerf', tube_path([(sx * (HW - 0.02), YA + 0.05, Z0 + 0.06), (sx * (HW + 0.12), YA - 0.05, Z0 + 0.06),
                                 (sx * (HW + 0.12), YM + 0.08, Z0 + 0.06), (sx * (HW - 0.02), YM, Z0 + 0.06)], 0.02, 8, 0.05),
              'chrome' if spec.get('bumpers', 'chrome') == 'chrome' else 'frame')

    # ---------------- cockpit
    for x in (0.27, -0.27):
        P.add_obj(kit.bucket_seat((x, YM + 0.3, Z0 + 0.06), 0.44, 0.42, 0.62, 16))
    P.add('wheel', kit.steering_wheel((0.27, YA - 0.18, ZT + 0.1), 0.17, -28, 3), 'chrome' if spec.get('bumpers', 'chrome') == 'chrome' else 'plastic')
    P.add('column', tube_path([(0.27, YA - 0.16, ZT + 0.08), (0.2, YA + 0.25, Z0 + 0.25)], 0.018, 8), 'chassis')
    P.add('dash', box((HW * 2 - 0.14, 0.05, 0.16), (0, YA + 0.02, ZT - 0.07)), 'paint', 0.012)
    for k, x in enumerate((-0.1, 0.0, 0.1)):
        P.add('gauge', cyl(0.035, 0.02, 16, loc=(0.27 + x, YA - 0.01, ZT - 0.05), axis='Y'), 'chrome')
    if spec.get('screen', False):
        fr_pts = [(0.5, YA + 0.06, ZT), (0.47, YA - 0.05, ZT + 0.36), (-0.47, YA - 0.05, ZT + 0.36), (-0.5, YA + 0.06, ZT)]
        P.add('screen_frame', tube_path(fr_pts, 0.016, 8, 0.05), 'chrome')
        P.glass_panel(kit.loft([[Vector((x, YA + 0.06 - 0.11 * t, ZT + 0.36 * t)) for x in (0.47, -0.47)] for t in (0.04, 0.96)],
                               closed_sections=False, cap=False))

    # ---------------- lights
    hz = ZT - 0.08
    if spec.get('lights', 'hood') == 'hood':
        for sx in (1, -1):
            bm = kit.round_light((sx * 0.3, nose_y - 0.25, hz + 0.08), 0.085, 0.12)
            P.lamp(bm, house='chrome')
    else:
        for sx in (1, -1):
            P.lamp(kit.round_light((sx * 0.3, nose_y + 0.02, Z0 + 0.32), 0.07, 0.08))
    for sx in (1, -1):
        P.lamp(kit.round_light((sx * 0.42, YR - 0.5, ZR + 0.25), 0.045, 0.05, '-Y'), 'tail')
    if spec.get('lightbar'):
        P.lamp(kit.light_bar(0, YA - 0.1, zr + 0.08, 1.0, 0.075))
        P.add('lb_mount', merge([tube_path([(sx * 0.42, YA - 0.15, zr), (sx * 0.42, YA - 0.12, zr + 0.06)], 0.012, 6) for sx in (1, -1)]), 'chassis')
    if spec.get('spare_hood'):
        t = kit.tyre(RF, WF, RRIM, ts_f)
        r = kit.rim(RF, WF, RRIM, rs)
        for bm in (t, r):
            transform(bm, rot=[('Y', 1.5708), ('X', -0.18)], loc=(0, YF - 0.05, ZT + 0.05 + WF * 0.4))
        P.add('spare_t', t, 'rubber')
        P.add('spare_r', r, 'chrome', 0.003)
    if spec.get('surfboard'):
        # roof rack on the roll bar with a strapped longboard
        P.add('rack', merge([tube_path([(sx * 0.4, YM - 0.02, zr), (sx * 0.4, YA + 0.3, ZT + 0.2)], 0.014, 8) for sx in (1, -1)]), 'chassis')
        sec = []
        for k in range(13):
            t = k / 12
            y = YA + 0.95 - 2.5 * t
            w = 0.28 * math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.55
            z = zr + 0.06 + 0.12 * (1 - t) ** 6 + 0.05 * t ** 6
            sec.append([Vector((w * math.cos(a), y, z + 0.03 * math.sin(a))) for a in [math.radians(d) for d in range(0, 360, 30)]])
        board = kit.loft(sec)
        P.add('surfboard', board, 'flag')

    P.meta['decals'] = [
        {'img': 'disc', 'axis': 'side', 'c': ((YA + YM) / 2, (Z0 + ZT) / 2 + 0.02), 'size': (0.3, 0.3), 'xmin': HW - 0.05},
        {'img': 'disc', 'axis': 'top', 'c': (0.0, YF + 0.05), 'size': (0.36, 0.36), 'zmin': Z0 + 0.2},
        {'img': 'sponsor', 'axis': 'side', 'c': (YR + 0.05, ZR + 0.32 + lift * 0.4), 'size': (0.4, 0.1), 'xmin': TR},
    ]
    P.meta.update(height=zr + 0.15, half_width=TR + WR * 0.5 + 0.05, ymin=YR - 0.55, ymax=nose_y + 0.15, origin_z=round(Z0 + 0.3, 3),
                  zsplit=(Z0 + ZT) / 2 - 0.06, rocker=Z0 + 0.04, band=((Z0 + ZT) / 2 - 0.04, (Z0 + ZT) / 2 + 0.03))
    return P
