"""Builds the 'Ridgeline' trophy truck in Blender (bpy), bakes weathered PBR
textures and exports public/models/truck.glb.

    /opt/bpyenv/bin/python tools/truck/build.py [--preview out.png] [--nobake]

Modelling convention: Blender units = metres, ground at z = 0, truck faces +Y,
right side is +X. Export rotates 180 deg about Z so the truck faces glTF +Z.
"""
import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
import geo  # noqa: E402
from geo import link, TAU, box, cyl, lathe, loft, tube_path, merge, transform, mesh_obj, modifier, apply_all  # noqa: E402

HERE = os.path.dirname(__file__)
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'public', 'models'))

# key dimensions
WX = 1.02           # wheel centre |x|
WYF, WYR = 1.62, -1.55
WR = 0.50           # tyre radius
WZ = 0.50           # wheel centre height at ride height
TW = 0.38           # tyre width
ORIGIN_Z = 1.03     # physics body origin above the ground


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def smooth_bump(x, w):
    t = max(0.0, 1 - (x / w) ** 2)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ materials (preview / bake sources)
MATS = {}


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
    pmat('paint', (0.55, 0.16, 0.05), 0.35)
    pmat('paint2', (0.75, 0.72, 0.66), 0.4)     # white livery panels
    pmat('chassis', (0.04, 0.04, 0.045), 0.45, 0.6)
    pmat('metal', (0.35, 0.35, 0.36), 0.35, 1.0)
    pmat('plastic', (0.025, 0.025, 0.025), 0.6)
    pmat('rubber', (0.018, 0.018, 0.018), 0.85)
    pmat('rim', (0.42, 0.42, 0.44), 0.3, 1.0)
    pmat('glass', (0.02, 0.025, 0.03), 0.05, 0.0, alpha=0.45)
    pmat('lens', (0.9, 0.9, 0.9), 0.05, 0.0, alpha=0.3)
    pmat('lamp', (1, 0.95, 0.85), 0.2, 0, emit=(1, 0.93, 0.8))
    pmat('tail', (0.5, 0.02, 0.01), 0.2, 0, emit=(1, 0.05, 0.02))
    pmat('seat', (0.03, 0.03, 0.032), 0.7)
    pmat('flag', (0.95, 0.4, 0.02), 0.7)


# ------------------------------------------------------------------ body shell
def body_section(y):
    """Half cross-section (x, z) from bottom centre to top centre at station y."""
    hw = 0.98
    # fender flares bulge around both axles
    f = max(smooth_bump(y - WYF, 0.95), smooth_bump(y - WYR, 0.95))
    # nose taper
    nose = max(0.0, (y - 2.05) / 0.4)
    tail = max(0.0, (-2.45 - y) / 0.12)
    hw *= 1 - 0.035 * nose ** 2 - 0.04 * tail
    zb = 0.84 + 0.08 * nose ** 2 + 0.1 * max(0.0, (-2.3 - y) / 0.25)
    if y > 0.95:     # hood
        zt = 1.37 - (y - 0.95) * 0.05 - 0.03 * nose ** 2
    elif y > -0.45:  # cab base
        zt = 1.38
    else:            # bed rails
        zt = 1.42
    crown = 0.035 if y > 0.95 else 0.0
    bulge = 0.14 * f
    pts = [
        (0.0, zb), (hw * 0.6, zb), (hw - 0.07, zb + 0.005), (hw - 0.015, zb + 0.04),
        (hw + bulge * 0.4, zb + 0.13), (hw + bulge, zb + 0.27), (hw + bulge * 0.95, zb + 0.36),
        (hw + bulge * 0.35, zb + 0.43), (hw - 0.005, (zb + zt) / 2 + 0.12),
        (hw - 0.012, zt - 0.075), (hw - 0.035, zt - 0.02), (hw - 0.08, zt), (hw * 0.5, zt + crown * 0.8),
        (0.0, zt + crown),
    ]
    return pts


def section_loop(y, half):
    right = [Vector((x, y, z)) for x, z in half]
    left = [Vector((-x, y, z)) for x, z in reversed(half[1:-1])]
    return right + left


