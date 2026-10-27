"""EDFL: natural aluminium frame, black adjustable vanes and 20 mm slots."""
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Ecoclima EDFL'


def mat(name,rgb,metal,rough):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


profile=mat('Profile',(.55,.58,.58),.7,.42)
vanes=mat('Deflector',(.025,.03,.03),.3,.5)
cavity=mat('Cavity',(.01,.012,.012),0,.8)


def box(c,name,loc,dims,m):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for col in list(o.users_collection): col.objects.unlink(o)
    c.objects.link(o); o.data.materials.append(m)
    b=o.modifiers.new('Bordi del profilo','BEVEL'); b.width=.0005; b.segments=2
    return o


for n in range(1,7):
    width=.07+(n-1)*.04; depth=.052; slot=.020; pitch=.040
    c=bpy.data.collections.new(f'EDFL {n}F'); scene.collection.children.link(c)
    box(c,'Cavity_rear',(0,depth/2-.002,0),(1,.004,width-.05),cavity)
    for s in (-1,1):
        box(c,'Profile_side',(0,-depth/2,s*(width/2-.0125)),(1,.004,.025),profile)
        box(c,'Profile_end',(s*.494,-depth/2,0),(.012,.004,width-.05),profile)
    for i in range(n):
        z=(i-(n-1)/2)*pitch
        for s in (-1,1): box(c,'Profile_wall',(0,0,z+s*(slot/2-.001)),(.976,depth-.004,.002),profile)
        box(c,'Deflector',(0,-depth/2+.011,z),(.974,.004,.011),vanes)
        if i<n-1: box(c,'Profile_separator',(0,-depth/2+.001,z+pitch/2),(.976,.006,.020),profile)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in c.objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ecoclima'/f'edfl-realistic-{n}.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    c.hide_render=True; c.hide_viewport=True
for c in scene.collection.children:c.hide_render=False; c.hide_viewport=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/edfl-realistic.blend'))
