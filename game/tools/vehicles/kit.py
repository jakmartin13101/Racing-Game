"""Shared parts for the vehicle line-up: tyres, rims, coilovers, tube frames,
body panels, seats, lights and small hardware.

Same modelling convention as the truck: metres, ground at z = 0, vehicle faces
+Y, right side is +X. Wheel parts are built at the origin with the axle on X and
the outer face towards +X (left wheels are rotated 180 deg about Z).
"""
import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'truck'))
import geo  # noqa: E402
from geo import TAU, box, cyl, lathe, loft, tube_path, merge, transform, mesh_obj, modifier, apply_all  # noqa: E402,F401

MATS = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()


def pmat(name, color, rough=0.5, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 4.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    MATS[name] = m
    return m


def init_mats():
    # body-atlas materials: names match the weathering graphs in bake.py
    pmat('paint', (0.55, 0.16, 0.05), 0.35)       # livery-painted panels
    pmat('plastic2', (0.6, 0.6, 0.6), 0.45)       # moulded coloured plastics (ATV/bike bodywork)
    pmat('frame', (0.3, 0.05, 0.03), 0.35, 0.5)   # powder-coated tube frame (accent colour)
    pmat('chassis', (0.04, 0.04, 0.045), 0.45, 0.6)
    pmat('metal', (0.35, 0.35, 0.36), 0.35, 1.0)
    pmat('alloy', (0.6, 0.6, 0.62), 0.3, 1.0)     # brushed aluminium (swingarms, skid plates)
    pmat('chrome', (0.8, 0.8, 0.82), 0.12, 1.0)
    pmat('plastic', (0.025, 0.025, 0.025), 0.6)
    pmat('rubber', (0.018, 0.018, 0.018), 0.85)
    pmat('seat', (0.03, 0.03, 0.032), 0.7)
    pmat('canvas', (0.12, 0.11, 0.09), 0.9)       # soft tops, nets
    pmat('flag', (0.95, 0.4, 0.02), 0.7)
    pmat('tank', (0.6, 0.05, 0.02), 0.4)        # fuel cells / jugs
    pmat('engine', (0.12, 0.12, 0.125), 0.45, 0.8)
    pmat('rim', (0.42, 0.42, 0.44), 0.3, 1.0)
    # separate objects (not baked into the atlas)
    pmat('glass', (0.02, 0.025, 0.03), 0.05, 0.0, alpha=0.45)
    pmat('lens', (0.9, 0.9, 0.9), 0.05, 0.0, alpha=0.3)
    pmat('lamp', (1, 0.95, 0.85), 0.2, 0, emit=(1, 0.93, 0.8))
    pmat('tail', (0.5, 0.02, 0.01), 0.2, 0, emit=(1, 0.05, 0.02))
    pmat('amber', (0.6, 0.25, 0.0), 0.2, 0, emit=(1, 0.5, 0.05))


def obj(name, bm, mat, bevel=None, smooth=True):
    o = mesh_obj(name, bm, MATS[mat], smooth=smooth)
    if bevel:
        geo.hard_surface(o, bevel, 2)
    return o


def orient(bm, p0, p1):
    """Rotate a bmesh built along +Z (from z=0) so it runs from p0 to p1."""
    a, b = Vector(p0), Vector(p1)
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=a, verts=bm.verts)
    return bm


def mirror_x(pts):
    return [(-p[0], p[1], p[2]) for p in pts]


def both(fn):
    """Call fn(sx) for sx in (1, -1) and merge the bmeshes."""
    return merge([fn(1), fn(-1)])


# ------------------------------------------------------------------ tubes
def tubes(paths, r, segs=10, bend=0.06, mirror=False):
    """Several tube runs. paths: list of point lists (or (points, radius))."""
    out = []
    for p in paths:
        rr = r
        if isinstance(p, tuple) and len(p) == 2 and isinstance(p[1], float):
            p, rr = p
        out.append(tube_path(p, rr, segs, bend))
        if mirror:
            out.append(tube_path(mirror_x(p), rr, segs, bend))
    return merge(out)


