"""ATV (quad) builder. Spec keys used (besides colours/livery):
    track, wheelbase, lift, tyres (front style, rear style), rim style, racks, snorkel,
    rear ('swing' or 'irs'), lights ('hood', 'bar', 'pods'), flag, skid, bumper ('sport', 'utility')
"""
import math
from mathutils import Vector
import kit
from kit import box, cyl, lathe, tube_path, merge, transform, Parts, TAU


def build(spec):
    P = Parts()
    lift = spec.get('lift', 0.0)
    WB = spec.get('wheelbase', 1.27)
    TRK = spec.get('track', 1.16) / 2
    RF, RR = spec.get('rf', 0.285), spec.get('rr', 0.29)
    WF, WR = spec.get('wf', 0.19), spec.get('wr', 0.25)
    RRIM = spec.get('rrim', 0.13)
    YF, YR = WB * 0.5, -WB * 0.5
    ZF, ZR = RF, RR
    Z0 = 0.3 + lift          # frame lower rail height
    ZS = 0.86 + lift         # seat top
    ts_f, ts_r = spec.get('tyres', ('atv', 'atv'))
    rs = spec.get('rims', 'spoke6')

    # ---------------- wheels
    P.wheel_kind('F', kit.tyre(RF, WF, RRIM, ts_f), kit.rim(RF, WF, RRIM, rs))
    P.wheel_kind('R', kit.tyre(RR, WR, RRIM, ts_r), kit.rim(RR, WR, RRIM, rs))
    for n, x, y, z, k, r in (('wheel_FL', -TRK, YF, ZF, 'F', RF), ('wheel_FR', TRK, YF, ZF, 'F', RF),
                             ('wheel_RL', -(TRK - 0.02), YR, ZR, 'R', RR), ('wheel_RR', TRK - 0.02, YR, ZR, 'R', RR)):
        P.spot(n, (x, y, z), k, r)

    # ---------------- frame (powder-coated tube)
    fr = []
    for sx in (1, -1):
        x0, x1 = 0.17 * sx, 0.2 * sx
        # lower rails, front up-sweep to the bumper, rear kick-up under the seat
        fr.append(tube_path([(x0, YF + 0.45, Z0 + 0.22), (x0, YF + 0.22, Z0), (x1, YR + 0.25, Z0), (x1, YR - 0.05, Z0 + 0.25),
                             (x1 * 0.9, YR - 0.18, ZS - 0.12)], 0.02, 10, 0.08))
        # upper rails from the steering head down to the rear
        fr.append(tube_path([(0.05 * sx, YF - 0.05, ZS - 0.02), (0.16 * sx, YF - 0.3, ZS - 0.12), (x1, YR + 0.2, ZS - 0.12),
                             (x1 * 0.9, YR - 0.18, ZS - 0.12)], 0.02, 10, 0.1))
        # down tubes
        fr.append(tube_path([(0.08 * sx, YF - 0.05, ZS - 0.04), (x0, YF + 0.05, Z0 + 0.05)], 0.019, 10))
        fr.append(tube_path([(x1, YR + 0.25, ZS - 0.12), (x1, YR + 0.35, Z0)], 0.017, 10))
        # nerf bars / footwells
        if spec.get('nerf', True):
            fr.append(tube_path([(x1, YF - 0.22, Z0 + 0.02), (sx * (TRK - 0.06), YF - 0.32, Z0 + 0.0), (sx * (TRK - 0.06), YR + 0.3, Z0 + 0.0),
                                 (x1, YR + 0.2, Z0 + 0.04)], 0.016, 8, 0.08))
        # rear grab bar
        fr.append(tube_path([(0.2 * sx, YR - 0.05, ZS - 0.05), (0.2 * sx, YR - 0.42, ZS - 0.04)], 0.016, 8))
    fr.append(tube_path([(0.2, YR - 0.42, ZS - 0.04), (-0.2, YR - 0.42, ZS - 0.04)], 0.016, 8))
    # cross members
    for y, z in ((YF + 0.22, Z0), (YR + 0.25, Z0), (YR - 0.05, Z0 + 0.25), (YF - 0.3, ZS - 0.12)):
        fr.append(tube_path([(0.2, y, z), (-0.2, y, z)], 0.017, 8))
    # front bumper
    if spec.get('bumper', 'sport') == 'sport':
        fr.append(tube_path([(0.17, YF + 0.45, Z0 + 0.22), (0.15, YF + 0.62, Z0 + 0.3), (-0.15, YF + 0.62, Z0 + 0.3), (-0.17, YF + 0.45, Z0 + 0.22)],
                            0.019, 10, 0.06))
    else:
        fr.append(tube_path([(0.17, YF + 0.45, Z0 + 0.22), (0.28, YF + 0.58, Z0 + 0.2), (0.28, YF + 0.6, Z0 + 0.42),
                             (-0.28, YF + 0.6, Z0 + 0.42), (-0.28, YF + 0.58, Z0 + 0.2), (-0.17, YF + 0.45, Z0 + 0.22)], 0.022, 10, 0.06))
        fr.append(tube_path([(0.28, YF + 0.59, Z0 + 0.3), (-0.28, YF + 0.59, Z0 + 0.3)], 0.016, 8))
    P.add('frame', merge(fr), 'frame' if spec.get('frame_paint', True) else 'chassis')
    # foot plates (checker aluminium)
    if spec.get('nerf', True):
        for sx in (1, -1):
            pl = box((0.17, 0.42, 0.012), (sx * (TRK - 0.17), (YF + YR) / 2 - 0.02, Z0 + 0.02))
            P.add('footwell', pl, 'alloy', 0.004)

    # ---------------- suspension
    sus, shocks = [], []
    for sx in (1, -1):
        xk = sx * (TRK - WF * 0.5 - 0.05)
        for zz, off in ((ZF - 0.07, 0.0), (ZF + 0.08, 0.02)):
            sus.append(kit.a_arm((sx * 0.17, YF + 0.16, zz + 0.05 + lift * 0.4), (sx * 0.17, YF - 0.14, zz + 0.05 + lift * 0.4),
                                 (xk - sx * off, YF, zz), 0.016))
        sus.append(kit.knuckle(xk + sx * 0.03, YF, ZF, sx, RRIM))
        shocks.append(kit.coilover((xk - sx * 0.07, YF + 0.02, ZF - 0.04), (sx * 0.16, YF - 0.02, ZS - 0.14), 0.026,
                                   reservoir=spec.get('reservoir', False)))
        # steering tie rods
        sus.append(tube_path([(sx * 0.05, YF - 0.08, ZF + 0.02 + lift * 0.4), (xk, YF - 0.09, ZF + 0.01)], 0.009, 6))
    if spec.get('rear', 'swing') == 'swing':
        piv = (0, YR + 0.42, Z0 + 0.1)
        for sx in (1, -1):
            sus.append(tube_path([(sx * 0.14, piv[1], piv[2]), (sx * 0.16, YR + 0.12, ZR + 0.01), (sx * 0.13, YR, ZR)], 0.03, 10, 0.06))
        sus.append(cyl(0.035, 2 * (TRK - 0.12), 16, loc=(0, YR, ZR), axis='X'))           # axle tube
        sus.append(transform(lathe([(0, -0.07), (0.09, -0.06), (0.1, 0), (0.09, 0.06), (0, 0.07)], 18, axis='X'), loc=(0.0, YR, ZR)))
        sus.append(cyl(0.11, 0.008, 28, loc=(-0.18, YR, ZR), axis='X'))                     # sprocket
        sus.append(cyl(0.12, 0.008, 28, loc=(0.18, YR, ZR), axis='X'))                      # rear brake rotor
        P.add('swingarm', merge(sus[-5:]), 'alloy', 0.006)
        sus = sus[:-5]
        shocks.append(kit.coilover((0, YR + 0.2, ZR + 0.05), (0, YR + 0.05, ZS - 0.1), 0.03, reservoir=True))
        # chain
        chain = tube_path([(-0.2, YR, ZR + 0.11), (-0.2, YR + 0.62, Z0 + 0.16), (-0.2, YR + 0.62, Z0 + 0.06), (-0.2, YR, ZR - 0.11)], 0.007, 6, 0.05)
        P.add('chain', chain, 'metal')
    else:
        for sx in (1, -1):
            xk = sx * (TRK - WR * 0.5 - 0.05)
            for zz in (ZR - 0.07, ZR + 0.08):
                sus.append(kit.a_arm((sx * 0.18, YR + 0.18, zz + 0.04 + lift * 0.4), (sx * 0.18, YR - 0.12, zz + 0.04 + lift * 0.4),
                                     (xk, YR, zz), 0.016))
            sus.append(kit.knuckle(xk + sx * 0.03, YR, ZR, sx, RRIM))
            shocks.append(kit.coilover((xk - sx * 0.07, YR, ZR - 0.04), (sx * 0.17, YR + 0.05, ZS - 0.13), 0.026))
            sus.append(tube_path([(0, YR, ZR), (xk, YR, ZR)], 0.014, 8))  # half shafts
    P.add('arms', merge(sus), 'frame' if spec.get('frame_paint', True) else 'chassis')
    P.add('shocks', merge(shocks), 'metal')

    # ---------------- engine + exhaust
    eng = [box((0.26, 0.36, 0.24), (0, (YF + YR) / 2 - 0.02, Z0 + 0.14)),
           cyl(0.075, 0.2, 18, loc=(0, (YF + YR) / 2 + 0.08, Z0 + 0.34))]
    for k in range(7):  # cooling fins
        eng.append(box((0.2, 0.17, 0.008), (0, (YF + YR) / 2 + 0.08, Z0 + 0.26 + k * 0.025)))
    eng.append(transform(lathe([(0, 0), (0.1, 0.0), (0.105, 0.02), (0.1, 0.05), (0, 0.06)], 22, axis='X'),
                         loc=(-0.13, (YF + YR) / 2 - 0.08, Z0 + 0.15)))   # stator cover
    P.add('engine', merge(eng), 'engine', 0.006)
    ex = tube_path([(0, (YF + YR) / 2 + 0.17, Z0 + 0.32), (0.06, (YF + YR) / 2 + 0.3, Z0 + 0.3), (0.16, (YF + YR) / 2 + 0.2, Z0 + 0.27),
                    (0.2, YR + 0.1, ZS - 0.17), (0.2, YR - 0.15, ZS - 0.15)], 0.022, 10, 0.06)
    P.add('header', ex, 'metal')
    muf = lathe([(0, 0), (0.05, 0), (0.06, 0.03), (0.06, 0.3), (0.05, 0.33), (0.025, 0.33), (0.025, 0.38), (0.0, 0.38)], 18, axis='Y')
    transform(muf, loc=(0.2, YR - 0.45, ZS - 0.15))
    P.add('muffler', muf, 'alloy' if spec.get('muffler', 'alloy') == 'alloy' else 'chrome', 0.004)

    # ---------------- plastics (one-piece front and rear fenders)
    def fender(yc, R, wz, hw, deck, front, ext=0.0):
        clear = max(R + 0.06, deck - 0.015 - wz)
        y0, y1 = yc - clear * 0.97, yc + clear * 0.97 + ext
        inner = 0.27
        def f(u, v):
            x = (u * 2 - 1) * hw
            y = y0 + (y1 - y0) * v
            ax = abs(x)
            dy = min(abs(y - yc), clear * 0.995)
            arc = wz + math.sqrt(clear ** 2 - dy ** 2)
            arc = max(arc, wz + 0.06)
            # deck in the middle, wheel arch outboard, smooth blend between
            t = min(1.0, max(0.0, (ax - inner) / 0.1))
            t = t * t * (3 - 2 * t)
            z = deck * (1 - t) + min(arc, deck) * t
            # the middle deck closes down at the ends too
            ev = max(0.0, (0.1 - min(v, 1 - v)) / 0.1)
            z -= (1 - t) * 0.1 * ev ** 1.5
            # rolled outer lip
            e = max(0.0, (ax - hw * 0.94) / (hw * 0.06))
            z -= 0.06 * e ** 2
            return Vector((x * (1 - 0.04 * ev), y, z))
        return kit.surface(f, 40, 40, 0.008, 2, 'plastic2', 'fender')
    hwf = TRK + WF * 0.5 + 0.02
    hwr = TRK + WR * 0.5 + 0.0
    deck_f = ZS - 0.12 + spec.get('hood_rise', 0.0)
    ff = fender(YF, RF, ZF, hwf, deck_f, True, spec.get('nose', 0.0))
    rf = fender(YR, RR, ZR, hwr, ZS - 0.15, False)
    P.add_obj(ff); P.add_obj(rf)
    # tank cover between the fenders and the seat
    def tank(u, v):
        a = math.pi * (u * 2 - 1) * 0.5
        y = YF - 0.42 - 0.35 * v
        w = 0.17 - 0.02 * v
        z = ZS - 0.14 + 0.09 * math.cos(a) * (1 - 0.25 * v) + 0.02 * v
        return Vector((w * math.sin(a), y, z))
    P.add_obj(kit.surface(tank, 16, 8, 0.01, 2, 'plastic2', 'tank'))
    # seat
    P.add_obj(kit.saddle(YR - 0.3, YF - 0.72, ZS - 0.02, ZS + 0.03, 0.3, 0.12))
    # radiator grille / hood vent
    P.add('vent', box((0.24, 0.12, 0.012), (0, YF - 0.16, deck_f + 0.004)), 'plastic', 0.003)

    # ---------------- handlebars (steer group)
    piv = Vector((0, YF - 0.12, ZS - 0.02))
    axis = Vector((0, -0.35, 1)).normalized()
    stem = tube_path([piv - axis * 0.3, piv + axis * 0.15], 0.018, 10)
    bar_z = piv.z + 0.17 + spec.get('bar_rise', 0.0)
    bar, grips = kit.handlebar(0, piv.y - 0.05, bar_z, 0.84, 0.05, 0.06, 0.012)
    clamp = box((0.08, 0.06, 0.05), (0, piv.y - 0.05, bar_z - 0.02))
    P.add('bar', merge([stem, bar]), 'chrome' if spec.get('bar_chrome') else 'alloy', steer=True)
    P.add('grips', grips, 'rubber', steer=True)
    P.add('clamp', clamp, 'plastic', 0.005, steer=True)
    if spec.get('handguards'):
        for sx in (1, -1):
            hg = tube_path([(sx * 0.3, piv.y - 0.08, bar_z + 0.03), (sx * 0.38, piv.y + 0.02, bar_z + 0.03), (sx * 0.43, piv.y - 0.06, bar_z + 0.02)],
                           0.03, 10, 0.06)
            transform(hg, scale=(1, 1, 0.5), loc=(0, 0, bar_z * 0.5))
            P.add('handguard', hg, 'plastic2', steer=True)
    if spec.get('lights') == 'bar':
        # headlight pod on the bars
        P.lamp(kit.round_light((0, piv.y + 0.04, bar_z - 0.04), 0.06, 0.07), steer=True)
        P.add('pod', box((0.24, 0.1, 0.11), (0, piv.y - 0.01, bar_z - 0.05)), 'plastic2', 0.02, steer=True)
    P.meta['steer_pivot'] = tuple(piv)
    P.meta['steer_axis'] = tuple(axis)

    # ---------------- lights
    if spec.get('lights', 'hood') in ('hood', 'bar'):
        for sx in (1, -1):
            P.lamp(kit.rect_light((sx * 0.12, YF + 0.36, deck_f - 0.04), 0.1, 0.05, 0.04, 1))
    if spec.get('pods'):
        for sx in (1, -1):
            P.lamp(kit.round_light((sx * 0.14, YF + 0.62, Z0 + 0.52), 0.065, 0.08))
        P.add('podbar', tube_path([(0.2, YF + 0.56, Z0 + 0.5), (-0.2, YF + 0.56, Z0 + 0.5)], 0.014, 8), 'chassis')
    P.lamp(kit.rect_light((0, YR - 0.43, ZS - 0.22), 0.14, 0.04, 0.03, -1), 'tail')

    # ---------------- racks, snorkels, extras
    if spec.get('racks'):
        for (y0, y1, z) in ((YF + 0.05, YF + 0.45, deck_f + 0.06), (YR - 0.4, YR + 0.1, ZS - 0.1)):
            rk = []
            hw = 0.36
            rk.append(tube_path([(hw, y0, z), (hw, y1, z), (-hw, y1, z), (-hw, y0, z), (hw, y0, z)], 0.012, 8, 0.04))
            for k in range(5):
                x = -hw + 2 * hw * (k + 0.5) / 5
                rk.append(tube_path([(x, y0, z), (x, y1, z)], 0.008, 6))
            for sx in (1, -1):
                rk.append(tube_path([(sx * 0.15, y0 + 0.05, z), (sx * 0.15, y0 + 0.05, z - 0.12)], 0.01, 6))
                rk.append(tube_path([(sx * 0.15, y1 - 0.05, z), (sx * 0.15, y1 - 0.05, z - 0.14)], 0.01, 6))
            P.add('rack', merge(rk), 'chassis')
    if spec.get('cargo'):
        # strapped jerry can on the rear rack
        jc = box((0.32, 0.16, 0.24), (0, YR - 0.15, ZS + 0.04))
        P.add('jerry', jc, 'frame', 0.02)
    if spec.get('winch'):
        P.add('winch', merge([cyl(0.045, 0.22, 16, loc=(0, YF + 0.56, Z0 + 0.25), axis='X'),
                              box((0.08, 0.08, 0.08), (0.14, YF + 0.56, Z0 + 0.25))]), 'chassis', 0.005)
    if spec.get('snorkel'):
        for sx, h in ((1, 0.32), (-1, 0.26)):
            P.add('snorkel', tube_path([(sx * 0.1, YF - 0.3, deck_f), (sx * 0.12, YF - 0.25, deck_f + h), (sx * 0.12, YF - 0.18, deck_f + h + 0.04)],
                                       0.022, 10, 0.05), 'plastic')
    if spec.get('skid', True):
        P.add('skid', box((0.38, 1.0, 0.008), (0, (YF + YR) / 2 + 0.12, Z0 - 0.025)), 'alloy', 0.004)
    if spec.get('flag'):
        P.add('whip', tube_path([(-0.2, YR - 0.42, ZS - 0.04), (-0.2, YR - 0.45, ZS + 1.4)], 0.005, 6), 'chassis')
        import bmesh
        fl = bmesh.new()
        vs = [fl.verts.new(v) for v in ((-0.2, YR - 0.45, ZS + 1.4), (-0.2, YR - 0.85, ZS + 1.32), (-0.2, YR - 0.45, ZS + 1.16))]
        fl.faces.new(vs)
        P.add('flag', fl, 'flag')
    if spec.get('front_plate', True):
        pl = kit.surface(lambda u, v: Vector(((u * 2 - 1) * 0.13, YF + 0.63 + 0.02 * v, Z0 + 0.36 + 0.2 * v - 0.015 * (u * 2 - 1) ** 2)),
                         6, 6, 0.006, 1, 'plastic2', 'plate')
        P.add_obj(pl)
        P.meta['decals'] = [{'img': 'plate', 'axis': 'front', 'c': (0.0, Z0 + 0.46), 'size': (0.22, 0.17), 'mat': 'plastic2', 'ymin': YF + 0.55}]
    else:
        P.meta['decals'] = []

    # livery hints
    P.meta['decals'] += [
        {'img': 'disc', 'axis': 'side', 'c': (YR - 0.05, ZS - 0.27), 'size': (0.2, 0.2), 'mat': 'plastic2', 'xmin': TRK},
        {'img': 'sponsor', 'axis': 'side', 'c': (YF - 0.02, deck_f - 0.13), 'size': (0.42, 0.105), 'mat': 'plastic2', 'xmin': TRK - 0.02},
        {'img': 'disc', 'axis': 'top', 'c': (0.0, YR - 0.25), 'size': (0.2, 0.2), 'mat': 'plastic2', 'zmin': ZS - 0.25},
    ]
    P.meta.update(height=ZS + 0.25, half_width=max(hwf, hwr), ymin=YR - 0.5, ymax=YF + 0.7, origin_z=round(Z0 + 0.25, 3),
                  zsplit=deck_f - 0.06, rocker=0.0)
    return P
