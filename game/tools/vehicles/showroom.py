"""Renders an exported vehicle (.glb + baked texture folder) on a gravel pad under
the game's sky: a front three-quarter and a rear three-quarter view side by side
with a caption bar.

    python tools/vehicles/showroom.py <model.glb> <texdir> <out.jpg> "<title>" "<subtitle>" [--samples N] [--width W]

The baked atlases are bound by material name exactly as the game does it
(body / wheel / glass / light_*), so the image shows the real game asset.
"""
import math
import os
import sys
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, '..', '..'))
ASSETS = os.environ.get('ASSETS', '/mnt/project-files/assets')
FONT = os.path.join(GAME, 'tools', 'truck', 'fonts', 'SairaCondensed-Bold.ttf')
FONT2 = os.path.join(GAME, 'tools', 'truck', 'fonts', 'SairaCondensed-Bold.ttf')


def img(path, noncolor=False):
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    return im


def baked_material(name, tex, prefix, coat=True):
    m = bpy.data.materials.new(name + '_show')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeUVMap')
    def tx(f, nc):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img(os.path.join(tex, f), nc)
        nt.links.new(uv.outputs[0], n.inputs[0])
        return n
    col = tx(f'{prefix}_col.jpg', False)
    orm = tx(f'{prefix}_orm.jpg', True)
    nrm = tx(f'{prefix}_nrm.png', True)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(orm.outputs[0], sep.inputs[0])
    # AO multiplies the base colour (the game uses it as an aoMap)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.85
    nt.links.new(col.outputs[0], mix.inputs[6])
    nt.links.new(sep.outputs[0], mix.inputs[7])
    nt.links.new(mix.outputs[2], p.inputs['Base Color'])
    nt.links.new(sep.outputs[1], p.inputs['Roughness'])
    nt.links.new(sep.outputs[2], p.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(nrm.outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], p.inputs['Normal'])
    cpath = os.path.join(tex, f'{prefix}_coat.jpg')
    if coat and os.path.exists(cpath):
        c = tx(f'{prefix}_coat.jpg', True)
        nt.links.new(c.outputs[0], p.inputs['Coat Weight'])
        p.inputs['Coat Roughness'].default_value = 0.12
    return m


def simple(name, color, rough=0.3, metal=0.0, emit=None, strength=0.0, alpha=1.0, trans=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    if trans:
        p.inputs['Transmission Weight'].default_value = trans
    return m


def stage(samples, width, height):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.render.resolution_x, sc.render.resolution_y = width, height
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 0.15
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = img(os.path.join(GAME, 'public', 'env', 'sky.hdr'))
    mp = nt.nodes.new('ShaderNodeMapping')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp.inputs['Rotation'].default_value[2] = math.radians(150)
    nt.links.new(tc.outputs['Generated'], mp.inputs[0])
    nt.links.new(mp.outputs[0], env.inputs[0])
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.2
    sun.data.angle = math.radians(2.0)
    sun.data.color = (1.0, 0.94, 0.86)
    sun.rotation_euler = (math.radians(50), 0, math.radians(215))
    sc.collection.objects.link(sun)
    # gravel pad: big disc with the cinder-road photo texture, fading into dark ash
    bpy.ops.mesh.primitive_plane_add(size=600)
    gp = bpy.context.active_object
    m = bpy.data.materials.new('pad')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.28, 0.28, 0.28)
    nt.links.new(tc.outputs['Object'], mp.inputs[0])
    T = f'{ASSETS}/polyhaven/textures/gravel_road/gravel_road'
    def tx(path, nc):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img(path, nc)
        nt.links.new(mp.outputs[0], n.inputs[0])
        return n
    dc = tx(T + '_diff_2k.jpg', False)
    rg = tx(T + '_rough_2k.jpg', True)
    nr = tx(T + '_nor_gl_2k.jpg', True)
    hue = nt.nodes.new('ShaderNodeHueSaturation')
    hue.inputs['Saturation'].default_value = 0.55
    hue.inputs['Value'].default_value = 0.42
    nt.links.new(dc.outputs[0], hue.inputs['Color'])
    nt.links.new(hue.outputs[0], p.inputs['Base Color'])
    nt.links.new(rg.outputs[0], p.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = 1.2
    nt.links.new(nr.outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], p.inputs['Normal'])
    gp.data.materials.append(m)
    return sc


