"""Ecoclima rectangular grilles and linear slot diffusers, one GLB per catalog variant (real scale, metres).

Archetypes (shapes from the manufacturer photos in public/catalog/, quotas not published by the maker
are reconstructed from them): "double" (EBA, EBV, EBIA, EBCV: front vertical + rear horizontal blades),
"bars" (EBL*: fixed horizontal bars), "slats" (EGA*, EGZ*, ETA, EGS, EAG*, EDC*: inclined slats),
"mesh" (EGQ*: square egg-crate), "perf" (EGFR, EGFF, EAGF, EGA-ONE: perforated plate, texture-tiled holes),
"round" (EAG-AL, EAG-INOX: circular frame with clipped slats), "floor" (EBP*: walkable bar grille), "nozzle" (EDMP*, EDMF: panel with rows of micro-nozzles),
"linear" (EDLH, EDLSV: slot diffusers, built 1000 mm long and scaled along x by the app, the section is constant). Blade/bar/hole pitch is real, so counts follow the size.
The outer size is the face the app draws (faceWidthMm/faceHeightMm, else widthMm/heightMm or the nominal
diameter, as in src/domain/air-terminals/geometry.ts terminalFaceDimensions) and the file is named after the
variant id, which is the productId of the project item.
Face on Blender y 0, body toward +y (glTF +Z is the face). Materials named "Profile*" take the finish
chosen in the app; "Interno", "Filtro" stay fixed.
Output: public/models/ecoclima/<family>/<variant id>.glb; the .blend keeps one variant per family.
Run: `blender -b -P scripts/blender/ecoclima-grilles.py` (glTF export does not work through the MCP).
"""
from pathlib import Path
import json
import math
import os
import bpy

ROOT = Path(__file__).resolve().parents[2]
MM = .001

