"""SABRY AD: geometria affine ad ANGELICA, adeguata alle dimensioni della scheda."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/nordica-angelica-evo-avorio.glb'))
for o in bpy.context.scene.objects:
    o.location.x *= .456/.495; o.scale.x *= .456/.495
    o.location.z *= .924/1.016; o.scale.z *= .924/1.016
shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento nordica-angelica-evo'))
shader=shell.node_tree.nodes.get('Principled BSDF')
bpy.ops.object.select_all(action='SELECT')
for label,rgb in [('grigio-grafite',(.045,.05,.051)),('avorio',(.80,.75,.68)),('bronzo',(.31,.18,.12)),('nero',(.025,.027,.028))]:
    shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'nordica-sabry-ad-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
shell.diffuse_color=(.045,.05,.051,1); shader.inputs['Base Color'].default_value=(.045,.05,.051,1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-sabry-ad.blend'))
