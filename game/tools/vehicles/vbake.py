"""Weathering, texture baking, glTF export and showroom render for one vehicle.

    python tools/vehicles/make.py <id> [--size 2048] [--samples 8] [--nobake] [--preview]

Same pipeline as the truck (tools/truck/bake.py): build geometry -> split glass and
lamps -> join the body -> UV unwrap -> procedural weathering graphs (edge wear, ash
dust, mud, rust, livery, decals) -> bake colour / roughness / metal / coat / normal /
AO -> pack textures -> export public/models/vehicles/<id>.glb and
public/models/vehicles/<id>/{body,wheel}_{col,orm,nrm,coat}.*
"""
import json
import math
import os
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'truck'))
import kit  # noqa: E402
import livery  # noqa: E402
from nodes import NB  # noqa: E402

ASSETS = os.environ.get('ASSETS', '/mnt/project-files/assets')
PH = f'{ASSETS}/polyhaven/textures'
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'public', 'models', 'vehicles'))
WORKROOT = os.environ.get('WORK', '/tmp/claude-0/vehbake')

DUST = (0.2, 0.17, 0.145)
MUD = (0.055, 0.042, 0.033)
STEEL = (0.5, 0.5, 0.52)


def ph(name, kind):
    return f'{PH}/{name}/{name}_{kind}_2k.jpg'


class Weather:
    """Common weathering masks, per material graph (as the truck's)."""
    def __init__(self, g, meta, dust=0.6, mud=0.6, wear=0.6, rust=0.2, scale=1.0, grime=1.0):
        self.g = g
        x, y, z = g.xyz()
        self.x, self.y, self.z = x, y, z
        self.edge, self.bevelN = g.edge(0.008 * scale, 0.004, 0.06)
        self.cav = g.inv(g.ao(0.18 * scale))
        n1 = g.noise(2.2, 8, 0.6)
        n2 = g.noise(9.0, 6, 0.6)
        n3 = g.noise(38.0, 3, 0.5)
        self.n1, self.n2, self.n3 = n1, n2, n3
        H = meta['height']
        low = g.ss(H * 0.75, H * 0.25, z)
        self.low = low
        near = 0.0
        for wy, wz, wr in meta['wheel_yz']:
            dy = g.sub(y, wy)
            dz = g.sub(z, wz)
            d = g.math('SQRT', g.add(g.mul(dy, dy), g.mul(dz, dz)))
            near = g.maxf(near, g.ss(wr * 2.5, wr * 1.05, d))
        self.near = near
        top = g.ss(0.2, 0.95, g.xyz(g.geom.outputs['Normal'])[2])
        dm = g.add(g.mul(low, 0.75), g.mul(self.cav, 0.9))
        dm = g.add(dm, g.mul(top, 0.25))
        dm = g.add(dm, g.mul(g.sub(n1, 0.5), 0.9))
        self.dust = g.mul(g.ss(0.35, 0.95, dm), dust * grime)
        spl = g.noise(16.0, 10, 0.72, distortion=0.4)
        spl2 = g.ss(0.58, 0.64, g.add(spl, g.mul(g.sub(n2, 0.5), 0.3)))
        dens = g.add(g.mul(low, 0.6), g.mul(near, 0.9))
        self.mud = g.mul(g.mul(spl2, g.ss(0.3, 0.9, g.add(dens, g.mul(g.sub(n1, 0.5), 0.4)))), mud * grime)
        self.mudH = g.mul(spl2, g.add(0.4, g.mul(n3, 0.6)))
        chips = g.ss(0.45, 0.62, g.add(n2, g.mul(n3, 0.35)))
        self.wear = g.clamp01(g.mul(g.clamp01(g.mul(self.edge, g.add(chips, 0.15))), wear * 1.4))
        sc = g.wave(6.0, 18.0, vec=g.vmul(g.obj, (1.0, 7.0, 1.0)))
        self.scr = g.mul(g.ss(0.9, 0.97, sc), g.mul(g.ss(0.4, 0.7, n1), 0.6))
        self.rust = g.mul(g.ss(0.45, 0.8, g.add(g.mul(self.cav, 0.8), g.mul(n2, 0.4))), rust)
        self.mudCol, _ = g.image(ph('brown_mud_03', 'diff'), scale=0.9)
        self.dustCol, _ = g.image(ph('rocky_trail_02', 'diff'), scale=0.7)
        self.rustCol, _ = g.image(ph('rust_coarse_01', 'diff'), scale=1.6)

    def finish(self, base, rough, metal, coat=0.0, bare=STEEL):
        g = self.g
        col = g.mixc(self.wear, base, g.mixc(self.n3, (0.18, 0.18, 0.19), bare))
        col = g.mixc(self.scr, col, g.mixc(0.5, col, (0.5, 0.48, 0.45)))
        col = g.mixc(self.rust, col, self.rustCol)
        col = g.mixc(self.dust, col, g.mixc(0.45, self.dustCol, DUST))
        col = g.mixc(self.mud, col, g.mixc(0.55, self.mudCol, MUD))
        r = g.mixf(self.wear, rough, 0.45)
        r = g.mixf(self.rust, r, 0.85)
        r = g.mixf(self.dust, r, 0.93)
        r = g.mixf(self.mud, r, 0.62)
        m = g.mixf(self.wear, metal, 0.85)
        m = g.mul(m, g.inv(g.maxf(self.dust, self.mud)))
        h = g.add(self.mudH and g.mul(self.mudH, self.mud), g.mul(self.dust, g.mul(self.n3, 0.25)))
        h = g.sub(h, g.mul(self.wear, 0.3))
        nrm = g.bump(h, 0.6, 0.004, normal=self.bevelN)
        g.principled(col, r, m, nrm)
        g.metal_out = m
        g.coat_out = g.mul(coat, g.inv(g.maxf(g.maxf(self.dust, self.mud), self.wear))) if coat else 0.0
        return col


