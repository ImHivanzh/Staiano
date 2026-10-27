"""Altre Ravelli HRV, raggruppate secondo le fotografie dei produttori."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
specs=[('ravelli-hrv-120-style','ravelli-rv80',(.550,.620,1.140),(.520,.520,1.010),['bianco','nero','bordeaux']),('ravelli-hrv-120-country','ravelli-rv80',(.550,.600,1.200),(.520,.520,1.010),['bianco','bordeaux']),('ravelli-hrv-140-silhouette','ravelli-hrv-180-silhouette',(.930,.390,1.100),(.930,.390,1.000),['nero']),('ravelli-hrv-160-touch','ravelli-hrv-160-touch-steel',(.610,.640,1.180),(.610,.640,1.180),['bianco','bordeaux']),('ravelli-hrv-180-plus','ravelli-rv-120-touch-steel',(.610,.600,1.250),(.540,.570,1.170),['bianco','bordeaux']),('ravelli-hrv-120-plus','ravelli-rv-120-touch-steel',(.520,.580,1.110),(.540,.570,1.170),['bianco','nero','bordeaux'])]
for target,source,(w,d,h),(sw,sd,sh),finishes in specs:
    for finish in finishes:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        available=finish if (root/'public/models/stoves'/f'{source}-{finish}.glb').exists() else 'bianco'
        bpy.ops.import_scene.gltf(filepath=str(root/'public/models/stoves'/f'{source}-{available}.glb'))
        for o in bpy.context.scene.objects:
            o.location.x*=w/sw;o.scale.x*=w/sw;o.location.y*=d/sd;o.scale.y*=d/sd;o.location.z*=h/sh;o.scale.z*=h/sh
        if available!=finish:
            shell=next(m for m in bpy.data.materials if m.name.startswith('Rivestimento '+source))
            rgb={'bordeaux':(.28,.025,.034)}[finish];shell.diffuse_color=(*rgb,1);shell.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{target}-{finish}.glb'),export_format='GLB',use_selection=True,export_apply=True)
        if finish==finishes[0]:
            bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{target}.blend'))
for ident,w,finishes in [('ravelli-hrv-100-globe',.600,['bianco','nero','bordeaux']),('ravelli-hrv-140-globe',.610,['bianco','bordeaux'])]:
    bpy.ops.wm.read_factory_settings(use_empty=True);d,h=.620,1.150
    def mat(name,rgb,rough=.4):
        m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;return m
    shell=mat('Maiolica',(.83,.84,.83),.25);black=mat('Corpo e porta',(.012,.014,.015),.22);glass=mat('Vetro spento',(.028,.033,.034),.16)
    def cylinder(name,z,height,material):
        bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1,depth=1,location=(0,0,z));o=bpy.context.object;o.name=name;o.dimensions=(w*(1.01 if material is shell else 1),d*(1.01 if material is shell else 1),height);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
        for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    def box(name,loc,size,material):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
    cylinder('Corpo',h/2,h-.02,black);cylinder('Fascia inferiore',h*.12,h*.22,shell);cylinder('Fascia superiore',h*.91,h*.16,shell);cylinder('Coperchio',h-.01,.02,black)
    box('Porta',(0,-d/2-.008,h*.52),(w*.58,.016,h*.54),black);box('Vetro sportello',(0,-d/2-.018,h*.54),(w*.35,.005,h*.33),glass)
    box('Fessura superiore',(0,-d/2-.012,h*.92),(w*.35,.005,.008),black)
    bpy.ops.object.select_all(action='SELECT');p=shell.node_tree.nodes.get('Principled BSDF')
    for finish in finishes:
        rgb={'bianco':(.83,.84,.83),'nero':(.025,.027,.028),'bordeaux':(.28,.025,.034)}[finish];shell.diffuse_color=(*rgb,1);p.inputs['Base Color'].default_value=(*rgb,1)
        bpy.ops.export_scene.gltf(filepath=str(root/'public/models/stoves'/f'{ident}-{finish}.glb'),export_format='GLB',use_selection=True,export_apply=True)
    shell.diffuse_color=(.83,.84,.83,1);p.inputs['Base Color'].default_value=(.83,.84,.83,1)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender'/f'stufa-{ident}.blend'))
