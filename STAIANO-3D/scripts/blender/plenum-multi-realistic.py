"""Galvanized rectangular plenum with three open round takeoffs."""
from pathlib import Path
import bpy, math

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Plenum zincato tre stacchi'


def material(name,color,metal,rough):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


sheet=material('Acciaio zincato',(.47,.50,.50),.75,.4)
dark=material('Interno ombreggiato',(.035,.04,.04),.05,.9)


def box(name,loc,dims,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    return o


length,depth,height=.8,.3,.25
box('Fondo',(0,depth/2,0),(length,.002,height),sheet)
box('Ombra interna',(0,depth/2-.002,0),(length-.004,.001,height-.004),dark)
for x in (-length/2,length/2):box('Fianco',(x,0,0),(.002,depth,height),sheet)
for z in (-height/2,height/2):box('Coperchio',(0,0,z),(length,depth,.002),sheet)
face=box('Pannello forato',(0,-depth/2,0),(length,.002,height),sheet)
for x in (-.24,0,.24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.079,depth=.015,location=(x,-depth/2,0),rotation=(math.pi/2,0,0))
    cutter=bpy.context.object
    m=face.modifiers.new('Apertura stacco','BOOLEAN'); m.operation='DIFFERENCE'; m.object=cutter
    bpy.context.view_layer.objects.active=face; bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    verts=[]; faces=[]
    for y,r in ((-depth/2,.08),(-depth/2-.08,.08),(-depth/2-.08,.0785),(-depth/2,.0785)):
        for i in range(64):
            a=math.tau*i/64; verts.append((x+r*math.cos(a),y,r*math.sin(a)))
    for j in range(3):
        for i in range(64):faces.append((j*64+i,j*64+(i+1)%64,(j+1)*64+(i+1)%64,(j+1)*64+i))
    mesh=bpy.data.meshes.new('Collare cavo'); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new('Stacco aperto',mesh); scene.collection.objects.link(o); o.data.materials.append(sheet)
    for p in mesh.polygons:p.use_smooth=True

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac/plenum-3-stacchi-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/plenum-multi-realistic.blend'))
