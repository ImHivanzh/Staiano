"""Residential split / VRV outdoor unit casings, three size classes.

Reconstructed from the manufacturer photos kept in assets/references (unit view with side panel removed)
and from the Daikin / Mitsubishi / Gree / LG outdoor units in the catalogue: white sheet-steel casing with
rounded corners, top cover, black base rails with handle cut-outs, coil guards on the side and the back,
front panel with a service-cover seam, and a notch with the two copper service valves.
The fan and its grille are drawn by the viewer (OutdoorFan) so that the rotor stays circular and can spin;
each class therefore leaves a plain front plate where the fan sits. Saved unit dimensions are fitted by the viewer.
Blender: X width, Y depth with the front at -Y, Z up.
"""
import json
import math
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/outdoor'; OUT.mkdir(parents=True, exist_ok=True)
PREVIEW = ROOT / 'output/verifiche-realismo'; PREVIEW.mkdir(parents=True, exist_ok=True)
CLASSES = {  # name: (width, height, depth) in metres, representative catalogue sizes
    'compatta': (.83, .60, .33),
    'alta': (.95, 1.05, .40),
    'larga': (1.40, .94, .34),
}

def material(name, color, rough=.4, metal=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    return m

white = material('Lamiera verniciata bianca', (.82, .83, .82), .42, .08)
graphite = material('Basamento e griglie nere', (.035, .038, .042), .55, .2)
coil = material('Protezione batteria', (.62, .64, .65), .5, .35)
copper = material('Rame valvole', (.72, .38, .22), .3, 1)
dark = material('Interno scuro', (.012, .013, .015), .8)

def link(scene, o, mat):
    for c in list(o.users_collection): c.objects.unlink(o)
    scene.collection.objects.link(o); o.data.materials.append(mat)
    for polygon in o.data.polygons: polygon.use_smooth = True
    return o

def box(scene, name, loc, dims, mat, bevel=.0008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(scene, o, mat)
    if bevel:
        modifier = o.modifiers.new('Raccordi', 'BEVEL'); modifier.width = min(bevel, min(dims) * .45); modifier.segments = 4
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=modifier.name)
    return o

def cut(scene, target, loc, dims):
    cutter = box(scene, 'Taglio', loc, dims, dark, 0)
    modifier = target.modifiers.new('Apertura', 'BOOLEAN'); modifier.object = cutter; modifier.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = target; bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

def build(scene, w, h, d):
    foot = min(.03, h * .1); z0 = -h / 2
    # black base: two rails along the depth with handle cut-outs, and the base pan between them
    for sx in (-1, 1):
        rail = box(scene, 'Basamento_longherina', (sx * w * .32, 0, z0 + foot / 2), (min(.08, w * .12), d * .98, foot), graphite, .002)
        cut(scene, rail, (sx * w * .32, -d * .3, z0 + foot / 2), (min(.09, w * .13), d * .16, foot * .55))
        cut(scene, rail, (sx * w * .32, d * .3, z0 + foot / 2), (min(.09, w * .13), d * .16, foot * .55))
    box(scene, 'Basamento_vasca', (0, 0, z0 + foot + .006), (w * .985, d * .985, .012), graphite, .002)
    body_h = h - foot - .02
    casing = box(scene, 'Carcassa', (0, 0, z0 + foot + .012 + body_h / 2 - .006), (w, d, body_h), white, min(.018, w * .02))
    box(scene, 'Coperchio_superiore', (0, 0, h / 2 - .008), (w * 1.0, d * 1.0, .016), white, .006)
    box(scene, 'Guarnizione_coperchio', (0, 0, h / 2 - .0175), (w * .985, d * .985, .002), dark, 0)
    # notch for the service valves in the lower right front corner
    notch = (w * .12, d * .40, h * .17)
    nz = z0 + foot + .012 + notch[2] / 2 + .01
    cut(scene, casing, (w / 2 - notch[0] / 2 + .001, -d / 2 + notch[1] / 2 - .001, nz), notch)
    box(scene, 'Fondo_vano_valvole', (w / 2 - notch[0] + .0025, -d / 2 + notch[1] / 2, nz), (.003, notch[1] * .98, notch[2] * .98), graphite, 0)
    for index, radius in enumerate((.0064, .0095)):
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=notch[0] * .9, vertices=24,
            location=(w / 2 - notch[0] * .5 - .002, -d / 2 + notch[1] * (.28 + .38 * index), nz - notch[2] * .12), rotation=(0, math.pi / 2, 0))
        o = bpy.context.object; o.name = 'Valvola_rame'; link(scene, o, copper)
        bpy.ops.mesh.primitive_cylinder_add(radius=radius * 1.75, depth=.014, vertices=6,
            location=(w / 2 - .018, -d / 2 + notch[1] * (.28 + .38 * index), nz - notch[2] * .12), rotation=(0, math.pi / 2, 0))
        link(scene, bpy.context.object, copper).name = 'Dado_valvola'
    # front: plate where the fan sits, service cover seam, and a recessed carry handle on the right side
    plate_w = w * (.78 if w < 1.2 else .86)
    box(scene, 'Pannello_ventola', (-w / 2 + plate_w / 2 + .012, -d / 2 - .0015, z0 + foot + .012 + body_h / 2 - .006), (plate_w, .004, body_h - .035), white, .001)
    box(scene, 'Giunto_pannello', (-w / 2 + plate_w + .014, -d / 2 - .0012, z0 + foot + .012 + body_h / 2 - .006), (.003, .003, body_h - .02), dark, 0)
    cut(scene, casing, (w / 2 - .002, d * .08, h * .18), (.012, d * .30, h * .08))
    # coil guards on the left side and on the back: dark recess plus vertical white-steel slats
    pitch = .016
    for side, length, span in (('sinistra', d, d * .86), ('posteriore', w, w * .90)):
        n = int(span / pitch)
        if side == 'sinistra':
            box(scene, 'Fondo_batteria', (-w / 2 - .0005, 0, z0 + foot + .012 + body_h * .5 - .006), (.002, span, body_h * .8), dark, 0)
            for i in range(n):
                box(scene, 'Lamella_batteria', (-w / 2 - .0015, (i / (n - 1) - .5) * span, z0 + foot + .012 + body_h * .5 - .006), (.002, .0075, body_h * .8), coil, 0)
        else:
            box(scene, 'Fondo_batteria', (0, d / 2 + .0005, z0 + foot + .012 + body_h * .5 - .006), (span, .002, body_h * .8), dark, 0)
            for i in range(n):
                box(scene, 'Lamella_batteria', ((i / (n - 1) - .5) * span, d / 2 + .0015, z0 + foot + .012 + body_h * .5 - .006), (.0075, .002, body_h * .8), coil, 0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=.0045, depth=.0015, vertices=16, location=(sx * (w / 2 - .02), sy * (d / 2 - .02), h / 2 + .0002))
            link(scene, bpy.context.object, graphite).name = 'Vite_coperchio'

