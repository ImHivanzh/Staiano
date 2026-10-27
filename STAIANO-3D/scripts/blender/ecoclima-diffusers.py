"""Editable Ecoclima ceiling-diffuser and valve reconstructions, one GLB per shape family.

Real scale (metres), quotas from `originalDimensionsMm` of the first variant in
catalog-data/generated/ecoclima.json, shapes from the manufacturer photos in public/catalog/.
Ceiling plane = Blender y 0, body toward +y; glTF turns that into the face on +Z.
The app scales each model to the catalog face and body depth (EcoclimaTerminalBody.tsx).
Output: public/models/ecoclima/diffusers/<model>.glb and assets/blender/ecoclima-diffusers.blend.
Run: `blender -b -P scripts/blender/ecoclima-diffusers.py` (glTF export does not work through the MCP).
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/models/ecoclima/diffusers"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene
scene.name = "Diffusori Ecoclima"
MM = .001


def mat(name, rgb, metal=0, rough=.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    return m


# "Profile*" takes the finish chosen in the app; the others never change.
PROFILE = mat("Profile bianco RAL 9016", (.9, .9, .88), .1, .45)
DARK = mat("Interno", (.03, .035, .035), .05, .8)
NECK = mat("Collare zincato", (.55, .57, .58), .7, .45)
MESH = mat("Rete forata", (.62, .64, .65), .8, .4)
BAR = mat("Barra nera", (.05, .05, .055), .1, .5)


def perforated(square=False):
    """Tiled perforation texture (staggered pair of dark holes per tile) on a white "Profile" material; the app tints it."""
    n = 64
    img = bpy.data.images.new("perforazione", n, n)
    px = []
    for j in range(n):
        for i in range(n):
            u, v = i / n, j / n
            d = min((math.hypot(((u - cu + .5) % 1) - .5, ((v - cv + .5) % 1) - .5) if not square else
                     max(abs(((u - cu + .5) % 1) - .5), abs(((v - cv + .5) % 1) - .5))) for cu, cv in ((.25, .25), (.75, .75)))
            px += [.04, .04, .04, 1] if d < (.17 if square else .15) else [1, 1, 1, 1]
    img.pixels[:] = px
    img.pack()
    m = mat("Profile perforato", (1, 1, 1), .2, .5)
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    m.node_tree.links.new(tex.outputs["Color"], p.inputs["Base Color"])
    return m


PERF = perforated()
TILE = 6  # mm per perforation tile


def build_mesh(c, name, verts, faces, material, uv_tile=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    if uv_tile:
        uv = me.uv_layers.new(name="UVMap")
        for loop in me.loops:
            x, _, z = verts[loop.vertex_index]
            uv.data[loop.index].uv = (x / (uv_tile * MM), z / (uv_tile * MM))
    me.update()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    o.data.materials.append(material)
    return o


def revolve(c, name, pts, material, seg=72, phase=0.0, uv_tile=None):
    """Surface of revolution about the Y axis; pts = [(radius_mm, y_mm)], open ends unless radius 0."""
    verts, faces = [], []
    for r, y in pts:
        for j in range(seg):
            a = phase + j * math.tau / seg
            verts.append((r * MM * math.cos(a), y * MM, r * MM * math.sin(a)))
    for i in range(len(pts) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((i * seg + j, i * seg + k, (i + 1) * seg + k, (i + 1) * seg + j))
    return build_mesh(c, name, verts, faces, material, uv_tile)


def square_tube(c, name, side, y0, y1, material):
    """Square duct collar of the given side (mm)."""
    return revolve(c, name, [(side / 2 * math.sqrt(2), y0), (side / 2 * math.sqrt(2), y1)], material, seg=4, phase=math.pi / 4)


def prism(c, name, base, y0, thick, material, uv_tile=None):
    """Slab: polygon `base` [(x_mm, z_mm)] extruded from y0 to y0 + thick (mm)."""
    n = len(base)
    verts = [(x * MM, y0 * MM, z * MM) for x, z in base] + [(x * MM, (y0 + thick) * MM, z * MM) for x, z in base]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return build_mesh(c, name, verts, faces, material, uv_tile)


def square(side):
    return [(-side / 2, -side / 2), (side / 2, -side / 2), (side / 2, side / 2), (-side / 2, side / 2)]


def square_frustum(c, name, s_out, s_in, y0, y1, material):
    """Four sloping walls from a square of side s_out at y0 to one of side s_in at y1 (mm); y0 == y1 is a flat ledge."""
    verts = [(x * MM, y0 * MM, z * MM) for x, z in square(s_out)] + [(x * MM, y1 * MM, z * MM) for x, z in square(s_in)]
    return build_mesh(c, name, verts, [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)], material)


def square_frame(c, outer, inner, thick):
    """Flat square frame with a square opening."""
    o, i = outer / 2, inner / 2
    for k, base in enumerate((
        [(-o, -o), (o, -o), (o, -i), (-o, -i)], [(-o, i), (o, i), (o, o), (-o, o)],
        [(-o, -i), (-i, -i), (-i, i), (-o, i)], [(i, -i), (o, -i), (o, i), (i, i)],
    )):
        prism(c, "Profile_cornice", base, 0, thick, PROFILE)


def square_plate(c, size, thick, hole_r):
    """Square front plate (mm) with a round opening of radius hole_r."""
    n = 72
    corner = lambda a: (max(-1, min(1, math.cos(a) * 1.5)) * size / 2 * MM, max(-1, min(1, math.sin(a) * 1.5)) * size / 2 * MM)
    verts = []
    for y in (0, thick):
        verts += [(corner(j * math.tau / n)[0], y * MM, corner(j * math.tau / n)[1]) for j in range(n)]
        verts += [(hole_r * MM * math.cos(j * math.tau / n), y * MM, hole_r * MM * math.sin(j * math.tau / n)) for j in range(n)]
    faces = []
    for j in range(n):
        k = (j + 1) % n
        faces += [(j, k, n + k, n + j), (2 * n + j, 3 * n + j, 3 * n + k, 2 * n + k),
                  (n + j, n + k, 3 * n + k, 3 * n + j), (j, 2 * n + j, 2 * n + k, k)]
    return build_mesh(c, "Profile_piastra", verts, faces, PROFILE)


def blades(c, count, r0, r1, root_w, tip_deg, y, tilt_deg, thick=1.5):
    """Fan-shaped adjustable blades (EDRC / EDRF photos), pitched about their radial axis."""
    tip_w = 2 * r1 * math.sin(math.radians(tip_deg) / 2)
    tilt = math.radians(tilt_deg)
    for i in range(count):
        a = i * math.tau / count
        radial, tang = (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))
        base = []
        for r, t in ((r0, -root_w / 2), (r1, -tip_w / 2), (r1, tip_w / 2), (r0, root_w / 2)):
            base.append((radial[0] * r + tang[0] * t * math.cos(tilt), radial[1] * r + tang[1] * t * math.cos(tilt), t * math.sin(tilt)))
        verts = [(p[0] * MM, (y + p[2]) * MM, p[1] * MM) for p in base] + [(p[0] * MM, (y + p[2] + thick) * MM, p[1] * MM) for p in base]
        build_mesh(c, "Profile_pala", verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], PROFILE)


def torus_ring(r_in, r_out, depth):
    """Profile of a rounded ring: inner back, over the front bulge, outer back (mm)."""
    rc, rx, ry = (r_in + r_out) / 2, (r_out - r_in) / 2, depth / 2
    arc = [(rc + rx * math.cos(math.pi + k * math.pi / 16), ry + ry * math.sin(math.pi + k * math.pi / 16)) for k in range(17)]
    return [(r_in, depth)] + arc + [(r_out, depth)]


def disc(r, y):
    return [(0, y), (r, y)]


def build(code):
    c = bpy.data.collections.new(code)
    scene.collection.children.link(c)
    if code in ("edrc-round", "edrc-square"):
        # EDRC: face Ø393, inner opening Ø283, mesh Ø286, neck Ø248, total H 205 (PQR plate 597, H 145)
        if code.endswith("square"):
            square_plate(c, 597, 4, 150)
            wall, hub_y, mesh_y, r_open, neck_end = [(150, 4), (150, 34), (124, 52), (124, 145)], 22, 40, 142, 145
        else:
            revolve(c, "Profile_anello", torus_ring(141.5, 196.5, 50), PROFILE)
            wall, hub_y, mesh_y, r_open, neck_end = [(143, 30), (143, 60), (124, 85), (124, 205)], 34, 62, 138, 205
        revolve(c, "Collare", wall, NECK)
        revolve(c, "Rete", disc(r_open, mesh_y), MESH)
        revolve(c, "Interno", disc(124, neck_end - 1), DARK)
        blades(c, 6, 16, r_open - 4, 22, 66, hub_y, 26)
        revolve(c, "Profile_mozzo", [(0, hub_y - 3), (15, hub_y - 3), (15, hub_y + 6), (0, hub_y + 6)], PROFILE, seg=24)
    elif code in ("edrf-round", "edrf-square"):
        # EDRF: face Ø171, neck Ø122, hub Ø28, depth 55; eleven wide flat blades (photo)
        if code.endswith("square"):
            square_plate(c, 225, 3, 76)
            revolve(c, "Collare", [(76, 3), (76, 14), (61, 22), (61, 55)], NECK)
        else:
            revolve(c, "Profile_anello", torus_ring(70, 85.5, 14), PROFILE)
            revolve(c, "Collare", [(72, 12), (72, 18), (61, 26), (61, 55)], NECK)
        revolve(c, "Interno", disc(61, 54), DARK)
        blades(c, 11, 14, 72, 12, 40, 10, 24, thick=1)
        revolve(c, "Profile_mozzo", [(0, 7), (14, 7), (14, 15), (0, 15)], PROFILE, seg=24)
    elif code.startswith(("edra-", "edcs-")):
        # EDRA/EDCS: flange Ø250, opening Ø195, neck Ø96, height 85; EDRA three adjustable cones, EDCS one;
        # the -PQ versions sit on a square 595 plate instead of the round flange
        if code.endswith("square"):
            square_plate(c, 595, 3, 97.5)
        else:
            revolve(c, "Profile_flangia", [(125, 0), (125, 3), (97.5, 3), (97.5, 0), (125, 0)], PROFILE)
        revolve(c, "Collare", [(97.5, 3), (80, 22), (48, 34), (48, 85)], NECK)
        revolve(c, "Interno", disc(48, 84), DARK)
        cones = ((84, 14, 20), (60, 24, 20), (36, 34, 18)) if code.startswith("edra-") else ((84, 22, 22),)
        for k, (r, y, h) in enumerate(cones):
            revolve(c, f"Profile_cono{k}", [(r, y), (r * .55, y + h)], PROFILE)
        revolve(c, "Profile_mozzo", [(0, 30), (14, 38), (0, 46)], PROFILE, seg=24)
    elif code == "edqv-square":
        # EDQV: frame 300, six stepped square cones with flat ledges and a central pyramid (photo)
        square_frame(c, 300, 262, 3)
        sizes = [262, 220, 178, 136, 94, 52]
        for k, s in enumerate(sizes):
            y = 3 + k * 5.5
            square_frustum(c, f"Profile_gradino{k}", s, s - 14, y, y + 5.5, PROFILE)
            if k + 1 < len(sizes):
                square_frustum(c, f"Profile_riquadro{k}", s - 14, sizes[k + 1], y + 5.5, y + 5.5, PROFILE)
        b = 24 * MM
        build_mesh(c, "Profile_piramide", [(-b, 38 * MM, -b), (b, 38 * MM, -b), (b, 38 * MM, b), (-b, 38 * MM, b), (0, 26 * MM, 0)],
                   [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], PROFILE)
        square_tube(c, "Collare", 150, 38, 50, NECK)
        build_mesh(c, "Interno", [(x * MM, 39 * MM, z * MM) for x, z in square(60)], [(0, 1, 2, 3)], DARK)
    elif code == "edu-round":
        # EDU: flange Ø139, hole Ø115, ball Ø119, outlet Ø80 tilted 25 degrees (photo)
        revolve(c, "Profile_flangia", [(69.5, 0), (69.5, 3), (57.5, 3), (57.5, 0), (69.5, 0)], PROFILE)
        R, out_r, cy = 59.5, 40, 38
        t0 = math.degrees(math.asin(out_r / R))
        cap = [(R * math.sin(math.radians(t)), -R * math.cos(math.radians(t))) for t in list(range(int(t0), 181, 6)) + [180]]
        front = cap[0][1]
        ball = revolve(c, "Profile_sfera", cap, PROFILE)
        inner = revolve(c, "Interno", [(out_r, front), (out_r * .9, front + 30), (0, front + 30)], DARK)
        for o in (ball, inner):
            o.location = (0, cy * MM, 0)
            o.rotation_euler = (math.radians(25), 0, 0)
            # bake the tilt: a rotated node would inflate the bounding box the app scales the model by
            o.data.transform(o.matrix_basis)
            o.location, o.rotation_euler = (0, 0, 0), (0, 0, 0)
    elif code in ("ede-square", "ede2-square"):
        # EDE: white plate, louvres in two rings turned off-radial plus four long cardinal bars (photo);
        # EDE2R: two plain spiral rings of identical louvres
        S = 295
        prism(c, "Profile_piastra", square(S), 0, 3, PROFILE)

        def louvre(r, a, length, rot):
            ang = a + rot
            ux, uz = math.cos(ang) * length / 2, math.sin(ang) * length / 2
            wx, wz = -math.sin(ang) * 4, math.cos(ang) * 4
            cx, cz = r * math.cos(a), r * math.sin(a)
            prism(c, "Barra", [(cx - ux - wx, cz - uz - wz), (cx + ux - wx, cz + uz - wz), (cx + ux + wx, cz + uz + wz), (cx - ux + wx, cz - uz + wz)], -1.5, 1.5, BAR)

        spiral = code == "ede2-square"
        for k in range(0 if spiral else 4):
            louvre(S * .21, k * math.pi / 2, S * .26, 0)
        for count, r, length, rot, off in (((14, S * .3, S * .14, .6, 0), (22, S * .43, S * .14, .6, 0)) if spiral else
                                           ((12, S * .27, S * .13, .45, .5), (16, S * .41, S * .13, .3, 0))):
            for i in range(count):
                louvre(r, (i + off) * math.tau / count, length, rot)
        square_tube(c, "Collare", S * .42, 3, 80, NECK)
    elif code in ("valve-round", "valve-abs", "valve-inox"):
        # EVVMC/EVVRC (steel neck, domed disc), EVPMC (all ABS, deeper rim), EAM-VRFN (stainless, conical disc): normalised on Ø200
        if code == "valve-abs":
            revolve(c, "Profile_anello", torus_ring(76, 100, 18), PROFILE)
            revolve(c, "Profile_collo", [(72, 14), (72, 55)], PROFILE)
        else:
            revolve(c, "Profile_anello", torus_ring(84, 100, 12), PROFILE)
            revolve(c, "Collare" if code == "valve-round" else "Profile_collo", [(76, 10), (76, 50)], NECK if code == "valve-round" else PROFILE)
        revolve(c, "Interno", disc(70, 48), DARK)
        if code == "valve-inox":
            revolve(c, "Profile_disco", [(0, 3), (66, 16), (66, 19)], PROFILE)
        else:
            revolve(c, "Profile_disco", [(0, 3), (30, 4), (52, 7), (66, 14), (66, 20)], PROFILE)
    elif code in ("edcf-round", "edcc-round"):
        # EDCF/EDCC: flange Ø300 with a shallow Ø240 plate (perforated / closed), black neck Ø125 (photo)
        perf = code == "edcf-round"
        revolve(c, "Profile_anello", torus_ring(118, 150, 20), PROFILE)
        revolve(c, "Profile_piastra", disc(120, 9), PERF if perf else PROFILE, uv_tile=TILE if perf else None)
        revolve(c, "Collare", [(62, 14), (62, 85)], NECK)
        revolve(c, "Interno", disc(62, 84), DARK)
    elif code in ("edqf-square", "edqc-square"):
        # EDQF/EDQC: square frame 300 with a perforated / closed 270 plate and a round neck Ø125
        perf = code == "edqf-square"
        square_frame(c, 300, 270, 4)
        prism(c, "Profile_piastra", square(270), 4, 1.5, PERF if perf else PROFILE, uv_tile=TILE if perf else None)
        revolve(c, "Collare", [(62, 5.5), (62, 80)], NECK)
        revolve(c, "Interno", disc(62, 79), DARK)
    elif code == "edea-round":
        # EDEA-SD: flange Ø300, three concentric fixed cones around a dome, steel neck Ø125 (photo)
        revolve(c, "Profile_anello", torus_ring(117, 150, 14), PROFILE)
        for k, (r, y) in enumerate(((112, 8), (84, 16), (56, 24))):
            revolve(c, f"Profile_cono{k}", [(r, y), (r * .85, y + 14)], PROFILE)
        revolve(c, "Profile_mozzo", [(0, 22), (30, 30), (30, 36), (0, 36)], PROFILE, seg=36)
        revolve(c, "Collare", [(62, 14), (62, 70)], NECK)
        revolve(c, "Interno", disc(62, 69), DARK)
    elif code in ("edqm-square", "edqm-round"):
        # EDQMQ: square plate 300 with a 10 x 10 grid of nozzles; EDQMC: nozzles on concentric rings (photo)
        prism(c, "Profile_piastra", square(300), 0, 3, PROFILE)
        if code == "edqm-square":
            spots = [(-126 + 28 * i, -126 + 28 * j) for i in range(10) for j in range(10)]
        else:
            spots = [(r * math.cos(a), r * math.sin(a)) for r, n in ((0, 1), (26, 6), (52, 12), (78, 18), (104, 24)) for a in [k * math.tau / n for k in range(n)]]
        for x, z in spots:
            # nozzle: raised ring on the face with a dark bore
            for o in (revolve(c, "Profile_ugello", [(10, 0), (9.5, -2), (6.5, -2.6)], PROFILE, seg=16), revolve(c, "Interno", disc(6.5, -2.2), DARK, seg=16)):
                o.location = (x * MM, 0, z * MM)
                o.data.transform(o.matrix_basis)
                o.location = (0, 0, 0)
        square_tube(c, "Collare", 250, 3, 40, NECK)
    elif code == "edfds-round":
        # EDFDS: floor diffuser, flange Ø200, disc with slanted slots, black neck (photo)
        revolve(c, "Profile_anello", torus_ring(85, 100, 8), PROFILE)
        revolve(c, "Profile_disco", disc(86, 3), PROFILE)
        for count, r, length in ((6, 28, 36), (12, 58, 30)):
            for i in range(count):
                a = i * math.tau / count
                cx, cz = r * math.cos(a), r * math.sin(a)
                ang = a + .9
                ux, uz, wx, wz = math.cos(ang) * length / 2, math.sin(ang) * length / 2, -math.sin(ang) * 3.5, math.cos(ang) * 3.5
                prism(c, "Barra", [(cx - ux - wx, cz - uz - wz), (cx + ux - wx, cz + uz - wz), (cx + ux + wx, cz + uz + wz), (cx - ux + wx, cz - uz + wz)], -1.5, 1.5, BAR)
        revolve(c, "Collo", [(72, 4), (72, 70)], DARK)
    elif code in ("edsc-round", "edsc-square"):
        # EDSC: plaster-in diffuser, wide frame with a recessed closed disc / plate
        if code.endswith("square"):
            square_frame(c, 300, 250, 4)
            prism(c, "Profile_piastra", square(240), 10, 2, PROFILE)
        else:
            revolve(c, "Profile_anello", torus_ring(100, 150, 14), PROFILE)
            revolve(c, "Profile_piastra", disc(100, 10), PROFILE)
        revolve(c, "Interno", disc(40, 13), DARK)
        revolve(c, "Collare", [(60, 12), (60, 60)], NECK)
    elif code == "eadd-square":
        # EADD: ABS four-side diffuser, 270 square panel hovering over a 300 flange, black neck (photo)
        prism(c, "Profile_flangia", square(300), 16, 5, PROFILE)
        prism(c, "Profile_pannello", square(270), 0, 16, PROFILE)
        prism(c, "Interno", square(285), 16, 1, DARK)
        revolve(c, "Collo", [(50, 21), (50, 80)], DARK)
    bpy.ops.object.select_all(action="DESELECT")
    for o in c.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(c.objects))
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{code}.glb"), export_format="GLB", use_selection=True, use_active_scene=True)
    c.hide_viewport = c.hide_render = True


MODELS = ("edrc-round", "edrc-square", "edrf-round", "edrf-square", "edra-round", "edra-square", "edcs-round", "edcs-square", "edqv-square", "edu-round",
          "ede-square", "ede2-square", "valve-round", "valve-abs", "valve-inox", "edcf-round", "edcc-round", "edqf-square", "edqc-square", "edea-round",
          "edqm-square", "edqm-round", "edfds-round", "edsc-round", "edsc-square", "eadd-square")
for model in MODELS:
    build(model)
for c in scene.collection.children:
    c.hide_viewport = c.hide_render = False
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "assets/blender/ecoclima-diffusers.blend"))
