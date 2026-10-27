"""RAFFAELLA, ROSANNA e VIRNA IDRO: geometrie e finiture da catalogo."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
specs=[('nordica-raffaella-idro-h15-5016',(.633,.626,1.176),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('grigio-luce',(.50,.50,.49))],True),('nordica-raffaella-idro-h18-5016',(.633,.626,1.176),[('grigio-luce',(.50,.50,.49)),('avorio',(.76,.64,.44))],True),('nordica-rosanna-idro-50',(.511,.632,1.150),[('nero',(.025,.027,.028)),('bordeaux',(.28,.025,.034)),('avorio',(.76,.64,.44)),('bronzo',(.31,.18,.12))],False)]
for ident,(w,d,h),finishes,raffaella in specs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves/nordica-miriana-idro-h20-avorio.glb'))
    for o in bpy.context.scene.objects:
        o.location.x*=w/.599;o.scale.x*=w/.599;o.location.y*=d/.724;o.scale.y*=d/.724;o.location.z*=h/1.248;o.scale.z*=h/1.248
    shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento nordica-dahiana-ad'))
    black=next(m for m in bpy.data.materials if m.name.startswith('Acciaio scuro'))
    if raffaella:
        for side in (-1,1):
            for i in range(3):
                bpy.ops.mesh.primitive_cube_add(size=1,location=(side*w*.13,-d/2-.022,h*(.92-i*.018)))
                o=bpy.context.object;o.name='Feritoia superiore';o.dimensions=(w*.18,.005,.004);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(black)
    bpy.ops.object.select_all(action='SELECT');p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{ident}.blend'))

bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
shell=mat('Rivestimento',(.55,.008,.018));black=mat('Telaio nero',(.018,.02,.021));dark=mat('Porta',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16)
def box(name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordi','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
w,d,h=.793,.384,1.105
box('Corpo',(0,0,h/2),(w,d,h-.02),black,.01)
box('Pannello laterale',(w*.24,-d/2-.006,h*.50),(w*.51,.015,h*.96),shell,.01)
box('Montante',(-w*.44,-d/2-.006,h*.50),(w*.11,.015,h*.96),shell,.01)
box('Cornice superiore',(0,-d/2-.006,h*.96),(w,.015,h*.07),shell,.008)
box('Porta',(-w*.20,-d/2-.009,h*.50),(w*.38,.018,h*.74),dark,.004)
box('Vetro sportello',(-w*.20,-d/2-.020,h*.54),(w*.15,.005,h*.32),glass,.002)
box('Maniglia',(-w*.02,-d/2-.021,h*.44),(.01,.012,.08),black,.002)
box('Zoccolo',(0,0,.01),(w*.92,d*.90,.02),black,.004)
bpy.ops.object.select_all(action='SELECT');p=shell.node_tree.nodes.get('Principled BSDF')
for label,rgb in [('bordeaux',(.55,.008,.018)),('bianco',(.83,.84,.83)),('tortora-matt',(.47,.38,.33))]:
    shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'nordica-virna-idro16-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
shell.diffuse_color=(.55,.008,.018,1);p.inputs['Base Color'].default_value=(.55,.008,.018,1)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-nordica-virna-idro16.blend'))
