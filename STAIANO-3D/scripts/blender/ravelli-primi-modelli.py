"""ARIA, ALFA S, WHISPER 7, ELETTRA e CIRCULAR: forme e finiture Ravelli."""
from pathlib import Path
import math
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Acciaio nero',(.018,.020,.021));dark=mat('Porta',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);wood=mat('Basamento legno',(.44,.22,.10),.7,0);bronze=mat('Rivestimento bronzo',(.24,.13,.075))
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;return o
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordi','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def cylinder(c,name,loc,size,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1,depth=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o
def export(c,ident,shell,finishes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
def front(c,w,d,h,z,height):
    box(c,'Cornice porta',(0,-d/2-.009,z),(w*.50,.018,height),dark,.004)
    box(c,'Vetro sportello',(0,-d/2-.020,z+.025),(w*.30,.005,height*.55),glass,.003)
    box(c,'Maniglia',(w*.24,-d/2-.024,z),(.011,.018,.09),black,.003)
for ident,w,d,h,finishes,kind in [
 ('ravelli-aria',.620,.510,.720,[('bianco',(.83,.84,.83)),('nero',(.025,.027,.028))],'aria'),
 ('ravelli-alfa-s',.390,.590,1.060,[('nero',(.025,.027,.028))],'alfa'),
 ('ravelli-whisper-7',.504,.561,1.040,[('bianco',(.83,.84,.83)),('nero',(.025,.027,.028)),('bronzo',(.24,.13,.075))],'whisper'),
 ('ravelli-elettra',.970,.350,1.040,[('bianco',(.83,.84,.83)),('nero',(.025,.027,.028))],'elettra'),
 ('ravelli-circular-7',.520,.540,1.210,[('nero',(.025,.027,.028)),('bronzo',(.24,.13,.075))],'circular'),
 ('ravelli-circular-9-2',.520,.540,1.210,[('bianco',(.83,.84,.83)),('nero',(.025,.027,.028)),('bronzo',(.24,.13,.075))],'circular')]:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,finishes[0][1])
    if kind in ('whisper','circular'):
        cylinder(c,'Corpo cilindrico',(0,0,h/2),(w,d,h-.02),shell)
        cylinder(c,'Coperchio',(0,0,h-.012),(w,d,.024),black)
        front(c,w,d,h,h*.49,h*.43)
        box(c,'Pannello frontale superiore',(0,-d/2-.005,h*.79),(w*.50,.012,h*.16),black,.003)
        box(c,'Pannello frontale inferiore',(0,-d/2-.005,h*.19),(w*.50,.012,h*.25),black,.003)
        if kind=='circular':cylinder(c,'Scarico superiore',(0,.10,h+.045),(.08,.08,.09),black)
    elif kind=='elettra':
        box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.012)
        box(c,'Montante laterale',(-w*.39,-d/2-.005,h*.5),(w*.20,.012,h*.96),shell,.012)
        box(c,'Fascia superiore',(0,-d/2-.005,h*.90),(w,.012,h*.17),shell,.012)
        box(c,'Fascia inferiore',(0,-d/2-.005,h*.08),(w,.012,h*.14),shell,.012)
        front(c,w,d,h,h*.50,h*.62)
    else:
        base=.11 if kind=='aria' else .0
        box(c,'Corpo',(0,0,(h+base)/2),(w,d,h-base-.02),shell if kind=='aria' else black,.025)
        if kind=='aria':
            box(c,'Basamento legno',(0,0,.10),(w,d,.05),wood,.01)
            for side in (-1,1):box(c,'Piede legno',(side*w*.40,0,.04),(.045,d*.90,.08),wood,.008)
        else:
            box(c,'Pannello inferiore',(0,0,h*.18),(w,d,h*.36),bronze,.015)
            cylinder(c,'Attacco fumi',(0,d*.25,h+.035),(.08,.08,.07),black)
        front(c,w,d,h,h*.54,h*.52)
        box(c,'Coperchio',(0,0,h-.012),(w,d,.024),black,.012)
    export(c,ident,shell,finishes)
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-primi.blend'))
