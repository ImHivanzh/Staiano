"""Review scene: Cordivari generic towel rail as drawn by device-detail.ts (A) and revised (B).

Run inside the live Blender (MCP): creates its own scene, leaves the open one untouched
Renders output/verifiche-realismo/generic-towel-{A,B}.png. Claudia Elite 763 x 450 x 40 mm.
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/verifiche-realismo"
OUT.mkdir(parents=True, exist_ok=True)
W, H, D = 0.450, 0.763, 0.040


def mat(name, color, rough=0.4):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def cyl(name, r, length, loc, axis, scale_z=1.0, m=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=length, location=loc,
                                        rotation=(0, math.pi / 2, 0) if axis == "X" else (0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.scale.y = scale_z if axis == "X" else 1
    if axis == "Z":
        o.scale.y = scale_z
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def build(variant, x0):
    m = mat("Antracite", (0.12, 0.12, 0.13), 0.35)
    r = min(D * 0.22, W * 0.025, 0.018)
    bars = max(4, round(H / 0.055))
    if variant == "A":
        col_r, col_depth = r, 1.0
        bands = [bars]
        gap = 0
    else:  # flat collectors (25 x 40 mm section), bars in bands as in the photo
        col_r, col_depth = 0.0125, D / 2 / 0.0125 * 0.9
        bands = [bars // 3 + (1 if i < bars % 3 else 0) for i in range(3)]
        gap = 0.030
    col_x = W / 2 - col_r
    for s in (-1, 1):
        cyl(f"Coll{variant}", col_r, H, (x0 + s * col_x, 0, 0), "Z", col_depth, m)
    bar_r = r * 0.7
    span = H - 2 * r * 2 - gap * (len(bands) - 1)
    pitch = span / (bars - 1)
    k = 0
    for gi, n in enumerate(bands):
        for _ in range(n):
            z = -H / 2 + r * 2 + k * pitch + gi * gap - (0 if variant == "A" else 0)
            cyl(f"Barra{variant}", bar_r, W - 2 * col_r, (x0, 0, z - H / 2 + H / 2), "X", 1.0, m)
            k += 1


scene = bpy.data.scenes.new('Review scaldasalviette generico')
bpy.context.window.scene = scene
build("A", -0.35)
build("B", 0.35)
cam = bpy.data.cameras.new("c")
cam.type = "ORTHO"
cam.ortho_scale = 1.1
co = bpy.data.objects.new("c", cam)
scene.collection.objects.link(co)
co.location = (0, -2, 0)
co.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = co
sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN"))
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)
scene.world = bpy.data.worlds.new("w")
scene.world.color = (0.8, 0.8, 0.8)
sc = scene
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
sc.render.filepath = str(OUT / "generic-towel-AB.png")
bpy.ops.render.render(write_still=True)
