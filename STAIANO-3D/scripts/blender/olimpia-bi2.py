"""Olimpia Splendid Bi2 Air (695 x 599 x 150 mm) e Bi2 Smart S1 (759 x 579 x 150 mm).

Riferimento: disegni ufficiali del catalogo Bi2 (public/catalog-assets/fan-coils/olimpia-bi2-*.png).
Bi2 Air: mobile a lastra con spigoli arrotondati, fronte liscio, griglia di mandata scura in alto.
Bi2 Smart S1: corpo arrotondato "total flat" con feritoia di mandata e deflettore in basso.
Ingombri dal catalogo; raccordi e dettagli minori indicativi.
Asse x = larghezza, y = profondita (muro a +y, fronte a -y), z = altezza.
Uso: blender -b --python-exit-code 1 --python scripts/blender/olimpia-bi2.py
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]


def mat(name, color, metal=.1, rough=.45):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m


def box(name, loc, dims, m, bevel=0, segments=4):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('Bordi', 'BEVEL')
        b.width = min(bevel, min(dims) * .45)  # un raccordo piu largo dello spessore ribalta le normali
        b.segments = segments
        bpy.ops.object.modifier_apply(modifier='Bordi')
    return o


def export(file, blend):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(ROOT / 'public/models/hvac' / file),
        export_format='GLB', use_selection=True, use_active_scene=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender' / blend))


def bi2_air():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.name = 'Olimpia Bi2 Air'
    white = mat('Verniciato bianco', (.9, .9, .88), .05, .4)
    dark = mat('Griglia mandata', (.05, .055, .055), .1, .7)
    grey = mat('Fianchi tecnopolimero', (.78, .79, .78), 0, .55)
    w, d, h = .695, .150, .599
    box('Mobile', (0, 0, 0), (w, d, h), white, .018, 5)
    # Testate laterali in tecnopolimero, poco rientrate
    for side in (-1, 1):
        box('Testata', (side * (w / 2 - .012), -.002, 0), (.026, d - .004, h - .03), grey, .008, 3)
    # Griglia di mandata scura incassata in alto (vista nel disegno ufficiale)
    box('Griglia mandata', (0, -.012, h / 2 - .012), (w - .12, d - .05, .006), dark, .002, 2)
    for i in range(7):
        box('Lama mandata', (0, -d / 2 - .0006, h / 2 - .03 - i * .0095), (w - .15, .0012, .0035), dark)
    # Ripresa: fessura lunga in basso sul fronte
    box('Ripresa aria', (0, -d / 2 - .0006, -h / 2 + .045), (w - .2, .0012, .02), dark)
    export('olimpia-bi2-air-realistic.glb', 'olimpia-bi2-air-realistic.blend')


def bi2_smart():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.name = 'Olimpia Bi2 Smart S1'
    white = mat('Verniciato bianco', (.93, .93, .91), .05, .38)
    dark = mat('Mandata aria', (.04, .045, .045), .1, .75)
    sheet = mat('Deflettore', (.82, .83, .82), .3, .35)
    w, d, h = .759, .150, .579
    box('Mobile', (0, 0, 0), (w, d, h), white, .03, 6)
    # Fronte liscio "total flat": nessun pannello sovrapposto (le facce complanari al corpo renderizzano nere)
    # Mandata sul lato inferiore (come nel disegno): vano scuro, deflettore e lamelle orizzontali
    box('Bocca mandata', (0, -.02, -h / 2 + .0015), (w - .16, d - .07, .004), dark, .0008, 2)
    box('Deflettore', (0, -.04, -h / 2 - .0005), (w - .2, d - .1, .003), sheet, .001, 2)
    for i in range(5):
        box('Lama mandata', (0, -.075 + i * .028, -h / 2 + .0005), (w - .22, .004, .0012), dark)
    # Ripresa: feritoia sottile sul bordo superiore del fronte
    box('Ripresa aria', (0, -d / 2 - .0004, h / 2 - .035), (w - .2, .0012, .008), dark, .0003, 2)
    export('olimpia-bi2-smart-realistic.glb', 'olimpia-bi2-smart-realistic.blend')


bi2_air()
bi2_smart()
