"""Versioni canalizzate delle stufe con sagoma visibile equivalente."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
specs=[('ravelli-rc-120-touch-steel','ravelli-rv-120-touch-steel',(.540,.580,1.170),(.540,.570,1.170),['bianco','nero']),('ravelli-rc-70','ravelli-r-70',(.440,.470,.960),(.440,.450,.950),['bianco','bordeaux','nero']),('ravelli-sc-90','ravelli-s90',(.440,.500,.930),(.440,.500,.930),['bianco','grigio','bronzo']),('ravelli-vittoria-c','ravelli-vittoria-v',(.510,.560,1.160),(.510,.570,1.160),['bianco','nero','bordeaux'])]
for target,source,(w,d,h),(sw,sd,sh),finishes in specs:
    for finish in finishes:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves'/f'{source}-{finish}.glb'))
        for o in bpy.context.scene.objects:
            o.location.x*=w/sw;o.scale.x*=w/sw;o.location.y*=d/sd;o.scale.y*=d/sd;o.location.z*=h/sh;o.scale.z*=h/sh
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{target}-{finish}.glb'),export_format='GLB',use_selection=True,export_apply=True)
        if finish==finishes[0]:
            bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{target}.blend'))
