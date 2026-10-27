"""MARIeLLA AD: forma affine ad ANGELICA EVO, adeguata alle misure proprie."""
from pathlib import Path
import bpy

root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/nordica-angelica-evo-avorio.glb'))
for o in bpy.context.scene.objects:
    o.location.y *= .508/.555; o.scale.y *= .508/.555
    o.location.z *= 1.019/1.016; o.scale.z *= 1.019/1.016
shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento nordica-angelica-evo'))
shader=shell.node_tree.nodes.get('Principled BSDF')
bpy.ops.object.select_all(action='SELECT')
for label,rgb in [('avorio',(.80,.75,.68)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028))]:
    shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'nordica-mariella-ad-{label}.glb'),export_format='GLB',use_selection=True)
shell.diffuse_color=(.80,.75,.68,1); shader.inputs['Base Color'].default_value=(.80,.75,.68,1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-mariella-ad.blend'))
