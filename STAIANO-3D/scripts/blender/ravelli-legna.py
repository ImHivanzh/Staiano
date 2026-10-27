"""Ravelli a legna: DAFNE, MINERVA, CALLIOPE, THOR ed EFESTO."""
from pathlib import Path
import math,random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Acciaio antracite',(.025,.027,.028));dark=mat('Interno e cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);handle=mat('Maniglia metallo',(.32,.32,.30),.25)
stone=mat('Pietra grigia',(.45,.46,.45),.8);im=bpy.data.images.new('Graniglia pietra',width=256,height=256);random.seed(123);pixels=[]
for _ in range(256*256):
    v=max(.25,min(.65,random.gauss(.43,.055)));pixels.extend((v,v*1.01,v,1))
im.pixels=pixels;im.pack();tex=stone.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;stone.node_tree.links.new(tex.outputs['Color'],stone.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
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
specs=[('ravelli-dafne-view',(.450,.370,.950),'view'),('ravelli-dafne',(.450,.370,.950),'closed'),('ravelli-minerva',(.750,.470,.970),'wide'),('ravelli-minerva-stone',(.760,.470,1.010),'wide-stone'),('ravelli-calliope-stone',(.540,.390,1.000),'stone'),('ravelli-thor',(.520,.370,.770),'legs'),('ravelli-efesto',(.600,.480,.730),'legs')]
for ident,(w,d,h),kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);feet=kind=='legs';base=.22*h if feet else .01
    box(c,'Corpo',(0,0,(h+base)*.49),(w,d,(h-base)*.94),black,.022)
    box(c,'Coperchio',(0,0,h-.025),(w,d,.025),stone if 'stone' in kind else black,.009)
    if 'stone' in kind:
        for side in (-1,1):box(c,'Rivestimento pietra',(side*w*.45,0,h*.5),(w*.10,d*.98,h*.94),stone,.006)
    box(c,'Porta',(0,-d/2-.008,h*(.58 if feet else .60)),(w*.78,.018,h*(.51 if feet else .48)),black,.012)
    box(c,'Vetro sportello',(0,-d/2-.019,h*(.58 if feet else .63)),(w*(.62 if kind in ('wide','wide-stone','legs') else .52),.006,h*.28),glass,.008)
    box(c,'Maniglia',(w*.38,-d/2-.023,h*.40),(.05,.018,.012),handle,.003)
    if kind in ('view','wide-stone'):
        box(c,'Vano legna',(0,-d/2-.009,h*.19),(w*.70,.016,h*.28),dark,.004)
    if kind=='view':
        for side in (-1,1):box(c,'Vetro laterale',(side*(w/2+.003),0,h*.63),(.006,d*.35,h*.30),glass,.003)
    if feet:
        for x in (-w*.38,w*.38):
            for y in (-d*.35,d*.35):box(c,'Piede',(x,y,base/2),(.045,.05,base),black,.008)
    cylinder(c,'Scarico fumi',(0,d*.25,h+.025),(.10,.10,.06),black)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));label='grigio' if 'stone' in kind else 'nero'
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-legna.blend'))
