"""NORIS EVO/LUX e PEGGY, ricostruiti dalle fotografie del catalogo."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,color,metal=.15,rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
black=mat('Corpo nero',(.018,.020,.021),.32); dark=mat('Cornice nera',(.006,.008,.009),.2)
glass=mat('Vetro spento',(.028,.033,.034),.2,.16); handle=mat('Maniglia',(.065,.067,.068),.65)
def box(c,name,loc,dims,material,bevel=.002,vertical=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o); o.name=name; o.dimensions=dims; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Raccordi','BEVEL'); mod.width=bevel; mod.segments=4
        if vertical:
            weights=o.data.attributes.new('bevel_weight_edge','FLOAT','EDGE')
            for edge in o.data.edges:
                a,b=(o.data.vertices[i].co for i in edge.vertices)
                weights.data[edge.index].value=1.0 if abs(a.z-b.z)>.001 else 0.0
            mod.limit_method='WEIGHT'
        if not vertical: o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def output(c,ident,shell,variants,border=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects)); p=shell.node_tree.nodes.get('Principled BSDF')
    for label,rgb in variants:
        shell.diffuse_color=(*rgb,1); p.inputs['Base Color'].default_value=(*rgb,1)
        if border:
            border.diffuse_color=(*(v*.72 for v in rgb),1)
            border.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=border.diffuse_color
        bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    shell.diffuse_color=(*variants[0][1],1); p.inputs['Base Color'].default_value=(*variants[0][1],1)
    if border:
        border.diffuse_color=(*(v*.72 for v in variants[0][1]),1)
        border.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=border.diffuse_color
    c.hide_viewport=True; c.hide_render=True
for ident,lux,colors in [
    ('nordica-noris-evo',False,[('bronzo',(.13,.055,.028)),('bianco',(.83,.84,.83)),('tortora-matt',(.47,.38,.33))]),
    ('nordica-noris-lux-evo',True,[('tortora',(.47,.38,.33)),('bianco',(.83,.84,.83))])]:
    c=bpy.data.collections.new(ident); bpy.context.scene.collection.children.link(c); w,d,h=.576,.642,1.174
    shell=mat('Rivestimento inferiore '+ident,colors[0][1])
    box(c,'Corpo superiore',(0,0,h*.65),(w,d,h*.69),black,.055,True)
    box(c,'Basamento colorato',(0,0,h*.155),(w,d,h*.31),shell,.055,True)
    box(c,'Coperchio',(0,0,h-.015),(w,d,.03),black,.025)
    box(c,'Coperchio pellet',(0,.04,h+.002),(w*.55,d*.42,.005),dark,.004)
    box(c,'Cornice porta',(0,-d/2-.008,h*.545),(w*.58,.020,h*.49),dark,.005)
    box(c,'Sportello',(0,-d/2-.019,h*.545),(w*.55,.010,h*.47),black,.005)
    box(c,'Vetro porta',(0,-d/2-.027,h*.56),(w*.30,.006,h*.33),glass,.004)
    box(c,'Maniglia',(-w*.26,-d/2-.030,h*.51),(.012,.02,.15),handle,.003)
    box(c,'Pannello griglia',(0,-d/2-.010,h*.84),(w*.58,.016,h*.13),black,.004)
    for i in range(3):box(c,'Feritoia mandata',(0,-d/2-.020,h*.875-i*.014),(w*.55,.006,.005),dark,.0005)
    box(c,'Pannello inferiore',(0,-d/2-.008,h*.155),(w*.58,.016,h*.30),shell,.004)
    border=None
    if lux:
        border=mat('Bordo maiolica '+ident,tuple(v*.72 for v in colors[0][1]),0,.3)
        for z in (h*.06,h*.25):box(c,'Bordo maiolica',(0,-d/2-.018,z),(w*.43,.003,.002),border,.0005)
        for side in (-1,1):
            box(c,'Bordo maiolica',(side*w*.215,-d/2-.018,h*.155),(.002,.003,h*.19),border,.0005)
            for z in (h*.06,h*.25):box(c,'Bordo laterale maiolica',(side*(w/2+.002),0,z),(.003,d*.38,.002),border,.0005)
    box(c,'Zoccolo',(0,0,.009),(w*.90,d*.90,.018),dark,.01)
    output(c,ident,shell,colors,border)
c=bpy.data.collections.new('nordica-peggy'); bpy.context.scene.collection.children.link(c); w,d,h=.500,.570,.620
shell=mat('PEGGY rivestimento nero',(.025,.027,.028))
box(c,'Corpo compatto',(0,0,h/2),(w,d,h-.02),shell,.025)
box(c,'Coperchio',(0,0,h-.013),(w,d,.026),shell,.018)
box(c,'Porta',(0,-d/2-.009,h*.53),(w*.73,.020,h*.72),black,.008)
box(c,'Cornice vetro',(0,-d/2-.020,h*.53),(w*.48,.008,h*.52),dark,.006)
box(c,'Vetro porta',(0,-d/2-.026,h*.53),(w*.45,.004,h*.48),glass,.006)
box(c,'Maniglia',(-w*.34,-d/2-.029,h*.46),(.014,.022,.13),handle,.003)
box(c,'Zoccolo',(0,0,.018),(w*.94,d*.94,.036),black,.01)
for i in range(3):box(c,'Mandata frontale',(0,-d/2-.014,h*.925-i*.006),(w*.86,.004,.002),dark,.0005)
box(c,'Giunto inferiore',(0,-d/2-.014,h*.115),(w*.86,.004,.002),dark,.0005)
for i in range(12):box(c,'Griglia superiore',(0,-.06+i*.010,h+.002),(w*.55,.004,.003),dark,.0005)
output(c,'nordica-peggy',shell,[('nero',(.025,.027,.028))])
for c in bpy.context.scene.collection.children:c.hide_viewport=False; c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/stufe-noris-peggy.blend'))
