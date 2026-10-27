"""TERRY PLUS e COSTANZA IDRO 5.0 da foto e misure di catalogo."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Corpo nero',(.018,.02,.021));dark=mat('Griglie',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16)
def box(c,name,loc,dims,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordi','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
for ident,(w,d,h),finishes,terry in [
    ('nordica-terry-plus',(.569,.598,1.151),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('tortora-lucido',(.47,.38,.33))],True),
    ('nordica-costanza-idro-50',(.495,.628,1.152),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034))],False)]:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,finishes[0][1])
    box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.025)
    for side in (-1,1):box(c,'Rivestimento laterale',(side*w*.39,-d*.27,h*.50),(w*.22,d*.46,h*.96),shell,.035)
    box(c,'Coperchio',(0,-d*.30,h*.965),(w,d*.40,h*.055),shell,.012)
    box(c,'Cornice sportello',(0,-d/2-.008,h*.53),(w*.55,.018,h*.52),dark,.005)
    box(c,'Vetro sportello',(0,-d/2-.020,h*.54),(w*.30,.006,h*.32),glass,.003)
    box(c,'Maniglia',(-w*.25,-d/2-.021,h*.48),(.012,.02,.12),black,.003)
    box(c,'Pannello inferiore',(0,-d/2-.008,h*.15),(w*.55,.018,h*.25),shell if terry else black,.004)
    box(c,'Pannello superiore',(0,-d/2-.008,h*.86),(w*.55,.018,h*.12),shell if terry else black,.004)
    for i in range(3):box(c,'Feritoia superiore',(0,-d/2-.020,h*.89-i*.018),(w*.43,.006,.007),dark,.0005)
    box(c,'Zoccolo',(0,0,.01),(w*.90,d*.90,.02),dark,.006)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-terry-costanza.blend'))