scenes = []; manifest = []
for name, (w, h, d) in CLASSES.items():
    scene = bpy.data.scenes.new('Unita esterna ' + name); scenes.append(scene); bpy.context.window.scene = scene
    build(scene, w, h, d)
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type == 'MESH': o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'unita-esterna-{name}.glb'), export_format='GLB', use_selection=True, export_apply=True)
    manifest.append(dict(shell=name, url=f'/models/outdoor/unita-esterna-{name}.glb', referenceMm=[round(w * 1000), round(h * 1000), round(d * 1000)]))
    mathutils = __import__('mathutils'); camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(camera)
    target = mathutils.Vector((0, 0, 0)); camera.location = target + mathutils.Vector((-.8, -1.0, .45)).normalized() * max(w, h) * 2.4
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler(); camera.data.lens = 50; scene.camera = camera
    for lname, loc, energy in [('Key', (-2, -2.5, 2.5), 320), ('Fill', (2.5, -1, 1), 140)]:
        data = bpy.data.lights.new(lname, 'AREA'); data.energy = energy; data.size = 2
        o = bpy.data.objects.new(lname, data); scene.collection.objects.link(o); o.location = loc
        o.rotation_euler = (-o.location).to_track_quat('-Z', 'Y').to_euler()
    scene.world = bpy.data.worlds.new('Studio'); scene.world.color = (.35, .35, .35)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 20; scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 900; scene.render.resolution_y = 700
    scene.render.filepath = str(PREVIEW / f'unita-esterna-{name}.png'); bpy.ops.render.render(write_still=True)
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
bpy.data.libraries.write(str(ROOT / 'assets/blender/unita-esterne-split-vrv.blend'), set(scenes), fake_user=True)
print(f'Saved {len(manifest)} outdoor unit shells')
