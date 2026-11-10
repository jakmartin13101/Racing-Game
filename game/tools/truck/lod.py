"""Decimated copy of the truck for distant / opponent use: public/models/truck_lod.glb.
Keeps node names, UVs and material names so the same baked atlases bind in-engine.

    python tools/truck/lod.py
"""
import os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '..', '..', 'public', 'models')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(PUB, 'truck.glb'))
TARGET = {'body': 14000, 'wheel': 1800}
for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    goal = TARGET['body'] if o.name.startswith('body') else TARGET['wheel'] if o.name.startswith('wheel') else None
    if not goal or tris <= goal:
        continue
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = goal / tris
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='dec')
    print(o.name, tris, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=os.path.join(PUB, 'truck_lod.glb'), export_format='GLB', export_image_format='NONE',
                          export_materials='PLACEHOLDER' if False else 'EXPORT', export_yup=True)