def round_ends(secs, front=(0.012, 0.02), back=(0.012, 0.02), scales=(0.9, 0.55)):
    """Add shrinking rings past each end so subdivision gives a rounded cap."""
    def shrunk(ring, k, dy):
        cz = sum(v.z for v in ring) / len(ring)
        return [Vector((v.x * k, v.y + dy, cz + (v.z - cz) * k)) for v in ring]
    head = [shrunk(secs[0], scales[1], -back[1]), shrunk(secs[0], scales[0], -back[0])]
    tail = [shrunk(secs[-1], scales[0], front[0]), shrunk(secs[-1], scales[1], front[1])]
    return head + secs + tail


def build_shell():
    stations = [-2.58, -2.55, -2.5, -2.4, -2.2, -1.95, -1.55, -1.15, -0.8, -0.5, -0.4, -0.2, 0.2,
                0.6, 0.9, 1.0, 1.2, 1.62, 2.0, 2.2, 2.35, 2.43, 2.47]
    secs = [section_loop(y, body_section(y)) for y in stations]
    bm = loft(round_ends(secs, front=(0.012, 0.02), back=(0.01, 0.016), scales=(0.985, 0.94)))
    caps = [f for f in bm.faces if len(f.verts) > 4]
    bmesh.ops.poke(bm, faces=caps)
    ob = mesh_obj('shell', bm, MATS['paint'])
    modifier(ob, 'SUBSURF', levels=2, render_levels=2)
    apply_all(ob)
    # wheel arches
    for wy in (WYF, WYR):
        c = mesh_obj('arch', cyl(0.655, 3.0, 64, loc=(0, wy, WZ + 0.1), axis='X'))
        geo.boolean(ob, c)
    # bed tub
    c = mesh_obj('bed', box((1.74, 1.98, 0.8), (0, -1.53, 1.0 + 0.4)))
    geo.boolean(ob, c)
    # panel gaps: door, hood, tailgate
    cutters = []
    for sx in (1, -1):
        frame = []
        y0, y1, z0, z1 = -0.36, 0.93, 0.98, 1.385
        g = 0.006
        frame += [box((0.2, g, z1 - z0), (sx * 1.0, y0, (z0 + z1) / 2)),
                  box((0.2, g, z1 - z0), (sx * 1.0, y1, (z0 + z1) / 2)),
                  box((0.2, y1 - y0, g), (sx * 1.0, (y0 + y1) / 2, z0))]
        cutters += frame
    cutters.append(box((1.9, 0.3, 0.006), (0, -2.5, 1.0)))            # tailgate lower gap
    for c in cutters:
        geo.boolean(ob, mesh_obj('gap', c))
    modifier(ob, 'WEIGHTED_NORMAL', keep_sharp=True, weight=50)
    apply_all(ob)
    return ob


