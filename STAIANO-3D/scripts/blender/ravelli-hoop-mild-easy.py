"""HOOP, MILD ed EASY: frontali e aperture dalle foto ufficiali del catalogo.
Quote dal catalogo tecnico; raggi, lamiere e camere interne sono ricostruzioni visive.
"""
from pathlib import Path
import math,json
import bpy,bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
technical={p['id']:p for p in json.loads((root/'catalog-data/generated/stoves-technical.json').read_text(encoding='utf-8'))['products']}

def mat(name,rgb,rough=.4,metal=.12):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
black=mat('Struttura nera',(.018,.020,.021));dark=mat('Cornice',(.006,.007,.008),.3)
glass=mat('Vetro spento',(.009,.012,.014),.12,0)

def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=min(bevel,min(size)*.45);b.segments=5
        bpy.ops.object.modifier_apply(modifier=b.name);o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o

def outline(w,h,r):
    points=[];r=min(r,w/2,h/2)
    for x,z,a in ((w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)):
        for i in range(17):
            angle=math.radians(a+i*90/16);point=(x+r*math.cos(angle),z+r*math.sin(angle))
            if not points or math.dist(points[-1],point)>1e-7:points.append(point)
    if math.dist(points[0],points[-1])<1e-7:points.pop()
    return points

def prism(c,name,points,low,high,m,portrait=False):
    vertices=[(x,t,z) if portrait else (x,z,t) for t in (low,high) for x,z in points];n=len(points)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    data.materials.append(m)
    for p in data.polygons:
        # Flat sheets keep their normals; only the short corner arcs are smoothed.
        p.use_smooth=p.index>=2 and math.dist(points[p.index-2],points[(p.index-1)%n])<.015
    uv=data.uv_layers.new(name='UVMap')
    x0=min(v[0] for v in vertices);z0=min(v[2] for v in vertices)
    w=max(v[0] for v in vertices)-x0;h=max(v[2] for v in vertices)-z0
    for loop in data.loops:
        co=data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((co.x-x0)/(w or 1),(co.z-z0)/(h or 1))
    obj=bpy.data.objects.new(name,data);c.objects.link(obj);return obj

def plan(c,name,w,d,bottom,top,m,r=.03):
    return prism(c,name,outline(w,d,r),bottom,top,m)

def portrait(c,name,w,h,y,z,m,r=.01,depth=.006):
    return prism(c,name,[(x,zz+z) for x,zz in outline(w,h,r)],y,y+depth,m,True)

def subtract(obj,cutter):
    modifier=obj.modifiers.new('Apertura reale','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=cutter
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)

def window(c,objects,w,h,y,z,r=.006):
    cutter=portrait(c,'Utensile finestra',w,h,y-.05,z,dark,r,.16)
    for obj in objects:subtract(obj,cutter)
    bpy.data.objects.remove(cutter,do_unlink=True)
    return portrait(c,'Vetro sportello',w+.004,h+.004,y+.008,z,glass,r+.002,.004)

def collar(c,cover,diameter,y,bottom,top):
    count=64
    vertices=[(r*math.cos(i*math.tau/count),y+r*math.sin(i*math.tau/count),z)
              for z in (bottom,top) for r in (diameter/2,diameter/2-.002) for i in range(count)]
    faces=[]
    for i in range(count):
        j=(i+1)%count;faces.extend(((i,j,2*count+j,2*count+i),(count+i,3*count+i,3*count+j,count+j),
                                  (2*count+i,2*count+j,3*count+j,3*count+i),(i,count+i,count+j,j)))
    data=bpy.data.meshes.new('Collare fumi');data.from_pydata(vertices,[],faces);data.materials.append(black);data.uv_layers.new(name='UVMap')  # same attributes as the other black parts: one exported material
    obj=bpy.data.objects.new('Collare fumi aperto',data);c.objects.link(obj)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=diameter/2-.002,depth=.09,location=(0,y,bottom))
    cutter=bpy.context.object;subtract(cover,cutter);bpy.data.objects.remove(cutter,do_unlink=True)

