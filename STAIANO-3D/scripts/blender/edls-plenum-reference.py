"""EDLS lateral plenum, reconstructed from the user-supplied Ecoclima diagram."""
from pathlib import Path
import bpy, math

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Plenum laterale EDLS'
coll = bpy.data.collections.new('Plenum EDLS - elementi modificabili')
scene.collection.children.link(coll)


def material(name, color, metal=0, rough=.6):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m


insulation = material('Corpo verde', (.42, .58, .24), 0, .88)
galvanized = material('Acciaio zincato', (.42, .46, .47), .75, .35)
interior = material('Interno condotto', (.025, .03, .032), .1, .8)


def box(name, loc, dims, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object; obj.name = name; obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj); obj.data.materials.append(mat)
    return obj


# 1 m nominal, 240 mm casing height and 60 mm face width, 145 mm collar.
length, height, thickness = 1.0, .24, .06
front_y, back_y = -.03, .03
box('Pannello_posteriore', (0, back_y, 0), (length, .002, height), insulation)
box('Interno posteriore', (0, back_y-.002, 0), (length-.004, .001, height-.004), interior)
box('Pannello_superiore', (0, 0, height/2), (length, thickness, .002), insulation)
for x in (-length/2+.001, length/2-.001):
    box('Testata', (x, 0, 0), (.002, thickness, height), insulation)
face = box('Pannello_laterale_forato', (0, front_y, 0), (length, .002, height), insulation)
radius = .0725
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius-.001, depth=.02, location=(0, front_y, .025), rotation=(math.pi/2, 0, 0))
cutter = bpy.context.object
modifier = face.modifiers.new('Foro dello stacco', 'BOOLEAN')
modifier.operation = 'DIFFERENCE'; modifier.object = cutter
bpy.context.view_layer.objects.active = face
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.data.objects.remove(cutter, do_unlink=True)

# Tube mesh: open at both ends with an annular lip, not a capped cylinder.
vertices, faces = [], []
for y, r in ((front_y, radius), (front_y-.08, radius), (front_y-.08, radius-.0015), (front_y, radius-.0015)):
    for i in range(64):
        a = 2*math.pi*i/64
        vertices.append((r*math.cos(a), y, .025+r*math.sin(a)))
for j in range(3):
    for i in range(64): faces.append((j*64+i, j*64+(i+1)%64, (j+1)*64+(i+1)%64, (j+1)*64+i))
mesh = bpy.data.meshes.new('Stacco cavo'); mesh.from_pydata(vertices, [], faces); mesh.update()
obj = bpy.data.objects.new('Stacco aperto diametro 145', mesh); coll.objects.link(obj); obj.data.materials.append(galvanized)
for p in mesh.polygons: p.use_smooth = True

box('Sede diffusore scura', (0, 0, -height/2+.004), (length-.006, thickness-.005, .008), interior)
for y in (-.025, .025): box('Profilo uscita', (0, y, -height/2), (length, .003, .012), galvanized)
for x in (-.47, .47): box('Chiusura terminale', (x, 0, -height/2), (.005, thickness, .012), galvanized)

bpy.ops.object.select_all(action='DESELECT')
for o in coll.objects: o.select_set(True)
bpy.context.view_layer.objects.active = face
out = ROOT / 'public/models/ecoclima/edls-plenum-laterale.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, use_active_scene=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender/edls-plenum-laterale.blend'))