# frame: visible flange width; flange: its thickness (0 = frameless); ret: return wall thickness; depth: body depth (mm)
SPECS = {
    "EBA": dict(kind="double", frame=14, flange=3, ret=2, depth=46, front=(5, 26, 4), rear=(3, 16, 30), pitch=20),
    "EBV": dict(kind="double", frame=18, flange=2, ret=1.5, depth=40, front=(2.5, 18, 3), rear=(2.5, 14, 24), pitch=20),
    "EBCV": dict(kind="double", frame=18, flange=2, ret=1.5, depth=40, front=(2.5, 18, 3), rear=(2.5, 14, 24), pitch=20, curved=True),
    "EBIA": dict(kind="double", frame=20, flange=3, ret=2, depth=60, front=(4, 32, 4), rear=(4, 22, 38), pitch=40),
    "EBLF": dict(kind="bars", frame=3, flange=0, ret=3, depth=40, bar=(3, 25), pitch=12),
    "EBLR": dict(kind="bars", frame=10, flange=2, ret=2, depth=30, bar=(2, 20), pitch=12),
    "EBLS": dict(kind="bars", frame=18, flange=3, ret=2, depth=40, bar=(2, 18), pitch=12, perf_frame=True),
    "EBL3": dict(kind="bars", frame=15, flange=3, ret=2, depth=45, bar=(2, 24), pitch=12, tilt=20, filter=True),
    "EGA": dict(kind="slats", frame=18, flange=3, ret=1.5, pitch=25, chord=28, angle=45, thick=1.5),
    "EGA1-4": dict(kind="slats", frame=18, flange=3, ret=1.5, pitch=25, chord=28, angle=45, thick=1.5, filter=True),
    "EGA50": dict(kind="slats", frame=20, flange=3, ret=2, pitch=50, chord=57, angle=35, thick=2),
    "EGA50-3F": dict(kind="slats", frame=20, flange=3, ret=2, pitch=50, chord=57, angle=35, thick=2, filter=True),
    "EGA50-3S": dict(kind="slats", frame=20, flange=3, ret=2, pitch=50, chord=57, angle=35, thick=2),
    "EGZ50": dict(kind="slats", frame=20, flange=3, ret=2, pitch=50, chord=55, angle=40, thick=1.5),
    "EGZ100": dict(kind="slats", frame=20, flange=3, ret=2, pitch=100, chord=105, angle=35, thick=1.5),
    "ETA": dict(kind="slats", frame=12, flange=2, ret=1.5, pitch=20, chord=28, angle=50, thick=1.5),
    "EGS": dict(kind="slats", frame=10, flange=1, ret=1, pitch=10, chord=12, angle=35, thick=1, rib=True),
    "EAG-AL": dict(kind="round", frame=10, flange=2, ret=1.5, pitch=16, chord=18, angle=35, thick=1.5),
    "EAG-INOX": dict(kind="round", frame=8, flange=2, ret=1.5, pitch=16, chord=18, angle=35, thick=1.5),
    "EDLH": dict(kind="linear", frame=0, flange=3, ret=2, depth=60, end=10),
    "EDLSV": dict(kind="linear", frame=0, flange=3, ret=2, depth=90, end=10),
    "EAG": dict(kind="slats", frame=12, flange=2, ret=1.5, pitch=15, chord=17, angle=35, thick=1.5),
    "EAL": dict(kind="slats", frame=12, flange=2, ret=1.5, pitch=15, chord=17, angle=35, thick=1.5),
    "EDC1": dict(kind="slats", frame=15, flange=3, ret=1.5, pitch=18, chord=20, angle=30, thick=1.5),
    "EGQ": dict(kind="mesh", frame=20, flange=3, ret=2, depth=22, pitch=13, thick=1.5),
    "EGQR": dict(kind="mesh", frame=15, flange=3, ret=2, depth=22, pitch=13, thick=1.5),
    "EGQIF": dict(kind="mesh", frame=2, flange=0, ret=2, depth=26, pitch=13, thick=1.5),
    "EGQ1-4": dict(kind="mesh", frame=20, flange=3, ret=2, depth=40, pitch=13, thick=1.5, filter=True),
    "EGQ-PUSH": dict(kind="mesh", frame=15, flange=3, ret=2, depth=35, pitch=13, thick=1.2, filter=True),
    "EGQR-PUSH": dict(kind="mesh", frame=15, flange=3, ret=2, depth=35, pitch=13, thick=1.2, filter=True),
    "EGFR": dict(kind="perf", frame=15, flange=3, ret=2, depth=20, tile=6, hole=.3),
    "EGFF": dict(kind="perf", frame=3, flange=0, ret=3, depth=35, tile=6, hole=.3),
    "EAGF": dict(kind="perf", frame=12, flange=2, ret=2, depth=15, tile=8, hole=.3),
    "EGA-ONE": dict(kind="perf", frame=8, flange=2, ret=2, depth=15, tile=12, hole=.3, square=True),
    "EGFC": dict(kind="perf", frame=3, flange=0, ret=3, depth=120, tile=6, hole=.3),
    "EDMP-P": dict(kind="nozzle", frame=12, flange=3, ret=2, depth=30, pitch=50, row_pitch=50, r=10),
    "EDMP-C": dict(kind="nozzle", frame=12, flange=3, ret=2, depth=30, pitch=60, row_pitch=60, r=14),
    "EDMF-S": dict(kind="nozzle", frame=15, flange=2, ret=2, depth=30, pitch=30, row_pitch=30, r=7),
    "EBP": dict(kind="floor", frame=20, flange=8, ret=3, depth=22, pitch=12, thick=4),
    "EBP-T": dict(kind="floor", frame=25, flange=8, ret=3, depth=22, pitch=10, thick=3),
}
# EDC1..EDC6 share one photo and one shape
for n in range(2, 7):
    SPECS[f"EDC{n}"] = SPECS["EDC1"]

bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene
scene.name = "Griglie Ecoclima"


def mat(name, rgb, metal, rough):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    return m


PROFILE = mat("Profile metallo", (.72, .74, .74), .55, .42)
DARK = mat("Interno", (.03, .035, .035), .05, .8)
FILTER = mat("Filtro", (.45, .5, .55), 0, .9)


