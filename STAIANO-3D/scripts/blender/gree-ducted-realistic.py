"""Refine the GUD71PHS1/A-S casing after the official Gree product photograph."""
from pathlib import Path
import math
import bpy
from mathutils import Matrix

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Gree GUD71PHS1'
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/gree/u-match-ducted-reference.glb'))


def color(material, rgb, rough=.65):
    material.diffuse_color=(*rgb,1)
    if material.use_nodes:
        p=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if p:
            p.inputs['Base Color'].default_value=(*rgb,1)
            p.inputs['Roughness'].default_value=rough


for m in bpy.data.materials:
    if m.name.startswith('Ducted - air passage'): color(m,(.005,.012,.016),.84)
    if m.name.startswith('Ducted - interior'): color(m,(.006,.025,.040),.78)

inside=bpy.data.objects.get('Gree - passage interior')
if inside:
    # Recess the sloping evaporator behind the opening instead of a flat bright insert.
    inside.rotation_euler.x=math.radians(-18)
    inside.location.y=-.195

sheet=next(m for m in bpy.data.materials if m.name.startswith('Ducted - galvanized sheet'))
dark=next(m for m in bpy.data.materials if m.name.startswith('Ducted - air passage'))
brass=next(m for m in bpy.data.materials if m.name.startswith('Ducted - brass'))


def screw(name,loc,axis='Y',material=dark,radius=.0025,depth=.001):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=depth,location=loc)
    o=bpy.context.object; o.name=name
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    o.data.materials.append(material)


for z in (-.09,.09):
    for x in (-.39,-.33,.425): screw('Vite cornice',(x,-.254,z))
for z in (-.09,.09):
    for y in (-.18,.16): screw('Vite fianco',(-.411,y,z),'X')
for z,y,r in ((.035,-.10,.010),(-.020,-.04,.009),(-.060,.04,.008)):
    screw('Estremita raccordo',(-.444,y,z),'X',brass,r,.014)

# Match the published 900 x 655 x 260 mm casing before app-side sizing.
scale=Matrix.Diagonal((.900/.860,.655/.500,1,1))
for obj in scene.objects:
    if obj.type == 'MESH': obj.matrix_world=scale @ obj.matrix_world
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/gree/u-match-ducted-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/gree-gud71-realistic.blend'))
