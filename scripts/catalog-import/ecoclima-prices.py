"""Normalize preserved original Ecoclima workbooks and dimension tables.

This importer does no network activity. Acquire official revisions first; raw
sources and the previous normalized revision remain immutable evidence.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'catalog-data/sources/ecoclima'
COMMERCIAL = ROOT / 'catalog-data/sources/ecoclima-commercial-official'
OUTPUT = ROOT / 'catalog-data/generated/ecoclima-prices.json'
NOW = dt.datetime.now(dt.timezone.utc).isoformat()


def number(value):
    text = str(value).strip()
    return int(text) if re.fullmatch(r'\d+', text) else None


def pair(value):
    match = re.fullmatch(r'(\d+)\s*[xX×]\s*(\d+)', str(value).strip())
    return tuple(map(int, match.groups())) if match else None


def dimensions(**kwargs):
    return dict.fromkeys(('lengthMm', 'widthMm', 'heightMm', 'diameterMm', 'slotCount', 'slotWidthMm')) | kwargs


def metadata(record):
    original = record['htmlSource']
    return {'manufacturer': 'Ecoclima', 'sourceUrl': original['sourceUrl'], 'sourceType': 'html',
            'documentRevision': None, 'retrievedAt': original['retrievedAt'], 'importedAt': original['retrievedAt'],
            'sha256': original['sha256'], 'page': None}


def family_code(record):
    code = record['code']
    if code == 'EGA' and 'ega-1-4' in record['pageUrl']:
        return 'EGA1-4'
    return code


def accessory_specs(records):
    result = []
    for record in records:
        code = family_code(record)
        source = metadata(record)
        tables = record['tables']
        bridge_quantities = {}
        for table in tables:
            grid = table['grid']
            if not grid:
                continue
            bridge_header = next((row for row in grid[:2] if 'Numero Ponti di Fissaggio' in row), None)
            if bridge_header is None:
                continue
            index = bridge_header.index('Numero Ponti di Fissaggio')
            if code in ('EDLS', 'EDLH'):
                count_match = re.search(r'-\s*([123])F', ' '.join(grid[0]))
                count = int(count_match[1]) if count_match else 1
                for row in grid[1:]:
                    if len(row) <= index:
                        continue
                    slot = re.search(r'(20|30)\s*mm', row[1])
                    length = number(row[2])
                    quantity = number(row[index])
                    if slot and length and quantity:
                        bridge_quantities[(count, int(slot[1]), length)] = quantity
            elif code in ('EDFL', 'EDFLB-FL', 'EDFLNA'):
                for row in grid[grid.index(bridge_header) + 1:]:
                    if len(row) <= index:
                        continue
                    count = re.search(r'([1-9])\s*Ferito', row[0], re.I)
                    length, quantity = number(row[1]), number(row[index])
                    if count and length and quantity:
                        bridge_quantities[(int(count[1]), None, length)] = quantity
        all_text = ' '.join(table['heading'] + ' ' + ' '.join(' '.join(row) for row in table['grid']) for table in tables)
        continuity = 'Kit di Continuità' in all_text or 'kit di continuità' in all_text
        for table in tables:
            grid = table['grid']
            if len(grid) < 2:
                continue
            header = grid[1] if any('stacchi' in str(cell).lower() for cell in grid[1]) else grid[0]
            first_data = 2 if header is grid[1] else 1
            if 'Numero stacchi' in header and 'L1' in header:
                for row in grid[first_data:]:
                    slot_match = re.search(r'([1-9])\s*Ferito', row[0], re.I)
                    width_match = re.search(r'(20|30)\s*mm', row[0])
                    count_match = re.search(r'([123])\s*Ferito', grid[0][0], re.I)
                    count = int(slot_match[1]) if slot_match else int(count_match[1]) if count_match else None
                    slot_width = int(width_match[1]) if width_match else None
                    if not count:
                        continue
                    values = {name: number(row[i]) for i, name in enumerate(header) if i < len(row)}
                    if not all(values.get(key) for key in ('L', 'L1', 'Numero stacchi', 'Ø d', 'P', 'H')):
                        continue
                    model = 'EPI-EDL' if code in ('EDLS', 'EDLH') else 'EPI-EDFLN' if code == 'EDFLNA' else 'EPI-EDFL'
                    dim = dimensions(lengthMm=values['L'], slotCount=count, slotWidthMm=slot_width)
                    quantity = bridge_quantities.get((count, slot_width, values['L'])) or bridge_quantities.get((count, None, values['L'])) or values.get('Numero Ponti di Fissaggio')
                    plenum_source = source
                    material = 'Materiale non specificato nella tabella originale.'
                    insulation = 'Versione isolata EPI; materiale isolante non specificato nella tabella originale.'
                    bridge_source = source if quantity else None
                    if code == 'EDLS':
                        doc = next((doc for doc in record['documents'] if 'scheda-tecnica-edls-edlsb' in doc['sourceUrl']), None)
                        if doc:
                            plenum_source = source | {'sourceUrl': doc['sourceUrl'], 'sourceType': 'pdf', 'documentRevision': 'Rev.03 (2025)', 'retrievedAt': doc['retrievedAt'], 'sha256': doc['sha256'], 'page': 5}
                            bridge_source = plenum_source | {'page': count + 1}
                            material = 'Acciaio zincato'
                            insulation = 'Isolamento esterno in polietilene espanso'
                    result.append({'familyCode': code, 'dimensions': dim, 'fixingBridgeQuantity': quantity,
                                   'fixingBridgeSourceMetadata': bridge_source, 'continuitySupported': continuity,
                                   'plenum': {'modelCode': model, 'lengthMm': values['L1'], 'widthMm': values['H'], 'heightMm': values['P'],
                                              'publishedDimensionsMm': {key: value for key, value in values.items() if value is not None},
                                              'connectionPosition': 'lateral', 'portCount': values['Numero stacchi'], 'portDiameterMm': values['Ø d'],
                                              'material': material, 'insulation': insulation, 'sourceMetadata': plenum_source}, 'sourceMetadata': source})
            elif 'Nr. Stacchi' in header and any('L1' in str(cell) for cell in header):
                sections = [i for i, cell in enumerate(header) if re.search(r'L1\s*[xX]\s*H1', cell)]
                for start in sections:
                    end = next((value for value in sections if value > start), len(header))
                    for row in grid[first_data:]:
                        if len(row) < end:
                            continue
                        nominal = pair(row[start])
                        if not nominal:
                            continue
                        actual = nominal
                        if start and re.search(r'L\s*[xX]\s*H', header[start - 1]):
                            actual = nominal
                            nominal = pair(row[start - 1])
                            if not nominal:
                                continue
                        for index in range(start + 1, end):
                            if header[index] not in ('P1', 'P2') or index + 2 >= end:
                                continue
                            depth, count, diameter = map(number, row[index:index + 3])
                            if not all((depth, count, diameter)):
                                continue
                            position = 'upper' if header[index] == 'P1' else 'lateral'
                            pub = {}
                            current_position = None
                            for i in range(start + 1, end):
                                if header[i] in ('P1', 'P2'):
                                    current_position = 'upper' if header[i] == 'P1' else 'lateral'
                                key = f'{current_position}.{header[i]}' if current_position and header[i] in ('Nr. Stacchi', 'Ø d') else header[i]
                                if number(row[i]) is not None:
                                    pub[key] = number(row[i])
                            pub |= {'L1': actual[0], 'H1': actual[1], 'portDiameter': diameter, 'portCount': count}
                            result.append({'familyCode': code, 'dimensions': dimensions(widthMm=nominal[0], heightMm=nominal[1]),
                                           'fixingBridgeQuantity': None, 'fixingBridgeSourceMetadata': None, 'continuitySupported': False,
                                           'plenum': {'modelCode': 'EPI', 'lengthMm': actual[0], 'widthMm': actual[1], 'heightMm': depth,
                                                      'publishedDimensionsMm': pub, 'connectionPosition': position, 'portCount': count,
                                                      'portDiameterMm': diameter, 'material': 'Materiale non specificato nella tabella originale.',
                                                      'insulation': 'Versione isolata EPI; materiale isolante non specificato nella tabella originale.', 'sourceMetadata': source}, 'sourceMetadata': source})
            elif any('B2 Tubo' in cell for cell in header):
                inlet_index = next(i for i, cell in enumerate(header) if 'B2 Tubo' in cell)
                for row in grid[first_data:]:
                    values = {name: number(row[i]) for i, name in enumerate(header) if i < len(row)}
                    diameter = number(row[1])
                    if not diameter or not number(row[inlet_index]):
                        continue
                    result.append({'familyCode': code, 'dimensions': dimensions(diameterMm=diameter), 'fixingBridgeQuantity': None,
                                   'fixingBridgeSourceMetadata': None, 'continuitySupported': False,
                                   'plenum': {'modelCode': 'EPI-DC', 'lengthMm': values.get('L'), 'widthMm': values.get('H'), 'heightMm': values.get('P'),
                                              'publishedDimensionsMm': {key: value for key, value in values.items() if value is not None},
                                              'connectionPosition': 'lateral', 'portCount': 1, 'portDiameterMm': number(row[inlet_index]),
                                              'material': 'Materiale non specificato nella tabella originale.',
                                              'insulation': 'Versione isolata EPI-DC; materiale isolante non specificato nella tabella originale.', 'sourceMetadata': source}, 'sourceMetadata': source})
        if code == 'EBLF':
            doc = next((doc for doc in record['documents'] if 'eblf' in doc['sourceUrl'].lower()), None)
            kit_source = source if doc is None else source | {'sourceUrl': doc['sourceUrl'], 'sourceType': 'pdf',
                'documentRevision': 'Rev.00 (document body)', 'retrievedAt': doc['retrievedAt'], 'sha256': doc['sha256'], 'page': 2}
            result.append({'familyCode': code, 'dimensions': dimensions(), 'fixingBridgeQuantity': None,
                           'fixingBridgeSourceMetadata': None, 'fixingKitQuantity': 1, 'fixingKitSourceMetadata': kit_source,
                           'continuitySupported': False, 'plenum': None, 'sourceMetadata': source})
        if code == 'EDLSV':
            for table in tables:
                grid = table['grid']
                if not grid or 'Numero Ponti di Fissaggio' not in grid[0]:
                    continue
                index = grid[0].index('Numero Ponti di Fissaggio')
                for row in grid[1:]:
                    length, quantity = number(row[0]), number(row[index])
                    if length and quantity:
                        result.append({'familyCode': code, 'dimensions': dimensions(lengthMm=length), 'fixingBridgeQuantity': quantity,
                                       'fixingBridgeSourceMetadata': source, 'continuitySupported': continuity, 'plenum': None, 'sourceMetadata': source})
    unique = {}
    for item in result:
        key = json.dumps([item['familyCode'], item['dimensions'], item['plenum']['connectionPosition'] if item['plenum'] else None], sort_keys=True)
        if key not in unique:
            unique[key] = item
    return list(unique.values())


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--apply', action='store_true')
    cli.add_argument('--allow-removal', action='store_true')
    args = cli.parse_args()
    normalized = json.loads((COMMERCIAL / 'normalized-workbook-prices.json').read_text(encoding='utf-8'))
    records = json.loads((SOURCE / 'complete-html-tables.json').read_text(encoding='utf-8'))
    manifest = json.loads((COMMERCIAL / 'manifest.json').read_text(encoding='utf-8'))
    snapshot = {'version': '', 'revision': manifest.get('catalogPriceListRevision'), 'prices': normalized['prices'], 'accessorySpecifications': accessory_specs(records), 'coverage': normalized['coverage']}
    technical = json.loads((ROOT / 'catalog-data/generated/ecoclima.json').read_text(encoding='utf-8'))
    for price in snapshot['prices']:
        size = price.get('catalogSizeCode')
        matches = []
        original_url = price['sourceMetadata']['sourceUrl']
        price_path = urlparse(original_url).path
        page_url = 'https://www.ecoclima.com/catalogo-generale/' + price_path.split('/download/xlsx/', 1)[1] if '/download/xlsx/' in price_path else original_url
        source_record = next((record for record in records if record['pageUrl'] == page_url), None)
        equivalent_urls = {page_url} | {doc['sourceUrl'] for doc in source_record['documents']} if source_record else {page_url}
        for family in technical['families']:
            if family['familyCode'] != price['familyCode'] and family['sourceMetadata']['sourceUrl'] not in equivalent_urls:
                continue
            model = price['modelCode']
            slug = lambda value: re.sub(r'\s+', '-', str(value).strip().lower()).replace('/', '-')
            suffix = slug(size) if size else None
            prefix = 'ecoclima-' + family['familyCode'].lower() + '-'
            if suffix and suffix.startswith(family['familyCode'].lower() + '-'):
                suffix = suffix[len(family['familyCode']) + 1:]
            for variant in family['variants']:
                exact_model = slug(variant.get('modelCode', '')) == slug(model) or variant['id'] == 'ecoclima-' + slug(model)
                model_matches = family['familyCode'] == model or model in family.get('modelCodes', []) or exact_model
                if price['kind'] == 'terminal' and not model_matches:
                    continue
                if exact_model or suffix and variant['id'] == prefix + suffix:
                    matches.append(variant['id'])
        if matches or size:
            price['technicalVariantIds'] = matches
    snapshot['version'] = 'ecoclima-listino-' + hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()[:12]
    staging = OUTPUT.with_name('ecoclima-prices.staging.json')
    staging.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'priceCount': len(snapshot['prices']), 'accessorySpecificationCount': len(snapshot['accessorySpecifications']), 'sourcePageCount': len(snapshot['coverage']), 'issues': normalized.get('issues', [])}
    previous = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else None
    old = {price['id']: price for price in previous['prices']} if previous else {}
    new = {price['id']: price for price in snapshot['prices']}
    report |= {'added': [key for key in new if key not in old], 'removed': [key for key in old if key not in new],
               'changed': [key for key in new if key in old and new[key] != old[key]]}
    OUTPUT.with_name('ecoclima-prices.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.apply:
        if report['removed'] and not args.allow_removal:
            raise ValueError('Normalized prices removed. Review ecoclima-prices.report.json before --allow-removal.')
        history = OUTPUT.with_name('ecoclima-prices-history.json')
        versions = json.loads(history.read_text(encoding='utf-8')) if history.exists() else {}
        if OUTPUT.exists():
            versions[previous['version']] = previous
        history.write_text(json.dumps(versions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        OUTPUT.write_bytes(staging.read_bytes())
    print(json.dumps({key: value for key, value in report.items() if key not in ('issues', 'added', 'removed', 'changed')} |
                     {'added': len(report['added']), 'removed': len(report['removed']), 'changed': len(report['changed'])}))


if __name__ == '__main__':
    main()
