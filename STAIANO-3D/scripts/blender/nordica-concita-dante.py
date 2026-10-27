"""CONCITA, DANTE, EMI ed EMILIANA: sagome da catalogo La Nordica."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2];bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
black=mat('Ghisa antracite',(.025,.027,.028));dark=mat('Cornice porta',(.006,.007,.008));glass=mat('Vetro spento',(.028,.033,.034),.16);metal=mat('Maniglia',(.18,.18,.17))
colors={'bordeaux':(.24,.008,.014),'bianco-infinity':(.83,.84,.83),'nero-antracite':(.025,.027,.028),'nero-opaco':(.018,.020,.021)}
def link(c,o,name):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);o.name=name;return o
def box(c,name,loc,size,m,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Raccordi','BEVEL');b.width=bevel;b.segments=4
    return o
def tube(c,loc,size,m,name):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1,depth=1,location=loc);o=link(c,bpy.context.object,name);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
specs=[('nordica-concita16-maiolica',(.559,.569,1.545),['bordeaux','bianco-infinity'],'classica'),('nordica-concita16-steel',(.559,.569,1.545),['nero-antracite'],'classica'),('nordica-dante16',(.822,.593,1.514),['nero-opaco'],'dante'),('nordica-dante16-con-portalegna',(.822,.593,1.938),['nero-opaco'],'dante-legna'),('nordica-emi-eos',(.404,.398,.992),['nero-antracite'],'emi'),('nordica-emiliana165-maiolica',(.453,.490,1.002),['bordeaux','bianco-infinity'],'classica'),('nordica-emiliana165-steel',(.453,.490,1.002),['nero-antracite'],'classica')]
for ident,(w,d,h),finishes,kind in specs:
    c=bpy.data.collections.new(ident);bpy.context.scene.collection.children.link(c);shell=mat('Rivestimento '+ident,colors[finishes[0]])
    isdante=kind.startswith('dante');base=.424 if kind=='dante-legna' else .04;pipe=.52 if isdante else .35 if h>1.4 else .08;bodyheight=h-base-pipe
    box(c,'Corpo',(0,0,base+bodyheight/2),(w*(.74 if kind=='classica' else 1),d,bodyheight-.02),black,.012)
    if kind=='dante-legna':
        for side in (-1,1):box(c,'Fianco portalegna',(side*w*.47,0,base/2),(w*.06,d,base),black,.003)
        box(c,'Base portalegna',(0,0,.01),(w,d,.02),black,.003)
        box(c,'Schienale portalegna',(0,d*.46,base/2),(w,.02,base),black,.003)
    elif kind=='classica':
        for side in (-1,1):box(c,'Rivestimento laterale',(side*w*.43,0,base+bodyheight*.51),(w*.14,d*.99,bodyheight*.94),shell,.008)
        box(c,'Pannello superiore',(0,-d/2-.008,base+bodyheight*.88),(w*.66,.016,bodyheight*.16),shell,.006)
        box(c,'Cassetto cenere',(0,-d/2-.008,base+bodyheight*.10),(w*.66,.016,bodyheight*.16),black,.006)
        tube(c,(0,-d/2-.021,base+bodyheight*.10),(.055,.008,.055),metal,'Regolatore aria')
    box(c,'Porta',(0,-d/2-.009,base+bodyheight*.51),(w*.70,.018,bodyheight*.48),dark,.006)
    box(c,'Vetro sportello',(0,-d/2-.020,base+bodyheight*.53),(w*(.56 if isdante else .46),.006,bodyheight*.30),glass,.004)
    box(c,'Maniglia',(w*.34,-d/2-.023,base+bodyheight*.46),(.012,.018,.10),metal,.003)
    box(c,'Coperchio',(0,0,base+bodyheight-.012),(w,d,.024),black,.008)
    tube(c,(0,d*.12,base+bodyheight+pipe/2),(.10,.10,pipe),black,'Scarico fumi')
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects));p=shell.node_tree.nodes.get('Principled BSDF')
    for label in finishes:
        rgb=colors[label];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{label}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    rgb=colors[finishes[0]];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1);c.hide_viewport=True;c.hide_render=True
for c in bpy.context.scene.collection.children:c.hide_viewport=False;c.hide_render=False
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/stufe-nordica-concita-dante.blend'))
