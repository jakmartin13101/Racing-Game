"""Weathered materials + texture baking + glTF export for the truck.

    /opt/bpyenv/bin/python tools/truck/bake.py [--size 2048] [--samples 8] [--preview]

Pipeline: build geometry (build.py) -> split glass/lamps -> join body ->
UV unwrap -> procedural weathering graphs (edge wear, dust, mud, rust,
decals) -> bake colour/roughness/metal/coat/normal/AO -> pack textures ->
export public/models/truck.glb + public/models/truck/*.{jpg,png}.
"""
import math
import os
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
import build  # noqa: E402
import decals  # noqa: E402
from nodes import NB  # noqa: E402

ASSETS = os.environ.get('ASSETS', '/tmp/assets')
PH = f'{ASSETS}/polyhaven/textures'
TEXOUT = os.path.join(build.OUT, 'truck')
WORK = os.environ.get('WORK', '/tmp/claude-0/truckbake')
os.makedirs(TEXOUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

args = sys.argv[1:]
SIZE = int(args[args.index('--size') + 1]) if '--size' in args else 2048
SAMPLES = int(args[args.index('--samples') + 1]) if '--samples' in args else 8
WSIZE = SIZE // 2

PAINT = (0.42, 0.075, 0.025)     # sun-faded rally red/orange (linear)
WHITE = (0.62, 0.6, 0.55)
DUST = (0.2, 0.17, 0.145)        # volcanic ash dust
MUD = (0.055, 0.042, 0.033)
STEEL = (0.5, 0.5, 0.52)

DEC = decals.make_all(WORK)
TEXS = {}


def ph(name, kind):
    return f'{PH}/{name}/{name}_{kind}_2k.jpg'


# ------------------------------------------------------------------ shared weathering
class Weather:
    """Builds the common masks once per material graph."""
    def __init__(self, g, dust=0.6, mud=0.6, wear=0.6, rust=0.2, scale=1.0):
        self.g = g
        x, y, z = g.xyz()
        self.x, self.y, self.z = x, y, z
        self.edge, self.bevelN = g.edge(0.01 * scale, 0.004, 0.06)
        self.cav = g.inv(g.ao(0.22))
        n1 = g.noise(2.2, 8, 0.6)
        n2 = g.noise(9.0, 6, 0.6)
        n3 = g.noise(38.0, 3, 0.5)
        self.n1, self.n2, self.n3 = n1, n2, n3
        # vertical gradient: ground-level grime fading by ~1.5 m
        low = g.ss(1.6, 0.55, z)
        self.low = low
        # proximity to the wheels for mud flung off the tyres
        near = 0.0
        for wy in (build.WYF, build.WYR):
            dy = g.sub(y, wy)
            dz = g.sub(z, build.WZ)
            d = g.math('SQRT', g.add(g.mul(dy, dy), g.mul(dz, dz)))
            near = g.maxf(near, g.ss(1.25, 0.55, d))
        self.near = near
        # dust: top-down and in cavities, broken by noise
        top = g.ss(0.2, 0.95, g.xyz(g.geom.outputs['Normal'])[2])
        dm = g.add(g.mul(low, 0.75), g.mul(self.cav, 0.9))
        dm = g.add(dm, g.mul(top, 0.25))
        dm = g.add(dm, g.mul(g.sub(n1, 0.5), 0.9))
        self.dust = g.mul(g.ss(0.35, 0.95, dm), dust)
        # mud splatter: sharp blobs, mostly low and behind wheels
        spl = g.noise(14.0, 10, 0.72, distortion=0.4)
        spl2 = g.ss(0.58, 0.64, g.add(spl, g.mul(g.sub(n2, 0.5), 0.3)))
        dens = g.add(g.mul(low, 0.6), g.mul(near, 0.8))
        self.mud = g.mul(g.mul(spl2, g.ss(0.3, 0.9, g.add(dens, g.mul(g.sub(n1, 0.5), 0.4)))), mud)
        self.mudH = g.mul(spl2, g.add(0.4, g.mul(n3, 0.6)))
        # edge wear: chips exposing primer / bare metal
        chips = g.ss(0.45, 0.62, g.add(n2, g.mul(n3, 0.35)))
        self.wear = g.mul(g.clamp01(g.mul(self.edge, g.add(chips, 0.15))), wear * 1.4)
        self.wear = g.clamp01(self.wear)
        # fine scratches
        sc = g.wave(6.0, 18.0, vec=g.vmul(g.obj, (1.0, 7.0, 1.0)))
        self.scr = g.mul(g.ss(0.9, 0.97, sc), g.mul(g.ss(0.4, 0.7, n1), 0.6))
        # rust in cavities near wear
        self.rust = g.mul(g.ss(0.45, 0.8, g.add(g.mul(self.cav, 0.8), g.mul(n2, 0.4))), rust)
        # photo-sourced detail textures (box projected)
        self.mudCol, _ = g.image(ph('brown_mud_03', 'diff'), scale=0.9)
        self.dustCol, _ = g.image(ph('rocky_trail_02', 'diff'), scale=0.7)
        self.rustCol, _ = g.image(ph('rust_coarse_01', 'diff'), scale=1.6)

    def finish(self, base, rough, metal, normal_extra=None, coat=0.0, bare=STEEL):
        g = self.g
        col = g.mixc(self.wear, base, g.mixc(self.n3, (0.18, 0.18, 0.19), bare))
        col = g.mixc(self.scr, col, g.mixc(0.5, col, (0.5, 0.48, 0.45)))
        col = g.mixc(self.rust, col, self.rustCol)
        dcol = g.mixc(0.45, self.dustCol, DUST)
        col = g.mixc(self.dust, col, dcol)
        mcol = g.mixc(0.55, self.mudCol, MUD)
        col = g.mixc(self.mud, col, mcol)
        r = g.mixf(self.wear, rough, 0.45)
        r = g.mixf(self.rust, r, 0.85)
        r = g.mixf(self.dust, r, 0.93)
        r = g.mixf(self.mud, r, 0.62)
        m = g.mixf(self.wear, metal, 0.85)
        m = g.mul(m, g.inv(g.maxf(self.dust, self.mud)))
        h = g.add(g.mul(self.mudH, g.mul(self.mud, 1.0)), g.mul(self.dust, g.mul(self.n3, 0.25)))
        h = g.sub(h, g.mul(self.wear, 0.3))
        nrm = g.bump(h, 0.6, 0.004, normal=self.bevelN)
        if normal_extra is not None:
            nrm = g.bump(normal_extra, 0.25, 0.002, normal=nrm)
        g.principled(col, r, m, nrm)
        g.metal_out = m
        cl = g.mul(coat, g.inv(g.maxf(g.maxf(self.dust, self.mud), self.wear))) if coat else 0.0
        g.coat_out = cl
        return col


def decal(g, w, path, u, v, mask):
    col, a = g.image(path, vec=g.vec(u, v, 0.0), box=False, clip=True)
    a = g.mul(a, mask)
    return col, a


def mat_paint(m):
    g = NB(m)
    W = Weather(g, dust=0.75, mud=0.85, wear=0.55, rust=0.15)
    x, y, z = W.x, W.y, W.z
    nx, ny, nz = g.xyz(g.onormal)
    ax = g.absf(x)
    # livery: white twin stripes over hood/roof/tailgate, black rocker band
    stripes = g.mul(g.ss(0.06, 0.065, ax), g.ss(0.24, 0.235, ax))
    stripes = g.mul(stripes, g.ss(0.35, 0.55, nz))
    base = g.mixc(stripes, PAINT, WHITE)
    rocker = g.mul(g.ss(0.98, 0.975, z), g.ss(0.5, 0.7, g.absf(nx)))
    base = g.mixc(rocker, base, (0.02, 0.02, 0.02))
    band = g.mul(g.mul(g.ss(1.17, 1.175, z), g.ss(1.235, 1.23, z)), g.ss(0.5, 0.7, g.absf(nx)))
    base = g.mixc(band, base, WHITE)
    side = g.ss(0.55, 0.75, g.absf(nx))
    left = g.lt(x, 0.0)
    # door number: y -0.15..0.75, z 0.93..1.38 (u flips on the left side)
    u = g.remap(y, -0.18, 0.78, 0.0, 1.0, False)
    u = g.mixf(left, u, g.inv(u))
    v = g.remap(z, 0.92, 1.4, 0.0, 1.0, False)
    dc, da = decal(g, 0, DEC['door'], u, v, side)
    base = g.mixc(da, base, dc)
    # bed side sponsor
    u2 = g.remap(y, -2.42, -0.62, 0.0, 1.0, False)
    u2 = g.mixf(left, u2, g.inv(u2))
    v2 = g.remap(z, 0.98, 1.41, 0.0, 1.0, False)
    bc, ba = decal(g, 0, DEC['bed'], u2, v2, side)
    base = g.mixc(ba, base, bc)
    # roof number
    u3 = g.remap(x, -0.26, 0.26, 0.0, 1.0, False)
    v3 = g.remap(y, -0.34, 0.18, 0.0, 1.0, False)
    rc, ra = decal(g, 0, DEC['roof'], u3, v3, g.mul(g.ss(0.8, 0.9, nz), g.gt(z, 1.95)))
    base = g.mixc(ra, base, rc)
    # sun-faded / chalky paint variation
    base = g.mixc(g.mul(W.n1, 0.35), base, g.hsv(base, 0.5, 0.75, 1.15))
    W.finish(base, g.mixf(W.n2, 0.28, 0.42), 0.0, coat=1.0, bare=(0.3, 0.3, 0.31))
    return g


def mat_simple(m, base, rough, metal, dust=0.7, mud=0.6, wear=0.4, rust=0.2, coat=0.0, bare=STEEL):
    g = NB(m)
    W = Weather(g, dust=dust, mud=mud, wear=wear, rust=rust)
    b = g.mixc(g.mul(W.n2, 0.25), base, g.hsv(g.rgb(base), 0.5, 0.9, 1.25))
    W.finish(b, rough, metal, coat=coat, bare=bare)
    return g


def mat_tyre(m):
    g = NB(m)
    W = Weather(g, dust=0.0, mud=0.0, wear=0.0)
    # tyres: ash dust settles into the sidewall and tread grooves, tread tops scrubbed clean
    x, y, z = W.x, W.y, W.z
    r = g.math('SQRT', g.add(g.mul(y, y), g.mul(z, z)))
    tread = g.ss(0.455, 0.475, r)
    groove = g.ss(0.35, 0.8, W.cav)
    dust = g.clamp01(g.add(g.mul(g.inv(tread), 0.55), g.mul(groove, 0.8)))
    dust = g.mul(dust, g.ss(0.2, 0.7, g.add(W.n1, 0.2)))
    base = g.mixc(g.mul(W.n3, 0.3), (0.018, 0.018, 0.018), (0.03, 0.029, 0.028))
    col = g.mixc(dust, base, g.mixc(0.5, W.dustCol, DUST))
    rough = g.mixf(dust, 0.8, 0.95)
    nrm = g.bump(g.mul(W.n3, 0.5), 0.3, 0.002, normal=W.bevelN)
    g.principled(col, rough, 0.0, nrm)
    g.metal_out = 0.0
    g.coat_out = 0.0
    return g


def mat_rim(m):
    g = NB(m)
    W = Weather(g, dust=0.55, mud=0.35, wear=0.2, rust=0.0)
    brake = g.mul(W.cav, 0.6)
    base = g.mixc(brake, (0.62, 0.62, 0.64), (0.1, 0.09, 0.085))
    W.finish(base, 0.32, 1.0, bare=(0.8, 0.8, 0.82))
    return g


def mat_glass(m):
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF'] if 'Principled BSDF' in m.node_tree.nodes else None


MAT_BUILDERS = {
    'paint': mat_paint,
    'chassis': lambda m: mat_simple(m, (0.03, 0.03, 0.032), 0.5, 0.3, dust=0.9, mud=0.9, wear=0.6, rust=0.35),
    'metal': lambda m: mat_simple(m, (0.55, 0.55, 0.57), 0.25, 1.0, dust=0.6, mud=0.5, wear=0.1, rust=0.05),
    'plastic': lambda m: mat_simple(m, (0.025, 0.025, 0.026), 0.62, 0.0, dust=0.8, mud=0.6, wear=0.2, rust=0.0,
                                    bare=(0.06, 0.06, 0.06)),
    'rubber': lambda m: mat_simple(m, (0.02, 0.02, 0.02), 0.9, 0.0, dust=0.9, mud=0.9, wear=0.0, rust=0.0),
    'seat': lambda m: mat_simple(m, (0.03, 0.03, 0.035), 0.95, 0.0, dust=0.35, mud=0.0, wear=0.15, rust=0.0,
                                 bare=(0.08, 0.08, 0.08)),
    'flag': lambda m: mat_simple(m, (0.9, 0.3, 0.01), 0.8, 0.0, dust=0.3, mud=0.0, wear=0.0, rust=0.0),
    'rim': mat_rim,
    'ground': None,
}


# ------------------------------------------------------------------ helpers
def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def join(objs, name):
    for o in objs:
        build.apply_all(o)
        if not o.data.materials or any(m is None for m in o.data.materials):
            if not o.data.materials:
                o.data.materials.append(build.MATS['chassis'])
            for i, m in enumerate(o.data.materials):
                if m is None:
                    o.data.materials[i] = build.MATS['chassis']
    select_only(objs)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def split_by_material(ob, names):
    """Move faces using any of the given material names into a new object."""
    idx = [i for i, m in enumerate(ob.data.materials) if m and m.name in names]
    if not idx:
        return None
    select_only([ob])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in ob.data.polygons:
        p.select = p.material_index in idx
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.selected_objects if o != ob][0]
    return new


