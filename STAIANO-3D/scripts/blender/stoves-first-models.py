"""Individual stove models from catalogue photographs: Amika AD and Flexi 7.

The source contains unlit interiors; the product photographs show a lit fire.
"""
from pathlib import Path
import math
import bpy

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models/stoves'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Stufe - primi modelli'


def mat(name,color,metal=0,rough=.45):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


shell=mat('Rivestimento bianco',(.83,.84,.83),.12,.38)
black=mat('Acciaio nero',(.022,.025,.026),.35,.42)
door=mat('Cornice porta',(.009,.011,.012),.25,.26)
glass=mat('Vetro camino spento',(.018,.024,.025),.35,.12)
trim=mat('Dettagli metallo',(.22,.23,.23),.65,.36)


def link(coll,obj):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def box(coll,name,loc,dims,material,bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=link(coll,bpy.context.object); o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new('Bordi arrotondati','BEVEL'); b.width=bevel; b.segments=3
    return o


def cylinder(coll,name,loc,dims,material,vertices=96):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=1,depth=1,location=loc)
    o=link(coll,bpy.context.object); o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    b=o.modifiers.new('Bordo morbido','BEVEL'); b.width=.002; b.segments=3
    o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o


def arc_panel(coll,name,rx,ry,z0,z1,a0,a1,material,offset=.001):
    verts=[]; faces=[]; steps=56
    for z in (z0,z1):
        for i in range(steps+1):
            a=a0+(a1-a0)*i/steps
            verts.append(((rx+offset)*math.sin(a),-(ry+offset)*math.cos(a),z))
    for i in range(steps):faces.append((i,i+1,steps+2+i,steps+1+i))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); coll.objects.link(o); o.data.materials.append(material)
    for p in mesh.polygons:p.use_smooth=True
    return o


for ident,w,d,h in [('nordica-amika-ad',.460,.465,1.200),('ravelli-flexi-7',.530,.570,1.050)]:
    coll=bpy.data.collections.new(ident); scene.collection.children.link(coll)
    rx,ry=w/2,d/2; amika=ident.startswith('nordica')
    cylinder(coll,'Corpo', (0,0,h/2),(w,d,h-.025),shell)
    cylinder(coll,'Zoccolo', (0,0,.018),(w*.96,d*.96,.036),black)
    arc_panel(coll,'Pannello frontale nero',rx,ry,.018,h-.028,-.74 if amika else -.86,.74 if amika else .86,black)
    cylinder(coll,'Bordo superiore',(0,0,h-.02),(w,d,.035),shell if amika else black)
    cylinder(coll,'Coperchio pellet',(0,0,h-.001),(w*.64,d*.58,.008),black)
    # A flat glass door is slightly proud of the curved metal front, as in the photos.
    zdoor=h*(.49 if amika else .50)
    box(coll,'Cornice porta',(0,-ry-.005,zdoor),(w*(.46 if amika else .43),.012,h*(.38 if amika else .42)),door,.004)
    box(coll,'Vetro spento',(0,-ry-.012,zdoor+.025),(w*(.26 if amika else .30),.004,h*(.22 if amika else .27)),glass,.003)
    box(coll,'Maniglia porta',(w*(.245 if amika else .24),-ry-.014,zdoor+.025),(.012,.022,.10),black,.003)
    for i in range(5 if amika else 4):
        z=h-.050-i*.009
        arc_panel(coll,'Feritoia superiore',rx,ry,z,z+.003,-1.16,1.16,door,.003)
    if amika:
        for i in range(4):
            z=.032+i*.009
            arc_panel(coll,'Feritoia inferiore',rx,ry,z,z+.002,-1.16,-.72,door,.003)
            arc_panel(coll,'Feritoia inferiore',rx,ry,z,z+.002,.72,1.16,door,.003)
    else:
        for side in (-1,1):box(coll,'Divisione sportello',(side*w*.21,-ry-.003,h*.29),(.002,.006,h*.40),trim)
        for i in range(9):
            x=(i-4)*w*.055
            box(coll,'Griglia superiore',(x,-.035,h+.004),(w*.035,d*.31,.003),door,.0005)
    # Rear exhaust is hidden on the reference front photo but remains editable.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.04,depth=.035,location=(0,ry,h*.20),rotation=(math.pi/2,0,0))
    outlet=link(coll,bpy.context.object); outlet.name='Attacco fumi 80 mm'; outlet.data.materials.append(trim)
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(coll.objects))
    shader=next(n for n in shell.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    for label,rgb in [('bianco',(.83,.84,.83)),('nero',(.032,.035,.036))]:
        shell.diffuse_color=(*rgb,1); shader.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    shell.diffuse_color=(.83,.84,.83,1); shader.inputs['Base Color'].default_value=(.83,.84,.83,1)
    coll.hide_viewport=True; coll.hide_render=True

for coll in scene.collection.children:coll.hide_viewport=False; coll.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/stufe-amika-flexi.blend'))
