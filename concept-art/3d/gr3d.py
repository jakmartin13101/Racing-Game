"""Gravel Riot gameplay-snapshot renderer.

Builds procedural off-road scenes (terrain, sky, props, vehicles) in Blender
and renders them with Cycles. Run through render_shots.py.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise

TAU = math.pi * 2


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def hexc(h, a=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (c[0], c[1], c[2], a)


def fbm(x, y, z=0.0, oct=5, lac=2.0, gain=0.5):
    s, a, f, m = 0.0, 0.5, 1.0, 0.0
    for _ in range(oct):
        s += a * noise.noise(Vector((x * f, y * f, z)))
        m += a
        a *= gain
        f *= lac
    return s / m  # roughly -1..1


def ridged(x, y, oct=5):
    s, a, f, m = 0.0, 0.5, 1.0, 0.0
    for _ in range(oct):
        n = 1 - abs(noise.noise(Vector((x * f, y * f, 3.7))))
        s += a * n * n
        m += a
        a *= 0.5
        f *= 2.0
    return s / m


# ---------------------------------------------------------------- scene setup
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render(res=(1920, 1080), samples=64, look='AgX - Punchy', exposure=0.0):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_adaptive_sampling = True
    s.cycles.adaptive_threshold = 0.03
    s.cycles.use_denoising = True
    s.cycles.denoiser = 'OPENIMAGEDENOISE'
    s.cycles.max_bounces = 6
    s.cycles.diffuse_bounces = 2
    s.cycles.glossy_bounces = 3
    s.cycles.transmission_bounces = 4
    s.cycles.volume_bounces = 0
    s.cycles.transparent_max_bounces = 64
    s.cycles.volume_step_rate = 4.0
    s.cycles.volume_max_steps = 256
    s.cycles.caustics_reflective = False
    s.cycles.caustics_refractive = False
    s.cycles.blur_glossy = 1.0
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.use_motion_blur = True
    s.render.motion_blur_shutter = 0.5
    s.render.motion_blur_position = 'START'
    s.render.fps = 24
    s.frame_start, s.frame_end = 1, 2
    s.frame_set(1)
    s.view_settings.view_transform = 'AgX'
    try:
        s.view_settings.look = look
    except TypeError:
        pass
    s.view_settings.exposure = exposure
    s.render.image_settings.file_format = 'PNG'
    s.render.threads_mode = 'AUTO'


# ---------------------------------------------------------------- node helpers
class NB:
    """Tiny node-building helper."""

    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.l = tree.links

    def node(self, kind, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            if k.startswith('in_'):
                key = k[3:]
                key = int(key) if key.isdigit() else key.replace('_', ' ')
                nd.inputs[key].default_value = v
            else:
                setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.l.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        nd = self.n.new('ShaderNodeMath')
        nd.operation = op
        nd.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                nd.inputs[i].default_value = v
            else:
                self.link(v, nd.inputs[i])
        return nd.outputs[0]

    def mixc(self, fac, a, b):
        nd = self.n.new('ShaderNodeMix')
        nd.data_type = 'RGBA'
        for sock, v in ((nd.inputs[0], fac), (nd.inputs[6], a), (nd.inputs[7], b)):
            if isinstance(v, (int, float, tuple)):
                sock.default_value = v
            else:
                self.link(v, sock)
        return nd.outputs[2]

    def mixf(self, fac, a, b):
        nd = self.n.new('ShaderNodeMix')
        nd.data_type = 'FLOAT'
        for sock, v in ((nd.inputs[0], fac), (nd.inputs[2], a), (nd.inputs[3], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                self.link(v, sock)
        return nd.outputs[0]

    def noise(self, vec=None, scale=5.0, detail=6.0, rough=0.55, out='Fac'):
        nd = self.n.new('ShaderNodeTexNoise')
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        if vec is not None:
            self.link(vec, nd.inputs['Vector'])
        return nd.outputs[out]

    def ramp(self, fac, stops):
        nd = self.n.new('ShaderNodeValToRGB')
        cr = nd.color_ramp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (p, c) in zip(cr.elements, stops):
            el.position = p
            el.color = c
        self.link(fac, nd.inputs[0])
        return nd.outputs[0]

    def maprange(self, v, a, b, c=0.0, d=1.0, clamp=True):
        nd = self.n.new('ShaderNodeMapRange')
        nd.clamp = clamp
        self.link(v, nd.inputs[0])
        nd.inputs[1].default_value = a
        nd.inputs[2].default_value = b
        nd.inputs[3].default_value = c
        nd.inputs[4].default_value = d
        return nd.outputs[0]

    def mapping(self, vec, scale=(1, 1, 1), loc=(0, 0, 0)):
        nd = self.n.new('ShaderNodeMapping')
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Location'].default_value = loc
        self.link(vec, nd.inputs['Vector'])
        return nd.outputs[0]

    def sep(self, vec):
        nd = self.n.new('ShaderNodeSeparateXYZ')
        self.link(vec, nd.inputs[0])
        return nd.outputs


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, NB(nt), out


def principled(nb, **kw):
    p = nb.n.new('ShaderNodeBsdfPrincipled')
    names = {'color': 'Base Color', 'rough': 'Roughness', 'metal': 'Metallic', 'coat': 'Coat Weight',
             'coat_rough': 'Coat Roughness', 'emit': 'Emission Color', 'emit_str': 'Emission Strength',
             'normal': 'Normal', 'spec': 'Specular IOR Level', 'trans': 'Transmission Weight', 'ior': 'IOR',
             'alpha': 'Alpha', 'sss': 'Subsurface Weight', 'sheen': 'Sheen Weight'}
    for k, v in kw.items():
        sock = p.inputs[names[k]]
        if isinstance(v, (int, float, tuple)):
            sock.default_value = v
        else:
            nb.link(v, sock)
    return p


def mat_simple(name, color, rough=0.5, metal=0.0, coat=0.0, emit=None, emit_str=0.0):
    m, nb, out = new_mat(name)
    kw = dict(color=hexc(color) if isinstance(color, str) else color, rough=rough, metal=metal, coat=coat)
    if emit:
        kw['emit'] = hexc(emit) if isinstance(emit, str) else emit
        kw['emit_str'] = emit_str
    p = principled(nb, **kw)
    nb.link(p.outputs[0], out.inputs[0])
    return m


def mat_emit(name, color, strength):
    m, nb, out = new_mat(name)
    e = nb.node('ShaderNodeEmission')
    e.inputs['Color'].default_value = hexc(color)
    e.inputs['Strength'].default_value = strength
    nb.link(e.outputs[0], out.inputs[0])
    return m


def mat_paint(name, color, dirt='#6b5137', dirt_amt=0.3, rough=0.3, metal=0.15, stripe=None, stripe_band=(0.42, 0.52)):
    """Car paint with clear coat, an optional livery stripe and dirt that builds up low on the body."""
    m, nb, out = new_mat(name)
    tc = nb.node('ShaderNodeTexCoord')
    gen = nb.sep(tc.outputs['Generated'])
    obj = tc.outputs['Object']
    base = hexc(color)
    col = base
    if stripe:
        band = nb.math('MULTIPLY', nb.math('GREATER_THAN', gen[2], stripe_band[0]), nb.math('LESS_THAN', gen[2], stripe_band[1]))
        col = nb.mixc(band, base, hexc(stripe))
    n1 = nb.noise(obj, scale=3.0, detail=8, rough=0.65)
    n2 = nb.noise(obj, scale=22.0, detail=4, rough=0.6)
    low = nb.maprange(gen[2], 0.0, 0.65, 1.0, 0.0)
    mask = nb.math('ADD', nb.math('MULTIPLY', low, 1.3), nb.math('MULTIPLY', nb.math('SUBTRACT', n1, 0.5), 1.2))
    mask = nb.math('ADD', mask, nb.math('MULTIPLY', nb.math('SUBTRACT', n2, 0.5), 0.6))
    mask = nb.math('MULTIPLY', nb.maprange(mask, 0.6, 1.0), dirt_amt)
    colf = nb.mixc(mask, col, hexc(dirt))
    rf = nb.mixf(mask, rough, 0.85)
    cf = nb.mixf(mask, 1.0, 0.0)
    bump = nb.node('ShaderNodeBump', in_Strength=0.25, in_Distance=0.01)
    nb.link(nb.math('MULTIPLY', mask, n2), bump.inputs['Height'])
    p = principled(nb, color=colf, rough=rf, metal=metal, coat=cf, coat_rough=0.04, normal=bump.outputs[0])
    nb.link(p.outputs[0], out.inputs[0])
    return m


def mat_tyre(name, dust='#6b5137'):
    m, nb, out = new_mat(name)
    tc = nb.node('ShaderNodeTexCoord')
    n = nb.noise(tc.outputs['Object'], scale=6, detail=6)
    mask = nb.maprange(n, 0.5, 0.75, 0.0, 0.3)
    col = nb.mixc(mask, hexc('#141311'), hexc(dust))
    rough = nb.mixf(mask, 0.72, 0.95)
    p = principled(nb, color=col, rough=rough)
    nb.link(p.outputs[0], out.inputs[0])
    return m


def mat_glass(name):
    return mat_simple(name, '#0b0f13', rough=0.04, coat=1.0)


# ---------------------------------------------------------------- mesh builder
class MB:
    """Builds one mesh object out of many primitives, with per-face material slots."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _finish_faces(self, faces, mat, smooth_=False):
        mi = self._mi(mat)
        for f in faces:
            f.material_index = mi
            f.smooth = smooth_

    def box(self, c, size, mat, rot=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r['verts']
        M = Matrix.Translation(Vector(c)) @ (rot.to_4x4() if rot else Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        faces = list({f for v in vs for f in v.link_faces})
        self._finish_faces(faces, mat)
        return vs

    def cyl(self, p0, p1, r, mat, segs=16, r1=None, cap=True, smooth_=True):
        p0, p1 = Vector(p0), Vector(p1)
        d = (p1 - p0)
        L = d.length
        if L < 1e-6:
            return
        r1 = r if r1 is None else r1
        res = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r, radius2=r1, depth=L)
        vs = res['verts']
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        faces = list({f for v in vs for f in v.link_faces})
        self._finish_faces(faces, mat, smooth_)
        return vs

    def tube(self, pts, r, mat, segs=10):
        for a, b in zip(pts[:-1], pts[1:]):
            self.cyl(a, b, r, mat, segs)
        for p in pts:
            self.sphere(p, r, mat, 1)

    def sphere(self, c, r, mat, subd=2, scale=(1, 1, 1)):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subd, radius=r)
        vs = res['verts']
        M = Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*scale, 1))
        bmesh.ops.transform(self.bm, matrix=M, verts=vs)
        faces = list({f for v in vs for f in v.link_faces})
        self._finish_faces(faces, mat, True)
        return vs

    def profile(self, pts, y0, y1, mat, mat_top=None, top_thresh=0.6):
        """Extrude a side-view polygon (x forward, z up) across y0..y1."""
        bm = self.bm
        v0 = [bm.verts.new((x, y0, z)) for x, z in pts]
        v1 = [bm.verts.new((x, y1, z)) for x, z in pts]
        faces = [bm.faces.new(v0[::-1]), bm.faces.new(v1)]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            faces.append(bm.faces.new((v0[i], v0[j], v1[j], v1[i])))
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        self._finish_faces(faces, mat)
        if mat_top:
            mi = self._mi(mat_top)
            for f in faces[2:]:
                f.normal_update()
                if f.normal.z > top_thresh:
                    f.material_index = mi
        return faces

    def obj(self, name, bevel=0.0, bevel_segs=2, parent=None, subsurf=0):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        if bevel > 0:
            md = o.modifiers.new('bevel', 'BEVEL')
            md.width = bevel
            md.segments = bevel_segs
            md.limit_method = 'ANGLE'
            md.angle_limit = math.radians(30)
            md.harden_normals = False
        if subsurf:
            md = o.modifiers.new('sub', 'SUBSURF')
            md.levels = md.render_levels = subsurf
        if parent:
            o.parent = parent
        return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