def decal(g, path, u, v, mask):
    col, a = g.image(path, vec=g.vec(u, v, 0.0), box=False, clip=True)
    return col, g.mul(a, mask)


def livery_base(g, W, spec, meta, plastic=False):
    """Paint scheme from the spec, in object space."""
    x, y, z = W.x, W.y, W.z
    nx, ny, nz = g.xyz(g.onormal)
    ax = g.absf(x)
    c1, c2, c3 = spec['c1'], spec['c2'], spec['c3']
    base = g.rgb(c1)
    kind = spec.get('livery', 'stripes')
    hx = meta['half_width']
    H = meta['height']
    L0, L1 = meta['ymin'], meta['ymax']
    side = g.ss(0.5, 0.75, g.absf(nx))
    top = g.ss(0.35, 0.6, nz)
    if kind in ('stripes', 'stripes_band'):
        s0, s1 = hx * 0.08, hx * 0.24
        st = g.mul(g.mul(g.ss(s0, s0 + 0.006, ax), g.ss(s1, s1 - 0.006, ax)), top)
        base = g.mixc(st, base, c2)
    if kind in ('split', 'stripes_band', 'band'):
        zs = meta.get('zsplit', H * 0.45)
        if kind == 'split':
            lowm = g.ss(zs + 0.004, zs - 0.004, z)
            base = g.mixc(lowm, base, c2)
            pin = g.mul(g.mul(g.ss(zs + 0.012, zs + 0.016, z), g.ss(zs + 0.034, zs + 0.03, z)), side)
            base = g.mixc(pin, base, c3)
        else:
            zb0, zb1 = meta.get('band', (zs - 0.05, zs + 0.05))
            bandm = g.mul(g.mul(g.ss(zb0, zb0 + 0.004, z), g.ss(zb1, zb1 - 0.004, z)), side)
            base = g.mixc(bandm, base, c2)
            pin = g.mul(g.mul(g.ss(zb1 + 0.012, zb1 + 0.016, z), g.ss(zb1 + 0.03, zb1 + 0.026, z)), side)
            base = g.mixc(pin, base, c3)
    if kind == 'slash':
        t = g.add(g.mul(g.sub(y, (L0 + L1) / 2), 0.55), z)
        zc = meta.get('zsplit', H * 0.5)
        sl = g.mul(g.ss(zc - 0.12, zc - 0.11, t), g.ss(zc + 0.08, zc + 0.07, t))
        base = g.mixc(sl, base, c2)
        sl2 = g.mul(g.ss(zc + 0.1, zc + 0.11, t), g.ss(zc + 0.15, zc + 0.14, t))
        base = g.mixc(sl2, base, c3)
    if kind == 'camo':
        v1 = g.noise(3.2, 2, 0.5, distortion=0.6)
        v2 = g.noise(6.5, 2, 0.5, distortion=0.4)
        base = g.mixc(g.ss(0.53, 0.55, v1), base, c2)
        base = g.mixc(g.ss(0.6, 0.62, v2), base, c3)
    if kind == 'fade':
        t = g.remap(y, L0, L1, 0.0, 1.0)
        f = g.ss(0.35, 0.65, g.add(t, g.mul(g.sub(W.n2, 0.5), 0.15)))
        base = g.mixc(f, c2, base)
        sp = g.mul(g.ss(0.69, 0.7, g.noise(60.0, 1, 0.5)), g.mul(f, g.inv(f)))
        base = g.mixc(g.mul(sp, 4.0), base, c3)
    if kind == 'check':
        cx = g.math('FLOOR', g.mul(y, 7.0)); cz = g.math('FLOOR', g.mul(z, 7.0))
        par = g.math('MODULO', g.add(cx, cz), 2.0)
        zone = g.mul(g.ss(L0 + (L1 - L0) * 0.72, L0 + (L1 - L0) * 0.73, y), side)
        base = g.mixc(g.mul(g.absf(par), zone), base, c2)
    # rocker / lower-edge darkening on painted bodies
    if not plastic and spec.get('rocker', True):
        zr = meta.get('rocker', H * 0.18)
        rk = g.mul(g.ss(zr + 0.004, zr - 0.004, z), side)
        base = g.mixc(rk, base, (0.02, 0.02, 0.02))
    # decals
    left = g.lt(x, 0.0)
    for d in meta.get('decals', []):
        if d.get('mat', 'paint') != ('plastic2' if plastic else 'paint'):
            continue
        img = DEC[d['img']]
        (cu, cv), (w, h) = d['c'], d['size']
        if d['axis'] == 'side':
            u = g.remap(y, cu - w / 2, cu + w / 2, 0.0, 1.0, False)
            u = g.mixf(left, u, g.inv(u))
            v = g.remap(z, cv - h / 2, cv + h / 2, 0.0, 1.0, False)
            m = g.ss(0.45, 0.7, g.absf(nx))
            if 'xmin' in d:
                m = g.mul(m, g.gt(ax, d['xmin']))
        elif d['axis'] == 'front':
            u = g.remap(x, cu + w / 2, cu - w / 2, 0.0, 1.0, False)
            v = g.remap(z, cv - h / 2, cv + h / 2, 0.0, 1.0, False)
            m = g.ss(0.45, 0.7, ny)
            if 'ymin' in d:
                m = g.mul(m, g.gt(y, d['ymin']))
        elif d['axis'] == 'back':
            u = g.remap(x, cu - w / 2, cu + w / 2, 0.0, 1.0, False)
            v = g.remap(z, cv - h / 2, cv + h / 2, 0.0, 1.0, False)
            m = g.ss(-0.45, -0.7, ny)
        else:  # top
            u = g.remap(x, cu - w / 2, cu + w / 2, 0.0, 1.0, False)
            v = g.remap(y, cv - h / 2, cv + h / 2, 0.0, 1.0, False)
            m = g.ss(0.6, 0.85, nz)
            if 'zmin' in d:
                m = g.mul(m, g.gt(z, d['zmin']))
        dc, da = decal(g, img, u, v, m)
        base = g.mixc(da, base, dc)
    # sun-faded / chalky variation
    base = g.mixc(g.mul(W.n1, 0.3), base, g.hsv(base, 0.5, 0.78, 1.12))
    return base


