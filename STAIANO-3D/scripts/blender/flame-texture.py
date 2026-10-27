"""Texture della fiamma (vetro focolare acceso): public/models/flame.png, 256x256, fondo nero."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=scene.render.resolution_y=256
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Standard'
scene.world=bpy.data.worlds.new('Nero');scene.world.color=(0,0,0)
bpy.ops.mesh.primitive_plane_add(size=1);plane=bpy.context.object
m=bpy.data.materials.new('Fiamma');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
def node(kind,**values):
    o=n.new(kind)
    for key,value in values.items():setattr(o,key,value)
    return o
coord=node('ShaderNodeTexCoord');sep=node('ShaderNodeSeparateXYZ');l.new(coord.outputs['UV'],sep.inputs[0])
# lingue di fuoco: rumore stirato in verticale, spostato verso l'alto lungo la risalita
mapping=node('ShaderNodeMapping');mapping.inputs['Scale'].default_value=(7,2.2,3);l.new(coord.outputs['UV'],mapping.inputs[0])
noise=node('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.2;noise.inputs['Detail'].default_value=6;noise.inputs['Roughness'].default_value=.62;l.new(mapping.outputs[0],noise.inputs['Vector'])
height=node('ShaderNodeMath',operation='MULTIPLY');height.inputs[1].default_value=1.15;l.new(sep.outputs['Y'],height.inputs[0])
fall=node('ShaderNodeMath',operation='SUBTRACT');fall.inputs[0].default_value=1.0;l.new(height.outputs[0],fall.inputs[1])
mix=node('ShaderNodeMath',operation='MULTIPLY');l.new(fall.outputs[0],mix.inputs[0]);l.new(noise.outputs['Fac'],mix.inputs[1])
boost=node('ShaderNodeMath',operation='MULTIPLY_ADD');l.new(fall.outputs[0],boost.inputs[0]);boost.inputs[1].default_value=.45;l.new(mix.outputs[0],boost.inputs[2])
add=boost
ramp=node('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(0,0,0,1);ramp.color_ramp.elements[1].position=1;ramp.color_ramp.elements[1].color=(1,.62,.12,1)
e=ramp.color_ramp.elements.new(.4);e.color=(.4,.025,0,1)
e=ramp.color_ramp.elements.new(.7);e.color=(.9,.2,.01,1)
l.new(add.outputs[0],ramp.inputs['Fac'])
emit=node('ShaderNodeEmission');l.new(ramp.outputs['Color'],emit.inputs['Color'])
out=node('ShaderNodeOutputMaterial');l.new(emit.outputs[0],out.inputs['Surface'])
plane.data.materials.append(m)
bpy.ops.object.camera_add(location=(0,0,2));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1;scene.camera=cam
scene.render.filepath=str(root/'public/models/flame.png');bpy.ops.render.render(write_still=True)
