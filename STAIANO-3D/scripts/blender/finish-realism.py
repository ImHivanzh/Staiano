"""Calibrate existing GLB surfaces in Blender without re-exporting geometry or UVs.

Run through Blender MCP after the model generators. Backups and the complete audit
are written to output/verifiche-realismo/material-pass/. Re-running is idempotent.
Original colours, image maps, AO, names, pivots and animations are preserved.
Glass stays opaque because ModelPreview supplies the animated fire on that surface.
Known default startup cubes are detached; all product vertex buffers stay intact.
"""
import copy
import hashlib
import json
import re
import struct
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/verifiche-realismo/material-pass'


def unpack(data):
    assert len(data) >= 20 and data[:4] == b'glTF', 'Not a GLB'
    assert struct.unpack_from('<II', data, 4) == (2, len(data)), 'Invalid GLB header'
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A and size % 4 == 0, 'Invalid JSON chunk'
    end = 20 + size
    assert end <= len(data), 'Truncated JSON chunk'
    document = json.loads(data[20:end])
    offset = end
    while offset < len(data):
        length, _ = struct.unpack_from('<II', data, offset)
        assert length % 4 == 0 and offset + 8 + length <= len(data), 'Invalid binary chunk'
        offset += 8 + length
    assert offset == len(data)
    return document, data[end:]


def pack(document, tail):
    payload = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    payload += b' ' * (-len(payload) % 4)
    return struct.pack('<4sIIII', b'glTF', 2, 20 + len(payload) + len(tail), len(payload), 0x4E4F534A) + payload + tail


def surface(name, path):
    """Only named, identifiable surfaces are changed; unidentified materials stay intact."""
    n = re.sub(r'\.\d+$', '', name.lower())
    if 'vetro' in n and 'riflettente' in n:
        return 'mirror', .95, .08, 0.
    if 'vetro' in n:
        return 'glass', 0., .12, .6
    if any(word in n for word in ('pietra', 'gres', 'gypsum', 'legno')):
        return None  # These already have specific textures or roughness.
    if 'ghisa' in n:
        return 'cast-iron', 0., .68, 0.
    if any(word in n for word in ('maiolica', 'ceramica')):
        return 'ceramic', 0., .24, .45
    if any(word in n for word in ('filtro', 'interno', 'cavity', 'fessur', 'apertura', 'focolare', 'air passage')):
        return 'cavity', 0., .85, 0.
    if any(word in n for word in ('zincat', 'galvanized', 'rame', 'ottone', 'eurokonus', 'raccordi', 'alluminio anodizzato', 'alluminio satinato')):
        return 'bare-metal', .95, .36, 0.
    if n in ('profile metallo', 'profile', 'profilo metallo', 'dettagli metallo', 'dettaglio metallo', 'maniglia satinata'):
        return 'bare-metal', .95, .36, 0.
    if 'display' in n or 'sensore' in n:
        return 'plastic', 0., .22, 0.
    if 'abs' in n or 'tecnopolimero' in n or 'plastic' in n:
        return 'plastic', 0., .3 if 'bianco' in n else .48, 0.
    if ('rivestimento' in n or n.startswith('pannello nordica')) and ('/stoves/' in path or path.endswith('.blend')):
        if 'maiolica' in path or 'ceramica' in path:
            return 'ceramic', 0., .24, .45
        roughness = .7 if any(w in path for w in ('matt', 'opaco')) else .22 if 'lucido' in path else .4
        return 'paint', 0., roughness, 0.
    if any(word in n for word in ('vernici', 'bianco', 'white metal', 'acciaio nero', 'acciaio scuro', 'acciaio antracite', 'struttura nera', 'corpo nero', 'metallo nero')):
        return 'paint', 0., .4, 0.
    if n.startswith(('chaff-', 'ebla', 'dark-', 'greew-', 'greeb-')) and n.endswith(('corpo', 'pannello', 'griglia', 'piedi', 'lato')):
        return 'paint', 0., .42, 0.
    return None


