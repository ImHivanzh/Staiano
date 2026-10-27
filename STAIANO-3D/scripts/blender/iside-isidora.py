"""ISIDE IDRO e ISIDORA H16/H20/H23: maiolica e focolare da catalogo."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.3,metal=.05):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa nera',(.014,.016,.017),.42,.3);dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16,.15)
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
specs=[
('nordica-iside-idro-5016',(.690,.628,1.196),[('bianco',(.83,.84,.83)),('pergamena',(.74,.68,.58)),('vogue-ametista',(.30,.16,.23))],True),
('nordica-isidora-idro-h16-50-evo',(.596,.708,1.165),[('tortora-lucido',(.47,.38,.33)),('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034))],False),
('nordica-isidora-idro-h20-50-evo',(.596,.708,1.243),[('avorio',(.76,.64,.44)),('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034))],False),
('nordica-isidora-idro-h23-50-evo',(.596,.737,1.243),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('avorio',(.76,.64,.44))],False)]
for ident,(w,d,h),finishes,iside in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Maiolica '+ident,finishes[0][1])
    box(c,'Corpo interno',(0,0,h/2),(w*.78,d,h-.02),black,.035)
    for side in (-1,1):
        if iside:
            for i in range(3):
                z=h*(.17+i*.30);box(c,'Pannello maiolica',(side*w*.38,-d*.38,z),(w*.24,d*.24,h*.295),shell,.025)
                box(c,'Riquadro pannello',(side*w*.38,-d/2-.008,z),(w*.19,.006,h*.22),shell,.018)
        else:box(c,'Montante maiolica',(side*w*.40,-d*.37,h*.50),(w*.20,d*.26,h*.95),shell,.03)
    box(c,'Copertura superiore',(0,-d*.28,h*.955),(w,d*.44,h*.075),shell,.018)
    box(c,'Pannello inferiore',(0,-d/2-.007,h*.105),(w*.55,.016,h*.18),shell,.014)
    box(c,'Cornice sportello',(0,-d/2-.009,h*.52),(w*.55,.022,h*.58),dark,.008)
    box(c,'Porta ghisa',(0,-d/2-.021,h*.52),(w*.49,.012,h*.54),black,.008)
    box(c,'Vetro sportello',(0,-d/2-.029,h*.54),(w*.34,.006,h*.39),glass,.005)
    box(c,'Maniglia',(-w*.245,-d/2-.031,h*.49),(.013,.02,.15),black,.004)
    if iside:
        box(c,'Maiolica superiore',(0,-d/2-.010,h*.87),(w*.34,.018,h*.14),shell,.008)
        for i in range(6):
            for side in (-1,1):box(c,'Griglia verticale',(side*(w*.20+i*.006),-d/2-.021,h*.87),(.003,.007,h*.15),dark,.0005)
    else:box(c,'Maiolica superiore',(0,-d/2-.008,h*.88),(w*.55,.016,h*.14),shell,.014)
    box(c,'Zoccolo',(0,0,.01),(w*.90,d*.90,.02),black,.007)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-iside-isidora.blend'))
