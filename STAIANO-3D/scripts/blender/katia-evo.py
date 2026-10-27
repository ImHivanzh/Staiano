"""KATIA 9/11 5.0 EVO: forma e finiture dalle fotografie La Nordica."""
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,metal=.18,rough=.4):
    m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=(*rgb,1)
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
black=mat('Telaio e porta nero',(.012,.014,.015),.3,.28)
glass=mat('Vetro ceramico spento',(.025,.030,.031),.16,.16)
w,d,h=.515,.572,1.082
def front_y(x):return -d/2+.065*(x/(w/2))**2
def box(c,name,loc,size,material,bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o); o.name=name; o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        m=o.modifiers.new('Raccordi','BEVEL'); m.width=bevel; m.segments=4; o.modifiers.new('Normali','WEIGHTED_NORMAL')
    return o
def skin(c,name,z0,z1,material):
    outline=[(-w/2,d/2),(w/2,d/2),(w/2,front_y(w/2))]
    outline += [(x,front_y(x)) for x in [w/2-i*w/48 for i in range(1,49)]]
    verts=[(x,y,z) for z in (z0,z1) for x,y in outline]; n=len(outline)
    faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    faces += [tuple(reversed(range(n))),tuple(range(n,2*n))]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); c.objects.link(o); mesh.materials.append(material)
    for poly in mesh.polygons:poly.use_smooth=len(poly.vertices)==4
    return o
def panel(c,name,x0,x1,z0,z1,material,offset=.004):
    count=40
    verts=[(x,front_y(x)-offset,z) for z in (z0,z1) for x in [x0+(x1-x0)*i/count for i in range(count+1)]]
    faces=[(i,i+1,i+count+2,i+count+1) for i in range(count)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); c.objects.link(o); mesh.materials.append(material)
    for p in mesh.polygons:p.use_smooth=True
    return o
for ident in ('nordica-katia-11-50-evo','nordica-katia-9-50-evo'):
    shell=mat('Rivestimento inferiore '+ident,(.13,.055,.028)); upper=mat('Rivestimento superiore '+ident,(.13,.055,.028))
    c=bpy.data.collections.new(ident); bpy.context.scene.collection.children.link(c)
    skin(c,'Rivestimento inferiore',.018,h*.31,shell)
    skin(c,'Rivestimento superiore',h*.31,h-.025,upper)
    skin(c,'Coperchio superiore',h-.025,h+.002,black)
    box(c,'Coperchio pellet',(0,d*.13,h+.003),(w*.53,d*.42,.004),black,.004)
    panel(c,'Cornice sportello',-w*.31,w*.31,h*.315,h*.94,black,.006)
    panel(c,'Vetro ceramico curvo',-w*.135,w*.135,h*.44,h*.78,glass,.009)
    panel(c,'Pannello inferiore',-w*.31,w*.31,.02,h*.305,shell,.007)
    for i in range(3):panel(c,'Fessura superiore',-w*.31,w*.31,h*.947+i*.006,h*.949+i*.006,black,.008)
    box(c,'Maniglia sportello',(-w*.292,front_y(-w*.292)-.015,h*.57),(.009,.014,.12),black,.002)
    box(c,'Zoccolo',(0,.025,.01),(w*.88,d*.87,.02),black,.006)
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    for label,rgb in [('bronzo',(.13,.055,.028)),('bianco',(.83,.84,.83)),('tortora-matt',(.47,.38,.33))]:
        for m,colour in [(shell,rgb),(upper,rgb)]:
            m.diffuse_color=(*colour,1); m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*colour,1)
        bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    default=(.13,.055,.028) if '-11-' in ident else (.47,.38,.33)
    for m,colour in [(shell,default),(upper,default)]:
        m.diffuse_color=(*colour,1); m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*colour,1)
    c.hide_viewport=True; c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/stufe-katia-evo.blend'))
