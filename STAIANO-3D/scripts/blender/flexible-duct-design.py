"""Editable 25 mm insulated hose, imported from the actual viewer mesh export.
Run export-flexible-duct.ts first. Nominal bore 160 mm, outside diameter 210 mm.
"""
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
data = json.loads((ROOT / 'output/verifiche-realismo/flexible-duct-design.json').read_text())
height = bpy.data.images.new('Alluminio spiegazzato', width=data['texture']['width'], height=data['texture']['height'])
height.colorspace_settings.name = 'Non-Color'
height.pixels.foreach_set([v / 255 for v in data['texture']['pixels']]); height.pack()

def material(name, color, metal, rough, bump=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if bump:
        tex = m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = height; tex.extension = 'REPEAT'
        node = m.node_tree.nodes.new('ShaderNodeBump'); node.inputs['Distance'].default_value = bump
        m.node_tree.links.new(tex.outputs['Color'], node.inputs['Height']); m.node_tree.links.new(node.outputs['Normal'], p.inputs['Normal'])
        if name == 'Guaina alluminio':
            scale = m.node_tree.nodes.new('ShaderNodeMath'); scale.operation = 'MULTIPLY'; scale.inputs[1].default_value = .45
            m.node_tree.links.new(tex.outputs['Color'], scale.inputs[0]); m.node_tree.links.new(scale.outputs[0], p.inputs['Roughness'])
    return m

foil = material('Guaina alluminio', (.62, .65, .66), .85, .4, .004)
steel = material('Fascetta metallica', (.62, .65, .66), .9, .3)
liner = material('Rivestimento interno', (.65, .64, .53), .25, .75, .0003)
fiber = material('Isolante 25 mm', (.63, .57, .40), 0, 1, .001)
scenes = []
for example in data['examples']:
    scene = bpy.data.scenes.new('Flessibile isolato ' + example['name']); scenes.append(scene)
    bpy.context.window.scene = scene
    for entry in example['meshes']:
        a = entry['positions']; indices = entry['indices']
        vertices = [(a[i], -a[i + 2], a[i + 1]) for i in range(0, len(a), 3)]
        faces = [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]
        mesh = bpy.data.meshes.new(entry['name']); mesh.from_pydata(vertices, [], faces); mesh.update()
        mesh.materials.append(foil if entry['name'] == 'Guaina' else liner if entry['name'] == 'Tubo_interno' else fiber)
        mesh.materials.append(steel)
        for group in entry['groups']:
            for index in range(group['start'] // 3, (group['start'] + group['count']) // 3):
                mesh.polygons[index].material_index = group['materialIndex']
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            i = loop.vertex_index * 2
            uv.data[loop.index].uv = (entry['uv'][i] * example['repeat'][0], entry['uv'][i + 1] * example['repeat'][1])
        for polygon in mesh.polygons: polygon.use_smooth = not entry['name'].startswith('Isolante')
        obj = bpy.data.objects.new(entry['name'], mesh); scene.collection.objects.link(obj)
    for index, mouth in enumerate(example['mouths']):
        p = mouth['point']; n = mouth['normal']
        point = Vector((p[0], -p[2], p[1])); normal = Vector((n[0], -n[2], n[1]))
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=example['diameterMm'] / 2000, depth=.06,
                                          end_fill_type='NOTHING', location=point + normal * .03)
        obj = bpy.context.object; obj.name = 'Collare dimostrativo ' + str(index)
        obj.rotation_mode = 'QUATERNION'; obj.rotation_quaternion = normal.to_track_quat('Z', 'Y')
        obj.data.materials.append(steel)
        for polygon in obj.data.polygons: polygon.use_smooth = True
    bpy.context.view_layer.update()
    for mouth in example['mouths']:
        p = mouth['point']; n = mouth['normal']
        point = Vector((p[0], -p[2], p[1])); normal = Vector((n[0], -n[2], n[1]))
        assert not scene.ray_cast(bpy.context.evaluated_depsgraph_get(), point - normal * .005, normal,
                                  distance=.01)[0], 'The air passage at the collar must remain uncapped'
    points = [o.matrix_world @ Vector(corner) for o in scene.objects if o.type == 'MESH' for corner in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3))); high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    centre = (low + high) / 2
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(camera)
    camera.location = centre + Vector((1.2, -2, 1)); camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = max(high - low) * 1.45; scene.camera = camera
    for name, offset, energy in [('Key', (-1, -2, 2), 250), ('Strip', (1, 1, 1), 180)]:
        light_data = bpy.data.lights.new(name, 'AREA'); light_data.energy = energy; light_data.size = 1.5
        light = bpy.data.objects.new(name, light_data); scene.collection.objects.link(light); light.location = centre + Vector(offset)
        light.rotation_euler = (centre - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.world = bpy.data.worlds.new('Studio'); scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (.5, .5, .5, 1)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 48
    scene.render.resolution_x = 1000; scene.render.resolution_y = 750; scene.render.resolution_percentage = 100
    scene.render.filepath = str(ROOT / 'output/verifiche-realismo' / ('flessibile-isolato-' + example['name'] + '.png'))
    bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(ROOT / 'assets/blender/flessibile-isolato-25mm.blend'), set(scenes), fake_user=True)
print('Saved editable insulated hose: 160 mm bore, 210 mm outside, open ends and mating collars')
