"""VITTORIA, EASY 12/C e SPHERE C, derivate dalle forme di catalogo affini."""
from pathlib import Path
from shutil import copyfile
import bpy
root=Path(__file__).resolve().parents[2]
colors={'bianco':(.83,.84,.83),'bordeaux':(.28,.025,.034),'nero':(.025,.027,.028),'bronzo':(.24,.13,.075)}
specs=[('ravelli-vittoria-v','ravelli-rv-120-touch-steel',(.510,.570,1.160),(.540,.570,1.170),['bianco','nero','bordeaux']),('ravelli-easy-12','ravelli-easy-7',(.525,.546,1.076),(.525,.480,1.030),['bianco','bordeaux','bronzo']),('ravelli-easy-12-c','ravelli-easy-7',(.525,.571,1.076),(.525,.480,1.030),['bianco'])]
for target,source,(w,d,h),(sw,sd,sh),finishes in specs:
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves'/f'{source}-bianco.glb'))
    for o in bpy.context.scene.objects:
        o.location.x*=w/sw;o.scale.x*=w/sw;o.location.y*=d/sd;o.scale.y*=d/sd;o.location.z*=h/sh;o.scale.z*=h/sh
    shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento '+source));p=shell.node_tree.nodes.get('Principled BSDF')
    bpy.ops.object.select_all(action='SELECT')
    for label in finishes:
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{target}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors['bianco'];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{target}.blend'))
for label in ('bianco','bordeaux','nero','bronzo','grigio'):
    copyfile(root/'public/models/stoves'/f'ravelli-sphere-v-{label}.glb',root/'public/models/stoves'/f'ravelli-sphere-c-{label}.glb')
