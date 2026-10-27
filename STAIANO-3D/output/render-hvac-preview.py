import bpy, math, os
from mathutils import Vector

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'output', 'anteprime-hvac')
os.makedirs(out, exist_ok=True)
models = ['plenum-3-stacchi', 'ega6', 'ebl', 'egf', 'egf-push', 'innova-sli', 'aermec-fcz-p-po', 'innova-osmo-sl']
for name in models:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, 'public', 'models', 'hvac', name + '.glb'))
    meshes = [o for o in s.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (lo + hi) / 2
    size = hi - lo
    scale = max(size.x, size.z * 1.4, size.y * 1.5) * 1.4
    def point_at(o): o.rotation_euler = (center - o.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    s.collection.objects.link(camera)
    camera.location = center + Vector((.38, -3.8, 1.1)) * scale
    point_at(camera); camera.data.type = 'ORTHO'; camera.data.ortho_scale = scale; s.camera = camera
    for label, offset, power in [('Key', (-2, -3, 4), 500), ('Fill', (3, -2, 1), 250)]:
        data = bpy.data.lights.new(label, 'AREA'); data.energy = power * scale**2; data.shape = 'DISK'; data.size = 2 * scale
        light = bpy.data.objects.new(label, data); s.collection.objects.link(light)
        light.location = center + Vector(offset) * scale; point_at(light)
    s.world = bpy.data.worlds.new('Studio')
    s.world.color = (.23, .25, .27)
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x = 900; s.render.resolution_y = 600; s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'PNG'
    s.render.filepath = os.path.join(out, name + '.png')
    bpy.ops.render.render(write_still=True)
