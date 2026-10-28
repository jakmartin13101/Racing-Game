"""Shot list and scenery for the Gravel Riot gameplay snapshots."""
import math, random
from mathutils import Vector

# ------------------------------------------------------------------ scenery helpers


def rocks(G, track, terr, color, n=120, dmin=7, dmax=70, y=(-40, 400), scale=(0.3, 2.2), seed=5):
    rm = G.rock_material(color)
    meshes = [G.rock_mesh(seed + i, rm) for i in range(5)]
    G.scatter(terr, meshes, n, dmin, dmax, y[0], y[1], scale=scale, seed=seed, sink=0.3)


def pebbles(G, track, terr, color, n=500, seed=21):
    rocks(G, track, terr, color, n=n, dmin=4.5, dmax=16, y=(-10, 140), scale=(0.04, 0.28), seed=seed)


def trees(G, track, terr, kind, n, dmin, dmax, y=(-30, 600), scale=(0.8, 1.3), seed=3, side=0):
    meshes = G.tree_meshes(kind, seed)
    G.scatter(terr, meshes, n, dmin, dmax, y[0], y[1], scale=scale, seed=seed, sink=0.05, side=side)


def ground_at(track, terr, y, lat):
    p, f, s = track.frame(y, lat)
    z, _ = terr.height(p.x, p.y)
    return Vector((p.x, p.y, z)), f, s


def bpy_light(kind, energy, color, loc, radius=0.5):
    import bpy
    from gr3d import hexc
    L = bpy.data.lights.new('l', kind)
    L.energy = energy
    L.color = hexc(color)[:3]
    L.shadow_soft_size = radius
    o = bpy.data.objects.new('l', L)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return o


def markers(G, track, terr, y0=-10, y1=260, every=12.0, c1='#d8342a', c2='#f2efe6'):
    m1, m2 = G.mat_simple('mk1', c1, 0.45), G.mat_simple('mk2', c2, 0.45)
    refl = G.mat_simple('refl', '#ffb020', 0.3, emit='#ff9a10', emit_str=1.5)
    mb = G.MB()
    y, k = y0, 0
    hw = track.width / 2 + 1.6
    while y < y1:
        for sd in (-1, 1):
            p, f, s = ground_at(track, terr, y, sd * hw)
            mb.box(p + Vector((0, 0, 0.55)), (0.14, 0.14, 1.1), m1 if k % 2 else m2)
            mb.box(p + Vector((0, 0, 0.95)), (0.16, 0.16, 0.18), refl)
        y += every
        k += 1
    mb.obj('markers')


def tyre_walls(G, track, terr, n=14, y=(5, 220), seed=2, color='#d23a2a'):
    rnd = random.Random(seed)
    tm = G.mat_simple('tyrewall', '#141414', 0.8)
    band = G.mat_simple('tyreband', color, 0.5)
    mb = G.MB()
    for i in range(n):
        yy = rnd.uniform(*y)
        sd = rnd.choice((-1, 1))
        p, f, s = ground_at(track, terr, yy, sd * (track.width / 2 + rnd.uniform(2.5, 4.5)))
        for j in range(rnd.randint(3, 6)):
            q = p + f * (j * 0.75 - 1.5)
            for k in range(rnd.randint(2, 4)):
                mb.cyl(q + Vector((0, 0, k * 0.26)), q + Vector((0, 0, k * 0.26 + 0.24)), 0.36, band if k == 1 else tm, 16)
    mb.obj('tyres', bevel=0.03)


def flags(G, track, terr, n=10, y=(5, 200), seed=4, colors=('#d23a26', '#f2c230', '#2a5fb0', '#f2efe6')):
    rnd = random.Random(seed)
    pole = G.mat_simple('pole', '#2a2a2a', 0.4, metal=0.8)
    cms = [G.mat_simple('flag', c, 0.6) for c in colors]
    for i in range(n):
        yy = rnd.uniform(*y)
        sd = rnd.choice((-1, 1))
        p, f, s = ground_at(track, terr, yy, sd * (track.width / 2 + rnd.uniform(3, 7)))
        cm = rnd.choice(cms)
        mb = G.MB()
        h = rnd.uniform(4, 6)
        mb.cyl(p, p + Vector((0, 0, h)), 0.05, pole, 8)
        for k in range(8):
            t = k / 8
            mb.box(p + f * (0.35 + 0.25 * math.sin(t * 3)) + Vector((0, 0, h - 0.4 - t * 3.0)), (0.6 - t * 0.2, 0.03, 0.4), cm)
        mb.obj('flag')


