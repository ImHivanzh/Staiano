"""Audit rotating heat-pump impellers against stationary surfaces, every 10 degrees."""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

root = Path(__file__).resolve().parents[2]
report = []
for scene in bpy.data.scenes:
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    fans = [o for o in scene.objects if o.name.startswith('FanBlades_')]
    if not fans:
        continue
    fixed = []
    for o in scene.objects:
        if o.type == 'MESH' and o not in fans:
            fixed.append((o, BVHTree.FromPolygons(
                [o.matrix_world @ v.co for v in o.data.vertices],
                [list(p.vertices) for p in o.data.polygons])))
    contacts = []
    for fan in fans:
        for degree in range(0, 360, 10):
            # In Blender the glTF local Z fan axis corresponds to local Y.
            transform = fan.matrix_world @ Matrix.Rotation(math.radians(degree), 4, 'Y')
            surface = BVHTree.FromPolygons([transform @ v.co for v in fan.data.vertices],
                                          [list(p.vertices) for p in fan.data.polygons])
            for obj, stationary in fixed:
                if surface.overlap(stationary):
                    contacts.append({'fan': fan.name, 'degrees': degree,
                                     'fixed': obj.name,
                                     'materials': [m.name for m in obj.data.materials]})
    report.append({'scene': scene.name, 'fans': len(fans), 'contacts': contacts})
suffix = '-before' if Path(bpy.data.filepath).stem.endswith('-before') else ''
out = root / f'output/verifiche-realismo/heat-pump-motion{suffix}.json'
out.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps([{'scene': s['scene'], 'fans': s['fans'], 'contacts': len(s['contacts'])}
                  for s in report]))
assert report, 'No rotating impellers found'
assert not any(s['contacts'] for s in report), 'Rotating impellers intersect stationary surfaces'