def unwrap(ob, margin=0.0015, angle=62):
    select_only([ob])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def new_image(name, size, noncolor=True, alpha=False):
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=False)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    return img


def set_targets(ob, img):
    for m in ob.data.materials:
        nt = m.node_tree
        n = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE_TARGET'
        n.image = img
        nt.nodes.active = n


def emit_swap(ob, attr):
    """Temporarily route a scalar (metal_out / coat_out) to emission for baking."""
    saved = []
    for m in ob.data.materials:
        nt = m.node_tree
        out = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
        prev = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        em = nt.nodes.new('ShaderNodeEmission')
        src = getattr(m, '_' + attr, None)
        g = MATGRAPH.get(m.name)
        val = getattr(g, attr, 0.0) if g else 0.0
        if isinstance(val, bpy.types.NodeSocket):
            nt.links.new(val, em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = (val, val, val, 1)
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        saved.append((nt, out, prev, em))
    return saved


def emit_restore(saved):
    for nt, out, prev, em in saved:
        if prev is not None:
            nt.links.new(prev, out.inputs['Surface'])
        nt.nodes.remove(em)


def bake(ob, kind, img, samples=SAMPLES, **kw):
    sc = bpy.context.scene
    sc.cycles.samples = samples
    set_targets(ob, img)
    select_only([ob])
    print('bake', ob.name, kind, img.name, flush=True)
    bpy.ops.object.bake(type=kind, margin=8, use_clear=True, **kw)


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def save_np(arr, path, quality=90):
    from PIL import Image
    a = np.clip(arr, 0, 1)
    a = (a[::-1] * 255 + 0.5).astype(np.uint8)  # blender images are bottom-up
    im = Image.fromarray(a)
    if path.endswith('.jpg'):
        im.convert('RGB').save(path, quality=quality)
    else:
        im.save(path, optimize=True)
    print('saved', path)


MATGRAPH = {}


def build_graphs(ob):
    for m in ob.data.materials:
        if m is None or m.name in MATGRAPH:
            continue
        fn = MAT_BUILDERS.get(m.name)
        if m.name.startswith('tyre'):
            fn = mat_tyre
        if fn is None:
            continue
        MATGRAPH[m.name] = fn(m)


def bake_set(ob, prefix, size, coat=True):
    col = new_image(prefix + '_col', size, noncolor=False)
    rough = new_image(prefix + '_rough', size)
    metal = new_image(prefix + '_metal', size)
    nrm = new_image(prefix + '_nrm', size)
    ao = new_image(prefix + '_ao', size)
    bake(ob, 'DIFFUSE', col, 1, pass_filter={'COLOR'})
    bake(ob, 'ROUGHNESS', rough, 1)
    s = emit_swap(ob, 'metal_out'); bake(ob, 'EMIT', metal, 1); emit_restore(s)
    cimg = None
    if coat:
        cimg = new_image(prefix + '_coat', size)
        s = emit_swap(ob, 'coat_out'); bake(ob, 'EMIT', cimg, 1); emit_restore(s)
    bake(ob, 'NORMAL', nrm, max(4, SAMPLES // 2), normal_space='TANGENT')
    bake(ob, 'AO', ao, max(16, SAMPLES * 2))
    C = pixels(col)[..., :3]
    R = pixels(rough)[..., 0]
    M = pixels(metal)[..., 0]
    A = pixels(ao)[..., 0]
    N = pixels(nrm)[..., :3]
    K = pixels(cimg)[..., 0] if cimg else np.zeros_like(R)
    # colour is baked linear in a sRGB image; blender stores the float view
    # already in sRGB space for 8-bit sRGB images.
    save_np(C, f'{TEXOUT}/{prefix}_col.jpg', 92)
    save_np(np.stack([A, R, M], -1), f'{TEXOUT}/{prefix}_orm.jpg', 92)
    save_np(N, f'{TEXOUT}/{prefix}_nrm.png')
    save_np(np.stack([K, K, K], -1), f'{TEXOUT}/{prefix}_coat.jpg', 90)


# ------------------------------------------------------------------ main
def main():
    P = build.build_all()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.bake.use_selected_to_active = False

    # rename tyre/rim materials so wheel atlas graphs are distinct from spare copies
    shell = P['shell']
    # paint the inside of the wheel arch cuts dark
    me = shell.data
    me.materials.append(build.MATS['chassis'])
    ci = len(me.materials) - 1
    for p in me.polygons:
        c = p.center
        for wy in (build.WYF, build.WYR):
            if math.hypot(c.y - wy, c.z - (build.WZ + 0.1)) < 0.668 and p.normal.x ** 2 < 0.7:
                p.material_index = ci
    # glass out of the cab
    cab = P['cab']
    body_parts = [shell, cab, *P['chassis'], *P['spares']]
    lights, glass = [], []
    for o in P['details']:
        mn = o.data.materials[0].name if o.data.materials else ''
        if mn in ('lens', 'lamp', 'tail'):
            lights.append(o)
        elif mn == 'glass':
            glass.append(o)
        else:
            body_parts.append(o)
    for o in list(bpy.data.objects):
        if o.name.startswith('rear_glass'):
            glass.append(o)
        if o.name.startswith('rear_seal'):
            body_parts.append(o)
    body = join(body_parts, 'body')
    g2 = split_by_material(body, {'glass'})
    if g2:
        glass.append(g2)
    glass_ob = join(glass, 'glass') if len(glass) > 1 else glass[0]
    lights_ob = join(lights, 'lights')
    # wheels: join tyre+rim, unwrap the first and share its mesh
    wheel_obs = []
    tyre_mat = build.MATS['rubber'].copy(); tyre_mat.name = 'tyre'
    rim_mat = build.MATS['rim'].copy(); rim_mat.name = 'wheelrim'
    MAT_BUILDERS['wheelrim'] = mat_rim
    for name, t, r in P['wheels']:
        t.data.materials[0] = tyre_mat
        r.data.materials[0] = rim_mat
        wloc = Vector(t.location)
        w = join([t, r], name)
        wheel_obs.append((name, w, wloc))
    w0 = wheel_obs[1][1]  # FR (unmirrored)
    unwrap(w0, 0.003, 66)
    for name, w, loc in wheel_obs:
        if w is w0:
            continue
        mirrored = loc.x < 0
        d = w0.data.copy()
        if mirrored:
            d.transform(Matrix.Rotation(math.pi, 4, 'Z'))
            d.flip_normals() if False else None
        w.data = d
    unwrap(body, 0.0012, 62)
    build_graphs(body)
    build_graphs(w0)
    print('materials', list(MATGRAPH))
    bake_set(body, 'body', SIZE)
    bake_set(w0, 'wheel', WSIZE, coat=False)
    export(body, glass_ob, lights_ob, [w for _, w, _ in wheel_obs])


def export(body, glass, lights, wheels):
    # final simple materials (textures are bound in-engine by name)
    def simple(name, color=(0.8, 0.8, 0.8), alpha=1.0, emit=None):
        m = bpy.data.materials.get(name + '_x') or bpy.data.materials.new(name + '_x')
        m.use_nodes = True
        m.name = name
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*color, 1)
        if emit:
            p.inputs['Emission Color'].default_value = (*emit, 1)
            p.inputs['Emission Strength'].default_value = 1.0
        return m
    for ob, mname in ((body, 'body'), *[(w, 'wheel') for w in wheels]):
        ob.data.materials.clear()
        ob.data.materials.append(simple(mname))
    glass.data.materials.clear(); glass.data.materials.append(simple('glass', (0.02, 0.02, 0.02)))
    for i, m in enumerate(lights.data.materials):
        lights.data.materials[i] = simple('light_' + m.name, (0.9, 0.9, 0.9))
    # move to physics origin, face +Z in glTF
    rot = Matrix.Rotation(math.pi, 4, 'Z')
    sh = Matrix.Translation((0, 0, -build.ORIGIN_Z))
    for ob in (body, glass, lights):
        ob.data.transform(rot @ sh @ ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
    for w in wheels:
        loc = (rot @ sh) @ w.location
        w.data.transform(rot)
        w.location = loc
        w.rotation_euler = (0, 0, 0)
    # remove helpers
    keep = {body, glass, lights, *wheels}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    path = os.path.join(build.OUT, 'truck.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_materials='EXPORT', export_image_format='NONE',
                              export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
                              export_tangents=False, use_selection=False)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'truck_baked.blend'))
    print('exported', path)


if __name__ == '__main__':
    main()
