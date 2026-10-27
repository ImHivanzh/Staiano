"""MARINA e MIRIANA IDRO: varianti da sagoma affine, con dimensioni proprie."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
specs=[('nordica-marina-idro-h11',(.550,.601,1.039),[('bronzo',(.31,.18,.12)),('avorio',(.80,.75,.68)),('bordeaux',(.28,.025,.034))],False),('nordica-marina-idro-h13',(.550,.601,1.149),[('avorio',(.80,.75,.68)),('bordeaux',(.28,.025,.034)),('bronzo',(.31,.18,.12))],False),('nordica-miriana-idro-h16',(.599,.724,1.170),[('avorio',(.80,.75,.68)),('nero',(.025,.027,.028)),('tortora-matt',(.47,.38,.33))],True),('nordica-miriana-idro-h20',(.599,.724,1.248),[('avorio',(.80,.75,.68)),('tortora-matt',(.47,.38,.33)),('nero',(.025,.027,.028))],True),('nordica-miriana-idro-h23',(.599,.724,1.248),[('avorio',(.80,.75,.68)),('tortora-matt',(.47,.38,.33)),('nero',(.025,.027,.028))],True)]
for ident,(w,d,h),finishes,miriana in specs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/nordica-dahiana-ad-avorio.glb'))
    for o in bpy.context.scene.objects:
        o.location.x*=w/.525;o.scale.x*=w/.525
        o.location.y*=d/.602;o.scale.y*=d/.602
        o.location.z*=h/1.080;o.scale.z*=h/1.080
    shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento nordica-dahiana-ad'))
    black=next(m for m in bpy.data.materials if m.name.startswith('Acciaio scuro'))
    if miriana:
        lower=bpy.data.objects['Pannello inferiore'];lower.data.materials.clear();lower.data.materials.append(black)
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-d/2-.010,h*.89));o=bpy.context.object;o.name='Pannello superiore';o.dimensions=(w*.57,.018,h*.14);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(black)
    bpy.ops.object.select_all(action='SELECT');shader=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);shader.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);shader.inputs['Base Color'].default_value=(*rgb,1)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{ident}.blend'))
