"""Build a photo/reference index for every shipped GLB and render one per product family.

Blender MCP runs render_review(); ordinary Python + Pillow runs make_boards().
Renders use the actual shipped GLBs, not a separate reconstruction. Manufacturer
photos describe the family; colour/size and the lit stove state may differ.
"""
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/verifiche-realismo/material-pass'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def reference_index():
    stoves = sorted(read('src/domain/catalogs/stoves.json')['products'], key=lambda p: -len(p['id']))
    eco = read('catalog-data/generated/ecoclima.json')['families']
    diffuser_source = (ROOT / 'src/configurator/viewer3d/ecoclima-diffuser-models.ts').read_text(encoding='utf8')
    diffuser_codes = dict(re.findall(r'"([a-z0-9-]+)": \["([^"]+)"', diffuser_source))
    splits = read('public/models/splits/manifest.json')
    splits += read('public/models/cassettes/manifest.json')
    split_sources = {p['family']: p for p in read('catalog-data/generated/split-series-presentation.json')}
    fan = read('catalog-data/generated/fan-coils.json')['products']
    heat = read('catalog-data/generated/heat-pumps.json')['products']
    radiator_photos = read('catalog-data/generated/radiator-family-photos.json')
    fan_names = {'aermec-fcz': 'FCZ P', 'innova-airleaf-sl-': 'AirLeaf SL', 'innova-airleaf-sls-': 'AirLeaf SLS',
                 'innova-filomuro': 'FILOMURO', 'innova-osmo': 'OSMO', 'innova-sli': 'AirLeaf SLI',
                 'olimpia-bi2-air': 'Bi2 Air', 'olimpia-bi2-smart': 'Bi2 Smart'}
    report = []
    for path in sorted((ROOT / 'public').rglob('*.glb')):
        name = path.stem
        relative = path.relative_to(ROOT).as_posix()
        product = None
        photo = source = ''
        family = name
        if '/stoves/' in relative:
            product = next((p for p in stoves if name.startswith(p['id'] + '-')), None)
            if product:
                family, photo, source = product['id'], product['photo'], product['sourceUrl']
        elif '/splits/' in relative or '/cassettes/' in relative:
            product = next((p for p in splits if p['url'].endswith('/' + path.name)), None)
            if product:
                family, photo = product['family'], product['photo']
                source = (split_sources.get(family, {}).get('productPhoto') or {}).get('sourceUrl', '')
        elif '/ecoclima/' in relative:
            code = path.parent.name.upper() if path.parent.name not in ('ecoclima', 'diffusers') else name.replace('ecoclima-', '').split('-')[0].upper()
            aliases = {'EDFL': 'EDFL-20', 'EDE': 'EDE1', 'EDEA': 'EDEA-SD', 'EDQC': 'EDQC1', 'EDQF': 'EDQF1', 'EDSC': 'EDSC-Q' if 'square' in name else 'EDSC-C', 'VALVE': 'EVPMC' if 'abs' in name else 'EAM-VRFN' if 'inox' in name else 'EVVMC'}
            code = ('EDQMQ' if 'square' in name else 'EDQMC') if code == 'EDQM' else aliases.get(code, code)
            code = diffuser_codes.get(name, code)
            product = next((p for p in eco if p['familyCode'] == code), None)
            if product:
                family, photo, source = code, product.get('image', ''), product['sourceMetadata']['sourceUrl']
        elif '/models3d/' in relative:
            columns = name.split('-')[2] if name.startswith('ardesia-section-') else name.split('-')[1]
            family = 'Cordivari Ardesia ' + columns
            meta = radiator_photos.get('Cordivari|Ardesia ' + columns + ' colonne', {})
            photo, source = meta.get('localPath', ''), meta.get('sourceUrl', '')
        elif '/hvac/' in relative:
            if name.startswith('heat-pump-'):
                token = 'ARIANEXT PLUS' if 'arianext' in name else 'VERSATI III Split' if 'versati-iii' in name else 'VERSATI V' if 'versati-v' in name else 'ALTHERMA 3 M' if '3m' in name else 'ALTHERMA 3 R'
                product = next((p for p in heat if token.upper().replace(' ', '') in p['family'].upper().replace(' ', '')), None)
            else:
                token = next((v for k, v in fan_names.items() if name.startswith(k)), None)
                if token:
                    product = next((p for p in fan if token.lower() in p['family'].lower()), None)
            if product:
                family = product['manufacturer'] + ' ' + product['family']
                meta = product.get('productPhoto') or {}
                photo, source = meta.get('localPath', ''), meta.get('sourceUrl', '')
            if not photo:
                code = name.split('-')[0].upper()
                product = next((p for p in eco if p['familyCode'] == code), None)
                if product:
                    family, photo, source = code, product.get('image', ''), product['sourceMetadata']['sourceUrl']
            if name.startswith('global-'):
                family = 'Global ' + name.split('-')[1].upper()
                meta = radiator_photos.get('Global|' + name.split('-')[1].upper(), {})
                photo, source = meta.get('localPath', ''), meta.get('sourceUrl', '')
        # Supplemental official images are already checked into the product catalogue.
        supplemental = {
            'innova-filomuro': '/catalog-assets/fan-coils/innova-filomuro.jpg',
            'innova-osmo': '/catalog-assets/fan-coils/innova-osmo-sl.jpg',
            'u-match-ducted': '/catalog-assets/references/gree-u-match.png',
            'versati-iii-sp': '/catalog-assets/heat-pumps/gree-versati-iii-split.png',
        }
        if not photo:
            for prefix, local in supplemental.items():
                if name.startswith(prefix):
                    photo = local
                    if prefix == 'u-match-ducted':
                        source = 'https://gree-bulgaria.com/manuals/service/U-Match_6_technical_sales_guide.pdf#page=6'
                    elif prefix == 'versati-iii-sp':
                        source = next(p['productPhoto']['sourceUrl'] for p in heat if p['family'] == 'VERSATI III Split' and p.get('productPhoto'))
                    else:
                        source = 'https://www.innova.it/prodotti/fancoils/osmo/osmo-sl/' if 'osmo' in prefix else 'https://www.innova.it/prodotti/fancoils/filomuro/'
        photo_path = ROOT / 'public' / photo.lstrip('/') if photo else None
        report.append({'file': relative, 'family': family, 'photo': photo, 'sourceUrl': source,
                       'photoExists': bool(photo_path and photo_path.is_file()),
                       'photoSha256': hashlib.sha256(photo_path.read_bytes()).hexdigest() if photo_path and photo_path.is_file() else None})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'references.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    return report