def build_cab():
    def sec(y, ztop):
        rake = max(0.0, (y - 0.25) / 0.73)
        hwb, hwt = 0.95, 0.80 - 0.04 * rake
        zb = 1.30
        half = [(0.0, zb), (hwb, zb), (hwb - 0.005, 1.40), (hwb - 0.035, 1.55),
                (hwt + 0.04, ztop - 0.14), (hwt, ztop - 0.035), (hwt - 0.06, ztop), (0.3, ztop + 0.01), (0.0, ztop + 0.012)]
        return section_loop(y, half)
    st = [(-0.42, 1.96), (-0.40, 1.99), (-0.34, 2.02), (-0.1, 2.03), (0.2, 2.025), (0.3, 2.01), (0.42, 1.93),
          (0.6, 1.78), (0.78, 1.61), (0.93, 1.45), (0.99, 1.40)]
    bm = loft(round_ends([sec(y, z) for y, z in st], front=(0.005, 0.01), back=(0.01, 0.018), scales=(0.92, 0.6)))
    ob = mesh_obj('cab', bm, MATS['paint'])
    modifier(ob, 'SUBSURF', levels=2, render_levels=2)
    apply_all(ob)
    ob.data.materials.append(MATS['glass'])
    # window openings: assign glass and inset to create rubber-sealed frames
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    win = []
    for f in bm.faces:
        c = f.calc_center_median()
        n = f.normal
        if c.z < 1.47 or c.z > 1.995:
            continue
        side = abs(n.x) > 0.55 and -0.3 < c.y < 0.78 and c.z < 1.94 and not (0.08 < c.y < 0.16)
        front = n.y > 0.45 and abs(c.x) < 0.74 and c.z > 1.46
        rear = False
        if side or front or rear:
            win.append(f)
    res = bmesh.ops.inset_region(bm, faces=win, thickness=0.018, depth=-0.01, use_even_offset=True)
    for f in win:
        f.material_index = 1
    bm.to_mesh(ob.data)
    bm.free()
    ymin = min(v.co.y for v in ob.data.vertices if 1.6 < v.co.z < 1.9 and abs(v.co.x) < 0.5)
    loop = [Vector((x, ymin - 0.004, z)) for x, z in geo.rounded_rect(1.04, 0.3, 0.06, 4, 0, 1.76)]
    pane = bmesh.new()
    pane.faces.new([pane.verts.new(v) for v in reversed(loop)])
    fr = bmesh.new()
    fr.faces.new([fr.verts.new(v - Vector((0, 0.002, 0))) for v in [Vector((x, ymin, z)) for x, z in geo.rounded_rect(1.1, 0.36, 0.08, 4, 0, 1.76)]][::-1])
    mesh_obj('rear_seal', fr, MATS['rubber'])
    pane_ob = mesh_obj('rear_glass', pane, MATS['glass'])
    pane_ob.location.y -= 0.002
    return ob


