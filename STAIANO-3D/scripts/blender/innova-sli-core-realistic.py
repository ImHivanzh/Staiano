"""AirLeaf SLI 600 recessed core, shown without its optional aesthetic cover."""
from pathlib import Path
import math
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Innova SLI corpo a incasso'


def mat(name,rgb,metal=0,rough=.6):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


sheet=mat('Lamiera zincata',(.62,.64,.63),.65,.42)
black=mat('Pannello tecnico nero',(.035,.038,.038),.08,.8)
void=mat('Apertura aria',(.012,.014,.014),0,.92)
copper=mat('Attacchi',(.58,.38,.18),.7,.38)


def box(name,loc,dims,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Smusso','BEVEL'); b.width=bevel; b.segments=2
    return o


width,height,depth=.925,.576,.126
box('Fondo cassaforma',(0,.060,0),(width,.004,height),sheet)
for x in (-width/2+.003,width/2-.003):box('Fianco',(x,0,0),(.006,depth,height),sheet)
for z in (-height/2+.003,height/2-.003):box('Bordo orizzontale',(0,0,z),(width,depth,.006),sheet)
box('Mandata superiore',(0,-.052,.242),(.59,.014,.064),void)
box('Traversa mandata',(0,-.059,.203),(.64,.012,.018),sheet)
box('Pannello tecnico',(0,-.053,.005),(.72,.024,.264),black,.002)
for x in (-.373,.373):
    for z in (-.10,.105):box('Staffa pannello',(x,-.047,z),(.025,.014,.013),black)
box('Bacinella condensa',(0,-.034,-.165),(.65,.046,.025),sheet,.002)
box('Ripresa inferiore',(0,-.054,-.228),(.62,.014,.085),void)
for x in (-.315,.315):box('Montante ripresa',(x,-.059,-.228),(.012,.012,.095),sheet)
for z in (-.276,-.178):box('Traversa ripresa',(0,-.059,z),(.64,.012,.008),sheet)
for x in (-.15,0,.15):box('Rinforzo ripresa',(x,-.061,-.228),(.003,.004,.08),black)
for z in (-.12,.10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.012,depth=.028,location=(-.46,.00,z),rotation=(0,math.pi/2,0))
    bpy.context.object.name='Attacco acqua'; bpy.context.object.data.materials.append(copper)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac/innova-sli-core-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/innova-sli-core-realistic.blend'))
