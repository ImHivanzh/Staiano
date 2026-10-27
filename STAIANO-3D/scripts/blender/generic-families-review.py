"""Review scenes: generic families as src/configurator/viewer3d draws them, for photo comparison.

Run inside the live Blender (MCP): each family gets its own scene, the open one is untouched.
Dimensions and primitives mirror device-detail.ts, FanCoilMeshes.tsx, DeviceMeshes.tsx (SplitMesh)
and OutdoorCabinet.tsx. Renders go to output/verifiche-realismo/generic-<family>.png.
Axes: x width, y depth (front at -y), z height.
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/verifiche-realismo"
OUT.mkdir(parents=True, exist_ok=True)
MATS = {}


def mat(name, rgb, rough=0.4, metal=0.0):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Base Color"].default_value = (*rgb, 1)
        p.inputs["Roughness"].default_value = rough
        p.inputs["Metallic"].default_value = metal
        MATS[name] = m
    return MATS[name]


def put(obj, m):
    obj.data.materials.append(m)
    return obj


def box(loc, dims, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width, b.segments = min(bevel, min(dims) / 2.2), 4
        bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.ops.object.shade_smooth()
    return put(o, m)


def cyl(loc, r, length, axis, m, scale_y=1.0, verts=32):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=loc, rotation=rot)
    o = bpy.context.active_object
    if scale_y != 1.0:
        o.scale[1 if axis != "Y" else 0] = scale_y
    bpy.ops.object.shade_smooth()
    return put(o, m)


def new_scene(name):
    sc = bpy.data.scenes.new(name)
    bpy.context.window.scene = sc
    return sc


def render(sc, name, center, ortho, cam_off=(0.5, -3, 0.3), res=(1100, 800)):
    from mathutils import Vector
    c = Vector(center)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", ortho
    cam.location = c + Vector(cam_off)
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    for n, off, power in (("K", (-1.5, -2.5, 2.5), 900), ("F", (2, -2, 0.6), 300)):
        d = bpy.data.lights.new(n, "AREA")
        d.energy, d.size = power, 2
        l = bpy.data.objects.new(n, d)
        sc.collection.objects.link(l)
        l.location = c + Vector(off)
        l.rotation_euler = (c - l.location).to_track_quat("-Z", "Y").to_euler()
    sc.world = bpy.data.worlds.new(name)
    sc.world.color = (0.62, 0.63, 0.65)
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = str(OUT / f"generic-{name}.png")
    bpy.context.window.scene = sc
    bpy.ops.render.render(write_still=True)


white = mat("Bianco", (0.93, 0.93, 0.9), 0.3, 0.1)
grey = mat("Griglia grigia", (0.45, 0.46, 0.47), 0.5)
dark = mat("Scuro", (0.06, 0.07, 0.07), 0.8)
anthracite = mat("Antracite", (0.12, 0.12, 0.13), 0.35)
alu = mat("Alluminio", (0.7, 0.72, 0.74), 0.3, 0.8)
rubber = mat("Gomma", (0.1, 0.1, 0.1), 0.9)


def fcz_cabinet(variant):
    """Aermec FCZ with cabinet. A = app (rounded box + 6 longitudinal bars); B = grey top grille + cylinder feet."""
    sc = new_scene(f"FCZ mobile {variant}")
    w, h, d = 1.0, 0.60, 0.22
    foot = 0.07 if variant == "B" else 0
    box((0, 0, foot + (h - foot) / 2), (w, d, h - foot), white, 0.055)
    top_m = grey if variant == "B" else white
    for i in range(6):
        y = d * (-0.26 + i * 0.104)
        box((0, y, h + 0.0015), (w * 0.86, d * 0.035, 0.003), top_m)
    if variant == "B":
        box((0, 0, h - 0.004), (w * 0.98, d * 0.98, 0.012), grey, 0.02)
        for s in (-1, 1):
            cyl((s * w * 0.42, 0, foot / 2), 0.045, foot, "Z", grey, scale_y=1.4)
    render(sc, f"fcz-mobile-{variant}", (0, 0, h / 2), 1.3, (0.9, -3, 0.5))


def split_wall(variant):
    """Daikin Perfera-type wall split 0.9 x 0.29 x 0.21 m. A = app (rounded box, 18 fins, recess, flap)."""
    sc = new_scene(f"Split {variant}")
    w, h, d = 0.90, 0.29, 0.21
    box((0, 0, 0), (w, d, h), white, 0.025)
    box((0, -d / 2 - 0.0002, -h * 0.31), (w * 0.89, 0.001, h * 0.18), dark, 0.01)
    for i in range(18):
        box(((-0.42 + i * 0.84 / 17) * w, -d / 2 - 0.0015, -h * 0.32), (0.003, 0.002, h * 0.16), alu)
    flap = box((0, -d / 2 - 0.0015, -h * 0.405), (w * 0.88, d * 0.025, h * 0.035), white, 0.004)
    flap.rotation_euler[0] = 0.18
    if variant == "B":  # photo: curved lower edge, display disc on the right, flap visible below the panel
        box((w * 0.35, -d / 2 - 0.002, -h * 0.2), (0.03, 0.002, 0.03), mat("Display", (0.5, 0.55, 0.62), 0.3))
    render(sc, f"split-{variant}", (0, 0, 0), 1.2, (0.6, -3, 0.2))


def outdoor_unit(variant):
    """Daikin 3M-type outdoor/heat pump 0.78 x 0.62 x 0.30 m with OutdoorCabinet.tsx parts."""
    sc = new_scene(f"Esterna {variant}")
    w, h, d = 0.78, 0.62, 0.30
    foot = min(0.03, h * 0.1)
    box((0, 0, foot + (h - foot) / 2), (w, d, h - foot), white, 0.01)
    fan = (-w * 0.18, -d / 2 - 0.002, foot + (h - foot) / 2)
    r = min(w * 0.28, h * 0.34)
    cyl(fan, r, 0.004, "Y", dark)
    for i in range(5):
        a = i * math.tau / 5
        blade = box((fan[0] + math.cos(a) * r * 0.5, fan[1] - 0.003, fan[2] + math.sin(a) * r * 0.5),
                    (r * 0.55, 0.003, r * 0.22), grey)
        blade.rotation_euler[1] = -a
    for s in (-1, 1):
        box((s * w * 0.32, 0, foot / 2), (min(0.08, w * 0.2), d, foot), rubber)
    if variant == "B":  # photo: grille bars over the whole front opening, side louvre panel
        for i in range(24):
            box((-w * 0.1, -d / 2 - 0.004, foot + 0.02 + i * (h - foot - 0.04) / 23), (w * 0.72, 0.004, 0.006), white)
        for i in range(16):
            box((w / 2 + 0.0005, 0, foot + 0.04 + i * (h - foot - 0.08) / 15), (0.001, d * 0.78, 0.008), dark)
    render(sc, f"outdoor-{variant}", (0, 0, h / 2), 1.1, (0.7, -3, 0.3))


def sanremo_towel():
    """Lazzarini Sanremo 500 x 1230 x 45: rectangular collectors, 25 bars in two groups (device-detail.ts)."""
    sc = new_scene("Sanremo")
    w, h, d = 0.55, 1.23, 0.045
    for s in (-1, 1):
        box((s * (w / 2 - 0.025), 0, h / 2), (0.04, 0.03, h), white, 0.008)
    bars = 25
    groups = [math.ceil(bars * 0.65), bars - math.ceil(bars * 0.65)]
    gap, tr = min(0.09, h * 0.09), 0.011
    spacing = (h - 0.05 - tr * 2 - gap) / (bars - 1)
    k = 0
    for gi, n in enumerate(groups):
        for _ in range(n):
            z = 0.025 + tr + k * spacing + gi * gap
            cyl((0, 0, z), tr, w - 2 * tr, "X", white)
            k += 1
    render(sc, "sanremo", (0, 0, h / 2), 1.5, (0, -3, 0), (800, 1100))


def charleston():
    """Zehnder Charleston 2 columns 300 x 1000 x 63: thin vertical tubes (r 12.5 mm) + welded heads."""
    sc = new_scene("Charleston")
    w, h, d, count, columns = 0.50, 1.00, 0.063, 10, 2
    pitch, r = 0.05, 0.0125
    for i in range(count):
        x = (i - (count - 1) / 2) * pitch
        for j in range(columns):
            z = -d / 2 + r + j * (d - 2 * r)
            cyl((x, z, h / 2), r, h - 2 * r, "Z", mat("Charleston", (0.4, 0.4, 0.42), 0.35, 0.5))
        for zz in (0.0225, h - 0.0225):
            box((x, 0, zz), (pitch * 0.78, d, 0.045), mat("Charleston", (0.4, 0.4, 0.42), 0.35, 0.5))
    render(sc, "charleston", (0, 0, h / 2), 1.3, (0, -3, 0), (700, 1000))


def oscar_tondo():
    """Global OSCAR TONDO: flat 16 mm fronts + cylinder heads (device-detail.ts), 8 elements 600 mm."""
    sc = new_scene("OSCAR TONDO")
    count, pitch, h, d = 8, 0.08, 0.946, 0.095
    head = min(0.04, h * 0.08)
    for i in range(count):
        x = (i - (count - 1) / 2) * pitch
        box((x, -d / 2 + 0.008, h / 2), (pitch - 0.0015, 0.016, h - head), white, 0.003)
        for zz in (head / 2, h - head / 2):
            cyl((x, 0, zz), pitch / 2 - 0.001, head, "Y", white, scale_y=0.8)
        for s in (-1, 1):
            box((x + s * pitch * 0.3, 0.004, h / 2), (0.003, d - 0.008, h - head * 2), white)
    render(sc, "oscar-tondo", (0, 0, h / 2), 1.3, (0.2, -3, 0), (700, 1000))


def ecoclima_swirl():
    """Ecoclima EDE1 swirl diffuser 600 x 600 as terminal-detail.ts: radial slots on two staggered rings."""
    sc = new_scene("Ecoclima EDE1")
    side = 0.6
    box((0, 0, 0), (side, 0.012, side), white, 0.003)
    for count, radius, length, offset in ((16, 0.36, 0.16, 0), (12, 0.2, 0.12, 0.5)):
        for i in range(count):
            a = (i + offset) * math.tau / count
            o = box((math.cos(a) * side * radius, -0.007, math.sin(a) * side * radius),
                    (side * 0.03, 0.004, side * length), dark)
            o.rotation_euler[1] = -(a - math.pi / 2)
    render(sc, "ecoclima-ede1", (0, 0, 0), 0.8, (0, -3, 0), (800, 800))


def ecoclima_eggcrate():
    """Ecoclima EGQR grid as terminal-detail.ts: frame, 16 horizontal slats and 16 vertical bars."""
    sc = new_scene("Ecoclima EGQ")
    w, h, t = 0.6, 0.3, 0.012
    box((0, 0, 0), (w, 0.01, h), dark)
    for fx, fz, sx, sz in ((0, h / 2 - t / 2, w, t), (0, -h / 2 + t / 2, w, t), (-w / 2 + t / 2, 0, t, h), (w / 2 - t / 2, 0, t, h)):
        box((fx, -0.008, fz), (sx, 0.008, sz), white)
    n = min(32, max(3, round(h / 0.018)))
    for i in range(1, n):
        box((0, -0.008, (i / n - 0.5) * (h - 2 * t)), (w - 2 * t, 0.004, min(0.004, h / n * 0.3)), white)
    cols = min(32, max(3, round(w / 0.025)))
    for i in range(1, cols):
        box(((i / cols - 0.5) * (w - 2 * t), -0.008, 0), (0.003, 0.004, h - 2 * t), white)
    render(sc, "ecoclima-egq", (0, 0, 0), 0.8, (0.2, -3, 0.1), (900, 600))


for fn, args in ((fcz_cabinet, ("A",)), (fcz_cabinet, ("B",)), (split_wall, ("A",)), (outdoor_unit, ("A",)),
                 (outdoor_unit, ("B",)), (sanremo_towel, ()), (charleston, ()), (oscar_tondo, ()),
                 (ecoclima_swirl, ()), (ecoclima_eggcrate, ())):
    fn(*args)