# ------------------------------------------------------------------ chassis & suspension
def build_chassis():
    parts = []
    # frame rails and crossmembers
    for sx in (1, -1):
        parts.append(box((0.08, 4.6, 0.16), (sx * 0.48, -0.05, 0.74)))
    for y in (2.0, 1.2, 0.2, -0.8, -1.9, -2.3):
        parts.append(box((0.96, 0.08, 0.1), (0, y, 0.72)))
    # skid plate under the nose
    sk = box((1.3, 0.9, 0.02))
    transform(sk, rot=[('X', math.radians(14))], loc=(0, 2.1, 0.7))
    parts.append(sk)
    # engine sump / transmission block
    parts.append(box((0.6, 1.1, 0.3), (0, 1.35, 0.8)))
    # driveshaft
    parts.append(cyl(0.045, 2.7, 12, loc=(0, -0.1, 0.62), axis='Y'))
    # rear axle beam + diff
    parts.append(cyl(0.06, 1.9, 14, loc=(0, WYR, WZ), axis='X'))
    parts.append(transform(lathe([(0.0, -0.12), (0.12, -0.1), (0.17, 0.0), (0.12, 0.12), (0.0, 0.14)], 20, axis='Y'),
                           loc=(0, WYR, WZ)))
    chassis = mesh_obj('chassis', merge(parts), MATS['chassis'])
    geo.hard_surface(chassis, 0.008, 2)

    tubes = []
    # front A-arms (upper and lower) per side
    for sx in (1, -1):
        for zz, ln in ((0.42, 0.0), (0.72, 0.06)):
            p_in1 = (sx * 0.42, WYF + 0.28, zz + 0.05)
            p_in2 = (sx * 0.42, WYF - 0.32, zz + 0.05)
            p_out = (sx * (WX - 0.2 - ln), WYF, zz)
            tubes.append(tube_path([p_in1, p_out, p_in2], 0.028, 10, 0.05))
        # rear trailing arms
        tubes.append(tube_path([(sx * 0.5, -0.2, 0.7), (sx * 0.62, WYR + 0.05, WZ - 0.06)], 0.035, 10))
        tubes.append(tube_path([(sx * 0.4, -0.35, 0.86), (sx * 0.3, WYR + 0.1, WZ + 0.1)], 0.03, 10))
        # steering tie rod
        tubes.append(tube_path([(sx * 0.2, WYF + 0.15, 0.5), (sx * (WX - 0.22), WYF + 0.15, 0.48)], 0.016, 8))
    # front bumper (pre-runner tube bumper)
    tubes.append(tube_path([(-0.92, 2.36, 0.95), (-0.86, 2.58, 0.9), (0.86, 2.58, 0.9), (0.92, 2.36, 0.95)], 0.038, 12, 0.14))
    tubes.append(tube_path([(-0.6, 2.58, 0.9), (-0.55, 2.55, 0.62), (0.55, 2.55, 0.62), (0.6, 2.58, 0.9)], 0.032, 12, 0.1))
    for sx in (0.32, -0.32):
        tubes.append(tube_path([(sx, 2.58, 0.9), (sx, 2.48, 1.24), (sx, 2.2, 1.3)], 0.03, 10, 0.1))
    tubes.append(tube_path([(0.32, 2.48, 1.24), (-0.32, 2.48, 1.24)], 0.03, 10))
    # bed cage: from cab roof rear down to bed corners, with shock hoops
    for sx in (1, -1):
        tubes.append(tube_path([(sx * 0.72, -0.42, 1.96), (sx * 0.84, -1.0, 1.8), (sx * 0.9, -2.45, 1.45)], 0.034, 12, 0.25))
        tubes.append(tube_path([(sx * 0.84, -1.0, 1.8), (sx * 0.86, -1.0, 1.4)], 0.03, 10))
        tubes.append(tube_path([(sx * 0.88, -1.9, 1.62), (sx * 0.62, -1.75, 0.82)], 0.028, 10))
    tubes.append(tube_path([(0.84, -1.0, 1.8), (-0.84, -1.0, 1.8)], 0.03, 10))
    tubes.append(tube_path([(0.88, -2.44, 1.45), (-0.88, -2.44, 1.45)], 0.032, 10))
    tubes.append(tube_path([(0.84, -1.0, 1.8), (-0.88, -2.44, 1.45)], 0.026, 10))
    # rear bumper / tail tubes
    tubes.append(tube_path([(-0.95, -2.5, 1.0), (-0.9, -2.72, 0.95), (0.9, -2.72, 0.95), (0.95, -2.5, 1.0)], 0.036, 12, 0.15))
    # roof light bar
    tubes.append(tube_path([(-0.78, 0.12, 2.04), (-0.74, 0.32, 2.12), (0.74, 0.32, 2.12), (0.78, 0.12, 2.04)], 0.022, 10, 0.08))
    cage = mesh_obj('cage', merge(tubes), MATS['chassis'])

    # coilovers + bypass shocks
    shocks = []
    def shock(p0, p1, r=0.045, spring=True):
        a, b = Vector(p0), Vector(p1)
        d = b - a
        L = d.length
        body = lathe([(0.0, 0.0), (r * 0.5, 0.0), (r * 0.5, 0.05), (r, 0.07), (r, L * 0.6), (r * 1.1, L * 0.62),
                      (r * 1.1, L * 0.66), (r * 0.35, L * 0.67), (r * 0.35, L - 0.03), (r * 0.6, L - 0.02),
                      (r * 0.6, L), (0.0, L)], 16, axis='Z')
        parts = [body]
        if spring:
            parts.append(transform(geo.helix(r * 1.45, 0.011, L * 0.55, 7.5), loc=(0, 0, L * 0.3)))
        bm = merge(parts)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(bm, vec=a, verts=bm.verts)
        return bm
    for sx in (1, -1):
        shocks.append(shock((sx * (WX - 0.3), WYF, 0.5), (sx * 0.6, WYF - 0.05, 1.28)))
        shocks.append(shock((sx * (WX - 0.36), WYF + 0.12, 0.45), (sx * 0.62, WYF + 0.1, 1.2), 0.03, False))
        for k, dy in enumerate((-0.12, 0.08, 0.26)):
            shocks.append(shock((sx * 0.68, WYR + dy, WZ + 0.02), (sx * 0.82, -1.0 + dy * 0.6 - 0.15, 1.72), 0.04 if k != 1 else 0.032, k != 1))
    sh = mesh_obj('shocks', merge(shocks), MATS['metal'])
    return [chassis, cage, sh]