def apply_surface(material, settings):
    _, metal, rough, coat = settings
    pbr = material.setdefault('pbrMetallicRoughness', {})
    pbr['metallicFactor'], pbr['roughnessFactor'] = metal, rough
    if coat:
        material.setdefault('extensions', {})['KHR_materials_clearcoat'] = {
            'clearcoatFactor': coat, 'clearcoatRoughnessFactor': .1}


def remove_startup_cube(document):
    bad = set()
    for index, node in enumerate(document.get('nodes', [])):
        if node.get('name') != 'Cube' or 'mesh' not in node:
            continue
        mesh = document['meshes'][node['mesh']]
        primitives = mesh['primitives']
        if len(primitives) != 1:
            continue
        p = primitives[0]
        position = document['accessors'][p['attributes']['POSITION']]
        material = document.get('materials', [])[p['material']] if 'material' in p else {}
        if position.get('count') == 24 and position.get('min') == [-1, -1, -1] and position.get('max') == [1, 1, 1] and material.get('name') == 'Material':
            assert not node.get('children') and not document.get('skins') and not document.get('animations'), 'Review animated/parented cube manually'
            bad.add(index)
    if not bad:
        return 0
    remap = {old: new for new, old in enumerate(i for i in range(len(document['nodes'])) if i not in bad)}
    document['nodes'] = [n for i, n in enumerate(document['nodes']) if i not in bad]
    for parent in document.get('scenes', []) + document['nodes']:
        for key in ('nodes', 'children'):
            if key in parent:
                parent[key] = [remap[i] for i in parent[key] if i not in bad]
    return len(bad)


def self_check():
    doc = {'asset': {'version': '2.0'}, 'nodes': [{'name': 'hinge', 'translation': [1, 2, 3]}], 'materials': [{'name': 'Vetro spento', 'occlusionTexture': {'index': 0, 'texCoord': 1}}]}
    binary = struct.pack('<II4s', 4, 0x004E4942, b'\x01\x02\x03\x04')
    data = pack(doc, binary)
    assert unpack(data) == (doc, binary)
    apply_surface(doc['materials'][0], surface('Vetro spento', 'models/stoves/test.glb'))
    changed = pack(doc, binary)
    assert unpack(changed)[1] == binary and doc['nodes'][0]['translation'] == [1, 2, 3]
    assert doc['materials'][0]['occlusionTexture'] == {'index': 0, 'texCoord': 1}
    assert surface('Rivestimento', '/stoves/test-matt.glb')[2] == .7
    assert surface('Profile metallo', '')[1] == .95
    assert surface('Profile bianco RAL 9016', '')[1] == 0
    assert surface('Pietra naturale', '') is None
    assert surface('Unknown', '') is None
    cube = {'nodes': [{'name': 'Cube', 'mesh': 0}, {'name': 'Product', 'mesh': 0, 'children': [2]}, {'name': 'Port', 'mesh': 0}],
            'scenes': [{'nodes': [0, 1]}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'material': 0}]}],
            'accessors': [{'count': 24, 'min': [-1, -1, -1], 'max': [1, 1, 1]}], 'materials': [{'name': 'Material'}]}
    assert remove_startup_cube(cube) == 1
    assert cube['scenes'][0]['nodes'] == [0] and cube['nodes'][0]['children'] == [1]
    assert cube['nodes'][1]['name'] == 'Port'
    try:
        unpack(data[:-1])
    except AssertionError:
        pass
    else:
        raise AssertionError('Truncated GLB accepted')