DEC = {}


def make_builders(spec, meta):
    grime = spec.get('grime', 1.0)

    def W(g, **kw):
        kw.setdefault('grime', grime)
        return Weather(g, meta, **kw)

    def mat_paint(m):
        g = NB(m)
        w = W(g, dust=0.75, mud=0.85, wear=0.5, rust=0.12)
        base = livery_base(g, w, spec, meta)
        w.finish(base, g.mixf(w.n2, 0.26, 0.4), 0.0, coat=1.0, bare=(0.3, 0.3, 0.31))
        return g

    def mat_plastic2(m):
        g = NB(m)
        w = W(g, dust=0.8, mud=0.95, wear=0.35, rust=0.0)
        base = livery_base(g, w, spec, meta, plastic=True)
        # moulded plastic: scuffs go whitish, not to metal
        w.finish(base, g.mixf(w.n2, 0.36, 0.5), 0.0, coat=0.35, bare=g.hsv(base, 0.5, 0.4, 1.6))
        return g

    def mat_simple(base, rough, metal, dust=0.7, mud=0.6, wear=0.4, rust=0.2, coat=0.0, bare=STEEL):
        def f(m):
            g = NB(m)
            w = W(g, dust=dust, mud=mud, wear=wear, rust=rust)
            b = g.mixc(g.mul(w.n2, 0.25), base, g.hsv(g.rgb(base), 0.5, 0.9, 1.25))
            w.finish(b, rough, metal, coat=coat, bare=bare)
            return g
        return f

    def mat_tyre(m):
        g = NB(m)
        w = W(g, dust=0.0, mud=0.0, wear=0.0)
        nx, _, _ = g.xyz(g.onormal)
        tread = g.ss(0.5, 0.2, g.absf(nx))
        groove = g.ss(0.35, 0.8, w.cav)
        dust = g.clamp01(g.add(g.mul(g.inv(tread), 0.5), g.mul(groove, 0.85)))
        dust = g.mul(dust, g.ss(0.2, 0.7, g.add(w.n1, 0.2)))
        dust = g.mul(dust, min(1.3, 0.6 + 0.5 * grime))
        mudm = g.mul(g.ss(0.6, 0.7, g.noise(7.0, 6, 0.7)), 0.6 * spec.get('mud_tyres', 0.5))
        base = g.mixc(g.mul(w.n3, 0.3), (0.018, 0.018, 0.018), (0.03, 0.029, 0.028))
        col = g.mixc(dust, base, g.mixc(0.5, w.dustCol, DUST))
        col = g.mixc(mudm, col, g.mixc(0.55, w.mudCol, MUD))
        rough = g.mixf(dust, 0.8, 0.95)
        nrm = g.bump(g.add(g.mul(w.n3, 0.5), mudm), 0.3, 0.002, normal=w.bevelN)
        g.principled(col, rough, 0.0, nrm)
        g.metal_out = 0.0
        g.coat_out = 0.0
        return g

    def mat_rim(m):
        g = NB(m)
        w = W(g, dust=0.55, mud=0.4, wear=0.25, rust=0.0)
        rc = spec.get('rim', (0.62, 0.62, 0.64))
        metal = spec.get('rim_metal', 1.0)
        base = g.mixc(g.mul(w.cav, 0.6), rc, (0.1, 0.09, 0.085))
        w.finish(base, spec.get('rim_rough', 0.32), metal, bare=(0.8, 0.8, 0.82))
        return g

    fr = spec.get('frame', spec['c3'])
    return {
        'paint': mat_paint,
        'plastic2': mat_plastic2,
        'frame': mat_simple(fr, 0.35, 0.0, dust=0.8, mud=0.8, wear=0.45, rust=0.05, coat=0.6, bare=(0.4, 0.4, 0.42)),
        'chassis': mat_simple((0.03, 0.03, 0.032), 0.5, 0.3, dust=0.9, mud=0.9, wear=0.6, rust=0.35),
        'metal': mat_simple((0.55, 0.55, 0.57), 0.25, 1.0, dust=0.6, mud=0.5, wear=0.1, rust=0.05),
        'alloy': mat_simple((0.66, 0.66, 0.68), 0.33, 1.0, dust=0.7, mud=0.6, wear=0.05, rust=0.0),
        'chrome': mat_simple((0.85, 0.85, 0.87), 0.1, 1.0, dust=0.4, mud=0.3, wear=0.0, rust=0.1),
        'engine': mat_simple((0.16, 0.16, 0.165), 0.45, 0.8, dust=0.9, mud=0.6, wear=0.2, rust=0.25),
        'plastic': mat_simple((0.025, 0.025, 0.026), 0.62, 0.0, dust=0.8, mud=0.7, wear=0.2, rust=0.0, bare=(0.06, 0.06, 0.06)),
        'rubber': mat_simple((0.02, 0.02, 0.02), 0.9, 0.0, dust=0.9, mud=0.9, wear=0.0, rust=0.0),
        'seat': mat_simple(spec.get('seat', (0.03, 0.03, 0.035)), 0.85, 0.0, dust=0.35, mud=0.1, wear=0.15, rust=0.0, bare=(0.08, 0.08, 0.08)),
        'canvas': mat_simple(spec.get('canvas', (0.05, 0.05, 0.045)), 0.95, 0.0, dust=0.8, mud=0.3, wear=0.0, rust=0.0),
        'flag': mat_simple(spec.get('flag', (0.9, 0.3, 0.01)), 0.8, 0.0, dust=0.3, mud=0.0, wear=0.0, rust=0.0),
        'tyre': mat_tyre,
        'wheelrim': mat_rim,
    }


