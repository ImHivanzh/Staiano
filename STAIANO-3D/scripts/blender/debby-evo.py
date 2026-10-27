"""DEBBY EVO e DEBBY PETRA EVO, ricostruzioni dal catalogo fotografico."""
from pathlib import Path
import math, random
import bpy

root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,rgb,metal=.1,rough=.42):
    m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=(*rgb,1)
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
black=material('Acciaio nero',(.018,.020,.021),.35)
glass=material('Vetro spento',(.026,.031,.032),.15,.15)
white=material('Rivestimento bianco',(.82,.83,.82))
stone=material('Pietra naturale',(.43,.45,.44),0,.82)
image=bpy.data.images.new('Grana pietra',width=256,height=256)
random.seed(283611); pixels=[]
for y in range(256):
    for x in range(256):
        u=x/255; v=y/255
        vein=math.sin(19*u+7*v+1.5*math.sin(9*v+3*u))
        value=max(.25,min(.67,.48+.035*math.sin(8*u-5*v)+.025*math.sin(21*v+4*u)-.11*math.exp(-(vein/.16)**2)+random.gauss(0,.008)))
        pixels.extend((value,value*1.015,value*.99,1))
image.pixels=pixels; image.pack()
texture=stone.node_tree.nodes.new('ShaderNodeTexImage'); texture.image=image
stone.node_tree.links.new(texture.outputs['Color'],stone.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o); o.name=name; return o
def cylinder(c,name,z,w,d,h,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1,depth=1,location=(0,0,z)); o=link(c,bpy.context.object,name); o.dimensions=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    b=o.modifiers.new('Raccordo','BEVEL'); b.width=.002; b.segments=3
    o.modifiers.new('Normali','WEIGHTED_NORMAL'); return o
def box(c,name,loc,size,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=link(c,bpy.context.object,name); o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    b=o.modifiers.new('Raccordo','BEVEL'); b.width=.003; b.segments=3; return o
def arc(c,name,rx,ry,z0,z1,a0,a1,mat):
    n=64; verts=[((rx+.002)*math.sin(a0+(a1-a0)*i/n),-(ry+.002)*math.cos(a0+(a1-a0)*i/n),z) for z in (z0,z1) for i in range(n+1)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],[(i,i+1,n+2+i,n+1+i) for i in range(n)]); mesh.update()
    obj=bpy.data.objects.new(name,mesh); c.objects.link(obj); obj.data.materials.append(mat)
    for poly in mesh.polygons:poly.use_smooth=True
    return obj
for ident,petra in [('nordica-debby-evo',False),('nordica-debby-petra-evo',True)]:
    c=bpy.data.collections.new(ident); bpy.context.scene.collection.children.link(c)
    w,d,h=.550,.573,1.199; shell=stone if petra else white
    cylinder(c,'Rivestimento',h/2,w,d,h-.03,shell)
    cylinder(c,'Base',.018,w*.96,d*.96,.036,black)
    cylinder(c,'Sommità',h-.02,w,d,.036,shell)
    cylinder(c,'Coperchio pellet',h+.001,w*.65,d*.59,.006,black)
    arc(c,'Porta curva',w/2,d/2,h*.12,h*.94,-.82,.82,black)
    box(c,'Vetro porta',(0,-d/2-.009,h*.50),(w*.25,.009,h*.30),glass)
    box(c,'Maniglia',(w*.305,-d*.405,h*.60),(.014,.028,.10),black)
    for i in range(4):
        z=h-.053-i*.009
        arc(c,'Feritoia superiore',w/2+.002,d/2+.002,z,z+.003,-1.10,1.10,black)
        z=.035+i*.009
        arc(c,'Feritoia inferiore',w/2+.002,d/2+.002,z,z+.002,-1.10,-.85,black)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    finishes=[('pietra',None)] if petra else [('bianco',(.82,.83,.82)),('nero',(.025,.027,.028))]
    for label,rgb in finishes:
        if rgb:
            white.diffuse_color=(*rgb,1); white.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    white.diffuse_color=(.82,.83,.82,1); white.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.82,.83,.82,1)
    c.hide_viewport=True; c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False; c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-debby.blend'))
