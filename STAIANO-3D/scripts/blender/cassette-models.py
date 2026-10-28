"""LG ceiling cassettes reconstructed from the local official product photographs.

4 Way Cassette (MT06R): square panel, central grille, four outlets with vanes.
Round Cassette (UT36F): white ring, dark housing, annular outlet, diamond grille.
Saved catalogue dimensions are the model envelope; the viewer fits each saved unit to it.
Blender Z is up and the underside faces -Z (glTF -Y), like the previous procedural cassettes.
"""
import bmesh
import json
import math
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/cassettes'; OUT.mkdir(parents=True, exist_ok=True)
PREVIEW = ROOT / 'output/verifiche-realismo'; PREVIEW.mkdir(parents=True, exist_ok=True)
PHOTOS = {'4 Way Cassette': 'lg-4-way-cassette.png', 'Round Cassette': 'lg-round-cassette.png'}

def material(name, color, rough=.35, metal=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    return m

white = material('ABS bianco satinato', (.86, .87, .86), .38)
graphite = material('ABS grafite', (.035, .037, .04), .48)
recess = material('Interno scuro', (.012, .013, .015), .8)
steel = material('Lamiera zincata', (.55, .57, .58), .42, .7)

def link(scene, o, mat):
    for c in list(o.users_collection): c.objects.unlink(o)
    scene.collection.objects.link(o); o.data.materials.append(mat)
    for polygon in o.data.polygons: polygon.use_smooth = True
    return o

def box(scene, name, loc, dims, mat, bevel=.0008, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(scene, o, mat)
    if bevel:
        modifier = o.modifiers.new('Raccordi stampaggio', 'BEVEL'); modifier.width = min(bevel, min(dims) * .45); modifier.segments = 4
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=modifier.name)
    return o

def cut(scene, target, loc, dims):
    cutter = box(scene, 'Taglio', loc, dims, recess, 0)
    modifier = target.modifiers.new('Apertura', 'BOOLEAN'); modifier.object = cutter; modifier.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = target; bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

def revolve(scene, name, profile, mat, segments=120):
    """Closed (r, z) profile revolved about Z; smooth shaded."""
    mesh = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)) for i in range(segments)])
    for k in range(len(profile)):
        a, b = rings[k], rings[(k + 1) % len(profile)]
        for i in range(segments):
            j = (i + 1) % segments
            try: bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new(name, mesh); scene.collection.objects.link(o); o.data.materials.append(mat)
    for polygon in mesh.polygons: polygon.use_smooth = True
    return o

