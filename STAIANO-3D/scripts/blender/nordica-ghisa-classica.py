"""GIULIETTA, ISETTA e ISOTTA: stufe in ghisa, con varianti forno."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
iron=mat('Ghisa antracite',(.025,.027,.028),.54);trim=mat('Bordi ghisa',(.045,.048,.049));dark=mat('Telaio',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16)
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;return o
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=bevel;b.segments=5
    return o
def cylinder(c,name,loc,size,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1,depth=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
specs=[('nordica-giulietta165',(.487,.430,.750),False,False),('nordica-isetta165',(.661,.594,.898),False,False),('nordica-isetta-cc165',(.661,.594,.898),False,True),('nordica-isetta-forno',(.661,.452,1.162),True,False),('nordica-isotta-cc-eos165',(.791,.660,1.216),False,True),('nordica-isotta-eos165',(.791,.660,1.216),False,False),('nordica-isotta-forno-eos',(.790,.520,1.244),True,False)]
for ident,(w,d,h),oven,cc in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);base=.14*h;pipe=.07*h
    body=h-base-pipe
    box(c,'Corpo',(0,0,base+body/2),(w*.92,d*.93,body),iron,.014)
    box(c,'Cornice superiore',(0,0,base+body-.012),(w,d,.024),trim,.008)
    box(c,'Cornice inferiore',(0,0,base+.03),(w*.93,d*.94,.04),trim,.006)
    for x in (-w*.40,w*.40):
        box(c,'Montante',(x,-d*.46,base+body*.50),(.055,.045,body*.95),trim,.01)
        for y in (-d*.35,d*.35):box(c,'Piede',(x,y,base/2),(.045,.05,base),iron,.008)
    z=base+body*(.38 if oven else .57)
    box(c,'Cornice porta',(0,-d/2-.005,z),(w*.68,.018,body*.48),trim,.018)
    box(c,'Porta',(0,-d/2-.017,z),(w*.61,.012,body*.41),iron,.012)
    box(c,'Vetro sportello',(0,-d/2-.025,z+.015),(w*.51,.006,body*.28),glass,.009)
    box(c,'Maniglia',(-w*.32,-d/2-.027,z-.01),(.015,.018,.11),dark,.004)
    box(c,'Cassetto cenere',(0,-d/2-.008,base+body*.10),(w*.68,.016,body*.12),trim,.006)
    if oven:
        z2=base+body*.77;box(c,'Sportello forno',(0,-d/2-.009,z2),(w*.68,.018,body*.30),trim,.012)
        box(c,'Vetro forno',(0,-d/2-.021,z2),(w*.51,.006,body*.19),glass,.007)
        cylinder(c,'Termometro forno',(0,-d/2-.027,z2),(.025,.005,.025),trim)
    for side in (-1,1):
        for i in range(2):box(c,'Rilievo laterale',(side*(w*.46+.002),0,base+body*(.25+i*.30)),(.004,d*.55,body*.22),trim,.003)
    if cc:box(c,'Piastra superiore',(0,0,base+body+.006),(w*.78,d*.65,.012),dark,.004)
    cylinder(c,'Scarico fumi',(0,d*.13,h-pipe/2),(.10,.10,pipe),iron)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-nero-antracite.glb'),export_format='GLB',use_selection=True,export_apply=True)
    c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-nordica-ghisa-classica.blend'))
