"""KLAUDIA AD EVO dalla fotografia e dimensioni di catalogo."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,metal=.12,rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
shell=mat('Rivestimento',(.025,.027,.028)); black=mat('Porta nera',(.014,.016,.017),.3); glass=mat('Vetro spento',(.027,.032,.033),.15,.16)
def box(name,loc,dims,material,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL'); b.width=bevel; b.segments=5; o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
w,d,h=.498,.576,1.017
box('Corpo laterale',(0,0,h/2),(w,d,h-.024),shell,.055)
box('Sommità',(0,0,h-.013),(w,d,.028),shell,.025)
box('Coperchio pellet',(0,.035,h+.002),(w*.54,d*.46,.005),black,.003)
box('Pannello superiore',(0,-d/2-.006,h*.87),(w*.56,.018,h*.11),shell,.003)
box('Sportello',(0,-d/2-.008,h*.51),(w*.56,.024,h*.57),black,.006)
box('Vetro sportello',(0,-d/2-.023,h*.49),(w*.29,.006,h*.30),glass,.004)
box('Maniglia',(-w*.25,-d/2-.025,h*.48),(.013,.022,.14),black,.004)
box('Pannello inferiore',(0,-d/2-.007,h*.12),(w*.56,.015,h*.20),shell,.004)
for i in range(3):box('Mandata orizzontale',(0,-d/2-.024,h*.76-i*.013),(w*.43,.006,.005),glass,.0005)
box('Base',(0,0,.012),(w*.9,d*.9,.024),black,.012)
bpy.ops.object.select_all(action='SELECT')
for label,rgb in [('nero',(.025,.027,.028)),('bordeaux',(.28,.025,.034)),('bianco',(.83,.84,.83))]:
    shell.diffuse_color=(*rgb,1); shell.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'nordica-klaudia-ad-evo-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
shell.diffuse_color=(.025,.027,.028,1); shell.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.025,.027,.028,1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufa-klaudia-ad-evo.blend'))
