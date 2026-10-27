"""ROSSELLA e TERMOROSSELLA: versioni affini a GEMMA con misure specifiche."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
ceramic={'liberty-bordeaux':'elegance-bordeaux','liberty-bianco-infinity':'elegance-bianco-infinity','liberty-panna':'liberty-panna'}
specs=[('nordica-rossella-plforno165-ceramica',(.559,.536,1.411),'nordica-gemma-forno165-ceramica',(.460,.495,1.265),['liberty-bordeaux','liberty-panna']),('nordica-rossella-plus-forno165-petra',(.559,.536,1.411),'nordica-gemma-forno165-petra',(.460,.495,1.265),['pietra']),('nordica-rossella-r116-ceramica',(.578,.586,1.370),'nordica-gemma16-ceramica',(.460,.495,1.358),['liberty-bordeaux','liberty-bianco-infinity','liberty-panna']),('nordica-rossella-r116-petra',(.578,.586,1.370),'nordica-gemma16-petra',(.460,.495,1.358),['pietra']),('nordica-termorossella-plus-dsa16-cera',(.559,.538,.967),'nordica-gemma16-ceramica',(.460,.495,1.358),['liberty-panna','liberty-bordeaux']),('nordica-termorossella-plus-dsa16-petr',(.559,.538,.967),'nordica-gemma16-petra',(.460,.495,1.358),['pietra']),('nordica-trossplus-forno-dsa16-ceram',(.559,.538,1.411),'nordica-gemma-forno165-ceramica',(.460,.495,1.265),['liberty-panna','liberty-bordeaux']),('nordica-trossplus-forno-dsa16-petra',(.559,.538,1.411),'nordica-gemma-forno165-petra',(.460,.495,1.265),['pietra'])]
for target,(w,d,h),source,(sw,sd,sh),finishes in specs:
    for label in finishes:
        source_label=ceramic.get(label,label)
        if source=='nordica-gemma-forno165-ceramica' and label=='liberty-panna':source_label='elegance-bianco-infinity'
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves'/f'{source}-{source_label}.glb'))
        for o in bpy.context.scene.objects:
            o.location.x*=w/sw;o.scale.x*=w/sw;o.location.y*=d/sd;o.scale.y*=d/sd;o.location.z*=h/sh;o.scale.z*=h/sh
        if source=='nordica-gemma-forno165-ceramica' and label=='liberty-panna':
            shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento '+source));rgb=(.80,.75,.67);shell.diffuse_color=(*rgb,1);shell.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{target}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
        if label==finishes[0]:
            bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{target}.blend'))
