"""LUCIA 16 e LUISELLA 5.0/Maxi: forme dalle foto, dimensioni dal catalogo."""
from pathlib import Path
import math
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,rgb,metal=.12,rough=.42):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
black=material('Acciaio nero',(.018,.020,.021),.28)
dark=material('Cornice e aperture',(.006,.008,.009),.15)
glass=material('Vetro spento',(.028,.033,.034),.2,.16)
metal=material('Display e maniglia',(.26,.27,.27),.5,.38)
display=material('Display spento',(.09,.025,.02),.1)
def box(c,name,loc,size,mat,bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o); o.name=name; o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Bordi raccordati','BEVEL'); mod.width=bevel; mod.segments=4; o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def dots(c,name,x0,y,z0,cols,rows,spacing,mat):
    verts=[]; faces=[]
    for row in range(rows):
        for col in range(cols):
            x=x0+col*spacing; z=z0+row*spacing; first=len(verts)
            verts.extend((x+math.cos(k*math.tau/8)*.0013,y,z+math.sin(k*math.tau/8)*.0013) for k in range(8))
            faces.append(tuple(range(first,first+8)))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); c.objects.link(o); o.data.materials.append(mat)
def export(c,ident,shell,finishes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects)); shader=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1]; shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True; c.hide_render=True

c=bpy.data.collections.new('nordica-lucia16'); bpy.context.scene.collection.children.link(c)
w,d,h=.556,.597,1.097
shell=material('LUCIA rivestimento',(.47,.38,.33),0,.25)
box(c,'Chassis posteriore',(0,0,h/2),(w,d,h-.02),black,.035)
box(c,'Rivestimento superiore',(0,-d*.36-.004,h*.957),(w,d*.28,h*.074),shell,.016)
box(c,'Rivestimento inferiore',(0,-d*.36-.004,h*.085),(w,d*.28,h*.15),shell,.015)
for side in (-1,1):box(c,'Montante anteriore',(side*w*.405,-d*.43-.004,h*.50),(w*.18,d*.14,h*.70),shell,.025)
box(c,'Sportello nero',(0,-d/2-.008,h*.50),(w*.61,.019,h*.68),dark,.005)
box(c,'Cornice vetro',(0,-d/2-.019,h*.50),(w*.42,.009,h*.58),black,.004)
box(c,'Vetro sportello',(0,-d/2-.027,h*.52),(w*.29,.006,h*.37),glass,.004)
box(c,'Maniglia',(-w*.28,-d/2-.028,h*.49),(.013,.020,.14),dark,.003)
for i in range(6):
    z=h*.895-i*.009
    box(c,'Griglia mandata',(0,-d/2-.006,z),(w*.99,.012,.004),dark,.0005)
    for side in (-1,1):
        box(c,'Griglia laterale',(side*(w/2+.002),-d*.36,z),(.004,d*.28,.004),dark,.0005)
box(c,'Coperchio pellet',(0,.025,h+.002),(w*.55,d*.43,.006),dark,.004)
export(c,'nordica-lucia16',shell,[('tortora',(.47,.38,.33)),('bordeaux',(.28,.025,.034)),('bianco',(.83,.84,.83))])

for ident,w,d,maxi,finishes in [
    ('nordica-luisella-50',.572,.307,False,[('nero',(.025,.027,.028)),('grigio-grafite',(.045,.050,.051)),('bordeaux',(.28,.025,.034))]),
    ('nordica-luisella-50-maxi',.639,.290,True,[('grigio-grafite',(.045,.050,.051)),('nero',(.025,.027,.028))])]:
    c=bpy.data.collections.new(ident); bpy.context.scene.collection.children.link(c); h=.892
    shell=material('LUISELLA rivestimento '+ident,finishes[0][1])
    box(c,'Corpo sottile',(0,0,h/2),(w,d,h-.018),shell,.006)
    box(c,'Pannello frontale',(0,-d/2-.005,h*.51),(w*.73,.012,h*.96),shell,.002)
    for side in (-1,1):box(c,'Montante', (side*w*.445,-d/2-.007,h*.50),(w*.11,.016,h*.98),shell,.003)
    dx=.03*w if maxi else .15*w
    box(c,'Cornice porta',(dx,-d/2-.015,h*.53),(w*(.40 if maxi else .34),.012,h*.56),dark,.003)
    box(c,'Sportello',(dx,-d/2-.023,h*.53),(w*(.37 if maxi else .31),.008,h*.53),black,.002)
    box(c,'Vetro sportello',(dx,-d/2-.029,h*.54),(w*(.22 if maxi else .12),.005,h*.37),glass,.002)
    box(c,'Maniglia',(dx-w*.15,-d/2-.030,h*.51),(.008,.012,.14),dark,.002)
    box(c,'Display controllo',(-w*.25,-d/2-.015,h*.24),(.07,.006,.036),metal,.002)
    box(c,'Schermo',(-w*.25,-d/2-.019,h*.242),(.028,.003,.008),display,.001)
    if not maxi:
        dots(c,'Fori mandata superiore',w*.02,-d/2-.012,h*.95,22,3,.006,dark)
        dots(c,'Fori presa inferiore',w*.02,-d/2-.012,h*.035,22,3,.006,dark)
    else:
        for i in range(8):box(c,'Griglia superiore',(.055,(i-3.5)*.012,h-.004),(w*.55,.004,.003),dark,.0005)
    box(c,'Zoccolo',(0,0,.009),(w*.94,d*.9,.018),dark,.004)
    export(c,ident,shell,finishes)
for c in bpy.context.scene.collection.children:c.hide_viewport=False; c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/stufe-lucia-luisella.blend'))
