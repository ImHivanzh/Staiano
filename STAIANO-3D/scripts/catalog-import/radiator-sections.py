"""Extract calibrated Ardesia elements from pinned local OEM OBJ files; no network."""
import hashlib
import json
import math
from models3d import ROOT, parse_obj, encode_glb


def build():
    models = json.loads((ROOT / 'catalog-data/generated/models3d.json').read_text(encoding='utf-8'))['models']
    products = {p['id']: p for p in json.loads((ROOT / 'catalog-data/generated/cordivari.json').read_text(encoding='utf-8'))['products']}
    assets, sections = {}, []
    for columns in range(2, 7):
        model = min((m for m in models if m['columns'] == columns), key=lambda m: m['triangles'] / m['elements'])
        data = (ROOT / 'catalog-data/sources/models3d' / (model['id'] + '.obj')).read_bytes()
        if hashlib.sha256(data).hexdigest() != model['sourceSha256']:
            raise ValueError('OEM source hash mismatch: ' + model['id'])
        vertices, normals, faces, blocks = parse_obj(data)
        height = model['nominalDimensionsMm'][1]
        product = products[model['productId']]
        body, port_centres = [], []
        for block in blocks:
            low = [min(vertices[i][axis] for i in block) for axis in range(3)]
            high = [max(vertices[i][axis] for i in block) for axis in range(3)]
            if 20 <= high[0]-low[0] <= 24 and 40 <= high[1]-low[1] <= 50:
                port_centres.append((high[1]+low[1])/2)
            if abs(high[0] - low[0] - 46) < 1e-4 and abs(high[1] - low[1] - height) < 1:
                body.append(block)
        if len(body) != model['elements']:
            raise ValueError('Unrecognized repeated elements: ' + model['id'])
        if len(port_centres) != 4 or abs(max(port_centres)-min(port_centres)-product['interaxisMm']) > 1:
            raise ValueError('OEM connection centres disagree with the published interaxis')
        indices = {old: new for new, old in enumerate(body[0])}
        selected = []
        for i in range(0, len(faces), 3):
            triangle = faces[i:i + 3]
            membership = [v in indices for v, n in triangle]
            if any(membership) and not all(membership):
                raise ValueError('Triangle crosses the selected element')
            if all(membership):
                selected.extend((indices[v], n) for v, n in triangle)
        core = [vertices[i] for i in body[0]]
        low_y, high_y = min(v[1] for v in core), max(v[1] for v in core)
        end_zone = 0
        for i in range(0, len(selected), 3):
            tri = selected[i:i + 3]
            a, b, c = [core[v] for v, n in tri]
            axial = any(abs(normals[n][1]) > 1e-6 for vi, n in tri)
            if axial:
                ends = [min(abs(point[1]-low_y), abs(point[1]-high_y)) for point in (a, b, c)]
                end_zone = max(end_zone, *ends)
                if not (all(point[1] <= low_y + 80 for point in (a,b,c)) or all(point[1] >= high_y - 80 for point in (a,b,c))):
                    raise ValueError('Non-radial geometry outside fixed end zones')
        # Keep every non-radial face rigid, with a 1 mm guard inside the straight tubes.
        end_zone = math.ceil(end_zone) + 1
        if end_zone * 2 >= 207:
            raise ValueError('End zones do not fit the shortest published height')
        center_x = (min(point[0] for point in core) + max(point[0] for point in core)) / 2
        center_z = (min(point[2] for point in core) + max(point[2] for point in core)) / 2
        center_y = (low_y + high_y) / 2
        half_height = (high_y - low_y) / 2
        radial_deviation = 0
        for target in (207, 2500):
            delta = target - height
            def move(y):
                y -= center_y
                return y + (delta / 2 if y >= 0 else -delta / 2) if abs(y) >= half_height - end_zone else y * (1 + delta / (2 * (half_height - end_zone)))
            for i in range(0, len(selected), 3):
                tri = selected[i:i + 3]
                shifts = [move(core[vi][1]) - (core[vi][1]-center_y) for vi, n in tri]
                if max(shifts) - min(shifts) <= 1e-6:
                    continue
                for vi, ni in tri:
                    point = core[vi]
                    radius_error = min(abs(math.hypot(point[0]-center_x, point[2]-(center_z+(row-(columns-1)/2)*41))-12.5) for row in range(columns))
                    radial_deviation = max(radial_deviation, radius_error)
                    if abs(normals[ni][1]) > 1e-6:
                        raise ValueError('A non-radial face would be deformed')
        # This is a local mesh check, not a claimed manufacturer tolerance.
        if radial_deviation > 0.5:
            raise ValueError('OEM tessellation differs by over 1 mm in nominal tube diameter')
        name = f'ardesia-section-{columns}'
        glb, measured, vertex_count, triangles = encode_glb(core, normals, selected, name)
        if abs(measured[0]-46) > 1e-4 or abs(measured[1]-height) > 1 or abs(measured[2]-(66+(columns-2)*41)) > 1:
            raise ValueError('Core dimensions disagree with the published element')
        assets[name + '.glb'] = glb
        sections.append({'columns': columns, 'sourceModelId': model['id'], 'sourceUrl': model['sourceUrl'], 'sourceSha256': model['sourceSha256'], 'sourceHeightMm': height, 'connectionOffsetMm': height-product['interaxisMm'], 'measuredInteraxisMm': max(port_centres)-min(port_centres), 'fixedEndMm': end_zone, 'tubeRadialDeviationMm': radial_deviation, 'measuredDimensionsMm': measured, 'localUrl': '/models3d/' + name + '.glb', 'glbSha256': hashlib.sha256(glb).hexdigest(), 'glbBytes': len(glb), 'vertices': vertex_count, 'triangles': triangles})
    return assets, {'version': 1, 'sections': sections}


if __name__ == '__main__':
    assets, manifest = build()
    for name, data in assets.items():
        (ROOT / 'public/models3d' / name).write_bytes(data)
    (ROOT / 'catalog-data/generated/radiator-sections.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'sections': len(manifest['sections']), 'totalGlbBytes': sum(len(data) for data in assets.values()), 'fixedEndMm': [m['fixedEndMm'] for m in manifest['sections']]}))
