"""Check EGF-PUSH surfaces throughout the viewer's 0–66 degree opening."""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parents[2]
collection = bpy.data.collections['EGF-PUSH']
moving = [o for o in collection.objects if o.name.startswith(('Cornice_mobile', 'Pannello_forato'))]
fixed = [o for o in collection.objects if o.name.startswith(('Cornice_fissa', 'Filtro', 'Chiusura_push'))]
anchor = collection.objects.get('Asse_botola')
pivot = anchor.location.copy() if anchor else Vector((0, 0, .176))

def surface(obj, matrix):
    return BVHTree.FromPolygons([matrix @ v.co for v in obj.data.vertices],
                               [list(p.vertices) for p in obj.data.polygons])

stationary = [(o, surface(o, o.matrix_world)) for o in fixed]
collisions = []
for step in range(67):
    angle = step * 1.15 / 66
    release = 0 if anchor else math.sin(step / 66 * math.pi) * .006
    transform = (Matrix.Translation(pivot + Vector((0, -release, 0))) @
                 Matrix.Rotation(-angle, 4, 'X') @ Matrix.Translation(-pivot))
    for obj in moving:
        tree = surface(obj, transform @ obj.matrix_world)
        for other, fixed_tree in stationary:
            if tree.overlap(fixed_tree):
                collisions.append({'step': step, 'moving': obj.name, 'fixed': other.name})
report = {'samples': 67, 'pivot': list(pivot), 'collisions': collisions}
out = root / 'output/verifiche-realismo'
out.mkdir(parents=True, exist_ok=True)
(out / ('egf-push-motion-after.json' if anchor else 'egf-push-motion-before.json')).write_text(
    json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'samples': 67, 'collision_pairs': len(collisions), 'first': collisions[:5]}))
assert not collisions, 'The hatch intersects stationary surfaces during opening'
