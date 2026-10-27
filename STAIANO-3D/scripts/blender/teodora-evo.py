"""TEODORA EVO: stufa compatta in ghisa con cornici e piedi, da foto di catalogo."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,metal=.2,rough=.5):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough; return m
iron=mat('Ghisa antracite',(.025,.024,.023),.42,.56)
trim=mat('Rilievi ghisa',(.05,.047,.044),.46,.47)
dark=mat('Fessure',(.006,.007,.007),.05)
glass=mat('Vetro spento',(.029,.032,.032),.12,.15)
def box(name,loc,size,material,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Bordi','BEVEL'); mod.width=bevel; mod.segments=3; o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
w,d,h=.610,.632,.739
box('Corpo ghisa',(0,0,h*.54),(w*.95,d*.94,h*.65),iron,.018)
box('Sommità',(0,0,h*.88),(w,d,.035),trim,.012)
box('Piano superiore',(0,0,h*.90),(w*.90,d*.80,.009),iron,.008)
box('Zoccolo ghisa',(0,0,h*.20),(w*.96,d*.94,.065),iron,.01)
for side in (-1,1):
    box('Montante anteriore',(side*w*.43,-d*.47,h*.54),(.055,.055,h*.63),trim,.018)
    box('Piede anteriore',(side*w*.40,-d*.39,h*.09),(.045,.055,h*.18),iron,.01)
    box('Piede posteriore',(side*w*.40,d*.36,h*.09),(.035,.04,h*.18),iron,.008)
box('Cornice sportello',(0,-d*.485,h*.54),(w*.70,.025,h*.46),trim,.012)
box('Porta ghisa',(0,-d*.505,h*.54),(w*.62,.020,h*.39),iron,.007)
box('Cornice vetro',(0,-d*.520,h*.54),(w*.50,.010,h*.29),trim,.005)
box('Vetro sportello',(0,-d*.527,h*.54),(w*.44,.006,h*.25),glass,.003)
box('Maniglia',(-w*.32,-d*.53,h*.48),(.018,.030,.10),trim,.005)
for i in range(4):box('Mandata superiore',(0,-d*.495,h*.82-i*.014),(w*.70,.009,.006),dark,.0005)
for side in (-1,1):
    box('Pannello inferiore',(side*w*.17,-d*.493,h*.235),(w*.28,.013,h*.055),trim,.003)
    for i in range(12):box('Rilievo decorativo',(side*w*.17+(i-5.5)*.009,-d*.502,h*.235),(.003,.004,.035),iron,.0005)
    box('Pannello laterale',(side*w*.482,0,h*.54),(.013,d*.48,h*.30),trim,.004)
for i in range(9):box('Aerazione superiore',((i-4)*.045,-d*.30,h*.910),(.016,.065,.003),dark,.001)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves/nordica-teodora-evo-nero.glb'),export_format='GLB',use_selection=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-teodora-evo.blend'))