# ------------------------------------------------------------------ blender helpers
def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def join(objs, name):
    for o in objs:
        kit.apply_all(o)
        if not o.data.materials:
            o.data.materials.append(kit.MATS['chassis'])
    select_only(objs)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def tag(objs, group):
    for o in objs:
        vg = o.vertex_groups.new(name=group)
        vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')


def extract_group(ob, group, name):
    """Copy of ob holding only the faces whose vertices are in the group."""
    gi = ob.vertex_groups[group].index
    new = ob.copy(); new.data = ob.data.copy(); new.name = name
    bpy.context.scene.collection.objects.link(new)
    bm = bmesh.new(); bm.from_mesh(new.data)
    dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if gi not in v[dl]]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(new.data); bm.free()
    new.vertex_groups.clear()
    return new


def remove_group(ob, group):
    gi = ob.vertex_groups[group].index
    bm = bmesh.new(); bm.from_mesh(ob.data)
    dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if gi in v[dl]]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(ob.data); bm.free()


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def decimate(ob, target):
    """Collapse-decimate to a game budget (vertex groups and materials survive)."""
    n = tri_count(ob)
    if n <= target:
        return
    m = ob.modifiers.new('dec', 'DECIMATE')
    m.ratio = target / n
    m.use_collapse_triangulate = True
    kit.apply_all(ob)
    print('decimate', ob.name, n, '->', tri_count(ob), flush=True)