def gate(G, track, terr, y, colors=('#d23a26', '#f2efe6'), lights=False, h=7.0):
    p, f, s = ground_at(track, terr, y, 0)
    a = math.atan2(f.y, f.x)
    hw = track.width / 2 + 2.0
    m1 = G.mat_simple('gate1', colors[0], 0.5)
    m2 = G.mat_simple('gate2', colors[1], 0.5)
    truss = G.mat_simple('truss', '#2a2a2a', 0.4, metal=0.7)
    root = G.empty('gate', (p.x, p.y, p.z))
    root.rotation_euler = (0, 0, a)
    mb = G.MB()
    for sd in (-1, 1):
        for dx in (-0.4, 0.4):
            for dy in (-0.4, 0.4):
                mb.cyl((dx, sd * hw + dy, -1), (dx, sd * hw + dy, h), 0.06, truss, 8)
        for k in range(int(h)):
            mb.cyl((-0.4, sd * hw - 0.4, k), (0.4, sd * hw + 0.4, k + 1), 0.03, truss, 6)
            mb.cyl((0.4, sd * hw - 0.4, k), (-0.4, sd * hw + 0.4, k + 1), 0.03, truss, 6)
    mb.box((0, 0, h + 0.6), (1.0, hw * 2 + 1.2, 1.6), m1)
    mb.box((0.52, 0, h + 0.6), (0.04, hw * 2 + 1.0, 0.5), m2)
    mb.box((-0.52, 0, h + 0.6), (0.04, hw * 2 + 1.0, 0.5), m2)
    if lights:
        red = G.mat_emit('gatelight', '#ff3020', 25)
        green = G.mat_emit('gatelight2', '#30ff60', 25)
        for k in range(5):
            for dx in (-0.55, 0.55):
                mb.sphere((dx, -2 + k * 1.0, h - 0.2), 0.22, red if k < 4 else green, 2)
    mb.obj('gate', parent=root)
    return root


def tents(G, track, terr, n=8, y=(10, 120), seed=8, colors=('#d23a26', '#2a5fb0', '#f2c230', '#2f6e45', '#efe8da')):
    rnd = random.Random(seed)
    for i in range(n):
        yy = rnd.uniform(*y)
        sd = rnd.choice((-1, 1))
        p, f, s = ground_at(track, terr, yy, sd * rnd.uniform(14, 34))
        m = G.mat_simple('tent', rnd.choice(colors), 0.8)
        mb = G.MB()
        w = rnd.uniform(3, 5)
        mb.cyl(p + Vector((0, 0, -0.2)), p + Vector((0, 0, w * 0.9)), w, m, 4, r1=0.05, smooth_=False)
        mb.obj('tent')


def string_lights(G, track, terr, y0, y1, lat, h=5.5, color='#ffd28a'):
    em = G.mat_emit('bulb', color, 30)
    wire = G.mat_simple('wire', '#111111', 0.5)
    mb = G.MB()
    n = int((y1 - y0) / 1.6)
    prev = None
    for i in range(n + 1):
        y = y0 + (y1 - y0) * i / n
        p, f, s = ground_at(track, terr, y, lat)
        q = p + Vector((0, 0, h - 0.8 * math.sin((i % 8) / 8 * math.pi)))
        mb.sphere(q, 0.09, em, 1)
        if prev is not None:
            mb.cyl(prev, q, 0.012, wire, 4)
        prev = q
    mb.obj('lights')


def derricks(G, track, terr, spots, flare=True):
    steel = G.mat_simple('steel', '#2a2420', 0.6, metal=0.5)
    fl = G.mat_emit('flare', '#ffb040', 60)
    for (y, lat, h) in spots:
        p, f, s = ground_at(track, terr, y, lat)
        mb = G.MB()
        w0 = h * 0.18
        legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for k in range(4):
            a = legs[k]
            mb.cyl(p + Vector((a[0] * w0, a[1] * w0, 0)), p + Vector((a[0] * 0.6, a[1] * 0.6, h)), 0.12, steel, 6)
        for lvl in range(1, 8):
            t = lvl / 8
            w = w0 * (1 - t) + 0.6 * t
            z = h * t
            pts = [p + Vector((a[0] * w, a[1] * w, z)) for a in legs]
            for k in range(4):
                mb.cyl(pts[k], pts[(k + 1) % 4], 0.06, steel, 4)
                if lvl > 1:
                    q = [p + Vector((a[0] * (w0 * (1 - (lvl - 1) / 8) + 0.6 * (lvl - 1) / 8), a[1] * (w0 * (1 - (lvl - 1) / 8) + 0.6 * (lvl - 1) / 8), h * (lvl - 1) / 8)) for a in legs]
                    mb.cyl(q[k], pts[(k + 1) % 4], 0.04, steel, 4)
        mb.obj('derrick')
        if flare:
            q = p + Vector((w0 * 2.5, 0, 0))
            mb2 = G.MB()
            mb2.cyl(q, q + Vector((0, 0, h * 0.6)), 0.3, steel, 8)
            mb2.sphere(q + Vector((0, 0, h * 0.6 + 1.2)), 1.2, fl, 2, scale=(0.8, 0.8, 1.6))
            mb2.obj('flare')
            bpy_light('POINT', 60000, '#ffa040', q + Vector((0, 0, h * 0.6 + 2.5)), radius=1.5)


def mesas(G, track, terr, n=9, seed=11, rng=(120, 1100), lat=(70, 420)):
    m = G.mesa_material()
    rnd = random.Random(seed)
    for i in range(n):
        y = rnd.uniform(*rng)
        lt = rnd.choice((-1, 1)) * rnd.uniform(*lat)
        p, f, s = track.frame(y, lt)
        z, _ = terr.height(p.x, p.y)
        G.mesa((p.x, p.y, z), rnd.uniform(25, 60), rnd.uniform(70, 160), m, seed + i)