def perf_material(square):
    """Tiled perforation: a staggered pair of dark holes per tile, white plate (the app tints it)."""
    n = 64
    img = bpy.data.images.new("perforazione-quadra" if square else "perforazione", n, n)
    px = []
    for j in range(n):
        for i in range(n):
            u, v = i / n, j / n
            d = min(math.hypot(((u - cu + .5) % 1) - .5, ((v - cv + .5) % 1) - .5) if not square else
                    max(abs(((u - cu + .5) % 1) - .5), abs(((v - cv + .5) % 1) - .5)) for cu, cv in ((.25, .25), (.75, .75)))
            hole = d < (.17 if square else .15)
            px += [.04, .04, .04, 1] if hole else [1, 1, 1, 1]
    img.pixels[:] = px
    img.pack()
    m = mat("Profile perforato", (1, 1, 1), .2, .5)
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    m.node_tree.links.new(tex.outputs["Color"], p.inputs["Base Color"])
    return m


PERF = {False: perf_material(False), True: perf_material(True)}


def solid(c, name, verts, faces, material, uv_tile=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    if uv_tile:
        uv = me.uv_layers.new(name="UVMap")
        for loop in me.loops:
            co = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = (co.x / (uv_tile * MM), co.z / (uv_tile * MM))
    me.update()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    o.data.materials.append(material)
    return o


def box(c, name, x0, x1, y0, y1, z0, z1, material, uv_tile=None):
    """Axis-aligned slab, all quotas in mm: x width, y depth (+ toward the back), z height."""
    v = [(x * MM, y * MM, z * MM) for y in (y0, y1) for z in (z0, z1) for x in (x0, x1)]
    return solid(c, name, v, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)], material, uv_tile)


def prism(c, name, base, x0, x1, material):
    """Polygon base [(y_mm, z_mm)] extruded along x from x0 to x1 (mm); cross-section of tilted bars and slats."""
    n = len(base)
    v = [(x * MM, y * MM, z * MM) for x in (x0, x1) for y, z in base]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return solid(c, name, v, faces, material)


