"""Jeep (open-top 4x4 utility) builder: narrow hood with an upright grille, flat fenders,
open tub, solid axles front and rear.
Spec keys: lift, wheelbase, track, top ('soft', 'none', 'cage'), doors ('half', 'none'), grille ('bars', 'mesh'),
fenders ('flat', 'tube'), snorkel, winch, rack, cans, lightbar, ditch, tyres, rims, rf, wf."""
import math
import bpy
import bmesh
from mathutils import Vector
import kit
from kit import box, cyl, lathe, tube_path, merge, transform, Parts


def mirror_obj(o):
    o.scale.x = -1
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.flip_normals()
    return o


def build(spec):
    P = Parts()
    lift = spec.get('lift', 0.0)
    WB = spec.get('wheelbase', 2.42)
    TRK = spec.get('track', 1.6) / 2
    R = spec.get('rf', 0.42)
    W = spec.get('wf', 0.3)
    RRIM = spec.get('rrim', 0.215)
    YF, YR = WB * 0.5 - 0.05, -WB * 0.5 - 0.05
    ZW = R
    ZB = 0.66 + lift + (R - 0.42) * 0.6     # tub floor / body bottom
    ZS = ZB + 0.52                          # sill (tub top)
    ZH = ZB + 0.6                           # hood top
    YG = YF + 0.62                          # grille face
    YC = YF - 0.62                          # cowl
    YT = YR - 0.5                           # tail
    HB = 0.84                               # tub half width
    HH = 0.6                                # hood half width
    ts = spec.get('tyres', ('at', 'at'))[0]
    rs = spec.get('rims', 'steelie')

    P.wheel_kind('A', kit.tyre(R, W, RRIM, ts), kit.rim(R, W, RRIM, rs))
    for n, x, y in (('wheel_FL', -TRK, YF), ('wheel_FR', TRK, YF), ('wheel_RL', -TRK, YR), ('wheel_RR', TRK, YR)):
        P.spot(n, (x, y, ZW), 'A', R)

    # ---------------- hood
    def hood(y):
        t = max(0.0, (y - (YG - 0.12)) / 0.12)
        return [(0.0, ZB + 0.1), (HH - 0.03, ZB + 0.1), (HH, ZB + 0.14), (HH + 0.005, ZH - 0.06), (HH - 0.02, ZH - 0.01),
                (HH - 0.06, ZH + 0.005), (0.0, ZH + 0.025 - 0.01 * t)]
    hd = kit.shell('hood', [YC - 0.02, YC + 0.1, YF - 0.2, YF + 0.2, YG - 0.12, YG - 0.04, YG], hood, 'paint',
                   ends=((0.006, 0.01), (0.006, 0.01), (0.97, 0.9)))
    # panel gap around the bonnet lid + side louvres
    kit.cut(hd, [box((0.006, YG - YC - 0.1, 0.05), (sx * (HH - 0.05), (YG + YC) / 2, ZH + 0.01)) for sx in (1, -1)] +
            [box((HH * 2, 0.006, 0.05), (0, YC + 0.06, ZH + 0.01))] +
            [box((0.1, 0.012, 0.09), (sx * HH, YF - 0.05 + k * 0.05, ZH - 0.17)) for sx in (1, -1) for k in range(5)])
    kit.finish(hd)
    P.add_obj(hd)

    # ---------------- grille panel
    gw, gh = HH * 2 - 0.04, ZH - ZB - 0.08
    gz = ZB + 0.1 + gh / 2
    gp = box((gw, 0.04, gh), (0, YG + 0.005, gz))
    kit_cut = []
    style = spec.get('grille', 'bars')
    if style == 'bars':
        for k in range(5):
            kit_cut.append(box((gw * 0.52, 0.08, 0.035), (0, YG + 0.01, gz - gh * 0.32 + k * gh * 0.16)))
    else:
        kit_cut.append(box((gw * 0.52, 0.08, gh * 0.72), (0, YG + 0.01, gz)))
    for sx in (1, -1):
        kit_cut.append(cyl(0.1, 0.1, 28, loc=(sx * (gw * 0.37), YG + 0.01, gz + gh * 0.08), axis='Y'))
    go = kit.obj('grille', gp, 'paint')
    kit.cut(go, kit_cut)
    geo_bevel = kit.geo.hard_surface(go, 0.008, 2)
    P.add_obj(go)
    ins = [box((gw * 0.52, 0.01, (0.035 if style == 'bars' else gh * 0.72)), (0, YG - 0.01, 0))]
    if style == 'bars':
        P.add('grille_back', box((gw * 0.52, 0.01, gh * 0.8), (0, YG - 0.008, gz)), 'plastic')
    else:
        mesh = [box((gw * 0.52, 0.01, 0.008), (0, YG - 0.0, gz - gh * 0.36 + k * gh * 0.08)) for k in range(10)]
        mesh += [box((0.008, 0.01, gh * 0.72), (-gw * 0.26 + k * gw * 0.052, YG - 0.0, gz)) for k in range(11)]
        P.add('grille_mesh', merge(mesh), 'plastic')
        P.add('grille_back', box((gw * 0.52, 0.01, gh * 0.72), (0, YG - 0.02, gz)), 'chassis')
    for sx in (1, -1):
        P.lamp(kit.round_light((sx * (gw * 0.37), YG + 0.02, gz + gh * 0.08), 0.09, 0.1), house='chrome')
        P.lamp(kit.rect_light((sx * (gw * 0.37), YG + 0.03, gz - gh * 0.3), 0.08, 0.035, 0.02, 1), 'amber')

    # ---------------- tub
    def tub(y):
        t = max(0.0, (YT + 0.1 - y) / 0.1)
        return [(0.0, ZB), (HB - 0.04, ZB), (HB, ZB + 0.05), (HB + 0.008, (ZB + ZS) / 2), (HB, ZS - 0.03), (HB - 0.025, ZS + 0.005),
                (HB - 0.06, ZS + 0.01), (0.0, ZS + 0.01)]
    tb = kit.shell('tub', [YT, YT + 0.04, YT + 0.12, YR, YR + 0.6, YC - 0.4, YC - 0.05, YC], tub, 'paint',
                   ends=((0.004, 0.008), (0.006, 0.01), (0.985, 0.95)))
    cuts = [box((HB * 2 - 0.08, YC - YT - 0.08, 0.7), (0, (YC + YT) / 2, ZS + 0.3 - 0.4)),
            cyl(R + 0.08, 3.0, 64, loc=(0, YR, ZW + 0.04), axis='X')]
    cuts[0] = box((HB * 2 - 0.08, YC - YT - 0.08, ZS - ZB), (0, (YC + YT) / 2, ZB + 0.06 + (ZS - ZB) / 2))
    doors = spec.get('doors', 'half')
    if doors == 'none':
        cuts.append(box((0.3, YC - YR - 0.72, 0.4), (0, (YC + YR + 0.72) / 2 - 0.02, ZS - 0.1)))
        for sx in (1, -1):
            cuts.append(box((0.3, YC - YR - 0.72, 0.4), (sx * HB, (YC + YR + 0.72) / 2 - 0.02, ZS)))
        cuts = cuts[:2] + cuts[3:]
    else:
        for sx in (1, -1):   # door shut lines
            for y in (YC - 0.04, YR + 0.68):
                cuts.append(box((0.08, 0.006, ZS - ZB - 0.08), (sx * HB, y, (ZS + ZB) / 2 + 0.04)))
    kit.cut(tb, cuts)
    kit.finish(tb)
    P.add_obj(tb)
    # tailgate gap + handle
    P.add('handle', box((0.16, 0.02, 0.03), (0, YT - 0.012, ZS - 0.14)), 'chassis', 0.005)

    # ---------------- fenders
    def front_fender(u, v):
        # flat-topped arch over the front wheel, outboard of the hood, running back to the cowl step
        x = HH - 0.02 + (TRK + W * 0.5 + 0.06 - HH + 0.02) * u
        y = YC - 0.05 + (YG + 0.05 - YC + 0.05) * v
        dy = y - YF
        rr = R + 0.12 + lift * 0.15
        top = ZB + 0.42 + lift * 0.2
        if abs(dy) < rr:
            arc = ZW + math.sqrt(rr * rr - dy * dy)
        else:
            arc = ZW
        z = min(top, max(arc, ZB + 0.02))
        if y < YF - rr * 0.6:
            z = top                              # flat run back to the cowl
        z -= 0.03 * max(0.0, (u - 0.9) / 0.1) ** 2  # rolled outer edge
        return Vector((x, y, z))
    rear_rr = R + 0.12 + lift * 0.15

    def rear_flare(u, v):
        a = math.radians(-80 + 160 * v)
        x = HB - 0.01 + (TRK + W * 0.5 + 0.05 - HB + 0.01) * u
        r = rear_rr + 0.02 * u
        z = ZW + 0.04 + math.cos(a) * r
        return Vector((x, YR + math.sin(a) * r, min(z, ZS - 0.04) - 0.025 * max(0.0, (u - 0.85) / 0.15) ** 2))
    tube_f = spec.get('fenders', 'flat') == 'tube'
    for sx in (1, -1):
        if not tube_f:
            o = kit.surface(front_fender, 10, 34, 0.01, 2, 'paint', 'ffender')
            if sx < 0:
                mirror_obj(o)
            P.add_obj(o)
        else:
            rr = R + 0.12
            pts = [(sx * (TRK + 0.05), YF + rr * math.sin(math.radians(a)), ZW + rr * math.cos(math.radians(a))) for a in range(-70, 91, 20)]
            P.add('tube_fender', tube_path(pts + [(sx * (TRK + 0.05), YC + 0.1, ZB + 0.42)], 0.024, 10, 0.05), 'chassis')
            P.add('inner_fender', box((0.02, rr * 1.4, 0.3), (sx * (HH + 0.05), YF, ZB + 0.3)), 'chassis', 0.004)
        o = kit.surface(rear_flare, 6, 26, 0.012, 2, 'plastic', 'flare')
        if sx < 0:
            mirror_obj(o)
        P.add_obj(o)

    # ---------------- windscreen
    wy = YC - 0.04
    wt = ZS + 0.52
    rake = 0.12
    fr = []
    for sx in (1, -1):
        fr.append(box((0.05, 0.05, wt - ZS + 0.02), (sx * (HB - 0.06), wy - rake / 2, (wt + ZS) / 2)))
    fr.append(box((HB * 2 - 0.08, 0.06, 0.05), (0, wy - rake, wt)))
    fr.append(box((HB * 2 - 0.08, 0.07, 0.06), (0, wy + 0.01, ZS + 0.02)))
    wf = kit.obj('wframe', merge(fr), 'paint')
    for v in wf.data.vertices:          # rake it back
        v.co.y -= (v.co.z - ZS) / (wt - ZS) * rake * 0.5
    kit.geo.hard_surface(wf, 0.008, 2)
    P.add_obj(wf)
    P.glass_panel(kit.loft([[Vector((x, wy - 0.01 - rake * t, ZS + 0.05 + (wt - ZS - 0.08) * t)) for x in (HB - 0.09, -HB + 0.09)] for t in (0, 1)],
                           closed_sections=False, cap=False))
    for sx in (1, -1):
        P.add('wiper', tube_path([(sx * 0.2, wy + 0.02, ZS + 0.07), (sx * 0.45, wy - 0.02, ZS + 0.3)], 0.005, 6), 'chassis')
        P.add('mirror', merge([box((0.03, 0.03, 0.1), (sx * (HB + 0.03), wy - 0.04, ZS + 0.12)),
                               box((0.03, 0.12, 0.09), (sx * (HB + 0.1), wy - 0.06, ZS + 0.2))]), 'chassis', 0.005)

    # ---------------- sport bar / cage + top
    T = 0.03
    cg = []
    by = YR + 0.55
    zr = ZS + 0.85
    for sx in (1, -1):
        cg.append(tube_path([(sx * (HB - 0.06), by, ZB + 0.1), (sx * (HB - 0.08), by, zr), (sx * 0.4, by, zr + 0.02)], T, 10, 0.1))
        cg.append(tube_path([(sx * (HB - 0.08), by, zr - 0.02), (sx * (HB - 0.06), wy - rake, wt + 0.03)], T * 0.9, 10))
        cg.append(tube_path([(sx * (HB - 0.08), by, zr - 0.05), (sx * (HB - 0.07), YT + 0.15, ZS + 0.04)], T * 0.9, 10))
    cg.append(tube_path([(0.4, by, zr + 0.02), (-0.4, by, zr + 0.02)], T, 10))
    if spec.get('top') == 'cage':
        cg.append(tube_path([(HB - 0.07, YT + 0.15, zr - 0.02), (HB - 0.08, by, zr - 0.02)], T * 0.9, 10))
        cg.append(tube_path([(-HB + 0.07, YT + 0.15, zr - 0.02), (-HB + 0.08, by, zr - 0.02)], T * 0.9, 10))
        cg.append(tube_path([(HB - 0.07, YT + 0.15, zr - 0.02), (HB - 0.07, YT + 0.15, ZS + 0.04)], T * 0.9, 10))
        cg.append(tube_path([(-HB + 0.07, YT + 0.15, zr - 0.02), (-HB + 0.07, YT + 0.15, ZS + 0.04)], T * 0.9, 10))
        cg.append(tube_path([(HB - 0.07, YT + 0.15, zr - 0.02), (-HB + 0.07, YT + 0.15, zr - 0.02)], T * 0.9, 10))
    P.add('cage', merge(cg), 'chassis')
    if spec.get('top') == 'soft':
        def soft(u, v):
            x = (u * 2 - 1) * (HB - 0.04)
            y = wy - rake + 0.02 + (by - 0.22 - wy + rake) * v
            z = wt + 0.05 + (zr + 0.05 - wt) * v + 0.035 * (1 - (u * 2 - 1) ** 4) * math.sin(math.pi * v)
            return Vector((x, y, z))
        P.add_obj(kit.surface(soft, 16, 20, 0.01, 2, 'canvas', 'softtop'))
    if spec.get('rack'):
        rk = []
        hw = HB - 0.08
        y0, y1, z = wy - rake - 0.05, YT + 0.15, zr + 0.12
        rk.append(tube_path([(hw, y0, z), (hw, y1, z), (-hw, y1, z), (-hw, y0, z), (hw, y0, z)], 0.018, 8, 0.05))
        for k in range(6):
            y = y0 + (y1 - y0) * (k + 0.5) / 6
            rk.append(tube_path([(hw, y, z), (-hw, y, z)], 0.012, 6))
        for sx in (1, -1):
            for y in (y0 + 0.1, y1 - 0.1):
                rk.append(tube_path([(sx * hw, y, z), (sx * hw, y, zr if y < by + 0.3 else zr - 0.02)], 0.014, 6))
        P.add('rack', merge(rk), 'chassis')
        if spec.get('cans'):
            for k in range(3):
                P.add('can', box((0.16, 0.35, 0.47), (-0.3 + k * 0.3, (y0 + y1) / 2 - 0.2, z + 0.25)), 'frame', 0.02)

    # ---------------- interior
    for x in (0.38, -0.38):
        P.add_obj(kit.bucket_seat((x, YC - 0.55, ZB + 0.12), 0.48, 0.44, 0.62, 12, bolster=0.06))
    P.add_obj(kit.bucket_seat((0.0, YR + 0.3, ZB + 0.12), 1.3, 0.4, 0.5, 8, bolster=0.04))
    P.add('wheel', kit.steering_wheel((0.38, YC - 0.25, ZS + 0.1), 0.19, -28, 3), 'plastic')
    P.add('column', tube_path([(0.38, YC - 0.23, ZS + 0.08), (0.36, YC + 0.1, ZS - 0.12)], 0.022, 8), 'chassis')
    P.add('dash', box((HB * 2 - 0.1, 0.12, 0.16), (0, YC - 0.06, ZS - 0.04)), 'paint', 0.012)
    P.add('floorpan', box((HB * 2 - 0.1, YC - YT, 0.01), (0, (YC + YT) / 2, ZB + 0.07)), 'chassis')

    # ---------------- chassis + axles
    ch, ax = [], []
    for sx in (1, -1):
        ch.append(box((0.08, YG - YT + 0.2, 0.16), (sx * 0.48, (YG + YT) / 2, ZB - 0.02)))
    for y in (YG - 0.05, YF - 0.5, YR + 0.4, YT + 0.05):
        ch.append(box((0.96, 0.08, 0.1), (0, y, ZB - 0.03)))
    P.add('frame_rails', merge(ch), 'chassis', 0.006)
    for y in (YF, YR):
        ax.append(cyl(0.05, TRK * 2 - W * 0.4, 16, loc=(0, y, ZW), axis='X'))
        ax.append(transform(lathe([(0, -0.15), (0.13, -0.12), (0.17, 0), (0.13, 0.12), (0, 0.15)], 20, axis='Y'), loc=(0.15, y, ZW)))
        for sx in (1, -1):
            ax.append(kit.knuckle(sx * (TRK - W * 0.5 - 0.02), y, ZW, sx, RRIM))
            # coil spring + shock and two control links per side
            ax.append(kit.coilover((sx * 0.48, y, ZW + 0.05), (sx * 0.48, y + 0.02, ZB - 0.08), 0.05))
            ax.append(tube_path([(sx * 0.45, y + (0.0 if y > 0 else 0.0), ZW - 0.05), (sx * 0.44, y - math.copysign(0.75, y) * 1.0, ZB - 0.08)],
                                0.028, 8))
            ax.append(tube_path([(sx * 0.3, y, ZW + 0.12), (sx * 0.4, y - math.copysign(0.55, y), ZB - 0.05)], 0.022, 8))
        ax.append(cyl(0.035, YF - YR - 0.5, 12, loc=(0.15, (YF + YR) / 2, (ZW + ZB) / 2 - 0.02), axis='Y'))   # driveshaft
    ax.append(tube_path([(-(TRK - W * 0.5 - 0.06), YF - 0.14, ZW + 0.04), (TRK - W * 0.5 - 0.06, YF - 0.14, ZW + 0.04)], 0.02, 8))   # tie rod
    P.add('axles', merge(ax), 'chassis')
    if lift > 0.1:
        P.add('long_shocks', merge([kit.coilover((sx * 0.55, y + 0.1, ZW - 0.02), (sx * 0.56, y + 0.12, ZB + 0.2), 0.03, spring=False, reservoir=True)
                                    for sx in (1, -1) for y in (YF, YR)]), 'metal')

    # ---------------- bumpers, winch, spare, snorkel, lights
    bz = ZB + 0.06
    P.add('bumper_f', merge([box((HB * 2 + 0.1, 0.14, 0.16), (0, YG + 0.16, bz)), box((0.8, 0.1, 0.06), (0, YG + 0.16, bz - 0.12))]), 'chassis', 0.01)
    for sx in (1, -1):
        P.add('hook', tube_path([(sx * 0.62, YG + 0.22, bz + 0.05), (sx * 0.62, YG + 0.32, bz + 0.05), (sx * 0.62, YG + 0.32, bz - 0.05),
                                 (sx * 0.62, YG + 0.22, bz - 0.05)], 0.012, 8, 0.02), 'flag')
    if spec.get('winch', False):
        P.add('winch', merge([cyl(0.075, 0.42, 20, loc=(0, YG + 0.25, bz + 0.13), axis='X'),
                              box((0.16, 0.16, 0.16), (0.3, YG + 0.25, bz + 0.13)), box((0.16, 0.16, 0.16), (-0.3, YG + 0.25, bz + 0.13))]),
              'chassis', 0.008)
        P.add('fairlead', box((0.24, 0.03, 0.08), (0, YG + 0.33, bz + 0.13)), 'alloy', 0.005)
        P.add('hook_w', tube_path([(0, YG + 0.35, bz + 0.13), (0, YG + 0.4, bz + 0.13), (0, YG + 0.4, bz + 0.06)], 0.012, 6, 0.02), 'flag')
    P.add('bumper_r', box((HB * 2 + 0.06, 0.14, 0.15), (0, YT - 0.1, bz)), 'chassis', 0.01)
    t = kit.tyre(R, W, RRIM, ts)
    rr_ = kit.rim(R, W, RRIM, rs)
    for bm in (t, rr_):
        transform(bm, rot=[('Z', -1.5708)], loc=(0, YT - 0.18 - W * 0.5, ZS - 0.06))
    P.add('spare_t', t, 'rubber')
    P.add('spare_r', rr_, 'metal', 0.003)
    if spec.get('snorkel'):
        P.add('snorkel', tube_path([(HH + 0.25, YF - 0.2, ZB + 0.43), (HB + 0.04, YC + 0.06, ZB + 0.45), (HB + 0.05, wy - rake * 0.6, wt + 0.08),
                                    (HB + 0.04, wy - rake * 0.6 + 0.08, wt + 0.12)], 0.045, 12, 0.08), 'plastic')
    for sx in (1, -1):
        P.lamp(kit.rect_light((sx * (HB - 0.07), YT - 0.005, ZS - 0.2), 0.08, 0.14, 0.03, -1), 'tail')
    if spec.get('lightbar'):
        P.lamp(kit.light_bar(0, wy - rake + 0.04, wt + 0.1, HB * 1.7, 0.08))
    if spec.get('ditch'):
        for sx in (1, -1):
            P.lamp(kit.round_light((sx * (HB - 0.08), wy + 0.06, ZS + 0.12), 0.06, 0.07))

    P.meta['decals'] = [
        {'img': 'disc', 'axis': 'side', 'c': (YC - 0.4, (ZB + ZS) / 2 + 0.02), 'size': (0.34, 0.34), 'xmin': HB - 0.05},
        {'img': 'sponsor', 'axis': 'side', 'c': (YF - 0.08, ZH - 0.25), 'size': (0.6, 0.15), 'xmin': HH - 0.05},
        {'img': 'disc', 'axis': 'top', 'c': (0.0, YF + 0.05), 'size': (0.42, 0.42), 'zmin': ZH - 0.1},
    ]
    P.meta.update(height=zr + 0.2, half_width=TRK + W * 0.5 + 0.06, ymin=YT - 0.45, ymax=YG + 0.35, origin_z=round(ZB + 0.25, 3),
                  zsplit=(ZB + ZS) / 2 - 0.06, rocker=ZB + 0.05, band=(ZS - 0.17, ZS - 0.1))
    return P
