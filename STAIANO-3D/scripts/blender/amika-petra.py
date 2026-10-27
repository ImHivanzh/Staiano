"""AMIKA PETRA AD: black body with natural stone top, from the catalog photo."""
from pathlib import Path
import random
import bpy

root = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'public/models/stoves/nordica-amika-ad-nero.glb'))
top = bpy.data.objects['Bordo superiore']
stone = bpy.data.materials.new('Pietra naturale grigia')
stone.use_nodes = True
shader = stone.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .84
image = bpy.data.images.new('Graniglia pietra naturale', width=256, height=256)
random.seed(283503)
pixels = []
for _ in range(256 * 256):
    value = max(.15, min(.62, random.gauss(.39, .075)))
    pixels.extend((value, value * 1.015, value * .99, 1))
image.pixels = pixels
image.pack()
tex = stone.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
stone.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
top.data.materials.clear()
top.data.materials.append(stone)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(root / 'public/models/stoves/nordica-amika-petra-ad-pietra.glb'), export_format='GLB', use_selection=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(root / 'assets/blender/stufa-amika-petra.blend'))
