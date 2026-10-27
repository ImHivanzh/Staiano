"""ESTER, FEDORA e GEMMA, con versioni forno e rivestimenti distinti."""
from pathlib import Path
import math,random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa antracite',(.025,.027,.028));dark=mat('Telaio',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);metal=mat('Maniglia',(.18,.18,.17))
def stone():
    m=mat('Pietra',(.4,.41,.41),.8);im=bpy.data.images.new('Pietra',width=256,height=256);random.seed(45);v=[]
    for _ in range(256*256):
        x=max(.2,min(.6,random.gauss(.39,.04)));v.extend((x,x*1.01,x,1))
    im.pixels=v;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
colors={'vulcan':(.24,.23,.25),'bianco-infinity':(.83,.84,.83),'bordeaux':(.43,.012,.018),'nero-antracite':(.025,.027,.028),'liberty-panna':(.80,.75,.67),'elegance-bordeaux':(.43,.012,.018),'elegance-bianco-infinity':(.83,.84,.83)}
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
    return o
def cylinder(c,name,loc,size,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1,depth=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
specs=[('nordica-ester-50',(.540,.485,1.331),['vulcan'],'ester',False),('nordica-ester-forno-50',(.540,.485,1.512),['vulcan'],'ester',True),('nordica-fedora16-maiolica',(.559,.547,1.086),['bianco-infinity','bordeaux'],'fedora',False),('nordica-fedora16-steel',(.559,.547,1.086),['nero-antracite'],'fedora',False),('nordica-gemma16-ceramica',(.460,.495,1.358),['liberty-panna','elegance-bordeaux','elegance-bianco-infinity'],'gemma',False),('nordica-gemma16-petra',(.460,.495,1.358),['pietra'],'gemma',False),('nordica-gemma-forno165-ceramica',(.460,.495,1.265),['elegance-bordeaux','elegance-bianco-infinity'],'gemma',True),('nordica-gemma-forno165-petra',(.460,.495,1.265),['pietra'],'gemma',True)]
for ident,(w,d,h),finishes,kind,oven in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=stone() if finishes[0]=='pietra' else mat('Rivestimento '+ident,colors[finishes[0]])
    pipe=.25 if h>1.30 else .06;body=h-pipe;base=.04
    box(c,'Corpo',(0,0,(base+body)/2),(w,d,body-base),black,.012)
    for side in (-1,1):
        for i in range(3 if kind=='gemma' else 2):
            n=3 if kind=='gemma' else 2
            box(c,'Pannello laterale',(side*w*.39,0,base+(i+.5)*(body-base)/n),(w*.21,d*.96,(body-base)/n-.004),shell,.007)
    if kind=='fedora' or (kind=='gemma' and not oven):box(c,'Pannello superiore',(0,-d/2-.007,body*.86),(w*.64,.014,body*.15),shell,.004)
    z=body*(.39 if oven else .54)
    box(c,'Porta',(0,-d/2-.009,z),(w*.65,.020,body*.43),dark,.006)
    box(c,'Vetro sportello',(0,-d/2-.021,z+.01),(w*.45,.006,body*.29),glass,.004)
    box(c,'Maniglia',(-w*.30,-d/2-.024,z),(.012,.016,.11),metal,.003)
    box(c,'Cassetto cenere',(0,-d/2-.009,body*.10),(w*.65,.016,body*.15),black,.005)
    cylinder(c,'Regolatore aria',(0,-d/2-.020,body*.10),(.05,.008,.05),metal)
    if oven:
        box(c,'Sportello forno',(0,-d/2-.009,body*.76),(w*.65,.020,body*.26),dark,.006)
        box(c,'Vetro forno',(0,-d/2-.021,body*.76),(w*.43,.006,body*.17),glass,.004)
        cylinder(c,'Termometro forno',(0,-d/2-.026,body*.76),(.025,.006,.025),metal)
    elif kind=='ester':
        for i in range(4):box(c,'Griglia superiore',(0,-d/2-.020,body*(.91-i*.01)),(w*.62,.006,.004),dark,.0005)
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
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-nordica-ester-fedora-gemma.blend'))
