"""Global Radiatori VIP 600, ten 80 mm elements, after the manufacturer photos.

Each element is a die-cast aluminum section: flat front panel with a chamfered
top edge, overhanging lip, cast top pocket (closed at both ends), rounded bottom
header, side valve and air vent.

Run:  blender -b --python scripts/blender/global-vip-realistic.py
"""
from pathlib import Path
import math

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
MODEL = "vip"
ELEMENTS = 10
HEIGHT = 0.600
PITCH = 0.080
GAP = 0.003
ELEMENT_W = PITCH - GAP
DEPTH = 0.097
FRONT, BACK = -DEPTH / 2.0, DEPTH / 2.0


def profile():
    """Outer silhouette (y, z) of one element; the pocket is cut afterwards."""
    h = HEIGHT
    return [
        (FRONT, 0.0520),
        (FRONT, h - 0.0520),
        (FRONT + 0.0090, h - 0.0440),
        (FRONT + 0.0090, h - 0.0100),
        (FRONT + 0.0025, h - 0.0015),
        (-0.0120, h),
        (0.0410, h),
        (0.0470, h - 0.0050),
        (BACK, h - 0.0150),
        (BACK, 0.0520),
        (0.0470, 0.0100),
        (0.0420, 0.0020),
        (0.0380, 0.0000),
        (-0.0380, 0.0000),
        (-0.0420, 0.0020),
        (-0.0470, 0.0100),
    ]


def trough():
    """Closed cutter silhouette of the top pocket, open on top, closed at the ends."""
    h = HEIGHT
    return [
        (-0.0220, h - 0.0640),
        (-0.0220, h - 0.0150),
        (-0.0160, h - 0.0110),
        (-0.0160, h + 0.0200),
        (0.0160, h + 0.0200),
        (0.0160, h - 0.0630),
        (0.0120, h - 0.0660),
        (-0.0180, h - 0.0660),
    ]


def prism(name, points, x0, x1):
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x0, y, z)) for y, z in points])
    moved = [g for g in bmesh.ops.extrude_face_region(bm, geom=[face])["geom"]
             if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def bevel(obj, width, segments=2, angle=35.0):
    mod = obj.modifiers.new("Raggi", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(20))
    obj.select_set(False)


def cylinder(name, radius, depth, location, axis="X", vertices=32):
    rotation = {"X": (0, math.pi / 2, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return obj


def material(name, color, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Global VIP 600"
scene.unit_settings.system = "METRIC"

white = material("Bianco RAL 9010", (0.86, 0.855, 0.83), 0.30)
chrome = material("Cromo", (0.80, 0.81, 0.82), 0.07, 1.0)
brass = material("Ottone", (0.72, 0.55, 0.28), 0.28, 1.0)
rubber = material("Gomma NBR", (0.02, 0.02, 0.02), 0.55)
dark = material("Sede", (0.03, 0.03, 0.03), 0.60)

width = ELEMENTS * PITCH - GAP
elements = []
for i in range(ELEMENTS):
    xc = (i - (ELEMENTS - 1) / 2.0) * PITCH
    x0, x1 = xc - ELEMENT_W / 2.0, xc + ELEMENT_W / 2.0
    body = prism(f"Elemento {i + 1:02d}", profile(), x0, x1)
    bevel(body, 0.0008)
    cutter = prism("_tasca", trough(), x0 + 0.0035, x1 - 0.0035)
    bevel(cutter, 0.0008, segments=2, angle=25)
    mod = body.modifiers.new("Tasca", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    bevel(body, 0.00025, segments=2, angle=30)
    body.data.materials.append(white)
    elements.append(body)

bpy.ops.object.select_all(action="DESELECT")
for obj in elements:
    obj.select_set(True)
bpy.context.view_layer.objects.active = elements[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = "Corpo radiante"

# valve: cast boss, gasket, chrome hex, brass body, white knob with hex socket
x_end, y, z = -width / 2.0, -0.020, 0.062
parts = [
    (cylinder("Raccordo valvola", 0.030, 0.022, (x_end - 0.011, y, z), vertices=64), white),
    (cylinder("Ghiera raccordo", 0.024, 0.010, (x_end - 0.026, y, z), vertices=64), white),
    (cylinder("Guarnizione", 0.014, 0.005, (x_end - 0.033, y, z), vertices=48), rubber),
    (cylinder("Dado cromato", 0.020, 0.014, (x_end - 0.043, y, z), vertices=6), chrome),
    (cylinder("Corpo valvola", 0.0125, 0.012, (x_end - 0.056, y, z), vertices=6), brass),
    (cylinder("Volantino", 0.024, 0.030, (x_end - 0.078, y, z), vertices=64), white),
    (cylinder("Sede esagono", 0.0095, 0.008, (x_end - 0.090, y, z), vertices=6), dark),
]
for obj, mat in parts:
    obj.data.materials.append(mat)

vent = cylinder("Sfiato aria", 0.010, 0.016, (x_end + 0.050, 0.030, HEIGHT - 0.012), "Z")
vent_cap = cylinder("Tappo sfiato", 0.0125, 0.005, (x_end + 0.050, 0.030, HEIGHT - 0.0025), "Z")
plug = cylinder("Tappo cieco", 0.0195, 0.010, (width / 2.0 + 0.003, -0.020, 0.062), vertices=48)
for obj in (vent, vent_cap, plug):
    obj.data.materials.append(white)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(ROOT / "public/models/hvac/global-vip-realistic.glb"),
                          export_format="GLB", use_selection=True, use_active_scene=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "assets/blender/global-vip-realistic.blend"))