def render_review():
    import bpy
    from mathutils import Vector
    from bpy_extras.object_utils import world_to_camera_view
    entries = reference_index()
    representatives = {}
    for entry in entries:
        if entry['photoExists']:
            previous = representatives.get(entry['family'])
            if not previous or ('realistic' in entry['file'] and 'realistic' not in previous['file']):
                representatives[entry['family']] = entry
    todo = list(representatives.values())
    start, stop = globals().get('RUN_RANGE', (0, len(todo)))
    for index, entry in enumerate(todo):
        if not start <= index < stop:
            continue
        path = ROOT / entry['file']
        name = Path(entry['file']).stem
        output = OUT / 'renders' / (name + '.png')
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists() and output.stat().st_mtime >= path.stat().st_mtime:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(path))
        scene = bpy.context.scene
        bpy.context.view_layer.update()
        points = [o.matrix_world @ Vector(c) for o in scene.objects if o.type == 'MESH' for c in o.bound_box]
        assert points, entry['file']
        low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
        high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
        size, center = high - low, (high + low) / 2
        assert all(math.isfinite(v) and v > 0 for v in size), entry['file']
        camera = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera'))
        scene.collection.objects.link(camera)
        # The GLB is imported back from glTF (+Y up) into Blender (+Z up).
        offset = (.5, -.7, -2.8) if '/cassettes/' in entry['file'] else (.65, -2.8, .35)
        camera.location = center + Vector(offset) * max(size)
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type, camera.data.ortho_scale = 'ORTHO', max(size) * 1.5
        scene.camera = camera
        for label, offset, energy, area in [('Key', (-1.5, -2.5, 2), 220, 2), ('Fill', (2, -1, .5), 90, 1.5), ('Rim', (0, 1.5, 2), 140, 1.5)]:
            data = bpy.data.lights.new(label, 'AREA'); data.energy, data.size = energy, area
            light = bpy.data.objects.new(label, data); scene.collection.objects.link(light)
            light.location = center + Vector(offset)
            light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.world = bpy.data.worlds.new('Neutral studio'); scene.world.use_nodes = True
        next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (.3, .3, .3, 1)
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 12
        scene.cycles.use_denoising = True
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 420, 460, 100
        bpy.context.view_layer.update()
        extent = max(max(abs(p.x - .5), abs(p.y - .5)) * 2 for p in (world_to_camera_view(scene, camera, pt) for pt in points))
        camera.data.ortho_scale *= extent / .87
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        print(f'PHOTO REVIEW {index + 1}/{len(todo)} {name}', flush=True)
    return {'families': len(todo), 'rendered': sum((OUT / 'renders' / (Path(e['file']).stem + '.png')).is_file() for e in todo)}


def make_boards():
    from PIL import Image, ImageDraw, ImageOps
    entries = read('output/verifiche-realismo/material-pass/references.json')
    representatives = {}
    for entry in entries:
        render = OUT / 'renders' / (Path(entry['file']).stem + '.png')
        if render.is_file():
            representatives[entry['family']] = (entry, render)
    values = list(representatives.values())
    for start in range(0, len(values), 16):
        board = Image.new('RGB', (1680, 2060), '#e7e7e4')
        draw = ImageDraw.Draw(board)
        draw.text((15, 8), 'Foto produttore | GLB calibrato - stessa famiglia; variante e stufa accesa possono differire', fill='#222222')
        for local, (entry, render) in enumerate(values[start:start + 16]):
            x, y = local % 4 * 420, local // 4 * 500 + 45
            draw.text((x + 8, y), entry['family'][:55], fill='#222222')
            for col, path in enumerate([ROOT / 'public' / entry['photo'].lstrip('/'), render]):
                with Image.open(path) as source:
                    source = source.convert('RGBA')
                    image = Image.new('RGBA', source.size, 'white'); image.alpha_composite(source)
                    image = ImageOps.contain(image.convert('RGB'), (200, 440))
                    board.paste(image, (x + col * 210 + (200 - image.width) // 2 + 5, y + 30 + (440 - image.height) // 2))
        board.save(OUT / f'confronto-{start // 16 + 1:02d}.jpg', quality=88)
    return {'boards': (len(values) + 15) // 16, 'families': len(values)}


if __name__ == '__main__':
    result = render_review()
    print(result)
