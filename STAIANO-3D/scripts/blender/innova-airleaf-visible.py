"""AirLeaf SL and SLS visual reconstructions from official Innova photographs."""
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Innova AirLeaf SL e SLS'


def mat(name,rgb,metal=.1,rough=.48):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


white=mat('Bianco mobile',(.86,.86,.85))
side=mat('Fianchi',(.77,.78,.77))
dark=mat('Interno griglia',(.035,.04,.04),0,.8)


def box(coll,name,loc,dims,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for col in list(o.users_collection):col.objects.unlink(o)
    coll.objects.link(o); o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Bordo raccordato','BEVEL'); mod.width=bevel; mod.segments=3
    return o


for family,h in [('sl',.579),('sls',.379)]:
    w,d=.935,.129
    c=bpy.data.collections.new('AirLeaf '+family.upper()); scene.collection.children.link(c)
    box(c,'Corpo', (0,0,0),(w,d,h),side,.005)
    box(c,'Pannello frontale',(0,-d/2-.001,.02),(w-.11,.003,h-.08),white,.001)
    intake_h=.075 if family=='sl' else .10
    z=-h/2+intake_h/2+.012
    box(c,'Ripresa inferiore',(0,-d/2-.002,z),(w-.16,.003,intake_h),dark)
    for i in range(8):
        box(c,'Aletta ripresa',(0,-d/2-.004,z-intake_h*.42+i*intake_h*.84/7),(w-.16,.003,.0025),white)
    box(c,'Uscita superiore',(0,0,h/2+.001),(w-.17,.07,.003),dark)
    for i in range(20):
        x=-(w-.20)/2+i*(w-.20)/19
        box(c,'Aletta mandata',(x,0,h/2+.003),(.003,.07,.003),white)
    for x in (-w/2+.029,w/2-.029):box(c,'Testata',(x,-.002,0),(.058,d,h),white,.003)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in c.objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac'/f'innova-airleaf-{family}-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    c.hide_render=True; c.hide_viewport=True
for c in scene.collection.children:c.hide_render=False; c.hide_viewport=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/innova-airleaf-visible.blend'))