def output(c,ident,shell,finishes):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=next(n for n in shell.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True

white=('bianco',(.83,.84,.83));bronze=('bronzo',(.24,.13,.075));red=('bordeaux',(.28,.025,.034));anthracite=('nero',(.025,.027,.028))
specs=[('ravelli-hoop-7',[white,bronze],'hoop'),('ravelli-hoop-9',[bronze],'hoop'),('ravelli-mild',[anthracite],'mild'),
       ('ravelli-easy-7',[white,red,anthracite,bronze],'easy'),('ravelli-easy-9',[white,red,anthracite,bronze],'easy')]
for ident,finishes,kind in specs:
    dims=technical[ident]['dimensionsMm'];w,d,h=(dims[key]/1000 for key in ('widthMm','depthMm','heightMm'))
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,finishes[0][1])
    front=-d/2+.008
    if kind=='hoop':
        body=plan(c,'Corpo',w,d-.024,.01,h*.49,black,.055)
        upper=plan(c,'Rivestimento superiore',w,d-.024,h*.49,h-.015,shell,.055)
        door=portrait(c,'Porta frontale',w*.79,h-.030,front,h/2,black,.024,.008)
        capsule=portrait(c,'Cornice capsula',w*.35,h*.65,front-.0003,h*.53,dark,w*.175,.006)
        glazing=window(c,(body,upper,door,capsule),w*.28,h*.31,front,h*.47)
        cover=plan(c,'Griglia superiore',w,d,h-.015,h,black,.055)
        for i in range(12):
            y=(i-5.5)*d*.062
            cutter=box(c,'Utensile feritoia',(0,y,h-.012),(w*.72,d*.022,.075),dark,.001)
            for obj in (cover,body,upper):subtract(obj,cutter)
            bpy.data.objects.remove(cutter,do_unlink=True)
        box(c,'Coperchio serbatoio',(0,d*.32,h-.0006),(w*.60,d*.25,.001),black,.0002)
        for side in (-1,1):box(c,'Giunto rivestimento',(side*w*.395,front+.006,h/2),(.004,.005,h-.04),dark,.0006)
    elif kind=='mild':
        base=h*.23;top=h-.030;body_h=top-base
        body=plan(c,'Corpo ghisa',w-.012,d-.024,base,top-.015,shell,.026)
        cover=plan(c,'Coperchio',w,d,top-.015,top,black,.026)
        plan(c,'Cornice inferiore',w,d,base,base+.015,black,.026)
        door=portrait(c,'Cornice porta',w*.87,body_h*.83,front,base+body_h*.49,black,.045,.014)
        glazing=window(c,(body,door),w*.65,body_h*.58,front,base+body_h*.51,.035)
        for x in (-w*.39,w*.39):
            for y in (-d*.35,d*.35):
                foot=box(c,'Piede rastremato',(x,y,base/2),(.058,.070,base),shell,.004)
                for v in foot.data.vertices:
                    if v.co.z<0:v.co.x*=.65;v.co.y*=.65
        box(c,'Maniglia',(w*.40,front+.003,base+body_h*.46),(.013,.020,.14),black,.003)
        box(c,'Deflettore superiore',(0,front+.002,top-.025),(w*.82,.006,.006),dark,.001)
        collar(c,cover,technical[ident]['flueDiameterMm']/1000,d*.22,top-.003,h)
    else:
        body=plan(c,'Corpo',w,d-.024,.012,h-.014,shell,.028)
        plan(c,'Coperchio',w,d,h-.014,h,black,.028)
        door=portrait(c,'Porta',w*.60,h*.81,front,h*.555,black,.008,.012)
        glazing=window(c,(body,door),w*.27,h*.42,front,h*.56,.004)
        portrait(c,'Pannello inferiore',w*.60,h*.14,front,h*.079,black,.008,.010)
        box(c,'Maniglia',(w*.28,front+.003,h*.47),(.012,.020,.10),black,.003)
        box(c,'Ripresa superiore',(0,front-.0002,h*.953),(w*.48,.003,h*.018),dark,.002)
        plan(c,'Sportello serbatoio',w*.70,d*.65,h-.0015,h-.0005,black,.02)
    if kind!='mild':box(c,'Zoccolo',(0,0,.01),(w*.92,d*.90,.02),black,.006)
    bpy.context.view_layer.update()
    centre_z=(min(p[2] for p in glazing.bound_box)+max(p[2] for p in glazing.bound_box))/2
    origin=Vector((0,-d/2-.1,centre_z))
    assert glazing.ray_cast(origin,Vector((0,1,0)),distance=.3)[0],(ident,'missing glazing')
    for obj in c.objects:
        if obj.type=='MESH' and obj!=glazing:
            hit,point,*_=obj.ray_cast(obj.matrix_world.inverted()@origin,Vector((0,1,0)),distance=.3)
            if hit:assert (obj.matrix_world@point).y>front+.012,(ident,obj.name,'closes glazing')
    if kind=='hoop':
        ray=Vector((0,-2.5*d*.062,h+.01))
        assert not cover.ray_cast(ray,Vector((0,0,-1)),distance=.035)[0],(ident,'closed grille')
    points=[obj.matrix_world@Vector(corner) for obj in c.objects if obj.type=='MESH' for corner in obj.bound_box]
    measured=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
    assert all(abs(a-b)<.0021 for a,b in zip(measured,(w,d,h))),(ident,measured)
    print('VERIFIED',ident,measured,flush=True)
    output(c,ident,shell,finishes)
