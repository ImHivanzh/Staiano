"""ISIDE IDRO e ISIDORA H16/H20/H23: maiolica e focolare da catalogo."""
from pathlib import Path
import bpy, math
from mathutils import Vector
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.3,metal=.05):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa nera',(.014,.016,.017),.42,.3);dark=mat('Cornice',(.006,.007,.008));glass=mat('Vetro spento',(.009,.012,.014),.12,0)
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordo','BEVEL');b.width=min(bevel,min(size)*.45);b.segments=6
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
        o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o

def window(c,obj,w,h,front,z):
    cutter=box(c,'Utensile finestra',(0,front-.015,z),(w,.12,h),dark,.004)
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    modifier=obj.modifiers.new('Finestra reale','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=cutter
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)
    obj.modifiers.new('Normali','WEIGHTED_NORMAL');bpy.context.view_layer.update()
    origin=obj.matrix_world.inverted()@Vector((0,front-.1,z))
    assert not obj.ray_cast(origin,Vector((0,1,0)),distance=.2)[0], 'The cast frame must not close the glass opening'

def ceramic_panel(c,name,loc,size,shell,radius,side=0):
    # Large curvature belongs in plan; tile joints have only a 1 mm edge radius.
    cx,cy,cz=loc;width,depth,height=size;profile=[]
    for sx,sy,start in ((1,1,0),(-1,1,90),(-1,-1,180),(1,-1,270)):
        r=min(radius if not side or sx==side else .004,width*.49,depth*.49)
        for i in range(13):
            angle=math.radians(start+i*90/12)
            profile.append((cx+sx*(width/2-r)+r*math.cos(angle),cy+sy*(depth/2-r)+r*math.sin(angle)))
    count=len(profile)
    vertices=[(x,y,z) for z in (cz-height/2,cz+height/2) for x,y in profile]
    faces=[tuple(reversed(range(count))),tuple(range(count,2*count))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(shell)
    obj=bpy.data.objects.new(name,mesh);c.objects.link(obj)
    for polygon in mesh.polygons:polygon.use_smooth=polygon.index>=2
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bevel=obj.modifiers.new('Giunto ceramica','BEVEL');bevel.width=.001;bevel.segments=3
    bpy.ops.object.modifier_apply(modifier=bevel.name);obj.modifiers.new('Normali','WEIGHTED_NORMAL')
    return obj

def ceramic_outline(c,cx,cy,cz,width,height,panel_width,radius,shell,side):
    curve=bpy.data.curves.new('Riquadro maiolica','CURVE');curve.dimensions='3D';curve.bevel_depth=.0008;curve.bevel_resolution=3
    points=[];corner=.018
    for x,z,start in ((width/2-corner,height/2-corner,0),(-width/2+corner,height/2-corner,90),
                       (-width/2+corner,-height/2+corner,180),(width/2-corner,-height/2+corner,270)):
        for i in range(9):
            angle=math.radians(start+i*90/8);px=x+corner*math.cos(angle);pz=z+corner*math.sin(angle)
            local_radius=radius if px*side>0 else .004
            edge=max(0,abs(px)-(panel_width/2-local_radius))
            offset=local_radius-math.sqrt(max(0,local_radius*local_radius-edge*edge))
            points.append((cx+px,cy+offset-.0006,cz+pz,1))
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for point,co in zip(spline.points,points):point.co=co
    spline.use_cyclic_u=True;curve.materials.append(shell)
    obj=bpy.data.objects.new('Riquadro pannello',curve);c.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
specs=[
('nordica-iside-idro-5016',(.690,.628,1.196),[('bianco',(.83,.84,.83)),('pergamena',(.74,.68,.58)),('vogue-ametista',(.30,.16,.23))],True),
('nordica-isidora-idro-h16-50-evo',(.596,.708,1.165),[('tortora-lucido',(.47,.38,.33)),('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034))],False),
('nordica-isidora-idro-h20-50-evo',(.596,.708,1.243),[('avorio',(.76,.64,.44)),('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034))],False),
('nordica-isidora-idro-h23-50-evo',(.596,.737,1.243),[('bianco',(.83,.84,.83)),('bordeaux',(.28,.025,.034)),('avorio',(.76,.64,.44))],False)]
for ident,(w,d,h),finishes,iside in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Maiolica '+ident,finishes[0][1])
    shader=next(n for n in shell.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Coat Weight'].default_value=.3;shader.inputs['Coat Roughness'].default_value=.18
    front=-d/2+.03
    box(c,'Corpo interno',(0,.015,h/2),(w*.78,d-.03,h-.02),black,.035)
    for side in (-1,1):
        if iside:
            for i in range(3):
                tile_height=(h*.96-.004)/3;z=h*.02+tile_height/2+i*(tile_height+.002)
                ceramic_panel(c,'Pannello maiolica',(side*w*.375,-d*.18,z),(w*.25,d*.64,tile_height),shell,.04,side)
                ceramic_outline(c,side*w*.375,-d/2,z,w*.19,h*.22,w*.25,.04,shell,side)
        else:
            for lower,upper in ((.012,.1775),(.18,.84),(.842,.985)):
                ceramic_panel(c,'Montante maiolica',(side*w*.40,-d*.285,h*(lower+upper)/2),(w*.20,d*.42,h*(upper-lower)),shell,.026,side)
    centre_width=w*(.50 if iside else .60)
    ceramic_panel(c,'Copertura superiore',(0,-d*(.18 if iside else .285),h-.009),(w,d*(.64 if iside else .42),.018),shell,.065)
    box(c,'Pannello inferiore',(0,front-.012,h*(.135 if iside else .095)),(centre_width-.003,.020,h*(.23 if iside else .165)),shell,.003)
    frame_z,frame_h=(h*.515,h*.535) if iside else (h*.51,h*.66)
    frame=box(c,'Cornice sportello',(0,front-.009,frame_z),(centre_width-.004,.018,frame_h),dark,.005)
    door=box(c,'Porta ghisa',(0,front-.018,frame_z),(centre_width*.94,.012,frame_h-.012),black,.005)
    glass_w,glass_h=centre_width*.68,h*(.34 if iside else .39);glass_z=h*(.52 if iside else .535)
    for obj in (frame,door):window(c,obj,glass_w-.006,glass_h-.006,front,glass_z)
    box(c,'Vetro sportello',(0,front-.014,glass_z),(glass_w,.004,glass_h),glass,.001)
    box(c,'Maniglia',(-centre_width*.48,front-.020,h*.49),(.012,.018,h*.19),black,.003)
    if iside:
        box(c,'Maiolica superiore',(0,front-.010,h*.885),(w*.26,.018,h*.14),shell,.003)
        for i in range(6):
            for side in (-1,1):box(c,'Griglia verticale',(side*(w*.15+i*.006),front-.015,h*.885),(.003,.007,h*.18),dark,.0005)
    else:box(c,'Maiolica superiore',(0,front-.010,h*.915),(centre_width-.003,.020,h*.142),shell,.003)
    box(c,'Zoccolo',(0,0,.01),(w*.90,d*.90,.02),black,.007)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(corner) for o in c.objects for corner in o.bound_box]
    size=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
    assert size[0]<=w+.002 and size[1]<=d+.002 and size[2]<=h+.002, (ident,size)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shader
    for label,rgb in finishes:
        shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=finishes[0][1];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-iside-isidora.blend'))
