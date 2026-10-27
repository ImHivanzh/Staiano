"""Innova AirLeaf SLI cover, after the manufacturer's product photograph."""
from pathlib import Path
import math, random
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Innova AirLeaf SLI pannello'


def mat(name,color,metal=.1,rough=.48):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


white=mat('Bianco verniciato',(.87,.87,.86))
dark=mat('Feritoie mandata',(.07,.075,.075),.05,.75)
holes=mat('Microfori ripresa',(.16,.17,.17),0,.8)


def box(name,loc,dims,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Bordi','BEVEL'); b.width=bevel; b.segments=3
    return o


width,height,depth=1.172,.754,.03
box('Pannello metallico', (0,0,0),(width,depth,height),white,.002)
for i in range(4):
    z=.32+i*.012
    box('Fessura superiore',(0,-depth/2-.0006,z),(width-.035,.001,.004),dark)

verts=[]; faces=[]; rng=random.Random(109)
for col in range(220):
    x=(col/219-.5)*(width-.16)
    envelope=max(0,1-(abs(x)/((width-.16)/2))**1.7)
    for row in range(12):
        if rng.random()>.25+.7*envelope:continue
        z=-.319+(row-5.5)*.0035+rng.uniform(-.0003,.0003)
        r=.00105; start=len(verts)
        for j in range(6):
            a=math.tau*j/6
            verts.append((x+r*math.cos(a),-depth/2-.0008,z+r*math.sin(a)))
        faces.append(tuple(start+j for j in range(6)))
mesh=bpy.data.meshes.new('Perforazione inferiore'); mesh.from_pydata(verts,[],faces); mesh.update()
o=bpy.data.objects.new('Perforazione inferiore',mesh); scene.collection.objects.link(o); o.data.materials.append(holes)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac/innova-sli-panel-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/innova-sli-panel-realistic.blend'))
