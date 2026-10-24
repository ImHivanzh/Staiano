"""Acquire public manufacturer assets; convert OBJ geometry to metre-based GLB.

No material downloads, scripts, CAD execution, remeshing or dimensional rescaling.
Run with --refresh to reacquire sources. Manifest records SHA and measured bounds.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'catalog-data/sources/models3d'
OUT = ROOT / 'public/models3d'
MANIFEST = ROOT / 'catalog-data/generated/models3d.json'
LIMIT = 30_000_000


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Staiano-catalog-import/1.0'})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError('Asset exceeds 30 MB')
    return data


def parse_obj(data):
    vertices, normals, faces = [], [], []
    blocks, previous = [], None
    for line in data.decode('utf-8-sig').splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == 'v' and previous != 'v':
            blocks.append([])
        if parts[0] in ('v', 'vn'):
            point = tuple(map(float, parts[1:4]))
            if len(point) != 3 or not all(math.isfinite(n) for n in point):
                raise ValueError('Non-finite vertex')
            (vertices if parts[0] == 'v' else normals).append(point)
            if parts[0] == 'v':
                blocks[-1].append(len(vertices) - 1)
        elif parts[0] == 'f':
            face = []
            for token in parts[1:]:
                indices = token.split('/')
                vi, ni = int(indices[0]), int(indices[2])
                vi = vi - 1 if vi > 0 else len(vertices) + vi
                ni = ni - 1 if ni > 0 else len(normals) + ni
                if not 0 <= vi < len(vertices) or not 0 <= ni < len(normals):
                    raise ValueError('Invalid OBJ index')
                face.append((vi, ni))
            if len(face) < 3:
                raise ValueError('Invalid face')
            for i in range(1, len(face) - 1):
                faces.extend((face[0], face[i], face[i + 1]))
        previous = parts[0]
    if not vertices or not normals or not faces:
        raise ValueError('OBJ lacks geometry / normals')
    return vertices, normals, faces, blocks


def convert(data, name):
    vertices, normals, faces, _ = parse_obj(data)
    return encode_glb(vertices, normals, faces, name)


def encode_glb(vertices, normals, faces, name):
    low = [min(p[i] for p in vertices) for i in range(3)]
    high = [max(p[i] for p in vertices) for i in range(3)]
    center = [(a + b) / 2 for a, b in zip(low, high)]
    # Proper 180-degree Z rotation: manufacturer Y points down. Determinant +1.
    positions, directions, indices, lookup = [], [], [], {}
    for vi, ni in faces:
        key = (vertices[vi], normals[ni])
        if key not in lookup:
            lookup[key] = len(positions)
            v, n = vertices[vi], normals[ni]
            positions.append((-(v[0] - center[0]) / 1000,
                              -(v[1] - center[1]) / 1000,
                              (v[2] - center[2]) / 1000))
            directions.append((-n[0], -n[1], n[2]))
        indices.append(lookup[key])
    chunks = [b''.join(struct.pack('<3f', *v) for v in positions),
              b''.join(struct.pack('<3f', *v) for v in directions),
              struct.pack(f'<{len(indices)}I', *indices)]
    offsets = [0, len(chunks[0]), len(chunks[0]) + len(chunks[1])]
    binary = b''.join(chunks)
    document = {
        'asset': {'version': '2.0', 'generator': 'Staiano geometry-preserving OBJ importer'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': name}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1},
                                  'indices': 2, 'material': 0}]}],
        'materials': [{'name': 'Technical white', 'pbrMetallicRoughness': {
            'baseColorFactor': [0.88, 0.9, 0.93, 1], 'metallicFactor': 0,
            'roughnessFactor': 0.7}}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': offsets[i], 'byteLength': len(c),
                         'target': 34963 if i == 2 else 34962} for i, c in enumerate(chunks)],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(positions), 'type': 'VEC3',
             'min': [min(p[i] for p in positions) for i in range(3)],
             'max': [max(p[i] for p in positions) for i in range(3)]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(directions), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5125, 'count': len(indices), 'type': 'SCALAR'},
        ],
    }
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    glb = (struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(encoded) + 8 + len(binary))
           + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
           + struct.pack('<II', len(binary), 0x004e4942) + binary)
    return glb, [b - a for a, b in zip(low, high)], len(positions), len(indices) // 3


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'models': []}
    old = {m['id']: m for m in previous['models']}
    models = []
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for columns in range(2, 7):
        page = f'https://www.cordivari.it/prodotto/radiatore-tubolare-ardesia-{columns}-colonne/'
        html = get(page).decode()
        urls = sorted(set(u for u in re.findall(r'href=["\x27]([^"\x27]+)', html)
                          if u.lower().endswith('.obj')))
        for url in urls:
            match = re.search(r'_(\d+)_(\d+)_rev(\d+)\.obj', url, re.I)
            if not match:
                raise ValueError('Unrecognized manufacturer filename')
            width, height, rev = map(int, match.groups())
            if width % 46:
                raise ValueError('Unknown element pitch')
            name = f'ardesia-{columns}-{width}-{height}'
            source = RAW / f'{name}.obj'
            fresh = args.refresh or not source.exists()
            data = get(url) if fresh else source.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if fresh:
                source.write_bytes(data)
            glb, measured, vertices, triangles = convert(data, name)
            dest = OUT / f'{name}.glb'
            dest.write_bytes(glb)
            nominal = [width + 24, height, 66 + (columns - 2) * 41]
            compatible = all(abs(a - b) <= 1 for a, b in zip(measured, nominal))
            item = {'id': name, 'manufacturer': 'Cordivari', 'family': 'Ardesia',
                    'productId': f'cordivari-ardesia-{columns}-{height}',
                    'columns': columns, 'elements': width // 46, 'revision': f'rev{rev:02}',
                    'sourceUrl': url, 'sourcePage': page, 'sourceFormat': 'obj',
                    'sourceSha256': digest, 'sourceBytes': len(data),
                    'retrievedAt': now if fresh else old.get(name, {}).get('retrievedAt', now),
                    'localUrl': f'/models3d/{name}.glb', 'glbSha256': hashlib.sha256(glb).hexdigest(),
                    'glbBytes': len(glb), 'vertices': vertices, 'triangles': triangles,
                    'nominalDimensionsMm': nominal, 'measuredDimensionsMm': measured,
                    'dimensionStatus': 'verified' if compatible else 'review',
                    'rights': 'Manufacturer public design download; no redistribution license stated. Internal use; review rights before public deployment.',
                    'conversion': 'OBJ to GLB; mm to m; centered; 180-degree Z rotation; original geometry and normals; neutral material; no rescaling.'}
            models.append(item)
            print(json.dumps({'id': name, 'rawBytes': len(data), 'glbBytes': len(glb),
                              'measuredMm': measured, 'status': item['dimensionStatus']}))
    MANIFEST.write_text(json.dumps({'version': 1, 'models': models}, indent=2) + '\n')
    print(f'Imported {len(models)} manufacturer models. Dimension review: '
          f'{sum(m["dimensionStatus"] == "review" for m in models)}.')


if __name__ == '__main__':
    main()
