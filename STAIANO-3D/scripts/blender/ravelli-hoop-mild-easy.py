"""Ravelli HOOP, MILD ed EASY da fotografie e schede dimensionali."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Struttura nera',(.018,.020,.021));dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16)
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=5;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def output(c,ident,shell,finishes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
specs=[('ravelli-hoop-7',(.520,.550,1.110),[('bianco',(.83,.84,.83)),('bronzo',(.24,.13,.075))],'hoop'),('ravelli-hoop-9',(.520,.550,1.110),[('bronzo',(.24,.13,.075))],'hoop'),('ravelli-mild',(.690,.610,.800),[('nero',(.025,.027,.028))],'mild'),('ravelli-easy-7',(.525,.480,1.030),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028)),('bronzo',(.24,.13,.075))],'easy'),('ravelli-easy-9',(.525,.480,1.030),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028)),('bronzo',(.24,.13,.075))],'easy')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,finishes[0][1])
    if kind=='hoop':
        box(c,'Corpo',(0,0,h/2),(w,d,h-.02),black,.045)
        for side in (-1,1):box(c,'Pannello superiore',(side*w*.38,0,h*.72),(w*.24,d*.94,h*.50),shell,.025)
        box(c,'Porta ovale',(0,-d/2-.009,h*.55),(w*.34,.020,h*.60),dark,.08)
        box(c,'Vetro sportello',(0,-d/2-.022,h*.52),(w*.22,.006,h*.28),glass,.003)
        for i in range(9):box(c,'Griglia superiore',((i-4)*.045,0,h+.002),(.018,d*.70,.004),dark,.0005)
    elif kind=='mild':
        box(c,'Corpo ghisa',(0,0,h*.56),(w,d,h*.53),shell,.018)
        box(c,'Coperchio',(0,0,h*.83),(w,d,.03),black,.012)
        box(c,'Cornice porta',(0,-d/2-.009,h*.56),(w*.68,.020,h*.40),black,.016)
        box(c,'Vetro sportello',(0,-d/2-.022,h*.56),(w*.56,.006,h*.29),glass,.012)
        for x in (-w*.39,w*.39):
            for y in (-d*.35,d*.35):box(c,'Piede',(x,y,h*.14),(.055,.055,h*.28),shell,.008)
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.045,depth=.14,location=(0,d*.22,h*.94));o=bpy.context.object
        for old in list(o.users_collection):old.objects.unlink(o)
        c.objects.link(o);o.name='Scarico superiore';o.data.materials.append(black)
    else:
        box(c,'Corpo',(0,0,h/2),(w,d,h-.02),shell,.035)
        box(c,'Coperchio',(0,0,h-.012),(w,d,.024),black,.012)
        box(c,'Porta',(0,-d/2-.009,h*.55),(w*.58,.020,h*.65),black,.006)
        box(c,'Vetro sportello',(0,-d/2-.021,h*.56),(w*.30,.006,h*.39),glass,.003)
        box(c,'Maniglia',(w*.27,-d/2-.024,h*.47),(.012,.018,.10),black,.003)
        box(c,'Pannello inferiore',(0,-d/2-.008,h*.12),(w*.58,.016,h*.20),black,.004)
    box(c,'Zoccolo',(0,0,.01),(w*.92,d*.90,.02),black,.006) if kind!='mild' else None
    output(c,ident,shell,finishes)
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-hoop-mild-easy.blend'))
