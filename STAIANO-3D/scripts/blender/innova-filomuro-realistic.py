"""Innova Filomuro Slim Fit SW 600 (1015 x 335 x 128 mm), ricostruzione schematica.

Riferimento: foto ufficiale https://www.innova.it/prodotti/fancoils/filomuro/
(3_definitivo_-_filomuro_slim_fit, vista_9): frontale bianco liscio con spigoli arrotondati e
due sottili feritoie orizzontali nella metà inferiore (dal 29% all'89% della larghezza),
piccolo display a sinistra, senza griglie in alto.
Ingombro 1015 x 335 x 128 mm e attacchi Eurokonus 3/4" a destra dal catalogo;
posizione e lunghezza delle feritoie misurate sulla foto (prospettiva), indicative.
Asse x = larghezza, y = profondità (muro a +y, fronte a -y), z = altezza.
Crea una scena propria senza cancellare quella aperta in Blender.
"""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes.new('Innova Filomuro SW 600')
bpy.context.window.scene = scene
coll = bpy.data.collections.new('Filomuro SW 600')
scene.collection.children.link(coll)


def mat(name, rgb, metal=0, rough=.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m


white = mat('Verniciato bianco RAL 9010', (.93, .93, .91), .05, .42)
sheet = mat('Lamiera zincata', (.62, .64, .63), .65, .42)
void = mat('Apertura aria', (.012, .014, .014), 0, .92)
copper = mat('Attacchi Eurokonus', (.58, .38, .18), .7, .38)
created = []


def box(name, loc, dims, m, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('Smusso', 'BEVEL')
        b.width = bevel
        b.segments = 2
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    created.append(o)
    return o


W, H, D = 1.015, .335, .128
t = .003
front_y = -D / 2 + .002          # faccia a vista a filo muro finito
# cassa in lamiera
box('Fondo', (0, D / 2 - t / 2, 0), (W, t, H), sheet)
for x in (-W / 2 + t / 2, W / 2 - t / 2):
    box('Fianco', (x, 0, 0), (t, D, H), sheet)
for z in (-H / 2 + t / 2, H / 2 - t / 2):
    box('Piano', (0, 0, z), (W, D, t), sheet)
# frontale verniciato liscio, spigoli arrotondati, due feritoie come in foto
slot_w, slot_h = .61, .006
slot_x = .09
slot_zs = (-.028, -.062)
fr_t = .004
front = box('Frontale', (0, front_y, 0), (W, fr_t, H), white, .012)
front.modifiers['Smusso'].segments = 6
for i, z in enumerate(slot_zs):
    cutter = box('_feritoia', (slot_x, front_y, z), (slot_w, .02, slot_h), void)
    mod = front.modifiers.new(f'Feritoia{i}', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', cutter
    bpy.context.view_layer.objects.active = front
    bpy.ops.object.modifier_apply(modifier='Smusso') if i == 0 else None
    bpy.ops.object.modifier_apply(modifier=mod.name)
    created.remove(cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)
    box('Vano feritoia', (slot_x, front_y + .012, z), (slot_w, .004, slot_h), void)
    o = box('Aletta', (slot_x, front_y + .006, z), (slot_w - .01, .0015, .003), white)
    o.rotation_euler[0] = math.radians(-18)
# piccolo display a sinistra delle feritoie (foto vista_9)
box('Display', (-.31, front_y - .0025, -.045), (.045, .002, .030), void)
# attacchi idraulici Eurokonus 3/4" lato DX (destra), interni all'ingombro
for z in (-.060, -.092):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.0105, depth=.045,
                                        location=(W / 2 - .0245, .035, z), rotation=(0, math.pi / 2, 0))
    o = bpy.context.object
    o.name = 'Attacco Eurokonus 3/4'
    o.data.materials.append(copper)
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    created.append(o)

bpy.ops.object.select_all(action='DESELECT')
for o in created:
    o.select_set(True)
bpy.context.view_layer.objects.active = created[0]
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/hvac/innova-filomuro-realistic.glb'),
                          export_format='GLB', use_selection=True, use_active_scene=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender/innova-filomuro-realistic.blend'), copy=True)