def main():
    import bpy
    self_check()
    OUT.mkdir(parents=True, exist_ok=True)
    library = {}
    report = []
    for path in sorted((ROOT / 'public').rglob('*.glb')):
        relative = path.relative_to(ROOT).as_posix()
        data = path.read_bytes()
        document, tail = unpack(data)
        removed_cubes = remove_startup_cube(document)
        original = copy.deepcopy(document)
        changes = []
        for material in document.get('materials', []):
            settings = surface(material.get('name', ''), relative)
            if not settings:
                continue
            key = (material.get('name', ''), settings)
            if key not in library:
                m = bpy.data.materials.new('MAT_' + settings[0] + '_' + material.get('name', ''))
                m.use_nodes = True
                node = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                node.inputs['Metallic'].default_value = settings[1]
                node.inputs['Roughness'].default_value = settings[2]
                node.inputs['Coat Weight'].default_value = settings[3]
                node.inputs['Coat Roughness'].default_value = .1
                color = material.get('pbrMetallicRoughness', {}).get('baseColorFactor', [.8, .8, .8, 1])
                node.inputs['Base Color'].default_value = color
                m.diffuse_color = color
                library[key] = m
            before = copy.deepcopy(material)
            # Read calibrated values from Blender's Principled shader.
            node = next(n for n in library[key].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            values = (settings[0], round(node.inputs['Metallic'].default_value, 4), round(node.inputs['Roughness'].default_value, 4), round(node.inputs['Coat Weight'].default_value, 4))
            apply_surface(material, values)
            if material != before:
                changes.append({'name': material.get('name', ''), 'surface': settings[0], 'before': before, 'after': copy.deepcopy(material)})
        if any('KHR_materials_clearcoat' in m.get('extensions', {}) for m in document.get('materials', [])):
            document.setdefault('extensionsUsed', [])
            if 'KHR_materials_clearcoat' not in document['extensionsUsed']:
                document['extensionsUsed'].append('KHR_materials_clearcoat')
        output = pack(document, tail) if changes or removed_cubes else data
        verified, verified_tail = unpack(output)
        for key in set(original) | set(verified):
            if key not in ('materials', 'extensionsUsed'):
                assert original.get(key) == verified.get(key), (relative, key)
        assert tail == verified_tail, relative
        if changes or removed_cubes:
            backup = OUT / 'originals' / relative
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                backup.write_bytes(data)
            temp = path.with_suffix('.glb.tmp')
            temp.write_bytes(output)
            for attempt in range(5):
                try:
                    temp.replace(path)
                    break
                except PermissionError:
                    if attempt == 4:
                        raise
                    time.sleep(.4)
        baseline = OUT / 'originals' / relative
        baseline_document = unpack(baseline.read_bytes())[0] if baseline.exists() else original
        baseline_cubes = remove_startup_cube(baseline_document)
        changes = [{'name': after.get('name', ''), 'surface': (surface(after.get('name', ''), relative) or ('unchanged',))[0],
                    'before': before, 'after': after}
                   for before, after in zip(baseline_document.get('materials', []), document.get('materials', [])) if before != after]
        report.append({'file': relative, 'bytes': len(output), 'sha256': hashlib.sha256(output).hexdigest(),
                       'baselineSha256': hashlib.sha256(baseline.read_bytes() if baseline.exists() else data).hexdigest(),
                       'materials': len(document.get('materials', [])), 'changes': changes,
                       'binaryPreserved': True, 'nodesPreserved': not bool(baseline_cubes), 'startupCubesRemoved': baseline_cubes})
    # Official radiator assets have a hash/size manifest checked by the application.
    manifest_path = ROOT / 'catalog-data/generated/models3d.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    by_file = {e['file']: e for e in report}
    for model in manifest['models']:
        entry = by_file['public' + model['localUrl']]
        model['glbSha256'], model['glbBytes'] = entry['sha256'], entry['bytes']
    if manifest != json.loads(manifest_path.read_text(encoding='utf8')):
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    bpy.data.libraries.write(str(ROOT / 'assets/blender/calibrated-surfaces.blend'), set(library.values()), fake_user=True)
    (OUT / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    return {'audited': len(report), 'changed': sum(bool(e['changes']) for e in report), 'blenderMaterials': len(library), 'audit': str(OUT / 'audit.json')}


if __name__ == '__main__':
    result = main()
    print(result)
