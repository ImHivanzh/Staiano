"""Editable Ecoclima grille reconstructions from product photos and dimensions."""
from pathlib import Path
import math
import bpy
from mathutils import Vector, noise

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='Griglie Ecoclima'


def mat(name, rgb, metal=0, rough=.5):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m


white=mat('Alluminio bianco RAL 9016',(.87,.87,.86),.2,.42)
aluminium=mat('Alluminio anodizzato',(.59,.62,.62),.65,.4)
shadow=mat('Interno',(.035,.04,.04),.05,.8)
filter_mat=mat('Filtro G2',(.58,.59,.57),0,.98)
hardware=mat('Cerniere e chiusura',(.19,.21,.21),.65,.5)

# Packed texture survives GLB export, unlike a procedural Noise shader.
fabric=bpy.data.images.new('Tessuto filtrante G2',width=256,height=256)
pixels=[]
for row in range(256):
    for col in range(256):
        value=.76 + .12*noise.noise(Vector((col*.12,row*.12,0))) + .06*noise.noise(Vector((col*.9,row*1.8,3)))
        pixels.extend((value,value,value*.98,1))
fabric.pixels.foreach_set(pixels); fabric.pack()
nodes=filter_mat.node_tree.nodes; links=filter_mat.node_tree.links
tex=nodes.new('ShaderNodeTexImage'); tex.image=fabric
links.new(tex.outputs['Color'],next(n for n in nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'])


def box(c, name, loc, dims, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for col in list(o.users_collection): col.objects.unlink(o)
    c.objects.link(o); o.data.materials.append(material)
    return o


def miter_frame(c, name, width, height, border, y, material):
    w,h=width/2,height/2; a,b=w-border,h-border
    strips=[ [(-w,h),(w,h),(a,b),(-a,b)], [(-w,-h),(-a,-b),(a,-b),(w,-h)],
             [(-w,-h),(-w,h),(-a,b),(-a,-b)], [(w,-h),(a,-b),(a,b),(w,h)] ]
    for poly in strips:
        vertices=[(x, yy, z) for yy in (y-.002,y+.002) for x,z in poly]
        faces=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
        o=bpy.data.objects.new(name,mesh); c.objects.link(o); o.data.materials.append(material)


def perforation(c, width, height, y):
    # 5 mm holes at 7 mm centres, in hexagonal cells that share their edges.
    vertices=[]; faces=[]; pitch=.007; rowstep=pitch*math.sqrt(3)/2
    rows=int((height-.006)/rowstep); cols=int((width-.007)/pitch)
    outer_radius=pitch/math.sqrt(3)
    for row in range(rows):
        z=(row-(rows-1)/2)*rowstep
        for col in range(cols):
            x=(col-(cols-1)/2 + .5*(row%2))*pitch
            start=len(vertices)
            # Hex vertices and their midpoints align with the 12-point circular hole.
            outer=[]
            for k in range(6):
                a=math.radians(30+60*k)
                outer.append((outer_radius*math.cos(a),outer_radius*math.sin(a)))
            for k in range(6):
                a=math.radians(30+60*k)
                vertices.append((x+.0025*math.cos(a),y,z+.0025*math.sin(a)))
                a+=math.pi/6
                vertices.append((x+.0025*math.cos(a),y,z+.0025*math.sin(a)))
            for k in range(6):
                p,q=outer[k],outer[(k+1)%6]
                vertices.append((x+p[0],y,z+p[1])); vertices.append((x+(p[0]+q[0])/2,y,z+(p[1]+q[1])/2))
            for k in range(12): faces.append((start+k,start+(k+1)%12,start+12+(k+1)%12,start+12+k))
    mesh=bpy.data.meshes.new('Fori tondi passo 7 mm'); mesh.from_pydata(vertices,[],faces); mesh.update()
    o=bpy.data.objects.new('Pannello_forato',mesh); c.objects.link(o); o.data.materials.append(white)


def filter_cartridge(c):
    media=box(c,'Filtro', (0,.013,0),(.525,.012,.325),filter_mat)
    uv=media.data.uv_layers.active or media.data.uv_layers.new(name='UVMap')
    for loop in media.data.loops:
        co=media.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(co.x/.525+.5,co.z/.325+.5)
    miter_frame(c,'Filtro_telaio',.545,.345,.010,.013,aluminium)
    # Protective wire net on the front of the removable 12 mm cartridge.
    for i in range(-12,13):
        box(c,'Filtro_rete', (i*.02,.006,0),(.0006,.0006,.325),hardware)
    for i in range(-7,8):
        box(c,'Filtro_rete', (0,.0055,i*.02),(.525,.0006,.0006),hardware)
    for x in (-.20,.20):
        for z in (-.17,.17):
            box(c,'Filtro_fermo',(x,.004,z),(.014,.003,.009),hardware)


for family in ('ega6','ebl','egf','egf-push'):
    c=bpy.data.collections.new(family.upper()); scene.collection.children.link(c)
    surface=aluminium if family in ('ega6','ebl') else white
    miter_frame(c,'Cornice_fissa',.6,.4,.024,-.021,surface)
    push=family=='egf-push'; filtered=push or family=='ega6'
    if filtered:
        filter_cartridge(c)
        # 2 mm visual clearance per side; the old frame touched the fixed opening.
        miter_frame(c,'Cornice_mobile',.548 if push else .552,.348 if push else .352,.016,-.023,surface)
        if push:
            for x in (-.25,.25):
                box(c,'Cerniera', (x,-.002,.169),(.014,.018,.012),hardware)
                box(c,'Chiusura_push', (x,-.006,-.169),(.014,.02,.02),hardware)
    else:
        box(c,'Interno', (0,.012,0),(.55,.012,.35),shadow)
    if family.startswith('egf'):
        perforation(c,.515 if push else .545,.315 if push else .345,-.026)
        miter_frame(c,'Pannello_forato_bordo',.52 if push else .552,.32 if push else .352,.007,-.026,white)
    else:
        slat_h=.026 if family=='ega6' else .011
        # EBL: foto ufficiale con circa 10 barre fisse per altezza (passo largo), non 27 lamelle sottili.
        # EGA6: foto ufficiale con circa 9 lamelle inclinate larghe, quasi sovrapposte, non 14 sottili.
        count=9 if family=='ega6' else 10
        for i in range(count):
            z=-.161+i*.322/(count-1)
            o=box(c,'Aletta', (0,-.014 if family=='ega6' else -.024,z),(.54,.046 if family=='ega6' else .013,.003 if family=='ega6' else .012),surface)
            if family=='ega6': o.rotation_euler.x=math.radians(45)
        if family=='ebl':
            # distanziali verticali vicino ai due lati, come nella foto del produttore
            for x in (-.235,.235): box(c,'Distanziale barre', (x,-.022,0),(.008,.012,.336),surface)
    bpy.ops.object.select_all(action='DESELECT')
    if push:
        hinge=bpy.data.objects.new('Asse_botola',None)
        hinge.location=(0,-.023,.174)
        c.objects.link(hinge)
    for o in c.objects: o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/hvac'/f'{family}-realistic.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    c.hide_viewport=True; c.hide_render=True

for c in scene.collection.children: c.hide_viewport=False; c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/ecoclima-grilles-realistic.blend'))