def strip_z(c, name, pts, thick, z0, z1, material):
    """Thin wall following the polyline pts [(x_mm, y_mm)], thick (mm) in x, extruded over z0..z1."""
    outline = pts + [(x - math.copysign(thick, pts[0][0]), y) for x, y in reversed(pts)]
    v = [(x * MM, y * MM, z * MM) for z in (z0, z1) for x, y in outline]
    m = len(outline)
    faces = [tuple(range(m)), tuple(range(2 * m - 1, m - 1, -1))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    return solid(c, name, v, faces, material)


def tilted(cy, cz, half_y, half_z, deg):
    """Rectangle in the y/z plane rotated by deg about its centre."""
    a = math.radians(deg)
    return [(cy + dy * math.cos(a) - dz * math.sin(a), cz + dy * math.sin(a) + dz * math.cos(a))
            for dy, dz in ((-half_y, -half_z), (half_y, -half_z), (half_y, half_z), (-half_y, half_z))]


def positions(span, pitch):
    """Element centres on a regular pitch, centred in the opening."""
    n = max(1, int(span // pitch))
    start = -(n - 1) * pitch / 2
    return [start + i * pitch for i in range(n)]


def frame_and_walls(c, sp, X, Z, depth):
    """Flange (if any) and return walls; returns the opening half sizes."""
    F, T, R = sp["frame"], sp["flange"], sp["ret"]
    ix, iz = X - F, Z - F
    if T:
        m, tile = (PERF[False], 6) if sp.get("perf_frame") else (PROFILE, None)  # EBLS: punched frame (photo)
        box(c, "Profile_cornice", -X, X, 0, T, iz, Z, m, uv_tile=tile)
        box(c, "Profile_cornice", -X, X, 0, T, -Z, -iz, m, uv_tile=tile)
        box(c, "Profile_cornice", -X, -ix, 0, T, -iz, iz, m, uv_tile=tile)
        box(c, "Profile_cornice", ix, X, 0, T, -iz, iz, m, uv_tile=tile)
    wx = ix if T else X - R
    wz = iz if T else Z - R
    box(c, "Profile_ritorno", -wx - R, wx + R, T, depth, wz, wz + R, PROFILE)
    box(c, "Profile_ritorno", -wx - R, wx + R, T, depth, -wz - R, -wz, PROFILE)
    box(c, "Profile_ritorno", -wx - R, -wx, T, depth, -wz, wz, PROFILE)
    box(c, "Profile_ritorno", wx, wx + R, T, depth, -wz, wz, PROFILE)
    return ix, iz


def back(c, sp, ix, iz, depth):
    box(c, "Interno", -ix, ix, depth + 1, depth + 2, -iz, iz, DARK)
    if sp.get("filter"):
        box(c, "Filtro", -ix, ix, depth - 4, depth - 3, -iz, iz, FILTER)


def build_double(c, sp, X, Z):
    FRONT, REAR = sp["front"], sp["rear"]
    ix, iz = frame_and_walls(c, sp, X, Z, sp["depth"])
    for x in positions(2 * ix, sp["pitch"]):
        box(c, "Profile_aletta_verticale", x - FRONT[0] / 2, x + FRONT[0] / 2, FRONT[2], FRONT[2] + FRONT[1], -iz, iz, PROFILE)
    for z in positions(2 * iz, sp["pitch"]):
        box(c, "Profile_aletta_orizzontale", -ix, ix, REAR[2], REAR[2] + REAR[1], z - REAR[0] / 2, z + REAR[0] / 2, PROFILE)
    if sp.get("curved"):
        # end plates bent back around the round duct (photo)
        for sign in (-1, 1):
            arc = [(sign * (X - 20 * (1 - math.cos(s * math.pi / 2))), 40 * math.sin(s * math.pi / 2)) for s in [k / 8 for k in range(9)]]
            strip_z(c, "Profile_fianco", arc, 1.5, -Z, Z, PROFILE)
    back(c, sp, ix, iz, sp["depth"])


def build_bars(c, sp, X, Z):
    thick, chord = sp["bar"]
    ix, iz = frame_and_walls(c, sp, X, Z, sp["depth"])
    for z in positions(2 * iz, sp["pitch"]):
        prism(c, "Profile_barra", tilted(chord / 2 + 1, z, chord / 2, thick / 2, sp.get("tilt", 0)), -ix, ix, PROFILE)
    back(c, sp, ix, iz, sp["depth"])


def build_slats(c, sp, X, Z):
    reach = sp["chord"] * math.sin(math.radians(sp["angle"])) + sp["thick"] * math.cos(math.radians(sp["angle"]))
    depth = max(sp["flange"] + 2, round(reach + 3))
    if sp.get("filter"):
        depth += 8
    ix, iz = frame_and_walls(c, sp, X, Z, depth)
    for z in positions(2 * iz, sp["pitch"]):
        prism(c, "Profile_lamella", tilted(reach / 2 + 1, z, sp["thick"] / 2, sp["chord"] / 2, sp["angle"]), -ix, ix, PROFILE)
    if sp.get("rib"):
        box(c, "Profile_montante", -2, 2, 0, reach + 2, -iz, iz, PROFILE)
    back(c, sp, ix, iz, depth)


def ring(c, name, r0, r1, y0, y1, material, sides=64):
    """Annulus r0..r1 (mm) extruded along y from y0 to y1; r0 = 0 gives a disc."""
    pts = [(math.cos(k * math.tau / sides), math.sin(k * math.tau / sides)) for k in range(sides)]
    v = [(r * px * MM, y * MM, r * pz * MM) for r in (r1, r0) for y in (y0, y1) for px, pz in pts]
    o, i = 0, 2 * sides  # outer rings at y0 / y1, inner rings at y0 / y1
    faces = []
    for k in range(sides):
        n = (k + 1) % sides
        faces += [(o + k, o + n, o + sides + n, o + sides + k)]  # outer wall
        if r0:
            faces += [(i + k, i + sides + k, i + sides + n, i + n), (o + k, i + k, i + n, o + n), (o + sides + k, o + sides + n, i + sides + n, i + sides + k)]
    if not r0:
        faces += [tuple(range(sides)), tuple(range(2 * sides - 1, sides - 1, -1))]
    return solid(c, name, v, faces, material)


def build_round(c, sp, X, Z):
    """Circular grille: flange ring, return tube and inclined slats clipped to the opening (X = radius)."""
    reach = sp["chord"] * math.sin(math.radians(sp["angle"])) + sp["thick"] * math.cos(math.radians(sp["angle"]))
    depth = max(sp["flange"] + 2, round(reach + 3))
    ri = X - sp["frame"]
    ring(c, "Profile_cornice", ri, X, 0, sp["flange"], PROFILE)
    ring(c, "Profile_ritorno", ri, ri + sp["ret"], sp["flange"], depth, PROFILE)
    for z in positions(2 * ri, sp["pitch"]):
        half = math.sqrt(max(ri * ri - (z + sp["thick"]) ** 2, 0))
        if half > 3:
            prism(c, "Profile_lamella", tilted(reach / 2 + 1, z, sp["thick"] / 2, sp["chord"] / 2, sp["angle"]), -half, half, PROFILE)
    ring(c, "Interno", 0, ri, depth + 1, depth + 2, DARK)


def build_mesh(c, sp, X, Z):
    P, t, d = sp["pitch"], sp["thick"], sp["depth"]
    mesh_d = 20
    ix, iz = frame_and_walls(c, sp, X, Z, d)
    for x in positions(2 * ix, P):
        box(c, "Profile_maglia_verticale", x - t / 2, x + t / 2, 1, 1 + mesh_d, -iz, iz, PROFILE)
    for z in positions(2 * iz, P):
        box(c, "Profile_maglia_orizzontale", -ix, ix, 1, 1 + mesh_d, z - t / 2, z + t / 2, PROFILE)
    back(c, sp, ix, iz, d)


def build_perf(c, sp, X, Z):
    ix, iz = frame_and_walls(c, sp, X, Z, sp["depth"])
    box(c, "Profile_lamiera_forata", -ix, ix, 0, 1.2, -iz, iz, PERF[bool(sp.get("square"))], uv_tile=sp["tile"])
    back(c, sp, ix, iz, sp["depth"])


def build_floor(c, sp, X, Z):
    ix, iz = frame_and_walls(c, sp, X, Z, sp["depth"])
    for z in positions(2 * iz, sp["pitch"]):
        box(c, "Profile_barra", -ix, ix, 0, sp["depth"] - 4, z - sp["thick"] / 2, z + sp["thick"] / 2, PROFILE)
    for x in positions(2 * ix, 160):
        box(c, "Profile_traverso", x - 2, x + 2, sp["depth"] - 8, sp["depth"] - 4, -iz, iz, PROFILE)


def cup(c, x, z, r, sides=12):
    """Raised nozzle ring on the face (y -3 .. 0) with a dark bore."""
    ring = [(x + r * math.cos(k * math.tau / sides), z + r * math.sin(k * math.tau / sides)) for k in range(sides)]
    bore = [(x + r * .6 * math.cos(k * math.tau / sides), z + r * .6 * math.sin(k * math.tau / sides)) for k in range(sides)]
    v = [(px * MM, 0, pz * MM) for px, pz in ring] + [(px * MM, -3 * MM, pz * MM) for px, pz in bore]
    solid(c, "Profile_ugello", v, [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)], PROFILE)
    solid(c, "Interno", v[sides:], [tuple(range(sides - 1, -1, -1))], DARK)


def build_nozzle(c, sp, X, Z):
    ix, iz = frame_and_walls(c, sp, X, Z, sp["depth"])
    box(c, "Profile_pannello", -ix, ix, 0, 1.5, -iz, iz, PROFILE)
    for z in positions(2 * iz - 2 * sp["r"], sp["row_pitch"]):
        for x in positions(2 * ix - 2 * sp["r"], sp["pitch"]):
            cup(c, x, z, sp["r"])
            collar = ring(c, "Profile_collare", sp["r"] * .9, sp["r"] * 1.35, -1.5, 0, PROFILE, 24)  # shallow collar around each nozzle (photo)
            collar.location = (x * MM, 0, z * MM)
    back(c, sp, ix, iz, sp["depth"])


def build_linear(c, sp, X, Z, slots, slot_w):
    """Flush slot diffuser: white flange with `slots` dark slots across its width, body behind."""
    T, depth, end = sp["flange"], sp["depth"], sp["end"]
    centres = [(k - (slots - 1) / 2) * (2 * Z / slots) for k in range(slots)]
    edges = [-Z]
    for zc in centres:
        edges += [zc - slot_w / 2, zc + slot_w / 2]
    edges.append(Z)
    for k in range(0, len(edges), 2):
        if edges[k + 1] > edges[k]:
            box(c, "Profile_cornice", -X, X, 0, T, edges[k], edges[k + 1], PROFILE)
    for zc in centres:
        box(c, "Profile_testata", -X, -X + end, 0, T, zc - slot_w / 2, zc + slot_w / 2, PROFILE)
        box(c, "Profile_testata", X - end, X, 0, T, zc - slot_w / 2, zc + slot_w / 2, PROFILE)
        box(c, "Interno", -X + end, X - end, depth, depth + 1, zc - slot_w / 2, zc + slot_w / 2, DARK)
    box(c, "Profile_ritorno", -X, X, T, depth, Z - 2, Z, PROFILE)
    box(c, "Profile_ritorno", -X, X, T, depth, -Z, -Z + 2, PROFILE)


BUILDERS = dict(round=build_round, nozzle=build_nozzle, double=build_double, bars=build_bars, slats=build_slats, mesh=build_mesh, perf=build_perf, floor=build_floor)


def build(fam, v, w, h, keep):
    code = v["id"]
    out = ROOT / "public/models/ecoclima" / fam.lower()
    out.mkdir(parents=True, exist_ok=True)
    c = bpy.data.collections.new(code)
    scene.collection.children.link(c)
    sp = SPECS[fam]
    if sp["kind"] == "linear":
        build_linear(c, sp, w / 2, h / 2, v["slotCount"] or 1, v["slotWidthMm"] or 20)
    else:
        BUILDERS[sp["kind"]](c, sp, w / 2, h / 2)
    bpy.ops.object.select_all(action="DESELECT")
    for o in c.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(c.objects))
    target = out / f"{code}.glb"
    temporary = out / f"{code}.export.glb"
    bpy.ops.export_scene.gltf(filepath=str(temporary), export_format="GLB", use_selection=True, use_active_scene=True, export_normals=False)
    temporary.replace(target)
    if keep:
        c.hide_viewport = c.hide_render = True
    else:
        for o in list(c.objects):
            me = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(me)
        bpy.data.collections.remove(c)


def face(family, v):
    """Same rule as terminalFaceDimensions (src/domain/air-terminals/geometry.ts); linear slot diffusers use a 1000 mm reference length."""
    w = v.get("faceWidthMm") or v.get("widthMm") or v.get("nominalDiameterMm")
    h = v.get("faceHeightMm") or v.get("heightMm") or v.get("nominalDiameterMm") or (v.get("widthMm") if family.get("isLinearPerMeter") else None)
    if SPECS[family["familyCode"]]["kind"] == "linear":
        w = 1000
    return (round(w), round(h)) if w and h else None


catalog = json.loads((ROOT / "catalog-data/generated/ecoclima.json").read_text(encoding="utf-8"))
built = {}
ONLY = set(filter(None, os.environ.get("ECO_ONLY", "").split(",")))  # partial rebuild: other families keep the GLBs they have, the scene goes to its own .blend
for fam in SPECS:
    if ONLY and fam not in ONLY:
        continue
    family = next((f for f in catalog["families"] if f["familyCode"] == fam), None)
    todo = [(v, face(family, v)) for v in family["variants"]] if family else []
    todo = [(v, wh) for v, wh in todo if wh]
    if not todo:
        print("skipped", fam)
        continue
    for i, (v, (w, h)) in enumerate(todo):
        build(fam, v, w, h, i == len(todo) // 2)
    built[fam] = len(todo)
print("built", built)
for c in scene.collection.children:
    c.hide_viewport = c.hide_render = False
bpy.context.preferences.filepaths.save_version = 0
blend = "ecoclima-grilles" + ("-" + "-".join(sorted(ONLY)).lower() if ONLY else "")
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / f"assets/blender/{blend}.blend"))
