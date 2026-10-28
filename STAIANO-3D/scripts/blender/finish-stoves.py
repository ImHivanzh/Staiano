"""Rifinitura dei GLB delle stufe, da lanciare dopo i generatori: vetro con UV frontali
(per la fiamma) e occlusione ambientale cotta in una texture (UV 'AO').
Uso: blender -b --python-exit-code 1 --python finish-stoves.py -- [regex sul nome file]
Ignora i file già rifiniti. Cartella: STOVES_DIR (default public/models/stoves)."""
import math,os,re,struct,sys,time
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
folder=Path(os.environ.get('STOVES_DIR',root/'public/models/stoves'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
pattern=re.compile(args[0] if args else '.')
SIZE=512
def finished(path):
    data=path.read_bytes();return b'occlusionTexture' in data[20:20+struct.unpack('<I',data[12:16])[0]]
def is_glass(o):return any(s.material and 'vetro' in s.material.name.lower() for s in o.material_slots)
def front_uv(o):
    me=o.data;layer=me.uv_layers.active or me.uv_layers.new(name='UVMap')
    # Side glazing needs its horizontal UV along Y; front glazing uses X.
    axis=0 if o.dimensions.x>=o.dimensions.y else 1
    xs=[v.co[axis] for v in me.vertices];zs=[v.co.z for v in me.vertices];x0,z0=min(xs),min(zs);dx,dz=max(xs)-x0 or 1,max(zs)-z0 or 1
    for loop in me.loops:
        co=me.vertices[loop.vertex_index].co;layer.data[loop.index].uv=((co[axis]-x0)/dx,(co.z-z0)/dz)
def finish(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH']
    for o in meshes:
        if is_glass(o):front_uv(o)
        o.data.uv_layers.new(name='AO');o.data.uv_layers.active=o.data.uv_layers['AO']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
    # pavimento: occlude la base come farebbe il pavimento vero
    z0=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
    bpy.ops.mesh.primitive_plane_add(size=8,location=(0,0,z0-.0005));floor=bpy.context.object
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];floor.select_set(False)
    image=bpy.data.images.new('Occlusione',SIZE,SIZE);image.colorspace_settings.name='Non-Color'
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket('Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for m in {s.material for o in meshes for s in o.material_slots if s.material}:
        m.use_nodes=True;nodes,links=m.node_tree.nodes,m.node_tree.links
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='AO';tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(uv.outputs[0],tex.inputs['Vector'])
        sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0])
        out=nodes.new('ShaderNodeGroup');out.node_tree=group;links.new(sep.outputs[0],out.inputs['Occlusion']);nodes.active=tex
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48
    try:scene.world=bpy.data.worlds.new('Mondo');scene.world.light_settings.distance=.3
    except Exception:pass
    scene.render.bake.margin=6
    bpy.ops.object.bake(type='AO')
    bpy.data.objects.remove(floor)
    for o in meshes:o.select_set(True)
    for attempt in range(5):  # Windows a volte nega l'apertura del file mentre un altro processo lo legge
        try:bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_image_format='JPEG',export_jpeg_quality=70);break
        except RuntimeError:
            if attempt==4:raise
            time.sleep(2)
files=[p for p in sorted(folder.glob('*.glb')) if pattern.search(p.name)]
for i,path in enumerate(files):
    if finished(path):print(f'[{i+1}/{len(files)}] gia fatto {path.name}',flush=True);continue
    finish(path);print(f'[{i+1}/{len(files)}] {path.name}',flush=True)
