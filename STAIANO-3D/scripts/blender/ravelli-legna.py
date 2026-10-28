"""Seven Ravelli wood stoves, reconstructed from public/catalogs/stoves photographs.

Catalogue envelopes are retained; sheet gauges and concealed chambers are illustrative.
Curved doors, recessed glazing and open log stores belong to the source, not a GLB patch.
"""
from pathlib import Path
import math
import random
import json
import bpy
import bmesh
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
technical = {p['id']: p for p in json.loads((root/'catalog-data/generated/stoves-technical.json').read_text(encoding='utf-8'))['products']}
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=.4, metal=0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*rgb, 1)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    return material


black = mat('Acciaio antracite', (.022, .024, .026), .38, .25)
dark = mat('Interno focolare', (.005, .006, .007), .7)
glass = mat('Vetro spento', (.009, .012, .014), .12)
handle = mat('Maniglia satinata', (.36, .35, .32), .25, .85)
brass = mat('Ottone maniglia', (.50, .32, .10), .25, .85)
stone = mat('Pietra grigia', (.43, .44, .44), .8)
image = bpy.data.images.new('Grana pietra', width=256, height=256)
rng = random.Random(123)
pixels = []
for _ in range(256 * 256):
    value = max(.25, min(.65, rng.gauss(.43, .035)))
    pixels.extend((value, value * 1.01, value, 1))
image.pixels = pixels
image.pack()
texture = stone.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
stone.node_tree.links.new(texture.outputs['Color'], next(n for n in stone.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'])


def stone_uv(obj):
    uv = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        normal_axis = max(range(3), key=lambda i: abs(polygon.normal[i]))
        axes = [i for i in range(3) if i != normal_axis]
        for index in polygon.loop_indices:
            co = obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv = (co[axes[0]]*4, co[axes[1]]*4)


def mesh(collection, name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(material)
    uv = data.uv_layers.new(name='UVMap')
    low = [min(vertex[i] for vertex in vertices) for i in range(3)]
    span = [max(vertex[i] for vertex in vertices) - low[i] for i in range(3)]
    horizontal = 0 if span[0] > span[1] else 1
    for loop in data.loops:
        co = data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co[horizontal] - low[horizontal]) / (span[horizontal] or 1), (co.z - low[2]) / (span[2] or 1))
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    if material == stone:
        stone_uv(obj)
    return obj


def box(collection, name, location, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Bordo', 'BEVEL')
        modifier.width = min(bevel, min(size) * .4)
        modifier.segments = 4
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.modifiers.new('Normali', 'WEIGHTED_NORMAL')
    if material == stone:
        stone_uv(obj)
    return obj


def rounded(width, height, radius, z):
    """Matching edge samples also resolve the curved frontage."""
    corners = [(width/2-radius, height/2-radius, 0), (-width/2+radius, height/2-radius, 90),
               (-width/2+radius, -height/2+radius, 180), (width/2-radius, -height/2+radius, 270)]
    points = []
    for index, (x, y, angle) in enumerate(corners):
        for step in range(9):
            a = math.radians(angle + step * 90/8)
            points.append((x + radius * math.cos(a), z + y + radius * math.sin(a)))
        start = points[-1]
        nx, ny, na = corners[(index+1) % 4]
        end = (nx + radius * math.cos(math.radians(na)), z + ny + radius * math.sin(math.radians(na)))
        for step in range(1, 17):
            points.append(tuple(start[i] + (end[i]-start[i]) * step/17 for i in range(2)))
    return points


def panel(collection, name, width, height, z, front, material, hole=None, thickness=.006, offset=0):
    outer = rounded(width, height, min(.012, height*.04), z)
    count = len(outer)
    if hole:
        inner = rounded(hole[0], hole[1], .012, hole[2])
        vertices = [(x, front(x)+offset+dy, zz) for dy in (0, thickness) for outline in (outer, inner) for x, zz in outline]
        faces = []
        for i in range(count):
            j = (i+1) % count
            faces.extend([(i, j, count+j, count+i), (2*count+i, 3*count+i, 3*count+j, 2*count+j),
                          (i, 2*count+i, 2*count+j, j), (count+i, count+j, 3*count+j, 3*count+i)])
    else:
        # Rings keep the glazing curved instead of triangulating a flat chord.
        vertices = []
        rings = 8
        for dy in (0, thickness):
            for ring in range(1, rings+1):
                fraction = ring/rings
                vertices.extend((x*fraction, front(x*fraction)+offset+dy, z+(zz-z)*fraction) for x, zz in outer)
        faces = []
        layer = rings*count
        for base in (0, layer):
            faces.append(tuple(base+i for i in range(count)))
            for ring in range(rings-1):
                for i in range(count):
                    j = (i+1) % count
                    a = base+ring*count
                    faces.append((a+i, a+j, a+count+j, a+count+i))
        for i in range(count):
            j = (i+1) % count
            a = layer-count
            faces.append((a+i, a+j, a+j+layer, a+i+layer))
    obj = mesh(collection, name, vertices, faces, material)
    for polygon in obj.data.polygons:
        # Sheet edges stay hard: smoothing them into the face makes a padded pillow.
        polygon.use_smooth = polygon.index % 4 < 2 if hole else polygon.index < len(faces)-count
    return obj


def cap(collection, name, width, depth, z, thickness, bow, material):
    outline = [(-width/2, depth/2), (width/2, depth/2)]
    outline.extend((width/2 - width*i/64, -depth/2 + bow*((width/2-width*i/64)/(width/2))**2) for i in range(65))
    count = len(outline)
    vertices = [(x, y, zz) for zz in (z, z+thickness) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count*2))]
    faces.extend((i, (i+1) % count, (i+1) % count+count, i+count) for i in range(count))
    return mesh(collection, name, vertices, faces, material)


