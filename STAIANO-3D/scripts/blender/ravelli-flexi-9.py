"""FLEXI 9: sagoma della FLEXI 7, stessa misura esterna, finiture proprie."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/ravelli-flexi-7-bianco.glb'))
shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento bianco'))
p=shell.node_tree.nodes.get('Principled BSDF');bpy.ops.object.select_all(action='SELECT')
for label,rgb in [('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028)),('grigio',(.16,.17,.17))]:
    shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'ravelli-flexi-9-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
shell.diffuse_color=(.83,.84,.83,1);p.inputs['Base Color'].default_value=(.83,.84,.83,1)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-ravelli-flexi-9.blend'))