# ------------------------------------------------------------------ details
def build_details(NY=2.47):
    out = []
    # grille: recessed dark mesh with horizontal slats
    gr = [box((1.0, 0.03, 0.2), (0, NY - 0.008, 1.1))]
    for k in range(5):
        gr.append(box((0.96, 0.03, 0.014), (0, NY + 0.006, 1.02 + k * 0.04)))
    out.append(mesh_obj('grille', merge(gr), MATS['plastic']))
    # headlights: housing, reflector, lens, bulb
    for sx in (1, -1):
        hb = box((0.26, 0.06, 0.13), (sx * 0.68, NY - 0.02, 1.12))
        out.append(geo.hard_surface(mesh_obj('hl_house', hb, MATS['chassis']), 0.01, 2))
        out.append(mesh_obj('hl_lens', box((0.235, 0.012, 0.105), (sx * 0.68, NY + 0.012, 1.12)), MATS['lens']))
        out.append(mesh_obj('hl_lamp', cyl(0.04, 0.02, 16, loc=(sx * 0.68, NY + 0.004, 1.12), axis='Y'), MATS['lamp']))
        # tail lights
        out.append(mesh_obj('tail', box((0.07, 0.03, 0.22), (sx * 0.9, -2.585, 1.24)), MATS['tail']))
        # mirrors
        m = merge([box((0.04, 0.05, 0.03), (sx * 1.02, 0.86, 1.47)),
                   box((0.2, 0.06, 0.12), (sx * 1.13, 0.86, 1.52))])
        out.append(geo.hard_surface(mesh_obj('mirror', m, MATS['plastic']), 0.01, 2))
        # door handle
        out.append(geo.hard_surface(mesh_obj('handle', box((0.02, 0.14, 0.03), (sx * 0.985, -0.18, 1.3)), MATS['chassis']), 0.006, 2))
        # exhaust tips exiting before rear wheels
        out.append(mesh_obj('exhaust', lathe([(0.05, 0), (0.055, 0.0), (0.055, 0.3), (0.045, 0.3), (0.045, 0.02)], 16, axis='Y'),
                            MATS['metal']))
        transform_obj(out[-1], loc=(sx * 0.55, -2.6, 0.78))
        # mud flaps
        out.append(mesh_obj('flap', box((0.3, 0.015, 0.32), (sx * 1.0, WYR - 0.72, 0.62)), MATS['rubber']))
    # light bar pods
    pods = []
    for k in range(6):
        x = -0.6 + 0.24 * k
        pods.append(transform(lathe([(0.0, -0.06), (0.07, -0.06), (0.085, 0.0), (0.085, 0.03), (0.0, 0.035)], 20, axis='Y'),
                              loc=(x, 0.36, 2.14)))
    out.append(mesh_obj('pods', merge(pods), MATS['chassis']))
    lamps = [cyl(0.07, 0.01, 20, loc=(-0.6 + 0.24 * k, 0.392, 2.14), axis='Y') for k in range(6)]
    out.append(mesh_obj('podlamps', merge(lamps), MATS['lamp']))
    # spare tyres strapped in the bed
    out.append(mesh_obj('spare_strap', merge([box((0.05, 1.3, 0.012), (0.2, -1.62, 1.33)),
                                              box((0.05, 1.3, 0.012), (-0.2, -1.62, 1.33))]), MATS['seat']))
    # interior: seats, dash, steering wheel
    for sx in (0.42, -0.42):
        seat = merge([box((0.46, 0.5, 0.1), (sx, -0.05, 1.35)), box((0.46, 0.1, 0.7), (sx, -0.3, 1.65))])
        out.append(geo.hard_surface(mesh_obj('seat', seat, MATS['seat']), 0.04, 3))
    out.append(geo.hard_surface(mesh_obj('dash', box((1.6, 0.3, 0.12), (0, 0.6, 1.47)), MATS['plastic']), 0.03, 2))
    sw = lathe([(0.16, -0.012), (0.175, 0.0), (0.16, 0.012), (0.145, 0.0)], 32, axis='Y')
    transform(sw, rot=[('X', math.radians(-25))], loc=(0.42, 0.55, 1.62))
    out.append(mesh_obj('wheel_steer', sw, MATS['plastic']))
    # antenna + flag
    out.append(mesh_obj('antenna', tube_path([(-0.8, -2.42, 1.48), (-0.8, -2.45, 2.9)], 0.006, 6), MATS['chassis']))
    fl = bmesh.new()
    vs = [fl.verts.new(v) for v in ((-0.8, -2.45, 2.9), (-0.8, -2.85, 2.82), (-0.8, -2.45, 2.66))]
    fl.faces.new(vs)
    out.append(mesh_obj('flag', fl, MATS['flag']))
    return out


