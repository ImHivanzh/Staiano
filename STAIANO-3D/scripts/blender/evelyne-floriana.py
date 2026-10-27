"""EVELYNE e FLORIANA IDRO: frontali, vetro e rivestimenti da catalogo."""
from pathlib import Path
import math,random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Struttura nera',(.018,.020,.021));dark=mat('Vetro nero',(.007,.009,.010),.18);glass=mat('Vetro focolare spento',(.028,.033,.034),.16);trim=mat('Profilo metallo',(.23,.24,.24),.35,.6)
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def texture(label,rgb):
    im=bpy.data.images.new('Gres '+label,width=256,height=256);random.seed(31);p=[]
    for y in range(256):
        for x in range(256):
            v=max(.65,min(1.35,1+.055*math.sin(x*.11+y*.08)+random.gauss(0,.06)));p.extend((min(rgb[0]*v,1),min(rgb[1]*v,1),min(rgb[2]*v,1),1))
    im.pixels=p;im.pack();return im
specs=[('nordica-evelyne-idro-evo',(.878,.412,1.099),[('grigio',(.055,.07,.075)),('bianco',(.83,.84,.83)),('tortora',(.47,.38,.33))],'evelyne'),('nordica-floriana-idro-crystal',(.854,.402,1.107),[('crystal',(.012,.014,.015))],'crystal'),('nordica-floriana-idro-gres',(.854,.402,1.107),[('gres-corten',(.28,.14,.09)),('gres-ostuni',(.62,.59,.54))],'gres')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c)
    shell=mat('Rivestimento '+ident,finishes[0][1],.75 if kind=='gres' else .28)
    box(c,'Corpo posteriore',(0,0,h/2),(w,d,h-.02),black,.012)
    if kind=='evelyne':
        box(c,'Rivestimento',(0,-d*.39,h*.50),(w,d*.22,h*.96),shell,.05)
        box(c,'Porta vetro',(-w*.25,-d/2-.012,h*.49),(w*.35,.016,h*.83),dark,.006)
        box(c,'Vetro sportello',(-w*.25,-d/2-.022,h*.50),(w*.32,.005,h*.79),dark,.004)
        box(c,'Profilo verticale',(0,-d/2-.016,h*.50),(.009,.007,h*.95),trim,.002)
        box(c,'Giunto pannello',(w*.25,-d/2-.016,h*.45),(w*.47,.006,.003),black,.0005)
        box(c,'Maniglia',(-w*.08,-d/2-.025,h*.38),(.008,.012,.035),black,.001)
    else:
        box(c,'Pannello laterale',(w*.25,-d/2-.006,h*.49),(w*.49,.016,h*.92),shell,.003)
        box(c,'Porta vetro',(-w*.25,-d/2-.006,h*.49),(w*.49,.016,h*.92),dark,.003)
        box(c,'Vetro focolare',(-w*.25,-d/2-.017,h*.55),(w*.15,.005,h*.29),glass,.002)
        box(c,'Profilo verticale',(0,-d/2-.018,h*.49),(.005,.008,h*.92),trim,.001)
        for i in range(3):box(c,'Griglia superiore',(0,-d/2-.017,h*.96-i*.008),(w*.97,.006,.003),dark,.0005)
    box(c,'Piedi',(0,0,.01),(w*.92,d*.90,.02),black,.005)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    tex=shell.node_tree.nodes.new('ShaderNodeTexImage') if kind=='gres' else None
    if tex:shell.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        if tex:tex.image=texture(label,rgb)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    if tex:tex.image=bpy.data.images['Gres '+finishes[0][0]]
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-evelyne-floriana.blend'))
