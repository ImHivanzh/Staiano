"""Render the first available finish of every catalogue stove from its actual viewer GLB.

Resumes existing renders. Optional -- start stop selects catalogue indices for close review.
Outputs preserve each source photo path and the measured exported dimensions for auditing.
"""
import json
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/verifiche-realismo/stoves'; OUT.mkdir(parents=True, exist_ok=True)
catalog = json.loads((ROOT / 'src/domain/catalogs/stoves.json').read_text(encoding='utf-8'))['products']
source = (ROOT / 'src/configurator/systems/StoveCatalog.tsx').read_text(encoding='utf-8')
block = source[source.index('const modelColors:'):source.index('const modelUrl')]
colors = {name: re.findall(r':\s*"([^"]+)"', values)
          for name, values in re.findall(r'"([^"]+)":\s*\{([^}]+)\}', block)}
missing = [p['id'] for p in catalog if not colors.get(p['id'])]
assert not missing, f'Catalogue products without mapped 3D finishes: {missing}'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
start = int(args[0]) if args else 0
stop = int(args[1]) if len(args) > 1 else len(catalog)
report = []
previous = {entry['id']: entry for entry in json.loads((OUT / 'index.json').read_text(encoding='utf-8'))} if (OUT / 'index.json').is_file() else {}
for index, product in enumerate(catalog):
    path = ROOT / 'public/models/stoves' / (product['id'] + '-' + colors[product['id']][0] + '.glb')
    photo = ROOT / 'public' / product['photo'].lstrip('/')
    assert path.is_file(), path
    assert photo.is_file(), photo
    output = OUT / (product['id'] + '.png')
    entry = dict(index=index, id=product['id'], name=product['name'], model=str(path.relative_to(ROOT)),
                 photo=product['photo'], sourceUrl=product['sourceUrl'], render=str(output.relative_to(ROOT)))
    current = output.is_file() and output.stat().st_mtime >= max(path.stat().st_mtime, Path(__file__).stat().st_mtime)
    if current and 'dimensionsM' in previous.get(product['id'], {}):
        entry['dimensionsM'] = previous[product['id']]['dimensionsM']
    report.append(entry)
    if index < start or index >= stop or current:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    size = high - low; centre = (high + low) / 2
    assert min(size) > 0 and max(size) < 5, f'Invalid model bounds: {product["id"]}: {size}'
    entry['dimensionsM'] = list(size)
    camera = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera')); scene.collection.objects.link(camera)
    camera.location = centre + Vector((max(size) * .9, -max(size) * 2.5, size.z * .35))
    camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = max(size.x * 1.3, size.z * 1.2, size.y * 1.3)
    scene.camera = camera
    for name, offset, energy in [('Key', (-1.5, -2, 2), 180), ('Fill', (2, -1, 1), 70)]:
        data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.size = 2
        light = bpy.data.objects.new(name, data); scene.collection.objects.link(light); light.location = centre + Vector(offset)
        light.rotation_euler = (centre - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.world = bpy.data.worlds.new('Review world'); scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (.25, .25, .25, 1)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 16
    scene.render.resolution_x = 540; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    projected = [world_to_camera_view(scene, camera, point) for point in points]
    extent = max(max(abs(point.x-.5), abs(point.y-.5))*2 for point in projected)
    camera.data.ortho_scale *= extent/.90
    assert all(.045 < point.x < .955 and .045 < point.y < .955
               for point in (world_to_camera_view(scene, camera, point) for point in points)), product['id']
    scene.render.filepath = str(output); bpy.ops.render.render(write_still=True)
    print(f'REVIEW {index + 1}/{len(catalog)} {product["id"]}', flush=True)
(OUT / 'index.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f'Catalogue: {len(catalog)} products; renders available: {sum((ROOT / e["render"]).is_file() for e in report)}')