def unwrap(ob, margin=0.0015, angle=62):
    select_only([ob])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def new_image(name, size, noncolor=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
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


MATGRAPH = {}


def emit_swap(ob, attr):
    saved = []
    for m in ob.data.materials:
        nt = m.node_tree
        out = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
        prev = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        em = nt.nodes.new('ShaderNodeEmission')
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


def bake(ob, kind, img, samples, **kw):
    bpy.context.scene.cycles.samples = samples
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
    a = (np.clip(arr, 0, 1)[::-1] * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a)
    if path.endswith('.jpg'):
        im.convert('RGB').save(path, quality=quality)
    else:
        im.save(path, optimize=True)


def build_graphs(ob, builders):
    for m in ob.data.materials:
        if m is None or m.name in MATGRAPH:
            continue
        fn = builders.get(m.name)
        if fn is None:
            print('no graph for', m.name)
            continue
        MATGRAPH[m.name] = fn(m)


def bake_set(ob, prefix, size, texout, samples, coat=True):
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
    bake(ob, 'NORMAL', nrm, max(4, samples // 2), normal_space='TANGENT')
    bake(ob, 'AO', ao, max(16, samples * 2))
    C = pixels(col)[..., :3]
    R = pixels(rough)[..., 0]
    M = pixels(metal)[..., 0]
    A = pixels(ao)[..., 0]
    N = pixels(nrm)[..., :3]
    save_np(C, f'{texout}/{prefix}_col.jpg', 92)
    save_np(np.stack([A, R, M], -1), f'{texout}/{prefix}_orm.jpg', 92)
    save_np(N, f'{texout}/{prefix}_nrm.png')
    if cimg:
        K = pixels(cimg)[..., 0]
        save_np(np.stack([K, K, K], -1), f'{texout}/{prefix}_coat.jpg', 90)


# ------------------------------------------------------------------ main pipeline
def produce(spec, build_fn, size=2048, samples=8):
    vid = spec['id']
    work = os.path.join(WORKROOT, vid)
    texout = os.path.join(OUT, vid)
    os.makedirs(work, exist_ok=True)
    os.makedirs(texout, exist_ok=True)
    MATGRAPH.clear()
    kit.reset()
    kit.init_mats()
    P = build_fn(spec)
    meta = P.meta
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.bake.use_selected_to_active = False

    DEC.clear()
    DEC.update(livery.make(work, spec))
    builders = make_builders(spec, meta)

    # ---- body atlas (body + steer parts share it)
    steer_lights = meta.pop('steer_lights', [])
    tag(P.body, 'body')
    if P.steer:
        tag(P.steer, 'steer')
    body = join(P.body + P.steer, 'body')
    decimate(body, spec.get('body_tris', 60000 if spec['class'] in ('atv', 'bike') else 80000))
    unwrap(body, 0.0012, 62)
    build_graphs(body, builders)

    # ---- wheel atlas: one exemplar per wheel kind, side by side on X
    tyre_mat = kit.MATS['rubber'].copy(); tyre_mat.name = 'tyre'
    rim_mat = kit.MATS['rim'].copy(); rim_mat.name = 'wheelrim'
    kinds = {kd: [s for s in P.spots if s[2] == kd] for kd in P.wheel_kinds}
    ex = []
    for k, kind in enumerate(sorted(kinds)):
        t, r = P.wheel_kinds[kind]
        t.data.materials[0] = tyre_mat
        r.data.materials[0] = rim_mat
        w = join([t, r], 'ex_' + kind)
        w.location = (k * 1.6, 0, 0)
        tag([w], kind)
        ex.append(w)
    for w in ex:
        decimate(w, 9000 if len(ex) > 1 else 12000)
    wheelset = join(ex, 'wheelset')
    unwrap(wheelset, 0.003, 66)
    build_graphs(wheelset, builders)

    print('materials', list(MATGRAPH), flush=True)
    bake_set(body, 'body', size, texout, samples)
    bake_set(wheelset, 'wheel', size // 2, texout, samples, coat=False)

    # ---- split wheels back out and place instances
    wheel_obs = []
    for k, (kind, lst) in enumerate(sorted(kinds.items())):
        base = extract_group(wheelset, kind, 'base_' + kind)
        # exemplars were laid out 1.6 m apart on X for the shared atlas: move back to the axle
        base.data.transform(Matrix.Translation((-k * 1.6, 0, 0)))
        base.location = (0, 0, 0)
        for name, loc, _ in lst:
            w = base.copy(); w.data = base.data.copy(); w.name = name
            bpy.context.scene.collection.objects.link(w)
            if loc[0] < -1e-4:
                w.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
            w.location = loc
            wheel_obs.append(w)
        bpy.data.objects.remove(base, do_unlink=True)

    # ---- steer node
    steer_ob = None
    if P.steer:
        steer_ob = extract_group(body, 'steer', 'steer')
        remove_group(body, 'steer')
    body.vertex_groups.clear()

    glass = join(P.glass, 'glass') if P.glass else None
    lights_body = [o for o in P.lights if o not in steer_lights]
    lights = join(lights_body, 'lights') if lights_body else None
    steer_l = join(steer_lights, 'steer_lights') if steer_lights else None
    export(spec, meta, body, glass, lights, wheel_obs, steer_ob, steer_l, work)


def export(spec, meta, body, glass, lights, wheels, steer, steer_lights, work):
    def simple(name, color=(0.8, 0.8, 0.8)):
        m = bpy.data.materials.new(name + '_x')
        m.use_nodes = True
        m.name = name
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
        return m
    mb, mw, mg = simple('body'), simple('wheel'), simple('glass', (0.02, 0.02, 0.02))
    for ob in [body] + ([steer] if steer else []):
        ob.data.materials.clear(); ob.data.materials.append(mb)
    for w in wheels:
        w.data.materials.clear(); w.data.materials.append(mw)
    if glass:
        glass.data.materials.clear(); glass.data.materials.append(mg)
    for L in (lights, steer_lights):
        if L:
            for i, m in enumerate(L.data.materials):
                L.data.materials[i] = bpy.data.materials.get('light_' + m.name.split('.')[0]) or simple('light_' + m.name.split('.')[0], (0.9, 0.9, 0.9))
    oz = meta['origin_z']
    rot = Matrix.Rotation(math.pi, 4, 'Z')
    sh = Matrix.Translation((0, 0, -oz))
    for ob in (body, glass, lights):
        if ob:
            ob.data.transform(rot @ sh @ ob.matrix_world)
            ob.matrix_world = Matrix.Identity(4)
    for w in wheels:
        loc = (rot @ sh) @ w.location
        w.data.transform(rot)
        w.location = loc
        w.rotation_euler = (0, 0, 0)
    if steer:
        piv = Vector(meta['steer_pivot'])
        for ob in (steer, steer_lights):
            if ob:
                ob.data.transform(Matrix.Translation(-piv) @ ob.matrix_world)
                ob.matrix_world = Matrix.Identity(4)
                ob.data.transform(rot)
        steer.location = (rot @ sh) @ piv
        if steer_lights:
            steer_lights.parent = steer
    keep = {o for o in (body, glass, lights, steer, steer_lights) if o} | set(wheels)
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    path = os.path.join(OUT, spec['id'] + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_materials='EXPORT', export_image_format='NONE',
                              export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
                              export_tangents=False, use_selection=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in keep if o.type == 'MESH')
    print('exported', path, 'tris', tris)
    # catalog entry for the game (physics origin frame: x right, y up, z forward)
    def g(v):
        return [round(-v[0], 4), round(v[2] - oz, 4), round(-v[1], 4)]
    entry = {
        'id': spec['id'], 'name': spec['name'], 'class': spec['class'], 'number': spec['number'],
        'model': f"models/vehicles/{spec['id']}.glb", 'textures': f"models/vehicles/{spec['id']}/",
        'wheels': {w.name: {'pos': [round(c, 4) for c in w.location], 'radius': meta['wheel_r'][w.name]} for w in wheels},
        'steer': ({'pivot': [round(c, 4) for c in steer.location], 'axis': g(meta['steer_axis']) if 'steer_axis' in meta else [0, 1, 0]}
                  if steer else None),
        'origin_height': oz, 'length': round(meta['ymax'] - meta['ymin'], 3), 'width': round(meta['half_width'] * 2, 3),
        'height': round(meta['height'], 3), 'tris': tris, 'tune': spec.get('tune', {}), 'blurb': spec.get('blurb', ''),
    }
    with open(os.path.join(OUT, spec['id'] + '.json'), 'w') as f:
        json.dump(entry, f, indent=1)
