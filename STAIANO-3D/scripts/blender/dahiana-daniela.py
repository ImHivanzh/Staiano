"""Stufe La Nordica DAHIANA AD e DANIELA, ricostruite dalle foto di catalogo."""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/stoves'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, rgb, metallic=.12, roughness=.42):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m

black = material('Acciaio scuro', (.018, .020, .021), .35)
glass = material('Vetro camera spenta', (.027, .032, .034), .18, .18)
metal = material('Maniglia e dettagli', (.065, .068, .069), .65, .28)

def box(collection, name, location, size, mat, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    for old in list(obj.users_collection): old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        b = obj.modifiers.new('Raccordo', 'BEVEL'); b.width = bevel; b.segments = 5
        obj.modifiers.new('Normali', 'WEIGHTED_NORMAL')
    return obj

def arc(collection, name, rx, ry, z0, z1, a0, a1, mat, offset=.002):
    steps = 64
    vertices = [((rx+offset)*math.sin(a0+(a1-a0)*i/steps), -(ry+offset)*math.cos(a0+(a1-a0)*i/steps), z) for z in (z0, z1) for i in range(steps+1)]
    faces = [(i,i+1,steps+2+i,steps+1+i) for i in range(steps)]
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); collection.objects.link(obj); obj.data.materials.append(mat)
    for poly in mesh.polygons: poly.use_smooth = True
    return obj

variants = [
    ('nordica-dahiana-ad', (.525,.602,1.080), [('avorio',(.78,.66,.44)),('bordeaux',(.28,.025,.034)),('nero',(.025,.027,.028)),('bronzo',(.30,.22,.16))]),
    ('nordica-daniela', (.500,.586,1.006), [('nero',(.025,.027,.028)),('avorio',(.78,.66,.44)),('tortora-matt',(.42,.34,.27)),('grigio-grafite',(.19,.20,.20))]),
]
for ident, (w,d,h), finishes in variants:
    c = bpy.data.collections.new(ident); bpy.context.scene.collection.children.link(c)
    shell = material('Rivestimento '+ident, finishes[0][1])
    dahiana = ident.endswith('dahiana-ad')
    if dahiana:
        box(c,'Corpo arrotondato',(0,0,h/2),(w,d,h-.025),shell,.055)
        box(c,'Coperchio superiore',(0,0,h-.015),(w,d,.035),black,.025)
        box(c,'Bocchetta superiore',(0,-d*.03,h+.004),(w*.68,d*.48,.004),metal,.009)
        box(c,'Pannello porta',(0,-d/2-.010,h*.60),(w*.57,.026,h*.76),black,.006)
        box(c,'Vetro porta',(0,-d/2-.026,h*.58),(w*.32,.006,h*.48),glass,.006)
        box(c,'Pannello inferiore',(0,-d/2-.010,h*.115),(w*.57,.02,h*.19),shell,.004)
        box(c,'Maniglia',(-w*.265,-d/2-.027,h*.46),(.013,.025,.14),metal,.004)
        box(c,'Fessura aria',(0,-d/2-.025,h*.955),(w*.43,.008,.012),metal,.002)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=1, depth=1, location=(0,0,h/2))
        body=bpy.context.object
        for old in list(body.users_collection): old.objects.unlink(body)
        c.objects.link(body); body.name='Corpo curvo'; body.dimensions=(w,d,h-.025)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); body.data.materials.append(shell)
        for p in body.data.polygons: p.use_smooth=len(p.vertices)==4
        bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=1, depth=1, location=(0,0,h-.015))
        lid=bpy.context.object
        for old in list(lid.users_collection): old.objects.unlink(lid)
        c.objects.link(lid); lid.name='Coperchio superiore'; lid.dimensions=(w*.98,d*.98,.03)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); lid.data.materials.append(black)
        for p in lid.data.polygons: p.use_smooth=len(p.vertices)==4
        arc(c,'Frontale curvo superiore',w/2,d/2,h*.73,h-.028,-.73,.73,shell)
        arc(c,'Frontale curvo inferiore',w/2,d/2,.018,h*.27,-.73,.73,shell)
        arc(c,'Pannello porta curvo',w/2,d/2,h*.27,h*.73,-.67,.67,black,.004)
        arc(c,'Vetro porta curvo',w/2,d/2,h*.39,h*.65,-.32,.32,glass,.007)
        box(c,'Maniglia',(-w/2*math.sin(.62),-d/2*math.cos(.62)-.008,h*.49),(.013,.025,.14),metal,.004)
        for i in range(3):
            arc(c,'Feritoia laterale',w/2,d/2,h-.06-i*.010,h-.057-i*.010,-1.10,-.75,black)
            arc(c,'Feritoia laterale',w/2,d/2,.035+i*.009,.038+i*.009,-1.10,-.75,black)
    if dahiana:
        box(c,'Zoccolo',(0,0,.012),(w*.91,d*.91,.024),black,.02)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=1, depth=1, location=(0,0,.012))
        base=bpy.context.object
        for old in list(base.users_collection): old.objects.unlink(base)
        c.objects.link(base); base.name='Zoccolo'; base.dimensions=(w*.97,d*.97,.024)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); base.data.materials.append(black)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in c.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(c.objects))
    shader = shell.node_tree.nodes.get('Principled BSDF')
    for label, rgb in finishes:
        shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'{ident}-{label}.glb'), export_format='GLB', use_selection=True,export_apply=True)
    rgb=finishes[0][1]; shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
    c.hide_viewport=True; c.hide_render=True
for c in bpy.context.scene.collection.children: c.hide_viewport=False; c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/stufe-dahiana-daniela.blend'))