master=bpy.context.scene
for index,c in enumerate(list(master.collection.children)):
    scene=master if index==0 else bpy.data.scenes.new(c.name)
    if index:
        master.collection.children.unlink(c);scene.collection.children.link(c)
    scene.name=c.name;c.hide_viewport=False;c.hide_render=False
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene['reference_photo']='//../../public/catalogs/stoves/'+c.name+'.jpg'
    scene['geometry_note']='Visual reconstruction; concealed sheet gauges and radii are illustrative.'
    triangles=0
    for obj in c.objects:
        if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    assert triangles<=15000,(c.name,triangles,'triangle budget')
    materials={slot.material for obj in c.objects for slot in obj.material_slots if slot.material}
    assert len(materials)<=4,(c.name,len(materials),'material budget')
    scene['triangles']=triangles
    bpy.context.window.scene=scene
    dims=technical[c.name]['dimensionsMm'];w,d,h=(dims[key]/1000 for key in ('widthMm','depthMm','heightMm'))
    target=bpy.data.objects.new('EMPTY_CamTarget_'+c.name,None);scene.collection.objects.link(target);target.location=(0,0,h/2)
    camera=bpy.data.objects.new('CAM_'+c.name+'_Hero',bpy.data.cameras.new('CAM_'+c.name+'_Hero'))
    scene.collection.objects.link(camera);camera.location=(max(w,d,h)*.9,-max(w,d,h)*2.5,h*.85)
    camera.rotation_euler=(target.location-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=max(w,d,h)*1.5;scene.camera=camera
    scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    bpy.context.view_layer.update()
    points=[obj.matrix_world@Vector(corner) for obj in c.objects if obj.type=='MESH' for corner in obj.bound_box]
    projected=[world_to_camera_view(scene,camera,point) for point in points]
    extent=max(max(abs(p.x-.5),abs(p.y-.5))*2 for p in projected);camera.data.ortho_scale*=extent/.9
    for name,position,energy in [('Key',(-1.5,-2,2),180),('Fill',(2,-1,1),70)]:
        data=bpy.data.lights.new('LGT_'+name+'_'+c.name,'AREA');data.energy=energy;data.size=2
        lamp=bpy.data.objects.new(data.name,data);scene.collection.objects.link(lamp);lamp.location=target.location+Vector(position)
        lamp.rotation_euler=(target.location-lamp.location).to_track_quat('-Z','Y').to_euler()
    scene.world=bpy.data.worlds.new('WORLD_'+c.name);scene.world.use_nodes=True
    next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.25,.25,.25,1)
    scene.render.engine='CYCLES';scene.cycles.samples=32
    print('SOURCE_QA',c.name,triangles,len(materials),flush=True)
bpy.context.window.scene=master
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-ravelli-hoop-mild-easy.blend'))
