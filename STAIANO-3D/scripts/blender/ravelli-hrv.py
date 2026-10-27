"""Ravelli HRV: geometrie raggruppate per le varianti visibili in catalogo."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Telaio nero',(.018,.020,.021));dark=mat('Cornice porta',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16)
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;return o
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def cylinder(c,name,loc,size,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1,depth=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o
colors={'bianco':(.83,.84,.83),'nero':(.025,.027,.028),'bordeaux':(.28,.025,.034),'bronzo':(.24,.13,.075)}
specs=[('ravelli-hrv-160-design',(.630,.680,1.240),['nero'],'design'),('ravelli-hrv-100-touch',(.460,.580,1.130),['bianco'],'touch100'),('ravelli-hrv-140-touch',(.460,.580,1.130),['bianco','nero','bordeaux'],'touch140'),('ravelli-hrv-160-touch-steel',(.610,.640,1.180),['bianco','bordeaux','bronzo'],'curvo'),('ravelli-hrv-200',(.640,.640,1.250),['bianco','bronzo'],'curvo'),('ravelli-hrv-250',(.640,.640,1.250),['bianco'],'curvo'),('ravelli-hrv-180-silhouette',(.930,.390,1.000),['nero'],'silhouette')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,colors[finishes[0]])
    if kind=='design':
        cylinder(c,'Corpo cilindrico',(0,-d*.05,h/2),(w,d*.84,h-.02),shell)
        box(c,'Serbatoio posteriore',(0,d*.29,h*.52),(w*.70,d*.40,h*.90),black,.005)
        cylinder(c,'Coperchio',(0,-d*.05,h-.012),(w,d*.84,.024),black)
        box(c,'Porta',(0,-d*.47-.01,h*.51),(w*.48,.02,h*.42),dark,.004)
        box(c,'Vetro sportello',(0,-d*.47-.023,h*.53),(w*.30,.005,h*.23),glass,.003)
    elif kind.startswith('touch'):
        box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.012)
        box(c,'Porta',(0,-d/2-.008,h*.50),(w*.87,.018,h*.76),dark,.004)
        box(c,'Vetro sportello',(0,-d/2-.020,h*.57),(w*.53,.005,h*.31),glass,.003)
        box(c,'Fascia superiore',(0,-d/2-.008,h*.92),(w*.95,.018,h*.09),shell,.005)
        if kind=='touch140':box(c,'Pannello inferiore',(0,-d/2-.008,h*.10),(w*.95,.018,h*.17),shell,.005)
        box(c,'Fessura',(0,-d/2-.020,h*.925),(w*.55,.006,.007),dark,.001)
    elif kind=='curvo':
        box(c,'Corpo',(0,0,h/2),(w,d,h-.02),shell,.075)
        box(c,'Serbatoio posteriore',(0,d*.34,h*.50),(w*.82,d*.30,h*.96),black,.005)
        box(c,'Pannello frontale',(0,-d/2-.008,h*.50),(w*.43,.018,h*.94),black,.006)
        box(c,'Porta',(0,-d/2-.019,h*.51),(w*.43,.012,h*.52),dark,.005)
        box(c,'Vetro sportello',(0,-d/2-.027,h*.54),(w*.25,.005,h*.30),glass,.003)
        for i in range(3):box(c,'Griglia superiore',(0,-d/2-.021,h*.86-i*.009),(w*.36,.005,.004),dark,.0005)
    else:
        box(c,'Corpo',(0,0,h/2),(w,d,h-.02),shell,.008)
        box(c,'Porta',(0,-d/2-.008,h*.50),(w*.26,.016,h*.94),black,.003)
        box(c,'Vetro sportello',(0,-d/2-.018,h*.51),(w*.13,.005,h*.31),glass,.003)
        cylinder(c,'Scarico superiore',(0,d*.22,h+.035),(.08,.08,.07),black)
    box(c,'Zoccolo',(0,0,.01),(w*.90,d*.90,.02),black,.006)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label in finishes:
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors[finishes[0]];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-hrv.blend'))
