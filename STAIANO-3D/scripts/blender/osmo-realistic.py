"""Innova OSMO SL 600 reference visual, based on the official product image."""
from pathlib import Path
import math, random
import bpy

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Innova OSMO SL 600'


def mat(name, rgb, rough=.5, metallic=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metallic
    return m


white=mat('Bianco verniciato',(.86,.86,.85),.37,.12)
edge=mat('Testata bianca',(.76,.77,.76),.48,.08)
dark=mat('Interno feritoie',(.055,.06,.062),.8)
perfs=mat('Fori ripresa',(.14,.15,.15),.8)


def box(name, loc, dims, material, bevel=0, segments=4):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj=bpy.context.object; obj.name=name; obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(material)
    if bevel:
        b=obj.modifiers.new('Angoli arrotondati','BEVEL'); b.width=bevel; b.segments=segments
        b.affect='EDGES'
        n=obj.modifiers.new('Normali superfici','WEIGHTED_NORMAL'); n.keep_sharp=True
    return obj


# The manufacturer's SL 600 wall size is 1080 x 580 x 119 mm.
rear_outline=[]
for cx,cz,start in ((.495,.245,0),(-.495,.245,90),(-.495,-.245,180),(.495,-.245,270)):
    for step in range(9):
        a=math.radians(start+step*90/8)
        rear_outline.append((cx+.045*math.cos(a),cz+.045*math.sin(a)))
vertices=[(x,y,z) for y in (-.047,.0595) for x,z in rear_outline]
n=len(rear_outline)
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
faces += [(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
mesh=bpy.data.meshes.new('Corpo a perimetro raggiato'); mesh.from_pydata(vertices,[],faces); mesh.update()
body=bpy.data.objects.new('Corpo posteriore',mesh); scene.collection.objects.link(body); body.data.materials.append(edge)
mod=body.modifiers.new('Bordi morbidi','BEVEL'); mod.width=.003; mod.segments=3
outline=[]
for cx,cz,start in ((.4975,.248,0),(-.4975,.248,90),(-.4975,-.248,180),(.4975,-.248,270)):
    for step in range(9):
        a=math.radians(start+step*90/8)
        outline.append((cx+.04*math.cos(a),cz+.04*math.sin(a)))
verts=[(x,y,z) for y in (-.060,-.047) for x,z in outline]
n=len(outline)
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
faces += [(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
mesh=bpy.data.meshes.new('Pannello con angoli raggiati'); mesh.from_pydata(verts,[],faces); mesh.update()
front=bpy.data.objects.new('Pannello frontale arrotondato',mesh); scene.collection.objects.link(front); front.data.materials.append(white)
b=front.modifiers.new('Bordo morbido','BEVEL'); b.width=.0015; b.segments=3
# Localized open slots across the top surface, rather than one broad black band.
box('Intercapedine mandata', (0,.002,.291),(.92,.03,.003),dark,.001)
for i in range(28):
    x=-.45+i*.9/27
    box('Aletta superiore', (x,.002,.293),(.004,.03,.003),white,.0008)
for y in (-.014,.018): box('Bordo griglia', (0,y,.293),(.94,.004,.004),white,.001)

# The original has a stippled, tapered band of small inlet perforations near the base.
rng=random.Random(749)
vertices=[]; faces=[]
for col in range(180):
    x=(col/179-.5)*.86
    envelope=max(0,1-(abs(x)/.43)**1.7)
    for row in range(9):
        if rng.random() > .22+.77*envelope: continue
        z=-.232+(row-4)*.004 + rng.uniform(-.00045,.00045)
        r=rng.uniform(.0007,.00115)
        start=len(vertices)
        for j in range(6):
            a=j*math.tau/6
            vertices.append((x+r*math.cos(a),-.0603,z+r*math.sin(a)))
        faces.append(tuple(start+j for j in range(6)))
mesh=bpy.data.meshes.new('Microfori ripresa'); mesh.from_pydata(vertices,[],faces); mesh.update()
obj=bpy.data.objects.new('Microfori ripresa',mesh); scene.collection.objects.link(obj); obj.data.materials.append(perfs)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac/innova-osmo-sl-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/innova-osmo-sl-realistic.blend'))
