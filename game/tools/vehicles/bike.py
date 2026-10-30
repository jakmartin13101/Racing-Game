"""Dirt bike builder. Spec keys: style ('mx', 'enduro', 'rally', 'two', 'trials'), rake, wheelbase,
seat_h, lights, tower (rally fairing), tank ('std', 'big', 'tiny'), pipe ('four', 'two')."""
import math
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import box, cyl, lathe, tube_path, merge, transform, Parts


def build(spec):
    P = Parts()
    st = spec.get('style', 'mx')
    WB = spec.get('wheelbase', 1.48)
    RF, RR = spec.get('rf', 0.36), spec.get('rr', 0.35)
    WF, WR = spec.get('wf', 0.09), spec.get('wr', 0.12)
    YF, YR = WB * 0.5, -WB * 0.5
    ZF, ZR = RF, RR
    rake = math.radians(spec.get('rake', 27))
    HZ = spec.get('head_z', 1.0)
    head = Vector((0, YF - (HZ - ZF) * math.tan(rake) - 0.03, HZ))
    up = Vector((0, -math.sin(rake), math.cos(rake)))       # fork axis, pointing up/back
    SZ = spec.get('seat_h', 0.95)
    PIV = Vector((0, -0.14, 0.48))                           # swingarm pivot

    # ---------------- wheels
    P.wheel_kind('F', kit.tyre(RF, WF, RF - 0.085, spec.get('tyre_f', 'mx')), kit.wire_wheel(RF, WF, RF - 0.085, disc=True))
    P.wheel_kind('R', kit.tyre(RR, WR, RR - 0.11, spec.get('tyre_r', 'mx')), kit.wire_wheel(RR, WR, RR - 0.11, disc=True, sprocket=True))
    P.spot('wheel_F', (0, YF, ZF), 'F', RF)
    P.spot('wheel_R', (0, YR, ZR), 'R', RR)

    # ---------------- forks, clamps, bars, plate, fender (steer group)
    axle = Vector((0, YF, ZF))
    top = head + up * 0.16
    bot = head - up * 0.1
    fk = []
    for sx in (1, -1):
        o = Vector((sx * 0.085, 0, 0))
        low = axle + o + up * 0.06
        mid = axle + o + up * 0.42
        fk.append(('chrome', tube_path([low, mid], 0.021, 14)))
        fk.append(('alloy', tube_path([mid - up * 0.05, top + o], 0.028, 14)))
        fk.append(('alloy', transform(box((0.05, 0.07, 0.09)), loc=axle + o)))                 # axle lug
        # fork guard
        g = tube_path([axle + o + up * 0.08 + Vector((0, 0.022, 0)), mid + Vector((0, 0.03, 0))], 0.026, 10)
        transform(g, loc=(0, 0, 0))
        fk.append(('plastic2', g))
    # triple clamps
    for p in (top - up * 0.02, bot):
        cl = box((0.24, 0.08, 0.03))
        bm = cl
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-rake, 3, 'X'))
        transform(bm, loc=p + Vector((0, 0.01, 0)))
        fk.append(('alloy', bm))
    fk.append(('chassis', tube_path([bot, top], 0.026, 12)))
    bar_z = top.z + 0.07 + spec.get('bar_rise', 0.0)
    bar, grips = kit.handlebar(0, top.y - 0.04, bar_z, 0.8, 0.06, 0.05, 0.013)
    fk.append(('alloy', bar))
    fk.append(('rubber', grips))
    fk.append(('alloy', merge([box((0.06, 0.04, 0.06), (sx * 0.06, top.y - 0.03, top.z + 0.03)) for sx in (1, -1)])))
    if spec.get('handguards', True):
        for sx in (1, -1):
            hg = tube_path([(sx * 0.27, top.y - 0.06, bar_z + 0.05), (sx * 0.37, top.y + 0.05, bar_z + 0.05), (sx * 0.41, top.y - 0.03, bar_z + 0.04)],
                           0.028, 10, 0.06)
            fk.append(('plastic2', hg))
    # brake caliper
    fk.append(('alloy', transform(box((0.03, 0.08, 0.1)), loc=axle + Vector((0.11, -0.12, 0.08)))))
    for m, bm in fk:
        P.add('fork', bm, m, 0.004 if m == 'alloy' else None, steer=True)
    # front fender: under the bottom clamp, arcing over the tyre
    def ffender(u, v):
        a = math.radians(-40 + 120 * v)                # arc angle about the axle, 0 = straight up
        r = RF + 0.05 + 0.015 * math.sin(math.pi * v)
        w = 0.075 * (1 - 0.25 * v)
        x = (u * 2 - 1) * w
        y = YF + math.sin(a) * r + 0.0
        z = ZF + math.cos(a) * r - 0.02 * (u * 2 - 1) ** 2 + (0.0 if v > 0.3 else 0.0)
        return Vector((x, y, z))
    if st in ('mx', 'two', 'enduro', 'rally'):
        # high MX fender sits up under the clamps
        def hi(u, v):
            yy = -0.25 + 0.75 * v
            x = (u * 2 - 1) * 0.08 * (1 - 0.3 * v)
            y = bot.y + yy
            z = bot.z - 0.08 + 0.12 * yy + -0.05 * (yy + 0.25) ** 2 - 0.025 * (u * 2 - 1) ** 2
            return Vector((x, y, z))
        P.add_obj(kit.surface(hi, 8, 16, 0.006, 2, 'plastic2', 'ffender'), steer=True)
    else:
        P.add_obj(kit.surface(ffender, 8, 16, 0.006, 2, 'plastic2', 'ffender'), steer=True)
    # front number plate / headlight mask
    def plate(u, v):
        x = (u * 2 - 1) * 0.12 * (1 - 0.2 * v)
        p = head + Vector((0, 0.11, 0)) + up * (-0.15 + 0.32 * v)
        return Vector((x, p.y + 0.03 * (u * 2 - 1) ** 2 * -1 + 0.03, p.z))
    if not spec.get('tower'):
        P.add_obj(kit.surface(plate, 8, 8, 0.006, 2, 'plastic2', 'plate'), steer=True)
        P.meta['decals'] = [{'img': 'plate', 'axis': 'front', 'c': (0.0, head.z + 0.02), 'size': (0.2, 0.2), 'mat': 'plastic2', 'ymin': head.y + 0.05}]
        if spec.get('lights'):
            P.lamp(kit.round_light(tuple(head + Vector((0, 0.15, -0.08))), 0.05, 0.05), steer=True)
    else:
        P.meta['decals'] = []
    P.meta['steer_pivot'] = tuple(head)
    P.meta['steer_axis'] = tuple(up)

    # ---------------- frame
    fr = []
    for sx in (1, -1):
        x = sx * 0.1
        # main spars over the engine to the pivot
        fr.append(tube_path([head + Vector((sx * 0.03, -0.04, 0.03)), (x, head.y - 0.32, head.z - 0.12), (x * 1.1, PIV.y + 0.12, PIV.z + 0.3),
                             (x * 1.1, PIV.y, PIV.z)], 0.024, 10, 0.1))
        # lower cradle
        fr.append(tube_path([(x * 0.6, PIV.y + 0.62, 0.28), (x * 0.8, PIV.y + 0.1, 0.24), (x * 1.0, PIV.y - 0.02, PIV.z - 0.05)], 0.017, 10, 0.08))
        # subframe
        fr.append(tube_path([(x * 1.0, PIV.y + 0.05, PIV.z + 0.3), (x * 0.95, YR + 0.12, SZ - 0.09)], 0.014, 8))
        fr.append(tube_path([(x * 1.0, PIV.y - 0.02, PIV.z + 0.12), (x * 0.95, YR + 0.3, SZ - 0.12)], 0.012, 8))
    # down tube(s)
    fr.append(tube_path([head + Vector((0, 0.0, -0.06)), (0, head.y - 0.04, head.z - 0.3), (0, PIV.y + 0.62, 0.3)], 0.022, 10, 0.08))
    for x in (0.06, -0.06):
        fr.append(tube_path([(0, PIV.y + 0.62, 0.3), (x, PIV.y + 0.62, 0.28)], 0.017, 8))
    P.add('frame', merge(fr), 'frame')
    # skid plate
    P.add('skid', box((0.17, 0.42, 0.008), (0, PIV.y + 0.32, 0.22)), 'alloy', 0.004)

    # ---------------- engine
    ey = PIV.y + 0.3
    eng = [box((0.2, 0.36, 0.22), (0, ey, 0.38))]
    for sx in (1, -1):
        eng.append(transform(lathe([(0, 0), (0.12, 0), (0.125, 0.015), (0.11, 0.04), (0, 0.045)], 24, axis='X'),
                             loc=(sx * 0.1, ey - 0.04, 0.38), rot=None) if sx > 0 else
                   transform(lathe([(0, 0), (0.12, 0), (0.125, -0.015), (0.11, -0.04), (0, -0.045)], 24, axis='X'), loc=(-0.1, ey - 0.04, 0.38)))
    cyl_lean = math.radians(18)
    c = cyl(0.06, 0.2, 18)
    transform(c, rot=[('X', -cyl_lean)], loc=(0, ey + 0.1, 0.56))
    eng.append(c)
    if st in ('two',):
        for k in range(6):
            f = box((0.15, 0.15, 0.006))
            transform(f, rot=[('X', -cyl_lean)], loc=(0, ey + 0.1 + k * 0.006, 0.5 + k * 0.025))
            eng.append(f)
    else:
        hd = box((0.15, 0.16, 0.09))
        transform(hd, rot=[('X', -cyl_lean)], loc=(0, ey + 0.13, 0.68))
        eng.append(hd)
    P.add('engine', merge(eng), 'engine', 0.006)
    # radiators (behind the shrouds)
    for sx in (1, -1):
        rad = box((0.04, 0.12, 0.22))
        transform(rad, rot=[('X', -0.25)], loc=(sx * 0.12, head.y - 0.2, head.z - 0.27))
        P.add('radiator', rad, 'chassis', 0.004)
    # exhaust
    if spec.get('pipe', 'four') == 'two':
        ex = tube_path([(0, ey + 0.2, 0.6), (0, ey + 0.32, 0.5), (0.04, ey + 0.32, 0.3), (0.1, ey + 0.05, 0.27), (0.13, PIV.y - 0.05, 0.55),
                        (0.14, YR + 0.35, SZ - 0.18)], 0.026, 12, 0.08)
        P.add('pipe', ex, 'engine')
        # expansion chamber belly
        bell = lathe([(0.03, 0), (0.055, 0.08), (0.06, 0.2), (0.04, 0.32), (0.025, 0.36)], 16, axis='Y')
        transform(bell, rot=[('X', -0.2)], loc=(0.06, ey + 0.22, 0.29))
        P.add('chamber', bell, 'engine')
        sil = lathe([(0, 0), (0.035, 0), (0.04, 0.02), (0.04, 0.3), (0.03, 0.32), (0.0, 0.32)], 16, axis='Y')
        transform(sil, rot=[('X', -0.28)], loc=(0.15, YR - 0.02, SZ - 0.28))
        P.add('silencer', sil, 'alloy', 0.003)
    else:
        ex = tube_path([(0, ey + 0.2, 0.6), (0.02, ey + 0.32, 0.5), (0.1, ey + 0.2, 0.42), (0.13, PIV.y + 0.08, 0.5), (0.15, YR + 0.42, SZ - 0.2)],
                       0.019, 10, 0.07)
        P.add('header', ex, 'metal')
        sil = lathe([(0, 0), (0.025, 0), (0.025, 0.02), (0.05, 0.05), (0.052, 0.38), (0.045, 0.4), (0.02, 0.4), (0.02, 0.43), (0, 0.43)],
                    18, axis='Y')
        transform(sil, rot=[('X', -0.3)], loc=(0.16, YR + 0.05, SZ - 0.32))
        P.add('silencer', sil, 'alloy', 0.003)

    # ---------------- swingarm + shock
    sa = []
    for sx in (1, -1):
        arm = kit.loft([[Vector((sx * 0.11 + dx, PIV.y + (YR - PIV.y) * t, PIV.z + (ZR - PIV.z) * t + dz))
                         for dx, dz in ((-0.014, -0.04 + 0.015 * t), (0.014, -0.04 + 0.015 * t), (0.014, 0.04 - 0.015 * t), (-0.014, 0.04 - 0.015 * t))]
                        for t in (0.0, 0.3, 0.7, 1.03)])
        sa.append(arm)
    sa.append(box((0.24, 0.07, 0.07), (0, PIV.y - 0.07, PIV.z)))
    sa.append(cyl(0.02, 0.28, 12, loc=(0, YR, ZR), axis='X'))
    P.add('swingarm', merge(sa), 'alloy', 0.005)
    P.add('shock', kit.coilover((0, PIV.y - 0.12, PIV.z - 0.02), (0, PIV.y + 0.05, SZ - 0.1), 0.03, reservoir=True), 'metal')
    chain = tube_path([(-0.07, YR, ZR + 0.115), (-0.07, PIV.y + 0.12, PIV.z + 0.04), (-0.07, PIV.y + 0.12, PIV.z - 0.04), (-0.07, YR, ZR - 0.115)],
                      0.006, 6, 0.04)
    P.add('chain', chain, 'metal')
    # pegs, brake pedal, kickstand
    for sx in (1, -1):
        P.add('peg', box((0.08, 0.05, 0.02), (sx * 0.17, PIV.y + 0.02, 0.36)), 'metal', 0.004)
    P.add('pedal', tube_path([(0.14, PIV.y + 0.02, 0.38), (0.15, PIV.y + 0.22, 0.34), (0.15, PIV.y + 0.26, 0.37)], 0.008, 6), 'metal')
    P.add('stand', tube_path([(-0.12, PIV.y - 0.02, 0.4), (-0.24, PIV.y - 0.3, 0.12)], 0.012, 8), 'chassis')

    # ---------------- bodywork
    tank = spec.get('tank', 'std')
    if st != 'trials':
        tl = {'std': 0.42, 'big': 0.5, 'tiny': 0.3}[tank]
        tw = {'std': 0.13, 'big': 0.2, 'tiny': 0.1}[tank]
        th = {'std': 0.13, 'big': 0.2, 'tiny': 0.09}[tank]

        def tankf(u, v):
            a = math.pi * (u * 2 - 1) * 0.55
            y = head.y - 0.06 - tl * v
            w = tw * (1 - 0.3 * v ** 2)
            z = head.z - 0.04 - 0.08 * v + th * math.cos(a) * (1 - 0.3 * v) - th * 0.65
            return Vector((w * math.sin(a), y, z))
        P.add_obj(kit.surface(tankf, 18, 10, 0.012, 2, 'plastic2', 'tank'))
        # radiator shrouds: big swept side panels
        for sx in (1, -1):
            def shroud(u, v, sx=sx):
                y = head.y + 0.04 - (0.42 + (0.1 if tank == 'big' else 0)) * u
                zt = head.z - 0.02 - 0.12 * u
                zb = head.z - 0.42 + 0.12 * u * u
                z = zb + (zt - zb) * v
                x = sx * (0.16 + 0.04 * math.sin(math.pi * v) + 0.03 * (1 - u))
                return Vector((x, y, z))
            P.add_obj(kit.surface(shroud, 14, 10, 0.006, 2, 'plastic2', 'shroud'))
        # seat: long, flat
        P.add_obj(kit.saddle(YR + 0.12, head.y - 0.3, SZ - 0.02, SZ + 0.02, 0.24, 0.11))
        # side panels (number boards)
        for sx in (1, -1):
            def sidep(u, v, sx=sx):
                y = YR + 0.15 + 0.4 * u
                z = SZ - 0.1 - 0.24 * v + 0.07 * u * v
                return Vector((sx * (0.13 + 0.015 * math.sin(math.pi * u)), y, z))
            P.add_obj(kit.surface(sidep, 10, 8, 0.006, 2, 'plastic2', 'sidepanel'))
        P.meta['decals'] += [{'img': 'plate', 'axis': 'side', 'c': (YR + 0.36, SZ - 0.21), 'size': (0.22, 0.17), 'mat': 'plastic2', 'xmin': 0.12},
                             {'img': 'sponsor', 'axis': 'side', 'c': (head.y - 0.24, head.z - 0.24), 'size': (0.34, 0.085), 'mat': 'plastic2',
                              'xmin': 0.15}]
    else:
        # trials: tiny tank/seat pad, no real seat
        P.add_obj(kit.saddle(PIV.y - 0.05, head.y - 0.2, head.z - 0.12, head.z - 0.1, 0.18, 0.09, mat='plastic2'))
        P.meta['decals'] += [{'img': 'sponsor', 'axis': 'side', 'c': (head.y - 0.26, head.z - 0.17), 'size': (0.3, 0.075), 'mat': 'plastic2',
                              'xmin': 0.07}]
    # rear fender: long, flicked up
    def rfender(u, v):
        x = (u * 2 - 1) * (0.11 - 0.03 * v)
        y = YR + 0.25 - 0.75 * v
        z = SZ - 0.06 + 0.12 * v ** 1.5 - 0.03 * (u * 2 - 1) ** 2 - (0.12 if st == 'trials' else 0.0)
        return Vector((x, y, z))
    if st != 'trials' or True:
        P.add_obj(kit.surface(rfender, 8, 14, 0.006, 2, 'plastic2', 'rfender'))
    P.lamp(kit.rect_light((0, YR - 0.38, SZ + 0.02 - (0.12 if st == 'trials' else 0)), 0.07, 0.03, 0.02, -1), 'tail')

    # ---------------- rally tower: fairing with screen, nav, twin lights, big tanks
    if spec.get('tower'):
        tw0 = head + Vector((0, 0.16, 0.0))
        def fair(u, v):
            a = math.pi * (u * 2 - 1) * 0.5
            y = tw0.y - 0.05 * v + 0.05 * math.cos(a)
            z = tw0.z - 0.22 + 0.42 * v
            return Vector((0.17 * math.sin(a) * (1 - 0.25 * v), y, z))
        P.add_obj(kit.surface(fair, 14, 10, 0.008, 2, 'plastic2', 'fairing'))
        scr = kit.surface(lambda u, v: Vector(((u * 2 - 1) * 0.15 * (1 - 0.2 * v), tw0.y - 0.05 - 0.09 * v, tw0.z + 0.2 + 0.18 * v)), 6, 6, 0.004, 1, 'glass', 'screen')
        P.glass.append(scr)
        for sx in (1, -1):
            P.lamp(kit.round_light((sx * 0.06, tw0.y + 0.05, tw0.z - 0.02), 0.055, 0.06))
        P.add('roadbook', box((0.2, 0.14, 0.06), (0, head.y + 0.02, head.z + 0.16)), 'plastic', 0.01)
        P.meta['decals'] += [{'img': 'disc', 'axis': 'front', 'c': (0.0, tw0.z + 0.12), 'size': (0.12, 0.12), 'mat': 'plastic2', 'ymin': head.y + 0.1}]
    if spec.get('flag'):
        P.add('whip', tube_path([(-0.08, YR - 0.2, SZ + 0.02), (-0.08, YR - 0.24, SZ + 1.3)], 0.005, 6), 'chassis')
        fl = bmesh.new()
        vs = [fl.verts.new(v) for v in ((-0.08, YR - 0.24, SZ + 1.3), (-0.08, YR - 0.62, SZ + 1.22), (-0.08, YR - 0.24, SZ + 1.06))]
        fl.faces.new(vs)
        P.add('flag', fl, 'flag')

    P.meta.update(height=head.z + 0.25, half_width=0.42, ymin=YR - RR - 0.05, ymax=YF + RF + 0.05, origin_z=0.6, zsplit=head.z - 0.2,
                  rocker=0.0)
    return P
