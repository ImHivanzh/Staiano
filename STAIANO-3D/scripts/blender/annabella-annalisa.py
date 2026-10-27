"""ANNABELLA PLUS e ANNALISA PLUS: forme sottili e pannelli distintivi."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,metal=.12,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Acciaio nero',(.018,.02,.021),.3);dark=mat('Cornice',(.006,.007,.008),.15);glass=mat('Vetro spento',(.028,.033,.034),.2,.16)
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def export(c,ident,shell,finishes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True;c.hide_render=True
c=bpy.data.collections.new('nordica-annabella-plus-50');bpy.context.scene.collection.children.link(c)
w,d,h=.703,.343,1.078;shell=mat('Annabella rivestimento',(.83,.84,.83))
box(c,'Corpo posteriore',(0,0,h/2),(w,d,h-.02),black,.012)
for side in (-1,1):box(c,'Montante colorato',(side*w*.40,-d*.41,h*.50),(w*.20,d*.18,h*.96),shell,.025)
box(c,'Fascia superiore',(0,-d*.41,h*.96),(w,d*.18,h*.065),shell,.012)
box(c,'Fascia inferiore',(0,-d*.41,h*.035),(w,d*.18,h*.06),shell,.012)
box(c,'Cornice porta',(0,-d/2-.006,h*.48),(w*.48,.016,h*.78),dark,.005)
box(c,'Sportello',(0,-d/2-.016,h*.48),(w*.45,.012,h*.75),black,.005)
box(c,'Vetro porta',(0,-d/2-.024,h*.55),(w*.22,.005,h*.31),glass,.003)
box(c,'Maniglia',(w*.24,-d/2-.024,h*.41),(.016,.018,.05),dark,.003)
for i in range(5):box(c,'Griglia superiore',(0,-d/2-.020,h*.90-i*.011),(w*.45,.005,.004),dark,.0005)
export(c,'nordica-annabella-plus-50',shell,[('bianco',(.83,.84,.83)),('nero',(.025,.027,.028)),('tortora-matt',(.47,.38,.33))])
for ident,finishes in [('nordica-annalisa-plus-crystal-evo',[('nero',(.012,.014,.015))]),('nordica-annalisa-plus-gres-evo',[('gres-ostuni',(.62,.59,.54)),('gres-corten',(.28,.14,.09))])]:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);w,d,h=.902,.436,1.150
    shell=mat('Pannello '+ident,finishes[0][1],.03,.68 if 'gres' in ident else .2)
    box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.008)
    box(c,'Pannello laterale',(w*.29,-d/2-.005,h*.50),(w*.40,.014,h*.98),shell,.004)
    box(c,'Cornice sportello',(-w*.20,-d/2-.008,h*.56),(w*.40,.020,h*.59),dark,.004)
    box(c,'Sportello',(-w*.20,-d/2-.020,h*.56),(w*.38,.010,h*.56),black,.003)
    box(c,'Vetro sportello',(-w*.20,-d/2-.027,h*.57),(w*.22,.005,h*.36),glass,.003)
    box(c,'Pannello superiore',(-w*.20,-d/2-.008,h*.90),(w*.40,.014,h*.10),black,.003)
    box(c,'Pannello inferiore',(-w*.20,-d/2-.008,h*.13),(w*.40,.014,h*.24),black,.003)
    box(c,'Maniglia',(-w*.39,-d/2-.027,h*.48),(.009,.018,.14),dark,.003)
    export(c,ident,shell,finishes)
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-annabella-annalisa.blend'))