def gusset(a, b, c, t=0.006):
    """Triangular plate between three points (welded gusset / tab)."""
    bm = bmesh.new()
    n = (Vector(b) - Vector(a)).cross(Vector(c) - Vector(a)).normalized() * t / 2
    v = [bm.verts.new(Vector(p) + n) for p in (a, b, c)] + [bm.verts.new(Vector(p) - n) for p in (a, b, c)]
    bm.faces.new(v[:3]); bm.faces.new(v[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((v[i], v[3 + i], v[3 + j], v[j]))
    bm.normal_update()
    return bm


# ------------------------------------------------------------------ suspension
def coilover(p0, p1, r=0.04, spring=True, reservoir=False, coils=7.0):
    L = (Vector(p1) - Vector(p0)).length
    body = lathe([(0.0, 0.0), (r * 0.55, 0.0), (r * 0.55, 0.04), (r, 0.06), (r, L * 0.58), (r * 1.12, L * 0.6),
                  (r * 1.12, L * 0.64), (r * 0.35, L * 0.65), (r * 0.35, L - 0.03), (r * 0.62, L - 0.02),
                  (r * 0.62, L), (0.0, L)], 16, axis='Z')
    parts = [body]
    if spring:
        parts.append(transform(geo.helix(r * 1.45, r * 0.24, L * 0.52, coils), loc=(0, 0, L * 0.32)))
        # spring perches
        parts.append(transform(lathe([(r * 0.9, 0), (r * 1.75, 0), (r * 1.75, 0.012), (r * 0.9, 0.012)], 16, axis='Z'),
                               loc=(0, 0, L * 0.3)))
    if reservoir:
        parts.append(transform(cyl(r * 0.8, L * 0.32, 14), loc=(r * 2.1, 0, L * 0.3)))
        parts.append(transform(cyl(r * 0.25, r * 2.0, 8, axis='X'), loc=(r * 1.05, 0, L * 0.44)))
    return orient(merge(parts), p0, p1)


def a_arm(inner_f, inner_r, outer, r=0.022):
    return merge([tube_path([inner_f, outer, inner_r], r, 10, 0.04),
                  transform(cyl(r * 1.6, r * 3, 12, axis='Y'), loc=inner_f),
                  transform(cyl(r * 1.6, r * 3, 12, axis='Y'), loc=inner_r),
                  transform(lathe([(0, -r * 1.5), (r * 1.7, -r * 1.5), (r * 1.9, 0), (r * 1.7, r * 1.5), (0, r * 1.5)], 14, axis='Z'), loc=outer)])


def knuckle(x, y, z, sx, R):
    """Upright/hub carrier with brake disc behind the rim."""
    parts = [transform(box((0.05, 0.08, R * 0.9)), loc=(x - sx * 0.02, y, z)),
             transform(cyl(R * 0.42, 0.012, 28, axis='X'), loc=(x + sx * 0.005, y, z)),
             transform(box((0.04, 0.07, 0.06)), loc=(x - sx * 0.005, y + 0.0, z + R * 0.38))]
    return merge(parts)


# ------------------------------------------------------------------ wheels
def tyre(R, W, Rr, style='knobby', nlug=None, depth=None):
    """Tyre at the origin, axle on X. R: outer radius, W: width, Rr: rim (bead) radius."""
    hw = W / 2
    d = depth if depth is not None else {'knobby': 0.032, 'at': 0.02, 'atv': 0.022, 'paddle': 0.0,
                                          'rib': 0.0, 'mx': 0.016, 'mt': 0.03, 'sand': 0.014}[style]
    crown = R - d
    round_ = {'mx': hw * 0.95, 'atv': hw * 0.55, 'rib': hw * 0.5, 'paddle': hw * 0.35}.get(style, min(hw * 0.32, (crown - Rr) * 0.35))
    prof = []
    side_h = crown - Rr
    prof += [(Rr - 0.004, -hw * 0.78), (Rr + side_h * 0.12, -hw * 0.9), (Rr + side_h * 0.45, -hw * 1.02)]
    n = 14
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        r = crown - round_ * (1 - math.cos(a)) ** 1.25
        x = hw * math.sin(a) * (1.0 if style != 'mx' else 0.98)
        prof.append((r, x))
    prof += [(Rr + side_h * 0.45, hw * 1.02), (Rr + side_h * 0.12, hw * 0.9), (Rr - 0.004, hw * 0.78)]
    # lathe expects (r, axial)
    parts = [lathe(prof, 72 if R > 0.3 else 60, axis='X')]

    def crown_at(xa):
        """radius and tilt of the crown at axial position xa"""
        s = max(-0.999, min(0.999, xa / hw))
        a = math.asin(s)
        return crown - round_ * (1 - math.cos(a)) ** 1.25, a

    def place(lug, xa, ang, tilt=True, lift=0.0):
        r, a = crown_at(xa)
        if tilt:
            transform(lug, rot=[('Y', a * 0.9)])
        transform(lug, loc=(xa, 0, r - 0.002 + lift))
        transform(lug, rot=[('X', ang)])
        parts.append(lug)

    if style in ('knobby', 'mt'):
        nl = nlug or int(TAU * R / 0.09)
        for k in range(nl):
            ang = TAU * k / nl
            for row in (0, 1):
                a2 = ang + (math.pi / nl if row else 0)
                w = hw * 0.78
                lug = box((w, TAU * R / nl * 0.52, d * 2), (0, 0, 0))
                for v in lug.verts:
                    v.co.y += v.co.x * (0.3 if row else -0.3)
                    v.co.z = max(v.co.z, 0)
                place(lug, (hw * 0.45) * (1 if row else -1), a2, tilt=False)
                sh = box((hw * 0.25, TAU * R / nl * 0.42, d * 2.2))
                for v in sh.verts:
                    v.co.z = max(v.co.z, 0)
                place(sh, (hw * 0.92) * (1 if row else -1), a2)
    elif style == 'at':
        nl = nlug or int(TAU * R / 0.07)
        for k in range(nl):
            ang = TAU * k / nl
            for j, xa in enumerate((-0.62, -0.2, 0.2, 0.62)):
                lug = box((hw * 0.34, TAU * R / nl * 0.6, d * 2))
                for v in lug.verts:
                    v.co.z = max(v.co.z, 0)
                    v.co.y += v.co.x * (0.4 if xa > 0 else -0.4)
                place(lug, xa * hw, ang + (math.pi / nl if j % 2 else 0))
            sh = box((hw * 0.2, TAU * R / nl * 0.45, d * 2))
            for v in sh.verts:
                v.co.z = max(v.co.z, 0)
            place(sh, hw * 0.93, ang)
            sh = box((hw * 0.2, TAU * R / nl * 0.45, d * 2))
            for v in sh.verts:
                v.co.z = max(v.co.z, 0)
            place(sh, -hw * 0.93, ang + math.pi / nl)
    elif style == 'atv':
        nl = nlug or int(TAU * R / 0.075)
        for k in range(nl):
            ang = TAU * k / nl
            for row in (0, 1):
                a2 = ang + (math.pi / nl if row else 0)
                for xa, ww in (((0.25, 0.4), (0.8, 0.32)) if row else ((-0.25, 0.4), (-0.8, 0.32))):
                    lug = box((hw * ww, TAU * R / nl * 0.48, d * 2))
                    for v in lug.verts:
                        v.co.z = max(v.co.z, 0)
                    place(lug, xa * hw, a2)
    elif style == 'paddle':
        nl = nlug or 12
        for k in range(nl):
            ang = TAU * k / nl
            pd = box((W * 0.98, 0.022, 0.06))
            for v in pd.verts:
                v.co.z = max(v.co.z, 0) * 0.9
                v.co.y += -abs(v.co.x) * 0.25   # shallow chevron scoop
            transform(pd, loc=(0, 0, crown - 0.012))
            transform(pd, rot=[('X', ang)])
            parts.append(pd)
    elif style == 'rib':
        for xa in (-0.5, 0.0, 0.5):
            r, _ = crown_at(xa * hw)
            parts.append(transform(lathe([(r - 0.004, -0.006), (r + 0.014, -0.002), (r + 0.014, 0.002), (r - 0.004, 0.006)], 60, axis='X'),
                                   loc=(xa * hw, 0, 0)))
    elif style == 'mx':
        nl = nlug or int(TAU * R / 0.05)
        for k in range(nl):
            ang = TAU * k / nl
            pattern = ((-0.15, 0.32), (0.55, 0.26)) if k % 2 else ((0.15, 0.32), (-0.55, 0.26), (0.92, 0.2), (-0.92, 0.2))
            for xa, ww in pattern:
                lug = box((hw * ww * 2 * 0.5, 0.026, d * 2))
                for v in lug.verts:
                    v.co.z = max(v.co.z, 0)
                place(lug, xa * hw, ang)
    elif style == 'sand':
        nl = nlug or int(TAU * R / 0.06)
        for k in range(nl):
            ang = TAU * k / nl
            lug = box((W * 0.7, 0.016, d * 2))
            for v in lug.verts:
                v.co.z = max(v.co.z, 0)
                v.co.y += abs(v.co.x) * 0.5
            place(lug, 0.0, ang, tilt=False)
    return merge(parts)


def rim(R_tyre, W, Rr, style='spoke5', spokes=None):
    """Rim at the origin, axle on X, face towards +X. Rr: bead radius."""
    hw = W / 2
    parts = []
    # barrel with inner and outer flanges
    parts.append(lathe([(Rr - 0.012, -hw * 0.85), (Rr + 0.012, -hw * 0.82), (Rr, -hw * 0.72), (Rr - 0.012, hw * 0.55),
                        (Rr + 0.004, hw * 0.72), (Rr + 0.014, hw * 0.84), (Rr - 0.004, hw * 0.88)], 56, axis='X'))
    face = hw * 0.62   # axial position of the spoke face
    hub = Rr * 0.32
    if style in ('beadlock', 'beadlock8'):
        n = spokes or 8
        parts.append(lathe([(Rr - 0.04, hw * 0.78), (Rr + 0.022, hw * 0.78), (Rr + 0.03, hw * 0.86), (Rr + 0.022, hw * 0.98),
                            (Rr - 0.04, hw * 0.98), (Rr - 0.045, hw * 0.88)], 56, axis='X'))
        nb = 16 if Rr < 0.2 else 24
        for k in range(nb):
            a = TAU * k / nb
            parts.append(cyl(0.006 if Rr < 0.2 else 0.009, 0.02, 8, axis='X',
                             loc=(hw * 1.0, (Rr - 0.012) * math.cos(a), (Rr - 0.012) * math.sin(a))))
        style = 'spoke'
    else:
        n = spokes or {'spoke5': 5, 'spoke6': 6, 'spoke8': 8, 'spoke10': 10, 'mesh': 12, 'steelie': 0, 'disc': 0}[style]
    if style in ('spoke', 'spoke5', 'spoke6', 'spoke8', 'spoke10', 'mesh'):
        for k in range(n):
            a = TAU * k / n
            ln = Rr - hub
            thick = 0.022 if style != 'mesh' else 0.012
            sp = box((0.03, ln, thick + Rr * 0.08))
            for v in sp.verts:
                t = (v.co.y / ln) + 0.5        # 0 at hub, 1 at rim
                v.co.z *= 1.0 - 0.45 * t        # taper towards the rim
                v.co.x -= 0.035 * t * (Rr / 0.25)  # dish
                if style == 'mesh':
                    v.co.z += (t - 0.5) * 0.05
            transform(sp, rot=[('X', math.pi / 2)], loc=(face, 0, hub + ln / 2))
            transform(sp, rot=[('X', a)])
            parts.append(sp)
        # face ring at the rim
        parts.append(lathe([(Rr - 0.03, face - 0.04), (Rr - 0.006, face - 0.03), (Rr - 0.006, face + 0.0), (Rr - 0.03, face - 0.005)], 56, axis='X'))
    elif style == 'steelie':
        # pressed steel dish with round vent holes (dark recesses) and a raised ring
        parts.append(lathe([(hub, face + 0.005), (Rr * 0.55, face - 0.004), (Rr * 0.62, face + 0.006), (Rr * 0.72, face + 0.0),
                            (Rr - 0.01, face - 0.05), (Rr - 0.004, face - 0.06)], 48, axis='X'))
        for k in range(8):
            a = TAU * k / 8 + TAU / 16
            parts.append(transform(lathe([(0.0, 0.0), (Rr * 0.09, 0.0), (Rr * 0.1, 0.006), (Rr * 0.09, 0.012)], 14, axis='X'),
                                   loc=(face - 0.005, Rr * 0.82 * math.cos(a) * 0.82, Rr * 0.82 * math.sin(a) * 0.82)))
    elif style == 'disc':
        parts.append(lathe([(hub, face + 0.01), (Rr * 0.7, face + 0.0), (Rr - 0.01, face - 0.03)], 48, axis='X'))
    # hub, centre cap and lug nuts
    parts.append(lathe([(0.0, face + 0.03), (hub * 0.75, face + 0.03), (hub, face + 0.01), (hub, face - 0.05), (hub * 0.6, face - 0.08)], 28, axis='X'))
    nl = 4 if Rr < 0.2 else 6
    for k in range(nl):
        a = TAU * k / nl
        parts.append(cyl(0.008 if Rr < 0.2 else 0.011, 0.025, 6, axis='X', loc=(face + 0.025, hub * 0.6 * math.cos(a), hub * 0.6 * math.sin(a))))
    return merge(parts)


def wire_wheel(R_tyre, W, Rr, nspokes=36, disc=True, sprocket=False):
    """Motorcycle wheel: hub, crossed wire spokes, channel rim, brake rotor (+X side) and sprocket (-X)."""
    hw = W / 2
    parts = []
    parts.append(lathe([(Rr - 0.006, -hw * 0.78), (Rr + 0.008, -hw * 0.75), (Rr - 0.004, -hw * 0.6), (Rr - 0.012, 0.0),
                        (Rr - 0.004, hw * 0.6), (Rr + 0.008, hw * 0.75), (Rr - 0.006, hw * 0.78), (Rr - 0.02, 0.0)], 64, axis='X'))
    hl = 0.07
    parts.append(lathe([(0.0, -hl), (0.022, -hl), (0.03, -hl + 0.01), (0.026, -0.02), (0.022, 0.0), (0.026, 0.02),
                        (0.03, hl - 0.01), (0.022, hl), (0.0, hl)], 24, axis='X'))
    for side in (-1, 1):
        parts.append(lathe([(0.02, side * (hl - 0.012)), (0.05, side * (hl - 0.012)), (0.05, side * (hl - 0.004)), (0.02, side * (hl - 0.004))],
                           24, axis='X'))
    for k in range(nspokes):
        side = 1 if k % 2 else -1
        a0 = TAU * k / nspokes
        lean = (1 if (k // 2) % 2 else -1) * 0.42
        p0 = Vector((side * (hl - 0.008), 0.048 * math.cos(a0), 0.048 * math.sin(a0)))
        a1 = a0 + lean
        p1 = Vector((side * 0.004, (Rr - 0.014) * math.cos(a1), (Rr - 0.014) * math.sin(a1)))
        parts.append(tube_path([p0, p1], 0.0022, 5, cap=False))
    if disc:
        ro = R_tyre * 0.42 if R_tyre > 0.3 else R_tyre * 0.5
        parts.append(lathe([(0.055, hl + 0.004), (ro, hl + 0.004), (ro, hl + 0.01), (0.055, hl + 0.01)], 48, axis='X'))
        for k in range(10):
            a = TAU * k / 10
            parts.append(cyl(0.008, 0.014, 8, axis='X', loc=(hl + 0.007, ro * 0.8 * math.cos(a), ro * 0.8 * math.sin(a))))
    if sprocket:
        rs = 0.115
        sp = [lathe([(0.05, -hl - 0.004), (rs, -hl - 0.004), (rs, -hl - 0.012), (0.05, -hl - 0.012)], 48, axis='X')]
        for k in range(48):
            a = TAU * k / 48
            sp.append(transform(box((0.008, 0.01, 0.012)), loc=(-hl - 0.008, (rs + 0.004) * math.cos(a), (rs + 0.004) * math.sin(a)),
                                rot=None))
        parts += sp
    return merge(parts)


# ------------------------------------------------------------------ surfaces
def surface(fn, nu, nv, thick=0.012, subd=2, mat='paint', name='panel', bevel=False, closed_u=False):
    """Open grid surface p = fn(u, v) for u, v in [0, 1], solidified and subdivided."""
    bm = bmesh.new()
    rows = []
    cu = nu if closed_u else nu + 1
    for j in range(nv + 1):
        rows.append([bm.verts.new(fn(i / nu, j / nv)) for i in range(cu)])
    for j in range(nv):
        for i in range(nu if closed_u else nu):
            i2 = (i + 1) % cu
            bm.faces.new((rows[j][i], rows[j][i2], rows[j + 1][i2], rows[j + 1][i]))
    bm.normal_update()
    o = mesh_obj(name, bm, MATS[mat])
    if thick:
        modifier(o, 'SOLIDIFY', thickness=thick, offset=-1.0, use_even_offset=True)
    if subd:
        modifier(o, 'SUBSURF', levels=subd, render_levels=subd)
    apply_all(o)
    return o


def smooth_bump(x, w):
    t = max(0.0, 1 - (x / w) ** 2)
    return t * t * (3 - 2 * t)


def section_loop(y, half):
    right = [Vector((x, y, z)) for x, z in half]
    left = [Vector((-x, y, z)) for x, z in reversed(half[1:-1])]
    return right + left


def round_ends(secs, front=(0.012, 0.02), back=(0.012, 0.02), scales=(0.9, 0.55)):
    def shrunk(ring, k, dy):
        cz = sum(v.z for v in ring) / len(ring)
        return [Vector((v.x * k, v.y + dy, cz + (v.z - cz) * k)) for v in ring]
    head = [shrunk(secs[0], scales[1], -back[1]), shrunk(secs[0], scales[0], -back[0])]
    tail = [shrunk(secs[-1], scales[0], front[0]), shrunk(secs[-1], scales[1], front[1])]
    return head + secs + tail


def shell(name, stations, half_fn, mat='paint', subd=2, ends=((0.01, 0.018), (0.01, 0.018), (0.96, 0.85))):
    """Closed lofted body from half sections half_fn(y) -> [(x, z)] bottom centre -> top centre."""
    secs = [section_loop(y, half_fn(y)) for y in stations]
    bm = loft(round_ends(secs, front=ends[0], back=ends[1], scales=ends[2]))
    caps = [f for f in bm.faces if len(f.verts) > 4]
    bmesh.ops.poke(bm, faces=caps)
    o = mesh_obj(name, bm, MATS[mat])
    if subd:
        modifier(o, 'SUBSURF', levels=subd, render_levels=subd)
        apply_all(o)
    return o


def cut(o, cutters):
    for c in cutters:
        geo.boolean(o, mesh_obj('cutter', c))
    return o


def finish(o):
    modifier(o, 'WEIGHTED_NORMAL', keep_sharp=True, weight=50)
    apply_all(o)
    return o


# ------------------------------------------------------------------ seats, controls
def bucket_seat(loc, w=0.5, cushion=0.48, back=0.72, recline=12, bolster=0.09, mat='seat', halo=False):
    """Lofted racing bucket: U-shaped sections swept along an L-shaped path (cushion -> backrest)."""
    x0, y0, z0 = loc
    path = []
    n1, n2 = 6, 9
    rc = math.radians(recline)
    for k in range(n1):           # cushion, front to back
        t = k / (n1 - 1)
        path.append((Vector((0, cushion * 0.5 - cushion * t, 0.0)), Vector((0, 0, 1))))
    for k in range(1, n2):        # backrest, bottom to top
        t = k / (n2 - 1)
        up = Vector((0, -math.sin(rc), math.cos(rc)))
        p = Vector((0, -cushion * 0.5, 0)) + up * back * t
        nrm = Vector((0, math.cos(rc), math.sin(rc)))
        path.append((p, nrm))
    secs = []
    for i, (p, nrm) in enumerate(path):
        t = i / (len(path) - 1)
        ww = w * (1.0 - 0.18 * max(0.0, (t - 0.55) / 0.45))
        b = bolster * (1.25 if 0.2 < t < 0.75 else 0.8)
        if i == 0:
            b *= 0.5
        prof = [(-ww / 2, b), (-ww / 2 + 0.04, b * 0.9), (-ww / 2 + 0.07, 0.015), (0, 0.0), (ww / 2 - 0.07, 0.015),
                (ww / 2 - 0.04, b * 0.9), (ww / 2, b), (ww / 2, -0.03), (0, -0.045), (-ww / 2, -0.03)]
        secs.append([Vector((x0 + x, y0 + p.y + nrm.y * h, z0 + p.z + nrm.z * h)) for x, h in prof])
    bm = loft(secs)
    o = mesh_obj('seat', bm, MATS[mat])
    modifier(o, 'SUBSURF', levels=2, render_levels=2)
    apply_all(o)
    return o


def saddle(y0, y1, z0, z1, w=0.26, h=0.1, mat='seat'):
    """Long motorcycle/ATV seat: lofted pad from y0 (rear) to y1 (front), top rising from z0 to z1."""
    secs = []
    n = 10
    for k in range(n + 1):
        t = k / n
        y = y0 + (y1 - y0) * t
        zt = z0 + (z1 - z0) * (t ** 1.6)
        ww = w * (0.75 + 0.25 * math.sin(math.pi * min(1, t * 1.3))) * (0.55 if t > 0.92 else 1.0)
        hb = zt - h
        half = [(0.0, hb), (ww * 0.42, hb), (ww * 0.5, hb + h * 0.4), (ww * 0.48, zt - h * 0.18), (ww * 0.36, zt - 0.005), (0.0, zt + 0.004)]
        secs.append(section_loop(y, half))
    bm = loft(round_ends(secs, front=(0.01, 0.02), back=(0.01, 0.02), scales=(0.9, 0.6)))
    caps = [f for f in bm.faces if len(f.verts) > 4]
    bmesh.ops.poke(bm, faces=caps)
    o = mesh_obj('saddle', bm, MATS[mat])
    modifier(o, 'SUBSURF', levels=2, render_levels=2)
    apply_all(o)
    return o


def steering_wheel(loc, r=0.17, tilt=-25, spokes=3):
    sw = [lathe([(r - 0.012, -0.014), (r, 0.0), (r - 0.012, 0.014), (r - 0.024, 0.0)], 32, axis='Y')]
    sw.append(lathe([(0.0, -0.03), (0.04, -0.03), (0.045, 0.0), (0.0, 0.01)], 16, axis='Y'))
    for k in range(spokes):
        a = math.pi / 2 + TAU * k / spokes + (math.pi / 2 if spokes == 3 else 0)
        sw.append(tube_path([(0.03 * math.cos(a), 0, 0.03 * math.sin(a)), ((r - 0.015) * math.cos(a), -0.012, (r - 0.015) * math.sin(a))], 0.009, 6))
    bm = merge(sw)
    transform(bm, rot=[('X', math.radians(tilt))], loc=loc)
    return bm


def handlebar(cx, y, z, width=0.8, rise=0.08, sweep=0.05, r=0.014):
    hw = width / 2
    pts = [(-hw, y - sweep, z + rise), (-hw * 0.55, y - sweep * 0.3, z + rise), (-hw * 0.3, y, z + rise * 0.3), (0, y, z),
           (hw * 0.3, y, z + rise * 0.3), (hw * 0.55, y - sweep * 0.3, z + rise), (hw, y - sweep, z + rise)]
    pts = [(cx + p[0], p[1], p[2]) for p in pts]
    bar = tube_path(pts, r, 10, 0.06)
    grips = []
    for sx in (1, -1):
        g = cyl(r * 1.9, 0.13, 14, axis='X', loc=(cx + sx * (hw - 0.065), y - sweep, z + rise))
        grips.append(g)
        # brake/clutch levers
        lv = tube_path([(cx + sx * (hw - 0.17), y - sweep + 0.01, z + rise), (cx + sx * (hw - 0.06), y - sweep + 0.07, z + rise - 0.01)],
                       0.006, 6)
        grips.append(lv)
        grips.append(transform(box((0.05, 0.035, 0.035)), loc=(cx + sx * (hw - 0.17), y - sweep + 0.005, z + rise)))
    return bar, merge(grips)


# ------------------------------------------------------------------ lights
def round_light(loc, r=0.09, depth=0.09, facing='Y', bucket='chassis'):
    """Returns (housing bm, lens bm, lamp bm). facing: '+Y' forward or '-Y' backward."""
    sgn = -1 if facing.startswith('-') else 1
    hb = lathe([(0.0, -depth), (r * 0.6, -depth), (r * 1.02, -depth * 0.35), (r * 1.08, 0.0), (r * 1.08, 0.012), (r * 0.94, 0.012),
                (r * 0.92, -0.01)], 28, axis='Y')
    ln = lathe([(0.0, 0.006), (r * 0.94, 0.0), (r * 0.94, -0.004), (0.0, 0.0)], 28, axis='Y')
    lp = lathe([(0.0, -depth * 0.5), (r * 0.85, -0.02), (r * 0.85, -0.03), (0.0, -depth * 0.55)], 28, axis='Y')
    out = []
    for b in (hb, ln, lp):
        if sgn < 0:
            transform(b, rot=[('Z', math.pi)])
        transform(b, loc=loc)
        out.append(b)
    return out


def rect_light(loc, w, h, depth=0.05, facing=1):
    hb = box((w + 0.02, depth, h + 0.02), (0, -facing * depth / 2, 0))
    ln = box((w, 0.008, h), (0, facing * 0.004, 0))
    lp = box((w * 0.94, 0.006, h * 0.8), (0, -facing * 0.004, 0))
    for b in (hb, ln, lp):
        transform(b, loc=loc)
    return hb, ln, lp


def light_bar(cx, y, z, width, h=0.07, facing=1, cells=None):
    """LED bar: housing + row of square emitters."""
    hb = box((width, 0.07, h), (cx, y - facing * 0.03, z))
    lens = box((width - 0.02, 0.006, h - 0.02), (cx, y + facing * 0.006, z))
    n = cells or max(4, int(width / 0.06))
    lp = merge([box(((width - 0.04) / n * 0.7, 0.004, h * 0.5), (cx - (width - 0.04) / 2 + (width - 0.04) / n * (k + 0.5), y, z))
                for k in range(n)])
    return hb, lens, lp


class Parts:
    """Collects objects by role for bake.py: body (atlas), glass, lights, wheels, steer."""
    def __init__(self):
        self.body, self.glass, self.lights, self.steer = [], [], [], []
        self.wheel_kinds = {}   # kind -> (tyre_obj, rim_obj) built at the origin
        self.spots = []         # (name, location, kind)
        self.meta = {}

    def add(self, name, bm, mat, bevel=None, smooth=True, steer=False):
        o = obj(name, bm, mat, bevel, smooth)
        (self.steer if steer else self.body).append(o)
        return o

    def wheel_kind(self, kind, tyre_bm, rim_bm):
        t = obj('tyre_' + kind, tyre_bm, 'rubber')
        r = obj('rim_' + kind, rim_bm, 'rim')
        geo.hard_surface(r, 0.003, 2, 35)
        self.wheel_kinds[kind] = (t, r)

    def spot(self, name, loc, kind, radius):
        self.spots.append((name, Vector(loc), kind))
        self.meta.setdefault('wheel_r', {})[name] = radius
        self.meta.setdefault('wheel_yz', []).append((loc[1], loc[2], radius))

    def add_obj(self, o, steer=False):
        (self.steer if steer else self.body).append(o)
        return o

    def lamp(self, trio, kind='lamp', steer=False, house='chassis'):
        hb, ln, lp = trio
        self.add('lamp_house', hb, house, 0.006, steer=steer)
        lo = obj('lens', ln, 'lens')
        la = obj('lamp', lp, kind)
        self.lights += [lo, la]
        if steer:
            self.meta.setdefault('steer_lights', []).extend([lo, la])
        return lo, la

    def glass_panel(self, bm):
        self.glass.append(obj('glass', bm, 'glass'))


def preview(path, cam_loc, target, res=(900, 600), samples=16, lens=50):
    """Quick untextured Cycles preview of the current scene (modelling checks)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.6, 0.75, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(210))
    sc.collection.objects.link(sun)
    gp = mesh_obj('ground', box((60, 60, 0.02), (0, 0, -0.01)), pmat('ground', (0.12, 0.1, 0.08), 0.95))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = lens
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (gp, cam, sun):
        bpy.data.objects.remove(o, do_unlink=True)
