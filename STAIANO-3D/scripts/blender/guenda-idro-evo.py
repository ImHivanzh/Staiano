"""GUENDA IDRO EVO: forma affine ad ANGELICA con misure e griglia proprie."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/nordica-angelica-evo-avorio.glb'))
for o in bpy.context.scene.objects:
    o.location.x *= .576/.495;o.scale.x *= .576/.495
    o.location.y *= .638/.555;o.scale.y *= .638/.555
    o.location.z *= 1.157/1.016;o.scale.z *= 1.157/1.016
shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento nordica-angelica-evo'))
dark=next(m for m in bpy.data.materials if m.name.startswith('Metallo nero'))
for i in range(3):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.638/2-.025,1.157*.87-i*.010))
    o=bpy.context.object;o.name='Griglia superiore';o.dimensions=(.576*.43,.006,.004);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(dark)
bpy.ops.object.select_all(action='SELECT');p=shell.node_tree.nodes.get('Principled BSDF')
for label,rgb in [('avorio',(.80,.75,.68)),('bronzo',(.31,.18,.12)),('tortora-matt',(.47,.38,.33))]:
    shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'nordica-guenda-idro-evo-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
shell.diffuse_color=(.80,.75,.68,1);p.inputs['Base Color'].default_value=(.80,.75,.68,1)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-guenda-idro-evo.blend'))
