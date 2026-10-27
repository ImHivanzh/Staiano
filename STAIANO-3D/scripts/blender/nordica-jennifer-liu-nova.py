"""JENNIFER, LAVINIA, LIU, MARLENA e NOVA FORNO da foto La Nordica."""
from pathlib import Path
import random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa antracite',(.025,.027,.028));dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);metal=mat('Dettagli metallo',(.18,.18,.17))
def stone():
    m=mat('Pietra naturale',(.40,.41,.41),.8);im=bpy.data.images.new('Pietra grigia',width=256,height=256);random.seed(88);pixels=[]
    for _ in range(256*256):
        v=max(.2,min(.6,random.gauss(.39,.045)));pixels.extend((v,v*1.01,v,1))
    im.pixels=pixels;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
colors={'nero-antracite':(.025,.027,.028),'bordeaux':(.24,.008,.014),'bianco-infinity':(.83,.84,.83),'bianco-opaco':(.80,.81,.80)}
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;return o
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
    return o
def cylinder(c,name,loc,size,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1,depth=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
specs=[('nordica-jennifer16-eps',(.702,.478,1.370),['nero-antracite'],'wide'),('nordica-lavinia-eos',(.773,.685,1.213),['nero-antracite'],'wide'),('nordica-liu-16-maiolica',(.537,.508,1.562),['bordeaux','bianco-infinity'],'round'),('nordica-liu-16-petra',(.528,.508,1.562),['pietra'],'round'),('nordica-marlena16',(.465,.475,1.562),['nero-antracite'],'round'),('nordica-nova-forno16-maiolica',(.559,.569,1.547),['bianco-opaco','bordeaux'],'oven'),('nordica-nova-forno16-steel',(.559,.569,1.547),['nero-antracite'],'oven')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=stone() if finishes[0]=='pietra' else mat('Rivestimento '+ident,colors[finishes[0]])
    pipe=.36 if h>1.3 else .24;body=h-pipe;base=.24 if kind=='wide' else .03
    if kind=='round':
        cylinder(c,'Corpo cilindrico',(0,0,(base+body)/2),(w,d,body-base),shell)
        cylinder(c,'Coperchio',(0,0,body-.012),(w,d,.024),shell)
    else:
        box(c,'Corpo',(0,0,(base+body)/2),(w*(.72 if kind=='oven' else 1),d,body-base),black,.016)
        if kind=='oven':
            for side in (-1,1):box(c,'Pannello laterale',(side*w*.43,0,(base+body)/2),(w*.14,d*.99,body-base),shell,.008)
        if kind=='wide':
            for side in (-1,1):box(c,'Sostegno portalegna',(side*w*.43,0,base/2),(w*.12,d,base),black,.005)
    z=base+(body-base)*(.39 if kind=='oven' else .60)
    box(c,'Porta',(0,-d/2-.008,z),(w*(.78 if kind=='wide' else .65),.018,(body-base)*.42),dark,.008)
    box(c,'Vetro sportello',(0,-d/2-.020,z+.01),(w*(.65 if kind=='wide' else .42),.006,(body-base)*.28),glass,.005)
    box(c,'Maniglia',(w*.34,-d/2-.023,z),(.012,.016,.12),metal,.003)
    if kind=='oven':
        z2=base+(body-base)*.78;box(c,'Sportello forno',(0,-d/2-.009,z2),(w*.65,.018,(body-base)*.25),dark,.005)
        box(c,'Vetro forno',(0,-d/2-.020,z2),(w*.47,.006,(body-base)*.17),glass,.004)
    if kind=='round':box(c,'Pannello inferiore',(0,-d/2-.008,body*.15),(w*.50,.016,body*.22),black,.005)
    cylinder(c,'Scarico fumi',(0,d*.10,body+pipe/2),(.10,.10,pipe),black)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label in finishes:
        if label!='pietra':rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    if finishes[0]!='pietra':rgb=colors[finishes[0]];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-nordica-jennifer-liu-nova.blend'))
