"""Plenum trapezoidali isolati EPI-EDL-FB (diffusori EDLS-FB / EDLH-FB), dai disegni Ecoclima.

FMD.00097677 (L 2000, 2 stacchi superiori Ø150/145) e FMD.00097674 (L 1200, 2 stacchi posteriori).
Le quote del profilo sono le stesse di src/domain/air-terminals/trapezoidal-plenum.ts.
Esegue con `blender --background --python` oppure con exec() da Blender MCP (ROOT definito prima).
"""
from pathlib import Path
import bmesh, bpy, math

ROOT = Path(globals().get("ROOT") or Path(__file__).resolve().parents[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Plenum trapezoidali EDL'

MM = .001
WIDE, NECK, HEIGHT = 149 * MM, 75 * MM, 240 * MM
STRAIGHT, SLANT_END = 50 * MM, 141 * MM          # quote verticali dalla faccia superiore
COLLAR_D, COLLAR_H = 145 * MM, 80 * MM           # stacco Ø145, alto 80
INSULATION, STEEL = 6 * MM, 1 * MM               # trocellen verde sp. 6, lamiera sp. 1
CAP = 15 * MM                                    # testate di chiusura: L2 = L - 30

# (u, v): u dalla parete piana, v dalla faccia superiore verso la bocca. Poi y = u - WIDE/2, z = HEIGHT/2 - v.
PATH = [(NECK, HEIGHT), (NECK, SLANT_END), (WIDE, STRAIGHT), (WIDE, 0), (0, 0), (0, HEIGHT)]


def yz(u, v):
    return u - WIDE / 2, HEIGHT / 2 - v


def material(name, color, metal=0, rough=.6):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m


GREEN = material('Isolamento trocellen verde', (.42, .58, .24), 0, .88)
STEEL_M = material('Lamiera zincata', (.55, .58, .6), .75, .35)
INNER = material('Interno condotto', (.03, .035, .04), .1, .8)


def link(obj, coll, mat=None):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    return obj


def inward_path(distance):
    """PATH arretrato verso l'interno di `distance` (angoli a spigolo vivo)."""
    pts = [yz(u, v) for u, v in PATH]
    cy = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    lines = []
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        dy, dz = y1 - y0, z1 - z0; n = math.hypot(dy, dz)
        ny, nz = -dz / n, dy / n
        if (cy - y0) * ny + (cz - z0) * nz < 0: ny, nz = -ny, -nz
        lines.append(((y0 + ny * distance, z0 + nz * distance), (dy / n, dz / n)))
    out = [lines[0][0]]
    for (p, d), (q, e) in zip(lines, lines[1:]):
        det = d[0] * -e[1] + d[1] * e[0]
        t = ((q[0] - p[0]) * -e[1] + (q[1] - p[1]) * e[0]) / det
        out.append((p[0] + d[0] * t, p[1] + d[1] * t))
    (q, e), = lines[-1:]
    out.append((q[0] + e[0] * math.hypot(pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]), q[1] + e[1] * math.hypot(pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1])))
    return out


def sheet(name, length, thickness, setback, coll, mat):
    """Lamiera del profilo estrusa lungo X, arretrata di `setback` e spessa `thickness` verso l'interno."""
    for offset in (-1, 1):
        mesh = bpy.data.meshes.new(name)
        bm = bmesh.new()
        verts = [bm.verts.new((-length / 2, y, z)) for y, z in inward_path(setback)]
        edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
        ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
        bmesh.ops.translate(bm, vec=(length, 0, 0), verts=[g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)])
        bm.to_mesh(mesh); bm.free()
        obj = link(bpy.data.objects.new(name, mesh), coll, mat)
        mod = obj.modifiers.new('Spessore', 'SOLIDIFY')
        mod.thickness = thickness; mod.offset = offset; mod.use_even_offset = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        ys = [v.co.y for v in obj.data.vertices]
        if min(ys) >= -WIDE / 2 + setback - 1e-5 and max(ys) <= WIDE / 2 - setback + 1e-5:
            return obj
        bpy.data.objects.remove(obj, do_unlink=True)
    raise RuntimeError('spessore lamiera: nessun verso valido')


def cutter(name, loc, rot):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=COLLAR_D / 2 - .0005, depth=.05, location=loc, rotation=rot)
    obj = bpy.context.object; obj.name = name
    return obj


