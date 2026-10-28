"""Editable Blender copies of the viewer geometry. First run export-terminal-plenums.ts.

Grille examples are illustrative 600 x 400 x 250 mm; EDSC-C 125 dimensions come
from the published accessory specification. Coordinates are converted from Three.js.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
examples = json.loads((ROOT / 'output/verifiche-realismo/terminal-plenums.json').read_text())

def material(name, color, metal, rough):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    return m

outside = material('Isolamento esterno', (.38, .55, .31), .08, .85)
metal = material('Lamiera zincata interna', (.55, .58, .58), .65, .45)

def collar(scene, port):
    direction = {'front': (0, -1, 0), 'rear': (0, 1, 0), 'top': (0, 0, 1),
                 'bottom': (0, 0, -1), 'left': (-1, 0, 0), 'right': (1, 0, 0)}[port['side']]
    n = Vector(direction); u = n.cross(Vector((1, 0, 0)) if abs(n.x) < .9 else Vector((0, 1, 0))).normalized()
    v = n.cross(u); centre = Vector((port['x'], -port['y'], port['z']))
    vertices = []
    for lead, radius in ((-.03, port['radius']), (.03, port['radius']),
                         (.03, port['radius'] - .0015), (-.03, port['radius'] - .0015)):
        for i in range(64):
            a = i * math.tau / 64
            vertices.append(centre + n * lead + (u * math.cos(a) + v * math.sin(a)) * radius)
    faces = [(row * 64 + i, row * 64 + (i + 1) % 64, ((row + 1) % 4) * 64 + (i + 1) % 64,
              ((row + 1) % 4) * 64 + i) for row in range(4) for i in range(64)]
    mesh = bpy.data.meshes.new('Collare cavo'); mesh.from_pydata(vertices, [], faces); mesh.update()
    mesh.materials.append(metal)
    obj = bpy.data.objects.new('Collare_' + port['side'], mesh); scene.collection.objects.link(obj)
    for polygon in mesh.polygons: polygon.use_smooth = polygon.index < 64 or 128 <= polygon.index < 192
    assert not obj.ray_cast(centre - n * .02, n, distance=.04)[0], 'Collar must remain open'

scenes = []
for example in examples:
    scene = bpy.data.scenes.new('Plenum ' + example['name']); scenes.append(scene)
    bpy.context.window.scene = scene
    for face in example['faces']:
        a = face['positions']
        vertices = [(a[i], -a[i + 2], a[i + 1]) for i in range(0, len(a), 3)]
        triangles = [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)]
        mesh = bpy.data.meshes.new(face['side']); mesh.from_pydata(vertices, [], triangles); mesh.update()
        mesh.materials.append(outside); mesh.materials.append(metal)
        for group in face['groups']:
            for index in range(group['start'] // 3, (group['start'] + group['count']) // 3):
                mesh.polygons[index].material_index = group['materialIndex']
        obj = bpy.data.objects.new('Lamiera_' + face['side'], mesh); scene.collection.objects.link(obj)
    for port in example['ports']: collar(scene, port)
    inlet = example['inlet']
    if 'radius' in inlet:
        collar(scene, dict(side='bottom', radius=inlet['radius'], x=0, y=0, z=-example['h'] / 2 - .03))
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(camera)
    # Look into the open face; the round outlet is visible from below.
    camera.location = (1, 1.6 if 'radius' in inlet else -1.6, -.9 if 'radius' in inlet else .65)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = (max(example['w'], example['h'], example['d']) + .12) * 1.6
    scene.camera = camera
    for name, loc, energy in [('Key', (-1, -2, 2), 200), ('Fill', (2, -1, -1), 90)]:
        data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.size = 2
        light = bpy.data.objects.new(name, data); scene.collection.objects.link(light); light.location = loc
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.world = bpy.data.worlds.new('Studio'); scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (.18, .18, .18, 1)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 32
    scene.render.resolution_x = 900; scene.render.resolution_y = 750; scene.render.resolution_percentage = 100
    scene.render.filepath = str(ROOT / 'output/verifiche-realismo' / ('plenum-' + example['name'] + '.png'))
    bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(ROOT / 'assets/blender/terminal-plenums-realistic.blend'), set(scenes), fake_user=True)
print('Saved three editable reference scenes from the actual viewer surfaces')
