"""Ravelli DUAL 7/9 e S70/S90: dimensioni dai manuali e forme dalle foto."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
colors={'bianco':(.83,.84,.83),'nero':(.025,.027,.028),'bronzo':(.24,.13,.075),'grigio':(.12,.14,.15)}
for ident,(w,d,h) in [('ravelli-dual-7',(.502,.561,1.041)),('ravelli-dual-9',(.460,.562,1.081))]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/ravelli-whisper-7-bianco.glb'))
    for o in bpy.context.scene.objects:
        o.location.x*=w/.504;o.scale.x*=w/.504;o.location.y*=d/.561;o.scale.y*=d/.561;o.location.z*=h/1.040;o.scale.z*=h/1.040
    shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento ravelli-whisper-7'))
    black=next(m for m in bpy.data.materials if m.name.startswith('Telaio nero') or m.name.startswith('Acciaio nero'))
    for i in range(4):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-d/2-.011,h*(.87-i*.009)));o=bpy.context.object;o.name='Griglia superiore';o.dimensions=(w*.37,.005,.004);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(black)
    bpy.ops.object.select_all(action='SELECT');p=shell.node_tree.nodes.get('Principled BSDF')
    for label in ('bianco','nero','bronzo'):
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors['bianco'];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{ident}.blend'))
for ident in ('ravelli-s70','ravelli-s90'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    def mat(name,rgb,rough=.4):
        m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
    shell=mat('Rivestimento',colors['bianco']);black=mat('Telaio nero',(.018,.020,.021));dark=mat('Griglia',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16)
    def box(name,loc,size,m,bevel=.003):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
        if bevel:
            b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
        return o
    w,d,h=.440,.500,.930
    box('Corpo',(0,0,h/2),(w,d,h-.02),black,.014)
    for side in (-1,1):box('Rivestimento laterale',(side*w*.37,0,h*.63),(w*.25,d*.95,h*.70),shell,.018)
    box('Porta',(0,-d/2-.009,h*.48),(w*.62,.018,h*.72),black,.004)
    box('Vetro sportello',(0,-d/2-.021,h*.57),(w*.37,.005,h*.30),glass,.003)
    for i in range(6):box('Griglia superiore',(0,-d/2-.020,h*.91-i*.012),(w*.57,.006,.005),dark,.0005)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.04,depth=.10,location=(0,d*.20,h+.05));bpy.context.object.name='Scarico superiore';bpy.context.object.data.materials.append(black)
    bpy.ops.object.select_all(action='SELECT');p=shell.node_tree.nodes.get('Principled BSDF')
    for label in ('bianco','grigio','bronzo'):
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors['bianco'];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{ident}.blend'))
