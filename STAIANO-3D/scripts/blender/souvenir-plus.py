"""SOUVENIR PLUS 5.0: frontale e basamenti nelle varianti LUX, PETRA e STEEL."""
from pathlib import Path
import math,random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.42,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Struttura nera',(.018,.02,.021),.42,.3);dark=mat('Fessure',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16,.2)
def stone():
    m=mat('Pietra naturale',(.38,.4,.4),.8,0);im=bpy.data.images.new('Pietra venata',width=256,height=256);random.seed(77);p=[]
    for y in range(256):
        for x in range(256):
            v=max(.2,min(.6,.37+.035*math.sin(x*.12+y*.09)+random.gauss(0,.035)));p.extend((v*.96,v,v*1.01,1))
    im.pixels=p;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
def box(c,name,loc,size,m,bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordi','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
specs=[('nordica-souvenir-plus-lux-50',1.162,[('bianco',(.83,.84,.83)),('tortora',(.47,.38,.33))],False,True),('nordica-souvenir-plus-petra-50',1.124,[('pietra',None)],True,False),('nordica-souvenir-plus-steel-50',1.122,[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028))],False,False)]
for ident,h,finishes,isstone,lux in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);w,d=.821,.343
    shell=stone() if isstone else mat('Rivestimento '+ident,finishes[0][1],.25 if lux else .4)
    base=.02 if lux else .085
    box(c,'Corpo',(0,0,(h+base)/2),(w,d,h-base-.02),black,.012)
    for side in (-1,1):box(c,'Montante',(side*w*.45,-d/2-.006,(h+base)/2),(w*.10,.018,h-base-.02),shell,.015 if lux else .004)
    box(c,'Cornice superiore',(0,-d/2-.006,h-.045),(w,.018,.07),shell,.02 if lux else .004)
    if lux:box(c,'Cornice inferiore',(0,-d/2-.006,base+.04),(w,.018,.08),shell,.02)
    box(c,'Frontale',(0,-d/2-.009,(h+base)/2),(w*.78,.015,(h-base)*.78),black,.003)
    box(c,'Cornice sportello',(w*.16,-d/2-.018,h*.52),(w*.39,.014,h*.48),dark,.004)
    box(c,'Vetro sportello',(w*.16,-d/2-.027,h*.53),(w*.22,.005,h*.30),glass,.003)
    for i in range(4):
        box(c,'Griglia superiore',(0,-d/2-.019,h*.85-i*.009),(w*.74,.006,.004),dark,.0005)
        box(c,'Griglia inferiore',(0,-d/2-.019,base+.065+i*.009),(w*.74,.006,.004),dark,.0005)
    if not lux:
        box(c,'Piedistallo',(0,0,.035),(w*.23,d*.55,.07),black,.004)
        box(c,'Base',(0,0,.005),(w*.54,d*.90,.01),black,.004)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));shader=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        if rgb is not None:shell.diffuse_color=(*rgb,1);shader.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True)
    if finishes[0][1] is not None:
        rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);shader.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-souvenir-plus.blend'))
