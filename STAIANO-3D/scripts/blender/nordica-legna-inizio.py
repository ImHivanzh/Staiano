"""LARISSA, ASIA, AURELIA, BRIGITTA e CANDY, dal catalogo La Nordica."""
from pathlib import Path
import random
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa antracite',(.025,.027,.028));dark=mat('Telaio',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);metal=mat('Maniglia',(.20,.20,.19))
def stone():
    m=mat('Pietra naturale',(.40,.41,.41),.8);im=bpy.data.images.new('Grana pietra',width=256,height=256);random.seed(45);data=[]
    for _ in range(256*256):
        v=max(.2,min(.6,random.gauss(.39,.04)));data.extend((v,v*1.01,v,1))
    im.pixels=data;im.pack();node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;m.node_tree.links.new(node.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
    return o
def flue(c,w,d,h):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.06,depth=.08,location=(0,d*.12,h+.025));o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name='Scarico fumi';o.data.materials.append(black)
specs=[('nordica-larissa16',(.628,.483,1.225),[('nero-antracite',(.025,.027,.028))],'larissa'),('nordica-asia-50',(.438,.473,1.385),[('vulcan',(.075,.075,.085))],'asia'),('nordica-aurelia-eos-ceramica',(.551,.605,1.489),[('panna',(.80,.75,.67)),('bordeaux',(.28,.025,.034))],'aurelia'),('nordica-aurelia-eos-petra',(.551,.605,1.489),[('pietra',None)],'aurelia'),('nordica-aurelia-eos-steel',(.551,.605,1.489),[('nero-antracite',(.025,.027,.028))],'aurelia'),('nordica-brigitta16',(.404,.397,.640),[('nero',(.025,.027,.028))],'brigitta'),('nordica-candy-eos165',(.404,.397,1.142),[('nero-antracite',(.025,.027,.028))],'brigitta')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=stone() if finishes[0][1] is None else mat('Rivestimento '+ident,finishes[0][1])
    box(c,'Corpo',(0,0,h/2),(w*(.68 if kind in ('aurelia','asia') else 1),d,h-.03),black,.012)
    if kind=='aurelia':
        for side in (-1,1):
            for i in range(6):box(c,'Pannello laterale',(side*w*.42,0,h*(.12+i*.145)),(w*.15,d*.99,h*.14),shell,.004)
        for i in range(2):box(c,'Pannello frontale alto',(0,-d/2-.006,h*(.72+i*.12)),(w*.68,.014,h*.115),shell,.003)
    elif kind=='asia':
        for side in (-1,1):
            for i in range(3):box(c,'Pannello vulcan',(side*w*.42,0,h*(.17+i*.28)),(w*.16,d*.99,h*.27),shell,.004)
    else:
        for side in (-1,1):box(c,'Fascia laterale',(side*w*.42,0,h*.50),(w*.14,d*.96,h*.95),shell,.008)
    box(c,'Porta',(0,-d/2-.008,h*(.45 if kind=='aurelia' else .55)),(w*.66,.020,h*(.38 if kind=='aurelia' else .50)),dark,.006)
    box(c,'Vetro sportello',(0,-d/2-.020,h*(.47 if kind=='aurelia' else .57)),(w*.48,.006,h*(.24 if kind=='aurelia' else .31)),glass,.005)
    box(c,'Maniglia',(-w*.31,-d/2-.023,h*.48),(.012,.016,.11),metal,.002)
    box(c,'Pannello inferiore',(0,-d/2-.008,h*.13),(w*.66,.016,h*.20),black,.004)
    box(c,'Coperchio',(0,0,h-.015),(w,d,.03),black,.006);flue(c,w,d,h)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        if rgb is not None:shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    if finishes[0][1] is not None:
        rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-nordica-legna-inizio.blend'))