def four_way(scene, w, h, d):
    t = .030
    z0 = -h / 2
    body = box(scene, 'Corpo_lamiera', (0, 0, z0 + t + (h - t) / 2), (w * .86, d * .86, h - t), steel, .004)
    # hanging brackets on the corners and a small drain/refrigerant box, all inside the panel footprint
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(scene, 'Staffa_sospensione', (sx * w * .465, sy * d * .465, z0 + t + (h - t) * .82), (w * .07, d * .07, (h - t) * .22), steel, .002)
    box(scene, 'Scatola_collegamenti', (w * .20, d * .445, z0 + t + (h - t) * .35), (w * .20, d * .06, (h - t) * .45), steel, .002)
    panel = box(scene, 'Pannello_decorativo', (0, 0, z0 + t / 2), (w, d, t), white, .012)
    # central intake and four outlets are real openings through the panel
    cut(scene, panel, (0, 0, z0 + t / 2), (w * .54, d * .54, t * 2))
    for side in (-1, 1):
        cut(scene, panel, (0, side * d * .395, z0 + t / 2), (w * .72, d * .062, t * 2))
        cut(scene, panel, (side * w * .395, 0, z0 + t / 2), (w * .062, d * .72, t * 2))
    box(scene, 'Fondo_scuro', (0, 0, z0 + t + .0005), (w * .90, d * .90, .002), recess, 0)
    # grille: slats with cross ribs and a dark filter behind
    box(scene, 'Filtro_aria', (0, 0, z0 + t * .62), (w * .535, d * .535, .0015), graphite, 0)
    for i in range(21):
        box(scene, 'Lamella_ripresa', (0, ((i + .5) / 21 - .5) * d * .52, z0 + t * .42), (w * .54, d * .0105, t * .45), white, .0006)
    for x in (-.27, 0, .27):
        box(scene, 'Nervatura_ripresa', (x * w, 0, z0 + t * .45), (.005, d * .54, t * .5), white, .0008)
    box(scene, 'Cornice_ripresa', (0, 0, z0 + t * .5), (w * .565, d * .565, t * .26), white, .002)
    cut(scene, scene.objects['Cornice_ripresa'], (0, 0, z0 + t * .5), (w * .54, d * .54, t))
    # louvres inside each outlet, slightly inclined as in the product photograph
    for side in (-1, 1):
        box(scene, 'Deflettore_aria', (0, side * d * .402, z0 + t * .36), (w * .70, d * .052, .0025), white, .0006, rot=(side * math.radians(-14), 0, 0))
        box(scene, 'Deflettore_aria', (side * w * .402, 0, z0 + t * .36), (w * .052, d * .70, .0025), white, .0006, rot=(0, side * math.radians(14), 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=.011, depth=.003, vertices=32, location=(sx * (w / 2 - .034), sy * (d / 2 - .034), z0 - .0004))
            cap = link(scene, bpy.context.object, white); cap.name = 'Tappo_vite'
    box(scene, 'Ricevitore_display', (w * .40, -d * .435, z0 - .0004), (.034, .014, .0025), graphite, .0008)

def round_cassette(scene, w, h, d):
    R = w / 2; z0 = -h / 2; k = h / .33
    def p(*points): return [(r * R / .525, (z) * k) for r, z in points]
    revolve(scene, 'Corpo_scuro', p((0, .165), (.405, .165), (.422, .02), (.44, -.07), (0, -.07)), graphite)
    revolve(scene, 'Anello_bianco', p((.40, -.07), (.48, -.062), (.514, -.078), (.525, -.108), (.515, -.140), (.49, -.158), (.45, -.165), (.40, -.165)), white)
    revolve(scene, 'Anello_mandata_scuro', p((.343, -.1535), (.402, -.1535), (.402, -.1495), (.343, -.1495)), recess)
    revolve(scene, 'Bordo_griglia', p((.322, -.162), (.346, -.162), (.346, -.141), (.322, -.141)), white)
    revolve(scene, 'Fondo_griglia', p((0, -.133), (.33, -.133), (.33, -.1295), (0, -.1295)), recess)
    # diamond lattice: bars at +/-45 degrees clipped to the grille circle
    grille_r = .322 * R / .525; pitch = .0215 * R / .525; z = -.151 * k
    for sign in (1, -1):
        for n in range(-int(grille_r / pitch), int(grille_r / pitch) + 1):
            q = n * pitch; half = math.sqrt(max(grille_r ** 2 - q ** 2, 0)) * .985
            if half < pitch * .6: continue
            c = math.cos(math.radians(45)); s = math.sin(math.radians(45))
            # bar centre sits on the normal of the line, which is perpendicular to its direction
            cx, cy = (-q * s * sign, q * c) if sign == 1 else (q * s, q * c)
            box(scene, 'Rete_griglia', (cx, cy, z), (half * 2, .0021, .0055 * k), white, 0, rot=(0, 0, math.radians(45 * sign)))
    for index in range(4):
        a = math.radians(45 + 90 * index); r = R * .84
        box(scene, 'Staffa_scura', (math.cos(a) * r, math.sin(a) * r, .095 * k), (.05, .028, .06 * k), graphite, .003, rot=(0, 0, a))

BUILD = {'4 Way Cassette': four_way, 'Round Cassette': round_cassette}
catalog = json.loads((ROOT / 'catalog-data/generated/splits.json').read_text(encoding='utf-8'))
families = {}
for product in catalog['indoorUnits']:
    if product['mounting'] == 'ceiling': families.setdefault(product['family'], product)
assert set(families) == set(BUILD) == set(PHOTOS), 'Every ceiling family needs a generator and an inspected photo'
scenes = []; manifest = []
for family, product in families.items():
    photo = ROOT / 'public/catalog-assets/splits' / PHOTOS[family]; assert photo.is_file(), photo
    w, h, d = [product[key] / 1000 for key in ('widthMm', 'heightMm', 'depthMm')]
    scene = bpy.data.scenes.new('Cassetta ' + family); scenes.append(scene); bpy.context.window.scene = scene
    BUILD[family](scene, w, h, d)
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type == 'MESH': o.select_set(True)
    slug = family.lower().replace(' ', '-')
    bpy.ops.export_scene.gltf(filepath=str(OUT / (slug + '.glb')), export_format='GLB', use_selection=True, export_apply=True)
    manifest.append(dict(family=family, url='/models/cassettes/' + slug + '.glb', referenceModel=product['model'],
        dimensionsMm=[product[key] for key in ('widthMm', 'heightMm', 'depthMm')], photo='/catalog-assets/splits/' + PHOTOS[family]))
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(camera)
    mathutils = __import__('mathutils'); target = mathutils.Vector((0, 0, -h * .5))
    camera.location = target + mathutils.Vector((.45, -.78, -.42)).normalized() * max(w, d) * 2.1
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 50; scene.camera = camera
    for name, loc, energy in [('Key', (-1.2, -1.5, -1.8), 260), ('Fill', (1.6, 1.2, -1.2), 120)]:
        data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.size = 2
        o = bpy.data.objects.new(name, data); scene.collection.objects.link(o); o.location = loc
        o.rotation_euler = (-o.location).to_track_quat('-Z', 'Y').to_euler()
    scene.world = bpy.data.worlds.new('Studio'); scene.world.color = (.35, .35, .35)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 900; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    scene.render.filepath = str(PREVIEW / ('cassetta-' + slug + '.png')); bpy.ops.render.render(write_still=True)
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
bpy.data.libraries.write(str(ROOT / 'assets/blender/cassette-models.blend'), set(scenes), fake_user=True)
print(f'Saved {len(manifest)} cassette models and editable scenes')