def transform_obj(ob, loc):
    ob.location = loc
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.select_set(False)


# ------------------------------------------------------------------ wheels
def build_tyre_and_rim(name, mirror=False):
    parts_t = []
    # carcass: rounded shoulders, bulging sidewall
    hw = TW / 2
    prof = []
    for k in range(0, 13):
        a = -math.pi / 2 + math.pi * k / 12
        prof.append((WR - 0.06 + 0.035 * math.cos(a) + 0.02 * math.cos(a) ** 8, hw * math.sin(a) * 1.0 + 0.0))
    side = [(0.28, -hw * 0.82), (0.33, -hw * 0.98), (0.40, -hw * 1.02)]
    prof = side + prof + [(0.40, hw * 1.02), (0.33, hw * 0.98), (0.28, hw * 0.82)]
    # profile tuple is (radius, axial). lathe expects (r, a)
    tyre = lathe(prof, 72, axis='X')
    parts_t.append(tyre)
    # tread lugs: two staggered rows plus shoulder blocks
    nlug = 34
    for k in range(nlug):
        ang = TAU * k / nlug
        for row, (ax, w, depth, ln) in enumerate(((-0.085, 0.15, 0.035, 0.085), (0.085, 0.15, 0.035, 0.085))):
            a2 = ang + (math.pi / nlug if row else 0)
            lug = box((w, ln, depth), (0, 0, 0))
            # chevron skew
            for v in lug.verts:
                v.co.y += v.co.x * (0.25 if row else -0.25)
            transform(lug, loc=(ax, 0, WR - 0.03 + depth / 2 - 0.002), rot=None)
            transform(lug, rot=[('X', a2)])
            parts_t.append(lug)
            # shoulder block wrapping onto the sidewall
            sh = box((0.045, ln * 0.8, 0.06), (0, 0, 0))
            transform(sh, loc=((hw - 0.005) * (1 if row else -1), 0, WR - 0.07))
            transform(sh, rot=[('X', a2)])
            parts_t.append(sh)
    tyre_bm = merge(parts_t)

    # rim: barrel, outer lip, beadlock ring with bolts, 8 spokes, hub
    rim = []
    rim.append(lathe([(0.23, -0.17), (0.25, -0.16), (0.235, -0.14), (0.225, 0.1), (0.25, 0.13), (0.255, 0.165),
                      (0.24, 0.17)], 56, axis='X'))
    rim.append(lathe([(0.205, 0.15), (0.262, 0.15), (0.27, 0.165), (0.262, 0.19), (0.205, 0.19), (0.2, 0.17)], 56, axis='X'))
    for k in range(24):
        a = TAU * k / 24
        b = cyl(0.009, 0.03, 8, axis='X', loc=(0.198, 0.235 * math.cos(a), 0.235 * math.sin(a)))
        rim.append(b)
    for k in range(8):
        a = TAU * k / 8
        sp = box((0.035, 0.15, 0.04), (0, 0, 0))
        for v in sp.verts:
            v.co.y *= 1 + 0.6 * (v.co.y > 0)
            v.co.x += -0.02 * (v.co.y / 0.12)
        transform(sp, loc=(0.13, 0, 0.13), rot=[('X', a)])
        rim.append(sp)
    rim.append(lathe([(0.0, 0.16), (0.075, 0.16), (0.085, 0.14), (0.085, 0.1), (0.06, 0.08)], 28, axis='X'))
    for k in range(8):
        a = TAU * k / 8
        rim.append(cyl(0.011, 0.025, 6, axis='X', loc=(0.165, 0.058 * math.cos(a), 0.058 * math.sin(a))))
    rim_bm = merge(rim)
    if mirror:
        for b in (tyre_bm, rim_bm):
            bmesh.ops.rotate(b, verts=b.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))
            bmesh.ops.reverse_faces(b, faces=b.faces) if False else None
    t = mesh_obj(name + '_tyre', tyre_bm, MATS['rubber'])
    r = mesh_obj(name + '_rim', rim_bm, MATS['rim'])
    geo.hard_surface(r, 0.004, 2, 35)
    return t, r


