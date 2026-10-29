"""Innova Filomuro Incasso SWI 600 (1004 x 307 x 128 mm), ricostruzione schematica.

Riferimento: foto ufficiale https://www.innova.it/prodotti/fancoils/filomuro/filomuro-incasso/
(dettaglio_slwi, 178493_view_02_v3): piastra bianca piana a spigoli vivi, a filo del muro finito,
con una fascia forellinata in alto (fori piu' fitti verso destra) e una feritoia bassa con aletta
sul lato destro. Il corpo sta nella parete: dal catalogo 1004 x 307 x 128 mm, attacchi 3/4" EK.
Posizione e lunghezza di feritoia e fascia misurate sulla foto, indicative.
Asse x = larghezza, y = profondita' (muro a +y, fronte a -y), z = altezza.
Crea una scena propria senza cancellare quella aperta in Blender; esporta solo il GLB.
"""
from pathlib import Path
import math
import random
import bpy

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes.new('Innova Filomuro Incasso SWI 600')
bpy.context.window.scene = scene
coll = bpy.data.collections.new('Filomuro Incasso SWI 600')
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


white = mat('Verniciato bianco RAL 9010', (.93, .93, .91), 0, .45)
sheet = mat('Lamiera zincata', (.62, .64, .63), .65, .42)
void = mat('Apertura aria', (.012, .014, .014), 0, .92)
created = []


def box(name, loc, dims, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m)
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    created.append(o)
    return o


W, H, D = 1.004, .307, .128
t = .003
front_y = -D / 2 + .002          # piastra a filo del muro finito
# cassa in lamiera nel muro
box('Fondo', (0, D / 2 - t / 2, 0), (W, t, H), sheet)
for x in (-W / 2 + t / 2, W / 2 - t / 2):
    box('Fianco', (x, 0, 0), (t, D, H), sheet)
for z in (-H / 2 + t / 2, H / 2 - t / 2):
    box('Piano', (0, 0, z), (W, D, t), sheet)
# piastra frontale piana, spigoli vivi; la feritoia e' ricavata con un taglio booleano
slot_w, slot_h = .36, .034
slot_x, slot_z = .27, -.065
plate = box('Frontale', (0, front_y, 0), (W, .004, H), white)
cutter = box('_feritoia', (slot_x, front_y, slot_z), (slot_w, .02, slot_h), void)
mod = plate.modifiers.new('Feritoia', 'BOOLEAN')
mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', cutter
bpy.context.view_layer.objects.active = plate
bpy.ops.object.modifier_apply(modifier=mod.name)
created.remove(cutter)
bpy.data.objects.remove(cutter, do_unlink=True)
box('Vano feritoia', (slot_x, front_y + .012, slot_z), (slot_w, .004, slot_h), void)
vane = box('Aletta', (slot_x, front_y + .006, slot_z), (slot_w - .012, .0015, .012), white)
vane.rotation_euler[0] = math.radians(-18)
# fascia forellinata in alto: fori piu' fitti verso destra (foto dettaglio_slwi)
random.seed(7)
band_x0, band_x1 = -.34, .36
rows, z0 = 5, .085
for r in range(rows):
    z = z0 + r * .0105
    x = band_x0
    while x < band_x1:
        density = (x - band_x0) / (band_x1 - band_x0)
        if random.random() < .12 + .8 * density:
            box('Foro', (x, front_y - .0003, z), (.0035, .0008, .0035), void)
        x += .0105

bpy.ops.object.select_all(action='DESELECT')
for o in created:
    o.select_set(True)
bpy.context.view_layer.objects.active = created[0]
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/hvac/innova-filomuro-incasso-realistic.glb'),
                          export_format='GLB', use_selection=True, use_active_scene=True)
