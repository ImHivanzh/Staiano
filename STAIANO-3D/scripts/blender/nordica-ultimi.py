"""SUPER JUNIOR, TEA, SIERRA e TERMOROSA: modelli finali del catalogo."""
from pathlib import Path
import random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa antracite',(.025,.027,.028));dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);metal=mat('Dettagli metallo',(.22,.22,.21))
def stone():
    m=mat('Pietra naturale',(.40,.41,.41),.8);im=bpy.data.images.new('Pietra grigia',width=256,height=256);random.seed(99);v=[]
    for _ in range(256*256):
        x=max(.2,min(.6,random.gauss(.39,.04)));v.extend((x,x*1.01,x,1))
    im.pixels=v;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
colors={'nero':(.025,.027,.028),'verde':(.08,.17,.10),'nero-antracite':(.025,.027,.028),'bianco':(.83,.84,.83),'bordeaux':(.43,.012,.018)}
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;return o
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
    return o
def cylinder(c,name,loc,size,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1,depth=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
specs=[('nordica-super-junior-lean',(.356,.423,.802),['nero','verde'],'upright'),('nordica-tea16',(.414,.473,1.346),['nero-antracite','bianco'],'tea'),('nordica-sierra16', (1.252,.665,.858),['nero-antracite'],'range'),('nordica-termorosa-dsa16-ceramica',(1.030,.664,.855),['bordeaux'],'range'),('nordica-termorosa-dsa16-petra',(1.030,.664,.855),['pietra'],'range')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=stone() if finishes[0]=='pietra' else mat('Rivestimento '+ident,colors[finishes[0]])
    pipe=.24 if kind=='tea' else .03;body=h-pipe
    box(c,'Corpo',(0,0,body/2),(w,d,body-.02),black,.012)
    if kind=='range':
        for side in (-1,1):box(c,'Rivestimento laterale',(side*w*.43,0,body*.50),(w*.14,d*.96,body*.94),shell,.006)
        box(c,'Pannello inferiore',(0,-d/2-.008,body*.10),(w*.85,.016,body*.17),shell,.004)
        box(c,'Porta focolare',(-w*.18,-d/2-.009,body*.57),(w*.28,.018,body*.43),dark,.006)
        box(c,'Vetro focolare',(-w*.18,-d/2-.020,body*.58),(w*.19,.006,body*.29),glass,.004)
        box(c,'Sportello forno',(w*.20,-d/2-.009,body*.57),(w*.35,.018,body*.43),dark,.006)
        box(c,'Vetro forno',(w*.20,-d/2-.020,body*.58),(w*.26,.006,body*.29),glass,.004)
        cylinder(c,'Termometro forno',(w*.20,-d/2-.025,body*.58),(.025,.006,.025),metal)
    else:
        for side in (-1,1):box(c,'Rivestimento laterale',(side*w*.40,0,body*.50),(w*.20,d*.96,body*.94),shell,.008)
        box(c,'Porta',(0,-d/2-.009,body*.52),(w*.70,.018,body*.65),dark,.006)
        box(c,'Vetro sportello',(0,-d/2-.020,body*.57),(w*.48,.006,body*.36),glass,.004)
        cylinder(c,'Regolatore aria',(0,-d/2-.023,body*.25),(.055,.006,.055),metal)
    box(c,'Coperchio',(0,0,body-.012),(w,d,.024),black,.006)
    cylinder(c,'Scarico fumi',(0,d*.12,body+pipe/2),(.10,.10,pipe),black)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label in finishes:
        if label!='pietra':rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    if finishes[0]!='pietra':rgb=colors[finishes[0]];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-nordica-ultimi.blend'))
