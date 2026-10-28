"""Wall splits reconstructed from the local official product photographs.

Closed louvers match the reference photos. Family reference envelopes come from
the first catalogue unit; the viewer fits the saved dimensions of each unit.
"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/splits'; OUT.mkdir(parents=True, exist_ok=True)
PHOTOS = {
    'Perfera All Seasons': 'daikin-perfera-all-seasons-official.jpg', 'Stylish': 'daikin-stylish-official.jpg',
    'Emura': 'daikin-emura-official.jpg', 'Comfora': 'daikin-comfora-official.jpg', 'Sensira': 'daikin-sensira-official.jpg',
    'MSZ-AY': 'mitsubishi-msz-ay.png', 'MSZ-HR': 'mitsubishi-msz-hr.png', 'MSZ-EF': 'mitsubishi-msz-ef.png', 'MSZ-LN': 'mitsubishi-msz-ln.png',
    'Pular': 'gree-pular.png', 'Pular New': 'gree-pular.png', 'Clivia': 'gree-clivia.png', 'Airy': 'gree-airy.png',
    'Standard Plus': 'lg-standard-plus.png', 'Standard 2': 'lg-standard-2.png', 'Mirror': 'lg-mirror.png',
    'Deluxe': 'lg-deluxe.png', 'Air Purification': 'lg-air-purification.png',
    'DUALCOOL AI Deluxe': 'lg-dualcool-ai-deluxe.jpg', 'DUALCOOL AI Premium': 'lg-dualcool-ai-premium.jpg',
    'VRV 5 FXAA-A': 'vrv/daikin-fxaa-a.jpg',  # path relative to public/catalog-assets when it contains a slash
}

def photo_path(family): return PHOTOS[family] if '/' in PHOTOS[family] else 'splits/' + PHOTOS[family]

def material(name, color, rough=.3, metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    return m

white=material('ABS bianco',(.84,.85,.84)); seam=material('Giunto e interno',(.06,.07,.075),.7)
silver=material('Alluminio satinato',(.52,.56,.57),.3,.65)
mirror=material('Vetro fumé riflettente',(.16,.18,.19),.12,.65)
screen=material('Sensore e display spento',(.025,.032,.035),.22)
dark=material('ABS grafite',(.065,.07,.075),.32)

def box(scene,name,loc,dims,mat,bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for c in list(o.users_collection): c.objects.unlink(o)
    scene.collection.objects.link(o); o.data.materials.append(mat)
    if bevel:
        modifier=o.modifiers.new('Raccordi stampaggio','BEVEL'); modifier.width=min(bevel,min(dims)*.45); modifier.segments=5
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=modifier.name)
        o.modifiers.new('Normali superfici','WEIGHTED_NORMAL')
    return o

def front(scene,name,w,h,d,mat,emura=False):
    # Front patch has its own curved silhouette and side returns, rather than a flat rectangle.
    vertices=[]; faces=[]; nx,nz=48,12
    for row in range(nz+1):
        t=row/nz; z= ((-.44+t*.90) if emura else (-.24+t*.68))*h
        for col in range(nx+1):
            u=col/nx*2-1
            x=u*w*.486
            y=-d*.465-d*.035*(1-u*u)*math.sin(t*math.pi*.8)
            vertices.append((x,y,z))
    for row in range(nz):
        for col in range(nx):
            a=row*(nx+1)+col; faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update(); mesh.materials.append(mat)
    o=bpy.data.objects.new(name,mesh); scene.collection.objects.link(o)
    for polygon in mesh.polygons: polygon.use_smooth=True
    solid=o.modifiers.new('Pannello ABS','SOLIDIFY'); solid.thickness=.002
    # The exposed surface faces forward (-Y), so thickness grows into the housing.
    solid.offset=-1
    return o

catalog=json.loads((ROOT/'catalog-data/generated/splits.json').read_text(encoding='utf-8'))
families={}
for product in catalog['indoorUnits']:
    if product['mounting']=='wall': families.setdefault(product['family'],product)
# VRV wall units have no mounting field in the catalogue; they are wall-hung.
for product in json.loads((ROOT/'catalog-data/generated/vrv.json').read_text(encoding='utf-8'))['indoorUnits']:
    families.setdefault(product['family'],product)
assert set(families)==set(PHOTOS), 'Every wall family needs an inspected product photo'
scenes=[]; manifest=[]
for family,product in families.items():
    photo=ROOT/'public/catalog-assets'/photo_path(family); assert photo.is_file(),photo
    w,h,d=[product[k]/1000 for k in ('widthMm','heightMm','depthMm')]
    scene=bpy.data.scenes.new('Split '+family); scenes.append(scene); bpy.context.window.scene=scene
    flat=family in ('Stylish','MSZ-EF','MSZ-LN','MSZ-AY','Mirror','Airy') or family.startswith('DUALCOOL')
    is_emura=family=='Emura'; is_mirror=family=='Mirror'; is_ln=family=='MSZ-LN'
    coat=mirror if is_mirror else silver if family=='Airy' else white
    # Complete outside envelope; the separate front panel sits in its recessed face.
    housing=box(scene,'Carter posteriore',(0,d*.02,0),(w,d*.96,h),dark if is_mirror else white,.008 if flat else .04)
    box(scene,'Guarnizione frontale',(0,-d*.461,h*.01 if is_emura else h*.1),(w*.974,d*.001,h*.90 if is_emura else h*.68),seam,.0002)
    if flat:
        box(scene,'Pannello frontale',(0,-d*.492,h*.24 if is_ln else h*.085),(w*.982,d*.016,h*.42 if is_ln else h*.78),coat,.001)
        if is_ln: box(scene,'Pannello frontale inferiore',(0,-d*.492,-h*.22),(w*.982,d*.016,h*.42),coat,.001)
    else:
        front(scene,'Pannello frontale curvo',w,h,d,coat,is_emura)
    # A closed discharge vane and its real separation lines, as in the photographs.
    lower=-h*.37
    if is_emura or is_ln:
        box(scene,'Sede deflettore',(0,-d*.10,-h*.48),(w*.90,d*.65,h*.025),seam,.001)
        flap=box(scene,'Deflettore chiuso',(0,-d*.10,-h*.482),(w*.88,d*.62,h*.02),coat,.001)
    else:
        box(scene,'Sede deflettore',(0,-d*.466,lower),(w*.91,d*.006,h*.168),seam,.001)
        flap=box(scene,'Deflettore chiuso',(0,-d*.48,lower-h*.004),(w*.9,d*.02,h*.16),coat,.001)
    if is_ln:
        box(scene,'Profilo cromato centrale',(0,-d*.502,0),(w*.97,.0015,.003),silver,.0005)
        box(scene,'Divisione doppio deflettore',(0,-d*.1,-h*.493),(.0015,d*.62,.001),seam,0)
    if family.startswith('DUALCOOL') or is_mirror:
        box(scene,'Fascia mandata scura',(0,-d*.493,-h*.325),(w*.94,.002,h*.035),screen,.0005)
        if family=='DUALCOOL AI Premium': box(scene,'Seconda fessura mandata',(0,-d*.493,-h*.38),(w*.94,.002,h*.018),screen,.0005)
    if is_emura:
        box(scene,'Profilo superiore separato',(0,-d*.38,h*.465),(w*.97,d*.12,h*.06),white,.003)
        bpy.ops.mesh.primitive_torus_add(major_radius=.009,minor_radius=.001,major_segments=32,minor_segments=6,
            location=(w*.40,-d*.39,-h*.465),rotation=(math.pi/2,0,0))
        sensor=bpy.context.object; sensor.name='Sensore circolare'; sensor.data.materials.append(screen)
    else:
        box(scene,'Display spento',(w*.40,-d*.464,-h*.20),(w*.022,.001,h*.022),screen,.001)
    # Top intake is a real recessed strip with transverse ribs.
    cutter=box(scene,'Taglio ripresa',(0,d*.02,h*.495),(w*.88,d*.48,h*.05),seam,0)
    modifier=housing.modifiers.new('Apertura ripresa','BOOLEAN'); modifier.object=cutter; modifier.operation='DIFFERENCE'
    bpy.context.view_layer.objects.active=housing; bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    box(scene,'Ripresa superiore',(0,d*.02,h*.473),(w*.88,d*.48,.001),seam,0)
    for index in range(31):
        box(scene,'Nervatura ripresa',((index/30-.5)*w*.88,d*.02,h*.498),(.003,d*.48,.001),white,0)
    # Export only model meshes, excluding the studio camera and lights.
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type=='MESH': o.select_set(True)
    slug=family.lower().replace(' ','-')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
    manifest.append(dict(family=family,url='/models/splits/'+slug+'.glb',referenceModel=product['model'],
        dimensionsMm=[product[k] for k in ('widthMm','heightMm','depthMm')],photo='/catalog-assets/'+photo_path(family)))
    camera=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera')); scene.collection.objects.link(camera)
    camera.location=(w*.8,-1.8,h*.65); camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'; camera.data.ortho_scale=w*1.25; scene.camera=camera
    for name,loc,energy in [('Key',(-1,-2,2),180),('Fill',(2,-1,.5),70)]:
        data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.size=2
        o=bpy.data.objects.new(name,data); scene.collection.objects.link(o); o.location=loc
        o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    scene.world=bpy.data.worlds.new('Studio'); scene.world.color=(.2,.2,.2)
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.render.resolution_x=900; scene.render.resolution_y=420; scene.render.resolution_percentage=100
    scene.render.filepath=str(ROOT/'output/verifiche-realismo'/('split-'+slug+'.png')); bpy.ops.render.render(write_still=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
bpy.data.libraries.write(str(ROOT/'assets/blender/split-wall-models.blend'),set(scenes),fake_user=True)
print(f'Saved {len(manifest)} wall-split models and editable scenes')