def load_vehicle(glb, tex):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.data.objects if o not in before]
    mats = {
        'body': baked_material('body', tex, 'body'),
        'wheel': baked_material('wheel', tex, 'wheel', coat=False),
        'glass': simple('glass_s', (0.02, 0.022, 0.025), 0.03, 0, alpha=0.55),
        'light_lamp': simple('lamp_s', (1, 1, 1), 0.2, 0, (1, 0.94, 0.85), 6.0),
        'light_tail': simple('tail_s', (0.35, 0.0, 0.0), 0.2, 0, (1, 0.06, 0.02), 3.0),
        'light_lens': simple('lens_s', (1, 1, 1), 0.02, 0, alpha=0.18),
        'light_amber': simple('amber_s', (0.6, 0.25, 0.0), 0.2, 0, (1, 0.5, 0.05), 3.0),
    }
    for o in objs:
        if o.type != 'MESH':
            continue
        for i, ms in enumerate(o.data.materials):
            key = (ms.name if ms else '').split('.')[0]
            if key in mats:
                o.data.materials[i] = mats[key]
    meshes = [o for o in objs if o.type == 'MESH']
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    # sit the vehicle on the pad
    roots = [o for o in objs if o.parent is None]
    for r in roots:
        r.location.z -= lo.z
    hi.z -= lo.z; lo.z = 0
    return lo, hi


def shot(sc, lo, hi, side, out):
    c = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z * 0)
    L = max(hi.x - lo.x, hi.y - lo.y)
    # glTF forward is +Z which imports as Blender -Y; keep framing generic
    fwd = Vector((0, -1, 0)) if (hi.y - lo.y) >= (hi.x - lo.x) else Vector((1, 0, 0))
    right = Vector((fwd.y, -fwd.x, 0)) * -1
    if side == 'front':
        d = (fwd * 1.0 + right * 0.95).normalized()
        el = 0.21
    else:
        d = (-fwd * 1.0 - right * 0.8).normalized()
        el = 0.25
    dist = max(L, (hi.z - lo.z) * 1.7) * 1.55 + 0.9
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.lens = 50
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = 5.6
    tgt = Vector((c.x, c.y, (hi.z) * 0.42))
    cam.location = tgt + d * dist + Vector((0, 0, dist * el))
    cam.data.dof.focus_distance = (cam.location - tgt).length
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def compose(a, b, out, title, sub):
    from PIL import Image, ImageDraw, ImageFont
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    W = A.width + B.width
    bar = 92
    im = Image.new('RGB', (W, A.height + bar), (18, 16, 15))
    im.paste(A, (0, 0)); im.paste(B, (A.width, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, A.height, W, A.height + 5), fill=(255, 150, 30))
    f1 = ImageFont.truetype(FONT, 52)
    f2 = ImageFont.truetype(FONT2, 30)
    d.text((28, A.height + 14), title.upper(), font=f1, fill=(245, 240, 230))
    tw = d.textlength(title.upper(), font=f1)
    d.text((28 + tw + 24, A.height + 34), sub, font=f2, fill=(190, 180, 165))
    im.save(out, quality=90)
    print('saved', out)


if __name__ == '__main__':
    a = sys.argv[1:]
    glb, tex, out, title, sub = a[:5]
    samples = int(a[a.index('--samples') + 1]) if '--samples' in a else 48
    width = int(a[a.index('--width') + 1]) if '--width' in a else 960
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = stage(samples, width, int(width * 0.75))
    lo, hi = load_vehicle(glb, tex)
    tmp = os.path.splitext(out)[0]
    shot(sc, lo, hi, 'front', tmp + '_a.png')
    shot(sc, lo, hi, 'rear', tmp + '_b.png')
    compose(tmp + '_a.png', tmp + '_b.png', out, title, sub)
    os.remove(tmp + '_a.png'); os.remove(tmp + '_b.png')