def build_wheels():
    wheels = []
    spots = {'wheel_FL': (-WX, WYF), 'wheel_FR': (WX, WYF), 'wheel_RL': (-WX, WYR), 'wheel_RR': (WX, WYR)}
    base_t, base_r = build_tyre_and_rim('w', mirror=False)
    apply_all(base_r)
    for name, (x, y) in spots.items():
        t = base_t.copy(); t.data = base_t.data.copy()
        r = base_r.copy(); r.data = base_r.data.copy()
        for o in (t, r):
            bpy.context.scene.collection.objects.link(o)
        if x < 0:
            for o in (t, r):
                o.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
        for o in (t, r):
            o.location = (x, y, WZ)
        wheels.append((name, t, r))
    # two spares lying flat in the bed
    spares = []
    for k, z in enumerate((1.19, 1.58)):
        for src in (base_t, base_r):
            o = src.copy(); o.data = src.data.copy()
            bpy.context.scene.collection.objects.link(o)
            o.data.transform(Matrix.Rotation(math.pi / 2 * (1 if k else -1), 4, 'Y'))
            o.location = (0, -1.62, z) if k == 0 else (0, -1.62, z - 0.0)
            spares.append(o)
    spares[2].location.z = 1.19 + TW + 0.005
    spares[3].location.z = 1.19 + TW + 0.005
    bpy.data.objects.remove(base_t, do_unlink=True)
    bpy.data.objects.remove(base_r, do_unlink=True)
    return wheels, spares


# ------------------------------------------------------------------ preview render
def preview(path, cam_loc=(5.2, 6.2, 2.4), target=(0, 0, 0.95), res=(960, 540), samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    sky = w.node_tree.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'
    except TypeError:
        pass
    sky.sun_elevation = math.radians(28)
    sky.sun_rotation = math.radians(200)
    w.node_tree.links.new(sky.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 0.25
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = (math.radians(55), 0, math.radians(200))
    link(sun)
    gp = mesh_obj('ground', box((60, 60, 0.02), (0, 0, -0.01)), pmat('ground', (0.12, 0.09, 0.07), 0.95))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    cam.location = cam_loc
    d = Vector(target) - Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    link(cam)
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (gp, cam, sun):
        bpy.data.objects.remove(o, do_unlink=True)


def build_all():
    reset()
    init_mats()
    shell = build_shell()
    cab = build_cab()
    chassis = build_chassis()
    ny = max(v.co.y for v in shell.data.vertices if 1.0 < v.co.z < 1.22 and abs(v.co.x) < 0.8)
    print('nose y', ny)
    details = build_details(ny)
    wheels, spares = build_wheels()
    return dict(shell=shell, cab=cab, chassis=chassis, details=details, wheels=wheels, spares=spares)


if __name__ == '__main__':
    args = sys.argv[1:]
    parts = build_all()
    if '--preview' in args:
        out = args[args.index('--preview') + 1]
        views = {
            'a': ((5.4, 6.4, 2.3), (0, 0.1, 0.95)),
            'b': ((-4.6, -7.0, 3.0), (0, -0.5, 1.0)),
            'c': ((7.5, 0.5, 1.2), (0, 0.2, 0.9)),
            'f': ((2.2, 6.0, 1.6), (0, 2.0, 1.1)),
        }
        v = args[args.index('--view') + 1] if '--view' in args else 'a'
        preview(out, *views[v])
