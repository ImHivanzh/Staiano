"""Varianti con forma documentata affine ai modelli DAHIANA e ANGELICA."""
from pathlib import Path
import bpy

root=Path(__file__).resolve().parents[2]
specs=[
    ('nordica-teorema-ad','nordica-dahiana-ad',.652/.602,'stufa-teorema-ad.blend'),
    ('nordica-angelica-plus-evo','nordica-angelica-evo',1.0,'stufa-angelica-plus-evo.blend'),
]
for target,source,depth_scale,blendfile in specs:
    for finish in ('avorio','bordeaux','nero'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves'/f'{source}-{finish}.glb'))
        for obj in bpy.context.scene.objects:
            obj.location.y *= depth_scale; obj.scale.y *= depth_scale
        if target=='nordica-teorema-ad':
            shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento nordica-dahiana-ad'))
            bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.652*.40,1.063))
            lip=bpy.context.object; lip.name='Bordo frontale superiore'; lip.dimensions=(.525,.652*.20,.030)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); lip.data.materials.append(shell)
            bevel=lip.modifiers.new('Bordi','BEVEL'); bevel.width=.009; bevel.segments=3
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{target}-{finish}.glb'),export_format='GLB',use_selection=True,export_apply=True)
        if finish=='avorio':
            bpy.context.preferences.filepaths.save_version=0
            bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/blendfile))
