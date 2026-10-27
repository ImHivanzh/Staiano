"""Visual reconstruction of FCZ P/PO from the official Aermec catalogue image."""
from pathlib import Path
import math
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Aermec FCZ P PO'


def mat(name, rgb, metallic=.5, rough=.48):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    return m


sheet=mat('Lamiera zincata',(.49,.52,.51),.7,.42)
edge=mat('Bordo lamiera',(.29,.31,.31),.7,.5)
coil=mat('Batteria',(.055,.065,.065),.3,.65)
fin=mat('Alette batteria',(.25,.28,.28),.7,.4)
copper=mat('Raccordi',(.55,.36,.16),.72,.38)
plastic=mat('Scarico condensa',(.08,.09,.09),.05,.75)


def box(name, loc, dims, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Smusso lamiera','BEVEL'); mod.width=bevel; mod.segments=2
    return o


def cylinder(name,loc,radius,depth,material,axis='X',vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(material)
    if axis=='X': o.rotation_euler.y=math.pi/2
    if axis=='Y': o.rotation_euler.x=math.pi/2
    return o


# Local X=width, Z=height, -Y=exposed face. Nominal 1.0 x .558 x .216 m.
for x in (-.493,.493): box('Fianco metallico', (x,0,0),(.014,.216,.558),sheet,.002)
box('Pannello posteriore', (0,.106,0),(.982,.004,.558),sheet)
box('Coperchio superiore', (0,0,.277),(.982,.216,.004),sheet,.001)
box('Bacinella inferiore', (0,0,-.277),(.982,.216,.004),sheet,.001)
box('Pannello anteriore inferiore', (0,-.108,-.157),(.982,.004,.242),sheet,.001)
box('Traversa superiore', (0,-.108,.258),(.982,.004,.037),sheet,.001)
box('Batteria interna scura', (0,-.065,.105),(.83,.008,.27),coil)
for i in range(43):
    box('Aletta orizzontale', (0,-.071,-.023+i*.0061),(.83,.003,.0015),fin)
for x in (-.43,.43): box('Montante batteria', (x,-.08,.105),(.014,.045,.27),edge)
for x in (-.49,.49):
    for z in (-.235,.23): cylinder('Vite fissaggio',(x,-.111,z),.003,.002,edge,'Y',16)
for z in (.175,-.025):
    cylinder('Raccordo idraulico',(-.512,.015,z),.016,.04,copper)
    cylinder('Collare raccordo',(-.496,.015,z),.021,.008,edge)
cylinder('Scarico condensa',(-.506,-.025,-.18),.012,.035,plastic)
for x in (-.42,.42):
    box('Piastra sospensione',(x,.03,-.288),(.10,.16,.018),edge,.002)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac/aermec-fcz-p-po-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/aermec-fcz-realistic.blend'))
