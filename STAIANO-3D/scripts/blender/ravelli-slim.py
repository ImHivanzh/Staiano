"""LINE, STILO e OLIVIA STEEL: stufe Ravelli a profondità ridotta."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Corpo nero',(.018,.020,.021));dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);metal=mat('Dettaglio metallo',(.35,.22,.11))
colors={'verde':(.20,.26,.14),'bronzo':(.24,.13,.075),'nero':(.025,.027,.028),'grigio':(.18,.19,.19),'bianco':(.83,.84,.83),'bordeaux':(.28,.025,.034)}
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
    return o
specs=[('ravelli-line',(.800,.250,1.150),['verde','bronzo','nero'],'line'),('ravelli-stilo',(.850,.350,1.150),['grigio','bianco','nero'],'stilo'),('ravelli-olivia-steel',(.800,.250,1.140),['bianco','nero','bordeaux'],'olivia')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,colors[finishes[0]])
    box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.008)
    if kind=='line':
        for i in range(6):box(c,'Pannello verticale',(-w*.42+i*w*.166,-d/2-.006,h*.50),(w*.16,.014,h*.96),shell,.002)
        dx=w*.16
    elif kind=='stilo':
        box(c,'Pannello laterale',(-w*.27,-d/2-.006,h*.50),(w*.45,.014,h*.96),shell,.003)
        box(c,'Pannello inferiore',(w*.20,-d/2-.006,h*.10),(w*.48,.014,h*.17),shell,.003);dx=w*.21
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.04,depth=.09,location=(-w*.20,d*.20,h+.035));o=bpy.context.object
        for old in list(o.users_collection):old.objects.unlink(o)
        c.objects.link(o);o.name='Scarico superiore';o.data.materials.append(black)
    else:
        for side in (-1,1):box(c,'Pannello laterale',(side*w*.37,-d/2-.006,h*.50),(w*.25,.014,h*.96),shell,.003)
        dx=0
        for i in range(6):box(c,'Griglia superiore',(0,-d/2-.021,h*.91-i*.010),(w*.24,.005,.004),dark,.0005)
    box(c,'Porta',(dx,-d/2-.010,h*.52),(w*(.34 if kind!='olivia' else .25),.018,h*.48),dark,.004)
    box(c,'Vetro sportello',(dx,-d/2-.021,h*.54),(w*(.22 if kind!='olivia' else .16),.005,h*.31),glass,.003)
    box(c,'Maniglia',(dx+w*.16,-d/2-.023,h*.49),(.011,.016,.10),black,.002)
    if kind=='line':box(c,'Targhetta',(w*.34,-d/2-.020,h*.49),(.06,.005,.015),metal,.001)
    box(c,'Zoccolo',(0,0,.01),(w*.92,d*.9,.02),black,.004)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label in finishes:
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors[finishes[0]];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-slim.blend'))
