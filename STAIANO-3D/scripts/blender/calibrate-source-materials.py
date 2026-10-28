"""Apply the GLB surface calibration to editable .blend sources, with originals archived.

Run in a separate background Blender through MCP; it opens each source file.
The live Blender scene must remain in its own process.
"""
import hashlib
import json
import runpy
import shutil
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/verifiche-realismo/material-pass'
surface = runpy.run_path(str(ROOT / 'scripts/blender/finish-realism.py'))['surface']
report = []
for path in sorted((ROOT / 'assets/blender').glob('*.blend')):
    if path.name == 'calibrated-surfaces.blend':
        continue
    bpy.ops.wm.open_mainfile(filepath=str(path))
    original_objects = {o.name: (o.type, list(o.matrix_world)) for o in bpy.data.objects}
    changes = []
    for material in bpy.data.materials:
        settings = surface(material.name, path.as_posix())
        if not settings or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            for socket, value in [('Metallic', settings[1]), ('Roughness', settings[2])]:
                # Texture-driven parameters retain their maps and shader wiring.
                if node.inputs[socket].is_linked:
                    continue
                before = node.inputs[socket].default_value
                if abs(before - value) > 1e-5:
                    node.inputs[socket].default_value = value
                    changes.append([material.name, socket, before, value])
            if settings[3]:
                node.inputs['Coat Weight'].default_value = settings[3]
                node.inputs['Coat Roughness'].default_value = .1
    assert original_objects == {o.name: (o.type, list(o.matrix_world)) for o in bpy.data.objects}
    if changes or bpy.data.is_dirty:
        backup = OUT / 'originals' / path.relative_to(ROOT)
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(path, backup)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(path))
    report.append({'file': path.relative_to(ROOT).as_posix(), 'objects': len(original_objects),
                   'changes': changes, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (OUT / 'source-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
result = {'sources': len(report), 'changed': sum(bool(e['changes']) for e in report)}
print(result)
