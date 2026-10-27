"""Global Radiatori VIP and OSCAR: one die-cast element, sized for the Staiano viewer.

The viewer tiles the element (pitch 80 mm), stretches only the plain middle of the
front panel to the catalogue height and adds valves, lockshield, pipe covers and
air vent itself (finishes come from the project). The exported GLB therefore holds a
single bare element, centred on the origin, front towards +Z, depth 95 mm like the
catalogue. The .blend adds a ten-element review assembly with the same hardware.

Reference heights are the catalogue overall heights (VIP 600 = 690 mm, OSCAR 1200 =
1246 mm). Keep BOTTOM_FIXED / TOP_FIXED equal to src/domain/catalogs/global-sections.ts.

Run:  blender -b --python scripts/blender/global-radiators.py -- vip|oscar
"""
from pathlib import Path
import math
import sys

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
MODEL = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "vip"
PITCH, GAP, DEPTH = 0.080, 0.002, 0.095
ELEMENT_W = PITCH - GAP
FRONT, BACK = -DEPTH / 2.0, DEPTH / 2.0
BOTTOM_FIXED, TOP_FIXED = 0.055, 0.085  # untouched end zones, metres
SPEC = {
    "vip": {"height": 0.690, "interaxis": 0.600, "title": "Global VIP 600"},
    "oscar": {"height": 1.246, "interaxis": 1.200, "title": "Global OSCAR 1200"},
}[MODEL]
HEIGHT = SPEC["height"]


def profile():
    """Outer silhouette (y, z) of one element; the pocket is cut afterwards."""
    h = HEIGHT
    soft = MODEL == "oscar"
    return [
        (FRONT, 0.0520),
        (FRONT, h - 0.0520),
        (FRONT + (0.0070 if soft else 0.0090), h - 0.0440),
        (FRONT + (0.0095 if soft else 0.0090), h - 0.0100),
        (FRONT + (0.0030 if soft else 0.0025), h - 0.0015),
        (-0.0120, h),
        (0.0400, h),
        (0.0460, h - 0.0050),
        (BACK, h - 0.0150),
        (BACK, 0.0520),
        (0.0460, 0.0100),
        (0.0410, 0.0020),
        (0.0370, 0.0000),
        (-0.0370, 0.0000),
        (-0.0410, 0.0020),
        (-0.0460, 0.0100),
    ]


def trough():
    """Closed cutter of the top pocket, open on top: flat-bottomed (VIP) or V (OSCAR)."""
    h = HEIGHT
    if MODEL == "oscar":
        return [(-0.0270, h + 0.0200), (-0.0270, h), (-0.0060, h - 0.0720),
                (0.0140, h), (0.0140, h + 0.0200)]
    return [(-0.0220, h - 0.0640), (-0.0220, h - 0.0150), (-0.0160, h - 0.0110),
            (-0.0160, h + 0.0200), (0.0160, h + 0.0200), (0.0160, h - 0.0630),
            (0.0120, h - 0.0660), (-0.0180, h - 0.0660)]


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
    mod.width, mod.segments = width, segments
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
scene.name = SPEC["title"]
scene.unit_settings.system = "METRIC"

white = material("Bianco RAL 9010", (0.86, 0.855, 0.83), 0.30)
chrome = material("Cromo", (0.80, 0.81, 0.82), 0.07, 1.0)
brass = material("Ottone", (0.72, 0.55, 0.28), 0.28, 1.0)

# --- one element, centred on the origin, exported alone --------------------------
element = prism("Elemento", profile(), -ELEMENT_W / 2.0, ELEMENT_W / 2.0)
bevel(element, 0.0008)
cutter = prism("_tasca", trough(), -ELEMENT_W / 2.0 + 0.0035, ELEMENT_W / 2.0 - 0.0035)
bevel(cutter, 0.0008, segments=2, angle=25)
mod = element.modifiers.new("Tasca", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
bpy.context.view_layer.objects.active = element
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cutter, do_unlink=True)
bevel(element, 0.00025, segments=2, angle=30)
element.data.materials.append(white)
for vertex in element.data.vertices:
    vertex.co.z -= HEIGHT / 2.0
element.location = (0, 0, 0)

bpy.ops.object.select_all(action="DESELECT")
element.select_set(True)
bpy.context.view_layer.objects.active = element
bpy.ops.export_scene.gltf(filepath=str(ROOT / f"public/models/hvac/global-{MODEL}-section.glb"),
                          export_format="GLB", use_selection=True, use_active_scene=True)

# --- review assembly: ten elements at the reference height ---------------------------
ELEMENTS = 10
review = bpy.data.collections.new("Anteprima 10 elementi")
scene.collection.children.link(review)
for i in range(ELEMENTS):
    copy = element.copy()
    copy.data = element.data
    copy.name = f"Elemento {i + 1:02d}"
    copy.location = ((i - (ELEMENTS - 1) / 2.0) * PITCH, 0, 0)
    review.objects.link(copy)
element.hide_render = element.hide_viewport = True
width = ELEMENTS * PITCH
conn_z, conn_y = -SPEC["interaxis"] / 2.0, DEPTH / 2.0 - 0.0325  # glTF +Z is Blender -Y
for side in (-1, 1):  # bottom valve and lockshield, side connection, brass body, white wheel
    x = side * width / 2.0
    for obj, mat in (
        (cylinder("Raccordo", 0.016, 0.012, (x + side * 0.006, conn_y, conn_z), vertices=48), white),
        (cylinder("Corpo valvola", 0.0125, 0.030, (x + side * 0.027, conn_y, conn_z), vertices=6), brass),
        (cylinder("Volantino", 0.020, 0.018, (x + side * 0.051, conn_y, conn_z), vertices=48), white),
        (cylinder("Tubo", 0.011, 0.060, (x + side * 0.027, conn_y, conn_z - 0.045), "Z"), chrome),
    ):
        obj.data.materials.append(mat)
        review.objects.link(obj)
        bpy.context.collection.objects.unlink(obj)
vent = cylinder("Sfiato aria", 0.010, 0.016, (width / 2.0 - 0.040, 0.0, HEIGHT / 2.0 + 0.004), "Z")
vent.data.materials.append(white)
review.objects.link(vent)
bpy.context.collection.objects.unlink(vent)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / f"assets/blender/global-{MODEL}-realistic.blend"))
