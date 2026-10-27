"""Air pellet stoves ANGELICA EVO and JUNIOR, from manufacturer photos."""
from pathlib import Path
import bpy

root=Path(__file__).resolve().parents[2]
out=root/'public/models/stoves'
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, metal=.1, rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m

dark=material('Metallo nero',(.018,.020,.021),.35)
glass=material('Vetro spento',(.028,.035,.036),.2,.18); handle=material('Maniglia',(.055,.057,.058),.6)
def box(c,name,location,size,mat,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location); o=bpy.context.object; o.name=name
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o); o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Spigoli raccordati','BEVEL'); mod.width=bevel; mod.segments=4
        o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o

variants=[('nordica-angelica-evo',1.016,[('avorio',(.78,.66,.44)),('nero',(.025,.027,.028)),('bordeaux',(.27,.025,.033))]),('nordica-angelica-junior',.926,[('nero',(.025,.027,.028)),('avorio',(.78,.66,.44)),('tortora-matt',(.34,.30,.27))])]
for ident,h,colors in variants:
    shell=material('Rivestimento '+ident,colors[0][1])
    w,d=.495,.555; c=bpy.data.collections.new(ident); bpy.context.scene.collection.children.link(c)
    box(c,'Corpo laterale',(0,0,h/2),(w,d,h-.03),shell,.055)
    box(c,'Copertura superiore',(0,0,h-.015),(w,d,.03),dark,.025)
    box(c,'Pannello superiore',(0,-d/2-.001,h*.87),(w*.57,.015,h*.23),dark,.004)
    box(c,'Cornice sportello',(0,-d/2-.009,h*.50),(w*.57,.02,h*.52),dark,.005)
    box(c,'Vetro sportello',(0,-d/2-.021,h*.53),(w*.29,.006,h*.24),glass,.002)
    box(c,'Maniglia sportello',(-w*.24,-d/2-.027,h*.49),(.014,.025,h*.17),handle,.004)
    box(c,'Presa superiore',(0,-d/2-.023,h*.76),(w*.46,.01,.009),handle,.002)
    box(c,'Base frontale',(0,-d/2-.001,h*.12),(w*.57,.005,h*.22),shell,.002)
    for x in (-w*.36,w*.36):box(c,'Piedino',(x,0,.014),(.04,.09,.028),dark,.006)
    for i in range(9):box(c,'Fessura coperchio',((i-4)*.038,-.025,h+.001),(.006,.10,.002),dark,.0005)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in colors:
        shell.diffuse_color=(*rgb,1); p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(out/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    shell.diffuse_color=(*colors[0][1],1); p.inputs['Base Color'].default_value=(*colors[0][1],1)
    c.hide_render=True; c.hide_viewport=True
for c in bpy.context.scene.collection.children:c.hide_render=False; c.hide_viewport=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-angelica.blend'))
