"""Render Gravel Riot gameplay snapshots.

Usage: python render_shots.py OUT_DIR SHOT_ID[,SHOT_ID...] [WIDTH] [SAMPLES]
"""
import sys, os, math, random, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import gr3d as G
from shots import SHOTS

REAR = {'truck': -1.75, 'rally': -1.22, 'buggy': -1.35, 'mud': -1.25, 'monster': -1.65, 'rig': -3.6}
TRACKW = {'truck': 2.35, 'rally': 1.62, 'buggy': 2.1, 'mud': 2.3, 'monster': 3.0, 'rig': 1.95}


def build(cfg, res, samples):
    G.reset()
    G._wheel_cache.clear()
    G._dust_mats.clear()
    G.setup_render(res, samples, exposure=cfg.get('exposure', 0.0))
    biome = cfg['biome']
    B = G.BIOMES[biome]
    track = G.Track(**cfg.get('track', {}))
    terr = G.Terrain(track, biome, seed=cfg.get('seed', 1))
    tmat = G.terrain_material(biome, lava_level=cfg.get('lava_level'), snow_level=cfg.get('snow_level'))
    terr.build(tmat)
    sk = cfg['sky']
    G.world(**sk)
    if cfg.get('sun'):
        G.sun(**cfg['sun'])
    if cfg.get('fog'):
        G.fog_volume(**cfg['fog'])
    if cfg.get('water'):
        G.water_plane(**cfg['water'])
    night = cfg.get('night', False)
    speed = cfg.get('speed', 30.0)
    # scenery
    for fn in cfg.get('scenery', []):
        fn(G, track, terr)
    # vehicles
    dust_col = cfg.get('dust', B['dust'])
    mudm = G.mat_simple('mudchunk', B['trk'][1], rough=0.35)
    for i, v in enumerate(cfg['cars']):
        root = G.build_vehicle(v['kind'], v['color'], v['accent'], v['num'], dust_col, night=night, speed=speed)
        p, fwd, side, z = G.place_vehicle(root, track, terr, v['y'], v.get('lat', 0.0), v.get('air', 0.0),
                                          math.radians(v.get('pitch', 0)), math.radians(v.get('roll', 0)), speed)
        if v.get('air', 0) == 0 and cfg.get('dust_density', 0.5) > 0:
            rear = p + fwd * REAR[v['kind']]
            G.dust_sprites(rear + Vector((0, 0, 0.2)), fwd, cfg.get('dust_len', 14), TRACKW[v['kind']] * 0.6,
                           cfg.get('dust_h', 1.6), dust_col, opacity=cfg.get('dust_density', 0.5), seed=i + 3)
        if v.get('air', 0) == 0 and cfg.get('debris'):
            dcol, dn = cfg['debris']
            dm = G.mat_simple('debris%d' % i, dcol, rough=0.3)
            for s in (-1, 1):
                G.debris(p + fwd * REAR[v['kind']] + side * s * TRACKW[v['kind']] / 2 - fwd * 0.6 + Vector((0, 0, 0.3)), fwd, dn, dm,
                         seed=i * 7 + s + 9, vel=fwd * speed * 0.6)
    # camera
    c = cfg['cam']
    cy = c['y']
    cp, cf, cs = track.frame(cy, c.get('lat', 0.0))
    cz, _ = terr.height(cp.x, cp.y)
    tp, tf, ts = track.frame(c['look_y'], c.get('look_lat', 0.0))
    tz, _ = terr.height(tp.x, tp.y)
    loc = Vector((cp.x, cp.y, cz + c['h']))
    look = Vector((tp.x, tp.y, tz + c.get('look_h', 1.0)))
    G.camera(loc, look, lens=c.get('lens', 28), motion=cf * speed if c.get('moving', True) else None,
             dof=c.get('dof'))
    G.face_camera(bpy.context.scene.camera)
    return track, terr


def main():
    out = sys.argv[1]
    ids = sys.argv[2].split(',')
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
    samples = int(sys.argv[4]) if len(sys.argv) > 4 else 64
    os.makedirs(out, exist_ok=True)
    for sid in ids:
        cfg = SHOTS[sid]
        t0 = time.time()
        build(cfg, (width, width * 9 // 16), samples)
        bpy.context.scene.render.filepath = os.path.join(out, sid + '.png')
        bpy.ops.render.render(write_still=True)
        print('RENDERED', sid, round(time.time() - t0, 1), 's', flush=True)


if __name__ == '__main__':
    main()
