"""Ravelli R70, RV e SPHERE: famiglie distinte da foto e dimensioni."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Struttura nera',(.018,.020,.021));dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);trim=mat('Finiture',(.18,.16,.14))
colors={'bianco':(.83,.84,.83),'nero':(.025,.027,.028),'bordeaux':(.28,.025,.034),'nocciola':(.40,.25,.15),'bronzo':(.24,.13,.075),'grigio':(.12,.14,.15)}
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4;o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
specs=[('ravelli-r-70',(.440,.450,.950),['bianco','nero','bordeaux','nocciola'],'r70'),('ravelli-rv80',(.520,.520,1.010),['bianco','nero','bordeaux'],'classica'),('ravelli-rv-100',(.520,.530,1.100),['bianco','nero','bordeaux'],'rv100'),('ravelli-rv-110',(.550,.560,1.120),['bianco','bordeaux'],'classica'),('ravelli-sphere-v',(.600,.600,1.150),['bianco','bordeaux','nero','bronzo','grigio'],'moderna'),('ravelli-rv-120-touch-steel',(.540,.570,1.170),['bianco','nero'],'moderna')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,colors[finishes[0]])
    base=.10 if kind=='classica' else .01
    box(c,'Corpo',(0,0,(h+base)/2),(w,d,h-base-.02),shell,.055 if kind in ('moderna','rv100') else .018)
    box(c,'Coperchio',(0,0,h-.012),(w,d,.024),shell if kind=='rv100' else black,.01)
    box(c,'Porta',(0,-d/2-.008,h*.50),(w*.64 if kind=='rv100' else w*.59,.020,h*.92 if kind=='rv100' else h*.68),black,.006)
    box(c,'Vetro sportello',(0,-d/2-.021,h*.58 if kind=='rv100' else h*.55),(w*.40 if kind=='rv100' else w*.35,.005,h*.25 if kind=='rv100' else h*.33),glass,.003)
    box(c,'Maniglia',(w*.27,-d/2-.024,h*.50),(.012,.018,.11),black,.003)
    for i in range(6):box(c,'Griglia superiore',(0,-d/2-.021,h*.90-i*.009),(w*.57,.006,.004),trim if kind=='rv100' else dark,.0005)
    box(c,'Pannello inferiore',(0,-d/2-.008,base+(h-base)*.10),(w*.59,.016,(h-base)*.17),black if kind!='classica' else shell,.004)
    if kind=='classica':
        for side in (-1,1):
            for y in (-d*.36,d*.36):box(c,'Piede',(side*w*.40,y,.045),(.045,.055,.09),black,.008)
            for z in (h*.37,h*.68):box(c,'Riquadro laterale',(side*(w/2+.002),0,z),(.004,d*.55,h*.25),trim,.002)
    else:box(c,'Zoccolo',(0,0,.01),(w*.92,d*.90,.02),black,.006)
    if kind=='r70':
        for i in range(12):box(c,'Feritoia laterale',(w/2+.002,d*.22,h*.34+i*.035),(.004,.07,.003),dark,.0005)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label in finishes:
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors[finishes[0]];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-r-rv.blend'))