def text_obj(txt, size, mat, parent, loc, rot):
    cu = bpy.data.curves.new('num', 'FONT')
    cu.body = str(txt)
    cu.size = size
    cu.extrude = 0.004
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    o = bpy.data.objects.new('num', cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    return o


# ---------------------------------------------------------------- wheels
_wheel_cache = {}


def wheel_mesh(r, tw, tyre_m, rim_m, dark_m, accent_m, style='offroad'):
    key = (round(r, 3), round(tw, 3), tyre_m.name, rim_m.name, accent_m.name, style)
    if key in _wheel_cache:
        return _wheel_cache[key]
    mb = MB()
    # tyre: carcass along local Y axis
    mb.cyl((0, -tw / 2, 0), (0, tw / 2, 0), r * 0.94, tyre_m, segs=48)
    # rounded shoulders
    for s in (-1, 1):
        mb.cyl((0, s * tw * 0.42, 0), (0, s * tw * 0.5, 0), r * 0.9, tyre_m, segs=48, r1=r * 0.78)
    # tread blocks
    n = max(18, int(TAU * r / (0.11 if style == 'offroad' else 0.08)))
    bh = 0.045 if style == 'offroad' else 0.02
    for i in range(n):
        a = TAU * i / n
        for row, off in ((0, -0.22), (1, 0.22)):
            aa = a + (math.pi / n if row else 0)
            c = Vector((math.cos(aa) * (r * 0.94 + bh / 2 - 0.004), off * tw, math.sin(aa) * (r * 0.94 + bh / 2 - 0.004)))
            rot = Matrix.Rotation(-aa, 3, 'Y')
            mb.box(c, (bh, tw * 0.42, TAU * r / n * 0.55), tyre_m, rot=rot)
    # rim faces both sides
    for s in (-1, 1):
        y = s * tw * 0.5
        mb.cyl((0, y - s * 0.06, 0), (0, y + s * 0.004, 0), r * 0.6, rim_m, segs=32)
        mb.cyl((0, y + s * 0.004, 0), (0, y + s * 0.012, 0), r * 0.58, accent_m, segs=32, r1=r * 0.6)
        mb.cyl((0, y - s * 0.02, 0), (0, y + s * 0.018, 0), r * 0.42, dark_m, segs=32)
        for k in range(6):
            a = TAU * k / 6
            c = Vector((math.cos(a) * r * 0.25, y + s * 0.012, math.sin(a) * r * 0.25))
            mb.box(c, (r * 0.34, 0.03, r * 0.09), rim_m, rot=Matrix.Rotation(-a, 3, 'Y'))
        mb.cyl((0, y - s * 0.01, 0), (0, y + s * 0.03, 0), r * 0.1, rim_m, segs=16)
    me = bpy.data.meshes.new('wheel')
    mb.bm.to_mesh(me)
    mb.bm.free()
    for m in mb.mats:
        me.materials.append(m)
    _wheel_cache[key] = me
    return me


# ---------------------------------------------------------------- vehicles
class Mats:
    def __init__(self, color, accent, dust):
        self.paint = mat_paint('paint', color, dirt=dust, stripe=accent)
        self.accent = mat_paint('accent', accent, dirt=dust, dirt_amt=0.4)
        self.glass = mat_glass('glass')
        self.dark = mat_simple('dark', '#121212', rough=0.55)
        self.frame = mat_simple('frame', '#1c1c1c', rough=0.45, metal=0.6)
        self.chrome = mat_simple('chrome', '#d8d8d8', rough=0.12, metal=1.0)
        self.rim = mat_simple('rim', '#9a9da3', rough=0.28, metal=1.0)
        self.tyre = mat_tyre('tyre', dust)
        self.white = mat_simple('white', '#efece4', rough=0.4)
        self.head = mat_emit('headlamp', '#fff3d6', 40.0)
        self.tail = mat_emit('taillamp', '#ff2a1a', 12.0)
        self.lbar = mat_emit('lightbar', '#fff1c9', 30.0)
        self.helmet = mat_simple('helmet', accent, rough=0.25, coat=1.0)
        self.engine = mat_simple('engine', '#3c3c3c', rough=0.4, metal=0.8)


def add_wheels(root, M, wheels, r, tw, track, spin_speed, style='offroad', ground_z=0.0):
    out = []
    for x in wheels:
        for s in (-1, 1):
            me = wheel_mesh(r, tw, M.tyre, M.rim, M.dark, M.accent, style)
            o = bpy.data.objects.new('wheel', me)
            bpy.context.scene.collection.objects.link(o)
            o.parent = root
            o.location = (x, s * track / 2, r)
            o.rotation_euler = (0, 0, 0)
            o.keyframe_insert('rotation_euler', index=1, frame=1)
            o.rotation_euler = (0, spin_speed / r / 24.0, 0)
            o.keyframe_insert('rotation_euler', index=1, frame=2)
            out.append(o)
    return out


def number_decals(root, M, num, x, z, half_w, size=0.32):
    for s in (-1, 1):
        mb = MB()
        mb.cyl((x, s * (half_w + 0.005), z), (x, s * (half_w + 0.012), z), size * 0.62, M.white, segs=32)
        mb.obj('roundel', parent=root)
        rot = (math.pi / 2, 0, 0 if s < 0 else math.pi)
        text_obj(num, size * 0.85, M.dark, root, (x, s * (half_w + 0.016), z), rot)


def headlights(root, x, z, ys, M, night, strength=1800, spot_deg=55, aim_down=6):
    mb = MB()
    for y in ys:
        mb.cyl((x - 0.03, y, z), (x + 0.02, y, z), 0.09, M.head, segs=16)
    mb.obj('lamps', parent=root)
    if night:
        for y in ys:
            L = bpy.data.lights.new('head', 'SPOT')
            L.energy = strength
            L.spot_size = math.radians(spot_deg)
            L.spot_blend = 0.6
            L.color = (1.0, 0.93, 0.8)
            L.shadow_soft_size = 0.05
            o = bpy.data.objects.new('head', L)
            bpy.context.scene.collection.objects.link(o)
            o.parent = root
            o.location = (x + 0.1, y, z)
            o.rotation_euler = (0, math.radians(90 + aim_down), 0)


def light_bar(mb, M, x, z, width, n=6):
    mb.box((x, 0, z), (0.14, width, 0.1), M.dark)
    for i in range(n):
        y = -width / 2 + width * (i + 0.5) / n
        mb.box((x + 0.072, y, z), (0.01, width / n * 0.7, 0.06), M.lbar)


def build_vehicle(kind, color, accent, num, dust, night=False, speed=30.0):
    """Return root empty of a vehicle facing +X in local space (rotated to the track later)."""
    root = empty('veh_' + kind)
    M = Mats(color, accent, dust)
    if kind == 'truck':
        hw = 1.05
        mb = MB()
        mb.profile([(-2.75, 0.78), (2.55, 0.78), (2.95, 0.98), (3.0, 1.18), (2.25, 1.34), (0.65, 1.40), (-2.7, 1.42), (-2.85, 1.1)], -hw, hw, M.paint)
        mb.profile([(-0.95, 1.38), (0.62, 1.38), (-0.02, 1.98), (-0.88, 2.0)], -0.86, 0.86, M.glass, mat_top=M.paint, top_thresh=0.8)
        body = mb.obj('body', bevel=0.05, bevel_segs=3, parent=root)
        cut = MB()
        for x in (-1.75, 1.85):
            cut.cyl((x, -1.3, 0.5), (x, 1.3, 0.5), 0.66, M.dark, segs=32)
        cutter = cut.obj('cut', parent=root)
        cutter.hide_render = True
        cutter.display_type = 'WIRE'
        b = body.modifiers.new('arch', 'BOOLEAN')
        b.operation = 'DIFFERENCE'
        b.object = cutter
        b.use_self = True
        b.use_hole_tolerant = True
        b.solver = 'EXACT' if 'EXACT' in [e.identifier for e in b.bl_rna.properties['solver'].enum_items] else b.solver
        d = MB()
        d.tube([(-0.88, 0.8, 2.0), (-2.6, 0.75, 1.45)], 0.04, M.frame)
        d.tube([(-0.88, -0.8, 2.0), (-2.6, -0.75, 1.45)], 0.04, M.frame)
        d.tube([(-2.6, 0.75, 1.45), (-2.6, -0.75, 1.45)], 0.04, M.frame)
        d.cyl((-1.9, 0, 1.43), (-1.9, 0, 1.75), 0.0, M.dark)
        d.cyl((-1.95, -0.0, 1.42), (-1.95, 0.0, 1.42), 0.1, M.dark)
        # spare tyre lying in the bed
        d.cyl((-1.95, 0, 1.42), (-1.95, 0, 1.70), 0.46, M.tyre, segs=32)
        # long-travel shocks
        for x in (-1.75, 1.85):
            for s in (-1, 1):
                d.cyl((x - 0.15, s * 1.05, 0.55), (x - 0.35, s * 0.85, 1.35), 0.055, M.accent)
                d.cyl((x + 0.12, s * 1.05, 0.55), (x + 0.3, s * 0.85, 1.35), 0.055, M.accent)
                d.cyl((x, s * 0.2, 0.55), (x, s * 1.05, 0.5), 0.04, M.frame)
        d.tube([(3.02, -0.9, 0.85), (3.08, 0, 0.88), (3.02, 0.9, 0.85)], 0.045, M.frame)
        light_bar(d, M, -0.42, 2.06, 1.55)
        for sd in (-1, 1):
            d.box((-2.87, sd * 0.78, 1.12), (0.04, 0.32, 0.14), M.tail)
        d.tube([(-2.95, -0.95, 0.82), (-2.98, 0, 0.8), (-2.95, 0.95, 0.82)], 0.05, M.frame)
        d.obj('details', parent=root)
        add_wheels(root, M, (-1.75, 1.85), 0.5, 0.38, 2.35, speed)
        headlights(root, 2.98, 1.08, (-0.72, 0.72), M, night)
        number_decals(root, M, num, -0.25, 1.1, hw)
    elif kind == 'rally':
        hw = 0.9
        mb = MB()
        mb.profile([(-2.0, 0.26), (2.0, 0.26), (2.12, 0.46), (2.06, 0.72), (1.1, 0.86), (0.1, 0.9), (-1.9, 0.94), (-2.06, 0.7)], -hw, hw, M.paint)
        mb.profile([(-1.85, 0.92), (0.22, 0.88), (-0.42, 1.4), (-1.55, 1.42)], -0.78, 0.78, M.glass, mat_top=M.paint, top_thresh=0.8)
        body = mb.obj('body', bevel=0.06, bevel_segs=3, parent=root)
        cut = MB()
        for x in (-1.22, 1.3):
            cut.cyl((x, -1.2, 0.34), (x, 1.2, 0.34), 0.42, M.dark, segs=32)
        cutter = cut.obj('cut', parent=root)
        cutter.hide_render = True
        b = body.modifiers.new('arch', 'BOOLEAN')
        b.operation = 'DIFFERENCE'
        b.object = cutter
        b.use_self = True
        b.use_hole_tolerant = True
        d = MB()
        d.box((-1.78, 0, 1.5), (0.32, 1.62, 0.04), M.accent)
        for s in (-1, 1):
            d.box((-1.7, s * 0.6, 1.45), (0.12, 0.04, 0.12), M.dark)
            d.box((-1.48, s * 0.92, 0.18), (0.03, 0.24, 0.26), M.dark)
            d.box((0.95, s * 0.92, 0.18), (0.03, 0.24, 0.26), M.dark)
        d.box((-0.8, 0, 1.46), (0.4, 0.3, 0.08), M.dark)
        for i, y in enumerate((-0.5, -0.17, 0.17, 0.5)):
            d.cyl((1.62, y, 0.9), (1.7, y, 0.92), 0.085, M.head, segs=16)
            d.cyl((1.58, y, 0.9), (1.62, y, 0.9), 0.1, M.dark, segs=16)
        for sd in (-1, 1):
            d.box((-2.07, sd * 0.62, 0.74), (0.03, 0.3, 0.1), M.tail)
        d.box((-2.02, 0, 0.36), (0.14, 1.78, 0.2), M.dark)
        d.cyl((-2.0, 0.5, 0.3), (-2.14, 0.5, 0.3), 0.05, M.chrome)
        d.box((-2.1, -0.4, 0.34), (0.06, 0.06, 0.06), M.accent)
        d.obj('details', parent=root)
        add_wheels(root, M, (-1.22, 1.3), 0.34, 0.25, 1.62, speed, style='road')
        headlights(root, 2.1, 0.62, (-0.62, 0.62), M, night)
        number_decals(root, M, num, -0.3, 0.6, hw, size=0.36)
    elif kind == 'buggy':
        hw = 0.7
        mb = MB()
        mb.profile([(-1.9, 0.42), (1.6, 0.42), (2.25, 0.56), (2.15, 0.72), (1.0, 0.74), (-1.3, 0.74), (-1.95, 0.82)], -hw, hw, M.paint)
        mb.profile([(-1.2, 0.5), (1.3, 0.5), (1.5, 0.66), (-1.2, 0.7)], -0.86, 0.86, M.accent)
        mb.obj('body', bevel=0.04, bevel_segs=3, parent=root)
        d = MB()
        cage = M.frame
        for s in (-1, 1):
            y, yt = s * 0.62, s * 0.52
            d.tube([(-0.65, y, 0.74), (-0.6, yt, 1.62), (0.35, yt, 1.6), (1.15, y, 0.74)], 0.04, cage)
            d.tube([(-0.6, yt, 1.62), (-1.85, s * 0.5, 0.86)], 0.035, cage)
            d.tube([(0.35, yt, 1.6), (1.9, s * 0.45, 0.72)], 0.035, cage)
            # arms and shocks to the outboard wheels
            d.cyl((-1.35, s * 0.5, 0.55), (-1.35, s * 0.95, 0.44), 0.035, M.frame)
            d.cyl((1.45, s * 0.5, 0.6), (1.45, s * 0.92, 0.4), 0.035, M.frame)
            d.cyl((-1.25, s * 0.85, 0.48), (-1.0, s * 0.55, 1.05), 0.05, M.accent)
            d.cyl((1.35, s * 0.85, 0.45), (1.2, s * 0.5, 0.95), 0.05, M.accent)
        d.tube([(-0.6, -0.52, 1.62), (-0.6, 0.52, 1.62)], 0.04, cage)
        d.tube([(0.35, -0.52, 1.6), (0.35, 0.52, 1.6)], 0.04, cage)
        d.tube([(-0.6, -0.52, 1.62), (0.35, 0.52, 1.6)], 0.03, cage)
        # engine and exhaust
        d.box((-1.45, 0, 0.98), (0.6, 0.7, 0.42), M.engine)
        for i in range(5):
            d.box((-1.62 + i * 0.09, 0, 1.22), (0.04, 0.6, 0.08), M.engine)
        d.tube([(-1.7, 0.25, 0.9), (-2.05, 0.25, 1.0), (-2.15, 0.25, 1.25)], 0.05, M.chrome)
        # seat, driver
        d.box((-0.25, 0, 0.92), (0.5, 0.5, 0.35), M.dark)
        d.box((-0.1, 0, 1.12), (0.3, 0.42, 0.42), M.dark)
        d.sphere((-0.05, 0, 1.4), 0.15, M.helmet, 2)
        d.box((0.07, 0, 1.4), (0.06, 0.2, 0.08), M.glass)
        light_bar(d, M, 0.38, 1.66, 1.0, 5)
        for sd in (-1, 1):
            d.box((-1.97, sd * 0.32, 0.86), (0.03, 0.16, 0.07), M.tail)
        d.obj('details', parent=root)
        rr, fr = 0.46, 0.4
        for x, r, tw in ((-1.35, rr, 0.38), (1.45, fr, 0.3)):
            for s in (-1, 1):
                me = wheel_mesh(r, tw, M.tyre, M.rim, M.dark, M.accent)
                o = bpy.data.objects.new('wheel', me)
                bpy.context.scene.collection.objects.link(o)
                o.parent = root
                o.location = (x, s * 1.05, r)
                o.keyframe_insert('rotation_euler', index=1, frame=1)
                o.rotation_euler = (0, speed / r / 24.0, 0)
                o.keyframe_insert('rotation_euler', index=1, frame=2)
        headlights(root, 2.2, 0.66, (-0.45, 0.45), M, night)
        number_decals(root, M, num, 0.5, 0.6, 0.86, size=0.3)
    elif kind == 'mud':
        hw = 0.9
        mb = MB()
        mb.profile([(-1.95, 1.08), (1.95, 1.08), (2.08, 1.36), (1.92, 1.66), (0.95, 1.74), (-1.92, 1.78)], -hw, hw, M.paint)
        mb.profile([(-1.25, 1.72), (0.8, 1.72), (0.32, 2.45), (-1.12, 2.5)], -0.82, 0.82, M.glass, mat_top=M.paint, top_thresh=0.8)
        body = mb.obj('body', bevel=0.05, bevel_segs=3, parent=root)
        cut = MB()
        for x in (-1.25, 1.25):
            cut.cyl((x, -1.2, 0.74), (x, 1.2, 0.74), 0.86, M.dark, segs=32)
        cutter = cut.obj('cut', parent=root)
        cutter.hide_render = True
        b = body.modifiers.new('arch', 'BOOLEAN')
        b.operation = 'DIFFERENCE'
        b.object = cutter
        b.use_self = True
        b.use_hole_tolerant = True
        d = MB()
        d.box((0, 0, 0.95), (3.6, 0.9, 0.18), M.frame)
        for x in (-1.25, 1.25):
            d.cyl((x, -1.1, 0.74), (x, 1.1, 0.74), 0.1, M.frame)
            for s in (-1, 1):
                d.cyl((x + 0.2, s * 0.6, 0.78), (x + 0.32, s * 0.6, 1.15), 0.07, M.accent)
        for s in (-1, 1):
            d.tube([(-1.12, s * 0.76, 2.5), (-1.2, s * 0.76, 2.72), (0.3, s * 0.76, 2.7), (0.36, s * 0.76, 2.45)], 0.04, M.frame)
        d.tube([(-1.2, -0.76, 2.72), (-1.2, 0.76, 2.72)], 0.04, M.frame)
        d.tube([(0.3, -0.76, 2.7), (0.3, 0.76, 2.7)], 0.04, M.frame)
        d.tube([(0.85, 0.94, 1.55), (0.6, 0.94, 2.3), (0.55, 0.94, 2.85)], 0.075, M.dark)
        d.box((0.55, 0.94, 2.9), (0.2, 0.18, 0.14), M.dark)
        d.box((2.12, 0, 1.18), (0.22, 1.9, 0.26), M.frame)
        d.cyl((2.24, -0.25, 1.18), (2.24, 0.25, 1.18), 0.11, M.chrome)
        light_bar(d, M, -0.4, 2.78, 1.4)
        for sd in (-1, 1):
            d.box((-1.97, sd * 0.66, 1.5), (0.03, 0.26, 0.12), M.tail)
        d.cyl((-1.98, 0, 1.75), (-2.36, 0, 1.75), 0.58, M.tyre, segs=32)
        d.cyl((-2.0, 0, 1.75), (-2.38, 0, 1.75), 0.34, M.rim, segs=24)
        d.obj('details', parent=root)
        add_wheels(root, M, (-1.25, 1.25), 0.74, 0.56, 2.3, speed)
        headlights(root, 2.02, 1.45, (-0.65, 0.65), M, night)
        number_decals(root, M, num, -0.45, 1.38, hw)
    elif kind == 'monster':
        hw = 1.0
        mb = MB()
        mb.profile([(-2.6, 1.98), (2.6, 1.98), (2.78, 2.22), (2.62, 2.48), (1.25, 2.58), (-2.6, 2.6)], -hw, hw, M.paint)
        mb.profile([(-0.55, 2.56), (1.15, 2.56), (0.62, 3.18), (-0.48, 3.2)], -0.9, 0.9, M.glass, mat_top=M.paint, top_thresh=0.8)
        mb.obj('body', bevel=0.06, bevel_segs=3, parent=root)
        d = MB()
        d.box((0, 0, 1.55), (3.6, 1.1, 0.5), M.frame)
        for x in (-1.65, 1.65):
            d.cyl((x, -1.5, 1.02), (x, 1.5, 1.02), 0.16, M.frame)
            for s in (-1, 1):
                for k in (-0.35, -0.12, 0.12, 0.35):
                    d.cyl((x + k * 0.6, s * 0.75, 1.1), (x + k * 1.6, s * 0.5, 1.95), 0.07, M.accent)
        d.tube([(2.8, -0.9, 2.0), (2.95, 0, 2.05), (2.8, 0.9, 2.0)], 0.06, M.chrome)
        light_bar(d, M, 0.0, 3.25, 1.4)
        for sd in (-1, 1):
            d.box((-2.62, sd * 0.75, 2.32), (0.03, 0.3, 0.12), M.tail)
        d.obj('details', parent=root)
        add_wheels(root, M, (-1.65, 1.65), 1.02, 0.85, 3.0, speed)
        headlights(root, 2.74, 2.3, (-0.7, 0.7), M, night)
        number_decals(root, M, num, -1.2, 2.3, hw, size=0.36)
    elif kind == 'rig':
        hw = 1.22
        mb = MB()
        mb.profile([(0.55, 0.98), (2.35, 0.98), (2.42, 1.45), (2.36, 3.05), (2.12, 3.25), (0.55, 3.25)], -hw, hw, M.paint)
        mb.profile([(-0.45, 0.98), (0.6, 0.98), (0.6, 3.0), (-0.45, 2.9)], -1.18, 1.18, M.paint)
        mb.obj('cab', bevel=0.06, bevel_segs=3, parent=root)
        d = MB()
        d.box((2.43, 0, 2.55), (0.04, 2.15, 0.78), M.glass)
        for s in (-1, 1):
            d.box((1.75, s * 1.235, 2.55), (0.9, 0.02, 0.7), M.glass)
            d.cyl((0.42, s * 1.0, 1.05), (0.42, s * 1.0, 4.05), 0.085, M.chrome)
            d.cyl((-0.4, s * 0.98, 0.72), (0.4, s * 0.98, 0.72), 0.3, M.chrome, segs=24)
            d.box((1.8, s * 1.25, 1.62), (0.2, 0.05, 0.14), M.accent)
        d.box((2.46, 0, 1.4), (0.06, 1.7, 0.75), M.chrome)
        for i in range(8):
            d.box((2.5, 0, 1.08 + i * 0.1), (0.02, 1.6, 0.03), M.dark)
        d.box((2.55, 0, 0.82), (0.25, 2.5, 0.3), M.chrome)
        d.box((-1.6, 0, 0.82), (6.4, 0.95, 0.25), M.frame)
        d.cyl((-2.9, -0.6, 1.0), (-2.9, 0.6, 1.0), 0.0, M.dark)
        d.box((-2.7, 0, 1.05), (1.2, 1.4, 0.1), M.dark)
        for x in (-2.2, -3.6):
            for s in (-1, 1):
                d.box((x, s * 1.12, 1.25), (1.0, 0.42, 0.06), M.chrome)
        light_bar(d, M, 1.6, 3.33, 2.0, 8)
        for sd in (-1, 1):
            d.box((-4.82, sd * 0.85, 1.0), (0.04, 0.3, 0.12), M.tail)
            d.box((-4.2, sd * 0.98, 0.55), (0.03, 0.5, 0.6), M.dark)
        d.obj('details', parent=root)
        add_wheels(root, M, (1.45,), 0.56, 0.38, 2.15, speed)
        add_wheels(root, M, (-2.2, -3.6), 0.56, 0.6, 1.95, speed)
        headlights(root, 2.5, 1.0, (-0.95, 0.95), M, night, strength=2500)
        number_decals(root, M, num, 1.6, 2.0, hw, size=0.5)
    return root


# ---------------------------------------------------------------- track & terrain
class Track:
    def __init__(self, A=(16, 6), L=(140, 50), P=(0.3, 1.2), width=10.0, hills=(3.0, 110.0), bumps=()):
        self.A, self.L, self.P, self.width, self.hills, self.bumps = A, L, P, width, hills, bumps
        self.c0 = sum(a * math.sin(p) for a, p in zip(A, P))
        self.h0 = 0.0
        self.h0 = self.h(0)

    def cx(self, y):
        return sum(a * math.sin(y / l + p) for a, l, p in zip(self.A, self.L, self.P)) - self.c0

    def h(self, y):
        hA, hL = self.hills
        z = hA * math.sin(y / hL + 0.7) + 0.4 * hA * math.sin(y / (hL * 0.37) + 2.1)
        for (by, bh, bw) in self.bumps:  # jumps: a ramp up then a drop
            t = (y - by) / bw
            if -1.0 < t < 0.0:
                z += bh * (1 + t) ** 1.5
            elif 0.0 <= t < 0.6:
                z += bh * (1 - t / 0.6) ** 2 * 0.25
        return z - self.h0

    def heading(self, y):
        d = self.cx(y + 0.5) - self.cx(y - 0.5)
        return math.atan2(1.0, d)  # angle of travel in the XY plane (radians from +X)

    def frame(self, y, lateral=0.0):
        a = self.heading(y)
        fwd = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((fwd.y, -fwd.x, 0))
        p = Vector((self.cx(y), y, 0)) + side * lateral
        return p, fwd, side


class Terrain:
    """Height field around a track. biome decides the off-track shape."""

    def __init__(self, track, biome, seed=1):
        self.t, self.b, self.seed = track, biome, seed
        random.seed(seed)
        self.o = Vector((random.uniform(0, 100), random.uniform(0, 100), 0))

    def off(self, x, y, d):
        b, o = self.b, self.o
        nx, ny = x + o.x * 37, y + o.y * 37
        near = smooth(4, 60, d)
        far = smooth(120, 520, d)
        base = self.t.h(y) * 0.6
        if b in ('desert', 'canyon', 'festival', 'oil'):
            z = fbm(nx / 60, ny / 60) * 3.0 * near + fbm(nx / 15, ny / 15, 1) * 0.5 + ridged(nx / 400, ny / 400) * 120 * far
        elif b == 'dunes':
            w = math.sin((nx * 0.6 + ny) / 38 + fbm(nx / 120, ny / 120) * 3)
            z = (1 - abs(w)) ** 1.6 * 9 * near + fbm(nx / 200, ny / 200) * 18 * near + ridged(nx / 500, ny / 500) * 40 * far
        elif b in ('mud', 'swamp'):
            z = fbm(nx / 40, ny / 40) * 1.6 * near + fbm(nx / 220, ny / 220) * 12 * near + ridged(nx / 300, ny / 300) * 70 * far
            if b == 'swamp':
                z = z * 0.5 - 0.6 * near
        elif b == 'volcano':
            z = fbm(nx / 30, ny / 30) * 2.5 * near + ridged(nx / 90, ny / 90) * 10 * near + ridged(nx / 350, ny / 350) * 160 * far
        elif b in ('arctic', 'forest', 'highland'):
            amp = {'arctic': 260, 'forest': 230, 'highland': 60}[b]
            z = fbm(nx / 70, ny / 70) * 4 * near + fbm(nx / 250, ny / 250) * 14 * near + ridged(nx / 380, ny / 380) * amp * far
        elif b == 'jungle':
            z = fbm(nx / 50, ny / 50) * 5 * near + ridged(nx / 160, ny / 160) * 40 * smooth(20, 200, d) + ridged(nx / 300, ny / 300) * 150 * far
        elif b == 'coast':
            z = fbm(nx / 60, ny / 60) * 1.2 * near + ridged(nx / 300, ny / 300) * 80 * far
        elif b == 'salt':
            z = fbm(nx / 200, ny / 200) * 0.4 + ridged(nx / 500, ny / 500) * 90 * smooth(400, 900, d)
        elif b == 'quarry':
            raw = smooth(14, 140, d) * 70 + fbm(nx / 60, ny / 60) * 6
            step = 7.0
            k = raw / step
            z = (math.floor(k) + smooth(0.75, 1.0, k - math.floor(k))) * step
        elif b == 'city':
            z = fbm(nx / 40, ny / 40) * 0.8 * near
        else:
            z = fbm(nx / 60, ny / 60) * 3 * near
        return base + z

    def coast_side(self, x, y):
        return x  # positive x: sea side

    def height(self, x, y):
        t = self.t
        cx = t.cx(y)
        d = abs(x - cx) * math.sin(t.heading(y))
        lat = (x - cx) * math.sin(t.heading(y))
        hw = t.width / 2
        th = t.h(y)
        # ruts: grooves along the racing line
        rut = 0.0
        for r0 in (-2.6, -1.0, 1.0, 2.6):
            rut -= 0.07 * math.exp(-((lat - r0 - 0.4 * math.sin(y / 23)) ** 2) / 0.12)
        rut += fbm(x / 3, y / 3, 5.5) * 0.05
        m = smooth(hw, hw + 7.0, d)
        z = lerp(th + rut, self.off(x, y, d), m)
        if self.b == 'coast':
            z -= smooth(13, 34, lat) * 5.0
        if self.b == 'volcano':
            for sd, off in ((1, 15), (-1, 19)):
                rl = lat - sd * (off + 9 * math.sin(y / 47 + sd))
                z -= 5.0 * math.exp(-(rl * rl) / 30.0) * m
        trk = 1 - smooth(hw - 1.0 + fbm(x / 5, y / 5, 9) * 1.5, hw + 2.5, d)
        return z, trk

    def build(self, mat, xr=900, y0=-900, y1=1700, nx=340, ny=460):
        verts, trks = [], []
        nb_ = int(ny * 0.3)
        back = [-(abs(y0)) * ((nb_ - j) / nb_) ** 2.2 for j in range(nb_)]
        nf = ny - nb_
        fwd = [y1 * (j / (nf - 1)) ** 1.9 for j in range(nf)]
        ys = back + fwd
        for j, y in enumerate(ys):
            c = self.t.cx(y)
            for i in range(nx):
                u = (i / (nx - 1)) * 2 - 1
                x = c + math.copysign(abs(u) ** 2.2, u) * xr
                z, trk = self.height(x, y)
                verts.append((x, y, z))
                trks.append(trk)
        faces = []
        for j in range(ny - 1):
            for i in range(nx - 1):
                a = j * nx + i
                faces.append((a, a + 1, a + nx + 1, a + nx))
        me = bpy.data.meshes.new('terrain')
        me.from_pydata(verts, [], faces)
        me.shade_smooth() if hasattr(me, 'shade_smooth') else None
        for p in me.polygons:
            p.use_smooth = True
        at = me.attributes.new('trk', 'FLOAT', 'POINT')
        at.data.foreach_set('value', trks)
        me.materials.append(mat)
        o = bpy.data.objects.new('terrain', me)
        bpy.context.scene.collection.objects.link(o)
        return o


# ---------------------------------------------------------------- terrain material
BIOMES = {
    # off-track colours a/b, track colours a/b, rock, roughness off/track, extras
    'desert': dict(off=('#c98d58', '#a8683a'), trk=('#8f5a33', '#6e4226'), rock='#8a5a3e', dust='#c89566'),
    'festival': dict(off=('#c98d58', '#a8683a'), trk=('#8f5a33', '#6e4226'), rock='#8a5a3e', dust='#c89566'),
    'oil': dict(off=('#b8865a', '#94643c'), trk=('#6e4a30', '#4c3220'), rock='#7a5238', dust='#b08860'),
    'canyon': dict(off=('#c0703f', '#9a4f2a'), trk=('#8a4a28', '#6a3518'), rock='#a0502c', dust='#c98a5c'),
    'dunes': dict(off=('#e0a86a', '#c98a4c'), trk=('#b47a46', '#9a6436'), rock='#a06a40', dust='#ddb07c'),
    'mud': dict(off=('#5d6b3a', '#4a4a2a'), trk=('#4a3524', '#2e2016'), rock='#5a5048', dust='#5a4330', wet=True),
    'swamp': dict(off=('#4a4f2c', '#3a3a22'), trk=('#3e3020', '#2a2016'), rock='#4a4438', dust='#4a3a28', wet=True),
    'volcano': dict(off=('#2e2622', '#1c1614'), trk=('#4a3a32', '#2e2420'), rock='#2a2220', dust='#5a4a44', lava=True),
    'arctic': dict(off=('#f4f8fb', '#dde8f0'), trk=('#b8c8d6', '#9fb2c2'), rock='#4a5058', dust='#f2f6fa', snow=True),
    'forest': dict(off=('#5a6a32', '#46542a'), trk=('#6a5236', '#4e3c28'), rock='#6a6660', dust='#8a7050', snowcap=True),
    'highland': dict(off=('#6f8a3a', '#56702e'), trk=('#7a6040', '#5a4630'), rock='#7a7670', dust='#9a8060'),
    'jungle': dict(off=('#3f5a26', '#2e4a1e'), trk=('#7a4a2a', '#5a3218'), rock='#5a5a4a', dust='#7a5a3a', wet=True),
    'coast': dict(off=('#e8d29e', '#d6b984'), trk=('#b89a6a', '#9a7e52'), rock='#6a625a', dust='#e0cfa4'),
    'salt': dict(off=('#f2efe8', '#e2ddd2'), trk=('#cfc4b2', '#b8ab96'), rock='#9a8f8a', dust='#f4f0e6', cracks=True),
    'quarry': dict(off=('#a89a88', '#8a7e70'), trk=('#7a6c5e', '#5e5246'), rock='#8a8076', dust='#b8aa98'),
    'city': dict(off=('#6a6460', '#4e4844'), trk=('#4a4440', '#34302c'), rock='#5a5450', dust='#8a827a'),
}


def terrain_material(biome, lava_level=None, snow_level=None):
    B = BIOMES[biome]
    m, nb, out = new_mat('terrain_' + biome)
    tc = nb.node('ShaderNodeTexCoord')
    geo = nb.node('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    attr = nb.node('ShaderNodeAttribute', attribute_name='trk')
    trk = attr.outputs['Fac']
    # off-track colour
    n1 = nb.noise(pos, scale=0.05, detail=8)
    n2 = nb.noise(pos, scale=0.6, detail=6)
    n3 = nb.noise(pos, scale=4.0, detail=4)
    offc = nb.mixc(nb.maprange(n1, 0.35, 0.65), hexc(B['off'][0]), hexc(B['off'][1]))
    offc = nb.mixc(nb.math('MULTIPLY', nb.maprange(n2, 0.3, 0.7), 0.5), offc, hexc(B['off'][1]))
    if B.get('cracks'):
        vor = nb.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
        vor.inputs['Scale'].default_value = 0.6
        nb.link(pos, vor.inputs['Vector'])
        crack = nb.maprange(vor.outputs['Distance'], 0.0, 0.04, 1.0, 0.0)
        offc = nb.mixc(nb.math('MULTIPLY', crack, 0.6), offc, hexc('#b0a48e'))
    # track: streaks along travel direction
    stretch = nb.mapping(pos, scale=(1.2, 0.08, 1.0))
    s1 = nb.noise(stretch, scale=1.5, detail=6)
    trkc = nb.mixc(nb.maprange(s1, 0.3, 0.7), hexc(B['trk'][0]), hexc(B['trk'][1]))
    trkc = nb.mixc(nb.math('MULTIPLY', nb.maprange(n3, 0.4, 0.7), 0.4), trkc, hexc(B['off'][1]))
    col = nb.mixc(trk, offc, trkc)
    rough = nb.mixf(trk, 0.92, 0.85)
    # slope rock
    nz = nb.sep(geo.outputs['Normal'])[2]
    rocky = nb.maprange(nz, 0.82, 0.68)
    rockc = nb.mixc(nb.maprange(n2, 0.3, 0.7), hexc(B['rock']), hexc(B['rock'], 1) if False else tuple(c * 0.6 for c in hexc(B['rock'])[:3]) + (1,))
    if biome == 'canyon':
        wave = nb.node('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
        wave.inputs['Scale'].default_value = 0.02
        wave.inputs['Distortion'].default_value = 4.0
        wave.inputs['Detail'].default_value = 3.0
        nb.link(pos, wave.inputs['Vector'])
        rockc = nb.mixc(nb.math('MULTIPLY', wave.outputs['Fac'], 0.6), rockc, hexc('#d89a6a'))
    col = nb.mixc(nb.math('MULTIPLY', rocky, nb.math('SUBTRACT', 1.0, trk)), col, rockc)
    pz = nb.sep(pos)[2]
    if B.get('snow') or B.get('snowcap'):
        lvl = snow_level if snow_level is not None else (-1000 if B.get('snow') else 70)
        snowm = nb.math('MULTIPLY', nb.maprange(pz, lvl, lvl + 25), nb.maprange(nz, 0.55, 0.75))
        if B.get('snow'):
            snowm = nb.math('MAXIMUM', snowm, nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, trk), nb.maprange(nz, 0.6, 0.8)))
        col = nb.mixc(snowm, col, hexc('#f6f9fc'))
    emit_col, emit_str = (0, 0, 0, 1), 0.0
    if B.get('wet'):
        puddle = nb.math('MULTIPLY', trk, nb.maprange(nb.noise(nb.mapping(pos, scale=(0.5, 0.12, 1)), scale=1.2, detail=3), 0.55, 0.6))
        col = nb.mixc(puddle, col, hexc('#2a2a24'))
        rough = nb.mixf(puddle, rough, 0.04)
        rough = nb.mixf(trk, rough, nb.mixf(puddle, 0.45, 0.04))
    if B.get('lava') and lava_level is not None:
        lav = nb.maprange(pz, lava_level + 0.6, lava_level - 0.2)
        crust = nb.maprange(nb.noise(pos, scale=0.35, detail=8), 0.45, 0.62)
        hot = nb.ramp(crust, [(0.0, hexc('#ffb02e')), (0.5, hexc('#ff4a08')), (1.0, hexc('#200a06'))])
        col = nb.mixc(lav, col, hot)
        emit_col = hot
        emit_str = nb.math('MULTIPLY', nb.math('MULTIPLY', lav, nb.math('SUBTRACT', 1.0, crust)), 18.0)
    bump = nb.node('ShaderNodeBump', in_Strength=0.35, in_Distance=0.08)
    nb.link(nb.math('ADD', n3, nb.math('MULTIPLY', s1, trk)), bump.inputs['Height'])
    p = principled(nb, color=col, rough=rough, normal=bump.outputs[0], emit=emit_col, emit_str=emit_str)
    nb.link(p.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- sky
def world(sun_el, sun_rot, strength=0.35, kind='sky', clouds=0.4, cloud_col='#ffffff', tint=None,
          stars=False, aurora=False, overcast=0.0, grey='#7a8284', air=1.0, dust=1.0):
    w = bpy.data.worlds.new('world')
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    nb = NB(nt)
    out = nb.node('ShaderNodeOutputWorld')
    bg = nb.node('ShaderNodeBackground')
    sky = nb.node('ShaderNodeTexSky', sky_type='MULTIPLE_SCATTERING')
    sky.sun_disc = False
    sky.sun_elevation = math.radians(sun_el)
    sky.sun_rotation = math.radians(sun_rot)
    try:
        sky.air_density = air
        sky.aerosol_density = dust
    except AttributeError:
        pass
    col = sky.outputs['Color']
    if tint:
        mixn = nb.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        mixn.inputs[0].default_value = 1.0
        nb.link(col, mixn.inputs[6])
        mixn.inputs[7].default_value = hexc(tint)
        col = mixn.outputs[2]
    tc = nb.node('ShaderNodeTexCoord')
    dvec = tc.outputs['Generated']
    sx = nb.sep(dvec)
    dz = nb.math('MAXIMUM', sx[2], 0.02)
    u = nb.math('DIVIDE', sx[0], dz)
    v = nb.math('DIVIDE', sx[1], dz)
    comb = nb.node('ShaderNodeCombineXYZ')
    nb.link(u, comb.inputs[0])
    nb.link(v, comb.inputs[1])
    if overcast > 0:
        g = hexc(grey)
        col = nb.mixc(overcast, col, (g[0] * 3, g[1] * 3, g[2] * 3, 1))
    if clouds > 0:
        cn = nb.noise(comb.outputs[0], scale=0.9, detail=10, rough=0.6)
        cm = nb.maprange(cn, 0.62 - clouds * 0.2, 0.78 - clouds * 0.15)
        horizon = nb.maprange(sx[2], 0.02, 0.18)
        cm = nb.math('MULTIPLY', cm, horizon)
        shade = nb.maprange(nb.noise(comb.outputs[0], scale=2.5, detail=6), 0.4, 0.7, 0.55, 1.0)
        cc = hexc(cloud_col)
        ccol = nb.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        ccol.inputs[0].default_value = 1.0
        ccol.inputs[6].default_value = (cc[0] * 4, cc[1] * 4, cc[2] * 4, 1)
        nb.link(shade, ccol.inputs[7])
        cbright = nb.math('MULTIPLY', strength, 1.0)
        col = nb.mixc(nb.math('MULTIPLY', cm, 0.92), col, ccol.outputs[2])
    if stars:
        vor = nb.node('ShaderNodeTexVoronoi')
        vor.inputs['Scale'].default_value = 420
        nb.link(dvec, vor.inputs['Vector'])
        st = nb.maprange(vor.outputs['Distance'], 0.06, 0.0, 0.0, 30.0)
        st = nb.math('MULTIPLY', st, nb.maprange(sx[2], 0.0, 0.2))
        add = nb.node('ShaderNodeMix', data_type='RGBA', blend_type='ADD')
        add.inputs[0].default_value = 1.0
        nb.link(col, add.inputs[6])
        sc = nb.node('ShaderNodeCombineColor')
        for i in range(3):
            nb.link(st, sc.inputs[i])
        nb.link(sc.outputs[0], add.inputs[7])
        col = add.outputs[2]
    if aurora:
        wave = nb.node('ShaderNodeTexWave', wave_type='BANDS', bands_direction='X')
        wave.inputs['Scale'].default_value = 0.35
        wave.inputs['Distortion'].default_value = 9.0
        wave.inputs['Detail'].default_value = 3.0
        wave.inputs['Detail Scale'].default_value = 1.5
        nb.link(nb.mapping(comb.outputs[0], scale=(0.6, 0.6, 1.0)), wave.inputs['Vector'])
        rib = nb.maprange(wave.outputs['Fac'], 0.72, 0.98)
        rays = nb.maprange(nb.noise(nb.mapping(comb.outputs[0], scale=(3.0, 3.0, 1.0)), scale=2.0, detail=2), 0.3, 0.7, 0.4, 1.0)
        band = nb.math('MULTIPLY', nb.math('MULTIPLY', rib, rays), nb.maprange(sx[2], 0.06, 0.22))
        band = nb.math('MULTIPLY', band, nb.maprange(sx[2], 0.8, 0.45))
        arc = nb.ramp(nb.maprange(sx[2], 0.08, 0.6), [(0.0, hexc('#20ff8a')), (0.55, hexc('#30e0b0')), (1.0, hexc('#9a50ff'))])
        am = nb.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        am.inputs[0].default_value = 1.0
        nb.link(arc, am.inputs[6])
        bb = nb.node('ShaderNodeCombineColor')
        b3 = nb.math('MULTIPLY', band, 1.6)
        for i in range(3):
            nb.link(b3, bb.inputs[i])
        nb.link(bb.outputs[0], am.inputs[7])
        add = nb.node('ShaderNodeMix', data_type='RGBA', blend_type='ADD')
        add.inputs[0].default_value = 1.0
        nb.link(col, add.inputs[6])
        nb.link(am.outputs[2], add.inputs[7])
        col = add.outputs[2]
    nb.link(col, bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nb.link(bg.outputs[0], out.inputs['Surface'])
    return w


def sun(el, rot, energy=4.0, color='#fff4e0', angle=1.5):
    L = bpy.data.lights.new('sun', 'SUN')
    L.energy = energy
    L.color = hexc(color)[:3]
    L.angle = math.radians(angle)
    o = bpy.data.objects.new('sun', L)
    bpy.context.scene.collection.objects.link(o)
    # direction toward the sun, matched to the sky texture convention
    el_r, rot_r = math.radians(el), math.radians(rot)
    d = Vector((math.sin(rot_r) * math.cos(el_r), math.cos(rot_r) * math.cos(el_r), math.sin(el_r)))
    o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return o


def fog_volume(density, color='#ffffff', anis=0.3, size=(2400, 3600, 220), center=(0, 600, 60), height_falloff=None):
    m, nb, out = new_mat('fog')
    vol = nb.node('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = hexc(color)
    vol.inputs['Anisotropy'].default_value = anis
    if height_falloff:
        geo = nb.node('ShaderNodeNewGeometry')
        z = nb.sep(geo.outputs['Position'])[2]
        dens = nb.math('MULTIPLY', nb.maprange(z, height_falloff[0], height_falloff[1], 1.0, 0.0), density)
        nb.link(dens, vol.inputs['Density'])
    else:
        vol.inputs['Density'].default_value = density
    nb.link(vol.outputs[0], out.inputs['Volume'])
    m.cycles.volume_step_rate = 8.0
    mb = MB()
    mb.box(center, size, m)
    o = mb.obj('fog')
    o.visible_shadow = False
    return o


def dust_cloud(pos, fwd, length, width, height, color, density=0.6, n=3, seed=0):
    """Volumetric dust plume trailing behind a wheel position: soft ellipsoids with noisy density."""
    rnd = random.Random(seed)
    m, nb, out = new_mat('dustmat_%d' % seed)
    vol = nb.node('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = hexc(color)
    vol.inputs['Anisotropy'].default_value = 0.4
    tc = nb.node('ShaderNodeTexCoord')
    oc = tc.outputs['Object']
    vl = nb.node('ShaderNodeVectorMath', operation='LENGTH')
    nb.link(oc, vl.inputs[0])
    radial = nb.maprange(vl.outputs['Value'], 1.0, 0.25)
    ox = nb.sep(oc)[0]
    along = nb.maprange(ox, -1.0, 0.7, 0.15, 1.0)
    geo = nb.node('ShaderNodeNewGeometry')
    nz = nb.noise(geo.outputs['Position'], scale=0.45, detail=3, rough=0.6)
    dens = nb.math('MULTIPLY', nb.math('MULTIPLY', radial, along), nb.maprange(nz, 0.3, 0.68))
    m.cycles.volume_step_rate = 4.0
    nb.link(nb.math('MULTIPLY', dens, density), vol.inputs['Density'])
    nb.link(vol.outputs[0], out.inputs['Volume'])
    side = Vector((-fwd.y, fwd.x, 0))
    a = math.atan2(fwd.y, fwd.x)
    objs = []
    for i in range(n):
        t = i / max(1, n - 1)
        L = length * (0.45 + 0.55 * t)
        c = pos - fwd * (L * 0.5 + 0.3) + side * rnd.uniform(-0.4, 0.4) * width + Vector((0, 0, height * (0.35 + 0.4 * t)))
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        me = bpy.data.meshes.new('dust')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        o = bpy.data.objects.new('dust', me)
        bpy.context.scene.collection.objects.link(o)
        o.location = c
        o.rotation_euler = (0, -0.12, a)
        o.scale = (L * 0.5, width * (0.9 + t * 0.8), height * (0.6 + t * 0.7))
        o.visible_shadow = False
        objs.append(o)
    return objs


_dust_mats = {}


def dust_sprite_mat(color, opacity, seed):
    key = (color, round(opacity, 2), seed % 4)
    if key in _dust_mats:
        return _dust_mats[key]
    m, nb, out = new_mat('dustsprite')
    tc = nb.node('ShaderNodeTexCoord')
    oc = tc.outputs['Object']
    vl = nb.node('ShaderNodeVectorMath', operation='LENGTH')
    nb.link(oc, vl.inputs[0])
    radial = nb.maprange(vl.outputs['Value'], 1.0, 0.05)
    radial = nb.math('POWER', radial, 1.3)
    nz = nb.noise(nb.mapping(oc, loc=(seed * 3.1, seed * 1.7, 0)), scale=1.6, detail=5, rough=0.6)
    a = nb.math('MULTIPLY', nb.math('MULTIPLY', radial, nb.maprange(nz, 0.32, 0.7)), opacity)
    dif = nb.node('ShaderNodeBsdfDiffuse')
    dif.inputs['Color'].default_value = hexc(color)
    tr = nb.node('ShaderNodeBsdfTranslucent')
    tr.inputs['Color'].default_value = hexc(color)
    mixd = nb.node('ShaderNodeMixShader')
    mixd.inputs[0].default_value = 0.45
    nb.link(dif.outputs[0], mixd.inputs[1])
    nb.link(tr.outputs[0], mixd.inputs[2])
    tp = nb.node('ShaderNodeBsdfTransparent')
    mx = nb.node('ShaderNodeMixShader')
    nb.link(a, mx.inputs[0])
    nb.link(tp.outputs[0], mx.inputs[1])
    nb.link(mixd.outputs[0], mx.inputs[2])
    nb.link(mx.outputs[0], out.inputs['Surface'])
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        pass
    _dust_mats[key] = m
    return m


def dust_sprites(pos, fwd, length, width, height, color, opacity=0.5, n=14, seed=0):
    """Camera-facing dust billboards trailing behind a wheel position."""
    rnd = random.Random(seed)
    side = Vector((-fwd.y, fwd.x, 0))
    objs = []
    for i in range(n):
        t = (i + rnd.random() * 0.6) / n
        c = pos - fwd * (0.3 + t * length) + side * rnd.uniform(-1, 1) * width * (0.4 + t) + Vector((0, 0, height * (0.25 + t * 0.8) * rnd.uniform(0.7, 1.1)))
        r = (0.7 + t * 2.4) * width * rnd.uniform(0.8, 1.2)
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
        me = bpy.data.meshes.new('dustq')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(dust_sprite_mat(color, opacity * (1 - 0.55 * t), seed * 31 + i))
        o = bpy.data.objects.new('dustq', me)
        bpy.context.scene.collection.objects.link(o)
        o.location = c
        o.scale = (r, r * 0.75, 1)
        o.visible_shadow = False
        o['camface'] = 1
        objs.append(o)
    return objs


def face_camera(cam):
    for o in bpy.context.scene.objects:
        if o.get('camface'):
            d = cam.location - o.location
            o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
            o.rotation_euler.rotate_axis('Z', random.random() * TAU)


def debris(center, fwd, n, mat, size=(0.02, 0.07), spread=(5, 1.6, 1.3), seed=0, vel=None):
    """Chunks of mud/snow/stones thrown up behind a wheel; animated for motion blur."""
    rnd = random.Random(seed)
    side = Vector((-fwd.y, fwd.x, 0))
    mb = MB()
    for i in range(n):
        t = rnd.random()
        c = center - fwd * t * spread[0] + side * rnd.uniform(-1, 1) * spread[1] + Vector((0, 0, rnd.random() ** 0.7 * spread[2] * (0.3 + t)))
        mb.sphere(c, rnd.uniform(*size), mat, 1, scale=(rnd.uniform(0.6, 1.4), rnd.uniform(0.6, 1.4), rnd.uniform(0.5, 1.0)))
    o = mb.obj('debris')
    if vel is not None:
        o.keyframe_insert('location', frame=1)
        o.location = Vector(o.location) + vel / 24.0
        o.keyframe_insert('location', frame=2)
    return o


# ---------------------------------------------------------------- props
def rock_mesh(seed, mat):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    o = Vector((rnd.random() * 50, rnd.random() * 50, rnd.random() * 50))
    for v in bm.verts:
        n = noise.noise(v.co * 1.3 + o) * 0.35 + noise.noise(v.co * 4 + o) * 0.08
        v.co = v.co * (1 + n)
        v.co.z = v.co.z * 0.7 if v.co.z > 0 else v.co.z * 0.4
    me = bpy.data.meshes.new('rock')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    return me


def rock_material(color):
    m, nb, out = new_mat('rock')
    tc = nb.node('ShaderNodeTexCoord')
    n = nb.noise(tc.outputs['Object'], scale=2.5, detail=8)
    c = nb.mixc(nb.maprange(n, 0.3, 0.7), hexc(color), tuple(x * 0.55 for x in hexc(color)[:3]) + (1,))
    b = nb.node('ShaderNodeBump', in_Strength=0.6, in_Distance=0.1)
    nb.link(nb.noise(tc.outputs['Object'], scale=8, detail=6), b.inputs['Height'])
    p = principled(nb, color=c, rough=0.85, normal=b.outputs[0])
    nb.link(p.outputs[0], out.inputs[0])
    return m


def instance(me, loc, rot=(0, 0, 0), scale=(1, 1, 1), name='inst'):
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    return o


def tree_meshes(kind, seed=0):
    """Return a list of meshes for a tree type."""
    rnd = random.Random(seed)
    bark = mat_simple('bark', '#3a2a1e', rough=0.9)
    out = []
    if kind == 'pine':
        for k in range(3):
            leaf = mat_simple('pine%d' % k, ['#1f3a28', '#24402a', '#1a3324'][k], rough=0.85)
            snowm = mat_simple('snowpine', '#eef4f8', rough=0.6)
            mb = MB()
            mb.cyl((0, 0, 0), (0, 0, 2.5), 0.25, bark, 8)
            h = 14 + k * 3
            for i in range(6):
                z0 = 2 + i * (h - 3) / 6
                r = (6 - i) * 0.75 + 0.6
                mb.cyl((0, 0, z0), (0, 0, z0 + h / 4.2), r, leaf, 10, r1=0.15)
            out.append((mb, leaf, snowm))
        res = []
        for mb, leaf, snowm in out:
            res.append(mb_to_mesh(mb))
        return res
    if kind == 'broad':
        res = []
        for k in range(3):
            leaf = mat_leaf(['#2f5a24', '#3a6a2a', '#26501e'][k])
            mb = MB()
            h = 9 + k * 3
            mb.cyl((0, 0, 0), (0.3, 0.2, h), 0.45, bark, 8, r1=0.25)
            for i in range(9):
                c = (rnd.uniform(-3, 3), rnd.uniform(-3, 3), h + rnd.uniform(-1.5, 2.5))
                mb.sphere(c, rnd.uniform(2.2, 3.6), leaf, 2, scale=(1, 1, 0.75))
            res.append(mb_to_mesh(mb, displace=0.5))
        return res
    if kind == 'palm':
        res = []
        for k in range(3):
            leaf = mat_leaf('#3a6a2a')
            mb = MB()
            h = 8 + k * 2
            pts = [(math.sin(t / 6 * 1.2) * 1.6, 0, t / 6 * h) for t in range(7)]
            for a, b in zip(pts[:-1], pts[1:]):
                mb.cyl(a, b, 0.22, bark, 8, r1=0.2)
            top = Vector(pts[-1])
            for i in range(9):
                a = TAU * i / 9 + rnd.random() * 0.3
                prev = top
                for s in range(1, 6):
                    t = s / 5
                    p = top + Vector((math.cos(a) * t * 4.5, math.sin(a) * t * 4.5, 0.8 * math.sin(t * 2.5) - t * t * 2.2))
                    mb.cyl(prev, p, 0.55 * (1 - t * 0.6), leaf, 4, r1=0.5 * (1 - t * 0.7))
                    prev = p
            res.append(mb_to_mesh(mb, flatten_leaves=True))
        return res
    if kind == 'dead':
        res = []
        dk = mat_simple('deadwood', '#2e2a24', rough=0.95)
        moss = mat_simple('moss', '#5a6648', rough=0.95)
        for k in range(3):
            mb = MB()

            def br(p, d, L, r, depth):
                q = p + d * L
                mb.cyl(p, q, r, dk, 6, r1=r * 0.7)
                if depth > 0:
                    for _ in range(2):
                        nd = (d + Vector((rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), rnd.uniform(-0.1, 0.5)))).normalized()
                        br(q, nd, L * 0.7, r * 0.65, depth - 1)
                else:
                    mb.cyl(q, q + Vector((0, 0, -1.5)), 0.08, moss, 4, r1=0.02)
            br(Vector((0, 0, 0)), Vector((0, 0, 1)), 4 + k, 0.35, 4)
            res.append(mb_to_mesh(mb))
        return res
    if kind == 'cactus':
        res = []
        cm = mat_simple('cactus', '#4a6a36', rough=0.7)
        for k in range(3):
            mb = MB()
            h = 4 + k
            mb.cyl((0, 0, 0), (0, 0, h), 0.35, cm, 12)
            mb.sphere((0, 0, h), 0.35, cm, 2)
            for s in (-1, 1):
                z = h * rnd.uniform(0.35, 0.55)
                mb.cyl((0, 0, z), (s * 1.0, 0, z), 0.25, cm, 10)
                mb.cyl((s * 1.0, 0, z), (s * 1.0, 0, z + 1.5), 0.25, cm, 10)
                mb.sphere((s * 1.0, 0, z + 1.5), 0.25, cm, 2)
            res.append(mb_to_mesh(mb))
        return res
    if kind == 'fern':
        leaf = mat_leaf('#3f7a2e')
        mb = MB()
        for i in range(10):
            a = TAU * i / 10
            prev = Vector((0, 0, 0))
            for s in range(1, 5):
                t = s / 4
                p = Vector((math.cos(a) * t * 1.8, math.sin(a) * t * 1.8, 1.2 * math.sin(t * 2.2)))
                mb.cyl(prev, p, 0.28 * (1 - t * 0.5), leaf, 4)
                prev = p
        return [mb_to_mesh(mb, flatten_leaves=True)]
    return out


def mat_leaf(color):
    m, nb, out = new_mat('leaf')
    tc = nb.node('ShaderNodeTexCoord')
    n = nb.noise(tc.outputs['Object'], scale=3, detail=4)
    c = nb.mixc(nb.maprange(n, 0.3, 0.7), hexc(color), tuple(x * 1.6 for x in hexc(color)[:3]) + (1,))
    p = principled(nb, color=c, rough=0.7, sss=0.0, sheen=0.3)
    nb.link(p.outputs[0], out.inputs[0])
    return m


def mb_to_mesh(mb, displace=0.0, flatten_leaves=False):
    if displace:
        for v in mb.bm.verts:
            v.co += v.normal * noise.noise(v.co * 0.8) * displace
    me = bpy.data.meshes.new('tree')
    mb.bm.to_mesh(me)
    mb.bm.free()
    for m in mb.mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    return me


def scatter(terr, meshes, n, dmin, dmax, ymin, ymax, scale=(0.8, 1.3), seed=0, sink=0.2, avoid=None, side=0):
    rnd = random.Random(seed)
    t = terr.t
    placed = 0
    tries = 0
    while placed < n and tries < n * 20:
        tries += 1
        y = rnd.uniform(ymin, ymax)
        lat = rnd.uniform(dmin, dmax) * (side if side else rnd.choice((-1, 1)))
        p, fwd, sd = t.frame(y, lat)
        if avoid and avoid(p):
            continue
        z, trk = terr.height(p.x, p.y)
        if trk > 0.05:
            continue
        s = rnd.uniform(*scale)
        instance(rnd.choice(meshes), (p.x, p.y, z - sink * s), (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(0, TAU)), (s, s, s))
        placed += 1


# ---------------------------------------------------------------- landmarks
def mesa(loc, r, h, mat, seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    segs = 40
    rings = 14
    o = Vector((rnd.random() * 40, rnd.random() * 40, 0))
    rows = []
    for k in range(rings + 1):
        t = k / rings
        z = t * h
        row = []
        for i in range(segs):
            a = TAU * i / segs
            base = r * (1 + 0.25 * noise.noise(Vector((math.cos(a) * 1.5, math.sin(a) * 1.5, 0)) + o))
            taper = 1.0 + 0.9 * max(0.0, 0.25 - t) ** 1.5 * 6
            rr = base * taper * (1 + 0.04 * noise.noise(Vector((a * 3, z / 10, 0)) + o))
            row.append(bm.verts.new((loc[0] + math.cos(a) * rr, loc[1] + math.sin(a) * rr, loc[2] + z - 5)))
        rows.append(row)
    for k in range(rings):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
    bm.faces.new(rows[-1])
    me = bpy.data.meshes.new('mesa')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new('mesa', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesa_material():
    m, nb, out = new_mat('mesa')
    geo = nb.node('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    wave = nb.node('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
    wave.inputs['Scale'].default_value = 0.012
    wave.inputs['Distortion'].default_value = 6.0
    wave.inputs['Detail'].default_value = 4.0
    nb.link(pos, wave.inputs['Vector'])
    c = nb.ramp(wave.outputs['Fac'], [(0.0, hexc('#8e3e1e')), (0.4, hexc('#b8582c')), (0.7, hexc('#cf7a46')), (1.0, hexc('#a04a24'))])
    n = nb.noise(pos, scale=0.08, detail=8)
    c = nb.mixc(nb.math('MULTIPLY', nb.maprange(n, 0.4, 0.7), 0.4), c, hexc('#5a2a14'))
    b = nb.node('ShaderNodeBump', in_Strength=0.8, in_Distance=1.0)
    nb.link(nb.noise(pos, scale=0.3, detail=8), b.inputs['Height'])
    p = principled(nb, color=c, rough=0.9, normal=b.outputs[0])
    nb.link(p.outputs[0], out.inputs[0])
    return m


def water_plane(z, color='#1d4a5a', size=4000, center=(0, 600), rough=0.03, wave_scale=0.08, name='water'):
    m, nb, out = new_mat(name)
    geo = nb.node('ShaderNodeNewGeometry')
    b = nb.node('ShaderNodeBump', in_Strength=0.25, in_Distance=0.2)
    nb.link(nb.noise(nb.mapping(geo.outputs['Position'], scale=(1, 2.5, 1)), scale=wave_scale * 10, detail=6), b.inputs['Height'])
    p = principled(nb, color=hexc(color), rough=rough, normal=b.outputs[0], spec=0.6, coat=0.0)
    nb.link(p.outputs[0], out.inputs[0])
    mb = MB()
    mb.box((center[0], center[1], z - 0.5), (size, size, 1.0), m)
    return mb.obj('water')


def camera(loc, look, lens=30, dof=None, motion=None, sensor=36):
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_end = 6000
    cd.clip_start = 0.1
    o = bpy.data.objects.new('cam', cd)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    d = Vector(look) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o
    if dof:
        cd.dof.use_dof = True
        cd.dof.focus_distance = dof[0]
        cd.dof.aperture_fstop = dof[1]
    if motion is not None:
        o.keyframe_insert('location', frame=1)
        o.location = Vector(loc) + motion / 24.0
        o.keyframe_insert('location', frame=2)
    return o


def place_vehicle(root, track, terr, y, lat=0.0, air=0.0, pitch=0.0, roll=0.0, speed=30.0):
    p, fwd, side = track.frame(y, lat)
    a = math.atan2(fwd.y, fwd.x)
    # sample ground under front and rear to pitch the car with the terrain
    zf, _ = terr.height(*(p + fwd * 1.6).xy)
    zr, _ = terr.height(*(p - fwd * 1.6).xy)
    zl, _ = terr.height(*(p + side * 0.9).xy)
    zrr, _ = terr.height(*(p - side * 0.9).xy)
    z = (zf + zr) / 2
    gp = math.atan2(zf - zr, 3.2)
    gr = math.atan2(zl - zrr, 1.8)
    root.location = (p.x, p.y, z + air)
    root.rotation_mode = 'ZYX'
    root.rotation_euler = (roll + gr, -(gp + pitch), a)
    root.keyframe_insert('location', frame=1)
    root.location = Vector(root.location) + fwd * speed / 24.0
    root.keyframe_insert('location', frame=2)
    return p, fwd, side, z
