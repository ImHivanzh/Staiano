"""Unità esterne delle pompe di calore (monoblocco): Chaffoteaux Arianext, Gree Versati III/V, Daikin Altherma 3.

Riferimento: foto ufficiali in public/catalog-assets/heat-pumps/ (corpo con ventola sul lato sinistro,
pannello tecnico a destra, due piedi lunghi). Una mesh per ogni ingombro di catalogo, quindi nessuna
deformazione dei GLB nel viewer: le quote arrivano da catalog-data/generated/heat-pumps.json.
Numero e posizione delle ventole oltre la foto (Arianext 1106/1506 mm, Daikin senza vista frontale) sono
illustrativi. Logo, etichette e valvole non sono modellati.
Asse x = larghezza, y = profondità (fronte a -y), z = altezza. Crea scene proprie, non tocca quella aperta.
Esporta public/models/hvac/heat-pump-<nome>.glb e assets/blender/heat-pump-outdoor-units.blend.
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT_GLB = ROOT / "public/models/hvac"
OUT_GLB.mkdir(parents=True, exist_ok=True)
(ROOT / "assets/blender").mkdir(parents=True, exist_ok=True)
(ROOT / "output/verifiche-realismo").mkdir(parents=True, exist_ok=True)
MATS = {}


def mat(name, rgb, rough=0.45, metal=0.0):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*rgb, 1)
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Base Color"].default_value = (*rgb, 1)
        p.inputs["Roughness"].default_value = rough
        p.inputs["Metallic"].default_value = metal
        MATS[name] = m
    return MATS[name]


# nome, dimensioni (larghezza, profondità, altezza in m), stile, ventole, quota della zona ventola, famiglia di catalogo
MODELS = {
    "chaffoteaux-arianext-756": (1.016, 0.383, 0.756, "chaff", 1, 0.62),
    "chaffoteaux-arianext-1106": (1.016, 0.383, 1.106, "chaff", 1, 0.62),
    "chaffoteaux-arianext-1506": (1.016, 0.383, 1.506, "chaff", 2, 0.62),
    "gree-versati-iii-702": (0.975, 0.396, 0.702, "greew", 1, 0.66),
    "gree-versati-iii-787": (0.982, 0.427, 0.787, "greew", 1, 0.66),
    "gree-versati-v-880": (1.206, 0.445, 0.880, "greeb", 1, 0.62),
    "gree-versati-v-1615": (0.943, 0.464, 1.615, "greeb", 2, 0.84),
    "daikin-altherma-3m-1250": (1.250, 0.362, 0.770, "ebla_e", 1, 0.70),
    "daikin-altherma-3m-1380": (1.380, 0.460, 0.870, "ebla_d", 1, 0.68),
    "daikin-altherma-3r-740": (0.740, 0.387, 0.884, "dark", 1, 0.66),
    "daikin-altherma-3r-870": (0.870, 0.460, 1.100, "dark", 1, 0.66),
    "daikin-altherma-3r-1003": (1.003, 0.533, 1.270, "dark", 1, 0.66),
}

STYLE = {
    # corpo, pannello tecnico, griglia/fondo ventola, ventola, raggio smusso
    "chaff": dict(body=(0.95, 0.95, 0.94), panel=(0.93, 0.93, 0.92), recess=(0.82, 0.83, 0.84), fan=(0.96, 0.96, 0.96),
                  wire=(0.88, 0.88, 0.88), bevel=0.035, grille="round", foot=(0.74, 0.75, 0.76), blades=7),
    "greew": dict(body=(0.88, 0.89, 0.9), panel=(0.78, 0.8, 0.82), recess=(0.2, 0.22, 0.24), fan=(0.08, 0.085, 0.09),
                  wire=(0.7, 0.72, 0.74), bevel=0.012, grille="rect", foot=(0.6, 0.61, 0.62), logo=True, blades=5),
    "greeb": dict(body=(0.1, 0.1, 0.11), panel=(0.12, 0.12, 0.13), recess=(0.03, 0.03, 0.035), fan=(0.06, 0.06, 0.065),
                  wire=(0.17, 0.17, 0.18), bevel=0.01, grille="round", foot=(0.07, 0.07, 0.08), blades=5, logo=True),
    "ebla_e": dict(body=(0.93, 0.93, 0.92), panel=(0.9, 0.9, 0.9), recess=(0.25, 0.27, 0.29), fan=(0.2, 0.21, 0.22),
                   wire=(0.9, 0.9, 0.9), bevel=0.012, grille="round", foot=(0.15, 0.15, 0.16), side=(0.1, 0.55, 0.72), blades=5),
    "ebla_d": dict(body=(0.64, 0.66, 0.69), panel=(0.64, 0.66, 0.69), recess=(0.035, 0.037, 0.04), fan=(0.05, 0.05, 0.055),
                   wire=(0.1, 0.1, 0.11), bevel=0.01, grille="louvre", foot=(0.12, 0.12, 0.13)),
    "dark": dict(body=(0.075, 0.08, 0.085), panel=(0.09, 0.095, 0.1), recess=(0.03, 0.032, 0.035), fan=(0.05, 0.05, 0.055),
                 wire=(0.13, 0.135, 0.14), bevel=0.01, grille="louvre", foot=(0.06, 0.06, 0.065)),
}


def put(o, m):
    o.data.materials.append(m)
    return o


def box(coll, loc, dims, m, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width, b.segments = min(bevel, min(dims) / 2.2), 4
        bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.ops.object.shade_smooth()
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    return put(o, m)


def disc(coll, loc, r, depth, m, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    return put(o, m)


def ring(coll, loc, r, wire, m):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=wire, major_segments=48, minor_segments=6,
                                     location=loc, rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    return put(o, m)


def fan(coll, body, cx, cz, r, yf, s, m_fan, m_wire, m_rec, round_grille, rect=None, blades=3):
    """Pale curve (3 o piu) arretrate, protette da una griglia circolare o rettangolare."""
    if round_grille:
        disc(coll, (cx, yf + 0.09, cz), r * 1.02, 0.002, m_rec)
    else:
        rw, rh = rect
        box(coll, (cx, yf + 0.09, cz), (rw, 0.002, rh), m_rec, 0.008)
        disc(coll, (cx, yf + 0.087, cz), min(rw, rh) * 0.46, 0.002, m_rec)
    rb = r * 0.86 if round_grille else min(rect) * 0.45
    # The impeller needs an actual cavity, behind the guard and in front of the backing.
    if round_grille:
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=rb * 1.02, depth=.16,
                                          location=(cx, yf + .05, cz), rotation=(math.pi / 2, 0, 0))
        cutter = bpy.context.object
    else:
        cutter = box(coll, (cx, yf + .05, cz), (rw, .16, rh), m_rec, .008)
    modifier = body.modifiers.new('Apertura ventola', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'; modifier.object = cutter
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    parts = []
    for i in range(blades):
        vertices = []
        for row in range(13):
            t = row / 12
            radius = rb * (.16 + .78 * t)
            chord = (.22 + .78 * math.sin(math.pi * t) ** .55) * 3 / blades
            for col in range(7):
                u = col / 6 - .5
                angle = i * math.tau / blades - .65 * t + chord * u
                vertices.append((cx + radius * math.cos(angle),
                                 yf + .04 + rb * .08 * u * math.sin(math.pi * t),
                                 cz + radius * math.sin(angle)))
        faces = [(row * 7 + col, row * 7 + col + 1, (row + 1) * 7 + col + 1, (row + 1) * 7 + col)
                 for row in range(12) for col in range(6)]
        mesh = bpy.data.meshes.new('Pala curva'); mesh.from_pydata(vertices, [], faces); mesh.update()
        blade = bpy.data.objects.new('Pala curva', mesh); coll.objects.link(blade); put(blade, m_fan)
        bpy.ops.object.select_all(action='DESELECT'); blade.select_set(True)
        bpy.context.view_layer.objects.active = blade
        thickness = blade.modifiers.new('Spessore pala', 'SOLIDIFY'); thickness.thickness = .002
        bpy.ops.object.modifier_apply(modifier=thickness.name)
        bpy.ops.object.shade_smooth()
        parts.append(blade)
    parts.append(disc(coll, (cx, yf + 0.03, cz), rb * 0.17, 0.03, m_fan))  # mozzo alto, come nella ventola stampata
    ring(coll, (cx, yf + 0.0, cz), rb * 1.0, 0.007, m_wire)  # bocca convogliatrice attorno alle pale
    if round_grille:
        for k in range(20):
            ring(coll, (cx, yf - 0.011, cz), r * (.16 + .84 * k / 19), 0.0012, m_wire)
        for i in range(64):
            a = i * 2 * math.pi / 64
            box(coll, (cx + math.cos(a) * r * 0.5, yf - 0.0115, cz + math.sin(a) * r * 0.5),
                (r * 1.0, 0.0016, 0.0016), m_wire, rot=(0, -a, 0))
    else:
        rw, rh = rect
        n = max(8, int(rh / 0.008))
        for i in range(n):
            z = cz - rh / 2 + (i + 0.5) * rh / n
            box(coll, (cx, yf - 0.011, z), (rw, 0.0014, 0.0014), m_wire)
        columns = max(8, int(rw / .012))
        for k in range(1, columns):
            box(coll, (cx - rw / 2 + k * rw / columns, yf - 0.0115, cz), (0.0014, 0.0014, rh), m_wire)
        box(coll, (cx, yf - 0.012, cz), (rw + 0.01, 0.003, 0.006), m_wire)
    return parts


def spinner(parts, k, center):
    """Pale e mozzo in un solo oggetto con origine sull'asse della ventola: il viewer lo fa ruotare (FanBlades_<k>)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = f"FanBlades_{k}"
    bpy.context.scene.cursor.location = center
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    # senza rotazione residua il nodo glTF ruota attorno al solo asse della ventola
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def build(name):
    w, d, h, style, fans, zone = MODELS[name]
    S = STYLE[style]
    sc = bpy.data.scenes.new(name)
    bpy.context.window.scene = sc
    coll = bpy.data.collections.new(name)
    sc.collection.children.link(coll)
    body_m = mat(f"{style}-corpo", S["body"], 0.4, 0.15)
    panel_m = mat(f"{style}-pannello", S["panel"], 0.5, 0.1)
    rec_m = mat(f"{style}-fondo", S["recess"], 0.8)
    fan_m = mat(f"{style}-ventola", S["fan"], 0.5)
    wire_m = mat(f"{style}-griglia", S["wire"], 0.45, 0.3)
    foot_m = mat(f"{style}-piedi", S["foot"], 0.7)
    foot_h = min(0.03, h * 0.045)
    bh = h - foot_h
    zc = foot_h + bh / 2
    yf = -d / 2
    # piedi lunghi lungo la profondità (foto)
    for x in (-w * 0.34, w * 0.34):
        box(coll, (x, 0, foot_h / 2), (0.06, d * 0.86, foot_h), foot_m, 0.004)
    body = box(coll, (0, 0, zc), (w, d, bh), body_m, S["bevel"])
    zone_w = w * zone
    zx = -w / 2 + 0.02 + zone_w / 2
    if style == "ebla_e":
        box(coll, (-w / 2 - 0.0015, 0, zc), (0.003, d * 0.9, bh * 0.8), mat("ebla-lato", S["side"], 0.5))
    # pannello tecnico a destra, leggermente a rilievo
    px0 = -w / 2 + 0.02 + zone_w + 0.012
    pw = w / 2 - 0.012 - px0
    if pw > 0.04:
        box(coll, ((px0 + w / 2 - 0.012) / 2, yf - 0.0015, zc), (pw, 0.003, bh - 0.05), panel_m, 0.006)
        if S.get('logo'):  # targhetta Gree: fondo chiaro con disco blu e arancio
            lx, lz = (px0 + w / 2 - 0.012) / 2, zc + (bh - 0.05) * 0.3
            box(coll, (lx, yf - 0.0035, lz), (min(pw * .7, .09), 0.002, min(pw * .7, .09) * .75), mat('gree-targa', (.93, .93, .94), .4), 0.004)
            disc(coll, (lx - .012, yf - 0.0052, lz), .012, 0.002, mat('gree-blu', (.08, .3, .65), .4), verts=24)
            box(coll, (lx + .014, yf - 0.0052, lz - .012), (.026, 0.002, .007), mat('gree-arancio', (.95, .5, .1), .4))
        # sportello cavi/valvole in basso a destra
        box(coll, (w / 2 - 0.05, yf - 0.003, foot_h + 0.06), (0.05, 0.003, 0.022), rec_m, 0.003)
    # fessure laterali (scambiatore) sul fianco sinistro
    for i in range(14):
        z = foot_h + 0.04 + i * (bh - 0.08) / 13
        box(coll, (-w / 2 - 0.0008, 0, z), (0.0016, d * 0.74, 0.006), rec_m)
    for k in range(fans):
        cz = zc if fans == 1 else foot_h + bh * (0.27 + 0.46 * k)
        zone_h = bh - 0.05 if fans == 1 else bh * 0.42
        if S["grille"] == "round":
            r = min(zone_w, zone_h) * 0.47
            spinner(fan(coll, body, zx, cz, r, yf, S, fan_m, wire_m, rec_m, True, blades=S.get('blades', 3)), k, (zx, yf + 0.04, cz))
            if style == 'chaff':  # logo al centro: disco blu con spicchio rosso, come nella foto
                disc(coll, (zx, yf - 0.0125, cz), r * 0.13, 0.003, mat('chaff-logo', (0.12, 0.22, 0.55), 0.4))
                disc(coll, (zx + r * 0.045, yf - 0.0145, cz), r * 0.07, 0.003, mat('chaff-logo-rosso', (0.78, 0.08, 0.1), 0.4), verts=24)
        elif S["grille"] == "rect":
            rw, rh = zone_w - 0.03, zone_h
            spinner(fan(coll, body, zx, cz, min(rw, rh) / 2, yf, S, fan_m, wire_m, rec_m, False, (rw, rh), blades=S.get('blades', 3)), k, (zx, yf + 0.04, cz))
        else:
            rw, rh = zone_w, bh - 0.03 if fans == 1 else zone_h
            box(coll, (zx, yf - 0.002, zc if fans == 1 else cz), (rw, 0.004, rh), rec_m, 0.012)
            n = int(rh / 0.014)
            for i in range(n):
                z = (zc if fans == 1 else cz) - rh / 2 + (i + 0.5) * rh / n
                box(coll, (zx, yf - 0.007, z), (rw - 0.02, 0.006, 0.009), wire_m, 0.001, rot=(math.radians(-14), 0, 0))
    # unisce gli oggetti per materiale
    by_mat = {}
    spinning = [o for o in coll.objects if o.name.startswith("FanBlades_")]
    for o in list(coll.objects):
        if o not in spinning:
            by_mat.setdefault(o.data.materials[0].name, []).append(o)
    joined = list(spinning)
    for objs in by_mat.values():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        # la rotazione della prima pala resterebbe sull'oggetto unito e gonfierebbe il Box3 del viewer
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        joined.append(bpy.context.active_object)
    bpy.ops.object.select_all(action="DESELECT")
    for o in joined:
        o.select_set(True)
    bpy.context.view_layer.objects.active = joined[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB / f"heat-pump-{name}.glb"), export_format="GLB",
                              use_selection=True, use_active_scene=True)
    # render di controllo
    from mathutils import Vector
    c = Vector((0, 0, h / 2))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", max(w, h) * 1.35
    cam.location = c + Vector((w * 1.1, -2.2, h * 0.28))
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    for n, off, power in (("K", (-1.5, -2.5, 2.5), 180), ("F", (2, -2, 0.8), 80)):
        ld = bpy.data.lights.new(n, "AREA")
        ld.energy, ld.size = power, 2
        lo = bpy.data.objects.new(n, ld)
        sc.collection.objects.link(lo)
        lo.location = c + Vector(off)
        lo.rotation_euler = (c - lo.location).to_track_quat("-Z", "Y").to_euler()
    sc.world = bpy.data.worlds.new(name)
    sc.world.color = (0.2, 0.2, 0.22)
    sc.view_settings.view_transform = "AgX"
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = 640
    sc.render.filepath = str(ROOT / f"output/verifiche-realismo/heat-pump-{name}.png")
    bpy.ops.render.render(write_still=True)
    return sc


keep = bpy.context.window.scene
names = globals().get("ONLY") or list(MODELS)
scenes = [build(n) for n in names]
if not globals().get("ONLY"):
    bpy.data.libraries.write(str(ROOT / "assets/blender/heat-pump-outdoor-units.blend"), set(scenes), fake_user=True)
bpy.context.window.scene = keep
