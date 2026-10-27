"""Ravelli BLOCK e LUNA: stufe compatte con finiture e piedi distintivi."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Acciaio nero',(.018,.020,.021));dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);stone=mat('Rivestimento grigio',(.48,.50,.50),.75)
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=4
    return o
for ident,w,d,h,luna in [('ravelli-block-9',.470,.520,1.010,False),('ravelli-block-7',.470,.520,1.010,False),('ravelli-luna',.460,.560,1.080,True)]:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);base=.16 if luna else .01
    box(c,'Corpo',(0,0,(h+base)/2),(w,d,h-base-.04),black,.014)
    box(c,'Coperchio',(0,0,h-.024),(w,d,.024),black if luna else stone,.008)
    if not luna:
        for side in (-1,1):box(c,'Rivestimento laterale',(side*w*.39,0,h*.73),(w*.22,d*.95,h*.50),stone,.005)
    box(c,'Porta',(0,-d/2-.008,(h+base)*.52),(w*.72,.018,(h-base)*.78),dark,.008)
    box(c,'Vetro sportello',(0,-d/2-.020,(h+base)*.54),(w*.42,.005,(h-base)*.42),glass,.004)
    box(c,'Maniglia',(w*.32,-d/2-.023,(h+base)*.48),(.012,.018,.12),black,.003)
    if luna:
        for x in (-w*.38,w*.38):
            for y in (-d*.35,d*.35):box(c,'Piede',(x,y,.08),(.05,.05,.16),black,.008)
        for i in range(9):box(c,'Griglia superiore',((i-4)*.035,-.08,h-.008),(.012,d*.30,.003),dark,.0005)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.04,depth=.09,location=(0,d*.25,h+.035));o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name='Scarico superiore';o.data.materials.append(black)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));label='nero' if luna else 'grigio'
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-block-luna.blend'))
