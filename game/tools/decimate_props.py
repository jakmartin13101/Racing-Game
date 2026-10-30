"""Decimate the Poly Haven models to game budgets and write <name>_lod.glb
(textures embedded as JPEG) to public/models/env/<name>/.

    ASSETS=/path/to/assets /opt/bpyenv/bin/python tools/decimate_props.py [names...]
"""
import os
import shutil
import sys
import bpy

SRC = os.path.join(os.environ.get('ASSETS', '/tmp/assets'), 'polyhaven', 'models')
ENV = os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'env')
# name: (triangle budget, max texture size)
BUDGET = {'boulder_01': (3000, 2048), 'namaqualand_boulder_02': (3500, 2048), 'namaqualand_cliff_02': (9000, 2048),
          'rock_09': (2500, 2048), 'concrete_road_barrier': (1200, 2048), 'metal_jerrycan': (1500, 2048),
          'rusted_wheel_rim_02': (2500, 2048), 'Barrel_01': (3000, 2048), 'barrel_03': (3000, 2048),
          'old_tyre': (3000, 2048), 'propane_tank': (3000, 2048), 'wooden_crate_02': (3000, 2048),
          # village pack
          'dead_tree_trunk': (5000, 1024), 'dead_tree_trunk_02': (5000, 1024), 'dry_branches_medium_01': (4000, 1024),
          'shrub_01': (3000, 1024), 'shrub_02': (3000, 1024), 'shrub_03': (3000, 1024), 'shrub_04': (3000, 1024),
          'street_lamp_01': (1500, 1024), 'painted_wooden_bench': (1500, 1024), 'wooden_crate_01': (800, 1024),
          'Barrel_02': (1500, 1024), 'wine_barrel_01': (1500, 1024), 'stone_fire_pit': (2500, 1024),
          'island_tree_01': (14000, 1024), 'wooden_picnic_table': (1500, 1024)}
names = sys.argv[1:] or list(BUDGET)
for name in names:
    budget, tex = BUDGET[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f'{SRC}/{name}/{name}_2k.gltf')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, budget / max(tris, 1))
    if ratio < 0.98:
        for o in meshes:
            m = o.modifiers.new('dec', 'DECIMATE')
            m.ratio = ratio
            m.use_collapse_triangulate = True
    for img in bpy.data.images:
        if img.size[0] > tex:
            img.scale(tex, max(1, img.size[1] * tex // img.size[0]))
    os.makedirs(f'{ENV}/{name}', exist_ok=True)
    out = f'{ENV}/{name}/{name}_lod.glb'
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_image_format='JPEG',
                              export_jpeg_quality=85)
    lic = f'{SRC}/{name}/LICENSE.txt'
    if os.path.exists(lic):
        shutil.copy(lic, f'{ENV}/{name}/LICENSE.txt')
    print(name, tris, '->', int(tris * ratio), os.path.getsize(out) // 1024, 'KB')
