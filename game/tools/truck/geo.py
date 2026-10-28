"""Geometry helpers for building hard-surface vehicle parts with bpy/bmesh."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

TAU = math.pi * 2


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_obj(name, bm, mat=None, smooth=True, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    if mat is not None:
        ob.data.materials.append(mat)
    return link(ob, coll)


def modifier(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError as e:
            print('modifier failed', ob.name, m.name, e)
            ob.modifiers.remove(m)


def hard_surface(ob, width=0.012, segs=3, angle=40, weighted=True):
    """Bevel + weighted normals: the standard game-art hard-surface finish."""
    b = modifier(ob, 'BEVEL', width=width, segments=segs, limit_method='ANGLE',
                 angle_limit=math.radians(angle), harden_normals=False)
    b.miter_outer = 'MITER_ARC'
    if weighted:
        w = modifier(ob, 'WEIGHTED_NORMAL', keep_sharp=True, weight=50)
    return ob


def loft(sections, closed_sections=True, cap=True):
    """Bridge a list of loops (each a list of Vector) into a skinned mesh."""
    bm = bmesh.new()
    rings = []
    for loop in sections:
        rings.append([bm.verts.new(v) for v in loop])
    n = len(rings[0])
    for a, b in zip(rings[:-1], rings[1:]):
        rng = range(n) if closed_sections else range(n - 1)
        for i in rng:
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap and closed_sections:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lathe(profile, segs=48, axis='X', start=0.0, end=TAU, cap=False):
    """Revolve a 2D profile [(r, a)] around an axis. a = position along axis."""
    bm = bmesh.new()
    rings = []
    full = abs(end - start - TAU) < 1e-6
    count = segs if full else segs + 1
    for k in range(count):
        t = start + (end - start) * k / segs
        c, s = math.cos(t), math.sin(t)
        ring = []
        for r, a in profile:
            if axis == 'X':
                ring.append(bm.verts.new((a, r * c, r * s)))
            elif axis == 'Y':
                ring.append(bm.verts.new((r * c, a, r * s)))
            else:
                ring.append(bm.verts.new((r * c, r * s, a)))
        rings.append(ring)
    m = len(profile)
    pairs = list(zip(rings, rings[1:] + ([rings[0]] if full else [])))
    for ra, rb in pairs:
        for i in range(m - 1):
            try:
                bm.faces.new((ra[i], ra[i + 1], rb[i + 1], rb[i]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def box(size, loc=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def cyl(r, depth, segs=24, loc=(0, 0, 0), axis='Z', r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth)
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def tube_path(points, radius, segs=10, smooth_corners=0.0, cap=True):
    """Sweep a circle along a polyline. Optional rounded corners (bend radius)."""
    pts = [Vector(p) for p in points]
    if smooth_corners > 0 and len(pts) > 2:
        out = [pts[0]]
        for i in range(1, len(pts) - 1):
            a, b, c = pts[i - 1], pts[i], pts[i + 1]
            d1 = (b - a).normalized()
            d2 = (c - b).normalized()
            r = min(smooth_corners, (b - a).length * 0.45, (c - b).length * 0.45)
            p0 = b - d1 * r
            p1 = b + d2 * r
            for k in range(7):
                t = k / 6
                out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1)
        out.append(pts[-1])
        pts = out
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        if i == 0:
            t = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            t = (pts[-1] - pts[-2]).normalized()
        else:
            t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = t.cross(ref).normalized()
        else:
            n = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = n
        bnorm = t.cross(n)
        ring = []
        for k in range(segs):
            a = TAU * k / segs
            ring.append(bm.verts.new(p + (n * math.cos(a) + bnorm * math.sin(a)) * radius))
        rings.append(ring)
    for ra, rb in zip(rings[:-1], rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((ra[k], ra[j], rb[j], rb[k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bm.normal_update()
    return bm


def helix(radius, wire, length, turns, segs=12, axis_pts=None):
    pts = []
    n = int(turns * 24)
    for i in range(n + 1):
        t = i / n
        a = TAU * turns * t
        pts.append((radius * math.cos(a), radius * math.sin(a), length * t))
    return tube_path(pts, wire, segs=8)


def merge(bms):
    """Combine several bmeshes into one."""
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
        b.free()
    return out


def transform(bm, loc=(0, 0, 0), rot=None, scale=None):
    if scale is not None:
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    if rot is not None:
        for axis, ang in rot:
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, axis))
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('bool', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    m.solver = 'EXACT'
    apply_all(ob)
    bpy.data.objects.remove(cutter, do_unlink=True)


def rounded_rect(w, h, r, n=4, cx=0.0, cz=0.0):
    """Closed loop of a rounded rectangle in XZ, counter-clockwise."""
    pts = []
    for cxs, czs, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox = cx + cxs * (w / 2 - r)
        oz = cz + czs * (h / 2 - r)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((ox + r * math.cos(a), oz + r * math.sin(a)))
    return pts