def flue(collection, diameter, y, bottom, top):
    count = 64
    vertices = [(radius*math.cos(i*math.tau/count), y+radius*math.sin(i*math.tau/count), z)
                for z in (bottom, top) for radius in (diameter/2, diameter/2-.002) for i in range(count)]
    faces = []
    for i in range(count):
        j = (i+1) % count
        faces.extend([(i, j, 2*count+j, 2*count+i), (count+i, 3*count+i, 3*count+j, count+j),
                      (2*count+i, 2*count+j, 3*count+j, 3*count+i), (i, count+i, count+j, j)])
    return mesh(collection, 'Collare fumi aperto', vertices, faces, black)


specs = [('ravelli-dafne-view', 'view'), ('ravelli-dafne', 'closed'), ('ravelli-minerva', 'wide'),
         ('ravelli-minerva-stone', 'wide-stone'), ('ravelli-calliope-stone', 'stone'),
         ('ravelli-thor', 'thor'), ('ravelli-efesto', 'efesto')]

for ident, kind in specs:
    dimensions = technical[ident]['dimensionsMm']
    w, d, h = (dimensions[key]/1000 for key in ('widthMm', 'depthMm', 'heightMm'))
    collection = bpy.data.collections.new(ident)
    bpy.context.scene.collection.children.link(collection)
    feet = kind in ('thor', 'efesto')
    stone_sides = 'stone' in kind
    log_store = kind in ('view', 'wide-stone')
    base = h*.23 if feet else 0
    top = h-.025
    bow = 0 if feet else d*(.14 if kind.startswith('wide') else .20)
    # Recess the shell so the handle stays inside the catalogue depth.
    front = lambda x: -d/2+.018 + bow*(x/(w/2))**2
    body_top = top-.016
    body_height = body_top-base
    side_width = w*(.11 if stone_sides else .07)
    for side in (-1, 1):
        if kind == 'view':
            side_panel = panel(collection, 'Montante finestra laterale', d*.70, body_height, (base+body_top)/2,
                               lambda x: 0, black, (d*.28, h*.34, h*.64), .008)
            side_glass = panel(collection, 'Vetro laterale', d*.28+.004, h*.34+.004, h*.64,
                               lambda x: 0, glass, thickness=.003, offset=.010)
            for obj in (side_panel, side_glass):
                for vertex in obj.data.vertices:
                    x, y, z = vertex.co
                    vertex.co = (side*(w/2-.002-y), x+d*.10, z)
                bm = bmesh.new()
                bm.from_mesh(obj.data)
                bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
                bm.to_mesh(obj.data)
                bm.free()
        else:
            box(collection, 'Fianco pietra' if stone_sides else 'Fianco acciaio',
                (side*(w/2-side_width/2), .018, (base+body_top)/2),
                (side_width, d-.036, body_height), stone if stone_sides else black, .004)
    box(collection, 'Schienale', (0, d/2-.005, (base+body_top)/2), (w-.012, .010, body_height), black)
    cap(collection, 'Base vano legna' if log_store else 'Zoccolo', w-.008, d-.012, base, .014, bow, black)
    cover = cap(collection, 'Coperchio pietra' if stone_sides else 'Coperchio', w, d-.002, top-.016, .016, bow, stone if stone_sides else black)
    diameter = technical[ident]['flueDiameterMm']/1000
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=diameter/2-.002, depth=.08, location=(0, d*.16, top))
    cutter = bpy.context.object
    modifier = cover.modifiers.new('Apertura scarico', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.object = cutter
    bpy.context.view_layer.objects.active = cover
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    flue(collection, diameter, d*.16, top-.001, h)
    if feet:
        for side in (-1, 1):
            for rear in (-1, 1):
                obj = box(collection, 'Piede rastremato', (side*w*.40, rear*d*.35, base/2), (.032, .038, base), black)
                for vertex in obj.data.vertices:
                    scale = .72 if vertex.co.z < 0 else 1
                    vertex.co.x *= scale
                    vertex.co.y *= scale
        cap(collection, 'Cornice appoggio', w, d-.002, base, .018, 0, black)
        door_width, door_height = w*.85, body_height*.88
        door_z = base+body_height*.51
        glazing = (w*.63, body_height*.61, base+body_height*.53)
    else:
        door_width, door_height = w-side_width*2-.008, h*.59
        door_z = h*.648
        glazing = (w*.54 if kind in ('view', 'closed') else door_width*.80,
                   h*(.32 if kind.startswith('wide') else .35), h*.66)
        if not log_store:
            panel(collection, 'Sportello inferiore', door_width, h*.29, h*.18, front, black)
        else:
            cap(collection, 'Cielo vano legna', w-side_width*2, d-.026, h*.345, .010, bow, dark)
    panel(collection, 'Porta curva' if bow else 'Porta', door_width, door_height, door_z, front, black, glazing)
    panel(collection, 'Vetro sportello', glazing[0]+.004, glazing[1]+.004, glazing[2], front, glass, thickness=.003, offset=.008)
    box(collection, 'Fondo focolare', (0, d*.22, glazing[2]), (glazing[0]+.01, .010, glazing[1]+.02), dark)
    cap(collection, 'Piano focolare', door_width-.012, d*.68, glazing[2]-glazing[1]/2-.016, .008, bow*.5, dark)
    hz = base+body_height*.51 if feet else h*.35
    hx = -door_width*.43 if feet else door_width*.44
    box(collection, 'Maniglia', (hx, front(hx)-.006, hz), (.060 if feet else .046, .012, .012), brass if feet else handle)
    for z in (door_z-door_height*.34, door_z+door_height*.34):
        box(collection, 'Cerniera', (door_width*.49, front(door_width*.49)+.002, z), (.010, .012, .026), black)
    if kind == 'efesto':
        box(collection, 'Cassetto cenere', (0, 0, base*.70), (w*.69, d*.58, .040), dark)
    bpy.context.view_layer.update()
    assert not cover.ray_cast(Vector((0, d*.16, h+.01)), Vector((0, 0, -1)), distance=.08)[0], (ident, 'capped flue')
    glass_obj = next(obj for obj in collection.objects if obj.name.startswith('Vetro sportello'))
    origin = Vector((0, -d/2-.1, glazing[2]))
    assert glass_obj.ray_cast(glass_obj.matrix_world.inverted() @ origin, Vector((0, 1, 0)), distance=d)[0]
    for obj in collection.objects:
        if obj == glass_obj or obj.type != 'MESH':
            continue
        hit, point, *_ = obj.ray_cast(obj.matrix_world.inverted() @ origin, Vector((0, 1, 0)), distance=d)
        if hit:
            assert (obj.matrix_world @ point).y > front(0)+.011, (ident, obj.name, 'blocks glazing')
    if log_store:
        origin = Vector((0, -d/2-.1, h*.18))
        for obj in collection.objects:
            if obj.type != 'MESH':
                continue
            hit, point, *_ = obj.ray_cast(obj.matrix_world.inverted() @ origin, Vector((0, 1, 0)), distance=d)
            if hit:
                assert (obj.matrix_world @ point).y > 0, (ident, obj.name, 'closes log store')
    points = [obj.matrix_world @ Vector(corner) for obj in collection.objects if obj.type == 'MESH' for corner in obj.bound_box]
    measured = [max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
    assert all(abs(a-b) < .0021 for a, b in zip(measured, (w, d, h))), (ident, measured)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = glass_obj
    label = 'grigio' if stone_sides else 'nero'
    bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'), export_format='GLB', use_selection=True, export_apply=True)
    print('VERIFIED', ident, measured, flush=True)
    collection.hide_viewport = True
    collection.hide_render = True

for collection in bpy.context.scene.collection.children:
    collection.hide_viewport = False
    collection.hide_render = False
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-legna.blend'))