def collar(coll, name, loc, rot):
    """Stacco Ø145 aperto, con bordo e nervatura (particolare 4)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=COLLAR_D / 2, depth=COLLAR_H, location=(0, 0, 0))
    tube = bpy.context.object; tube.name = name
    bm = bmesh.new(); bm.from_mesh(tube.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > .9], context='FACES')
    bm.to_mesh(tube.data); bm.free()
    mod = tube.modifiers.new('Spessore', 'SOLIDIFY'); mod.thickness = STEEL * 1.2; mod.offset = -1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.mesh.primitive_torus_add(major_radius=COLLAR_D / 2, minor_radius=.0013, major_segments=96, minor_segments=8, location=(0, 0, COLLAR_H * .25))
    bead = bpy.context.object; bead.name = name + ' nervatura'
    for o in (tube, bead):
        link(o, coll, STEEL_M)
    bead.parent = tube
    tube.location = loc; tube.rotation_euler = rot
    return tube


def cut(obj, cutters):
    for c in cutters:
        mod = obj.modifiers.new('Foro stacco', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = c; mod.solver = 'EXACT'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)


def end_cap(coll, name, x, sign):
    mesh = bpy.data.meshes.new(name)
    pts = [(NECK, HEIGHT), (NECK, SLANT_END), (WIDE, STRAIGHT), (WIDE, 0), (0, 0), (0, HEIGHT)]
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, *yz(u, v))) for u, v in pts])
    ret = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(sign * STEEL * 1.5, 0, 0), verts=[g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh); bm.free()
    return link(bpy.data.objects.new(name, mesh), coll, STEEL_M)


def fixing_plate(coll, name, loc):
    """Piastrina di fissaggio per installazione in continuità (50 x 20, rivetto Ø3)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object; obj.name = name; obj.dimensions = (20 * MM, 1.3 * MM, 50 * MM)
    bpy.ops.object.transform_apply(scale=True)
    return link(obj, coll, STEEL_M)


def build(variant, length, face):
    coll = bpy.data.collections.new(f'Plenum EPI-EDL-FB L{int(length * 1000)} ({variant})')
    scene.collection.children.link(coll)
    xs = (-length / 4, length / 4)           # stacchi a L/4 e 3L/4 (quota 2 = 500 per L 2000, 300 per L 1200)

    def cutters():
        if face == 'superiori':   # sulla faccia superiore, verso l'alto
            return [cutter(f'taglio {i}', (x, 0, HEIGHT / 2), (0, 0, 0)) for i, x in enumerate(xs)]
        # sulla parete piana posteriore, a metà altezza
        return [cutter(f'taglio {i}', (x, -WIDE / 2, 0), (math.pi / 2, 0, 0)) for i, x in enumerate(xs)]

    cut(sheet('Isolamento esterno', length, INSULATION, 0, coll, GREEN), cutters())
    cut(sheet('Lamiera interna', length - 2 * CAP, STEEL, INSULATION, coll, STEEL_M), cutters())
    for i, x in enumerate(xs):
        if face == 'superiori':
            collar(coll, f'Stacco {i + 1} Ø145', (x, 0, HEIGHT / 2 + COLLAR_H / 2 - .02), (0, 0, 0))
        else:
            collar(coll, f'Stacco {i + 1} Ø145', (x, -WIDE / 2 - COLLAR_H / 2 + .02, 0), (math.pi / 2, 0, 0))
    end_cap(coll, 'Testata sinistra', -length / 2, 1)
    end_cap(coll, 'Testata destra', length / 2, -1)
    for i, x in enumerate((-length / 2 + .06, length / 2 - .06)):
        fixing_plate(coll, f'Piastrina {i + 1}', (x, WIDE / 2 - .001, HEIGHT / 2 - .045))
    return coll


def export(coll, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.all_objects: o.select_set(True)
    out = ROOT / 'public/models/ecoclima' / filename
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_apply=True)
    return str(out)


def preview(path):
    world = bpy.data.worlds.new('W'); scene.world = world; world.color = (.8, .82, .85)
    sun = bpy.data.objects.new('Sole', bpy.data.lights.new('Sole', 'SUN')); scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30)); sun.data.energy = 3
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    for suffix, location, rotation in (('', (1.7, -2.6, 1.6), (62, 0, 33)), ('-retro', (-1.7, 3.0, 1.9), (60, 0, 205)), ('-sotto', (1.4, -2.2, -1.5), (115, 0, 33))):
        cam.location = location; cam.rotation_euler = [math.radians(a) for a in rotation]; cam.data.lens = 35
        scene.render.filepath = path.replace('.png', suffix + '.png')
        bpy.ops.render.render(write_still=True)


c2000 = build('stacchi superiori', 2.0, 'superiori')
c1200 = build('stacchi posteriori', 1.2, 'posteriori')
files = [export(c2000, 'edl-plenum-trapezoidale-2000-superiori.glb'), export(c1200, 'edl-plenum-trapezoidale-1200-posteriori.glb')]
for o in c1200.all_objects:               # solo per l'anteprima: i due plenum affiancati
    if o.parent is None: o.location.y += .5
for o in c2000.all_objects:
    if o.parent is None: o.location.y -= .3
bpy.context.preferences.filepaths.save_version = 0
preview(str(ROOT / 'output/verifiche-realismo/edl-plenum-trapezoidale.png'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender/edl-plenum-trapezoidale.blend'))
result = {'files': files}
