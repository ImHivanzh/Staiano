import bpy
import sys
from pathlib import Path
from mathutils import Matrix, Vector
root = Path(__file__).resolve().parents[1]
out = root / 'output' / 'verifiche-realismo'
out.mkdir(parents=True, exist_ok=True)
names = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ('edls-plenum-laterale', 'plenum-3-stacchi-realistic', 'edls-20-3', 'edls-20-3-bianca', 'edls-30-3', 'edfl-realistic-3', 'innova-sli-panel-realistic', 'innova-sli-core-realistic', 'innova-airleaf-sl-realistic', 'innova-airleaf-sls-realistic', 'innova-osmo-sl-realistic', 'aermec-fcz-p-po-realistic', 'u-match-ducted-realistic', 'ega6-realistic', 'ebl-realistic', 'egf-realistic', 'egf-push-realistic', 'egf-push-aperta', 'nordica-amika-ad-bianco', 'ravelli-flexi-7-bianco')
for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    folder = 'stoves' if name.startswith(('nordica','ravelli')) else 'gree' if name.startswith('u-match') else 'hvac' if name.endswith('-realistic') or name == 'egf-push-aperta' else 'ecoclima'
    asset = 'egf-push-realistic' if name == 'egf-push-aperta' else 'edls-20-3' if name == 'edls-20-3-bianca' else name
    bpy.ops.import_scene.gltf(filepath=str(root/'public/models'/folder/f'{asset}.glb'))
    if name == 'edls-20-3-bianca':
        for m in bpy.data.materials:
            if m.name.startswith(('Profile','Deflector')):
                shader=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                shader.inputs['Base Color'].default_value=(.87,.87,.86,1)
    if name == 'egf-push-aperta':
        pivot=Vector((0,0,.176))
        transform=Matrix.Translation(pivot) @ Matrix.Rotation(-.45,4,'X') @ Matrix.Translation(-pivot)
        for o in s.objects:
            if o.name.startswith(('Cornice_mobile','Pannello_forato')):
                o.matrix_world=transform @ o.matrix_world
        bpy.context.view_layer.update()
    meshes = [o for o in s.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (lo+hi)/2
    scale = max((hi-lo).x, (hi-lo).z*1.75)*(1.65 if name == 'egf-push-aperta' else 1.35)
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    s.collection.objects.link(camera)
    offset = (-1.1,-3.5,1.2) if name.startswith(('u-match','aermec')) else (.6,-3.5,-1.2) if name == 'edls-plenum-laterale' else (.6,-3.5,1.4)
    camera.location = center + Vector(offset)*scale
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'; camera.data.ortho_scale=scale; s.camera=camera
    for label, offset, energy in [('Key',(-2,-3,4),450), ('Fill',(3,-2,1),210)]:
        data=bpy.data.lights.new(label,'AREA'); data.energy=energy*scale**2; data.size=2*scale
        light=bpy.data.objects.new(label,data); s.collection.objects.link(light)
        light.location=center+Vector(offset)*scale
        light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    s.world=bpy.data.worlds.new('Studio'); s.world.color=(.25,.25,.25)
    s.render.engine='BLENDER_EEVEE'; s.render.resolution_x=1400; s.render.resolution_y=800; s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG'; s.render.filepath=str(out/f'{name}.png')
    bpy.ops.render.render(write_still=True)
