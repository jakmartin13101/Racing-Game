"""Decimate the Poly Haven models to game budgets and write <name>_lod.glb
(textures embedded as JPEG) next to the source glTF in public/models/env/."""
import os
import sys
import bpy

ENV = os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'env')
BUDGET = {'boulder_01': 3000, 'namaqualand_boulder_02': 3500, 'namaqualand_cliff_02': 9000, 'rock_09': 2500,
          'concrete_road_barrier': 1200, 'metal_jerrycan': 1500, 'rusted_wheel_rim_02': 2500, 'modular_chainlink_fence': 6000,
          'Barrel_01': 3000, 'barrel_03': 3000, 'old_tyre': 3000, 'propane_tank': 3000, 'wooden_crate_02': 3000}
for name, budget in BUDGET.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f'{ENV}/{name}/{name}_2k.gltf')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, budget / max(tris, 1))
    if ratio < 0.98:
        for o in meshes:
            m = o.modifiers.new('dec', 'DECIMATE')
            m.ratio = ratio
            m.use_collapse_triangulate = True
    out = f'{ENV}/{name}/{name}_lod.glb'
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_image_format='JPEG',
                              export_jpeg_quality=85)
    print(name, tris, '->', int(tris * ratio), os.path.getsize(out) // 1024, 'KB')
