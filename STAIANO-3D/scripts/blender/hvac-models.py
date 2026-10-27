"""Create editable visual approximations from the cited manufacturers' catalogues.

Run inside Blender, in an otherwise empty temporary scene. Units are metres.
"""
import bpy
import math
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "models", "hvac")
os.makedirs(OUT, exist_ok=True)
scene = bpy.data.scenes.new("Modelli_HVAC")
bpy.context.window.scene = scene


def material(name, color, metallic=0, roughness=.55):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    return m


white = material("Vernice bianca", (.82, .83, .82), .15)
metal = material("Lamiera zincata", (.48, .52, .53), .7, .4)
black = material("Interno", (.035, .04, .045), .05, .75)
copper = material("Raccordi", (.58, .34, .15), .7, .4)
filter_mat = material("Filtro", (.48, .50, .49), 0, .95)


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


def add_box(c, name, loc, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for old in list(obj.users_collection): old.objects.unlink(obj)
    c.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Bordi arrotondati", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return obj


def add_cylinder(c, name, loc, radius, depth, mat, axis="Y"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    if axis == "Y": obj.rotation_euler.x = math.pi / 2
    if axis == "X": obj.rotation_euler.y = math.pi / 2
    for old in list(obj.users_collection): old.objects.unlink(obj)
    c.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def export(c, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in c.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(c.objects))
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"), export_format="GLB", use_selection=True, use_active_scene=True)
    c.hide_render = True
    c.hide_viewport = True


def frame(c, prefix, width, height, border, y, mat):
    for side in (-1, 1):
        add_box(c, prefix, (0, y, side * (height - border) / 2), (width, .006, border), mat)
        add_box(c, prefix, (side * (width - border) / 2, y, 0), (border, .006, height - 2 * border), mat)


def perforated(c, width, height, y):
    # Hexagonal staggered 5 mm circular holes at 7 mm pitch in a single mesh.
    verts, faces = [], []
    pitch = .007
    rows = int(height / (pitch * math.sqrt(3) / 2))
    cols = int(width / pitch)
    for row in range(rows):
        z = (row - (rows - 1) / 2) * pitch * math.sqrt(3) / 2
        for col in range(cols - 1):
            x = (col - (cols - 2) / 2 + (row % 2) * .5) * pitch
            start = len(verts)
            for radius in (.0025, pitch * .49):
                for k in range(6):
                    a = k * math.pi / 3
                    verts.append((x + radius * math.cos(a), y, z + radius * math.sin(a)))
            for k in range(6): faces.append((start+k, start+(k+1)%6, start+6+(k+1)%6, start+6+k))
    mesh = bpy.data.meshes.new("Lamiera forata 5 mm")
    mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new("Pannello forato", mesh); c.objects.link(obj); obj.data.materials.append(white)


for family in ("ega6", "ebl", "egf", "egf-push"):
    c = collection(family.upper())
    frame(c, "Cornice", .6, .4, .025, -.021, white)
    add_box(c, "Filtro" if family in ("ega6", "egf-push") else "Interno", (0, .012, 0), (.55, .012, .35), filter_mat if family in ("ega6", "egf-push") else black)
    if family.startswith("egf"):
        perforated(c, .54, .34, -.024)
    else:
        for i in range(13 if family == "ega6" else 22):
            z = -.17 + i * (.34 / (12 if family == "ega6" else 21))
            o = add_box(c, "Aletta", (0, -.023, z), (.55, .012, .004), white)
            if family == "ega6": o.rotation_euler.x = math.radians(45)
    export(c, family)


c = collection("INNOVA SLI")
add_box(c, "Corpo incasso", (0, 0, 0), (.925, .126, .576), metal, .003)
add_box(c, "Pannello frontale", (0, -.065, 0), (.85, .004, .38), white)
for z in (-.23, .23):
    add_box(c, "Apertura aria", (0, -.066, z), (.85, .004, .065), black)
    for i in range(4): add_box(c, "Aletta", (0, -.069, z + (i - 1.5) * .014), (.85, .004, .003), white)
export(c, "innova-sli")

c = collection("AERMEC FCZ P PO")
add_box(c, "Corpo lamiera", (0, 0, 0), (1.0, .216, .558), metal, .003)
add_box(c, "Batteria", (0, -.109, .03), (.79, .005, .32), black)
for i in range(30): add_box(c, "Alette batteria", (0, -.112, -.12 + i*.010), (.79, .003, .002), metal)
for z in (-.16, .15): add_cylinder(c, "Attacco idraulico", (-.51, 0, z), .016, .035, copper, "X")
for x in (-.44, .44): add_box(c, "Staffa", (x, 0, -.29), (.08, .15, .015), metal)
export(c, "aermec-fcz-p-po")

c = collection("INNOVA OSMO SL")
add_box(c, "Mantello", (0, 0, 0), (1.08, .119, .58), white, .015)
add_box(c, "Griglia superiore", (0, 0, .292), (.95, .085, .003), black)
for i in range(28): add_box(c, "Aletta superiore", (-.46 + i*.034, 0, .294), (.003, .085, .003), white)
add_box(c, "Fessura ripresa inferiore", (0, -.060, -.26), (.93, .003, .025), black)
export(c, "innova-osmo-sl")

c = collection("PLENUM tre stacchi")
add_box(c, "Corpo plenum", (0, 0, 0), (.8, .3, .25), metal, .002)
for x in (-.24, 0, .24):
    add_cylinder(c, "Stacco", (x, -.19, 0), .08, .08, metal)
export(c, "plenum-3-stacchi")

# Save the generated scene without copying unrelated objects from the open file.
for c in scene.collection.children:
    c.hide_viewport = False
    c.hide_render = False
bpy.data.libraries.write(os.path.join(ROOT, "assets", "blender", "modelli-hvac.blend"), {scene}, fake_user=True)
bpy.context.window.scene = bpy.data.scenes.get("Scene") or bpy.context.window.scene
