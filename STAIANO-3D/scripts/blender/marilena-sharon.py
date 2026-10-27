"""MARILENA PLUS e SHARON PLUS: versioni acciaio, vetro e pietra naturale."""
from pathlib import Path
import math,random
import bpy
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.42,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Corpo nero',(.018,.020,.021),.42,.3);door=mat('Porta nera',(.008,.010,.011),.22,.2);glass=mat('Vetro spento',(.028,.033,.034),.16,.2)
def stone():
    m=mat('Pietra naturale',(.38,.40,.40),.78,0);im=bpy.data.images.new('Venature pietra',width=256,height=256);random.seed(55);p=[]
    for y in range(256):
        for x in range(256):
            vein=.035*math.sin(x*.12+y*.09)+.018*math.sin(x*.33+y*.27);v=max(.20,min(.60,.37+vein+random.gauss(0,.035)));p.extend((v*.96,v,v*1.01,1))
    im.pixels=p;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
def box(c,name,loc,size,m,bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordi','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def output(c,ident,shell,finishes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        if rgb is not None:shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True)
    if finishes[0][1] is not None:
        rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True;c.hide_render=True
marilena=[('nordica-marilena-plus-50-ad',[('bianco',(.83,.84,.83)),('nero',(.025,.027,.028))],False),('nordica-marilena-plus-crystal-50-ad',[('fume',(.018,.020,.021)),('bianco',(.83,.84,.83))],False),('nordica-marilena-plus-petra-50-ad',[('pietra',None)],True)]
for ident,finishes,isstone in marilena:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);w,d,h=.750,.350,1.077
    shell=stone() if isstone else mat('Rivestimento '+ident,finishes[0][1],.2 if 'crystal' in ident else .4)
    box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.006)
    for side in (-1,1):box(c,'Pannello laterale',(side*w*.36,-d/2-.005,h*.50),(w*.28,.012,h*.98),shell,.003)
    box(c,'Pannello superiore',(0,-d/2-.005,h*.92),(w*.42,.012,h*.14),shell if isstone else black,.003)
    box(c,'Pannello inferiore',(0,-d/2-.005,h*.12),(w*.42,.012,h*.22),shell if isstone else black,.003)
    box(c,'Cornice porta',(0,-d/2-.012,h*.53),(w*.38,.012,h*.58),door,.003)
    box(c,'Vetro sportello',(0,-d/2-.021,h*.56),(w*.16,.005,h*.31),glass,.003)
    box(c,'Maniglia',(w*.18,-d/2-.023,h*.50),(.008,.012,.07),door,.002)
    for i in range(9):box(c,'Griglia superiore',((i-4)*.055,0,h+.001),(.012,d*.55,.003),door,.0005)
    output(c,ident,shell,finishes)
sharon=[('nordica-sharon-plus-crystal',[('crystal',(.012,.014,.015))],False),('nordica-sharon-plus-petra',[('pietra',None)],True),('nordica-sharon-plus-steel',[('nero',(.025,.027,.028))],False)]
for ident,finishes,isstone in sharon:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);w,d,h=.900,(.295 if 'steel' in ident else .290),1.150
    shell=stone() if isstone else mat('Pannello '+ident,finishes[0][1],.20 if 'crystal' in ident else .42)
    box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.006)
    box(c,'Pannello laterale',(w*.25,-d/2-.005,h*.50),(w*.48,.012,h*.98),shell,.003)
    box(c,'Sportello',(-w*.25,-d/2-.006,h*.50),(w*.48,.014,h*.98),door,.003)
    box(c,'Vetro porta',(-w*.25,-d/2-.015,h*.57),(w*.23,.005,h*.34),glass,.003)
    for i in range(12):box(c,'Griglia superiore',(-w*.25,(i-5.5)*.009,h+.001),(w*.42,.004,.003),door,.0005)
    output(c,ident,shell,finishes)
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-marilena-sharon.blend'))
