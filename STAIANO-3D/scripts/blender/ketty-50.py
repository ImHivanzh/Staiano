"""La Nordica KETTY 5.0: ricostruzione dalla foto e misure di catalogo."""
from pathlib import Path
import bpy

root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,color,metal=.1,rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
shell=material('Rivestimento',(.83,.84,.83)); black=material('Porta e telaio',(.015,.017,.018),.3); glass=material('Vetro spento',(.029,.034,.035),.15,.16)
def box(name,loc,size,mat,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('Bordi raccordati','BEVEL'); b.width=bevel; b.segments=5; o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
w,d,h=.456,.479,.884
box('Corpo laterale',(0,0,h/2),(w,d,h-.026),shell,.035)
box('Coperchio nero',(0,0,h-.013),(w,d,.027),black,.016)
box('Porta e frontale',(0,-d/2-.008,h*.49),(w*.55,.016,h*.94),black,.004)
box('Vetro porta',(0,-d/2-.019,h*.52),(w*.275,.006,h*.27),glass,.003)
box('Maniglia porta',(-w*.24,-d/2-.026,h*.48),(.012,.022,.11),black,.004)
box('Inserto superiore',(0,-d*.34,h+.002),(w*.48,d*.18,.005),shell,.002)
box('Giunto pannello inferiore',(0,-d/2-.019,h*.26),(w*.53,.005,.003),glass,.0005)
for i in range(3):box('Mandata frontale',(0,-d/2-.021,h*.89-i*.011),(w*.46,.006,.004),glass,.0005)
for side in (-1,1):
    for i in range(4):
        box('Feritoia laterale', (side*(w/2+.002), d*.25,h*.92-i*.025),(.004,d*.13,.003),black,.0005)
        box('Feritoia laterale', (side*(w/2+.002), d*.25,h*.09+i*.025),(.004,d*.13,.003),black,.0005)
box('Zoccolo',(0,0,.012),(w*.9,d*.9,.024),black,.012)
bpy.ops.object.select_all(action='SELECT')
for label,rgb in [('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028)),('avorio',(.78,.66,.44))]:
    shell.diffuse_color=(*rgb,1); shell.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'nordica-ketty-50-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
shell.diffuse_color=(.83,.84,.83,1); shell.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.83,.84,.83,1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-ketty-50.blend'))
