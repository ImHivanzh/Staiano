"""EDLS visible assembly reconstructed from Ecoclima's multislotted catalogue.

Run with Blender in background. Local axes: X length, Z face width, -Y visible face.
The gypsum shows the finished, skim-coated surface; the perforated fixing wings
are hidden beneath it. Generate separate 20/30 mm cross sections.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/ecoclima'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Ecoclima EDLS - sorgenti'


def material(name, color, metallic, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    return m


gypsum = material('Gypsum', (.88, .875, .855), 0, .92)
profile = material('Profile', (.035, .038, .041), .45, .43)
cavity = material('Cavity', (.012, .015, .017), .05, .8)
deflector = material('Deflector', (.035, .038, .041), .3, .48)


def box(coll, name, loc, dims, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(o.users_collection): c.objects.unlink(o)
    coll.objects.link(o)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Raccordo profilo', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return o


for slot_mm in (20, 30):
    for n in (1, 2, 3):
        slot = slot_mm / 1000
        pitch = slot + .020
        width = .040 + n * slot + (n - 1) * .020
        depth = .08 + (n - 1) * .04
        coll = bpy.data.collections.new(f'EDLS {n}F {slot_mm}mm')
        scene.collection.children.link(coll)
        # Solid rear wall only: openings are not obscured by a block at the face.
        box(coll, 'Cavity_rear', (0, depth/2-.002, 0), (1, .004, width-.04), cavity)
        for side in (-1, 1):
            box(coll, 'Gypsum_side', (0, -depth/2, side*(width/2-.01)), (1, .004, .020), gypsum)
            box(coll, 'Gypsum_end', (side*.497, -depth/2, 0), (.006, .004, width-.04), gypsum)
            box(coll, 'Profile_outer', (0, -depth/2+.004, side*(width/2-.021)), (.988, .010, .002), profile, .0004)
        for i in range(n):
            z = (i-(n-1)/2)*pitch
            for side in (-1, 1):
                box(coll, 'Profile_wall', (0, 0, z+side*(slot/2-.001)), (.988, depth-.004, .002), profile, .0004)
            box(coll, 'Deflector', (0, -depth/2+.014, z), (.984, .005, slot*.52), deflector, .0005)
            if i < n-1:
                box(coll, 'Profile_separator', (0, -depth/2+.003, z+pitch/2), (.988, .008, .020), profile, .0004)
        bpy.ops.object.select_all(action='DESELECT')
        for o in coll.objects: o.select_set(True)
        bpy.context.view_layer.objects.active = next(iter(coll.objects))
        bpy.ops.export_scene.gltf(filepath=str(OUT / f'edls-{slot_mm}-{n}.glb'), export_format='GLB', use_selection=True, use_active_scene=True)
        coll.hide_viewport = True
        coll.hide_render = True

for coll in scene.collection.children:
    coll.hide_viewport = False
    coll.hide_render = False
# Keep variants in distinct collections so dimensions and profiles remain editable.
scene.render.engine = 'BLENDER_EEVEE'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender/edls-realistic.blend'))