def volcano_cone(G, track, terr, y=1100, lat=-120, h=420, r=520):
    import bmesh, bpy
    p, f, s = track.frame(y, lat)
    z0, _ = terr.height(p.x, p.y)
    bm = bmesh.new()
    segs, rings = 64, 24
    rows = []
    for k in range(rings + 1):
        t = k / rings
        rad = r * (1 - t) ** 1.6 + 45
        zz = z0 - 20 + h * t
        row = []
        for i in range(segs):
            a = math.tau * i / segs
            jit = 1 + 0.12 * math.sin(a * 7 + t * 9) * (1 - t)
            row.append(bm.verts.new((p.x + math.cos(a) * rad * jit, p.y + math.sin(a) * rad * jit, zz)))
        rows.append(row)
    crater = [bm.verts.new((p.x + math.cos(math.tau * i / segs) * 30, p.y + math.sin(math.tau * i / segs) * 30, z0 + h - 40)) for i in range(segs)]
    rows.append(crater)
    for k in range(len(rows) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
    me = bpy.data.meshes.new('cone')
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(G.terrain_material('volcano'))
    o = bpy.data.objects.new('cone', me)
    bpy.context.scene.collection.objects.link(o)
    glow = G.mat_emit('crater', '#ff6a1a', 40)
    mb = G.MB()
    mb.sphere((p.x, p.y, z0 + h - 38), 32, glow, 2, scale=(1, 1, 0.25))
    mb.obj('crater')
    bpy_light('POINT', 4e7, '#ff6020', (p.x, p.y, z0 + h + 30), radius=40)


def embers(G, center, n=260, spread=(40, 60, 18), seed=7):
    rnd = random.Random(seed)
    em = G.mat_emit('ember', '#ff8a2a', 60)
    mb = G.MB()
    for i in range(n):
        c = Vector(center) + Vector((rnd.uniform(-1, 1) * spread[0], rnd.uniform(-0.2, 1) * spread[1], rnd.uniform(0.3, 1) * spread[2]))
        mb.sphere(c, rnd.uniform(0.02, 0.06), em, 1)
    o = mb.obj('embers')
    o.visible_shadow = False
    o.keyframe_insert('location', frame=1)
    o.location = (0.4, 0.8, 1.2)
    o.keyframe_insert('location', frame=2)


def turbines(G, track, terr, spots):
    white = G.mat_simple('turbine', '#eef0f0', 0.35)
    for (y, lat, h, rot) in spots:
        p, f, s = ground_at(track, terr, y, lat)
        mb = G.MB()
        mb.cyl(p, p + Vector((0, 0, h)), h * 0.035, white, 24, r1=h * 0.02)
        top = p + Vector((0, 0, h))
        mb.box(top + Vector((0, -1.5, 0)), (2.6, 7, 2.8), white)
        hub = top + Vector((0, -5.2, 0))
        mb.sphere(hub, 1.6, white, 2, scale=(1, 1.4, 1))
        for k in range(3):
            a = rot + k * math.tau / 3
            tip = hub + Vector((math.cos(a) * h * 0.55, 0, math.sin(a) * h * 0.55))
            mb.cyl(hub, tip, 1.3, white, 6, r1=0.25)
        mb.obj('turbine')


def city_blocks(G, track, terr, n=70, seed=12, lit=True):
    rnd = random.Random(seed)
    m, nb, out = G.new_mat('concrete')
    geo = nb.node('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    sx = nb.sep(pos)
    fz = nb.math('FRACT', nb.math('DIVIDE', sx[2], 3.5))
    fxy = nb.math('FRACT', nb.math('DIVIDE', nb.math('ADD', sx[0], sx[1]), 3.0))
    win = nb.math('MULTIPLY', nb.maprange(fz, 0.35, 0.4), nb.maprange(fz, 0.85, 0.8))
    win = nb.math('MULTIPLY', win, nb.math('MULTIPLY', nb.maprange(fxy, 0.2, 0.25), nb.maprange(fxy, 0.8, 0.75)))
    nz = nb.sep(geo.outputs['Normal'])[2]
    win = nb.math('MULTIPLY', win, nb.maprange(nz, 0.5, 0.2))
    dirt = nb.noise(pos, scale=0.15, detail=8)
    base = nb.mixc(nb.maprange(dirt, 0.3, 0.7), G.hexc('#8a847c'), G.hexc('#4a4642'))
    col = nb.mixc(win, base, G.hexc('#101214'))
    vor = nb.node('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 0.5
    nb.link(pos, vor.inputs['Vector'])
    litm = nb.math('MULTIPLY', win, nb.math('GREATER_THAN', nb.sep(vor.outputs['Color'])[0], 0.85 if lit else 2.0))
    p = G.principled(nb, color=col, rough=nb.mixf(win, 0.85, 0.1), emit=G.hexc('#ffb060'), emit_str=nb.math('MULTIPLY', litm, 6.0))
    nb.link(p.outputs[0], out.inputs[0])
    for i in range(n):
        y = rnd.uniform(-20, 700)
        sd = rnd.choice((-1, 1))
        lat = sd * rnd.uniform(track.width / 2 + 12, 140)
        pp, f, s = ground_at(track, terr, y, lat)
        w, d, h = rnd.uniform(10, 24), rnd.uniform(10, 24), rnd.uniform(14, 70)
        mb = G.MB()
        mb.box(pp + Vector((0, 0, h / 2 - 2)), (w, d, h), m)
        for k in range(rnd.randint(1, 4)):
            mb.box(pp + Vector((rnd.uniform(-w, w) * 0.3, rnd.uniform(-d, d) * 0.3, h - 2 + rnd.uniform(1, 6))),
                   (w * rnd.uniform(0.2, 0.5), d * rnd.uniform(0.2, 0.5), rnd.uniform(2, 8)), m)
        o = mb.obj('bldg')
        o.rotation_euler = (rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), 0)


def fires(G, track, terr, spots):
    fm = G.mat_emit('fire', '#ff7a20', 30)
    for (y, lat, s) in spots:
        p, f, sd = ground_at(track, terr, y, lat)
        mb = G.MB()
        rnd = random.Random(int(y))
        for k in range(8):
            mb.sphere(p + Vector((rnd.uniform(-1, 1) * s, rnd.uniform(-1, 1) * s, rnd.uniform(0, 1.5) * s)), rnd.uniform(0.4, 1.0) * s, fm, 2, scale=(0.7, 0.7, 1.6))
        o = mb.obj('fire')
        o.visible_shadow = False
        bpy_light('POINT', 25000 * s, '#ff7020', p + Vector((0, 0, 2.5 * s)), radius=s)
        G.dust_sprites(p + Vector((0, 0, 3 * s)), Vector((0.3, -0.95, 0)), 30 * s, 2.5 * s, 12 * s, '#2a2624', opacity=0.7, n=10, seed=int(y) % 97)


# ------------------------------------------------------------------ biome scenery


def sc_canyon(G, track, terr):
    mesas(G, track, terr)
    mesas(G, track, terr, n=7, seed=51, rng=(-850, -160), lat=(60, 380))
    rocks(G, track, terr, '#94532e', n=140)
    pebbles(G, track, terr, '#8a4a2a')
    trees(G, track, terr, 'cactus', 22, 9, 80, y=(-20, 300), scale=(0.7, 1.2), seed=4)
    markers(G, track, terr)
    flags(G, track, terr, n=6)


def sc_desert(G, track, terr):
    rocks(G, track, terr, '#8a5a3e', n=120)
    pebbles(G, track, terr, '#7a4e34')
    trees(G, track, terr, 'cactus', 28, 9, 90, y=(-20, 300), scale=(0.7, 1.2), seed=4)
    markers(G, track, terr)


def sc_oil(G, track, terr):
    sc_desert(G, track, terr)
    derricks(G, track, terr, [(60, -40, 32), (110, 55, 38), (180, -90, 34), (260, 120, 40), (150, 30, 30)])


def sc_festival(G, track, terr):
    rocks(G, track, terr, '#8a5a3e', n=60)
    pebbles(G, track, terr, '#7a4e34', n=300)
    gate(G, track, terr, -1.0, lights=True)
    tents(G, track, terr, n=14, y=(-5, 90))
    flags(G, track, terr, n=16, y=(-5, 80))
    tyre_walls(G, track, terr, n=10, y=(-5, 80))
    string_lights(G, track, terr, -10, 60, -16)
    string_lights(G, track, terr, -10, 60, 17)
    markers(G, track, terr, y0=15)


def sc_dunes(G, track, terr):
    rocks(G, track, terr, '#a06a40', n=30, dmin=10, dmax=80)
    markers(G, track, terr, every=16)


def sc_mud(G, track, terr):
    trees(G, track, terr, 'broad', 70, 30, 220, y=(0, 700), scale=(0.9, 1.5), seed=6)
    trees(G, track, terr, 'dead', 14, 9, 40, y=(0, 200), scale=(0.8, 1.2), seed=9)
    rocks(G, track, terr, '#5a5048', n=60)
    pebbles(G, track, terr, '#3a2a1c', n=300)
    tyre_walls(G, track, terr)
    markers(G, track, terr)


def sc_swamp(G, track, terr):
    trees(G, track, terr, 'dead', 70, 8, 160, y=(0, 500), scale=(0.9, 1.6), seed=9)
    trees(G, track, terr, 'broad', 40, 60, 260, y=(50, 800), scale=(0.9, 1.4), seed=6)
    pebbles(G, track, terr, '#2a2016', n=200)
    markers(G, track, terr)


def sc_volcano(G, track, terr):
    volcano_cone(G, track, terr)
    rocks(G, track, terr, '#2a2220', n=160, dmin=6, dmax=90)
    pebbles(G, track, terr, '#1c1614')
    markers(G, track, terr, c1='#ffb020', c2='#202020')


def sc_volcano_night(G, track, terr):
    sc_volcano(G, track, terr)
    p, f, s = track.frame(55, 0)
    embers(G, (p.x, p.y, 0), n=200, spread=(30, 40, 14))


def sc_arctic(G, track, terr):
    trees(G, track, terr, 'pine', 140, 12, 200, y=(-20, 700), scale=(0.7, 1.4), seed=3)
    rocks(G, track, terr, '#3e444c', n=60)
    markers(G, track, terr, c1='#2a5fb0', c2='#f2efe6')
    flags(G, track, terr, n=6, colors=('#d23a26', '#2a5fb0'))


def sc_forest(G, track, terr):
    trees(G, track, terr, 'pine', 220, 9, 240, y=(-20, 700), scale=(0.8, 1.5), seed=3)
    rocks(G, track, terr, '#6a6660', n=80)
    pebbles(G, track, terr, '#4a3e2a', n=300)
    markers(G, track, terr)


def sc_highland(G, track, terr):
    rocks(G, track, terr, '#7a7670', n=90, dmin=8, dmax=120)
    pebbles(G, track, terr, '#5a4a32', n=300)
    turbines(G, track, terr, [(90, -70, 70, 0.3), (170, 60, 80, 1.2), (260, -150, 75, 2.0), (330, 120, 85, 0.8), (420, -30, 80, 1.6)])
    markers(G, track, terr)
    flags(G, track, terr, n=8)


def sc_jungle(G, track, terr):
    trees(G, track, terr, 'broad', 260, 8, 160, y=(-20, 500), scale=(1.0, 1.8), seed=6)
    trees(G, track, terr, 'palm', 40, 7, 40, y=(-10, 200), scale=(0.9, 1.3), seed=7)
    trees(G, track, terr, 'fern', 160, 6, 25, y=(-10, 120), scale=(0.8, 1.6), seed=8)
    rocks(G, track, terr, '#5a5a4a', n=40)
    markers(G, track, terr)


def sc_coast(G, track, terr):
    trees(G, track, terr, 'palm', 50, 8, 40, y=(-10, 300), scale=(0.9, 1.3), seed=7, side=-1)
    trees(G, track, terr, 'palm', 6, 8, 11, y=(30, 300), scale=(0.9, 1.3), seed=17, side=1)
    trees(G, track, terr, 'broad', 60, 40, 200, y=(0, 600), scale=(0.9, 1.4), seed=6, side=-1)
    rocks(G, track, terr, '#6a625a', n=60, dmin=6, dmax=60)
    markers(G, track, terr)


def sc_salt(G, track, terr):
    markers(G, track, terr, every=20, y1=600)
    flags(G, track, terr, n=8, y=(10, 300))


def sc_quarry(G, track, terr):
    rocks(G, track, terr, '#8a8076', n=200, dmin=6, dmax=60, scale=(0.4, 2.8))
    pebbles(G, track, terr, '#6a5e52', n=400)
    tyre_walls(G, track, terr, n=16, color='#f2c230')
    markers(G, track, terr, c1='#f2c230', c2='#202020')


def sc_city(G, track, terr):
    city_blocks(G, track, terr, n=80)
    rocks(G, track, terr, '#5a5450', n=160, dmin=6, dmax=40, scale=(0.2, 1.6))
    fires(G, track, terr, [(40, -14, 1.0), (75, 16, 1.4), (130, -25, 2.0), (200, 30, 2.5)])
    tyre_walls(G, track, terr)


# ------------------------------------------------------------------ cars
BUGGY = dict(kind='buggy', color='#d23a26', accent='#f2efe6', num=7)
TRUCK = dict(kind='truck', color='#2a5fb0', accent='#f2c230', num=14)
RALLY = dict(kind='rally', color='#1f7fd0', accent='#f5f5f0', num=31)
RALLY_Y = dict(kind='rally', color='#f2c230', accent='#1d1d1d', num=27)
MUD = dict(kind='mud', color='#4f8a3a', accent='#e9e1c8', num=22)
MUD_O = dict(kind='mud', color='#e86a24', accent='#232323', num=6)
MONSTER = dict(kind='monster', color='#6b3fa8', accent='#ff9a1f', num=1)
RIG = dict(kind='rig', color='#e8b230', accent='#2b2b2b', num=3)
RIG_W = dict(kind='rig', color='#e1e1dc', accent='#d5291f', num=12)
TRUCK_W = dict(kind='truck', color='#f1f1ee', accent='#d22f2f', num=40)
BUGGY_B = dict(kind='buggy', color='#26221f', accent='#ff6a1f', num=66)


def car(base, y, lat=0.0, **kw):
    d = dict(base)
    d.update(y=y, lat=lat, **kw)
    return d


DAY_SUN = '#fff1dc'

# ------------------------------------------------------------------ shots
SHOTS = {
    '01': dict(title='Mesa Run', biome='canyon', seed=3,
               track=dict(A=(14, 5), L=(130, 45), P=(0.2, 1.0), width=11, hills=(2.5, 120)),
               sky=dict(sun_el=30, sun_rot=140, strength=0.3, clouds=0.55),
               sun=dict(el=30, rot=140, energy=7.5, color=DAY_SUN),
               fog=dict(density=0.00035, color='#f0d6b8', height_falloff=(0, 260)),
               scenery=[sc_canyon],
               cars=[car(BUGGY, 14, -1.4), car(TRUCK, 30, 2.2)],
               cam=dict(y=7.5, lat=-4.0, h=2.2, look_y=24, look_lat=0.5, look_h=1.5, lens=30),
               dust_density=0.55, hud=dict(pos=2, of=8, lap=(1, 3), kmh=142, boost=0.62)),
    '02': dict(title='Monsoon Mud', biome='mud', seed=5,
               track=dict(A=(10, 4), L=(110, 40), P=(1.1, 0.4), width=12, hills=(1.5, 90)),
               sky=dict(sun_el=25, sun_rot=200, strength=0.5, clouds=0.9, overcast=0.6, grey='#6a7472', cloud_col='#9aa2a2'),
               sun=dict(el=25, rot=200, energy=1.4, color='#dfe6ea', angle=12),
               fog=dict(density=0.004, color='#b8c2c0', height_falloff=(-5, 60)),
               scenery=[sc_mud],
               cars=[car(MUD, 14, -2.0), car(TRUCK, 19, 2.6)],
               cam=dict(y=6, lat=-5.5, h=2.4, look_y=20, look_lat=0.5, look_h=1.6, lens=28),
               dust_density=0.25, dust='#6a5a48', debris=('#2a1e14', 70),
               hud=dict(pos=3, of=8, lap=(2, 3), kmh=96, boost=0.3)),
    '03': dict(title='Caldera Night', biome='volcano', seed=7, night=True, lava_level=-1.8,
               track=dict(A=(12, 5), L=(120, 50), P=(0.6, 2.0), width=11, hills=(1.0, 100)),
               sky=dict(sun_el=-5, sun_rot=40, strength=0.09, clouds=0.6, cloud_col='#4a1c14', tint='#ff7050', stars=True),
               sun=dict(el=25, rot=60, energy=0.15, color='#8a9aff'),
               fog=dict(density=0.0004, color='#ff8a60', height_falloff=(0, 80)),
               scenery=[sc_volcano_night],
               cars=[car(BUGGY_B, 14, -0.8)],
               cam=dict(y=6.5, lat=-3.6, h=2.3, look_y=24, look_lat=0.0, look_h=1.5, lens=30),
               dust_density=0.3, dust='#4a3a34', hud=dict(pos=1, of=8, lap=(3, 3), kmh=158, boost=0.9)),
    '04': dict(title='Whiteout Pass', biome='arctic', seed=9,
               track=dict(A=(16, 6), L=(120, 45), P=(1.9, 0.3), width=11, hills=(3.0, 110)),
               sky=dict(sun_el=18, sun_rot=120, strength=0.35, clouds=0.5),
               sun=dict(el=18, rot=120, energy=6.0, color='#fff6ea'),
               fog=dict(density=0.0006, color='#dfe9f2', height_falloff=(0, 300)),
               scenery=[sc_arctic],
               cars=[car(RALLY, 13, -1.0), car(TRUCK_W, 32, 1.8)],
               cam=dict(y=6.0, lat=-4.2, h=2.0, look_y=22, look_lat=0.4, look_h=1.2, lens=30),
               dust_density=0.6, dust='#ffffff', debris=('#f4f8fb', 50),
               hud=dict(pos=4, of=8, lap=(1, 3), kmh=131, boost=0.45)),
    '05': dict(title='Mesa Hauler', biome='canyon', seed=13,
               track=dict(A=(8, 4), L=(150, 50), P=(0.5, 0.2), width=12, hills=(2.0, 130)),
               sky=dict(sun_el=7, sun_rot=250, strength=0.35, clouds=0.6, cloud_col='#ffd2a8'),
               sun=dict(el=7, rot=250, energy=6.0, color='#ffc890'),
               fog=dict(density=0.0005, color='#ffcfa0', height_falloff=(0, 220)),
               scenery=[sc_canyon],
               cars=[car(RIG, 20, 0.5)],
               cam=dict(y=31, lat=6.5, h=1.1, look_y=19, look_lat=0.2, look_h=2.2, lens=24),
               dust_density=0.6, hud=dict(pos=5, of=8, lap=(2, 3), kmh=118, boost=0.2)),
    '06': dict(title='Dune Jump', biome='dunes', seed=15,
               track=dict(A=(6, 3), L=(120, 50), P=(0.3, 0.8), width=12, hills=(2.0, 120), bumps=((32, 3.2, 22),)),
               sky=dict(sun_el=7, sun_rot=25, strength=0.35, clouds=0.45, cloud_col='#ffd8b0'),
               sun=dict(el=7, rot=25, energy=6.5, color='#ffc890'),
               fog=dict(density=0.0004, color='#ffd8b0', height_falloff=(0, 200)),
               scenery=[sc_dunes],
               cars=[car(dict(BUGGY, color='#d9d4c4', accent='#3fa7d6', num=11), 40, -0.5, air=2.6, pitch=-8)],
               cam=dict(y=32, lat=-6.0, h=1.2, look_y=40, look_lat=-0.3, look_h=3.0, lens=34),
               dust_density=0.6, hud=dict(pos=1, of=8, lap=(2, 3), kmh=136, boost=1.0)),
    '07': dict(title='Tideline', biome='coast', seed=17,
               track=dict(A=(6, 3), L=(150, 60), P=(0.3, 0.9), width=12, hills=(0.4, 120)),
               sky=dict(sun_el=35, sun_rot=210, strength=0.32, clouds=0.5),
               sun=dict(el=35, rot=210, energy=7.0, color=DAY_SUN),
               water=dict(z=-2.2, color='#1a5a6e', rough=0.04),
               fog=dict(density=0.0003, color='#dfeef6', height_falloff=(0, 200)),
               scenery=[sc_coast],
               cars=[car(RALLY, 14, 0.5)],
               cam=dict(y=7, lat=4.8, h=1.9, look_y=22, look_lat=-0.5, look_h=1.3, lens=30),
               dust_density=0.5, hud=dict(pos=2, of=8, lap=(3, 3), kmh=127, boost=0.75)),
    '08': dict(title='Saltpan Sprint', biome='salt', seed=19, exposure=-0.8,
               track=dict(A=(3, 1), L=(200, 80), P=(0.3, 0.9), width=16, hills=(0.3, 200)),
               sky=dict(sun_el=48, sun_rot=160, strength=0.32, clouds=0.25),
               sun=dict(el=48, rot=160, energy=8.0, color=DAY_SUN),
               fog=dict(density=0.00015, color='#f4f2ee', height_falloff=(0, 120)),
               scenery=[sc_salt],
               cars=[car(TRUCK, 12, -2.0), car(RALLY_Y, 15, 3.0)],
               cam=dict(y=3.5, lat=-5.0, h=1.0, look_y=18, look_lat=0.6, look_h=1.3, lens=26),
               dust_density=0.5, hud=dict(pos=1, of=8, lap=(1, 2), kmh=187, boost=0.55)),
    '09': dict(title='Shatterpoint', biome='city', seed=21,
               track=dict(A=(5, 2), L=(130, 50), P=(0.3, 0.5), width=14, hills=(0.8, 100)),
               sky=dict(sun_el=5, sun_rot=200, strength=0.3, clouds=0.7, cloud_col='#ff9a6a'),
               sun=dict(el=5, rot=200, energy=4.0, color='#ffb070'),
               fog=dict(density=0.002, color='#e0a080', height_falloff=(0, 150)),
               scenery=[sc_city],
               cars=[car(MONSTER, 16, 0.5)],
               cam=dict(y=6.5, lat=-5.0, h=3.0, look_y=24, look_lat=0.5, look_h=2.4, lens=28),
               dust_density=0.4, dust='#8a807a', hud=dict(pos=2, of=6, lap=(2, 3), kmh=104, boost=0.4)),
    '10': dict(title='Bayou Fog', biome='swamp', seed=23,
               track=dict(A=(9, 4), L=(110, 40), P=(0.8, 0.2), width=10, hills=(0.6, 90)),
               sky=dict(sun_el=14, sun_rot=150, strength=0.4, clouds=0.8, overcast=0.5, grey='#7a8a7a'),
               sun=dict(el=14, rot=150, energy=2.0, color='#f2f0d0', angle=6),
               water=dict(z=-1.4, color='#2a3a2a', rough=0.06),
               fog=dict(density=0.012, color='#c8d4c0', height_falloff=(-2, 25)),
               scenery=[sc_swamp],
               cars=[car(MUD_O, 13, 0.0)],
               cam=dict(y=5.5, lat=-4.5, h=2.4, look_y=19, look_lat=0.3, look_h=1.7, lens=28),
               dust_density=0.0, debris=('#2a2016', 80), hud=dict(pos=3, of=8, lap=(1, 3), kmh=74, boost=0.15)),
    '11': dict(title='Timberline', biome='forest', seed=25,
               track=dict(A=(14, 6), L=(110, 45), P=(1.2, 0.6), width=10, hills=(3.5, 110)),
               sky=dict(sun_el=28, sun_rot=130, strength=0.33, clouds=0.55),
               sun=dict(el=28, rot=130, energy=6.5, color=DAY_SUN),
               fog=dict(density=0.0005, color='#d8e4ee', height_falloff=(0, 260)),
               scenery=[sc_forest],
               cars=[car(RALLY_Y, 13, -0.6)],
               cam=dict(y=6.0, lat=-3.8, h=2.0, look_y=22, look_lat=0.2, look_h=1.2, lens=30),
               dust_density=0.45, hud=dict(pos=1, of=8, lap=(2, 3), kmh=121, boost=0.8)),
    '12': dict(title='Quarry Pack', biome='quarry', seed=27,
               track=dict(A=(10, 4), L=(120, 50), P=(0.1, 0.4), width=13, hills=(2.0, 100)),
               sky=dict(sun_el=36, sun_rot=110, strength=0.33, clouds=0.5),
               sun=dict(el=36, rot=110, energy=7.0, color=DAY_SUN),
               fog=dict(density=0.0005, color='#e8e2d6', height_falloff=(0, 200)),
               scenery=[sc_quarry],
               cars=[car(TRUCK, 15, -2.8), car(BUGGY, 21, 2.6), car(RALLY_Y, 30, -0.6)],
               cam=dict(y=7, lat=-5.5, h=2.6, look_y=24, look_lat=0.4, look_h=1.4, lens=28),
               dust_density=0.45, hud=dict(pos=4, of=8, lap=(1, 3), kmh=115, boost=0.35)),
    '13': dict(title='Festival Grid', biome='festival', seed=29,
               track=dict(A=(5, 2), L=(140, 50), P=(0.2, 0.6), width=16, hills=(0.6, 140)),
               sky=dict(sun_el=4, sun_rot=320, strength=0.4, clouds=0.6, cloud_col='#ffb88a'),
               sun=dict(el=4, rot=320, energy=4.5, color='#ffb070'),
               fog=dict(density=0.0008, color='#ffc8a0', height_falloff=(0, 120)),
               scenery=[sc_festival],
               cars=[car(RIG, 2, -4.6), car(BUGGY, 3, -1.5), car(MUD, 1.5, 1.6), car(RALLY, 3, 4.8),
                     car(MONSTER, -6, -3.2), car(TRUCK, -6.5, 2.6)],
               cam=dict(y=17, lat=2.6, h=2.6, look_y=0, look_lat=0, look_h=1.6, lens=26, moving=False),
               dust_density=0.0, speed=0.0, hud=dict(start=True)),
    '14': dict(title='Rustwater', biome='oil', seed=31,
               track=dict(A=(12, 4), L=(120, 50), P=(0.9, 0.3), width=11, hills=(1.5, 120)),
               sky=dict(sun_el=6, sun_rot=225, strength=0.35, clouds=0.6, cloud_col='#ffb07a'),
               sun=dict(el=6, rot=225, energy=5.0, color='#ffb878'),
               fog=dict(density=0.0007, color='#ffbe8a', height_falloff=(0, 200)),
               scenery=[sc_oil],
               cars=[car(TRUCK_W, 14, 0.8), car(MUD, 34, -1.5)],
               cam=dict(y=6.5, lat=4.4, h=2.2, look_y=24, look_lat=-0.4, look_h=1.5, lens=28),
               dust_density=0.55, hud=dict(pos=2, of=8, lap=(2, 3), kmh=133, boost=0.5)),
    '15': dict(title='Ash Hauler', biome='volcano', seed=33, lava_level=-1.0,
               track=dict(A=(10, 4), L=(120, 50), P=(0.4, 1.4), width=12, hills=(1.0, 110)),
               sky=dict(sun_el=22, sun_rot=150, strength=0.3, clouds=0.9, overcast=0.55, grey='#6a5a52', cloud_col='#7a6a62'),
               sun=dict(el=22, rot=150, energy=3.0, color='#ffd0a0', angle=4),
               fog=dict(density=0.002, color='#a08a80', height_falloff=(0, 200)),
               scenery=[sc_volcano],
               cars=[car(RIG_W, 18, 0.3)],
               cam=dict(y=7, lat=-5.0, h=2.6, look_y=24, look_lat=0.3, look_h=2.2, lens=28),
               dust_density=0.45, dust='#5a4a44', hud=dict(pos=6, of=8, lap=(2, 3), kmh=109, boost=0.25)),
    '16': dict(title='Aurora Run', biome='arctic', seed=35, night=True,
               track=dict(A=(12, 5), L=(120, 45), P=(0.4, 1.6), width=12, hills=(2.0, 110)),
               sky=dict(sun_el=-8, sun_rot=0, strength=0.6, clouds=0.15, stars=True, aurora=True, tint='#6a80ff'),
               sun=dict(el=30, rot=300, energy=0.25, color='#9ab0ff'),
               fog=dict(density=0.0006, color='#9ab0e0', height_falloff=(0, 200)),
               scenery=[sc_arctic],
               cars=[car(TRUCK_W, 13, -0.6)],
               cam=dict(y=5.5, lat=-4.0, h=2.0, look_y=22, look_lat=0.4, look_h=1.6, lens=28),
               dust_density=0.45, dust='#dfe8f8', debris=('#f4f8fb', 40),
               hud=dict(pos=1, of=8, lap=(3, 3), kmh=128, boost=0.7)),
    '17': dict(title='Canopy Trail', biome='jungle', seed=37,
               track=dict(A=(11, 5), L=(100, 40), P=(0.3, 1.1), width=10, hills=(2.5, 90)),
               sky=dict(sun_el=14, sun_rot=160, strength=0.4, clouds=0.6, cloud_col='#ffe6c8'),
               sun=dict(el=14, rot=160, energy=6.0, color='#ffe2b8'),
               fog=dict(density=0.004, color='#e6f0d8', height_falloff=(0, 40)),
               scenery=[sc_jungle],
               cars=[car(BUGGY, 13, -0.5)],
               cam=dict(y=6, lat=-3.8, h=2.0, look_y=21, look_lat=0.3, look_h=1.3, lens=28),
               dust_density=0.3, dust='#8a6a48', debris=('#3a2414', 50),
               hud=dict(pos=2, of=8, lap=(1, 3), kmh=104, boost=0.55)),
    '18': dict(title='Canyon Leap', biome='canyon', seed=39,
               track=dict(A=(4, 2), L=(140, 50), P=(0.6, 0.2), width=12, hills=(1.5, 140), bumps=((26, 3.6, 20),)),
               sky=dict(sun_el=40, sun_rot=80, strength=0.3, clouds=0.5),
               sun=dict(el=40, rot=80, energy=7.5, color=DAY_SUN),
               fog=dict(density=0.0004, color='#f0d6b8', height_falloff=(0, 260)),
               scenery=[sc_canyon],
               cars=[car(RALLY_Y, 33, 0.0, air=3.4, pitch=-6, roll=4)],
               cam=dict(y=37, lat=7.0, h=1.0, look_y=31, look_lat=0, look_h=3.6, lens=26),
               dust_density=0.6, hud=dict(pos=3, of=8, lap=(2, 3), kmh=148, boost=0.4)),
    '19': dict(title='Mud Brawl', biome='mud', seed=41,
               track=dict(A=(8, 3), L=(110, 40), P=(0.5, 1.4), width=14, hills=(1.2, 90)),
               sky=dict(sun_el=30, sun_rot=140, strength=0.45, clouds=0.85, overcast=0.35, grey='#8a9494'),
               sun=dict(el=30, rot=140, energy=3.5, color='#fff2e0', angle=5),
               fog=dict(density=0.002, color='#c8d0cc', height_falloff=(-5, 80)),
               scenery=[sc_mud],
               cars=[car(MONSTER, 15, 2.6), car(MUD_O, 16, -2.6)],
               cam=dict(y=4.5, lat=-1.5, h=3.2, look_y=20, look_lat=0.0, look_h=2.0, lens=26),
               dust_density=0.2, dust='#6a5a48', debris=('#2a1e14', 90),
               hud=dict(pos=2, of=8, lap=(2, 3), kmh=88, boost=0.6)),
    '20': dict(title='Highland Gale', biome='highland', seed=43,
               track=dict(A=(13, 5), L=(120, 45), P=(0.5, 0.9), width=11, hills=(3.0, 110)),
               sky=dict(sun_el=26, sun_rot=135, strength=0.33, clouds=0.75),
               sun=dict(el=26, rot=135, energy=6.5, color=DAY_SUN),
               fog=dict(density=0.0006, color='#e0e8ee', height_falloff=(0, 260)),
               scenery=[sc_highland],
               cars=[car(BUGGY, 13, -1.6), car(RALLY, 25, 2.4)],
               cam=dict(y=6.0, lat=-4.6, h=2.2, look_y=22, look_lat=0.4, look_h=1.3, lens=28),
               dust_density=0.45, hud=dict(pos=2, of=8, lap=(1, 3), kmh=139, boost=0.85)),
}
SHOTS['test'] = SHOTS['01']
